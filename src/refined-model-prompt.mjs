/**
 * [INPUT]: 依赖 lark-cli.mjs 的只读 Base 查询、runtime-cache.mjs、旧精模模块解析与同表独立光影基础资产
 * [OUTPUT]: 对外提供按编码隔离的版本目录/正文读取、独立纯文本光影基础目录和旧精模模块兼容
 * [POS]: src 的同构版本化 Prompt 读取基础设施，新光影基础与旧精模编码隔离，正文仅服务端消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { runLarkCli } from "./lark-cli.mjs";
import { createAsyncTtlCache } from "./runtime-cache.mjs";
import { combineRefinedRenderPromptColumns, parseRefinedRenderPromptAsset } from "./refined-render-prompt-asset.mjs";

export const DEFAULT_REFINED_MODEL_PROMPT_CODE = "refined-model-render";
export const REFINED_LIGHTING_BASE_PROMPT_CODE = "refined-lighting-base";

const refinedPromptCache = createAsyncTtlCache();
const PROMPT_FIELDS = [
  "Prompt 名称",
  "Prompt 编码",
  "版本",
  "上架状态",
  "Prompt 正文",
  "变更说明",
];
const REFINED_MODULE_FIELDS = ["时段提示词", "天气提示词", "色调提示词"];

export const REFINED_MODEL_PROMPT_CONFIG = Object.freeze({
  baseToken:
    process.env.LARK_REFINED_PROMPT_BASE_TOKEN || "SALobKnnra17iSsGT2ccC52PnHd",
  cliPath: process.env.LARK_CLI_PATH || "lark-cli",
  tableId:
    process.env.LARK_REFINED_PROMPT_TABLE_ID || "tblrj2xypwHnh97E",
});

function selectValues(value) {
  return Array.isArray(value) ? value.map(String) : [];
}

export function parseRefinedModelPromptEnvelope(body, { label = "精模" } = {}) {
  if (body?.ok !== true || !Array.isArray(body?.data?.data)) {
    throw new Error(`飞书${label} Prompt 表返回格式不正确`);
  }
  if (body.data.has_more) {
    throw new Error(`飞书${label} Prompt 表超过 200 条，请增加服务端分页读取`);
  }

  const fields = body.data.fields || [];
  const missing = PROMPT_FIELDS.filter((field) => !fields.includes(field));
  if (missing.length > 0) {
    throw new Error(`飞书${label} Prompt 表缺少字段：${missing.join("、")}`);
  }
  const at = (row, name) => row[fields.indexOf(name)];
  return body.data.data.map((row) => {
    const code = String(at(row, "Prompt 编码") || "").trim();
    const name = String(at(row, "Prompt 名称") || "").trim();
    const prompt = String(at(row, "Prompt 正文") || "").trim();
    const published = selectValues(at(row, "上架状态")).includes("上架");
    const version = Number(at(row, "版本"));
    const validPrompt = Boolean(
      code && name && Number.isInteger(version) && version > 0 && prompt,
    );
    let renderPrompt = null, renderPromptError = null;
    if (code === DEFAULT_REFINED_MODEL_PROMPT_CODE) {
      try {
        renderPrompt = combineRefinedRenderPromptColumns(prompt, Object.fromEntries(
          ["TIME", "WEATHER", "TONE"].map((group, index) => [group, at(row, REFINED_MODULE_FIELDS[index])]),
        ));
      } catch (error) { renderPromptError = error.message; }
    }
    return {
      changeNote: String(at(row, "变更说明") || "").trim(),
      code,
      name,
      prompt,
      ...(renderPrompt ? { renderPrompt } : {}),
      ...(renderPromptError ? { renderPromptError } : {}),
      published,
      reason: validPrompt ? null : "编码、名称、版本或 Prompt 正文不完整",
      validPrompt,
      version,
    };
  });
}

export async function listRefinedModelPrompts({
  config = REFINED_MODEL_PROMPT_CONFIG,
  forceRefresh = false,
  label = "精模",
  includeRefinedModules = label === "精模",
  run = runLarkCli,
} = {}) {
  const load = async () => {
    const fieldArgs = [...PROMPT_FIELDS, ...(includeRefinedModules ? REFINED_MODULE_FIELDS : [])]
      .flatMap((field) => ["--field-id", field]);
    const body = await run(
      { cliPath: config.cliPath },
      [
        "base",
        "+record-list",
        "--as",
        "user",
        "--base-token",
        config.baseToken,
        "--table-id",
        config.tableId,
        ...fieldArgs,
        "--limit",
        "200",
        "--format",
        "json",
      ],
    );
    return parseRefinedModelPromptEnvelope(body, { label });
  };

  if (run !== runLarkCli) return load();
  return refinedPromptCache.get(
    `${config.baseToken}:${config.tableId}:${includeRefinedModules ? "modules" : "plain"}`,
    load,
    { force: forceRefresh },
  );
}

export async function publicRefinedModelPromptConfig({ code = DEFAULT_REFINED_MODEL_PROMPT_CODE, ...options } = {}) {
  const candidates = (await listRefinedModelPrompts({ ...options,
    includeRefinedModules: code === DEFAULT_REFINED_MODEL_PROMPT_CODE }))
    .filter((entry) => entry.code === code && entry.validPrompt && entry.published)
    .sort((left, right) => right.version - left.version);
  const config = options.config || REFINED_MODEL_PROMPT_CONFIG;
  const tableUrl = config.tableUrl || `https://lq9n5lvfn2i.feishu.cn/base/${encodeURIComponent(config.baseToken)}?table=${encodeURIComponent(config.tableId)}`;
  const prompts = [], reasons = [];
  for (const entry of candidates) {
    try {
      if (entry.renderPromptError) throw new Error(entry.renderPromptError);
      const asset = parseRefinedRenderPromptAsset(code === REFINED_LIGHTING_BASE_PROMPT_CODE ? entry.prompt : entry.renderPrompt || entry.prompt);
      if (code === REFINED_LIGHTING_BASE_PROMPT_CODE && asset.format !== "plain") {
        throw new Error("光影基础 Prompt 必须是独立纯文本");
      }
      prompts.push({ ...entry, ...(asset.format === "modular" ? {
        atmosphereSource: "refined-prompt", atmosphereAvailable: true, tableUrl,
      } : {}) });
    } catch (error) { reasons.push(`v${entry.version}：${error.message}`); }
  }
  const defaultPrompt = prompts[0];
  return {
    defaultVersion: defaultPrompt?.version || null,
    versions: prompts.map(({ code, name, published, version, atmosphereSource, atmosphereAvailable, tableUrl }) => ({
      code,
      name,
      published,
      version,
      ...(atmosphereSource ? { atmosphereSource, atmosphereAvailable, tableUrl } : {}),
    })),
    ...(reasons.length ? { reason: reasons.join("；") } : {}),
  };
}

export function publicRefinedLightingBasePromptConfig(options = {}) {
  return publicRefinedModelPromptConfig({ ...options, code: REFINED_LIGHTING_BASE_PROMPT_CODE });
}

export async function getRefinedModelPrompt(
  code = DEFAULT_REFINED_MODEL_PROMPT_CODE,
  { label = "精模", version = null, ...options } = {},
) {
  const normalizedCode = String(code || "").trim();
  const matching = (await listRefinedModelPrompts({ ...options, label,
    includeRefinedModules: normalizedCode === DEFAULT_REFINED_MODEL_PROMPT_CODE }))
    .filter((entry) => entry.code === normalizedCode)
    .sort((left, right) => right.version - left.version);
  if (matching.length === 0) {
    const error = new Error(`飞书${label} Prompt 表中没有 ${normalizedCode} 配置`);
    error.statusCode = 404;
    throw error;
  }

  const requestedVersion = version == null || version === "" ? null : Number(version);
  if (
    requestedVersion != null &&
    (!Number.isInteger(requestedVersion) || requestedVersion <= 0)
  ) {
    const error = new Error(`${label} Prompt 版本必须是正整数`);
    error.statusCode = 400;
    throw error;
  }
  const prompt = requestedVersion == null
    ? matching.find((entry) => entry.validPrompt && entry.published)
    : matching.find((entry) => entry.version === requestedVersion);
  if (!prompt || !prompt.validPrompt) {
    const error = new Error(`指定的${label} Prompt 版本不存在或正文不完整`);
    error.statusCode = 409;
    throw error;
  }
  if (!prompt.published) {
    const error = new Error(`${prompt.name} v${prompt.version} 尚未上架`);
    error.statusCode = 409;
    throw error;
  }
  if (normalizedCode === DEFAULT_REFINED_MODEL_PROMPT_CODE) {
    if (prompt.renderPromptError) throw Object.assign(new Error(prompt.renderPromptError), { statusCode: 409 });
    parseRefinedRenderPromptAsset(prompt.renderPrompt || prompt.prompt);
  }
  if (normalizedCode === REFINED_LIGHTING_BASE_PROMPT_CODE
    && parseRefinedRenderPromptAsset(prompt.prompt).format !== "plain") {
    throw Object.assign(new Error("光影基础 Prompt 必须是独立纯文本"), { statusCode: 409 });
  }
  return prompt;
}

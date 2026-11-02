/**
 * [INPUT]: 依赖 lark-cli.mjs 的只读 Base 查询、runtime-cache.mjs 与旧精模模块解析
 * [OUTPUT]: 对外提供同表三种精模完整纯文本 Prompt、正文SHA/真实来源、按编码版本目录及旧精模兼容
 * [POS]: src 的精模控制 Prompt 唯一读取边界，三种执行与旧精模编码隔离，正文仅服务端消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createHash } from "node:crypto";
import { runLarkCli } from "./lark-cli.mjs";
import { createAsyncTtlCache } from "./runtime-cache.mjs";
import { combineRefinedRenderPromptColumns, parseRefinedRenderPromptAsset } from "./refined-render-prompt-asset.mjs";

export const DEFAULT_REFINED_MODEL_PROMPT_CODE = "refined-model-render";
export const REFINED_LIGHTING_BASE_PROMPT_CODE = "refined-lighting-base";
export const REFINED_LIGHTING_REFERENCE_RULE_CODE = "lighting-reference-transfer";
export const REFINED_LIGHTING_HYBRID_RULE_CODE = "lighting-prompt-reference";

const LIGHTING_PROMPT_CODES = Object.freeze({
  purePrompt: REFINED_LIGHTING_BASE_PROMPT_CODE,
  referenceRule: REFINED_LIGHTING_REFERENCE_RULE_CODE,
  hybridRule: REFINED_LIGHTING_HYBRID_RULE_CODE,
});
const plainPromptCodes = new Set(Object.values(LIGHTING_PROMPT_CODES));
const promptTableUrl = (config) => config.tableUrl || `https://lq9n5lvfn2i.feishu.cn/base/${encodeURIComponent(config.baseToken)}?table=${encodeURIComponent(config.tableId)}`;

function assertPlainPrompt(prompt) {
  if (parseRefinedRenderPromptAsset(prompt).format !== "plain") {
    throw Object.assign(new Error("精模执行 Prompt 必须是独立纯文本"), { statusCode: 409 });
  }
}

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
  return body.data.data.map((row, index) => {
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
      ...(body.data.record_id_list?.[index] ? { id: body.data.record_id_list[index] } : {}),
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
  const tableUrl = promptTableUrl(config);
  const prompts = [], reasons = [];
  for (const entry of candidates) {
    try {
      if (entry.renderPromptError) throw new Error(entry.renderPromptError);
      const asset = parseRefinedRenderPromptAsset(plainPromptCodes.has(code) ? entry.prompt : entry.renderPrompt || entry.prompt);
      if (plainPromptCodes.has(code)) assertPlainPrompt(entry.prompt);
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

export async function loadRefinedLightingPromptAssets(options = {}) {
  const config = options.config || REFINED_MODEL_PROMPT_CONFIG;
  const entries = await listRefinedModelPrompts({ ...options, includeRefinedModules: false });
  const assets = Object.fromEntries(Object.entries(LIGHTING_PROMPT_CODES).map(([key, code]) => {
    const candidates = entries.filter(entry => entry.code === code && entry.validPrompt && entry.published)
      .sort((left, right) => right.version - left.version);
    const versions = new Set();
    for (const entry of candidates) {
      if (versions.has(entry.version)) {
        throw Object.assign(new Error(`精模 Prompt 存在重复上架版本：${code}@${entry.version}`), { statusCode: 409 });
      }
      versions.add(entry.version);
    }
    const entry = candidates[0];
    if (!entry) return [key, null];
    assertPlainPrompt(entry.prompt);
    return [key, { ...entry, sha256: createHash("sha256").update(entry.prompt).digest("hex"),
      source: `feishu:${config.tableId}:${code}@v${entry.version}`, tableId: config.tableId }];
  }));
  return { ...assets, promptTableUrl: promptTableUrl(config) };
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
  if (plainPromptCodes.has(normalizedCode)) assertPlainPrompt(prompt.prompt);
  return prompt;
}

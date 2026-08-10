/**
 * [INPUT]: 依赖 lark-cli.mjs 的只读 Base 查询、runtime-cache.mjs 与 AI 生图 Base 的“精模渲染 Prompt”表
 * [OUTPUT]: 对外提供固定 Prompt 版本解析、脱敏目录、草稿测试选择与指定版本正文读取
 * [POS]: src 的精模固定 Prompt 资产边界，正文只在服务端进入出图链路
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { runLarkCli } from "./lark-cli.mjs";
import { createAsyncTtlCache } from "./runtime-cache.mjs";

export const DEFAULT_REFINED_MODEL_PROMPT_CODE = "refined-model-render";

const refinedPromptCache = createAsyncTtlCache();
const PROMPT_FIELDS = [
  "Prompt 名称",
  "Prompt 编码",
  "版本",
  "上架状态",
  "Prompt 正文",
  "变更说明",
];

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

export function parseRefinedModelPromptEnvelope(body) {
  if (body?.ok !== true || !Array.isArray(body?.data?.data)) {
    throw new Error("飞书精模 Prompt 表返回格式不正确");
  }
  if (body.data.has_more) {
    throw new Error("飞书精模 Prompt 表超过 200 条，请增加服务端分页读取");
  }

  const fields = body.data.fields || [];
  const missing = PROMPT_FIELDS.filter((field) => !fields.includes(field));
  if (missing.length > 0) {
    throw new Error(`飞书精模 Prompt 表缺少字段：${missing.join("、")}`);
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
    return {
      changeNote: String(at(row, "变更说明") || "").trim(),
      code,
      name,
      prompt,
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
  run = runLarkCli,
} = {}) {
  const load = async () => {
    const fieldArgs = PROMPT_FIELDS.flatMap((field) => ["--field-id", field]);
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
    return parseRefinedModelPromptEnvelope(body);
  };

  if (run !== runLarkCli) return load();
  return refinedPromptCache.get(
    `${config.baseToken}:${config.tableId}`,
    load,
    { force: forceRefresh },
  );
}

export async function publicRefinedModelPromptConfig(options = {}) {
  const prompts = (await listRefinedModelPrompts(options))
    .filter((entry) => entry.validPrompt)
    .sort((left, right) => right.version - left.version);
  const defaultPrompt = prompts.find((entry) => entry.published) || prompts[0];
  return {
    defaultVersion: defaultPrompt?.version || null,
    versions: prompts.map(({ code, name, published, version }) => ({
      code,
      name,
      published,
      version,
    })),
  };
}

export async function getRefinedModelPrompt(
  code = DEFAULT_REFINED_MODEL_PROMPT_CODE,
  { allowDraft = false, version = null, ...options } = {},
) {
  const normalizedCode = String(code || "").trim();
  const matching = (await listRefinedModelPrompts(options))
    .filter((entry) => entry.code === normalizedCode)
    .sort((left, right) => right.version - left.version);
  if (matching.length === 0) {
    const error = new Error(`飞书精模 Prompt 表中没有 ${normalizedCode} 配置`);
    error.statusCode = 404;
    throw error;
  }

  const requestedVersion = version == null || version === "" ? null : Number(version);
  if (
    requestedVersion != null &&
    (!Number.isInteger(requestedVersion) || requestedVersion <= 0)
  ) {
    const error = new Error("精模 Prompt 版本必须是正整数");
    error.statusCode = 400;
    throw error;
  }
  const prompt = requestedVersion == null
    ? matching.find((entry) => entry.validPrompt && (allowDraft || entry.published))
    : matching.find((entry) => entry.version === requestedVersion);
  if (!prompt || !prompt.validPrompt) {
    const error = new Error("指定的精模 Prompt 版本不存在或正文不完整");
    error.statusCode = 409;
    throw error;
  }
  if (!allowDraft && !prompt.published) {
    const error = new Error(`${prompt.name} v${prompt.version} 尚未上架`);
    error.statusCode = 409;
    throw error;
  }
  return prompt;
}

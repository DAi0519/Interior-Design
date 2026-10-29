/**
 * [INPUT]: 依赖同构飞书Prompt读取器、独立光影转换Prompt表及node:crypto正文SHA
 * [OUTPUT]: 对外提供效果图光影迁移上架正文/版本读取与脱敏目录，缺表下架阻断且不回退精模规则
 * [POS]: src 的光影转换Prompt资产边界，与光影库卡片共享但不修改精模迁移正文
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createHash } from "node:crypto";
import { getRefinedModelPrompt, listRefinedModelPrompts } from "./refined-model-prompt.mjs";

export const LIGHTING_TRANSFER_PROMPT_CODE = "lighting-render-transfer";
export const LIGHTING_TRANSFER_PROMPT_CONFIG = Object.freeze({
  baseToken: process.env.LARK_LIGHTING_TRANSFER_PROMPT_BASE_TOKEN || "SALobKnnra17iSsGT2ccC52PnHd",
  cliPath: process.env.LARK_CLI_PATH || "lark-cli",
  tableId: process.env.LARK_LIGHTING_TRANSFER_PROMPT_TABLE_ID || "tblOQOF7m7eKMIAA",
});
const digest = value => createHash("sha256").update(value).digest("hex");

function sourceOptions(options) {
  const config = options.config || LIGHTING_TRANSFER_PROMPT_CONFIG;
  if (!config.tableId || !config.baseToken) {
    throw Object.assign(new Error("光影转换独立 Prompt 表尚未配置"), { statusCode: 409 });
  }
  return { ...options, allowDraft: false, config, label: "光影转换", includeRefinedModules: false };
}

export async function getLightingTransferPrompt(options = {}) {
  try {
    const prompt = await getRefinedModelPrompt(LIGHTING_TRANSFER_PROMPT_CODE, sourceOptions(options));
    return { ...prompt, sha256: digest(prompt.prompt) };
  } catch (error) {
    if (!error.statusCode || error.statusCode === 404) error.statusCode = 409;
    throw error;
  }
}

export async function publicLightingTransferPromptConfig(options = {}) {
  const config = options.config || LIGHTING_TRANSFER_PROMPT_CONFIG;
  const tableUrl = config.tableId
    ? `https://lq9n5lvfn2i.feishu.cn/base/${encodeURIComponent(config.baseToken)}?table=${encodeURIComponent(config.tableId)}`
    : null;
  try {
    const records = (await listRefinedModelPrompts(sourceOptions(options)))
      .filter(entry => entry.code === LIGHTING_TRANSFER_PROMPT_CODE && entry.validPrompt && entry.published)
      .sort((left, right) => right.version - left.version);
    const prompt = records[0];
    if (!prompt) throw new Error("未读取到光影转换的上架 Prompt");
    return { available: true, code: prompt.code, name: prompt.name, published: true,
      defaultVersion: prompt.version, version: prompt.version, sha256: digest(prompt.prompt), tableUrl,
      versions: records.map(({ code, name, published, version }) => ({ code, name, published, version })) };
  } catch (error) {
    return { available: false, code: LIGHTING_TRANSFER_PROMPT_CODE, name: "光影转换 Prompt",
      defaultVersion: null, version: null, published: false, tableUrl, reason: error.message, versions: [] };
  }
}

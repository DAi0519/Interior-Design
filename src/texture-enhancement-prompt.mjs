/**
 * [INPUT]: 依赖refined-model-prompt的同构飞书读取器、独立质感增强Prompt表与node:crypto正文SHA
 * [OUTPUT]: 对外提供独立上架正文读取/版本选择与脱敏目录，缺表或下架阻断且无本地回退
 * [POS]: src 的质感增强Prompt资产边界，被共享效果图工作流和配置聚合器消费，不调用Prompt Agent
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createHash } from "node:crypto";
import { getRefinedModelPrompt, listRefinedModelPrompts } from "./refined-model-prompt.mjs";

export const DEFAULT_TEXTURE_ENHANCEMENT_PROMPT_CODE = "texture-render-enhancement";
export const TEXTURE_ENHANCEMENT_PROMPT_CONFIG = Object.freeze({
  baseToken: process.env.LARK_TEXTURE_ENHANCEMENT_PROMPT_BASE_TOKEN || "SALobKnnra17iSsGT2ccC52PnHd",
  cliPath: process.env.LARK_CLI_PATH || "lark-cli",
  tableId: process.env.LARK_TEXTURE_ENHANCEMENT_PROMPT_TABLE_ID || "tblQJtk95Sr5IueL",
});

function sourceOptions(options) {
  const config = options.config || TEXTURE_ENHANCEMENT_PROMPT_CONFIG;
  if (!config.tableId || !config.baseToken) {
    throw Object.assign(new Error("质感增强独立 Prompt 表尚未配置"), { statusCode: 409 });
  }
  return { ...options, config, label: "质感增强", includeRefinedModules: false };
}

export async function getTextureEnhancementPrompt(options = {}) {
  try {
    const prompt = await getRefinedModelPrompt(DEFAULT_TEXTURE_ENHANCEMENT_PROMPT_CODE, sourceOptions(options));
    return { ...prompt, sha256: createHash("sha256").update(prompt.prompt).digest("hex") };
  } catch (error) {
    if (!error.statusCode || error.statusCode === 404) error.statusCode = 409;
    throw error;
  }
}

export async function publicTextureEnhancementPromptConfig(options = {}) {
  const config = options.config || TEXTURE_ENHANCEMENT_PROMPT_CONFIG;
  const tableUrl = config.tableId
    ? `https://lq9n5lvfn2i.feishu.cn/base/${encodeURIComponent(config.baseToken)}?table=${encodeURIComponent(config.tableId)}`
    : null;
  try {
    const records = (await listRefinedModelPrompts(sourceOptions(options)))
      .filter((entry) => entry.code === DEFAULT_TEXTURE_ENHANCEMENT_PROMPT_CODE && entry.validPrompt && entry.published)
      .sort((left, right) => right.version - left.version);
    const prompt = records[0];
    if (!prompt) throw new Error("未读取到质感增强的上架 Prompt");
    return { available: true, code: prompt.code, name: prompt.name, published: true,
      defaultVersion: prompt.version, version: prompt.version, tableUrl,
      sha256: createHash("sha256").update(prompt.prompt).digest("hex"),
      versions: records.map(({ code, name, published, version }) => ({ code, name, published, version })),
    };
  } catch (error) {
    return { available: false, code: DEFAULT_TEXTURE_ENHANCEMENT_PROMPT_CODE, name: "质感增强 Prompt",
      defaultVersion: null, version: null, published: false, tableUrl, reason: error.message, versions: [] };
  }
}

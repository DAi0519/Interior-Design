/**
 * [INPUT]: 依赖refined-model-prompt.mjs的独立飞书表读取与effect-beautification-workflow.mjs的六预设准入真源
 * [OUTPUT]: 对外提供六预设 JSON 校验、受控选择归一化、原样正向 Prompt 选择、指定上架版本读取与脱敏配置
 * [POS]: src 的效果图美化固定 Prompt 资产边界，与效果图氛围转换/全景图 Prompt 隔离，不调用 Prompt Agent
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import {
  getRefinedModelPrompt,
  listRefinedModelPrompts,
} from "./refined-model-prompt.mjs";
import { effectBeautificationPreset } from "./effect-beautification-workflow.mjs";

export const DEFAULT_EFFECT_BEAUTIFICATION_PROMPT_CODE = "effect-render-beautification";
export const EFFECT_BEAUTIFICATION_PROMPT_CONFIG = Object.freeze({
  baseToken: process.env.LARK_EFFECT_BEAUTIFICATION_PROMPT_BASE_TOKEN
    || "SALobKnnra17iSsGT2ccC52PnHd",
  cliPath: process.env.LARK_CLI_PATH || "lark-cli",
  tableId: process.env.LARK_EFFECT_BEAUTIFICATION_PROMPT_TABLE_ID
    || "tblzaSfyUMPnfARO",
});
export const EFFECT_BEAUTIFICATION_INTENSITIES = Object.freeze(["low", "high"]);
export const EFFECT_BEAUTIFICATION_TONES = Object.freeze(["natural", "warm", "cool"]);

function beautificationError(message, statusCode = 409) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export function normalizeEffectBeautification(selection = {}) {
  const { intensity, tone } = effectBeautificationPreset(selection);
  return { intensity, tone };
}

function assertKeys(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).length !== keys.length
    || keys.some((key) => !Object.hasOwn(value, key))) {
    throw beautificationError("飞书效果图美化 Prompt JSON 必须完整提供六个预设");
  }
}

export function parseEffectBeautificationPrompt(source) {
  let prompt;
  try {
    prompt = JSON.parse(String(source || ""));
  } catch {
    throw beautificationError("飞书效果图美化 Prompt JSON 语法错误");
  }
  assertKeys(prompt, ["LOW", "HIGH"]);
  for (const intensity of ["LOW", "HIGH"]) {
    assertKeys(prompt[intensity], ["NATURAL", "WARM", "COOL"]);
    for (const text of Object.values(prompt[intensity])) {
      if (typeof text !== "string" || !text.trim()) {
        throw beautificationError("飞书效果图美化 Prompt 六个预设必须为非空文本");
      }
    }
  }
  return prompt;
}

export function composeEffectBeautificationPrompt(source, selection = {}) {
  const { intensity, tone } = normalizeEffectBeautification(selection);
  return parseEffectBeautificationPrompt(source)[intensity.toUpperCase()][tone.toUpperCase()];
}

export async function getEffectBeautificationPrompt(options = {}) {
  const prompt = await getRefinedModelPrompt(DEFAULT_EFFECT_BEAUTIFICATION_PROMPT_CODE, {
    ...options,
    allowDraft: false,
    config: options.config || EFFECT_BEAUTIFICATION_PROMPT_CONFIG,
    label: "效果图美化",
  });
  parseEffectBeautificationPrompt(prompt.prompt);
  return prompt;
}

export async function publicEffectBeautificationPromptConfig(options = {}) {
  try {
    const sourceOptions = {
      ...options,
      config: options.config || EFFECT_BEAUTIFICATION_PROMPT_CONFIG,
      label: "效果图美化",
    };
    const records = (await listRefinedModelPrompts(sourceOptions))
      .filter((entry) => entry.code === DEFAULT_EFFECT_BEAUTIFICATION_PROMPT_CODE
        && entry.validPrompt && entry.published)
      .sort((left, right) => right.version - left.version);
    const prompt = records[0];
    if (!prompt) throw beautificationError("未读取到效果图美化的上架 Prompt");
    parseEffectBeautificationPrompt(prompt.prompt);
    return {
      available: true,
      code: prompt.code,
      defaultVersion: prompt.version,
      name: prompt.name,
      published: true,
      version: prompt.version,
      versions: records.map(({ code, name, published, version }) => ({
        code, name, published, version,
      })),
    };
  } catch (error) {
    return {
      available: false,
      code: DEFAULT_EFFECT_BEAUTIFICATION_PROMPT_CODE,
      defaultVersion: null,
      name: "效果图美化 Prompt",
      published: false,
      reason: error.message,
      version: null,
      versions: [],
    };
  }
}

/**
 * [INPUT]: 依赖版本化 Prompt 读取边界与飞书“效果图美化 Prompt”表的 JSON 模块源文
 * [OUTPUT]: 对外提供当前已上架版本的脱敏状态、固定 JSON Schema 校验、可读模块渲染、受控枚举归一化、默认保持/环境契约互斥拼接及全景连续性追加 Prompt
 * [POS]: src 的效果图美化 Prompt 资产边界，飞书是正文真源且浏览器不接触正文
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { getRefinedModelPrompt } from "./refined-model-prompt.mjs";

export const DEFAULT_EFFECT_ENHANCEMENT_PROMPT_CODE = "effect-render-enhancement";
export const PANORAMA_CONTINUITY_PROMPT = [
  "[PANORAMA CONTINUITY]",
  "The input is a 360-degree 2:1 equirectangular panorama. Treat the left and right edges as physically adjacent and produce a seamless horizontal wrap-around with perfect continuity between them.",
  "Preserve the original camera position, projection, horizon, spatial geometry, room layout, walls, doors, windows, furniture positions, materials, lighting, and shadows across the seam.",
  "Do not duplicate, remove, stretch, bend, or shift objects near either edge. No broken lines, mismatched structures, lighting discontinuities, perspective shifts, visible seams, or edge artifacts.",
].join("\n");
export const EFFECT_ENHANCEMENT_PROMPT_CONFIG = Object.freeze({
  baseToken:
    process.env.LARK_EFFECT_ENHANCEMENT_PROMPT_BASE_TOKEN
    || "SALobKnnra17iSsGT2ccC52PnHd",
  cliPath: process.env.LARK_CLI_PATH || "lark-cli",
  tableId:
    process.env.LARK_EFFECT_ENHANCEMENT_PROMPT_TABLE_ID
    || "tblmNIPcFFaq2qcd",
});

export const EFFECT_TIME_VALUES = Object.freeze([
  "preserve",
  "daytime",
  "dusk",
  "night",
]);
export const EFFECT_WEATHER_VALUES = Object.freeze([
  "preserve",
  "clear",
  "overcast",
  "rainy",
  "foggy",
]);

const ROOT_KEYS = Object.freeze(["BASE", "DEFAULT", "CONTRACT", "TIME", "WEATHER"]);
const BASE_KEYS = Object.freeze([
  "Main Objective",
  "Source Lock",
  "Global Lighting Optimization",
]);
const TIME_KEYS = Object.freeze(["DAYTIME", "DUSK", "NIGHT"]);
const WEATHER_KEYS = Object.freeze(["CLEAR", "OVERCAST", "RAINY", "FOGGY"]);

function promptError(message) {
  const error = new Error(message);
  error.statusCode = 409;
  return error;
}

function normalizeSelection(value, allowed, label) {
  const normalized = String(value || "preserve").trim();
  if (!allowed.includes(normalized)) {
    const error = new Error(`效果图美化${label}选项不合法`);
    error.statusCode = 400;
    throw error;
  }
  return normalized;
}

function assertExactObject(value, keys) {
  if (
    !value
    || typeof value !== "object"
    || Array.isArray(value)
    || Object.keys(value).length !== keys.length
    || Object.keys(value).some((key, index) => key !== keys[index])
  ) {
    throw promptError("飞书效果图美化 Prompt JSON 结构错误");
  }
}

function requireText(value) {
  if (typeof value !== "string" || !value.trim() || value !== value.trim()) {
    throw promptError("飞书效果图美化 Prompt JSON 结构错误");
  }
  return value;
}

export function parseEffectEnhancementPrompt(source) {
  let prompt;
  try {
    prompt = JSON.parse(String(source || ""));
  } catch {
    throw promptError("飞书效果图美化 Prompt JSON 结构错误");
  }
  assertExactObject(prompt, ROOT_KEYS);
  assertExactObject(prompt.BASE, BASE_KEYS);
  assertExactObject(prompt.TIME, TIME_KEYS);
  assertExactObject(prompt.WEATHER, WEATHER_KEYS);

  const baseSections = BASE_KEYS.map(
    (title) => `[${title}]\n${requireText(prompt.BASE[title])}`,
  ).join("\n\n");
  return {
    base: `[BASE]\n${baseSections}`,
    default: `[DEFAULT]\n${requireText(prompt.DEFAULT)}`,
    contract: `[CONTRACT]\n${requireText(prompt.CONTRACT)}`,
    daytime: `[TIME:DAYTIME]\n${requireText(prompt.TIME.DAYTIME)}`,
    dusk: `[TIME:DUSK]\n${requireText(prompt.TIME.DUSK)}`,
    night: `[TIME:NIGHT]\n${requireText(prompt.TIME.NIGHT)}`,
    clear: `[WEATHER:CLEAR]\n${requireText(prompt.WEATHER.CLEAR)}`,
    overcast: `[WEATHER:OVERCAST]\n${requireText(prompt.WEATHER.OVERCAST)}`,
    rainy: `[WEATHER:RAINY]\n${requireText(prompt.WEATHER.RAINY)}`,
    foggy: `[WEATHER:FOGGY]\n${requireText(prompt.WEATHER.FOGGY)}`,
  };
}

export function composeEffectEnhancementPrompt(source, {
  time = "preserve",
  weather = "preserve",
} = {}) {
  const normalizedTime = normalizeSelection(time, EFFECT_TIME_VALUES, "时段");
  const normalizedWeather = normalizeSelection(
    weather,
    EFFECT_WEATHER_VALUES,
    "天气",
  );
  const modules = parseEffectEnhancementPrompt(source);
  const hasAnyEnvironmentOverride = normalizedTime !== "preserve"
    || normalizedWeather !== "preserve";
  return [
    modules.base,
    hasAnyEnvironmentOverride ? modules.contract : modules.default,
    normalizedTime === "preserve" ? null : modules[normalizedTime],
    normalizedWeather === "preserve" ? null : modules[normalizedWeather],
  ].filter(Boolean).join("\n\n");
}

export function composePanoramaEnhancementPrompt(source) {
  return [
    composeEffectEnhancementPrompt(source),
    PANORAMA_CONTINUITY_PROMPT,
  ].join("\n\n");
}

export async function getEffectEnhancementPrompt(options = {}) {
  return getRefinedModelPrompt(
    DEFAULT_EFFECT_ENHANCEMENT_PROMPT_CODE,
    {
      ...options,
      allowDraft: false,
      config: options.config || EFFECT_ENHANCEMENT_PROMPT_CONFIG,
      label: "效果图美化",
    },
  );
}

export async function publicEffectEnhancementPromptConfig(options = {}) {
  try {
    const prompt = await getEffectEnhancementPrompt(options);
    return {
      available: true,
      code: prompt.code,
      name: prompt.name,
      published: true,
      version: prompt.version,
    };
  } catch (error) {
    return {
      available: false,
      code: DEFAULT_EFFECT_ENHANCEMENT_PROMPT_CODE,
      name: "效果图美化 Prompt",
      published: false,
      reason: error.message,
      version: null,
    };
  }
}

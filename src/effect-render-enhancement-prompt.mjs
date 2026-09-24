/**
 * [INPUT]: 依赖版本化 Prompt 读取边界，以及飞书“效果图美化 Prompt”与“全景图美化 Prompt”两张独立版本表
 * [OUTPUT]: 对外提供效果图模块 Schema、允许纯文本或开放 JSON 容器的单一全景 Prompt、受控环境拼接及两类当前上架 Prompt 读取
 * [POS]: src 的效果图/全景图美化 Prompt 资产边界，两张飞书表分别是真源且浏览器不接触正文
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { getRefinedModelPrompt } from "./refined-model-prompt.mjs";

export const DEFAULT_EFFECT_ENHANCEMENT_PROMPT_CODE = "effect-render-enhancement";
export const DEFAULT_PANORAMA_ENHANCEMENT_PROMPT_CODE =
  "panorama-render-enhancement";
export const EFFECT_ENHANCEMENT_PROMPT_CONFIG = Object.freeze({
  baseToken:
    process.env.LARK_EFFECT_ENHANCEMENT_PROMPT_BASE_TOKEN
    || "SALobKnnra17iSsGT2ccC52PnHd",
  cliPath: process.env.LARK_CLI_PATH || "lark-cli",
  tableId:
    process.env.LARK_EFFECT_ENHANCEMENT_PROMPT_TABLE_ID
    || "tblmNIPcFFaq2qcd",
});
export const PANORAMA_ENHANCEMENT_PROMPT_CONFIG = Object.freeze({
  baseToken:
    process.env.LARK_PANORAMA_ENHANCEMENT_PROMPT_BASE_TOKEN
    || "SALobKnnra17iSsGT2ccC52PnHd",
  cliPath: process.env.LARK_CLI_PATH || "lark-cli",
  tableId:
    process.env.LARK_PANORAMA_ENHANCEMENT_PROMPT_TABLE_ID
    || "tblNVM20GiWeVEiT",
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

function assertExactObject(value, keys, label = "效果图美化") {
  if (
    !value
    || typeof value !== "object"
    || Array.isArray(value)
    || Object.keys(value).length !== keys.length
    || Object.keys(value).some((key, index) => key !== keys[index])
  ) {
    throw promptError(`飞书${label} Prompt JSON 结构错误`);
  }
}

function requireText(value, label = "效果图美化") {
  if (typeof value !== "string" || !value.trim() || value !== value.trim()) {
    throw promptError(`飞书${label} Prompt JSON 结构错误`);
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

export function parsePanoramaEnhancementPrompt(source) {
  const normalized = String(source || "").trim();
  if (!normalized) {
    throw promptError("飞书全景图美化 Prompt 正文为空");
  }
  if (!normalized.startsWith("{")) {
    return { main: normalized };
  }

  let prompt;
  try {
    prompt = JSON.parse(normalized);
  } catch {
    try {
      prompt = JSON.parse(normalized.replace(/,\s*}$/, "\n}"));
    } catch {
      throw promptError("飞书全景图美化 Prompt JSON 语法错误");
    }
  }
  if (!prompt || typeof prompt !== "object" || Array.isArray(prompt)) {
    throw promptError("飞书全景图美化 Prompt JSON 结构错误");
  }
  return {
    main: requireText(prompt.MAIN, "全景图美化"),
  };
}

export function composePanoramaEnhancementPrompt(source) {
  return parsePanoramaEnhancementPrompt(source).main;
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

export async function getPanoramaEnhancementPrompt(options = {}) {
  return getRefinedModelPrompt(
    DEFAULT_PANORAMA_ENHANCEMENT_PROMPT_CODE,
    {
      ...options,
      allowDraft: false,
      config: options.config || PANORAMA_ENHANCEMENT_PROMPT_CONFIG,
      label: "全景图美化",
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

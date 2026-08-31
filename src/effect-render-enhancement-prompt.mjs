/**
 * [INPUT]: 依赖版本化 Prompt 读取边界与飞书“效果图美化 Prompt”表的完整模块源文
 * [OUTPUT]: 对外提供当前已上架版本的脱敏状态、兼容 [Main Objective]/[BASE]/历史首句的八正向模块校验、受控枚举归一化及固定顺序拼接
 * [POS]: src 的效果图美化 Prompt 资产边界，飞书是正文真源且浏览器不接触正文
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { getRefinedModelPrompt } from "./refined-model-prompt.mjs";

export const DEFAULT_EFFECT_ENHANCEMENT_PROMPT_CODE = "effect-render-enhancement";
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

const BASE_MARKERS = Object.freeze([
  "[Main Objective]",
  "[BASE]",
  "HIGHEST PRIORITY — SOURCE-LOCKED, WEATHER-SAFE INTERIOR FURNITURE PRESENTATION.",
]);

const MODULE_MARKERS = Object.freeze([
  ["daytime", "TIME MODULE — DAYTIME."],
  ["dusk", "TIME MODULE — DUSK."],
  ["night", "TIME MODULE — NIGHT."],
  ["clear", "WEATHER MODULE — CLEAR SUNNY WEATHER."],
  ["overcast", "WEATHER MODULE — OVERCAST WEATHER."],
  ["rainy", "WEATHER MODULE — EXTERIOR-ONLY RAINY WEATHER."],
  ["foggy", "WEATHER MODULE — EXTERIOR-ONLY LIGHT-TO-MODERATE FOG."],
]);

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

export function splitEffectEnhancementPrompt(source) {
  const prompt = String(source || "").trim();
  const matchedBaseMarkers = BASE_MARKERS.filter((marker) => prompt.includes(marker));
  if (matchedBaseMarkers.length !== 1) {
    throw promptError("飞书效果图美化 Prompt 模块缺失、重复或顺序错误");
  }
  const markers = [
    ["base", matchedBaseMarkers[0]],
    ...MODULE_MARKERS,
  ];
  const positions = markers.map(([key, marker]) => ({
    key,
    marker,
    position: prompt.indexOf(marker),
  }));
  if (
    positions.some(({ position }) => position < 0)
    || positions.some(({ marker }) => prompt.indexOf(marker) !== prompt.lastIndexOf(marker))
    || positions.some((entry, index) => index > 0
      && entry.position <= positions[index - 1].position)
  ) {
    throw promptError("飞书效果图美化 Prompt 模块缺失、重复或顺序错误");
  }
  return Object.fromEntries(positions.map((entry, index) => {
    const end = positions[index + 1]?.position ?? prompt.length;
    return [entry.key, prompt.slice(entry.position, end).trim()];
  }));
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
  const modules = splitEffectEnhancementPrompt(source);
  return [
    modules.base,
    normalizedTime === "preserve" ? null : modules[normalizedTime],
    normalizedWeather === "preserve" ? null : modules[normalizedWeather],
  ].filter(Boolean).join("\n");
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

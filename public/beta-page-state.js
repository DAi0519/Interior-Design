/**
 * [INPUT]: 依赖localStorage、功能目录、beta-outpaint/beta-upscale独立工作流状态、美化强度色调归一化及模型和轻量表单配置
 * [OUTPUT]: 提供默认Flux的Beta页面状态归一化与持久化，兼容KS缺省2X及显式长边，隔离扩图/超分尺寸、普通模型、风格转换路线/版本和十功能样本集
 * [POS]: public 的 Beta跑图持久配置边界，只保存可重建配置与样本集引用，不保存图片、生成结果或密钥
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { normalizeEffectBeautification } from "./effect-beautification-controls.js";
import { BETA_FEATURE_COPY } from "./beta-model-rules.js";
import { normalizeBetaOutpaintState } from "./beta-outpaint.js?v=1";
import { normalizeBetaUpscaleState } from "./beta-upscale.js?v=3";

export const BETA_PAGE_STATE_STORAGE_KEY = "canvas-lab:beta-page-state:v1";
export const DEFAULT_BETA_MODEL_KEY = "aiTextureEnhancement";

const FEATURE_MODES = new Set(Object.keys(BETA_FEATURE_COPY));

const CONTROL_KEYS = Object.freeze([
  "commonPrompt",
  "effectTime",
  "effectWeather",
  "negativePrompt",
  "promptAgentModelKey",
  "promptAgentVersion",
  "quality",
  "ratio",
  "refinedPromptVersion",
  "renderMode",
  "resolution",
  "roomType",
  "roomTypeDetail",
  "styleCode",
  "styleTransferRenderMode",
  "styleTransferStyleCode",
  "styleTransferReferenceVersion",
  "styleTransferPromptAgentVersion",
]);

function cleanString(value, maxLength = 8000) {
  return typeof value === "string" ? value.slice(0, maxLength) : "";
}

export function normalizeBetaPageState(input = {}) {
  const featureMode = FEATURE_MODES.has(input.featureMode) ? input.featureMode : "whiteModel";
  const selectedModelKeys = [...new Set(
    Array.isArray(input.selectedModelKeys)
      ? input.selectedModelKeys.filter((key) => typeof key === "string" && key)
      : [],
  )];
  const sampleSetIds = Object.fromEntries([...FEATURE_MODES].flatMap((mode) => {
    const sampleSetId = cleanString(input.sampleSetIds?.[mode], 200);
    return sampleSetId ? [[mode, sampleSetId]] : [];
  }));
  const controls = Object.fromEntries(CONTROL_KEYS.map((key) => [
    key,
    cleanString(input.controls?.[key]),
  ]));
  const beautification = normalizeEffectBeautification({
    intensity: input.controls?.effectBeautificationIntensity,
    tone: input.controls?.effectBeautificationTone,
  });
  controls.effectBeautificationIntensity = beautification.intensity;
  controls.effectBeautificationTone = beautification.tone;
  return {
    controls,
    featureMode,
    outpaint: normalizeBetaOutpaintState(input.outpaint),
    upscale: normalizeBetaUpscaleState(input.upscale),
    sampleSetIds,
    selectedModelKeys: selectedModelKeys.length
      ? selectedModelKeys
      : [DEFAULT_BETA_MODEL_KEY],
  };
}

export function readBetaPageState(storage) {
  try {
    return normalizeBetaPageState(JSON.parse(
      storage.getItem(BETA_PAGE_STATE_STORAGE_KEY) || "{}",
    ));
  } catch {
    return normalizeBetaPageState();
  }
}

export function saveBetaPageState(storage, value) {
  const normalized = normalizeBetaPageState(value);
  storage.setItem(BETA_PAGE_STATE_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

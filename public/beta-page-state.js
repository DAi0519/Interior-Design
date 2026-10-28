/**
 * [INPUT]: 依赖localStorage、精模光影选择/旧氛围归一化、功能目录、独立扩图/超分状态、美化配置及模型和轻量表单配置
 * [OUTPUT]: 提供普通默认Flux/精模默认Banana2.1的Beta轻量持久化，保存精模模型/光影及预设执行方式，旧草稿默认仅提示词，旧原始或损坏光影降为未选，不保存图片或任务执行身份
 * [POS]: public 的 Beta跑图持久配置边界，只保存可重建配置与样本集引用，不保存图片、生成结果或密钥
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { normalizeEffectBeautification } from "./effect-beautification-controls.js";
import { normalizeRefinedRender } from "./refined-render-presets.js";
import { normalizeRefinedLighting } from "./refined-lighting-controls.js";
import { BETA_FEATURE_COPY } from "./beta-model-rules.js";
import { normalizeBetaOutpaintState } from "./beta-outpaint.js?v=1";
import { normalizeBetaUpscaleState } from "./beta-upscale.js?v=3";
import { DEFAULT_REFINED_MODEL_KEY, normalizeRefinedModelSelection } from "./refined-model-controls.js";

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
  const refinedModelSelection = normalizeRefinedModelSelection(input.refinedModelSelection);
  const modelKeys = featureMode === "refinedModel" && !refinedModelSelection?.manual
    ? selectedModelKeys.filter(key => key !== DEFAULT_BETA_MODEL_KEY) : selectedModelKeys;
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
  try { controls.refinedRender = normalizeRefinedRender(input.controls?.refinedRender); }
  catch { controls.refinedRender = normalizeRefinedRender(); }
  try { controls.refinedLighting = input.controls?.refinedLighting == null ? null
    : normalizeRefinedLighting(input.controls.refinedLighting); }
  catch { controls.refinedLighting = { mode: "unselected" }; }
  return {
    controls,
    featureMode,
    outpaint: normalizeBetaOutpaintState(input.outpaint),
    upscale: normalizeBetaUpscaleState(input.upscale),
    sampleSetIds,
    refinedModelSelection,
    selectedModelKeys: modelKeys.length ? modelKeys
      : [featureMode === "refinedModel" ? DEFAULT_REFINED_MODEL_KEY : DEFAULT_BETA_MODEL_KEY],
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

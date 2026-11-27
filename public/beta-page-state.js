/**
 * [INPUT]: 依赖localStorage、精模光影选择/旧氛围归一化、美化混合多选与卡片身份规范化、功能目录、独立扩图/超分/多角度状态、美化配置及模型和轻量表单配置
 * [OUTPUT]: 按任务保存模型、表单、专用工具配置与全局样本集引用，将旧单份快照迁入原任务及原独立字段所属任务
 * [POS]: public 的 Beta跑图持久配置边界，只保存可重建配置与样本集引用，不保存图片、生成结果或密钥
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { normalizeEffectBeautification, normalizeEffectBeautificationSelections } from "./effect-beautification-controls.js";
import { normalizeEffectBeautificationLighting } from "./effect-beautification-lighting.js";
import { normalizeRefinedRender } from "./refined-render-presets.js";
import { normalizeRefinedLighting } from "./refined-lighting-controls.js";
import { BETA_FEATURE_COPY } from "./beta-model-rules.js?v=9";
import { normalizeBetaMultiAngleState } from "./beta-multi-angle.js";
import { normalizeBetaOutpaintState } from "./beta-outpaint.js?v=1";
import { normalizeBetaUpscaleState } from "./beta-upscale.js?v=3";
import { DEFAULT_REFINED_MODEL_KEY, normalizeRefinedModelSelection } from "./refined-model-controls.js";

export const BETA_PAGE_STATE_STORAGE_KEY = "canvas-lab:beta-page-state:v1";
export const BETA_TASK_DRAFTS_STORAGE_KEY = "canvas-lab:beta-page-state:v2";
export const DEFAULT_BETA_MODEL_KEY = "aiTextureEnhancement";

const FEATURE_MODES = new Set(Object.keys(BETA_FEATURE_COPY));
const DEFAULT_MODELS_BY_TASK = {
  floorPlanCamera: "banana21",
  housePlanLayout: "gptImage25Sunburst",
  refinedModel: DEFAULT_REFINED_MODEL_KEY,
};

const CONTROL_KEYS = Object.freeze([
  "commonPrompt",
  "effectTime",
  "effectWeather",
  "freeSharedPrompt",
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
  "roomRenovationRenderMode",
  "roomRenovationStyleCode",
  "roomRenovationPromptAgentVersion",
  "styleCode",
  "styleTransferRenderMode",
  "styleTransferStyleCode",
  "styleTransferReferenceVersion",
  "styleTransferPromptAgentVersion",
]);

function cleanString(value, maxLength = 8000) {
  return typeof value === "string" ? value.slice(0, maxLength) : "";
}

function isRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function normalizeSampleSetIds(sampleSetIds) {
  return Object.fromEntries([...FEATURE_MODES].flatMap((mode) => {
    const sampleSetId = cleanString(sampleSetIds?.[mode], 200);
    return sampleSetId ? [[mode, sampleSetId]] : [];
  }));
}

function normalizeBetaTaskState(input = {}) {
  const featureMode = FEATURE_MODES.has(input.featureMode) ? input.featureMode : "whiteModel";
  const selectedModelKeys = [...new Set(
    Array.isArray(input.selectedModelKeys)
      ? input.selectedModelKeys.filter((key) => typeof key === "string" && key)
      : [],
  )];
  const refinedModelSelection = normalizeRefinedModelSelection(input.refinedModelSelection);
  const modelKeys = featureMode === "refinedModel" && !refinedModelSelection?.manual
    ? selectedModelKeys.filter(key => key !== DEFAULT_BETA_MODEL_KEY) : selectedModelKeys;
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
  try { controls.effectBeautificationLighting = normalizeEffectBeautificationLighting(input.controls?.effectBeautificationLighting); }
  catch { controls.effectBeautificationLighting = null; }
  controls.effectBeautificationSelections = null;
  if (Array.isArray(input.controls?.effectBeautificationSelections)) {
    try { controls.effectBeautificationSelections = normalizeEffectBeautificationSelections(input.controls.effectBeautificationSelections); }
    catch { controls.effectBeautificationSelections = []; }
  }
  try { controls.refinedRender = normalizeRefinedRender(input.controls?.refinedRender); }
  catch { controls.refinedRender = normalizeRefinedRender(); }
  try { controls.refinedLighting = input.controls?.refinedLighting == null ? null
    : normalizeRefinedLighting(input.controls.refinedLighting); }
  catch { controls.refinedLighting = { mode: "unselected" }; }
  return {
    controls,
    featureMode,
    hasSavedModelSelection: input.hasSavedModelSelection !== false && modelKeys.length > 0,
    multiAngle: normalizeBetaMultiAngleState(input.multiAngle),
    outpaint: normalizeBetaOutpaintState(input.outpaint),
    upscale: normalizeBetaUpscaleState(input.upscale),
    refinedModelSelection,
    selectedModelKeys: modelKeys.length ? modelKeys
      : [DEFAULT_MODELS_BY_TASK[featureMode] || DEFAULT_BETA_MODEL_KEY],
  };
}

export function normalizeBetaPageState(input = {}) {
  const source = isRecord(input) ? input : {};
  return { ...normalizeBetaTaskState(source), sampleSetIds: normalizeSampleSetIds(source.sampleSetIds) };
}

function readStoredValue(storage, key) {
  try {
    const value = JSON.parse(storage.getItem(key));
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

function migrateSingleDraft(source) {
  const drafts = {};
  if (!source) return { drafts, sampleSetIds: {}, lastFeatureMode: null };
  const owner = normalizeBetaTaskState(source);
  drafts[owner.featureMode] = owner;

  function retainSeparateFields(featureMode, fields) {
    if (featureMode !== owner.featureMode) drafts[featureMode] = normalizeBetaTaskState({ featureMode, ...fields });
  }

  // -------- 旧版明确隔离的字段有自己的任务归属，共用字段只归原任务 --------
  const controls = isRecord(source.controls) ? source.controls : {};
  for (const [featureMode, keys] of Object.entries({
    free: ["freeSharedPrompt"],
    effectBeautification: ["effectBeautificationIntensity", "effectBeautificationTone", "effectBeautificationLighting", "effectBeautificationSelections"],
    roomRenovation: ["roomRenovationRenderMode", "roomRenovationStyleCode", "roomRenovationPromptAgentVersion"],
    styleTransfer: ["styleTransferRenderMode", "styleTransferStyleCode", "styleTransferReferenceVersion", "styleTransferPromptAgentVersion"],
  })) {
    const values = Object.fromEntries(keys.filter(key => Object.hasOwn(controls, key)).map(key => [key, controls[key]]));
    if (Object.keys(values).length) retainSeparateFields(featureMode, { controls: values });
  }
  const refinedControls = Object.fromEntries(["refinedRender", "refinedLighting", "refinedPromptVersion"]
    .filter(key => Object.hasOwn(controls, key)).map(key => [key, controls[key]]));
  if (Object.keys(refinedControls).length || owner.refinedModelSelection) {
    retainSeparateFields("refinedModel", { controls: refinedControls,
      refinedModelSelection: owner.refinedModelSelection, selectedModelKeys: owner.refinedModelSelection?.keys });
  }
  for (const [featureMode, key] of Object.entries({ imageMultiAngle: "multiAngle", imageOutpaint: "outpaint", imageUpscale: "upscale" })) {
    if (isRecord(source[key])) retainSeparateFields(featureMode, { [key]: source[key] });
  }
  return { drafts, sampleSetIds: normalizeSampleSetIds(source.sampleSetIds), lastFeatureMode: owner.featureMode };
}

function readDraftStore(storage) {
  const saved = readStoredValue(storage, BETA_TASK_DRAFTS_STORAGE_KEY);
  if (saved?.version !== 2 || !isRecord(saved.drafts)) {
    return migrateSingleDraft(readStoredValue(storage, BETA_PAGE_STATE_STORAGE_KEY));
  }
  const drafts = Object.fromEntries([...FEATURE_MODES].flatMap(featureMode => {
    const input = saved.drafts[featureMode];
    return isRecord(input) ? [[featureMode, normalizeBetaTaskState({ ...input, featureMode })]] : [];
  }));
  return {
    drafts,
    sampleSetIds: normalizeSampleSetIds(saved.sampleSetIds),
    lastFeatureMode: Object.hasOwn(drafts, saved.lastFeatureMode) ? saved.lastFeatureMode : null,
  };
}

export function readBetaTaskDraft(pageState, featureMode) {
  if (!FEATURE_MODES.has(featureMode)) return null;
  const snapshot = pageState?.drafts?.[featureMode]
    ?? (pageState?.featureMode === featureMode && !pageState.drafts ? pageState : null);
  return normalizeBetaTaskState({ ...snapshot, featureMode });
}

function projectPageState({ drafts, sampleSetIds, lastFeatureMode }) {
  return { ...readBetaTaskDraft({ drafts }, lastFeatureMode || "whiteModel"), drafts, sampleSetIds };
}

export function readBetaPageState(storage) {
  return projectPageState(readDraftStore(storage));
}

export function saveBetaPageState(storage, value) {
  const current = readDraftStore(storage);
  const task = normalizeBetaTaskState(value);
  const next = {
    version: 2,
    drafts: { ...current.drafts, [task.featureMode]: task },
    sampleSetIds: normalizeSampleSetIds({ ...current.sampleSetIds, ...value.sampleSetIds }),
    lastFeatureMode: task.featureMode,
  };
  storage.setItem(BETA_TASK_DRAFTS_STORAGE_KEY, JSON.stringify(next));
  return projectPageState(next);
}

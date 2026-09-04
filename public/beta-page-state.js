/**
 * [INPUT]: 依赖 localStorage 兼容存储与 Beta跑图五功能、模型和轻量表单配置
 * [OUTPUT]: 对外提供默认 Flux2 Klein 的 Beta 页面配置归一化、安全读取与持久化
 * [POS]: public 的 Beta跑图持久配置边界，只保存可重建配置与样本集引用，不保存图片、生成结果或密钥
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export const BETA_PAGE_STATE_STORAGE_KEY = "canvas-lab:beta-page-state:v1";
export const DEFAULT_BETA_MODEL_KEY = "aiTextureEnhancement";

const FEATURE_MODES = new Set([
  "effectEnhancement",
  "emptyRoom",
  "free",
  "refinedModel",
  "whiteModel",
]);

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
]);

function cleanString(value, maxLength = 8000) {
  return typeof value === "string" ? value.slice(0, maxLength) : "";
}

export function normalizeBetaPageState(input = {}) {
  const featureMode = FEATURE_MODES.has(input.featureMode) ? input.featureMode : "whiteModel";
  const selectedModelKeys = [...new Set(
    Array.isArray(input.selectedModelKeys)
      ? input.selectedModelKeys.filter((key) => typeof key === "string" && key).slice(0, 4)
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
  return {
    controls,
    featureMode,
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

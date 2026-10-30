/**
 * [INPUT]: 依赖精模Prompt版本、光影预设三执行方式/上传直参控制器、公开模型能力/实时权限与上传策略
 * [OUTPUT]: 对外提供纯词基础、专用迁移与氛围词前置版本分流、显式启用光影多选/刷新、selections光影×模式投影及双图来源查询与独立准入及Banana2.1默认/跨功能模型恢复
 * [POS]: public 的主工作台精模组合控制器，将光影三模式选择与默认模型策略从 app.js 分离
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { bindRefinedPromptVersionSelect } from "./refined-prompt-version-select.js";
import { bindRefinedLightingControls } from "./refined-lighting-controls.js";
import { isLightingReference, refinedLightingPromptKind } from "./refined-flux-reference.js";

export const DEFAULT_REFINED_MODEL_KEY = "banana21";

export function normalizeRefinedModelSelection(value) {
  const keys = [...new Set(Array.isArray(value?.keys) ? value.keys.filter(key => typeof key === "string" && key) : [])];
  return keys.length ? { keys, manual: value.manual === true } : null;
}

export function createRefinedModelSelection({ saved = null } = {}) {
  const restored = normalizeRefinedModelSelection(saved);
  let feature = null, ordinaryKeys = null, refinedKeys = restored?.keys || null;
  let manual = restored?.manual === true, access = null;
  return {
    forFeature(nextFeature, currentKeys, catalog, availability) {
      if (availability !== undefined) access = availability;
      let keys = [...currentKeys];
      if (nextFeature === "refinedModel") {
        if (feature !== nextFeature) { ordinaryKeys = keys; keys = refinedKeys || keys; }
        if (catalog.length && !manual) {
          const candidates = catalog.filter(model => Number(model.maxReferenceImages) >= 2
            && (access === null || access.some(entry => entry.key === model.key && entry.available === true)));
          const retained = keys.filter(key => candidates.some(model => model.key === key));
          const preferred = candidates.find(model => model.key === DEFAULT_REFINED_MODEL_KEY) || candidates[0];
          keys = retained.length ? retained : preferred ? [preferred.key] : [];
        }
        if (catalog.length) refinedKeys = keys;
      } else if (feature === "refinedModel") {
        refinedKeys = keys;
        keys = ordinaryKeys || keys;
      }
      feature = nextFeature;
      return keys;
    },
    chooseByUser(currentFeature, keys) {
      if (currentFeature === "refinedModel") { manual = true; refinedKeys = [...keys]; }
      return [...keys];
    },
    snapshot: () => refinedKeys?.length ? { keys: [...refinedKeys], manual } : null,
  };
}

export function bindRefinedModelControls({ elements, onChange, getPolicy, showToast,
  bindControls = bindRefinedLightingControls }) {
  const version = bindRefinedPromptVersionSelect({ availability: elements.refinedPromptAvailability,
    note: elements.refinedPromptNote, select: elements.refinedPromptVersionSelect });
  let lightingConfig = {};
  const syncPromptSource = () => { const kind = refinedLightingPromptKind(controls.requestFields().refinedLighting);
    version.setReferenceConfig(kind === "base" ? null : lightingConfig, kind); };
  const controls = bindControls({ root: elements.refinedRenderSection,
    storageKey: "canvas-lab.refined-lighting", withConfigRefresh: true, allowMultiplePresets: true,
    onChange() { syncPromptSource(); onChange(); }, getPolicy, showToast });
  try { if (!sessionStorage.getItem("canvas-lab.refined-lighting")) {
    const legacy = sessionStorage.getItem("canvas-lab.refined-render");
    if (legacy) controls.setValue(JSON.parse(legacy));
  } } catch { /* --- 损坏或不可用存储保持光影未选 --- */ }
  syncPromptSource();
  const updateCount = () => { elements.refinedPromptCount.textContent = `${elements.refinedPromptInput.value.length} / 8000`; };
  elements.refinedPromptInput.addEventListener("input", () => { updateCount(); onChange(); });
  elements.refinedPromptVersionSelect.addEventListener("change", onChange);
  updateCount();
  return {
    setPromptConfig: config => version.render(config),
    setLightingConfig(config) { lightingConfig = config || {}; controls.setAvailability(config); syncPromptSource(); },
    setModels: models => { controls.setModels(models); onChange(); },
    setPolicy: policy => controls.setPolicy(policy),
    promptVersion: version.value,
    requestFields: () => controls.requestFields(),
    selections: () => controls.selections?.() || [controls.requestFields().refinedLighting].filter(Boolean),
    usesReference: () => isLightingReference(controls.requestFields().refinedLighting),
    validation: () => refinedLightingPromptKind(controls.requestFields().refinedLighting) === "base" && !version.value()
      ? "飞书精模 Prompt 没有可用版本" : controls.validation(),
    setVisible(visible) {
      elements.refinedPromptSection.classList.toggle("hidden", !visible);
      elements.refinedRenderSection.classList.toggle("hidden", !visible);
    },
  };
}

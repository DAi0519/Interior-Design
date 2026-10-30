/**
 * [INPUT]: 依赖共享光影控制器、单项光影请求投影、飞书三规则脱敏配置/双图专用Prompt目录、基础Prompt版本、Beta模型和轻量恢复值
 * [OUTPUT]: 对外提供纯词基础、迁移/上传与氛围词前置Prompt分流、光影×模式selections/单项settings、光影与方式独立计数摘要、独立版本准入和基础草稿记忆，不持久化上传图片
 * [POS]: public 的 Beta 精模光影适配器，与设计风格/旧时段天气参数隔离
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { bindRefinedLightingControls, refinedLightingSelections } from "./refined-lighting-controls.js";
import { referenceLightingPromptCatalog } from "./refined-prompt-version-select.js";
import { refinedLightingPromptKind } from "./refined-flux-reference.js";
import { refinedLightingRequestSelection } from "./generation-task-request.js";

export function betaRefinedLightingRunSummary({ selections, samples, models }) {
  const presets = new Set(selections.filter(value => value.mode === "preset").map(value => value.presetId)).size;
  const executions = new Set(selections.map(value => value.execution)).size;
  const factors = [`${samples} 个样本`, `${models} 个模型`,
    ...(presets > 1 ? [`${presets} 种光影`] : []), ...(executions > 1 ? [`${executions} 种方式`] : [])];
  return `${factors.join(" × ")} = ${samples * models * selections.length} 张结果`;
}

export function createBetaRefinedRenderConfiguration({ elements, fillSelect, getState, onChange,
  getModels = () => [], showToast = () => {},
  bindControls = bindRefinedLightingControls }) {
  let baseVersion = "", referenceDisplayed = false;
  const controls = bindControls({ root: elements.refinedRenderFields,
    allowMultiplePresets: true,
    onChange() { renderPrompt(); onChange?.(); }, showToast,
    getPolicy: () => getState().catalog?.referenceImage || {
      accept: ["image/png", "image/jpeg", "image/webp"], maxBytesPerImage: 8 * 1024 * 1024,
      maxTotalBytes: 8 * 1024 * 1024, maxCount: 1,
    } });

  function updateLighting() {
    controls.setAvailability(getState().stylesConfig?.refinedLighting || {
      available: false, referenceAvailable: false, reason: "光影库尚未就绪，请刷新配置", presets: [],
    });
    controls.setModels(getModels());
  }

  function validation() {
    if (refinedLightingPromptKind(controls.value()) === "base" && !elements.refinedPromptSelect.value) return "精模 Prompt 版本不可用";
    return controls.validation(getModels());
  }

  function renderPrompt() {
    const kind = refinedLightingPromptKind(controls.value()), reference = kind !== "base";
    if (!referenceDisplayed && elements.refinedPromptSelect.value) baseVersion = elements.refinedPromptSelect.value;
    const promptConfig = reference ? referenceLightingPromptCatalog(getState().stylesConfig?.refinedLighting, kind)
      : getState().stylesConfig?.refinedPrompt;
    const versions = (promptConfig?.versions || []).filter(entry => entry.published === true);
    const selected = reference ? promptConfig.defaultVersion
      : versions.some(entry => String(entry.version) === String(baseVersion)) ? baseVersion : promptConfig?.defaultVersion;
    fillSelect(elements.refinedPromptSelect, versions.map(entry => ({
      label: `${entry.name} · v${entry.version}`, value: entry.version,
    })), selected);
    if (!reference && promptConfig) baseVersion = elements.refinedPromptSelect.value;
    referenceDisplayed = reference;
    elements.refinedPromptSelect.disabled = reference || versions.length === 0;
    const name = kind === "hybrid" ? "氛围词参考前置" : reference ? "参考图光影迁移" : "精模";
    elements.configStatus.textContent = `${name} Prompt ${versions.length ? "已就绪" : "不可用"}`;
  }

  function validate() {
    const issue = validation();
    if (issue) throw new Error(issue);
  }

  return {
    render() {
      const state = getState();
      const refined = state.featureMode === "refinedModel";
      elements.refinedRenderFields.classList.toggle("hidden", !refined);
      if (!refined) return;
      updateLighting();
      renderPrompt();
    },
    restore(value) { controls.setValue(value); renderPrompt(); },
    restorePromptVersion(value) { baseVersion = String(value || "");
      if (!referenceDisplayed) elements.refinedPromptSelect.value = baseVersion; },
    basePromptVersion: () => referenceDisplayed ? baseVersion : elements.refinedPromptSelect.value,
    snapshot: () => controls.value(),
    selections: () => controls.selections?.() || refinedLightingSelections(controls.value(), getState().stylesConfig?.refinedLighting),
    setModels(models) { controls.setModels(models); },
    validation,
    validate,
    settings(selection = null) {
      validate();
      const selected = refinedLightingRequestSelection(selection || controls.value());
      return {
        promptVersion: refinedLightingPromptKind(selected) !== "base"
          ? selected.ruleVersion : Number(referenceDisplayed ? baseVersion : elements.refinedPromptSelect.value),
        ...controls.requestFields(),
        refinedLighting: selected,
      };
    },
  };
}

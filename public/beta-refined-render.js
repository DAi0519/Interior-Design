/**
 * [INPUT]: 依赖共享光影控制器、飞书双规则脱敏配置/上传专用Prompt目录、基础Prompt版本、Beta模型和轻量恢复值
 * [OUTPUT]: 对外提供纯词预设基础/预设图文及上传专用迁移Prompt统一分流、独立版本准入和基础草稿记忆，不持久化上传图片
 * [POS]: public 的 Beta 精模光影适配器，与设计风格/旧时段天气参数隔离
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { bindRefinedLightingControls, usesRefinedLightingReferencePrompt } from "./refined-lighting-controls.js";
import { referenceLightingPromptCatalog } from "./refined-prompt-version-select.js";

export function createBetaRefinedRenderConfiguration({ elements, fillSelect, getState, onChange,
  getModels = () => [], showToast = () => {},
  bindControls = bindRefinedLightingControls }) {
  let baseVersion = "", referenceDisplayed = false;
  const controls = bindControls({ root: elements.refinedRenderFields,
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
    if (!usesRefinedLightingReferencePrompt(controls.value()) && !elements.refinedPromptSelect.value) return "精模 Prompt 版本不可用";
    return controls.validation(getModels());
  }

  function renderPrompt() {
    const reference = usesRefinedLightingReferencePrompt(controls.value());
    if (!referenceDisplayed && elements.refinedPromptSelect.value) baseVersion = elements.refinedPromptSelect.value;
    const promptConfig = reference ? referenceLightingPromptCatalog(getState().stylesConfig?.refinedLighting)
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
    elements.configStatus.textContent = versions.length
      ? reference ? "参考图光影迁移 Prompt 已就绪" : "精模 Prompt 已就绪"
      : reference ? "参考图光影迁移 Prompt 不可用" : "精模 Prompt 不可用";
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
    setModels(models) { controls.setModels(models); },
    validation,
    validate,
    settings() {
      validate();
      return {
        promptVersion: usesRefinedLightingReferencePrompt(controls.value())
          ? getState().stylesConfig?.refinedLighting?.referenceRuleVersion : Number(elements.refinedPromptSelect.value),
        ...controls.requestFields(),
      };
    },
  };
}

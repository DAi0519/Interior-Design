/**
 * [INPUT]: 依赖持久化函数、Beta表单、精模光影/美化控制器、独立扩图/超分和风格转换快照及重渲染回调
 * [OUTPUT]: 提供精模光影/手动模型和普通表单落盘、基础Prompt版本与预设图文/上传迁移版本独立保存恢复、旧氛围迁移、模型多选保留和快速切页保存
 * [POS]: public 的 Beta跑图配置生命周期控制器，连接纯状态存储与 beta-app 页面编排，不持有图片或任务结果
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { saveBetaPageState } from "./beta-page-state.js?v=8";

function restoreTextValue(input, value) {
  if (typeof value === "string") input.value = value;
}

function restoreSelectValue(select, value) {
  if (!value || ![...select.options].some((option) => option.value === value && !option.disabled)) return;
  select.value = value;
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

export function createBetaConfigurationPersistence({
  currentState,
  effectBeautificationControls,
  refinedRenderConfiguration,
  elements,
  renderFeature,
  renderOutputControls,
  renderRunSummary,
  restoredPageState,
  storage,
}) {
  let ready = false;

  function controls() {
    const restoredControls = restoredPageState.controls;
    const stylesReady = currentState().stylesReady;
    const beautification = effectBeautificationControls.value();
    return {
      commonPrompt: elements.commonPromptInput.value,
      effectBeautificationIntensity: beautification.intensity,
      effectBeautificationTone: beautification.tone,
      effectTime: elements.effectTimeSelect.value,
      effectWeather: elements.effectWeatherSelect.value,
      negativePrompt: elements.negativePromptInput.value,
      promptAgentModelKey: elements.promptAgentModelSelect.value,
      promptAgentVersion: stylesReady
        ? elements.promptAgentVersionSelect.value
        : restoredControls.promptAgentVersion,
      quality: elements.qualitySelect.value,
      ratio: elements.ratioSelect.value,
      refinedPromptVersion: stylesReady
        ? refinedRenderConfiguration?.basePromptVersion?.() ?? elements.refinedPromptSelect.value
        : restoredControls.refinedPromptVersion,
      refinedLighting: refinedRenderConfiguration?.snapshot() || restoredControls.refinedLighting,
      renderMode: elements.renderModeSelect.value,
      resolution: elements.resolutionSelect.value,
      roomType: elements.roomTypeSelect.value,
      roomTypeDetail: elements.roomTypeDetailInput.value,
      styleCode: stylesReady ? elements.styleSelect.value : restoredControls.styleCode,
      ...currentState().designControls,
    };
  }

  function save() {
    if (!ready) {
      elements.betaForm.dataset.configurationState = "loading";
      return;
    }
    const pageState = currentState();
    saveBetaPageState(storage, {
      controls: controls(),
      featureMode: pageState.featureMode,
      outpaint: pageState.outpaint,
      upscale: pageState.upscale,
      sampleSetIds: pageState.sampleSetIds,
      selectedModelKeys: pageState.selectedModelKeys,
      refinedModelSelection: pageState.refinedModelSelection,
    });
    elements.betaForm.dataset.configurationState = "saved";
  }

  function restore() {
    const controlsToRestore = restoredPageState.controls;
    effectBeautificationControls.restore({
      intensity: controlsToRestore.effectBeautificationIntensity,
      tone: controlsToRestore.effectBeautificationTone,
    });
    const legacyLighting = controlsToRestore.refinedRender;
    refinedRenderConfiguration?.restorePromptVersion?.(controlsToRestore.refinedPromptVersion);
    const hasLegacyLighting = legacyLighting && ["time", "weather", "tone"]
      .some(key => legacyLighting[key] && legacyLighting[key] !== "preserve");
    refinedRenderConfiguration?.restore(controlsToRestore.refinedLighting
      || (hasLegacyLighting ? legacyLighting : { mode: "unselected" }));
    restoreTextValue(elements.commonPromptInput, controlsToRestore.commonPrompt);
    restoreTextValue(elements.negativePromptInput, controlsToRestore.negativePrompt);
    restoreTextValue(elements.roomTypeDetailInput, controlsToRestore.roomTypeDetail);
    for (const [select, value] of [
      [elements.renderModeSelect, controlsToRestore.renderMode],
      [elements.promptAgentModelSelect, controlsToRestore.promptAgentModelKey],
      [elements.roomTypeSelect, controlsToRestore.roomType],
      [elements.effectTimeSelect, controlsToRestore.effectTime],
      [elements.effectWeatherSelect, controlsToRestore.effectWeather],
    ]) restoreSelectValue(select, value);
    renderFeature();
    for (const [select, value] of [
      [elements.styleSelect, controlsToRestore.styleCode],
      [elements.promptAgentVersionSelect, controlsToRestore.promptAgentVersion],
      [elements.ratioSelect, controlsToRestore.ratio],
    ]) restoreSelectValue(select, value);
    if (!refinedRenderConfiguration?.restorePromptVersion) restoreSelectValue(elements.refinedPromptSelect, controlsToRestore.refinedPromptVersion);
    renderOutputControls();
    restoreSelectValue(elements.resolutionSelect, controlsToRestore.resolution);
    restoreSelectValue(elements.qualitySelect, controlsToRestore.quality);
    elements.roomTypeDetailField.classList.toggle(
      "hidden",
      elements.roomTypeSelect.value !== "其他",
    );
    renderRunSummary();
  }

  function bindLifecycle() {
    window.addEventListener("pagehide", save);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") save();
    });
  }

  return {
    bindLifecycle,
    markReady() {
      ready = true;
      save();
    },
    restore,
    save,
  };
}

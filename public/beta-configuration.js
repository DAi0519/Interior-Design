/**
 * [INPUT]: 依赖 beta-page-state 持久化函数、Beta 表单 DOM、当前页面状态读取器与配置重渲染回调
 * [OUTPUT]: 对外提供 createBetaConfigurationPersistence，统一配置采集、跳过已禁用模型选项的分阶段恢复、快速切页落盘与可见保存状态
 * [POS]: public 的 Beta跑图配置生命周期控制器，连接纯状态存储与 beta-app 页面编排，不持有图片或任务结果
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { saveBetaPageState } from "./beta-page-state.js?v=1";

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
    return {
      commonPrompt: elements.commonPromptInput.value,
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
        ? elements.refinedPromptSelect.value
        : restoredControls.refinedPromptVersion,
      renderMode: elements.renderModeSelect.value,
      resolution: elements.resolutionSelect.value,
      roomType: elements.roomTypeSelect.value,
      roomTypeDetail: elements.roomTypeDetailInput.value,
      styleCode: stylesReady ? elements.styleSelect.value : restoredControls.styleCode,
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
      sampleSetIds: pageState.sampleSetIds,
      selectedModelKeys: pageState.selectedModelKeys,
    });
    elements.betaForm.dataset.configurationState = "saved";
  }

  function restore() {
    const controlsToRestore = restoredPageState.controls;
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
      [elements.refinedPromptSelect, controlsToRestore.refinedPromptVersion],
      [elements.ratioSelect, controlsToRestore.ratio],
    ]) restoreSelectValue(select, value);
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

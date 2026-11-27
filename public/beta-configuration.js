/**
 * [INPUT]: 依赖持久化函数、Beta表单、精模光影/美化六档与新增模板混合多选控制器、独立扩图/超分/多角度和风格转换快照及重渲染回调
 * [OUTPUT]: 读取及保存当前任务草稿，按任务恢复共享表单、光影与提示词版本，恢复过程中不写入半完成草稿
 * [POS]: public 的 Beta跑图配置生命周期控制器，连接纯状态存储与 beta-app 页面编排，不持有图片或任务结果
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { readBetaPageState, readBetaTaskDraft, saveBetaPageState } from "./beta-page-state.js?v=13";

function restoreTextValue(input, value) {
  if (typeof value === "string") input.value = value;
}

function restoreSelectValue(select, value, { reset = false, allowDisabled = false } = {}) {
  if (!value && !reset) return;
  const options = [...select.options];
  const option = options.find(option => option.value === value && (allowDisabled || !option.disabled))
    ?? (reset ? options.find(option => !option.disabled) : null);
  if (!option) return;
  select.value = option.value;
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
  let restoring = false;
  let activeDraft = restoredPageState;

  function draftFor(featureMode) {
    return readBetaTaskDraft(readBetaPageState(storage), featureMode);
  }

  function controls({ featureMode, stylesReady, designControls }) {
    const restoredControls = (activeDraft?.featureMode === featureMode ? activeDraft : draftFor(featureMode)).controls;
    const beautification = effectBeautificationControls.value();
    return {
      commonPrompt: elements.commonPromptInput.value,
      effectBeautificationIntensity: beautification.intensity,
      effectBeautificationTone: beautification.tone,
      effectBeautificationLighting: effectBeautificationControls.lightingValue?.() ?? null,
      effectBeautificationSelections: effectBeautificationControls.selections?.()
        ?? restoredControls.effectBeautificationSelections,
      effectTime: elements.effectTimeSelect.value,
      effectWeather: elements.effectWeatherSelect.value,
      freeSharedPrompt: elements.freeSharedPromptInput.value,
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
      ...designControls,
    };
  }

  function save() {
    if (restoring) return;
    if (!ready) {
      elements.betaForm.dataset.configurationState = "loading";
      return;
    }
    const pageState = currentState();
    if (!pageState.featureMode) return;
    const saved = saveBetaPageState(storage, {
      controls: controls(pageState),
      featureMode: pageState.featureMode,
      multiAngle: pageState.multiAngle,
      outpaint: pageState.outpaint,
      upscale: pageState.upscale,
      sampleSetIds: pageState.sampleSetIds,
      selectedModelKeys: pageState.selectedModelKeys,
      refinedModelSelection: pageState.refinedModelSelection,
    });
    activeDraft = readBetaTaskDraft(saved, pageState.featureMode);
    elements.betaForm.dataset.configurationState = "saved";
  }

  function restoreAppearance(controlsToRestore, featureMode) {
    if (!featureMode || featureMode === "effectBeautification") {
      effectBeautificationControls.restore({
        intensity: controlsToRestore.effectBeautificationIntensity,
        tone: controlsToRestore.effectBeautificationTone,
      });
      effectBeautificationControls.setLightingValue?.(controlsToRestore.effectBeautificationLighting);
      if (Array.isArray(controlsToRestore.effectBeautificationSelections)) {
        effectBeautificationControls.restoreSelections?.(controlsToRestore.effectBeautificationSelections);
      }
    }
    if (!featureMode || featureMode === "refinedModel") {
      const legacyLighting = controlsToRestore.refinedRender;
      refinedRenderConfiguration?.restorePromptVersion?.(controlsToRestore.refinedPromptVersion);
      const hasLegacyLighting = legacyLighting && ["time", "weather", "tone"]
        .some(key => legacyLighting[key] && legacyLighting[key] !== "preserve");
      refinedRenderConfiguration?.restore(controlsToRestore.refinedLighting
        || (hasLegacyLighting ? legacyLighting : { mode: "unselected" }));
    }
  }

  function restoreForm(controlsToRestore, featureMode) {
    const switchingTask = Boolean(featureMode);
    const separateDesign = featureMode === "roomRenovation" || featureMode === "styleTransfer";
    const renderMode = controlsToRestore.renderMode || (separateDesign ? controlsToRestore[`${featureMode}RenderMode`] : "");
    const styleCode = controlsToRestore.styleCode || (separateDesign ? controlsToRestore[`${featureMode}StyleCode`] : "");
    const agentVersion = controlsToRestore.promptAgentVersion
      || (separateDesign ? controlsToRestore[`${featureMode}PromptAgentVersion`] : "");
    restoreTextValue(elements.commonPromptInput, controlsToRestore.commonPrompt);
    if (switchingTask || !ready) restoreTextValue(elements.freeSharedPromptInput, controlsToRestore.freeSharedPrompt);
    restoreTextValue(elements.negativePromptInput, controlsToRestore.negativePrompt);
    restoreTextValue(elements.roomTypeDetailInput, controlsToRestore.roomTypeDetail);
    for (const [select, value] of [
      [elements.renderModeSelect, renderMode],
      [elements.roomTypeSelect, controlsToRestore.roomType],
      [elements.effectTimeSelect, controlsToRestore.effectTime],
      [elements.effectWeatherSelect, controlsToRestore.effectWeather],
    ]) restoreSelectValue(select, value, { reset: switchingTask });
    restoreSelectValue(elements.promptAgentModelSelect, controlsToRestore.promptAgentModelKey,
      { reset: switchingTask, allowDisabled: switchingTask });
    renderFeature();
    for (const [select, value] of [
      [elements.styleSelect, styleCode],
      [elements.promptAgentVersionSelect, agentVersion],
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

  function restore(draft) {
    const source = draft || restoredPageState;
    restoring = true;
    try {
      if (draft) {
        activeDraft = draft;
        // -------- 切换控制器内部的任务作用域，再将新草稿写入共享输入 --------
        renderFeature();
        for (const select of [elements.ratioSelect, elements.resolutionSelect, elements.qualitySelect,
          elements.styleSelect, elements.promptAgentVersionSelect]) select.value = "";
      }
      const controlsToRestore = source.controls;
      restoreAppearance(controlsToRestore, draft?.featureMode);
      restoreForm(controlsToRestore, draft?.featureMode);
    } finally {
      restoring = false;
    }
  }

  function bindLifecycle() {
    window.addEventListener("pagehide", save);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") save();
    });
  }

  return {
    bindLifecycle,
    draftFor,
    markReady() {
      ready = true;
      save();
    },
    restore,
    save,
  };
}

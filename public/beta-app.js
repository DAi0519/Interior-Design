/**
 * [INPUT]: 依赖后置KS目录/逐样本输入门禁与身份冻结、共享美化混合多选/精模光影模式、Beta含户型布局的十三功能目录、旧房设计配置/空房判定、Flux负向草稿、扩图/超分、持久配置、样本库/预警/Run ID和API工具
 * [OUTPUT]: 户型布局逐图标注/版本选择与同源执行； 提供旧房样本×模型批测、逐图房型/独立Agent版本与场景投影及旧进程门禁；美化/精模/全景按光影×模型×样本展开、尺寸与Prompt准入、可恢复配置、仅失败项冻结RETRY和生成/归档双阶段监控
 * [POS]: public 的 Beta跑图配置与任务监控编排器，把跨图像功能复用、按目标功能校验的样本资产交给 beta-sample-library，并把生成/同步/连接异常交给 beta-results；飞书保持结果真源
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createBetaHousePlanConfiguration } from "./beta-house-plan.js";
import { isLightingReference } from "./refined-flux-reference.js";
import { beautificationItemsForSelection, beautificationSettingsForSelection, generationItemsForSelection, panoramaItemsForSelection, panoramaLightingRequestSelection } from "./generation-task-request.js";
import { generationFeatureUnavailableReason } from "./model-capabilities.js";
import "./custom-select.js?v=9";
import { DEFAULT_BETA_MODEL_KEY, readBetaPageState } from "./beta-page-state.js?v=9";
import { createBetaConfigurationPersistence } from "./beta-configuration.js?v=9";
import { BETA_FEATURE_COPY as FEATURE_COPY, assertBetaPanoramaSource, betaFeatureUnavailableReason, betaModelSelectable, betaPostUpscaleUnavailableReason, betaSizeOptions } from "./beta-model-rules.js?v=6";
import { bindFluxNegativePrompt } from "./flux-negative-prompt.js";
import { isEmptyRoomDesign } from "./room-renovation.js";
import { createBetaOutpaintConfiguration } from "./beta-outpaint.js?v=1";
import { createBetaUpscaleConfiguration } from "./beta-upscale.js?v=3";
import { createBetaDesignConfiguration } from "./beta-design-config.js";
import { betaRefinedLightingRunSummary, createBetaRefinedRenderConfiguration } from "./beta-refined-render.js";
import { createRefinedModelSelection } from "./refined-model-controls.js";
import { bindPanoramaLightingControls } from "./panorama-lighting-controls.js";
import { bindEffectBeautificationControls } from "./effect-beautification-controls.js?v=2";
import { bindModelMultiSelect } from "./model-multi-select.js?v=5";
import { packBatchAssets } from "./beta-assets.js?v=2";
import { bindImageDrop, renderImagePreviews } from "./beta-upload.js";
import { createBetaSampleLibrary } from "./beta-sample-library.js?v=8";
import { fillBetaSelect as fillSelect, renderBetaProgress as renderProgress, renderBetaWarnings } from "./beta-results.js?v=2";
import { createBetaRunId, formatBetaTestTime } from "./beta-run-id.js?v=2";
import { adaptGenerationInputForModel } from "./generation-batch.js";
import { readImageDimensions } from "./image-ratio.js";
import { api, readFileAsInput } from "./workbench-utils.js";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const JOB_STORAGE_KEY = "canvas-lab:beta-run-job";
const restoredPageState = readBetaPageState(localStorage);
const refinedModelSelection = createRefinedModelSelection({ saved: restoredPageState.refinedModelSelection });
const elements = Object.fromEntries([
  "betaConnectionStatus", "betaFeatureSelect", "betaForm",
  "betaGenerationActions",
  "commonPromptField", "commonPromptInput", "commonPromptLabel",
  "configStatus", "designFields", "effectFields", "effectTimeSelect", "effectBeautificationFields",
  "effectWeatherSelect", "emptyRoomFields", "freePromptList", "freePromptsField",
  "freePromptsInput", "freeReferenceDropZone", "freeReferenceField",
  "freeReferenceInput", "freeReferenceList", "generationProgressBar",
  "generationProgressCount", "generationProgressTrack", "jobProgress",
  "jobProgressBar", "jobProgressCount", "jobProgressLabel", "jobProgressTrack",
  "jobStatus", "modelOptions", "monitorBaseLink", "monitorBatchSummary",
  "monitorWarnings", "monitorWarningsCount",
  "negativePromptField", "negativePromptInput", "negativePromptCount", "negativePromptNote", "promptAgentAvailability", "promptAgentModelSelect",
  "ordinaryOutputFields", "outpaintFields", "outpaintWorkflowOptions", "outpaintRatioSelect",
  "outpaintMultipleSelect", "outpaintAvailability", "outputSettingsHint", "taskSettingsSection",
  "upscaleFields", "upscaleWorkflowOptions", "upscaleResolutionField", "upscaleResolutionSelect", "upscaleResolutionNote", "upscaleAvailability",
  "panoramaFields",
  "promptAgentVersionField", "promptAgentVersionSelect", "qualityField",
  "qualitySelect", "ratioSelect", "refinedPromptField", "refinedPromptSelect", "refinedRenderFields",
  "renderModeSelect", "resolutionSelect", "roomTypeDetailField",
  "roomTypeDetailInput", "roomTypeSelect", "runButton", "runButtonLabel", "runHint",
  "runSummary", "newBatchButton", "sampleCount", "sampleList", "sampleSetCreatePanel",
  "sampleSetLibraryPanel", "sampleSetNameInput", "sampleSetSelect",
  "sampleSetSyncStatus",
  "saveSampleSetButton", "cancelSampleSetButton", "newSampleSetButton",
  "sourceFilesDropLabel",
  "sourceFilesDropZone", "sourceFilesField", "sourceFilesInput", "sourceFilesTitle", "sourceFilesHint",
  "styleField", "styleReferenceDropZone", "styleReferenceField",
  "styleReferenceInput", "styleReferenceList", "styleSelect",
].map((id) => [id, document.querySelector(`#${id}`)]));
const state = {
  betaConfig: null,
  catalog: { agentModels: [], emptyRoomTypes: [], models: [] },
  connected: false,
  featureMode: restoredPageState.featureMode,
  freeReference: null,
  job: null,
  submitting: false,
  modelAccess: new Map(),
  modelAccessChecked: false,
  agentAccess: new Map(),
  agentAccessChecked: false,
  sampleSetIds: { ...restoredPageState.sampleSetIds },
  selectedModelKeys: [...restoredPageState.selectedModelKeys],
  styleReference: null,
  stylesConfig: null,
};
const negativePrompt = bindFluxNegativePrompt({ count: elements.negativePromptCount, note: elements.negativePromptNote,
  root: elements.negativePromptField, textarea: elements.negativePromptInput });
const modelSelection = bindModelMultiSelect({
  container: elements.modelOptions,
  onChange(keys) {
    state.selectedModelKeys = refinedModelSelection.chooseByUser(state.featureMode, keys);
    renderOutputControls();
    saveConfiguration();
  },
  onMessage(message) {
    elements.runHint.textContent = message;
  },
  presentOption(model) {
    const selectable = betaModelSelectable(model, state.featureMode);
    return { label: model.label, selectable, reason: selectable ? "" : "不支持 2:1" };
  },
});
const effectBeautificationControls = bindEffectBeautificationControls({
  root: elements.effectBeautificationFields,
  multiple: true,
  withPromptStatus: false,
  reload: async () => (state.stylesConfig = await api("/api/config/refresh", { method: "POST" })),
  onChange() { renderFeature(); saveConfiguration(); },
});
const outpaintConfiguration = createBetaOutpaintConfiguration({
  elements,
  initialState: restoredPageState.outpaint,
  onChange() { renderRunSummary(); saveConfiguration(); },
  onMessage(message) { elements.runHint.textContent = message; },
});
const upscaleConfiguration = createBetaUpscaleConfiguration({
  elements, initialState: restoredPageState.upscale,
  onChange() { renderRunSummary(); saveConfiguration(); },
  onMessage(message) { elements.runHint.textContent = message; },
});
const sampleLibrary = createBetaSampleLibrary({
  api,
  elements,
  onChange: renderRunSummary,
  onError: reportUploadError,
  onSelectionChange(featureMode, sampleSetId) {
    state.sampleSetIds[featureMode] = sampleSetId;
    saveConfiguration();
  },
  readImage,
  validateSourceImage: assertBetaPanoramaSource,
});
const housePlanConfiguration = createBetaHousePlanConfiguration({ getState: () => state, sampleLibrary, fillSelect,
  onChange() { if (state.featureMode === "housePlanLayout") renderModels(); }, onError: reportUploadError });
const designConfiguration = createBetaDesignConfiguration({ elements, fillSelect, getState: () => state, restoredPageState });
const refinedRenderConfiguration = createBetaRefinedRenderConfiguration({ elements, fillSelect, getState: () => state,
  getModels: selectedModels, showToast: message => { elements.runHint.textContent = message; },
  onChange() { renderOutputControls(); renderRunSummary(); saveConfiguration(); } });
const panoramaLighting = bindPanoramaLightingControls({ root: elements.panoramaFields, storage: localStorage, storageKey: "canvas-lab:panorama-lighting:beta", reload: () => api("/api/config/refresh", { method: "POST" }), onChange: renderRunSummary, showToast: message => { elements.runHint.textContent = message; } });
const configuration = createBetaConfigurationPersistence({
  currentState: () => ({
    featureMode: state.featureMode,
    sampleSetIds: state.sampleSetIds,
    selectedModelKeys: state.selectedModelKeys,
    refinedModelSelection: refinedModelSelection.snapshot(),
    outpaint: outpaintConfiguration.snapshot(),
    upscale: upscaleConfiguration.snapshot(),
    stylesReady: Boolean(state.stylesConfig),
    designControls: designConfiguration.snapshot(),
  }),
  effectBeautificationControls,
  refinedRenderConfiguration,
  elements,
  renderFeature,
  renderOutputControls,
  renderRunSummary,
  restoredPageState,
  storage: localStorage,
});
function saveConfiguration() {
  configuration.save();
}
function renderPromptAgentModels() {
  const models = state.catalog.agentModels.filter((model) => model.imageInput);
  const previousKey = elements.promptAgentModelSelect.value;
  const previous = models.find((model) => model.key === previousKey);
  fillSelect(elements.promptAgentModelSelect, models.map((model) => {
    const access = state.agentAccess.get(model.key);
    const disabled = state.agentAccessChecked && !access?.selectable;
    return {
      disabled,
      label: disabled ? `${model.label} · ${access?.reason || "当前不可用"}` : model.label,
      value: model.key,
    };
  }), previousKey || "gemini3pro");
  const selected = models.find((model) => model.key === elements.promptAgentModelSelect.value);
  const changed = Boolean(previous && previous.key !== selected?.key);
  elements.promptAgentAvailability.textContent = !state.connected
    ? "请先连接 OneAPI"
    : !state.agentAccessChecked
      ? "正在检测模型权限"
      : changed && selected
        ? `${previous.label} 当前不可用，已切换为 ${selected?.label || "可用模型"}`
        : selected
          ? "当前 API Key 已开放此模型"
          : "当前 API Key 没有可用的提示词模型";
  elements.promptAgentAvailability.hidden = Boolean(state.connected && state.agentAccessChecked && selected && !changed);
  elements.promptAgentAvailability.classList.toggle("error", !state.connected || state.agentAccessChecked && (!selected || changed));
  renderRunSummary();
}
function selectedModels() {
  return state.selectedModelKeys
    .map((key) => state.catalog.models.find((model) => model.key === key))
    .filter(Boolean);
}
function selectedCandidates() {
  if (state.featureMode === "imageUpscale") return upscaleConfiguration.selectedWorkflows();
  return state.featureMode === "imageOutpaint" ? outpaintConfiguration.selectedWorkflows() : selectedModels();
}
function sampleCount() { return sampleLibrary.sampleCount(); }
function postUpscaleIssue() { if (state.featureMode === "housePlanLayout") return null; return betaPostUpscaleUnavailableReason({ featureMode: state.featureMode, models: selectedModels(), resolution: elements.resolutionSelect.value, sources: state.featureMode === "free" && state.freeReference ? [state.freeReference] : sampleLibrary.sourceDimensions(), refinedLighting: refinedRenderConfiguration.snapshot() }); }
function runCount() {
  return sampleCount() * selectedCandidates().length
    * (state.featureMode === "refinedModel" ? refinedRenderConfiguration.selections().length
      : state.featureMode === "effectBeautification" ? effectBeautificationControls.selections().length
      : state.featureMode === "panoramaEnhancement" ? Math.max(1, panoramaLighting.getSelections().length) : 1);
}
function showStatus(message, { error = false, ready = false } = {}) {
  elements.betaConnectionStatus.textContent = message;
  elements.betaConnectionStatus.classList.toggle("ready", ready);
  elements.betaConnectionStatus.classList.toggle("error", error);
}
async function readImage(file, { previewOnly = false } = {}) {
  if (!file || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    throw new Error(`${file?.name || "文件"} 不是 PNG、JPEG 或 WebP`);
  }
  if (file.size > MAX_IMAGE_BYTES) throw new Error(`${file.name} 超过 8MB`);
  if (previewOnly) {
    const previewUrl = URL.createObjectURL(file);
    try {
      return { file, name: file.name, size: file.size, type: file.type, previewUrl,
        ...await readImageDimensions(previewUrl, file.name), lastModified: file.lastModified };
    } catch (error) {
      URL.revokeObjectURL(previewUrl);
      throw error;
    }
  }
  const input = await readFileAsInput(file);
  return {
    ...input,
    ...await readImageDimensions(input.dataUrl, file.name),
    lastModified: file.lastModified,
  };
}
function renderSingleReference(key, list, dropZone) {
  const images = state[key] ? [state[key]] : [];
  renderImagePreviews(list, images, {
    onRemove: () => {
      state[key] = null;
      renderSingleReference(key, list, dropZone);
      if (key === "styleReference") designConfiguration.referenceChanged();
      renderRunSummary();
      saveConfiguration();
    },
    replaceEnabled: images.length === 1,
  });
  dropZone.classList.toggle("hidden", images.length === 1);
}
function renderReferenceInputs() {
  renderSingleReference("styleReference", elements.styleReferenceList, elements.styleReferenceDropZone);
  renderSingleReference("freeReference", elements.freeReferenceList, elements.freeReferenceDropZone);
}
function renderRunSummary() {
  housePlanConfiguration.decorateSamples();
  elements.betaFeatureSelect.disabled = sampleLibrary.isBusy();
  const total = runCount();
  const samples = sampleCount();
  const outpaint = state.featureMode === "imageOutpaint";
  const upscale = state.featureMode === "imageUpscale";
  const models = selectedCandidates().length;
  const candidateLabel = outpaint || upscale ? "工作流" : "模型";
  elements.runSummary.textContent = samples && models
    ? state.featureMode === "refinedModel"
      ? betaRefinedLightingRunSummary({ selections: refinedRenderConfiguration.selections(), samples, models })
      : state.featureMode === "effectBeautification" ? `${samples} 个样本 × ${effectBeautificationControls.selections().length} 种光影 × ${models} 个模型 = ${total} 张结果`
      : state.featureMode === "panoramaEnhancement" && panoramaLighting.getSelections().length > 1
        ? `${samples} 个样本 × ${models} 个模型 × ${panoramaLighting.getSelections().length} 种光影 = ${total} 张结果`
      : `${samples} 个样本 × ${models} 个${candidateLabel} = ${total} 张结果`
    : samples ? `请选择${upscale ? "超分工作流" : outpaint ? "扩图工作流" : "出图模型"}` : "请选择样本集";
  const failed = state.job?.status === "failed";
  elements.newBatchButton.classList.toggle("hidden", !failed || state.submitting);
  elements.runHint.textContent = failed ? "仅重试失败项，已成功结果保留" : "结果自动同步飞书";
  const monitoredTotal = Number(state.job?.total) || total;
  elements.monitorBatchSummary.textContent = state.job
    ? `${monitoredTotal} 张结果`
    : total ? `预计 ${total} 张结果` : "尚未开始";
  if (!state.job) {
    renderProgress(elements.generationProgressTrack, elements.generationProgressBar, elements.generationProgressCount, 0, total);
    renderProgress(elements.jobProgressTrack, elements.jobProgressBar, elements.jobProgressCount, 0, total);
  }
  const running = state.job?.status === "running" || state.submitting;
  const needsPromptAgent = ["whiteModel", "emptyRoom", "roomRenovation", "styleTransfer"].includes(state.featureMode);
  const selectedAgent = state.agentAccess.get(elements.promptAgentModelSelect.value);
  const agentReady = !needsPromptAgent || (state.agentAccessChecked && selectedAgent?.selectable);
  const effectPromptKey = FEATURE_COPY[state.featureMode].promptConfig;
  const effectReady = !effectPromptKey || state.featureMode === "panoramaEnhancement" && !panoramaLighting.requiresOriginalPrompt()
    || state.featureMode === "effectBeautification" && !effectBeautificationControls.requiresOriginalPrompt()
    || state.stylesConfig?.[effectPromptKey]?.available;
  const targetIssue = housePlanConfiguration.reason() || betaFeatureUnavailableReason(state.featureMode, state.betaConfig) || postUpscaleIssue()
    || (["styleTransfer", "roomRenovation"].includes(state.featureMode) ? designConfiguration.unavailableReason() : null);
  const targetReady = !targetIssue;
  const lightingIssue = state.featureMode === "refinedModel" ? refinedRenderConfiguration.validation()
    : state.featureMode === "effectBeautification" ? effectBeautificationControls.validation()
    : state.featureMode === "panoramaEnhancement" ? generationFeatureUnavailableReason(state.featureMode, state.catalog.generationFeatureModes, selectedModels()) || panoramaLighting.validation() : null;
  const workflowConfiguration = upscale ? upscaleConfiguration : outpaintConfiguration;
  const workflowsReady = !(outpaint || upscale) || workflowConfiguration.ready();
  if (upscale) showStatus(workflowsReady ? "ComfyUI 已就绪" : "超分工作流未就绪", { ready: workflowsReady });
  if (!failed && !agentReady && !running) {
    elements.runHint.textContent = state.agentAccessChecked
      ? "提示词模型不可用，请选择当前 Key 已开放的模型"
      : "正在检测提示词模型权限";
  }
  if (!failed && !targetReady && agentReady && !running) elements.runHint.textContent = targetIssue;
  if (!failed && !workflowsReady && !running) elements.runHint.textContent = workflowConfiguration.unavailableReason() || `请选择${upscale ? "超分" : "扩图"}工作流`;
  if (!failed && lightingIssue && !running) elements.runHint.textContent = lightingIssue;
  elements.runButton.disabled = running || state.submitting || (!failed && ((!outpaint && !upscale && !state.connected)
    || !sampleLibrary.isReady()
    || total < 1
    || !agentReady
    || !effectReady
    || !targetReady
    || Boolean(lightingIssue)
    || !workflowsReady));
  elements.runButtonLabel.textContent = running ? "RUNNING…" : failed ? "RETRY" : "START";
  elements.runButton.setAttribute("aria-busy", String(running));
  elements.runButton.setAttribute("aria-label", running ? "批量运行中" : failed ? "仅重试当前批次的失败项" : "开始批量运行");
  elements.betaGenerationActions.classList.toggle("is-busy", running);
}
function modelAvailable(model) {
  if (!state.modelAccessChecked) return true;
  const access = state.modelAccess.get(model.key);
  return access ? access.available : model.provider === "comfyui";
}
function renderModels() {
  if (state.featureMode === "housePlanLayout" && !housePlanConfiguration.configured()) { renderOutputControls(); return; }
  state.selectedModelKeys = refinedModelSelection.forFeature(state.featureMode, state.selectedModelKeys, state.catalog.models, state.modelAccessChecked ? [...state.modelAccess.values()] : undefined);
  if (["imageOutpaint", "imageUpscale"].includes(state.featureMode)) { renderOutputControls(); return; }
  const runnable = state.catalog.models.filter((model) => modelAvailable(model) && housePlanConfiguration.selectable(model));
  const selectable = runnable.filter((model) => betaModelSelectable(model, state.featureMode));
  state.selectedModelKeys = state.selectedModelKeys.filter((key) =>
    selectable.some((model) => model.key === key));
  if (!state.selectedModelKeys.length && selectable[0] && state.featureMode !== "refinedModel") {
    const defaultModel = selectable.find((model) => model.key === (state.featureMode === "housePlanLayout" ? "gptImage25Sunburst" : DEFAULT_BETA_MODEL_KEY))
      || selectable[0];
    state.selectedModelKeys = [defaultModel.key];
  }
  modelSelection.render(runnable, state.selectedModelKeys);
  renderOutputControls();
}
function renderOutputControls() {
  if (state.featureMode === "imageUpscale") { upscaleConfiguration.render(); renderRunSummary(); return; }
  if (state.featureMode === "imageOutpaint") {
    outpaintConfiguration.render();
    renderRunSummary();
    return;
  }
  if (state.featureMode === "housePlanLayout") { elements.negativePromptField.classList.add("hidden"); renderRunSummary(); return; }
  const models = selectedModels();
  refinedRenderConfiguration.setModels(models);
  const sizes = betaSizeOptions({ models, featureMode: state.featureMode, refinedLighting: refinedRenderConfiguration.snapshot(),
    currentRatio: elements.ratioSelect.value, currentResolution: elements.resolutionSelect.value });
  fillSelect(elements.ratioSelect, sizes.ratioOptions, sizes.ratio);
  elements.ratioSelect.disabled = sizes.ratioDisabled;
  fillSelect(elements.resolutionSelect, sizes.resolutionOptions, sizes.resolution);
  const hasQuality = models.some((model) => model.qualityOptions.length > 0);
  elements.qualityField.classList.toggle("hidden", !hasQuality);
  const qualities = [...new Set(models.flatMap((model) => model.qualityOptions))];
  fillSelect(elements.qualitySelect, qualities.map((value) => ({
    label: { auto: "自动", low: "低", medium: "中", high: "高", xhigh: "极高", max: "最高" }[value] || value,
    value,
  })), qualities.includes(elements.qualitySelect.value)
    ? elements.qualitySelect.value
    : models[0]?.defaultQuality || qualities[0]);
  negativePrompt.render(models.map(model => model.key), state.featureMode);
  elements.negativePromptField.classList.toggle("hidden",
    ["panoramaEnhancement", "textureEnhancement"].includes(state.featureMode) || !models.some((model) => model.provider === "comfyui") || state.featureMode === "refinedModel" && isLightingReference(refinedRenderConfiguration.snapshot()),
  );
  renderRunSummary();
}
function renderDesignConfig() { designConfiguration.render(); }
function renderFeature() {
  housePlanConfiguration.render();
  const copy = FEATURE_COPY[state.featureMode];
  elements.betaFeatureSelect.value = state.featureMode;
  const free = state.featureMode === "free";
  const outpaint = state.featureMode === "imageOutpaint";
  const upscale = state.featureMode === "imageUpscale";
  const design = ["whiteModel", "emptyRoom", "roomRenovation", "styleTransfer"].includes(state.featureMode);
  const effect = Boolean(copy.promptConfig);
  const refined = state.featureMode === "refinedModel";
  elements.taskSettingsSection.classList.toggle("hidden", outpaint || upscale);
  elements.outpaintFields.classList.toggle("hidden", !outpaint);
  elements.upscaleFields.classList.toggle("hidden", !upscale);
  elements.ordinaryOutputFields.classList.toggle("hidden", outpaint || upscale);
  elements.ordinaryOutputFields.classList.toggle("is-house-plan", state.featureMode === "housePlanLayout");
  elements.outputSettingsHint.textContent = state.featureMode === "housePlanLayout" ? "沿用户型布局默认参数 · 可多选模型对比" : upscale ? "对比超分工作流 · 保持原图比例" : outpaint ? "对比不同扩图工作流 · 固定 2K" : "可多选全部可用模型";
  elements.commonPromptField.classList.toggle("hidden", free || effect || outpaint || upscale);
  if (!upscale) showStatus(state.connected ? "服务已连接" : "请先连接 API", { ready: state.connected });
  elements.designFields.classList.toggle("hidden", !design);
  elements.styleReferenceField.classList.toggle("hidden", !design);
  elements.emptyRoomFields.classList.add("hidden");
  elements.effectFields.classList.toggle("hidden", state.featureMode !== "effectEnhancement");
  elements.effectBeautificationFields.classList.toggle("hidden", state.featureMode !== "effectBeautification");
  panoramaLighting.setVisible(state.featureMode === "panoramaEnhancement");
  elements.refinedPromptField.classList.toggle("hidden", !refined);
  elements.freeReferenceField.classList.toggle("hidden", !free);
  elements.sourceFilesTitle.textContent = copy.source;
  elements.sourceFilesDropLabel.textContent = `添加或拖入${copy.source}`;
  elements.sourceFilesInput.setAttribute("aria-label", `添加${copy.source}`);
  elements.sourceFilesHint.textContent = `PNG / JPEG / WebP · 单张 8MB · 逐张上传${state.featureMode === "panoramaEnhancement" ? " · 必须为 2:1 全景图" : ""}`;
  elements.commonPromptLabel.textContent = copy.prompt;
  elements.configStatus.textContent = design ? "读取设计配置" : effect ? "使用当前上架 Prompt" : refined ? "读取精模 Prompt" : "工作台同源";
  if (design) renderDesignConfig();
  if (effect) {
    const effectConfig = state.stylesConfig?.[copy.promptConfig];
    elements.configStatus.textContent = state.featureMode === "effectBeautification" && !effectBeautificationControls.requiresOriginalPrompt()
      ? `已选 ${effectBeautificationControls.selections().length} 种光影` : effectConfig?.available
      ? `Prompt v${effectConfig.version}` : `${copy.label} Prompt 不可用`;
  }
  refinedRenderConfiguration.render();
  renderReferenceInputs();
  renderRunSummary();
  renderModels();
}
function currentCases() {
  return sampleLibrary.currentCases({
    commonPrompt: ["imageOutpaint", "imageUpscale", "textureEnhancement"].includes(state.featureMode) ? "" : elements.commonPromptInput.value.trim(),
    freeReference: state.freeReference });
}
function designSettings() { return designConfiguration.settings(); }
function assertFeatureConfig() {
  const unavailableReason = housePlanConfiguration.reason() || betaFeatureUnavailableReason(state.featureMode, state.betaConfig) || postUpscaleIssue()
    || (state.featureMode === "housePlanLayout" ? null : generationFeatureUnavailableReason(state.featureMode, state.catalog.generationFeatureModes, selectedModels()));
  if (unavailableReason) throw new Error(unavailableReason);
  sampleLibrary.assertRoomTypes();
  if (state.featureMode === "refinedModel") refinedRenderConfiguration.validate();
  if (state.featureMode === "effectBeautification" && effectBeautificationControls.validation()) throw new Error(effectBeautificationControls.validation());
  if (state.featureMode === "panoramaEnhancement" && panoramaLighting.validation()) throw new Error(panoramaLighting.validation());
  const effectCopy = FEATURE_COPY[state.featureMode];
  if (effectCopy.promptConfig && !(state.featureMode === "panoramaEnhancement" && !panoramaLighting.requiresOriginalPrompt())
    && !(state.featureMode === "effectBeautification" && !effectBeautificationControls.requiresOriginalPrompt())
    && !state.stylesConfig?.[effectCopy.promptConfig]?.available) {
    throw new Error(`${effectCopy.label} Prompt 不可用`);
  }
  if (state.featureMode === "panoramaEnhancement" && panoramaLighting.requiresOriginalPrompt()
    && (!Number.isInteger(state.stylesConfig?.panoramaEnhancementPrompt?.version)
      || state.stylesConfig.panoramaEnhancementPrompt.version < 1)) {
    throw new Error("全景图美化 Prompt 版本不可用");
  }
}
function buildItems(startedAt = new Date()) {
  assertFeatureConfig();
  const cases = currentCases();
  if (state.featureMode === "housePlanLayout") return housePlanConfiguration.buildItems(cases, selectedModels(), startedAt);
  if (state.featureMode === "imageOutpaint") return outpaintConfiguration.buildItems(cases, startedAt);
  if (state.featureMode === "imageUpscale") return upscaleConfiguration.buildItems(cases, startedAt);
  const models = state.featureMode === "refinedModel"
    ? generationItemsForSelection(selectedModels(), 1, refinedRenderConfiguration.selections())
    : state.featureMode === "effectBeautification" ? beautificationItemsForSelection(selectedModels(), effectBeautificationControls.selections())
    : state.featureMode === "panoramaEnhancement" ? panoramaItemsForSelection(selectedModels(), 1, panoramaLighting.getSelections()) : selectedModels();
  if (!cases.length) throw new Error("请先添加批量样本");
  if (!models.length) throw new Error("请选择出图模型");
  if (state.featureMode === "free"
    && models.some((model) => model.requiresReferenceImage)
    && !state.freeReference) {
    throw new Error("当前所选模型需要自由生图参考图");
  }
  const ratioAuto = elements.ratioSelect.value === "auto";
  return cases.flatMap((currentCase, caseIndex) => models.map((model, modelIndex) => {
    const input = {
      featureMode: state.featureMode === "roomRenovation" ? "emptyRoom" : state.featureMode,
      modelKey: model.key,
      negativePrompt: state.featureMode === "textureEnhancement" ? "" : elements.negativePromptInput.value.trim(),
      outputFormat: "png",
      prompt: state.featureMode === "panoramaEnhancement" ? panoramaLighting.requestFields().prompt : FEATURE_COPY[state.featureMode].promptConfig ? "" : currentCase.prompt,
      quality: elements.qualitySelect.value,
      ratio: ratioAuto ? model.defaultRatio : elements.ratioSelect.value,
      ratioMode: ratioAuto ? "auto" : "manual",
      referenceImages: currentCase.referenceImages,
      resolution: elements.resolutionSelect.value || model.defaultResolution,
      ...(state.featureMode === "textureEnhancement" ? { textureEnhancementPromptVersion: state.stylesConfig.textureEnhancementPrompt.version, textureEnhancementPromptSha256: state.stylesConfig.textureEnhancementPrompt.sha256 } : {}),
      ...(state.featureMode === "effectEnhancement" ? {
        effectTime: elements.effectTimeSelect.value,
        effectWeather: elements.effectWeatherSelect.value,
      } : {}),
      ...(state.featureMode === "effectBeautification" ? beautificationSettingsForSelection(model.beautificationSelection, state.stylesConfig?.effectBeautificationPrompt?.version) : {}),
      ...(state.featureMode === "panoramaEnhancement" ? {
        panoramaLighting: panoramaLightingRequestSelection(model.panoramaLightingSelection || panoramaLighting.requestFields().panoramaLighting),
        panoramaPromptVersion: state.stylesConfig?.panoramaEnhancementPrompt?.version,
      } : {}),
      ...(state.featureMode === "refinedModel" ? refinedRenderConfiguration.settings(model.lightingSelection) : {}),
      ...(["whiteModel", "emptyRoom", "roomRenovation", "styleTransfer"].includes(state.featureMode) ? designSettings() : {}),
      ...(isEmptyRoomDesign(state.featureMode) ? {
        roomType: currentCase.roomType,
        ...(currentCase.roomType === "其他"
          ? { roomTypeDetail: currentCase.roomTypeDetail.trim() }
          : {}),
      } : {}),
    };
    const adapted = adaptGenerationInputForModel(input, model, {
      featureMode: state.featureMode,
      sourceImage: currentCase.referenceImages[0] || null,
    });
    if (state.featureMode === "panoramaEnhancement") adapted.ratioMode = "original";
    return {
      attempt: 1,
      caseId: currentCase.caseId,
      sampleId: currentCase.caseId,
      input: adapted,
      label: `${currentCase.label} · ${model.label}`,
      modelLabel: model.modelLabel || model.label,
      runId: createBetaRunId({
        modelKey: model.key,
        sequence: (caseIndex * models.length) + modelIndex + 1,
        startedAt,
      }),
    };
  }));
}

function renderJob(job) {
  state.job = job;
  renderBetaWarnings({ container: elements.monitorWarnings, count: elements.monitorWarningsCount, job });
  const running = job?.status === "running";
  elements.jobStatus.textContent = running
    ? "运行中"
    : job?.status === "success"
      ? "已完成"
      : job?.status === "failed"
        ? "失败"
        : "待运行";
  elements.jobStatus.dataset.state = running
    ? "running"
    : job?.status === "success" ? "success" : job?.status === "failed" ? "error" : "idle";
  if (job) {
    const completed = Number(job.completed) || 0;
    const total = Number(job.total) || 0;
    const generated = Number(job.stages?.generated) || (job.status === "success" ? total : 0);
    const synced = Number(job.stages?.synced) || completed;
    elements.jobProgressLabel.textContent = job.status === "failed"
      ? `${Math.max(total - synced, 0)} 项未完成，详见下方预警。`
      : job.status === "success"
        ? "全部结果已生成并同步飞书。"
        : job.message || "处理中";
    renderProgress(elements.generationProgressTrack, elements.generationProgressBar, elements.generationProgressCount, generated, total);
    renderProgress(elements.jobProgressTrack, elements.jobProgressBar, elements.jobProgressCount, synced, total);
  } else {
    elements.jobProgressLabel.textContent = "运行后，这里会持续显示生成与同步进度。";
    renderProgress(elements.generationProgressTrack, elements.generationProgressBar, elements.generationProgressCount, 0, 0);
    renderProgress(elements.jobProgressTrack, elements.jobProgressBar, elements.jobProgressCount, 0, 0);
  }
  renderRunSummary();
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function followJob(jobId) {
  let job;
  do {
    await delay(800);
    ({ job } = await api(`/api/beta/jobs/${encodeURIComponent(jobId)}`));
    renderJob(job);
  } while (job.status === "running");
  return job;
}

async function startBatch(previousJob = null) {
  if (previousJob?.status === "failed" && previousJob.jobId) {
    const retryUnavailable = generationFeatureUnavailableReason(previousJob.featureMode, state.catalog.generationFeatureModes, state.catalog.models);
    if (retryUnavailable) throw new Error(retryUnavailable);
    const { job } = await api("/api/beta/jobs", {
      body: JSON.stringify({ retryOfJobId: previousJob.jobId, jobId: `beta-${crypto.randomUUID()}` }),
      method: "POST",
    });
    sessionStorage.setItem(JOB_STORAGE_KEY, job.jobId);
    renderJob(job);
    return followJob(job.jobId);
  }
  saveConfiguration();
  const startedAt = new Date();
  const batchId = `BETA-${crypto.randomUUID().replaceAll("-", "")}`;
  const jobId = `beta-${crypto.randomUUID()}`;
  const packed = packBatchAssets(buildItems(startedAt), state.featureMode);
  const { job } = await api("/api/beta/jobs", {
    body: JSON.stringify({
      ...packed,
      batchId,
      featureMode: state.featureMode,
      jobId,
      sampleSetId: sampleLibrary.activeSampleSetId(),
      testTime: formatBetaTestTime(startedAt),
    }),
    method: "POST",
  });
  sessionStorage.setItem(JOB_STORAGE_KEY, jobId);
  renderJob(job);
  await followJob(jobId);
}

async function restoreJob() {
  const jobId = sessionStorage.getItem(JOB_STORAGE_KEY);
  if (!jobId) return;
  try {
    const { job } = await api(`/api/beta/jobs/${encodeURIComponent(jobId)}`);
    renderJob(job);
    if (job.status === "running") await followJob(jobId);
  } catch (error) {
    reportUploadError(error);
  }
}

function reportUploadError(error) {
  if (!state.job?.jobId) state.job = null;
  renderBetaWarnings({ container: elements.monitorWarnings, count: elements.monitorWarningsCount, job: state.job, error: error.message });
  elements.jobStatus.textContent = error.message;
  elements.jobStatus.dataset.state = "error";
  elements.jobProgressLabel.textContent = state.job?.jobId
    ? `请求失败：${error.message}。可刷新页面继续查看任务状态。` : `配置未就绪：${error.message}`;
  renderRunSummary();
}

async function setSingleReference(fileList, key) {
  try {
    const file = Array.from(fileList)[0];
    if (!file) return;
    const next = await readImage(file);
    state[key] = next;
    renderReferenceInputs();
    if (key === "styleReference") designConfiguration.referenceChanged();
    renderRunSummary();
    saveConfiguration();
  } catch (error) {
    reportUploadError(error);
  }
}

function bindEvents() {
  sampleLibrary.bind();
  configuration.bindLifecycle();
  elements.betaFeatureSelect.addEventListener("change", () => {
    const featureMode = elements.betaFeatureSelect.value;
    if (sampleLibrary.isBusy() || !Object.hasOwn(FEATURE_COPY, featureMode) || featureMode === state.featureMode) return;
    state.featureMode = featureMode;
    if (featureMode === "housePlanLayout") { state.selectedModelKeys = ["gptImage25Sunburst"]; void housePlanConfiguration.refresh(); }
    renderFeature();
    sampleLibrary.setFeatureMode(
      state.featureMode,
      state.sampleSetIds[state.featureMode],
    ).then(saveConfiguration).catch(reportUploadError);
  });
  for (const [input, key, list, dropZone] of [
    [elements.styleReferenceInput, "styleReference", elements.styleReferenceList, elements.styleReferenceDropZone],
    [elements.freeReferenceInput, "freeReference", elements.freeReferenceList, elements.freeReferenceDropZone],
  ]) {
    bindImageDrop({
      canReplace: () => Boolean(state[key]),
      dropZone,
      input,
      list,
      onFiles: (files) => setSingleReference(files, key),
    });
  }
  elements.renderModeSelect.addEventListener("change", () => {
    renderDesignConfig();
    renderRunSummary();
    saveConfiguration();
  });
  elements.roomTypeSelect.addEventListener("change", () => {
    elements.roomTypeDetailField.classList.toggle("hidden", elements.roomTypeSelect.value !== "其他");
    saveConfiguration();
  });
  elements.ratioSelect.addEventListener("change", () => {
    renderOutputControls();
    saveConfiguration();
  });
  for (const input of [
    elements.commonPromptInput,
    elements.negativePromptInput,
    elements.roomTypeDetailInput,
  ]) input.addEventListener("input", saveConfiguration);
  for (const select of [
    elements.effectTimeSelect,
    elements.effectWeatherSelect,
    elements.promptAgentModelSelect,
    elements.promptAgentVersionSelect,
    elements.qualitySelect,
    elements.refinedPromptSelect,
    elements.resolutionSelect,
    elements.styleSelect,
  ]) select.addEventListener("change", () => {
    if (select === elements.styleSelect) renderDesignConfig();
    renderRunSummary(); saveConfiguration();
  });
  elements.newBatchButton.addEventListener("click", () => {
    if (state.job?.status === "running" || state.submitting) return;
    sessionStorage.removeItem(JOB_STORAGE_KEY);
    renderJob(null);
  });
  elements.betaForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (state.job?.status === "running" || state.submitting) return;
    const previousJob = state.job;
    state.submitting = true;
    renderRunSummary();
    if (previousJob?.status !== "failed") renderJob({
      completed: 0,
      message: "正在创建任务…",
      stages: { generated: 0, synced: 0 },
      status: "running",
      total: runCount(),
    });
    try {
      await startBatch(previousJob);
    } catch (error) {
      reportUploadError(error);
    } finally {
      state.submitting = false;
      renderRunSummary();
    }
  });
}

async function load() {
  fillSelect(elements.betaFeatureSelect, Object.entries(FEATURE_COPY).map(([value, copy]) => ({
    label: copy.label, value,
  })), state.featureMode);
  bindEvents();
  try {
    const [catalog, session, betaConfig] = await Promise.all([
      api("/api/catalog"),
      api("/api/session"),
      api("/api/beta/config"),
    ]);
    state.catalog = catalog;
    panoramaLighting.setCapabilities(catalog.generationFeatureCapabilities);
    effectBeautificationControls.setCapabilities(catalog.generationFeatureCapabilities);
    state.connected = session.connected === true;
    state.betaConfig = betaConfig;
    if (state.featureMode === "housePlanLayout") await housePlanConfiguration.refresh();
    outpaintConfiguration.configure(betaConfig.outpaint);
    upscaleConfiguration.configure(betaConfig.upscale);
    elements.monitorBaseLink.href = betaConfig.baseUrl;
    fillSelect(elements.roomTypeSelect, [
      { label: "请选择", value: "" },
      ...catalog.emptyRoomTypes.map((value) => ({ label: value, value })),
    ]);
    renderPromptAgentModels();
    showStatus(state.connected ? "检测模型中" : "请先连接 API", {
      error: !state.connected,
    });
    renderModels();
    renderFeature();
    configuration.restore();
    configuration.markReady();
    await sampleLibrary.load(
      state.featureMode,
      state.sampleSetIds[state.featureMode],
    );
    saveConfiguration();

    const stylesRequest = api("/api/styles");
    const [stylesResult, accessResult] = await Promise.allSettled([
      stylesRequest,
      state.connected
        ? api("/api/check-models", { method: "POST" })
        : Promise.resolve(null),
    ]);
    if (stylesResult.status === "fulfilled") {
      state.stylesConfig = stylesResult.value;
      panoramaLighting.configure(state.stylesConfig.refinedLighting);
      effectBeautificationControls.setLightingConfig(state.stylesConfig.refinedLighting);
      renderFeature();
    } else {
      elements.configStatus.textContent = "配置读取失败";
    }
    if (accessResult.status === "fulfilled" && accessResult.value) {
      const access = accessResult.value;
      state.modelAccess = new Map(access.models.map((model) => [model.key, model]));
      state.modelAccessChecked = true;
      state.agentAccess = new Map(access.agentModels.map((model) => [model.key, model]));
      state.agentAccessChecked = true;
      showStatus("服务已连接", { ready: true });
      renderModels();
      renderPromptAgentModels();
    } else if (state.connected) {
      showStatus("模型检测失败，可稍后刷新", { error: true });
    }
    configuration.restore();
    saveConfiguration();
    await restoreJob();
  } catch (error) {
    showStatus(error.message, { error: true });
    elements.configStatus.textContent = "配置读取失败";
    renderRunSummary();
  }
}

load();

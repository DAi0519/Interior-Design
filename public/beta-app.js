/**
 * [INPUT]: 依赖后置KS目录/逐样本输入门禁与身份冻结、共享美化混合多选/精模光影模式、Beta功能目录与平面图适配器、旧房设计配置/空房判定、Flux负向草稿、扩图/超分/多角度、持久配置、样本库/预警/Run ID和API工具
 * [OUTPUT]: 批量跑图初始无任务，显式选择后加载配置和样本草稿；原页连接中心刷新额度与权限；任务监控按阶段显示，失败时就近恢复
 * [POS]: public 的批量跑图配置与任务监控编排器，把跨图像功能复用、按目标功能校验的样本资产交给 beta-sample-library，并把生成/同步/连接异常交给 beta-results；飞书保持结果真源
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createBetaHousePlanConfiguration } from "./beta-house-plan.js?v=3";
import { createBetaFloorPlanCameraConfiguration } from "./beta-floor-plan-camera.js?v=12";
import { isLightingReference } from "./refined-flux-reference.js";
import { beautificationItemsForSelection, beautificationSettingsForSelection, generationItemsForSelection, panoramaItemsForSelection, panoramaLightingRequestSelection } from "./generation-task-request.js";
import { generationFeatureUnavailableReason } from "./model-capabilities.js";
import "./custom-select.js?v=9";
import { DEFAULT_BETA_MODEL_KEY, readBetaPageState, readBetaTaskDraft } from "./beta-page-state.js?v=13";
import { createBetaConfigurationPersistence } from "./beta-configuration.js?v=13";
import { BETA_FEATURE_COPY as FEATURE_COPY, assertBetaImageSource, betaFeatureUnavailableReason, betaModelSelectable, betaPostUpscaleUnavailableReason, betaSizeOptions } from "./beta-model-rules.js?v=9";
import { mountBetaTaskDirectory } from "./beta-task-directory.js";
import { bindBetaConnection, renderBetaPromptAgentModels } from "./beta-connection.js?v=2";
import { bindFluxNegativePrompt } from "./flux-negative-prompt.js";
import { isEmptyRoomDesign } from "./room-renovation.js";
import { createBetaOutpaintConfiguration } from "./beta-outpaint.js?v=1";
import { createBetaMultiAngleConfiguration } from "./beta-multi-angle.js";
import { createBetaUpscaleConfiguration } from "./beta-upscale.js?v=3";
import { createBetaDesignConfiguration } from "./beta-design-config.js";
import { betaRefinedLightingRunSummary, createBetaRefinedRenderConfiguration } from "./beta-refined-render.js";
import { createRefinedModelSelection } from "./refined-model-controls.js";
import { bindPanoramaLightingControls } from "./panorama-lighting-controls.js";
import { bindEffectBeautificationControls } from "./effect-beautification-controls.js?v=2";
import { bindModelMultiSelect } from "./model-multi-select.js?v=5";
import { packBatchAssets } from "./beta-assets.js?v=2";
import { bindImageDrop, readBetaImage as readImage, renderImagePreviews } from "./beta-upload.js";
import { createBetaSampleLibrary } from "./beta-sample-library.js?v=10";
import { fillBetaSelect as fillSelect, renderBetaMonitor } from "./beta-results.js?v=3";
import { createBetaRunId, formatBetaTestTime } from "./beta-run-id.js?v=3";
import { adaptGenerationInputForModel } from "./generation-batch.js";
import { api } from "./workbench-utils.js";
const JOB_STORAGE_KEY = "canvas-lab:beta-run-job";
const restoredPageState = readBetaPageState(localStorage);
const refinedModelSelection = createRefinedModelSelection({ saved: readBetaTaskDraft(restoredPageState, "refinedModel").refinedModelSelection });
const referenceDrafts = new Map();
const elements = Object.fromEntries([
  "betaConnectionStatus", "featureModeList", "betaForm", "betaEmpty",
  "betaGenerationActions", "betaRunBar", "betaRunMetaActions",
  "commonPromptField", "commonPromptInput", "commonPromptLabel",
  "configStatus", "designFields", "effectFields", "effectTimeSelect", "effectBeautificationFields",
  "effectWeatherSelect", "emptyRoomFields", "freeSharedPromptField", "freeSharedPromptInput",
  "freeReferenceDropZone", "freeReferenceField",
  "freeReferenceInput", "freeReferenceList", "generationProgressBar",
  "generationProgressCount", "generationProgressTrack", "jobProgress",
  "jobMonitorTitle", "jobProgressBar", "jobProgressCount", "jobProgressLabel", "jobProgressTrack",
  "jobStatus", "modelOptions", "monitorBaseLink", "monitorBatchSummary",
  "monitorWarnings", "monitorWarningsCount", "monitorWarningsSection", "monitorRetryActions", "monitorRefresh",
  "multiAngleFields", "multiAngleModelField", "multiAngleModelOptions", "multiAngleAzimuth", "multiAngleElevation",
  "multiAngleAzimuthValue", "multiAngleElevationValue", "multiAngleTopDownButton", "multiAngleDistance",
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
  "sourceFilesDropLabel", "sourceFilesDropZone", "sourceFilesInput", "sourceFilesTitle", "sourceFilesHint",
  "styleField", "styleReferenceDropZone", "styleReferenceField",
  "styleReferenceInput", "styleReferenceList", "styleSelect",
].map((id) => [id, document.querySelector(`#${id}`)]));
const renderTaskDirectory = mountBetaTaskDirectory(elements.featureModeList, FEATURE_COPY);
const state = {
  betaConfig: null,
  catalog: { agentModels: [], emptyRoomTypes: [], models: [] },
  connected: false,
  featureMode: null,
  taskDirectoryReady: false,
  switchingTask: false,
  freeReference: null,
  job: null,
  submitting: false,
  modelAccess: new Map(),
  modelAccessChecked: false,
  agentAccess: new Map(),
  agentAccessChecked: false,
  sampleSetIds: { ...restoredPageState.sampleSetIds },
  selectedModelKeys: [],
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
    const supported = betaModelSelectable(model, state.featureMode);
    const available = modelAvailable(model);
    return { label: model.label, selectable: supported && (available || state.selectedModelKeys.includes(model.key)),
      reason: !supported ? "不支持 2:1" : available ? "" : "当前 Key 不可用" };
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
  initialState: readBetaTaskDraft(restoredPageState, "imageOutpaint").outpaint,
  onChange() { renderRunSummary(); saveConfiguration(); },
  onMessage(message) { elements.runHint.textContent = message; },
});
const upscaleConfiguration = createBetaUpscaleConfiguration({
  elements, initialState: readBetaTaskDraft(restoredPageState, "imageUpscale").upscale,
  onChange() { renderRunSummary(); saveConfiguration(); },
  onMessage(message) { elements.runHint.textContent = message; },
});
const multiAngleConfiguration = createBetaMultiAngleConfiguration({
  elements, initialState: readBetaTaskDraft(restoredPageState, "imageMultiAngle").multiAngle,
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
  validateSourceImage: assertBetaImageSource,
  canSave: featureMode => featureMode === "free" ? state.betaConfig?.freeSharedPrompt === true
    : featureMode !== "imageMultiAngle" || !betaFeatureUnavailableReason(featureMode, state.betaConfig),
});
const housePlanConfiguration = createBetaHousePlanConfiguration({ getState: () => state, sampleLibrary, fillSelect,
  onChange() { if (state.featureMode === "housePlanLayout") renderModels(); }, onError: reportUploadError });
const floorPlanCameraConfiguration = createBetaFloorPlanCameraConfiguration({ getState: () => state, getModels: selectedModels,
  sampleLibrary, fillSelect, output: elements, onChange() { if (state.featureMode === "floorPlanCamera") renderModels(); }, onPromptChange: renderRunSummary, onError: reportUploadError });
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
    multiAngle: multiAngleConfiguration.snapshot(),
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
const saveConfiguration = configuration.save;
const renderPromptAgentModels = () => renderBetaPromptAgentModels({ state, elements, fillSelect, renderRunSummary });
const connection = bindBetaConnection({
  api, state, showStatus, renderSummary: renderRunSummary, updateWorkflows,
  renderAccess(options) { renderModels(options); renderPromptAgentModels(); },
});
function updateWorkflows(betaConfig) {
  state.betaConfig = betaConfig;
  outpaintConfiguration.configure(betaConfig.outpaint);
  upscaleConfiguration.configure(betaConfig.upscale);
  multiAngleConfiguration.configure(betaConfig.multiAngle);
  elements.monitorBaseLink.href = betaConfig.baseUrl;
}
function selectedModels() {
  return state.selectedModelKeys
    .map((key) => state.catalog.models.find((model) => model.key === key))
    .filter(Boolean);
}
function selectedCandidates() {
  if (state.featureMode === "imageMultiAngle") return multiAngleConfiguration.selectedModels();
  if (state.featureMode === "imageUpscale") return upscaleConfiguration.selectedWorkflows();
  return state.featureMode === "imageOutpaint" ? outpaintConfiguration.selectedWorkflows() : selectedModels();
}
function generationAccessIssue() {
  const online = selectedCandidates().filter(model => model.provider === "oneapi");
  if (!online.length) return "";
  const denied = online.find(model => state.catalog.models.some(entry => entry.key === model.key) && !modelAvailable(model));
  return state.modelAccessProblem || (denied ? `${denied.label} 当前 Key 不可用，请调整出图模型` : "");
}
function sampleCount() { return sampleLibrary.sampleCount(); }
function postUpscaleIssue() { if (["housePlanLayout", "floorPlanCamera", "imageMultiAngle"].includes(state.featureMode)) return null; return betaPostUpscaleUnavailableReason({ featureMode: state.featureMode, models: selectedModels(), resolution: elements.resolutionSelect.value, sources: sampleLibrary.sourceDimensions(state.freeReference), refinedLighting: refinedRenderConfiguration.snapshot() }); }
function runCount() {
  return sampleCount() * selectedCandidates().length
    * (state.featureMode === "refinedModel" ? refinedRenderConfiguration.selections().length
      : state.featureMode === "effectBeautification" ? effectBeautificationControls.selections().length
      : state.featureMode === "panoramaEnhancement" ? Math.max(1, panoramaLighting.getSelections().length)
      : state.featureMode === "floorPlanCamera" ? floorPlanCameraConfiguration.imageCount() : 1);
}
function showStatus(message, { error = false, ready = false } = {}) {
  elements.betaConnectionStatus.textContent = message;
  elements.betaConnectionStatus.hidden = ready;
  elements.betaConnectionStatus.classList.toggle("error", error);
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
  renderTaskDirectory(state.featureMode, !state.taskDirectoryReady || state.switchingTask || sampleLibrary.isMutating());
  const total = state.featureMode ? runCount() : 0;
  const failed = state.job?.status === "failed";
  const running = state.job?.status === "running" || state.submitting;
  const retryHost = failed ? elements.monitorRetryActions : elements.betaRunBar;
  const newBatchHost = failed ? elements.monitorRetryActions : elements.betaRunMetaActions;
  if (elements.newBatchButton.parentElement !== newBatchHost) newBatchHost.prepend(elements.newBatchButton);
  if (elements.betaGenerationActions.parentElement !== retryHost) retryHost.append(elements.betaGenerationActions);
  elements.monitorRetryActions.hidden = !failed;
  elements.newBatchButton.classList.toggle("hidden", !failed || state.submitting);
  elements.runButtonLabel.textContent = running ? "RUNNING…" : failed ? "RETRY" : "START";
  elements.runButton.setAttribute("aria-busy", String(running));
  elements.runButton.setAttribute("aria-label", running ? "批量运行中" : failed ? "仅重试当前批次的失败项" : "开始批量运行");
  elements.betaGenerationActions.classList.toggle("is-busy", running);
  if (failed || !state.featureMode) {
    elements.runButton.disabled = running || state.switchingTask || !state.job?.jobId || !state.taskDirectoryReady;
  }
  if (!state.featureMode) return;

  housePlanConfiguration.decorateSamples();
  floorPlanCameraConfiguration.decorateSamples();
  elements.freeReferenceField.classList.toggle("hidden", state.featureMode !== "free" || !sampleLibrary.usesTextSamples());
  const samples = sampleCount();
  const outpaint = state.featureMode === "imageOutpaint";
  const upscale = state.featureMode === "imageUpscale";
  const multiAngle = state.featureMode === "imageMultiAngle";
  const models = selectedCandidates().length;
  const candidateLabel = outpaint || upscale ? "工作流" : "模型";
  elements.runSummary.textContent = samples && models
    ? state.featureMode === "refinedModel"
      ? betaRefinedLightingRunSummary({ selections: refinedRenderConfiguration.selections(), samples, models })
      : state.featureMode === "effectBeautification" ? `${samples} 个样本 × ${effectBeautificationControls.selections().length} 种光影 × ${models} 个模型 = ${total} 张结果`
      : state.featureMode === "panoramaEnhancement" && panoramaLighting.getSelections().length > 1
        ? `${samples} 个样本 × ${models} 个模型 × ${panoramaLighting.getSelections().length} 种光影 = ${total} 张结果`
      : `${samples} 个样本 × ${models} 个${candidateLabel}${state.featureMode === "floorPlanCamera" ? ` × ${floorPlanCameraConfiguration.imageCount()} 张` : ""} = ${total} 张结果`
    : samples ? `请选择${upscale ? "超分工作流" : outpaint ? "扩图工作流" : "出图模型"}` : "请选择样本集";
  elements.runHint.textContent = failed ? "仅重试失败项，已成功结果保留" : "结果自动同步飞书";
  const accessIssue = generationAccessIssue();
  const needsPromptAgent = ["whiteModel", "emptyRoom", "roomRenovation", "styleTransfer"].includes(state.featureMode);
  const selectedAgent = state.agentAccess.get(elements.promptAgentModelSelect.value);
  const agentReady = !needsPromptAgent || (state.agentAccessChecked && selectedAgent?.selectable);
  const effectPromptKey = FEATURE_COPY[state.featureMode].promptConfig;
  const effectReady = !effectPromptKey || state.featureMode === "panoramaEnhancement" && !panoramaLighting.requiresOriginalPrompt()
    || state.featureMode === "effectBeautification" && !effectBeautificationControls.requiresOriginalPrompt()
    || state.stylesConfig?.[effectPromptKey]?.available;
  const sharedPromptReady = state.featureMode !== "free" || elements.freeSharedPromptInput.value.trim().length >= 3;
  const targetIssue = betaFeatureUnavailableReason(state.featureMode, state.betaConfig) || housePlanConfiguration.reason() || floorPlanCameraConfiguration.reason() || postUpscaleIssue()
    || (multiAngle ? multiAngleConfiguration.unavailableReason() : null)
    || (["styleTransfer", "roomRenovation"].includes(state.featureMode) ? designConfiguration.unavailableReason() : null);
  const targetReady = !targetIssue;
  const lightingIssue = state.featureMode === "refinedModel" ? refinedRenderConfiguration.validation()
    : state.featureMode === "effectBeautification" ? effectBeautificationControls.validation()
    : state.featureMode === "panoramaEnhancement" ? generationFeatureUnavailableReason(state.featureMode, state.catalog.generationFeatureModes, selectedModels()) || panoramaLighting.validation() : null;
  const workflowConfiguration = upscale ? upscaleConfiguration : outpaintConfiguration;
  const workflowsReady = !(outpaint || upscale) || workflowConfiguration.ready();
  if (upscale) showStatus(workflowsReady ? "ComfyUI 已就绪" : "超分工作流未就绪", { ready: workflowsReady });
  if (multiAngle) showStatus(targetReady ? "多角度已就绪" : "多角度未就绪", { ready: targetReady });
  if (!failed && !agentReady && !running) {
    elements.runHint.textContent = state.agentAccessChecked
      ? "提示词模型不可用，请选择当前 Key 已开放的模型"
      : "正在检测提示词模型权限";
  }
  if (!failed && !targetReady && agentReady && !running) elements.runHint.textContent = targetIssue;
  if (!failed && !workflowsReady && !running) elements.runHint.textContent = workflowConfiguration.unavailableReason() || `请选择${upscale ? "超分" : "扩图"}工作流`;
  if (!failed && lightingIssue && !running) elements.runHint.textContent = lightingIssue;
  if (!failed && !running && targetReady && !sharedPromptReady && samples) elements.runHint.textContent = "请填写整批提示词（至少 3 个字符）";
  if (!failed && !running && accessIssue) elements.runHint.textContent = accessIssue;
  if (!failed) elements.runButton.disabled = running || state.switchingTask || (!outpaint && !upscale && !multiAngle && !state.connected)
    || !sampleLibrary.isReady()
    || total < 1
    || !agentReady || Boolean(accessIssue)
    || !effectReady || !sharedPromptReady
    || !targetReady
    || Boolean(lightingIssue)
    || !workflowsReady;
}
function modelAvailable(model) {
  if (!state.modelAccessChecked) return true;
  const access = state.modelAccess.get(model.key);
  return access ? access.available : model.provider === "comfyui";
}
function renderModels({ permissionsOnly = false } = {}) {
  if (!state.featureMode) return;
  if (state.featureMode === "housePlanLayout" && !housePlanConfiguration.configured()) { renderOutputControls(); return; }
  if (state.featureMode === "floorPlanCamera" && !floorPlanCameraConfiguration.configured()) { renderOutputControls(); return; }
  const keepDraft = state.keepModelDraft && state.selectedModelKeys.length > 0;
  if (!keepDraft && state.featureMode === "refinedModel") state.selectedModelKeys = refinedModelSelection.forFeature(state.featureMode, state.selectedModelKeys, state.catalog.models, state.modelAccessChecked ? [...state.modelAccess.values()] : undefined);
  if (["imageOutpaint", "imageUpscale", "imageMultiAngle"].includes(state.featureMode)) { renderOutputControls(); return; }
  const runnable = state.catalog.models.filter((model) => (modelAvailable(model) || keepDraft && state.selectedModelKeys.includes(model.key)) && housePlanConfiguration.selectable(model) && floorPlanCameraConfiguration.selectable(model));
  const selectable = runnable.filter((model) => betaModelSelectable(model, state.featureMode));
  if (!keepDraft) state.selectedModelKeys = state.selectedModelKeys.filter((key) => selectable.some((model) => model.key === key));
  if (!state.selectedModelKeys.length && selectable[0] && state.featureMode !== "refinedModel") {
    const defaultModel = selectable.find((model) => model.key === (state.featureMode === "housePlanLayout" ? "gptImage25Sunburst" : state.featureMode === "floorPlanCamera" ? "banana21" : DEFAULT_BETA_MODEL_KEY))
      || selectable[0];
    state.selectedModelKeys = [defaultModel.key];
  }
  modelSelection.render(runnable, state.selectedModelKeys);
  if (permissionsOnly && keepDraft) renderRunSummary();
  else renderOutputControls();
}
function renderOutputControls() {
  if (!state.featureMode) return;
  if (state.featureMode === "imageMultiAngle") { renderRunSummary(); return; }
  if (state.featureMode === "imageUpscale") { upscaleConfiguration.render(); renderRunSummary(); return; }
  if (state.featureMode === "imageOutpaint") {
    outpaintConfiguration.render();
    renderRunSummary();
    return;
  }
  if (state.featureMode === "housePlanLayout") { elements.negativePromptField.classList.add("hidden"); renderRunSummary(); return; }
  if (state.featureMode === "floorPlanCamera") { floorPlanCameraConfiguration.renderOutput(); renderRunSummary(); return; }
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
function renderFeature() {
  housePlanConfiguration.render();
  const copy = FEATURE_COPY[state.featureMode];
  const free = state.featureMode === "free";
  const outpaint = state.featureMode === "imageOutpaint";
  const upscale = state.featureMode === "imageUpscale";
  const multiAngle = state.featureMode === "imageMultiAngle";
  const design = ["whiteModel", "emptyRoom", "roomRenovation", "styleTransfer"].includes(state.featureMode);
  const effect = Boolean(copy.promptConfig);
  const refined = state.featureMode === "refinedModel";
  elements.taskSettingsSection.classList.toggle("hidden", outpaint || upscale);
  elements.outpaintFields.classList.toggle("hidden", !outpaint);
  elements.upscaleFields.classList.toggle("hidden", !upscale);
  elements.multiAngleFields.classList.toggle("hidden", !multiAngle);
  elements.multiAngleModelField.classList.toggle("hidden", !multiAngle);
  elements.ordinaryOutputFields.classList.toggle("hidden", outpaint || upscale || multiAngle);
  elements.ordinaryOutputFields.classList.toggle("is-house-plan", state.featureMode === "housePlanLayout");
  elements.outputSettingsHint.textContent = state.featureMode === "housePlanLayout" ? "沿用户型布局默认参数 · 可多选模型对比" : multiAngle ? "同机位对比模型 · 长边最高 2K" : upscale ? "对比超分工作流 · 保持原图比例" : outpaint ? "对比不同扩图工作流 · 固定 2K" : "可多选全部可用模型";
  elements.commonPromptField.classList.toggle("hidden", free || effect || outpaint || upscale || multiAngle);
  floorPlanCameraConfiguration.render();
  if (!upscale && !multiAngle) showStatus(state.connected ? "服务已连接" : "请先连接 API", { ready: state.connected });
  elements.designFields.classList.toggle("hidden", !design);
  elements.styleReferenceField.classList.toggle("hidden", !design);
  elements.emptyRoomFields.classList.add("hidden");
  elements.effectFields.classList.toggle("hidden", state.featureMode !== "effectEnhancement");
  elements.effectBeautificationFields.classList.toggle("hidden", state.featureMode !== "effectBeautification");
  panoramaLighting.setVisible(state.featureMode === "panoramaEnhancement");
  elements.refinedPromptField.classList.toggle("hidden", !refined);
  elements.freeSharedPromptField.classList.toggle("hidden", !free);
  elements.sourceFilesTitle.textContent = copy.source;
  elements.sourceFilesDropLabel.textContent = `添加或拖入${copy.source}`;
  elements.sourceFilesInput.setAttribute("aria-label", `添加${copy.source}`);
  elements.sourceFilesHint.textContent = `PNG / JPEG / WebP · 单张 8MB · 逐张上传${state.featureMode === "panoramaEnhancement" ? " · 必须为 2:1 全景图" : ""}`;
  elements.commonPromptLabel.textContent = copy.prompt;
  elements.configStatus.textContent = design ? "读取设计配置" : effect ? "使用当前上架 Prompt" : refined ? "读取精模 Prompt" : "工作台同源";
  if (design) designConfiguration.render();
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
    commonPrompt: state.featureMode === "free" ? elements.freeSharedPromptInput.value.trim() : ["imageOutpaint", "imageUpscale", "imageMultiAngle", "textureEnhancement"].includes(state.featureMode) ? "" : elements.commonPromptInput.value.trim(),
    freeReference: state.freeReference });
}
function designSettings() { return designConfiguration.settings(); }
function assertFeatureConfig() {
  const unavailableReason = generationAccessIssue() || betaFeatureUnavailableReason(state.featureMode, state.betaConfig) || housePlanConfiguration.reason() || floorPlanCameraConfiguration.reason() || postUpscaleIssue()
    || (["housePlanLayout", "floorPlanCamera", "imageMultiAngle"].includes(state.featureMode) ? null : generationFeatureUnavailableReason(state.featureMode, state.catalog.generationFeatureModes, selectedModels()));
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
  if (state.featureMode === "floorPlanCamera") return floorPlanCameraConfiguration.buildItems(cases, selectedModels(), startedAt);
  if (state.featureMode === "imageOutpaint") return outpaintConfiguration.buildItems(cases, startedAt);
  if (state.featureMode === "imageUpscale") return upscaleConfiguration.buildItems(cases, startedAt);
  if (state.featureMode === "imageMultiAngle") return multiAngleConfiguration.buildItems(cases, startedAt);
  const models = state.featureMode === "refinedModel"
    ? generationItemsForSelection(selectedModels(), 1, refinedRenderConfiguration.selections())
    : state.featureMode === "effectBeautification" ? beautificationItemsForSelection(selectedModels(), effectBeautificationControls.selections())
    : state.featureMode === "panoramaEnhancement" ? panoramaItemsForSelection(selectedModels(), 1, panoramaLighting.getSelections()) : selectedModels();
  if (!cases.length) throw new Error("请先添加批量样本");
  if (!models.length) throw new Error("请选择出图模型");
  if (state.featureMode === "free"
    && models.some((model) => model.requiresReferenceImage)
    && sampleLibrary.usesTextSamples() && !state.freeReference) {
    throw new Error("当前所选模型需要自由生图参考图");
  }
  const ratioAuto = elements.ratioSelect.value === "auto";
  return cases.flatMap((currentCase, caseIndex) => models.map((model, modelIndex) => {
    const input = {
      featureMode: state.featureMode === "roomRenovation" ? "emptyRoom" : state.featureMode,
      modelKey: model.key,
      negativePrompt: state.featureMode === "textureEnhancement" ? "" : elements.negativePromptInput.value.trim(),
      outputFormat: "png",
      prompt: state.featureMode === "free" ? undefined : state.featureMode === "panoramaEnhancement" ? panoramaLighting.requestFields().prompt : FEATURE_COPY[state.featureMode].promptConfig ? "" : currentCase.prompt,
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
      sourceImage: currentCase.referenceImages[0] || currentCase.sourceImage || null,
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
  renderBetaMonitor(elements, job);
  renderRunSummary();
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function followJob(jobId) {
  let job;
  do {
    await delay(800);
    try {
      ({ job } = await api(`/api/beta/jobs/${encodeURIComponent(jobId)}`));
    } catch (error) {
      reportUploadError(error, { canRefresh: true });
      return;
    }
    renderJob(job);
  } while (job.status === "running");
  return job;
}

async function startBatch(previousJob = null) {
  if (previousJob?.status === "failed" && previousJob.jobId) {
    const retryUnavailable = previousJob.featureMode === "imageMultiAngle"
      ? betaFeatureUnavailableReason(previousJob.featureMode, state.betaConfig)
      : generationFeatureUnavailableReason(previousJob.featureMode, state.catalog.generationFeatureModes, state.catalog.models);
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
      ...(state.featureMode === "free" ? { sharedPrompt: elements.freeSharedPromptInput.value.trim() } : {}),
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
    reportUploadError(error, { canRefresh: true });
  }
}

function reportUploadError(error, { canRefresh = false } = {}) {
  if (!state.job?.jobId) state.job = null;
  renderBetaMonitor(elements, state.job, { error: error.message, canRefresh });
  renderRunSummary();
}

async function setSingleReference(fileList, key) {
  try {
    const file = Array.from(fileList)[0];
    if (!file) return;
    const featureMode = state.featureMode;
    const next = await readImage(file);
    if (featureMode !== state.featureMode) { referenceDrafts.get(featureMode)[key] = next; return; }
    state[key] = next;
    renderReferenceInputs();
    if (key === "styleReference") designConfiguration.referenceChanged();
    renderRunSummary();
    saveConfiguration();
  } catch (error) {
    reportUploadError(error);
  }
}

async function selectTask(featureMode) {
  state.switchingTask = true;
  renderRunSummary();
  try {
    if (featureMode === "housePlanLayout") await housePlanConfiguration.refresh();
    if (featureMode === "floorPlanCamera") await floorPlanCameraConfiguration.refresh();
    if (state.featureMode) {
      saveConfiguration();
      referenceDrafts.set(state.featureMode, { styleReference: state.styleReference, freeReference: state.freeReference });
    }
    const draft = configuration.draftFor(featureMode);
    const references = referenceDrafts.get(featureMode);
    state.featureMode = featureMode;
    state.selectedModelKeys = [...draft.selectedModelKeys];
    state.keepModelDraft = draft.hasSavedModelSelection;
    state.styleReference = references?.styleReference ?? null;
    state.freeReference = references?.freeReference ?? null;
    configuration.restore(draft);
    elements.betaEmpty.hidden = true;
    elements.betaForm.hidden = false;
    void sampleLibrary.setFeatureMode(featureMode, state.sampleSetIds[featureMode]).catch(reportUploadError);
    saveConfiguration();
  } finally {
    state.switchingTask = false;
    renderRunSummary();
  }
}

function bindEvents() {
  sampleLibrary.bind();
  configuration.bindLifecycle();
  elements.featureModeList.addEventListener("click", (event) => {
    const featureMode = event.target.closest("[data-feature-mode]")?.dataset.featureMode;
    if (!state.taskDirectoryReady || state.switchingTask || sampleLibrary.isMutating()
      || !Object.hasOwn(FEATURE_COPY, featureMode) || featureMode === state.featureMode) return;
    selectTask(featureMode).catch(reportUploadError);
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
    designConfiguration.render();
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
  elements.freeSharedPromptInput.addEventListener("input", () => { renderRunSummary(); saveConfiguration(); });
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
    if (select === elements.styleSelect) designConfiguration.render();
    renderRunSummary(); saveConfiguration();
  });
  elements.newBatchButton.addEventListener("click", () => {
    if (state.job?.status === "running" || state.submitting) return;
    sessionStorage.removeItem(JOB_STORAGE_KEY);
    renderJob(null);
    (state.featureMode && !elements.runButton.disabled ? elements.runButton : elements.jobMonitorTitle).focus({ preventScroll: true });
  });
  elements.monitorRefresh.addEventListener("click", async () => {
    elements.jobMonitorTitle.focus({ preventScroll: true });
    elements.monitorRefresh.disabled = true;
    await restoreJob();
    elements.monitorRefresh.disabled = false;
  });
  elements.betaForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (elements.runButton.disabled) return;
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
  bindEvents();
  renderRunSummary();
  void restoreJob();
  try {
    const [catalog, betaConfig] = await Promise.all([
      api("/api/catalog"),
      api("/api/beta/config"),
      connection.load(),
    ]);
    state.catalog = catalog;
    panoramaLighting.setCapabilities(catalog.generationFeatureCapabilities);
    effectBeautificationControls.setCapabilities(catalog.generationFeatureCapabilities);
    updateWorkflows(betaConfig);
    fillSelect(elements.roomTypeSelect, [
      { label: "请选择", value: "" },
      ...catalog.emptyRoomTypes.map((value) => ({ label: value, value })),
    ]);
    renderPromptAgentModels();
    showStatus(state.connected ? "检测模型中" : "请先连接 API", {
      error: !state.connected,
    });
    void sampleLibrary.load("").catch(reportUploadError);
    const [stylesResult] = await Promise.allSettled([
      api("/api/styles"),
      connection.refreshAccess(),
    ]);
    if (stylesResult.status === "fulfilled") {
      state.stylesConfig = stylesResult.value;
      panoramaLighting.configure(state.stylesConfig.refinedLighting);
      effectBeautificationControls.setLightingConfig(state.stylesConfig.refinedLighting);
    }
    state.taskDirectoryReady = true;
    configuration.markReady();
    renderRunSummary();
  } catch (error) {
    showStatus(error.message, { error: true });
    elements.betaEmpty.textContent = "任务配置读取失败，请刷新重试";
    renderRunSummary();
  }
}
load();

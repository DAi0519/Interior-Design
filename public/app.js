/**
 * [INPUT]: 依赖页面 DOM、sessionStorage 任务引用、可查询后台生成任务、效果图美化天气/时段受控选项、空房必填房间类型及“其他”详情、精模预设 Prompt 与可选用户要求、白模/空房双模式独立 Agent 与固定风格路由、支持单图原位替换的双参考图上传、使用可选负向 Prompt 覆盖与默认模型参数的 Flux 模型多选/单模型 1–4 张下拉/结果画廊、连接中心、生成动作与 Style DNA 对话
 * [OUTPUT]: 对外提供按功能及跨页恢复的生成中/结果状态、效果图美化及可独立/组合的天气时段提交、空房房间类型显式选择及“其他”详情条件必填、精模自定义要求、白模/空房双模式与仅智能默认可用的风格参考图整合及拖入替换、Flux 默认/自定义负向 Prompt 实验、固定 PNG 的自由生图、单模型 1–4 张或最多四模型各一张生成与独立飞书反馈
 * [POS]: public 的生成状态编排器，不接触 OneAPI Key、ComfyUI 地址、效果图美化/精模 Prompt 正文或工作流正文
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { bindConfigRefresh } from "./config-refresh.js";
import { bindConnectionCenter } from "./connection-center.js";
import { bindEmptyRoomType } from "./empty-room-type.js";
import { bindFluxNegativePrompt } from "./flux-negative-prompt.js";
import { bindGenerationCount } from "./generation-count.js";
import { buildGenerationInput } from "./generation-input.js";
import { bindGenerationActions } from "./generation-actions.js";
import { bindGenerationResults } from "./generation-results.js";
import { bindGenerationTaskController } from "./generation-task-controller.js";
import {
  buildGenerationJobRequest,
  generationItemsForSelection,
  generationLoadingCopy,
} from "./generation-task-request.js";
import { createGenerationTask } from "./generation-task-state.js";
import { describeFinalModelOption, finalModelCatalogStatus } from "./final-model-availability.js";
import { bindModelMultiSelect } from "./model-multi-select.js";
import { bindPromptAgentVersionSelect } from "./prompt-agent-version-select.js?v=2";
import { bindReferenceUpload } from "./reference-upload.js?v=2";
import { bindRefinedPromptVersionSelect } from "./refined-prompt-version-select.js";
import { bindStyleDnaChat } from "./style-dna-chat.js";
import { bindWhiteModelRenderMode } from "./white-model-render-mode.js";
import { referenceCapability, sizeControlState, sizeSummary } from "./model-capabilities.js";
import { api, fillSelect } from "./workbench-utils.js";
import "./custom-select.js?v=7";
const state = {
  availablePromptAgents: new Map(),
  catalog: [],
  connected: false,
  emptyRoomConfig: { promptAgent: { defaultVersion: null, versions: [] }, smartDefault: { available: false, reason: "读取中", version: null } },
  featureMode: "whiteModel",
  modelKeys: ["seedream5"],
  promptAgentCatalog: [],
  promptAgentModelKey: "gemini3pro",
  ratioMode: "auto",
  referencePolicy: null,
  fusionPromptConfig: { defaultVersion: null, versions: [] },
  smartDefaultConfig: { available: false, reason: "读取中", version: null },
};
let referenceUpload;
let styleReferenceUpload;
const elements = {
  emptyModel: document.querySelector("#emptyModel"),
  emptyRoomTypeSection: document.querySelector("#emptyRoomTypeSection"),
  emptySize: document.querySelector("#emptySize"),
  effectEnhancementSection: document.querySelector("#effectEnhancementSection"),
  effectTimeSelect: document.querySelector("#effectTimeSelect"),
  effectWeatherSelect: document.querySelector("#effectWeatherSelect"),
  exactSize: document.querySelector("#exactSize"),
  featureModeButtons: Array.from(document.querySelectorAll("[data-feature-mode]")),
  generationControls: Array.from(document.querySelectorAll(".generation-control")),
  generationResults: Array.from(document.querySelectorAll(".generation-result")),
  modelAvailability: document.querySelector("#modelAvailability"),
  modelNote: document.querySelector("#modelNote"),
  modelSelect: document.querySelector("#modelSelect"),
  promptCount: document.querySelector("#promptCount"),
  promptAgentAvailability: document.querySelector("#promptAgentAvailability"),
  promptAgentModelLabelCopy: document.querySelector("#promptAgentModelLabelCopy"),
  promptAgentModelSelect: document.querySelector("#promptAgentModelSelect"),
  promptAgentNote: document.querySelector("#promptAgentNote"),
  promptAgentSection: document.querySelector("#promptAgentSection"),
  promptAgentTitle: document.querySelector("#promptAgentTitle"),
  promptAgentVersionAvailability: document.querySelector("#promptAgentVersionAvailability"),
  promptAgentVersionField: document.querySelector("#promptAgentVersionField"),
  promptAgentVersionLabel: document.querySelector("#promptAgentVersionLabel"),
  promptAgentVersionSelect: document.querySelector("#promptAgentVersionSelect"),
  promptInput: document.querySelector("#promptInput"),
  promptSection: document.querySelector("#promptSection"),
  qualityField: document.querySelector("#qualityField"),
  qualityLabel: document.querySelector("#qualityLabel"),
  qualitySelect: document.querySelector("#qualitySelect"),
  ratioSelect: document.querySelector("#ratioSelect"),
  referenceCount: document.querySelector("#referenceCount"),
  referenceDropLabel: document.querySelector("#referenceDropLabel"),
  referenceDropZone: document.querySelector("#referenceDropZone"),
  referenceInput: document.querySelector("#referenceInput"),
  referenceList: document.querySelector("#referenceList"),
  referenceOptional: document.querySelector("#referenceOptional"),
  referenceTitleCopy: document.querySelector("#referenceTitleCopy"),
  refinedPromptAvailability: document.querySelector("#refinedPromptAvailability"),
  refinedPromptCount: document.querySelector("#refinedPromptCount"),
  refinedPromptInput: document.querySelector("#refinedPromptInput"),
  refinedPromptNote: document.querySelector("#refinedPromptNote"),
  refinedPromptSection: document.querySelector("#refinedPromptSection"),
  refinedPromptVersionSelect: document.querySelector("#refinedPromptVersionSelect"),
  resolutionSelect: document.querySelector("#resolutionSelect"),
  retryButton: document.querySelector("#retryButton"),
  styleAvailability: document.querySelector("#styleAvailability"),
  styleNote: document.querySelector("#styleNote"),
  styleReferenceCount: document.querySelector("#styleReferenceCount"),
  styleReferenceDropZone: document.querySelector("#styleReferenceDropZone"),
  styleReferenceInput: document.querySelector("#styleReferenceInput"),
  styleReferenceList: document.querySelector("#styleReferenceList"),
  styleReferenceSection: document.querySelector("#styleReferenceSection"),
  styleSection: document.querySelector("#styleSection"),
  styleTitle: document.querySelector("#styleTitle"),
  toast: document.querySelector("#toast"),
  whiteModelRenderModeList: document.querySelector("#whiteModelRenderModeList"),
};
const emptyRoomType = bindEmptyRoomType({ root: document.querySelector("#emptyRoomTypeList"),
  onChange: () => generationActions.clearReusable() });
const generationCount = bindGenerationCount({
  root: document.querySelector("#generationCountField"),
});
const fluxNegativePrompt = bindFluxNegativePrompt({
  count: document.querySelector("#negativePromptCount"),
  note: document.querySelector("#negativePromptNote"),
  root: document.querySelector("#negativePromptSection"),
  textarea: document.querySelector("#negativePromptInput"),
});
const promptAgentVersionSelect = bindPromptAgentVersionSelect({
  availability: elements.promptAgentVersionAvailability,
  select: elements.promptAgentVersionSelect,
});
const refinedPromptVersionSelect = bindRefinedPromptVersionSelect({
  availability: elements.refinedPromptAvailability,
  note: elements.refinedPromptNote,
  select: elements.refinedPromptVersionSelect,
});
function selectedModels() { return state.modelKeys.map((key) =>
  state.catalog.find((model) => model.key === key)).filter(Boolean); }
function selectedModel() { return selectedModels()[0]; }
function referenceImages() { return referenceUpload?.images() || []; }
function styleReferenceImages() { return styleReferenceUpload?.images() || []; }
function selectedSourceImage() { return state.featureMode === "styleDna" ? null : referenceImages()[0]; }
function isDesignPromptFlow() { return ["emptyRoom", "whiteModel"].includes(state.featureMode); }
function activeDesignPromptConfig() {
  return state.featureMode === "emptyRoom"
    ? state.emptyRoomConfig.smartDefault
    : state.smartDefaultConfig;
}
function renderActivePromptAgentVersions() { promptAgentVersionSelect.render(
  state.featureMode === "emptyRoom" ? state.emptyRoomConfig.promptAgent : state.fusionPromptConfig); }
function selectedPromptAgentModel() { return state.promptAgentCatalog.find(
  (model) => model.key === state.promptAgentModelKey); }
function renderPromptAgentModels() {
  const options = state.promptAgentCatalog.map((model) => {
    const live = state.availablePromptAgents.get(model.id);
    const selectable = live ? live.selectable : model.imageInput;
    const reason = live?.reason || (!model.imageInput ? "不支持图片输入" : null);
    const option = document.createElement("option");
    option.value = model.key;
    option.disabled = !selectable;
    option.selected = model.key === state.promptAgentModelKey;
    option.textContent = `${model.shortLabel}${reason ? ` · ${reason}` : ""}`;
    return option;
  });
  elements.promptAgentModelSelect.replaceChildren(...options);
  const selected = selectedPromptAgentModel();
  elements.promptAgentNote.textContent = state.featureMode === "emptyRoom"
    ? selected?.note
      ? `${selected.note}；用于理解空房并生成完整设计提示词。`
      : "用于理解空房并生成完整设计提示词。"
    : selected?.note || "用于理解白模并整合最终提示词。";
}

function selectPromptAgent(modelKey) {
  const model = state.promptAgentCatalog.find((entry) => entry.key === modelKey);
  const live = model && state.availablePromptAgents.get(model.id);
  if (!model || !model.imageInput || (live && !live.selectable)) return;
  state.promptAgentModelKey = modelKey;
  renderPromptAgentModels();
}
function renderPromptAgentContext(smartDefault) {
  const emptyRoom = state.featureMode === "emptyRoom";
  const implicitVersion = smartDefault;
  elements.promptAgentTitle.textContent = emptyRoom
    ? smartDefault ? "空房智能默认 Agent" : "空房风格融合 Agent"
    : smartDefault ? "智能默认 Agent" : "场景融合 Agent";
  elements.promptAgentVersionAvailability.classList.toggle("hidden", implicitVersion);
  elements.promptAgentVersionField.classList.toggle("hidden", implicitVersion);
  elements.promptAgentVersionLabel.classList.toggle("hidden", implicitVersion);
  elements.promptAgentModelLabelCopy.textContent = implicitVersion
    ? "Agent 基模"
    : "融合基模";
  elements.promptAgentModelSelect.setAttribute("aria-label", emptyRoom
    ? smartDefault ? "空房智能默认 Agent 基模" : "空房风格融合基模"
    : smartDefault ? "智能默认 Agent 基模" : "融合基模");
  renderPromptAgentModels();
}

function referenceLimit() {
  return referenceCapability({
    featureMode: state.featureMode,
    model: selectedModel(),
    policy: state.referencePolicy,
  }).limit;
}

function updateReferenceRequirements() {
  const capability = referenceCapability({
    featureMode: state.featureMode,
    model: selectedModel(),
    policy: state.referencePolicy,
  });
  elements.referenceTitleCopy.textContent = capability.title;
  elements.referenceOptional.textContent = capability.optionalLabel;
  elements.referenceDropLabel.textContent = capability.dropLabel;
  elements.referenceInput.multiple = capability.multiple;
  elements.referenceInput.ariaLabel = capability.ariaLabel;
}

function selectFeatureMode(featureMode) {
  const supported = [
    "effectEnhancement",
    "emptyRoom",
    "free",
    "refinedModel",
    "styleDna",
    "whiteModel",
  ];
  if (!supported.includes(featureMode)) return;
  state.featureMode = featureMode;
  const isWhiteModel = featureMode === "whiteModel";
  const isEmptyRoom = featureMode === "emptyRoom";
  const isDesignModel = isWhiteModel || isEmptyRoom;
  const isEffectEnhancement = featureMode === "effectEnhancement";
  const isRefinedModel = featureMode === "refinedModel";
  const isStyleDna = featureMode === "styleDna";

  for (const button of elements.featureModeButtons) {
    const selected = button.dataset.featureMode === featureMode;
    button.classList.toggle("selected", selected);
    button.ariaChecked = String(selected);
  }

  for (const control of elements.generationControls) {
    control.classList.toggle("hidden", isStyleDna);
  }
  for (const result of elements.generationResults) {
    result.classList.toggle("hidden", isStyleDna);
  }
  styleDnaChat.setVisible(isStyleDna);
  generationActions.setFeatureMode(featureMode);
  if (isStyleDna) {
    generationActions.setBusy(false);
    return;
  }

  whiteModelRenderMode.setPlatformStylesEnabled(
    !isEmptyRoom || styleReferenceImages().length === 0,
    "已上传风格参考图，空房设计固定使用智能默认",
  );
  whiteModelRenderMode.setSmartDefault(activeDesignPromptConfig());
  const smartDefault = whiteModelRenderMode.current().mode === "smart-default";
  elements.promptAgentSection.classList.toggle("hidden", !isDesignModel);
  if (isDesignModel) {
    renderActivePromptAgentVersions();
    renderPromptAgentContext(smartDefault);
  }
  elements.styleSection.classList.toggle("hidden", !isDesignModel);
  elements.effectEnhancementSection.classList.toggle("hidden", !isEffectEnhancement);
  elements.emptyRoomTypeSection.classList.toggle("hidden", !isEmptyRoom);
  elements.styleReferenceSection.classList.toggle("hidden", !isDesignModel);
  elements.styleTitle.textContent = isEmptyRoom ? "设计风格" : "风格选择";
  elements.whiteModelRenderModeList.setAttribute("aria-label",
    isEmptyRoom ? "空房设计风格选择" : "白模风格选择");
  elements.refinedPromptSection.classList.toggle("hidden", !isRefinedModel);
  elements.promptSection.classList.toggle(
    "hidden",
    isRefinedModel || isEffectEnhancement,
  );
  configurePrimaryModel();
  updateReferenceRequirements();
  referenceUpload.render();
  renderActiveGenerationTask();
}

function renderModelSelect() {
  modelMultiSelect.render(state.catalog, state.modelKeys);
  const count = state.modelKeys.length;
  elements.modelNote.textContent = count === 1
    ? `${selectedModel()?.description || ""} 单模型支持生成 1–4 张；也可继续选择模型。`
    : `已选择 ${count} 个；参数以 ${selectedModel()?.label} 为编辑基准，每个模型各生成 1 张。`;
}

function configurePrimaryModel() {
  if (!selectedModel()) return;
  if (selectedSourceImage()) state.ratioMode = "auto";
  const model = selectedModel();
  renderModelSelect();
  fluxNegativePrompt.render(state.modelKeys);
  generationCount.setSingleModel(state.modelKeys.length === 1);
  updateReferenceRequirements();
  configureSizeControls();

  if (model.qualityOptions.length > 0) {
    elements.qualityField.classList.remove("hidden");
    elements.qualityLabel.textContent = "生成质量";
    fillSelect(
      elements.qualitySelect,
      model.qualityOptions.map((quality) => ({
        label:
          quality === "auto"
            ? "自动"
            : quality === "low"
              ? "低"
              : quality === "medium"
                ? "中"
                : "高",
        value: quality,
      })),
      model.defaultQuality || "auto",
    );
  } else {
    elements.qualityField.classList.add("hidden");
    elements.qualitySelect.replaceChildren();
  }

  updateComputedSize();
  referenceUpload.render();
}

function selectModels(modelKeys) {
  state.modelKeys = modelKeys;
  configurePrimaryModel();
}

function configureSizeControls({ preserveResolution = false } = {}) {
  const model = selectedModel();
  const sourceImage = selectedSourceImage();
  const controls = sizeControlState({
    currentRatio: elements.ratioSelect.value,
    currentResolution: elements.resolutionSelect.value,
    model,
    preserveResolution,
    ratioMode: state.ratioMode,
    sourceImage,
  });
  fillSelect(elements.ratioSelect, controls.ratioOptions, controls.ratio);
  fillSelect(
    elements.resolutionSelect,
    controls.resolutionOptions,
    controls.resolution,
  );
  elements.ratioSelect.disabled = controls.ratioDisabled;
  elements.resolutionSelect.disabled = controls.resolutionDisabled;
}

function updateComputedSize() {
  const model = selectedModel();
  const ratio = elements.ratioSelect.value;
  const sourceImage = selectedSourceImage();
  const summary = sizeSummary({
    model,
    ratio,
    ratioMode: state.ratioMode,
    resolution: elements.resolutionSelect.value,
    sourceImage,
  });
  if (summary.resolution !== elements.resolutionSelect.value) {
    fillSelect(
      elements.resolutionSelect,
      Object.keys(model.sizes[ratio]),
      summary.resolution,
    );
  }
  elements.exactSize.textContent = summary.exactSize;
  elements.emptyModel.textContent = model.label;
  elements.emptySize.textContent = summary.emptySize;
}

function generationInput() {
  const renderMode = whiteModelRenderMode.current();
  return buildGenerationInput({
    effectTime: elements.effectTimeSelect.value,
    effectWeather: elements.effectWeatherSelect.value,
    emptyRoomFields: emptyRoomType.requestFields(),
    featureMode: state.featureMode,
    model: selectedModel(),
    negativePrompt: fluxNegativePrompt.value(),
    prompt: {
      free: elements.promptInput.value.trim(),
      refined: elements.refinedPromptInput.value.trim(),
    },
    promptAgentModelKey: state.promptAgentModelKey,
    promptAgentVersion: promptAgentVersionSelect.value(),
    promptVersion: refinedPromptVersionSelect.value(),
    quality: elements.qualitySelect.value,
    ratio: elements.ratioSelect.value,
    ratioMode: selectedSourceImage() ? state.ratioMode : "manual",
    referenceImages: referenceImages(),
    renderMode,
    resolution: elements.resolutionSelect.value,
    styleReferenceImages: styleReferenceImages(),
  });
}

function updatePromptCount() { elements.promptCount.textContent = `${elements.promptInput.value.length} / 8000`; }
function updateRefinedPromptCount() { elements.refinedPromptCount.textContent = `${elements.refinedPromptInput.value.length} / 8000`; }

function setApiConnectionState(connected) {
  if (state.connected !== connected) generationActions.clearReusable();
  state.connected = connected;
  styleDnaChat.setConnected(connected);
  const workflowCount = state.catalog.filter(
    (model) => model.provider === "comfyui",
  ).length;
  elements.modelAvailability.textContent = connected
    ? "检查模型中"
    : workflowCount > 0
      ? `${workflowCount} 个工作流已配置`
      : "等待连接";
  elements.promptAgentAvailability.textContent = connected
    ? "检查模型中"
    : "等待连接";
  elements.modelAvailability.classList.toggle("ready", connected || workflowCount > 0);
  elements.promptAgentAvailability.classList.toggle("ready", connected);
  renderActiveGenerationTask();
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.remove("hidden");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => {
    elements.toast.classList.add("hidden");
  }, 2400);
}

const generationResults = bindGenerationResults({ api, showToast });
const generationTasks = bindGenerationTaskController({
  generationResults,
  getFeatureMode: () => state.featureMode,
  onBusy: (busy) => generationActions.setBusy(busy),
});
function renderActiveGenerationTask() { generationTasks.render(); }

const modelMultiSelect = bindModelMultiSelect({
  container: elements.modelSelect,
  max: 4,
  onChange: selectModels,
  onMessage: showToast,
  presentOption: describeFinalModelOption,
});

async function checkAvailableModels() {
  if (!state.connected) return;
  try {
    const body = await api("/api/check-models", { method: "POST" });
    state.availablePromptAgents = new Map(
      body.agentModels.map((model) => [model.id, model]),
    );
    styleDnaChat.setAvailability(body.agentModels);
    const selectedAgent = selectedPromptAgentModel();
    if (!state.availablePromptAgents.get(selectedAgent?.id)?.selectable) {
      const fallback = body.agentModels.find((model) => model.selectable);
      if (fallback) state.promptAgentModelKey = fallback.key;
    }
    const availableAgentCount = body.agentModels.filter(
      (model) => model.selectable,
    ).length;
    elements.modelAvailability.textContent = finalModelCatalogStatus(body.models);
    elements.promptAgentAvailability.textContent = `${availableAgentCount} / ${body.agentModels.length} 可选`;
    elements.modelAvailability.classList.add("ready");
    elements.promptAgentAvailability.classList.add("ready");
    renderPromptAgentModels();
    renderModelSelect();
  } catch (error) {
    elements.modelAvailability.textContent = "检查失败";
    elements.promptAgentAvailability.textContent = "检查失败";
    elements.modelAvailability.classList.remove("ready");
    elements.promptAgentAvailability.classList.remove("ready");
    showToast(error.message);
  }
}

function resetModelAvailability() {
  state.availablePromptAgents.clear();
  styleDnaChat.setAvailability([]);
  renderPromptAgentModels();
  renderModelSelect();
}

async function generate({ forcePromptRegeneration = false } = {}) {
  const featureMode = state.featureMode;
  if (generationTasks.view(featureMode).stage === "loading") return;
  const models = selectedModels();
  const whiteModelRequest = featureMode === "whiteModel";
  const emptyRoomRequest = featureMode === "emptyRoom";
  const designPromptRequest = whiteModelRequest || emptyRoomRequest;
  const refinedModelRequest = featureMode === "refinedModel";
  const effectEnhancementRequest = featureMode === "effectEnhancement";
  const roomTypeValidation = emptyRoomRequest ? emptyRoomType.validation() : null;
  if (roomTypeValidation?.message) {
    emptyRoomType.focusInvalid();
    showToast(roomTypeValidation.message);
    return;
  }
  const requiresOneApi = designPromptRequest || models.some(
    (model) => model.provider !== "comfyui");
  if (!state.connected && requiresOneApi) {
    connectionCenter.open({ focusApi: true });
    return;
  }
  if (models.length < 1 || models.length > 4) {
    showToast("请选择 1–4 个出图模型");
    return;
  }
  if (designPromptRequest) {
    const renderMode = whiteModelRenderMode.current();
    if (!renderMode.available) {
      showToast(renderMode.reason || "飞书智能默认 Agent 暂不可用");
      return;
    }
    if (renderMode.mode === "style-dna") {
      if (!promptAgentVersionSelect.value()) {
        showToast(emptyRoomRequest
          ? "飞书空房风格融合 Agent 没有可用的已上架版本"
          : "飞书场景融合 Agent 没有可用的已上架版本");
        return;
      }
      if (!renderMode.style) {
        showToast("飞书风格库没有可用的已上架 Style DNA");
        return;
      }
    }
    if (referenceImages().length !== 1) {
      showToast(emptyRoomRequest
        ? "空房设计需要且只允许 1 张空房图"
        : "白模渲染需要且只允许 1 张白模图");
      return;
    }
  }
  if (refinedModelRequest) {
    if (!refinedPromptVersionSelect.value()) {
      showToast("飞书精模 Prompt 没有可用版本");
      return;
    }
    if (referenceImages().length !== 1) {
      showToast("精模渲染需要且只允许 1 张带材质模型图");
      return;
    }
  }
  if (effectEnhancementRequest && referenceImages().length !== 1) {
    showToast("效果图美化需要且只允许 1 张待美化效果图");
    return;
  }
  if (
    featureMode === "free" &&
    models.some((model) => model.requiresReferenceImage) &&
    referenceImages().length !== 1
  ) {
    const required = models.find((model) => model.requiresReferenceImage);
    showToast(`${required.label} 需要且只允许 1 张参考图`);
    return;
  }
  if (
    featureMode === "free" &&
    models.some((model) => model.provider !== "comfyui") &&
    elements.promptInput.value.trim().length < 3
  ) {
    elements.promptInput.focus();
    showToast("请先输入至少 3 个字符的提示词");
    return;
  }

  const promptIdentity = designPromptRequest
    ? generationActions.currentIdentity()
    : null;
  const loadingCopy = generationLoadingCopy({
    designPromptRequest,
    emptyRoomRequest,
    effectEnhancementRequest,
    forcePromptRegeneration,
    generationCount: generationCount.value(),
    models,
    refinedModelRequest,
    refinedPrompt: elements.refinedPromptInput.value.trim(),
    renderMode: whiteModelRenderMode.current().mode,
    styleReferenceCount: styleReferenceImages().length,
  });
  const generationItems = generationItemsForSelection(models, generationCount.value());
  const task = createGenerationTask({
    featureMode,
    loadingLabel: loadingCopy,
    models: generationItems,
  });
  generationTasks.start(task);

  try {
    const baseInput = generationInput();
    const sourceImage = selectedSourceImage();
    const batchId = generationItems.length > 1
      ? crypto.randomUUID().replaceAll("-", "")
      : null;
    const body = await api("/api/generation-jobs", {
      body: JSON.stringify(buildGenerationJobRequest({
        baseInput,
        batchId,
        featureMode,
        forcePromptRegeneration: designPromptRequest && forcePromptRegeneration,
        jobId: task.jobId,
        models: generationItems,
        sourceImage,
      })),
      method: "POST",
    });
    generationTasks.setJob(task.jobId, body.job);
    const job = await generationTasks.follow(task);
    if (job.status === "failed" || job.status === "missing") {
      throw new Error(generationTasks.view(featureMode).message);
    }
    const outcomes = job.result?.outcomes || [];
    const completed = outcomes.filter((outcome) => outcome.status === "fulfilled").length;
    if (designPromptRequest && completed > 0) {
      generationActions.markReusable(promptIdentity);
    }
    showToast(completed === generationItems.length
      ? `${completed} 张图已完成，正在分别同步飞书`
      : `完成 ${completed} / ${generationItems.length} 张；失败项可查看原因`);
  } catch (error) {
    generationTasks.setJob(task.jobId, {
      error: error.message,
      jobId: task.jobId,
      status: "failed",
    });
  } finally {
    if (state.featureMode === featureMode) renderActiveGenerationTask();
  }
}

const generationActions = bindGenerationActions({
  getPromptIdentity: () => JSON.stringify([
    state.featureMode,
    emptyRoomType.value(),
    referenceImages().map((image) => image.id),
    styleReferenceImages().map((image) => image.id),
    whiteModelRenderMode.current().mode,
    whiteModelRenderMode.current().styleCode,
    whiteModelRenderMode.current().agentVersion,
    elements.promptInput.value.trim(), state.promptAgentModelKey,
    promptAgentVersionSelect.value(),
  ]),
  onGenerate: () => void generate(),
  onRegenerate: () => void generate({ forcePromptRegeneration: true }),
});
const whiteModelRenderMode = bindWhiteModelRenderMode({
  availability: elements.styleAvailability,
  note: elements.styleNote,
  root: elements.whiteModelRenderModeList,
  smartDefaultAvailable: false,
  onChange() {
    if (isDesignPromptFlow()) selectFeatureMode(state.featureMode);
    generationActions.clearReusable();
  },
});
const styleDnaChat = bindStyleDnaChat({
  api,
  onConnectionRequired() {
    connectionCenter.open({ focusApi: true });
  },
  showToast,
});

const connectionCenter = bindConnectionCenter({
  api,
  onApiConnected: checkAvailableModels,
  onApiDisconnected: resetModelAvailability,
  onApiStateChange(session) {
    setApiConnectionState(session.connected);
  },
  onLarkReady: async () => {
    await loadConfiguration();
  },
  showToast,
});

async function initialize() {
  const [catalogBody, sessionBody] = await Promise.all([
    api("/api/catalog"),
    connectionCenter.load(),
  ]);
  state.catalog = catalogBody.models;
  state.promptAgentCatalog = catalogBody.agentModels;
  state.referencePolicy = catalogBody.referenceImage;
  emptyRoomType.setOptions(catalogBody.emptyRoomTypes, catalogBody.emptyRoomTypeDetailMaxLength);
  styleDnaChat.setCatalog(catalogBody.agentModels);
  renderPromptAgentModels();
  selectFeatureMode(state.featureMode);
  generationTasks.resume();
  await loadConfiguration();
  referenceUpload.render();
  styleReferenceUpload.render();
  updatePromptCount();
  setApiConnectionState(sessionBody.connected);
  if (sessionBody.connected) await checkAvailableModels();
}
for (const button of elements.featureModeButtons) {
  button.addEventListener("click", () => selectFeatureMode(button.dataset.featureMode));
}
elements.promptAgentModelSelect.addEventListener("change", (event) => {
  selectPromptAgent(event.target.value);
  generationActions.refresh();
});
const loadConfiguration = bindConfigRefresh({
  api,
  onEmptyRoom(config) {
    state.emptyRoomConfig = config;
    if (state.featureMode === "emptyRoom") {
      whiteModelRenderMode.setSmartDefault(config.smartDefault);
      selectFeatureMode("emptyRoom");
    }
    generationActions.clearReusable();
  },
  onPromptAgentVersions(config) {
    state.fusionPromptConfig = config;
    if (state.featureMode === "whiteModel") renderActivePromptAgentVersions();
    generationActions.clearReusable();
  },
  onSmartDefault(config) {
    state.smartDefaultConfig = config;
    if (state.featureMode === "whiteModel") {
      whiteModelRenderMode.setSmartDefault(config);
      selectFeatureMode("whiteModel");
    }
    generationActions.clearReusable();
  },
  onStyles(styles) {
    whiteModelRenderMode.setStyles(styles);
    generationActions.clearReusable();
  },
  onRefinedPromptVersions(config) {
    refinedPromptVersionSelect.render(config);
  },
  showToast,
});
referenceUpload = bindReferenceUpload({
  count: elements.referenceCount,
  dropZone: elements.referenceDropZone,
  getLimit: referenceLimit,
  getPolicy: () => state.referencePolicy,
  getSubject: () => state.featureMode === "whiteModel"
    ? "白模图"
    : state.featureMode === "emptyRoom"
      ? "空房图"
      : state.featureMode === "refinedModel"
        ? "精模图"
        : state.featureMode === "effectEnhancement"
          ? "待美化效果图"
          : "参考图",
  input: elements.referenceInput,
  list: elements.referenceList,
  onChange({ images, previousImages }) {
    if (images[0]?.id !== previousImages[0]?.id) state.ratioMode = "auto";
    generationActions.refresh();
    configureSizeControls({ preserveResolution: true });
    updateComputedSize();
  },
  showToast,
});
styleReferenceUpload = bindReferenceUpload({
  count: elements.styleReferenceCount,
  dropZone: elements.styleReferenceDropZone,
  getLimit: () => 1,
  getPolicy: () => state.referencePolicy,
  getSubject: () => "风格参考图",
  input: elements.styleReferenceInput,
  list: elements.styleReferenceList,
  onChange({ images }) {
    if (state.featureMode === "emptyRoom") {
      whiteModelRenderMode.setPlatformStylesEnabled(
        images.length === 0,
        "已上传风格参考图，空房设计固定使用智能默认",
      );
      selectFeatureMode("emptyRoom");
    }
    generationActions.refresh();
  },
  showToast,
});
elements.retryButton.addEventListener("click", () => generate());
elements.promptInput.addEventListener("input", () => {
  updatePromptCount();
  generationActions.refresh();
});
elements.refinedPromptInput.addEventListener("input", updateRefinedPromptCount);
elements.promptAgentVersionSelect.addEventListener("change", generationActions.refresh);
elements.refinedPromptVersionSelect.addEventListener("change", generationActions.refresh);
elements.effectTimeSelect.addEventListener("change", generationActions.refresh);
elements.effectWeatherSelect.addEventListener("change", generationActions.refresh);
elements.ratioSelect.addEventListener("change", () => {
  if (selectedSourceImage()) state.ratioMode = "manual";
  updateComputedSize();
});
elements.resolutionSelect.addEventListener("change", updateComputedSize);
initialize().catch((error) => {
  generationResults.showError(`工作台初始化失败：${error.message}`);
});

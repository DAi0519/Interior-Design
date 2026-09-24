/**
 * [INPUT]: 依赖页面 DOM、sessionStorage 任务引用、可查询后台生成任务、效果图美化天气/时段、全景 2:1 模型门槛与 Seedream 5.0 Pro 4K 实验档、SeedVR2 图片超分两工作流与 4K/6K/8K 配置、design-inputs 的空房类型/家具/布局合同、精模预设 Prompt、白模/空房双模式 Agent、双参考图上传、Flux 模型多选/生成张数/结果画廊与原图滑动对比、连接中心、生成动作与 Style DNA 对话
 * [OUTPUT]: 对外提供默认 Flux2 Klein、需归档生图的飞书同步合同阻断、无需 OneAPI/飞书的纯 ComfyUI 图片超分、按功能恢复的生成中/结果状态与当前页面任务原图对比、效果图/复用普通 Flux 工作流且含 Pro 4K 实验尺寸的全景图美化、空房类型、精模要求、白模/空房双模式、Flux 负向 Prompt、单模型多张或多模型生成与独立飞书反馈
 * [POS]: public 的生成状态编排器，不接触 OneAPI Key、ComfyUI 地址、Prompt 正文或 SeedVR2 工作流正文
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { bindConfigRefresh } from "./config-refresh.js";
import { bindConnectionCenter } from "./connection-center.js";
import { createAppElements } from "./app-elements.js";
import { bindDesignInputs } from "./design-inputs.js?v=2";
import { bindFluxNegativePrompt } from "./flux-negative-prompt.js";
import { bindGenerationCount } from "./generation-count.js";
import { buildGenerationInput } from "./generation-input.js";
import { bindGenerationActions } from "./generation-actions.js";
import { bindGenerationResults } from "./generation-results.js";
import { bindGenerationTaskController } from "./generation-task-controller.js";
import { bindImageUpscale } from "./image-upscale.js";
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
  modelKeys: ["aiTextureEnhancement"],
  promptAgentCatalog: [],
  promptAgentModelKey: "gemini3pro",
  ratioMode: "auto",
  referencePolicy: null,
  fusionPromptConfig: { defaultVersion: null, versions: [] },
  larkReady: false,
  smartDefaultConfig: { available: false, reason: "读取中", version: null },
};
let referenceUpload;
let styleReferenceUpload;
const elements = createAppElements();
const emptyRoomType = bindDesignInputs({ root: document.querySelector("#emptyRoomTypeList"),
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
const imageUpscale = bindImageUpscale({
  availability: elements.imageUpscaleAvailability,
  emptyModel: elements.emptyModel,
  emptySize: elements.emptySize,
  exactSize: elements.exactSize,
  getSourceImage: () => selectedSourceImage(),
  onChange: () => generationActions.refresh(),
  resolutionSelect: elements.resolutionSelect,
  workflowList: elements.imageUpscaleWorkflowList,
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
  if (state.featureMode === "imageUpscale") return 1;
  return referenceCapability({
    featureMode: state.featureMode,
    model: selectedModel(),
    policy: state.referencePolicy,
  }).limit;
}

function updateReferenceRequirements() {
  if (state.featureMode === "imageUpscale") {
    elements.referenceTitleCopy.textContent = "待超分图片";
    elements.referenceOptional.textContent = "必填 · 1张";
    elements.referenceDropLabel.textContent = "添加或拖入待超分图片";
    elements.referenceInput.multiple = false;
    elements.referenceInput.ariaLabel = "添加待超分图片";
    return;
  }
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
    "imageUpscale",
    "panoramaEnhancement",
    "refinedModel",
    "styleDna",
    "whiteModel",
  ];
  if (!supported.includes(featureMode)) return;
  state.featureMode = featureMode;
  if (featureMode === "panoramaEnhancement" && state.catalog.length) {
    state.modelKeys = state.modelKeys.filter((key) =>
      state.catalog.some((model) => model.key === key
        && (model.sizingMode === "source" || model.sizes["2:1"])));
    if (!state.modelKeys.length) state.modelKeys = ["aiTextureEnhancement"];
  }
  const isWhiteModel = featureMode === "whiteModel";
  const isEmptyRoom = featureMode === "emptyRoom";
  const isDesignModel = isWhiteModel || isEmptyRoom;
  const isEffectEnhancement = featureMode === "effectEnhancement";
  const isPanoramaEnhancement = featureMode === "panoramaEnhancement";
  const isRefinedModel = featureMode === "refinedModel";
  const isStyleDna = featureMode === "styleDna";
  const isImageUpscale = featureMode === "imageUpscale";
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
  elements.imageUpscaleSection.classList.toggle("hidden", !isImageUpscale);
  elements.modelSection.classList.toggle("hidden", isImageUpscale);
  elements.effectEnhancementSection.classList.toggle("hidden", !isEffectEnhancement);
  elements.emptyRoomTypeSection.classList.toggle("hidden", !isEmptyRoom);
  emptyRoomType.setFeatureMode(featureMode);
  elements.styleReferenceSection.classList.toggle("hidden", !isDesignModel);
  elements.styleTitle.textContent = isEmptyRoom ? "设计风格" : "风格选择";
  elements.whiteModelRenderModeList.setAttribute("aria-label",
    isEmptyRoom ? "空房设计风格选择" : "白模风格选择");
  elements.refinedPromptSection.classList.toggle("hidden", !isRefinedModel);
  elements.promptSection.classList.toggle(
    "hidden", isRefinedModel || isEffectEnhancement || isPanoramaEnhancement || isImageUpscale,
  );
  elements.ratioField.classList.toggle("hidden", isImageUpscale);
  elements.generationCountField.classList.toggle("hidden", isImageUpscale);
  elements.qualityField.classList.toggle("hidden", isImageUpscale);
  if (isImageUpscale) {
    fluxNegativePrompt.render([]);
    imageUpscale.activate();
  } else configurePrimaryModel();
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
                : quality === "high"
                  ? "高"
                  : quality === "xhigh"
                    ? "极高"
                    : "最高",
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

function configureSizeControls({
  preserveResolution = false,
  ratioMode = state.ratioMode,
} = {}) {
  const model = selectedModel();
  const sourceImage = selectedSourceImage();
  const controls = sizeControlState({
    currentRatio: elements.ratioSelect.value,
    currentResolution: elements.resolutionSelect.value,
    featureMode: state.featureMode,
    model,
    preserveResolution,
    ratioMode,
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
    featureMode: state.featureMode,
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
  presentOption: (model) => state.featureMode === "panoramaEnhancement"
    && model.sizingMode !== "source" && !model.sizes["2:1"]
    ? { label: `${model.label} · 不支持 2:1`, selectable: false }
    : describeFinalModelOption(model),
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
  const imageUpscaleRequest = featureMode === "imageUpscale";
  if (generationTasks.view(featureMode).stage === "loading") return;
  if (!state.larkReady && !imageUpscaleRequest) {
    connectionCenter.open();
    showToast("飞书同步合同未通过，已阻止生成");
    return;
  }
  const models = imageUpscaleRequest ? [imageUpscale.currentItem()] : selectedModels();
  const whiteModelRequest = featureMode === "whiteModel";
  const emptyRoomRequest = featureMode === "emptyRoom";
  const designPromptRequest = whiteModelRequest || emptyRoomRequest;
  const refinedModelRequest = featureMode === "refinedModel";
  const effectEnhancementRequest = featureMode === "effectEnhancement";
  const panoramaEnhancementRequest = featureMode === "panoramaEnhancement";
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
  if (imageUpscaleRequest) {
    if (!imageUpscale.isAvailable()) {
      showToast("ComfyUI 当前不可用，请检查工作流服务");
      return;
    }
    if (referenceImages().length !== 1) {
      showToast("图片超分需要且只允许 1 张待处理图片");
      return;
    }
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
  if ((effectEnhancementRequest || panoramaEnhancementRequest)
    && referenceImages().length !== 1) {
    showToast(panoramaEnhancementRequest
      ? "全景图美化需要且只允许 1 张待美化全景图"
      : "效果图美化需要且只允许 1 张待美化效果图");
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
  const loadingCopy = imageUpscaleRequest ? imageUpscale.loadingCopy() : generationLoadingCopy({
    designPromptRequest,
    emptyRoomRequest,
    effectEnhancementRequest,
    panoramaEnhancementRequest,
    forcePromptRegeneration,
    generationCount: generationCount.value(),
    models,
    refinedModelRequest,
    refinedPrompt: elements.refinedPromptInput.value.trim(),
    renderMode: whiteModelRenderMode.current().mode,
    styleReferenceCount: styleReferenceImages().length,
  });
  const generationItems = imageUpscaleRequest
    ? models
    : generationItemsForSelection(models, generationCount.value());
  const sourceImage = selectedSourceImage();
  const task = createGenerationTask({
    featureMode,
    loadingLabel: loadingCopy,
    models: generationItems,
  });
  generationTasks.start(task, { comparisonImage: sourceImage });

  try {
    const baseInput = imageUpscaleRequest ? null : generationInput();
    const batchId = generationItems.length > 1
      ? crypto.randomUUID().replaceAll("-", "")
      : null;
    const body = await api("/api/generation-jobs", {
      body: JSON.stringify(imageUpscaleRequest
        ? imageUpscale.jobRequest({ image: sourceImage, jobId: task.jobId })
        : buildGenerationJobRequest({
          baseInput, batchId, featureMode,
          forcePromptRegeneration: designPromptRequest && forcePromptRegeneration,
          jobId: task.jobId, models: generationItems, sourceImage,
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
      ? imageUpscaleRequest
        ? `${completed} 张图片超分已完成`
        : `${completed} 张图已完成，正在分别同步飞书`
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
    state.featureMode === "emptyRoom" ? emptyRoomType.requestFields() : null,
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
  onLarkStateChange(setup) {
    state.larkReady = Boolean(setup?.ready);
  },
  showToast,
});

async function initialize() {
  const [catalogBody, sessionBody, imageUpscaleConfig] = await Promise.all([
    api("/api/catalog"),
    connectionCenter.load(),
    api("/api/image-upscale/config"),
  ]);
  state.catalog = catalogBody.models;
  state.promptAgentCatalog = catalogBody.agentModels;
  state.referencePolicy = catalogBody.referenceImage;
  imageUpscale.configure(imageUpscaleConfig);
  emptyRoomType.setOptions(catalogBody.emptyRoomTypes, catalogBody.emptyRoomTypeDetailMaxLength, catalogBody.emptyRoomFurniture, catalogBody.otherFurnitureMaxLength);
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
          : state.featureMode === "panoramaEnhancement"
            ? "待美化全景图"
            : state.featureMode === "imageUpscale" ? "待超分图片" : "参考图",
  input: elements.referenceInput,
  list: elements.referenceList,
  onChange({ images, previousImages }) {
    if (images[0]?.id !== previousImages[0]?.id) state.ratioMode = "auto";
    generationActions.refresh();
    if (state.featureMode === "imageUpscale") imageUpscale.renderSummary();
    else {
      configureSizeControls({ preserveResolution: true });
      updateComputedSize();
    }
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
  configureSizeControls({ preserveResolution: true, ratioMode: "manual" });
  updateComputedSize();
});
elements.resolutionSelect.addEventListener("change", () => {
  if (state.featureMode === "imageUpscale") imageUpscale.renderSummary();
  else updateComputedSize();
  generationActions.refresh();
});
initialize().catch((error) => {
  generationResults.showError(`工作台初始化失败：${error.message}`);
});

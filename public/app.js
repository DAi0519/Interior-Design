/**
 * [INPUT]: 依赖页面 DOM、精模预设 Prompt 与可选用户要求、白模智能默认/固定风格路由、支持单图原位替换的双参考图上传、含 Flux 双档位的模型多选/批量调度/结果画廊、连接中心、生成动作、Style DNA 对话及统一生成接口
 * [OUTPUT]: 对外提供精模自定义要求、白模与可选风格参考图整合及拖入替换、自由生图、最多四模型各出一张、逐模型参数适配与独立飞书反馈
 * [POS]: public 的生成状态编排器，不接触 OneAPI Key、ComfyUI 地址、精模 Prompt 正文或工作流正文
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { bindConfigRefresh } from "./config-refresh.js";
import { bindConnectionCenter } from "./connection-center.js";
import { bindGenerationActions } from "./generation-actions.js";
import { adaptGenerationInputForModel, runGenerationBatch } from "./generation-batch.js";
import { bindGenerationResults } from "./generation-results.js";
import { describeFinalModelOption, finalModelCatalogStatus } from "./final-model-availability.js";
import { bindModelMultiSelect } from "./model-multi-select.js";
import { bindPromptAgentVersionSelect } from "./prompt-agent-version-select.js?v=2";
import { bindReferenceUpload } from "./reference-upload.js?v=2";
import { bindRefinedPromptVersionSelect } from "./refined-prompt-version-select.js";
import { bindStyleDnaChat } from "./style-dna-chat.js";
import { bindWhiteModelRenderMode } from "./white-model-render-mode.js";
import { referenceCapability, sizeControlState, sizeSummary } from "./model-capabilities.js";
import { api, fillSelect } from "./workbench-utils.js";
import "./custom-select.js?v=5";

const state = {
  availablePromptAgents: new Map(),
  catalog: [],
  connected: false,
  featureMode: "whiteModel",
  generating: false,
  modelKeys: ["seedream5"],
  promptAgentCatalog: [],
  promptAgentModelKey: "gemini3pro",
  ratioMode: "auto",
  referencePolicy: null,
};

let referenceUpload;
let styleReferenceUpload;

const elements = {
  emptyModel: document.querySelector("#emptyModel"),
  emptySize: document.querySelector("#emptySize"),
  exactSize: document.querySelector("#exactSize"),
  featureModeButtons: Array.from(document.querySelectorAll("[data-feature-mode]")),
  formatSelect: document.querySelector("#formatSelect"),
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
  toast: document.querySelector("#toast"),
  whiteModelRenderModeList: document.querySelector("#whiteModelRenderModeList"),
};

const promptAgentVersionSelect = bindPromptAgentVersionSelect({
  availability: elements.promptAgentVersionAvailability,
  select: elements.promptAgentVersionSelect,
});
const refinedPromptVersionSelect = bindRefinedPromptVersionSelect({
  availability: elements.refinedPromptAvailability,
  note: elements.refinedPromptNote,
  select: elements.refinedPromptVersionSelect,
});

function selectedModels() {
  return state.modelKeys.map((key) =>
    state.catalog.find((model) => model.key === key)).filter(Boolean);
}

function selectedModel() { return selectedModels()[0]; }

function referenceImages() { return referenceUpload?.images() || []; }
function styleReferenceImages() { return styleReferenceUpload?.images() || []; }

function selectedSourceImage() {
  return state.featureMode === "styleDna" ? null : referenceImages()[0];
}

function selectedPromptAgentModel() {
  return state.promptAgentCatalog.find(
    (model) => model.key === state.promptAgentModelKey);
}

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
  elements.promptAgentNote.textContent = selected?.note || "用于理解白模并整合最终提示词。";
}

function selectPromptAgent(modelKey) {
  const model = state.promptAgentCatalog.find((entry) => entry.key === modelKey);
  const live = model && state.availablePromptAgents.get(model.id);
  if (!model || !model.imageInput || (live && !live.selectable)) return;
  state.promptAgentModelKey = modelKey;
  renderPromptAgentModels();
}

function renderPromptAgentContext(smartDefault) {
  elements.promptAgentTitle.textContent = smartDefault
    ? "智能默认 Agent"
    : "场景融合 Agent";
  elements.promptAgentVersionAvailability.classList.toggle("hidden", smartDefault);
  elements.promptAgentVersionField.classList.toggle("hidden", smartDefault);
  elements.promptAgentVersionLabel.classList.toggle("hidden", smartDefault);
  elements.promptAgentModelLabelCopy.textContent = smartDefault
    ? "Agent 基模"
    : "融合基模";
  elements.promptAgentModelSelect.setAttribute(
    "aria-label",
    smartDefault ? "智能默认 Agent 基模" : "融合基模",
  );
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
  if (!["free", "refinedModel", "styleDna", "whiteModel"].includes(featureMode)) return;
  state.featureMode = featureMode;
  const isWhiteModel = featureMode === "whiteModel";
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
  if (isStyleDna) return;

  const smartDefault = whiteModelRenderMode.current().mode === "smart-default";
  elements.promptAgentSection.classList.toggle("hidden", !isWhiteModel);
  if (isWhiteModel) renderPromptAgentContext(smartDefault);
  elements.styleSection.classList.toggle("hidden", !isWhiteModel);
  elements.styleReferenceSection.classList.toggle("hidden", !isWhiteModel);
  elements.refinedPromptSection.classList.toggle("hidden", !isRefinedModel);
  elements.promptSection.classList.toggle("hidden", isRefinedModel);
  configurePrimaryModel();
  updateReferenceRequirements();
  referenceUpload.render();
}

function renderModelSelect() {
  modelMultiSelect.render(state.catalog, state.modelKeys);
  const count = state.modelKeys.length;
  elements.modelNote.textContent = count === 1
    ? `${selectedModel()?.description || ""} 可继续选择，最多 4 个。`
    : `已选择 ${count} 个；参数以 ${selectedModel()?.label} 为编辑基准，每个模型各生成 1 张。`;
}

function configurePrimaryModel() {
  if (!selectedModel()) return;
  if (selectedSourceImage()) state.ratioMode = "auto";
  const model = selectedModel();
  const formats = model.formats.filter((format) =>
    !["refinedModel", "whiteModel"].includes(state.featureMode) || format !== "webp");
  renderModelSelect();
  updateReferenceRequirements();
  configureSizeControls();
  fillSelect(
    elements.formatSelect,
    formats.map((format) => ({
      label: format === "jpeg" ? "JPEG" : format.toUpperCase(),
      value: format,
    })),
    model.defaultFormat,
  );

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
  } else if (model.workflowProfiles.length > 0) {
    elements.qualityField.classList.remove("hidden");
    elements.qualityLabel.textContent = "生成档位";
    fillSelect(
      elements.qualitySelect,
      model.workflowProfiles.map(({ label, value }) => ({ label, value })),
      model.defaultWorkflowProfile,
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
  const model = selectedModel();
  return {
    modelKey: model?.key,
    outputFormat: elements.formatSelect.value,
    prompt: state.featureMode === "refinedModel"
      ? elements.refinedPromptInput.value.trim()
      : elements.promptInput.value.trim(),
    quality: model?.qualityOptions.length
      ? elements.qualitySelect.value || undefined
      : undefined,
    ratio: elements.ratioSelect.value,
    ratioMode: selectedSourceImage() ? state.ratioMode : "manual",
    referenceImages: referenceImages().map(
      ({ dataUrl, name, size, type }) => ({
        dataUrl,
        name,
        size,
        type,
      }),
    ),
    ...(state.featureMode === "whiteModel"
      ? {
          styleReferenceImages: styleReferenceImages().map(
            ({ dataUrl, name, size, type }) => ({
              dataUrl,
              name,
              size,
              type,
            }),
          ),
        }
      : {}),
    resolution: elements.resolutionSelect.value,
    workflowProfile: model?.workflowProfiles.length
      ? elements.qualitySelect.value || undefined
      : undefined,
    renderMode: renderMode.mode,
    smartDefaultAgentVersion: renderMode.agentVersion || undefined,
    styleCode: renderMode.styleCode || undefined,
    promptAgentModelKey: state.promptAgentModelKey,
    promptAgentVersion: promptAgentVersionSelect.value(),
    promptVersion: refinedPromptVersionSelect.value(),
  };
}

function updatePromptCount() {
  elements.promptCount.textContent = `${elements.promptInput.value.length} / 8000`;
}

function updateRefinedPromptCount() {
  elements.refinedPromptCount.textContent = `${elements.refinedPromptInput.value.length} / 8000`;
}

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
  generationActions.setBusy(state.generating);
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
  if (state.generating) return;
  const models = selectedModels();
  const whiteModelRequest = state.featureMode === "whiteModel";
  const refinedModelRequest = state.featureMode === "refinedModel";
  const requiresOneApi = whiteModelRequest || models.some(
    (model) => model.provider !== "comfyui");
  if (!state.connected && requiresOneApi) {
    connectionCenter.open({ focusApi: true });
    return;
  }
  if (models.length < 1 || models.length > 4) {
    showToast("请选择 1–4 个出图模型");
    return;
  }
  if (state.featureMode === "whiteModel") {
    const renderMode = whiteModelRenderMode.current();
    if (!renderMode.available) {
      showToast(renderMode.reason || "飞书智能默认 Agent 暂不可用");
      return;
    }
    if (renderMode.mode === "style-dna") {
      if (!promptAgentVersionSelect.value()) {
        showToast("飞书场景融合 Agent 没有可用的已上架版本");
        return;
      }
      if (!renderMode.style) {
        showToast("飞书风格库没有可用的已上架 Style DNA");
        return;
      }
    }
    if (referenceImages().length !== 1) {
      showToast("白模渲染需要且只允许 1 张白模图");
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
  if (
    state.featureMode === "free" &&
    models.some((model) => model.requiresReferenceImage) &&
    referenceImages().length !== 1
  ) {
    const required = models.find((model) => model.requiresReferenceImage);
    showToast(`${required.label} 需要且只允许 1 张参考图`);
    return;
  }
  if (
    state.featureMode === "free" &&
    models.some((model) => model.provider !== "comfyui") &&
    elements.promptInput.value.trim().length < 3
  ) {
    elements.promptInput.focus();
    showToast("请先输入至少 3 个字符的提示词");
    return;
  }

  const promptIdentity = whiteModelRequest ? generationActions.currentIdentity() : null;
  state.generating = true;
  generationActions.setBusy(true);
  const loadingCopy =
    whiteModelRequest && forcePromptRegeneration
      ? "正在重新生成提示词并渲染…"
      : whiteModelRequest
      ? whiteModelRenderMode.current().mode === "smart-default"
        ? styleReferenceImages().length
          ? "正在结合白模与风格参考图生成提示词…"
          : "正在分析白模并智能匹配材质与光线…"
        : styleReferenceImages().length
          ? "正在结合白模、风格参考图与 Style DNA…"
          : "正在读取 Style DNA，由 Prompt Agent 整合后渲染…"
      : refinedModelRequest
        ? elements.refinedPromptInput.value.trim()
          ? "正在拼接自定义要求并忠实渲染精模…"
          : "正在读取固定 Prompt 并忠实渲染精模…"
        : models.length > 1
          ? `正在向 ${models.length} 个模型提交请求…`
          : `正在向 ${models[0].label} 提交生成请求…`;
  generationResults.showLoading(loadingCopy);

  try {
    const endpoint = whiteModelRequest
      ? "/api/white-model-render"
      : refinedModelRequest
        ? "/api/refined-model-render"
        : "/api/generate";
    const baseInput = generationInput();
    const batchId = models.length > 1
      ? crypto.randomUUID().replaceAll("-", "")
      : null;
    const outcomes = await runGenerationBatch({
      concurrency: forcePromptRegeneration ? 1 : 2,
      items: models,
      onProgress({ completed, total }) {
        generationResults.showLoading(`已完成 ${completed} / ${total} 个模型…`);
      },
      execute(model, index) {
        const input = adaptGenerationInputForModel(baseInput, model, {
          featureMode: state.featureMode,
          sourceImage: selectedSourceImage(),
        });
        return api(endpoint, {
          body: JSON.stringify({
            ...input,
            batchCount: models.length,
            batchId,
            batchIndex: index + 1,
            forcePromptRegeneration:
              whiteModelRequest && forcePromptRegeneration && index === 0,
          }),
          method: "POST",
        });
      },
    });
    const completed = outcomes.filter((outcome) => outcome.status === "fulfilled").length;
    if (whiteModelRequest && completed > 0) generationActions.markReusable(promptIdentity);
    generationResults.showResults(outcomes);
    showToast(completed === models.length
      ? `${completed} 张图已完成，正在分别同步飞书`
      : `完成 ${completed} / ${models.length} 张；失败项可查看原因`);
  } catch (error) {
    generationResults.showError(error.message);
  } finally {
    state.generating = false;
    generationActions.setBusy(false);
  }
}

const generationActions = bindGenerationActions({
  getPromptIdentity: () => JSON.stringify([
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
    if (state.featureMode === "whiteModel") selectFeatureMode("whiteModel");
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
  styleDnaChat.setCatalog(catalogBody.agentModels);
  renderPromptAgentModels();
  selectFeatureMode(state.featureMode);
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
  onPromptAgentVersions(config) {
    promptAgentVersionSelect.render(config);
    generationActions.clearReusable();
  },
  onSmartDefault(config) {
    whiteModelRenderMode.setSmartDefault(config);
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
    : state.featureMode === "refinedModel"
      ? "精模图"
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
  onChange: generationActions.refresh,
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
elements.ratioSelect.addEventListener("change", () => {
  if (selectedSourceImage()) state.ratioMode = "manual";
  updateComputedSize();
});
elements.resolutionSelect.addEventListener("change", updateComputedSize);
initialize().catch((error) => {
  generationResults.showError(`工作台初始化失败：${error.message}`);
});

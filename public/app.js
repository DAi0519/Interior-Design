/**
 * [INPUT]: 依赖页面 DOM、浏览器图片尺寸、model-capabilities.js、连接中心、生成动作状态、Style DNA 对话、模型目录及统一生成接口
 * [OUTPUT]: 对外提供默认 Seedream 5.0、五个 OneAPI 模型与单图 Flux2 Klein ComfyUI 工作流、白模双动作、即时结果及异步飞书反馈
 * [POS]: public 的生成状态控制器，按模型能力约束参考图和尺寸但不接触 OneAPI Key、ComfyUI 地址或工作流正文
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { bindConfigRefresh } from "./config-refresh.js";
import { bindConnectionCenter } from "./connection-center.js";
import { bindGenerationActions } from "./generation-actions.js";
import { describeFinalModelOption, finalModelCatalogStatus } from "./final-model-availability.js";
import { bindPromptAgentVersionSelect } from "./prompt-agent-version-select.js?v=2";
import { bindStyleDnaChat } from "./style-dna-chat.js";
import { readImageDimensions } from "./image-ratio.js";
import {
  referenceCapability,
  sizeControlState,
  sizeSummary,
} from "./model-capabilities.js";
import {
  api,
  fillSelect,
  formatBytes,
  readFileAsDataUrl,
  resultMetadata,
  secureImageUrl,
} from "./workbench-utils.js";
import "./custom-select.js?v=5";

const STYLE_CODE_KEY = "canvas-lab.style-code";
const state = {
  activeGenerationId: null,
  availablePromptAgents: new Map(),
  catalog: [],
  connected: false,
  featureMode: "whiteModel",
  generating: false,
  lastImageUrl: null,
  modelKey: "seedream5",
  promptAgentCatalog: [],
  promptAgentModelKey: "gemini3pro",
  ratioMode: "auto",
  referenceImages: [],
  referencePolicy: null,
  styleCatalog: [],
  styleCode: sessionStorage.getItem(STYLE_CODE_KEY) || "",
};

const elements = {
  baseRecordButton: document.querySelector("#baseRecordButton"),
  emptyModel: document.querySelector("#emptyModel"),
  emptySize: document.querySelector("#emptySize"),
  emptyState: document.querySelector("#emptyState"),
  errorMessage: document.querySelector("#errorMessage"),
  errorState: document.querySelector("#errorState"),
  exactSize: document.querySelector("#exactSize"),
  featureModeButtons: Array.from(document.querySelectorAll("[data-feature-mode]")),
  formatSelect: document.querySelector("#formatSelect"),
  generationControls: Array.from(document.querySelectorAll(".generation-control")),
  generationResults: Array.from(document.querySelectorAll(".generation-result")),
  imageResult: document.querySelector("#imageResult"),
  loadingLabel: document.querySelector("#loadingLabel"),
  loadingState: document.querySelector("#loadingState"),
  modelAvailability: document.querySelector("#modelAvailability"),
  modelNote: document.querySelector("#modelNote"),
  modelSelect: document.querySelector("#modelSelect"),
  promptCount: document.querySelector("#promptCount"),
  promptAgentAvailability: document.querySelector("#promptAgentAvailability"),
  promptAgentModelSelect: document.querySelector("#promptAgentModelSelect"),
  promptAgentNote: document.querySelector("#promptAgentNote"),
  promptAgentSection: document.querySelector("#promptAgentSection"),
  promptAgentVersionAvailability: document.querySelector("#promptAgentVersionAvailability"),
  promptAgentVersionSelect: document.querySelector("#promptAgentVersionSelect"),
  promptInput: document.querySelector("#promptInput"),
  qualityField: document.querySelector("#qualityField"),
  qualitySelect: document.querySelector("#qualitySelect"),
  ratioSelect: document.querySelector("#ratioSelect"),
  referenceCount: document.querySelector("#referenceCount"),
  referenceDropLabel: document.querySelector("#referenceDropLabel"),
  referenceDropZone: document.querySelector("#referenceDropZone"),
  referenceInput: document.querySelector("#referenceInput"),
  referenceList: document.querySelector("#referenceList"),
  referenceOptional: document.querySelector("#referenceOptional"),
  referenceTitleCopy: document.querySelector("#referenceTitleCopy"),
  resolutionSelect: document.querySelector("#resolutionSelect"),
  resultDuration: document.querySelector("#resultDuration"),
  resultImage: document.querySelector("#resultImage"),
  resultMeta: document.querySelector("#resultMeta"),
  resultModel: document.querySelector("#resultModel"),
  retryButton: document.querySelector("#retryButton"),
  styleAvailability: document.querySelector("#styleAvailability"),
  styleNote: document.querySelector("#styleNote"),
  styleSection: document.querySelector("#styleSection"),
  styleSelect: document.querySelector("#styleSelect"),
  toast: document.querySelector("#toast"),
};

const promptAgentVersionSelect = bindPromptAgentVersionSelect({
  availability: elements.promptAgentVersionAvailability,
  select: elements.promptAgentVersionSelect,
});

function selectedModel() { return state.catalog.find((model) => model.key === state.modelKey); }

function selectedSourceImage() {
  return state.featureMode === "styleDna" ? null : state.referenceImages[0];
}

function selectedPromptAgentModel() {
  return state.promptAgentCatalog.find(
    (model) => model.key === state.promptAgentModelKey);
}

function selectedStyle() {
  return state.styleCatalog.find((style) => style.code === state.styleCode);
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

function setStyleCode(styleCode) {
  state.styleCode = styleCode;
  if (styleCode) sessionStorage.setItem(STYLE_CODE_KEY, styleCode);
  else sessionStorage.removeItem(STYLE_CODE_KEY);
}

function renderStyles() {
  const styles = [...state.styleCatalog].sort((left, right) =>
    left.name.localeCompare(right.name) || right.version - left.version);
  const selectableStyles = styles.filter((style) => style.published && style.validDna);
  const blocked = state.styleCatalog.find((style) => style.reason);
  if (!selectableStyles.some((style) => style.code === state.styleCode)) {
    setStyleCode(selectableStyles[0]?.code || "");
  }

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.disabled = true;
  placeholder.selected = !state.styleCode;
  placeholder.textContent = blocked
    ? `${blocked.name} · ${blocked.reason}`
    : state.styleCatalog.length
      ? "没有已上架风格"
    : "飞书风格库暂无记录";

  const options = styles.map((style) => {
    const option = document.createElement("option");
    option.disabled = !style.published || !style.validDna;
    option.value = style.code;
    option.selected = style.code === state.styleCode;
    option.textContent = `${style.name} · v${style.version}${style.reason ? ` · ${style.reason}` : ""}`;
    return option;
  });
  elements.styleSelect.replaceChildren(
    ...(selectableStyles.length > 0 ? options : [placeholder, ...options]),
  );
  elements.styleSelect.disabled = selectableStyles.length === 0;
  elements.styleAvailability.textContent = `${selectableStyles.length} / ${state.styleCatalog.length} 可选`;
  elements.styleAvailability.classList.toggle("ready", selectableStyles.length > 0);

  const selected = selectedStyle();
  elements.styleNote.textContent = selected
    ? selected.description || `${selected.name} Style DNA 已就绪。`
    : blocked
      ? `${blocked.name}：${blocked.reason}；在飞书上架后即可选择。`
      : "请先在飞书风格库创建并上架 Style DNA。";
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
  if (!["free", "styleDna", "whiteModel"].includes(featureMode)) return;
  state.featureMode = featureMode;
  const isWhiteModel = featureMode === "whiteModel";
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

  elements.promptAgentSection.classList.toggle("hidden", !isWhiteModel);
  elements.styleSection.classList.toggle("hidden", !isWhiteModel);
  selectModel(state.modelKey);
  updateReferenceRequirements();
  renderReferenceImages();
}

function renderModelSelect() {
  const options = state.catalog.map((model) => {
    const presentation = describeFinalModelOption(model);
    const option = document.createElement("option");
    option.disabled = !presentation.selectable;
    option.value = model.key;
    option.selected = model.key === state.modelKey;
    option.textContent = presentation.label;
    return option;
  });
  elements.modelSelect.replaceChildren(...options);
  elements.modelNote.textContent =
    selectedModel()?.description || "选择负责最终图像生成的模型。";
}

function selectModel(modelKey) {
  if (!state.catalog.some((entry) => entry.key === modelKey)) return;
  state.modelKey = modelKey;
  if (selectedSourceImage()) state.ratioMode = "auto";
  const model = selectedModel();
  const formats = model.formats.filter((format) => state.featureMode !== "whiteModel" || format !== "webp");
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
  renderReferenceImages();
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
  const style = selectedStyle();
  return {
    modelKey: state.modelKey,
    outputFormat: elements.formatSelect.value,
    prompt: elements.promptInput.value.trim(),
    quality: elements.qualitySelect.value || undefined,
    ratio: elements.ratioSelect.value,
    ratioMode: selectedSourceImage() ? state.ratioMode : "manual",
    referenceImages: state.referenceImages.map(
      ({ dataUrl, name, size, type }) => ({
        dataUrl,
        name,
        size,
        type,
      }),
    ),
    resolution: elements.resolutionSelect.value,
    styleCode: style?.code,
    promptAgentModelKey: state.promptAgentModelKey,
    promptAgentVersion: promptAgentVersionSelect.value(),
  };
}

function updatePromptCount() {
  elements.promptCount.textContent = `${elements.promptInput.value.length} / 8000`;
}

function renderReferenceImages() {
  const policy = state.referencePolicy;
  const limit = referenceLimit();
  elements.referenceCount.textContent = `${state.referenceImages.length} / ${limit}`;
  elements.referenceDropZone.classList.toggle(
    "hidden",
    Boolean(policy && state.referenceImages.length >= limit),
  );

  elements.referenceList.replaceChildren(
    ...state.referenceImages.map((image) => {
      const item = document.createElement("article");
      item.className = "reference-item";

      const preview = document.createElement("img");
      preview.src = image.dataUrl;
      preview.alt = "";

      const copy = document.createElement("div");
      const name = document.createElement("strong");
      const size = document.createElement("span");
      name.textContent = image.name;
      size.textContent = [
        formatBytes(image.size),
        image.width && image.height ? `${image.width} × ${image.height}` : null,
      ].filter(Boolean).join(" · ");
      copy.append(name, size);

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "reference-remove";
      remove.ariaLabel = `移除 ${image.name}`;
      remove.textContent = "×";
      remove.addEventListener("click", () => {
        state.referenceImages = state.referenceImages.filter(
          (entry) => entry.id !== image.id,
        );
        state.ratioMode = "auto";
        renderReferenceImages();
        generationActions.refresh();
        configureSizeControls({ preserveResolution: true });
        updateComputedSize();
      });

      item.append(preview, copy, remove);
      return item;
    }),
  );
}

async function addReferenceFiles(fileList) {
  const policy = state.referencePolicy;
  if (!policy) return;

  const limit = referenceLimit();
  const subject = state.featureMode === "whiteModel" ? "白模图" : "参考图";
  const remaining = limit - state.referenceImages.length;
  if (remaining <= 0) {
    showToast(`最多添加 ${limit} 张${subject}`);
    return;
  }

  const incoming = Array.from(fileList);
  const accepted = incoming.slice(0, remaining);
  if (incoming.length > remaining) {
    showToast(`本次只添加前 ${remaining} 张，最多支持 ${limit} 张${subject}`);
  }

  for (const file of accepted) {
    if (!policy.accept.includes(file.type)) {
      showToast(`${file.name} 不是 PNG、JPEG 或 WebP`);
      return;
    }
    if (file.size > policy.maxBytesPerImage) {
      showToast(`${file.name} 超过单张 8MB 限制`);
      return;
    }
  }

  const currentBytes = state.referenceImages.reduce(
    (total, image) => total + image.size, 0);
  const incomingBytes = accepted.reduce((total, file) => total + file.size, 0);
  if (currentBytes + incomingBytes > policy.maxTotalBytes) {
    showToast("参考图合计不能超过 20MB");
    return;
  }

  let nextImages;
  try {
    nextImages = await Promise.all(
      accepted.map(async (file) => {
        const dataUrl = await readFileAsDataUrl(file);
        const dimensions = await readImageDimensions(dataUrl, file.name);
        return {
          dataUrl,
          ...dimensions,
          id: crypto.randomUUID(),
          name: file.name,
          size: file.size,
          type: file.type,
        };
      }),
    );
  } catch (error) {
    showToast(error.message);
    return;
  }
  state.referenceImages.push(...nextImages);
  if (state.referenceImages.length === nextImages.length) state.ratioMode = "auto";
  renderReferenceImages();
  generationActions.refresh();
  configureSizeControls({ preserveResolution: true });
  updateComputedSize();
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

function setStage(stage) {
  for (const [name, element] of Object.entries({
    empty: elements.emptyState,
    error: elements.errorState,
    image: elements.imageResult,
    loading: elements.loadingState,
  })) {
    element.classList.toggle("hidden", name !== stage);
  }
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.remove("hidden");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => {
    elements.toast.classList.add("hidden");
  }, 2400);
}

function renderResultSummary(result, model, sync = result.sync) {
  elements.resultMeta.textContent = resultMetadata(result, sync);
  elements.baseRecordButton.classList.toggle("hidden", !sync?.recordId);
  if (sync?.recordUrl) {
    elements.baseRecordButton.href = sync.recordUrl;
  } else {
    elements.baseRecordButton.removeAttribute("href");
  }
  elements.resultModel.textContent = model.label;
}

function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function followSyncJob(result, model) {
  const generationId = result.sync?.generationId;
  if (!generationId || result.sync.status !== "pending") return;
  state.activeGenerationId = generationId;

  for (let attempt = 0; attempt < 40; attempt += 1) {
    await wait(1500);
    if (state.activeGenerationId !== generationId) return;
    try {
      const body = await api(`/api/sync-jobs/${encodeURIComponent(generationId)}`);
      if (state.activeGenerationId !== generationId) return;
      renderResultSummary(result, model, body.sync);
      if (body.sync.status === "success") {
        showToast("飞书同步完成");
        return;
      }
      if (body.sync.status === "failed") {
        showToast(`飞书同步失败：${body.sync.error}`);
        return;
      }
    } catch (error) {
      if (attempt === 39) showToast(error.message);
    }
  }
}

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
  const model = selectedModel();
  const whiteModelRequest = state.featureMode === "whiteModel";
  const requiresOneApi = whiteModelRequest || model?.provider !== "comfyui";
  if (!state.connected && requiresOneApi) {
    connectionCenter.open({ focusApi: true });
    return;
  }
  if (state.featureMode === "whiteModel") {
    if (!promptAgentVersionSelect.value()) {
      showToast("飞书场景融合 Agent 没有可用的已上架版本");
      return;
    }
    if (!selectedStyle()) {
      showToast("飞书风格库没有可用的已上架 Style DNA");
      return;
    }
    if (state.referenceImages.length !== 1) {
      showToast("白模渲染需要且只允许 1 张白模图");
      return;
    }
  }
  if (
    state.featureMode === "free" &&
    model?.requiresReferenceImage &&
    state.referenceImages.length !== 1
  ) {
    showToast(`${model.label} 需要且只允许 1 张参考图`);
    return;
  }
  if (
    state.featureMode === "free" &&
    model?.provider !== "comfyui" &&
    elements.promptInput.value.trim().length < 3
  ) {
    elements.promptInput.focus();
    showToast("请先输入至少 3 个字符的提示词");
    return;
  }

  const promptIdentity = whiteModelRequest ? generationActions.currentIdentity() : null;
  state.activeGenerationId = null;
  state.generating = true;
  generationActions.setBusy(true);
  elements.loadingLabel.textContent =
    whiteModelRequest && forcePromptRegeneration
      ? "正在重新融合提示词并渲染…"
      : whiteModelRequest
      ? "正在读取配置，由 Prompt Agent 整合后渲染…"
      : model.provider === "comfyui"
        ? "正在通过 ComfyUI 执行 Flux2 Klein…"
      : state.referenceImages.length > 0
        ? `正在使用 ${state.referenceImages.length} 张参考图生成…`
        : `正在向 ${model.label} 提交生成请求…`;
  setStage("loading");

  try {
    const endpoint = whiteModelRequest ? "/api/white-model-render" : "/api/generate";
    const result = await api(endpoint, {
      body: JSON.stringify({
        ...generationInput(),
        forcePromptRegeneration: whiteModelRequest && forcePromptRegeneration,
      }),
      method: "POST",
    });
    const image = result.images[0];
    const imageUrl = secureImageUrl(image.url);
    state.lastImageUrl = imageUrl;
    elements.resultImage.src = imageUrl;
    renderResultSummary(result, model);
    if (whiteModelRequest) generationActions.markReusable(promptIdentity);
    elements.resultDuration.textContent = `${(result.durationMs / 1000).toFixed(1)} 秒`;
    setStage("image");
    showToast("生成完成，正在后台同步飞书");
    void followSyncJob(result, model);
  } catch (error) {
    elements.errorMessage.textContent = error.message;
    setStage("error");
  } finally {
    state.generating = false;
    generationActions.setBusy(false);
  }
}

const generationActions = bindGenerationActions({
  getPromptIdentity: () => JSON.stringify([
    state.referenceImages.map((image) => image.id), state.styleCode,
    elements.promptInput.value.trim(), state.promptAgentModelKey,
    promptAgentVersionSelect.value(),
  ]),
  onGenerate: () => void generate(),
  onRegenerate: () => void generate({ forcePromptRegeneration: true }),
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
  renderReferenceImages();
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
elements.modelSelect.addEventListener("change", (event) => selectModel(event.target.value));
const loadConfiguration = bindConfigRefresh({
  api,
  onPromptAgentVersions(config) {
    promptAgentVersionSelect.render(config);
    generationActions.clearReusable();
  },
  onStyles(styles) {
    state.styleCatalog = styles;
    renderStyles();
    generationActions.clearReusable();
  },
  showToast,
});
elements.styleSelect.addEventListener("change", (event) => {
  setStyleCode(event.target.value);
  renderStyles();
  generationActions.refresh();
});
elements.retryButton.addEventListener("click", () => generate());
elements.promptInput.addEventListener("input", () => {
  updatePromptCount();
  generationActions.refresh();
});
elements.promptAgentVersionSelect.addEventListener("change", generationActions.refresh);
elements.referenceInput.addEventListener("change", async (event) => {
  await addReferenceFiles(event.target.files);
  event.target.value = "";
});
for (const eventName of ["dragenter", "dragover"]) {
  elements.referenceDropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.referenceDropZone.classList.add("dragging");
  });
}
for (const eventName of ["dragleave", "drop"]) {
  elements.referenceDropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.referenceDropZone.classList.remove("dragging");
  });
}
elements.referenceDropZone.addEventListener("drop", async (event) => {
  await addReferenceFiles(event.dataTransfer.files);
});
elements.ratioSelect.addEventListener("change", () => {
  if (selectedSourceImage()) state.ratioMode = "manual";
  updateComputedSize();
});
elements.resolutionSelect.addEventListener("change", updateComputedSize);
initialize().catch((error) => {
  elements.errorMessage.textContent = `工作台初始化失败：${error.message}`;
  setStage("error");
});

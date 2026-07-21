/**
 * [INPUT]: 依赖 index.html 的 DOM 节点、/api/catalog/session/check-models/generate 本地接口及生成接口的飞书同步状态
 * [OUTPUT]: 对外提供模型选择、多参考图上传、参数联动、密钥会话、结果展示与飞书记录跳转
 * [POS]: public 的浏览器状态控制器，不保存 API Key，不直接访问公司 OneAPI 或飞书
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

const state = {
  availableModels: new Map(),
  catalog: [],
  connected: false,
  generating: false,
  lastImageUrl: null,
  modelKey: "bananaPro",
  referenceImages: [],
  referencePolicy: null,
};

const MODEL_UI = Object.freeze({
  bananaPro: { compactLabel: "Banana Pro", icon: "BP" },
  banana2: { compactLabel: "Banana 2", icon: "B2" },
  gptImage2: { compactLabel: "GPT 2", icon: "G2" },
  seedream5: { compactLabel: "Seedream", icon: "S5" },
});

const elements = {
  apiKeyInput: document.querySelector("#apiKeyInput"),
  baseRecordButton: document.querySelector("#baseRecordButton"),
  closeDialogButton: document.querySelector("#closeDialogButton"),
  closeRequestButton: document.querySelector("#closeRequestButton"),
  connectionButton: document.querySelector("#connectionButton"),
  connectionDialog: document.querySelector("#connectionDialog"),
  connectionError: document.querySelector("#connectionError"),
  connectionLabel: document.querySelector("#connectionLabel"),
  disconnectButton: document.querySelector("#disconnectButton"),
  emptyModel: document.querySelector("#emptyModel"),
  emptySize: document.querySelector("#emptySize"),
  emptyState: document.querySelector("#emptyState"),
  errorMessage: document.querySelector("#errorMessage"),
  errorState: document.querySelector("#errorState"),
  exactSize: document.querySelector("#exactSize"),
  formatSelect: document.querySelector("#formatSelect"),
  generateButton: document.querySelector("#generateButton"),
  imageResult: document.querySelector("#imageResult"),
  loadingLabel: document.querySelector("#loadingLabel"),
  loadingState: document.querySelector("#loadingState"),
  modelAvailability: document.querySelector("#modelAvailability"),
  modelList: document.querySelector("#modelList"),
  promptCount: document.querySelector("#promptCount"),
  promptInput: document.querySelector("#promptInput"),
  qualityField: document.querySelector("#qualityField"),
  qualitySelect: document.querySelector("#qualitySelect"),
  ratioSelect: document.querySelector("#ratioSelect"),
  referenceCount: document.querySelector("#referenceCount"),
  referenceDropZone: document.querySelector("#referenceDropZone"),
  referenceInput: document.querySelector("#referenceInput"),
  referenceList: document.querySelector("#referenceList"),
  requestDialog: document.querySelector("#requestDialog"),
  requestPreview: document.querySelector("#requestPreview"),
  requestPreviewButton: document.querySelector("#requestPreviewButton"),
  resolutionSelect: document.querySelector("#resolutionSelect"),
  resultDuration: document.querySelector("#resultDuration"),
  resultImage: document.querySelector("#resultImage"),
  resultMeta: document.querySelector("#resultMeta"),
  resultModel: document.querySelector("#resultModel"),
  retryButton: document.querySelector("#retryButton"),
  saveConnectionButton: document.querySelector("#saveConnectionButton"),
  toast: document.querySelector("#toast"),
};

function selectedModel() {
  return state.catalog.find((model) => model.key === state.modelKey);
}

async function api(pathname, options = {}) {
  const response = await fetch(pathname, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error || `请求失败（${response.status}）`);
  }
  return body;
}

function fillSelect(select, options, currentValue) {
  select.replaceChildren(
    ...options.map((option) => {
      const element = document.createElement("option");
      const value = typeof option === "string" ? option : option.value;
      element.value = value;
      element.textContent = typeof option === "string" ? option : option.label;
      element.selected = value === currentValue;
      return element;
    }),
  );
}

function renderModels() {
  elements.modelList.replaceChildren(
    ...state.catalog.map((model) => {
      const button = document.createElement("button");
      const available = state.availableModels.get(model.id);
      const isSelected = model.key === state.modelKey;
      button.className = [
        "model-option",
        isSelected ? "selected" : "",
        available === false ? "unavailable" : "",
      ]
        .filter(Boolean)
        .join(" ");
      button.dataset.accent = model.accent;
      button.dataset.modelKey = model.key;
      button.type = "button";
      button.role = "radio";
      button.ariaChecked = String(isSelected);
      button.ariaLabel = model.label;
      const modelUi = MODEL_UI[model.key];
      button.innerHTML = `
        <span class="model-icon">${modelUi.icon}</span>
        <span class="model-copy">
          <strong>${modelUi.compactLabel}</strong>
        </span>
      `;
      button.addEventListener("click", () => selectModel(model.key));
      return button;
    }),
  );
}

function selectModel(modelKey) {
  state.modelKey = modelKey;
  const model = selectedModel();
  renderModels();

  fillSelect(elements.ratioSelect, Object.keys(model.sizes), model.defaultRatio);
  fillSelect(
    elements.resolutionSelect,
    Object.keys(model.sizes[model.defaultRatio]),
    model.defaultResolution,
  );
  fillSelect(
    elements.formatSelect,
    model.formats.map((format) => ({
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
      "auto",
    );
  } else {
    elements.qualityField.classList.add("hidden");
    elements.qualitySelect.replaceChildren();
  }

  updateComputedSize();
}

function updateComputedSize() {
  const model = selectedModel();
  const ratio = elements.ratioSelect.value;
  const resolutions = Object.keys(model.sizes[ratio] || {});

  if (!resolutions.includes(elements.resolutionSelect.value)) {
    fillSelect(
      elements.resolutionSelect,
      resolutions,
      resolutions.includes(model.defaultResolution)
        ? model.defaultResolution
        : resolutions[0],
    );
  }

  const size = model.sizes[ratio][elements.resolutionSelect.value];
  elements.exactSize.textContent = size;
  elements.emptyModel.textContent = model.label;
  elements.emptySize.textContent = size.replace("x", " × ");
}

function generationInput() {
  return {
    modelKey: state.modelKey,
    outputFormat: elements.formatSelect.value,
    prompt: elements.promptInput.value.trim(),
    quality: elements.qualitySelect.value || undefined,
    ratio: elements.ratioSelect.value,
    referenceImages: state.referenceImages.map(
      ({ dataUrl, name, size, type }) => ({
        dataUrl,
        name,
        size,
        type,
      }),
    ),
    resolution: elements.resolutionSelect.value,
  };
}

function requestPreview() {
  const model = selectedModel();
  const input = generationInput();
  const size = model.sizes[input.ratio][input.resolution];
  const preview = {
    model: model.id,
    n: 1,
    output_format: input.outputFormat,
    prompt: input.prompt,
    response_format: "url",
    size,
  };
  if (model.qualityOptions.length > 0) preview.quality = input.quality;
  if (state.referenceImages.length > 0) {
    preview.images = state.referenceImages.map((image) => ({
      image_url: `data:${image.type};base64,…`,
      name: image.name,
      size: formatBytes(image.size),
    }));
  }
  return preview;
}

function updatePromptCount() {
  elements.promptCount.textContent = `${elements.promptInput.value.length} / 8000`;
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(new Error(`无法读取 ${file.name}`)));
    reader.readAsDataURL(file);
  });
}

function renderReferenceImages() {
  const policy = state.referencePolicy;
  elements.referenceCount.textContent = `${state.referenceImages.length} / ${policy?.maxCount || 4}`;
  elements.referenceDropZone.classList.toggle(
    "hidden",
    Boolean(policy && state.referenceImages.length >= policy.maxCount),
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
      size.textContent = formatBytes(image.size);
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
        renderReferenceImages();
      });

      item.append(preview, copy, remove);
      return item;
    }),
  );
}

async function addReferenceFiles(fileList) {
  const policy = state.referencePolicy;
  if (!policy) return;

  const remaining = policy.maxCount - state.referenceImages.length;
  if (remaining <= 0) {
    showToast(`最多添加 ${policy.maxCount} 张参考图`);
    return;
  }

  const incoming = Array.from(fileList);
  const accepted = incoming.slice(0, remaining);
  if (incoming.length > remaining) {
    showToast(`本次只添加前 ${remaining} 张，最多支持 ${policy.maxCount} 张`);
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
    (total, image) => total + image.size,
    0,
  );
  const incomingBytes = accepted.reduce((total, file) => total + file.size, 0);
  if (currentBytes + incomingBytes > policy.maxTotalBytes) {
    showToast("参考图合计不能超过 20MB");
    return;
  }

  const nextImages = await Promise.all(
    accepted.map(async (file) => ({
      dataUrl: await readFileAsDataUrl(file),
      id: crypto.randomUUID(),
      name: file.name,
      size: file.size,
      type: file.type,
    })),
  );
  state.referenceImages.push(...nextImages);
  renderReferenceImages();
}

function setConnectionState(connected, source = "memory") {
  state.connected = connected;
  elements.connectionButton.classList.toggle("connected", connected);
  elements.connectionLabel.textContent = connected ? "API 已连接" : "连接 API";
  elements.disconnectButton.classList.toggle(
    "hidden",
    !connected || source === "environment",
  );
  elements.modelAvailability.textContent = connected ? "检查模型中" : "等待连接";
  elements.modelAvailability.classList.toggle("ready", connected);
  elements.generateButton.disabled = state.generating;
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

function openDialog(dialog) {
  dialog.classList.remove("hidden");
}

function closeDialog(dialog) {
  dialog.classList.add("hidden");
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.remove("hidden");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => {
    elements.toast.classList.add("hidden");
  }, 2400);
}

async function checkAvailableModels() {
  if (!state.connected) return;
  try {
    const body = await api("/api/check-models", { method: "POST" });
    state.availableModels = new Map(
      body.models.map((model) => [model.id, model.available]),
    );
    const availableCount = body.models.filter((model) => model.available).length;
    elements.modelAvailability.textContent = `${availableCount} / ${body.models.length} 可用`;
    elements.modelAvailability.classList.add("ready");
    renderModels();
  } catch (error) {
    elements.modelAvailability.textContent = "检查失败";
    elements.modelAvailability.classList.remove("ready");
    showToast(error.message);
  }
}

async function connectApi() {
  const apiKey = elements.apiKeyInput.value.trim();
  elements.connectionError.classList.add("hidden");
  elements.saveConnectionButton.disabled = true;
  elements.saveConnectionButton.textContent = "正在验证…";

  try {
    await api("/api/session", {
      body: JSON.stringify({ apiKey }),
      method: "POST",
    });
    elements.apiKeyInput.value = "";
    setConnectionState(true, "memory");
    closeDialog(elements.connectionDialog);
    showToast("API 已连接");
    await checkAvailableModels();
  } catch (error) {
    elements.connectionError.textContent = error.message;
    elements.connectionError.classList.remove("hidden");
  } finally {
    elements.saveConnectionButton.disabled = false;
    elements.saveConnectionButton.textContent = "验证并连接";
  }
}

async function disconnectApi() {
  const body = await api("/api/session", { method: "DELETE" });
  setConnectionState(body.connected, body.source);
  state.availableModels.clear();
  renderModels();
  closeDialog(elements.connectionDialog);
  showToast(body.connected ? "环境变量密钥仍然有效" : "已断开连接");
}

async function generate() {
  if (state.generating) return;
  if (!state.connected) {
    openDialog(elements.connectionDialog);
    window.setTimeout(() => elements.apiKeyInput.focus(), 0);
    return;
  }
  if (elements.promptInput.value.trim().length < 3) {
    elements.promptInput.focus();
    showToast("请先输入至少 3 个字符的提示词");
    return;
  }

  const model = selectedModel();
  state.generating = true;
  elements.generateButton.disabled = true;
  elements.generateButton.querySelector(".button-label span").textContent =
    "生成中…";
  elements.loadingLabel.textContent =
    state.referenceImages.length > 0
      ? `正在使用 ${state.referenceImages.length} 张参考图生成并同步飞书…`
      : `正在向 ${model.label} 提交请求并同步飞书…`;
  setStage("loading");

  try {
    const result = await api("/api/generate", {
      body: JSON.stringify(generationInput()),
      method: "POST",
    });
    const image = result.images[0];
    state.lastImageUrl = image.url;
    elements.resultImage.src = image.url;
    elements.resultModel.textContent = model.label;
    elements.resultMeta.textContent = [
      result.request.size.replace("x", " × "),
      result.request.outputFormat.toUpperCase(),
      result.request.referenceImageCount > 0
        ? `${result.request.referenceImageCount} 张参考图`
        : null,
      result.sync.ok ? "已同步飞书" : "飞书同步失败",
    ]
      .filter(Boolean)
      .join(" · ");
    elements.resultDuration.textContent = `${(result.durationMs / 1000).toFixed(1)} 秒`;
    elements.baseRecordButton.href = result.sync.recordUrl;
    elements.baseRecordButton.classList.toggle("hidden", !result.sync.recordId);
    setStage("image");
    showToast(
      result.sync.ok
        ? "生成完成，已同步飞书"
        : `图片已生成，但飞书同步失败：${result.sync.error}`,
    );
  } catch (error) {
    elements.errorMessage.textContent = error.message;
    setStage("error");
  } finally {
    state.generating = false;
    elements.generateButton.disabled = false;
    elements.generateButton.querySelector(".button-label span").textContent =
      "开始生成";
  }
}

async function initialize() {
  const [catalogBody, sessionBody] = await Promise.all([
    api("/api/catalog"),
    api("/api/session"),
  ]);
  state.catalog = catalogBody.models;
  state.referencePolicy = catalogBody.referenceImage;
  selectModel(state.modelKey);
  renderReferenceImages();
  updatePromptCount();
  setConnectionState(sessionBody.connected, sessionBody.source);
  if (sessionBody.connected) await checkAvailableModels();
}

elements.connectionButton.addEventListener("click", () => {
  elements.connectionError.classList.add("hidden");
  openDialog(elements.connectionDialog);
  if (!state.connected) {
    window.setTimeout(() => elements.apiKeyInput.focus(), 0);
  }
});
elements.closeDialogButton.addEventListener("click", () =>
  closeDialog(elements.connectionDialog),
);
elements.saveConnectionButton.addEventListener("click", connectApi);
elements.disconnectButton.addEventListener("click", disconnectApi);
elements.generateButton.addEventListener("click", generate);
elements.retryButton.addEventListener("click", generate);
elements.promptInput.addEventListener("input", updatePromptCount);
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
elements.ratioSelect.addEventListener("change", updateComputedSize);
elements.resolutionSelect.addEventListener("change", updateComputedSize);
elements.requestPreviewButton.addEventListener("click", () => {
  elements.requestPreview.textContent = JSON.stringify(requestPreview(), null, 2);
  openDialog(elements.requestDialog);
});
elements.closeRequestButton.addEventListener("click", () =>
  closeDialog(elements.requestDialog),
);

for (const dialog of [elements.connectionDialog, elements.requestDialog]) {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) closeDialog(dialog);
  });
}

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  closeDialog(elements.connectionDialog);
  closeDialog(elements.requestDialog);
});

initialize().catch((error) => {
  elements.errorMessage.textContent = `工作台初始化失败：${error.message}`;
  setStage("error");
});

/**
 * [INPUT]: 依赖 Style DNA 反推 DOM、共享本地 API、公开默认 System Prompt、Agent 模型目录与浏览器文件/剪贴板能力
 * [OUTPUT]: 对外提供 Prompt 会话编辑、模型选择、自适应多行输入、首轮图片分析、后续纯文字修正、多轮对话、结构化草稿展示、复制与重置控制器
 * [POS]: public 的 Style DNA 反推浏览器控制器，与 app.js 的生成控制器按功能模式隔离
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

const MAX_IMAGE_COUNT = 5;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(new Error(`无法读取 ${file.name}`)));
    reader.readAsDataURL(file);
  });
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function messageElement({ content, role }) {
  const article = document.createElement("article");
  const avatar = document.createElement("div");
  const body = document.createElement("div");
  const author = document.createElement("strong");
  const copy = document.createElement("p");
  article.className = `chat-message ${role}-message`;
  avatar.className = "message-avatar";
  avatar.ariaHidden = "true";
  avatar.textContent = role === "assistant" ? "DNA" : "YOU";
  body.className = "message-body";
  author.textContent = role === "assistant" ? "反推 Agent" : "你";
  copy.textContent = content;
  body.append(author, copy);
  article.append(avatar, body);
  return article;
}

function thinkingElement() {
  const article = document.createElement("article");
  const avatar = document.createElement("div");
  const body = document.createElement("div");
  const dots = document.createElement("span");
  article.className = "chat-message assistant-message assistant-thinking";
  avatar.className = "message-avatar";
  avatar.textContent = "DNA";
  body.className = "message-body";
  dots.className = "thinking-dots";
  dots.ariaLabel = "正在分析参考图";
  dots.append(
    document.createElement("i"),
    document.createElement("i"),
    document.createElement("i"),
  );
  body.append(dots);
  article.append(avatar, body);
  return article;
}

function draftField(label, value) {
  const field = document.createElement("div");
  const title = document.createElement("span");
  const copy = document.createElement("p");
  field.className = "dna-draft-field";
  title.textContent = label;
  copy.textContent = value;
  field.append(title, copy);
  return field;
}

function draftElement(result, onCopy) {
  const dna = result.styleDna.style_dna;
  const article = messageElement({
    content: "已生成一版可迁移的 Style DNA 草稿。你可以继续指出要强化、删减或重新判断的部分。",
    role: "assistant",
  });
  const body = article.querySelector(".message-body");
  const card = document.createElement("section");
  const header = document.createElement("header");
  const title = document.createElement("strong");
  const status = document.createElement("span");
  const grid = document.createElement("div");
  const details = document.createElement("details");
  const summary = document.createElement("summary");
  const pre = document.createElement("pre");
  const actions = document.createElement("footer");
  const metadata = document.createElement("span");
  const copyButton = document.createElement("button");
  const json = JSON.stringify(result.styleDna, null, 2);

  card.className = "dna-draft-card";
  header.className = "dna-draft-header";
  title.textContent = "Style DNA 草稿";
  status.className = "dna-draft-status";
  status.textContent = "UNPUBLISHED";
  header.append(title, status);

  grid.className = "dna-draft-grid";
  grid.append(
    draftField("整体风格", dna.overall_style),
    draftField(
      "形态与空间",
      `${dna.form_and_space.language}；${dna.form_and_space.composition}`,
    ),
    draftField(
      "材质与色彩",
      `${dna.material_and_color.materials.join("、")}；${dna.material_and_color.palette}`,
    ),
    draftField(
      "家具与细节",
      `${dna.furniture_and_details.furniture_language}；${dna.furniture_and_details.details}`,
    ),
    draftField(
      "灯光",
      `${dna.lighting.daylight}；${dna.lighting.artificial}`,
    ),
  );

  details.className = "dna-json-details";
  summary.textContent = "查看完整 JSON";
  pre.textContent = json;
  details.append(summary, pre);

  actions.className = "dna-draft-actions";
  metadata.textContent = `${result.model.label} · ${(result.durationMs / 1000).toFixed(1)}s · ${result.referenceImageCount} 张图`;
  copyButton.className = "copy-dna-button";
  copyButton.type = "button";
  copyButton.textContent = "复制 JSON";
  copyButton.addEventListener("click", () => onCopy(json, copyButton));
  actions.append(metadata, copyButton);

  card.append(header, grid, details, actions);
  body.append(card);
  return article;
}

export function bindStyleDnaChat({ api, onConnectionRequired, showToast }) {
  const elements = {
    chat: document.querySelector("#styleDnaChat"),
    controls: document.querySelector("#styleDnaControls"),
    dropZone: document.querySelector("#styleDnaReferenceDropZone"),
    input: document.querySelector("#styleDnaMessageInput"),
    modelAvailability: document.querySelector("#styleDnaModelAvailability"),
    modelSelect: document.querySelector("#styleDnaModelSelect"),
    promptNote: document.querySelector("#styleDnaPromptNote"),
    promptResetButton: document.querySelector("#styleDnaPromptResetButton"),
    promptState: document.querySelector("#styleDnaPromptState"),
    referenceCount: document.querySelector("#styleDnaReferenceCount"),
    referenceInput: document.querySelector("#styleDnaReferenceInput"),
    referenceList: document.querySelector("#styleDnaReferenceList"),
    resetButton: document.querySelector("#styleDnaResetButton"),
    sendButton: document.querySelector("#styleDnaSendButton"),
    systemPrompt: document.querySelector("#styleDnaSystemPrompt"),
    thread: document.querySelector("#styleDnaThread"),
    uploadButton: document.querySelector("#styleDnaUploadButton"),
  };
  const state = {
    agentVersion: "",
    availability: new Map(),
    catalog: [],
    connected: false,
    defaultSystemPrompt: "",
    images: [],
    messages: [],
    modelKey: "gemini3pro",
    sending: false,
  };

  function renderPromptState() {
    if (!state.defaultSystemPrompt) return;
    const isDefault =
      elements.systemPrompt.value.trim() === state.defaultSystemPrompt.trim();
    elements.promptState.textContent = isDefault
      ? `默认 v${state.agentVersion}`
      : "已编辑";
    elements.promptResetButton.disabled = isDefault;
  }

  async function loadAgentConfig() {
    try {
      const config = await api("/api/style-dna-reverse/config");
      state.agentVersion = config.agent.version;
      state.defaultSystemPrompt = config.systemPrompt;
      elements.systemPrompt.value = config.systemPrompt;
      elements.systemPrompt.disabled = false;
      elements.promptNote.textContent =
        "默认 Prompt 从服务端读取，可在本次会话内编辑。";
      renderPromptState();
    } catch (error) {
      elements.promptState.textContent = "读取失败";
      elements.promptNote.textContent = error.message;
    }
  }

  function selectedModel() {
    return state.catalog.find((model) => model.key === state.modelKey);
  }

  function renderModels() {
    const options = state.catalog.map((model) => {
      const live = state.availability.get(model.id);
      const selectable = live ? live.selectable : model.imageInput;
      const option = document.createElement("option");
      option.value = model.key;
      option.disabled = !selectable;
      option.selected = model.key === state.modelKey;
      option.textContent = `${model.shortLabel}${live?.reason ? ` · ${live.reason}` : ""}`;
      return option;
    });
    elements.modelSelect.replaceChildren(...options);
  }

  function renderImages() {
    elements.referenceCount.textContent = `${state.images.length} / ${MAX_IMAGE_COUNT}`;
    elements.uploadButton.classList.toggle(
      "hidden",
      state.images.length >= MAX_IMAGE_COUNT,
    );
    elements.referenceInput.disabled = state.images.length >= MAX_IMAGE_COUNT;
    elements.referenceList.replaceChildren(
      ...state.images.map((image) => {
        const item = document.createElement("article");
        const preview = document.createElement("img");
        const copy = document.createElement("div");
        const name = document.createElement("strong");
        const size = document.createElement("span");
        const remove = document.createElement("button");
        item.className = "reference-item";
        preview.src = image.dataUrl;
        preview.alt = "";
        name.textContent = image.name;
        size.textContent = formatBytes(image.size);
        copy.append(name, size);
        remove.className = "reference-remove";
        remove.type = "button";
        remove.ariaLabel = `移除 ${image.name}`;
        remove.textContent = "×";
        remove.addEventListener("click", () => {
          state.images = state.images.filter((entry) => entry.id !== image.id);
          renderImages();
        });
        item.append(preview, copy, remove);
        return item;
      }),
    );
  }

  async function addFiles(fileList) {
    const incoming = Array.from(fileList);
    const remaining = MAX_IMAGE_COUNT - state.images.length;
    if (remaining <= 0) {
      showToast("风格反推最多支持 5 张参考图");
      return;
    }
    const accepted = incoming.slice(0, remaining);
    if (incoming.length > remaining) {
      showToast(`本次只添加前 ${remaining} 张，最多支持 5 张参考图`);
    }
    for (const file of accepted) {
      if (!IMAGE_TYPES.has(file.type)) {
        showToast(`${file.name} 不是 PNG、JPEG 或 WebP`);
        return;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        showToast(`${file.name} 超过单张 8MB 限制`);
        return;
      }
    }
    const totalBytes = [...state.images, ...accepted].reduce(
      (total, file) => total + file.size,
      0,
    );
    if (totalBytes > MAX_TOTAL_BYTES) {
      showToast("风格参考图合计不能超过 20MB");
      return;
    }
    const images = await Promise.all(
      accepted.map(async (file) => ({
        dataUrl: await readFileAsDataUrl(file),
        id: crypto.randomUUID(),
        name: file.name,
        size: file.size,
        type: file.type,
      })),
    );
    state.images.push(...images);
    renderImages();
  }

  function scrollToLatest() {
    window.requestAnimationFrame(() => {
      elements.thread.scrollTop = elements.thread.scrollHeight;
    });
  }

  function resizeComposerInput() {
    const styles = window.getComputedStyle(elements.input);
    const minHeight = Number.parseFloat(styles.minHeight) || 36;
    const maxHeight = Number.parseFloat(styles.maxHeight) || 160;
    if (!elements.input.value) {
      elements.input.style.height = `${minHeight}px`;
      elements.input.style.overflowY = "hidden";
      return;
    }
    elements.input.style.height = "auto";
    const naturalHeight = elements.input.scrollHeight;
    const nextHeight = Math.min(
      Math.max(naturalHeight, minHeight),
      maxHeight,
    );
    elements.input.style.height = `${nextHeight}px`;
    elements.input.style.overflowY =
      naturalHeight > maxHeight ? "auto" : "hidden";
  }

  async function copyJson(json, button) {
    await navigator.clipboard.writeText(json);
    button.textContent = "已复制";
    window.setTimeout(() => {
      button.textContent = "复制 JSON";
    }, 1600);
  }

  async function send() {
    if (state.sending) return;
    if (!state.connected) {
      onConnectionRequired();
      return;
    }
    const content = elements.input.value.trim();
    const hasDraftContext = state.messages.some(
      (message) => message.role === "assistant",
    );
    if (state.images.length === 0 && !hasDraftContext) {
      showToast("首轮请先添加至少 1 张风格参考图");
      return;
    }
    if (state.images.length === 0 && !content) {
      showToast("请输入要继续调整的内容");
      return;
    }
    const systemPrompt = elements.systemPrompt.value.trim();
    if (!systemPrompt) {
      elements.systemPrompt.focus();
      showToast("System Prompt 不能为空");
      return;
    }
    const model = selectedModel();
    const live = model && state.availability.get(model.id);
    if (!model || (live && !live.selectable)) {
      showToast("请选择当前 API Key 可用的多模态模型");
      return;
    }

    const messageContent =
      content || `已上传 ${state.images.length} 张风格参考图`;
    const userMessage = { content: messageContent, role: "user" };
    const visibleUserMessage = userMessage;
    const requestMessages = [...state.messages, userMessage].slice(-19);
    const pending = thinkingElement();
    state.sending = true;
    elements.sendButton.disabled = true;
    elements.sendButton.querySelector("span").textContent = "分析中";
    elements.input.value = "";
    resizeComposerInput();
    elements.thread.append(messageElement(visibleUserMessage), pending);
    scrollToLatest();

    try {
      const result = await api("/api/style-dna-reverse", {
        body: JSON.stringify({
          messages: requestMessages,
          modelKey: state.modelKey,
          referenceImages: state.images.map(
            ({ dataUrl, name, size, type }) => ({ dataUrl, name, size, type }),
          ),
          systemPrompt,
        }),
        method: "POST",
      });
      state.messages = [
        ...requestMessages,
        { content: JSON.stringify(result.styleDna), role: "assistant" },
      ].slice(-20);
      state.images = [];
      renderImages();
      pending.replaceWith(draftElement(result, copyJson));
      scrollToLatest();
    } catch (error) {
      pending.replaceWith(
        messageElement({
          content: `这次没有完成：${error.message}`,
          role: "assistant",
        }),
      );
      elements.input.value = content;
      resizeComposerInput();
    } finally {
      state.sending = false;
      elements.sendButton.disabled = false;
      elements.sendButton.querySelector("span").textContent = "发送";
    }
  }

  function reset() {
    state.messages = [];
    state.images = [];
    renderImages();
    elements.thread.replaceChildren();
    elements.input.value = "";
    resizeComposerInput();
    elements.input.focus();
  }

  elements.modelSelect.addEventListener("change", (event) => {
    state.modelKey = event.target.value;
    renderModels();
  });
  elements.referenceInput.addEventListener("change", async (event) => {
    await addFiles(event.target.files);
    event.target.value = "";
    event.target.blur();
  });
  for (const eventName of ["dragenter", "dragover"]) {
    elements.dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      elements.dropZone.classList.add("dragging");
    });
  }
  for (const eventName of ["dragleave", "drop"]) {
    elements.dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      elements.dropZone.classList.remove("dragging");
    });
  }
  elements.dropZone.addEventListener("drop", async (event) => {
    await addFiles(event.dataTransfer.files);
  });
  elements.resetButton.addEventListener("click", reset);
  elements.promptResetButton.addEventListener("click", () => {
    elements.systemPrompt.value = state.defaultSystemPrompt;
    renderPromptState();
  });
  elements.systemPrompt.addEventListener("input", renderPromptState);
  elements.sendButton.addEventListener("click", send);
  elements.input.addEventListener("input", resizeComposerInput);
  elements.input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void send();
    }
  });
  void loadAgentConfig();

  return {
    setAvailability(models) {
      state.availability = new Map(models.map((model) => [model.id, model]));
      const selected = selectedModel();
      if (!state.availability.get(selected?.id)?.selectable) {
        const fallback = models.find((model) => model.selectable);
        if (fallback) state.modelKey = fallback.key;
      }
      const availableCount = models.filter((model) => model.selectable).length;
      elements.modelAvailability.textContent = state.connected
        ? `${availableCount} / ${models.length} 可选`
        : "等待连接";
      elements.modelAvailability.classList.toggle(
        "ready",
        state.connected && availableCount > 0,
      );
      renderModels();
    },
    setCatalog(models) {
      state.catalog = models;
      if (!state.catalog.some((model) => model.key === state.modelKey)) {
        state.modelKey = state.catalog.find((model) => model.imageInput)?.key || "";
      }
      renderModels();
    },
    setConnected(connected) {
      state.connected = connected;
      elements.modelAvailability.textContent = connected
        ? "检查模型中"
        : "等待连接";
      elements.modelAvailability.classList.toggle("ready", connected);
    },
    setVisible(visible) {
      elements.controls.classList.toggle("hidden", !visible);
      elements.chat.classList.toggle("hidden", !visible);
      if (visible) {
        resizeComposerInput();
        scrollToLatest();
      }
    },
  };
}

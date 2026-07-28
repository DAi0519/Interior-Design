/**
 * [INPUT]: 依赖 Style DNA 反推 DOM、共享本地 API、服务端图片/PDF 附件能力策略、Agent 模型目录与浏览器文件能力
 * [OUTPUT]: 对外提供接口驱动的 Prompt 版本/模型选择、参考附件上传、多模态分析、多轮修正、草稿展示、复制与重置控制器
 * [POS]: public 的 Style DNA 反推浏览器控制器，以服务端附件能力为上传单一真源并与生成控制器隔离
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

const FALLBACK_ATTACHMENT_POLICY = Object.freeze({
  accept: Object.freeze([
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
    "application/pdf",
  ]),
  maxBytesPerAttachment: 8 * 1024 * 1024,
  maxCount: null,
  maxTotalBytes: 20 * 1024 * 1024,
});
const PROMPT_VERSION_STORAGE_KEY = "canvas-lab-style-dna-prompt-version";

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

function normalizedAttachmentPolicy(input) {
  const policy = input && typeof input === "object" ? input : {};
  return {
    accept:
      Array.isArray(policy.accept) && policy.accept.length > 0
        ? [...policy.accept]
        : [...FALLBACK_ATTACHMENT_POLICY.accept],
    maxBytesPerAttachment:
      Number.isInteger(policy.maxBytesPerAttachment) &&
      policy.maxBytesPerAttachment > 0
        ? policy.maxBytesPerAttachment
        : FALLBACK_ATTACHMENT_POLICY.maxBytesPerAttachment,
    maxCount:
      Number.isInteger(policy.maxCount) && policy.maxCount > 0
        ? policy.maxCount
        : null,
    maxTotalBytes:
      Number.isInteger(policy.maxTotalBytes) && policy.maxTotalBytes > 0
        ? policy.maxTotalBytes
        : FALLBACK_ATTACHMENT_POLICY.maxTotalBytes,
  };
}

function formatAcceptedTypes(accept) {
  const labels = {
    "application/pdf": "PDF",
    "image/gif": "GIF",
    "image/jpeg": "JPEG",
    "image/png": "PNG",
    "image/webp": "WebP",
  };
  return accept.map((type) => labels[type] || type).join("、");
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
  dots.ariaLabel = "正在分析参考附件";
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
  metadata.textContent = `${result.model.label} · Prompt v${result.agent.version} · ${(result.durationMs / 1000).toFixed(1)}s · ${result.referenceAttachmentCount} 个附件`;
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
    promptRefreshButton: document.querySelector("#styleDnaPromptRefreshButton"),
    promptVersionNote: document.querySelector("#styleDnaPromptVersionNote"),
    promptVersionSelect: document.querySelector("#styleDnaPromptVersionSelect"),
    referenceCount: document.querySelector("#styleDnaReferenceCount"),
    referenceInput: document.querySelector("#styleDnaReferenceInput"),
    referenceList: document.querySelector("#styleDnaReferenceList"),
    resetButton: document.querySelector("#styleDnaResetButton"),
    sendButton: document.querySelector("#styleDnaSendButton"),
    thread: document.querySelector("#styleDnaThread"),
    uploadButton: document.querySelector("#styleDnaUploadButton"),
  };
  const state = {
    availability: new Map(),
    catalog: [],
    connected: false,
    attachments: [],
    messages: [],
    modelKey: "gemini3pro",
    promptVersion: Number(sessionStorage.getItem(PROMPT_VERSION_STORAGE_KEY)) || null,
    promptVersions: [],
    attachmentPolicy: normalizedAttachmentPolicy(),
    sending: false,
  };

  function setPromptVersion(version) {
    state.promptVersion = Number.isInteger(version) && version > 0
      ? version
      : null;
    if (state.promptVersion) {
      sessionStorage.setItem(
        PROMPT_VERSION_STORAGE_KEY,
        String(state.promptVersion),
      );
    } else {
      sessionStorage.removeItem(PROMPT_VERSION_STORAGE_KEY);
    }
  }

  function renderPromptVersions(defaultVersion = null) {
    const versions = [...state.promptVersions].sort(
      (left, right) => right.version - left.version,
    );
    if (!versions.some((entry) => entry.version === state.promptVersion)) {
      setPromptVersion(
        versions.find((entry) => entry.version === defaultVersion)?.version ||
        versions[0]?.version ||
        null,
      );
    }
    elements.promptVersionSelect.replaceChildren(
      ...versions.map((entry) => {
        const option = document.createElement("option");
        option.value = String(entry.version);
        option.selected = entry.version === state.promptVersion;
        option.textContent = `${entry.name} · v${entry.version}`;
        return option;
      }),
    );
    elements.promptVersionSelect.disabled = versions.length === 0;
    elements.promptVersionNote.textContent =
      versions.length > 0
        ? `${versions.length} 个已上架版本可测试；正文仅在服务端读取。`
        : "飞书中没有可测试的已上架 Prompt 版本。";
  }

  function setPromptRefreshPending(pending) {
    elements.promptRefreshButton.disabled = pending;
    elements.promptRefreshButton.toggleAttribute("aria-busy", pending);
    elements.promptRefreshButton.querySelector("[data-refresh-label]").textContent =
      pending ? "刷新中" : "刷新";
  }

  async function loadRuntimeConfig({ forceRefresh = false } = {}) {
    setPromptRefreshPending(true);
    try {
      const config = await api(
        forceRefresh
          ? "/api/style-dna-reverse/config/refresh"
          : "/api/style-dna-reverse/config",
        forceRefresh ? { method: "POST" } : undefined,
      );
      state.attachmentPolicy = normalizedAttachmentPolicy(
        config.referenceAttachment,
      );
      state.promptVersions = Array.isArray(config.promptAgent?.versions)
        ? config.promptAgent.versions
        : [];
      elements.referenceInput.accept = state.attachmentPolicy.accept.join(",");
      renderPromptVersions(config.promptAgent?.defaultVersion);
      renderAttachments();
      if (forceRefresh) {
        showToast(`Prompt 版本已更新 · ${state.promptVersions.length} 个可选`);
      }
    } catch (error) {
      state.promptVersions = [];
      renderPromptVersions();
      elements.promptVersionNote.textContent = error.message;
      showToast(`反推配置读取失败：${error.message}`);
    } finally {
      setPromptRefreshPending(false);
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

  function renderAttachments() {
    const { maxCount } = state.attachmentPolicy;
    elements.referenceCount.textContent =
      maxCount === null
        ? `${state.attachments.length} 个附件`
        : `${state.attachments.length} / ${maxCount}`;
    elements.uploadButton.classList.toggle(
      "hidden",
      maxCount !== null && state.attachments.length >= maxCount,
    );
    elements.referenceInput.disabled =
      maxCount !== null && state.attachments.length >= maxCount;
    elements.referenceList.replaceChildren(
      ...state.attachments.map((attachment) => {
        const item = document.createElement("article");
        const preview = attachment.type.startsWith("image/")
          ? document.createElement("img")
          : document.createElement("span");
        const copy = document.createElement("div");
        const name = document.createElement("strong");
        const size = document.createElement("span");
        const remove = document.createElement("button");
        item.className = "reference-item";
        if (preview instanceof HTMLImageElement) {
          preview.src = attachment.dataUrl;
          preview.alt = "";
        } else {
          preview.className = "reference-file-icon";
          preview.textContent = "PDF";
          preview.ariaHidden = "true";
        }
        name.textContent = attachment.name;
        size.textContent = `${
          attachment.type === "application/pdf" ? "PDF · " : ""
        }${formatBytes(attachment.size)}`;
        copy.append(name, size);
        remove.className = "reference-remove";
        remove.type = "button";
        remove.ariaLabel = `移除 ${attachment.name}`;
        remove.textContent = "×";
        remove.addEventListener("click", () => {
          state.attachments = state.attachments.filter(
            (entry) => entry.id !== attachment.id,
          );
          renderAttachments();
        });
        item.append(preview, copy, remove);
        return item;
      }),
    );
  }

  async function addFiles(fileList) {
    const incoming = Array.from(fileList);
    const { accept, maxBytesPerAttachment, maxCount, maxTotalBytes } =
      state.attachmentPolicy;
    const remaining =
      maxCount === null
        ? incoming.length
        : maxCount - state.attachments.length;
    if (maxCount !== null && remaining <= 0) {
      showToast(`当前接口最多支持 ${maxCount} 个参考附件`);
      return;
    }
    const accepted = incoming.slice(0, remaining);
    if (maxCount !== null && incoming.length > remaining) {
      showToast(
        `本次只添加前 ${remaining} 个，当前接口最多支持 ${maxCount} 个附件`,
      );
    }
    const acceptedTypes = new Set(accept);
    for (const file of accepted) {
      if (!acceptedTypes.has(file.type)) {
        showToast(
          `${file.name} 不是当前接口支持的 ${formatAcceptedTypes(accept)}`,
        );
        return;
      }
      if (file.size > maxBytesPerAttachment) {
        showToast(
          `${file.name} 超过当前接口的单文件 ${formatBytes(maxBytesPerAttachment)} 限制`,
        );
        return;
      }
    }
    const totalBytes = [...state.attachments, ...accepted].reduce(
      (total, file) => total + file.size,
      0,
    );
    if (totalBytes > maxTotalBytes) {
      showToast(
        `风格参考附件合计不能超过当前接口的 ${formatBytes(maxTotalBytes)}`,
      );
      return;
    }
    const attachments = await Promise.all(
      accepted.map(async (file) => ({
        dataUrl: await readFileAsDataUrl(file),
        id: crypto.randomUUID(),
        name: file.name,
        size: file.size,
        type: file.type,
      })),
    );
    state.attachments.push(...attachments);
    renderAttachments();
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
    if (!Number.isInteger(state.promptVersion)) {
      showToast("请先读取并选择一个已上架 Prompt 版本");
      return;
    }
    const content = elements.input.value.trim();
    const hasDraftContext = state.messages.some(
      (message) => message.role === "assistant",
    );
    if (state.attachments.length === 0 && !hasDraftContext) {
      showToast("首轮请先添加至少 1 个风格参考附件");
      return;
    }
    if (state.attachments.length === 0 && !content) {
      showToast("请输入要继续调整的内容");
      return;
    }
    const model = selectedModel();
    const live = model && state.availability.get(model.id);
    if (!model || (live && !live.selectable)) {
      showToast("请选择当前 API Key 可用的多模态模型");
      return;
    }

    const messageContent =
      content || `已上传 ${state.attachments.length} 个风格参考附件`;
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
          promptVersion: state.promptVersion,
          referenceAttachments: state.attachments.map(
            ({ dataUrl, name, size, type }) => ({ dataUrl, name, size, type }),
          ),
        }),
        method: "POST",
      });
      state.messages = [
        ...requestMessages,
        { content: JSON.stringify(result.styleDna), role: "assistant" },
      ].slice(-20);
      state.attachments = [];
      renderAttachments();
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
    state.attachments = [];
    renderAttachments();
    elements.thread.replaceChildren();
    elements.input.value = "";
    resizeComposerInput();
    elements.input.focus();
  }

  elements.modelSelect.addEventListener("change", (event) => {
    state.modelKey = event.target.value;
    renderModels();
  });
  elements.promptVersionSelect.addEventListener("change", (event) => {
    setPromptVersion(Number(event.target.value));
  });
  elements.promptRefreshButton.addEventListener("click", () => {
    void loadRuntimeConfig({ forceRefresh: true });
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
  elements.sendButton.addEventListener("click", send);
  elements.input.addEventListener("input", resizeComposerInput);
  elements.input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void send();
    }
  });
  void loadRuntimeConfig();

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

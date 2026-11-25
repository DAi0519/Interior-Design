/**
 * [INPUT]: 依赖首页对话的底栏上传与提示词槽、同源工作区原上传和原表单
 * [OUTPUT]: 提供底栏原上传、提示词及其上方的原工作区输入提示，发布画布原图和任务恢复的就绪信号
 * [POS]: public 的首页同源工作区输入适配层，原工作区继续负责校验和任务执行
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

const workspaces = {
  housePlanLayout: {
    dock: "#housePlanSettingsMount", input: "#sourceInput", upload: "#upload",
    image: "#sourceThumbnail", name: "#sourceName", error: "#error", views: "#resultView, #generationFeedback",
    prompt: "#requirements", promptOrigin: "label", promptLabel: "户型布局补充需求",
    imageLabel: "户型原图",
  },
  aiRenderStudio: {
    dock: "#aiRenderStudioSettingsMount", input: "#studioSourceInput", upload: "#studioUpload",
    replace: "#studioReplaceSource", image: "#studioSourceThumbnail", name: "#studioSourceName",
    error: "#studioUploadError", note: "#studioSubmitNote", views: "#studioResultFrame, #studioJobState",
    prompt: "#studioPrompt", promptOrigin: ".studio-prompt-section",
    imageLabel: "模型图",
  },
  sceneCast: {
    dock: "#sceneCastSettingsMount", input: "#castSourceFile", upload: "#castSourceUpload",
    image: "#castSourceThumb", name: "#castSourceUpload .reference-upload-label",
    error: "#castSourceError", views: "#castProgress, #castResultMeta", imageLabel: "场景图",
  },
};
const conversations = {
  housePlanLayout: { frame: 'iframe[src^="/house-plan.html"]', bodyClass: "house-plan-conversation" },
  floorPlan: { frame: 'iframe[src^="/floor-plan.html"]', bodyClass: "floor-plan-conversation" },
  aiRenderStudio: { frame: 'iframe[src^="/ai-render-studio.html"]', bodyClass: "studio-conversation" },
};

export function bindHomeWorkspaceInputs(root, slots, { onChange, onCanvasChange }) {
  const doc = root.ownerDocument;
  const view = doc.defaultView;
  const prompts = root.querySelector(".home-image-chat-workspace-inputs");
  const attachLabel = root.querySelector(".home-image-chat-attach-label");
  const thumbnail = root.querySelector(".home-image-chat-camera-thumbnail");
  let activeMode;
  let config;
  let controls;
  let childBody;
  let visibleViews = [];
  let observedFrame;
  const mountsObserver = new view.MutationObserver(sync);
  const controlsObserver = new view.MutationObserver(present);
  const viewsObserver = new view.MutationObserver(present);

  function move(node) {
    if (!node) return null;
    const marker = doc.createComment("工作区输入原位置");
    node.before(marker);
    prompts.append(node);
    return marker;
  }

  function restore() {
    controlsObserver.disconnect();
    if (!controls) return;
    const { sourceSection, upload, prompt, promptMarker, promptOrigin, promptAria,
      promptHeight, notices } = controls;
    sourceSection?.classList.remove("home-image-chat-workspace-origin-upload");
    upload.classList.remove("home-image-chat-workspace-original-upload");
    promptOrigin?.classList.remove("home-image-chat-workspace-origin-prompt");
    if (promptMarker) {
      prompt.style.height = promptHeight;
      if (promptAria === null) prompt.removeAttribute("aria-label");
      else prompt.setAttribute("aria-label", promptAria);
      promptMarker.replaceWith(prompt);
    }
    for (const { node, marker } of notices) marker.replaceWith(node);
    controls = null;
  }

  function adopt(settings, upload, input) {
    const sourceSection = upload.closest("section");
    const image = settings.querySelector(config.image);
    const name = settings.querySelector(config.name);
    const replace = config.replace && settings.querySelector(config.replace);
    const prompt = config.prompt && settings.querySelector(config.prompt);
    const promptOrigin = prompt?.closest(config.promptOrigin);
    const promptAria = prompt?.getAttribute("aria-label");
    const promptHeight = prompt?.style.height;
    const notices = [settings.querySelector(config.error), config.note && slots.actions.querySelector(config.note)]
      .filter(Boolean).map(node => ({ node, marker: move(node) }));
    sourceSection?.classList.add("home-image-chat-workspace-origin-upload");
    upload.classList.add("home-image-chat-workspace-original-upload");
    promptOrigin?.classList.add("home-image-chat-workspace-origin-prompt");
    if (prompt && !promptAria) prompt.setAttribute("aria-label", config.promptLabel);
    const promptMarker = move(prompt);
    controls = { settings, input, upload, replace, image, name, sourceSection,
      prompt, promptOrigin, promptAria, promptHeight, promptMarker, notices };
    const options = { subtree: true, childList: true, characterData: true, attributes: true,
      attributeFilter: ["hidden", "disabled", "src", "inert", "aria-busy"] };
    for (const node of [sourceSection, input, prompts]) {
      if (node) controlsObserver.observe(node, options);
    }
  }

  function sourceImage() {
    const image = controls?.image;
    return image && !image.hidden ? image.getAttribute("src") : null;
  }

  function present(mutations = []) {
    if (!config) return;
    const image = sourceImage();
    const label = `${image ? "更换" : "上传"}${config.imageLabel}`;
    if (attachLabel.textContent !== label) attachLabel.textContent = label;
    if (image && thumbnail.getAttribute("src") !== image) thumbnail.src = image;
    if (!image) thumbnail.removeAttribute("src");
    thumbnail.hidden = !image;
    root.dataset.workspaceSource = image ? "ready" : "empty";
    const replaced = Boolean(image) && mutations.some(record =>
      record.target === controls?.image && record.attributeName === "src");
    onCanvasChange(Boolean(image) || visibleViews.some(node => !node.hidden), replaced);
    onChange();
  }

  function observeViews(frame) {
    const sourceDoc = frame?.contentDocument;
    if (sourceDoc === observedFrame && visibleViews.length) return;
    observedFrame = sourceDoc;
    viewsObserver.disconnect();
    visibleViews = [...(sourceDoc?.querySelectorAll(config.views) || [])];
    for (const node of visibleViews) viewsObserver.observe(node, { attributes: true, attributeFilter: ["hidden"] });
  }

  function sync() {
    const conversation = conversations[activeMode];
    const frame = slots.mount.querySelector(conversation?.frame || "iframe:not([hidden])");
    if (conversation) {
      const body = frame?.contentDocument?.body;
      if (childBody !== body) {
        childBody?.classList.remove(conversation.bodyClass);
        childBody = body;
        childBody?.classList.add(conversation.bodyClass);
      }
    }
    if (!config) return;
    observeViews(frame);
    const settings = slots.parameters.querySelector(config.dock);
    const upload = settings?.querySelector(config.upload);
    const input = settings?.querySelector(config.input) || frame?.contentDocument?.querySelector(config.input);
    if (settings !== controls?.settings || upload !== controls?.upload || input !== controls?.input) {
      restore();
      if (settings && upload && input) adopt(settings, upload, input);
    }
    present();
  }

  function attachControl() {
    return sourceImage() && controls?.replace ? controls.replace : controls?.upload;
  }

  return {
    active: () => Boolean(config),
    setMode(mode) {
      if (mode === activeMode || (!mode && !activeMode)) return;
      mountsObserver.disconnect();
      viewsObserver.disconnect();
      visibleViews = [];
      observedFrame = null;
      restore();
      if (childBody) childBody.classList.remove(conversations[activeMode].bodyClass);
      childBody = null;
      activeMode = mode;
      const wasActive = Boolean(config);
      config = Object.hasOwn(workspaces, mode) ? workspaces[mode] : null;
      prompts.hidden = !config;
      root.toggleAttribute("data-workspace-inputs", Boolean(config));
      if (config || wasActive) attachLabel.hidden = !config;
      if (!config) {
        delete root.dataset.workspaceSource;
        if (wasActive) {
          thumbnail.hidden = true;
          thumbnail.removeAttribute("src");
        }
        if (!conversations[mode]) return;
      }
      for (const slot of [slots.mount, slots.parameters]) {
        mountsObserver.observe(slot, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-ready"] });
      }
      sync();
    },
    textField: () => controls?.prompt || null,
    attach: () => attachControl()?.click(),
    upload(files) {
      const input = controls?.input;
      if (!input || input.disabled || attachControl()?.disabled || !files[0]) return;
      const inputView = input.ownerDocument.defaultView;
      const transfer = new inputView.DataTransfer();
      transfer.items.add(files[0]);
      input.files = transfer.files;
      input.dispatchEvent(new inputView.Event("change", { bubbles: true }));
    },
    syncControls(attach) {
      const name = sourceImage() ? controls?.name?.textContent.trim() : "";
      attach.disabled = !controls || controls.input.disabled || Boolean(attachControl()?.disabled);
      attach.title = name ? `${attachLabel.textContent} · ${name}` : attachLabel.textContent;
      attach.setAttribute("aria-label", attach.title);
    },
  };
}

/**
 * [INPUT]: 依赖共享功能目录、原表单准入、原生及同源工作区输入挂载、首页参数和任务
 * [OUTPUT]: 提供首页原地选功能、参数入口、上展画布、输入区上方的校验提示、输入动效装饰和会话记录
 * [POS]: public 的首页生图视图，由 app.js 注入同一套自由生图能力
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { fillSelect, secureImageUrl } from "./workbench-utils.js";
import { bindHomeChatParameters } from "./home-image-chat-parameters.js?v=3";
import { bindHomeNativeTools } from "./home-image-chat-native-tools.js?v=4";
import { bindHomeImageCamera } from "./home-image-chat-camera.js?v=6";
import { bindHomeCanvasPanel } from "./home-image-chat-canvas-panel.js";
import { bindHomeWorkspaceInputs } from "./home-image-chat-workspace-inputs.js?v=3";
import { bindEmbeddedWorkspaceQuickParameters } from "./workspace-quick-parameters.js?v=3";
import { bindParameterPopover } from "./parameter-popover.js";

const DEFAULT_TEXT_MODEL = "banana2";
const advancedParametersIcon = `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 6h3m4 0h7M3 14h7m4 0h3"/><circle cx="8" cy="6" r="2"/><circle cx="12" cy="14" r="2"/></svg>`;
const canvasLabels = {
  housePlanLayout: "户型画布", floorPlan: "设计画布", aiRenderStudio: "渲染画布",
  floorPlanCamera: "机位画布", sceneCast: "场景画布", imageOutpaint: "扩图画布",
  imageMultiAngle: "多角度画布", imageMaskFill: "编辑画布", imageRelight: "打光画布",
};
const markup = `
  <section id="homeImageChat" class="home-image-chat" aria-label="首页生图" hidden>
    <div class="home-image-chat-viewport">
      <div class="home-image-chat-thread">
        <div class="home-image-chat-intro"><h1 lang="en">Make it great before we ship it.</h1></div>
        <div class="home-image-chat-history"></div>
        <div class="home-image-chat-current" hidden>
          <p class="home-image-chat-prompt" hidden></p>
        </div>
        <section class="home-image-chat-tool" hidden><div class="home-image-chat-tool-canvas"></div></section>
      </div>
    </div>
    <div class="home-image-chat-session-actions" hidden>
      <button id="homeImageChatNew" type="button">新对话</button>
    </div>
    <div class="home-image-chat-dock">
      <button id="homeImageChatCanvasToggle" class="home-image-chat-canvas-toggle" type="button"
        aria-controls="homeImageChatCanvasPanel" aria-expanded="false" hidden>
        <span></span>
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 12 4-4 4 4"/></svg>
      </button>
      <section id="homeImageChatCanvasPanel" class="home-image-chat-canvas-panel" aria-labelledby="homeImageChatCanvasToggle" hidden inert>
        <div class="home-image-chat-canvas-window"><div class="home-image-chat-tool-canvas"></div></div>
      </section>
      <form class="home-image-chat-composer">
        <span class="home-image-chat-focus-flow" aria-hidden="true">
          <span></span><span></span><span></span><span></span><span></span>
          <span></span><span></span><span></span><span></span><span></span>
        </span>
        <div class="home-image-chat-feature-row">
          <button class="home-image-chat-feature-picker" type="button" data-feature-catalog-open data-feature-catalog-composer
            aria-haspopup="dialog" aria-controls="featureCatalogDialog">
            <span>选择功能</span><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 8 4 4 4-4"/></svg>
          </button>
          <button class="home-image-chat-feature-clear" type="button" aria-label="清除功能，使用自由生图" hidden>
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7 7 6 6m0-6-6 6"/></svg>
          </button>
          <p id="homeImageChatCameraStatus" class="home-image-chat-validation" role="status" hidden></p>
          <button class="home-image-chat-parameter-trigger home-image-chat-advanced-trigger" type="button" aria-label="全部参数" title="全部参数"
            aria-haspopup="dialog" aria-controls="homeImageChatParameterDialog" hidden>${advancedParametersIcon}</button>
          <button class="home-image-chat-tool-parameter-trigger home-image-chat-advanced-trigger" type="button" aria-label="全部参数" title="全部参数" hidden>
            ${advancedParametersIcon}<span class="home-image-chat-tool-parameter-compact" aria-hidden="true">参数</span>
          </button>
        </div>
        <div class="home-image-chat-attachment-row">
          <div class="home-image-chat-references" role="group" aria-label="参考图" hidden></div>
          <p id="homeImageChatValidation" class="home-image-chat-validation" role="status" hidden></p>
        </div>
        <label class="sr-only" for="homeImageChatInput">图像提示词</label>
        <textarea id="homeImageChatInput" class="home-image-chat-input" rows="2" maxlength="8000"
          placeholder="描述你想生成的画面…" spellcheck="false"></textarea>
        <div class="home-image-chat-feature-prompt"></div>
        <div class="home-image-chat-camera-inputs" hidden></div>
        <div class="home-image-chat-workspace-inputs" hidden></div>
        <input id="homeImageChatFiles" type="file" aria-label="选择参考图" accept="image/png,image/jpeg,image/webp" multiple hidden />
        <div class="home-image-chat-actions">
          <div class="home-image-chat-tools">
            <button id="homeImageChatAttach" class="home-image-chat-attach" type="button" aria-label="添加参考图" title="添加参考图">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 13 5.8-5.8a2 2 0 0 1 2.8 2.8l-7.7 7.7a4 4 0 0 1-5.7-5.7l7.6-7.6"/></svg>
              <img class="home-image-chat-camera-thumbnail" alt="" hidden />
              <span class="home-image-chat-attach-label" hidden></span>
              <span class="home-image-chat-native-attach-label">上传原图</span>
              <span class="home-image-chat-camera-attach-short" aria-hidden="true">换图</span>
            </button>
            <div class="home-image-chat-settings">
              <select class="home-image-chat-model" aria-label="出图模型" disabled><option>出图模型</option></select>
            </div>
            <button class="home-image-chat-size-trigger" type="button" hidden>
              <span></span><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 8 4 4 4-4"/></svg>
            </button>
            <div class="home-image-chat-inline-parameters"></div>
            <div class="home-image-chat-tool-quick"></div>
          </div>
          <button id="homeImageChatSend" class="home-image-chat-send" type="submit" aria-label="发送并生成图片" title="发送并生成图片" disabled>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5m-6 6 6-6 6 6"/></svg>
          </button>
        </div>
        <div class="home-image-chat-tool-actions" hidden></div>
      </form>
    </div>
    <div class="home-image-chat-size-options" role="group" aria-label="出图规格"></div>
    <div class="home-image-chat-tool-settings" aria-label="功能参数"></div>
    <div class="home-image-chat-parameter-source"></div>
    <dialog id="homeImageChatParameterDialog" class="home-image-chat-parameter-dialog" aria-labelledby="homeImageChatParameterTitle">
      <header>
        <h2 id="homeImageChatParameterTitle"></h2>
        <button class="home-image-chat-parameter-close" type="button" aria-label="关闭参数">
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 6 8 8m0-8-8 8"/></svg>
        </button>
      </header>
      <div class="home-image-chat-feature-parameters"></div>
    </dialog>
    <div class="home-image-chat-active-task" hidden>
      <span role="status">仍有图片生成任务在运行</span>
      <a href="/?feature=free">查看任务</a>
    </div>
  </section>
`;

export function bindHomeComposerFeatures({ homeChat, host, state, view, render, selectFeatureMode }) {
  function open({ featureMode, label }) {
    const previous = host.isEmbedded() ? host.currentMode() : state.featureMode;
    if (homeChat.active() && previous !== featureMode) {
      homeChat.retainTurn(view(previous));
      state.modelKeys = homeChat.featureModels(previous, featureMode, state.modelKeys);
    }
    if (previous !== featureMode) homeChat.closeTool();
    if (host.supports(featureMode)) {
      state.modelKeys = homeChat.enter(state.modelKeys);
      homeChat.route(null);
      const slots = homeChat.setFeature(featureMode, label, { workspace: true });
      host.show(featureMode, { embedded: true, ...slots, onFeatureChange(mode, title) {
        homeChat.setFeature(mode, title, { workspace: true });
      } });
      return;
    }
    selectFeatureMode(featureMode, { navigation: true, home: true });
    homeChat.setFeature(featureMode, label);
    if (homeChat.nativeActive()) render();
  }
  return open;
}

export function bindHomeImageChat({ send, getBlockReason, selectModel, addImages, removeImage, openHome, openFeature }) {
  const stage = document.querySelector("#resultStage");
  const panel = stage.parentElement;
  panel.insertAdjacentHTML("afterbegin", markup);
  const root = document.querySelector("#homeImageChat");
  const doc = root.ownerDocument;
  const viewport = root.querySelector(".home-image-chat-viewport");
  const thread = root.querySelector(".home-image-chat-thread");
  const current = root.querySelector(".home-image-chat-current");
  const sessionActions = root.querySelector(".home-image-chat-session-actions");
  const activeTask = root.querySelector(".home-image-chat-active-task");
  const history = root.querySelector(".home-image-chat-history");
  const prompt = current.querySelector(".home-image-chat-prompt");
  const composer = root.querySelector("form");
  const input = root.querySelector("#homeImageChatInput");
  const picker = root.querySelector(".home-image-chat-feature-picker");
  const clear = root.querySelector(".home-image-chat-feature-clear");
  const parameters = bindHomeChatParameters(root);
  const threadTool = root.querySelector(".home-image-chat-tool");
  const toolSlots = {
    mount: root.querySelector(".home-image-chat-canvas-panel .home-image-chat-tool-canvas"),
    parameters: root.querySelector(".home-image-chat-tool-settings"),
    actions: root.querySelector(".home-image-chat-tool-actions"),
  };
  const nativeTools = bindHomeNativeTools(root, {
    canvas: toolSlots.mount, transcript: threadTool.querySelector(".home-image-chat-tool-canvas"),
  });
  const toolQuick = root.querySelector(".home-image-chat-tool-quick");
  const toolTrigger = root.querySelector(".home-image-chat-tool-parameter-trigger");
  const featureRow = toolTrigger.parentElement;
  const footerTools = toolQuick.parentElement;
  const compactTools = doc.defaultView.matchMedia("(max-width: 760px), (max-width: 900px) and (any-pointer: coarse)");
  const toolPopover = bindParameterPopover({ trigger: toolTrigger, content: toolSlots.parameters });
  function placeToolTrigger() {
    const footer = compactTools.matches && ["floorPlanCamera", "sceneCast"].includes(root.dataset.composerFeature);
    const destination = footer ? footerTools : featureRow;
    if (toolTrigger.parentElement === destination) return;
    const focused = doc.activeElement === toolTrigger || toolSlots.parameters.contains(doc.activeElement);
    toolPopover.close();
    destination.append(toolTrigger);
    if (focused) toolTrigger.focus({ preventScroll: true });
  }
  compactTools.addEventListener("change", placeToolTrigger);
  let closeQuick;
  function syncToolParameters() {
    toolTrigger.hidden = !root.dataset.tool || toolSlots.parameters.hidden ||
      ![...toolSlots.parameters.children].some(child => child.childElementCount || child.matches("section"));
  }
  new MutationObserver(syncToolParameters).observe(toolSlots.parameters, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
  const settings = root.querySelector(".home-image-chat-settings");
  const actions = root.querySelector(".home-image-chat-actions");
  const shortcuts = root.querySelector(".home-image-chat-inline-parameters");
  const sizeTrigger = root.querySelector(".home-image-chat-size-trigger");
  const sizeOptions = root.querySelector(".home-image-chat-size-options");
  const sizePopover = bindParameterPopover({ trigger: sizeTrigger, content: sizeOptions });
  const phoneComposer = doc.defaultView.matchMedia("(max-width: 560px), (max-width: 900px) and (any-pointer: coarse)");
  const model = root.querySelector(".home-image-chat-model");
  const references = root.querySelector(".home-image-chat-references");
  const fileInput = root.querySelector("#homeImageChatFiles");
  const attach = root.querySelector("#homeImageChatAttach");
  const submit = root.querySelector("#homeImageChatSend");
  const validation = root.querySelector("#homeImageChatValidation");
  const canvasPanel = bindHomeCanvasPanel(root, {
    onExpandedChange: expanded => camera.setPanelExpanded(expanded),
  });
  const camera = bindHomeImageCamera(root, toolSlots, {
    onChange() { syncComposer(); resizeInput(); },
    onCanvasChange: canvasPanel.update,
  });
  const workspaceInputs = bindHomeWorkspaceInputs(root, toolSlots, {
    onChange() { syncComposer(); resizeInput(); },
    onCanvasChange: canvasPanel.update,
  });
  let active = false;
  let savedModelKeys;
  let homeModelKey = DEFAULT_TEXT_MODEL;
  let uploading = false;
  let busy = false;
  let running = false;
  let ready = false;
  let followThread = true;
  let lastReferences = [];
  let nativeHasResult = false;
  let lastTurn = "";
  let homeJobId = null;
  let composerMode = "free";

  function closeTool() {
    if (!root.dataset.tool) return;
    canvasPanel.setLabel();
    nativeHasResult = false;
    workspaceInputs.setMode(null);
    camera.setActive(false);
    toolPopover.close();
    closeQuick?.();
    closeQuick = null;
    nativeTools.unmount();
    threadTool.hidden = true;
    toolSlots.actions.hidden = true;
    delete root.dataset.tool;
    syncToolParameters();
  }

  // ---- 同一组字段在首页和配置栏之间迁移，保留原生值和事件 ----
  const generationFields = ["ratioField", "resolutionField", "generationCountField"].map(id => {
    const field = doc.getElementById(id);
    const anchor = doc.createComment(id);
    field.before(anchor);
    return { field, anchor };
  });

  function syncSizeSummary() {
    const values = generationFields.flatMap(({ field }) => {
      if (field.parentElement !== sizeOptions || field.hidden || field.classList.contains("hidden")) return [];
      const value = field.querySelector("select")?.selectedOptions[0]?.label.trim();
      return value ? [value] : [];
    });
    const fullLabel = values.join(" · ");
    const label = values.map(value => {
      const summary = value.split(" · ", 1)[0];
      return /^(跟随原图|原图尺寸)$/.test(summary) ? "原图" : summary.replace(/(\d+)\s+张$/, "$1张");
    }).join(" · ");
    sizeTrigger.hidden = !label;
    if (sizeTrigger.firstElementChild.textContent !== label) sizeTrigger.firstElementChild.textContent = label;
    sizeTrigger.title = fullLabel;
    sizeTrigger.setAttribute("aria-label", `出图规格 ${fullLabel}`.trim());
  }

  function placeOutputFields() {
    if (!active) return;
    const compact = phoneComposer.matches && !root.dataset.tool && composerMode !== "imageUpscale";
    const target = compact ? sizeOptions : settings;
    if (generationFields[0].field.parentElement !== target) {
      const focused = doc.activeElement;
      const focusField = generationFields.find(({ field }) => field.contains(focused))?.field;
      sizePopover.close();
      for (const { field } of generationFields) target.append(field);
      syncSizeSummary();
      if (compact && focusField) sizeTrigger.focus({ preventScroll: true });
      if (!compact && (focusField || focused === sizeTrigger)) {
        (focusField || generationFields[0].field).querySelector(".model-picker-trigger")?.focus({ preventScroll: true });
      }
    }
    if (compact && shortcuts.parentElement !== composer) actions.before(shortcuts);
    if (!compact && shortcuts.parentElement !== footerTools) toolQuick.before(shortcuts);
  }

  phoneComposer.addEventListener("change", placeOutputFields);
  const sizesObserver = new MutationObserver(syncSizeSummary);
  for (const { field } of generationFields) {
    field.addEventListener("change", syncSizeSummary);
    sizesObserver.observe(field, { subtree: true, childList: true, attributes: true, attributeFilter: ["hidden", "selected", "class"] });
  }
  const atBottom = () => viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 48;
  const scrollToLatest = () => { viewport.scrollTop = viewport.scrollHeight; };
  viewport.addEventListener("scroll", () => { followThread = atBottom(); }, { passive: true });
  const threadObserver = new ResizeObserver(() => { if (active && followThread) scrollToLatest(); });
  threadObserver.observe(thread);
  threadObserver.observe(viewport);

  function syncComposer() {
    syncSizeSummary();
    const hasStandaloneActions = root.dataset.tool === "style" ||
      (root.dataset.tool === "workspace" && !camera.active());
    const text = activeInput()?.value.trim() || "";
    const issue = active && ready && !busy && !uploading && !hasStandaloneActions && !camera.active()
      ? getBlockReason(text) : null;
    const note = (issue?.field === "reference" || composerMode !== "free" || text) &&
      (root.dataset.tool !== "image" || lastReferences.length) ? issue?.message || "" : "";
    if (validation.textContent !== note) validation.textContent = note;
    validation.hidden = !note;
    if (camera.active()) camera.syncControls(attach, submit);
    else {
      submit.disabled = !ready || busy || uploading || hasStandaloneActions || Boolean(issue?.message)
        || (composerMode === "free" && !text);
      submit.setAttribute("aria-label", busy ? "正在生成图片" : "发送并生成图片");
      submit.removeAttribute("aria-busy");
      if (note) submit.setAttribute("aria-describedby", validation.id);
      else submit.removeAttribute("aria-describedby");
      if (workspaceInputs.active()) workspaceInputs.syncControls(attach);
      else {
        attach.disabled = !ready || uploading;
        if (root.dataset.tool === "image") {
          const label = lastReferences.length ? "更换原图" : "上传原图";
          attach.title = label;
          attach.setAttribute("aria-label", label);
        }
      }
    }
    picker.disabled = busy || uploading;
    clear.disabled = picker.disabled;
  }

  function owns(task) {
    return homeJobId !== null && task?.jobId === homeJobId;
  }

  function showConversation(visible) {
    const hasTurn = visible || history.childElementCount > 0;
    root.dataset.hasTurn = String(hasTurn);
    current.hidden = !visible;
    sessionActions.hidden = !hasTurn;
    activeTask.hidden = visible || !running;
    syncComposer();
  }

  function reset() {
    homeJobId = null;
    lastTurn = "";
    prompt.textContent = "";
    prompt.hidden = true;
    history.replaceChildren();
    input.value = "";
    const featureInput = camera.textField() || parameters.textField();
    if (featureInput) {
      featureInput.value = "";
      featureInput.dispatchEvent(new Event("input", { bubbles: true }));
    }
    followThread = true;
    showConversation(false);
    if (active) resizeInput();
  }

  function resizeInput() {
    const field = activeInput();
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${Math.min(field.scrollHeight, 176)}px`;
  }

  function archive(view) {
    if (view.stage !== "results" && view.stage !== "error") return;
    const turn = doc.createElement("article");
    turn.className = "home-image-chat-turn";
    if (lastTurn) {
      const copy = doc.createElement("p");
      copy.className = "home-image-chat-prompt";
      copy.textContent = lastTurn;
      turn.append(copy);
    }
    const outputs = doc.createElement("div");
    outputs.className = "home-image-chat-outputs";
    for (const outcome of view.outcomes || []) {
      const item = outcome.status === "fulfilled" ? outcome.value.images?.[0] : null;
      const url = secureImageUrl(item?.url);
      if (url) {
        const image = doc.createElement("img");
        image.src = url;
        image.alt = `${outcome.item.label} 生成结果`;
        image.loading = "lazy";
        if (item.width && item.height) { image.width = item.width; image.height = item.height; }
        outputs.append(image);
      } else if (outcome.status === "rejected") {
        outputs.append(resultNote(outcome.reason?.message || "生成未完成"));
      }
    }
    if (view.stage === "error") outputs.append(resultNote(view.message));
    if (outputs.childElementCount) turn.append(outputs);
    if (turn.childElementCount) history.append(turn);
  }

  function resultNote(message) {
    const note = doc.createElement("p");
    note.textContent = message;
    return note;
  }

  async function upload(files) {
    if (camera.active()) { camera.upload(files); return; }
    if (workspaceInputs.active()) { workspaceInputs.upload(files); return; }
    if (!ready || uploading || !files.length) return;
    uploading = true;
    syncComposer();
    try { await addImages(files); }
    finally { uploading = false; syncComposer(); }
  }

  function activeInput() {
    return camera.textField() || workspaceInputs.textField() || nativeTools.textField() ||
      parameters.textField() || (composerMode === "free" ? input : null);
  }
  composer.addEventListener("input", event => {
    if (event.target === activeInput()) { resizeInput(); syncComposer(); }
  });
  composer.addEventListener("keydown", event => {
    if (event.target !== activeInput() || workspaceInputs.active()) return;
    if (event.key !== "Enter" || event.shiftKey || event.altKey || event.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    if (!event.repeat && !submit.disabled) composer.requestSubmit();
  });
  composer.addEventListener("paste", event => {
    if (event.target !== activeInput()) return;
    const files = Array.from(event.clipboardData?.files || []).filter(file => file.type.startsWith("image/"));
    if (files.length) { event.preventDefault(); void upload(files); }
  });
  fileInput.addEventListener("change", () => {
    const files = Array.from(fileInput.files);
    fileInput.value = "";
    void upload(files);
  });
  attach.addEventListener("click", () => {
    if (camera.active()) camera.attach();
    else if (workspaceInputs.active()) workspaceInputs.attach();
    else fileInput.click();
  });
  function dropFile(event) {
    if (event.defaultPrevented || root.dataset.tool === "style" ||
      (root.dataset.tool === "workspace" && !camera.active() && !workspaceInputs.active()) ||
      !event.dataTransfer?.types.includes("Files")) return;
    event.preventDefault();
    if (event.type === "drop") void upload(Array.from(event.dataTransfer.files));
  }
  composer.addEventListener("dragover", dropFile);
  composer.addEventListener("drop", dropFile);
  picker.addEventListener("canvas-lab:composer-feature", event => {
    if (!picker.disabled) openFeature(event.detail);
  });
  clear.addEventListener("click", () => {
    openFeature({ featureMode: "free", label: "" });
    picker.focus({ preventScroll: true });
  });
  root.querySelector("#homeImageChatNew").addEventListener("click", () => {
    reset();
    (activeInput() || picker).focus({ preventScroll: true });
  });
  model.addEventListener("change", () => { homeModelKey = model.value; selectModel(homeModelKey); });
  composer.addEventListener("submit", event => {
    event.preventDefault();
    if (submit.disabled) return;
    canvasPanel.reveal();
    if (camera.active()) camera.send();
    else send(activeInput()?.value.trim() || "");
  });
  for (const [slot, selector] of [[toolSlots.actions, ".generate-button"], [toolSlots.parameters, "#studioAdvancedToggle"]]) {
    slot.addEventListener("click", event => {
      if (event.target.closest(selector)?.matches(":enabled")) canvasPanel.reveal();
    }, { capture: true });
  }
  for (const link of doc.querySelectorAll('.workbench-shell [href="/"]')) {
    link.addEventListener("click", event => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      doc.querySelector("#productSidebarDialog[open]")?.close();
      reset();
      openHome();
    });
  }

  return {
    active: () => active,
    owns,
    lastPrompt: () => lastTurn,
    promptText: () => activeInput()?.value.trim() || "",
    revealParameters: parameters.reveal,
    refreshAction: syncComposer,
    setReady(value) { ready = value; syncComposer(); },
    setReferenceLabel(label) {
      if (camera.active() || workspaceInputs.active()) return;
      attach.setAttribute("aria-label", label);
      attach.title = label;
    },
    featureModels(from, to, keys) {
      if (from === "free") return savedModelKeys;
      if (to === "free") savedModelKeys = keys;
      return keys;
    },
    retainTurn(view) {
      if (homeJobId !== null) archive(view);
      homeJobId = null;
      lastTurn = "";
      prompt.hidden = true;
      showConversation(false);
    },
    closeTool,
    nativeActive: () => root.dataset.tool === "image",
    setFeature(mode, label = "", { workspace = false } = {}) {
      const changed = composerMode !== mode;
      const isCamera = workspace && mode === "floorPlanCamera";
      if (changed) { sizePopover.close(); closeTool(); }
      composerMode = mode;
      root.dataset.composerFeature = label ? mode : "";
      placeToolTrigger();
      picker.dataset.featureCatalogCurrent = label ? mode : "";
      picker.dataset.selected = String(Boolean(label));
      picker.querySelector("span").textContent = label || "选择功能";
      picker.setAttribute("aria-label", label ? `切换功能，当前${label}` : "选择功能");
      clear.hidden = !label;
      input.hidden = mode !== "free";
      model.hidden = mode !== "free";
      activeTask.querySelector("a").href = `/?feature=${mode}`;
      for (const { field } of generationFields) field.hidden = mode === "imageUpscale" || (mode === "free" && model.disabled);
      parameters.setFeature(mode, label);
      if (workspace || nativeTools.supports(mode)) {
        const kind = workspace ? "workspace" : mode === "styleDna" ? "style" : "image";
        if (root.dataset.tool !== kind || changed) {
          root.dataset.tool = kind;
          threadTool.hidden = kind !== "style";
          canvasPanel.setLabel(canvasLabels[mode]);
          toolSlots.parameters.hidden = false;
          if (workspace) {
            toolSlots.actions.hidden = false;
            closeQuick = bindEmbeddedWorkspaceQuickParameters({ mode, quickHost: toolQuick, settings: toolSlots.parameters });
          } else nativeTools.mount(mode);
          if (kind === "image") canvasPanel.update(lastReferences.length > 0);
          if (mode === "floorPlan") canvasPanel.update(true);
          followThread = true;
          requestAnimationFrame(scrollToLatest);
        }
        syncToolParameters();
      }
      workspaceInputs.setMode(workspace ? mode : null);
      camera.setActive(isCamera);
      placeOutputFields();
      resizeInput();
      syncComposer();
      return toolSlots;
    },
    route(feature) {
      const url = new URL(location.href);
      if (feature) url.searchParams.set("feature", feature);
      else url.searchParams.delete("feature");
      window.history.replaceState(window.history.state, "", url);
    },
    enter(keys) {
      if (active) return keys;
      savedModelKeys = keys;
      active = true;
      doc.documentElement.classList.add("image-chat-home");
      doc.querySelector("#workspacePanelDialog[open]")?.close();
      current.append(stage);
      for (const { field } of generationFields) settings.append(field);
      parameters.setFeature("free");
      placeOutputFields();
      root.hidden = false;
      resizeInput();
      followThread = true;
      requestAnimationFrame(scrollToLatest);
      return [homeModelKey];
    },
    leave(keys) {
      if (!active) return keys;
      sizePopover.close();
      closeTool();
      parameters.setFeature(null);
      active = false;
      root.hidden = true;
      doc.documentElement.classList.remove("image-chat-home");
      panel.insertBefore(stage, root);
      for (const { field, anchor } of generationFields) {
        field.hidden = false;
        anchor.after(field);
      }
      return composerMode === "free" ? savedModelKeys : keys;
    },
    models(catalog, checked) {
      const available = checked ? new Set(checked.filter(item => item.available).map(item => item.key)) : null;
      const candidates = available ? catalog.filter(item => available.has(item.key)) : catalog;
      const textModels = candidates.filter(item => !item.requiresReferenceImage);
      if (!candidates.some(item => item.key === homeModelKey) && catalog.length) {
        homeModelKey = (textModels.find(item => item.key === DEFAULT_TEXT_MODEL) || textModels[0] || candidates[0])?.key || "";
      }
      fillSelect(model, candidates.map(item => ({ value: item.key, label: item.label })), homeModelKey);
      model.disabled = !candidates.length;
      for (const { field } of generationFields) field.hidden = model.disabled;
      if (model.disabled) fillSelect(model, [{ value: "", label: "暂无可用模型" }], "");
      ready = catalog.length > 0;
      syncComposer();
      return homeModelKey ? [homeModelKey] : [];
    },
    refs(images) {
      if (images.length === lastReferences.length && images.every((image, index) => image.id === lastReferences[index])) return;
      lastReferences = images.map(image => image.id);
      if (root.dataset.tool === "image") canvasPanel.update(images.length > 0 || nativeHasResult, images.length > 0);
      syncComposer();
      references.hidden = !images.length;
      references.replaceChildren(...images.map((image, index) => {
        const tile = doc.createElement("span");
        tile.className = "home-image-chat-reference";
        const preview = doc.createElement("img");
        preview.src = image.dataUrl;
        preview.alt = image.name;
        const remove = doc.createElement("button");
        remove.type = "button";
        remove.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8m0-8-8 8"/></svg>';
        remove.setAttribute("aria-label", `移除 ${image.name}`);
        remove.addEventListener("click", () => {
          removeImage(image.id);
          const neighbor = references.children[index] ?? references.lastElementChild;
          (neighbor?.querySelector("button") ?? attach).focus({ preventScroll: true });
        });
        tile.append(preview, remove);
        return tile;
      }));
    },
    task(view, task, isRunning) {
      if (root.dataset.tool === "image") {
        nativeHasResult = view.stage !== "empty";
        canvasPanel.update(lastReferences.length > 0 || nativeHasResult);
      }
      busy = view.stage === "loading";
      running = isRunning;
      showConversation(owns(task) && view.stage !== "empty");
    },
    showStartupError() {
      showConversation(true);
    },
    start(jobId, message, previous, fromHome) {
      canvasPanel.reveal();
      if (homeJobId !== null) archive(previous);
      homeJobId = jobId;
      lastTurn = message;
      prompt.textContent = message;
      prompt.hidden = !message;
      if (fromHome && composerMode === "free") {
        input.value = "";
        resizeInput();
        syncComposer();
      }
      followThread = true;
      if (active) requestAnimationFrame(scrollToLatest);
    },
  };
}

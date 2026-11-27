/**
 * [INPUT]: 依赖首页首帧、共享功能目录、当前功能的原图与参数、原生画布停用及同源工作区输入挂载和任务
 * [OUTPUT]: 提供单行底栏、宽度适配的原参数快捷项、手机规格、按需画布与共用原图预览和删除
 * [POS]: public 的首页生图视图，由 app.js 注入同一套自由生图能力
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { fillSelect } from "./workbench-utils.js";
import { bindHomeChatParameters } from "./home-image-chat-parameters.js?v=11";
import { bindHomeNativeTools } from "./home-image-chat-native-tools.js?v=10";
import { bindHomeImageCamera } from "./home-image-chat-camera.js?v=8";
import { bindHomeCanvasPanel } from "./home-image-chat-canvas-panel.js";
import { bindHomeWorkspaceInputs } from "./home-image-chat-workspace-inputs.js?v=8";
import { bindEmbeddedWorkspaceQuickParameters } from "./workspace-quick-parameters.js?v=6";
import { bindResultImageViewer } from "./result-image-viewer.js?v=2";
import { bindHomeChatToolbar } from "./home-image-chat-toolbar.js?v=3";

const DEFAULT_TEXT_MODEL = "banana2";
const canvasLabels = {
  housePlanLayout: "户型画布", aiRenderStudio: "渲染画布",
  floorPlanCamera: "机位画布", imageOutpaint: "扩图画布",
  imageMultiAngle: "多角度画布", imageMaskFill: "编辑画布", imageRelight: "打光画布",
};

export function bindHomeComposerFeatures({ homeChat, host, state, view, render, selectFeatureMode }) {
  function open({ featureMode, label }) {
    const previous = host.isEmbedded() ? host.currentMode() : state.featureMode;
    if (homeChat.active() && previous !== featureMode) {
      homeChat.retainTurn(view(previous));
    }
    if (previous !== featureMode) homeChat.closeTool();
    if (host.supports(featureMode)) {
      homeChat.enter();
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

export function bindHomeImageChat({ send, getBlockReason, selectModel, addImages, removeImage, openHome, openFeature,
  renderHistory, deactivateNativeCanvas }) {
  const stage = document.querySelector("#resultStage");
  const panel = stage.parentElement;
  const root = document.querySelector("#homeImageChat");
  const doc = root.ownerDocument;
  const points = Array.from({ length: 30 }, () => doc.createElement("span"));
  points.forEach((point, index) => {
    point.style.setProperty("--home-chat-beam-index", String(index));
    point.style.setProperty("--home-chat-beam-edge-distance", String(Math.min(index, points.length - 1 - index)));
  });
  root.querySelector(".home-image-chat-focus-flow").append(...points);
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
    result: root.querySelector(".home-image-chat-workspace-result"),
  };
  const nativeTools = bindHomeNativeTools(root, {
    canvas: toolSlots.mount, transcript: threadTool.querySelector(".home-image-chat-tool-canvas"),
  });
  const toolQuick = root.querySelector(".home-image-chat-tool-quick");
  const advancedTrigger = root.querySelector(".home-image-chat-parameter-trigger.home-image-chat-advanced-trigger");
  const toolTrigger = root.querySelector(".home-image-chat-tool-parameter-trigger");
  let closeQuick;
  const settings = root.querySelector(".home-image-chat-settings");
  const sizeTrigger = root.querySelector(".home-image-chat-size-trigger");
  const sizeOptions = root.querySelector(".home-image-chat-size-options");
  const parameterDialog = root.querySelector("#homeImageChatParameterDialog");
  const parameterButton = () => [sizeTrigger, advancedTrigger, toolTrigger].find(button => !button.hidden);
  bindHomeChatToolbar(root, { dialog: parameterDialog, parameterButton });
  const phoneComposer = doc.defaultView.matchMedia("(max-width: 760px), (max-width: 900px) and (any-pointer: coarse)");
  const model = root.querySelector(".home-image-chat-model");
  const freeModelField = model.closest("label");
  const references = root.querySelector(".home-image-chat-references");
  const fileInput = root.querySelector("#homeImageChatFiles");
  const attach = root.querySelector("#homeImageChatAttach");
  const submit = root.querySelector("#homeImageChatSend");
  const validation = root.querySelector("#homeImageChatValidation");
  const sourceAttachment = root.querySelector(".home-image-chat-source-attachment");
  const sourcePreview = sourceAttachment.querySelector(".home-image-chat-source-preview");
  const sourceImage = sourcePreview.querySelector("img");
  const sourceRemove = sourceAttachment.querySelector("[data-chat-attachment-remove]");
  function showSource({ image, label = "原图", canPreview = false, replaceDisabled = true, removeDisabled = true } = {}) {
    sourceAttachment.hidden = !image;
    if (image && sourceImage.getAttribute("src") !== image) sourceImage.src = image;
    if (!image) sourceImage.removeAttribute("src");
    sourceImage.alt = canPreview ? label : "";
    sourceAttachment.ariaLabel = label;
    sourcePreview.title = sourcePreview.ariaLabel = `${canPreview ? "查看或更换" : "更换"}${label}`;
    if (canPreview) sourcePreview.setAttribute("aria-haspopup", "dialog");
    else sourcePreview.removeAttribute("aria-haspopup");
    sourcePreview.disabled = !image || (!canPreview && replaceDisabled);
    sourceRemove.ariaLabel = `移除${label}`;
    sourceRemove.disabled = !image || removeDisabled;
  }
  const canvasPanel = bindHomeCanvasPanel(root, {
    onExpandedChange: expanded => camera.setPanelExpanded(expanded),
  });
  const camera = bindHomeImageCamera(root, toolSlots, {
    onChange() { syncComposer(); resizeInput(); },
    onCanvasChange: canvasPanel.update,
    onSourceChange: showSource,
  });
  const workspaceInputs = bindHomeWorkspaceInputs(root, toolSlots, {
    onChange() { syncComposer(); resizeInput(); },
    onCanvasChange: canvasPanel.update,
    onSourceChange: showSource,
    onInlineResult(visible) { root.toggleAttribute("data-inline-workspace-result", visible); },
  });
  const sourceViewer = bindResultImageViewer({ action: {
    label: "更换场景图", run: () => attach.click(), disabled: () => attach.disabled,
  } });
  sourcePreview.addEventListener("click", () => {
    if (sourcePreview.hasAttribute("aria-haspopup")) sourceViewer.open(sourceImage, sourcePreview);
    else attach.click();
  });
  sourceRemove.addEventListener("click", () => {
    const controller = camera.active() ? camera : workspaceInputs;
    if (controller.removeSource()) attach.focus({ preventScroll: true });
  });
  let active = false;
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

  function revealTaskCanvas() {
    if (composerMode !== "imageRelight" && composerMode !== "aiRenderStudio") canvasPanel.reveal();
  }

  function closeTool() {
    parameters.closeAdvanced();
    if (!root.dataset.tool) return;
    canvasPanel.setLabel();
    nativeHasResult = false;
    workspaceInputs.setMode(null);
    camera.setActive(false);
    closeQuick?.();
    closeQuick = null;
    if (root.dataset.tool === "image") deactivateNativeCanvas();
    nativeTools.unmount();
    threadTool.hidden = true;
    toolSlots.actions.hidden = true;
    delete root.dataset.tool;
    syncParameterControls();
  }

  // ---- 同一组字段在首页和配置栏之间迁移，保留原生值和事件 ----
  const generationFields = ["ratioField", "resolutionField", "generationCountField"].map(id => {
    const field = doc.getElementById(id);
    const anchor = doc.createComment(id);
    field.before(anchor);
    return { field, anchor };
  });

  function syncParameterControls() {
    const available = parameters.hasAdvanced();
    const compact = phoneComposer.matches;
    const selects = parameters.specificationSelects();
    advancedTrigger.hidden = !available || compact || Boolean(root.dataset.tool);
    toolTrigger.hidden = !available || compact || !root.dataset.tool;
    sizeTrigger.hidden = !available || !compact;
    if (sizeTrigger.hidden) return;

    const values = selects
      .map(select => select.selectedOptions[0]?.label.trim()).filter(Boolean);
    const fullLabel = values.join(" · ");
    const label = values.map(value => {
      const summary = value.split(" · ", 1)[0];
      return /^(跟随原图|原图尺寸|自动（按场景图）)$/.test(summary) ? "原图" : summary.replace(/(\d+)\s+张$/, "$1张");
    }).join("·") || "参数";
    if (sizeTrigger.firstElementChild.textContent !== label) sizeTrigger.firstElementChild.textContent = label;
    sizeTrigger.title = fullLabel || "全部参数";
    sizeTrigger.setAttribute("aria-label", fullLabel ? `出图规格 ${fullLabel}` : "全部参数");
  }

  function placeOutputFields() {
    root.toggleAttribute("data-compact", phoneComposer.matches);
    if (!active) return;
    const compact = phoneComposer.matches && !root.dataset.tool && composerMode !== "imageUpscale";
    const target = compact ? sizeOptions : settings;
    if (generationFields[0].field.parentElement !== target) {
      const focused = doc.activeElement;
      const focusField = generationFields.find(({ field }) => field.contains(focused))?.field;
      for (const { field } of generationFields) target.append(field);
      syncParameterControls();
      if (compact && focusField) sizeTrigger.focus({ preventScroll: true });
      if (!compact && (focusField || focused === sizeTrigger)) {
        (focusField || generationFields[0].field).querySelector(".model-picker-trigger")?.focus({ preventScroll: true });
      }
    }
  }

  phoneComposer.addEventListener("change", () => {
    const focus = parameterDialog.open || [sizeTrigger, advancedTrigger, toolTrigger].includes(doc.activeElement);
    parameters.closeAdvanced();
    placeOutputFields();
    syncParameterControls();
    if (focus) parameterButton()?.focus({ preventScroll: true });
  });
  const sizesObserver = new MutationObserver(syncParameterControls);
  for (const region of [sizeOptions, settings, toolSlots.parameters]) sizesObserver.observe(region, {
    subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["hidden", "selected", "disabled", "class"],
  });
  root.addEventListener("change", event => { if (event.target.tagName === "SELECT") syncParameterControls(); });
  const atBottom = () => viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 48;
  const scrollToLatest = () => { viewport.scrollTop = viewport.scrollHeight; };
  viewport.addEventListener("scroll", () => { followThread = atBottom(); }, { passive: true });
  const threadObserver = new ResizeObserver(() => { if (active && followThread) scrollToLatest(); });
  threadObserver.observe(thread);
  threadObserver.observe(viewport);

  function syncComposer() {
    syncParameterControls();
    const workspaceSend = workspaceInputs.sendControl();
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
      submit.disabled = workspaceInputs.active() ? !workspaceSend || workspaceSend.disabled
        : !ready || busy || uploading || hasStandaloneActions || Boolean(issue?.message)
          || (composerMode === "free" && !text);
      const workspaceBusy = workspaceSend?.getAttribute("aria-busy") === "true";
      submit.setAttribute("aria-label", busy || workspaceBusy ? "正在生成图片" : "发送并生成图片");
      if (workspaceBusy) submit.setAttribute("aria-busy", "true");
      else submit.removeAttribute("aria-busy");
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
    if (view.stage !== "results") return;
    const outputs = doc.createElement("div");
    outputs.className = "result-gallery home-image-chat-outputs";
    renderHistory(outputs, view, homeJobId);
    if (!outputs.childElementCount) return;
    const turn = doc.createElement("article");
    turn.className = "home-image-chat-turn";
    if (lastTurn) {
      const copy = doc.createElement("p");
      copy.className = "home-image-chat-prompt";
      copy.textContent = lastTurn;
      turn.append(copy);
    }
    turn.append(outputs);
    history.append(turn);
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
    revealTaskCanvas();
    if (camera.active()) camera.send();
    else if (workspaceInputs.active()) workspaceInputs.sendControl()?.click();
    else send(activeInput()?.value.trim() || "");
  });
  toolSlots.actions.addEventListener("click", event => {
    if (event.target.closest(".generate-button:enabled")) revealTaskCanvas();
  }, { capture: true });
  toolSlots.parameters.addEventListener("click", event => {
    const toggle = event.target.closest("#studioAdvancedToggle:enabled");
    if (toggle) queueMicrotask(() => {
      if (toggle.getAttribute("aria-expanded") === "true") parameters.closeAdvanced();
    });
  }, { capture: true });
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
      if (changed) closeTool();
      composerMode = mode;
      root.dataset.composerFeature = label ? mode : "";
      picker.dataset.featureCatalogCurrent = label ? mode : "";
      picker.dataset.selected = String(Boolean(label));
      picker.querySelector("span").textContent = label;
      picker.title = label ? `切换功能 · ${label}` : "选择功能";
      picker.setAttribute("aria-label", label ? `切换功能，当前${label}` : "选择功能");
      clear.hidden = !label;
      input.hidden = mode !== "free";
      freeModelField.hidden = model.hidden = mode !== "free";
      activeTask.querySelector("a").href = `/?feature=${mode}`;
      for (const { field } of generationFields) field.hidden = (mode === "imageUpscale" && field.id !== "resolutionField") || (mode === "free" && model.disabled);
      parameters.setFeature(mode, label);
      if (workspace || nativeTools.supports(mode)) {
        const kind = workspace ? "workspace" : mode === "styleDna" ? "style" : "image";
        if (root.dataset.tool !== kind || changed) {
          root.dataset.tool = kind;
          threadTool.hidden = kind !== "style";
          canvasPanel.setLabel(canvasLabels[mode], { expandOnReady: mode !== "imageRelight" });
          toolSlots.parameters.hidden = false;
          if (workspace) {
            toolSlots.actions.hidden = false;
            closeQuick = bindEmbeddedWorkspaceQuickParameters({ mode, quickHost: toolQuick, settings: toolSlots.parameters });
          } else nativeTools.mount(mode);
          if (kind === "image") canvasPanel.update(lastReferences.length > 0);
          followThread = true;
          requestAnimationFrame(scrollToLatest);
        }
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
    enter() {
      if (active) return;
      active = true;
      doc.documentElement.classList.add("image-chat-home");
      doc.querySelector("#workspacePanelDialog[open]")?.close();
      current.append(stage);
      for (const { field } of generationFields) settings.append(field);
      parameters.setFeature("free");
      placeOutputFields();
      root.hidden = false;
      root.inert = false;
      resizeInput();
      followThread = true;
      requestAnimationFrame(scrollToLatest);
    },
    leave() {
      if (!active) return;
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
        tile.dataset.chatAttachment = "";
        const preview = doc.createElement("img");
        preview.src = image.dataUrl;
        preview.alt = image.name;
        const remove = doc.createElement("button");
        remove.type = "button";
        remove.dataset.chatAttachmentRemove = "";
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
      revealTaskCanvas();
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

/**
 * [INPUT]: 依赖主工作台功能目录、配置/结果原节点，以及渲染台、户型布局、机位渲染和人物宠物的同源工作区
 * [OUTPUT]: 提供共用保活画布、同源结果交接、原参数与 START 挂载，仅在切换展示时清理浮层
 * [POS]: public 的共享独立工作区边界，不向普通生成接口注册占位功能或提交请求
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { SCENE_CAST_MODE, SCENE_CAST_PAGE, SCENE_CAST_LABEL, SCENE_CAST_OPEN, SCENE_CAST_IMPORT } from "./scene-cast-handoff.js";
import { bindFeatureCatalogFrame } from "./feature-catalog.js?v=10";

const FEATURE_MODE = "aiRenderStudio";
const FRAME_URL = "/ai-render-studio.html?embedded=1";
const WORKSPACES = Object.freeze({
  aiRenderStudio: { title: "AI渲染台", url: FRAME_URL, dock: FEATURE_MODE },
  floorPlanCamera: { title: "平面图机位渲染", url: "/floor-plan-camera.html?embedded=1", dock: "floorPlanCamera" },
  housePlanLayout: { title: "户型平面布局", url: "/house-plan.html?embedded=1", dock: "housePlan" },
  [SCENE_CAST_MODE]: { title: SCENE_CAST_LABEL, url: SCENE_CAST_PAGE, dock: SCENE_CAST_MODE },
});

// --- 仅同源且主页面提供完整槽位时移动原控件，独立打开可保留本页布局 ---
export function mountWorkspaceControls(dock, settings, actions) {
  const doc = settings?.ownerDocument;
  const view = doc?.defaultView;
  if (!view || view.parent === view || actions?.ownerDocument !== doc) return false;
  let parentDoc;
  try { parentDoc = view.parent.document; }
  catch { return false; }
  const settingsMount = parentDoc?.getElementById(`${dock}SettingsMount`);
  const actionsMount = parentDoc?.getElementById(`${dock}ActionsMount`);
  if (!settingsMount || !actionsMount) return false;
  settingsMount.replaceChildren(settings);
  actionsMount.replaceChildren(actions);
  return true;
}

const supports = mode => Object.hasOwn(WORKSPACES, mode);

function placeWorkspaceNode(parent, node) {
  if (!parent || node.parentNode === parent) return;
  // -------- 原子移动已连接的 iframe 宿主，保留子文档与标注草稿 --------
  if (parent.isConnected && node.isConnected && typeof parent.moveBefore === "function") {
    parent.moveBefore(node, null);
  } else parent.append(node);
}

export function bindAiRenderStudioHost({ root = typeof document === "undefined" ? null : document.querySelector(".workspace") } = {}) {
  if (!root) return { supports, show() {}, hide() {}, importSceneCast() {}, isActive: () => false, isEmbedded: () => false, currentMode: () => null };
  const doc = root.ownerDocument, win = doc.defaultView;
  const panel = doc.querySelector("#configurationPanel");
  const directory = doc.querySelector("#featureModeList");
  const buttons = Array.from(directory?.querySelectorAll("[data-feature-mode]") || []);
  const legacy = [panel?.querySelector(".control-panel-scroll"), panel?.querySelector(".action-section"),
    root.querySelector(".result-panel")].filter(Boolean);
  const host = doc.createElement("section");
  host.id = "aiRenderStudioHost";
  host.className = "ai-render-studio-host";
  host.setAttribute("aria-label", "AI渲染台");
  host.hidden = true;
  host.inert = true;
  root.append(host);
  const docks = new Map();
  for (const [mode, { dock }] of Object.entries(WORKSPACES)) {
    if (!dock) continue;
    const settings = doc.createElement("div"), actions = doc.createElement("div");
    settings.id = `${dock}SettingsMount`;
    actions.id = `${dock}ActionsMount`;
    const house = mode === "housePlanLayout";
    settings.className = `isolated-workspace-settings ${house ? "house-plan-parent-settings" : "control-panel-scroll"}`;
    actions.className = `isolated-workspace-actions ${house ? "house-plan-parent-actions" : "action-section"}`;
    settings.hidden = settings.inert = actions.hidden = actions.inert = true;
    panel?.append(settings, actions);
    docks.set(mode, { settings, actions });
  }
  let activeMode = null, embeddedSlots = null, previous = [];
  const frames = new Map();
  let pendingScene = null;

  function updateUrl(featureMode) {
    if (!win?.location?.href || !win.history?.replaceState) return;
    const url = new URL(win.location.href);
    url.searchParams.set("feature", featureMode);
    win.history.replaceState(win.history.state, "", url);
  }
  function selectButton(featureMode) {
    for (const button of buttons) {
      const selected = button.dataset.featureMode === featureMode;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-checked", String(selected));
    }
  }
  function selectDock(mode) {
    for (const [key, { settings, actions }] of docks) {
      const chat = key === mode && embeddedSlots;
      placeWorkspaceNode(chat ? chat.parameters : panel, settings);
      placeWorkspaceNode(chat ? chat.actions : panel, actions);
      settings.hidden = settings.inert = actions.hidden = actions.inert = key !== mode;
    }
    if (embeddedSlots) {
      embeddedSlots.parameters.hidden = embeddedSlots.actions.hidden = !docks.has(mode);
      return;
    }
    for (const node of [root, doc.body]) {
      node.classList.toggle("is-docked-workspace", docks.has(mode));
      node.classList.toggle("is-house-plan", mode === "housePlanLayout");
      node.classList.toggle("is-scene-cast", mode === SCENE_CAST_MODE);
    }
  }
  function show(mode = FEATURE_MODE, options = {}) {
    if (!supports(mode)) return false;
    const { embedded = false, mount, parameters, actions } = options;
    if (embedded && (!mount || !parameters || !actions)) return false;
    const changingWorkspace = activeMode !== mode || Boolean(embeddedSlots) !== embedded
      || (embedded && (embeddedSlots.mount !== mount || embeddedSlots.parameters !== parameters || embeddedSlots.actions !== actions));
    if (activeMode && Boolean(embeddedSlots) !== embedded) resetPresentation();
    const workspace = WORKSPACES[mode];
    if (!embedded && !activeMode) previous = legacy.map((node) => ({ node, hidden: node.hidden, inert: node.inert }));
    embeddedSlots = embedded ? options : null;
    activeMode = mode;
    placeWorkspaceNode(embedded ? mount : root, host);
    let frame = frames.get(mode);
    if (!frame) {
      frame = doc.createElement("iframe");
      frame.title = workspace.title;
      frame.className = "ai-render-studio-frame";
      frame.src = workspace.url;
      frames.set(mode, frame);
      frame.addEventListener("load", () => {
        frame.dataset.ready = "true";
        if (mode === SCENE_CAST_MODE) sendScene();
      });
      bindFeatureCatalogFrame(frame);
      host.append(frame);
    }
    for (const [key, node] of frames) { node.hidden = key !== mode; node.inert = key !== mode; }
    host.setAttribute("aria-label", workspace.title);
    selectDock(mode);
    if (changingWorkspace) {
      for (const menu of doc.querySelectorAll("[popover]")) {
        try { menu.hidePopover?.(); } catch { /* 已关闭的原控件无需其他操作。 */ }
      }
    }
    if (embedded) {
      host.classList.add("is-conversation-workspace");
      host.dataset.conversationTool = mode;
    } else {
      root.classList.add("is-ai-render-studio");
      doc.body.classList.add("is-ai-render-studio");
      for (const node of legacy) { node.hidden = true; node.inert = true; }
      const dialog = doc.querySelector("#workspacePanelDialog");
      if (dialog?.open && (!docks.has(mode) || mode === "housePlanLayout")) dialog.close();
      selectButton(mode);
      updateUrl(mode);
    }
    host.hidden = false;
    host.inert = false;
    return true;
  }
  function sendScene() {
    const frame = frames.get(SCENE_CAST_MODE);
    if (!pendingScene || frame?.dataset.ready !== "true") return;
    frame.contentWindow?.postMessage({ type: SCENE_CAST_IMPORT, payload: pendingScene }, win.location.origin);
    pendingScene = null;
  }
  function importSceneCast(payload) {
    if (!payload?.imageUrl || !payload.sourceRender) return;
    pendingScene = payload;
    const slots = embeddedSlots;
    show(SCENE_CAST_MODE, slots || undefined);
    slots?.onFeatureChange?.(SCENE_CAST_MODE, WORKSPACES[SCENE_CAST_MODE].title);
    sendScene();
  }
  win?.addEventListener?.("message", event => {
    if (event.origin !== win.location.origin || event.data?.type !== SCENE_CAST_OPEN) return;
    if (![FEATURE_MODE, "floorPlanCamera"].includes(activeMode) || frames.get(activeMode)?.contentWindow !== event.source) return;
    importSceneCast(event.data.payload);
  });
  function resetPresentation({ parkInConversation = false } = {}) {
    const slots = embeddedSlots;
    embeddedSlots = null;
    activeMode = null;
    selectDock(null);
    if (slots) slots.parameters.hidden = slots.actions.hidden = true;
    host.hidden = true;
    host.inert = true;
    host.classList.remove("is-conversation-workspace");
    delete host.dataset.conversationTool;
    if (!slots || !parkInConversation) placeWorkspaceNode(root, host);
    root.classList.remove("is-ai-render-studio");
    doc.body.classList.remove("is-ai-render-studio");
    for (const { node, hidden, inert } of previous) { node.hidden = hidden; node.inert = inert; }
    previous = [];
  }
  function hide(featureMode) {
    if (!activeMode) return;
    resetPresentation({ parkInConversation: !featureMode });
    if (featureMode) { selectButton(featureMode); updateUrl(featureMode); }
    // --- 视口可能已在渲染台停留期间改变，交给现有控制器重新计算抽屉/参数可用性 ---
    if (win?.Event && win.dispatchEvent) win.dispatchEvent(new win.Event("resize"));
  }
  // --- 独立工作区共享原控制器的隔离守卫，旧功能的异步配置刷新不会抢回页面 ---
  for (const button of buttons) {
    if (["housePlanLayout", "floorPlanCamera"].includes(button.dataset.featureMode)) {
      button.addEventListener?.("click", () => show(button.dataset.featureMode));
    }
  }
  const initialMode = win?.location?.href && new URL(win.location.href).searchParams.get("feature");
  if (["housePlanLayout", "floorPlanCamera"].includes(initialMode)) show(initialMode);
  return { supports, show, hide, importSceneCast, isActive: () => Boolean(activeMode),
    isEmbedded: () => Boolean(embeddedSlots), currentMode: () => activeMode };
}

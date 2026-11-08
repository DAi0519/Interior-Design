/**
 * [INPUT]: 依赖主工作台功能目录、配置/结果原节点，以及同源AI渲染台和平面布局独立页面
 * [OUTPUT]: 对外提供AI渲染台、平面图机位渲染、户型平面布局与设计实验室 Beta 的保活iframe宿主，户型布局参数/START挂入原工作台容器；切换时隔离旧START/参数/结果并保留各路输入和任务
 * [POS]: public 的共享独立工作区边界，不向普通生成接口注册占位功能或提交请求
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

const FEATURE_MODE = "aiRenderStudio";
const FRAME_URL = "/ai-render-studio.html?embedded=1";
const WORKSPACES = Object.freeze({
  aiRenderStudio: { title: "AI渲染台", url: FRAME_URL },
  floorPlanCamera: { title: "平面图机位渲染", url: "/floor-plan-camera.html?embedded=1" },
  housePlanLayout: { title: "户型平面布局", url: "/house-plan.html?embedded=1" },
  floorPlan: { title: "设计实验室 · Beta", url: "/floor-plan.html?embedded=1" },
});

export function bindAiRenderStudioHost({ root = typeof document === "undefined" ? null : document.querySelector(".workspace") } = {}) {
  if (!root) return { show() {}, hide() {}, isActive: () => false };
  const doc = root.ownerDocument, win = doc.defaultView;
  const panel = doc.querySelector("#configurationPanel");
  const directory = panel?.querySelector("#featureModeList");
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
  const houseSettings = doc.createElement("div");
  houseSettings.id = "housePlanSettingsMount"; houseSettings.className = "house-plan-parent-settings"; houseSettings.hidden = true;
  const houseActions = doc.createElement("div");
  houseActions.id = "housePlanActionsMount"; houseActions.className = "house-plan-parent-actions"; houseActions.hidden = true;
  panel?.append(houseSettings, houseActions);
  let active = false, previous = [];
  const frames = new Map();

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
  function show(mode = FEATURE_MODE) {
    const workspace = WORKSPACES[mode];
    if (!workspace) return;
    let frame = frames.get(mode);
    if (!frame) {
      frame = doc.createElement("iframe");
      frame.title = workspace.title;
      frame.className = "ai-render-studio-frame";
      frame.src = workspace.url;
      frames.set(mode, frame);
      host.append(frame);
    }
    for (const [key, node] of frames) { node.hidden = key !== mode; node.inert = key !== mode; }
    host.setAttribute("aria-label", workspace.title);
    if (!active) previous = legacy.map((node) => ({ node, hidden: node.hidden, inert: node.inert }));
    active = true;
    const house = mode === "housePlanLayout";
    root.classList.toggle("is-house-plan", house);
    doc.body.classList.toggle("is-house-plan", house);
    houseSettings.hidden = houseActions.hidden = !house;
    root.classList.add("is-ai-render-studio");
    doc.body.classList.add("is-ai-render-studio");
    for (const node of legacy) { node.hidden = true; node.inert = true; }
    for (const menu of doc.querySelectorAll("[popover]")) {
      try { menu.hidePopover?.(); } catch { /* 已关闭的原控件无需其他操作。 */ }
    }
    const dialog = doc.querySelector("#workspacePanelDialog");
    if (dialog?.open) dialog.close();
    host.hidden = false;
    host.inert = false;
    selectButton(mode);
    updateUrl(mode);
  }
  function hide(featureMode) {
    if (!active) return;
    active = false;
    root.classList.remove("is-house-plan"); doc.body.classList.remove("is-house-plan");
    houseSettings.hidden = houseActions.hidden = true;
    host.hidden = true;
    host.inert = true;
    root.classList.remove("is-ai-render-studio");
    doc.body.classList.remove("is-ai-render-studio");
    for (const { node, hidden, inert } of previous) { node.hidden = hidden; node.inert = inert; }
    previous = [];
    if (featureMode) { selectButton(featureMode); updateUrl(featureMode); }
    // --- 视口可能已在渲染台停留期间改变，交给现有控制器重新计算抽屉/参数可用性 ---
    if (win?.Event && win.dispatchEvent) win.dispatchEvent(new win.Event("resize"));
  }
  // --- 独立工作区共享原控制器的隔离守卫，旧功能的异步配置刷新不会抢回页面 ---
  for (const button of buttons) {
    if (["floorPlan", "housePlanLayout", "floorPlanCamera"].includes(button.dataset.featureMode)) {
      button.addEventListener?.("click", () => show(button.dataset.featureMode));
    }
  }
  const initialMode = win?.location?.href && new URL(win.location.href).searchParams.get("feature");
  if (["floorPlan", "housePlanLayout", "floorPlanCamera"].includes(initialMode)) show(initialMode);
  return { show, hide, isActive: () => active };
}

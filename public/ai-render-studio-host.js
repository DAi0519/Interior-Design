/**
 * [INPUT]: 依赖主工作台功能目录、配置/结果原节点，以及同源AI渲染台独立页面
 * [OUTPUT]: 对外提供正式功能入口的保活iframe宿主，切换时隔离旧START/参数/结果并保留两路输入和任务
 * [POS]: public 的主工作台与独立渲染台页面边界，不向普通生成接口注册占位功能或提交请求
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

const FEATURE_MODE = "aiRenderStudio";
const FRAME_URL = "/ai-render-studio.html?embedded=1";

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
  let active = false, frame = null, previous = [];

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
  function show() {
    if (!frame) {
      frame = doc.createElement("iframe");
      frame.title = "AI渲染台";
      frame.className = "ai-render-studio-frame";
      frame.src = FRAME_URL;
      host.append(frame);
    }
    if (!active) previous = legacy.map((node) => ({ node, hidden: node.hidden, inert: node.inert }));
    active = true;
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
    selectButton(FEATURE_MODE);
    updateUrl(FEATURE_MODE);
  }
  function hide(featureMode) {
    if (!active) return;
    active = false;
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
  return { show, hide, isActive: () => active };
}

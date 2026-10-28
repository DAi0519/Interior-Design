/**
 * [INPUT]: 依赖生图工作台原配置栏/功能按钮、原生 dialog、共享 select 适配、指针/RAF/观察器和可选本机存储
 * [OUTPUT]: 对外提供含质感增强的紧凑目录标签、布局偏好归一化、目录缩窄/参数自适应几何与窄尾吸附，以及保留原节点的分割线拖宽、键盘调整和移动抽屉
 * [POS]: public 的生图工作台布局控制器，仅维护面板呈现，不改变上传、生成配置或后台任务
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export const WORKSPACE_PANEL_STORAGE_KEY = "canvas-lab.workspace-panel";
const MIN_WIDTH = 80;
const DEFAULT_MIN_WIDTH = 448;
const MAX_WIDTH = 620;
const NAVIGATION_WIDTH = 144;
const COMPACT_NAVIGATION_WIDTH = 80;
const MIN_PARAMETER_WIDTH = 304;
const MAX_PARAMETER_WIDTH = 476;
const MIN_READABLE_PARAMETER_WIDTH = 224;
const MIN_READABLE_PANEL_WIDTH = COMPACT_NAVIGATION_WIDTH + MIN_READABLE_PARAMETER_WIDTH;
const controllers = new WeakMap();
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const positiveNumber = value => typeof value === "number" && Number.isFinite(value) && value > 0;
const COMPACT_LABELS = Object.freeze({
  whiteModel: "白模渲染", emptyRoom: "空房设计", styleTransfer: "风格转换", refinedModel: "精模渲染",
  effectBeautification: "效果美化", effectEnhancement: "氛围转换", panoramaEnhancement: "全景美化", textureEnhancement: "质感增强",
  imageUpscale: "图片超分", imageOutpaint: "AI扩图", imageMultiAngle: "多角度", styleDna: "风格反推", free: "自由生图",
});

export function normalizeWorkspacePanelState(value) {
  // -------- 存储中的 parameterWidth 沿用展开基准，实际宽度由几何逐帧计算 --------
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  if (Object.hasOwn(source, "width") || Object.hasOwn(source, "parameterWidth")) {
    return {
      width: positiveNumber(source.width) ? Math.round(clamp(source.width, MIN_WIDTH, MAX_WIDTH)) : null,
      parameterWidth: positiveNumber(source.parameterWidth)
        ? Math.round(clamp(source.parameterWidth, MIN_PARAMETER_WIDTH, MAX_PARAMETER_WIDTH)) : null,
    };
  }
  const base = positiveNumber(source.expandedWidth)
    ? Math.round(clamp(source.expandedWidth, DEFAULT_MIN_WIDTH, MAX_WIDTH)) : null;
  return {
    width: source.collapsed === true ? MIN_WIDTH : base === null ? null
      : base - (source.navigationCollapsed === true || source.navCollapsed === true ? 64 : 0),
    parameterWidth: base === null ? null : base - NAVIGATION_WIDTH,
  };
}

export function workspacePanelBounds(workspaceWidth, viewportWidth = workspaceWidth) {
  const available = positiveNumber(workspaceWidth) ? workspaceWidth : 824;
  const viewport = positiveNumber(viewportWidth) ? viewportWidth : available;
  const max = Math.max(DEFAULT_MIN_WIDTH, Math.min(MAX_WIDTH, Math.floor(available - 16 - 360)));
  return { min: MIN_WIDTH, max, defaultWidth: Math.round(clamp(viewport * .33, DEFAULT_MIN_WIDTH, Math.min(490, max))) };
}

export function workspacePanelGeometry(width, parameterWidth = MIN_PARAMETER_WIDTH) {
  const total = clamp(positiveNumber(width) ? width : DEFAULT_MIN_WIDTH, MIN_WIDTH, MAX_WIDTH);
  let parameterBasis = clamp(positiveNumber(parameterWidth) ? parameterWidth : MIN_PARAMETER_WIDTH,
    MIN_PARAMETER_WIDTH, MAX_PARAMETER_WIDTH);
  if (total > parameterBasis + NAVIGATION_WIDTH) parameterBasis = Math.min(MAX_PARAMETER_WIDTH, total - NAVIGATION_WIDTH);
  const navigationWidth = clamp(total - parameterBasis, COMPACT_NAVIGATION_WIDTH, NAVIGATION_WIDTH);
  const available = Math.max(0, total - navigationWidth);
  const actualParameterWidth = Math.max(MIN_READABLE_PARAMETER_WIDTH, Math.min(parameterBasis, available));
  const parameterVisible = Math.min(available, actualParameterWidth);
  const parametersClipping = available < MIN_READABLE_PARAMETER_WIDTH;
  return {
    width: total, parameterBasis, parameterWidth: actualParameterWidth, navigationWidth, parameterVisible,
    parameterProgress: parameterVisible / actualParameterWidth,
    stage: total < parameterBasis + COMPACT_NAVIGATION_WIDTH ? 2 : navigationWidth < NAVIGATION_WIDTH ? 1 : 0,
    collapsed: total === MIN_WIDTH,
    navigationCollapsed: navigationWidth < 128,
    parametersClipping,
  };
}

export function snapWorkspacePanelWidth(width, parameterWidth) {
  const geometry = workspacePanelGeometry(width, parameterWidth);
  if (geometry.width >= MIN_READABLE_PANEL_WIDTH) return geometry.width;
  return geometry.width >= (MIN_WIDTH + MIN_READABLE_PANEL_WIDTH) / 2 ? MIN_READABLE_PANEL_WIDTH : MIN_WIDTH;
}

export function bindWorkspacePanel({
  root = typeof document === "undefined" ? null : document.querySelector(".workspace"), storage,
} = {}) {
  if (!root) return null;
  if (controllers.has(root)) return controllers.get(root);
  const doc = root.ownerDocument, win = doc.defaultView;
  const panel = root.querySelector("#configurationPanel");
  const resizer = root.querySelector("#workspacePanelResize");
  const launcher = root.querySelector("#workspacePanelOpen");
  const dialog = doc.querySelector("#workspacePanelDialog");
  const closeButton = panel?.querySelector("#workspacePanelClose");
  const featureSelect = panel?.querySelector("#workspaceFeatureSelect");
  const directory = panel?.querySelector("#featureModeList");
  if (!panel || !resizer || !launcher || !dialog || !closeButton || !featureSelect || !directory) return null;
  const scroll = panel.querySelector(".control-panel-scroll");
  const actions = panel.querySelector(".action-section");
  const launcherLabel = launcher.querySelector("[data-active-feature]");
  const buttons = Array.from(directory.querySelectorAll("[data-feature-mode]"));
  const subscriptions = [];
  function listen(target, name, callback, options) {
    target?.addEventListener(name, callback, options);
    subscriptions.push(() => target?.removeEventListener(name, callback, options));
  }
  let persistence = storage;
  if (persistence === undefined) {
    try { persistence = win.localStorage; } catch { persistence = null; }
  }
  let preferences;
  try { preferences = normalizeWorkspacePanelState(JSON.parse(persistence?.getItem(WORKSPACE_PANEL_STORAGE_KEY) || "null")); }
  catch { preferences = normalizeWorkspacePanelState(null); }
  const mobileQuery = win.matchMedia("(max-width: 900px)");
  let mobile = mobileQuery.matches, drawerOpen = false, syncingFeature = false, destroyed = false;
  let drag = null, keyboard = null, frame = null, preview = null, lastMaximum = null;

  function bounds() {
    return workspacePanelBounds(root.clientWidth || root.getBoundingClientRect().width, win.innerWidth);
  }
  function geometry() {
    if (preview) return preview;
    const limits = bounds();
    const parameterBasis = clamp(preferences.parameterWidth ?? limits.defaultWidth - NAVIGATION_WIDTH,
      MIN_PARAMETER_WIDTH, MAX_PARAMETER_WIDTH);
    return workspacePanelGeometry(clamp(preferences.width ?? limits.defaultWidth, limits.min, limits.max), parameterBasis);
  }
  function save() {
    try { persistence?.setItem(WORKSPACE_PANEL_STORAGE_KEY, JSON.stringify(preferences)); }
    catch { /* -------- 本机存储不可用时不阻断布局交互 -------- */ }
  }
  function activeButton() {
    return buttons.find(button => button.getAttribute("aria-checked") === "true") || buttons[0];
  }
  function updateLabels() {
    const label = activeButton()?.textContent.trim() || "生成配置";
    closeButton.title = `关闭配置面板 · ${label}`;
    closeButton.setAttribute("aria-label", closeButton.title);
    launcher.title = `打开配置面板 · ${label}`;
    launcher.setAttribute("aria-label", launcher.title);
    launcher.setAttribute("aria-expanded", String(mobile && drawerOpen));
    launcher.setAttribute("aria-controls", dialog.id);
    if (launcherLabel) launcherLabel.textContent = label;
  }
  function visualGeometry() {
    if (!mobile) return geometry();
    const defaultWidth = bounds().defaultWidth;
    return workspacePanelGeometry(defaultWidth, defaultWidth - NAVIGATION_WIDTH);
  }
  function render() {
    const limits = bounds();
    const current = geometry();
    const visual = visualGeometry();
    for (const [name, enabled] of [["is-panel-collapsed", !mobile && current.collapsed],
      ["is-navigation-collapsed", !mobile && current.navigationCollapsed],
      ["is-parameters-clipping", !mobile && current.parametersClipping],
      ["is-parameters-narrow", !mobile && current.parameterWidth < MIN_PARAMETER_WIDTH]]) {
      root.classList.toggle(name, enabled);panel.classList.toggle(name, enabled);
    }
    root.classList.toggle("is-panel-drawer-open", mobile && drawerOpen);
    const variables = {
      "--workspace-panel-width": `${visual.width}px`, "--workspace-navigation-width": `${visual.navigationWidth}px`,
      "--workspace-parameter-width": `${visual.parameterWidth}px`,
      "--workspace-parameter-basis": `${visual.parameterBasis}px`,
      "--workspace-parameter-progress": String(visual.parameterProgress),
      "--workspace-parameter-visible-width": `${visual.parameterVisible}px`,
    };
    for (const [name, value] of Object.entries(variables)) root.style.setProperty(name, value);
    if (scroll) scroll.inert = !mobile && current.parametersClipping;
    directory.inert = false;
    if (actions) actions.inert = !mobile && current.parametersClipping;
    resizer.hidden = mobile;resizer.inert = mobile;resizer.tabIndex = mobile ? -1 : 0;
    resizer.setAttribute("aria-controls", panel.id);
    resizer.setAttribute("aria-valuemin", String(limits.min));
    resizer.setAttribute("aria-valuemax", String(limits.max));
    resizer.setAttribute("aria-valuenow", String(Math.round(current.width)));
    resizer.setAttribute("aria-valuetext", `${Math.round(current.width)} 像素；功能目录 ${Math.round(current.navigationWidth)} 像素`);
    updateLabels();
  }

  // -------- 原功能按钮仍是业务真源，紧凑标签不替换原文与无障碍名称 --------
  featureSelect.replaceChildren(...buttons.map(button => {
    const label = button.textContent.trim();
    button.dataset.compactLabel = COMPACT_LABELS[button.dataset.featureMode] || Array.from(label).slice(0, 4).join("");
    if (!button.getAttribute("aria-label")) button.setAttribute("aria-label", label);
    if (!button.title) button.title = label;
    const option = doc.createElement("option");option.value = button.dataset.featureMode;
    option.textContent = label;option.disabled = button.disabled;return option;
  }));
  function syncFeature() {
    const active = activeButton(), options = Array.from(featureSelect.options || featureSelect.children);
    buttons.forEach((button, index) => { if (options[index]) options[index].disabled = button.disabled; });
    if (active && featureSelect.value !== active.dataset.featureMode) {
      featureSelect.value = active.dataset.featureMode;syncingFeature = true;
      try { featureSelect.dispatchEvent(new win.Event("change", { bubbles: true })); }
      finally { syncingFeature = false; }
    }
    updateLabels();
  }
  listen(featureSelect, "change", () => {
    if (syncingFeature) return;
    const target = buttons.find(button => button.dataset.featureMode === featureSelect.value);
    if (target && !target.disabled && target !== activeButton()) target.click();
    syncFeature();
  });
  const featureObserver = new win.MutationObserver(syncFeature);
  featureObserver.observe(directory, { attributes: true, subtree: true, attributeFilter: ["aria-checked", "disabled"] });

  function closePanelMenus() {
    let heldFocus = false;
    for (const trigger of panel.querySelectorAll("[aria-controls]")) {
      for (const id of (trigger.getAttribute("aria-controls") || "").split(/\s+/)) {
        const menu = doc.getElementById?.(id);
        if (!menu?.hasAttribute?.("popover")) continue;
        heldFocus = heldFocus || menu.contains(doc.activeElement);menu.hidePopover?.();
      }
    }
    return heldFocus;
  }
  function persistGeometry(value, snap) {
    const width = clamp(snap ? snapWorkspacePanelWidth(value.width, value.parameterBasis) : value.width, MIN_WIDTH, bounds().max);
    const final = workspacePanelGeometry(width, value.parameterBasis);
    preferences = { width: Math.round(final.width), parameterWidth: Math.round(final.parameterBasis) };
    save();
  }
  function cancelFrame() {
    if (frame !== null) { win.cancelAnimationFrame(frame);frame = null; }
  }
  function flushDrag() {
    cancelFrame();
    if (drag?.pending) { preview = drag.pending;drag.pending = null;render(); }
  }
  function finishDrag(commit) {
    if (!drag) return;
    flushDrag();const previous = drag;drag = null;
    if (commit && previous.changed) persistGeometry(preview || previous.start, true);
    preview = null;root.classList.remove("is-panel-resizing");
    if (resizer.hasPointerCapture?.(previous.id)) resizer.releasePointerCapture(previous.id);
    render();
  }
  function finishKeyboard(commit) {
    if (!keyboard) return;
    keyboard = null;
    if (commit && preview) persistGeometry(preview, true);
    preview = null;render();
  }
  function setWidth(value, { snap = true } = {}) {
    finishDrag(false);finishKeyboard(false);closePanelMenus();
    if (value === null) { preferences = { width: null, parameterWidth: null };save(); }
    else if (positiveNumber(value)) {
      const current = geometry();
      persistGeometry(workspacePanelGeometry(clamp(value, MIN_WIDTH, bounds().max), current.parameterBasis), snap);
    }
    if (!mobile && (scroll?.contains(doc.activeElement) || actions?.contains(doc.activeElement))
      && geometry().parametersClipping) resizer.focus({ preventScroll: true });
    render();
  }

  // -------- 抽屉移动原 aside；桌面宽度偏好与移动开关独立 --------
  function open() {
    if (!mobile) { setWidth(null);resizer.focus({ preventScroll: true });return; }
    if (!dialog.open) dialog.showModal();drawerOpen = true;render();closeButton.focus({ preventScroll: true });
  }
  function close() {
    if (!mobile) { setWidth(MIN_WIDTH);return; }
    closePanelMenus();if (dialog.open) dialog.close();drawerOpen = false;render();launcher.focus({ preventScroll: true });
  }
  listen(closeButton, "click", close);
  listen(launcher, "click", open);
  listen(dialog, "cancel", event => { event.preventDefault();close(); });
  listen(dialog, "close", () => {
    if (dialog.open) return;drawerOpen = false;render();if (mobile) launcher.focus({ preventScroll: true });
  });
  listen(dialog, "click", event => { if (event.target === dialog) close(); });

  // -------- 分割线先收目录再自适应参数；展开基准只随本次拖动峰值增长 --------
  function queueDrag(event) {
    if (!drag || drag.id !== event.pointerId || !Number.isFinite(event.clientX)) return;
    const width = clamp(drag.start.width + event.clientX - drag.x, MIN_WIDTH, bounds().max);
    const next = workspacePanelGeometry(width, drag.parameterBasis);
    drag.parameterBasis = Math.max(drag.parameterBasis, next.parameterBasis);
    drag.pending = workspacePanelGeometry(width, drag.parameterBasis);
    drag.changed = drag.changed || width !== drag.start.width || drag.parameterBasis !== drag.start.parameterBasis;
    if (frame === null) frame = win.requestAnimationFrame(() => { frame = null;flushDrag(); });
  }
  listen(resizer, "pointerdown", event => {
    if (mobile || drag || event.isPrimary === false || event.button !== 0) return;
    finishKeyboard(true);event.preventDefault();closePanelMenus();resizer.focus({ preventScroll: true });
    const start = geometry();drag = { id: event.pointerId, x: event.clientX, start, parameterBasis: start.parameterBasis, changed: false };
    resizer.setPointerCapture?.(event.pointerId);root.classList.add("is-panel-resizing");
  });
  listen(resizer, "pointermove", queueDrag);
  listen(resizer, "pointerup", event => { if (drag?.id === event.pointerId) { queueDrag(event);finishDrag(true); } });
  for (const name of ["pointercancel", "lostpointercapture"]) listen(resizer, name, event => {
    if (drag?.id === event.pointerId) finishDrag(false);
  });
  listen(resizer, "dblclick", () => { if (!mobile) setWidth(null); });
  listen(resizer, "keydown", event => {
    if (event.key === "Escape" && (drag || keyboard)) {
      event.preventDefault();finishDrag(false);finishKeyboard(false);return;
    }
    if (mobile || drag || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Home" || event.key === "End") {
      const current = geometry();finishKeyboard(false);
      persistGeometry(workspacePanelGeometry(event.key === "Home" ? MIN_WIDTH : bounds().max, current.parameterBasis), true);
      render();return;
    }
    closePanelMenus();const current = geometry();keyboard ||= { parameterBasis: current.parameterBasis };
    const delta = (event.shiftKey ? 32 : 8) * (event.key === "ArrowLeft" ? -1 : 1);
    const next = workspacePanelGeometry(clamp(current.width + delta, MIN_WIDTH, bounds().max), keyboard.parameterBasis);
    keyboard.parameterBasis = Math.max(keyboard.parameterBasis, next.parameterBasis);
    preview = workspacePanelGeometry(next.width, keyboard.parameterBasis);render();
  });
  listen(resizer, "blur", () => { finishDrag(false);finishKeyboard(true); });

  function responsiveLayout() {
    if (destroyed) return;
    const nextMobile = mobileQuery.matches, changed = nextMobile !== mobile;
    const nextMaximum = bounds().max;
    let heldFocus = panel.contains(doc.activeElement) || doc.activeElement === resizer || doc.activeElement === launcher;
    if (changed) { heldFocus = closePanelMenus() || heldFocus;finishDrag(false);finishKeyboard(false); }
    else if (lastMaximum !== null && nextMaximum !== lastMaximum) { finishDrag(false);finishKeyboard(false); }
    lastMaximum = nextMaximum;
    mobile = nextMobile;
    if (mobile) { if (panel.parentNode !== dialog) dialog.append(panel); }
    else { if (dialog.open) dialog.close();drawerOpen = false;if (panel.parentNode !== root) root.insertBefore(panel, resizer); }
    render();
    if (changed && heldFocus) (mobile ? launcher : resizer).focus({ preventScroll: true });
  }
  listen(mobileQuery, "change", responsiveLayout);listen(win, "resize", responsiveLayout);
  listen(win, "blur", () => { finishDrag(false);finishKeyboard(true); });
  const resizeObserver = new win.ResizeObserver(responsiveLayout);resizeObserver.observe(root);
  root.classList.add("workspace-panel-layout");responsiveLayout();syncFeature();
  const controller = {
    open, close, setWidth, state: () => ({ ...visualGeometry(), mobile, drawerOpen }),
    destroy() {
      finishDrag(false);finishKeyboard(false);destroyed = true;
      subscriptions.forEach(unsubscribe => unsubscribe());featureObserver.disconnect();resizeObserver.disconnect();
      if (dialog.open) dialog.close();if (panel.parentNode !== root) root.insertBefore(panel, resizer);
      if (scroll) scroll.inert = false;directory.inert = false;if (actions) actions.inert = false;
      for (const name of ["workspace-panel-layout", "is-panel-collapsed", "is-navigation-collapsed", "is-panel-drawer-open", "is-panel-resizing", "is-parameters-clipping", "is-parameters-narrow"]) {
        root.classList.remove(name);panel.classList.remove(name);
      }
      for (const name of ["--workspace-panel-width", "--workspace-navigation-width", "--workspace-parameter-width", "--workspace-parameter-basis", "--workspace-parameter-progress", "--workspace-parameter-visible-width"]) root.style.removeProperty(name);
      controllers.delete(root);
    },
  };
  controllers.set(root, controller);return controller;
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => bindWorkspacePanel(), { once: true });
  else bindWorkspacePanel();
}

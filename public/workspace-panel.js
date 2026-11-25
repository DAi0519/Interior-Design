/**
 * [INPUT]: 依赖生图工作台独立侧栏的功能按钮、配置栏、原生 dialog、共享 select 适配、指针/RAF/观察器和可选本机存储
 * [OUTPUT]: 提供参数栏收展、宽度记忆、移动参数抽屉与当前功能标题，保留首页宿主接管的参数表单交互
 * [POS]: public 的生图工作台布局控制器，仅维护面板呈现，不改变上传、生成配置或后台任务
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export const WORKSPACE_PANEL_STORAGE_KEY = "canvas-lab.workspace-panel";
// -------- 旧偏好中的宽度包含原144px目录，保留偏好值及拖动吸附边界 --------
const LEGACY_NAVIGATION_WIDTH = 144;
const MIN_WIDTH = LEGACY_NAVIGATION_WIDTH;
const DEFAULT_MIN_WIDTH = 448;
const MAX_WIDTH = 620;
const MIN_PARAMETER_WIDTH = 304;
const MAX_PARAMETER_WIDTH = 476;
const MIN_READABLE_PARAMETER_WIDTH = 224;
const MIN_READABLE_PANEL_WIDTH = LEGACY_NAVIGATION_WIDTH + MIN_READABLE_PARAMETER_WIDTH;
const MOUSE_DRAG_THRESHOLD = 2;
const TOUCH_DRAG_THRESHOLD = 10;
const controllers = new WeakMap();
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const positiveNumber = value => typeof value === "number" && Number.isFinite(value) && value > 0;

export function normalizeWorkspacePanelState(value) {
  // -------- 保留展开基准；旧80px目录和不可读的参数尾段迁入完整状态 --------
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  if (Object.hasOwn(source, "width") || Object.hasOwn(source, "parameterWidth")) {
    const state = {
      width: positiveNumber(source.width) ? snapWorkspacePanelWidth(Math.round(source.width), source.parameterWidth) : null,
      parameterWidth: positiveNumber(source.parameterWidth)
        ? Math.round(clamp(source.parameterWidth, MIN_PARAMETER_WIDTH, MAX_PARAMETER_WIDTH)) : null,
    };
    if (state.width === MIN_WIDTH && positiveNumber(source.lastExpandedWidth)
      && source.lastExpandedWidth >= MIN_READABLE_PANEL_WIDTH) {
      state.lastExpandedWidth = Math.min(Math.round(source.lastExpandedWidth), MAX_WIDTH);
    }
    return state;
  }
  const base = positiveNumber(source.expandedWidth)
    ? Math.round(clamp(source.expandedWidth, DEFAULT_MIN_WIDTH, MAX_WIDTH)) : null;
  return {
    width: source.collapsed === true ? MIN_WIDTH : base,
    parameterWidth: base === null ? null : base - LEGACY_NAVIGATION_WIDTH,
  };
}

function expandedPreferences({ lastExpandedWidth, parameterWidth }) {
  const fallback = parameterWidth === null ? null : LEGACY_NAVIGATION_WIDTH + parameterWidth;
  return { width: lastExpandedWidth ?? fallback, parameterWidth };
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
  if (total > parameterBasis + LEGACY_NAVIGATION_WIDTH) parameterBasis = Math.min(MAX_PARAMETER_WIDTH, total - LEGACY_NAVIGATION_WIDTH);
  const navigationWidth = LEGACY_NAVIGATION_WIDTH;
  const available = Math.max(0, total - navigationWidth);
  const actualParameterWidth = Math.max(MIN_READABLE_PARAMETER_WIDTH, Math.min(parameterBasis, available));
  const parameterVisible = Math.min(available, actualParameterWidth);
  const parametersClipping = available < MIN_READABLE_PARAMETER_WIDTH;
  return {
    width: total, parameterBasis, parameterWidth: actualParameterWidth, navigationWidth, parameterVisible,
    parameterProgress: parameterVisible / actualParameterWidth,
    stage: parametersClipping ? 2 : 0,
    collapsed: total === MIN_WIDTH,
    navigationCollapsed: false,
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
  const workspaceTitle = doc.querySelector("#workspaceCurrentFeature");
  const launcher = root.querySelector("#workspacePanelOpen");
  const dialog = doc.querySelector("#workspacePanelDialog");
  const closeButton = panel?.querySelector("#workspacePanelClose");
  const featureSelect = panel?.querySelector("#workspaceFeatureSelect");
  const directory = doc.querySelector("#featureModeList");
  if (!panel || !resizer || !launcher || !dialog || !closeButton || !featureSelect || !directory) return null;
  const scroll = panel.querySelector(".control-panel-scroll") || doc.querySelector(".home-image-chat-parameter-source .control-panel-scroll");
  const actions = panel.querySelector(".action-section");
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
  if (preferences.width === MIN_WIDTH) preferences = expandedPreferences(preferences);
  const mobileQuery = win.matchMedia("(max-width: 900px)");
  let mobile = mobileQuery.matches, drawerOpen = false, backdropPressed = false, syncingFeature = false, destroyed = false;
  let drag = null, keyboard = null, frame = null, preview = null, lastMaximum = null;

  function bounds() {
    const contentWidth = root.clientWidth || root.getBoundingClientRect().width;
    return workspacePanelBounds(contentWidth + LEGACY_NAVIGATION_WIDTH, win.innerWidth);
  }
  function geometry() {
    if (preview) return preview;
    const limits = bounds();
    const parameterBasis = clamp(preferences.parameterWidth ?? limits.defaultWidth - LEGACY_NAVIGATION_WIDTH,
      MIN_PARAMETER_WIDTH, MAX_PARAMETER_WIDTH);
    return workspacePanelGeometry(clamp(preferences.width ?? limits.defaultWidth, limits.min, limits.max), parameterBasis);
  }
  function save() {
    // -------- 收起留在当前页面，只保存可展开的宽度 --------
    const saved = preferences.width === MIN_WIDTH ? expandedPreferences(preferences) : preferences;
    try { persistence?.setItem(WORKSPACE_PANEL_STORAGE_KEY, JSON.stringify(saved)); }
    catch { /* -------- 本机存储不可用时不阻断布局交互 -------- */ }
  }
  function activeButton() {
    return buttons.find(button => button.getAttribute("aria-checked") === "true");
  }
  function updateLabels() {
    const label = activeButton()?.textContent.trim() || "生成配置";
    closeButton.title = `关闭配置面板 · ${label}`;
    closeButton.setAttribute("aria-label", closeButton.title);
    launcher.title = `打开参数配置 · ${label}`;
    launcher.setAttribute("aria-label", launcher.title);
    launcher.setAttribute("aria-expanded", String(mobile && drawerOpen));
    launcher.setAttribute("aria-controls", dialog.id);
    if (workspaceTitle) workspaceTitle.textContent = activeButton() ? label : "";
  }
  function visualGeometry() {
    if (!mobile) return geometry();
    const defaultWidth = bounds().defaultWidth;
    return workspacePanelGeometry(defaultWidth, defaultWidth - LEGACY_NAVIGATION_WIDTH);
  }
  function render() {
    const limits = bounds();
    const current = geometry();
    const visual = visualGeometry();
    for (const [name, enabled] of [["is-panel-collapsed", !mobile && current.collapsed],
      ["is-parameters-clipping", !mobile && current.parametersClipping]]) {
      root.classList.toggle(name, enabled);panel.classList.toggle(name, enabled);
    }
    root.style.setProperty("--workspace-parameter-visible-width", `${visual.parameterVisible}px`);
    if (scroll) scroll.inert = panel.contains(scroll) && !mobile && current.parametersClipping;
    if (actions) actions.inert = !mobile && current.parametersClipping;
    resizer.hidden = mobile;resizer.inert = mobile;resizer.tabIndex = mobile ? -1 : 0;
    resizer.setAttribute("aria-controls", panel.id);
    resizer.setAttribute("aria-valuemin", "0");
    resizer.setAttribute("aria-valuemax", String(limits.max - LEGACY_NAVIGATION_WIDTH));
    resizer.setAttribute("aria-valuenow", String(Math.round(current.parameterVisible)));
    resizer.setAttribute("aria-valuetext", `参数配置 ${Math.round(current.parameterVisible)} 像素`);
    updateLabels();
  }

  // -------- 功能目录始终保留完整名称，抽屉选择复用同一组业务按钮 --------
  featureSelect.replaceChildren(...buttons.map(button => {
    const label = button.textContent.trim();
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
    const previousWidth = preferences.width ?? bounds().defaultWidth;
    const lastExpandedWidth = previousWidth >= MIN_READABLE_PANEL_WIDTH ? previousWidth : preferences.lastExpandedWidth;
    preferences = { width: Math.round(final.width), parameterWidth: Math.round(final.parameterBasis) };
    if (final.collapsed && lastExpandedWidth) preferences.lastExpandedWidth = lastExpandedWidth;
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
    if (commit && !previous.axis) toggleParameterPanel();
    else render();
  }
  function finishKeyboard(commit) {
    if (!keyboard) return;
    keyboard = null;
    if (commit && preview) persistGeometry(preview, true);
    preview = null;render();
  }
  function setWidth(value, { snap = true } = {}) {
    finishDrag(false);finishKeyboard(false);closePanelMenus();
    if (value === null) {
      preferences = { width: null, parameterWidth: null };
      save();
    }
    else if (positiveNumber(value)) {
      const current = geometry();
      persistGeometry(workspacePanelGeometry(clamp(value, MIN_WIDTH, bounds().max), current.parameterBasis), snap);
    }
    if (!mobile && (scroll?.contains(doc.activeElement) || actions?.contains(doc.activeElement))
      && geometry().parametersClipping) resizer.focus({ preventScroll: true });
    render();
  }

  function toggleParameterPanel() {
    if (!geometry().collapsed) {
      setWidth(MIN_WIDTH);
      return;
    }
    closePanelMenus();
    preferences = expandedPreferences(preferences);
    save();
    render();
  }

  // -------- 抽屉移动原 aside；桌面宽度偏好与移动开关独立 --------
  function open() {
    if (!mobile) { setWidth(null);resizer.focus({ preventScroll: true });return; }
    if (!dialog.open) dialog.showModal();drawerOpen = true;render();closeButton.focus({ preventScroll: true });
  }
  function close() {
    if (!mobile) { setWidth(MIN_WIDTH);return; }
    backdropPressed = false;
    closePanelMenus();if (dialog.open) dialog.close();drawerOpen = false;render();launcher.focus({ preventScroll: true });
  }
  listen(closeButton, "click", close);
  listen(launcher, "click", open);
  listen(dialog, "cancel", event => { event.preventDefault();close(); });
  listen(dialog, "close", () => {
    backdropPressed = false;
    if (dialog.open) return;drawerOpen = false;render();if (mobile) launcher.focus({ preventScroll: true });
  });
  function onBackdrop(event) {
    if (event.target !== dialog) return false;
    const { left, right, top, bottom } = dialog.getBoundingClientRect();
    return event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom;
  }
  listen(dialog, "pointerdown", event => {
    backdropPressed = event.isPrimary !== false && event.button === 0 && !event.ctrlKey && onBackdrop(event)
      && !panel.querySelector('.model-picker-trigger[aria-expanded="true"]');
  });
  listen(dialog, "pointercancel", () => { backdropPressed = false; });
  listen(dialog, "click", event => {
    const dismiss = !event.defaultPrevented && backdropPressed && onBackdrop(event);
    backdropPressed = false;
    if (dismiss) close();
  });

  // -------- 短按收展，横移超过阈值才拖宽，纵向移开也不触发短按 --------
  function queueDrag(event) {
    if (!drag || drag.id !== event.pointerId || !Number.isFinite(event.clientX)) return;
    const dx = event.clientX - drag.x;
    const dy = Number.isFinite(event.clientY) ? event.clientY - drag.y : 0;
    if (!drag.axis) {
      const xDistance = Math.abs(dx);
      const yDistance = Math.abs(dy);
      if (Math.max(xDistance, yDistance) < drag.threshold) return;
      drag.axis = xDistance >= yDistance ? "horizontal" : "vertical";
      if (drag.axis === "horizontal") root.classList.add("is-panel-resizing");
    }
    if (drag.axis !== "horizontal") return;
    const width = clamp(drag.start.width + dx, MIN_WIDTH, bounds().max);
    const next = workspacePanelGeometry(width, drag.parameterBasis);
    drag.parameterBasis = Math.max(drag.parameterBasis, next.parameterBasis);
    drag.pending = workspacePanelGeometry(width, drag.parameterBasis);
    drag.changed = drag.changed || width !== drag.start.width || drag.parameterBasis !== drag.start.parameterBasis;
    if (frame === null) frame = win.requestAnimationFrame(() => { frame = null;flushDrag(); });
  }
  listen(resizer, "pointerdown", event => {
    if (mobile || drag || event.isPrimary === false || event.button !== 0 || event.ctrlKey) return;
    finishKeyboard(true);event.preventDefault();closePanelMenus();resizer.focus({ preventScroll: true });
    const start = geometry();
    drag = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY ?? 0,
      threshold: event.pointerType === "touch" ? TOUCH_DRAG_THRESHOLD : MOUSE_DRAG_THRESHOLD,
      start,
      parameterBasis: start.parameterBasis,
      changed: false,
      axis: null,
    };
    resizer.setPointerCapture?.(event.pointerId);
  });
  listen(resizer, "pointermove", queueDrag);
  listen(resizer, "pointerup", event => { if (drag?.id === event.pointerId) { queueDrag(event);finishDrag(true); } });
  for (const name of ["pointercancel", "lostpointercapture"]) listen(resizer, name, event => {
    if (drag?.id === event.pointerId) finishDrag(false);
  });
  // -------- 指针在释放时已经处理；零点击计数保留给辅助技术 --------
  listen(resizer, "click", event => {
    if (!mobile && !drag && event.detail === 0 && !event.pointerType) toggleParameterPanel();
  });
  listen(resizer, "keydown", event => {
    if (event.isComposing || event.keyCode === 229) return;
    if (event.key === "Escape" && (drag || keyboard)) {
      event.preventDefault();finishDrag(false);finishKeyboard(false);return;
    }
    if (mobile || drag) return;
    if (event.key === "Enter") {
      event.preventDefault();
      if (!event.repeat) {
        finishKeyboard(true);
        toggleParameterPanel();
      }
      return;
    }
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
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
    let heldFocus = panel.contains(doc.activeElement) || doc.activeElement === launcher || doc.activeElement === resizer;
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
      if (scroll) scroll.inert = false;if (actions) actions.inert = false;
      for (const name of ["workspace-panel-layout", "is-panel-collapsed", "is-panel-resizing", "is-parameters-clipping"]) {
        root.classList.remove(name);panel.classList.remove(name);
      }
      root.style.removeProperty("--workspace-parameter-visible-width");
      controllers.delete(root);
    },
  };
  controllers.set(root, controller);return controller;
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => bindWorkspacePanel(), { once: true });
  else bindWorkspacePanel();
}

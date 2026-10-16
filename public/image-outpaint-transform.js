/**
 * [INPUT]: 依赖原图/目标尺寸、扩图控制器提供的连续视觉规划/缩放边界，以及现有画布和底部定位 DOM
 * [OUTPUT]: 对外提供独立于模型整数对齐的浮点视觉规划、合帧队列、固定对角锚点变换与可取消/提交的缩放绑定
 * [POS]: public 的扩图构图变换层，由 image-outpaint.js 驱动状态，不改变目标画幅、分辨率或生成链路
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

const CORNERS = { nw: [-1, -1], ne: [1, -1], sw: [-1, 1], se: [1, 1] };
const CORNER_LABELS = { nw: "左上角", ne: "右上角", sw: "左下角", se: "右下角" };
const PRESETS = [1.5, 2, 3];
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const close = (first, second) => Math.abs(first - second) < 0.000001;

// -------- 视觉只保留原图比例和浮点坐标，模型整数/ceil32 对齐留到请求规划 --------
export function outpaintVisualPlan({ source, target, scale, position = { x: 0.5, y: 0.5 }, limits = {} }) {
  const alignment = limits.sourceSizing === "original" ? 1 : limits.inputAlignment ?? 32;
  const maxInputEdge = limits.maxInputEdge ?? 4096;
  const availableWidth = Math.floor(Math.min(target.width, maxInputEdge) / alignment) * alignment;
  const availableHeight = Math.floor(Math.min(target.height, maxInputEdge) / alignment) * alignment;
  const contain = Math.min(availableWidth / source.width, availableHeight / source.height);
  const base = { width: source.width * contain, height: source.height * contain };
  const width = base.width * scale;
  const height = base.height * scale;
  const horizontal = target.width - width;
  const vertical = target.height - height;
  const left = horizontal * clamp(position.x, 0, 1);
  const top = vertical * clamp(position.y, 0, 1);
  return { base, prepared: { width, height }, target,
    expansion: { left, top, right: horizontal - left, bottom: vertical - top }, scale };
}

// -------- 一帧只处理最新输入，提交同步冲刷，取消丢弃旧输入 --------
export function createOutpaintFrameQueue({ view, apply }) {
  let frame = null;
  let pending = null;
  const run = () => {
    const value = pending;
    pending = null;
    if (value !== null) apply(value);
  };
  const cancelFrame = () => {
    if (frame !== null) view?.cancelAnimationFrame?.(frame);
    frame = null;
  };
  return {
    push(value) {
      pending = value;
      if (frame !== null) return;
      if (!view?.requestAnimationFrame) return run();
      frame = view.requestAnimationFrame(() => { frame = null; run(); });
    },
    flush() { cancelFrame(); run(); },
    cancel() { cancelFrame(); pending = null; },
  };
}

// -------- 锚点上限只在手势开始解析求一次，不读取模型像素网格 --------
export function prepareOutpaintCorner({ plan, scale, bounds, corner }) {
  const [horizontal, vertical] = CORNERS[corner];
  const { prepared, target, expansion } = plan;
  const anchorX = expansion.left + (horizontal < 0 ? prepared.width : 0);
  const anchorY = expansion.top + (vertical < 0 ? prepared.height : 0);
  const fitWidth = prepared.width / scale;
  const fitHeight = prepared.height / scale;
  const availableWidth = horizontal < 0 ? anchorX : target.width - anchorX;
  const availableHeight = vertical < 0 ? anchorY : target.height - anchorY;
  const preparedFor = (next) => ({ width: fitWidth * next, height: fitHeight * next });
  const maximumScale = clamp(Math.min(availableWidth / fitWidth, availableHeight / fitHeight), bounds.min, bounds.max);
  return { horizontal, vertical, anchorX, anchorY, maximumScale, preparedFor };
}

// -------- 角点固定对角锚点，热路径始终使用连续尺寸与坐标 --------
export function outpaintCornerTransform(state) {
  const { plan, scale, bounds, deltaX, deltaY } = state;
  const { horizontal, vertical, anchorX, anchorY, maximumScale, preparedFor } = state.cornerGeometry || prepareOutpaintCorner(state);
  const { prepared, target } = plan;
  const projection = (horizontal * deltaX * prepared.width + vertical * deltaY * prepared.height)
    / (prepared.width ** 2 + prepared.height ** 2);
  const desiredScale = clamp(scale * (1 + projection), bounds.min, bounds.max);
  const nextScale = Math.min(desiredScale, maximumScale);
  const reachedEdge = desiredScale > maximumScale;
  const { width, height } = preparedFor(nextScale);
  const left = horizontal < 0 ? anchorX - width : anchorX;
  const top = vertical < 0 ? anchorY - height : anchorY;
  return {
    scale: nextScale,
    position: {
      x: target.width > width ? clamp(left / (target.width - width), 0, 1) : 0.5,
      y: target.height > height ? clamp(top / (target.height - height), 0, 1) : 0.5,
    },
    boundary: close(nextScale, bounds.min) ? "min" : reachedEdge || close(nextScale, bounds.max) ? "max" : null,
  };
}

function centeredTransform({ plan, scale, bounds }, nextScale) {
  nextScale = clamp(nextScale, bounds.min, bounds.max);
  const width = plan.prepared.width * nextScale / scale;
  const height = plan.prepared.height * nextScale / scale;
  const left = plan.expansion.left + (plan.prepared.width - width) / 2;
  const top = plan.expansion.top + (plan.prepared.height - height) / 2;
  return {
    scale: nextScale,
    position: {
      x: plan.target.width > width ? clamp(left / (plan.target.width - width), 0, 1) : 0.5,
      y: plan.target.height > height ? clamp(top / (plan.target.height - height), 0, 1) : 0.5,
    },
  };
}

export function bindImageOutpaintTransform({ canvas, sourceImage, positionRoot, getState, onTransform, onCommit = () => {} }) {
  const document = canvas.ownerDocument;
  const create = (tag, className, id) => {
    const node = document.createElement(tag);
    node.className = className;
    if (id) node.id = id;
    return node;
  };
  const frame = create("div", "image-outpaint-transform-frame");
  frame.setAttribute("aria-label", "原图缩放控制");
  const status = create("div", "image-outpaint-scale-status", "imageOutpaintScaleStatus");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.setAttribute("aria-atomic", "true");
  canvas.append(frame, status);
  const settings = create("button", "image-outpaint-settings", "imageOutpaintSettings");
  settings.type = "button";
  settings.setAttribute("aria-haspopup", "dialog");
  settings.setAttribute("aria-expanded", "false");
  settings.setAttribute("aria-controls", "imageOutpaintScalePopover");
  const label = create("span", "image-outpaint-settings-label");
  label.textContent = "原图大小";
  const value = create("span", "image-outpaint-settings-value", "imageOutpaintScaleValue");
  settings.append(label, value);
  const popover = create("div", "image-outpaint-scale-popover", "imageOutpaintScalePopover");
  popover.setAttribute("popover", "auto");
  popover.setAttribute("role", "dialog");
  popover.setAttribute("aria-label", "图像设置");
  const presetLabel = create("p", "image-outpaint-scale-label");
  presetLabel.textContent = "扩图倍率";
  const presets = create("div", "image-outpaint-scale-presets");
  const presetButtons = PRESETS.map((multiple) => {
    const button = create("button", "image-outpaint-scale-preset");
    button.type = "button";
    button.dataset.outpaintScale = String(multiple);
    button.textContent = `${multiple}倍`;
    button.addEventListener("click", () => changeScale(1 / multiple));
    presets.append(button);
    return button;
  });
  const rangeLabel = create("label", "image-outpaint-scale-label");
  rangeLabel.setAttribute("for", "imageOutpaintScaleRange");
  rangeLabel.textContent = "原图大小";
  const range = create("input", "image-outpaint-scale-range", "imageOutpaintScaleRange");
  range.type = "range";
  range.step = "any";
  range.setAttribute("aria-label", "原图大小");
  range.addEventListener("input", () => {
    if (!rangeState) { cancelInteraction(); rangeState = getState(); }
    if (rangeState.plan) inputQueue.push({ scale: Number(range.value) });
  });
  range.addEventListener("change", () => end());
  range.addEventListener("blur", () => end());
  const rangeEnds = create("div", "image-outpaint-scale-ends");
  const minimum = create("span", "");
  minimum.textContent = "缩小";
  const maximum = create("span", "");
  maximum.textContent = "放大";
  rangeEnds.append(minimum, maximum);
  popover.append(presetLabel, presets, rangeLabel, range, rangeEnds);
  positionRoot.append(settings, popover);
  if (!popover.showPopover) popover.hidden = true;
  let drag = null;
  let rangeState = null;
  let boundary = null;
  let lastScale = null;
  let hovered = false;
  let focused = false;
  let updating = false;
  const inputQueue = createOutpaintFrameQueue({ view: document.defaultView, apply(input) {
    const state = drag || rangeState;
    if (!state || state.isCurrent?.() === false) return cancelInteraction();
    const result = drag ? outpaintCornerTransform({ ...drag,
      deltaX: (input.clientX - drag.clientX) / drag.rect.width * drag.plan.target.width,
      deltaY: (input.clientY - drag.clientY) / drag.rect.height * drag.plan.target.height })
      : centeredTransform(state, input.scale);
    boundary = result.boundary || null;
    const plan = state.visualPlanForScale(result.scale, result.position);
    updating = true;
    onTransform(result, { commit: false, plan });
    render({ ...state, plan, scale: result.scale });
    updating = false;
    state.dirty = true;
  } });

  function renderPreview(plan = getState().plan) {
    if (!plan) return;
    const { target, prepared, expansion } = plan;
    const properties = {
      left: `${expansion.left / target.width * 100}%`,
      top: `${expansion.top / target.height * 100}%`,
      width: `${prepared.width / target.width * 100}%`,
      height: `${prepared.height / target.height * 100}%`,
    };
    for (const [property, value] of Object.entries(properties)) {
      if (frame.style[property] !== value) frame.style[property] = value;
    }
    status.style.left = `calc(${properties.left} + 8px)`;
    status.style.top = `calc(${properties.top} + 8px)`;
  }

  function render(nextState = getState()) {
    const { plan, scale, bounds } = nextState;
    const enabled = Boolean(plan);
    frame.hidden = !enabled;
    settings.disabled = !enabled;
    range.disabled = !enabled;
    if (!enabled) {
      value.textContent = "上传后设置";
      status.textContent = "";
      closeSettings();
      return;
    }
    if (lastScale !== null && !close(lastScale, scale) && !drag && !updating) boundary = null;
    lastScale = scale;
    const selected = PRESETS.find((multiple) => close(1 / multiple, scale));
    value.textContent = selected ? `${selected}倍` : "自定义";
    settings.title = `原图大小：${value.textContent}`;
    range.min = String(bounds.min);
    range.max = String(bounds.max);
    range.value = String(scale);
    range.setAttribute("aria-valuetext", `${Math.round(scale * 100)}%`);
    presetButtons.forEach((button) => {
      const presetScale = 1 / Number(button.dataset.outpaintScale);
      button.disabled = presetScale < bounds.min - 0.000001;
      button.setAttribute("aria-pressed", String(close(presetScale, scale)));
    });
    renderPreview(plan);
    const edge = boundary || (close(scale, bounds.min) ? "min" : close(scale, bounds.max) ? "max" : null);
    const message = edge === "min" ? "图片已达最小值" : edge === "max" ? "图片已达最大值" : "";
    if (status.textContent !== message) status.textContent = message;
    status.classList.toggle("is-visible", Boolean(message && (drag || hovered || focused)));
    handles.forEach((handle) => { handle.title = message || "拖动等比缩放；方向键或加减键调整大小"; });
  }

  function changeScale(nextScale) {
    cancelInteraction();
    const state = getState();
    if (!state.plan) return;
    boundary = null;
    commitTransform(centeredTransform(state, nextScale));
  }

  function commitTransform(next) {
    updating = true;
    onTransform(next);
    updating = false;
  }

  function start(event, handle, clientX, clientY) {
    event.preventDefault();
    event.stopPropagation();
    cancelInteraction();
    const state = getState();
    const rect = canvas.getBoundingClientRect();
    if (!state.plan || !(rect.width > 0 && rect.height > 0)) return;
    drag = { ...state, corner: handle.dataset.outpaintCorner, clientX, clientY, rect };
    drag.cornerGeometry = prepareOutpaintCorner(drag);
    boundary = null;
    frame.classList.toggle("resizing", true);
    handle.focus?.({ preventScroll: true });
    render(state);
  }

  function move(event, clientX, clientY) {
    if (!drag) return;
    event.preventDefault();
    inputQueue.push({ clientX, clientY });
  }

  function end(event) {
    if (!drag && !rangeState) return;
    const point = event?.changedTouches?.[0] || event;
    if (drag && Number.isFinite(point?.clientX) && Number.isFinite(point?.clientY)) inputQueue.push({ clientX: point.clientX, clientY: point.clientY });
    inputQueue.flush();
    const dirty = drag?.dirty || rangeState?.dirty;
    drag = null;
    rangeState = null;
    frame.classList.toggle("resizing", false);
    if (dirty) onCommit();
  }

  function cancelInteraction() {
    inputQueue.cancel();
    if (rangeState && lastScale !== null) range.value = String(lastScale);
    drag = null;
    rangeState = null;
    frame.classList.toggle("resizing", false);
    if (!hovered && !focused) status.classList.toggle("is-visible", false);
  }

  const handles = Object.keys(CORNERS).map((corner) => {
    const handle = create("button", `image-outpaint-resize-handle ${corner}`);
    handle.type = "button";
    handle.dataset.outpaintCorner = corner;
    handle.setAttribute("aria-label", `${CORNER_LABELS[corner]}等比缩放原图`);
    handle.setAttribute("aria-describedby", status.id);
    handle.addEventListener("mousedown", (event) => {
      if (event.button === 0) start(event, handle, event.clientX, event.clientY);
    });
    handle.addEventListener("touchstart", (event) => {
      event.stopPropagation();
      if (event.touches.length === 1) start(event, handle, event.touches[0].clientX, event.touches[0].clientY);
    }, { passive: false });
    handle.addEventListener("mouseenter", () => { hovered = true; render(); });
    handle.addEventListener("mouseleave", () => { hovered = false; render(); });
    handle.addEventListener("focus", () => { focused = true; render(); });
    handle.addEventListener("blur", () => { focused = false; render(); });
    handle.addEventListener("keydown", (event) => {
      event.stopPropagation();
      const direction = ["+", "=", "ArrowRight", "ArrowUp"].includes(event.key) ? 1
        : ["-", "_", "ArrowLeft", "ArrowDown"].includes(event.key) ? -1 : 0;
      if (!direction) return;
      event.preventDefault();
      cancelInteraction();
      const state = getState();
      if (!state.plan) return;
      const step = (event.shiftKey ? 0.05 : 0.01) * direction / state.scale;
      const [horizontal, vertical] = CORNERS[corner];
      const result = outpaintCornerTransform({ ...state, corner,
        deltaX: horizontal * state.plan.prepared.width * step,
        deltaY: vertical * state.plan.prepared.height * step });
      boundary = result.boundary;
      commitTransform(result);
    });
    frame.append(handle);
    return handle;
  });
  document.addEventListener("mousemove", (event) => move(event, event.clientX, event.clientY));
  document.addEventListener("mouseup", end);
  document.addEventListener("touchmove", (event) => {
    if (event.touches.length === 1) move(event, event.touches[0].clientX, event.touches[0].clientY);
    else cancelInteraction();
  }, { passive: false });
  document.addEventListener("touchend", end);
  document.addEventListener("touchcancel", cancelInteraction);
  document.addEventListener("pointercancel", cancelInteraction);
  document.defaultView?.addEventListener?.("blur", cancelInteraction);
  document.addEventListener("visibilitychange", () => { if (document.hidden) cancelInteraction(); });

  function closeSettings() {
    if (popover.hidePopover) popover.hidePopover();
    else popover.hidden = true;
    settings.setAttribute("aria-expanded", "false");
  }

  function positionSettings() {
    if (settings.getAttribute("aria-expanded") !== "true") return;
    const rect = settings.getBoundingClientRect();
    const view = document.defaultView || globalThis;
    const size = popover.getBoundingClientRect();
    const viewportHeight = view.innerHeight || Number.POSITIVE_INFINITY;
    popover.style.left = `${clamp(rect.left, 12, Math.max(12, view.innerWidth - size.width - 12))}px`;
    popover.style.top = `${clamp(rect.top - size.height - 8, 12, Math.max(12, viewportHeight - size.height - 12))}px`;
  }

  settings.addEventListener("click", () => {
    const open = settings.getAttribute("aria-expanded") === "true";
    if (open) return closeSettings();
    if (popover.showPopover) popover.showPopover();
    else popover.hidden = false;
    settings.setAttribute("aria-expanded", "true");
    positionSettings();
  });
  popover.addEventListener("toggle", (event) => {
    settings.setAttribute("aria-expanded", String(event.newState === "open"));
  });
  document.defaultView?.addEventListener?.("resize", positionSettings);
  document.addEventListener("scroll", positionSettings, true);
  return { render, renderPreview, closeSettings, flush: () => end(), cancel: cancelInteraction,
    reset() { cancelInteraction(); boundary = null; lastScale = null; hovered = false; focused = false; closeSettings(); } };
}

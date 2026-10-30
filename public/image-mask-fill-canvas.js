/**
 * [INPUT]: 依赖原图解码尺寸、原生Canvas2D、指针捕获与缩放坐标/矩形/多边形规则、共享蓝色及点数上限，以及画笔/擦除/框选/圈选/清空/撤销控件
 * [OUTPUT]: 对外提供bindMaskFillCanvas、受模型能力约束的setTool、始终可见且非GPT禁用提示的蓝色矩形/自由圈选入口、归一化坐标、三份历史、触屏取消和原图等尺寸黑底白编辑区PNG
 * [POS]: public 的区域编辑画布层，当前工具决定遮罩或矩形/多边形，切换保留各自完成状态，不重新编码或发送原图
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { MASK_FILL_MAX_SELECTION_POINTS, MASK_FILL_SELECTION_COLOR,
  maskBoxRegion, maskCanvasPoint, maskFillImageIssue, maskLassoRegion } from "./image-mask-fill-geometry.js";

export function bindMaskFillCanvas({ preview, toolbar, getBrushSize, onChange = () => {} }) {
  const canvas = preview.querySelector("[data-mask-canvas]");
  const image = preview.querySelector("[data-mask-source]");
  const frame = preview.querySelector("[data-mask-frame]");
  const empty = preview.querySelector("[data-mask-empty]");
  const status = toolbar.querySelector("[data-mask-drawing-status]");
  const undo = toolbar.querySelector("[data-mask-undo]");
  const clear = toolbar.querySelector("[data-mask-clear]");
  const ctx = canvas.getContext("2d");
  let source = null;
  let sourceKey = null;
  let strokes = [];
  let activeStroke = null;
  let boxHistory = [];
  let activeBox = null;
  let lassoHistory = [];
  let activeLasso = null;
  let boxSelectionAvailable = false;
  let pointer = null;
  let tool = "brush";
  let dirty = true;
  let nonEmpty = false;
  let maskOptional = false;
  const emptyCopy = () => maskOptional ? "上传原图，可涂抹、框选或圈选编辑物体，也可直接填写指令" : "上传原图，在这里涂抹需要编辑的区域";
  const isBoxSelection = () => tool === "box";
  const isLassoSelection = () => tool === "lasso";
  const isSelection = () => isBoxSelection() || isLassoSelection();
  const currentHistory = () => isBoxSelection() ? boxHistory : isLassoSelection() ? lassoHistory : strokes;
  const currentBox = () => activeBox?.region || boxHistory.at(-1) || null;

  function drawBox(region) {
    if (!region) return;
    const scale = canvas.width / Math.max(1, canvas.getBoundingClientRect().width);
    const rectangle = [region.x * canvas.width, region.y * canvas.height,
      region.width * canvas.width, region.height * canvas.height];
    ctx.globalCompositeOperation = "source-over";
    ctx.lineWidth = 4 * scale;
    ctx.strokeStyle = "#fff";
    ctx.strokeRect(...rectangle);
    ctx.lineWidth = 2 * scale;
    ctx.strokeStyle = MASK_FILL_SELECTION_COLOR;
    ctx.strokeRect(...rectangle);
  }

  function drawLasso(points, closed) {
    if (!points?.length) return;
    const scale = canvas.width / Math.max(1, canvas.getBoundingClientRect().width);
    ctx.globalCompositeOperation = "source-over";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
    if (closed) ctx.closePath();
    ctx.lineWidth = 4 * scale;
    ctx.strokeStyle = "#fff";
    ctx.stroke();
    ctx.lineWidth = 2 * scale;
    ctx.strokeStyle = MASK_FILL_SELECTION_COLOR;
    ctx.stroke();
  }

  function appendLassoPoint(point) {
    const previous = activeLasso.points.at(-1);
    if (previous?.x === point.x && previous?.y === point.y) return;
    activeLasso.points.push(point);
    if (activeLasso.points.length > MASK_FILL_MAX_SELECTION_POINTS) {
      const last = activeLasso.points.at(-1);
      activeLasso.points = activeLasso.points.filter((_, index) => index % 2 === 0);
      if (activeLasso.points.at(-1) !== last) activeLasso.points.push(last);
    }
  }

  function drawSegment(stroke, from, to) {
    ctx.globalCompositeOperation = stroke.tool === "erase" ? "destination-out" : "source-over";
    ctx.strokeStyle = "#fff";
    ctx.fillStyle = "#fff";
    ctx.lineWidth = stroke.size;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (from.x === to.x && from.y === to.y) {
      ctx.beginPath(); ctx.arc(from.x, from.y, stroke.size / 2, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";
    dirty = true;
  }

  function renderControls() {
    const history = currentHistory();
    undo.disabled = history.length === 0;
    clear.disabled = history.length === 0;
    canvas.classList.toggle("box-selection", isSelection());
    canvas.setAttribute("aria-label", isLassoSelection() ? "按住画笔圈选需要编辑的物体，松开自动闭合，支持鼠标和触屏"
      : isBoxSelection() ? "拖动框选需要编辑的物体，支持鼠标和触屏" : "用画笔涂白需要编辑的区域，支持鼠标和触屏");
    toolbar.querySelector(".mask-fill-brush").hidden = isSelection();
    status.textContent = source ? `${source.width} × ${source.height} · ${isBoxSelection()
      ? "拖动框选编辑物体，生成后移除圈选标记；可不框选仅用指令"
      : isLassoSelection() ? "按住圈选编辑物体，松开自动闭合，生成后移除圈选标记；可不圈选仅用指令"
      : maskOptional ? "可不涂抹，仅按编辑指令修改；涂抹后会发送遮罩" : "白色区域将被编辑"}`
      : maskOptional ? "上传原图后，可直接填写编辑指令" : "上传原图后，涂抹需要编辑的区域";
    toolbar.querySelectorAll("[data-mask-tool]").forEach(button => {
      if (["box", "lasso"].includes(button.dataset.maskTool)) {
        button.hidden = false;
        button.disabled = !boxSelectionAvailable;
        const label = button.dataset.maskTool === "box" ? "框选" : "圈选";
        const hint = boxSelectionAvailable ? `${label}需要编辑的物体，蓝色轮廓定位` : "请先选择 GPT Image 2.5 Sunburst";
        button.title = hint;
        button.setAttribute("aria-label", `${label}：${hint}`);
      }
      const selected = button.dataset.maskTool === tool;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
  }

  function repaint() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (isBoxSelection()) {
      drawBox(currentBox());
      renderControls();
      return;
    }
    if (isLassoSelection()) {
      const points = activeLasso?.points || lassoHistory.at(-1)?.points.map(point => ({
        x: point.x * canvas.width, y: point.y * canvas.height }));
      drawLasso(points, !activeLasso);
      renderControls();
      return;
    }
    for (const stroke of strokes) {
      drawSegment(stroke, stroke.points[0], stroke.points[0]);
      for (let i = 1; i < stroke.points.length; i++) drawSegment(stroke, stroke.points[i - 1], stroke.points[i]);
    }
    dirty = true;
    renderControls();
  }

  function finish(event, cancelled = false) {
    if (pointer === null || event && event.pointerId !== pointer) return;
    if (!cancelled && Number.isFinite(event?.clientX) && Number.isFinite(event?.clientY)) {
      const point = maskCanvasPoint(event, canvas.getBoundingClientRect(), canvas.width, canvas.height);
      if (point && activeBox) activeBox.region = maskBoxRegion(activeBox.start, point, canvas.width, canvas.height);
      if (point && activeLasso) appendLassoPoint(point);
    }
    const previousPointer = pointer;
    pointer = null;
    activeStroke = null;
    if (!cancelled && activeBox?.region) boxHistory.push(activeBox.region);
    if (!cancelled && event && activeLasso) {
      const region = maskLassoRegion(activeLasso.points, canvas.width, canvas.height);
      if (region) lassoHistory.push(region);
    }
    activeBox = null;
    activeLasso = null;
    if (canvas.hasPointerCapture?.(previousPointer)) canvas.releasePointerCapture(previousPointer);
    if (isSelection()) repaint();
    renderControls();
    onChange();
  }

  canvas.addEventListener("pointerdown", event => {
    if (!source || pointer !== null || event.button !== 0 && event.pointerType === "mouse") return;
    const bounds = canvas.getBoundingClientRect();
    const point = maskCanvasPoint(event, bounds, canvas.width, canvas.height);
    if (!point) return;
    event.preventDefault();
    pointer = event.pointerId;
    canvas.setPointerCapture(event.pointerId);
    if (isBoxSelection()) {
      activeBox = { start: point, region: null };
      renderControls();
      return;
    }
    if (isLassoSelection()) {
      activeLasso = { points: [point] };
      repaint();
      return;
    }
    activeStroke = { tool, size: Number(getBrushSize()) * canvas.width / bounds.width, points: [point] };
    strokes.push(activeStroke);
    drawSegment(activeStroke, point, point);
    renderControls();
  });
  canvas.addEventListener("pointermove", event => {
    if ((!activeStroke && !activeBox && !activeLasso) || event.pointerId !== pointer) return;
    event.preventDefault();
    const bounds = canvas.getBoundingClientRect();
    if (activeBox) {
      const point = maskCanvasPoint(event, bounds, canvas.width, canvas.height);
      if (point) {
        activeBox.region = maskBoxRegion(activeBox.start, point, canvas.width, canvas.height);
        repaint();
      }
      return;
    }
    const events = event.getCoalescedEvents?.() || [];
    for (const movement of events.length ? events : [event]) {
      const point = maskCanvasPoint(movement, bounds, canvas.width, canvas.height);
      if (!point) continue;
      if (activeLasso) { appendLassoPoint(point); continue; }
      drawSegment(activeStroke, activeStroke.points.at(-1), point);
      activeStroke.points.push(point);
    }
    if (activeLasso) repaint();
  });
  canvas.addEventListener("pointerup", event => finish(event));
  ["pointercancel", "lostpointercapture"].forEach(name => canvas.addEventListener(name, event => finish(event, true)));
  function setTool(nextTool) {
    if (!["brush", "erase", "box", "lasso"].includes(nextTool)
      || ["box", "lasso"].includes(nextTool) && !boxSelectionAvailable) return;
    finish(); tool = nextTool; repaint(); onChange();
  }
  toolbar.querySelectorAll("[data-mask-tool]").forEach(button => button.addEventListener("click", () => setTool(button.dataset.maskTool)));
  undo.addEventListener("click", () => { finish(); currentHistory().pop(); repaint(); onChange(); });
  clear.addEventListener("click", () => { finish(); currentHistory().length = 0; repaint(); onChange(); });
  renderControls();

  return {
    setTool,
    setBoxSelectionAvailable(value) {
      boxSelectionAvailable = Boolean(value);
      if (!boxSelectionAvailable && isSelection()) { finish(); tool = "brush"; repaint(); }
      renderControls();
    },
    isBoxSelection, isLassoSelection, isSelection,
    editRegion() {
      if (isBoxSelection() && currentBox()) return { ...currentBox() };
      const region = isLassoSelection() && lassoHistory.at(-1);
      return region ? { type: "polygon", points: region.points.map(point => ({ ...point })) } : null;
    },
    setMaskOptional(value) {
      maskOptional = Boolean(value);
      if (!source) empty.textContent = emptyCopy();
      renderControls();
    },
    setSource(nextSource) {
      const valid = !maskFillImageIssue(nextSource);
      const nextKey = valid ? nextSource.id || nextSource.dataUrl : null;
      if (sourceKey === nextKey) {
        if (!valid) empty.textContent = nextSource ? maskFillImageIssue(nextSource) : emptyCopy();
        return;
      }
      finish(); sourceKey = nextKey; source = valid ? nextSource : null; strokes = []; boxHistory = []; lassoHistory = [];
      canvas.width = source?.width || 1; canvas.height = source?.height || 1;
      if (source) image.src = source.dataUrl;
      else image.removeAttribute("src");
      frame.hidden = !source;
      frame.style.setProperty("--mask-ratio", source ? source.width / source.height : 1);
      empty.hidden = Boolean(source);
      if (!source) empty.textContent = nextSource ? maskFillImageIssue(nextSource) : emptyCopy();
      repaint();
    },
    hasMask() {
      if (isSelection()) return false;
      if (!dirty) return nonEmpty;
      dirty = false; nonEmpty = false;
      if (!source || !strokes.length) return false;
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      for (let i = 3; i < pixels.length; i += 4) {
        if (pixels[i] > 0) { nonEmpty = true; break; }
      }
      return nonEmpty;
    },
    exportMask() {
      finish();
      if (!source || !this.hasMask()) throw new Error("请先在原图上涂抹需要编辑的区域");
      const output = canvas.ownerDocument.createElement("canvas");
      output.width = source.width; output.height = source.height;
      const outputContext = output.getContext("2d");
      outputContext.fillStyle = "#000"; outputContext.fillRect(0, 0, output.width, output.height);
      outputContext.drawImage(canvas, 0, 0);
      const dataUrl = output.toDataURL("image/png");
      const encoded = dataUrl.split(",")[1];
      const size = Math.floor(encoded.length * 3 / 4) - (encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0);
      return { dataUrl, name: "mask.png", type: "image/png", size };
    },
  };
}

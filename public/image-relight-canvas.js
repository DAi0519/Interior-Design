/**
 * [INPUT]: 依赖共享光源编辑/历史保护动作参数及几何校验、原图比例与图片URL、Canvas2D、显示尺寸/DPR变化、指针捕获及键盘事件
 * [OUTPUT]: 对外提供bindRelightCanvas及按显示像素密度独立重绘的清晰标注、新增/原灯绘制动作切换，支持点线面混用、原灯减弱/关闭同类转换及历史保护只读恢复、独立编辑开关及照射目标/整体位移、稳定身份与连续编号、撤销/删除/清空及换图清除
 * [POS]: public 打光工具的多对象标注交互层，只绘制定位标记，不模拟最终光照或修改原图
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { RELIGHT_LIMITS, RELIGHT_ACTION_GUIDES, normalizeRelightLights, relightCenter as meanLight, relightPoint as relightCanvasPoint } from "./image-relight-geometry.js";
export { relightCanvasPoint };

const clone = value => JSON.parse(JSON.stringify(value));
const clamp = value => Math.max(0, Math.min(1, value));
const mean = points => meanLight({ points });
const TYPE_LABELS = { point: "点光源", line: "线光源", area: "面光源" };
const actionKey = light => light.action || "brighten";
const originalAction = action => action === "darken" || action === "turnOff";

function segmentDistance(p, a, b) {
  const length = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  const t = length ? Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / length)) : 0;
  return Math.hypot(p.x - a.x - t * (b.x - a.x), p.y - a.y - t * (b.y - a.y));
}

function inside(p, points) {
  let hit = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

function translate(light, dx, dy) {
  const all = [...light.points, ...(light.target ? [light.target] : [])];
  const x = Math.max(-Math.min(...all.map(p => p.x)), Math.min(dx, 1 - Math.max(...all.map(p => p.x))));
  const y = Math.max(-Math.min(...all.map(p => p.y)), Math.min(dy, 1 - Math.max(...all.map(p => p.y))));
  return { ...light, points: light.points.map(p => ({ x: p.x + x, y: p.y + y })),
    ...(light.target ? { target: { x: light.target.x + x, y: light.target.y + y } } : {}) };
}

export function bindRelightCanvas({ preview, toolbar, maxLights = RELIGHT_LIMITS.maxLights, onChange = () => {}, showToast = () => {} }) {
  const canvas = preview.querySelector("[data-relight-canvas]");
  const image = preview.querySelector("[data-relight-source]");
  const frame = preview.querySelector("[data-relight-frame]");
  const empty = preview.querySelector("[data-relight-empty]");
  const status = toolbar.querySelector("[data-relight-drawing-status]");
  const context = canvas.getContext("2d");
  const view = canvas.ownerDocument.defaultView;
  const history = [];
  let lights = [], selectedId = null, sequence = 0, sourceKey = null, source = null, drag = null, tool = "point";
  let disabled = false, editing = false, drawingAction = "brighten";
  let displayBounds = { width: 1, height: 1 }, resolutionQuery = null, observedPixelRatio = null;
  const locked = () => disabled || !editing;
  const selected = () => lights.find(light => light.id === selectedId);
  const snapshot = () => ({ lights: clone(lights), selectedId });
  const notify = () => { repaint(); onChange(clone(lights), selectedId); };

  function remember(previous = snapshot()) {
    history.push(previous);
    if (history.length > 50) history.shift();
  }

  function screenPoint(point) { return { x: point.x * canvas.width, y: point.y * canvas.height }; }

  function resizeDisplay() {
    displayBounds = canvas.getBoundingClientRect();
    const pixelRatio = Number(view?.devicePixelRatio) || 1;
    // -------- 标注层独立于原图像素；放大低清原图也按显示尺寸和屏幕密度重绘 --------
    const width = Math.max(1, Math.round(displayBounds.width * Math.max(1, pixelRatio)));
    const height = Math.max(1, Math.round(displayBounds.height * Math.max(1, pixelRatio)));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    if (view?.matchMedia && observedPixelRatio !== pixelRatio) {
      resolutionQuery?.removeEventListener("change", repaint);
      resolutionQuery = view.matchMedia(`(resolution: ${pixelRatio}dppx)`);
      resolutionQuery.addEventListener("change", repaint);
      observedPixelRatio = pixelRatio;
    }
  }

  function paintLight(light, index) {
    const action = actionKey(light), color = RELIGHT_ACTION_GUIDES[action].color;
    const scale = canvas.width / Math.max(1, displayBounds.width);
    const points = light.points.map(screenPoint), center = screenPoint(mean(light.points)), target = light.target && action === "brighten" ? screenPoint(light.target) : null;
    const active = editing && light.id === selectedId;
    context.lineCap = "round"; context.lineJoin = "round";
    const stroke = () => {
      context.strokeStyle = "#fff"; context.lineWidth = 5 * scale; context.stroke();
      context.strokeStyle = color; context.lineWidth = (active ? 2.5 : 1.8) * scale; context.stroke();
    };
    context.beginPath();
    if (light.type === "point") context.arc(points[0].x, points[0].y, 6 * scale, 0, Math.PI * 2);
    else {
      context.moveTo(points[0].x, points[0].y);
      points.slice(1).forEach(p => context.lineTo(p.x, p.y));
      if (light.type === "area") { context.closePath(); context.fillStyle = `${color}18`; context.fill(); }
    }
    stroke();
    if (target) {
      context.beginPath(); context.moveTo(center.x, center.y); context.lineTo(target.x, target.y); stroke();
      const angle = Math.atan2(target.y - center.y, target.x - center.x), arrowSize = 11 * scale;
      context.beginPath();
      context.moveTo(target.x - arrowSize * Math.cos(angle - .45), target.y - arrowSize * Math.sin(angle - .45));
      context.lineTo(target.x, target.y);
      context.lineTo(target.x - arrowSize * Math.cos(angle + .45), target.y - arrowSize * Math.sin(angle + .45)); stroke();
    }
    if (active && action !== "preserve") {
      [...points, ...(target ? [target] : [])].forEach((p, index) => {
        context.beginPath(); context.arc(p.x, p.y, 5 * scale, 0, Math.PI * 2);
        context.fillStyle = index === points.length ? color : "#fff"; context.fill();
        context.strokeStyle = index === points.length ? "#fff" : color; context.lineWidth = 2 * scale; context.stroke();
      });
    }
    const label = `${index + 1} ${RELIGHT_ACTION_GUIDES[action].symbol}`, labelX = Math.max(20 * scale, Math.min(canvas.width - 20 * scale, center.x));
    const labelY = Math.max(14 * scale, center.y - 22 * scale);
    context.beginPath(); context.arc(labelX, labelY, 16 * scale, 0, Math.PI * 2); context.fillStyle = color; context.fill();
    context.strokeStyle = "#fff"; context.lineWidth = 1.5 * scale; context.stroke();
    context.fillStyle = "#fff"; context.font = `600 ${12 * scale}px system-ui`;
    context.textAlign = "center"; context.textBaseline = "middle"; context.fillText(label, labelX, labelY);
  }

  function repaint() {
    resizeDisplay();
    context.clearRect(0, 0, canvas.width, canvas.height);
    lights.forEach(paintLight);
    toolbar.querySelectorAll("[data-relight-tool]").forEach(button => {
      const active = button.dataset.relightTool === tool;
      button.classList.toggle("selected", active); button.setAttribute("aria-pressed", String(active));
      button.disabled = locked() || !source;
      if (button.dataset.relightTool !== "select") button.textContent = drawingAction === "brighten" ? TYPE_LABELS[button.dataset.relightTool]
        : { point: "点标记", line: "线标记", area: "面标记" }[button.dataset.relightTool];
    });
    for (const [selector, isDisabled] of [["[data-relight-undo]", !history.length], ["[data-relight-clear]", !lights.length],
      ["[data-relight-delete]", !selected()], ["[data-relight-add]", !source || lights.length >= maxLights || tool === "select"]]) {
      const button = toolbar.querySelector(selector); if (button) button.disabled = locked() || isDisabled;
    }
    canvas.tabIndex = locked() ? -1 : 0;
    canvas.style.cursor = locked() ? "default" : "crosshair";
    canvas.setAttribute("aria-disabled", String(locked()));
    const original = drawingAction !== "brighten";
    canvas.setAttribute("aria-label", `光源编辑画布，${locked() ? "当前仅预览" : `当前${original ? "调整原灯" : "新增光源"}，${tool === "select" ? "选择" : TYPE_LABELS[tool]}工具`}。`);
    status.textContent = !source ? "上传原图后，在图上添加光源。"
      : actionKey(selected() || {}) === "preserve" ? "历史保持标注仅可查看或删除。"
      : tool === "select" ? `${lights.length} 处光照标注 · 选中后调整参数，拖动可移动标注。`
      : original ? `${drawingAction === "darken" ? "减弱原灯" : "关闭原灯"}：${tool === "point" ? "点选已有灯具" : tool === "line" ? "沿已有灯带或线形灯描线" : "框住已有灯具的发光面"}，不标受光区域。`
      : `${TYPE_LABELS[tool]}：${tool === "point" ? "从光源位置拖向受光目标" : tool === "line" ? "拖出线段，再拖动箭头调整目标" : "拖出区域，再拖动四角和箭头调整"}。`;
  }

  function hitTest(point) {
    const bounds = canvas.getBoundingClientRect();
    const metric = p => ({ x: p.x * bounds.width, y: p.y * bounds.height });
    const p = metric(point), distance = a => Math.hypot(p.x - a.x, p.y - a.y);
    const candidates = [...lights.filter(light => light.id !== selectedId), ...lights.filter(light => light.id === selectedId)].reverse();
    for (const light of candidates) {
      if (actionKey(light) === "brighten" && light.target && distance(metric(light.target)) < 13) return { light, action: "target" };
      for (let index = 0; index < light.points.length; index++) {
        if (distance(metric(light.points[index])) < 11) return { light, action: "vertex", index };
      }
      const center = metric(mean(light.points));
      if (Math.hypot(p.x - center.x, p.y - center.y + 22) < 13) return { light, action: "move" };
      if (light.type === "area" && inside(point, light.points)) return { light, action: "move" };
      const points = light.points.map(metric);
      for (let i = 1; i < points.length; i++) if (segmentDistance(p, points[i - 1], points[i]) < 9) return { light, action: "move" };
    }
    return null;
  }

  function newLight(type, start, end, id = `L${++sequence}`, action = drawingAction) {
    let points;
    if (type === "point") points = [{ ...start }];
    else if (type === "line") points = [{ ...start }, { ...end }];
    else points = [{ x: start.x, y: start.y }, { x: end.x, y: start.y }, { ...end }, { x: start.x, y: end.y }];
    const center = mean(points);
    const target = type === "point" && Math.hypot(end.x - start.x, end.y - start.y) > .01 ? { ...end }
      : { x: center.x, y: clamp(center.y + (center.y > .7 ? -.18 : .18)) };
    return withAction({ id, type, points, target }, action);
  }

  function withAction(light, action) {
    const base = { id: light.id, type: light.type, points: light.points, action };
    if (action === "darken") return { ...base, amount: light.amount ?? .5 };
    if (action !== "brighten") return base;
    const center = mean(light.points);
    const target = light.target || { x: center.x, y: clamp(center.y + (center.y > .7 ? -.18 : .18)) };
    return { ...base, target, mode: light.mode || "lightOnly", kelvin: light.kelvin ?? 3000,
      intensity: light.intensity ?? 1, softness: light.softness || "soft", fixture: light.fixture || "" };
  }

  function validShape(light) {
    try { normalizeRelightLights([light]); return true; } catch { return false; }
  }

  function applyPointer(point) {
    const current = lights.findIndex(light => light.id === selectedId);
    if (!drag || current < 0) return;
    const original = drag.original;
    if (drag.action === "create") {
      lights[current] = newLight(tool, drag.start, point, selectedId, actionKey(original));
    } else if (drag.action === "target") lights[current] = { ...original, target: point };
    else if (drag.action === "vertex") {
      lights[current] = { ...original, points: original.points.map((p, index) => index === drag.index ? point : { ...p }) };
    } else lights[current] = translate(original, point.x - drag.start.x, point.y - drag.start.y);
    repaint();
  }

  function finish(event, cancelled = false) {
    if (!drag || event && event.pointerId !== drag.pointerId) return;
    const previous = drag;
    if (!cancelled && event) { const point = relightCanvasPoint(event, canvas.getBoundingClientRect()); if (point) applyPointer(point); }
    drag = null;
    if (cancelled || selected() && !validShape(selected())) { lights = previous.before.lights; selectedId = previous.before.selectedId; }
    else if (JSON.stringify(previous.before.lights) !== JSON.stringify(lights)) remember(previous.before);
    if (canvas.hasPointerCapture?.(previous.pointerId)) canvas.releasePointerCapture(previous.pointerId);
    notify();
  }

  canvas.addEventListener("pointerdown", event => {
    if (locked() || !source || drag || event.button !== 0 && event.pointerType === "mouse") return;
    const point = relightCanvasPoint(event, canvas.getBoundingClientRect()); if (!point) return;
    event.preventDefault();
    const before = snapshot(), candidate = hitTest(point);
    // -------- 绘制工具可在已有面光内部新增，选择工具负责整个光源的移动 --------
    const hit = tool === "select" ? candidate : candidate?.light.id === selectedId && candidate.action !== "move" ? candidate : null;
    if (!hit && tool === "select") { selectedId = null; notify(); return; }
    if (!hit && lights.length >= maxLights) { showToast(`最多添加${maxLights}个调光标注`); return; }
    if (hit) selectedId = hit.light.id;
    else { const light = newLight(tool, point, point); lights.push(light); selectedId = light.id; }
    if (actionKey(selected()) === "preserve") { canvas.focus({ preventScroll: true }); notify(); return; }
    drag = { before, start: point, original: clone(selected()), pointerId: event.pointerId,
      action: hit?.action || "create", index: hit?.index };
    canvas.setPointerCapture(event.pointerId); canvas.focus({ preventScroll: true }); notify();
  });
  canvas.addEventListener("pointermove", event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.preventDefault(); const point = relightCanvasPoint(event, canvas.getBoundingClientRect()); if (point) applyPointer(point);
  });
  canvas.addEventListener("pointerup", event => finish(event));
  ["pointercancel", "lostpointercapture"].forEach(name => canvas.addEventListener(name, event => finish(event, true)));
  toolbar.querySelectorAll("[data-relight-tool]").forEach(button => button.addEventListener("click", () => {
    if (locked()) return; finish(null, true); tool = button.dataset.relightTool; repaint();
  }));
  const remove = () => { if (!selected() || locked()) return; remember(); lights = lights.filter(light => light.id !== selectedId); selectedId = lights.at(-1)?.id || null; notify(); };
  const undo = () => { if (locked()) return; finish(null, true); const previous = history.pop(); if (!previous) return; lights = previous.lights; selectedId = previous.selectedId; notify(); };
  toolbar.querySelector("[data-relight-delete]").addEventListener("click", remove);
  toolbar.querySelector("[data-relight-undo]").addEventListener("click", undo);
  toolbar.querySelector("[data-relight-clear]").addEventListener("click", () => {
    if (locked()) return; finish(null, true); if (!lights.length) return; remember(); lights = []; selectedId = null; notify();
  });
  toolbar.querySelector("[data-relight-add]").addEventListener("click", () => {
    if (!source || locked() || tool === "select" || lights.length >= maxLights) return;
    remember(); const offset = lights.length % 5 * .035;
    const light = newLight(tool, { x: .35 + offset, y: .3 + offset }, { x: .65 + offset, y: .5 + offset });
    lights.push(light); selectedId = light.id; notify(); canvas.focus({ preventScroll: true });
  });
  canvas.addEventListener("keydown", event => {
    if (locked()) return;
    if (event.key === "Escape") { finish(null, true); tool = "select"; repaint(); return; }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); undo(); return; }
    if (["Delete", "Backspace"].includes(event.key)) { event.preventDefault(); remove(); return; }
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key) || !selected()) return;
    event.preventDefault();
    const dx = event.key === "ArrowLeft" ? -.005 : event.key === "ArrowRight" ? .005 : 0;
    const dy = event.key === "ArrowUp" ? -.005 : event.key === "ArrowDown" ? .005 : 0;
    const index = lights.findIndex(light => light.id === selectedId), light = lights[index];
    if (actionKey(light) === "preserve") return;
    if (event.shiftKey && actionKey(light) !== "brighten") return;
    const next = event.shiftKey ? { ...light, target: { x: clamp(light.target.x + dx), y: clamp(light.target.y + dy) } } : translate(light, dx, dy);
    if (!validShape(next)) { showToast("照射目标需要与光源保持距离"); return; }
    remember(); lights[index] = next;
    notify();
  });
  const Resize = view?.ResizeObserver;
  const observer = Resize ? new Resize(repaint) : null; observer?.observe(canvas);
  view?.addEventListener?.("resize", repaint);
  repaint();
  return {
    value: () => clone(lights), selected: () => selected() ? clone(selected()) : null,
    select(id) { selectedId = lights.some(light => light.id === id) ? id : null; notify(); },
    update(patch) {
      const light = selected(); if (!light || locked() || actionKey(light) === "preserve") return;
      const currentAction = actionKey(light), nextAction = patch.action || currentAction;
      // -------- 新增补光与原灯操作不能互转；原灯仅允许减弱/关闭之间切换 --------
      if (nextAction !== currentAction && !(originalAction(currentAction) && originalAction(nextAction))) return;
      const next = withAction({ ...light, ...patch }, nextAction);
      if (JSON.stringify(next) === JSON.stringify(light)) return;
      remember(); lights = lights.map(item => item.id === selectedId ? next : item); notify();
    },
    restore(value) { finish(null, true); lights = clone(value || []).map(light => withAction(light, actionKey(light))); selectedId = lights[0]?.id || null;
      sequence = Math.max(sequence, ...lights.map(light => Number(String(light.id).replace(/\D/g, "")) || 0)); history.length = 0; notify(); },
    setDisabled(value) { disabled = Boolean(value); if (disabled) finish(null, true); repaint(); },
    setEditing(value) { editing = Boolean(value); if (!editing) finish(null, true); repaint(); },
    setDrawingAction(value) { if (value === "brighten" || originalAction(value)) { drawingAction = value; repaint(); } },
    setSource(value) {
      const nextKey = value?.id || value?.dataUrl || null; if (sourceKey === nextKey) return;
      finish(null, true); source = value; sourceKey = nextKey; lights = []; selectedId = null; history.length = 0; sequence = 0;
      if (value) image.src = value.dataUrl; else image.removeAttribute("src");
      frame.hidden = !value; empty.hidden = Boolean(value); frame.style.setProperty("--relight-ratio", value ? value.width / value.height : 1); notify();
    },
    repaint, cancel() { finish(null, true); }, destroy() {
      finish(null, true);
      observer?.disconnect(); resolutionQuery?.removeEventListener("change", repaint);
      view?.removeEventListener?.("resize", repaint);
    },
  };
}

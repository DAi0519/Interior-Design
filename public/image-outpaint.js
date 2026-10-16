/**
 * [INPUT]: 依赖共享提交画布/缩放边界规划、image-outpaint-transform.js 的连续浮点预览与合帧交互、三引擎能力与 Flux 目录、上传图及构图 DOM
 * [OUTPUT]: 对外提供三引擎/模型、1K/2K/4K、固定图片基准尺寸的 transform 连续移动/缩放、原图变更通知与可取消手势、冲刷后严格规划的 scale/位置请求；保留旧几何导出
 * [POS]: public 的 AI扩图交互边界，与 image-upscale.js 并列并由主编排器配置和激活
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { outpaintCanvasPlan, outpaintScaleBounds } from "./image-outpaint-geometry.js";
import { bindImageOutpaintTransform, createOutpaintFrameQueue, outpaintVisualPlan } from "./image-outpaint-transform.js";

const SIDES = ["left", "top", "right", "bottom"];
const SIDE_LABELS = { left: "左边", top: "上边", right: "右边", bottom: "下边" };
const RATIOS = { "1:1": [1, 1], "4:3": [4, 3], "16:9": [16, 9], "3:4": [3, 4], "9:16": [9, 16] };
const MIN_INPUT_EDGE = 32;
const MAX_INPUT_EDGE = 4096;
const INPUT_ALIGNMENT = 32;
const OUTPUT_ALIGNMENT = 8;

function validSource(source) {
  return Number.isSafeInteger(source?.width) && source.width > 0
    && Number.isSafeInteger(source?.height) && source.height > 0;
}

function expansionNumber(value) {
  if (typeof value === "string" && !/^\d+$/.test(value)) return null;
  if (typeof value !== "number" && typeof value !== "string") return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

export function imageOutpaintPreparedDimensions(source, inputAlignment = INPUT_ALIGNMENT, limits = {}) {
  if (typeof inputAlignment === "object" && inputAlignment !== null) {
    limits = inputAlignment;
    inputAlignment = limits.inputAlignment ?? INPUT_ALIGNMENT;
  }
  if (!validSource(source) || !Number.isSafeInteger(inputAlignment) || inputAlignment <= 0) return null;
  if (Math.min(source.width, source.height) < (limits.minInputEdge ?? MIN_INPUT_EDGE)
    || Math.max(source.width, source.height) > (limits.maxInputEdge ?? MAX_INPUT_EDGE)) return null;
  if (limits.sourceSizing === "original") return { width: source.width, height: source.height };
  const ratio = source.width / source.height;
  const rawWidth = ratio > 1 ? source.width : Math.trunc(source.height * ratio);
  const rawHeight = ratio > 1 ? Math.trunc(source.width / ratio) : source.height;
  return {
    width: Math.ceil(rawWidth / inputAlignment) * inputAlignment,
    height: Math.ceil(rawHeight / inputAlignment) * inputAlignment,
  };
}

export function outpaintTargetDimensions(source, expansion, limits = {}) {
  const prepared = imageOutpaintPreparedDimensions(source, limits);
  if (!prepared) return null;
  const values = SIDES.map((side) => expansionNumber(expansion?.[side]));
  if (values.some((value) => value === null)) return null;
  const [left, top, right, bottom] = values;
  const width = prepared.width + left + right;
  const height = prepared.height + top + bottom;
  return Number.isSafeInteger(width) && Number.isSafeInteger(height)
    ? { width, height }
    : null;
}

export function centeredOutpaintExpansion(source, ratio, limits = {}) {
  const prepared = imageOutpaintPreparedDimensions(source, limits);
  if (!prepared) return null;
  if (ratio === "original") return { left: 0, top: 0, right: 0, bottom: 0 };
  const parts = RATIOS[ratio];
  if (!parts) return null;
  if (Array.isArray(limits.targetSizes)) {
    const target = limits.targetSizes
      .filter((entry) => entry.ratio === ratio && validSource(entry)
        && entry.width >= prepared.width && entry.height >= prepared.height
        && (entry.width > prepared.width || entry.height > prepared.height))
      .sort((first, second) => first.width * first.height - second.width * second.height)[0];
    if (!target) return null;
    return centeredExpansion(prepared, target);
  }
  const [ratioWidth, ratioHeight] = parts;
  const alignment = limits.outputAlignment ?? OUTPUT_ALIGNMENT;
  if (!Number.isSafeInteger(alignment) || alignment <= 0) return null;
  let unit = Math.ceil(Math.max(prepared.width / ratioWidth, prepared.height / ratioHeight) / alignment) * alignment;
  if (unit * ratioWidth === prepared.width && unit * ratioHeight === prepared.height) unit += alignment;
  return centeredExpansion(prepared, { width: unit * ratioWidth, height: unit * ratioHeight });
}

function centeredExpansion(prepared, target) {
  const horizontal = target.width - prepared.width;
  const vertical = target.height - prepared.height;
  if (!Number.isSafeInteger(horizontal) || !Number.isSafeInteger(vertical)) return null;
  const left = Math.floor(horizontal / 2);
  const top = Math.floor(vertical / 2);
  return { left, top, right: horizontal - left, bottom: vertical - top };
}

export function outpaintExpansionValidation({ source, expansion, limits = {} }) {
  if (!validSource(source)) return { field: "image", message: "请上传一张图片后设置扩展尺寸" };
  const minInputEdge = limits.minInputEdge ?? MIN_INPUT_EDGE;
  const maxInputEdge = limits.maxInputEdge ?? MAX_INPUT_EDGE;
  if (Math.min(source.width, source.height) < minInputEdge || Math.max(source.width, source.height) > maxInputEdge) {
    return { field: "image", message: `原图宽高均需在 ${minInputEdge}–${maxInputEdge}px 之间，请调整原图后重新上传` };
  }
  for (const side of SIDES) {
    const value = expansionNumber(expansion?.[side]);
    if (value === null) {
      return { field: side, message: `${SIDE_LABELS[side]}扩展尺寸需为非负整数` };
    }
    if (Number.isSafeInteger(limits.maxExpansion) && value > limits.maxExpansion) {
      return { field: side, message: `每边最多扩展 ${limits.maxExpansion}px，请减小${SIDE_LABELS[side]}尺寸` };
    }
  }
  const target = outpaintTargetDimensions(source, expansion, limits);
  if (!target) return { field: "expansion", message: "输出尺寸过大，请减小扩展范围" };
  if (SIDES.every((side) => Number(expansion[side]) === 0)) {
    return { field: "expansion", message: "至少一边扩展尺寸需大于 0" };
  }
  const alignment = limits.outputAlignment ?? OUTPUT_ALIGNMENT;
  for (const [axis, dimension, sides] of [["宽度", target.width, "左右"], ["高度", target.height, "上下"]]) {
    const remainder = dimension % alignment;
    if (remainder !== 0) {
      return { field: "expansion", message: `输出${axis}需为 ${alignment} 的倍数；请调整${sides}扩展总和，再增加 ${alignment - remainder}px 或减少 ${remainder}px` };
    }
  }
  if (Number.isSafeInteger(limits.maxEdge) && Math.max(target.width, target.height) > limits.maxEdge) {
    return { field: "expansion", message: `输出长边不能超过 ${limits.maxEdge}px，请减小扩展范围` };
  }
  if (Number.isSafeInteger(limits.maxPixels) && target.width * target.height > limits.maxPixels) {
    return { field: "expansion", message: `输出像素不能超过 ${(limits.maxPixels / 1_000_000).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}MP，请减小扩展范围` };
  }
  if (Array.isArray(limits.targetSizes) && !limits.targetSizes.some((entry) => entry.width === target.width && entry.height === target.height)) {
    const sizes = limits.targetSizes.filter((entry) => entry.width >= source.width && entry.height >= source.height)
      .sort((first, second) => first.width * first.height - second.width * second.height)
      .slice(0, 3).map((entry) => `${entry.width}×${entry.height}`).join("、");
    return { field: "expansion", message: `输出尺寸需使用模型支持的画布档位，请选择比例快捷按钮${sizes ? `；可选尺寸包括 ${sizes}px` : "；当前原图没有可用的扩展画布，请调整原图"}` };
  }
  return { field: null, message: null };
}

export function bindImageOutpaint({ root, getSourceImage, emptyModel, emptySize, exactSize, onChange, onSourceChange = () => {} }) {
  const byId = (id) => root.querySelector(`#imageOutpaint${id}`);
  const availability = byId("Availability");
  const note = byId("Note");
  const outputSize = byId("OutputSize");
  const error = byId("Error");
  const canvas = byId("Canvas");
  const canvasHint = byId("CanvasHint");
  const sourceImage = byId("SourceImage");
  const previewEmpty = byId("PreviewEmpty");
  const positionReset = byId("PositionReset");
  const modelField = byId("ModelField");
  const modelSelect = byId("ModelSelect");
  const modelStatus = byId("ModelStatus");
  const ratioButtons = [...root.querySelectorAll("[data-outpaint-ratio]")];
  const resolutionButtons = [...root.querySelectorAll("[data-outpaint-resolution]")];
  const engineButtons = [...root.querySelectorAll("[data-outpaint-engine]")];
  let config = { available: false, reason: "正在读取扩图工作流配置", workflow: null };
  let engines = [];
  let engineKey = "comfyui";
  let selectedModelKey = "";
  let selectedRatio = "16:9";
  let selectedResolution = "2K";
  let position = { x: 0.5, y: 0.5 };
  let scale = 2 / 3;
  let lastSource = null;
  let dragState = null;
  let transform = null;

  const isFluxEngine = () => engineKey === "comfyui";
  const selectedModel = () => isFluxEngine() ? config.models?.find((model) => model.key === selectedModelKey) : undefined;
  const modelValidation = () => {
    if (!isFluxEngine()) return null;
    const model = selectedModel();
    if (!model) return { field: "model", message: selectedModelKey ? "所选扩图模型已不在目录中，请重新选择" : "扩图模型列表尚未就绪，请刷新配置" };
    return model.available ? null : { field: "model", message: model.reason || "所选扩图模型当前不可用，请选择其他模型" };
  };
  const availabilityReason = () => !config.available ? config.reason || "尚未配置扩图工作流" : modelValidation()?.message || "";
  const canvasSelection = () => ({ ratio: selectedRatio, resolution: selectedResolution, position: { ...position }, scale });
  const boundsFor = (source) => outpaintScaleBounds({ source, ratio: selectedRatio, resolution: selectedResolution, limits: config });
  const planFor = (source) => {
    const bounds = boundsFor(source);
    scale = Math.max(bounds.min, Math.min(bounds.max, scale));
    return outpaintCanvasPlan({ source, ...canvasSelection(), limits: config });
  };
  const visualPlanFor = (source, target, nextScale = scale, nextPosition = position, limits = config) =>
    outpaintVisualPlan({ source, target, scale: nextScale, position: nextPosition, limits });
  const clampPosition = (value) => Math.max(0, Math.min(1, value));

  function plannedCanvas(source = getSourceImage()) {
    try {
      const plan = planFor(source);
      const noExpansion = SIDES.every((side) => plan.expansion[side] === 0);
      return { plan, validation: noExpansion
        ? { field: "canvas", message: "请缩小原图以留出扩图区域" }
        : { field: null, message: null } };
    } catch (cause) {
      const sourceInvalid = !imageOutpaintPreparedDimensions(source, config);
      return {
        plan: null,
        validation: { field: sourceInvalid ? "image" : "canvas", message: cause.message || "当前图片无法使用所选扩图画布" },
      };
    }
  }

  const validation = () => {
    flushInteractions();
    const result = plannedCanvas().validation;
    return result.message ? result : modelValidation() || result;
  };

  function renderModelState() {
    const showModels = isFluxEngine();
    modelField.classList.toggle("hidden", !showModels);
    modelField.title = selectedModel()?.fileName || "";
    const issue = modelValidation();
    modelSelect.setAttribute("aria-invalid", String(Boolean(issue)));
    modelStatus.textContent = showModels && config.available ? issue?.message || "" : "";
    modelStatus.classList.toggle("hidden", !modelStatus.textContent);
  }

  function renderModelOptions() {
    if (isFluxEngine()) {
      const models = config.models || [];
      if (!selectedModelKey) selectedModelKey = config.defaultModelKey || models.find((model) => model.available)?.key || models[0]?.key || "";
      const ownerDocument = modelSelect.ownerDocument;
      const options = models.map((model) => {
        const option = ownerDocument.createElement("option");
        option.value = model.key;
        option.textContent = `${model.label}${model.available ? "" : "（不可用）"}`;
        option.title = model.fileName;
        option.disabled = !model.available;
        return option;
      });
      if (!models.some((model) => model.key === selectedModelKey)) {
        const placeholder = ownerDocument.createElement("option");
        placeholder.value = selectedModelKey;
        placeholder.textContent = selectedModelKey ? "所选模型已不可用" : "正在读取模型";
        placeholder.disabled = true;
        options.unshift(placeholder);
      }
      modelSelect.replaceChildren(...options);
      modelSelect.value = selectedModelKey;
      modelSelect.disabled = !models.some((model) => model.available);
    }
    renderModelState();
  }

  function renderChoices(buttons, datasetKey, selection) {
    buttons.forEach((button) => {
      const selected = selection === button.dataset[datasetKey];
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-checked", String(selected));
      button.setAttribute("tabindex", selected ? "0" : "-1");
    });
  }

  function currentItem() {
    return {
      key: config.workflow?.key || "image-outpaint",
      label: isFluxEngine() ? [config.workflow?.label || "AI扩图", selectedModel()?.label].filter(Boolean).join(" · ") : config.label || config.workflow?.label || "AI扩图",
      provider: config.provider || "comfyui",
    };
  }

  function renderSummary() {
    const source = getSourceImage();
    if (source !== lastSource) {
      position = { x: 0.5, y: 0.5 };
      scale = 2 / 3;
      lastSource = source;
      endDrag(false);
      transform?.reset();
      onSourceChange(source);
    }
    const { plan, validation: result } = plannedCanvas(source);
    const text = plan ? `${plan.target.width} × ${plan.target.height}` : source ? "无法使用当前画布" : "上传图片后计算";
    outputSize.textContent = text;
    exactSize.textContent = text;
    emptySize.textContent = text;
    emptyModel.textContent = selectedModel()?.label || currentItem().label;
    emptyModel.title = currentItem().label;
    error.textContent = source ? result.message || "" : "";
    error.classList.toggle("hidden", !error.textContent);
    const canPreview = Boolean(plan && source?.dataUrl);
    canvas.classList.toggle("hidden", !canPreview);
    if (canvasHint) canvasHint.classList.toggle("hidden", !canPreview);
    if (positionReset) positionReset.disabled = !canPreview;
    previewEmpty.classList.toggle("hidden", canPreview);
    previewEmpty.textContent = source ? "无法预览，请检查原图" : "上传图片后预览扩展范围";
    if (canPreview) {
      if (sourceImage.getAttribute("src") !== source.dataUrl) sourceImage.src = source.dataUrl;
      sourceImage.alt = source.name ? `原图：${source.name}` : "扩图原图";
      sourceImage.style.objectFit = "cover";
      canvas.style.setProperty("--outpaint-ratio", String(plan.target.width / plan.target.height));
      paintPlan(visualPlanFor(source, plan.target));
    } else {
      sourceImage.removeAttribute("src");
    }
    transform?.render({ plan: canPreview ? visualPlanFor(source, plan.target) : null, scale,
      bounds: plan ? boundsFor(source) : { min: 1 / 3, max: 1 } });
    renderChoices(ratioButtons, "outpaintRatio", selectedRatio);
    renderChoices(resolutionButtons, "outpaintResolution", selectedResolution);
    renderModelState();
  }

  function changed() {
    renderSummary();
    onChange();
  }

  modelSelect.addEventListener("change", () => {
    cancelInteractions();
    selectedModelKey = modelSelect.value;
    changed();
  });

  function bindRadioGroup(buttons, select) {
    buttons.forEach((button) => {
      button.addEventListener("click", () => {
        if (!button.disabled) select(button);
      });
      button.addEventListener("keydown", (event) => {
        const enabled = buttons.filter((choice) => !choice.disabled);
        const index = enabled.indexOf(button);
        let next;
        if (["ArrowRight", "ArrowDown"].includes(event.key)) next = (index + 1) % enabled.length;
        else if (["ArrowLeft", "ArrowUp"].includes(event.key)) next = (index + enabled.length - 1) % enabled.length;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = enabled.length - 1;
        else return;
        if (!enabled.length) return;
        event.preventDefault();
        select(enabled[next]);
        enabled[next].focus?.();
      });
    });
  }

  bindRadioGroup(ratioButtons, (button) => {
    cancelInteractions();
    selectedRatio = button.dataset.outpaintRatio;
    transform?.reset();
    changed();
  });
  bindRadioGroup(resolutionButtons, (button) => {
    cancelInteractions();
    selectedResolution = button.dataset.outpaintResolution;
    transform?.reset();
    changed();
  });

  // -------- 图片基准尺寸固定；手势仅更新浮点 transform，整数提交规划不驱动视觉 --------
  function paintPlan(plan) {
    const style = sourceImage.style;
    const { base, target, expansion, scale: visualScale } = plan;
    const values = {
      left: "0px", top: "0px", transformOrigin: "0 0",
      width: `${base.width / target.width * 100}%`,
      height: `${base.height / target.height * 100}%`,
      transform: `translate3d(${expansion.left / base.width * 100}%, ${expansion.top / base.height * 100}%, 0) scale(${visualScale})`,
    };
    for (const [property, value] of Object.entries(values)) {
      if (style[property] !== value) style[property] = value;
    }
  }

  function positionedPlan(plan) {
    const horizontal = plan.target.width - plan.prepared.width;
    const vertical = plan.target.height - plan.prepared.height;
    const left = horizontal * position.x;
    const top = vertical * position.y;
    return { ...plan, expansion: { left, top, right: horizontal - left, bottom: vertical - top } };
  }

  function endDrag(notify = true, point) {
    if (!dragState) return;
    if (notify) {
      if (Number.isFinite(point?.clientX) && Number.isFinite(point?.clientY)) dragQueue.push(point);
      dragQueue.flush();
    } else dragQueue.cancel();
    const dirty = dragState?.dirty;
    dragState = null;
    canvas.classList.toggle("dragging", false);
    sourceImage.classList.toggle("dragging", false);
    if (notify && dirty) changed();
  }

  function cancelInteractions() {
    endDrag(false);
    transform?.cancel();
  }

  function flushInteractions() {
    if (getSourceImage() !== lastSource) renderSummary();
    endDrag(true);
    transform?.flush();
  }

  function startDrag(clientX, clientY) {
    cancelInteractions();
    const source = getSourceImage();
    const { plan: submittedPlan } = plannedCanvas(source);
    if (!submittedPlan) return;
    const plan = visualPlanFor(source, submittedPlan.target);
    const rect = canvas.getBoundingClientRect();
    if (!(rect.width > 0 && rect.height > 0)) return;
    dragState = { startX: clientX, startY: clientY, plan, rect, source };
    canvas.classList.toggle("dragging", true);
    sourceImage.classList.toggle("dragging", true);
  }

  function moveDrag({ clientX, clientY }) {
    if (!dragState) return;
    if (dragState.source !== getSourceImage()) { cancelInteractions(); renderSummary(); return; }
    const { plan, rect, startX, startY } = dragState;
    const horizontal = plan.target.width - plan.prepared.width;
    const vertical = plan.target.height - plan.prepared.height;
    position = {
      x: horizontal ? clampPosition((plan.expansion.left + (clientX - startX) / rect.width * plan.target.width) / horizontal) : position.x,
      y: vertical ? clampPosition((plan.expansion.top + (clientY - startY) / rect.height * plan.target.height) / vertical) : position.y,
    };
    const visualPlan = positionedPlan(plan);
    paintPlan(visualPlan);
    transform?.renderPreview(visualPlan);
    dragState.dirty = true;
  }

  const dragQueue = createOutpaintFrameQueue({ view: canvas.ownerDocument?.defaultView, apply: moveDrag });

  function bindDragInteraction() {
    const ownerDocument = canvas.ownerDocument || globalThis.document;
    if (!ownerDocument) return;
    canvas.addEventListener("mousedown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      startDrag(event.clientX, event.clientY);
    });
    ownerDocument.addEventListener("mousemove", (event) => {
      if (!dragState) return;
      event.preventDefault();
      dragQueue.push({ clientX: event.clientX, clientY: event.clientY });
    });
    ownerDocument.addEventListener("mouseup", (event) => endDrag(true, event));
    canvas.addEventListener("touchstart", (event) => {
      if (event.touches.length !== 1) return;
      event.preventDefault();
      startDrag(event.touches[0].clientX, event.touches[0].clientY);
    }, { passive: false });
    ownerDocument.addEventListener("touchmove", (event) => {
      if (!dragState) return;
      if (event.touches.length !== 1) return endDrag(false);
      event.preventDefault();
      dragQueue.push({ clientX: event.touches[0].clientX, clientY: event.touches[0].clientY });
    }, { passive: false });
    ownerDocument.addEventListener("touchend", (event) => endDrag(true, event.changedTouches?.[0]));
    ownerDocument.addEventListener("touchcancel", () => endDrag(false));
    ownerDocument.addEventListener("pointercancel", cancelInteractions);
    ownerDocument.defaultView?.addEventListener?.("blur", cancelInteractions);
    ownerDocument.addEventListener("visibilitychange", () => { if (ownerDocument.hidden) cancelInteractions(); });
  }

  bindDragInteraction();
  canvas.addEventListener("keydown", (event) => {
    if (["Home", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) cancelInteractions();
    if (event.key === "Home" && plannedCanvas().plan) {
      event.preventDefault();
      position = { x: 0.5, y: 0.5 };
      changed();
      return;
    }
    const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!direction || !plannedCanvas().plan) return;
    event.preventDefault();
    const step = event.shiftKey ? 0.1 : 0.02;
    position = { x: clampPosition(position.x + direction[0] * step), y: clampPosition(position.y + direction[1] * step) };
    changed();
  });
  positionReset?.addEventListener("click", () => {
    cancelInteractions();
    position = { x: 0.5, y: 0.5 };
    changed();
  });
  transform = bindImageOutpaintTransform({
    canvas, sourceImage, positionRoot: root.querySelector(".image-outpaint-position"),
    getState() {
      const source = getSourceImage();
      const { plan: submittedPlan } = plannedCanvas(source);
      const selection = canvasSelection();
      const limits = config;
      const plan = submittedPlan ? visualPlanFor(source, submittedPlan.target) : null;
      return { plan, scale, bounds: plan ? boundsFor(source) : { min: 1 / 3, max: 1 },
        isCurrent: () => getSourceImage() === source && config === limits && selectedRatio === selection.ratio && selectedResolution === selection.resolution,
        visualPlanForScale: (nextScale, nextPosition = selection.position) =>
          visualPlanFor(source, submittedPlan.target, nextScale, nextPosition, limits) };
    },
    onTransform(next, { commit = true, plan } = {}) {
      endDrag(false);
      scale = next.scale;
      position = next.position;
      if (commit) changed();
      else paintPlan(plan);
    },
    onCommit: changed,
  });

  function renderConfiguration() {
    const isApi = config.provider === "oneapi";
    availability.textContent = config.available ? isApi ? "API 已接入" : "工作流已接入" : config.workflow ? "服务暂不可用" : "待接入";
    availability.classList.toggle("ready", Boolean(config.available));
    const redrawNote = isApi ? "模型可能重绘原图区域，请检查结果。" : "";
    note.textContent = `${config.available ? "" : `${availabilityReason().replace(/[。；;]+$/, "")}。`}${redrawNote}`;
    note.classList.toggle("hidden", !note.textContent);
    engineButtons.forEach((button) => {
      button.disabled = !engines.some((entry) => entry.key === button.dataset.outpaintEngine);
    });
    renderChoices(engineButtons, "outpaintEngine", engineKey);
    renderModelOptions();
    renderSummary();
  }

  bindRadioGroup(engineButtons, (button) => {
    const engine = engines.find((entry) => entry.key === button.dataset.outpaintEngine);
    if (!engine || engine.key === engineKey) return;
    cancelInteractions();
    config = engine;
    engineKey = engine.key;
    position = { x: 0.5, y: 0.5 };
    endDrag(false);
    transform?.reset();
    renderConfiguration();
    onChange();
  });

  return {
    configure(nextConfig) {
      cancelInteractions();
      const next = nextConfig || { available: false, workflow: null };
      engines = Array.isArray(next.engines) && next.engines.length ? next.engines : [{ ...next, key: "comfyui", provider: "comfyui" }];
      config = engines.find((entry) => entry.key === engineKey) || engines[0];
      if (config.key !== engineKey) position = { x: 0.5, y: 0.5 };
      engineKey = config.key;
      renderConfiguration();
    },
    activate: renderSummary,
    closeSettings() { cancelInteractions(); transform.closeSettings(); },
    currentItem,
    isAvailable: () => Boolean(config.available) && !modelValidation(),
    availabilityReason,
    jobRequest({ image, jobId }) {
      flushInteractions();
      const issue = plannedCanvas(image).validation;
      if (issue.message) throw new Error(issue.message);
      if (!config.available) throw new Error(availabilityReason());
      const modelIssue = modelValidation();
      if (modelIssue) throw new Error(modelIssue.message);
      const item = currentItem();
      const { dataUrl, name, size, type } = image;
      return {
        batchId: null,
        featureMode: "imageOutpaint",
        forcePromptRegeneration: false,
        items: [{
          input: {
            outpaintCanvas: canvasSelection(),
            ...(isFluxEngine() ? { outpaintModel: selectedModelKey } : { outpaintEngine: engineKey }),
          },
          key: item.key,
          label: item.label,
        }],
        jobId,
        sharedInput: { referenceImages: [{ dataUrl, name, size, type }] },
      };
    },
    loadingCopy: () => `${selectedModel()?.label || currentItem().label} 正在补全扩展区域…`,
    renderSummary,
    validate: validation,
  };
}

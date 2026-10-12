/**
 * [INPUT]: 依赖服务端公开的 ComfyUI 工作流与 GPT Image 2.5 Sunburst 引擎、各自输入/对齐/目标画布合同、当前单张上传图与扩展尺寸 DOM
 * [OUTPUT]: 对外提供双引擎选择、按引擎计算原图/预处理尺寸与居中扩边、整数/画布档位校验、位置预览和独立单图扩图任务请求
 * [POS]: public 的 AI扩图交互边界，与 image-upscale.js 并列并由主编排器配置和激活
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

const SIDES = ["left", "top", "right", "bottom"];
const SIDE_LABELS = { left: "左边", top: "上边", right: "右边", bottom: "下边" };
const RATIOS = { "1:1": [1, 1], "4:3": [4, 3], "16:9": [16, 9], "3:4": [3, 4], "9:16": [9, 16] };
const MIN_INPUT_EDGE = 32;
const MAX_INPUT_EDGE = 2048;
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

export function bindImageOutpaint({ root, getSourceImage, emptyModel, emptySize, exactSize, onChange }) {
  const byId = (id) => root.querySelector(`#imageOutpaint${id}`);
  const availability = byId("Availability");
  const note = byId("Note");
  const outputSize = byId("OutputSize");
  const error = byId("Error");
  const canvas = byId("Canvas");
  const sourceImage = byId("SourceImage");
  const previewEmpty = byId("PreviewEmpty");
  const inputs = Object.fromEntries(SIDES.map((side) => [side, root.querySelector(`[data-outpaint-expansion="${side}"]`)]));
  const ratioButtons = [...root.querySelectorAll("[data-outpaint-ratio]")];
  const engineButtons = [...root.querySelectorAll("[data-outpaint-engine]")];
  let config = { available: false, reason: "正在读取扩图工作流配置", workflow: null };
  let engines = [];
  let engineKey = "comfyui";
  let selectedRatio = "";
  let ratioSource = null;
  let ratioError = "";

  const expansion = () => Object.fromEntries(SIDES.map((side) => [side, inputs[side].value]));
  const availabilityReason = () => config.available ? "" : config.reason || "尚未配置扩图工作流";
  const validation = () => outpaintExpansionValidation({ source: getSourceImage(), expansion: expansion(), limits: config });

  function renderRatios() {
    ratioButtons.forEach((button) => {
      const selected = selectedRatio === button.dataset.outpaintRatio;
      button.disabled = !imageOutpaintPreparedDimensions(getSourceImage(), config);
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
  }

  function currentItem() {
    return {
      key: config.workflow?.key || "image-outpaint",
      label: config.provider === "oneapi" ? config.label || "GPT Image 2.5 Sunburst" : config.workflow?.label || "AI扩图",
      provider: config.provider || "comfyui",
    };
  }

  function renderSummary() {
    const source = getSourceImage();
    if (source !== ratioSource) {
      selectedRatio = "";
      ratioError = "";
      ratioSource = source;
    }
    const prepared = imageOutpaintPreparedDimensions(source, config);
    const dimensions = outpaintTargetDimensions(source, expansion(), config);
    const result = validation();
    const text = dimensions ? `${dimensions.width} × ${dimensions.height}` : source ? "请输入有效尺寸" : "上传图片后计算";
    outputSize.textContent = text;
    exactSize.textContent = text;
    emptySize.textContent = text;
    emptyModel.textContent = currentItem().label;
    error.textContent = source ? ratioError || result.message || "" : "";
    error.classList.toggle("hidden", !error.textContent);
    SIDES.forEach((side) => inputs[side].setAttribute("aria-invalid", String(result.field === side)));
    const unchanged = dimensions && result.field === "expansion" && SIDES.every((side) => Number(inputs[side].value) === 0);
    const canPreview = Boolean(dimensions && source?.dataUrl && (!result.message || unchanged));
    canvas.classList.toggle("hidden", !canPreview);
    previewEmpty.classList.toggle("hidden", canPreview);
    previewEmpty.textContent = source ? "请输入有效的扩展尺寸" : "上传图片后预览扩展范围";
    if (canPreview) {
      const values = expansion();
      if (sourceImage.getAttribute("src") !== source.dataUrl) sourceImage.src = source.dataUrl;
      sourceImage.alt = source.name ? `原图：${source.name}` : "扩图原图";
      sourceImage.style.objectFit = "cover";
      canvas.style.setProperty("--outpaint-ratio", String(dimensions.width / dimensions.height));
      sourceImage.style.left = `${Number(values.left) / dimensions.width * 100}%`;
      sourceImage.style.top = `${Number(values.top) / dimensions.height * 100}%`;
      sourceImage.style.width = `${prepared.width / dimensions.width * 100}%`;
      sourceImage.style.height = `${prepared.height / dimensions.height * 100}%`;
    } else {
      sourceImage.removeAttribute("src");
    }
    renderRatios();
  }

  SIDES.forEach((side) => {
    inputs[side].addEventListener("input", () => {
      selectedRatio = "";
      ratioError = "";
      renderSummary();
      onChange();
    });
  });
  ratioButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const values = centeredOutpaintExpansion(getSourceImage(), button.dataset.outpaintRatio, config);
      if (!values) {
        resetExpansion();
        ratioError = `模型没有可包住当前原图的 ${button.dataset.outpaintRatio} 扩展画布，请选择其他比例或调整原图`;
        renderSummary();
        onChange();
        return;
      }
      ratioError = "";
      SIDES.forEach((side) => { inputs[side].value = String(values[side]); });
      selectedRatio = button.dataset.outpaintRatio;
      ratioSource = getSourceImage();
      renderSummary();
      onChange();
    });
  });

  function renderConfiguration() {
    const isApi = config.provider === "oneapi";
    availability.textContent = config.available ? isApi ? "API 已接入" : "工作流已接入" : config.workflow ? "服务暂不可用" : "待接入";
    availability.classList.toggle("ready", Boolean(config.available));
    const inputRange = `原图宽高 ${config.minInputEdge ?? MIN_INPUT_EDGE}–${config.maxInputEdge ?? MAX_INPUT_EDGE}px`;
    const contract = isApi
      ? `${inputRange}；原图按实际尺寸放置在目标画布中，以遮罩补全扩展区域。请使用模型支持的画布档位，扩展值不会自动舍入；模型也可能重绘原图区域，请检查结果。`
      : `${inputRange}；工作流按 ${config.inputAlignment ?? INPUT_ALIGNMENT} 像素对齐预处理，可能轻微缩放、裁切。输出宽高需为 ${config.outputAlignment ?? OUTPUT_ALIGNMENT} 的倍数，扩展值不会自动舍入。`;
    note.textContent = config.available ? contract : `${availabilityReason()}。${contract}`;
    SIDES.forEach((side) => {
      if (Number.isSafeInteger(config.maxExpansion)) inputs[side].max = String(config.maxExpansion);
      else inputs[side].removeAttribute("max");
    });
    engineButtons.forEach((button) => {
      const engine = engines.find((entry) => entry.key === button.dataset.outpaintEngine);
      const selected = engineKey === button.dataset.outpaintEngine;
      button.disabled = !engine;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-checked", String(selected));
    });
    renderSummary();
  }

  function resetExpansion() {
    SIDES.forEach((side) => { inputs[side].value = "0"; });
    selectedRatio = "";
    ratioSource = getSourceImage();
    ratioError = "";
  }

  engineButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const engine = engines.find((entry) => entry.key === button.dataset.outpaintEngine);
      if (!engine || engine.key === engineKey) return;
      config = engine;
      engineKey = engine.key;
      resetExpansion();
      renderConfiguration();
      onChange();
    });
  });

  return {
    configure(nextConfig) {
      const next = nextConfig || { available: false, workflow: null };
      engines = Array.isArray(next.engines) && next.engines.length ? next.engines : [{ ...next, key: "comfyui", provider: "comfyui" }];
      config = engines.find((entry) => entry.key === engineKey) || engines[0];
      if (config.key !== engineKey) resetExpansion();
      engineKey = config.key;
      renderConfiguration();
    },
    activate: renderSummary,
    currentItem,
    isAvailable: () => Boolean(config.available),
    availabilityReason,
    jobRequest({ image, jobId }) {
      const result = outpaintExpansionValidation({ source: image, expansion: expansion(), limits: config });
      if (result.message) throw new Error(result.message);
      if (!config.available) throw new Error(availabilityReason());
      const item = currentItem();
      const { dataUrl, name, size, type } = image;
      return {
        batchId: null,
        featureMode: "imageOutpaint",
        forcePromptRegeneration: false,
        items: [{
          input: {
            expansion: Object.fromEntries(SIDES.map((side) => [side, Number(inputs[side].value)])),
            ...(config.provider === "oneapi" ? { outpaintEngine: engineKey } : {}),
          },
          key: item.key,
          label: item.label,
        }],
        jobId,
        sharedInput: { referenceImages: [{ dataUrl, name, size, type }] },
      };
    },
    loadingCopy: () => config.provider === "oneapi" ? "GPT Image 2.5 Sunburst 正在补全扩展区域…" : "正在补全扩展区域…",
    renderSummary,
    validate: validation,
  };
}

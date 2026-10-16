/**
 * [INPUT]: 依赖可信原图尺寸、目标画幅/分辨率/构图位置/可选等比缩放与服务端公开的引擎尺寸合同
 * [OUTPUT]: 对外提供共用的 outpaintCanvasPlan 与 outpaintScaleBounds，统一目标尺寸、可用缩放范围、按比例适配与整数四边定位
 * [POS]: public 的纯几何边界，被扩图控制器与 src/image-outpaint-service.mjs 共用，不依赖 DOM 或图片解码
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

const RATIOS = Object.freeze({ "1:1": [1, 1], "4:3": [4, 3], "16:9": [16, 9], "3:4": [3, 4], "9:16": [9, 16] });
const RESOLUTIONS = Object.freeze({ "1K": 1024, "2K": 2048, "4K": 4096 });

function inputError(message) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

function validDimensions(value) {
  return Number.isSafeInteger(value?.width) && value.width > 0
    && Number.isSafeInteger(value?.height) && value.height > 0;
}

function contractInteger(value, fallback) {
  const number = value ?? fallback;
  if (!Number.isSafeInteger(number) || number < 1) throw inputError("扩图尺寸合同无效，请刷新页面后重试");
  return number;
}

// -------- 忠实沿用 Flux 的 LayerStyle 短边截断/ceil32；Sunburst 保持输入尺寸 --------
function prepare(source, alignment, original) {
  if (original) return { width: source.width, height: source.height };
  const ratio = source.width / source.height;
  const width = ratio > 1 ? source.width : Math.trunc(source.height * ratio);
  const height = ratio > 1 ? Math.trunc(source.width / ratio) : source.height;
  return {
    width: Math.ceil(width / alignment) * alignment,
    height: Math.ceil(height / alignment) * alignment,
  };
}

function targetDimensions(ratio, resolution, limits, alignment) {
  if (Array.isArray(limits.targetSizes)) {
    const target = limits.targetSizes.find((entry) => entry.ratio === ratio && entry.resolution === resolution);
    if (!validDimensions(target)) throw inputError("当前模型不支持所选画幅与分辨率");
    return { width: target.width, height: target.height };
  }
  const [width, height] = RATIOS[ratio];
  const unit = Math.floor(RESOLUTIONS[resolution] / Math.max(width, height) / alignment) * alignment;
  return { width: width * unit, height: height * unit };
}

function assertTarget(target, limits, alignment) {
  if (!validDimensions(target) || target.width % alignment || target.height % alignment) {
    throw inputError("所选扩图尺寸不符合模型对齐要求，请刷新页面后重试");
  }
  if ((Number.isSafeInteger(limits.maxEdge) && Math.max(target.width, target.height) > limits.maxEdge)
    || (Number.isSafeInteger(limits.maxPixels) && target.width * target.height > limits.maxPixels)) {
    throw inputError("所选扩图分辨率超过当前引擎的画布上限");
  }
}

function canvasContract({ source, ratio, resolution, limits = {} } = {}) {
  if (!limits || typeof limits !== "object") throw inputError("扩图尺寸合同无效，请刷新页面后重试");
  const minInputEdge = contractInteger(limits.minInputEdge, 32);
  const maxInputEdge = contractInteger(limits.maxInputEdge, 4096);
  const inputAlignment = contractInteger(limits.inputAlignment, 32);
  const outputAlignment = contractInteger(limits.outputAlignment, 8);
  if (!validDimensions(source)) throw inputError("请上传一张可读取尺寸的图片");
  if (Math.min(source.width, source.height) < minInputEdge || Math.max(source.width, source.height) > maxInputEdge) {
    throw inputError(`原图宽高均需在 ${minInputEdge}–${maxInputEdge}px 之间，请调整原图后重新上传`);
  }
  if (!Object.hasOwn(RATIOS, ratio)) throw inputError("请选择支持的扩图画幅");
  if (!Object.hasOwn(RESOLUTIONS, resolution)) throw inputError("请选择 1K、2K 或 4K 扩图分辨率");
  const target = targetDimensions(ratio, resolution, limits, outputAlignment);
  assertTarget(target, limits, outputAlignment);
  const original = limits.sourceSizing === "original";
  return { source, target, original, inputAlignment, minInputEdge, maxInputEdge, limits };
}

// -------- 固定输出画布；缩放以最大 contain 尺寸为 1，始终保留原图完整比例 --------
function scaleContract(contract) {
  const { source, target, original, inputAlignment, minInputEdge, maxInputEdge } = contract;
  const alignment = original ? 1 : inputAlignment;
  const availableWidth = Math.floor(Math.min(target.width, maxInputEdge) / alignment) * alignment;
  const availableHeight = Math.floor(Math.min(target.height, maxInputEdge) / alignment) * alignment;
  const contain = Math.min(availableWidth / source.width, availableHeight / source.height);
  const landscape = source.width >= source.height;
  const longEdge = landscape ? source.width : source.height;
  const shortEdge = landscape ? source.height : source.width;
  const containLong = Math.floor(longEdge * contain + 1e-9);
  const minLong = Math.ceil(minInputEdge * longEdge / shortEdge);
  if (containLong < minLong) throw inputError("原图比例过于狭长，无法适配所选扩图画幅，请调整原图后重试");
  return { landscape, containLong, longEdge, shortEdge, min: Math.max(1 / 3, minLong / containLong), max: 1 };
}

export function outpaintScaleBounds(options = {}) {
  const { min, max } = scaleContract(canvasContract(options));
  return { min, max };
}

function scaledSource(contract, scale) {
  const bounds = scaleContract(contract);
  if (typeof scale !== "number" || !Number.isFinite(scale) || scale < bounds.min || scale > bounds.max) {
    throw inputError("原图缩放需在当前画布支持的范围内");
  }
  const longEdge = Math.floor(bounds.containLong * scale + 1e-9);
  const shortEdge = Math.round(longEdge * bounds.shortEdge / bounds.longEdge);
  return bounds.landscape ? { width: longEdge, height: shortEdge } : { width: shortEdge, height: longEdge };
}

export function outpaintCanvasPlan({ source, ratio, resolution, position = { x: 0.5, y: 0.5 }, scale, limits = {} } = {}) {
  const contract = canvasContract({ source, ratio, resolution, limits });
  const { target, original, inputAlignment, minInputEdge } = contract;
  if (!position || ![position.x, position.y].every((value) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1)) {
    throw inputError("扩图构图位置需在画布范围内");
  }
  let prepared = prepare(source, inputAlignment, original);
  let resize = null;
  const fits = prepared.width <= target.width && prepared.height <= target.height;
  const hasSpace = prepared.width < target.width || prepared.height < target.height;
  if (scale !== undefined) {
    const scaled = scaledSource(contract, scale);
    if (scaled.width !== source.width || scaled.height !== source.height) resize = scaled;
    prepared = prepare(scaled, inputAlignment, original);
  } else if (!fits || !hasSpace) {
    // -------- 留出预处理网格空间，避免原图等比缩小后再 ceil32 越过目标边界 --------
    const alignment = original ? 1 : inputAlignment;
    const availableWidth = Math.floor(target.width / alignment) * alignment;
    const availableHeight = Math.floor(target.height / alignment) * alignment;
    let scale = Math.min(availableWidth / source.width, availableHeight / source.height, 1);
    resize = { width: Math.floor(source.width * scale), height: Math.floor(source.height * scale) };
    prepared = prepare(resize, inputAlignment, original);
    if (prepared.width === target.width && prepared.height === target.height) {
      scale *= 0.9;
      resize = { width: Math.floor(source.width * scale), height: Math.floor(source.height * scale) };
      prepared = prepare(resize, inputAlignment, original);
    }
    if (Math.min(resize.width, resize.height) < minInputEdge) {
      throw inputError("原图比例过于狭长，无法适配所选扩图画幅，请调整原图后重试");
    }
  }
  const horizontal = target.width - prepared.width;
  const vertical = target.height - prepared.height;
  const left = Math.round(horizontal * position.x);
  const top = Math.round(vertical * position.y);
  const expansion = { left, top, right: horizontal - left, bottom: vertical - top };
  if (horizontal < 0 || vertical < 0 || (scale === undefined && horizontal + vertical === 0)) {
    throw inputError("所选扩图画布无法留出扩展区域");
  }
  if (Number.isSafeInteger(limits.maxExpansion) && Object.values(expansion).some((value) => value > limits.maxExpansion)) {
    throw inputError("扩图范围超过当前引擎的单边上限");
  }
  return { prepared, target, expansion, ratio, resolution, resize, ...(scale === undefined ? {} : { scale }) };
}

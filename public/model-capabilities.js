/**
 * [INPUT]: 依赖 image-ratio.js 的最近比例与原图比例文案，接收公开模型能力、功能模式、参考图、Flux 1K/2K 像素面积档位及当前尺寸选择
 * [OUTPUT]: 对外提供白模/精模参考图数量文案、比例分辨率选项和含 Flux 原图比例目标像素面积的结果尺寸摘要
 * [POS]: public 的模型能力解释层，隔离 app.js DOM 控制器与 OneAPI/ComfyUI 差异
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { nearestSupportedRatio, sourceAspectLabel } from "./image-ratio.js";

export function referenceCapability({ featureMode, model, policy }) {
  const isWhiteModel = featureMode === "whiteModel";
  const isRefinedModel = featureMode === "refinedModel";
  const fixedSingleImage = isWhiteModel || isRefinedModel;
  const requiresSingleImage =
    fixedSingleImage || model?.requiresReferenceImage === true;
  return {
    ariaLabel: fixedSingleImage
      ? `添加${isWhiteModel ? "白模图" : "精模图"}`
      : "添加参考图",
    dropLabel: fixedSingleImage
      ? `添加或拖入${isWhiteModel ? "白模图" : "精模图"}`
      : requiresSingleImage
        ? "添加或拖入待增强图片"
        : "添加或拖入参考图",
    limit: fixedSingleImage
      ? 1
      : Math.min(
          model?.maxReferenceImages || Number.POSITIVE_INFINITY,
          policy?.maxCount || 4,
        ),
    multiple: !requiresSingleImage,
    optionalLabel: requiresSingleImage ? "必填 · 1张" : "可选",
    title: isWhiteModel ? "白模图" : isRefinedModel ? "精模图" : "参考图",
  };
}

export function sizeControlState({
  currentRatio,
  currentResolution,
  model,
  preserveResolution,
  ratioMode,
  sourceImage,
}) {
  const sourceAspect = model.sizingMode === "source";
  const defaultResolutions = Object.keys(model.sizes[model.defaultRatio]);
  const preservedResolution =
    preserveResolution && defaultResolutions.includes(currentResolution)
      ? currentResolution
      : model.defaultResolution;
  const automaticRatio = sourceAspect
    ? model.defaultRatio
    : nearestSupportedRatio(model, sourceImage);
  const ratio =
    ratioMode === "manual" && Object.hasOwn(model.sizes, currentRatio)
      ? currentRatio
      : automaticRatio;
  const resolutions = Object.keys(model.sizes[ratio]);
  const resolution = resolutions.includes(preservedResolution)
    ? preservedResolution
    : resolutions.includes(model.defaultResolution)
      ? model.defaultResolution
      : resolutions[0];
  return {
    ratio,
    ratioDisabled: sourceAspect,
    ratioOptions: Object.keys(model.sizes).map((value) => ({
      label: value === "source" ? "跟随原图" : value,
      value,
    })),
    resolution,
    resolutionDisabled: resolutions.length <= 1,
    resolutionOptions: resolutions.map((value) => ({
      label: value === "source" ? "原图尺寸" : value,
      value,
    })),
  };
}

export function sizeSummary({ model, ratio, ratioMode, resolution, sourceImage }) {
  if (model.sizingMode === "source") {
    const resolutions = Object.keys(model.sizes.source || {});
    const resolvedResolution = resolutions.includes(resolution)
      ? resolution
      : model.defaultResolution;
    const pixelArea = Number(model.sizes.source?.[resolvedResolution]);
    const dimensions = sourceImage && Number.isInteger(pixelArea)
      ? {
          height: Math.max(16, Math.round(Math.sqrt(pixelArea * sourceImage.height / sourceImage.width) / 16) * 16),
          width: Math.max(16, Math.round(Math.sqrt(pixelArea * sourceImage.width / sourceImage.height) / 16) * 16),
        }
      : null;
    const value = dimensions
      ? `${dimensions.width} × ${dimensions.height}`
      : "上传参考图后计算";
    return { emptySize: value, exactSize: value, resolution: resolvedResolution };
  }

  const resolutions = Object.keys(model.sizes[ratio] || {});
  const resolvedResolution = resolutions.includes(resolution)
    ? resolution
    : resolutions.includes(model.defaultResolution)
      ? model.defaultResolution
      : resolutions[0];
  const size = model.sizes[ratio][resolvedResolution];
  return {
    emptySize: size.replace("x", " × "),
    exactSize:
      sourceImage && ratioMode === "auto"
        ? `${sourceAspectLabel(sourceImage)} → ${ratio} · ${size}`
        : size,
    resolution: resolvedResolution,
  };
}

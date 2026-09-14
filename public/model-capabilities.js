/**
 * [INPUT]: 依赖 image-ratio.js，接收公开模型能力、功能模式、参考图、Flux 1K/2K 原生档与 2K→4K/6K 后置超分档及当前尺寸选择
 * [OUTPUT]: 对外提供参考图数量文案、比例分辨率选项，以及区分 Flux 原生推理和同工作流超分最终尺寸的摘要
 * [POS]: public 的模型能力解释层，隔离 app.js DOM 控制器与 OneAPI/ComfyUI 差异
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { nearestSupportedRatio, sourceAspectLabel } from "./image-ratio.js";

function modelResolutionKeys(model, ratio) {
  return [
    ...Object.keys(model.sizes[ratio] || {}),
    ...(ratio === "source" ? Object.keys(model.postUpscale || {}) : []),
  ];
}

export function referenceCapability({ featureMode, model, policy }) {
  const isWhiteModel = featureMode === "whiteModel";
  const isEmptyRoom = featureMode === "emptyRoom";
  const isRefinedModel = featureMode === "refinedModel";
  const isEffectEnhancement = featureMode === "effectEnhancement";
  const isPanoramaEnhancement = featureMode === "panoramaEnhancement";
  const fixedSingleImage = isWhiteModel || isEmptyRoom || isRefinedModel
    || isEffectEnhancement || isPanoramaEnhancement;
  const subject = isWhiteModel
    ? "白模图"
    : isEmptyRoom
      ? "空房图"
      : isRefinedModel
      ? "精模图"
        : isPanoramaEnhancement
          ? "待美化全景图"
          : "待美化效果图";
  const requiresSingleImage =
    fixedSingleImage || model?.requiresReferenceImage === true;
  return {
    ariaLabel: fixedSingleImage
      ? `添加${subject}`
      : "添加参考图",
    dropLabel: fixedSingleImage
      ? `添加或拖入${subject}`
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
    title: fixedSingleImage ? subject : "参考图",
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
  const defaultResolutions = modelResolutionKeys(model, model.defaultRatio);
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
  const resolutions = modelResolutionKeys(model, ratio);
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
      label: value === "source"
        ? "原图尺寸"
        : model.postUpscale?.[value]
          ? `${value} · 2K→攸行超分`
          : value,
      value,
    })),
  };
}

export function sizeSummary({ model, ratio, ratioMode, resolution, sourceImage }) {
  if (model.sizingMode === "source") {
    const resolutions = modelResolutionKeys(model, "source");
    const resolvedResolution = resolutions.includes(resolution)
      ? resolution
      : model.defaultResolution;
    const postUpscale = model.postUpscale?.[resolvedResolution] || null;
    const inferenceResolution = postUpscale?.sourceResolution || resolvedResolution;
    const pixelArea = Number(model.sizes.source?.[inferenceResolution]);
    let dimensions = null;
    if (sourceImage && Number.isInteger(pixelArea)) {
      const aspectRatio = sourceImage.width / sourceImage.height;
      const height = Math.max(16, Math.floor(Math.sqrt(pixelArea / aspectRatio) / 16) * 16);
      let width = Math.max(16, Math.round(height * aspectRatio / 16) * 16);
      while (width * height > pixelArea && width > 16) width -= 16;
      dimensions = { height, width };
      if (postUpscale) {
        const scale = Number(postUpscale.longEdge) / Math.max(width, height);
        const even = (value) => Math.max(2, Math.round(value / 2) * 2);
        dimensions = width >= height
          ? { height: even(height * scale), width: Number(postUpscale.longEdge) }
          : { height: Number(postUpscale.longEdge), width: even(width * scale) };
      }
    }
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

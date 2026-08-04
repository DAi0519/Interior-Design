/**
 * [INPUT]: 依赖 image-ratio.js 的最近比例与原图比例文案，接收公开模型能力、功能模式、参考图及当前尺寸选择
 * [OUTPUT]: 对外提供参考图数量/文案、比例分辨率选项和结果尺寸摘要的纯状态推导
 * [POS]: public 的模型能力解释层，隔离 app.js DOM 控制器与 OneAPI/ComfyUI 差异
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { nearestSupportedRatio, sourceAspectLabel } from "./image-ratio.js";

export function referenceCapability({ featureMode, model, policy }) {
  const isWhiteModel = featureMode === "whiteModel";
  const requiresSingleImage =
    isWhiteModel || model?.requiresReferenceImage === true;
  return {
    ariaLabel: isWhiteModel ? "添加白模图" : "添加参考图",
    dropLabel: isWhiteModel
      ? "添加或拖入白模图"
      : requiresSingleImage
        ? "添加或拖入待增强图片"
        : "添加或拖入参考图",
    limit: isWhiteModel
      ? 1
      : Math.min(
          model?.maxReferenceImages || Number.POSITIVE_INFINITY,
          policy?.maxCount || 4,
        ),
    multiple: !requiresSingleImage,
    optionalLabel: requiresSingleImage ? "必填 · 1张" : "可选",
    title: isWhiteModel ? "白模图" : "参考图",
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
  const sourceOnly = model.sizingMode === "source";
  const defaultResolutions = Object.keys(model.sizes[model.defaultRatio]);
  const preservedResolution =
    preserveResolution && defaultResolutions.includes(currentResolution)
      ? currentResolution
      : model.defaultResolution;
  const automaticRatio = sourceOnly
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
    ratioDisabled: sourceOnly,
    ratioOptions: Object.keys(model.sizes).map((value) => ({
      label: value === "source" ? "跟随原图" : value,
      value,
    })),
    resolution,
    resolutionDisabled: sourceOnly,
    resolutionOptions: resolutions.map((value) => ({
      label: value === "source" ? "原图尺寸" : value,
      value,
    })),
  };
}

export function sizeSummary({ model, ratio, ratioMode, resolution, sourceImage }) {
  if (model.sizingMode === "source") {
    const value = sourceImage
      ? `${sourceImage.width} × ${sourceImage.height}`
      : "上传参考图后读取";
    return { emptySize: value, exactSize: value, resolution };
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

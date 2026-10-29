/**
 * [INPUT]: 依赖room-renovation 的旧房/空房模式判定、 image-ratio.js，接收公开模型能力、功能模式、参考图、Seedream 5.0 Pro 全景 4K 实验档、Flux 1K/2K 原生档与 2K→4K/6K 后置超分档及当前尺寸选择
 * [OUTPUT]: 对外提供光影转换/质感增强/全景R5_4运行进程能力门禁；含打光/二次编辑/旧房改造单张照片与多角度单图上传语义； 对外提供参考图主题与数量文案、含质感增强/风格转换/美化/氛围转换的单图合同、按功能合并的比例分辨率选项，以及全景R5_4原尺寸、Flux推理/超分及精模/光影转换双图1K/2K长边尺寸摘要
 * [POS]: public 的模型能力解释层，隔离 app.js DOM 控制器与 OneAPI/ComfyUI 差异
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { refinedReferenceModel, refinedFluxDimensions } from "./refined-flux-reference.js";
import { isEmptyRoomDesign } from "./room-renovation.js";
import { nearestSupportedRatio, sourceAspectLabel } from "./image-ratio.js";

export function generationFeatureUnavailableReason(featureMode, supportedModes, models = []) {
  if (featureMode === "lightingTransfer" && (!Array.isArray(supportedModes) || !supportedModes.includes(featureMode))) return "当前服务尚未加载光影转换，请使用已更新的工作台入口";
  if (featureMode === "panoramaEnhancement" && (!Array.isArray(supportedModes) || !supportedModes.includes(featureMode)
    || models.some(model => model.key === "aiTextureEnhancement" && model.panoramaWorkflow?.id !== "panorama-r5-4"))) return "当前服务尚未加载R5_4全景链路，请使用已更新的工作台入口";
  return featureMode === "textureEnhancement" && (!Array.isArray(supportedModes) || !supportedModes.includes(featureMode))
    ? "当前服务尚未加载质感增强，请使用已更新的工作台入口"
    : null;
}

function modelResolutionKeys(model, ratio) {
  return [
    ...Object.keys(model.sizes[ratio] || {}),
    ...(ratio === "source" ? Object.keys(model.postUpscale || {}) : []),
  ];
}

function sizesForFeature(model, featureMode) {
  const overrides = model.featureSizeOverrides?.[featureMode] || {};
  return Object.fromEntries(
    Object.entries(model.sizes).map(([ratio, sizes]) => [
      ratio,
      { ...sizes, ...(overrides[ratio] || {}) },
    ]),
  );
}

export function referenceSubject(featureMode) {
  return ({ whiteModel: "白模图", emptyRoom: "空房图", roomRenovation: "旧房照片", styleTransfer: "待转换空间图", refinedModel: "精模图",
    effectEnhancement: "待转换效果图", lightingTransfer: "待转换效果图", effectBeautification: "待美化效果图", textureEnhancement: "待增强效果图",
    panoramaEnhancement: "待美化全景图", imageOutpaint: "待扩图图片",
    imageMultiAngle: "多角度原图", imageMaskFill: "待编辑原图", imageRelight: "打光原图", imageUpscale: "待超分图片" })[featureMode] || "参考图";
}

export function referenceCapability({ featureMode, model, policy }) {
  const isWhiteModel = featureMode === "whiteModel";
  const isEmptyRoom = isEmptyRoomDesign(featureMode);
  const isStyleTransfer = featureMode === "styleTransfer";
  const isRefinedModel = featureMode === "refinedModel";
  const isEffectEnhancement = featureMode === "effectEnhancement";
  const isEffectBeautification = featureMode === "effectBeautification";
  const isPanoramaEnhancement = featureMode === "panoramaEnhancement";
  const fixedSingleImage = isWhiteModel || isEmptyRoom || isStyleTransfer || isRefinedModel
    || isEffectEnhancement || isEffectBeautification || isPanoramaEnhancement || ["lightingTransfer", "textureEnhancement", "imageMultiAngle", "imageRelight"].includes(featureMode);
  const subject = referenceSubject(featureMode);
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
  refinedLighting, featureMode,
  model,
  preserveResolution,
  ratioMode,
  sourceImage,
}) {
  if (featureMode === "panoramaEnhancement" && model.panoramaWorkflow?.sourceSize) return {
    ratio: "source", ratioDisabled: true, ratioOptions: [{ label: "2:1 · 全景原图", value: "source" }],
    resolution: "original", resolutionDisabled: true, resolutionOptions: [{ label: "原图尺寸 · R5_4 全景", value: "original" }],
  };
  model = refinedReferenceModel(model, featureMode, refinedLighting);
  model = { ...model, sizes: sizesForFeature(model, featureMode) };
  const sourceAspect = model.sizingMode === "source";
  const automaticRatio = sourceAspect
    ? model.defaultRatio
    : nearestSupportedRatio(model, sourceImage);
  const ratio =
    ratioMode === "manual" && Object.hasOwn(model.sizes, currentRatio)
      ? currentRatio
      : automaticRatio;
  const resolutions = modelResolutionKeys(model, ratio);
  const preservedResolution =
    preserveResolution && resolutions.includes(currentResolution)
      ? currentResolution
      : model.defaultResolution;
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

export function sizeSummary({ featureMode, refinedLighting, model, ratio, ratioMode, resolution, sourceImage }) {
  if (featureMode === "panoramaEnhancement" && model.panoramaWorkflow?.sourceSize) {
    const value = sourceImage ? `${sourceImage.width} × ${sourceImage.height}` : "上传2:1全景图后显示";
    return { emptySize: value, exactSize: `${value} · R5_4 全景`, resolution: "original" };
  }
  model = refinedReferenceModel(model, featureMode, refinedLighting);
  model = { ...model, sizes: sizesForFeature(model, featureMode) };
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
      dimensions = model.sourceLongEdgeLimits ? refinedFluxDimensions(sourceImage, resolvedResolution) : { height, width };
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

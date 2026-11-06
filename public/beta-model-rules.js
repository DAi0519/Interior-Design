/**
 * [INPUT]: 依赖 model-capabilities 的按功能及精模Flux双图尺寸合同、公开模型目录与 Beta 当前功能/尺寸选择
 * [OUTPUT]: 对外提供含户型布局的十三功能目录、旧进程门禁、各样本后置KS输入预检及目录驱动分辨率文案、全景2:1/R5_4原尺寸隔离与普通输出控件状态
 * [POS]: public 的 Beta 功能与模型纯规则层，供页面编排、持久配置和测试复用，不读取 DOM 或图片正文
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { fluxPostUpscaleState, sizeControlState } from "./model-capabilities.js";

export const BETA_FEATURE_COPY = Object.freeze({
  housePlanLayout: { label: "户型平面布局", prompt: "补充需求（可选）", source: "户型原图" },
  whiteModel: { label: "白模渲染", prompt: "补充要求（可选）", source: "白模图" },
  emptyRoom: { label: "空房设计", prompt: "补充要求（可选）", source: "空房图" },
  roomRenovation: { label: "旧房改造", prompt: "补充要求（可选）", source: "旧房照片" },
  styleTransfer: { label: "风格转换", prompt: "补充要求（可选）", source: "待转换空间图" },
  refinedModel: { label: "精模渲染", prompt: "自定义要求（可选）", source: "带材质精模图" },
  textureEnhancement: { label: "质感增强", prompt: "", promptConfig: "textureEnhancementPrompt", source: "待增强效果图" },
  effectEnhancement: { label: "效果图氛围转换", prompt: "", promptConfig: "effectEnhancementPrompt", source: "待转换效果图" },
  effectBeautification: { label: "效果图美化", prompt: "", promptConfig: "effectBeautificationPrompt", source: "待美化效果图" },
  panoramaEnhancement: { label: "全景图美化", prompt: "", promptConfig: "panoramaEnhancementPrompt", source: "待美化全景图" },
  free: { label: "自由生图", prompt: "提示词", source: "" },
  imageOutpaint: { label: "AI扩图", prompt: "", source: "待扩图图片" },
  imageUpscale: { label: "AI超分", prompt: "", source: "待超分图片" },
});

export function betaFeatureUnavailableReason(featureMode, config) {
  return ["housePlanLayout", "roomRenovation", "textureEnhancement"].includes(featureMode) && !config?.features?.includes(featureMode)
    ? `当前服务尚未加载 Beta ${BETA_FEATURE_COPY[featureMode].label}，请更新工作台服务后刷新` : null;
}

export function betaPostUpscaleUnavailableReason({ featureMode, models, resolution, sources = [], refinedLighting }) {
  for (const model of models) for (const [index, sourceImage] of (sources.length ? sources : [null]).entries()) {
    const issue = fluxPostUpscaleState({ featureMode, model, resolution, sourceImage, refinedLighting }).reason;
    if (issue) return sourceImage ? `第 ${index + 1} 张样本：${issue}` : issue;
  }
  return null;
}

export function betaModelSelectable(model, featureMode) {
  return featureMode !== "panoramaEnhancement"
    || model.sizingMode === "source"
    || Boolean(model.sizes["2:1"]);
}

export function assertBetaPanoramaSource(featureMode, image) {
  if (featureMode === "panoramaEnhancement"
    && (!Number.isInteger(image?.width) || !Number.isInteger(image?.height)
      || image.width < 1 || image.height < 1 || image.width !== image.height * 2)) {
    throw new Error(`${image?.name || "全景图"} 必须是 2:1 等距柱状全景图`);
  }
}

function intersection(values) {
  if (!values.length) return [];
  return values[0].filter((value) => values.every((entries) => entries.includes(value)));
}

export function betaSizeOptions({ models, featureMode, refinedLighting, currentRatio, currentResolution }) {
  const panorama = featureMode === "panoramaEnhancement";
  const automatic = featureMode !== "free";
  const ratios = intersection(models.map((model) => Object.keys(model.sizes)));
  const ratioOptions = panorama
    ? [{ label: "2:1 · 全景", value: "2:1" }]
    : [
      ...(automatic ? [{ label: "跟随原图 · 智能适配", value: "auto" }] : []),
      ...ratios.map((value) => ({ label: value === "source" ? "跟随原图" : value, value })),
    ];
  const ratio = panorama ? "2:1"
    : ratioOptions.some((option) => option.value === currentRatio) ? currentRatio
      : automatic ? "auto" : models[0]?.defaultRatio;
  const effectiveRatio = ratio === "auto" ? models[0]?.defaultRatio : ratio;
  const resolutionSets = models.map((model) => sizeControlState({
    currentRatio: effectiveRatio,
    currentResolution,
    featureMode, refinedLighting,
    model,
    preserveResolution: true,
    ratioMode: "manual",
    sourceImage: null,
  }).resolutionOptions.map((option) => option.value));
  const commonResolutions = intersection(resolutionSets);
  const resolutions = commonResolutions.length ? commonResolutions : [...new Set(resolutionSets.flat())];
  return {
    ratio,
    ratioDisabled: panorama,
    ratioOptions,
    resolution: resolutions.includes(currentResolution) ? currentResolution : resolutions.includes(models[0]?.defaultResolution) ? models[0]?.defaultResolution : resolutions[0],
    resolutionOptions: resolutions.map((value) => {
      const post = models.find(model => model.postUpscale?.[value])?.postUpscale[value];
      return { label: value === "original" ? "原图尺寸 · R5_4 全景" : post
        ? `${value} · ${models.length > 1 ? "Flux " : ""}${post.sourceResolution}→${post.workflowLabel || "攸行超分"}` : value, value };
    }),
  };
}

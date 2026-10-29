/**
 * [INPUT]: 依赖 model-capabilities 的按功能及精模Flux双图尺寸合同、公开模型目录与 Beta 当前功能/尺寸选择
 * [OUTPUT]: 对外提供按任务选择顺序排列且含完整名称的十功能文案目录、独立AI超分图像任务、风格转换空间图/补充要求、全景2:1/R5_4原尺寸准入与普通输出控件状态
 * [POS]: public 的 Beta 功能与模型纯规则层，供页面编排、持久配置和测试复用，不读取 DOM 或图片正文
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { sizeControlState } from "./model-capabilities.js";

export const BETA_FEATURE_COPY = Object.freeze({
  whiteModel: { label: "白模渲染", prompt: "补充要求（可选）", source: "白模图" },
  emptyRoom: { label: "空房设计", prompt: "补充要求（可选）", source: "空房图" },
  styleTransfer: { label: "风格转换", prompt: "补充要求（可选）", source: "待转换空间图" },
  refinedModel: { label: "精模渲染", prompt: "自定义要求（可选）", source: "带材质精模图" },
  effectEnhancement: { label: "效果图氛围转换", prompt: "", promptConfig: "effectEnhancementPrompt", source: "待转换效果图" },
  effectBeautification: { label: "效果图美化", prompt: "", promptConfig: "effectBeautificationPrompt", source: "待美化效果图" },
  panoramaEnhancement: { label: "全景图美化", prompt: "", promptConfig: "panoramaEnhancementPrompt", source: "待美化全景图" },
  free: { label: "自由生图", prompt: "提示词", source: "" },
  imageOutpaint: { label: "AI扩图", prompt: "", source: "待扩图图片" },
  imageUpscale: { label: "AI超分", prompt: "", source: "待超分图片" },
});

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
    resolutionOptions: resolutions.map((value) => ({ label: value === "original" ? "原图尺寸 · R5_4 全景" : value, value })),
  };
}

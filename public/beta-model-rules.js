/**
 * [INPUT]: 依赖 model-capabilities 的按功能尺寸合同、公开模型目录与 Beta 当前功能/尺寸选择
 * [OUTPUT]: 对外提供七功能文案、全景 2:1 模型准入与源图校验、包含全景实验档的共享输出控件状态
 * [POS]: public 的 Beta 功能与模型纯规则层，供页面编排、持久配置和测试复用，不读取 DOM 或图片正文
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { sizeControlState } from "./model-capabilities.js";

export const BETA_FEATURE_COPY = Object.freeze({
  effectBeautification: { label: "效果图美化", prompt: "", promptConfig: "effectBeautificationPrompt", source: "待美化效果图" },
  effectEnhancement: { label: "效果图氛围转换", prompt: "", promptConfig: "effectEnhancementPrompt", source: "待转换效果图" },
  emptyRoom: { prompt: "补充要求（可选）", source: "空房图" },
  free: { prompt: "提示词", source: "" },
  panoramaEnhancement: { label: "全景图美化", prompt: "", promptConfig: "panoramaEnhancementPrompt", source: "待美化全景图" },
  refinedModel: { prompt: "自定义要求（可选）", source: "带材质精模图" },
  whiteModel: { prompt: "补充要求（可选）", source: "白模图" },
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

export function betaSizeOptions({ models, featureMode, currentRatio, currentResolution }) {
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
    featureMode,
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
    resolution: resolutions.includes(currentResolution) ? currentResolution : models[0]?.defaultResolution,
    resolutionOptions: resolutions.map((value) => ({ label: value, value })),
  };
}

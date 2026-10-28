/**
 * [INPUT]: 依赖room-renovation 的空房模式判定、工作台已归一化的功能/模型/Prompt/图片/尺寸、精模预设提示词/上传参考及旧参数兼容、效果图氛围转换时段天气、美化强度色调、全景美化与设计双模式状态
 * [OUTPUT]: 对外提供buildGenerationInput，质感增强只冻结飞书版本且不携自定义正负向词，精模纯词预设基础版本/预设图文和上传专用迁移版本统一投影，卡图服务端读取/上传图独立携带，不泄漏基础身份；省略来源兼容旧参数，旧房携独立Agent版本
 * [POS]: public 的生成输入领域映射层，隔离页面编排与服务端请求字段契约
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { isEmptyRoomDesign } from "./room-renovation.js";
import { normalizeEffectBeautification } from "./effect-beautification-controls.js";
import { usesRefinedLightingReferencePrompt } from "./refined-lighting-controls.js";

function compactImages(images = []) {
  return images.map(({ dataUrl, name, size, type }) => ({ dataUrl, name, size, type }));
}

export function buildGenerationInput({
  effectBeautification,
  effectBeautificationPromptVersion,
  textureEnhancementPromptVersion,
  effectTime,
  effectWeather,
  emptyRoomFields,
  featureMode,
  model,
  negativePrompt,
  prompt,
  promptAgentModelKey,
  promptAgentVersion,
  promptVersion,
  quality,
  ratio,
  ratioMode,
  refinedRender,
  refinedLighting,
  lightingReferenceImages,
  refinedAtmospherePromptVersion,
  referenceImages,
  renderMode,
  resolution,
  styleReferenceImages,
}) {
  const emptyRoom = isEmptyRoomDesign(featureMode);
  const renovation = featureMode === "roomRenovation";
  const effectEnhancement = featureMode === "effectEnhancement";
  const effectBeautificationRequest = featureMode === "effectBeautification";
  const textureEnhancement = featureMode === "textureEnhancement";
  const panoramaEnhancement = featureMode === "panoramaEnhancement";
  const whiteModel = featureMode === "whiteModel";
  const styleTransfer = featureMode === "styleTransfer";
  const designPromptFlow = emptyRoom || whiteModel || styleTransfer;
  return {
    featureMode: featureMode === "roomRenovation" ? "emptyRoom" : featureMode,
    ...(featureMode === "roomRenovation" ? { designScenario: "room-renovation" } : {}),
    modelKey: model?.key,
    negativePrompt: textureEnhancement ? "" : String(negativePrompt || "").trim(),
    outputFormat: "png",
    prompt: featureMode === "refinedModel"
      ? prompt.refined
      : effectEnhancement || effectBeautificationRequest || textureEnhancement || panoramaEnhancement ? "" : prompt.free,
    quality: model?.qualityOptions.length ? quality || undefined : undefined,
    ratio,
    ratioMode,
    referenceImages: compactImages(referenceImages),
    ...(designPromptFlow ? { styleReferenceImages: compactImages(styleReferenceImages) } : {}),
    resolution,
    ...(textureEnhancement ? { textureEnhancementPromptVersion } : {}),
    ...(effectEnhancement ? { effectTime, effectWeather } : {}),
    ...(featureMode === "refinedModel" ? refinedLighting !== undefined
      ? { refinedLighting: ["preset", "reference"].includes(refinedLighting?.mode) ? refinedLighting : null,
        ...(refinedLighting?.mode === "reference" ? { lightingReferenceImages: compactImages(lightingReferenceImages || []) } : {}) }
      : { refinedRender, refinedAtmospherePromptVersion } : {}),
    ...(effectBeautificationRequest ? {
      effectBeautification: normalizeEffectBeautification(effectBeautification),
      effectBeautificationPromptVersion,
    } : {}),
    renderMode: renderMode.mode,
    ...(emptyRoom ? emptyRoomFields : {}),
    emptyRoomSmartDefaultVersion: emptyRoom && !renovation && renderMode.mode === "smart-default"
      ? renderMode.agentVersion || undefined
      : undefined,
    emptyRoomPromptAgentVersion: emptyRoom && !renovation && renderMode.mode === "style-dna"
      ? promptAgentVersion
      : undefined,
    roomRenovationSmartDefaultVersion: renovation && renderMode.mode === "smart-default"
      ? renderMode.agentVersion || undefined : undefined,
    roomRenovationPromptAgentVersion: renovation && renderMode.mode === "style-dna"
      ? promptAgentVersion : undefined,
    styleTransferReferenceVersion: styleTransfer && renderMode.mode === "style-reference"
      ? renderMode.agentVersion || undefined
      : undefined,
    styleTransferPromptAgentVersion: styleTransfer && renderMode.mode === "style-dna"
      ? promptAgentVersion
      : undefined,
    smartDefaultAgentVersion: whiteModel ? renderMode.agentVersion || undefined : undefined,
    styleCode: renderMode.styleCode || undefined,
    promptAgentModelKey,
    promptAgentVersion: whiteModel ? promptAgentVersion : undefined,
    promptVersion: featureMode === "refinedModel" && usesRefinedLightingReferencePrompt(refinedLighting)
      ? refinedLighting.ruleVersion : promptVersion,
  };
}

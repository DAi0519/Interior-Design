/**
 * [INPUT]: 依赖质感增强飞书Prompt版本、room-renovation 的空房模式判定、工作台已归一化的功能/模型/Prompt/图片/尺寸、精模预设提示词/上传参考及旧参数兼容、效果图氛围转换时段天气、美化六档与新增光影身份、全景美化与设计双模式状态
 * [OUTPUT]: 美化六档原样投影/新增光影固定low-natural且跨功能剥离；白模仅传自动null或单卡身份；光影转换/全景/精模独立光影投影；对外提供buildGenerationInput，质感固定词、旧房独立Agent版本与各功能参数隔离
 * [POS]: public 的生成输入领域映射层，隔离页面编排与服务端请求字段契约
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { isEmptyRoomDesign } from "./room-renovation.js";
import { normalizeEffectBeautification } from "./effect-beautification-controls.js";
import { refinedLightingPromptKind } from "./refined-flux-reference.js";
import { whiteModelLightingRequestFields } from "./white-model-lighting.js";
import { effectBeautificationLightingRequestFields } from "./effect-beautification-lighting.js";

function compactImages(images = []) {
  return images.map(({ dataUrl, name, size, type }) => ({ dataUrl, name, size, type }));
}

export function buildGenerationInput({
  effectBeautification,
  effectBeautificationLighting,
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
  panoramaLighting,
  refinedLighting,
  lightingReferenceImages,
  refinedAtmospherePromptVersion,
  referenceImages,
  renderMode,
  resolution,
  styleReferenceImages,
  whiteModelLighting,
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
    negativePrompt: textureEnhancement || featureMode === "lightingTransfer" ? "" : String(negativePrompt || "").trim(),
    outputFormat: "png",
    prompt: featureMode === "lightingTransfer" ? String(prompt.lightingTransfer || "").trim() : featureMode === "refinedModel"
      ? prompt.refined
      : panoramaEnhancement ? String(prompt.panorama || "").trim()
      : effectEnhancement || effectBeautificationRequest || textureEnhancement ? "" : prompt.free,
    quality: model?.qualityOptions.length ? quality || undefined : undefined,
    ratio,
    ratioMode,
    referenceImages: compactImages(referenceImages),
    ...(designPromptFlow ? { styleReferenceImages: compactImages(styleReferenceImages) } : {}),
    resolution,
    ...(textureEnhancement ? { textureEnhancementPromptVersion } : {}),
    ...(effectEnhancement ? { effectTime, effectWeather } : {}),
    ...(panoramaEnhancement ? { panoramaLighting: panoramaLighting || null } : {}),
    ...whiteModelLightingRequestFields(featureMode, whiteModelLighting),
    ...(featureMode === "lightingTransfer" ? { refinedLighting } : {}),
    ...(featureMode === "refinedModel" ? refinedLighting !== undefined
      ? { refinedLighting: ["preset", "reference"].includes(refinedLighting?.mode) ? refinedLighting : null,
        ...(refinedLighting?.mode === "reference" ? { lightingReferenceImages: compactImages(lightingReferenceImages || []) } : {}) }
      : { refinedRender, refinedAtmospherePromptVersion } : {}),
    ...(effectBeautificationRequest ? {
      effectBeautification: normalizeEffectBeautification(effectBeautificationLighting
        ? { intensity: "low", tone: "natural" } : effectBeautification),
      ...effectBeautificationLightingRequestFields(featureMode, effectBeautificationLighting),
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
    promptVersion: featureMode === "lightingTransfer" || featureMode === "refinedModel" && refinedLightingPromptKind(refinedLighting) !== "base"
      ? refinedLighting?.ruleVersion : promptVersion,
  };
}

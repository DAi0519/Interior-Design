/**
 * [INPUT]: 依赖room-renovation 的空房模式判定、工作台已归一化的功能、模型、正向 Prompt、可选 Flux 负向 Prompt、图片、尺寸、效果图氛围转换时段天气、效果图美化强度色调、全景图美化与白模/空房/风格转换双模式状态
 * [OUTPUT]: 对外提供旧房改造包装参数与 buildGenerationInput，将页面状态与各功能独立 Agent 版本投影为统一生成请求输入且不携带 DOM
 * [POS]: public 的生成输入领域映射层，隔离页面编排与服务端请求字段契约
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { isEmptyRoomDesign } from "./room-renovation.js";
import { normalizeEffectBeautification } from "./effect-beautification-controls.js";

function compactImages(images = []) {
  return images.map(({ dataUrl, name, size, type }) => ({ dataUrl, name, size, type }));
}

export function buildGenerationInput({
  effectBeautification,
  effectBeautificationPromptVersion,
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
  referenceImages,
  renderMode,
  resolution,
  styleReferenceImages,
}) {
  const emptyRoom = isEmptyRoomDesign(featureMode);
  const effectEnhancement = featureMode === "effectEnhancement";
  const effectBeautificationRequest = featureMode === "effectBeautification";
  const panoramaEnhancement = featureMode === "panoramaEnhancement";
  const whiteModel = featureMode === "whiteModel";
  const styleTransfer = featureMode === "styleTransfer";
  const designPromptFlow = emptyRoom || whiteModel || styleTransfer;
  return {
    featureMode: featureMode === "roomRenovation" ? "emptyRoom" : featureMode,
    ...(featureMode === "roomRenovation" ? { roomRenovation: true } : {}),
    modelKey: model?.key,
    negativePrompt: String(negativePrompt || "").trim(),
    outputFormat: "png",
    prompt: featureMode === "refinedModel"
      ? prompt.refined
      : effectEnhancement || effectBeautificationRequest || panoramaEnhancement ? "" : prompt.free,
    quality: model?.qualityOptions.length ? quality || undefined : undefined,
    ratio,
    ratioMode,
    referenceImages: compactImages(referenceImages),
    ...(designPromptFlow ? { styleReferenceImages: compactImages(styleReferenceImages) } : {}),
    resolution,
    ...(effectEnhancement ? { effectTime, effectWeather } : {}),
    ...(effectBeautificationRequest ? {
      effectBeautification: normalizeEffectBeautification(effectBeautification),
      effectBeautificationPromptVersion,
    } : {}),
    renderMode: renderMode.mode,
    ...(emptyRoom ? emptyRoomFields : {}),
    emptyRoomSmartDefaultVersion: emptyRoom && renderMode.mode === "smart-default"
      ? renderMode.agentVersion || undefined
      : undefined,
    emptyRoomPromptAgentVersion: emptyRoom && renderMode.mode === "style-dna"
      ? promptAgentVersion
      : undefined,
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
    promptVersion,
  };
}

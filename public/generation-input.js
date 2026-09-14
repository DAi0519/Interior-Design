/**
 * [INPUT]: 依赖工作台已归一化的功能、模型、正向 Prompt、可选 Flux 负向 Prompt、图片、尺寸、效果图美化时段天气、全景图美化默认模式与设计模式状态
 * [OUTPUT]: 对外提供 buildGenerationInput，将页面状态投影为统一生成请求输入且不携带 DOM
 * [POS]: public 的生成输入领域映射层，隔离页面编排与服务端请求字段契约
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

function compactImages(images = []) {
  return images.map(({ dataUrl, name, size, type }) => ({ dataUrl, name, size, type }));
}

export function buildGenerationInput({
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
  const emptyRoom = featureMode === "emptyRoom";
  const effectEnhancement = featureMode === "effectEnhancement";
  const panoramaEnhancement = featureMode === "panoramaEnhancement";
  const whiteModel = featureMode === "whiteModel";
  const designPromptFlow = emptyRoom || whiteModel;
  return {
    featureMode,
    modelKey: model?.key,
    negativePrompt: String(negativePrompt || "").trim(),
    outputFormat: "png",
    prompt: featureMode === "refinedModel"
      ? prompt.refined
      : effectEnhancement || panoramaEnhancement ? "" : prompt.free,
    quality: model?.qualityOptions.length ? quality || undefined : undefined,
    ratio,
    ratioMode,
    referenceImages: compactImages(referenceImages),
    ...(designPromptFlow ? { styleReferenceImages: compactImages(styleReferenceImages) } : {}),
    resolution,
    ...(effectEnhancement ? { effectTime, effectWeather } : {}),
    renderMode: renderMode.mode,
    ...(emptyRoom ? emptyRoomFields : {}),
    emptyRoomSmartDefaultVersion: emptyRoom && renderMode.mode === "smart-default"
      ? renderMode.agentVersion || undefined
      : undefined,
    emptyRoomPromptAgentVersion: emptyRoom && renderMode.mode === "style-dna"
      ? promptAgentVersion
      : undefined,
    smartDefaultAgentVersion: whiteModel ? renderMode.agentVersion || undefined : undefined,
    styleCode: renderMode.styleCode || undefined,
    promptAgentModelKey,
    promptAgentVersion: whiteModel ? promptAgentVersion : undefined,
    promptVersion,
  };
}

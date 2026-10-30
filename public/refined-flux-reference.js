/**
 * [INPUT]: 依赖公开模型的精模双图能力、光影来源、原图尺寸及1K/2K档位
 * [OUTPUT]: 对外提供预设三种执行方式与标签、多选Prompt来源与双图判定、精模/效果图光影转换Flux上下文能力及16px对齐的原比例长边尺寸
 * [POS]: public/src共用的纯规则层，不扩大普通Flux单图能力
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
export const REFINED_FLUX_REFERENCE = Object.freeze({
  id: "refined-flux-reference", version: "2026-10-28.1",
  maxReferenceImages: 2, longEdges: Object.freeze({ "1K": 1024, "2K": 2048 }),
});
export const REFINED_LIGHTING_PRESET_EXECUTIONS = Object.freeze([
  "prompt-only", "prompt-and-reference", "prompt-with-reference",
]);
export const REFINED_LIGHTING_EXECUTION_LABELS = Object.freeze({
  "prompt-only": "仅提示词", "prompt-and-reference": "参考图迁移", "prompt-with-reference": "氛围词＋参考图",
});
export function refinedLightingPromptKind(selection) {
  if (selection?.mode === "reference") return "reference";
  const executions = selection?.executions || [selection?.execution || "prompt-only"];
  if (!executions.length || executions.includes("prompt-only")) return "base";
  return executions.includes("prompt-with-reference") ? "hybrid" : "reference";
}
export function isLightingReference(selection) {
  return selection?.mode === "reference" || selection?.mode === "preset"
    && (selection.executions || [selection.execution]).some(execution =>
      ["prompt-and-reference", "prompt-with-reference"].includes(execution));
}
export function supportsLightingReference(model) {
  return Number(model?.maxReferenceImages) >= 2 || Number(model?.refinedLightingReference?.maxReferenceImages) >= 2;
}
export function isRefinedFluxReference(input) {
  return ["refinedModel", "lightingTransfer"].includes(input?.featureMode) && input.modelKey === "aiTextureEnhancement" && isLightingReference(input.refinedLighting);
}
export function refinedFluxDimensions(image, resolution) {
  const edge = REFINED_FLUX_REFERENCE.longEdges[resolution];
  if (!edge || ![image?.width, image?.height].every(n => Number.isInteger(n) && n > 0)) throw new TypeError("精模Flux双图只支持原比例1K/2K");
  const scale = edge / Math.max(image.width, image.height);
  return { width: Math.max(16, Math.round(image.width * scale / 16) * 16),
    height: Math.max(16, Math.round(image.height * scale / 16) * 16) };
}
export function refinedReferenceModel(model, featureMode, selection) {
  if (!["refinedModel", "lightingTransfer"].includes(featureMode) || !isLightingReference(selection) || !model?.refinedLightingReference) return model;
  return { ...model, postUpscale: null, sourceLongEdgeLimits: REFINED_FLUX_REFERENCE.longEdges,
    sizes: { source: { "1K": 1024 ** 2, "2K": 2048 ** 2 } } };
}

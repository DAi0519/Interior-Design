/**
 * [INPUT]: 依赖批次合同、遮罩模式真源、原图/遮罩/参考图、实际送模圈选标记PNG与提交摘要、真实Prompt及结果元数据
 * [OUTPUT]: 真实模型/尺寸/费用与独立附件归档，校验矩形/自由圈选PNG与送模SHA一致，保留未标记原件，无视觉圈选留空框选原图
 * [POS]: src 的遮罩填充归档边界，由应用服务与 lark-sync 共享，不执行 GPU 或飞书写操作
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createHash } from "node:crypto";
import { normalizeGenerationBatch } from "./generation-batch.mjs";
import { normalizeReferenceImage } from "./reference-image.mjs";
import { resolveImageMaskFillMode } from "./image-mask-fill-workflow.mjs";
import { maskFillInferenceTier } from "../public/image-mask-fill-geometry.js";
import { MODEL_CONFIGS } from "./model-config.mjs";

export const IMAGE_MASK_FILL_ARCHIVE_MODEL_LABEL = "Flux2 Klein 9B · 遮罩填充";
export const IMAGE_MASK_FILL_ARCHIVE_FIELDS = Object.freeze({
  "遮罩填充模式": "select", "局部推理尺寸（px）": "number", "遮罩扩展（px）": "number",
  "遮罩工作流版本": "text", "遮罩图": "attachment", "填充参考图": "attachment", "框选原图": "attachment",
});
export const IMAGE_MASK_FILL_ARCHIVE_MODE_LABELS = Object.freeze(["提示词填充", "参考图填充"]);

export function maskFillRecordFields(workflow) {
  if (workflow?.feature !== "image-mask-fill") return {};
  const mode = resolveImageMaskFillMode(workflow.mode);
  const unknownOriginal = ["original", "1mp"].includes(workflow.inferenceTier) && workflow.inferenceSize == null;
  if ((!unknownOriginal && (!Number.isInteger(workflow.inferenceSize) || workflow.inferenceSize < 1 || workflow.inferenceSize > 16384)) || !Number.isInteger(workflow.maskExpand)
    || workflow.maskExpand < 0 || workflow.maskExpand > 256 || !workflow.workflowVersion) throw new TypeError("遮罩填充归档参数或版本缺失");
  return { "遮罩填充模式": mode.label, "局部推理尺寸（px）": workflow.inferenceSize ?? null,
    "遮罩扩展（px）": workflow.maskExpand, "遮罩工作流版本": workflow.workflowVersion };
}

export function buildImageMaskFillArchive({ input, validated, result, maskImage = validated.mask, boxedSourceImage = null }) {
  const metadata = result.upstream?.metadata;
  const maskOmitted = validated.provider === "oneapi" && validated.mask == null && metadata?.hasMask === false;
  if (!metadata?.prompt?.trim() || !result.images?.[0]?.url || !validated.source?.imageUrl
    || (!maskOmitted && (!validated.mask?.imageUrl || !maskImage?.imageUrl)) || (maskOmitted && maskImage)) {
    throw new TypeError("遮罩填充归档缺少实际完整 Prompt、主图、遮罩或结果图");
  }
  const boxSelected = validated.provider === "oneapi" && Boolean(validated.editRegion);
  if (Boolean(boxedSourceImage) !== boxSelected) throw new TypeError("框选归档需独立提供实际提交的圈选标记原图，非框选不能提供");
  if (boxSelected) {
    const encoded = boxedSourceImage.imageUrl?.match(/^data:image\/png;base64,([A-Za-z0-9+/=\r\n]+)$/)?.[1];
    const bytes = encoded ? Buffer.from(encoded, "base64") : null;
    if (!bytes?.length || boxedSourceImage.mimeType !== "image/png" || boxedSourceImage.size !== bytes.length
      || createHash("sha256").update(bytes).digest("hex") !== metadata.submittedSourceSha256) {
      throw new TypeError("框选原图 PNG、字节数或 SHA-256 与实际提交回执不一致");
    }
  }
  const mode = resolveImageMaskFillMode(validated.mode);
  if (mode.key === "reference" && !validated.reference?.imageUrl) throw new TypeError("参考图填充归档缺少物体参考图");
  const originalSource = normalizeReferenceImage(input.referenceImages?.[0]);
  const originalReference = mode.key === "reference" ? normalizeReferenceImage(input.fillReferenceImage) : null;
  const tier = maskFillInferenceTier(validated.inferenceTier, validated.modelKey);
  const inferenceSize = metadata.inferenceSize ?? (tier.key === "original" ? null : validated.inferenceSize);
  const provider = validated.provider || "comfyui";
  return {
    durationMs: result.durationMs, finalPrompt: metadata.prompt, sourcePrompt: validated.prompt,
    modelLabel: provider === "oneapi" ? MODEL_CONFIGS.gptImage25Sunburst.label
      : validated.modelKey === "qwenImageEdit2511" ? "Qwen Image Edit 2511" : IMAGE_MASK_FILL_ARCHIVE_MODEL_LABEL,
    preview: { ...result.request, resolution: metadata.outputResolution || tier.key, inferenceSize, syncMode: "lark", provider, transport: result.upstream.transport },
    referenceImages: [originalSource], resultImage: result.images[0], maskImage, fillReferenceImage: originalReference, boxedSourceImage,
    workflow: { ...normalizeGenerationBatch(input), ...metadata, feature: "image-mask-fill", provider,
      mode: mode.key, inferenceTier: tier.key, inferenceSize,
      inferenceWidth: metadata.inferenceWidth ?? (tier.key === "original" ? null : validated.inferenceWidth),
      inferenceHeight: metadata.inferenceHeight ?? (tier.key === "original" ? null : validated.inferenceHeight), maskExpand: validated.maskExpand,
      workflowId: result.workflow.key, workflowVersion: result.workflow.version,
      promptSource: provider === "oneapi" ? "submitted Images edits prompt" : "submitted ComfyUI text condition", finalPromptCaptured: true, syncMode: "lark",
      originalReferenceSha256: validated.reference?.originalSha256 || null },
  };
}

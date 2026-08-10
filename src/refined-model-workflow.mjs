/**
 * [INPUT]: 依赖固定精模 Prompt、单张带材质模型图、出图模型矩阵、批次元数据、图像客户端与非阻塞归档
 * [OUTPUT]: 对外提供服务端固定 Prompt 的精模忠实渲染、实际参数摘要和独立飞书同步任务
 * [POS]: src 的精模渲染应用服务，与白模 Style DNA/Prompt Agent 链路隔离并复用出图基础设施
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { normalizeGenerationBatch } from "./generation-batch.mjs";
import { createGenerationRequest, publicModelCatalog } from "./model-config.mjs";
import {
  DEFAULT_REFINED_MODEL_PROMPT_CODE,
  getRefinedModelPrompt,
} from "./refined-model-prompt.mjs";
import { normalizeReferenceImages } from "./reference-image.mjs";

function workflowError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export async function executeRefinedModelWorkflow(
  input,
  {
    imageClient,
    loadPrompt = getRefinedModelPrompt,
    scheduleSync = null,
  },
) {
  if (!imageClient) {
    throw new TypeError("refined model workflow requires image client");
  }
  const referenceImages = normalizeReferenceImages(input.referenceImages);
  if (referenceImages.length !== 1) {
    throw workflowError("精模渲染需要且只允许 1 张带材质模型图");
  }

  const promptAsset = await loadPrompt(
    input.promptCode || DEFAULT_REFINED_MODEL_PROMPT_CODE,
    { allowDraft: true, version: input.promptVersion },
  );
  const batch = normalizeGenerationBatch(input);
  const generation = createGenerationRequest(
    { ...input, prompt: promptAsset.prompt },
    {
      preferSourceAspect: input.ratioMode !== "manual",
      sourceDimensions: {
        height: referenceImages[0].height,
        width: referenceImages[0].width,
      },
    },
  );
  const startedAt = Date.now();
  const result = await imageClient.generateImage(generation.request);
  const durationMs = Date.now() - startedAt;
  const resultImage = result.images?.[0];
  if (!resultImage?.url) {
    throw workflowError("出图模型没有返回图片", 502);
  }

  const preview = {
    ...generation.preview,
    provider: generation.provider,
    quality: result.quality ?? generation.preview.quality,
    transport: result.transport || "responses",
  };
  const imageModel = publicModelCatalog().find(
    (entry) => entry.key === String(input.modelKey || ""),
  );
  const archivedReferences = generation.request.images.map((image, index) => ({
    fileName: generation.preview.referenceImages[index]?.fileName,
    imageUrl: image.image_url,
    mimeType: generation.preview.referenceImages[index]?.mimeType,
  }));
  const workflow = {
    ...batch,
    feature: "refined-model-rendering",
    promptCode: promptAsset.code,
    promptPublished: promptAsset.published,
    promptVersion: promptAsset.version,
    provider: generation.provider,
    ...(result.metadata || {}),
  };
  const sync = scheduleSync
    ? scheduleSync({
        durationMs,
        finalPrompt: promptAsset.prompt,
        modelLabel: imageModel.label,
        preview,
        referenceImages: archivedReferences,
        resultImage,
        sourcePrompt: "",
        workflow,
      })
    : { generationId: null, status: "skipped" };

  return {
    durationMs,
    images: [resultImage],
    prompt: {
      code: promptAsset.code,
      name: promptAsset.name,
      published: promptAsset.published,
      version: promptAsset.version,
    },
    request: preview,
    sync,
    upstream: {
      created: result.created,
      metadata: result.metadata || null,
      outputFormat: result.outputFormat,
      transport: result.transport || "responses",
    },
  };
}

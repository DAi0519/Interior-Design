/**
 * [INPUT]: 依赖飞书效果图美化 Prompt 源文、天气/时段受控枚举、可选 Flux 负向 Prompt、单张待美化效果图、出图模型矩阵、批次元数据、图像客户端与非阻塞归档
 * [OUTPUT]: 对外提供基础→可选时段→可选天气的正向 Prompt 美化执行、实际参数摘要与独立飞书同步任务
 * [POS]: src 的效果图美化应用服务，与精模及白模 Agent 链路隔离并复用出图基础设施
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import {
  composeEffectEnhancementPrompt,
  getEffectEnhancementPrompt,
} from "./effect-render-enhancement-prompt.mjs";
import { normalizeGenerationBatch } from "./generation-batch.mjs";
import { createGenerationRequest, publicModelCatalog } from "./model-config.mjs";
import { normalizeReferenceImages } from "./reference-image.mjs";

function workflowError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export async function executeEffectRenderEnhancementWorkflow(
  input,
  {
    imageClient,
    loadPrompt = getEffectEnhancementPrompt,
    scheduleSync = null,
  },
) {
  if (!imageClient) {
    throw new TypeError("effect render enhancement workflow requires image client");
  }
  const referenceImages = normalizeReferenceImages(input.referenceImages);
  if (referenceImages.length !== 1) {
    throw workflowError("效果图美化需要且只允许 1 张待美化效果图");
  }

  const promptAsset = await loadPrompt();
  const finalPrompt = composeEffectEnhancementPrompt(promptAsset.prompt, {
    time: input.effectTime,
    weather: input.effectWeather,
  });
  const batch = normalizeGenerationBatch(input);
  const generation = createGenerationRequest(
    { ...input, prompt: finalPrompt },
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
    effectTime: String(input.effectTime || "preserve"),
    effectWeather: String(input.effectWeather || "preserve"),
    feature: "effect-render-enhancement",
    promptCode: promptAsset.code,
    promptPublished: promptAsset.published,
    promptVersion: promptAsset.version,
    provider: generation.provider,
    ...(generation.workflowMetadata || {}),
    ...(result.metadata || {}),
  };
  const sync = scheduleSync
    ? scheduleSync({
        durationMs,
        finalPrompt,
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

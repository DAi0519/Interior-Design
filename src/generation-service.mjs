/**
 * [INPUT]: 依赖模型/批次契约、OneAPI 客户端、效果图美化/精模/白模/空房工作流、带阶段回调的图片超分服务、Flux 可选负向 Prompt，以及调用方注入的双类 ComfyUI 图片客户端、密钥、模型目录、Prompt 缓存与同步调度
 * [OUTPUT]: 对外提供自由生图、效果图美化、精模、白模/空房与纯 ComfyUI 图片超分单项执行及以显式功能为真源的统一路由，并为超分透传可选进度回调
 * [POS]: src 的日常生图应用服务，从 HTTP 入口拆出 Provider 与工作流编排
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { normalizeGenerationBatch } from "./generation-batch.mjs";
import { executeEffectRenderEnhancementWorkflow } from "./effect-render-enhancement-workflow.mjs";
import { executeImageUpscale } from "./image-upscale-service.mjs";
import {
  createGenerationRequest,
  imageProviderForModel,
  publicModelCatalog,
} from "./model-config.mjs";
import { createOneApiClient } from "./oneapi-client.mjs";
import { executeRefinedModelWorkflow } from "./refined-model-workflow.mjs";
import { executeWhiteModelWorkflow } from "./white-model-workflow.mjs";

export function createGenerationService({
  getSessionModelCatalog,
  imageClientForModel,
  imageUpscaleClient,
  promptResultCache,
  requireApiKey,
  scheduleGenerationSync,
}) {
  async function executeFree(input) {
    const generation = createGenerationRequest(input, {
      preferSourceAspect: input.ratioMode === "auto",
    });
    const client = imageClientForModel(input.modelKey);
    const startedAt = Date.now();
    const result = await client.generateImage(generation.request);
    const durationMs = Date.now() - startedAt;
    const preview = {
      ...generation.preview,
      provider: generation.provider,
      quality: result.quality ?? generation.preview.quality,
      transport: result.transport,
    };
    const model = publicModelCatalog().find(
      (entry) => entry.key === String(input.modelKey || ""),
    );
    const referenceImages = (generation.request.images || []).map(
      (image, index) => ({
        fileName: generation.preview.referenceImages[index]?.fileName,
        imageUrl: image.image_url,
        mimeType: generation.preview.referenceImages[index]?.mimeType,
      }),
    );
    const sync = scheduleGenerationSync({
      durationMs,
      finalPrompt: generation.request.prompt,
      modelLabel: model.label,
      preview,
      referenceImages,
      resultImage: result.images[0],
      sourcePrompt: String(input.prompt || "").trim(),
      workflow: {
        ...normalizeGenerationBatch(input),
        feature: "free-image-generation",
        provider: generation.provider,
        ...(generation.workflowMetadata || {}),
        ...(result.metadata || {}),
      },
    });
    return {
      durationMs,
      images: result.images,
      request: preview,
      sync,
      upstream: {
        created: result.created,
        metadata: result.metadata || null,
        outputFormat: result.outputFormat,
        transport: result.transport,
      },
    };
  }

  async function executeRefined(input) {
    const oneApiClient = imageProviderForModel(input.modelKey) === "oneapi"
      ? createOneApiClient(requireApiKey())
      : null;
    return executeRefinedModelWorkflow(input, {
      imageClient: imageClientForModel(input.modelKey, { oneApiClient }),
      scheduleSync: scheduleGenerationSync,
    });
  }

  async function executeEffectEnhancement(input) {
    const oneApiClient = imageProviderForModel(input.modelKey) === "oneapi"
      ? createOneApiClient(requireApiKey())
      : null;
    return executeEffectRenderEnhancementWorkflow(input, {
      imageClient: imageClientForModel(input.modelKey, { oneApiClient }),
      scheduleSync: scheduleGenerationSync,
    });
  }

  async function executeDesign(input) {
    const client = createOneApiClient(requireApiKey());
    const imageClient = imageClientForModel(input.modelKey, {
      oneApiClient: client,
    });
    const availableModels = await getSessionModelCatalog(client);
    return executeWhiteModelWorkflow(input, {
      availableModels,
      client,
      imageClient,
      promptResultCache,
      refreshModels: () => getSessionModelCatalog(client, { force: true }),
      scheduleSync: scheduleGenerationSync,
    });
  }

  function executeForMode(featureMode, input, options = {}) {
    if (["emptyRoom", "whiteModel"].includes(featureMode)) {
      return executeDesign({ ...input, featureMode });
    }
    if (featureMode === "effectEnhancement") {
      return executeEffectEnhancement(input);
    }
    if (featureMode === "imageUpscale") {
      return executeImageUpscale(input, {
        imageClient: imageUpscaleClient,
        onProgress: options.onProgress,
      });
    }
    if (featureMode === "refinedModel") return executeRefined(input);
    if (featureMode === "free") return executeFree(input);
    throw new TypeError("不支持的生成功能");
  }

  return {
    executeDesign,
    executeEffectEnhancement,
    executeForMode,
    executeFree,
    executeImageUpscale: (input) => executeImageUpscale(input, {
      imageClient: imageUpscaleClient,
    }),
    executeRefined,
  };
}

/**
 * [INPUT]: 依赖GPT打光及独立飞书Prompt准备服务、独立质感增强Prompt读取与共享工作流、模型/批次契约、OneAPI客户端和注入目录/同步调度
 * [OUTPUT]: 对外提供打光服务器Prompt快照准备和执行透传、按显式功能冻结输入的统一生成路由及执行前权限/Schema门禁
 * [POS]: src 的日常生图应用服务，从 HTTP 入口拆出 Provider 与工作流编排
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { normalizeGenerationBatch } from "./generation-batch.mjs";
import { executeEffectRenderEnhancementWorkflow } from "./effect-render-enhancement-workflow.mjs";
import { executeImageMultiAngle, resolveMultiAngleModel } from "./image-multi-angle-service.mjs";
import { executeImageUpscale } from "./image-upscale-service.mjs";
import { executeImageMaskFill, readImageMaskFillConfig } from "./image-mask-fill-service.mjs";
import { executeImageRelight, readImageRelightConfig, prepareImageRelightPrompt } from "./image-relight-service.mjs";
import { RELIGHT_MODEL_KEY } from "../public/image-relight-geometry.js";
import { maskFillModel } from "../public/image-mask-fill-geometry.js";
import { imageUpscaleWorkflow } from "./image-upscale-workflow.mjs";
import { normalizeReferenceImages } from "./reference-image.mjs";
import { executeImageOutpaint, imageOutpaintEngineKey } from "./image-outpaint-service.mjs";
import { QWEN_OUTPAINT_ENGINE_KEY } from "./image-outpaint-qwen.mjs";
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
  imageMaskFillClient = null,
  qwenMaskFillClient = null,
  verifyMaskFillSyncContract,
  verifyRelightSyncContract,
  getRelightPrompt,
  getTextureEnhancementPrompt,
  readRelightPromptConfig,
  imageMultiAngleClient = null,
  imageOutpaintClient = null,
  qwenImageClient = null,
  promptResultCache,
  requireApiKey,
  scheduleGenerationSync,
  archiveImageUpscale = false,
}) {
  async function executeFree(input) {
    const generation = createGenerationRequest({ ...input, featureMode: "free" }, {
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
      ...(getTextureEnhancementPrompt ? { loadTexturePrompt: getTextureEnhancementPrompt } : {}),
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

  // -------- Beta 使用独立归档投影；日常超分沿用本机结果 --------
  async function executeUpscale(input, options = {}) {
    const result = await executeImageUpscale(input, { imageClient: imageUpscaleClient, onProgress: options.onProgress });
    if (!archiveImageUpscale) return result;
    const workflow = imageUpscaleWorkflow(input.upscaleWorkflowKey);
    const referenceImages = normalizeReferenceImages(input.referenceImages, { maxCount: 1 });
    const request = { ...result.request, transport: result.upstream.transport, syncMode: "beta-only" };
    const sync = scheduleGenerationSync({ durationMs: result.durationMs, finalPrompt: "", sourcePrompt: "",
      modelLabel: workflow.label, preview: request, referenceImages, resultImage: result.images[0],
      workflow: { ...(result.upstream.metadata || {}), feature: "image-upscale" } });
    return { ...result, request, sync };
  }

  function executeForMode(featureMode, requestInput, options = {}) {
    const input = { ...requestInput, featureMode };
    if (featureMode === "imageRelight") {
      const imageClient = imageClientForModel(RELIGHT_MODEL_KEY);
      return executeImageRelight(input, { imageClient, onProgress: options.onProgress,
        getPrompt: getRelightPrompt, relightPromptSnapshot: options.relightPromptSnapshot,
        getOneApiModels: () => getSessionModelCatalog(imageClient, { force: true }),
        scheduleSync: scheduleGenerationSync, verifySyncContract: verifyRelightSyncContract });
    }
    if (featureMode === "imageMaskFill") {
      const model = maskFillModel(input.maskFillModel);
      const imageClient = model.key === "qwenImageEdit2511" ? qwenMaskFillClient
        : model.provider === "comfyui" ? imageMaskFillClient : imageClientForModel(model.key);
      return executeImageMaskFill(input, { imageClient, onProgress: options.onProgress,
        getOneApiModels: () => getSessionModelCatalog(imageClient, { force: true }),
        scheduleSync: scheduleGenerationSync, verifySyncContract: verifyMaskFillSyncContract });
    }
    if (featureMode === "imageMultiAngle") {
      const model = resolveMultiAngleModel(input.multiAngleModel);
      const imageClient = model.provider === "comfyui" ? imageMultiAngleClient : imageClientForModel(model.key);
      return executeImageMultiAngle(input, { imageClient, onProgress: options.onProgress, scheduleSync: scheduleGenerationSync,
        getOneApiModels: () => getSessionModelCatalog(imageClient, { force: true }) });
    }
    if (featureMode === "imageOutpaint") {
      const engine = imageOutpaintEngineKey(input);
      const imageClient = engine === "comfyui" ? imageOutpaintClient
        : engine === QWEN_OUTPAINT_ENGINE_KEY ? qwenImageClient : imageClientForModel(engine);
      return executeImageOutpaint(input, {
        imageClient, onProgress: options.onProgress, scheduleSync: scheduleGenerationSync,
      });
    }
    if (["emptyRoom", "whiteModel", "styleTransfer"].includes(featureMode)) {
      return executeDesign(input);
    }
    if (["effectEnhancement", "effectBeautification", "panoramaEnhancement", "textureEnhancement"].includes(featureMode)) {
      return executeEffectEnhancement(input);
    }
    if (featureMode === "imageUpscale") {
      return executeUpscale(input, options);
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
    executeImageUpscale: executeUpscale,
    getImageMaskFillConfig: () => readImageMaskFillConfig(imageMaskFillClient, { qwenMaskFillClient, getOneApiModels: () => getSessionModelCatalog(createOneApiClient(requireApiKey()), { force: true }) }),
    getImageRelightConfig: (options = {}) => readImageRelightConfig({ ...options, getOneApiModels: () => getSessionModelCatalog(createOneApiClient(requireApiKey()), { force: true }), readPromptConfig: readRelightPromptConfig }),
    prepareImageRelightPrompt: input => prepareImageRelightPrompt(input, { getPrompt: getRelightPrompt }),
    executeRefined,
  };
}

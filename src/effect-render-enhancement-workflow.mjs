/**
 * [INPUT]: 依赖含质感增强的四张独立飞书Prompt表、全景纯词光影编译器、美化六预设/LoRA、真实单图、模型矩阵与客户端及归档
 * [OUTPUT]: 对外提供单轮氛围/美化/全景/质感增强服务、全景2:1及光影目标隔离、实际正文/卡片版本SHA归档与脱敏摘要
 * [POS]: src 的效果图与全景图应用服务，各自隔离 Prompt 真源并复用普通出图基础设施，不经过 Prompt Agent
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createHash } from "node:crypto";
import {
  composeEffectEnhancementPrompt,
  composePanoramaEnhancementPrompt,
  getEffectEnhancementPrompt,
  getPanoramaEnhancementPrompt,
} from "./effect-render-enhancement-prompt.mjs";
import { normalizeGenerationBatch } from "./generation-batch.mjs";
import {
  composeEffectBeautificationPrompt,
  getEffectBeautificationPrompt,
  normalizeEffectBeautification,
} from "./effect-beautification-prompt.mjs";
import { createGenerationRequest, publicModelCatalog } from "./model-config.mjs";
import { normalizeReferenceImages } from "./reference-image.mjs";
import { getTextureEnhancementPrompt } from "./texture-enhancement-prompt.mjs";
import { PANORAMA_LIGHTING_IDENTITY, resolvePanoramaLightingInput } from "./panorama-lighting.mjs";
import {
  EFFECT_BEAUTIFICATION_REQUIRED_NODES,
  composeFluxBeautificationPrompt,
  effectBeautificationMetadata,
  verifyEffectBeautificationCapabilities,
} from "./effect-beautification-workflow.mjs";

function workflowError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export async function executeEffectRenderEnhancementWorkflow(
  input,
  {
    imageClient,
    loadEffectPrompt = getEffectEnhancementPrompt,
    loadBeautificationPrompt = getEffectBeautificationPrompt,
    loadPanoramaPrompt = getPanoramaEnhancementPrompt,
    loadTexturePrompt = getTextureEnhancementPrompt,
    loadPanoramaLightingAssets,
    onProgress,
    signal,
    scheduleSync = null,
  },
) {
  if (!imageClient) {
    throw new TypeError("effect render enhancement workflow requires image client");
  }
  const panorama = input.featureMode === "panoramaEnhancement";
  const beautification = input.featureMode === "effectBeautification";
  const texture = input.featureMode === "textureEnhancement";
  const featureLabel = texture ? "质感增强" : panorama ? "全景图美化" : beautification ? "效果图美化" : "效果图氛围转换";
  const selection = beautification ? normalizeEffectBeautification(input.effectBeautification) : null;
  const referenceImages = normalizeReferenceImages(input.referenceImages);
  if (referenceImages.length !== 1) {
    throw workflowError(`${featureLabel}需要且只允许 1 张${panorama ? "待美化全景图" : "待处理效果图"}`);
  }
  if (panorama && referenceImages[0].width !== referenceImages[0].height * 2) {
    throw workflowError("全景图美化需要真实尺寸为 2:1 的全景图");
  }
  const panoramaLighting = panorama ? await resolvePanoramaLightingInput(input,
    loadPanoramaLightingAssets ? { loadAssets: loadPanoramaLightingAssets } : {}) : null;

  const promptAsset = await (panoramaLighting?.prompt ? PANORAMA_LIGHTING_IDENTITY : texture
    ? loadTexturePrompt({ version: input.textureEnhancementPromptVersion }) : beautification
    ? loadBeautificationPrompt({ version: input.effectBeautificationPromptVersion })
    : panorama ? loadPanoramaPrompt({ version: input.panoramaPromptVersion }) : loadEffectPrompt());
  let finalPrompt = panoramaLighting?.prompt || (texture ? promptAsset.prompt : panorama
    ? composePanoramaEnhancementPrompt(promptAsset.prompt)
    : beautification ? composeEffectBeautificationPrompt(promptAsset.prompt, selection)
      : composeEffectEnhancementPrompt(promptAsset.prompt, {
        time: input.effectTime,
        weather: input.effectWeather,
      }));
  if (panoramaLighting) panoramaLighting.metadata.promptSha256 = createHash("sha256").update(finalPrompt).digest("hex");
  const batch = normalizeGenerationBatch(input);
  const generation = createGenerationRequest(
    { ...input, prompt: finalPrompt, ...(texture ? { negativePrompt: "" } : {}) },
    {
      preferSourceAspect: input.ratioMode !== "manual",
      sourceDimensions: {
        height: referenceImages[0].height,
        width: referenceImages[0].width,
      },
    },
  );
  if (texture && generation.provider === "comfyui") {
    generation.request.negative_prompt = "";
    generation.request.negative_prompt_mode = "disabled-fixed-prompt";
    generation.preview.negativePromptMode = "disabled-fixed-prompt";
    generation.workflowMetadata = { ...generation.workflowMetadata,
      negativePrompt: "", negativePromptMode: "disabled-fixed-prompt" };
  }
  if (beautification && generation.provider === "comfyui") {
    finalPrompt = composeFluxBeautificationPrompt(finalPrompt);
    generation.request.prompt = finalPrompt;
    generation.request.effect_beautification = selection;
    generation.request.effect_beautification_source = {
      width: referenceImages[0].width,
      height: referenceImages[0].height,
    };
    // -- 源图默认负向为空，自定义仍整段覆盖 ---------------------------
    if (generation.request.negative_prompt_mode === "default") {
      generation.request.negative_prompt = "";
      generation.workflowMetadata.negativePrompt = "";
    }
    const metadata = effectBeautificationMetadata(generation.request);
    generation.preview.inferenceSize = metadata.inferenceSize;
    generation.preview.inferenceResolution = metadata.inferenceResolution;
    generation.workflowMetadata = { ...generation.workflowMetadata, ...metadata };
    if (imageClient.getObjectInfo) {
      const objectInfo = await imageClient.getObjectInfo(EFFECT_BEAUTIFICATION_REQUIRED_NODES);
      verifyEffectBeautificationCapabilities(objectInfo, selection);
    }
  }
  const startedAt = Date.now();
  const generationOptions = onProgress || signal ? { ...(onProgress ? { onProgress } : {}), ...(signal ? { signal } : {}) } : undefined;
  const result = await imageClient.generateImage(generation.request, generationOptions);
  const resultImage = result.images?.[0];
  if (!resultImage?.url) {
    throw workflowError("出图模型没有返回图片", 502);
  }
  const durationMs = Date.now() - startedAt;

  const preview = {
    ...generation.preview,
    provider: generation.provider,
    quality: result.quality ?? generation.preview.quality,
    transport: result.transport || "responses",
    ...(selection ? { effectBeautification: selection } : {}),
    ...(panoramaLighting ? { panoramaLighting: panoramaLighting.metadata } : {}),
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
    ...(texture || panoramaLighting?.prompt ? {} : selection ? { effectBeautification: selection } : {
      effectTime: panorama ? "preserve" : String(input.effectTime || "preserve"),
      effectWeather: panorama ? "preserve" : String(input.effectWeather || "preserve"),
    }),
    feature: texture ? "texture-render-enhancement" : panorama
      ? "panorama-render-enhancement"
      : beautification ? "effect-render-beautification" : "effect-render-enhancement",
    promptCode: promptAsset.code,
    promptPublished: promptAsset.published,
    promptVersion: promptAsset.version,
    ...(texture ? { promptSha256: createHash("sha256").update(finalPrompt).digest("hex") } : {}),
    provider: generation.provider,
    ...(generation.workflowMetadata || {}),
    ...(result.metadata || {}),
    ...(panoramaLighting ? { panoramaLighting: panoramaLighting.metadata } : {}),
  };
  const sync = scheduleSync
    ? scheduleSync({
        durationMs,
        finalPrompt,
        modelLabel: imageModel.label,
        preview,
        referenceImages: archivedReferences,
        resultImage,
        sourcePrompt: panorama ? String(input.prompt || "").trim() : "",
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
      ...(texture ? { sha256: createHash("sha256").update(finalPrompt).digest("hex") } : {}),
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

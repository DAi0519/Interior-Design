/**
 * [INPUT]: 依赖三张独立飞书 Prompt 表、美化六预设工作流/LoRA触发词及节点准入、天气/时段或强度/色调、单图、模型矩阵、批次与图像客户端及非阻塞归档
 * [OUTPUT]: 对外提供单轮氛围/美化/全景服务，Flux美化专属图与实际触发词/空默认负向归档、OneAPI原样正文，以及脱敏预设/推理尺寸摘要
 * [POS]: src 的效果图与全景图应用服务，各自隔离 Prompt 真源并复用普通出图基础设施，不经过 Prompt Agent
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

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
    scheduleSync = null,
  },
) {
  if (!imageClient) {
    throw new TypeError("effect render enhancement workflow requires image client");
  }
  const panorama = input.featureMode === "panoramaEnhancement";
  const beautification = input.featureMode === "effectBeautification";
  const featureLabel = panorama ? "全景图美化" : beautification ? "效果图美化" : "效果图氛围转换";
  const selection = beautification ? normalizeEffectBeautification(input.effectBeautification) : null;
  const referenceImages = normalizeReferenceImages(input.referenceImages);
  if (referenceImages.length !== 1) {
    throw workflowError(`${featureLabel}需要且只允许 1 张${panorama ? "待美化全景图" : "待处理效果图"}`);
  }

  const promptAsset = await (beautification
    ? loadBeautificationPrompt({ version: input.effectBeautificationPromptVersion })
    : panorama ? loadPanoramaPrompt({ version: input.panoramaPromptVersion }) : loadEffectPrompt());
  let finalPrompt = panorama
    ? composePanoramaEnhancementPrompt(promptAsset.prompt)
    : beautification ? composeEffectBeautificationPrompt(promptAsset.prompt, selection)
      : composeEffectEnhancementPrompt(promptAsset.prompt, {
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
  const result = await imageClient.generateImage(generation.request);
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
    ...(selection ? { effectBeautification: selection } : {
      effectTime: panorama ? "preserve" : String(input.effectTime || "preserve"),
      effectWeather: panorama ? "preserve" : String(input.effectWeather || "preserve"),
    }),
    feature: panorama
      ? "panorama-render-enhancement"
      : beautification ? "effect-render-beautification" : "effect-render-enhancement",
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

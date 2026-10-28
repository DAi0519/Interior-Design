/**
 * [INPUT]: 依赖纯词预设基础/氛围、双图统一专用规则、卡片/上传原件SHA及图像客户端
 * [OUTPUT]: 对外提供纯词基础+氛围/双图仅专用规则编译、实际Prompt来源与图序原件归档、历史兼容及脱敏响应
 * [POS]: src 的精模渲染应用服务，与白模 Style DNA/Prompt Agent 链路隔离并复用出图基础设施
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { normalizeGenerationBatch } from "./generation-batch.mjs";
import { createGenerationRequest, publicModelCatalog } from "./model-config.mjs";
import {
  getRefinedModelPrompt,
} from "./refined-model-prompt.mjs";
import { getEffectEnhancementPrompt } from "./effect-render-enhancement-prompt.mjs";
import {
  composeRefinedRenderAppearance,
  refinedAtmosphereIdentity,
  refinedRenderPromptIdentity,
  resolveRefinedRenderInput,
} from "./refined-render-prompt.mjs";
import { normalizeReferenceImages } from "./reference-image.mjs";
import { composeRefinedLightingPrompt, refinedLightingImageSummary, resolveRefinedLightingInput } from "./refined-lighting.mjs";

const MAX_USER_PROMPT_LENGTH = 8000;

function workflowError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export function composeRefinedModelPrompt(presetPrompt, userPrompt = "") {
  const preset = String(presetPrompt || "").trim();
  const custom = String(userPrompt || "").trim();
  if (custom.length > MAX_USER_PROMPT_LENGTH) {
    throw workflowError(`精模自定义要求不能超过 ${MAX_USER_PROMPT_LENGTH} 个字符`);
  }
  if (!custom) return preset;
  return `${custom}\n\n${preset}`;
}

export async function executeRefinedModelWorkflow(
  input,
  {
    imageClient,
    loadPrompt = getRefinedModelPrompt,
    loadAtmospherePrompt = getEffectEnhancementPrompt,
    loadLightingAssets,
    loadLightingReference,
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
  const lighting = await resolveRefinedLightingInput(input, {
    ...(loadLightingAssets ? { loadAssets: loadLightingAssets } : {}),
    ...(loadLightingReference ? { loadReference: loadLightingReference } : {}),
  });

  const { selection, promptAsset, promptIdentity, promptDefinition, atmosphereAsset } = await resolveRefinedRenderInput(
    input, { loadPrompt, loadAtmospherePrompt, lightingAssets: lighting },
  );
  const sourcePrompt = String(input.prompt || "").trim();
  if (sourcePrompt.length > MAX_USER_PROMPT_LENGTH) throw workflowError(`精模自定义要求不能超过 ${MAX_USER_PROMPT_LENGTH} 个字符`);
  let finalPrompt;
  if (lighting) {
    finalPrompt = composeRefinedLightingPrompt(promptDefinition.main, lighting, sourcePrompt);
  } else {
    finalPrompt = composeRefinedRenderAppearance(composeRefinedModelPrompt(promptDefinition.main, sourcePrompt),
      selection, atmosphereAsset, promptDefinition);
  }
  const renderPrompt = refinedRenderPromptIdentity(promptDefinition, selection, promptIdentity);
  const batch = normalizeGenerationBatch(input);
  const generation = createGenerationRequest(
    { ...input, prompt: finalPrompt, ...(lighting ? { referenceImages: [input.referenceImages[0], ...lighting.referenceImages] } : {}) },
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
  const archivedReferences = generation.request.images.slice(0, 1).map((image, index) => ({
    fileName: generation.preview.referenceImages[index]?.fileName,
    imageUrl: image.image_url,
    mimeType: generation.preview.referenceImages[index]?.mimeType,
  }));
  const lightingReferences = lighting?.referenceImages.map(image => ({ fileName: image.name,
    imageUrl: image.dataUrl, mimeType: image.type })) || [];
  const lightingMetadata = lighting ? { ...lighting.metadata, source: refinedLightingImageSummary(input.referenceImages[0]) } : null;
  const workflow = {
    ...batch,
    feature: "refined-model-rendering",
    customPromptUsed: Boolean(sourcePrompt),
    provider: generation.provider,
    ...(generation.workflowMetadata || {}),
    ...(result.metadata || {}),
    promptCode: promptAsset.code,
    promptPublished: promptAsset.published,
    promptVersion: promptAsset.version,
    promptSha256: promptIdentity.sha256,
    promptSource: promptIdentity.source,
    refinedRender: selection,
    ...(renderPrompt ? { renderPrompt } : {}),
    ...(atmosphereAsset ? { atmospherePrompt: refinedAtmosphereIdentity(atmosphereAsset) } : {}),
    ...(lightingMetadata ? { refinedLighting: lightingMetadata } : {}),
  };
  const sync = scheduleSync
    ? scheduleSync({
        durationMs,
        finalPrompt,
        modelLabel: imageModel.label,
        preview,
        referenceImages: archivedReferences,
        ...(lighting ? { styleReferenceImages: lightingReferences } : {}),
        resultImage,
        sourcePrompt,
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
    refinedRender: selection,
    ...(lightingMetadata ? { refinedLighting: lightingMetadata } : {}),
    ...(renderPrompt ? { renderPrompt } : {}),
    ...(atmosphereAsset ? { atmospherePrompt: refinedAtmosphereIdentity(atmosphereAsset) } : {}),
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

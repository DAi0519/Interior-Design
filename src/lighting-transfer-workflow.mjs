/**
 * [INPUT]: 依赖独立效果图迁移Prompt、光影库卡片原件/版本SHA、双图模型真源、生成批次与归档调度
 * [OUTPUT]: 对外提供卡片参考迁移准入/冻结、效果图专用双图生成、原件图序及Prompt和卡片身份归档
 * [POS]: src 的光影转换应用服务，复用光影库与精模双图基础设施但不读取精模基础或精模迁移正文
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createHash } from "node:crypto";
import { normalizeGenerationBatch } from "./generation-batch.mjs";
import { createGenerationRequest, publicModelCatalog } from "./model-config.mjs";
import { normalizeReferenceImages } from "./reference-image.mjs";
import { assertRefinedLightingAdmission, resolveRefinedLightingInput, refinedLightingImageSummary } from "./refined-lighting.mjs";
import { loadRefinedLightingAssets, loadRefinedLightingReference } from "./refined-lighting-library.mjs";
import { getLightingTransferPrompt, LIGHTING_TRANSFER_PROMPT_CODE, LIGHTING_TRANSFER_PROMPT_CONFIG } from "./lighting-transfer-prompt.mjs";

const digest = value => createHash("sha256").update(value).digest("hex");
const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode, retryable: false });

export function validateLightingTransferInput(input) {
  const selection = input.refinedLighting;
  if (!selection || selection.mode !== "preset" || selection.execution !== "prompt-and-reference") {
    throw fail("光影转换请选择光影库模板，使用参考图迁移");
  }
  if (input.lightingReferenceImages != null && (!Array.isArray(input.lightingReferenceImages)
    || input.lightingReferenceImages.length)) throw fail("光影转换的参考图由光影库读取，请仅上传待转换效果图");
  const source = normalizeReferenceImages(input.referenceImages);
  if (source.length !== 1) throw fail("光影转换需要且只允许1张已有效果图");
  if (input.prompt != null && typeof input.prompt !== "string") throw fail("光影转换补充要求必须为文字");
  const custom = String(input.prompt || "").trim();
  if (custom.length > 8000) throw fail("光影转换补充要求不能超过8000个字符");
  if (input.promptCode !== undefined && input.promptCode !== LIGHTING_TRANSFER_PROMPT_CODE) {
    throw fail("光影转换必须使用独立效果图迁移Prompt，请刷新配置后重试", 409);
  }
  assertRefinedLightingAdmission(input);
  return { custom, source: source[0] };
}

export async function resolveLightingTransferInput(input = {}, {
  loadPrompt = getLightingTransferPrompt,
  loadLightingAssets = loadRefinedLightingAssets,
  loadLightingReference = loadRefinedLightingReference,
} = {}) {
  const { custom, source } = validateLightingTransferInput(input);
  const lighting = await resolveRefinedLightingInput({ ...input, featureMode: "lightingTransfer" }, {
    loadAssets: async options => {
      const asset = await loadPrompt({ version: input.refinedLighting.ruleVersion, forceRefresh: true });
      if (asset?.code !== LIGHTING_TRANSFER_PROMPT_CODE || asset.published !== true
        || !Number.isSafeInteger(asset.version) || asset.version < 1
        || typeof asset.prompt !== "string" || !asset.prompt.trim()) {
        throw fail("光影转换独立Prompt尚未完整上架", 409);
      }
      if (input.promptVersion !== undefined && Number(input.promptVersion) !== asset.version) {
        throw fail("光影转换Prompt版本已更新，请刷新配置后重试", 409);
      }
      return { ...await loadLightingAssets(options), referenceRule: { ...asset, sha256: digest(asset.prompt) } };
    },
    loadReference: loadLightingReference,
    referenceRuleCode: LIGHTING_TRANSFER_PROMPT_CODE,
  });
  const rule = lighting.rule;
  const finalPrompt = [rule.prompt, custom ? `[USER LIGHTING REFINEMENTS]\n${custom}` : ""].filter(Boolean).join("\n\n");
  return { ...lighting, source, custom, finalPrompt, promptAsset: rule, metadata: {
    ...lighting.metadata, source: refinedLightingImageSummary(input.referenceImages[0]),
    prompt: { code: rule.code, version: rule.version, sha256: rule.sha256,
      source: `feishu:${LIGHTING_TRANSFER_PROMPT_CONFIG.tableId}:${rule.code}@v${rule.version}` },
    promptSha256: digest(finalPrompt),
  } };
}

export async function prepareLightingTransferInput(input = {}, dependencies = {}) {
  const assets = await resolveLightingTransferInput(input, dependencies);
  return { ...input, refinedLighting: assets.selection, lightingReferenceImages: [],
    promptCode: assets.promptAsset.code, promptVersion: assets.promptAsset.version };
}

export async function executeLightingTransferWorkflow(input, {
  imageClient, loadPrompt, loadLightingAssets, loadLightingReference, scheduleSync = null,
} = {}) {
  if (!imageClient) throw new TypeError("lighting transfer requires image client");
  const lighting = await resolveLightingTransferInput(input, {
    ...(loadPrompt ? { loadPrompt } : {}), ...(loadLightingAssets ? { loadLightingAssets } : {}),
    ...(loadLightingReference ? { loadLightingReference } : {}),
  });
  const generation = createGenerationRequest({ ...input, featureMode: "lightingTransfer", prompt: lighting.finalPrompt,
    referenceImages: [input.referenceImages[0], ...lighting.referenceImages] }, {
    preferSourceAspect: input.ratioMode !== "manual", sourceDimensions: lighting.source,
  });
  const startedAt = Date.now();
  const result = await imageClient.generateImage(generation.request);
  const durationMs = Date.now() - startedAt;
  const resultImage = result.images?.[0];
  if (!resultImage?.url) throw fail("出图模型没有返回图片", 502);
  const preview = { ...generation.preview, provider: generation.provider,
    quality: result.quality ?? generation.preview.quality, transport: result.transport || "responses" };
  const model = publicModelCatalog().find(entry => entry.key === String(input.modelKey || ""));
  const workflow = { ...normalizeGenerationBatch(input), feature: "lighting-transfer", provider: generation.provider,
    ...(generation.workflowMetadata || {}), ...(result.metadata || {}),
    promptCode: lighting.promptAsset.code, promptVersion: lighting.promptAsset.version,
    promptSha256: lighting.promptAsset.sha256, promptPublished: true,
    promptSource: lighting.metadata.prompt.source, customPromptUsed: Boolean(lighting.custom),
    lightingTransfer: lighting.metadata };
  const sync = scheduleSync ? scheduleSync({ durationMs, finalPrompt: lighting.finalPrompt,
    sourcePrompt: lighting.custom, modelLabel: model.label, preview,
    referenceImages: [{ fileName: lighting.source.fileName, imageUrl: lighting.source.imageUrl,
      mimeType: lighting.source.mimeType }],
    styleReferenceImages: lighting.referenceImages.map(image => ({ fileName: image.name,
      imageUrl: image.dataUrl, mimeType: image.type })), resultImage, workflow,
  }) : { generationId: null, status: "skipped" };
  return { durationMs, images: [resultImage], request: preview, sync,
    prompt: { code: lighting.promptAsset.code, name: lighting.promptAsset.name,
      published: true, version: lighting.promptAsset.version },
    refinedLighting: lighting.metadata, lightingTransfer: lighting.metadata,
    upstream: { created: result.created, metadata: result.metadata || null,
      outputFormat: result.outputFormat, transport: result.transport || "responses" } };
}

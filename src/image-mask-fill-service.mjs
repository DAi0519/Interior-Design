/**
 * [INPUT]: 依赖 sharp、共享模型/尺寸/参考用途规则、Flux/Qwen执行图、Sunburst编辑适配器、归档、权限目录与同步调度
 * [OUTPUT]: 三模型两模式配置与准入、仅GPT参考模式的换物品/换材质用途与默认兼容及指令可选、GPT矩形/自由圈选与实际送模蓝线原图独立归档、内部附件剥离与原生交付；付费前复核权限/Schema
 * [POS]: src 的遮罩填充应用服务，复用后台任务与飞书同步，禁止自动缩放遮罩掩盖错位
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createHash } from "node:crypto";
import sharp from "sharp";
import { normalizeReferenceImage, normalizeReferenceImages } from "./reference-image.mjs";
import { buildImageMaskFillArchive } from "./image-mask-fill-archive.mjs";
import { verifyLarkSyncSchema } from "./lark-sync.mjs";
import { MASK_FILL_INFERENCE_TIERS, MASK_FILL_MAX_OUTPUT_EDGE, maskFillInferenceTier,
  maskFillInferenceSize, maskFillOutputSize, MASK_FILL_MODELS, maskFillModel, QWEN_MASK_FILL_INFERENCE_TIERS,
  MASK_FILL_GPT_RESOLUTIONS, maskFillGptResolution, maskFillPromptOptional, normalizeMaskFillEditRegion,
  MASK_FILL_REFERENCE_PURPOSES, maskFillReferencePurpose } from "../public/image-mask-fill-geometry.js";
import { createQwenMaskFillWorkflow, verifyQwenMaskFillCapabilities, QWEN_MASK_FILL_WORKFLOW } from "./image-mask-fill-qwen.mjs";
import { executeSunburstMaskFill, MASK_FILL_ONEAPI_MODEL, MASK_FILL_ONEAPI_LIMITS, sunburstMaskOutputSize, sunburstMaskQuality } from "./image-mask-fill-oneapi.mjs";
import {
  IMAGE_MASK_FILL_MODES, IMAGE_MASK_FILL_VERSION, createImageMaskFillWorkflow,
  resolveImageMaskFillMode, verifyImageMaskFillCapabilities,
} from "./image-mask-fill-workflow.mjs";

export const IMAGE_MASK_FILL_IMAGE_POLICY = Object.freeze({
  accept: ["image/png", "image/jpeg", "image/webp"], maskAccept: ["image/png"],
  maxBytesPerImage: 6 * 1024 * 1024, maxEdge: 4096, maxPixels: 16 * 1024 * 1024,
});
const error400 = (message) => Object.assign(new Error(message), { statusCode: 400 });
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

function nodeTypes(mode, qwen = false) {
  const graph = (qwen ? createQwenMaskFillWorkflow : createImageMaskFillWorkflow)({ artifactKey: "capability-check", imageBase64: "", seed: 1, generationRequest: { maskFillMode: mode } });
  return [...new Set(Object.values(graph).map((node) => node.class_type))];
}

export async function readImageMaskFillConfig(imageClient, { getOneApiModels, qwenMaskFillClient } = {}) {
  const modes = await Promise.all(IMAGE_MASK_FILL_MODES.map(async ({ key, label, defaultMaskExpand }) => {
    try {
      if (!imageClient?.getObjectInfo) throw new Error("遮罩填充客户端尚未配置");
      verifyImageMaskFillCapabilities(await imageClient.getObjectInfo(nodeTypes(key)), key);
      return { key, label, defaultMaskExpand, available: true, reason: null };
    } catch (error) {
      return { key, label, defaultMaskExpand, available: false, reason: `遮罩填充暂不可用：${String(error.message).slice(0, 250)}` };
    }
  }));
  const models = [{ ...MASK_FILL_MODELS[0], available: modes.some(mode => mode.available), modes }];
  let reason = "请连接有Sunburst权限的OneAPI Key";
  let permitted = false;
  try {
    if (getOneApiModels) {
      const catalog = await getOneApiModels();
      permitted = catalog.some(entry => entry.id === MASK_FILL_ONEAPI_MODEL.id);
      reason = permitted ? null : "当前OneAPI Key没有Sunburst权限";
    }
  } catch (error) { reason = `Sunburst不可用：${String(error.message).slice(0, 180)}`; }
  models.push({ ...MASK_FILL_MODELS[1], available: permitted, reason, maskRequired: false, supportsBoxSelection: true, supportsLassoSelection: true, quality: MASK_FILL_ONEAPI_MODEL.defaultQuality,
    qualityOptions: MASK_FILL_ONEAPI_MODEL.qualityOptions, defaultQuality: MASK_FILL_ONEAPI_MODEL.defaultQuality,
    referencePurposes: MASK_FILL_REFERENCE_PURPOSES, defaultReferencePurpose: "object",
    outputResolutions: MASK_FILL_GPT_RESOLUTIONS, defaultOutputResolution: "1K", sizes: MASK_FILL_ONEAPI_MODEL.sizes,
    modes: modes.map(({ key, defaultMaskExpand }) => ({ key, defaultMaskExpand, maskRequired: false, label: `${MASK_FILL_ONEAPI_MODEL.label} · ${key === "prompt" ? "提示词填充" : "参考图填充"}`, available: permitted, reason })),
    outputLimits: MASK_FILL_ONEAPI_LIMITS });
  const qwenModes = await Promise.all(IMAGE_MASK_FILL_MODES.map(async ({ key, label, defaultMaskExpand }) => {
    try {
      if (!qwenMaskFillClient?.getObjectInfo) throw new Error("Qwen遮罩填充客户端尚未配置");
      verifyQwenMaskFillCapabilities(await qwenMaskFillClient.getObjectInfo(nodeTypes(key, true)), key);
      return { key, label: `${QWEN_MASK_FILL_WORKFLOW.label} · ${label}`, defaultMaskExpand, available: true, reason: null };
    } catch (error) { return { key, label, defaultMaskExpand, available: false, reason: `Qwen不可用：${String(error.message).slice(0, 250)}` }; }
  }));
  models.push({ ...maskFillModel("qwenImageEdit2511"), available: qwenModes.some(mode => mode.available), modes: qwenModes,
    reason: qwenModes[0].reason, inferenceTiers: QWEN_MASK_FILL_INFERENCE_TIERS, defaultInferenceTier: "1mp",
    workflow: { key: QWEN_MASK_FILL_WORKFLOW.key, version: QWEN_MASK_FILL_WORKFLOW.version }, steps: 4 });
  const available = models.some(model => model.available);
  return { available, reason: available ? null : modes[0].reason, modes, models, defaultModel: "flux2Klein", defaultMode: "prompt",
    inferenceTiers: MASK_FILL_INFERENCE_TIERS, defaultInferenceTier: "2k", maxOutputEdge: MASK_FILL_MAX_OUTPUT_EDGE, maxMaskExpand: 256,
    imagePolicy: IMAGE_MASK_FILL_IMAGE_POLICY, syncMode: "lark", maxCount: 1, version: IMAGE_MASK_FILL_VERSION };
}

// -------- 声明尺寸不参与判断；真实解码后才接受主图、遮罩与参考图 --------
async function decodeInput(input, label, mask = false) {
  const image = normalizeReferenceImage(input, { maxBytesPerImage: IMAGE_MASK_FILL_IMAGE_POLICY.maxBytesPerImage,
    ...(mask ? { accept: ["image/png"] } : {}) });
  if (!image) throw error400(`请上传${label}`);
  const bytes = Buffer.from(image.imageUrl.split(",")[1], "base64");
  try {
    const metadata = await sharp(bytes, { failOn: "error", limitInputPixels: IMAGE_MASK_FILL_IMAGE_POLICY.maxPixels }).metadata();
    const mime = ({ png: "image/png", jpeg: "image/jpeg", webp: "image/webp" })[metadata.format];
    if (!mime || mime !== image.mimeType || (mask && metadata.format !== "png")) throw error400(`${label}格式与真实图片字节不一致`);
    if (!metadata.width || !metadata.height || metadata.width > IMAGE_MASK_FILL_IMAGE_POLICY.maxEdge || metadata.height > IMAGE_MASK_FILL_IMAGE_POLICY.maxEdge
      || metadata.width * metadata.height > IMAGE_MASK_FILL_IMAGE_POLICY.maxPixels || (metadata.pages || 1) !== 1) throw error400(`${label}需为单帧图片，单边不超过4096px、总像素不超过16MP`);
    if (mask && metadata.orientation && metadata.orientation !== 1) throw error400("遮罩不能携带旋转方向，请重新绘制 PNG 遮罩");
    const oriented = !mask && Boolean(metadata.orientation && metadata.orientation !== 1);
    const decoded = await sharp(bytes, { failOn: "error", limitInputPixels: IMAGE_MASK_FILL_IMAGE_POLICY.maxPixels })
      .autoOrient().toBuffer({ resolveWithObject: true });
    const actualBytes = oriented ? decoded.data : bytes;
    return { ...image, imageUrl: `data:${mime};base64,${actualBytes.toString("base64")}`, size: actualBytes.length,
      width: decoded.info.width, height: decoded.info.height, sha256: digest(actualBytes), originalSha256: digest(bytes), oriented,
      originalSize: { width: metadata.width, height: metadata.height } };
  } catch (error) {
    if (error.statusCode === 400) throw error;
    throw error400(`${label}无法解码，或超过4096px / 16MP限制，请重新导出 PNG、JPEG 或 WebP`);
  }
}

export async function validateMaskFillInput(input = {}) {
  let model;
  try { model = maskFillModel(input.maskFillModel); } catch (error) { throw error400(error.message); }
  let editRegion;
  try { editRegion = normalizeMaskFillEditRegion(input.editRegion); } catch (error) { throw error400(error.message); }
  if (editRegion && model.provider !== "oneapi") throw error400("框选仅支持GPT模型，请使用涂抹遮罩");
  if (editRegion && input.maskImage != null) throw error400("框选与涂抹遮罩不能同时提交，请选择一种编辑工具");
  const mode = resolveImageMaskFillMode(input.maskFillMode);
  let fillReferencePurpose;
  try { fillReferencePurpose = maskFillReferencePurpose(input.fillReferencePurpose, model.key, mode.key); }
  catch (error) { throw error400(error.message); }
  if (input.prompt !== undefined && typeof input.prompt !== "string") throw error400("遮罩填充指令必须是文本");
  const prompt = (input.prompt ?? "").trim();
  if (prompt.length > 8000) throw error400("遮罩填充指令不能超过8000字符");
  if (!prompt && !maskFillPromptOptional(model.key, mode.key)) throw error400("遮罩填充指令不能为空");
  let tier;
  let outputResolution, quality;
  try {
    if (model.provider === "oneapi") {
      outputResolution = maskFillGptResolution(input.outputResolution, input.inferenceTier);
      quality = sunburstMaskQuality(input.quality);
    }
    tier = maskFillInferenceTier(outputResolution?.toLowerCase() ?? input.inferenceTier, model.key);
  } catch (error) { throw error400(error.message); }
  if (input.inferenceSize !== undefined) throw error400("推理尺寸已改为推理档位，请刷新后选择2K、4K或原图");
  const maskExpand = input.maskExpand ?? mode.defaultMaskExpand;
  if (!Number.isInteger(maskExpand) || maskExpand < 0 || maskExpand > 256) throw error400("遮罩扩展需要为0–256的整数");
  normalizeReferenceImages(input.referenceImages, { maxCount: 1, maxBytesPerImage: IMAGE_MASK_FILL_IMAGE_POLICY.maxBytesPerImage });
  if (input.referenceImages?.length !== 1) throw error400("遮罩填充需要且只允许1张主图");
  if (mode.key === "prompt" && input.fillReferenceImage) throw error400("提示词填充不接收填充参考图");
  if (mode.key === "reference" && !input.fillReferenceImage) throw error400("参考图填充需要上传填充参考图");
  const [source, mask, reference] = await Promise.all([
    decodeInput(input.referenceImages[0], "主图"),
    model.provider === "oneapi" && input.maskImage == null ? null : decodeInput(input.maskImage, "遮罩", true),
    mode.key === "reference" ? decodeInput(input.fillReferenceImage, "参考图") : null,
  ]);
  if (mask && (mask.width !== source.width || mask.height !== source.height)) throw error400(`遮罩尺寸必须与方向归一后的主图一致（${source.width}×${source.height}），请重新绘制`);
  const nativeTarget = model.provider === "oneapi" ? sunburstMaskOutputSize(source, outputResolution) : null;
  const measuredInference = ["original", "1mp"].includes(tier.key);
  const plan = nativeTarget ? { ...nativeTarget, maxEdge: Math.max(nativeTarget.width, nativeTarget.height) }
    : tier.key === "1mp" ? {} : maskFillInferenceSize(source, tier.key);
  const inferenceSize = measuredInference ? null : plan.maxEdge;
  if (mask) {
    const stats = await sharp(Buffer.from(mask.imageUrl.split(",")[1], "base64")).toColourspace("srgb").removeAlpha().extractChannel("red").stats();
    if (stats.channels[0].max === 0) throw error400("遮罩没有白色编辑区域，请先涂抹需要修改的区域");
  }
  return { modelKey: model.key, provider: model.provider, mode: mode.key, prompt, inferenceTier: tier.key, inferenceSize,
    ...(fillReferencePurpose ? { fillReferencePurpose } : {}),
    ...(nativeTarget ? { outputResolution, quality } : {}),
    inferenceWidth: measuredInference ? null : plan.width, inferenceHeight: measuredInference ? null : plan.height,
    maskExpand: mask ? maskExpand : 0, source, mask, reference, editRegion,
    originalSource: source.originalSize, sourceOriented: source.oriented };
}

export async function executeImageMaskFill(input, { imageClient, onProgress = null, scheduleSync = null,
  getOneApiModels,
  verifySyncContract = () => verifyLarkSyncSchema(undefined, { scope: "imageMaskFill" }) }) {
  const validated = await validateMaskFillInput(input);
  if (validated.provider === "oneapi") {
    if (!getOneApiModels || !(await getOneApiModels()).some(entry => entry.id === MASK_FILL_ONEAPI_MODEL.id)) {
      throw Object.assign(new Error("当前OneAPI Key没有Sunburst权限，请重新连接"), { statusCode: 409 });
    }
    if (scheduleSync) await verifySyncContract();
    const result = await executeSunburstMaskFill(validated, { imageClient, onProgress: onProgress || (() => {}) });
    const { archiveMaskImage, archiveBoxedSourceImage, ...completed } = result;
    if (!scheduleSync) return completed;
    const archive = buildImageMaskFillArchive({ input, validated, result: completed, maskImage: archiveMaskImage,
      boxedSourceImage: archiveBoxedSourceImage });
    return { ...completed, request: archive.preview, sync: scheduleSync(archive),
      upstream: { ...completed.upstream, metadata: { ...completed.upstream.metadata, syncMode: "lark" } } };
  }
  if (!imageClient?.generateImage || !imageClient?.getObjectInfo) throw Object.assign(new Error("遮罩填充客户端尚未配置"), { statusCode: 409 });
  const qwen = validated.modelKey === "qwenImageEdit2511";
  try { (qwen ? verifyQwenMaskFillCapabilities : verifyImageMaskFillCapabilities)(await imageClient.getObjectInfo(nodeTypes(validated.mode, qwen)), validated.mode); }
  catch (error) { throw Object.assign(new Error(`遮罩填充能力检查未通过：${error.message}`), { statusCode: 409 }); }
  if (scheduleSync) await verifySyncContract();
  const { source, mask, reference, prompt, inferenceTier, inferenceSize, maskExpand, mode } = validated;
  const tier = maskFillInferenceTier(inferenceTier, validated.modelKey);
  const generationRequest = {
    images: [{ fileName: source.fileName, image_url: source.imageUrl }], prompt, width: source.width, height: source.height,
    resolution: tier.key,
    maskFillMode: mode, inferenceTier, inferenceSize, maskExpand, maskBase64: mask.imageUrl.split(",")[1],
    ...(reference ? { fillReferenceBase64: reference.imageUrl.split(",")[1] } : {}),
    sourceWidth: source.width, sourceHeight: source.height, sourceSha256: source.sha256, maskSha256: mask.sha256,
    originalSourceWidth: validated.originalSource.width, originalSourceHeight: validated.originalSource.height,
    originalSourceSha256: source.originalSha256,
    referenceSha256: reference?.sha256 || null, sourceOriented: validated.sourceOriented,
  };
  const startedAt = Date.now();
  onProgress?.({ message: "正在提交遮罩填充任务", phase: "submitting" });
  const result = await imageClient.generateImage(generationRequest, { queueTimeoutMs: 5 * 60 * 1000, executionTimeoutMs: 10 * 60 * 1000,
    onProgress: ({ phase, promptId }) => onProgress?.({ phase, promptId,
      message: phase === "executing" ? "ComfyUI 正在执行遮罩填充" : "遮罩填充已提交，正在排队" }) });
  if (result.images?.length !== 1) throw Object.assign(new Error("遮罩填充没有返回唯一结果图片"), { statusCode: 502 });
  const metadata = result.metadata || {};
  const width = metadata.outputWidth || metadata.actualOutputWidth;
  const height = metadata.outputHeight || metadata.actualOutputHeight;
  const expected = maskFillOutputSize(source);
  if (width !== expected.width || height !== expected.height) throw Object.assign(new Error(`遮罩填充实际输出尺寸与原比例最高2K合同不符（应为${expected.width}×${expected.height}）`), { statusCode: 502 });
  const completed = { durationMs: Date.now() - startedAt, images: result.images,
    request: { outputFormat: result.outputFormat, referenceImageCount: reference ? 2 : 1, maskFillMode: mode, inferenceTier,
      inferenceSize: metadata.inferenceSize ?? inferenceSize, inferenceWidth: metadata.inferenceWidth ?? validated.inferenceWidth,
      inferenceHeight: metadata.inferenceHeight ?? validated.inferenceHeight, maskExpand,
      size: width && height ? `${width}x${height}` : "", syncMode: "local-only" },
    sync: { generationId: null, status: "skipped" },
    upstream: { created: result.created, metadata, outputFormat: result.outputFormat, transport: result.transport },
    workflow: { key: qwen ? QWEN_MASK_FILL_WORKFLOW.key : "flux2-mask-fill", label: IMAGE_MASK_FILL_MODES.find((entry) => entry.key === mode).label,
      version: qwen ? QWEN_MASK_FILL_WORKFLOW.version : IMAGE_MASK_FILL_VERSION, mode } };
  if (!scheduleSync) return completed;
  const archive = buildImageMaskFillArchive({ input, validated, result: completed });
  return { ...completed, request: archive.preview, sync: scheduleSync(archive),
    upstream: { ...completed.upstream, metadata: { ...metadata, syncMode: "lark" } } };
}

export function createImageMaskFillService({ imageClient, qwenMaskFillClient, scheduleSync = null, verifySyncContract, getOneApiModels }) {
  return { getConfig: () => readImageMaskFillConfig(imageClient, { getOneApiModels, qwenMaskFillClient }), execute: (input, options = {}) => executeImageMaskFill(input,
    { ...options, imageClient: input.maskFillModel === "qwenImageEdit2511" ? qwenMaskFillClient : imageClient, scheduleSync, verifySyncContract, getOneApiModels }) };
}

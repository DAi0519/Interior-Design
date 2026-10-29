/**
 * [INPUT]: 依赖已校验主图/红通道遮罩/可选物体参考、用户原文、共享输出尺寸及执行图节点准入
 * [OUTPUT]: Qwen-Image-Edit-2511双模式遮罩执行图、约1MP/4步/denoise=1、实际History尺寸与独立产物客户端契约
 * [POS]: src 的Qwen局部重绘适配器，原尺度裁剪后统一图像/遮罩/条件尺度，解码恢复裁剪尺寸再回贴
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { maskFillOutputSize, maskFillInferenceTier } from "../public/image-mask-fill-geometry.js";
import { resolveImageMaskFillMode, verifyImageMaskFillGraphCapabilities } from "./image-mask-fill-workflow.mjs";

export const QWEN_MASK_FILL_WORKFLOW = Object.freeze({
  key: "qwen-mask-fill", label: "Qwen Image Edit 2511", version: "2026-10-21.qwen.1",
  model: "qwen_image_edit_2511_fp8mixed.safetensors", clip: "qwen_2.5_vl_7b_fp8_scaled.safetensors",
  vae: "qwen_image_vae.safetensors", lora: "Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors",
  steps: 4, cfg: 1, shift: 3.1, sampler: "euler", scheduler: "simple", inferenceMegapixels: 1,
});

export function qwenMaskFillArtifactPrefix(key) {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(String(key || ""))) throw new TypeError("Qwen二次编辑产物键无效");
  return `CanvasLab_QwenMaskFill_${key}`;
}

export function createQwenMaskFillWorkflow({ artifactKey, imageBase64, seed, generationRequest: request = {} }) {
  const mode = resolveImageMaskFillMode(request.maskFillMode);
  maskFillInferenceTier(request.inferenceTier, "qwenImageEdit2511");
  const settings = QWEN_MASK_FILL_WORKFLOW, prefix = qwenMaskFillArtifactPrefix(artifactKey);
  const output = maskFillOutputSize({ width: request.sourceWidth ?? 2048, height: request.sourceHeight ?? 2048 });
  const expand = request.maskExpand ?? mode.defaultMaskExpand;
  if (!Number.isInteger(expand) || expand < 0 || expand > 256) throw new TypeError("遮罩扩展需要为0–256的整数");
  if (!Number.isSafeInteger(seed) || seed < 0) throw new TypeError("Qwen二次编辑随机种子无效");
  const node = (class_type, inputs) => ({ class_type, inputs });
  const load = (data, suffix) => node("easy loadImageBase64", { base64_data: data, image_output: "Hide", save_prefix: `${prefix}_${suffix}` });
  const grow = { incremental_expandrate: 0, tapered_corners: true, flip_input: false, lerp_alpha: 1, decay_factor: 1 };
  const condition = { clip: ["clip", 0], vae: ["vae", 0], image1: ["inference", 0], ...(mode.key === "reference" ? { image2: ["reference", 0] } : {}) };
  return {
    input: load(imageBase64, "input"), maskInput: load(request.maskBase64, "mask"),
    ...(mode.key === "reference" ? { reference: load(request.fillReferenceBase64, "reference") } : {}),
    mask: node("ImageToMask", { image: ["maskInput", 0], channel: "red" }),
    fill: node("GrowMaskWithBlur", { ...grow, mask: ["mask", 0], expand: 0, blur_radius: 0, fill_holes: true }),
    grow: node("GrowMaskWithBlur", { ...grow, mask: ["fill", 0], expand, blur_radius: 4, fill_holes: false }),
    crop: node("InpaintCropImproved", {
      image: ["input", 0], mask: ["grow", 0], downscale_algorithm: "lanczos", upscale_algorithm: "lanczos",
      preresize: false, preresize_mode: "ensure minimum resolution", preresize_min_width: 1024, preresize_min_height: 1024,
      preresize_max_width: 4096, preresize_max_height: 4096, mask_fill_holes: true, mask_expand_pixels: 0,
      mask_invert: false, mask_blend_pixels: 32, mask_hipass_filter: 0.1, extend_for_outpainting: true,
      extend_up_factor: 1, extend_down_factor: 1, extend_left_factor: 1, extend_right_factor: 1,
      context_from_mask_extend_factor: 1.2, output_resize_to_target_size: false, output_target_width: 1024,
      output_target_height: 1024, output_padding: "32", device_mode: "cpu (compatible)",
    }),
    cropSize: node("GetImageSize", { image: ["crop", 1] }),
    inference: node("ImageScaleToTotalPixels", { image: ["crop", 1], upscale_method: "lanczos", megapixels: settings.inferenceMegapixels, resolution_steps: 8 }),
    size: node("GetImageSize", { image: ["inference", 0] }),
    inferenceWidth: node("PreviewAny", { source: ["size", 0] }), inferenceHeight: node("PreviewAny", { source: ["size", 1] }),
    maskImage: node("MaskToImage", { mask: ["crop", 2] }),
    maskScale: node("ImageScale", { image: ["maskImage", 0], upscale_method: "bilinear", width: ["size", 0], height: ["size", 1], crop: "disabled" }),
    inferenceMask: node("ImageToMask", { image: ["maskScale", 0], channel: "red" }),
    model: node("UNETLoader", { unet_name: settings.model, weight_dtype: "default" }),
    clip: node("CLIPLoader", { clip_name: settings.clip, type: "qwen_image", device: "default" }),
    vae: node("VAELoader", { vae_name: settings.vae }),
    shift: node("ModelSamplingAuraFlow", { model: ["model", 0], shift: settings.shift }),
    norm: node("CFGNorm", { model: ["shift", 0], strength: 1, pre_cfg: false }),
    lightning: node("LoraLoaderModelOnly", { model: ["norm", 0], lora_name: settings.lora, strength_model: 1 }),
    positive: node("TextEncodeQwenImageEditPlus", { ...condition, prompt: String(request.prompt || "").trim() }),
    negative: node("TextEncodeQwenImageEditPlus", { ...condition, prompt: "" }),
    encode: node("VAEEncode", { pixels: ["inference", 0], vae: ["vae", 0] }),
    noiseMask: node("SetLatentNoiseMask", { samples: ["encode", 0], mask: ["inferenceMask", 0] }),
    sample: node("KSampler", { model: ["lightning", 0], positive: ["positive", 0], negative: ["negative", 0], latent_image: ["noiseMask", 0],
      seed, steps: settings.steps, cfg: settings.cfg, sampler_name: settings.sampler, scheduler: settings.scheduler, denoise: 1 }),
    decode: node("VAEDecode", { samples: ["sample", 0], vae: ["vae", 0] }),
    restore: node("ImageScale", { image: ["decode", 0], upscale_method: "lanczos", width: ["cropSize", 0], height: ["cropSize", 1], crop: "disabled" }),
    stitch: node("InpaintStitchImproved", { stitcher: ["crop", 0], inpainted_image: ["restore", 0] }),
    outputScale: node("ImageScale", { image: ["stitch", 0], upscale_method: "lanczos", width: output.width, height: output.height, crop: "disabled" }),
    output: node("SaveImage", { images: ["outputScale", 0], filename_prefix: prefix }),
  };
}

export function verifyQwenMaskFillCapabilities(objectInfo, mode = "prompt") {
  verifyImageMaskFillGraphCapabilities(objectInfo, createQwenMaskFillWorkflow({ artifactKey: "capability-check", imageBase64: "", seed: 1,
    generationRequest: { maskFillMode: mode, maskBase64: "", fillReferenceBase64: "" } }));
}

export function qwenMaskFillMetadata({ generationRequest: request, historyOutputs, ...actual }) {
  const dimension = id => {
    const texts = historyOutputs?.[id]?.text;
    const value = Array.isArray(texts) && texts.length === 1 && /^[1-9]\d*$/.test(String(texts[0])) ? Number(texts[0]) : null;
    return Number.isSafeInteger(value) && value <= 16384 ? value : null;
  };
  const width = dimension("inferenceWidth"), height = dimension("inferenceHeight");
  return { ...actual, ...QWEN_MASK_FILL_WORKFLOW, mode: resolveImageMaskFillMode(request.maskFillMode).key,
    maskFillModel: "qwenImageEdit2511", inferenceTier: "1mp", resolution: "1mp", denoise: 1,
    inferenceWidth: width, inferenceHeight: height, inferenceSize: width && height ? Math.max(width, height) : null,
    inferenceDimensionSource: width && height ? "history" : "not-captured", maskExpand: request.maskExpand,
    sourceWidth: request.sourceWidth, sourceHeight: request.sourceHeight, sourceSha256Actual: request.sourceSha256,
    originalSourceWidth: request.originalSourceWidth, originalSourceHeight: request.originalSourceHeight, originalSourceSha256: request.originalSourceSha256,
    maskSha256: request.maskSha256, referenceSha256: request.referenceSha256 || null, sourceOriented: request.sourceOriented,
    outputWidth: actual.actualOutputWidth, outputHeight: actual.actualOutputHeight,
    prompt: String(request.prompt || "").trim(), sourcePrompt: request.prompt, promptSource: "user", exactPixelPreservation: false, syncMode: "local-only" };
}

export const QWEN_MASK_FILL_CLIENT_OPTIONS = Object.freeze({ artifactPrefix: qwenMaskFillArtifactPrefix, outputNodeId: "output",
  workflowFactory: createQwenMaskFillWorkflow, workflowMetadataFactory: qwenMaskFillMetadata });

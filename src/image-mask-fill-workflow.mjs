/**
 * [INPUT]: 依赖已校验的三图Base64/真实原图尺寸、用户指令、共享2K/4K/原图推理档位与实机节点目录
 * [OUTPUT]: 两模式执行图、原图尺度回贴/原比例最高2K输出、可复用执行图节点准入及两PreviewAny同次History实际crop宽高；原图未知尺度留空
 * [POS]: src 的本机遮罩测试工作流真源，保留附件的首图 latent、参考顺序及裁剪回贴，不依赖发布包外的 workflows 文件
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { maskFillInferenceTier, maskFillInferenceSize, maskFillOutputSize } from "../public/image-mask-fill-geometry.js";

export const IMAGE_MASK_FILL_VERSION = "2026-10-21.local.2";
export const IMAGE_MASK_FILL_MODES = Object.freeze([
  Object.freeze({ key: "prompt", label: "提示词填充", defaultMaskExpand: 10, sourceSha256: "0623d534cf16ace205f7facb71c3bd8e559de5a458eb8d43a96573872dee9519" }),
  Object.freeze({ key: "reference", label: "参考图填充", defaultMaskExpand: 80, sourceSha256: "21c339fe84d9218b8b5bb78241e37e6d99fa043ac9bca073d5f74078a4394569" }),
]);
const WEIGHTS = Object.freeze({ model: "flux-2-klein-9b.safetensors", clip: "qwen_3_8b.safetensors", vae: "flux2-vae.safetensors" });

export function imageMaskFillArtifactPrefix(artifactKey) {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(String(artifactKey || ""))) throw new TypeError("遮罩填充产物键无效");
  return `CanvasLab_MaskFill_${artifactKey}`;
}

export function resolveImageMaskFillMode(value = "prompt") {
  const mode = IMAGE_MASK_FILL_MODES.find((entry) => entry.key === value);
  if (!mode) throw Object.assign(new Error("请选择提示词填充或参考图填充"), { statusCode: 400 });
  return mode;
}

function executionPrompt(prompt, mode) {
  const prefix = Array.from({ length: mode === "reference" ? 2 : 1 }, (_, i) => `image${i + 1}: <|vision_start|><|image_pad|><|vision_end|> `).join("");
  return prefix + String(prompt || "").trim();
}

export function createImageMaskFillWorkflow({ artifactKey, imageBase64, seed, generationRequest = {} }) {
  const mode = resolveImageMaskFillMode(generationRequest.maskFillMode);
  const tier = maskFillInferenceTier(generationRequest.inferenceTier);
  const sourceSize = { width: generationRequest.sourceWidth ?? 2048, height: generationRequest.sourceHeight ?? 2048 };
  const inference = maskFillInferenceSize(sourceSize, tier.key);
  const output = maskFillOutputSize(sourceSize);
  const maskExpand = generationRequest.maskExpand ?? mode.defaultMaskExpand;
  if (!Number.isInteger(maskExpand) || maskExpand < 0 || maskExpand > 256) throw new TypeError("遮罩扩展需要为 0–256 的整数");
  const graph = {};
  const ref = (id, slot = 0) => [id, slot];
  const add = (id, class_type, inputs) => { graph[id] = { class_type, inputs }; return ref(id); };
  const load = (id, data) => add(id, "easy loadImageBase64", { base64_data: data, image_output: "Hide", save_prefix: `${imageMaskFillArtifactPrefix(artifactKey)}_${id}` });
  load("input", imageBase64);
  load("maskInput", generationRequest.maskBase64);
  add("mask", "ImageToMask", { image: ref("maskInput"), channel: "red" });
  add("model", "UNETLoader", { unet_name: WEIGHTS.model, weight_dtype: "default" });
  add("clip", "CLIPLoader", { clip_name: WEIGHTS.clip, type: "flux2", device: "default" });
  add("vae", "VAELoader", { vae_name: WEIGHTS.vae });
  const grow = { incremental_expandrate: 0, tapered_corners: true, flip_input: false, lerp_alpha: 1, decay_factor: 1 };
  add("fill", "GrowMaskWithBlur", { ...grow, mask: ref("mask"), expand: 0, blur_radius: 0, fill_holes: true });
  add("grow", "GrowMaskWithBlur", { ...grow, mask: ref("fill"), expand: maskExpand, blur_radius: 4, fill_holes: false });
  add("crop", "InpaintCropImproved", {
    image: ref("input"), mask: ref("grow"), downscale_algorithm: "lanczos", upscale_algorithm: "lanczos",
    preresize: false, preresize_mode: "ensure minimum resolution", preresize_min_width: inference.width, preresize_min_height: inference.height,
    preresize_max_width: 4096, preresize_max_height: 4096, mask_fill_holes: true, mask_expand_pixels: 0,
    mask_invert: false, mask_blend_pixels: 32, mask_hipass_filter: 0.1, extend_for_outpainting: true,
    extend_up_factor: 1, extend_down_factor: 1, extend_left_factor: 1, extend_right_factor: 1,
    context_from_mask_extend_factor: 1.2, output_resize_to_target_size: inference.resize, output_target_width: inference.width,
    output_target_height: inference.height, output_padding: "32", device_mode: "cpu (compatible)",
  });
  add("size", "GetImageSize", { image: ref("crop", 1) });
  // -------- 只观察实际裁剪尺寸，不改变采样和回贴路径 --------
  add("inferenceWidth", "PreviewAny", { source: ref("size") });
  add("inferenceHeight", "PreviewAny", { source: ref("size", 1) });
  add("positive", "CLIPTextEncode", { clip: ref("clip"), text: executionPrompt(generationRequest.prompt, mode.key) });
  add("negative", "CLIPTextEncode", { clip: ref("clip"), text: "" });
  add("encode", "VAEEncode", { pixels: ref("crop", 1), vae: ref("vae") });
  let positive = add("positiveMain", "ReferenceLatent", { conditioning: ref("positive"), latent: ref("encode") });
  let negative = add("negativeMain", "ReferenceLatent", { conditioning: ref("negative"), latent: ref("encode") });
  if (mode.key === "reference") {
    load("reference", generationRequest.fillReferenceBase64);
    add("birefModel", "LoadRembgByBiRefNetModel", { model: "General.safetensors", device: "AUTO", use_weight: false });
    add("biref", "RembgByBiRefNet", { model: ref("birefModel"), images: ref("reference") });
    add("referenceScale", "LayerUtility: ImageScaleByAspectRatio V2", { image: ref("reference"), mask: ref("biref", 1), aspect_ratio: "original", proportional_width: 1, proportional_height: 1, fit: "crop", method: "lanczos", round_to_multiple: "16", scale_to_side: "longest", scale_to_length: Math.max(64, inference.maxEdge), background_color: "#000000" });
    add("referenceCrop", "LayerUtility: CropByMask V2", { image: ref("referenceScale"), mask: ref("referenceScale", 1), invert_mask: false, detect: "mask_area", top_reserve: 128, bottom_reserve: 128, left_reserve: 128, right_reserve: 128, round_to_multiple: "8" });
    add("referenceCanvas", "ImageScale", { image: ref("referenceCrop"), upscale_method: "lanczos", width: ref("size"), height: ref("size", 1), crop: "center" });
    add("referenceEncode", "VAEEncode", { pixels: ref("referenceCanvas"), vae: ref("vae") });
    positive = add("positiveReference", "ReferenceLatent", { conditioning: positive, latent: ref("referenceEncode") });
    negative = add("negativeReference", "ReferenceLatent", { conditioning: negative, latent: ref("referenceEncode") });
  }
  add("noiseMask", "SetLatentNoiseMask", { samples: ref("encode"), mask: ref("crop", 2) });
  add("repeat", "RepeatLatentBatch", { samples: ref("noiseMask"), amount: 1 });
  add("guider", "CFGGuider", { model: ref("model"), positive, negative, cfg: 1 });
  add("noise", "RandomNoise", { noise_seed: seed });
  add("sampler", "KSamplerSelect", { sampler_name: "euler_ancestral" });
  add("schedule", "Flux2Scheduler", { width: ref("size"), height: ref("size", 1), steps: 4 });
  add("sample", "SamplerCustomAdvanced", { noise: ref("noise"), guider: ref("guider"), sampler: ref("sampler"), sigmas: ref("schedule"), latent_image: ref("repeat") });
  add("decode", "VAEDecode", { samples: ref("sample"), vae: ref("vae") });
  add("toList", "RebatchImages", { images: ref("decode"), batch_size: 1 });
  add("stitch", "InpaintStitchImproved", { stitcher: ref("crop"), inpainted_image: ref("toList") });
  add("outputScale", "ImageScale", { image: ref("stitch"), upscale_method: "lanczos", width: output.width, height: output.height, crop: "disabled" });
  add("output", "SaveImage", { images: ref("outputScale"), filename_prefix: imageMaskFillArtifactPrefix(artifactKey) });
  return graph;
}

// -------- 两种模式独立核验，参考图分割不可用不阻断提示词模式 --------
export function verifyImageMaskFillCapabilities(objectInfo, mode = "prompt") {
  const graph = createImageMaskFillWorkflow({ artifactKey: "capability-check", imageBase64: "", seed: 1, generationRequest: { maskFillMode: mode, maskBase64: "", fillReferenceBase64: "" } });
  verifyImageMaskFillGraphCapabilities(objectInfo, graph);
}

export function verifyImageMaskFillGraphCapabilities(objectInfo, graph) {
  for (const node of Object.values(graph)) {
    const schema = objectInfo[node.class_type];
    if (!schema?.input) throw new Error(`缺少遮罩填充节点：${node.class_type}`);
    const fields = { ...schema.input.required, ...schema.input.optional };
    for (const name of Object.keys(schema.input.required || {})) if (!(name in node.inputs)) throw new Error(`遮罩填充节点缺少输入：${node.class_type}.${name}`);
    for (const [name, value] of Object.entries(node.inputs)) {
      const spec = fields[name];
      if (!spec) throw new Error(`遮罩填充节点输入不兼容：${node.class_type}.${name}`);
      if (Array.isArray(value)) {
        const type = objectInfo[graph[value[0]]?.class_type]?.output?.[value[1]];
        if (!type || (spec[0] !== "*" && type !== spec[0])) throw new Error(`遮罩填充连线不兼容：${node.class_type}.${name}`);
      } else {
        const choices = Array.isArray(spec[0]) ? spec[0] : spec[0] === "COMBO" ? spec[1]?.options : null;
        if (choices && !choices.includes(value)) throw new Error(`遮罩填充配置不可用：${node.class_type}.${name}`);
      }
    }
  }
}

export function imageMaskFillMetadata({ generationRequest, historyOutputs, ...actual }) {
  const mode = resolveImageMaskFillMode(generationRequest.maskFillMode);
  const tier = maskFillInferenceTier(generationRequest.inferenceTier);
  const target = maskFillInferenceSize({ width: generationRequest.sourceWidth, height: generationRequest.sourceHeight }, tier.key);
  const captured = (id) => {
    const value = historyOutputs?.[id]?.text;
    if (!Array.isArray(value) || value.length !== 1 || !/^[1-9]\d*$/.test(String(value[0]))) return null;
    const number = Number(value[0]);
    return Number.isSafeInteger(number) && number <= 16384 ? number : null;
  };
  const capturedWidth = captured("inferenceWidth"), capturedHeight = captured("inferenceHeight");
  const hasCapture = capturedWidth !== null && capturedHeight !== null;
  const inferenceWidth = hasCapture ? capturedWidth : tier.key === "original" ? null : target.width;
  const inferenceHeight = hasCapture ? capturedHeight : tier.key === "original" ? null : target.height;
  return { ...actual, key: "flux2-mask-fill", label: mode.label, version: IMAGE_MASK_FILL_VERSION, mode: mode.key,
    sourceSha256: mode.sourceSha256, ...WEIGHTS, resolution: tier.key, inferenceTier: tier.key,
    requestedInferenceWidth: tier.key === "original" ? null : target.width, requestedInferenceHeight: tier.key === "original" ? null : target.height,
    inferenceWidth, inferenceHeight, inferenceSize: inferenceWidth && inferenceHeight ? Math.max(inferenceWidth, inferenceHeight) : null,
    inferenceDimensionSource: hasCapture ? "history" : tier.key === "original" ? "not-captured" : "configured-target",
    maskExpand: generationRequest.maskExpand,
    sourceWidth: generationRequest.sourceWidth, sourceHeight: generationRequest.sourceHeight,
    originalSourceWidth: generationRequest.originalSourceWidth, originalSourceHeight: generationRequest.originalSourceHeight,
    sourceSha256Actual: generationRequest.sourceSha256, maskSha256: generationRequest.maskSha256,
    originalSourceSha256: generationRequest.originalSourceSha256,
    referenceSha256: generationRequest.referenceSha256 || null, sourceOriented: generationRequest.sourceOriented,
    outputWidth: actual.actualOutputWidth, outputHeight: actual.actualOutputHeight,
    prompt: executionPrompt(generationRequest.prompt, mode.key), sourcePrompt: generationRequest.prompt,
    steps: 4, cfg: 1, sampler: "euler_ancestral", batchSize: 1, exactPixelPreservation: false, syncMode: "local-only" };
}

export const IMAGE_MASK_FILL_CLIENT_OPTIONS = Object.freeze({
  artifactPrefix: imageMaskFillArtifactPrefix, outputNodeId: "output",
  workflowFactory: createImageMaskFillWorkflow, workflowMetadataFactory: imageMaskFillMetadata,
});

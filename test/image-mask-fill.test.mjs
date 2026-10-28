/**
 * [INPUT]: 依赖 node:test/assert、sharp 真实图片字节、遮罩填充工作流/服务与统一后台任务接口
 * [OUTPUT]: GPT参考用途默认/有效/非法及跨模型模式零调用、两模式独立能力、三档推理/最高2K输出与真实crop尺度、首图潜空间/裁剪回贴、真实图片准入及独立飞书scope/入队阻断测试
 * [POS]: test 的 Flux2 遮罩填充回归，使用内存 ComfyUI 替身，不调用 GPU、外网或飞书
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { createGenerationJobApiHandler } from "../src/generation-job-api.mjs";
import { createGenerationService } from "../src/generation-service.mjs";
import { executeImageMaskFill, readImageMaskFillConfig, validateMaskFillInput } from "../src/image-mask-fill-service.mjs";
import {
  IMAGE_MASK_FILL_CLIENT_OPTIONS, IMAGE_MASK_FILL_MODES, createImageMaskFillWorkflow,
  imageMaskFillArtifactPrefix, imageMaskFillMetadata, verifyImageMaskFillCapabilities,
} from "../src/image-mask-fill-workflow.mjs";

const descriptor = (bytes, type = "image/png", name = "input.png") => ({
  dataUrl: `data:${type};base64,${bytes.toString("base64")}`, name, type, size: bytes.length,
});
const image = (width = 96, height = 64, background = "#957657") => sharp({
  create: { width, height, channels: 3, background },
}).png().toBuffer();
const sourceBytes = await image();
const maskBytes = await image(96, 64, "#ffffff");
const referenceBytes = await image(48, 80, "#537980");
const source = descriptor(sourceBytes);
const mask = descriptor(maskBytes, "image/png", "mask.png");
const reference = descriptor(referenceBytes, "image/png", "reference.png");
const input = { referenceImages: [source], maskImage: mask, prompt: "Replace the masked object with a wooden chair." };

// -------- 固定节点合同来自已审查的 MaaS 端口，独立于待测执行图 --------
function capabilityFixture() {
  const spec = (required, output, optional = {}) => ({ input: {
    required: Object.fromEntries(Object.entries(required).map(([key, value]) => [key, typeof value === "string" ? [value] : value])),
    optional: Object.fromEntries(Object.entries(optional).map(([key, value]) => [key, typeof value === "string" ? [value] : value])),
  }, output });
  const combo = options => ["COMBO", { options }];
  return {
    "easy loadImageBase64": spec({ base64_data: "STRING", image_output: [["Hide", "Preview", "Save", "Hide/Save"]], save_prefix: "STRING" }, ["IMAGE", "MASK"]),
    ImageToMask: spec({ image: "IMAGE", channel: combo(["red", "green", "blue", "alpha"]) }, ["MASK"]),
    UNETLoader: spec({ unet_name: [["flux-2-klein-9b.safetensors"]], weight_dtype: [["default", "fp8_e4m3fn"]] }, ["MODEL"]),
    CLIPLoader: spec({ clip_name: [["qwen_3_8b.safetensors"]], type: [["flux2"]] }, ["CLIP"], { device: [["default", "cpu"]] }),
    VAELoader: spec({ vae_name: [["flux2-vae.safetensors"]] }, ["VAE"]),
    GrowMaskWithBlur: spec({ mask: "MASK", expand: "INT", incremental_expandrate: "FLOAT", tapered_corners: "BOOLEAN",
      flip_input: "BOOLEAN", blur_radius: "FLOAT", lerp_alpha: "FLOAT", decay_factor: "FLOAT" }, ["MASK", "MASK"], { fill_holes: "BOOLEAN" }),
    InpaintCropImproved: spec({ image: "IMAGE", downscale_algorithm: [["lanczos"]], upscale_algorithm: [["lanczos"]],
      preresize: "BOOLEAN", preresize_mode: [["ensure minimum resolution"]], preresize_min_width: "INT", preresize_min_height: "INT",
      preresize_max_width: "INT", preresize_max_height: "INT", mask_fill_holes: "BOOLEAN", mask_expand_pixels: "INT",
      mask_invert: "BOOLEAN", mask_blend_pixels: "INT", mask_hipass_filter: "FLOAT", extend_for_outpainting: "BOOLEAN",
      extend_up_factor: "FLOAT", extend_down_factor: "FLOAT", extend_left_factor: "FLOAT", extend_right_factor: "FLOAT",
      context_from_mask_extend_factor: "FLOAT", output_resize_to_target_size: "BOOLEAN", output_target_width: "INT",
      output_target_height: "INT", output_padding: [["32"]], device_mode: [["cpu (compatible)"]] },
    ["STITCHER", "IMAGE", "MASK"], { mask: "MASK", optional_context_mask: "MASK" }),
    GetImageSize: spec({ image: "IMAGE" }, ["INT", "INT", "INT"]),
    PreviewAny: spec({ source: "*" }, ["STRING"]),
    CLIPTextEncode: spec({ clip: "CLIP", text: "STRING" }, ["CONDITIONING"]),
    VAEEncode: spec({ pixels: "IMAGE", vae: "VAE" }, ["LATENT"]),
    ReferenceLatent: spec({ conditioning: "CONDITIONING" }, ["CONDITIONING"], { latent: "LATENT" }),
    LoadRembgByBiRefNetModel: spec({ model: [["General.safetensors"]], device: [["AUTO", "CPU"]] }, ["BiRefNetMODEL"], { use_weight: "BOOLEAN" }),
    RembgByBiRefNet: spec({ model: "BiRefNetMODEL", images: "IMAGE" }, ["IMAGE", "MASK"]),
    "LayerUtility: ImageScaleByAspectRatio V2": spec({ aspect_ratio: [["original"]], proportional_width: "INT", proportional_height: "INT",
      fit: [["crop"]], method: [["lanczos"]], round_to_multiple: [["16"]], scale_to_side: [["longest"]], scale_to_length: "INT", background_color: "STRING" },
    ["IMAGE", "MASK", "BOX", "INT", "INT"], { image: "IMAGE", mask: "MASK" }),
    "LayerUtility: CropByMask V2": spec({ image: "IMAGE", mask: "MASK", invert_mask: "BOOLEAN", detect: [["mask_area"]],
      top_reserve: "INT", bottom_reserve: "INT", left_reserve: "INT", right_reserve: "INT", round_to_multiple: [["8"]] }, ["IMAGE", "MASK", "BOX", "IMAGE"]),
    ImageScale: spec({ image: "IMAGE", upscale_method: [["lanczos"]], width: "INT", height: "INT", crop: [["center", "disabled"]] }, ["IMAGE"]),
    SetLatentNoiseMask: spec({ samples: "LATENT", mask: "MASK" }, ["LATENT"]),
    RepeatLatentBatch: spec({ samples: "LATENT", amount: "INT" }, ["LATENT"]),
    CFGGuider: spec({ model: "MODEL", positive: "CONDITIONING", negative: "CONDITIONING", cfg: "FLOAT" }, ["GUIDER"]),
    RandomNoise: spec({ noise_seed: "INT" }, ["NOISE"]),
    KSamplerSelect: spec({ sampler_name: combo(["euler_ancestral"]) }, ["SAMPLER"]),
    Flux2Scheduler: spec({ steps: "INT", width: "INT", height: "INT" }, ["SIGMAS"]),
    SamplerCustomAdvanced: spec({ noise: "NOISE", guider: "GUIDER", sampler: "SAMPLER", sigmas: "SIGMAS", latent_image: "LATENT" }, ["LATENT", "LATENT"]),
    VAEDecode: spec({ samples: "LATENT", vae: "VAE" }, ["IMAGE"]),
    RebatchImages: spec({ images: "IMAGE", batch_size: "INT" }, ["IMAGE"]),
    InpaintStitchImproved: spec({ stitcher: "STITCHER", inpainted_image: "IMAGE" }, ["IMAGE"]),
    SaveImage: spec({ images: "IMAGE", filename_prefix: "STRING" }, ["IMAGE"]),
  };
}

function graph(mode = "prompt", extra = {}) {
  return createImageMaskFillWorkflow({ artifactKey: "mask-test-request-1", imageBase64: "source-once", seed: 42,
    generationRequest: { prompt: input.prompt, maskFillMode: mode, maskBase64: "mask-once", fillReferenceBase64: "reference-once", ...extra } });
}

function generated(request) {
  return { images: [{ url: source.dataUrl }], outputFormat: "png", transport: "fixture", metadata: imageMaskFillMetadata({
    generationRequest: request, resolution: request.resolution, actualOutputWidth: 96, actualOutputHeight: 64, promptId: "mask-test-prompt", outputSha256: "result-sha", seed: 42,
  }) };
}

test("两种遮罩模式保留首图潜空间、原遮罩与裁剪回贴，每次固定一张", () => {
  assert.deepEqual(IMAGE_MASK_FILL_MODES.map(mode => [mode.key, mode.defaultMaskExpand]), [["prompt", 10], ["reference", 80]]);
  for (const mode of ["prompt", "reference"]) {
    const nodes = graph(mode);
    assert.deepEqual(nodes.encode.inputs.pixels, ["crop", 1]);
    assert.deepEqual(nodes.noiseMask.inputs, { samples: ["encode", 0], mask: ["crop", 2] });
    assert.deepEqual(nodes.repeat.inputs, { samples: ["noiseMask", 0], amount: 1 });
    assert.deepEqual(nodes.sample.inputs.latent_image, ["repeat", 0]);
    assert.deepEqual(nodes.stitch.inputs, { stitcher: ["crop", 0], inpainted_image: ["toList", 0] });
    assert.deepEqual(nodes.output.inputs.images, ["outputScale", 0]);
    assert.deepEqual(nodes.outputScale.inputs.image, ["stitch", 0]);
    assert.equal(nodes.outputScale.inputs.crop, "disabled");
    assert.equal(nodes.toList.inputs.batch_size, 1);
    assert.equal(nodes.mask.inputs.channel, "red");
    assert.equal(nodes.crop.inputs.mask_invert, false);
    assert.equal(nodes.crop.inputs.preresize, false);
    assert.equal(nodes.crop.inputs.output_target_width, 2048);
    assert.equal(nodes.grow.inputs.expand, mode === "prompt" ? 10 : 80);
    assert.equal(nodes.schedule.inputs.steps, 4);
    assert.equal(nodes.guider.inputs.cfg, 1);
    assert.equal(Object.values(nodes).some(node => /Empty.*Latent|Painter|GetNode|SetNode/.test(node.class_type)), false);
    assert.doesNotThrow(() => verifyImageMaskFillCapabilities(capabilityFixture(), mode));
  }
  const referenceGraph = graph("reference");
  assert.deepEqual(referenceGraph.positiveReference.inputs.conditioning, ["positiveMain", 0]);
  assert.deepEqual(referenceGraph.positiveReference.inputs.latent, ["referenceEncode", 0]);
  assert.deepEqual(referenceGraph.referenceCanvas.inputs.width, ["size", 0]);
  assert.deepEqual(referenceGraph.referenceCanvas.inputs.height, ["size", 1]);
  assert.equal(referenceGraph.referenceCanvas.inputs.crop, "center");
});

test("主图、遮罩与参考图每图只进入一个上传节点，前缀隔离且适配器绑定真源", () => {
  for (const mode of ["prompt", "reference"]) {
    const nodes = graph(mode);
    const uploads = Object.values(nodes).filter(node => node.class_type === "easy loadImageBase64");
    assert.deepEqual(uploads.map(node => node.inputs.base64_data).sort(), (mode === "prompt" ? ["mask-once", "source-once"] : ["mask-once", "reference-once", "source-once"]).sort());
    assert.equal(new Set(uploads.map(node => node.inputs.save_prefix)).size, uploads.length);
    assert.equal(nodes.output.inputs.filename_prefix, imageMaskFillArtifactPrefix("mask-test-request-1"));
  }
  assert.notEqual(imageMaskFillArtifactPrefix("mask-test-request-1"), imageMaskFillArtifactPrefix("mask-test-request-2"));
  assert.throws(() => imageMaskFillArtifactPrefix("../other-output"));
  assert.equal(IMAGE_MASK_FILL_CLIENT_OPTIONS.workflowFactory, createImageMaskFillWorkflow);
  assert.equal(IMAGE_MASK_FILL_CLIENT_OPTIONS.workflowMetadataFactory, imageMaskFillMetadata);
  assert.equal(IMAGE_MASK_FILL_CLIENT_OPTIONS.artifactPrefix, imageMaskFillArtifactPrefix);
  assert.equal(IMAGE_MASK_FILL_CLIENT_OPTIONS.outputNodeId, "output");
});

test("节点、真实模型枚举和端口漂移前置阻断，参考图插件缺失不连带提示词模式", async () => {
  for (const type of ["ImageToMask", "InpaintCropImproved", "ReferenceLatent", "InpaintStitchImproved"]) {
    const missing = capabilityFixture(); delete missing[type];
    assert.throws(() => verifyImageMaskFillCapabilities(missing, "prompt"), /节点|连线/);
  }
  const unavailable = capabilityFixture(); unavailable.UNETLoader.input.required.unet_name = [["other-model.safetensors"]];
  assert.throws(() => verifyImageMaskFillCapabilities(unavailable, "prompt"), /配置不可用/);
  const wrong = capabilityFixture(); wrong.InpaintCropImproved.output[2] = "IMAGE";
  assert.throws(() => verifyImageMaskFillCapabilities(wrong, "prompt"), /连线/);
  const partial = capabilityFixture(); delete partial.LoadRembgByBiRefNetModel;
  const config = await readImageMaskFillConfig({ getObjectInfo: async () => partial });
  assert.equal(config.available, true);
  assert.equal(config.defaultMode, "prompt");
  assert.equal(config.modes.find(mode => mode.key === "prompt").available, true);
  assert.equal(config.modes.find(mode => mode.key === "reference").available, false);
  assert.ok(config.modes.find(mode => mode.key === "reference").reason);
  assert.doesNotMatch(JSON.stringify(config), /safetensors|https?:\/\//);
  assert.equal((await readImageMaskFillConfig(null)).available, false);
});

test("真实输入宽高覆盖浏览器伪尺寸，全白遮罩可用且两种模式默认参数独立", async () => {
  const normalized = await validateMaskFillInput({ ...input, referenceImages: [{ ...source, width: 9000, height: 9000 }] });
  assert.equal(normalized.mode.key || normalized.mode, "prompt");
  assert.deepEqual([normalized.source.width, normalized.source.height], [96, 64]);
  assert.equal(normalized.inferenceTier, "2k");
  assert.equal(normalized.inferenceSize, 2048);
  assert.equal(normalized.maskExpand, 10);
  const withReference = await validateMaskFillInput({ ...input, maskFillMode: "reference", fillReferenceImage: reference });
  assert.equal(withReference.maskExpand, 80);
  assert.deepEqual([withReference.reference.width, withReference.reference.height], [48, 80]);
  const explicit = await validateMaskFillInput({ ...input, inferenceTier: "4k", maskExpand: 0 });
  assert.equal(explicit.inferenceSize, 4096);
  assert.equal(explicit.maskExpand, 0);
});

test("参考用途仅GPT参考模式接受且默认换物品，非法用途或跨模型模式在调用前拒绝", async () => {
  const referenceInput = { ...input, maskFillModel: "gptImage25Sunburst", maskFillMode: "reference", fillReferenceImage: reference, prompt: "" };
  for (const fillReferencePurpose of [undefined, "object", "material"]) {
    const validated = await validateMaskFillInput({ ...referenceInput, ...(fillReferencePurpose !== undefined ? { fillReferencePurpose } : {}) });
    assert.equal(validated.fillReferencePurpose, fillReferencePurpose || "object");
    assert.equal(validated.prompt, "");
  }
  let calls = 0;
  const imageClient = { generateImage() { calls++; }, editImage() { calls++; }, editImageAsync() { calls++; } };
  const reject = value => assert.rejects(executeImageMaskFill(value, { imageClient }), error => error.statusCode === 400 && /参考用途/.test(error.message));
  for (const fillReferencePurpose of [null, "", "Object", "texture", " material ", false, 1, {}, []]) await reject({ ...referenceInput, fillReferencePurpose });
  for (const maskFillModel of ["gptImage25Sunburst", "flux2Klein", "qwenImageEdit2511"]) for (const maskFillMode of ["prompt", "reference"]) {
    if (maskFillModel === "gptImage25Sunburst" && maskFillMode === "reference") continue;
    const value = { ...input, maskFillModel, maskFillMode, ...(maskFillMode === "reference" ? { fillReferenceImage: reference } : {}) };
    assert.equal(Object.hasOwn(await validateMaskFillInput(value), "fillReferencePurpose"), false);
    for (const fillReferencePurpose of ["object", "material", null]) await reject({ ...value, fillReferencePurpose });
  }
  assert.equal(calls, 0, "用途错误不触发模型或能力调用");
});

test("主图 EXIF 归一后要求遮罩同尺寸，不自动拉伸旧方向遮罩", async () => {
  const rotatedBytes = await sharp(sourceBytes).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const rotated = { ...input, referenceImages: [descriptor(rotatedBytes, "image/jpeg", "rotated.jpg")] };
  await assert.rejects(validateMaskFillInput(rotated), error => error.statusCode === 400);
  const normalized = await validateMaskFillInput({ ...rotated, maskImage: descriptor(await image(64, 96, "#ffffff")) });
  assert.deepEqual([normalized.source.width, normalized.source.height], [64, 96]);
  assert.equal(normalized.sourceOriented, true);
  const actual = await sharp(Buffer.from(normalized.source.imageUrl.split(",")[1], "base64")).metadata();
  assert.deepEqual([actual.width, actual.height], [64, 96]);
  assert.equal(actual.orientation, undefined);
});

test("三档推理取消原图预放大；横竖图输出保持原比例、最高2K且小图不放大", async () => {
  const config = await readImageMaskFillConfig({ getObjectInfo: async () => capabilityFixture() });
  assert.deepEqual(config.inferenceTiers.map(tier => [tier.key, tier.label]), [["2k", "2K"], ["4k", "4K"], ["original", "原图"]]);
  assert.equal(config.defaultInferenceTier, "2k");
  assert.equal(config.maxOutputEdge, 2048);
  for (const [width, height, outputWidth, outputHeight] of [[4000, 3000, 2048, 1536], [3000, 4000, 1536, 2048], [96, 64, 96, 64]]) {
    for (const tier of ["2k", "4k", "original"]) {
      const nodes = graph("prompt", { sourceWidth: width, sourceHeight: height, inferenceTier: tier });
      assert.equal(nodes.crop.inputs.preresize, false);
      assert.equal(nodes.crop.inputs.output_resize_to_target_size, tier !== "original");
      if (tier !== "original") assert.equal(Math.max(nodes.crop.inputs.output_target_width, nodes.crop.inputs.output_target_height), tier === "2k" ? 2048 : 4096);
      assert.deepEqual([nodes.outputScale.inputs.width, nodes.outputScale.inputs.height], [outputWidth, outputHeight]);
    }
  }
  const extreme = { ...input, referenceImages: [descriptor(await image(4096, 32))],
    maskImage: descriptor(await image(4096, 32, "#ffffff")) };
  await assert.doesNotReject(validateMaskFillInput(extreme));
  const original = await validateMaskFillInput({ ...input, inferenceTier: "original" });
  assert.equal(original.inferenceTier, "original");
  assert.equal(original.inferenceSize, null, "实际遮罩crop尺寸在执行前未知，不能用整图长边冒充");
});

test("推理元数据区分固定目标、同次History裁剪证据与原图未知尺度", () => {
  const base = { sourceWidth: 4000, sourceHeight: 3000, prompt: input.prompt, maskFillMode: "prompt" };
  for (const [inferenceTier, inferenceWidth, inferenceHeight] of [["2k", 2048, 1536], ["4k", 4096, 3072]]) {
    const metadata = imageMaskFillMetadata({ generationRequest: { ...base, inferenceTier }, actualOutputWidth: 2048, actualOutputHeight: 1536 });
    assert.equal(metadata.inferenceTier, inferenceTier);
    assert.equal(metadata.inferenceWidth, inferenceWidth);
    assert.equal(metadata.inferenceHeight, inferenceHeight);
    assert.equal(metadata.inferenceSize, Math.max(inferenceWidth, inferenceHeight));
    assert.equal(metadata.inferenceDimensionSource, "configured-target");
  }
  const original = imageMaskFillMetadata({ generationRequest: { ...base, inferenceTier: "original", inferenceSize: 4000 },
    actualOutputWidth: 2048, actualOutputHeight: 1536 });
  assert.equal(original.inferenceWidth, null);
  assert.equal(original.inferenceHeight, null);
  assert.equal(original.inferenceSize, null);
  assert.equal(original.inferenceDimensionSource, "not-captured");
  assert.deepEqual([original.sourceWidth, original.sourceHeight], [4000, 3000]);
  const captured = imageMaskFillMetadata({ generationRequest: { ...base, inferenceTier: "original" },
    historyOutputs: { inferenceWidth: { text: ["160"] }, inferenceHeight: { text: ["96"] } },
    actualOutputWidth: 2048, actualOutputHeight: 1536 });
  assert.deepEqual([captured.inferenceWidth, captured.inferenceHeight, captured.inferenceSize], [160, 96, 160]);
  assert.equal(captured.inferenceDimensionSource, "history");
  const incomplete = imageMaskFillMetadata({ generationRequest: { ...base, inferenceTier: "original" },
    historyOutputs: { inferenceWidth: { text: ["160"] } }, actualOutputWidth: 2048, actualOutputHeight: 1536 });
  assert.deepEqual([incomplete.inferenceWidth, incomplete.inferenceHeight, incomplete.inferenceSize], [null, null, null]);
  const nodes = graph("prompt", { inferenceTier: "original" });
  assert.deepEqual(nodes.inferenceWidth.inputs.source, ["size", 0]);
  assert.deepEqual(nodes.inferenceHeight.inputs.source, ["size", 1]);
});

test("遮罩以 PNG 真实红通道判断编辑区域，不把不透明 alpha 或蓝通道当编辑区", async () => {
  for (const background of ["#000000", "#0000ff"]) {
    await assert.rejects(validateMaskFillInput({ ...input, maskImage: descriptor(await image(96, 64, background)) }), error => error.statusCode === 400);
  }
  await assert.doesNotReject(validateMaskFillInput({ ...input, maskImage: descriptor(await image(96, 64, "#ff0000")) }));
  const jpegMask = await sharp(maskBytes).jpeg().toBuffer();
  await assert.rejects(validateMaskFillInput({ ...input, maskImage: descriptor(jpegMask) }), error => error.statusCode === 400);
  await assert.rejects(validateMaskFillInput({ ...input, maskImage: descriptor(jpegMask, "image/jpeg", "mask.jpg") }), error => error.statusCode === 400);
  await assert.rejects(validateMaskFillInput({ ...input, maskImage: descriptor(await image(95, 64, "#ffffff")) }), error => error.statusCode === 400);
});

test("主图/遮罩/参考图按真实字节执行 6MB、4096 边界，非法模式和参数零 GPU", async () => {
  const invalid = [
    { referenceImages: [] }, { referenceImages: [source, source] }, { maskImage: null }, { prompt: "   " },
    { maskFillMode: "unknown" }, { maskFillMode: "reference" }, { inferenceSize: 768 }, { inferenceSize: "1024" },
    { inferenceTier: "2k", inferenceSize: 2048 }, { inferenceTier: "original", inferenceSize: 96 },
    { inferenceTier: "1k" }, { inferenceTier: null },
    { maskExpand: -1 }, { maskExpand: 257 }, { maskExpand: 0.5 }, { maskExpand: "10" },
    { referenceImages: [{ ...source, size: 1 }] }, { maskImage: { ...mask, size: 1 } },
    { maskFillMode: "reference", fillReferenceImage: { ...reference, size: 1 } },
  ];
  for (const override of invalid) await assert.rejects(validateMaskFillInput({ ...input, ...override }), error => error.statusCode === 400);
  const wide = descriptor(await image(4097, 32));
  await assert.rejects(validateMaskFillInput({ ...input, referenceImages: [wide] }), error => error.statusCode === 400);
  await assert.rejects(validateMaskFillInput({ ...input, maskFillMode: "reference", fillReferenceImage: wide }), error => error.statusCode === 400);
  const oversizedBytes = await sharp({ create: { width: 1500, height: 1500, channels: 3, background: "#ffffff" } }).png({ compressionLevel: 0 }).toBuffer();
  assert.ok(oversizedBytes.length > 6 * 1024 * 1024);
  const oversized = { ...descriptor(oversizedBytes), size: 1, width: 96, height: 64 };
  for (const override of [{ referenceImages: [oversized] }, { maskImage: oversized }, { maskFillMode: "reference", fillReferenceImage: oversized }]) {
    await assert.rejects(validateMaskFillInput({ ...input, ...override }), /6MB/);
  }
});

test("无同步调度的独立试跑复核所选模式、独立传递三图，失败单次提交且仅本机保存", async () => {
  let calls = 0;
  const partial = capabilityFixture(); delete partial.LoadRembgByBiRefNetModel;
  const client = { getObjectInfo: async () => partial, async generateImage(request, options) {
    calls++;
    assert.equal(request.images.length, 1);
    assert.equal(request.images[0].image_url, source.dataUrl);
    assert.equal(Buffer.from(request.maskBase64, "base64").length, maskBytes.length);
    assert.equal(request.maskFillMode, "prompt");
    assert.equal(request.resolution, "2k");
    assert.equal(request.inferenceTier, "2k");
    options.onProgress?.({ phase: "executing", promptId: "mask-test-prompt" });
    return generated(request);
  } };
  const progress = [];
  const result = await executeImageMaskFill(input, { imageClient: client, onProgress: event => progress.push(event) });
  assert.equal(calls, 1);
  assert.equal(result.sync.status, "skipped");
  assert.equal(result.request.syncMode, "local-only");
  assert.equal(result.upstream.metadata.resolution, "2k");
  assert.equal(result.upstream.metadata.prompt, graph("prompt").positive.inputs.text);
  assert.equal(result.upstream.metadata.sourcePrompt, input.prompt);
  assert.ok(progress.some(event => event.phase === "executing"));
  await assert.rejects(executeImageMaskFill({ ...input, maskFillMode: "reference", fillReferenceImage: reference }, { imageClient: client }), error => error.statusCode === 409);
  assert.equal(calls, 1);
  const referenceResult = await executeImageMaskFill({ ...input, maskFillMode: "reference", fillReferenceImage: reference }, { imageClient: {
    getObjectInfo: async () => capabilityFixture(), async generateImage(request) {
      assert.equal(request.images.length, 1);
      assert.equal(Buffer.from(request.fillReferenceBase64, "base64").length, referenceBytes.length);
      assert.equal(request.maskFillMode, "reference");
      assert.equal(request.resolution, "2k");
      return generated(request);
    },
  } });
  assert.equal(referenceResult.upstream.metadata.prompt, graph("reference").positive.inputs.text);
  assert.equal(referenceResult.upstream.metadata.sourcePrompt, input.prompt);
  let attempts = 0;
  await assert.rejects(executeImageMaskFill(input, { imageClient: { getObjectInfo: async () => capabilityFixture(),
    async generateImage() { attempts++; throw new Error("fixture GPU failure"); } } }), /fixture GPU failure/);
  assert.equal(attempts, 1);
});

test("产物尺寸不符合原图比例或2K上限时拒绝归档，不能把上游尺寸当作交付尺寸", async () => {
  let scheduled = false;
  await assert.rejects(executeImageMaskFill(input, { imageClient: {
    getObjectInfo: async () => capabilityFixture(), async generateImage(request) {
      const result = generated(request);
      result.metadata.outputWidth = 4096;
      result.metadata.outputHeight = 4096;
      return result;
    },
  }, scheduleSync() { scheduled = true; }, verifySyncContract: async () => {} }), error => error.statusCode === 502);
  assert.equal(scheduled, false);
});

test("统一生成路由只用遮罩专用客户端，不要求 OneAPI Key并调度飞书同步", async () => {
  const forbidden = () => assert.fail("遮罩测试不应访问 OneAPI");
  let calls = 0, checks = 0, archived = null;
  const service = createGenerationService({ imageMaskFillClient: { getObjectInfo: async () => capabilityFixture(), async generateImage(request) {
    calls++; return generated(request);
  } }, requireApiKey: forbidden, imageClientForModel: forbidden,
  verifyMaskFillSyncContract: async () => { checks++; },
  scheduleGenerationSync: value => { archived = value; return { status: "pending", generationId: "mask-sync-fixture" }; } });
  const result = await service.executeForMode("imageMaskFill", input);
  assert.equal(calls, 1);
  assert.equal(checks, 1);
  assert.ok(archived);
  assert.equal(result.sync.status, "pending");
  assert.equal(result.sync.generationId, "mask-sync-fixture");
  assert.equal(result.request.syncMode, "lark");
});

test("后台遮罩任务单项入队前校验独立飞书scope，合同错误和多项请求不入队", async () => {
  const body = { jobId: "generation-mask-fill-12345", featureMode: "imageMaskFill", sharedInput: input,
    items: [{ key: "prompt", label: "提示词填充", input: {} }] };
  const queued = [];
  const syncChecks = [];
  let schemaError = null;
  let response;
  const handler = createGenerationJobApiHandler({
    generationJobs: { enqueue(id, details, run) { queued.push({ id, details, run }); return { jobId: id }; } },
    generationService: { async executeForMode(mode, submitted) {
      assert.equal(mode, "imageMaskFill"); assert.equal(submitted.maskFillMode, "prompt"); return { sync: { status: "pending", generationId: "mask-sync-fixture" } };
    } },
    getImageMaskFillConfig: async () => ({ available: true, defaultMode: "prompt", modes: [{ key: "prompt", available: true }, { key: "reference", available: true }] }),
    readJson: async () => structuredClone(body), sendJson: (_, status, value) => { response = { status, ...value }; },
    verifySyncContract: async (...args) => { syncChecks.push(args); if (schemaError) throw schemaError; },
  });
  await handler({ method: "POST" }, {}, "/api/generation-jobs");
  assert.equal(response.status, 202);
  assert.equal(queued.length, 1);
  assert.deepEqual(syncChecks, [[undefined, { scope: "imageMaskFill" }]]);
  assert.equal(queued[0].details.total, 1);
  assert.deepEqual(queued[0].details.stages, { comfyUi: "submitting" });
  const completed = await queued[0].run(() => {});
  assert.equal(completed.outcomes[0].status, "fulfilled");
  body.items.push(body.items[0]);
  await handler({ method: "POST" }, {}, "/api/generation-jobs");
  assert.equal(response.status, 400);
  assert.equal(queued.length, 1);
  assert.equal(syncChecks.length, 1);
  body.items.pop();
  schemaError = new Error("遮罩图字段不存在");
  await handler({ method: "POST" }, {}, "/api/generation-jobs");
  assert.equal(response.status, 409);
  assert.match(response.error, /飞书同步合同未通过.*遮罩图/);
  assert.equal(queued.length, 1);
  assert.deepEqual(syncChecks[1], [undefined, { scope: "imageMaskFill" }]);
});

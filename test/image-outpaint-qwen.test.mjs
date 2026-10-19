/**
 * [INPUT]: 依赖 Qwen 扩图工厂、能力准入与元数据合同、通用 ComfyUI 客户端及内存节点/HTTP 替身
 * [OUTPUT]: 对外提供 2511/专属 Lightning 隔离、统一推理尺度/遮罩同步缩放/高分辨率原遮罩合成、尺寸/来源/产物身份及 Schema 漂移阻断测试
 * [POS]: test 的独立 Qwen 扩图合同回归，不访问远端、不提交 GPU、不读取用户工作流
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import sharp from "sharp";
import { createComfyUiClient } from "../src/comfyui-client.mjs";
import {
  QWEN_OUTPAINT_CLIENT_OPTIONS,
  QWEN_OUTPAINT_ENGINE_KEY,
  assertQwenOutpaintTarget,
  createQwenOutpaintWorkflow,
  publicQwenOutpaintConfig,
  qwenOutpaintArtifactPrefix,
  qwenOutpaintInferenceDimensions,
  qwenOutpaintPreparedDimensions,
  qwenOutpaintWorkflowMetadata,
  verifyQwenOutpaintCapabilities,
} from "../src/image-outpaint-qwen.mjs";

const expansion = { left: 16, top: 16, right: 16, bottom: 16 };
const options = {
  artifactKey: "qwen-request-123", imageBase64: "c291cmNl", seed: 42, width: 512, height: 512,
  generationRequest: { sourceWidth: 480, sourceHeight: 480, expansion },
};

// -------- 离线接口替身：独立描述端口类型与合法文件，不从执行图复制 Schema --------
function objectInfo() {
  const schema = (required, output, optional = {}) => ({ input: { required, optional }, output });
  const link = (type) => [type, {}];
  const integer = ["INT", { min: 0, max: 16384 }];
  return {
    "easy loadImageBase64": schema({ base64_data: ["STRING"], image_output: [["Hide", "Preview"]], save_prefix: ["STRING"] }, ["IMAGE", "MASK"]),
    UNETLoader: schema({ unet_name: [["qwen_image_edit_2511_fp8mixed.safetensors"]], weight_dtype: [["default", "fp8_e4m3fn"]] }, ["MODEL"]),
    CLIPLoader: schema({ clip_name: [["qwen_2.5_vl_7b_fp8_scaled.safetensors"]], type: [["qwen_image"]] }, ["CLIP"], { device: [["default", "cpu"]] }),
    VAELoader: schema({ vae_name: [["qwen_image_vae.safetensors"]] }, ["VAE"]),
    ModelSamplingAuraFlow: schema({ model: link("MODEL"), shift: ["FLOAT", { min: 0, max: 100 }] }, ["MODEL"]),
    CFGNorm: schema({ model: link("MODEL"), strength: ["FLOAT", { min: 0, max: 100 }] }, ["MODEL"], { pre_cfg: ["BOOLEAN"] }),
    LoraLoaderModelOnly: schema({ model: link("MODEL"), lora_name: [["Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors"]], strength_model: ["FLOAT", { min: -100, max: 100 }] }, ["MODEL"]),
    ImagePadForOutpaint: schema({ image: link("IMAGE"), left: integer, top: integer, right: integer, bottom: integer, feathering: integer }, ["IMAGE", "MASK"]),
    TextEncodeQwenImageEditPlus: schema({ clip: link("CLIP"), prompt: ["STRING"] }, ["CONDITIONING"], { vae: link("VAE"), image1: link("IMAGE"), image2: link("IMAGE"), image3: link("IMAGE") }),
    ImageScaleToTotalPixels: schema({ image: link("IMAGE"), upscale_method: [["nearest-exact", "bilinear", "area", "bicubic", "lanczos"]], megapixels: ["FLOAT", { min: 0.01, max: 16 }], resolution_steps: ["INT", { min: 1, max: 128 }] }, ["IMAGE"]),
    GetImageSize: schema({ image: link("IMAGE") }, ["INT", "INT", "INT"]),
    ImageScale: schema({ image: link("IMAGE"), upscale_method: [["nearest-exact", "bilinear", "area", "bicubic", "lanczos"]], width: integer, height: integer, crop: [["disabled", "center"]] }, ["IMAGE"]),
    MaskToImage: schema({ mask: link("MASK") }, ["IMAGE"]),
    ImageToMask: schema({ image: link("IMAGE"), channel: [["red", "green", "blue", "alpha"]] }, ["MASK"]),
    VAEEncode: schema({ pixels: link("IMAGE"), vae: link("VAE") }, ["LATENT"]),
    SetLatentNoiseMask: schema({ samples: link("LATENT"), mask: link("MASK") }, ["LATENT"]),
    KSampler: schema({ model: link("MODEL"), positive: link("CONDITIONING"), negative: link("CONDITIONING"), latent_image: link("LATENT"), seed: ["INT", { min: 0 }], steps: ["INT", { min: 1, max: 10000 }], cfg: ["FLOAT", { min: 0, max: 100 }], sampler_name: [["euler"]], scheduler: [["simple"]], denoise: ["FLOAT", { min: 0, max: 1 }] }, ["LATENT"]),
    VAEDecode: schema({ samples: link("LATENT"), vae: link("VAE") }, ["IMAGE"]),
    ImageCompositeMasked: schema({ destination: link("IMAGE"), source: link("IMAGE"), x: integer, y: integer, resize_source: ["BOOLEAN"] }, ["IMAGE"], { mask: link("MASK") }),
    SaveImage: schema({ images: link("IMAGE"), filename_prefix: ["STRING"] }, ["IMAGE"]),
  };
}

function nodeOf(graph, type) {
  const entries = Object.entries(graph).filter(([, value]) => value.class_type === type);
  assert.equal(entries.length, 1, `${type} 必须有且只有一个节点`);
  return { id: entries[0][0], ...entries[0][1] };
}

test("Qwen 扩图绑定 2511 专属 4 步 LoRA，忽略请求中的跨模型与采样覆盖", () => {
  const graph = createQwenOutpaintWorkflow({ ...options, generationRequest: {
    ...options.generationRequest, model: "flux1-fill-dev.safetensors", lora: "Qwen-Image-Lightning-8steps-V1.1.safetensors",
    steps: 8, cfg: 9, prompt: "whole image redraw", outpaintModel: "fluxFillDev",
  } });
  const model = nodeOf(graph, "UNETLoader");
  const lora = nodeOf(graph, "LoraLoaderModelOnly");
  const sample = nodeOf(graph, "KSampler");
  assert.equal(model.inputs.unet_name, "qwen_image_edit_2511_fp8mixed.safetensors");
  assert.equal(model.inputs.weight_dtype, "default");
  assert.equal(lora.inputs.lora_name, "Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors");
  assert.equal(lora.inputs.strength_model, 1);
  assert.deepEqual(sample.inputs.model, [lora.id, 0]);
  assert.equal(sample.inputs.steps, 4);
  assert.equal(sample.inputs.cfg, 1);
  assert.equal(sample.inputs.sampler_name, "euler");
  assert.equal(sample.inputs.scheduler, "simple");
  assert.equal(nodeOf(graph, "CLIPLoader").inputs.type, "qwen_image");
  assert.equal(nodeOf(graph, "VAELoader").inputs.vae_name, "qwen_image_vae.safetensors");
  assert.ok(!Object.values(graph).some((node) => /Goohai|Janus|lrzjason|FluxGuidance|EmptyLatent/.test(node.class_type)));
});

test("条件与采样共用同尺度工作图、遮罩同步缩放，恢复目标后通过原遮罩保留原图中心", () => {
  const graph = createQwenOutpaintWorkflow(options);
  const input = nodeOf(graph, "easy loadImageBase64");
  const pad = nodeOf(graph, "ImagePadForOutpaint");
  const encode = nodeOf(graph, "VAEEncode");
  const masked = nodeOf(graph, "SetLatentNoiseMask");
  const sample = nodeOf(graph, "KSampler");
  const decode = nodeOf(graph, "VAEDecode");
  const composite = nodeOf(graph, "ImageCompositeMasked");
  const output = nodeOf(graph, "SaveImage");
  assert.deepEqual(pad.inputs.image, [input.id, 0]);
  assert.ok(pad.inputs.feathering > 0 && pad.inputs.feathering < options.generationRequest.sourceWidth / 2);
  assert.deepEqual(graph.inference.inputs.image, [pad.id, 0]);
  assert.deepEqual(graph.positive.inputs.image1, ["inference", 0]);
  assert.deepEqual(graph.negative.inputs.image1, ["inference", 0]);
  assert.deepEqual(encode.inputs.pixels, ["inference", 0]);
  assert.deepEqual(graph.maskImage.inputs.mask, [pad.id, 1]);
  assert.deepEqual(graph.inferenceMaskImage.inputs.image, ["maskImage", 0]);
  assert.deepEqual(graph.inferenceMask.inputs.image, ["inferenceMaskImage", 0]);
  assert.equal(graph.inferenceMask.inputs.channel, "red");
  assert.deepEqual(masked.inputs.samples, [encode.id, 0]);
  assert.deepEqual(masked.inputs.mask, ["inferenceMask", 0]);
  assert.deepEqual(sample.inputs.latent_image, [masked.id, 0]);
  assert.deepEqual(decode.inputs.samples, [sample.id, 0]);
  assert.deepEqual(composite.inputs.destination, [pad.id, 0]);
  assert.deepEqual(graph.restore.inputs.image, [decode.id, 0]);
  assert.deepEqual(graph.outputSize.inputs.image, [pad.id, 0]);
  assert.deepEqual(graph.restore.inputs.width, ["outputSize", 0]);
  assert.deepEqual(graph.restore.inputs.height, ["outputSize", 1]);
  assert.deepEqual(composite.inputs.source, ["restore", 0]);
  assert.deepEqual(composite.inputs.mask, [pad.id, 1]);
  assert.notDeepEqual(composite.inputs.mask, masked.inputs.mask);
  assert.equal(composite.inputs.resize_source, false);
  assert.deepEqual([composite.inputs.x, composite.inputs.y], [0, 0]);
  assert.deepEqual(output.inputs.images, [composite.id, 0]);
  for (const node of Object.values(graph)) {
    for (const value of Object.values(node.inputs)) {
      if (Array.isArray(value)) assert.ok(graph[value[0]], `缺失依赖：${value[0]}`);
    }
  }
});

test("原图真实尺寸保持不变，目标使用 16 对齐且四边总和必须闭合", () => {
  assert.deepEqual(qwenOutpaintPreparedDimensions({ width: 1537, height: 863 }), { width: 1537, height: 863 });
  const config = publicQwenOutpaintConfig({ available: true });
  assert.equal(config.outputAlignment, 16);
  assert.deepEqual(assertQwenOutpaintTarget({ width: 4096, height: 2304 }), { width: 4096, height: 2304 });
  for (const value of [0, 8, 504, 513, 4097, 8192, 512.5, "512", NaN]) {
    assert.throws(() => assertQwenOutpaintTarget({ width: value, height: 512 }), (error) => error.statusCode === 400);
  }
  for (const value of [31, 4097, 480.5, "480", NaN, undefined]) {
    assert.throws(() => qwenOutpaintPreparedDimensions({ width: value, height: 480 }), (error) => error.statusCode === 400);
  }
  for (const sourceWidth of [479, 481]) {
    assert.throws(() => createQwenOutpaintWorkflow({ ...options, generationRequest: { ...options.generationRequest, sourceWidth } }), /尺寸不一致/);
  }
  assert.throws(() => createQwenOutpaintWorkflow({ ...options, width: 1024 }), /尺寸不一致/);
});

// -------- 尺度回归：图像/遮罩/条件共用工作坐标，输出坐标独立恢复 --------
const geometryCases = [
  { width: 2048, height: 1152, sourceWidth: 1080, sourceHeight: 810, expansion: { left: 91, right: 877, top: 39, bottom: 303 } },
  { width: 1152, height: 2048, sourceWidth: 403, sourceHeight: 301, expansion: { left: 611, right: 138, top: 1490, bottom: 257 } },
  { width: 4096, height: 2304, sourceWidth: 1537, sourceHeight: 863, expansion: { left: 1719, right: 840, top: 112, bottom: 1329 } },
  { width: 2304, height: 4096, sourceWidth: 1537, sourceHeight: 863, expansion: { left: 310, right: 457, top: 697, bottom: 2536 } },
];

test("2K/4K 横竖画幅和偏心非16像素原图均使用约1MP共同推理坐标", () => {
  for (const fixture of geometryCases) {
    const graph = createQwenOutpaintWorkflow({ ...options, ...fixture, generationRequest: fixture });
    assert.equal(graph.inference.class_type, "ImageScaleToTotalPixels");
    assert.equal(graph.inference.inputs.megapixels, 1.0);
    assert.equal(graph.inference.inputs.resolution_steps, 8);
    const { width, height } = qwenOutpaintInferenceDimensions(fixture);
    assert.equal(width % 8, 0);
    assert.equal(height % 8, 0);
    assert.ok(width * height <= 1_100_000, `模型工作图必须受约1MP约束，实际${width}×${height}`);
    assert.ok(width * height >= 950_000);
    assert.ok(Math.abs(width / height - fixture.width / fixture.height) < 0.03);
    assert.deepEqual(graph.inferenceSize.inputs.image, ["inference", 0]);
    assert.deepEqual(graph.inferenceMaskImage.inputs.width, ["inferenceSize", 0]);
    assert.deepEqual(graph.inferenceMaskImage.inputs.height, ["inferenceSize", 1]);
    assert.equal(graph.inferenceMaskImage.inputs.crop, "disabled");
    assert.equal(graph.inferenceMaskImage.inputs.upscale_method, "bilinear");
    assert.deepEqual(graph.encode.inputs.pixels, graph.positive.inputs.image1);
    assert.deepEqual(graph.negative.inputs.image1, graph.positive.inputs.image1);
    assert.deepEqual(graph.restore.inputs.image, ["decode", 0]);
    assert.deepEqual(graph.outputSize.inputs.image, ["pad", 0]);
    assert.deepEqual(graph.restore.inputs.width, ["outputSize", 0]);
    assert.deepEqual(graph.restore.inputs.height, ["outputSize", 1]);
    assert.equal(graph.restore.inputs.crop, "disabled");
    assert.equal(graph.restore.inputs.upscale_method, "lanczos");
    assert.deepEqual(graph.composite.inputs.destination, ["pad", 0]);
    assert.deepEqual(graph.composite.inputs.mask, ["pad", 1]);
    for (const side of ["left", "right", "top", "bottom"]) assert.equal(graph.pad.inputs[side], fixture.expansion[side]);
  }
});

test("工作尺寸独立于2K/4K输出，非法目标不能绕过16像素/4096边界", () => {
  const landscape2k = qwenOutpaintInferenceDimensions({ width: 2048, height: 1152 });
  const landscape4k = qwenOutpaintInferenceDimensions({ width: 4096, height: 2304 });
  const portrait = qwenOutpaintInferenceDimensions({ width: 2304, height: 4096 });
  assert.deepEqual(landscape2k, { width: 1368, height: 768 });
  assert.deepEqual(landscape2k, landscape4k);
  assert.deepEqual(qwenOutpaintInferenceDimensions({ width: 1536, height: 2048 }), { width: 888, height: 1184 });
  assert.deepEqual(portrait, { width: landscape4k.height, height: landscape4k.width });
  for (const width of [0, 31, 513, 4097, "2048", NaN]) {
    assert.throws(() => qwenOutpaintInferenceDimensions({ width, height: 1152 }), (error) => error.statusCode === 400);
  }
});

// -------- 原生图像节点语义替身：采样结果故意破坏中心，检验最终高分辨率原图回贴 --------
function sizeLink(graph, value, fixture) {
  const size = graph[value[0]];
  assert.equal(size.class_type, "GetImageSize");
  const imageKey = size.inputs.image[0];
  const dimensions = imageKey === "pad" ? fixture : imageKey === "inference" ? qwenOutpaintInferenceDimensions(fixture) : null;
  assert.ok(dimensions, `尺寸必须来自扩图目标或模型工作图，实际来自${imageKey}`);
  return [dimensions.width, dimensions.height][value[1]];
}

async function compositeFromGraph(graph, fixture) {
  const { width, height, sourceWidth, sourceHeight, expansion: edge } = fixture;
  const work = qwenOutpaintInferenceDimensions(fixture);
  const pixels = Buffer.alloc(sourceWidth * sourceHeight * 3);
  for (let index = 0; index < pixels.length; index += 1) pixels[index] = (index * 97 + Math.floor(index / 17)) % 256;
  const original = await sharp(pixels, { raw: { width: sourceWidth, height: sourceHeight, channels: 3 } }).png().toBuffer();
  const padded = await sharp({ create: { width, height, channels: 3, background: "#808080" } })
    .composite([{ input: original, left: edge.left, top: edge.top }]).png().toBuffer();
  const protectedCenter = { left: edge.left + 32, top: edge.top + 32, width: sourceWidth - 64, height: sourceHeight - 64 };
  const black = await sharp({ create: { width: protectedCenter.width, height: protectedCenter.height, channels: 3, background: "#000000" } }).png().toBuffer();
  const mask = await sharp({ create: { width, height, channels: 3, background: "#ffffff" } })
    .composite([{ input: black, left: protectedCenter.left, top: protectedCenter.top }]).removeAlpha().png().toBuffer();
  const working = await sharp(padded).resize(work.width, work.height, { fit: "fill" }).png().toBuffer();
  const workingMask = await sharp(mask).resize(sizeLink(graph, graph.inferenceMaskImage.inputs.width, fixture), sizeLink(graph, graph.inferenceMaskImage.inputs.height, fixture), { fit: "fill", kernel: "linear" }).png().toBuffer();
  const workSizes = await Promise.all([working, workingMask].map(async (value) => {
    const metadata = await sharp(value).metadata();
    return [metadata.width, metadata.height];
  }));
  assert.deepEqual(workSizes, Array.from({ length: 2 }, () => [work.width, work.height]));
  const generated = await sharp({ create: { ...work, channels: 3, background: "#ee3322" } }).png().toBuffer();
  const restored = await sharp(generated).resize(sizeLink(graph, graph.restore.inputs.width, fixture), sizeLink(graph, graph.restore.inputs.height, fixture), { fit: "fill", kernel: "lanczos3" }).removeAlpha().raw().toBuffer();
  const alpha = await sharp(mask).extractChannel("red").raw().toBuffer();
  const layer = await sharp(restored, { raw: { width, height, channels: 3 } }).joinChannel(alpha, { raw: { width, height, channels: 1 } }).png().toBuffer();
  const result = await sharp(padded).composite([{ input: layer, left: graph.composite.inputs.x, top: graph.composite.inputs.y }]).png().toBuffer();
  const protectedBytes = await sharp(result).extract(protectedCenter).removeAlpha().raw().toBuffer();
  const originalCenter = await sharp(original).extract({ left: 32, top: 32, width: sourceWidth - 64, height: sourceHeight - 64 }).removeAlpha().raw().toBuffer();
  assert.deepEqual(protectedBytes, originalCenter, "采样破坏中心仍必须由原分辨率源图逐字节恢复");
  assert.deepEqual([...(await sharp(result).extract({ left: 0, top: 0, width: 1, height: 1 }).removeAlpha().raw().toBuffer())], [238, 51, 34]);
  const metadata = await sharp(result).metadata();
  assert.deepEqual([metadata.width, metadata.height], [width, height]);
}

test("非GPU图像语义验证：2K/4K恢复目标后保留32px接缝外原图中心字节，扩边采用采样内容", async () => {
  for (const fixture of [geometryCases[1], geometryCases[2]]) {
    const graph = createQwenOutpaintWorkflow({ ...options, ...fixture, generationRequest: fixture });
    await compositeFromGraph(graph, fixture);
  }
});

test("非法扩边与种子在建图前拒绝，扩边额外字段不能劫持图片连线", () => {
  for (const left of [-1, 0.5, 4097, "16", undefined]) {
    assert.throws(() => createQwenOutpaintWorkflow({ ...options, generationRequest: { ...options.generationRequest, expansion: { ...expansion, left } } }), (error) => error.statusCode === 400);
  }
  assert.throws(() => createQwenOutpaintWorkflow({ ...options, generationRequest: { sourceWidth: 512, sourceHeight: 512, expansion: { left: 0, top: 0, right: 0, bottom: 0 } } }), /非空/);
  for (const seed of [-1, 0.1, "42", NaN, undefined, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => createQwenOutpaintWorkflow({ ...options, seed }), /种子/);
  }
  const graph = createQwenOutpaintWorkflow({ ...options, generationRequest: {
    ...options.generationRequest, expansion: { ...expansion, image: ["attacker", 0], arbitrary: 999 },
  } });
  const pad = nodeOf(graph, "ImagePadForOutpaint");
  assert.deepEqual(pad.inputs.image, [nodeOf(graph, "easy loadImageBase64").id, 0]);
  assert.equal("arbitrary" in pad.inputs, false);
});

test("Qwen 产物键隔离输出且各次执行图不会相互污染", () => {
  for (const key of ["", "short", "../qwen-request-123", "qwen/request-123", "qwen\nrequest-123", "x".repeat(81)]) {
    assert.throws(() => qwenOutpaintArtifactPrefix(key), /产物键/);
  }
  const first = createQwenOutpaintWorkflow(options);
  first.model.inputs.unet_name = "unrelated.safetensors";
  first.pad.inputs.left = 999;
  const second = createQwenOutpaintWorkflow({ ...options, artifactKey: "qwen-request-456", seed: 456 });
  assert.equal(second.model.inputs.unet_name, "qwen_image_edit_2511_fp8mixed.safetensors");
  assert.equal(second.pad.inputs.left, 16);
  assert.equal(second.sample.inputs.seed, 456);
  assert.equal(second.output.inputs.filename_prefix, "CanvasLab_QwenOutpaint_qwen-request-456");
  assert.equal(second.input.inputs.image_output, "Hide");
});

test("能力准入拒绝缺失节点、跨版本 LoRA、编码器类型及参数接口漂移", () => {
  assert.doesNotThrow(() => verifyQwenOutpaintCapabilities(objectInfo()));
  const absentMask = objectInfo();
  delete absentMask.SetLatentNoiseMask;
  assert.throws(() => verifyQwenOutpaintCapabilities(absentMask), /SetLatentNoiseMask/);
  const unrelatedLora = objectInfo();
  unrelatedLora.LoraLoaderModelOnly.input.required.lora_name[0] = ["Qwen-Image-Lightning-8steps-V1.1.safetensors"];
  assert.throws(() => verifyQwenOutpaintCapabilities(unrelatedLora), /lora_name/);
  const wrongClip = objectInfo();
  wrongClip.CLIPLoader.input.required.type[0] = ["flux"];
  assert.throws(() => verifyQwenOutpaintCapabilities(wrongClip), /CLIPLoader.type/);
  const newRequirement = objectInfo();
  newRequirement.KSampler.input.required.control_image = ["IMAGE"];
  assert.throws(() => verifyQwenOutpaintCapabilities(newRequirement), /KSampler.control_image/);
  const rangeDrift = objectInfo();
  rangeDrift.KSampler.input.required.steps[1].min = 8;
  assert.throws(() => verifyQwenOutpaintCapabilities(rangeDrift), /KSampler.steps/);
});

test("能力准入兼容新版COMBO options，并拒绝枚举项漂移", () => {
  const modern = objectInfo();
  for (const schema of Object.values(modern)) {
    for (const fields of [schema.input.required, schema.input.optional]) {
      for (const [field, spec] of Object.entries(fields || {})) {
        if (Array.isArray(spec[0])) fields[field] = ["COMBO", { options: spec[0] }];
      }
    }
  }
  assert.doesNotThrow(() => verifyQwenOutpaintCapabilities(modern));
  modern.ImageToMask.input.required.channel[1].options = ["blue"];
  assert.throws(() => verifyQwenOutpaintCapabilities(modern), /ImageToMask.channel/);
});

test("能力准入拒绝 mask 端口类型和输出槽位漂移，禁止失效遮罩仍标记可运行", () => {
  for (const className of ["ImageScaleToTotalPixels", "GetImageSize", "ImageScale", "MaskToImage", "ImageToMask"]) {
    const missing = objectInfo();
    delete missing[className];
    assert.throws(() => verifyQwenOutpaintCapabilities(missing), new RegExp(className));
  }
  const wrongScaleInput = objectInfo();
  wrongScaleInput.ImageScale.input.required.image = ["MASK"];
  assert.throws(() => verifyQwenOutpaintCapabilities(wrongScaleInput), /ImageScale.image/);
  const wrongSizeOutput = objectInfo();
  wrongSizeOutput.GetImageSize.output[0] = "FLOAT";
  assert.throws(() => verifyQwenOutpaintCapabilities(wrongSizeOutput), /ImageScale.width/);
  const wrongInput = objectInfo();
  wrongInput.SetLatentNoiseMask.input.required.mask = ["IMAGE"];
  assert.throws(() => verifyQwenOutpaintCapabilities(wrongInput), /SetLatentNoiseMask.mask/);
  const missingOutput = objectInfo();
  missingOutput.ImagePadForOutpaint.output = ["IMAGE"];
  assert.throws(() => verifyQwenOutpaintCapabilities(missingOutput), /ImagePadForOutpaint|MaskToImage.mask/);
});

test("元数据分别记录实测尺寸与目标尺寸，不用目标伪装真实产物", () => {
  const metadata = qwenOutpaintWorkflowMetadata({ ...options, actualOutputWidth: 496, actualOutputHeight: 480,
    outputFilename: "CanvasLab_QwenOutpaint_qwen-request-123_00001_.png", outputSha256: "a".repeat(64), promptId: "prompt-qwen-123" });
  assert.equal(metadata.engine, QWEN_OUTPAINT_ENGINE_KEY);
  assert.deepEqual([metadata.outputWidth, metadata.outputHeight], [496, 480]);
  assert.deepEqual([metadata.targetWidth, metadata.targetHeight], [512, 512]);
  assert.deepEqual([metadata.inputWidth, metadata.inputHeight], [480, 480]);
  assert.equal(metadata.preservation, "original-center-masked-composite");
  assert.deepEqual([metadata.inferenceWidth, metadata.inferenceHeight], [1024, 1024]);
  assert.equal(metadata.inferencePixels, 1024 * 1024);
  assert.equal(metadata.inferenceMegapixels, 1);
  assert.equal(metadata.outputSizeStrategy, "restore-target-then-original-mask-composite");
  assert.equal(metadata.outputResampling, "lanczos");
  assert.equal(metadata.outputRestored, true);
  assert.equal(metadata.upscaleModel, null, "尺寸恢复不可标记为AI超分");
  assert.equal(metadata.workflowVersion, "2026-10-19.1");
  assert.equal(metadata.outputSha256, "a".repeat(64));
  assert.equal(metadata.promptId, "prompt-qwen-123");
  metadata.expansion.left = 500;
  assert.equal(expansion.left, 16);
  const unknown = qwenOutpaintWorkflowMetadata(options);
  assert.equal(unknown.outputWidth, undefined);
  assert.equal(unknown.outputHeight, undefined);
  const nativeSize = qwenOutpaintWorkflowMetadata({ ...options, width: 1024, height: 1024 });
  assert.equal(nativeSize.outputRestored, false);
  const restored4k = qwenOutpaintWorkflowMetadata({ ...options, width: 4096, height: 2304 });
  assert.deepEqual([restored4k.targetWidth, restored4k.targetHeight], [4096, 2304]);
  assert.deepEqual([restored4k.inferenceWidth, restored4k.inferenceHeight], Object.values(qwenOutpaintInferenceDimensions({ width: 4096, height: 2304 })));
  assert.equal(restored4k.outputWidth, undefined);
  assert.equal(restored4k.outputRestored, true);
});

// -------- 内存传输：实测输出尺寸/摘要与请求级唯一产物须同时成立 --------
async function clientFixture({ filename = "CanvasLab_QwenOutpaint_qwen-request-123_00001_.png" } = {}) {
  const input = await sharp({ create: { width: 480, height: 480, channels: 3, background: "#506070" } }).png().toBuffer();
  const output = await sharp({ create: { width: 496, height: 480, channels: 3, background: "#102030" } }).png().toBuffer();
  const calls = [];
  let queued;
  const client = createComfyUiClient({ ...QWEN_OUTPAINT_CLIENT_OPTIONS,
    baseUrl: "http://comfy.example/", randomId: () => options.artifactKey, randomSeed: () => options.seed,
    waitImpl: async () => {}, pollIntervalMs: 0, webSocketFactory: null,
    fetchImpl: async (url, init) => {
      const pathname = new URL(url).pathname;
      calls.push(pathname);
      if (pathname === "/prompt") {
        queued = JSON.parse(init.body).prompt;
        return Response.json({ prompt_id: "prompt-qwen-123", node_errors: {} });
      }
      if (pathname === "/history/prompt-qwen-123") return Response.json({ "prompt-qwen-123": {
        outputs: { output: { images: [{ filename, type: "output", subfolder: "" }] } },
        status: { completed: true, status_str: "success", messages: [] },
      } });
      if (pathname === "/view") return new Response(output, { headers: { "Content-Type": "image/png" } });
      throw new Error(`未声明的内存请求：${pathname}`);
    },
  });
  return { client, calls, output, queued: () => queued, request: {
    ...options.generationRequest, width: options.width, height: options.height,
    images: [{ fileName: "source.png", image_url: `data:image/png;base64,${input.toString("base64")}` }],
  } };
}

test("专用客户端通过真实 PNG 字节归档尺寸与 SHA-256，结果仍经过最终保真合成", async () => {
  const fixture = await clientFixture();
  const result = await fixture.client.generateImage(fixture.request);
  assert.equal(fixture.queued().output.inputs.filename_prefix, qwenOutpaintArtifactPrefix(options.artifactKey));
  assert.deepEqual(fixture.queued().output.inputs.images, ["composite", 0]);
  assert.deepEqual([result.metadata.outputWidth, result.metadata.outputHeight], [496, 480]);
  assert.deepEqual([result.metadata.targetWidth, result.metadata.targetHeight], [512, 512]);
  assert.equal(result.metadata.outputSha256, createHash("sha256").update(fixture.output).digest("hex"));
  assert.equal(result.metadata.artifactKey, options.artifactKey);
  assert.equal(result.metadata.promptId, "prompt-qwen-123");
});

test("专用客户端拒绝其他 Qwen 请求或 Flux 的旧产物且不下载错图", async () => {
  for (const filename of ["CanvasLab_QwenOutpaint_qwen-request-456_00001_.png", "CanvasLab_Outpaint_qwen-request-123_00001_.png"]) {
    const fixture = await clientFixture({ filename });
    await assert.rejects(() => fixture.client.generateImage(fixture.request), (error) => error.code === "output_identity");
    assert.equal(fixture.calls.includes("/view"), false);
  }
});

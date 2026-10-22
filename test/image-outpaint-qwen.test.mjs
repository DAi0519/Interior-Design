/**
 * [INPUT]: 依赖 Qwen 扩图工厂、能力准入与元数据合同、通用 ComfyUI 客户端及内存节点/HTTP 替身
 * [OUTPUT]: 对外提供 Janus 原图动态正文直接保存/正向编码且无固定前缀、无拼接节点准入与执行正文原文捕获、2511/专属 Lightning 隔离、统一推理尺度/遮罩采样与单一路径整图重建、无原图回贴的来源/边界连续性及产物身份/Schema 漂移阻断测试
 * [POS]: test 的独立 Qwen 扩图合同回归，不访问远端、不提交 GPU、不读取用户工作流
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import sharp from "sharp";
import { createComfyUiClient } from "../src/comfyui-client.mjs";
import { executeImageOutpaint } from "../src/image-outpaint-service.mjs";
import { buildRecordFields } from "../src/lark-sync.mjs";
import {
  QWEN_OUTPAINT_CLIENT_OPTIONS,
  QWEN_OUTPAINT_ENGINE_KEY,
  QWEN_OUTPAINT_JANUS_QUESTION,
  QWEN_OUTPAINT_REQUIRED_NODES,
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
    JanusModelLoader: schema({ model_name: [["deepseek-ai/Janus-Pro-1B"]] }, ["JANUS_MODEL", "JANUS_PROCESSOR"]),
    JanusImageUnderstanding: schema({ model: link("JANUS_MODEL"), processor: link("JANUS_PROCESSOR"), image: link("IMAGE"), question: ["STRING"], seed: ["INT", { min: 0 }], temperature: ["FLOAT", { min: 0, max: 2 }], top_p: ["FLOAT", { min: 0, max: 1 }], max_new_tokens: ["INT", { min: 1, max: 4096 }] }, ["STRING"]),
    SaveText: schema({ text: ["STRING"], filename_prefix: ["STRING"], format: [["txt", "json"]] }, ["STRING"]),
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
  assert.ok(!Object.values(graph).some((node) => /Goohai|lrzjason|FluxGuidance|EmptyLatent/.test(node.class_type)));
});

test("Janus只分析未扩边原图，动态正文经SaveText直达正向编码且不拼接固定前缀", () => {
  const graph = createQwenOutpaintWorkflow({ ...options, generationRequest: {
    ...options.generationRequest, prompt: "whole image redraw", janusModel: "another-model", janusSeed: 123,
  } });
  assert.deepEqual(graph["janus-model"], { class_type: "JanusModelLoader", inputs: { model_name: "deepseek-ai/Janus-Pro-1B" } });
  assert.deepEqual(graph.describe.inputs, {
    model: ["janus-model", 0], processor: ["janus-model", 1], image: ["input", 0],
    question: QWEN_OUTPAINT_JANUS_QUESTION, seed: 298596445848600, temperature: 0.1, top_p: 0.95, max_new_tokens: 999,
  });
  assert.match(QWEN_OUTPAINT_JANUS_QUESTION, /English/);
  assert.equal(Object.keys(graph).length, 25);
  assert.equal(Object.hasOwn(graph, "prompt"), false);
  assert.doesNotMatch(JSON.stringify(graph), /StringConcatenate|Scene continuation:|gray canvas|grey canvas/i);
  assert.deepEqual(graph["prompt-output"], { class_type: "SaveText", inputs: {
    text: ["describe", 0], filename_prefix: `${qwenOutpaintArtifactPrefix(options.artifactKey)}_prompt`, format: "txt",
  } });
  assert.deepEqual(graph.positive.inputs.prompt, ["prompt-output", 0]);
  assert.equal(graph.negative.inputs.prompt, "");
  assert.equal(JSON.stringify(graph).includes("whole image redraw"), false);
});

test("条件与采样共用同尺度工作图、遮罩同步缩放，恢复目标后直接输出同一解码图", () => {
  const graph = createQwenOutpaintWorkflow(options);
  const input = nodeOf(graph, "easy loadImageBase64");
  const pad = nodeOf(graph, "ImagePadForOutpaint");
  const encode = nodeOf(graph, "VAEEncode");
  const masked = nodeOf(graph, "SetLatentNoiseMask");
  const sample = nodeOf(graph, "KSampler");
  const decode = nodeOf(graph, "VAEDecode");
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
  assert.deepEqual(graph.restore.inputs.image, [decode.id, 0]);
  assert.deepEqual(graph.outputSize.inputs.image, [pad.id, 0]);
  assert.deepEqual(graph.restore.inputs.width, ["outputSize", 0]);
  assert.deepEqual(graph.restore.inputs.height, ["outputSize", 1]);
  assert.deepEqual(output.inputs.images, ["restore", 0]);
  assert.equal(Object.values(graph).some((node) => node.class_type === "ImageCompositeMasked"), false, "不得把VAE重建图与原图再次拼合");
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
    assert.deepEqual(graph.output.inputs.images, ["restore", 0]);
    assert.equal("composite" in graph, false);
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

// -------- 非GPU语义替身：完整解码图具有连续色调，最终不混入另一套原图像素 --------
function sizeLink(graph, value, fixture) {
  const size = graph[value[0]];
  assert.equal(size.class_type, "GetImageSize");
  const imageKey = size.inputs.image[0];
  const dimensions = imageKey === "pad" ? fixture : imageKey === "inference" ? qwenOutpaintInferenceDimensions(fixture) : null;
  assert.ok(dimensions, `尺寸必须来自扩图目标或模型工作图，实际来自${imageKey}`);
  return [dimensions.width, dimensions.height][value[1]];
}

async function reconstructedFromGraph(graph, fixture) {
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
  const maskBytes = await sharp(workingMask).extractChannel("red").raw().toBuffer();
  const centerX = Math.floor((edge.left + sourceWidth / 2) * work.width / width);
  const centerY = Math.floor((edge.top + sourceHeight / 2) * work.height / height);
  assert.equal(maskBytes[centerY * work.width + centerX], 0, "原图中心仍受latent采样遮罩约束");
  assert.equal(maskBytes[0], 255, "扩展区域仍参与采样");
  const decoded = Buffer.alloc(work.width * work.height * 3);
  for (let y = 0; y < work.height; y += 1) {
    for (let x = 0; x < work.width; x += 1) {
      const tone = Math.round(x * 40 / work.width + y * 30 / work.height);
      const offset = (y * work.width + x) * 3;
      decoded.set([40 + tone, 60 + tone, 80 + tone], offset);
    }
  }
  const generated = await sharp(decoded, { raw: { ...work, channels: 3 } }).png().toBuffer();
  const outputSource = graph[graph.output.inputs.images[0]];
  assert.equal(outputSource.class_type, "ImageScale");
  assert.deepEqual(outputSource.inputs.image, ["decode", 0]);
  const result = await sharp(generated).resize(sizeLink(graph, outputSource.inputs.width, fixture), sizeLink(graph, outputSource.inputs.height, fixture), { fit: "fill", kernel: "lanczos3" }).png().toBuffer();
  const expected = await sharp(generated).resize(width, height, { fit: "fill", kernel: "lanczos3" }).removeAlpha().raw().toBuffer();
  const actual = await sharp(result).removeAlpha().raw().toBuffer();
  assert.deepEqual(actual, expected, "最终每个像素必须来自完整解码图的同一次尺寸恢复");
  const protectedBytes = await sharp(result).extract(protectedCenter).removeAlpha().raw().toBuffer();
  const originalCenter = await sharp(original).extract({ left: 32, top: 32, width: sourceWidth - 64, height: sourceHeight - 64 }).removeAlpha().raw().toBuffer();
  assert.notDeepEqual(protectedBytes, originalCenter, "不能用原图中心像素覆盖VAE重建结果");
  const pixel = (x, y, channel) => actual[(y * width + x) * 3 + channel];
  for (let channel = 0; channel < 3; channel += 1) {
    for (const x of [edge.left, edge.left + sourceWidth]) {
      for (let y = 0; y < height; y += 1) assert.ok(Math.abs(pixel(x, y, channel) - pixel(x - 1, y, channel)) <= 2, "原图左右边界不得重新引入色调跳变");
    }
    for (const y of [edge.top, edge.top + sourceHeight]) {
      for (let x = 0; x < width; x += 1) assert.ok(Math.abs(pixel(x, y, channel) - pixel(x, y - 1, channel)) <= 2, "原图上下边界不得重新引入色调跳变");
    }
  }
  const metadata = await sharp(result).metadata();
  assert.deepEqual([metadata.width, metadata.height], [width, height]);
}

test("非GPU图像语义验证：2K/4K完整解码图恢复尺寸后不被原图回贴打断色调连续性", async () => {
  for (const fixture of [geometryCases[1], geometryCases[2]]) {
    const graph = createQwenOutpaintWorkflow({ ...options, ...fixture, generationRequest: fixture });
    await reconstructedFromGraph(graph, fixture);
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

test("Janus或SaveText缺失及STRING端口漂移拒绝准入，移除拼接节点不影响可用性", () => {
  for (const className of ["JanusModelLoader", "JanusImageUnderstanding", "SaveText"]) {
    const missing = objectInfo();
    delete missing[className];
    assert.throws(() => verifyQwenOutpaintCapabilities(missing), new RegExp(className));
  }
  assert.equal("StringConcatenate" in objectInfo(), false);
  assert.equal(QWEN_OUTPAINT_REQUIRED_NODES.includes("StringConcatenate"), false);
  assert.doesNotThrow(() => verifyQwenOutpaintCapabilities(objectInfo()));
  const wrongModel = objectInfo();
  wrongModel.JanusModelLoader.input.required.model_name[0] = ["deepseek-ai/Janus-Pro-7B"];
  assert.throws(() => verifyQwenOutpaintCapabilities(wrongModel), /JanusModelLoader.model_name/);
  for (const [className, field] of [["SaveText", "text"], ["TextEncodeQwenImageEditPlus", "prompt"]]) {
    const wrongPort = objectInfo();
    wrongPort[className].input.required[field] = ["IMAGE"];
    assert.throws(() => verifyQwenOutpaintCapabilities(wrongPort), new RegExp(`${className}.${field}`));
  }
  const wrongDescription = objectInfo();
  wrongDescription.JanusImageUnderstanding.output = ["IMAGE"];
  assert.throws(() => verifyQwenOutpaintCapabilities(wrongDescription), /SaveText.text/);
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
  assert.equal(metadata.preservation, "latent-mask-vae-reconstruction");
  assert.equal(metadata.sourcePixelsPreserved, false);
  assert.deepEqual([metadata.inferenceWidth, metadata.inferenceHeight], [1024, 1024]);
  assert.equal(metadata.inferencePixels, 1024 * 1024);
  assert.equal(metadata.inferenceMegapixels, 1);
  assert.equal(metadata.outputSizeStrategy, "restore-target-from-masked-sampling");
  assert.equal(metadata.outputResampling, "lanczos");
  assert.equal(metadata.outputRestored, true);
  assert.equal(metadata.upscaleModel, null, "尺寸恢复不可标记为AI超分");
  assert.equal(metadata.workflowVersion, "2026-10-20.1");
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

test("元数据只捕获实际文本输出，未返回/空/多条正文不得伪造最终 Prompt", () => {
  const finalPrompt = "  A quiet room with warm pendant lighting.\nPreserve the room perspective.  ";
  const metadata = qwenOutpaintWorkflowMetadata({ ...options,
    historyOutputs: { "prompt-output": { text: [finalPrompt] } },
  });
  assert.equal(metadata.finalPrompt, finalPrompt);
  assert.equal(metadata.finalPromptCaptured, true);
  assert.equal(metadata.promptSource, "Janus-Pro-1B");
  assert.deepEqual(metadata.promptGenerator, {
    model: "deepseek-ai/Janus-Pro-1B", seed: 298596445848600, temperature: 0.1, topP: 0.95, maxNewTokens: 999,
    question: QWEN_OUTPAINT_JANUS_QUESTION, imageSource: "original-before-padding",
  });
  for (const text of [undefined, [], [""], [" \n "], [null], [42], ["first", "second"], finalPrompt]) {
    const missing = qwenOutpaintWorkflowMetadata({ ...options, historyOutputs: { "prompt-output": { text } } });
    assert.equal(missing.finalPrompt, "");
    assert.equal(missing.finalPromptCaptured, false);
  }
  const unrelated = qwenOutpaintWorkflowMetadata({ ...options,
    generationRequest: { ...options.generationRequest, prompt: "伪造请求正文" },
    historyOutputs: { describe: { text: ["Janus动态描述尚未经过SaveText确认"] } },
  });
  assert.equal(unrelated.finalPrompt, "");
  assert.equal(unrelated.finalPromptCaptured, false);
});

// -------- 内存传输：实测输出尺寸/摘要与请求级唯一产物须同时成立 --------
async function clientFixture({ filename = "CanvasLab_QwenOutpaint_qwen-request-123_00001_.png",
  promptText = ["  A quiet room with warm pendant lighting.\nPreserve the room perspective.  "],
  outputWidth = 496, outputHeight = 480,
} = {}) {
  const input = await sharp({ create: { width: 480, height: 480, channels: 3, background: "#506070" } }).png().toBuffer();
  const output = await sharp({ create: { width: outputWidth, height: outputHeight, channels: 3, background: "#102030" } }).png().toBuffer();
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
        outputs: { output: { images: [{ filename, type: "output", subfolder: "" }] }, "prompt-output": { text: promptText } },
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

test("专用客户端通过真实 PNG 字节归档尺寸与 SHA-256，整图输出保留实际重建来源", async () => {
  const fixture = await clientFixture();
  const result = await fixture.client.generateImage(fixture.request);
  assert.equal(fixture.queued().output.inputs.filename_prefix, qwenOutpaintArtifactPrefix(options.artifactKey));
  assert.deepEqual(fixture.queued().output.inputs.images, ["restore", 0]);
  assert.deepEqual([result.metadata.outputWidth, result.metadata.outputHeight], [496, 480]);
  assert.deepEqual([result.metadata.targetWidth, result.metadata.targetHeight], [512, 512]);
  assert.equal(result.metadata.outputSha256, createHash("sha256").update(fixture.output).digest("hex"));
  assert.equal(result.metadata.artifactKey, options.artifactKey);
  assert.equal(result.metadata.promptId, "prompt-qwen-123");
  assert.equal(result.metadata.preservation, "latent-mask-vae-reconstruction");
  assert.equal(result.metadata.sourcePixelsPreserved, false);
  assert.equal(result.metadata.finalPrompt, "  A quiet room with warm pendant lighting.\nPreserve the room perspective.  ");
  assert.equal(result.metadata.finalPromptCaptured, true);
});

test("客户端实际 History 未返回有效SaveText正文时明确记录未捕获", async () => {
  for (const promptText of [[], [""], ["a", "b"], [42]]) {
    const fixture = await clientFixture({ promptText });
    const result = await fixture.client.generateImage({ ...fixture.request, prompt: "不要归档这个请求值" });
    assert.equal(result.metadata.finalPrompt, "");
    assert.equal(result.metadata.finalPromptCaptured, false);
  }
});

test("同一次 History 的Janus原文经客户端和扩图服务进入飞书归档字段", async () => {
  const fixture = await clientFixture({ outputWidth: 2048, outputHeight: 2048 });
  let archived;
  const result = await executeImageOutpaint({ outpaintEngine: QWEN_OUTPAINT_ENGINE_KEY,
    referenceImages: [{ name: "source.png", dataUrl: fixture.request.images[0].image_url }],
    outpaintCanvas: { ratio: "1:1", scale: 2 / 3 },
    prompt: "未执行的用户请求值",
  }, {
    imageClient: { generateImage: (request) => fixture.client.generateImage(request) },
    scheduleSync(payload) { archived = payload; return { generationId: "captured-prompt", status: "pending" }; },
  });
  assert.equal(result.upstream.metadata.finalPromptCaptured, true);
  assert.equal(archived.finalPrompt, result.upstream.metadata.finalPrompt);
  assert.equal(archived.workflow.promptId, "prompt-qwen-123");
  assert.equal(archived.workflow.finalPromptCaptured, true);
  assert.equal(archived.preview.resolution, "2K");
  assert.equal(buildRecordFields({ ...archived, actualSize: "2048x2048" })["最终 Prompt"], result.upstream.metadata.finalPrompt);
  assert.equal(JSON.stringify(archived).includes("未执行的用户请求值"), false);
});

test("专用客户端拒绝其他 Qwen 请求或 Flux 的旧产物且不下载错图", async () => {
  for (const filename of ["CanvasLab_QwenOutpaint_qwen-request-456_00001_.png", "CanvasLab_Outpaint_qwen-request-123_00001_.png"]) {
    const fixture = await clientFixture({ filename });
    await assert.rejects(() => fixture.client.generateImage(fixture.request), (error) => error.code === "output_identity");
    assert.equal(fixture.calls.includes("/view"), false);
  }
});

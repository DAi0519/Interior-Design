/**
 * [INPUT]: 依赖Qwen遮罩工作流/服务/归档、静态MaaS端口快照及sharp合成图片
 * [OUTPUT]: 双图条件/图像遮罩同尺度/完整重绘、真实推理尺寸与模型归档、独立路由及失败零GPU回归
 * [POS]: test 的Qwen遮罩合同验证，不调用网络、GPU或真实飞书CLI
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { createQwenMaskFillWorkflow, qwenMaskFillMetadata, qwenMaskFillArtifactPrefix } from "../src/image-mask-fill-qwen.mjs";
import { readImageMaskFillConfig, validateMaskFillInput, executeImageMaskFill } from "../src/image-mask-fill-service.mjs";
import { createGenerationService } from "../src/generation-service.mjs";
import { createGenerationJobApiHandler } from "../src/generation-job-api.mjs";
import { maskFillRecordFields } from "../src/image-mask-fill-archive.mjs";
import { qwenMaskFillObjectInfo } from "./image-mask-fill-qwen-fixture.mjs";

const sourceBytes = await sharp({ create: { width: 96, height: 64, channels: 3, background: "#aabbcc" } }).png().toBuffer();
const maskBytes = await sharp({ create: { width: 96, height: 64, channels: 3, background: "#ffffff" } }).png().toBuffer();
const image = (bytes, name) => ({ dataUrl: `data:image/png;base64,${bytes.toString("base64")}`, type: "image/png", name, size: bytes.length });
const input = { maskFillModel: "qwenImageEdit2511", referenceImages: [image(sourceBytes, "source.png")], maskImage: image(maskBytes, "mask.png"), prompt: "Replace the lamp with a red geometric pendant." };
const historyOutputs = { inferenceWidth: { text: ["1256"] }, inferenceHeight: { text: ["832"] } };
const result = request => ({ images: [{ url: image(sourceBytes).dataUrl }], outputFormat: "png", transport: "fixture",
  metadata: qwenMaskFillMetadata({ generationRequest: request, historyOutputs, actualOutputWidth: 96, actualOutputHeight: 64, promptId: "qwen-fixture", seed: 42 }) });
const client = { getObjectInfo: async () => qwenMaskFillObjectInfo(), generateImage: async request => result(request) };

test("Qwen双模式条件、VAE与噪声遮罩共用实际推理尺寸，完整重绘后恢复crop再回贴", () => {
  for (const mode of ["prompt", "reference"]) {
    const graph = createQwenMaskFillWorkflow({ artifactKey: "qwen-mask-fixture-123", imageBase64: "source-once", seed: 42,
      generationRequest: { maskFillMode: mode, maskBase64: "mask-once", fillReferenceBase64: "reference-once", prompt: input.prompt, sourceWidth: 4096, sourceHeight: 3072 } });
    assert.equal(graph.sample.inputs.denoise, 1);
    assert.equal(graph.sample.inputs.steps, 4);
    assert.equal(graph.lightning.inputs.lora_name, "Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors");
    assert.equal(graph.crop.inputs.preresize, false);
    assert.equal(graph.crop.inputs.output_resize_to_target_size, false);
    assert.equal(graph.inference.inputs.megapixels, 1);
    assert.equal(graph.inference.inputs.resolution_steps, 8);
    assert.deepEqual(graph.positive.inputs.image1, graph.encode.inputs.pixels);
    assert.deepEqual(graph.maskScale.inputs.width, ["size", 0]);
    assert.deepEqual(graph.maskScale.inputs.height, ["size", 1]);
    assert.equal(graph.maskScale.inputs.upscale_method, "bilinear");
    assert.deepEqual(graph.noiseMask.inputs.mask, ["inferenceMask", 0]);
    assert.deepEqual(graph.restore.inputs.width, ["cropSize", 0]);
    assert.deepEqual(graph.stitch.inputs.inpainted_image, ["restore", 0]);
    assert.equal(graph.outputScale.inputs.width, 2048);
    assert.equal(graph.outputScale.inputs.height, 1536);
    assert.equal(graph.positive.inputs.prompt, input.prompt);
    assert.equal(graph.negative.inputs.prompt, "");
    assert.deepEqual(graph.positive.inputs.image2, mode === "reference" ? ["reference", 0] : undefined);
    assert.deepEqual(graph.negative.inputs.image2, graph.positive.inputs.image2);
    const uploads = Object.values(graph).filter(node => node.class_type === "easy loadImageBase64");
    assert.equal(uploads.length, mode === "reference" ? 3 : 2);
    assert.equal(new Set(uploads.map(node => node.inputs.save_prefix)).size, uploads.length);
    assert.equal(Object.values(graph).some(node => /Flux|ReferenceLatent|BiRef|Janus/.test(node.class_type)), false);
  }
  assert.throws(() => qwenMaskFillArtifactPrefix("../unsafe"));
  assert.notEqual(qwenMaskFillArtifactPrefix("request-123"), qwenMaskFillArtifactPrefix("request-456"));
});

test("Qwen只接受约1MP合同，记录同次History尺寸；缺证据不冒充2K或原图尺度", async () => {
  const validated = await validateMaskFillInput(input);
  assert.equal(validated.inferenceTier, "1mp");
  assert.equal(validated.inferenceSize, null);
  for (const tier of ["2k", "4k", "original", null]) await assert.rejects(validateMaskFillInput({ ...input, inferenceTier: tier }), /1MP/);
  const metadata = qwenMaskFillMetadata({ generationRequest: { prompt: input.prompt }, historyOutputs });
  assert.equal(metadata.inferenceWidth, 1256);
  assert.equal(metadata.inferenceHeight, 832);
  assert.equal(metadata.inferenceSize, 1256);
  assert.equal(metadata.inferenceDimensionSource, "history");
  const missing = qwenMaskFillMetadata({ generationRequest: { prompt: input.prompt }, historyOutputs: { inferenceWidth: { text: ["NaN"] } } });
  assert.equal(missing.inferenceSize, null);
  assert.deepEqual(maskFillRecordFields({ feature: "image-mask-fill", mode: "prompt", inferenceTier: "1mp", inferenceSize: null, maskExpand: 10, workflowVersion: "qwen.1" })["局部推理尺寸（px）"], null);
});

test("独立Qwen目录与Flux节点隔离，模型或端口缺失前置拒绝且不调用GPU", async () => {
  const config = await readImageMaskFillConfig(null, { qwenMaskFillClient: client });
  assert.equal(config.models.find(model => model.key === "flux2Klein").available, false);
  const qwen = config.models.find(model => model.key === "qwenImageEdit2511");
  assert.equal(qwen.available, true);
  assert.deepEqual(qwen.inferenceTiers.map(tier => tier.key), ["1mp"]);
  let calls = 0;
  for (const change of [schema => { schema.UNETLoader.input.required.unet_name = [["wrong-model"]]; },
    schema => { delete schema.TextEncodeQwenImageEditPlus.input.optional.image2; }]) {
    const schema = qwenMaskFillObjectInfo(); change(schema);
    await assert.rejects(executeImageMaskFill({ ...input, maskFillMode: "reference", fillReferenceImage: image(sourceBytes, "reference.png") },
      { imageClient: { getObjectInfo: async () => schema, generateImage: async () => { calls++; } } }), /能力检查未通过/);
  }
  assert.equal(calls, 0);
});

test("统一路由只调用Qwen遮罩客户端，归档真实模型/实际推理尺寸/原图和独立参考图", async () => {
  const forbidden = () => assert.fail("不应调用Flux、Qwen扩图或OneAPI");
  let archive, checks = 0;
  const service = createGenerationService({ qwenMaskFillClient: client, imageMaskFillClient: { generateImage: forbidden },
    qwenImageClient: { generateImage: forbidden }, imageClientForModel: forbidden, requireApiKey: forbidden,
    verifyMaskFillSyncContract: async () => { checks++; }, scheduleGenerationSync: value => { archive = value; return { status: "pending" }; } });
  const completed = await service.executeForMode("imageMaskFill", { ...input, maskFillMode: "reference", fillReferenceImage: image(sourceBytes, "reference.png") });
  assert.equal(checks, 1);
  assert.equal(completed.workflow.key, "qwen-mask-fill");
  assert.equal(completed.sync.status, "pending");
  assert.equal(archive.modelLabel, "Qwen Image Edit 2511");
  assert.equal(archive.finalPrompt, input.prompt);
  assert.equal(archive.workflow.inferenceTier, "1mp");
  assert.equal(archive.workflow.inferenceSize, 1256);
  assert.equal(archive.maskImage.fileName, "mask.png");
  assert.equal(archive.fillReferenceImage.fileName, "reference.png");
  assert.equal(archive.referenceImages.length, 1);
  assert.equal(archive.workflow.promptSource, "submitted ComfyUI text condition");
});

test("Qwen任务入口冻结真实模型/Provider/档位，旧Flux目录不能替代Qwen可用性", async () => {
  const queued = [], calls = [];
  let response, config = { modes: [{ key: "prompt", available: true }] };
  const body = { jobId: "generation-qwen-mask-api-12345", featureMode: "imageMaskFill", sharedInput: input,
    items: [{ key: "forged-flux", provider: "oneapi", input: {} }] };
  const handler = createGenerationJobApiHandler({ readJson: async () => body,
    sendJson: (_, code, value) => { response = { code, ...value }; }, getImageMaskFillConfig: async () => config,
    generationJobs: { enqueue(id, details, run) { queued.push({ id, details, run }); return { jobId: id }; } },
    generationService: { executeForMode: async (_, value) => { calls.push(value); return { sync: { status: "pending" } }; } } });
  await handler({ method: "POST" }, {}, "/api/generation-jobs");
  assert.equal(response.code, 409); assert.equal(queued.length, 0);
  config = { models: [{ key: "qwenImageEdit2511", modes: [{ key: "prompt", label: "Qwen提示词编辑", available: true }] }] };
  await handler({ method: "POST" }, {}, "/api/generation-jobs");
  assert.equal(response.code, 202);
  assert.deepEqual(queued[0].details.stages, { comfyUi: "submitting" });
  await queued[0].run(() => {});
  assert.equal(calls[0].maskFillModel, "qwenImageEdit2511");
  assert.equal(calls[0].inferenceTier, "1mp");
  assert.equal(calls[0].maskFillMode, "prompt");
});

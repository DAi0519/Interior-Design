/**
 * [INPUT]: 依赖 Qwen/Flux/Sunburst 扩图服务、Qwen 执行图、统一生成路由、HTTP 任务准入与 sharp 图片样本
 * [OUTPUT]: 对外提供 Qwen 固定2K/4K输入/EXIF与画幅适配、独立能力缓存/Janus及推理缩放节点缺失前置409阻断、Janus原文无前缀透传/无拼接节点准入、执行Prompt与整图重建来源/无回贴能力的飞书追溯及专用客户端隔离测试
 * [POS]: test 的 Qwen 扩图应用边界验证，使用内存替身，不启动 GPU 或收费任务
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import {
  createImageOutpaintConfigReader, executeImageOutpaint, normalizeImageOutpaintInput,
} from "../src/image-outpaint-service.mjs";
import {
  QWEN_OUTPAINT_ENGINE_KEY, QWEN_OUTPAINT_WORKFLOW, createQwenOutpaintWorkflow, publicQwenOutpaintConfig, qwenOutpaintWorkflowMetadata,
} from "../src/image-outpaint-qwen.mjs";
import { createGenerationService } from "../src/generation-service.mjs";
import { createGenerationJobApiHandler } from "../src/generation-job-api.mjs";
import { buildRecordFields } from "../src/lark-sync.mjs";

const bytes = await sharp({ create: { width: 403, height: 301, channels: 3, background: "#7693a4" } }).png().toBuffer();
const source = { dataUrl: `data:image/png;base64,${bytes.toString("base64")}`, name: "input.png", width: 9000, height: 9000 };
const input = {
  outpaintEngine: QWEN_OUTPAINT_ENGINE_KEY, referenceImages: [source],
  outpaintCanvas: { ratio: "16:9", resolution: "2K", position: { x: 0.2, y: 0.8 } },
};

function capabilityFixture() {
  const outputs = {
    "easy loadImageBase64": ["IMAGE", "MASK"], UNETLoader: ["MODEL"], CLIPLoader: ["CLIP"], VAELoader: ["VAE"],
    JanusModelLoader: ["JANUS_MODEL", "JANUS_PROCESSOR"], JanusImageUnderstanding: ["STRING"],
    SaveText: ["STRING"],
    ModelSamplingAuraFlow: ["MODEL"], CFGNorm: ["MODEL"], LoraLoaderModelOnly: ["MODEL"], ImagePadForOutpaint: ["IMAGE", "MASK"],
    TextEncodeQwenImageEditPlus: ["CONDITIONING"], VAEEncode: ["LATENT"], SetLatentNoiseMask: ["LATENT"],
    ImageScaleToTotalPixels: ["IMAGE"], GetImageSize: ["INT", "INT", "INT"],
    ImageScale: ["IMAGE"], MaskToImage: ["IMAGE"], ImageToMask: ["MASK"],
    KSampler: ["LATENT"], VAEDecode: ["IMAGE"], SaveImage: [],
  };
  const graph = createQwenOutpaintWorkflow({
    artifactKey: "qwen-fixture", generationRequest: {
      sourceWidth: 403, sourceHeight: 301, preparedWidth: 403, preparedHeight: 301,
      expansion: { left: 100, right: 521, top: 80, bottom: 387 },
    }, width: 1024, height: 768, imageBase64: "", seed: 1,
  });
  const result = {};
  for (const node of Object.values(graph)) {
    result[node.class_type] ||= { input: { required: {} }, output: outputs[node.class_type] };
    for (const [field, value] of Object.entries(node.inputs)) {
      const type = Array.isArray(value) ? outputs[graph[value[0]].class_type][value[1]]
        : typeof value === "string" ? "STRING" : typeof value === "boolean" ? "BOOLEAN" : "NUMBER";
      result[node.class_type].input.required[field] = [type];
    }
  }
  return result;
}

function generated(request) {
  return { images: [{ url: "data:image/png;base64,fixture" }], outputFormat: "png", metadata: qwenOutpaintWorkflowMetadata({
    width: request.width, height: request.height, generationRequest: request,
    actualOutputWidth: request.width, actualOutputHeight: request.height, artifactKey: "qwen-fixture", seed: 1,
    historyOutputs: { "prompt-output": { text: ["A calm room with warm lighting."] } },
  }) };
}

test("Qwen 按真实原尺寸构图且不套用 Flux ceil32，五种比例均保持目标16px对齐", async () => {
  assert.equal(publicQwenOutpaintConfig().resolution, "2K");
  for (const ratio of ["1:1", "4:3", "16:9", "3:4", "9:16"]) {
    const normalized = await normalizeImageOutpaintInput({ ...input, outpaintCanvas: { ...input.outpaintCanvas, ratio } });
    assert.deepEqual(normalized.prepared, { width: 403, height: 301 });
    assert.equal(Math.max(normalized.width, normalized.height), 2048);
    assert.equal(normalized.outpaintCanvas.resolution, "2K");
    assert.equal(normalized.width % 16, 0);
    assert.equal(normalized.height % 16, 0);
    assert.equal(normalized.expansion.left + normalized.expansion.right + 403, normalized.width);
    assert.equal(normalized.expansion.top + normalized.expansion.bottom + 301, normalized.height);
    assert.deepEqual(Buffer.from(normalized.source.imageUrl.split(",")[1], "base64"), bytes);
  }
  await assert.rejects(normalizeImageOutpaintInput({ ...input, outpaintModel: "oneRewardFp8" }), (error) => error.statusCode === 400);
  await assert.rejects(normalizeImageOutpaintInput({ ...input, outpaintCanvas: undefined, expansion: { left: 5, right: 0, top: 3, bottom: 0 } }),
    (error) => error.statusCode === 400);
});

test("Qwen 在EXIF归一后计算原尺寸，超目标源图按需适配并记录真实提交事实", async () => {
  const rotated = await sharp(bytes).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const normalized = await normalizeImageOutpaintInput({ ...input, referenceImages: [{ dataUrl: `data:image/jpeg;base64,${rotated.toString("base64")}` }] });
  assert.deepEqual(normalized.originalSource, { width: 301, height: 403 });
  assert.deepEqual(normalized.prepared, normalized.originalSource);
  const larger = await sharp({ create: { width: 4096, height: 3072, channels: 3, background: "#7693a4" } }).png().toBuffer();
  const result = await executeImageOutpaint({ ...input, referenceImages: [{ dataUrl: `data:image/png;base64,${larger.toString("base64")}` }] }, {
    imageClient: { async generateImage(request) {
      const metadata = await sharp(Buffer.from(request.images[0].image_url.split(",")[1], "base64")).metadata();
      assert.deepEqual([metadata.width, metadata.height], [request.sourceWidth, request.sourceHeight]);
      assert.equal(request.sourceWidth, request.preparedWidth);
      return generated(request);
    } },
  });
  assert.deepEqual([result.upstream.metadata.originalSourceWidth, result.upstream.metadata.originalSourceHeight], [4096, 3072]);
  assert.equal(result.upstream.metadata.sourceResized, true);
});

test("Qwen 能力失败不缓存且独立于 Flux/Sunburst，恢复后缓存成功目录", async () => {
  let reads = 0;
  const valid = capabilityFixture();
  const invalid = structuredClone(valid);
  delete invalid.UNETLoader;
  const reader = createImageOutpaintConfigReader(null, { qwenImageClient: { async getObjectInfo() {
    reads += 1;
    return reads === 1 ? invalid : valid;
  } } });
  const first = await reader();
  assert.equal(first.engines.find((entry) => entry.key === QWEN_OUTPAINT_ENGINE_KEY).available, false);
  const second = await reader();
  assert.equal(second.available, false);
  assert.equal(second.engines.find((entry) => entry.key === QWEN_OUTPAINT_ENGINE_KEY).available, true);
  assert.equal((await reader()).engines.find((entry) => entry.key === QWEN_OUTPAINT_ENGINE_KEY).available, true);
  assert.equal(reads, 2);
});

test("Qwen 执行前复核依赖且零GPU阻断，成功结果归档真实模型并拒绝错尺寸", async () => {
  let calls = 0;
  const valid = capabilityFixture();
  for (const className of ["UNETLoader", "ImageScaleToTotalPixels", "GetImageSize", "ImageScale", "MaskToImage", "ImageToMask",
    "JanusModelLoader", "JanusImageUnderstanding", "SaveText"]) {
    const invalid = structuredClone(valid);
    delete invalid[className];
    await assert.rejects(executeImageOutpaint(input, { imageClient: { getObjectInfo: async () => invalid,
      generateImage() { calls += 1; },
    } }), (error) => error.statusCode === 409);
  }
  assert.equal(calls, 0);
  assert.equal("StringConcatenate" in valid, false);
  const result = await executeImageOutpaint(input, { imageClient: {
    getObjectInfo: async () => valid,
    async generateImage(request) {
      calls += 1;
      assert.equal(Object.hasOwn(request, "outpaintModel"), false);
      assert.equal(request.sourceWidth, 403);
      return generated(request);
    },
  } });
  assert.equal(calls, 1);
  assert.equal(result.request.model, QWEN_OUTPAINT_WORKFLOW.model);
  assert.equal(result.upstream.metadata.model, QWEN_OUTPAINT_WORKFLOW.model);
  assert.equal(Object.hasOwn(result.request, "outpaintModel"), false);
  assert.equal(result.workflow.key, QWEN_OUTPAINT_WORKFLOW.key);
  assert.equal(result.sync.status, "skipped");
  await assert.rejects(executeImageOutpaint(input, { imageClient: { async generateImage(request) {
    const wrong = generated(request);
    wrong.metadata.outputWidth += 16;
    return wrong;
  } } }), /实际输出尺寸/);
});

test("Qwen 使用专用客户端并绕过 OneAPI Key/通用模型后调度飞书归档", async () => {
  const service = createGenerationService({
    qwenImageClient: { generateImage: async (request) => generated(request) },
    imageOutpaintClient: { generateImage: () => assert.fail("不能调用 Flux") },
    imageClientForModel: () => assert.fail("不能路由至通用模型"),
    requireApiKey: () => assert.fail("不能要求 OneAPI Key"),
    scheduleGenerationSync: (archive) => {
      assert.equal(archive.workflow.feature, "image-outpaint");
      assert.equal(archive.modelLabel, QWEN_OUTPAINT_WORKFLOW.label);
      return { generationId: "qwen-sync", status: "pending" };
    },
  });
  const result = await service.executeForMode("imageOutpaint", input);
  assert.equal(result.workflow.key, QWEN_OUTPAINT_WORKFLOW.key);
  assert.equal(result.sync.status, "pending");
});

test("无原图回贴模式不依赖合成节点，遮罩约束与重建策略原样进入结果和飞书参数", async () => {
  const capabilities = capabilityFixture();
  assert.equal("ImageCompositeMasked" in capabilities, false);
  let archived;
  const result = await executeImageOutpaint(input, {
    imageClient: { getObjectInfo: async () => capabilities, async generateImage(request) {
      const graph = createQwenOutpaintWorkflow({ ...request, generationRequest: request, imageBase64: "", artifactKey: "qwen-fixture", seed: 1 });
      assert.equal(Object.hasOwn(graph, "prompt"), false);
      assert.deepEqual(graph["prompt-output"].inputs.text, ["describe", 0]);
      assert.deepEqual(graph.positive.inputs.prompt, ["prompt-output", 0]);
      assert.doesNotMatch(JSON.stringify(graph), /StringConcatenate|Scene continuation:|gray canvas|grey canvas/i);
      assert.deepEqual(graph.output.inputs.images, ["restore", 0]);
      assert.deepEqual(graph.sample.inputs.latent_image, ["mask", 0]);
      assert.deepEqual(graph.mask.inputs.mask, ["inferenceMask", 0]);
      return generated(request);
    } },
    scheduleSync(payload) { archived = payload; return { generationId: "qwen-single-source", status: "pending" }; },
  });
  const record = JSON.parse(buildRecordFields({ ...archived, actualSize: `${result.request.width}x${result.request.height}` })["生成参数"]);
  for (const metadata of [result.upstream.metadata, archived.workflow, record.workflow]) {
    assert.equal(metadata.preservation, "latent-mask-vae-reconstruction");
    assert.equal(metadata.sourcePixelsPreserved, false);
    assert.equal(metadata.outputSizeStrategy, "restore-target-from-masked-sampling");
    assert.equal(metadata.workflowVersion, "2026-10-20.1");
    assert.equal(metadata.upscaleModel, null);
    assert.equal(metadata.outputResampling, "lanczos");
    assert.equal(metadata.finalPromptCaptured, true);
    assert.equal(metadata.finalPrompt, "A calm room with warm lighting.");
    assert.equal(metadata.promptSource, "Janus-Pro-1B");
    assert.equal(metadata.promptGenerator.imageSource, "original-before-padding");
  }
  assert.equal(archived.finalPrompt, result.upstream.metadata.finalPrompt);
});

test("HTTP Qwen 按自身可用性准入并采用 comfyUi 阶段，不携带 Flux 默认模型", async () => {
  let available = true;
  let syncChecks = 0;
  let response, queued;
  const handler = createGenerationJobApiHandler({
    generationJobs: { enqueue(_id, metadata) { queued = metadata; return { id: "fixture" }; } },
    getImageOutpaintConfig: async () => ({ engines: [publicQwenOutpaintConfig({ available })] }),
    generationService: {},
    readJson: async () => ({ featureMode: "imageOutpaint", jobId: "generation-123456789012", items: [{ input }] }),
    sendJson(_response, status, body) { response = { status, body }; },
    verifySyncContract: async () => { syncChecks += 1; },
  });
  await handler({ method: "POST" }, {}, "/api/generation-jobs");
  assert.equal(response.status, 202);
  assert.deepEqual(queued.stages, { comfyUi: "submitting" });
  assert.equal(syncChecks, 1);
  available = false;
  queued = null;
  await handler({ method: "POST" }, {}, "/api/generation-jobs");
  assert.equal(response.status, 409);
  assert.equal(queued, null);
});

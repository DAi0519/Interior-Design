/**
 * [INPUT]: 依赖node:test/assert、超分数值合同/服务/执行图、任务API和内存任务注册表
 * [OUTPUT]: 验证双噪声实际送模及元数据、非法值零调用、入队冻结/原幂等、旧Flux/Beta省略为零与能力门禁
 * [POS]: test 的独立图片超分噪声合同测试，全部内存替身，不提交GPU或访问网络
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createGenerationJobApiHandler } from "../src/generation-job-api.mjs";
import { createGenerationJobRegistry } from "../src/generation-jobs.mjs";
import { executeImageUpscale, readImageUpscaleConfig } from "../src/image-upscale-service.mjs";
import {
  IMAGE_UPSCALE_WORKFLOWS, createImageUpscaleWorkflow, createSeedVrUpscaleStage,
  imageUpscaleTargetDimensions, imageUpscaleWorkflowMetadata,
  normalizeImageUpscaleNoise, publicImageUpscaleConfig,
} from "../src/image-upscale-workflow.mjs";

const imageUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z7JkAAAAASUVORK5CYII=";
const fields = ["upscaleInputNoiseScale", "upscaleLatentNoiseScale"];
const noise = { upscaleInputNoiseScale: 0.123, upscaleLatentNoiseScale: 0.456 };
const zero = { upscaleInputNoiseScale: 0, upscaleLatentNoiseScale: 0 };
const invalid = [-0.001, 1.001, 0.0005, NaN, Infinity, null, "", "0.1", true, {}, []];
const nextTurn = () => new Promise(resolve => setImmediate(resolve));

function requestBody(patch = {}) {
  return { featureMode: "imageUpscale", jobId: "generation-upscale-noise-123456",
    sharedInput: { ...noise }, items: [{ key: "youxing_seedvr2_3b", input: { resolution: "4K" } }], ...patch };
}

test("噪声只接受0..1的千分位数字，兼容省略为零并消除浮点尾差", () => {
  assert.deepEqual(normalizeImageUpscaleNoise(), zero);
  assert.deepEqual(normalizeImageUpscaleNoise({ upscaleInputNoiseScale: 1, upscaleLatentNoiseScale: 0.001 }),
    { upscaleInputNoiseScale: 1, upscaleLatentNoiseScale: 0.001 });
  assert.equal(normalizeImageUpscaleNoise({ upscaleInputNoiseScale: 0.1 + 0.2 }).upscaleInputNoiseScale, 0.3);
  for (const key of fields) for (const value of invalid) {
    assert.throws(() => normalizeImageUpscaleNoise({ [key]: value }), { statusCode: 400 });
  }
  const config = publicImageUpscaleConfig();
  assert.equal(config.supportsNoiseControls, true);
  assert.deepEqual(config.noiseParameters, { min: 0, max: 1, step: 0.001, default: 0 });
});

test("六工作流的双参数均直达SeedVR2节点并按实际数值记录元数据", () => {
  for (const workflow of Object.values(IMAGE_UPSCALE_WORKFLOWS)) {
    const resolution = workflow.resolutions[0].key;
    const generationRequest = { ...noise, resolution, upscaleWorkflowKey: workflow.key,
      sourceWidth: 640, sourceHeight: 480 };
    const target = imageUpscaleTargetDimensions({ width: 640, height: 480 }, resolution, workflow.key);
    const graph = createImageUpscaleWorkflow({ generationRequest, ...target,
      imageBase64: "", seed: 42, artifactKey: "noise-contract" });
    assert.equal(graph["75"].inputs.input_noise_scale, noise.upscaleInputNoiseScale);
    assert.equal(graph["75"].inputs.latent_noise_scale, noise.upscaleLatentNoiseScale);
    const metadata = imageUpscaleWorkflowMetadata({ generationRequest, resolution, ...target });
    for (const key of fields) assert.equal(metadata[key], noise[key]);
  }
  const legacy = createSeedVrUpscaleStage({ generationRequest: {
    upscaleWorkflowKey: "ks_seedvr2_2x_direct", resolution: "4K",
    input_noise_scale: 0.8, latent_noise_scale: 0.9,
  }, image: ["flux-output", 0], seed: 1, width: 4096, height: 2304 });
  assert.equal(legacy.nodes["75"].inputs.input_noise_scale, 0);
  assert.equal(legacy.nodes["75"].inputs.latent_noise_scale, 0);
});

test("服务将规范化参数完整交给工作流，返回实际请求及上游元数据", async () => {
  let calls = 0;
  const result = await executeImageUpscale({ ...noise, resolution: "4K", upscaleWorkflowKey: "youxing_seedvr2_3b",
    referenceImages: [{ dataUrl: imageUrl, type: "image/png", name: "source.png" }] }, {
    imageClient: { async generateImage(generationRequest) {
      calls += 1;
      const graph = createImageUpscaleWorkflow({ generationRequest, ...generationRequest,
        imageBase64: "", seed: 7, artifactKey: "service-noise" });
      assert.equal(graph["75"].inputs.input_noise_scale, 0.123);
      assert.equal(graph["75"].inputs.latent_noise_scale, 0.456);
      return { images: [{ url: imageUrl }], outputFormat: "png", transport: "comfyui-workflow",
        metadata: imageUpscaleWorkflowMetadata({ generationRequest, ...generationRequest, seed: 7 }) };
    } },
  });
  assert.equal(calls, 1);
  for (const key of fields) {
    assert.equal(result.request[key], noise[key]);
    assert.equal(result.upstream.metadata[key], noise[key]);
  }
});

test("非法参数在服务零客户端调用且API零入队前返回400", async () => {
  let calls = 0, enqueues = 0;
  for (const key of fields) for (const value of invalid) {
    await assert.rejects(executeImageUpscale({ [key]: value }, {
      imageClient: { async generateImage() { calls += 1; } },
    }), { statusCode: 400 });
    const body = requestBody();
    body.items[0].input[key] = value;
    let response;
    const handler = createGenerationJobApiHandler({
      generationJobs: { enqueue() { enqueues += 1; } },
      generationService: { async executeForMode() { calls += 1; } },
      readJson: async () => body,
      sendJson(_res, statusCode, data) { response = { statusCode, data }; },
    });
    await handler({ method: "POST" }, {}, "/api/generation-jobs");
    assert.equal(response.statusCode, 400);
    assert.match(response.data.error, /噪声/);
  }
  assert.equal(calls, 0);
  assert.equal(enqueues, 0);
});

test("入队后共享与逐项参数改动不污染冻结值，省略项固定为零", async () => {
  for (const explicit of [true, false]) {
    const body = requestBody({ sharedInput: explicit ? { ...noise } : {} });
    if (explicit) body.items[0].input.upscaleLatentNoiseScale = 0.789;
    let task, actual;
    const handler = createGenerationJobApiHandler({
      generationJobs: { enqueue(_id, _meta, run) { task = run; return { status: "running" }; } },
      generationService: { async executeForMode(_mode, input) { actual = input; return { images: [] }; } },
      readJson: async () => body, sendJson() {},
    });
    await handler({ method: "POST" }, {}, "/api/generation-jobs");
    body.sharedInput.upscaleInputNoiseScale = 0.9;
    body.sharedInput.upscaleLatentNoiseScale = 0.9;
    body.items[0].input.upscaleInputNoiseScale = 0.8;
    body.items[0].input.upscaleLatentNoiseScale = 0.8;
    await task(() => {});
    assert.equal(actual.upscaleInputNoiseScale, explicit ? 0.123 : 0);
    assert.equal(actual.upscaleLatentNoiseScale, explicit ? 0.789 : 0);
  }
});

test("重复jobId沿用原任务，不因新噪声数值二次执行", async () => {
  const registry = createGenerationJobRegistry();
  const body = requestBody();
  let calls = 0;
  const handler = createGenerationJobApiHandler({ generationJobs: registry,
    generationService: { async executeForMode() { calls += 1; return { images: [] }; } },
    readJson: async () => body, sendJson() {},
  });
  await handler({ method: "POST" }, {}, "/api/generation-jobs");
  await nextTurn();
  body.sharedInput.upscaleInputNoiseScale = 0.999;
  await handler({ method: "POST" }, {}, "/api/generation-jobs");
  await nextTurn();
  assert.equal(calls, 1);
});

test("实际节点不支持非零噪声值时目录阻止运行", async () => {
  const catalog = {};
  for (const workflow of Object.values(IMAGE_UPSCALE_WORKFLOWS)) {
    const resolution = workflow.resolutions[0].key;
    const graph = createImageUpscaleWorkflow({ generationRequest: { resolution, upscaleWorkflowKey: workflow.key },
      ...imageUpscaleTargetDimensions({ width: 640, height: 480 }, resolution, workflow.key),
      imageBase64: "", seed: 1, artifactKey: "noise-capability" });
    for (const node of Object.values(graph)) {
      const required = (catalog[node.class_type] ||= { input: { required: {} } }).input.required;
      for (const [field, value] of Object.entries(node.inputs)) {
        if (field === "model") {
          const choices = (required[field] ||= [[]])[0];
          if (!choices.includes(value)) choices.push(value);
        } else required[field] = [typeof value === "string" ? "STRING" : "ANY"];
      }
    }
  }
  catalog.SeedVR2VideoUpscaler.input.required.input_noise_scale = [[0]];
  const config = await readImageUpscaleConfig({
    async checkHealth() { return { available: true }; },
    async getObjectInfo(types) { return Object.fromEntries(types.map(type => [type, catalog[type]])); },
  });
  assert.ok(config.workflows.every(workflow => workflow.available === false));
  assert.ok(config.workflows.every(workflow => /input_noise_scale/.test(workflow.reason)));
});

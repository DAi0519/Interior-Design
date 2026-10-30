/**
 * [INPUT]: 依赖生成应用服务、模型目录、任务HTTP适配器与真实2:1 PNG夹具
 * [OUTPUT]: 对外提供R5_4独立路由、原尺寸无超分、缺客户端阻断、运行多光影目录及逐模板限额/版本防绕过与批次独立冻结验证
 * [POS]: test 的全景跨层合同测试，不向真实MaaS提交任务
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { createGenerationService } from "../src/generation-service.mjs";
import { createGenerationRequest, publicModelCatalog } from "../src/model-config.mjs";
import { createGenerationJobApiHandler, supportedGenerationFeatureCapabilities } from "../src/generation-job-api.mjs";
import { PANORAMA_WORKFLOW } from "../src/panorama-workflow.mjs";
import { preparePanoramaLightingInput } from "../src/panorama-lighting.mjs";

const bytes = await sharp({ create: { width: 128, height: 64, channels: 3, background: "#888888" } }).png().toBuffer();
const image = { dataUrl: `data:image/png;base64,${bytes.toString("base64")}`, name: "panorama.png", type: "image/png", size: bytes.length };
const input = { featureMode: "panoramaEnhancement", modelKey: "aiTextureEnhancement", referenceImages: [image],
  prompt: "夜间暖灯，压低窗外日光", resolution: "6K", ratioMode: "original" };

test("全景Flux目录、请求与真实路由使用R5_4原尺寸，普通Flux能力保留", async () => {
  const model = publicModelCatalog().find(model => model.key === input.modelKey);
  assert.equal(model.panoramaWorkflow.id, PANORAMA_WORKFLOW.id);
  assert.equal(model.panoramaWorkflow.version, PANORAMA_WORKFLOW.version);
  assert.ok(model.sizes.source["2K"]);
  const generation = createGenerationRequest(input);
  assert.equal(generation.request.resolution, "original");
  assert.equal(generation.request.width, 128);
  assert.equal(generation.request.height, 64);
  assert.equal(generation.preview.sizeMode, "panorama-source");
  assert.equal(generation.request.negative_prompt, "");
  assert.equal("upscale_resolution" in generation.request, false);
  let calls = 0, archived;
  const progress = () => {};
  const service = createGenerationService({
    imageClientForModel() { throw new Error("全景不得使用普通Flux客户端"); },
    panoramaClient: { async generateImage(request, options) {
      calls += 1;
      assert.equal(request.workflow_kind, PANORAMA_WORKFLOW.id);
      assert.equal(options.onProgress, progress);
      return { images: [{ url: image.dataUrl }], metadata: { workflowId: PANORAMA_WORKFLOW.id } };
    } },
    scheduleGenerationSync(value) { archived = value; return { status: "skipped" }; },
  });
  const result = await service.executeForMode("panoramaEnhancement", input, { onProgress: progress });
  assert.equal(calls, 1);
  assert.equal(result.request.resolution, "original");
  assert.equal(archived.workflow.panoramaLighting.mode, "custom");
  assert.equal(archived.sourcePrompt, input.prompt);
});

test("全景专用客户端缺失时阻断，不回退普通Flux生成", async () => {
  const service = createGenerationService({ imageClientForModel() { throw new Error("不应回退"); } });
  await assert.rejects(service.executeForMode("panoramaEnhancement", input), error => error.statusCode === 409);
});

test("主工作台全景批次在入队前冻结卡片，每份相同配置只读一次", async () => {
  let reads = 0, body, run, received = [], stages = [];
  const selection = { presetId: "recLighting", version: 3, sha256: "a".repeat(64) };
  const handler = createGenerationJobApiHandler({
    generationJobs: { enqueue(_id, _metadata, operation) { run = operation; return { id: "accepted" }; } },
    generationService: { async executeForMode(mode, actual, options) {
      received.push({ mode, actual }); options.onProgress({ phase: "executing", promptId: "prompt-panorama" }); return {};
    } },
    async preparePanoramaLighting(actual) { reads += 1; return { ...actual, panoramaLighting: selection }; },
    async readJson() { return { jobId: "generation-panorama123456", featureMode: "panoramaEnhancement",
      sharedInput: { ...input, panoramaLighting: selection },
      items: [1, 2].map(index => ({ key: `panorama-${index}`, input: { modelKey: input.modelKey } })) }; },
    sendJson(_response, status, value) { body = { status, value }; },
  });
  await handler({ method: "POST" }, {}, "/api/generation-jobs");
  assert.equal(body.status, 202);
  assert.equal(reads, 1);
  await run(progress => { if (progress.stages) stages.push(progress.stages); });
  assert.equal(received.length, 2);
  assert.deepEqual(received[0].actual.panoramaLighting, selection);
  assert.equal(received[1].actual.prompt, input.prompt);
  assert.equal(stages[0].comfyUi, "executing");
  assert.equal(stages[0].promptId, "prompt-panorama");
});

test("全景卡片冻结失败时零任务入队", async () => {
  let status;
  const handler = createGenerationJobApiHandler({
    generationJobs: { enqueue() { throw new Error("不得入队"); } }, generationService: {},
    async preparePanoramaLighting() { throw Object.assign(new Error("模板已下架"), { statusCode: 409 }); },
    async readJson() { return { jobId: "generation-panorama123456", featureMode: "panoramaEnhancement",
      sharedInput: input, items: [{ input: { modelKey: input.modelKey } }] }; },
    sendJson(_response, value) { status = value; },
  });
  await handler({ method: "POST" }, {}, "/api/generation-jobs");
  assert.equal(status, 409);
});

test("全景多光影能力由实际任务入口显式声明", () => {
  const capabilities = supportedGenerationFeatureCapabilities();
  assert.equal(capabilities.panoramaEnhancement.multipleLightingSelections, true);
  assert.ok(Object.isFrozen(capabilities.panoramaEnhancement));
});

const comparisonPresets = Array.from({ length: 6 }, (_, index) => ({
  id: `recPanorama${index}`, name: `光影${index}`, code: `light-${index}`,
  version: 3, sha256: String(index + 1).repeat(64), prompt: `LIGHTING ${index}`,
}));
const identity = preset => ({ presetId: preset.id, version: preset.version, sha256: preset.sha256 });
function comparisonBody(modelCount = 1, count = 1) {
  return { jobId: "generation-panorama-multi123", featureMode: "panoramaEnhancement", sharedInput: input,
    items: ["aiTextureEnhancement", "seedream5Pro"].slice(0, modelCount).flatMap(modelKey =>
      comparisonPresets.flatMap(preset => Array.from({ length: count }, (_, index) => ({
        key: `${modelKey}-${preset.id}-${index}`, label: `${modelKey} · ${preset.name}`,
        input: { modelKey, panoramaLighting: identity(preset) },
      })))) };
}

for (const [modelCount, count] of [[1, 4], [2, 1]]) test(`${modelCount}模型六光影各${count}张独立入队冻结，不受模型总数四张限制`, async () => {
  let response, run, reads = 0;
  const received = [], body = comparisonBody(modelCount, count);
  const handler = createGenerationJobApiHandler({
    generationJobs: { enqueue(_id, _metadata, operation) { run = operation; return { id: body.jobId }; } },
    generationService: { async executeForMode(_mode, actual) { received.push(actual); return {}; } },
    preparePanoramaLighting: actual => preparePanoramaLightingInput(actual, {
      loadAssets: async () => { reads += 1; return { presets: comparisonPresets }; },
    }),
    async readJson() { return body; },
    sendJson(_response, status, value) { response = { status, value }; },
  });
  await handler({ method: "POST" }, {}, "/api/generation-jobs");
  assert.equal(response.status, 202);
  assert.equal(reads, comparisonPresets.length, "同卡跨模型与张数只冻结一次");
  await run(() => {});
  assert.equal(received.length, modelCount * count * comparisonPresets.length);
  for (const actual of received) {
    assert.deepEqual(actual.panoramaLighting, identity(comparisonPresets.find(x => x.id === actual.panoramaLighting.presetId)));
    assert.equal(actual.prompt, input.prompt);
    assert.equal(actual.batchCount, received.length);
  }
  assert.notEqual(received[0].panoramaLighting, received[1].panoramaLighting);
});

test("全景同模板换版本或SHA不能绕过单模型四张和多模型每组合单张限额", async () => {
  for (const [modelCount, count] of [[1, 4], [2, 1]]) {
    const body = comparisonBody(modelCount, count);
    const repeated = structuredClone(body.items[0]);
    repeated.input.panoramaLighting.version += 1;
    repeated.input.panoramaLighting.sha256 = "f".repeat(64);
    body.items.push(repeated);
    let status;
    const handler = createGenerationJobApiHandler({
      generationJobs: { enqueue() { throw new Error("限额失败不得入队"); } }, generationService: {},
      preparePanoramaLighting() { throw new Error("限额应在读取资产前阻断"); },
      readJson: async () => body, sendJson(_response, value) { status = value; },
    });
    await handler({ method: "POST" }, {}, "/api/generation-jobs");
    assert.equal(status, 400);
  }
});

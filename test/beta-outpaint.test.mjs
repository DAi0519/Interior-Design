/**
 * [INPUT]: 依赖 node:test/assert、sharp 真实图片字节、Beta扩图合同/Runner 与三引擎公开能力目录
 * [OUTPUT]: 对外提供四工作流真源与脱敏、固定2K/居中/倍率严格准入、lazy样本复用、入队及执行前能力校验、建档前真实尺寸拦截、Sunburst超限原图/狭长目标补边与收费提交不重试回归保障
 * [POS]: test 的 Beta扩图内存集成测试，不调用真实模型或飞书
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { BETA_OUTPAINT_WORKFLOWS, normalizeBetaOutpaintInput, publicBetaOutpaintConfig } from "../src/beta-outpaint.mjs";
import { createBetaApiHandler, createBetaRunnerService } from "../src/beta-runner.mjs";
import { normalizeImageOutpaintInput, publicImageOutpaintConfig } from "../src/image-outpaint-service.mjs";
import { IMAGE_OUTPAINT_MODELS } from "../src/image-outpaint-workflow.mjs";
import { publicQwenOutpaintConfig, QWEN_OUTPAINT_WORKFLOW } from "../src/image-outpaint-qwen.mjs";
import { publicOneApiOutpaintConfig } from "../src/image-outpaint-oneapi.mjs";
import { MODEL_CONFIGS } from "../src/model-config.mjs";

const TEST_TIME = "2026-10-19 12:00:00";
function rawConfig() {
  const flux = publicImageOutpaintConfig({ available: true });
  return { ...flux, secret: "never-expose", engines: [{ ...flux, key: "comfyui" },
    publicQwenOutpaintConfig({ available: true }), publicOneApiOutpaintConfig({ available: true })] };
}
function batch(keys = [BETA_OUTPAINT_WORKFLOWS[0].key], overrides = {}) {
  return { batchId: "BETA-outpainttest01", featureMode: "imageOutpaint", jobId: "beta-outpainttest001",
    sampleSetId: "SET-outpaint", testTime: TEST_TIME,
    items: keys.map((key, index) => ({ caseId: "CASE-1", sampleId: "SAMPLE-1", modelLabel: "伪造标签",
      runId: `RUN-outpainttest-${index}`, input: { outpaintWorkflowKey: key } })), ...overrides };
}
async function sourceImage(width = 128, height = 96) {
  const bytes = await sharp({ create: { width, height, channels: 3, background: "#65717b" } }).png().toBuffer();
  return { dataUrl: `data:image/png;base64,${bytes.toString("base64")}`, type: "image/png", name: "source.png", size: bytes.length };
}
async function waitJob(service, jobId) {
  for (let turns = 0; turns < 1000; turns += 1) {
    const job = service.getJob(jobId);
    if (job?.status !== "running") return job;
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  throw new Error("内存任务未结束");
}
function fixture(image, overrides = {}) {
  const events = [], generated = [], archives = [];
  const baseStore = {
    config: { baseUrl: "https://example.test/base/beta", tableId: "table-beta" },
    async getSampleSet() {
      events.push("metadata");
      return { status: "可用", featureMode: "imageOutpaint", recordId: "set-record",
        samples: [{ sampleId: "SAMPLE-1", recordId: "source-record", image: { type: image.type, size: image.size } }] };
    },
    async resolveSample() { events.push("source"); return { featureMode: "imageOutpaint", image }; },
    async beginRun({ item }) { events.push("begin"); archives.push(item); return { recordId: item.runId }; },
    async completeRun(recordId) { events.push("complete"); return { recordId, recordUrl: "https://example.test/result" }; },
    async failRun() { events.push("fail"); },
    ...overrides.baseStore,
  };
  const service = createBetaRunnerService({ baseStore, getOutpaintConfig: async () => rawConfig(), sleep: async () => { events.push("sleep"); },
    generationService: { async executeForMode(mode, input) { generated.push({ mode, input }); return { images: [] }; } }, ...overrides, baseStore });
  return { service, events, generated, archives };
}

test("Beta扩图目录复用真实模型标签，仅公开四个稳定候选与固定2K构图合同", () => {
  const config = publicBetaOutpaintConfig(rawConfig());
  assert.deepEqual(config.workflows.map((workflow) => workflow.key), ["outpaint-flux-onereward", "outpaint-flux-dev", "outpaint-qwen-2511", "outpaint-sunburst"]);
  assert.deepEqual(config.workflows.map((workflow) => workflow.label), [...IMAGE_OUTPAINT_MODELS.map((model) => model.label), QWEN_OUTPAINT_WORKFLOW.label, MODEL_CONFIGS.gptImage25Sunburst.label]);
  assert.ok(config.workflows.every((workflow) => workflow.available && workflow.reason === null));
  assert.equal(config.resolution, "2K");
  assert.deepEqual(config.defaultWorkflowKeys, ["outpaint-flux-onereward", "outpaint-qwen-2511"]);
  assert.deepEqual(config.scales, [2 / 3, 1 / 2, 1 / 3]);
  assert.ok(config.ratios.includes("original"));
  assert.doesNotMatch(JSON.stringify(config), /safetensors|never-expose|fp8_e4m3fn|sourceSha256/);
  assert.ok(publicBetaOutpaintConfig().workflows.every((workflow) => !workflow.available));
});

test("扩图能力逐候选隔离，不把一个Flux模型可用误作全部可用", () => {
  const config = rawConfig();
  config.engines[0].models = config.engines[0].models.map((model) => ({ ...model, available: model.key === "fluxFillDev", reason: "缺少权重" }));
  config.engines[1].available = false;
  const statuses = publicBetaOutpaintConfig(config).workflows;
  assert.deepEqual(statuses.map((workflow) => workflow.available), [false, true, false, true]);
  assert.match(statuses[0].reason, /缺少权重/);
});

test("省略扩图构图时补原比例/1.5倍/居中/2K并派生真实引擎，客户端覆盖不能改变身份", () => {
  for (const workflow of BETA_OUTPAINT_WORKFLOWS) {
    const input = normalizeBetaOutpaintInput({ outpaintWorkflowKey: workflow.key });
    assert.equal(input.modelKey, workflow.model);
    assert.equal(input.outpaintEngine, workflow.engine);
    assert.equal(input.outpaintModel, workflow.engine === "comfyui" ? workflow.model : undefined);
    assert.deepEqual(input.outpaintCanvas, { ratio: "original", scale: 2 / 3, resolution: "2K", position: { x: 0.5, y: 0.5 } });
  }
});

test("非法workflow/模型/引擎/分辨率/四边/倍率/位置/重传资产在入队前拒绝", () => {
  const valid = { outpaintWorkflowKey: "outpaint-flux-onereward" };
  const invalid = [
    { outpaintWorkflowKey: "private-graph" }, { outpaintEngine: "qwenImageEdit2511" }, { outpaintModel: "fluxFillDev" }, { modelKey: "banana2" },
    { resolution: "1K" }, { resolution: "4K" }, { expansion: { left: 128 } },
    { outpaintCanvas: { resolution: "4K" } }, { outpaintCanvas: { ratio: "2:1" } }, { outpaintCanvas: { scale: 0.6 } },
    { outpaintCanvas: { position: { x: 0.2, y: 0.5 } } }, { outpaintCanvas: null },
    { referenceImages: [{ dataUrl: "data:image/png;base64,AA==" }] }, { styleReferenceImages: [{ dataUrl: "x" }] },
  ];
  for (const patch of invalid) assert.throws(() => normalizeBetaOutpaintInput({ ...valid, ...patch }), { statusCode: 400 });
});

test("同一飞书样本批测四工作流：原图lazy读取，真实标签冻结，调用共享生成路由且双阶段完成", async () => {
  const { service, events, generated, archives } = fixture(await sourceImage());
  const request = batch(BETA_OUTPAINT_WORKFLOWS.map((workflow) => workflow.key));
  await service.start(request);
  const job = await waitJob(service, request.jobId);
  assert.equal(job.status, "success");
  assert.deepEqual(job.stages, { generated: 4, synced: 4 });
  assert.equal(events.filter((event) => event === "source").length, 4);
  assert.equal(events[0], "metadata");
  assert.ok(events.indexOf("source") < events.indexOf("begin"));
  assert.deepEqual(archives.map((item) => item.modelLabel).sort(), BETA_OUTPAINT_WORKFLOWS.map((workflow) => workflow.label).sort());
  assert.ok(archives.every((item) => item.outpaintWorkflowKey === item.input.outpaintWorkflowKey));
  assert.ok(generated.every(({ mode, input }) => mode === "imageOutpaint" && input.referenceImages.length === 1 && !input.styleReferenceImages?.length && !input.batchCount));
});

test("Batch边界拒绝非2K、伪造引擎和通过资产字典重传图片，不读取目录或入队", async () => {
  let enqueued = 0, configReads = 0;
  const image = await sourceImage();
  const service = createBetaRunnerService({ baseStore: {}, generationService: {},
    getOutpaintConfig: async () => { configReads += 1; return rawConfig(); },
    jobs: { enqueue() { enqueued += 1; } } });
  for (const patch of [{ resolution: "1K" }, { outpaintCanvas: { resolution: "4K" } }, { outpaintEngine: "qwenImageEdit2511" }]) {
    const request = batch();
    Object.assign(request.items[0].input, patch);
    assert.throws(() => service.start(request), { statusCode: 400 });
  }
  const retransmission = batch();
  retransmission.assets = { original: [image] };
  retransmission.items[0].referenceAssetKey = "original";
  assert.throws(() => service.start(retransmission), { statusCode: 400 });
  assert.equal(configReads, 0);
  assert.equal(enqueued, 0);
});

test("未选工作流不影响可用候选，不可用所选工作流在入队及样本读取前阻断", async () => {
  let enqueued = 0, sourceReads = 0;
  const config = rawConfig();
  config.engines[1].available = false;
  const service = createBetaRunnerService({
    baseStore: { async getSampleSet() { sourceReads += 1; } }, generationService: {},
    getOutpaintConfig: async () => config, jobs: { enqueue() { enqueued += 1; return {}; } },
  });
  await assert.rejects(service.start(batch(["outpaint-qwen-2511"])), { statusCode: 409 });
  assert.equal(enqueued, 0);
  assert.equal(sourceReads, 0);
});

test("排队后能力失效在beginRun和GPU前拦截，合同错误不重试", async () => {
  let checks = 0;
  const config = rawConfig();
  const { service, events, generated } = fixture(await sourceImage(), { getOutpaintConfig: async () => {
    checks += 1;
    if (checks > 1) return {};
    return config;
  } });
  const request = batch();
  await service.start(request);
  const job = await waitJob(service, request.jobId);
  assert.equal(job.status, "failed");
  assert.match(job.error, /暂不可用/);
  assert.equal(checks, 2);
  assert.equal(generated.length, 0);
  assert.equal(events.includes("begin"), false);
  assert.equal(events.includes("sleep"), false);
});

test("真实图片边长不合法在建档前400失败，不生成也不重试", async () => {
  const { service, events, generated } = fixture(await sourceImage(31, 64));
  const request = batch();
  await service.start(request);
  const job = await waitJob(service, request.jobId);
  assert.equal(job.status, "failed");
  assert.match(job.error, /32–4096px/);
  assert.equal(events.filter((event) => event === "source").length, 1);
  assert.equal(events.includes("begin"), false);
  assert.equal(events.includes("sleep"), false);
  assert.equal(generated.length, 0);
});

test("真实4000px输入不受2K输出限制，共享几何按所选比例和倍率适配", async () => {
  let plan;
  const { service } = fixture(await sourceImage(4000, 3000), { generationService: {
    async executeForMode(_mode, input) { plan = await normalizeImageOutpaintInput(input); return { images: [] }; },
  } });
  const request = batch();
  request.items[0].input.outpaintCanvas = { ratio: "16:9", scale: 1 / 2 };
  await service.start(request);
  const job = await waitJob(service, request.jobId);
  assert.equal(job.status, "success");
  assert.deepEqual(plan.originalSource, { width: 4000, height: 3000 });
  assert.deepEqual([plan.width, plan.height], [2048, 1152]);
  assert.equal(plan.outpaintCanvas.scale, 1 / 2);
  assert.equal(plan.sourceResized, true);
});

test("Sunburst收费提交发生500或归档失败时不因Beta外层重试而重复收费", async () => {
  for (const failure of ["generation", "archive"]) {
    let attempts = 0;
    const { service, events } = fixture(await sourceImage(), {
      generationService: { async executeForMode() {
        attempts += 1;
        if (failure === "generation") throw Object.assign(new Error("上游500"), { statusCode: 500 });
        return { images: [] };
      } },
      baseStore: failure === "archive" ? { async completeRun() { throw Object.assign(new Error("归档500"), { statusCode: 500 }); } } : {},
    });
    const request = batch(["outpaint-sunburst"]);
    await service.start(request);
    const job = await waitJob(service, request.jobId);
    assert.equal(job.status, "failed");
    assert.equal(attempts, 1);
    assert.equal(events.filter((event) => event === "begin").length, 1);
    assert.equal(events.includes("sleep"), false);
  }
});

test("Beta配置只读且异步HTTP回读完整目录，扩图提交跳过Prompt Agent Key检查", async () => {
  const { service, events } = fixture(await sourceImage());
  const config = await service.config();
  assert.equal(config.outpaint.workflows.length, 4);
  assert.ok(config.features.includes("imageOutpaint"));
  assert.deepEqual(events, []);
  let sent, keyReads = 0;
  const handler = createBetaApiHandler({ service, sendJson(_response, status, payload) { sent = { status, payload }; },
    readJson: async () => batch(), getAgentModels: async () => { keyReads += 1; throw new Error("不应访问OneAPI"); } });
  await handler({ method: "GET" }, {}, "/api/beta/config");
  assert.equal(sent.status, 200);
  assert.equal(sent.payload.outpaint.resolution, "2K");
  await handler({ method: "POST" }, {}, "/api/beta/jobs");
  assert.equal(sent.status, 202);
  assert.equal(keyReads, 0);
  await waitJob(service, batch().jobId);
});


test("Beta Sunburst超限原图和狭长原比例先正规适配，再建档执行，冻结原canvas与Attempt", async () => {
  for (const [width, height, target] of [[4000, 3000, [2048, 1536]], [3736, 1132, [2048, 688]]]) {
    let normalized, calls = 0;
    const { service, archives } = fixture(await sourceImage(width, height), { generationService: {
      async executeForMode(_mode, input) { calls += 1; normalized = await normalizeImageOutpaintInput(input); return { images: [] }; },
    } });
    const request = batch(["outpaint-sunburst"]);
    request.items[0].attempt = 2;
    await service.start(request);
    const job = await waitJob(service, request.jobId);
    assert.equal(job.status, "success");
    assert.equal(calls, 1);
    assert.equal(archives.length, 1);
    assert.equal(archives[0].attempt, 2);
    assert.deepEqual(normalized.originalSource, { width, height });
    assert.deepEqual([normalized.width, normalized.height], target);
    assert.equal(normalized.outpaintCanvas.ratio, "original");
    assert.equal(normalized.outpaintCanvas.scale, 2 / 3);
    assert.equal(normalized.sourceResized, true);
    assert.deepEqual(job.stages, { generated: 1, synced: 1 });
  }
});

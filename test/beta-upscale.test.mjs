/**
 * [INPUT]: 依赖 node:test/assert、sharp 真实图字节、六超分真源、Beta 超分合同/Runner/生成服务与内存健康/归档替身
 * [OUTPUT]: 对外提供六工作流身份/版本冻结、安全目录、整图及KS固定5K/其他20MP节点准入、普通4K–8K及KS2X/4K/6K、lazy原图尺寸建档前拦截、双进度/仅同步重试及Beta独立归档/日常本机隔离回归保障
 * [POS]: test 的 Beta AI超分合同及跨层内存集成测试，不启动服务、不调用真实模型或飞书
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { normalizeBetaUpscaleInput, publicBetaUpscaleConfig, readBetaUpscaleConfig } from "../src/beta-upscale.mjs";
import { createBetaApiHandler, createBetaRunnerService } from "../src/beta-runner.mjs";
import { createGenerationService } from "../src/generation-service.mjs";
import { createImageUpscaleWorkflow, IMAGE_UPSCALE_WORKFLOWS, imageUpscaleWorkflowMetadata,
  publicImageUpscaleConfig } from "../src/image-upscale-workflow.mjs";
import { captureBetaGenerationArchive } from "../src/beta-base.mjs";

const WORKFLOWS = Object.values(IMAGE_UPSCALE_WORKFLOWS);
const TEST_TIME = "2026-10-20 12:00:00";
const healthy = () => ({ comfyUi: { available: true } });
async function sourceImage(width = 640, height = 480) {
  const bytes = await sharp({ create: { width, height, channels: 3, background: "#65717b" } }).png().toBuffer();
  return { dataUrl: `data:image/png;base64,${bytes.toString("base64")}`, type: "image/png", name: "source.png", size: bytes.length };
}
function batch(keys = [WORKFLOWS[0].key], overrides = {}) {
  return { batchId: "BETA-upscaletest01", featureMode: "imageUpscale", jobId: "beta-upscaletest001",
    sampleSetId: "SET-upscale", testTime: TEST_TIME,
    items: keys.map((key, index) => ({ caseId: "CASE-1", sampleId: "SAMPLE-1", modelLabel: "伪造标签",
      runId: `RUN-upscaletest-${index}`, input: { upscaleWorkflowKey: key,
        resolution: IMAGE_UPSCALE_WORKFLOWS[key].resolutions[0].key } })), ...overrides };
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
  const events = [], generated = [], archives = [], sourceOptions = [];
  const baseStore = {
    config: { baseUrl: "https://example.test/base/beta", tableId: "table-beta" },
    async getSampleSet() {
      events.push("metadata");
      return { status: "可用", featureMode: "whiteModel", recordId: "set-record",
        samples: [{ sampleId: "SAMPLE-1", recordId: "source-record", image: { type: image.type, size: image.size } }] };
    },
    async resolveSample(_setId, _sampleId, options) {
      events.push("source"); sourceOptions.push(options); return { featureMode: "whiteModel", image };
    },
    async beginRun({ item }) { events.push("begin"); archives.push(item); return { recordId: item.runId }; },
    async completeRun(recordId) { events.push("complete"); return { recordId, recordUrl: "https://example.test/result" }; },
    async failRun() { events.push("fail"); },
    ...overrides.baseStore,
  };
  const service = createBetaRunnerService({ baseStore, getUpscaleConfig: async () => healthy(),
    sleep: async () => { events.push("sleep"); },
    generationService: { async executeForMode(mode, input) { generated.push({ mode, input }); return { images: [] }; } },
    ...overrides, baseStore });
  return { service, events, generated, archives, sourceOptions };
}
function objectInfoFixture() {
  const objectInfo = {};
  for (const workflow of WORKFLOWS) {
    const isDouble = workflow.resolutions[0].scale === 2;
    const graphs = [createImageUpscaleWorkflow({ artifactKey: "test-capability", imageBase64: "", seed: 4,
      generationRequest: { upscaleWorkflowKey: workflow.key, resolution: workflow.resolutions[0].key },
      width: isDouble ? 1280 : 4096, height: isDouble ? 960 : 3072 })];
    if (workflow.key.startsWith("ks_")) graphs.push(createImageUpscaleWorkflow({
      artifactKey: "test-tile-capability", imageBase64: "", seed: 4,
      generationRequest: { upscaleWorkflowKey: workflow.key, resolution: "6K", sourceWidth: 2048, sourceHeight: 2048 }, width: 6144, height: 6144,
    }));
    for (const node of graphs.flatMap((graph) => Object.values(graph))) {
      if (node.class_type === "SeedVR2LoadVAEModel") {
        assert.equal(node.inputs.encode_tiled, true, "真实VAE接口必须使用encode_tiled");
        assert.equal(node.inputs.decode_tiled, true, "真实VAE接口必须使用decode_tiled");
        assert.equal(Object.hasOwn(node.inputs, "encode_areaCap"), false);
        assert.equal(Object.hasOwn(node.inputs, "decode_areaCap"), false);
      }
      const required = (objectInfo[node.class_type] ||= { input: { required: {} } }).input.required;
      for (const [field, value] of Object.entries(node.inputs)) {
        if (field === "model") {
          const choices = (required[field] ||= [[]])[0];
          if (!choices.includes(value)) choices.push(value);
        } else required[field] = [typeof value === "string" ? "STRING" : "ANY"];
      }
    }
  }
  return objectInfo;
}

test("Beta超分六候选来自真实目录，公开逐工作流档位/输入范围并隐藏私有权重信息", () => {
  const config = publicBetaUpscaleConfig({ ...healthy(), secret: "never-expose" });
  assert.deepEqual(config.workflows.map(({ available, reason, ...workflow }) => workflow), publicImageUpscaleConfig().workflows);
  assert.deepEqual(config.defaultWorkflowKeys, [publicImageUpscaleConfig().defaultWorkflowKey]);
  assert.ok(config.workflows.every((workflow) => workflow.available && workflow.reason === null));
  assert.equal(config.workflows.length, 6);
  assert.ok(publicBetaUpscaleConfig().workflows.every((workflow) => !workflow.available));
  assert.doesNotMatch(JSON.stringify(config), /safetensors|sourceSha256|never-expose/);
});

test("逐工作流严格冻结身份与分辨率，拒绝伪造模型/非法档位/重传源图和风格资产", () => {
  for (const workflow of WORKFLOWS) {
    for (const resolution of workflow.resolutions) {
      assert.deepEqual(normalizeBetaUpscaleInput({ upscaleWorkflowKey: workflow.key, resolution: resolution.key,
        prompt: "不应进入执行", width: 999999 }), { featureMode: "imageUpscale", modelKey: workflow.key,
        upscaleWorkflowKey: workflow.key, upscaleWorkflowVersion: workflow.version, resolution: resolution.key });
    }
    const valid = { upscaleWorkflowKey: workflow.key, resolution: workflow.resolutions[0].key };
    for (const patch of [{ modelKey: "banana2" }, { resolution: "2x" }, { resolution: "1K" },
      { resolution: undefined }, { resolution: workflow.resolutions.some(entry => entry.key === "2X") ? "8K" : "2X" },
      { referenceImages: [{}] }, { styleReferenceImages: [{}] }]) {
      assert.throws(() => normalizeBetaUpscaleInput({ ...valid, ...patch }), { statusCode: 400, retryable: false });
    }
  }
  assert.throws(() => normalizeBetaUpscaleInput({ upscaleWorkflowKey: "private" }), { statusCode: 400 });
});

test("能力读取不缓存，3B权重缺失只禁用攸行，预处理节点缺失只禁用三个预处理版本", async () => {
  const info = objectInfoFixture();
  let healthReads = 0;
  const client = { async checkHealth() { healthReads += 1; return { available: true }; },
    async getObjectInfo(types) { return Object.fromEntries(types.filter((type) => info[type]).map((type) => [type, info[type]])); } };
  assert.ok((await readBetaUpscaleConfig(client)).workflows.every((workflow) => workflow.available));
  info.SeedVR2LoadDiTModel.input.required.model[0] = [WORKFLOWS[1].model];
  let config = await readBetaUpscaleConfig(client);
  assert.equal(config.workflows[0].available, false);
  assert.ok(config.workflows.slice(1).every((workflow) => workflow.available));
  delete info.ImageScaleToTotalPixels;
  config = await readBetaUpscaleConfig(client);
  assert.deepEqual(config.workflows.filter((workflow) => workflow.available).map((workflow) => workflow.key),
    ["seedvr2_7b_direct", "ks_seedvr2_2x_direct"]);
  assert.equal(healthReads, 3);
  assert.doesNotMatch(JSON.stringify(config), /safetensors|sourceSha256/);
});

test("能力读取失败返回脱敏不可用目录，单节点404不会禁用不消费该节点的直入版", async () => {
  const info = objectInfoFixture();
  const client = { async checkHealth() { return { available: true }; }, async getObjectInfo([type]) {
    if (type === "ImageScaleToTotalPixels") throw new Error("private/path?token=secret");
    return { [type]: info[type] };
  } };
  const config = await readBetaUpscaleConfig(client);
  assert.equal(config.workflows.find((workflow) => workflow.key === "youxing_seedvr2_3b").available, true);
  assert.equal(config.workflows.find((workflow) => workflow.key === "seedvr2_1mp").available, false);
  client.checkHealth = async () => { throw new Error("private/path?token=secret"); };
  const failed = await readBetaUpscaleConfig(client);
  assert.ok(failed.workflows.every((workflow) => !workflow.available));
  assert.doesNotMatch(JSON.stringify(failed), /private|token|secret/);
});

test("同一跨功能飞书样本×六真实工作流按ID惰性读取、冻结标签并完成双进度", async () => {
  const { service, events, generated, archives, sourceOptions } = fixture(await sourceImage());
  const request = batch(WORKFLOWS.map((workflow) => workflow.key));
  await service.start(request);
  const job = await waitJob(service, request.jobId);
  assert.equal(job.status, "success");
  assert.deepEqual(job.stages, { generated: 6, synced: 6 });
  assert.equal(events[0], "metadata");
  assert.equal(events.filter((event) => event === "source").length, 6);
  assert.ok(events.indexOf("source") < events.indexOf("begin"));
  assert.deepEqual(archives.map((item) => item.modelLabel).sort(), WORKFLOWS.map((workflow) => workflow.displayLabel || workflow.label).sort());
  assert.ok(archives.every((item) => item.upscaleWorkflowKey === item.input.upscaleWorkflowKey));
  assert.ok(sourceOptions.every((options) => options.recordId === "source-record"
    && options.sampleSetRecordId === "set-record" && options.targetFeatureMode === "imageUpscale"));
  assert.ok(generated.every(({ mode, input }) => mode === "imageUpscale" && input.referenceImages.length === 1
    && input.referenceImages[0].width === 640 && input.modelKey === input.upscaleWorkflowKey && !input.batchCount));
});

test("非法档位/伪造身份/资产字典重传在任何健康或样本读取前拒绝", async () => {
  let reads = 0, enqueued = 0;
  const service = createBetaRunnerService({ baseStore: {}, generationService: {},
    getUpscaleConfig: async () => { reads += 1; return healthy(); }, jobs: { enqueue() { enqueued += 1; } } });
  for (const patch of [{ resolution: "1K" }, { resolution: "2X" }, { modelKey: "banana2" }]) {
    const request = batch(); Object.assign(request.items[0].input, patch);
    assert.throws(() => service.start(request), { statusCode: 400 });
  }
  const request = batch(); request.assets = { source: [await sourceImage()] };
  request.items[0].referenceAssetKey = "source";
  assert.throws(() => service.start(request), { statusCode: 400 });
  assert.equal(reads, 0); assert.equal(enqueued, 0);
});

test("未选工作流不可用不影响入队，所选失效在样本读取与建档之前阻断", async () => {
  const config = publicBetaUpscaleConfig(healthy());
  config.workflows[0].available = false;
  const { service, events, generated } = fixture(await sourceImage(), { getUpscaleConfig: async () => config });
  await assert.rejects(service.start(batch()), { statusCode: 409, retryable: false });
  assert.deepEqual(events, []);
  const request = batch([WORKFLOWS[1].key]); await service.start(request);
  assert.equal((await waitJob(service, request.jobId)).status, "success");
  assert.equal(generated.length, 1);
});

test("执行前健康失效不会建档/GPU/自动重试", async () => {
  let reads = 0;
  const { service, events, generated } = fixture(await sourceImage(), { getUpscaleConfig: async () => ++reads === 1 ? healthy() : {} });
  const request = batch(); await service.start(request);
  const job = await waitJob(service, request.jobId);
  assert.equal(job.status, "failed"); assert.match(job.error, /暂不可用/);
  assert.equal(reads, 2); assert.equal(events.includes("begin"), false);
  assert.equal(events.includes("sleep"), false); assert.equal(generated.length, 0);
});

test("KS真实字节每轴384–3200在建档前校验，声明宽高不能绕过；普通4K允许同一小图", async () => {
  const image = { ...await sourceImage(383, 480), width: 640, height: 480 };
  for (const key of ["ks_seedvr2_2x", "ks_seedvr2_2x_direct"]) for (const resolution of ["2X", "4K", "6K"]) {
    const { service, events, generated } = fixture(image);
    const request = batch([key]); request.items[0].input.resolution = resolution; await service.start(request);
    const job = await waitJob(service, request.jobId);
    assert.equal(job.status, "failed"); assert.match(job.error, /384–3200px/);
    assert.equal(events.includes("begin"), false); assert.equal(events.includes("sleep"), false);
    assert.equal(generated.length, 0);
  }
  const { service, generated } = fixture(image);
  const request = batch(); await service.start(request);
  assert.equal((await waitJob(service, request.jobId)).status, "success");
  assert.equal(generated[0].input.referenceImages[0].width, 383);
});

test("归档失败自动与手动重试只重同步，Comfy后续离线不触发重生成或健康准入", async () => {
  let completed = 0, reads = 0;
  const { service, generated, events } = fixture(await sourceImage(), { maxAttempts: 2,
    getUpscaleConfig: async () => { reads += 1; return reads <= 2 ? healthy() : {}; },
    baseStore: { async completeRun(recordId) {
      completed += 1;
      if (completed <= 2) throw Object.assign(new Error("归档500"), { statusCode: 500 });
      return { recordId, recordUrl: "https://example.test/result" };
    } } });
  const request = batch(); await service.start(request);
  const failed = await waitJob(service, request.jobId);
  assert.equal(failed.status, "failed"); assert.deepEqual(failed.stages, { generated: 1, synced: 0 });
  const retryId = "beta-upscaletest-retry001"; await service.retry(request.jobId, { jobId: retryId });
  const success = await waitJob(service, retryId);
  assert.equal(success.status, "success"); assert.deepEqual(success.stages, { generated: 1, synced: 1 });
  assert.equal(reads, 2); assert.equal(generated.length, 1);
  assert.equal(events.filter((event) => event === "begin").length, 1);
});

test("Beta超分请求入口不读取OneAPI Key/Prompt Agent目录", async () => {
  const request = batch(); let agentReads = 0, accepted;
  const handler = createBetaApiHandler({ getAgentModels: async () => { agentReads += 1; throw new Error("没有OneAPI Key"); },
    readJson: async () => request, sendJson(_response, status, payload) { accepted = { status, payload }; },
    service: { start(body) { assert.equal(body, request); return { id: body.jobId }; } } });
  assert.equal(await handler({ method: "POST" }, {}, "/api/beta/jobs"), true);
  assert.equal(accepted.status, 202); assert.equal(agentReads, 0);
});

test("真实共享超分服务只在Beta实例捕获源图与完整metadata，日常超分仍本机且零旧表调用", async () => {
  const source = await sourceImage();
  const input = { ...normalizeBetaUpscaleInput({ upscaleWorkflowKey: "seedvr2_7b_direct", resolution: "6K" }), referenceImages: [source] };
  const payloads = [], submitted = [];
  const imageClient = { async generateImage(request) {
    submitted.push(request);
    return { images: ["data:image/png;base64,AAAA"], outputFormat: "png", transport: "comfyui",
      metadata: imageUpscaleWorkflowMetadata({ generationRequest: request, width: request.width, height: request.height,
        actualOutputWidth: request.width, actualOutputHeight: request.height, resolution: request.resolution,
        outputSha256: "a".repeat(64), outputFilename: "output.png", artifactKey: "artifact-test", promptId: "prompt-test", seed: 4 }) };
  } };
  const options = { imageUpscaleClient: imageClient,
    requireApiKey() { throw new Error("不应读取OneAPI Key"); }, imageClientForModel() { throw new Error("不应取通用客户端"); },
    scheduleGenerationSync(payload) { payloads.push(payload); return captureBetaGenerationArchive(payload); } };
  const main = await createGenerationService(options).executeForMode("imageUpscale", input);
  assert.equal(main.request.syncMode, "local-only"); assert.equal(payloads.length, 0);
  const beta = await createGenerationService({ ...options, archiveImageUpscale: true }).executeForMode("imageUpscale", input);
  assert.equal(beta.request.syncMode, "beta-only"); assert.equal(payloads.length, 1);
  assert.equal(payloads[0].finalPrompt, ""); assert.equal(payloads[0].referenceImages[0].imageUrl, source.dataUrl);
  const workflow = JSON.parse(beta.sync.archiveFields["生成参数"]).workflow;
  assert.equal(JSON.parse(beta.sync.archiveFields["生成参数"]).transport, "comfyui");
  assert.equal(workflow.feature, "image-upscale"); assert.equal(workflow.inputMegapixels, null);
  assert.equal(workflow.sourceWidth, 640); assert.equal(workflow.sourceHeight, 480);
  assert.equal(workflow.workflowId, input.upscaleWorkflowKey); assert.equal(workflow.resolution, "6K");
  assert.equal(workflow.outputSha256, "a".repeat(64));
  assert.equal(workflow.requestedOutputWidth, 6144); assert.equal(workflow.outputWidth, 6144);
  assert.equal(submitted[1].images[0].image_url, source.dataUrl);
});

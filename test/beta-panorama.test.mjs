/**
 * [INPUT]: 依赖 node:test/assert、sharp 真实图片夹具、Beta 样本/批次/归档边界、独立全景工作流和浏览器模型尺寸规则
 * [OUTPUT]: 对外提供全景真实 2:1、ID 惰性取图、Banana 2.1/GPT2.5 非 2:1 模型零调用准入、冻结 Prompt 版本、重试归档、Seedream 全景 4K 与普通 Flux 请求合同回归保障
 * [POS]: test 的 Beta 全景跨层合同测试，使用内存 Store/模型替身，不调用真实模型或飞书
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

import { betaConfigSnapshot, buildBetaRunFields } from "../src/beta-base.mjs";
import { createBetaRunnerService } from "../src/beta-runner.mjs";
import { normalizeBetaSampleImage } from "../src/beta-sample-store.mjs";
import { executeEffectRenderEnhancementWorkflow } from "../src/effect-render-enhancement-workflow.mjs";
import { publicModelCatalog } from "../src/model-config.mjs";
import { adaptGenerationInputForModel } from "../public/generation-batch.js";
import { assertBetaPanoramaSource, betaModelSelectable, betaSizeOptions } from "../public/beta-model-rules.js";

const FEATURE_MODE = "panoramaEnhancement";
const SET_ID = "SET-PANORAMA123";
const SAMPLE_ID = "SAMPLE-PANORAMA123";
const VERSION = 3;
const PROMPT = "Preserve the panorama geometry and the physically adjacent horizontal edges.";
const models = publicModelCatalog();

async function pngImage(width, height) {
  const bytes = await sharp({ create: { width, height, channels: 3, background: "#f37021" } }).png().toBuffer();
  return { dataUrl: `data:image/png;base64,${bytes.toString("base64")}`, name: "panorama.png", size: bytes.length, type: "image/png" };
}

const panorama = await pngImage(16, 8);
const square = await pngImage(8, 8);
const sourceMetadata = {
  image: { name: panorama.name, size: panorama.size, type: panorama.type },
  prompt: "",
  recordId: "rec-panorama-sample",
  sampleId: SAMPLE_ID,
  status: "可用",
};
const sampleSet = {
  featureMode: FEATURE_MODE,
  name: "全景合同夹具",
  recordId: "rec-panorama-set",
  sampleSetId: SET_ID,
  samples: [sourceMetadata],
  status: "可用",
};

function batch({ modelKeys = ["aiTextureEnhancement"], version = VERSION } = {}) {
  return {
    batchId: "BETA-PANORAMA123",
    featureMode: FEATURE_MODE,
    items: modelKeys.map((modelKey, index) => ({
      caseId: SAMPLE_ID,
      input: { modelKey, outputFormat: "png", panoramaPromptVersion: version, ratio: "4:3", ratioMode: "manual", resolution: "2K" },
      label: "全景样本",
      modelLabel: models.find((model) => model.key === modelKey)?.label,
      runId: `RUN-PANORAMA123-${index + 1}`,
      sampleId: SAMPLE_ID,
    })),
    jobId: "beta-panorama123456",
    sampleSetId: SET_ID,
    testTime: "2026-10-13 09:30:00",
  };
}

function controlledQueue() {
  let operation;
  let enqueues = 0;
  const snapshots = [];
  return {
    jobs: {
      enqueue(jobId, input, execute) {
        enqueues += 1;
        operation = execute;
        return { jobId, ...input, status: "running" };
      },
      get() { return null; },
    },
    get enqueues() { return enqueues; },
    run: () => operation((snapshot) => snapshots.push(snapshot)),
    snapshots,
  };
}

function fakeStore(overrides = {}) {
  return {
    config: { baseUrl: "https://example.test/base", tableId: "tbl-panorama" },
    async verifySchema() {},
    async getSampleSet() { return structuredClone(sampleSet); },
    async resolveSample() { return { ...sourceMetadata, featureMode: FEATURE_MODE, image: panorama }; },
    async beginRun({ item }) { return { recordId: item.runId }; },
    async completeRun(recordId) { return { recordUrl: `https://example.test/${recordId}`, previewUrl: "data:image/webp;base64,UklGRg==" }; },
    async failRun() {},
    ...overrides,
  };
}

test("全景单图合同使用 PNG 实际尺寸，伪造宽高不能把方图变成 2:1", () => {
  const normalized = normalizeBetaSampleImage({ ...panorama, width: 8, height: 8 }, FEATURE_MODE);
  assert.equal(normalized.width, 16);
  assert.equal(normalized.height, 8);
  assert.throws(() => normalizeBetaSampleImage({ ...square, width: 16, height: 8 }, FEATURE_MODE), /2:1/);
  assert.doesNotThrow(() => normalizeBetaSampleImage(square, "effectBeautification"));
});

test("全景保留实际单图 8MB 保护，伪造文件大小不能绕过", () => {
  const oversized = Buffer.alloc(8 * 1024 * 1024 + 1);
  Buffer.from(panorama.dataUrl.split(",")[1], "base64").copy(oversized);
  assert.throws(() => normalizeBetaSampleImage({
    ...panorama, dataUrl: `data:image/png;base64,${oversized.toString("base64")}`, size: 1,
  }, FEATURE_MODE), /8MB/);
});

test("全景新增样本在上传前阻断非 2:1 原图，旧功能继续接受方图", async () => {
  const uploaded = [];
  let currentFeatureMode = FEATURE_MODE;
  const service = createBetaRunnerService({
    baseStore: fakeStore({
      async getSampleSet() { return { ...sampleSet, featureMode: currentFeatureMode }; },
      async addSample(_setId, sample) { uploaded.push(sample); return sample; },
      async createSampleSet(input) { uploaded.push(input); return input; },
    }),
    generationService: {},
  });
  await assert.rejects(service.addSample(SET_ID, { sampleId: SAMPLE_ID, image: { ...square, width: 16, height: 8 } }), /2:1/);
  assert.equal(uploaded.length, 0);
  await assert.rejects(Promise.resolve().then(() => service.createSampleSet({
    featureMode: FEATURE_MODE, name: "坏全景夹具", samples: [{ image: square }],
  })), /2:1/);
  assert.equal(uploaded.length, 0);
  await service.addSample(SET_ID, { sampleId: SAMPLE_ID, image: panorama });
  assert.equal(uploaded[0].image.width, 16);
  currentFeatureMode = "effectBeautification";
  await service.addSample(SET_ID, { sampleId: "SAMPLE-SQUARE123", image: square });
  assert.equal(uploaded[1].image.width, 8);
});

test("全景 ID 批次入队不取原图，固定 2:1 和独立版本进入每个 Run 配置", async () => {
  const queue = controlledQueue();
  let downloads = 0;
  let generations = 0;
  const archived = [];
  const service = createBetaRunnerService({
    baseStore: fakeStore({
      async resolveSample() { downloads += 1; return { ...sourceMetadata, image: panorama }; },
      async beginRun(input) {
        archived.push(buildBetaRunFields(input));
        return { recordId: input.item.runId };
      },
    }),
    generationService: {
      async executeForMode(mode, input) {
        generations += 1;
        assert.equal(mode, FEATURE_MODE);
        assert.equal(input.ratio, "2:1");
        assert.equal(input.ratioMode, "original");
        assert.equal(input.panoramaPromptVersion, VERSION);
        assert.equal(input.referenceImages[0].width, 16);
        assert.equal("batchCount" in input, false);
        return { images: [{ url: panorama.dataUrl }] };
      },
    },
    jobs: queue.jobs,
  });
  const input = batch({ modelKeys: ["aiTextureEnhancement", "seedream5Pro"] });
  assert.doesNotMatch(JSON.stringify(input), /data:image|base64/);
  const accepted = await service.start(input);
  assert.equal(accepted.total, 2);
  assert.equal(downloads, 0);
  assert.equal(generations, 0);
  const result = await queue.run();
  assert.equal(result.results.length, 2);
  assert.equal(downloads, 2);
  assert.equal(generations, 2);
  for (const fields of archived) {
    assert.equal(fields["功能"], "全景图美化");
    const config = JSON.parse(fields["配置快照"]);
    assert.equal(config.panoramaPromptVersion, VERSION);
    assert.equal(config.ratio, "2:1");
  }
  assert.deepEqual(queue.snapshots.at(-1).stages, { generated: 2, synced: 2 });
});

test("GPT Image 2.5/Banana 2.1 全景与未冻结版本在入队前失败，零下载零生成", async () => {
  const missingVersion = batch();
  delete missingVersion.items[0].input.panoramaPromptVersion;
  for (const input of [
    batch({ modelKeys: ["gptImage25Sunburst"] }),
    batch({ modelKeys: ["gptImage25Flare"] }),
    batch({ modelKeys: ["banana21"] }),
    missingVersion,
    batch({ version: 0 }),
    batch({ version: -2 }),
  ]) {
    const queue = controlledQueue();
    let downloads = 0;
    let generations = 0;
    const service = createBetaRunnerService({
      baseStore: fakeStore({ async resolveSample() { downloads += 1; return { ...sourceMetadata, image: panorama }; } }),
      generationService: { async executeForMode() { generations += 1; } },
      jobs: queue.jobs,
    });
    await assert.rejects(Promise.resolve().then(() => service.start(input)), /2:1|版本/);
    assert.equal(queue.enqueues, 0);
    assert.equal(downloads, 0);
    assert.equal(generations, 0);
  }
});

test("执行时下载到方图立即失败且不建档或调用模型", async () => {
  const queue = controlledQueue();
  let downloads = 0;
  let runs = 0;
  let generations = 0;
  const service = createBetaRunnerService({
    baseStore: fakeStore({
      async resolveSample() { downloads += 1; return { ...sourceMetadata, image: { ...square, width: 16, height: 8 } }; },
      async beginRun() { runs += 1; },
    }),
    generationService: { async executeForMode() { generations += 1; } },
    jobs: queue.jobs,
    sleep: async () => {},
  });
  await service.start(batch());
  await assert.rejects(queue.run(), /2:1/);
  assert.equal(downloads, 1);
  assert.equal(runs, 0);
  assert.equal(generations, 0);
});

test("全景瞬时重试复用原件并保持同一 Prompt 版本与新 Attempt", async () => {
  const queue = controlledQueue();
  let downloads = 0;
  let generations = 0;
  const runIds = [];
  const service = createBetaRunnerService({
    baseStore: fakeStore({
      async resolveSample() { downloads += 1; return { ...sourceMetadata, image: panorama }; },
      async beginRun({ item }) {
        runIds.push(item.runId);
        assert.equal(betaConfigSnapshot(item.input).panoramaPromptVersion, VERSION);
        return { recordId: item.runId };
      },
    }),
    generationService: {
      async executeForMode(_mode, input) {
        assert.equal(input.panoramaPromptVersion, VERSION);
        generations += 1;
        if (generations === 1) throw Object.assign(new Error("上游暂时不可用"), { statusCode: 503 });
        return { images: [{ url: panorama.dataUrl }] };
      },
    },
    jobs: queue.jobs,
    sleep: async () => {},
  });
  await service.start(batch());
  const result = await queue.run();
  assert.equal(downloads, 1);
  assert.equal(generations, 2);
  assert.deepEqual(runIds, ["RUN-PANORAMA123-1", "RUN-PANORAMA123-1-A2"]);
  assert.equal(result.results[0].attempt, 2);
});

test("全景仅加载指定独立 Prompt，Seedream 5.0 Pro 4K 使用 3040x1520", async () => {
  const requests = [];
  let archived;
  const result = await executeEffectRenderEnhancementWorkflow({
    ...batch({ modelKeys: ["seedream5Pro"] }).items[0].input,
    featureMode: FEATURE_MODE,
    referenceImages: [panorama],
    ratio: "2:1",
    ratioMode: "original",
    resolution: "4K",
    effectBeautification: { intensity: "high", tone: "cool" },
    effectTime: "night",
    effectWeather: "rainy",
  }, {
    imageClient: { async generateImage(request) { requests.push(request); return { images: [{ url: panorama.dataUrl }] }; } },
    async loadEffectPrompt() { throw new Error("禁止读取氛围 Prompt"); },
    async loadBeautificationPrompt() { throw new Error("禁止读取效果图美化 Prompt"); },
    async loadPanoramaPrompt(options) {
      assert.deepEqual(options, { version: VERSION });
      return { code: "panorama-render-enhancement", name: "全景图美化", prompt: PROMPT, published: true, version: VERSION };
    },
    scheduleSync(input) { archived = input; return { status: "skipped" }; },
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].size, "3040x1520");
  assert.equal(requests[0].prompt, PROMPT);
  assert.equal(result.prompt.version, VERSION);
  assert.equal(archived.workflow.promptVersion, VERSION);
  assert.equal(archived.workflow.effectTime, "preserve");
  assert.equal(archived.workflow.effectWeather, "preserve");
  assert.equal("effectBeautification" in archived.workflow, false);
});

test("Flux 全景请求只有普通工作流参数与独立 Prompt", async () => {
  let request;
  await executeEffectRenderEnhancementWorkflow({
    ...batch().items[0].input, featureMode: FEATURE_MODE, referenceImages: [panorama],
  }, {
    imageClient: { async generateImage(input) { request = input; return { images: [{ url: panorama.dataUrl }] }; } },
    async loadPanoramaPrompt({ version }) {
      return { code: "panorama-render-enhancement", name: "全景图美化", prompt: PROMPT, published: true, version };
    },
  });
  assert.equal(request.prompt, PROMPT);
  assert.equal(request.model, "comfyui:ai-texture-enhancement");
  assert.equal(request.images.length, 1);
  assert.equal(request.n, 1);
  assert.doesNotMatch(JSON.stringify(Object.keys(request)), /panorama|denoise|sampler|wrap/);
  assert.equal(request.width, request.height * 2);
});

test("浏览器全景规则固定 2:1，屏蔽两个 GPT2.5 和 Banana 2.1 并保留普通功能能力", () => {
  for (const model of models) {
    const supported = !["gptImage25Sunburst", "gptImage25Flare", "banana21"].includes(model.key);
    assert.equal(betaModelSelectable(model, FEATURE_MODE), supported, model.key);
    assert.equal(betaModelSelectable(model, "effectBeautification"), true, model.key);
  }
  const seedream = models.find((model) => model.key === "seedream5Pro");
  const controls = betaSizeOptions({ models: [seedream], featureMode: FEATURE_MODE, currentRatio: "4:3", currentResolution: "4K" });
  assert.equal(controls.ratio, "2:1");
  assert.equal(controls.ratioDisabled, true);
  assert.deepEqual(controls.ratioOptions.map((option) => option.value), ["2:1"]);
  assert.equal(controls.resolution, "4K");
  assert.ok(controls.resolutionOptions.some((option) => option.value === "4K"));
  assert.throws(() => assertBetaPanoramaSource(FEATURE_MODE, { width: 8, height: 8 }), /2:1/);
  assert.doesNotThrow(() => assertBetaPanoramaSource(FEATURE_MODE, { width: 16, height: 8 }));
  assert.doesNotThrow(() => assertBetaPanoramaSource("effectBeautification", { width: 8, height: 8 }));
  const input = adaptGenerationInputForModel({ ratio: "2:1", ratioMode: "manual", resolution: "4K", outputFormat: "png" }, seedream, { featureMode: FEATURE_MODE });
  assert.equal(input.ratio, "2:1");
  assert.equal(input.resolution, "4K");
});

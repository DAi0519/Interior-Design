/**
 * [INPUT]: 依赖 node:test/assert、sharp 真实图片夹具、Beta 样本/批次/归档边界、独立全景工作流和浏览器模型尺寸规则
 * [OUTPUT]: 对外提供全景真实2:1、ID惰性取图、多光影逐样本模型展开/计数/标签/身份冻结、非2:1模型零调用准入、冻结Prompt版本、重试归档、Seedream全景4K与R5_4独立Flux请求合同
 * [POS]: test 的 Beta 全景跨层合同测试，使用内存 Store/模型替身，不调用真实模型或飞书
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import sharp from "sharp";

import { betaConfigSnapshot, buildBetaRunFields } from "../src/beta-base.mjs";
import { createBetaRunnerService } from "../src/beta-runner.mjs";
import { normalizeBetaSampleImage } from "../src/beta-sample-store.mjs";
import { executeEffectRenderEnhancementWorkflow } from "../src/effect-render-enhancement-workflow.mjs";
import { publicModelCatalog } from "../src/model-config.mjs";
import { adaptGenerationInputForModel } from "../public/generation-batch.js";
import { panoramaItemsForSelection, panoramaLightingRequestSelection } from "../public/generation-task-request.js";
import { preparePanoramaLightingInput } from "../src/panorama-lighting.mjs";
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

test("OneAPI全景瞬时重试复用原件并保持同一 Prompt 版本与新 Attempt", async () => {
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
  await service.start(batch({ modelKeys: ["seedream5Pro"] }));
  const result = await queue.run();
  assert.equal(downloads, 1);
  assert.equal(generations, 2);
  assert.deepEqual(runIds, ["RUN-PANORAMA123-1", "RUN-PANORAMA123-1-A2"]);
  assert.equal(result.results[0].attempt, 2);
});

test("Flux全景R5_4瞬时失败不自动再次提交GPU", async () => {
  const queue = controlledQueue();
  let generations = 0;
  const service = createBetaRunnerService({
    baseStore: fakeStore(), jobs: queue.jobs, sleep: async () => {},
    generationService: { async executeForMode() {
      generations += 1;
      throw Object.assign(new Error("球面任务上游暂时不可用"), { statusCode: 503 });
    } },
  });
  await service.start(batch());
  await assert.rejects(queue.run(), /球面任务上游暂时不可用/);
  assert.equal(generations, 1);
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

test("Flux 全景请求路由R5_4独立工作流并保留独立Prompt", async () => {
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
  assert.equal(request.workflow_kind, "panorama-r5-4");
  assert.doesNotMatch(JSON.stringify(Object.keys(request)), /denoise|sampler|wrap|upscale/);
  assert.equal(request.width, 16);
  assert.equal(request.height, 8);
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

const lightingPresets = [
  { id: "recDay", name: "日光", code: "day", version: 3, sha256: "a".repeat(64), prompt: "DAY" },
  { id: "recNight", name: "夜景", code: "night", version: 4, sha256: "b".repeat(64), prompt: "NIGHT" },
];
const lightingIdentity = preset => ({ presetId: preset.id, version: preset.version, sha256: preset.sha256 });

test("Beta实际页面批次按样本×模型×光影展开，逐项只携一份身份并保留可读光影标签", async () => {
  const source = await readFile(new URL("../public/beta-app.js", import.meta.url), "utf8");
  const functionSource = source.match(/function buildItems\(startedAt = new Date\(\)\) \{[\s\S]*?\n\}/)?.[0];
  const countSource = source.match(/function runCount\(\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(functionSource); assert.ok(countSource);
  const selected = models.filter(model => ["aiTextureEnhancement", "seedream5Pro"].includes(model.key));
  const cases = ["A", "B"].map(id => ({ caseId: `SAMPLE-${id}`, label: `样本${id}`, referenceImages: [panorama] }));
  const lighting = { getSelections: () => lightingPresets.map(preset => ({ ...lightingIdentity(preset), presetName: preset.name })),
    requestFields: () => ({ panoramaLighting: lightingIdentity(lightingPresets[0]), prompt: "用户补充" }) };
  const context = {
    state: { featureMode: FEATURE_MODE, stylesConfig: {} },
    elements: { ratioSelect: { value: "2:1" }, negativePromptInput: { value: "" },
      qualitySelect: { value: "" }, resolutionSelect: { value: "2K" } },
    assertFeatureConfig() {}, currentCases: () => cases, selectedModels: () => selected,
    selectedCandidates: () => selected, sampleCount: () => cases.length,
    panoramaLighting: lighting, panoramaItemsForSelection, panoramaLightingRequestSelection,
    adaptGenerationInputForModel, createBetaRunId: ({ sequence }) => `RUN-LIGHTING-${sequence}`,
  };
  const build = new Function(...Object.keys(context), `return (${functionSource})();`);
  const count = new Function(...Object.keys(context), `return (${countSource})();`);
  const items = build(...Object.values(context));
  assert.equal(items.length, 8);
  assert.equal(count(...Object.values(context)), items.length);
  assert.equal(new Set(items.map(item => item.runId)).size, 8);
  assert.equal(new Set(items.map(item => item.label)).size, 8);
  assert.deepEqual(items.slice(0, 2).map(item => item.input.panoramaLighting), lightingPresets.map(lightingIdentity));
  assert.ok(items.every(item => item.input.prompt === "用户补充" && !item.input.panoramaLighting.presetName));
});

test("Beta多光影跨模型只冻结每张卡一次，每个Run独立保留光影身份", async () => {
  const queue = controlledQueue(), received = [], snapshots = [];
  let reads = 0;
  const service = createBetaRunnerService({
    baseStore: fakeStore({ async beginRun({ item }) {
      snapshots.push(betaConfigSnapshot(item.input)); return { recordId: item.runId };
    } }), jobs: queue.jobs,
    preparePanoramaLighting: actual => preparePanoramaLightingInput(actual, {
      loadAssets: async () => { reads += 1; return { presets: lightingPresets }; },
    }),
    generationService: { async executeForMode(_mode, actual) {
      received.push(actual); return { images: [{ url: panorama.dataUrl }] };
    } },
  });
  const input = batch({ modelKeys: ["aiTextureEnhancement", "seedream5Pro"] });
  input.items = input.items.flatMap((item, modelIndex) => lightingPresets.map((preset, index) => ({
    ...item, input: { ...item.input, panoramaLighting: lightingIdentity(preset), prompt: "用户要求" },
    label: `${item.label} · ${preset.name}`, runId: `RUN-PANORAMA-MULTI-${modelIndex}-${index}`,
  })));
  const accepted = await service.start(input);
  assert.equal(accepted.total, 4); assert.equal(reads, 2);
  await queue.run();
  assert.equal(received.length, 4); assert.equal(snapshots.length, 4);
  for (const actual of received) {
    assert.deepEqual(actual.panoramaLighting, lightingIdentity(lightingPresets.find(preset => preset.id === actual.panoramaLighting.presetId)));
    assert.equal(actual.prompt, "用户要求");
  }
  assert.deepEqual(snapshots.map(snapshot => snapshot.panoramaLighting), received.map(actual => actual.panoramaLighting));
});

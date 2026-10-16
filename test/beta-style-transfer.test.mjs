/**
 * [INPUT]: 依赖 node:test/assert、sharp 真实图片、Beta 样本/批次/归档边界、共享设计工作流和异步 Prompt 缓存
 * [OUTPUT]: 对外提供风格转换八功能准入、显式双来源/版本冻结、样本功能/成员绑定、共享参考图、主图单图出图、重试缓存、归档读回/预览及零调用阻断回归保障
 * [POS]: test 的 Beta 风格转换跨层合同测试，模型、Store 与飞书 CLI 均使用内存替身
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

import { betaConfigSnapshot, betaSceneParameters, buildBetaRunFields, captureBetaGenerationArchive, createBetaBaseStore } from "../src/beta-base.mjs";
import { assertBetaPromptAgentAccess, createBetaApiHandler, createBetaRunnerService } from "../src/beta-runner.mjs";
import { createAsyncTtlCache } from "../src/runtime-cache.mjs";
import { executeWhiteModelWorkflow } from "../src/white-model-workflow.mjs";

const FEATURE = "styleTransfer";
const SET_ID = "SET-STYLETRANSFER";
const SAMPLE_ID = "SAMPLE-STYLETRANSFER";
const TEST_TIME = "2026-10-16 14:00:00";
const AGENT_JSON = { scene_preservation: "Keep the room structure, camera and furniture layout.",
  visual_application: { materials: "Natural oak.", colors: "Warm neutral palette.", photography: "Preserve source perspective." },
  generation_requirement: "Restyle materials and furnishings using the selected style." };

async function image(width, height, background) {
  const bytes = await sharp({ create: { width, height, channels: 3, background } }).png().toBuffer();
  return { dataUrl: `data:image/png;base64,${bytes.toString("base64")}`, name: "space.png", size: bytes.length, type: "image/png" };
}
const source = await image(16, 8, "#f37021");
const styleReference = { ...await image(8, 8, "#bbbbbb"), name: "reference.png" };
const sourceMetadata = { image: { name: source.name, size: source.size, type: source.type }, prompt: "保持原布局",
  recordId: "rec-style-sample", sampleId: SAMPLE_ID, status: "可用" };
const sampleSet = { featureMode: FEATURE, name: "风格转换样本", recordId: "rec-style-set", sampleSetId: SET_ID,
  samples: [sourceMetadata], status: "可用" };

function batch({ renderMode = "style-dna", modelKeys = ["gptImage2"], input = {} } = {}) {
  return {
    assets: renderMode === "style-reference" ? { "shared-style": [styleReference] } : {},
    batchId: "BETA-STYLETRANSFER", featureMode: FEATURE, jobId: "beta-styletransfer001", sampleSetId: SET_ID, testTime: TEST_TIME,
    items: modelKeys.map((modelKey, index) => ({ caseId: SAMPLE_ID, sampleId: SAMPLE_ID, runId: `RUN-STYLETRANSFER-${index + 1}`,
      input: { modelKey, prompt: "保留空间结构", promptAgentModelKey: "gemini3pro", outputFormat: "png", ratio: "4:3", ratioMode: "auto", resolution: "1K",
        renderMode, styleCode: "modern@v2", styleTransferPromptAgentVersion: 2, styleTransferReferenceVersion: 3, ...input },
      ...(renderMode === "style-reference" ? { styleReferenceAssetKey: "shared-style" } : {}) })),
  };
}

function controlledQueue() {
  let operation;
  let enqueues = 0;
  const snapshots = [];
  return { jobs: { enqueue(jobId, input, execute) { enqueues += 1; operation = execute; return { jobId, ...input, status: "running" }; }, get() { return null; } },
    get enqueues() { return enqueues; }, run: () => operation((snapshot) => snapshots.push(snapshot)), snapshots };
}

function fakeStore(overrides = {}) {
  return { config: { baseUrl: "https://example.test/base", tableId: "tbl-style" }, async verifySchema() {},
    async getSampleSet() { return structuredClone(sampleSet); },
    async resolveSample() { return { ...sourceMetadata, featureMode: FEATURE, image: source }; },
    async beginRun({ item }) { return { recordId: item.runId }; },
    async completeRun(recordId) { return { recordUrl: `https://example.test/${recordId}`, previewUrl: "data:image/webp;base64,UklGRg==" }; },
    async failRun() {}, ...overrides };
}

function archiveStore(mutateReadback = () => {}) {
  const written = {};
  const uploads = [];
  const readFields = [];
  const attachments = {};
  const store = createBetaBaseStore({ async run(config, args) {
    if (args.includes("+record-batch-create")) {
      const body = JSON.parse(args[args.indexOf("--json") + 1]);
      Object.assign(written, Object.fromEntries(body.fields.map((name, index) => [name, body.rows[0][index]])));
      return { ok: true, data: { record_id_list: ["rec-style-run"] } };
    }
    if (args.includes("+record-upsert")) Object.assign(written, JSON.parse(args[args.indexOf("--json") + 1]));
    if (args.includes("+record-upload-attachment")) {
      const id = args[args.indexOf("--field-id") + 1];
      const name = id === config.inputFieldId ? "输入图" : id === config.styleReferenceFieldId ? "风格参考图" : "结果图";
      uploads.push(id);
      attachments[name] = [{ file_token: `${name}-token`, size: name === "风格参考图" ? styleReference.size : source.size }];
    }
    if (args.includes("+record-get")) {
      const fields = { ...written, ...structuredClone(attachments) };
      readFields.push(...args.filter((_arg, index) => args[index - 1] === "--field-id"));
      mutateReadback(fields);
      return { ok: true, data: { fields: Object.keys(fields), data: [Object.values(fields)], record_id_list: ["rec-style-run"] } };
    }
    return { ok: true, data: {} };
  } });
  return { store, written, uploads, readFields };
}

async function beginReferenceRun(store, mode = "style-reference") {
  const input = { ...batch({ renderMode: mode }).items[0].input, featureMode: FEATURE,
    referenceImages: [source], styleReferenceImages: mode === "style-reference" ? [styleReference] : [] };
  await store.beginRun({ batchId: "BETA-STYLETRANSFER", featureMode: FEATURE, testTime: TEST_TIME,
    item: { runId: "RUN-STYLETRANSFER-1", caseId: SAMPLE_ID, input } });
  const sync = captureBetaGenerationArchive({ durationMs: 120, finalPrompt: JSON.stringify(AGENT_JSON), modelLabel: "GPT Image 2", preview: { outputFormat: "png" },
    workflow: { feature: "style-transfer", renderMode: mode, selectionName: mode === "style-reference" ? "参考图风格" : "现代简约",
      agentCode: mode === "style-reference" ? "style-transfer-reference" : "style-transfer-fusion", agentVersion: 3 } });
  return () => store.completeRun("rec-style-run", { images: [{ url: source.dataUrl }], request: { outputFormat: "png" }, promptAgent: { version: 3 }, durationMs: 120, sync });
}

test("Beta 风格转换样本草稿及逐张上传复用主图校验，不要求空房房型", async () => {
  const saved = [];
  const service = createBetaRunnerService({ baseStore: fakeStore({
    async createSampleSet(value) { saved.push(value); return value; },
    async addSample(_id, value) { saved.push(value); return value; },
  }), generationService: {} });
  assert.ok(service.config().features.includes(FEATURE));
  const draft = await service.createSampleSet({ featureMode: FEATURE, name: "风格转换" });
  assert.equal(draft.featureMode, FEATURE);
  const sample = await service.addSample(SET_ID, { sampleId: SAMPLE_ID, image: { ...source, width: 1, height: 1 } });
  assert.equal(sample.image.width, 16);
  assert.equal(sample.image.height, 8);
  assert.equal("roomType" in sample, false);
  assert.throws(() => service.createSampleSet({ featureMode: FEATURE, name: "缺图", samples: [{}] }), /缺少有效图片/);
  await assert.rejects(service.addSample(SET_ID, { sampleId: SAMPLE_ID, image: { dataUrl: "data:image/png;base64,YQ==", type: "image/png" } }), /内容或 MIME/);
  assert.equal(saved.length, 2);
});

test("Beta 风格转换缺来源、旧智能默认、混合来源、无参考图或未冻结所选版本时零入队零下载", async () => {
  const invalid = [
    batch({ input: { renderMode: undefined, styleCode: undefined } }),
    batch({ input: { renderMode: "smart-default" } }),
    batch({ input: { styleCode: " " } }),
    batch({ input: { styleReferenceImages: [styleReference] } }),
    batch({ input: { styleTransferPromptAgentVersion: undefined } }),
    batch({ input: { styleTransferPromptAgentVersion: 0 } }),
    batch({ renderMode: "style-reference", input: { styleTransferReferenceVersion: undefined } }),
    batch({ renderMode: "style-reference", input: { styleTransferReferenceVersion: -1 } }),
  ];
  const missingReference = batch({ renderMode: "style-reference" });
  delete missingReference.items[0].styleReferenceAssetKey;
  invalid.push(missingReference);
  const malformedReference = batch({ renderMode: "style-reference" });
  malformedReference.assets["shared-style"] = [{ dataUrl: "data:image/png;base64,YQ==", type: "image/png" }];
  invalid.push(malformedReference);
  for (const body of invalid) {
    const queue = controlledQueue();
    let downloads = 0;
    let generations = 0;
    const service = createBetaRunnerService({ baseStore: fakeStore({ async resolveSample() { downloads += 1; } }),
      generationService: { async executeForMode() { generations += 1; } }, jobs: queue.jobs });
    await assert.rejects(Promise.resolve().then(() => service.start(body)), /风格转换|风格参考图/);
    assert.equal(queue.enqueues + downloads + generations, 0);
  }
});

test("Beta 风格转换在入队前检查样本功能、成员与 Prompt 基模权限", async () => {
  for (const changed of [{ featureMode: "whiteModel" }, { samples: [] }]) {
    const queue = controlledQueue();
    const service = createBetaRunnerService({ baseStore: fakeStore({ async getSampleSet() { return { ...sampleSet, ...changed }; } }), generationService: {}, jobs: queue.jobs });
    await assert.rejects(service.start(batch()), /功能.*不一致|不属于/);
    assert.equal(queue.enqueues, 0);
  }
  const models = [{ key: "gemini3pro", label: "Gemini 3.1 Pro", selectable: false }];
  assert.throws(() => assertBetaPromptAgentAccess(batch(), models), /当前未向这个 API Key 开放/);
  let enqueued = false;
  const api = createBetaApiHandler({ getAgentModels: async () => models, readJson: async () => batch(), sendJson() {}, service: { start() { enqueued = true; } } });
  await assert.rejects(api({ method: "POST" }, {}, "/api/beta/jobs"), /当前未向这个 API Key 开放/);
  assert.equal(enqueued, false);
});

test("Beta 平台风格按 ID 惰性读取单主图，冻结独立融合版本并逐 Run 保存配置", async () => {
  const queue = controlledQueue();
  const archived = [];
  let downloads = 0;
  let generations = 0;
  const service = createBetaRunnerService({ baseStore: fakeStore({
    async resolveSample() { downloads += 1; return { ...sourceMetadata, featureMode: FEATURE, image: source }; },
    async beginRun(value) { archived.push(buildBetaRunFields(value)); return { recordId: value.item.runId }; },
  }), generationService: { async executeForMode(mode, input) {
    generations += 1;
    assert.equal(mode, FEATURE);
    assert.equal(input.styleTransferPromptAgentVersion, 2);
    assert.equal(input.referenceImages.length, 1);
    assert.equal(input.referenceImages[0].width, 16);
    assert.equal(input.styleCode, "modern@v2");
    assert.equal("batchCount" in input, false);
    return { images: [{ url: source.dataUrl }] };
  } }, jobs: queue.jobs });
  const body = batch({ modelKeys: ["gptImage2", "aiTextureEnhancement"] });
  assert.doesNotMatch(JSON.stringify(body), /data:image|base64/);
  const accepted = await service.start(body);
  assert.equal(accepted.total, 2);
  assert.equal(downloads + generations, 0);
  const result = await queue.run();
  assert.equal(downloads, 2);
  assert.equal(generations, 2);
  assert.equal(result.results.length, 2);
  for (const fields of archived) {
    assert.equal(fields["功能"], "风格转换");
    const snapshot = JSON.parse(fields["配置快照"]);
    assert.equal(snapshot.styleTransferPromptAgentVersion, 2);
    assert.equal("styleTransferReferenceVersion" in snapshot, false);
    assert.equal(JSON.parse(fields["场景参数"]).styleCode, "modern@v2");
  }
  assert.deepEqual(queue.snapshots.at(-1).stages, { generated: 2, synced: 2 });
});

test("Beta 共用参考图只传一次，双模型及瞬时重试复用融合缓存并仅以主图出图", async () => {
  const queue = controlledQueue();
  const styleArrays = [];
  const archives = [];
  const attempts = [];
  let downloads = 0;
  let promptCalls = 0;
  let imageCalls = 0;
  let failed = false;
  const service = createBetaRunnerService({ baseStore: fakeStore({
    async resolveSample() { downloads += 1; return { ...sourceMetadata, featureMode: FEATURE, image: source }; },
    async beginRun({ item }) { styleArrays.push(item.input.styleReferenceImages); attempts.push(item.attempt); return { recordId: item.runId }; },
    async completeRun(recordId, result) { archives.push(result.sync.archiveFields); return { recordUrl: `https://example.test/${recordId}`, previewUrl: "data:image/webp;base64,UklGRg==" }; },
  }), generationService: { executeForMode(mode, input) {
    assert.equal(mode, FEATURE);
    assert.equal(input.styleTransferReferenceVersion, 3);
    assert.equal(input.styleCode, undefined);
    return executeWhiteModelWorkflow(input, {
      availableModels: [{ id: "gemini-3.1-pro-preview" }],
      client: { async generatePrompt(request) { promptCalls += 1; assert.deepEqual(request.imageUrls, [source.dataUrl, styleReference.dataUrl]); return { text: JSON.stringify(AGENT_JSON) }; } },
      imageClient: { async generateImage(request) { imageCalls += 1; assert.deepEqual(request.images.map((entry) => entry.image_url), [source.dataUrl]);
        if (!failed) { failed = true; throw Object.assign(new Error("暂不可用"), { statusCode: 503 }); }
        return { images: [{ url: source.dataUrl }], outputFormat: "png", transport: "responses" }; } },
      async loadAgent(code, { version }) { assert.equal(code, "style-transfer-reference"); assert.equal(version, 3); return { code, version, systemPrompt: "reference-only" }; },
      async loadStyle() { throw new Error("参考图路线禁止读取风格库"); },
      promptResultCache: cache,
      scheduleSync: captureBetaGenerationArchive,
    });
  } }, jobs: queue.jobs, sleep: async () => {} });
  const cache = createAsyncTtlCache();
  const body = batch({ renderMode: "style-reference", modelKeys: ["gptImage2", "aiTextureEnhancement"] });
  assert.equal(JSON.stringify(body).match(/data:image/g).length, 1);
  await service.start(body);
  assert.equal(downloads + promptCalls + imageCalls, 0);
  const result = await queue.run();
  assert.equal(downloads, 2);
  assert.equal(promptCalls, 1);
  assert.equal(imageCalls, 3);
  assert.ok(attempts.includes(2));
  assert.equal(styleArrays.every((value) => value === styleArrays[0]), true);
  assert.equal(result.results.length, 2);
  assert.equal(result.results.every((entry) => entry.previewUrl.startsWith("data:image/webp")), true);
  assert.equal(archives.every((fields) => fields["设计方式"] === "参考图风格" && fields["风格选择"] === "参考图风格" && fields["Agent 编码"] === "style-transfer-reference"), true);
  const snapshot = betaConfigSnapshot({ ...body.items[0].input, featureMode: FEATURE });
  assert.equal(snapshot.styleTransferReferenceVersion, 3);
  assert.equal("styleTransferPromptAgentVersion" in snapshot, false);
  const scene = betaSceneParameters({ ...body.items[0].input, featureMode: FEATURE, styleReferenceImages: [styleReference] });
  assert.equal(scene.styleReferenceUsed, true);
  assert.equal("styleCode" in scene, false);
});

test("Beta 风格转换实际归档回读来源、独立版本、三附件和结果尺寸，漂移不得显示预览", async () => {
  for (const drift of [null, "配置快照", "设计方式", "Agent 编码"]) {
    const { store, written, uploads, readFields } = archiveStore((fields) => { if (drift) fields[drift] = "drifted"; });
    const complete = await beginReferenceRun(store);
    if (drift) await assert.rejects(complete(), (error) => error.statusCode === 409 && error.retryable === false && error.message.endsWith(drift));
    else {
      const archived = await complete();
      assert.match(archived.previewUrl, /^data:image\/webp/);
      assert.equal(archived.attachment.size, source.size);
      assert.equal(written["尺寸"], "16x8");
      assert.equal(written["设计方式"], "参考图风格");
      assert.equal(written["风格选择"], "参考图风格");
      assert.equal(JSON.parse(written["配置快照"]).styleTransferReferenceVersion, 3);
      assert.equal(written["Prompt / 工作流版本"], "Prompt Agent v3");
      assert.equal(new Set(uploads).size, 3);
      assert.equal(["输入图", "风格参考图", "结果图"].every((name) => readFields.includes(name)), true);
    }
  }
});

test("Beta 风格转换三附件缺失、无 token、错字节或数量漂移时 409 阻止成功预览", async () => {
  for (const name of ["输入图", "风格参考图", "结果图"]) {
    for (const mutate of [
      (fields) => { delete fields[name]; },
      (fields) => { fields[name][0].file_token = ""; },
      (fields) => { fields[name][0].size = 1; },
      (fields) => { fields[name].push({ ...fields[name][0] }); },
    ]) {
      const { store } = archiveStore(mutate);
      const complete = await beginReferenceRun(store);
      await assert.rejects(complete(), (error) => error.statusCode === 409 && error.retryable === false && error.message.includes(name));
    }
  }
});

test("Beta 平台风格回读必须没有风格参考附件，额外附件不能误报完成", async () => {
  for (const unexpectedReference of [false, true]) {
    const { store, uploads, readFields } = archiveStore((fields) => {
      if (unexpectedReference) fields["风格参考图"] = [{ file_token: "unexpected-token", size: styleReference.size }];
    });
    const complete = await beginReferenceRun(store, "style-dna");
    if (unexpectedReference) await assert.rejects(complete(), (error) => error.statusCode === 409 && error.message.includes("风格参考图"));
    else assert.match((await complete()).previewUrl, /^data:image\/webp/);
    assert.equal(uploads.length, 2);
    assert.equal(readFields.includes("风格参考图"), true);
  }
});

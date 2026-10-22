/**
 * [INPUT]: 依赖 node:test/assert/fs、sharp 图片夹具、Beta Runner/样本 Store、效果图工作流、模型目录、浏览器图片打包/画幅适配与普通参考图边界
 * [OUTPUT]: 对外提供飞书样本 ID 入队、无整批图片容量限制、惰性取图、单图保护、上传幂等、归档进度及无元信息尺寸时自动画幅的独立回归保障
 * [POS]: test 的 Beta ID 传输与惰性取图合同测试，全部使用内存替身，不调用真实模型或飞书
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import sharp from "sharp";

import { BETA_BASE_CONFIG } from "../src/beta-base.mjs";
import { createBetaRunnerService } from "../src/beta-runner.mjs";
import { createBetaSampleStore } from "../src/beta-sample-store.mjs";
import { executeEffectRenderEnhancementWorkflow } from "../src/effect-render-enhancement-workflow.mjs";
import { publicModelCatalog } from "../src/model-config.mjs";
import { normalizeReferenceImages, REFERENCE_IMAGE_POLICY } from "../src/reference-image.mjs";
import { packBatchAssets } from "../public/beta-assets.js";
import { adaptGenerationInputForModel } from "../public/generation-batch.js";

const MIB = 1024 * 1024;
const SET_ID = "SET-REVIEW12345";
const PNG_BYTES = await sharp({ create: { background: "#f37021", channels: 3, height: 8, width: 8 } }).png().toBuffer();

function imageOfSize(size) {
  const bytes = Buffer.alloc(size);
  PNG_BYTES.copy(bytes);
  return { dataUrl: `data:image/png;base64,${bytes.toString("base64")}`, name: "source.png", size, type: "image/png" };
}

function sampleMetadata(sampleId, size = 7 * MIB) {
  return {
    image: { name: "source.png", previewUrl: "/api/beta/preview", size, type: "image/png" },
    prompt: "保留空间结构",
    recordId: `rec-${sampleId}`,
    roomType: "",
    roomTypeDetail: "",
    sampleId,
    status: "可用",
  };
}

function metadataSet(samples, featureMode = "effectBeautification") {
  return { featureMode, name: "ID 合同夹具", recordId: "rec-set-review", sampleCount: samples.length, sampleSetId: SET_ID, samples, status: "可用" };
}

function batchFor(samples, { featureMode = "effectBeautification", jobId = "beta-idreview123456", modelCount = 1 } = {}) {
  return {
    batchId: "BETA-IDREVIEW123",
    featureMode,
    items: samples.flatMap((sample, index) => Array.from({ length: modelCount }, (_, modelIndex) => ({
      caseId: sample.sampleId,
      input: {
        effectBeautification: { intensity: "high", tone: "cool" },
        effectBeautificationPromptVersion: 2,
        modelKey: modelIndex ? "gptImage2" : "aiTextureEnhancement",
        prompt: "保留空间结构",
        ratioMode: "original",
      },
      label: `样本 ${index + 1}`,
      modelLabel: modelIndex ? "GPT Image 2" : "Flux 2 Klein",
      runId: `RUN-IDREVIEW-${index + 1}-${modelIndex + 1}`,
      sampleId: sample.sampleId,
    }))),
    jobId,
    sampleSetId: SET_ID,
    testTime: "2026-10-12 14:03:21",
  };
}

function controlledRegistry() {
  let task;
  const snapshots = [];
  return {
    jobs: {
      enqueue(jobId, input, operation) {
        task = operation;
        return { ...input, jobId, status: "running" };
      },
      get() { return null; },
    },
    run: () => task((snapshot) => snapshots.push(snapshot)),
    snapshots,
  };
}

function fixtureStore(sampleSet, overrides = {}) {
  return {
    config: { baseUrl: "https://example.test/base", tableId: "tbl-fixture" },
    async getSampleSet(sampleSetId) { return sampleSetId === SET_ID ? sampleSet : null; },
    async beginRun({ item }) { return { recordId: `run-${item.runId}` }; },
    async completeRun(recordId) { return { recordId, recordUrl: `https://example.test/${recordId}`, previewUrl: "data:image/webp;base64,UklGRg==" }; },
    async failRun() {},
    async verifySchema() {},
    ...overrides,
  };
}

test("已有飞书样本合计超过 20MB 仍以 ID 入队，排队前不读取原图", async () => {
  const samples = [1, 2, 3].map((index) => sampleMetadata(`${SET_ID}-${index}`));
  assert.ok(samples.reduce((sum, sample) => sum + sample.image.size, 0) > 20 * MIB);
  const registry = controlledRegistry();
  let downloads = 0;
  const service = createBetaRunnerService({
    baseStore: fixtureStore(metadataSet(samples), { async resolveSample() { downloads += 1; throw new Error("排队阶段不应下载"); } }),
    generationService: { async executeForMode() { throw new Error("未执行队列"); } },
    jobs: registry.jobs,
  });
  const body = batchFor(samples, { modelCount: 4 });
  const packed = packBatchAssets(body.items, body.featureMode);
  assert.deepEqual(packed.assets, {});
  assert.equal(packed.items.length, 12);
  assert.ok(JSON.stringify({ ...body, ...packed }).length < 12 * 1024);
  assert.doesNotMatch(JSON.stringify({ ...body, ...packed }), /data:image|base64,/);
  const accepted = await service.start({ ...body, ...packed });
  assert.equal(accepted.total, 12);
  assert.equal(downloads, 0);
});

test("ID 批次执行最多两路逐图读取，归档保留美化参数并在飞书确认后增加进度", async () => {
  const samples = [1, 2, 3].map((index) => sampleMetadata(`${SET_ID}-${index}`));
  const source = imageOfSize(7 * MIB);
  const registry = controlledRegistry();
  const events = [];
  const archived = [];
  let active = 0;
  let maxActive = 0;
  const service = createBetaRunnerService({
    baseStore: fixtureStore(metadataSet(samples), {
      async resolveSample(sampleSetId, sampleId, identity) {
        assert.equal(sampleSetId, SET_ID);
        assert.equal(identity.recordId, `rec-${sampleId}`);
        assert.equal(identity.sampleSetRecordId, "rec-set-review");
        events.push(`read:${sampleId}`);
        return { ...samples.find((sample) => sample.sampleId === sampleId), image: source };
      },
      async beginRun({ item }) {
        archived.push(item);
        assert.equal(item.input.referenceImages.length, 1);
        assert.deepEqual(item.input.effectBeautification, { intensity: "high", tone: "cool" });
        assert.equal(item.input.effectBeautificationPromptVersion, 2);
        return { recordId: item.runId };
      },
      async completeRun(recordId) {
        events.push(`sync:${recordId}`);
        return { recordUrl: `https://example.test/${recordId}`, previewUrl: "data:image/webp;base64,UklGRg==" };
      },
    }),
    generationService: {
      async executeForMode(mode, input) {
        assert.equal(mode, "effectBeautification");
        assert.equal(input.referenceImages.length, 1);
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 1));
        active -= 1;
        return { images: [{ url: "data:image/png;base64,unused-fixture" }] };
      },
    },
    jobs: registry.jobs,
  });
  await service.start(batchFor(samples));
  assert.deepEqual(events, []);
  const result = await registry.run();
  assert.equal(result.results.length, 3);
  assert.equal(maxActive, 2);
  assert.equal(archived.length, 3);
  assert.deepEqual(registry.snapshots.at(-1).stages, { generated: 3, synced: 3 });
  assert.equal(registry.snapshots.at(-1).completed, 3);
  assert.doesNotMatch(JSON.stringify(result), /data:image\/png|保留空间结构/);
});

test("入队拒绝不存在或其他样本集的样本ID，保持零取图零模型", async () => {
  const sample = sampleMetadata(`${SET_ID}-1`);
  for (const mutation of [
    (body) => { body.sampleSetId = "SET-MISSING123"; },
    (body) => { body.items[0].sampleId = "SET-FOREIGN123-1"; },
  ]) {
    let downloads = 0;
    let generations = 0;
    let admissions = 0;
    const service = createBetaRunnerService({
      baseStore: fixtureStore(metadataSet([sample]), { async resolveSample() { downloads += 1; } }),
      generationService: { async executeForMode() { generations += 1; } },
      jobs: { enqueue() { admissions += 1; } },
    });
    const body = batchFor([sample]);
    mutation(body);
    await assert.rejects(async () => service.start(body), /样本|功能/);
    assert.equal(admissions, 0);
    assert.equal(downloads, 0);
    assert.equal(generations, 0);
  }
});

test("取消 Beta 整批限制不改变普通生成的单图 8MB 与合计 20MB 保护", () => {
  assert.equal(REFERENCE_IMAGE_POLICY.maxBytesPerImage, 8 * MIB);
  assert.equal(REFERENCE_IMAGE_POLICY.maxTotalBytes, 20 * MIB);
  const source = imageOfSize(7 * MIB);
  assert.throws(() => normalizeReferenceImages([source, source, source]), /合计不能超过 20MB/);
  const oversized = imageOfSize(8 * MIB + 1);
  assert.throws(() => normalizeReferenceImages([oversized]), /不能超过 8MB/);
});

test("执行取到超限原图时不创建 Run 或调用模型，永久错误只读取一次", async () => {
  const sample = sampleMetadata(`${SET_ID}-oversized`);
  const registry = controlledRegistry();
  let reads = 0;
  let runs = 0;
  let generations = 0;
  const service = createBetaRunnerService({
    baseStore: fixtureStore(metadataSet([sample]), {
      async resolveSample() { reads += 1; return { ...sample, image: imageOfSize(8 * MIB + 1) }; },
      async beginRun() { runs += 1; },
    }),
    generationService: { async executeForMode() { generations += 1; } },
    jobs: registry.jobs,
    sleep: async () => {},
  });
  await service.start(batchFor([sample]));
  await assert.rejects(registry.run(), /不能超过 8MB.*不可重试/);
  assert.equal(reads, 1);
  assert.equal(runs, 0);
  assert.equal(generations, 0);
});

test("模型瞬时重试复用当前单样本原图，Attempt 与飞书回读进度保持独立", async () => {
  const sample = sampleMetadata(`${SET_ID}-retry`);
  const registry = controlledRegistry();
  let reads = 0;
  let generations = 0;
  const attempts = [];
  const service = createBetaRunnerService({
    baseStore: fixtureStore(metadataSet([sample]), {
      async resolveSample() { reads += 1; return { ...sample, image: imageOfSize(PNG_BYTES.length) }; },
      async beginRun({ item }) { attempts.push(item.attempt); return { recordId: item.runId }; },
    }),
    generationService: { async executeForMode() {
      generations += 1;
      if (generations === 1) throw Object.assign(new Error("模型暂时繁忙"), { statusCode: 503 });
      return { images: [{ url: "data:image/png;base64,unused-fixture" }] };
    } },
    jobs: registry.jobs,
    sleep: async () => {},
  });
  await service.start(batchFor([sample]));
  const result = await registry.run();
  assert.equal(reads, 1);
  assert.equal(generations, 2);
  assert.deepEqual(attempts, [1, 2]);
  assert.equal(result.results[0].attempt, 2);
  assert.deepEqual(registry.snapshots.at(-1).stages, { generated: 1, synced: 1 });
});

function sampleStoreFixture() {
  const config = { ...BETA_BASE_CONFIG };
  const setRows = new Map([["rec-set-review", { recordId: "rec-set-review", fields: {
    "样本集 ID": SET_ID, "名称": "逐图夹具", "功能": "效果图美化", "状态": null, "样本数量": 0,
  } }]]);
  const sampleRows = new Map();
  const files = new Map();
  const counts = { created: 0, downloaded: 0, uploaded: 0 };
  let loseUploadReply = false;
  const table = (tableId) => tableId === config.sampleSetTableId ? setRows : sampleRows;
  const store = createBetaSampleStore({
    config,
    featureLabels: { effectBeautification: "效果图美化" },
    async createRecord(_run, _config, fields, tableId) {
      counts.created += 1;
      const recordId = `rec-new-${counts.created}`;
      table(tableId).set(recordId, { fields: { ...fields }, recordId });
      return recordId;
    },
    async updateRecord(_run, _config, recordId, fields, tableId) {
      Object.assign(table(tableId).get(recordId).fields, fields);
    },
    async listRecords(_run, _config, tableId) { return [...table(tableId).values()]; },
    async getRecord(_run, _config, tableId, recordId) { return table(tableId).get(recordId); },
    async uploadAttachments(_run, _config, recordId, _fieldId, names, cwd) {
      assert.equal(names.length, 1);
      counts.uploaded += 1;
      const bytes = await readFile(join(cwd, names[0]));
      const fileToken = `file-${counts.uploaded}`;
      files.set(fileToken, bytes);
      sampleRows.get(recordId).fields["样本图"] = [{ file_token: fileToken, name: names[0], size: bytes.length }];
      if (loseUploadReply) {
        loseUploadReply = false;
        throw Object.assign(new Error("模拟附件已写入但响应丢失"), { statusCode: 503 });
      }
    },
    async run(_config, args, { cwd }) {
      assert.ok(args.includes("+record-download-attachment"));
      counts.downloaded += 1;
      const token = args[args.indexOf("--file-token") + 1];
      await writeFile(join(cwd, args[args.indexOf("--output") + 1]), files.get(token));
    },
  });
  return { counts, files, loseNextUploadReply: () => { loseUploadReply = true; }, sampleRows, setRows, store };
}

test("新建样本集显式保存空状态并回读，未完成上传的草稿不进入可运行目录", async () => {
  const fixture = sampleStoreFixture();
  const draft = await fixture.store.createSampleSet({ featureMode: "effectBeautification", name: "尚未完成的样本" });
  assert.equal(draft.status, null);
  assert.equal(draft.sampleCount, 0);
  assert.deepEqual(draft.samples, []);
  assert.equal(fixture.setRows.get(draft.recordId).fields["状态"], null);
  assert.deepEqual(await fixture.store.listSampleSets(), []);
  assert.equal(await fixture.store.getSampleSet(draft.sampleSetId), null);
  assert.equal((await fixture.store.getSampleSet(draft.sampleSetId, { includeDraft: true })).sampleSetId, draft.sampleSetId);
  assert.deepEqual(fixture.counts, { created: 1, downloaded: 0, uploaded: 0 });
});

test("逐张上传在丢失响应后按稳定 ID 回读重试，不重复样本记录或附件", async () => {
  const fixture = sampleStoreFixture();
  const image = imageOfSize(PNG_BYTES.length);
  const sample = { image, sampleId: "SAMPLE-IDREVIEW-001", prompt: "" };
  fixture.loseNextUploadReply();
  await assert.rejects(fixture.store.addSample(SET_ID, sample), /响应丢失/);
  assert.equal(fixture.counts.created, 1);
  assert.equal(fixture.counts.uploaded, 1);
  assert.deepEqual(await fixture.store.listSampleSets(), []);
  const saved = await fixture.store.addSample(SET_ID, sample);
  assert.equal(saved.sampleId, sample.sampleId);
  assert.equal(saved.image.size, image.size);
  assert.equal("dataUrl" in saved.image, false);
  assert.equal(fixture.counts.created, 1);
  assert.equal(fixture.counts.uploaded, 1);
  await assert.rejects(fixture.store.completeSampleSet(SET_ID, [sample.sampleId, "SAMPLE-MISSING"]), /未全部上传/);
  assert.deepEqual(await fixture.store.listSampleSets(), []);
  const completed = await fixture.store.completeSampleSet(SET_ID, [sample.sampleId]);
  assert.equal(completed.status, "可用");
  assert.equal(completed.sampleCount, 1);
  assert.equal(fixture.counts.downloaded, 1);
  const metadata = await fixture.store.getSampleSet(SET_ID);
  assert.doesNotMatch(JSON.stringify(metadata), /data:image|base64,/);
  assert.equal(fixture.counts.downloaded, 1);
  const actual = await fixture.store.resolveSample(SET_ID, sample.sampleId);
  assert.equal(actual.image.dataUrl, image.dataUrl);
  assert.equal(fixture.counts.downloaded, 2);
});

test("新样本实际字节超过 8MB、伪造尺寸或 MIME 时在所有 Base 写入前拒绝", async () => {
  for (const image of [
    imageOfSize(8 * MIB + 1),
    { ...imageOfSize(PNG_BYTES.length), size: 1 },
    { ...imageOfSize(PNG_BYTES.length), type: "image/jpeg" },
  ]) {
    const fixture = sampleStoreFixture();
    await assert.rejects(fixture.store.addSample(SET_ID, { sampleId: "SAMPLE-BAD", image }), /8MB|字节数|MIME/);
    assert.deepEqual(fixture.counts, { created: 0, downloaded: 0, uploaded: 0 });
  }
});

test("执行取图再次验证实际字节，飞书声明伪造不绕过单图保护", async () => {
  const fixture = sampleStoreFixture();
  fixture.setRows.get("rec-set-review").fields["状态"] = "可用";
  const sampleId = "SAMPLE-OVERSIZED";
  fixture.sampleRows.set("rec-oversized", { recordId: "rec-oversized", fields: {
    "样本 ID": sampleId, "样本集": ["rec-set-review"], "状态": "可用", "文件名": "source.png",
    "样本图": [{ file_token: "file-oversized", name: "source.png", size: PNG_BYTES.length }],
  } });
  fixture.files.set("file-oversized", Buffer.alloc(8 * MIB + 1));
  await assert.rejects(fixture.store.resolveSample(SET_ID, sampleId), /不能超过 8MB/);
  assert.equal(fixture.counts.downloaded, 1);
  assert.equal(fixture.counts.created, 0);
  assert.equal(fixture.counts.uploaded, 0);
});

test("运行期按记录 ID 直接取图仍验证业务样本 ID 与样本集关联", async () => {
  const fixture = sampleStoreFixture();
  fixture.setRows.get("rec-set-review").fields["状态"] = "可用";
  const sampleId = "SAMPLE-IDBOUND";
  const fields = { "样本 ID": sampleId, "样本集": ["rec-set-review"], "状态": "可用", "文件名": "source.png",
    "样本图": [{ file_token: "file-bound", name: "source.png", size: PNG_BYTES.length }] };
  fixture.sampleRows.set("rec-canonical", { recordId: "rec-canonical", fields });
  fixture.sampleRows.set("rec-foreign", { recordId: "rec-foreign", fields: { ...fields, "样本集": ["rec-other-set"] } });
  fixture.files.set("file-bound", PNG_BYTES);
  const identity = { recordId: "rec-canonical", sampleSetRecordId: "rec-set-review" };
  const source = await fixture.store.resolveSample(SET_ID, sampleId, identity);
  assert.equal(source.sampleId, sampleId);
  assert.equal(source.featureMode, "effectBeautification");
  assert.equal(source.image.size, PNG_BYTES.length);
  assert.equal(fixture.counts.downloaded, 1);
  await assert.rejects(fixture.store.resolveSample(SET_ID, sampleId, { ...identity, recordId: "rec-foreign" }),
    /不属于所选样本集/);
  await assert.rejects(fixture.store.resolveSample(SET_ID, "SAMPLE-OTHERID", identity), /不属于所选样本集/);
  assert.equal(fixture.counts.downloaded, 1);
});

test("样本元信息没有宽高仍在读取原图后自动适配 OneAPI 与 Flux，手动画幅保持用户选择", async () => {
  const bytes = await sharp({ create: { background: "#f37021", channels: 3, height: 128, width: 72 } }).png().toBuffer();
  const source = { dataUrl: `data:image/png;base64,${bytes.toString("base64")}`, name: "portrait.png", size: bytes.length, type: "image/png" };
  const sample = sampleMetadata(`${SET_ID}-portrait`, bytes.length);
  const catalog = publicModelCatalog();
  const preset = { NATURAL: "maintain original materials and improve lighting", WARM: "maintain original materials and improve warm lighting", COOL: "maintain original materials and improve cool lighting" };
  for (const ratioMode of ["auto", "manual"]) {
    const registry = controlledRegistry();
    const requests = [];
    const previews = [];
    const service = createBetaRunnerService({
      baseStore: fixtureStore(metadataSet([sample]), {
        async resolveSample() { return { ...sample, image: source }; },
        async completeRun(recordId, result) { previews.push(result.request); return { recordUrl: `https://example.test/${recordId}` }; },
      }),
      generationService: {
        executeForMode(_mode, input) {
          return executeEffectRenderEnhancementWorkflow(input, {
            async loadBeautificationPrompt() { return { code: "effect-render-beautification", prompt: JSON.stringify({ LOW: preset, HIGH: preset }), published: true, version: 2 }; },
            imageClient: { async generateImage(request) { requests.push(request); return { images: [{ url: source.dataUrl }] }; } },
          });
        },
      },
      jobs: registry.jobs,
    });
    const body = batchFor([sample], { modelCount: 2 });
    body.items = body.items.map((item) => {
      const model = catalog.find((entry) => entry.key === item.input.modelKey);
      return { ...item, input: adaptGenerationInputForModel({ ...item.input,
        outputFormat: "png", ratio: "4:3", ratioMode, resolution: "1K",
        referenceImages: [],
      }, model, { featureMode: body.featureMode, sourceImage: null }) };
    });
    await service.start(body);
    await registry.run();
    assert.equal(requests.length, 2);
    assert.equal(previews.find((preview) => preview.model === catalog.find((model) => model.key === "gptImage2").id)?.ratio,
      ratioMode === "auto" ? "9:16" : "4:3");
    const flux = previews.find((preview) => preview.model === catalog.find((model) => model.key === "aiTextureEnhancement").id);
    assert.equal(flux.ratio, "source");
    const [width, height] = flux.size.split("x").map(Number);
    assert.ok(width < height);
    assert.equal(width % 16, 0);
    assert.equal(height % 16, 0);
  }
});

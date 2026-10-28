/**
 * [INPUT]: 依赖 node:test/assert/fs、sharp真实图片、Beta Runner/样本Store、模型及功能目录与扩图能力合同，精模明确旧参数并替身冻结Prompt
 * [OUTPUT]: 对外提供已有样本跨功能按ID复用、含合法旧精模参数的目标功能内容准入、成员/记录ID/状态/8MB/MIME守卫、新建保留来源功能与零样本复制写入回归保障
 * [POS]: test 的 Beta跨来源样本复用合同，真实图片和本地下载替身，不调用模型或飞书
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { BETA_BASE_CONFIG, betaFeatureLabel } from "../src/beta-base.mjs";
import { BETA_FEATURE_MODES, createBetaRunnerService } from "../src/beta-runner.mjs";
import { createBetaSampleStore } from "../src/beta-sample-store.mjs";
import { publicImageOutpaintConfig } from "../src/image-outpaint-service.mjs";

const SET_ID = "SET-CROSSFEATURE1", SAMPLE_ID = "SAMPLE-CROSSFEATURE1";
const featureLabels = Object.fromEntries(BETA_FEATURE_MODES.map((key) => [key, betaFeatureLabel(key)]));
async function png(width = 128, height = 96) {
  return sharp({ create: { width, height, channels: 3, background: "#6f7d8a" } }).png().toBuffer();
}
function registry() {
  let operation;
  const snapshots = [];
  return { enqueues: 0, jobs: { enqueue(_id, input, execute) { operation = execute; return { ...input, status: "running" }; } },
    run: () => operation((value) => snapshots.push(value)), snapshots };
}
function batch(featureMode, input = {}) {
  return { batchId: "BETA-crossfeature1", jobId: "beta-crossfeature001", sampleSetId: SET_ID,
    featureMode, testTime: "2026-10-19 14:00:00", items: [{ caseId: "untrusted-case", sampleId: SAMPLE_ID,
      runId: "RUN-crossfeature01", input: { modelKey: "aiTextureEnhancement", ...input } }] };
}
function sampleFixture(bytes, { sourceFeature = "whiteModel", prompt = "", hasImage = true } = {}) {
  const config = BETA_BASE_CONFIG;
  const counts = { downloaded: 0, written: 0, created: 0 };
  const set = { recordId: "rec-set", fields: { "样本集 ID": SET_ID, "名称": "旧功能样本", "功能": featureLabels[sourceFeature], "状态": "可用", "样本数量": 1 } };
  const sample = { recordId: "rec-sample", fields: { "样本 ID": SAMPLE_ID, "样本集": [{ id: "rec-set" }], "状态": "可用", "提示词": prompt, "文件名": "source.png",
    "样本图": hasImage ? [{ file_token: "source-token", name: "source.png", size: bytes.length }] : [] } };
  const store = createBetaSampleStore({ config, featureLabels,
    async listRecords(_run, _config, table) { return [table === config.sampleSetTableId ? set : sample]; },
    async getRecord(_run, _config, table, recordId) {
      const row = table === config.sampleSetTableId ? set : sample;
      return row.recordId === recordId ? row : null;
    },
    async createRecord() { counts.created += 1; throw new Error("复用现有样本不应新建记录"); },
    async updateRecord() { counts.written += 1; throw new Error("复用现有样本不应写样本记录"); },
    async uploadAttachments() { counts.written += 1; throw new Error("复用现有样本不应上传附件"); },
    async run(_config, args, { cwd }) {
      assert.ok(args.includes("+record-download-attachment"));
      counts.downloaded += 1;
      await writeFile(join(cwd, args[args.indexOf("--output") + 1]), bytes);
    },
  });
  return { store, counts, set, sample };
}
function runner(fixture, overrides = {}) {
  const queue = registry(), generated = [], archives = [];
  const service = createBetaRunnerService({ jobs: queue.jobs,
    baseStore: { ...fixture.store,
      async beginRun({ featureMode, item }) { archives.push({ featureMode, item }); return { recordId: item.runId }; },
      async completeRun(recordId) { return { recordUrl: `https://example.test/${recordId}` }; }, async failRun() {},
    },
    getOutpaintConfig: async () => publicImageOutpaintConfig({ available: true }),
    generationService: { async executeForMode(featureMode, input) { generated.push({ featureMode, input }); return { images: [] }; } },
    sleep: async () => { throw new Error("内容合同错误不应重试"); }, ...overrides,
  });
  return { service, queue, generated, archives };
}

test("已有白模样本跨来源复用于扩图/其他图像功能，原ID与源图不复制也不改归属", async () => {
  for (const target of ["imageOutpaint", "effectBeautification", "refinedModel", "emptyRoom"]) {
    const fixture = sampleFixture(await png());
    const { service, queue, generated, archives } = runner(fixture, target === "refinedModel"
      ? { prepareRefinedInput: async value => ({ ...value, promptVersion: 12, refinedPromptSha256: "a".repeat(64) }) } : {});
    const input = target === "imageOutpaint" ? { modelKey: undefined, outpaintWorkflowKey: "outpaint-flux-onereward" }
      : target === "emptyRoom" ? { roomType: "客厅" }
        : target === "refinedModel" ? { refinedRender: { preset: "preserve" } } : {};
    const request = batch(target, input);
    assert.doesNotMatch(JSON.stringify(request), /base64|data:image/);
    await service.start(request);
    assert.equal(fixture.counts.downloaded, 0);
    await queue.run();
    assert.equal(generated.length, 1);
    assert.equal(generated[0].featureMode, target);
    assert.equal(generated[0].input.referenceImages.length, 1);
    assert.equal(archives[0].item.caseId, SAMPLE_ID);
    assert.equal(archives[0].item.sourceRecordId, "rec-sample");
    assert.equal(archives[0].item.sourceSetRecordId, "rec-set");
    assert.equal(archives[0].featureMode, target);
    assert.equal(fixture.set.fields["功能"], "白模渲染");
    assert.deepEqual(fixture.counts, { downloaded: 1, written: 0, created: 0 });
    assert.deepEqual(queue.snapshots.at(-1).stages, { generated: 1, synced: 1 });
  }
});

test("free复用任意来源的有效prompt样本，不将客户端文字或纯图片冒充样本prompt", async () => {
  for (const sourceFeature of ["whiteModel", "imageOutpaint", "free"]) {
    const fixture = sampleFixture(await png(), { sourceFeature, prompt: "  原样本提示词  " });
    const { service, queue, generated } = runner(fixture);
    await service.start(batch("free", { prompt: "客户端伪造文字" }));
    await queue.run();
    assert.equal(generated[0].input.prompt, "原样本提示词");
    assert.equal(generated[0].input.referenceImages.length, 0);
    assert.deepEqual(fixture.counts, { downloaded: 0, written: 0, created: 0 });
  }
  const fixture = sampleFixture(await png(), { prompt: "  " });
  const { service, generated, archives } = runner(fixture);
  await assert.rejects(service.start(batch("free", { prompt: "客户端不能弥补空样本" })), /有效提示词/);
  assert.equal(generated.length + archives.length, 0);
});

test("图像任务拒绝纯提示词样本和缺图片成员，客户端重传不能绕过", async () => {
  const fixture = sampleFixture(await png(), { sourceFeature: "free", prompt: "仅文字", hasImage: false });
  const { service, generated, archives } = runner(fixture);
  await assert.rejects(service.start(batch("whiteModel")), /缺少有效原图/);
  await assert.rejects(service.start(batch("whiteModel", { referenceImages: [{ dataUrl: "data:image/png;base64,AA==" }] })), /仅提交飞书样本ID|仅提交飞书样本 ID/);
  assert.equal(generated.length + archives.length, 0);
  assert.deepEqual(fixture.counts, { downloaded: 0, written: 0, created: 0 });
});

test("目标全景按本次执行校验2:1，来源功能不能放宽或错误加强合同", async () => {
  for (const [width, height, sourceFeature, success] of [[128, 64, "whiteModel", true], [128, 96, "whiteModel", false], [128, 96, "panoramaEnhancement", false]]) {
    const fixture = sampleFixture(await png(width, height), { sourceFeature });
    const { service, queue, generated, archives } = runner(fixture);
    await service.start(batch("panoramaEnhancement", { panoramaPromptVersion: 3 }));
    if (success) { await queue.run(); assert.equal(generated.length, 1); }
    else { await assert.rejects(queue.run(), /2:1.*不可重试/); assert.equal(generated.length + archives.length, 0); }
    assert.equal(fixture.counts.downloaded, 1);
    assert.equal(fixture.counts.created + fixture.counts.written, 0);
  }
  const fixture = sampleFixture(await png(128, 96), { sourceFeature: "panoramaEnhancement" });
  const { service, queue, generated } = runner(fixture);
  await service.start(batch("effectBeautification"));
  await queue.run();
  assert.equal(generated.length, 1);
});

test("跨来源复用保持样本状态/成员/记录关联核验和空房逐样本房型要求", async () => {
  for (const change of [
    (fixture) => { fixture.set.fields["状态"] = null; },
    (fixture) => { fixture.sample.fields["样本集"] = [{ id: "rec-foreign" }]; },
    (fixture) => { fixture.sample.fields["状态"] = null; },
  ]) {
    const fixture = sampleFixture(await png());
    change(fixture);
    const { service, generated, archives } = runner(fixture);
    await assert.rejects(service.start(batch("effectBeautification")), /样本集|样本不属于/);
    assert.equal(generated.length + archives.length, 0);
    assert.equal(fixture.counts.downloaded, 0);
  }
  const fixture = sampleFixture(await png());
  const { service } = runner(fixture);
  await assert.rejects(service.start(batch("emptyRoom")), /有效房间类型/);
  await assert.rejects(fixture.store.resolveSample(SET_ID, "SAMPLE-FOREIGN", {
    recordId: "rec-sample", sampleSetRecordId: "rec-set", targetFeatureMode: "effectBeautification",
  }), /不属于/);
  await assert.rejects(fixture.store.resolveSample(SET_ID, SAMPLE_ID, {
    recordId: "rec-foreign", sampleSetRecordId: "rec-set", targetFeatureMode: "effectBeautification",
  }), /不属于/);
  assert.equal(fixture.counts.downloaded, 0);
});

test("新建仍按当前功能保存，已有来源功能和样本记录保持不变", async () => {
  const created = [];
  const service = createBetaRunnerService({ baseStore: {
    async createSampleSet(value) { created.push(value); return value; },
  }, generationService: {} });
  const result = await service.createSampleSet({ featureMode: "imageOutpaint", name: "扩图新样本" });
  assert.equal(result.featureMode, "imageOutpaint");
  assert.deepEqual(created, [{ featureMode: "imageOutpaint", name: "扩图新样本", samples: [] }]);
});

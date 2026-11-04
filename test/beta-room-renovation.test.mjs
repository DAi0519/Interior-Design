/**
 * [INPUT]: 依赖 Node 测试/断言、sharp 真实图片、Beta 样本/任务/归档边界与共享旧房设计工作流
 * [OUTPUT]: 验证旧房独立功能/房型/两路版本冻结、跨功能身份隔离及Agent权限、ID样本复用到单次旧房生成、实际Agent/场景归档校验和同步失败零重生成
 * [POS]: test 的 Beta 旧房改造跨层合同测试，模型、飞书及上传均使用内存替身
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from "node:assert/strict";
import test from "node:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { betaFeatureLabel, betaSceneParameters, betaConfigSnapshot, createBetaBaseStore, captureBetaGenerationArchive, buildBetaRunFields } from "../src/beta-base.mjs";
import { assertBetaPromptAgentAccess, createBetaApiHandler, createBetaRunnerService } from "../src/beta-runner.mjs";
import { executeWhiteModelWorkflow } from "../src/white-model-workflow.mjs";
import { ROOM_RENOVATION_PROMPT_CONFIG } from "../src/prompt-agent.mjs";

const FEATURE = "roomRenovation";
const SET_ID = "SET-renovation-001";
const SAMPLE_ID = "SAMPLE-renovation-001";
const TEST_TIME = "2026-11-04 12:00:00";
const bytes = await sharp({ create: { width: 16, height: 8, channels: 3, background: "orange" } }).png().toBuffer();
const source = { dataUrl: `data:image/png;base64,${bytes.toString("base64")}`, name: "old-room.png", type: "image/png", size: bytes.length };
const sample = { sampleId: SAMPLE_ID, recordId: "rec-sample", status: "可用", prompt: "保留墙体", roomType: "", image: { name: source.name, type: source.type, size: source.size } };
const sourceSet = { featureMode: "whiteModel", sampleSetId: SET_ID, recordId: "rec-set", status: "可用", samples: [sample] };

function batch(input = {}, renderMode = "smart-default") {
  return { featureMode: FEATURE, batchId: "BETA-renovation-001", jobId: "beta-renovation-001", sampleSetId: SET_ID, testTime: TEST_TIME,
    items: [{ sampleId: SAMPLE_ID, caseId: SAMPLE_ID, runId: "RUN-renovation-001", input: {
      featureMode: "emptyRoom", designScenario: "room-renovation", renderMode, roomType: "客厅", modelKey: "gptImage2",
      promptAgentModelKey: "gemini3pro", prompt: "温暖的新家", ratio: "2:1", resolution: "1K", outputFormat: "png",
      ...(renderMode === "smart-default" ? { roomRenovationSmartDefaultVersion: 4 } : { styleCode: "modern@v2", roomRenovationPromptAgentVersion: 5 }), ...input,
    } }] };
}
function fakeStore(overrides = {}) {
  return { config: { baseUrl: "https://example.test/base", tableId: "tbl-renovation" }, async verifySchema() {},
    async getSampleSet() { return structuredClone(sourceSet); }, async resolveSample() { return { ...sample, image: source }; },
    async beginRun({ item }) { return { recordId: item.runId }; },
    async completeRun(recordId) { return { recordId, recordUrl: `https://example.test/${recordId}` }; }, async failRun() {}, ...overrides };
}
async function settled(service, jobId) {
  for (let index = 0; index < 200; index += 1) {
    const job = service.getJob(jobId);
    if (job && job.status !== "running") return job;
    await new Promise(resolve => setImmediate(resolve));
  }
  throw new Error("Beta task did not settle");
}

test("Beta旧房有独立功能标签，创建及逐样本上传复用空房房型合同", async () => {
  const saved = [];
  const service = createBetaRunnerService({ baseStore: fakeStore({
    async createSampleSet(value) { saved.push(value); return value; },
    async getSampleSet() { return { ...sourceSet, featureMode: FEATURE }; },
    async addSample(_id, value) { saved.push(value); return value; },
  }), generationService: {} });
  assert.ok((await service.config()).features.includes(FEATURE));
  assert.equal(betaFeatureLabel(FEATURE), "旧房改造");
  await service.createSampleSet({ featureMode: FEATURE, name: "旧房" });
  const result = await service.addSample(SET_ID, { sampleId: SAMPLE_ID, image: source, roomType: "其他", roomTypeDetail: " 衣帽间 " });
  assert.equal(result.roomType, "其他");
  assert.equal(result.roomTypeDetail, "衣帽间");
  assert.equal(result.image.width, 16);
  for (const room of [{}, { roomType: "不存在" }, { roomType: "其他" }, { roomType: "其他", roomTypeDetail: "长".repeat(41) }]) {
    await assert.rejects(service.addSample(SET_ID, { sampleId: SAMPLE_ID, image: source, ...room }), /房间类型/);
  }
  assert.equal(saved.length, 2);
});

test("旧房缺独立版本、混合来源或冲突身份在Schema和样本读取前拒绝", async () => {
  const calls = [];
  const service = createBetaRunnerService({ baseStore: fakeStore({ async verifySchema() { calls.push("schema"); }, async getSampleSet() { calls.push("sample"); } }), generationService: {} });
  for (const body of [batch({ roomRenovationSmartDefaultVersion: undefined }), batch({ roomRenovationSmartDefaultVersion: 0 }),
    batch({ roomRenovationSmartDefaultVersion: 1.5 }), batch({ designScenario: "other" }), batch({ featureMode: "whiteModel" }),
    batch({ renderMode: "style-reference" }), batch({ roomRenovationPromptAgentVersion: undefined }, "style-dna"),
    batch({ styleCode: "" }, "style-dna"), batch({ styleReferenceImages: [source] }, "style-dna")]) {
    await assert.rejects(Promise.resolve().then(() => service.start(body)), /旧房/);
  }
  for (const featureMode of ["emptyRoom", "whiteModel", "free"]) {
    for (const input of [{ designScenario: "room-renovation" }, { roomRenovationSmartDefaultVersion: 4 }, { roomRenovationPromptAgentVersion: 4 }]) {
      const body = batch(input); body.featureMode = featureMode;
      delete body.items[0].input.designScenario;
      delete body.items[0].input.roomRenovationSmartDefaultVersion;
      Object.assign(body.items[0].input, input);
      await assert.rejects(Promise.resolve().then(() => service.start(body)), /仅支持旧房改造/);
    }
  }
  assert.deepEqual(calls, []);
});

test("旧房按目标功能校验每个Run的房型，在入队和取原图前拒绝缺失与非法详情", async () => {
  const calls = [];
  const service = createBetaRunnerService({ baseStore: fakeStore({
    async beginRun() { calls.push("archive"); }, async resolveSample() { calls.push("download"); },
  }), generationService: { async executeForMode() { calls.push("generation"); } } });
  for (const input of [{ roomType: "" }, { roomType: "不存在" }, { roomType: "其他" }, { roomType: "其他", roomTypeDetail: "长".repeat(41) }]) {
    await assert.rejects(Promise.resolve().then(() => service.start(batch(input))), /房间类型/);
  }
  assert.deepEqual(calls, []);
});

test("旧房HTTP入口保留图片Agent权限前置准入", async () => {
  let started = 0;
  assert.throws(() => assertBetaPromptAgentAccess(batch(), [{ key: "gemini3pro", selectable: false }]), /当前未向/);
  const handler = createBetaApiHandler({ getAgentModels: async () => [{ key: "gemini3pro", selectable: false }],
    readJson: async () => batch(), sendJson() {}, service: { start() { started += 1; } } });
  await assert.rejects(handler({ method: "POST" }, {}, "/api/beta/jobs"), /当前未向/);
  assert.equal(started, 0);
});

test("跨功能旧房样本按ID单图读取，独立版本进入共享旧房Agent且归档仍属旧房", async () => {
  for (const renderMode of ["smart-default", "style-dna"]) {
    const calls = [], agents = [], archives = [], prompts = [], generated = [];
    const body = batch({ emptyRoomSmartDefaultVersion: 34, emptyRoomPromptAgentVersion: 34 }, renderMode);
    const service = createBetaRunnerService({ baseStore: fakeStore({
      async resolveSample(setId, id, options) { calls.push({ setId, id, options }); return { ...sample, image: source }; },
      async beginRun(value) { archives.push(structuredClone(value)); return { recordId: value.item.runId }; },
      async completeRun(recordId, result) { assert.equal(result.sync.archiveFields["Agent 编码"], renderMode === "smart-default" ? "room-renovation-smart-default" : "room-renovation-fusion"); return { recordId }; },
    }), generationService: { async executeForMode(mode, input) {
      assert.equal(mode, "emptyRoom"); assert.equal(input.designScenario, "room-renovation");
      assert.equal(input.emptyRoomSmartDefaultVersion, undefined); assert.equal(input.emptyRoomPromptAgentVersion, undefined);
      return executeWhiteModelWorkflow(input, {
        availableModels: [{ id: "gemini-3.1-pro-preview" }],
        client: { async generatePrompt(request) { prompts.push(request); return { text: JSON.stringify({ scene_preservation: "Preserve structure only.", visual_application: { materials: "Oak", colors: "Warm", photography: "Daylight" }, generation_requirement: "Redesign the whole room." }) }; } },
        imageClient: { async generateImage(request) { generated.push(request); return { images: [{ url: source.dataUrl }], outputFormat: "png" }; } },
        async loadAgent(code, lookup) { agents.push({ code, lookup }); return { code, version: lookup.version, systemPrompt: "Independent renovation prompt" }; },
        async loadStyle(code) { return { code, name: "现代", version: 2, styleDna: { palette: "warm" } }; },
        scheduleSync: captureBetaGenerationArchive,
      });
    } } });
    await service.start(body);
    const result = await settled(service, body.jobId);
    assert.equal(result.status, "success", result.error);
    assert.equal(calls.length, 1); assert.equal(calls[0].options.targetFeatureMode, FEATURE);
    assert.equal(archives[0].featureMode, FEATURE);
    assert.equal(archives[0].item.input.referenceImages[0].dataUrl, source.dataUrl);
    assert.equal(prompts.length, 1); assert.equal(generated.length, 1);
    assert.equal(agents[0].lookup.config, ROOM_RENOVATION_PROMPT_CONFIG);
    assert.equal(agents[0].lookup.version, renderMode === "smart-default" ? 4 : 5);
    assert.equal(betaSceneParameters(archives[0].item.input).designScenario, "room-renovation");
    assert.equal(betaConfigSnapshot(archives[0].item.input)[renderMode === "smart-default" ? "roomRenovationSmartDefaultVersion" : "roomRenovationPromptAgentVersion"], renderMode === "smart-default" ? 4 : 5);
    assert.equal(sourceSet.featureMode, "whiteModel"); assert.equal(sample.roomType, "");
  }
});

function archiveStore() {
  const written = {}, attachments = {}, commands = [];
  const store = createBetaBaseStore({ async run(config, args) {
    commands.push(args);
    if (args.includes("+record-batch-create")) {
      const body = JSON.parse(args[args.indexOf("--json") + 1]);
      Object.assign(written, Object.fromEntries(body.fields.map((name, index) => [name, body.rows[0][index]])));
      return { ok: true, data: { record_id_list: ["rec-run"] } };
    }
    if (args.includes("+record-upsert")) Object.assign(written, JSON.parse(args[args.indexOf("--json") + 1]));
    if (args.includes("+record-upload-attachment")) {
      const id = args[args.indexOf("--field-id") + 1];
      const name = id === config.inputFieldId ? "输入图" : id === config.styleReferenceFieldId ? "风格参考图" : "结果图";
      attachments[name] = [{ file_token: `${name}-token`, size: bytes.length }];
    }
    if (args.includes("+record-get")) {
      const fields = { ...written, ...attachments };
      return { ok: true, data: { fields: Object.keys(fields), data: [Object.values(fields)], record_id_list: ["rec-run"] } };
    }
    return { ok: true, data: {} };
  } });
  return { store, written, commands };
}
function archivedResult(code = "room-renovation-smart-default", version = 4, scenario = "room-renovation") {
  const sync = captureBetaGenerationArchive({ finalPrompt: "Actual renovation prompt", modelLabel: "GPT Image 2", preview: { outputFormat: "png" },
    workflow: { feature: "empty-room-design", designScenario: scenario, renderMode: "smart-default", agentCode: code, agentVersion: version } });
  return { images: [{ url: source.dataUrl }], request: { outputFormat: "png" }, durationMs: 123, promptAgent: { version }, sync };
}

test("旧房归档独立功能/场景/冻结版本，实际空房Agent或版本漂移不能归档成功", async () => {
  for (const [code, version, scenario] of [["room-renovation-smart-default", 4, "room-renovation"], ["empty-room-smart-default", 4, "room-renovation"],
    ["room-renovation-smart-default", 3, "room-renovation"], ["room-renovation-smart-default", 4, undefined]]) {
    const { store, written } = archiveStore();
    const item = batch().items[0]; item.input.referenceImages = [source];
    await store.beginRun({ featureMode: FEATURE, batchId: "BETA-renovation-001", testTime: TEST_TIME, item });
    const result = archivedResult(code, version, scenario === undefined ? "wrong-scenario" : scenario);
    if (code === "room-renovation-smart-default" && version === 4 && scenario === "room-renovation") {
      await store.completeRun("rec-run", result);
      assert.equal(written["功能"], "旧房改造"); assert.equal(written["状态"], "成功");
      assert.equal(JSON.parse(written["场景参数"]).designScenario, "room-renovation");
      assert.equal(JSON.parse(written["配置快照"]).roomRenovationSmartDefaultVersion, 4);
    } else {
      await assert.rejects(store.completeRun("rec-run", result), error => error.statusCode === 409 && error.retryable === false && /旧房改造实际/.test(error.message));
      assert.equal(written["状态"], "运行中");
    }
  }
});

test("旧房仅同步失败手动重试复用冻结版本与已有成图，不再调用旧房Agent或模型", async () => {
  let generated = 0, synced = 0;
  const begun = [];
  const service = createBetaRunnerService({ baseStore: fakeStore({
    async beginRun(value) { begun.push(value); return { recordId: "rec-failed-sync" }; },
    async completeRun() { synced += 1; if (synced === 1) throw new Error("temporary sync failure"); return { recordId: "rec-failed-sync" }; },
  }), generationService: { async executeForMode(_mode, input) { generated += 1; assert.equal(input.roomRenovationSmartDefaultVersion, 4); return archivedResult(); } }, maxAttempts: 1 });
  const body = batch(); await service.start(body);
  assert.equal((await settled(service, body.jobId)).status, "failed");
  const retryJobId = "beta-renovation-retry-001";
  await service.retry(body.jobId, { jobId: retryJobId });
  assert.equal((await settled(service, retryJobId)).status, "success");
  assert.equal(generated, 1); assert.equal(begun.length, 1); assert.equal(synced, 2);
  assert.equal(begun[0].featureMode, FEATURE);
});


test("旧房冷恢复校验实际独立Agent版本，并恢复原输入/风格附件而不重传或生图", async () => {
  for (const corrupt of [false, true]) {
    const item = batch({ styleReferenceImages: [source] }).items[0];
    const request = { featureMode: FEATURE, batchId: "BETA-renovation-001", testTime: TEST_TIME, item };
    const fields = { ...buildBetaRunFields(request), ...archivedResult().sync.archiveFields,
      "状态": "失败", "错误信息": "sync failure", "时延（ms）": 123, "尺寸": "16x8", "Prompt / 工作流版本": "Prompt Agent v4",
      "输入图": [{ file_token: "input-token", size: bytes.length }], "风格参考图": [{ file_token: "style-token", size: bytes.length }],
      "结果图": [{ file_token: "result-token", size: bytes.length }],
    };
    if (corrupt) fields["Agent 编码"] = "empty-room-smart-default";
    const commands = [];
    const store = createBetaBaseStore({ async run(_config, args, options) {
      commands.push(args);
      if (args.includes("+record-list") || args.includes("+record-get")) return { ok: true,
        data: { fields: Object.keys(fields), data: [Object.values(fields)], record_id_list: ["rec-existing"] } };
      if (args.includes("+record-download-attachment")) { await writeFile(join(options.cwd, args[args.indexOf("--output") + 1]), bytes); return { ok: true }; }
      if (args.includes("+record-upsert")) { Object.assign(fields, JSON.parse(args[args.indexOf("--json") + 1])); return { ok: true }; }
      throw new Error("Recovery must not create records or upload attachments");
    } });
    if (corrupt) {
      await assert.rejects(store.recoverRun(request), error => error.statusCode === 409 && /旧房改造实际/.test(error.message));
      assert.equal(commands.some(args => args.includes("+record-download-attachment")), false);
    } else {
      const recovered = await store.recoverRun(request);
      assert.equal(recovered.recordId, "rec-existing"); assert.equal(fields["状态"], "成功");
      assert.equal(commands.filter(args => args.includes("+record-download-attachment")).length, 1);
    }
  }
});

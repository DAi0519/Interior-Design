/**
 * [INPUT]: 依赖 node:test/assert、Beta Store/runner 与三表字段响应内存替身
 * [OUTPUT]: 对外提供含风格转换的功能选项、两类模型单选标签与当前目录选项、设计/版本/三图附件复用，缺字段、类型/附件/关联漂移在入队与样本写入前阻断、实时分页读取和晚遇合同错误不重生成的回归保障
 * [POS]: test 的 Beta 归档 Schema 合同集成测试，不读写真实 Base 或调用模型
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";
import { BETA_BASE_CONFIG as config, betaFeatureLabel, createBetaBaseStore } from "../src/beta-base.mjs";
import { BETA_FEATURE_MODES, createBetaApiHandler, createBetaRunnerService } from "../src/beta-runner.mjs";
import { EMPTY_ROOM_TYPES } from "../src/empty-room-type.mjs";
import { normalizeBetaBaseError } from "../src/beta-base-schema.mjs";
import { publicAgentModelCatalog } from "../src/agent-model-config.mjs";
import { publicModelCatalog } from "../src/model-config.mjs";

function schemaFixture() {
  const textFields = (names) => names.map((name) => ({ id: `field-${name}`, name, type: "text" }));
  const select = (name, values, multiple = false) => ({ name, type: "select", multiple, options: values.map((value) => ({ name: value })) });
  const features = BETA_FEATURE_MODES.map(betaFeatureLabel);
  return {
    [config.tableId]: [
      ...textFields(["Run ID", "批次 ID", "样本 ID", "输入文本", "场景参数", "配置快照", "Prompt / 工作流版本", "错误信息", "最终 Prompt", "设计方式", "风格选择", "家具选择", "Agent 编码", "生成参数", "尺寸"]),
      { id: config.testTimeFieldId, name: "测试时间", type: "text" },
      ...["Attempt", "Agent 版本", "时延（ms）", "费用（USD）"].map((name) => ({ name, type: "number" })),
      select("功能", features), select("状态", ["运行中", "成功", "失败"]), select("场景标签", EMPTY_ROOM_TYPES, true),
      select("出图模型", publicModelCatalog().map((model) => model.label)),
      select("Prompt融合", publicAgentModelCatalog().filter((model) => model.imageInput).map((model) => model.label)),
      ...[["输入图", config.inputFieldId], ["风格参考图", config.styleReferenceFieldId], ["结果图", config.resultFieldId]].map(([name, id]) => ({ name, id, type: "attachment" })),
    ],
    [config.sampleSetTableId]: [
      ...textFields(["样本集 ID", "名称", "说明"]), { name: "样本数量", type: "number" },
      select("功能", features), select("状态", ["可用"]), { name: "样本", type: "link", link_table: config.sampleTableId },
    ],
    [config.sampleTableId]: [
      ...textFields(["样本 ID", "提示词", "文件名", "其他空间类型"]), select("状态", ["可用"]), select("空间类型", EMPTY_ROOM_TYPES),
      { name: "样本集", type: "link", link_table: config.sampleSetTableId }, { name: "样本图", id: config.sampleImageFieldId, type: "attachment" },
    ],
  };
}

const batch = () => ({ batchId: "BETA-contract1234", jobId: "beta-contract1234", featureMode: "free", testTime: "2026-10-12 12:00:00",
  items: [{ runId: "RUN-contract-001", caseId: "CASE-1", input: { modelKey: "gptImage2", prompt: "test" } }] });

function storeForSchema(schemas, commands) {
  return createBetaBaseStore({ run: async (_config, args) => {
    commands.push(args);
    assert.ok(args.includes("+field-list"), "Schema 拒绝前不能写记录或附件");
    const fields = schemas[args[args.indexOf("--table-id") + 1]];
    return { ok: true, data: { fields, total: fields.length } };
  } });
}

test("CLI 字段缺失/类型转换/只读错误归一为不可重试合同错误，瞬时网络错误保留", () => {
  for (const message of ["1254045 FieldNameNotFound", "1254015 字段值类型不匹配", "SingleSelectFieldConvFail", "READONLY field"]) {
    const error = normalizeBetaBaseError(new Error(message));
    assert.equal(error.statusCode, 409);
    assert.equal(error.retryable, false);
    assert.equal(error.message, message);
  }
  const transient = new Error("fetch failed");
  assert.equal(normalizeBetaBaseError(transient), transient);
});

test("live Store 的实时 verifier 每次读取三表，后一次字段漂移不能复用旧通过结果", async () => {
  const schemas = schemaFixture();
  const commands = [];
  const store = storeForSchema(schemas, commands);
  await store.verifySchema();
  assert.equal(commands.length, 3);
  schemas[config.tableId] = schemas[config.tableId].filter((field) => field.name !== "最终 Prompt");
  await assert.rejects(store.verifySchema(), (error) => error.statusCode === 409 && error.retryable === false);
  assert.equal(commands.length, 6);
});

test("风格转换复用现有归档字段，并要求跑图明细和样本集均有功能选项", async () => {
  assert.ok(BETA_FEATURE_MODES.includes("styleTransfer"));
  assert.equal(betaFeatureLabel("styleTransfer"), "风格转换");
  const schemas = schemaFixture();
  const runFields = schemas[config.tableId];
  for (const name of ["设计方式", "风格选择", "配置快照", "场景参数", "Agent 编码", "最终 Prompt"]) {
    assert.equal(runFields.find((field) => field.name === name)?.type, "text");
  }
  assert.equal(runFields.find((field) => field.name === "Agent 版本")?.type, "number");
  assert.equal(schemas[config.sampleTableId].some((field) => field.name === "功能"), false);
  await storeForSchema(schemas, []).verifySchema();
  for (const [tableId, name] of [[config.tableId, "跑图明细"], [config.sampleSetTableId, "样本集"]]) {
    const drifted = schemaFixture();
    const field = drifted[tableId].find((entry) => entry.name === "功能");
    field.options = field.options.filter((option) => option.name !== "风格转换");
    await assert.rejects(storeForSchema(drifted, []).verifySchema(),
      (error) => error.statusCode === 409 && error.retryable === false
        && error.message.includes(`${name}“功能”缺少选项：风格转换`));
  }
});

test("Beta 两类模型字段使用当前目录单选标签，允许保留历史选项且不要求纯文本 Agent", async () => {
  const schemas = schemaFixture();
  for (const name of ["出图模型", "Prompt融合"]) {
    const field = schemas[config.tableId].find((entry) => entry.name === name);
    assert.equal(field.type, "select");
    assert.equal(field.multiple, false);
    field.options.push({ name: "历史模型标签" });
  }
  const promptOptions = schemas[config.tableId].find((entry) => entry.name === "Prompt融合").options;
  assert.equal(promptOptions.some((option) => option.name === "DeepSeek 4 Pro"), false);
  assert.equal(promptOptions.some((option) => option.name === "Gemini 3.1 Pro"), true);
  assert.equal(schemas[config.tableId].find((entry) => entry.name === "场景标签").multiple, true);
  await storeForSchema(schemas, []).verifySchema();
});

test("三表字段分页必须读完，不能用首段字段漏检后半段", async () => {
  const schemas = schemaFixture();
  const pages = [];
  const store = createBetaBaseStore({ run: async (_config, args) => {
    const tableId = args[args.indexOf("--table-id") + 1];
    const offset = Number(args[args.indexOf("--offset") + 1]);
    const fields = schemas[tableId];
    pages.push([tableId, offset]);
    return { ok: true, data: { fields: offset ? fields.slice(2) : fields.slice(0, 2), total: fields.length } };
  } });
  await store.verifySchema();
  assert.equal(pages.length, 6);
});

test("缺字段、坏类型、缺功能/状态/房型选项、错误附件与关联目标均在入队/样本写入前阻断", async () => {
  const mutations = [
    (tables) => { tables[config.tableId] = tables[config.tableId].filter((field) => field.name !== "最终 Prompt"); },
    (tables) => { tables[config.tableId].find((field) => field.name === "配置快照").type = "formula"; },
    (tables) => { tables[config.tableId].find((field) => field.name === "出图模型").type = "text"; },
    (tables) => { tables[config.tableId].find((field) => field.name === "Prompt融合").type = "text"; },
    (tables) => { tables[config.tableId].find((field) => field.name === "出图模型").multiple = true; },
    (tables) => { tables[config.tableId].find((field) => field.name === "Prompt融合").multiple = true; },
    (tables) => { const field = tables[config.tableId].find((field) => field.name === "出图模型"); field.options = field.options.filter((option) => option.name !== "Banana 2.1"); },
    (tables) => { tables[config.tableId].find((field) => field.name === "Prompt融合").options.pop(); },
    (tables) => { tables[config.sampleSetTableId].find((field) => field.name === "功能").options.pop(); },
    (tables) => { tables[config.tableId].find((field) => field.name === "功能").options.splice(4, 1); },
    (tables) => { tables[config.tableId].find((field) => field.name === "状态").options.pop(); },
    (tables) => { tables[config.sampleTableId].find((field) => field.name === "空间类型").options.pop(); },
    (tables) => { tables[config.tableId].find((field) => field.name === "场景标签").multiple = false; },
    (tables) => { tables[config.tableId].find((field) => field.name === "结果图").id = "wrong-id"; },
    (tables) => { tables[config.sampleTableId].find((field) => field.name === "样本图").type = "text"; },
    (tables) => { tables[config.sampleTableId].find((field) => field.name === "样本集").link_table = "tbl-wrong"; },
  ];
  for (const mutate of mutations) {
    const schemas = schemaFixture(); mutate(schemas);
    const commands = []; let generations = 0;
    const service = createBetaRunnerService({ baseStore: storeForSchema(schemas, commands),
      generationService: { executeForMode: async () => { generations += 1; } } });
    const incompatible = (error) => error.statusCode === 409 && error.retryable === false;
    await assert.rejects(service.start(batch()), incompatible);
    assert.equal(service.getJob(batch().jobId), null);
    assert.equal(generations, 0);
    await assert.rejects(service.createSampleSet({ featureMode: "free", name: "test", samples: [{ prompt: "test" }] }), incompatible);
    assert.ok(commands.every((args) => args.includes("+field-list")));
  }
});

test("批量实时 Schema 只准入一次，运行中 CLI 字段合同失败不触发第二次模型生成", async () => {
  const commands = []; let generations = 0; let runCount = 0;
  const store = createBetaBaseStore({ run: async (_config, args) => {
    commands.push(args);
    if (args.includes("+field-list")) {
      const fields = schemaFixture()[args[args.indexOf("--table-id") + 1]];
      return { ok: true, data: { fields, total: fields.length } };
    }
    if (args.includes("+record-batch-create")) return { ok: true, data: { record_id_list: [`rec-${++runCount}`] } };
    if (args.includes("+record-list")) {
      const isSet = args[args.indexOf("--table-id") + 1] === config.sampleSetTableId;
      const fields = isSet
        ? ["样本集 ID", "名称", "功能", "状态", "样本数量"]
        : ["样本 ID", "样本集", "提示词", "状态"];
      return { ok: true, data: { fields, data: isSet
        ? [["SET-SCHEMA", "schema fixture", ["自由生图"], ["可用"], 2]]
        : [["CASE-1", ["rec-set"], "test", ["可用"]], ["CASE-2", ["rec-set"], "test", ["可用"]]],
        record_id_list: isSet ? ["rec-set"] : ["rec-sample-1", "rec-sample-2"], has_more: false } };
    }
    if (args.includes("+record-upsert")) throw new Error("1254045 FieldNameNotFound: 字段不存在");
    return { ok: true, data: {} };
  } });
  const service = createBetaRunnerService({ baseStore: store, sleep: async () => {},
    generationService: { executeForMode: async () => {
      generations += 1;
      return { images: [{ url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lesAAAAASUVORK5CYII=" }], request: { outputFormat: "png" } };
    } } });
  const body = batch();
  body.items.push({ ...body.items[0], runId: "RUN-contract-002", caseId: "CASE-2" });
  body.sampleSetId = "SET-SCHEMA";
  body.items.forEach((item) => { item.sampleId = item.caseId; });
  await service.start(body);
  while (service.getJob(batch().jobId)?.status === "running") await new Promise((resolve) => setTimeout(resolve, 1));
  const job = service.getJob(batch().jobId);
  assert.equal(job.status, "failed");
  assert.match(job.error, /不可重试错误/);
  assert.equal(generations, 2);
  assert.equal(runCount, 2);
  assert.equal(commands.filter((args) => args.includes("+field-list")).length, 3);
});

test("Beta HTTP 等待 Schema 准入完成再返回真实入队快照，失败不返回 202", async () => {
  let release;
  const service = createBetaRunnerService({ baseStore: {
    config: {}, verifySchema: () => new Promise((resolve) => { release = resolve; }),
    beginRun: async () => ({ recordId: "rec-1" }), completeRun: async () => ({}), failRun: async () => {},
  }, generationService: { executeForMode: async () => ({}) } });
  const responses = [];
  const handler = createBetaApiHandler({ service, readJson: async () => batch(), sendJson: (_response, status, body) => responses.push({ status, body }) });
  const pending = handler({ method: "POST" }, {}, "/api/beta/jobs");
  await Promise.resolve();
  assert.equal(service.getJob(batch().jobId), null);
  assert.equal(responses.length, 0);
  release();
  await pending;
  assert.equal(responses[0].status, 202);
  assert.equal(responses[0].body.job.jobId, batch().jobId);
  assert.equal(typeof responses[0].body.job.then, "undefined");

  const badSchema = schemaFixture();
  badSchema[config.tableId] = badSchema[config.tableId].filter((field) => field.name !== "配置快照");
  const failedService = createBetaRunnerService({ baseStore: storeForSchema(badSchema, []), generationService: {} });
  const failedHandler = createBetaApiHandler({ service: failedService, readJson: async () => batch(), sendJson: () => { throw new Error("不应返回成功响应"); } });
  await assert.rejects(failedHandler({ method: "POST" }, {}, "/api/beta/jobs"), (error) => error.statusCode === 409);
  assert.equal(failedService.getJob(batch().jobId), null);
});

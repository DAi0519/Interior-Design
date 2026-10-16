/**
 * [INPUT]: 依赖正式生图记录映射、node:test/assert、sharp 真实编码夹具、Beta Base 配置与字段映射纯函数
 * [OUTPUT]: 对外提供新 Base 隔离、目录模型单选标签与无 Agent 清空、默认可用状态在创建后清空/草稿回读与对象关联、八功能映射、场景/配置快照、全部实际写入元数据漂移与附件身份回读拒绝成功的回归保障
 * [POS]: test 的 Beta跑图独立持久化合同测试，不调用 CLI、不读写真实 Base
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

import {
  BETA_BASE_CONFIG,
  captureBetaGenerationArchive,
  betaConfigSnapshot,
  betaFeatureLabel,
  betaResultCostUsd,
  betaResultVersion,
  betaSceneParameters,
  buildBetaRunFields,
  createBetaBaseStore,
} from "../src/beta-base.mjs";
import { LARK_SYNC_CONFIG } from "../src/lark-sync.mjs";

const onePixelPngBytes = await sharp({
  create: { background: "#f37021", channels: 3, height: 8, width: 8 },
}).png().toBuffer();
const onePixelPng = `data:image/png;base64,${onePixelPngBytes.toString("base64")}`;

function recordEnvelope(recordId, fields) {
  return { ok: true, data: { fields: Object.keys(fields), data: [Object.values(fields)], record_id_list: [recordId] } };
}

test("飞书创建 null 被默认可用填充时，草稿与新样本创建后必须更新清空再继续", async () => {
  const records = new Map();
  const commands = [];
  const store = createBetaBaseStore({ async run(_config, args) {
    const tableId = args[args.indexOf("--table-id") + 1];
    const recordId = args[args.indexOf("--record-id") + 1];
    if (args.includes("+record-batch-create")) {
      const body = JSON.parse(args[args.indexOf("--json") + 1]);
      const fields = Object.fromEntries(body.fields.map((field, index) => [field, body.rows[0][index]]));
      const createdId = `rec-default-${records.size + 1}`;
      fields["状态"] ||= ["可用"];
      records.set(createdId, { fields, tableId });
      commands.push(["create", createdId]);
      if (tableId === BETA_BASE_CONFIG.sampleTableId && (!Array.isArray(fields["样本集"])
        || fields["样本集"].some((link) => !link || typeof link !== "object" || typeof link.id !== "string"))) {
        // 真实 CLI 会先创建子记录，再因错误关联返回 not_found，留下无关联/默认可用的孤儿。
        fields["样本集"] = [];
        throw Object.assign(new Error("not_found"), { statusCode: 404 });
      }
      return { ok: true, data: { record_id_list: [createdId] } };
    }
    if (args.includes("+record-upsert")) {
      const fields = JSON.parse(args[args.indexOf("--json") + 1]);
      Object.assign(records.get(recordId).fields, fields);
      commands.push(["update", recordId, fields]);
      return { ok: true, data: {} };
    }
    if (args.includes("+record-get")) {
      commands.push(["read", recordId]);
      return recordEnvelope(recordId, records.get(recordId).fields);
    }
    if (args.includes("+record-list")) {
      const rows = [...records].filter(([, record]) => record.tableId === tableId);
      const fields = [...new Set(rows.flatMap(([, record]) => Object.keys(record.fields)))];
      return { ok: true, data: { fields, data: rows.map(([, record]) => fields.map((field) => record.fields[field])),
        record_id_list: rows.map(([id]) => id), has_more: false } };
    }
    throw new Error(`未建模的测试命令：${args[1]}`);
  } });
  const draft = await store.createSampleSet({ featureMode: "free", name: "默认状态夹具" });
  assert.equal(draft.status, null);
  assert.deepEqual(await store.listSampleSets(), []);
  const sample = await store.addSample(draft.sampleSetId, { sampleId: "SAMPLE-DEFAULT", prompt: "现代客厅" });
  assert.equal(sample.status, "可用");
  assert.deepEqual(records.get(sample.recordId).fields["样本集"], [{ id: draft.recordId }]);
  for (const [action, recordId] of commands.filter(([action]) => action === "create")) {
    assert.equal(action, "create");
    const index = commands.findIndex((command) => command[0] === "create" && command[1] === recordId);
    assert.deepEqual(commands[index + 1], ["update", recordId, { "状态": null }]);
  }
  assert.equal(records.get(draft.recordId).fields["状态"], null);
  const completed = await store.completeSampleSet(draft.sampleSetId, [sample.sampleId]);
  assert.equal(completed.status, "可用");
  assert.equal(completed.sampleCount, 1);
  assert.equal(records.size, 2);
});

test("Beta跑图只指向新 Base 的样本集、样本和跑图明细三表", () => {
  assert.equal(BETA_BASE_CONFIG.baseToken, "ORwJbt5EYauNORsrhqJcpetLnEb");
  assert.equal(BETA_BASE_CONFIG.sampleSetTableId, "tblQmKbAHOCPcct7");
  assert.equal(BETA_BASE_CONFIG.sampleTableId, "tblZHiPlolFYcG1t");
  assert.equal(BETA_BASE_CONFIG.sampleImageFieldId, "flda615mNm");
  assert.equal(BETA_BASE_CONFIG.tableId, "tblrue5KUj7VNDD2");
  assert.equal(BETA_BASE_CONFIG.testTimeFieldId, "fld71lZlMH");
  assert.equal(BETA_BASE_CONFIG.viewId, "vewGYQGQ1U");
  assert.match(BETA_BASE_CONFIG.baseUrl, /ORwJbt5EYauNORsrhqJcpetLnEb/);
  assert.notEqual(BETA_BASE_CONFIG.baseToken, LARK_SYNC_CONFIG.baseToken);
  assert.notEqual(BETA_BASE_CONFIG.tableId, LARK_SYNC_CONFIG.tableId);
});

test("Beta跑图接受八个工作台出图功能，风格转换及新旧美化和全景独立映射", () => {
  assert.deepEqual([
    betaFeatureLabel("whiteModel"),
    betaFeatureLabel("emptyRoom"),
    betaFeatureLabel("styleTransfer"),
    betaFeatureLabel("refinedModel"),
    betaFeatureLabel("effectEnhancement"),
    betaFeatureLabel("effectBeautification"),
    betaFeatureLabel("panoramaEnhancement"),
    betaFeatureLabel("free"),
  ], ["白模渲染", "空房设计", "风格转换", "精模渲染", "效果图氛围转换", "效果图美化", "全景图美化", "自由生图"]);
  assert.throws(() => betaFeatureLabel("styleDnaReverse"), /不受支持/);
});

test("Beta 样本集按飞书功能名称正确区分氛围转换与新美化", async () => {
  const store = createBetaBaseStore({
    async run() {
      return {
        ok: true,
        data: {
          fields: ["样本集 ID", "名称", "功能", "状态", "样本数量"],
          data: [["SET-ATMOSPHERE", "旧氛围样本", ["效果图氛围转换"], ["可用"], 2],
            ["SET-BEAUTIFICATION", "新美化样本", ["效果图美化"], ["可用"], 3]],
          record_id_list: ["rec-atmosphere", "rec-beautification"],
          has_more: false,
        },
      };
    },
  });
  const sets = await store.listSampleSets();
  assert.deepEqual(sets.map((set) => [set.sampleSetId, set.featureMode]), [
    ["SET-ATMOSPHERE", "effectEnhancement"], ["SET-BEAUTIFICATION", "effectBeautification"],
  ]);
});

test("一行一 Run 冻结可追溯的输入与配置", () => {
  const input = {
    effectTime: "dusk",
    effectWeather: "clear",
    modelKey: "seedream50",
    outputFormat: "png",
    prompt: "保持空间结构",
    promptVersion: 11,
    quality: "high",
    ratio: "4:3",
    renderMode: "smart-default",
    resolution: "2K",
    roomType: "客厅",
  };
  const fields = buildBetaRunFields({
    batchId: "BETA-12345678",
    featureMode: "effectEnhancement",
    testTime: "2026-09-02 14:03:21",
    item: {
      attempt: 2,
      caseId: "CASE-001",
      input,
      modelLabel: "Seedream 5.0",
      runId: "RUN-12345678-seedream50",
    },
  });

  assert.equal(fields["状态"], "运行中");
  assert.equal(fields["功能"], "效果图氛围转换");
  assert.equal(fields["Attempt"], 2);
  assert.deepEqual(JSON.parse(fields["场景参数"]), betaSceneParameters(input));
  assert.deepEqual(JSON.parse(fields["配置快照"]), betaConfigSnapshot(input));
  assert.equal(fields["输入文本"], "保持空间结构");
  assert.equal(fields["测试时间"], "2026-09-02 14:03:21");
  assert.equal(fields["出图模型"], "Seedream 5.0");
});

test("Beta 模型标签由目录解析，忽略伪造展示名并保留合法历史标签快照", () => {
  const build = (item) => buildBetaRunFields({ batchId: "BETA-tags", featureMode: "free", item });
  assert.equal(build({ input: { modelKey: "banana21" }, modelLabel: "客户端伪造标签" })["出图模型"], "Banana 2.1");
  assert.equal(build({ input: { modelKey: "seedream50" }, modelLabel: "Seedream 5.0" })["出图模型"], "Seedream 5.0");
  assert.throws(() => build({ input: {} }), (error) => error.statusCode === 409 && error.retryable === false);
  assert.throws(() => build({ input: { modelKey: "unsupported" }, modelLabel: "未知标签" }), /合法的目录标签/);
});

test("完成结果提取 Prompt 版本与非负费用", () => {
  const result = {
    prompt: { code: "effect_render_enhancement", version: 11 },
    promptAgent: { version: 4 },
    style: { code: "modern", version: 2 },
    upstream: { metadata: { costUsd: 0.031 } },
  };
  assert.equal(
    betaResultVersion(result),
    "effect_render_enhancement@v11 · Prompt Agent v4 · modern@v2",
  );
  assert.equal(betaResultCostUsd(result), 0.031);
  assert.equal(betaResultCostUsd({ upstream: { metadata: { costUsd: -1 } } }), null);
});

test("完成 Run 必须回读到飞书成功状态与结果附件", async () => {
  const commands = [];
  const config = { ...BETA_BASE_CONFIG };
  const resultSize = Buffer.from(onePixelPng.split(",", 2)[1], "base64").length;
  const written = {};
  const run = async (_config, args) => {
    commands.push(args);
    if (args.includes("+record-upsert")) Object.assign(written, JSON.parse(args[args.indexOf("--json") + 1]));
    if (args.includes("+record-get")) {
      return recordEnvelope("rec-result", {
          ...written, "结果图": [{
            file_token: "file-result",
            name: "result.png",
            size: resultSize,
          }],
      });
    }
    return { data: {}, ok: true };
  };
  const store = createBetaBaseStore({ config, run });
  assert.match(store.config.baseUrl, /[?&]table=tblrue5KUj7VNDD2(?:&|$)/);
  assert.match(store.config.baseUrl, /[?&]view=vewGYQGQ1U(?:&|$)/);
  const archived = await store.completeRun("rec-result", {
    durationMs: 1200,
    images: [{ url: onePixelPng }],
    request: { outputFormat: "png" },
  });

  assert.equal(archived.recordId, "rec-result");
  assert.equal(archived.attachment.fileToken, "file-result");
  assert.equal(archived.attachment.size, resultSize);
  assert.match(archived.previewUrl, /^data:image\/webp;base64,/);
  assert.match(archived.recordUrl, /[?&]view=vewGYQGQ1U(?:&|$)/);
  assert.match(archived.recordUrl, /[?&]record=rec-result(?:&|$)/);
  assert.ok(commands.some((args) => args.includes("+record-upload-attachment")));
  assert.ok(commands.some((args) => args.includes("+record-upsert")));
  assert.ok(commands.some((args) => args.includes("+record-get")));
});

test("飞书回读缺少结果附件时拒绝把 Run 判为成功", async () => {
  const written = {};
  const store = createBetaBaseStore({
    config: { ...BETA_BASE_CONFIG },
    async run(_config, args) {
      if (args.includes("+record-upsert")) Object.assign(written, JSON.parse(args[args.indexOf("--json") + 1]));
      if (args.includes("+record-get")) {
        return recordEnvelope("rec-missing", { ...written, "结果图": [] });
      }
      return { data: {}, ok: true };
    },
  });

  await assert.rejects(store.completeRun("rec-missing", {
    images: [{ url: onePixelPng }],
    request: { outputFormat: "png" },
  }), /结果附件校验失败/);
});

test("飞书回读附件字节数不一致时拒绝把 Run 判为成功", async () => {
  const written = {};
  const store = createBetaBaseStore({
    config: { ...BETA_BASE_CONFIG },
    async run(_config, args) {
      if (args.includes("+record-upsert")) Object.assign(written, JSON.parse(args[args.indexOf("--json") + 1]));
      if (args.includes("+record-get")) {
        return recordEnvelope("rec-truncated", {
          ...written, "结果图": [{
              file_token: "file-truncated",
              name: "result.png",
              size: 1,
          }],
        });
      }
      return { data: {}, ok: true };
    },
  });

  await assert.rejects(store.completeRun("rec-truncated", {
    images: [{ url: onePixelPng }],
    request: { outputFormat: "png" },
  }), /结果附件校验失败/);
});


test("Beta 接住正式工作流原文与场景元数据，不保留附件副本", () => {
  const receipt = captureBetaGenerationArchive({
    finalPrompt: "Actual final prompt\nwith exact whitespace.", sourcePrompt: "需求",
    durationMs: 1000, modelLabel: "Flux2 Klein", preview: { outputFormat: "png", resolution: "2K" },
    referenceImages: [{ imageUrl: "private-image" }], resultImage: { url: "private-result" },
    workflow: { feature: "empty-room-design", roomType: "其他", roomTypeDetail: "衣帽间",
      renderMode: "smart-default", selectionName: "智能默认", agentCode: "empty-room-smart-default",
      agentVersion: 30, agentModelLabel: "Gemini 3.1 Pro", furnitureSelection: { items: [], other: "" } },
  });
  assert.equal(receipt.archiveFields["最终 Prompt"], "Actual final prompt\nwith exact whitespace.");
  assert.deepEqual(receipt.archiveFields["场景标签"], ["其他", "衣帽间"]);
  assert.equal(receipt.archiveFields["设计方式"], "智能默认");
  assert.equal(receipt.archiveFields["Agent 版本"], 30);
  assert.equal(receipt.archiveFields["Prompt融合"], "Gemini 3.1 Pro");
  assert.doesNotMatch(JSON.stringify(receipt), /private-image|private-result/);
});

test("Beta 完成归档使用字符串模型标签，无 Agent 时清空并核验实际单选回读", async () => {
  const cases = [
    { prompt: undefined, returned: null },
    { prompt: "", returned: [] },
    { prompt: "  ", returned: null },
    { prompt: "Gemini 3.1 Pro", returned: "Gemini 3.1 Pro" },
    { prompt: "Gemini 3.1 Pro", returned: ["Gemini 3.1 Pro"] },
    { prompt: undefined, returned: ["Gemini 3.1 Pro"], rejected: /生成信息回读不一致：Prompt融合/ },
    { prompt: "Gemini 3.1 Pro", returned: ["GPT 5.5"], rejected: /生成信息回读不一致：Prompt融合/ },
    { prompt: "Gemini 3.1 Pro", returned: ["Gemini 3.1 Pro", "GPT 5.5"], rejected: /不是单选：Prompt融合/ },
  ];
  for (const current of cases) {
    const written = {};
    const store = createBetaBaseStore({ run: async (_config, args) => {
      if (args.includes("+record-batch-create")) {
        const body = JSON.parse(args[args.indexOf("--json") + 1]);
        Object.assign(written, Object.fromEntries(body.fields.map((name, index) => [name, body.rows[0][index]])));
        return { ok: true, data: { record_id_list: ["rec-tags"] } };
      }
      if (args.includes("+record-upsert")) Object.assign(written, JSON.parse(args[args.indexOf("--json") + 1]));
      if (args.includes("+record-get")) return recordEnvelope("rec-tags", { ...written,
        "出图模型": [written["出图模型"]], "Prompt融合": current.returned,
        "结果图": [{ file_token: "result-token", size: onePixelPngBytes.length }],
      });
      return { ok: true, data: {} };
    } });
    await store.beginRun({ batchId: "BETA-tags", featureMode: "free", item: {
      runId: "RUN-tags", caseId: "CASE-1", input: { modelKey: "banana21" },
    } });
    const result = { images: [{ url: onePixelPng }], request: { outputFormat: "png" },
      sync: { archiveFields: current.prompt === undefined ? {} : { "Prompt融合": current.prompt } } };
    if (current.rejected) await assert.rejects(store.completeRun("rec-tags", result), current.rejected);
    else await store.completeRun("rec-tags", result);
    assert.equal(written["出图模型"], "Banana 2.1");
    assert.equal(written["Prompt融合"], current.prompt?.trim() || null);
  }
});

test("Beta 禁止向 Prompt融合 单选提交未知模型、纯文本 Agent 或多值数组", async () => {
  for (const value of ["未知模型", "DeepSeek 4 Pro", ["Gemini 3.1 Pro"]]) {
    const commands = [];
    const store = createBetaBaseStore({ run: async (_config, args) => { commands.push(args); return { ok: true, data: {} }; } });
    await assert.rejects(store.completeRun("rec-invalid-tag", {
      images: [{ url: onePixelPng }], request: { outputFormat: "png" }, sync: { archiveFields: { "Prompt融合": value } },
    }), (error) => error.statusCode === 409 && error.retryable === false);
    assert.equal(commands.length, 0);
  }
});

test("最终 Prompt 原文必须写入且回读一致，差异不能误报完成", async () => {
  for (const returnedPrompt of ["exact\nfinal prompt", "different prompt"]) {
    const patches = [];
    const store = createBetaBaseStore({ run: async (_config, args) => {
      if (args.includes("+record-upsert")) patches.push(JSON.parse(args[args.indexOf("--json") + 1]));
      if (args.includes("+record-get")) return recordEnvelope("rec-meta", {
        ...Object.assign({}, ...patches), "最终 Prompt": returnedPrompt,
        "结果图": [{ file_token: "token", size: onePixelPngBytes.length }],
      });
      return { ok: true, data: {} };
    } });
    const result = { images: [{ url: onePixelPng }], request: { outputFormat: "png" },
      sync: { archiveFields: { "最终 Prompt": "exact\nfinal prompt" } } };
    if (returnedPrompt === "different prompt") {
      await assert.rejects(store.completeRun("rec-meta", result), /生成信息回读不一致：最终 Prompt/);
    } else await store.completeRun("rec-meta", result);
    assert.equal(patches[0]["最终 Prompt"], "exact\nfinal prompt");
    assert.equal(patches[0]["尺寸"], "8x8");
  }
});

test("场景/配置快照、版本、真实尺寸、时延与费用必须逐字段回读一致", async () => {
  for (const driftedField of [null, "场景参数", "配置快照", "Prompt / 工作流版本", "尺寸", "时延（ms）", "费用（USD）"]) {
    const written = {};
    const store = createBetaBaseStore({ run: async (_config, args) => {
      if (args.includes("+record-batch-create")) {
        const body = JSON.parse(args[args.indexOf("--json") + 1]);
        Object.assign(written, Object.fromEntries(body.fields.map((name, index) => [name, body.rows[0][index]])));
        return { ok: true, data: { record_id_list: ["rec-full"] } };
      }
      if (args.includes("+record-upsert")) Object.assign(written, JSON.parse(args[args.indexOf("--json") + 1]));
      if (args.includes("+record-get")) {
        const fields = { ...written, "结果图": [{ file_token: "token", size: onePixelPngBytes.length }] };
        if (driftedField) fields[driftedField] = "drifted";
        return recordEnvelope("rec-full", fields);
      }
      return { ok: true, data: {} };
    } });
    await store.beginRun({ batchId: "BETA-fullmeta", featureMode: "effectBeautification", testTime: "2026-10-12 12:00:00",
      item: { runId: "RUN-fullmeta-001", caseId: "CASE-1", input: { modelKey: "gptImage2", effectBeautification: { intensity: "high", tone: "cool" }, effectBeautificationPromptVersion: 2 } } });
    const result = { durationMs: 123, images: [{ url: onePixelPng }], request: { outputFormat: "png" },
      prompt: { code: "effect-render-beautification", version: 2 }, upstream: { metadata: { costUsd: 0.031 } } };
    if (!driftedField) await store.completeRun("rec-full", result);
    else await assert.rejects(store.completeRun("rec-full", result), (error) =>
      error.statusCode === 409 && error.retryable === false && error.message.endsWith(driftedField));
  }
});

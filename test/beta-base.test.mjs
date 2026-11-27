/**
 * [INPUT]: 依赖正式生图记录映射、node:test/assert、sharp 真实编码夹具、Beta Base 配置/字段映射与独立扩图真源
 * [OUTPUT]: 验证新 Base 隔离、版本及模型身份冻结、自由生图原件、扩图与机位 GPT 6.1 Sol 单选回读、多角度结果及冻结机位核验和冷恢复
 * [POS]: test 的 Beta跑图独立持久化合同测试，不调用 CLI、不读写真实 Base
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
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
import { normalizeBetaSampleImage } from "../src/beta-sample-store.mjs";
import { imageUpscaleWorkflow } from "../src/image-upscale-workflow.mjs";
import { FLOOR_PLAN_CAMERA_WORKFLOW } from "../src/floor-plan-camera-service.mjs";
import { MULTI_ANGLE_PROMPT_VERSION, multiAnglePrompt } from "../src/image-multi-angle-prompt.mjs";
import { createGenerationService } from "../src/generation-service.mjs";

const onePixelPngBytes = await sharp({
  create: { background: "#f37021", channels: 3, height: 8, width: 8 },
}).png().toBuffer();
const onePixelPng = `data:image/png;base64,${onePixelPngBytes.toString("base64")}`;

function recordEnvelope(recordId, fields) {
  return { ok: true, data: { fields: Object.keys(fields), data: [Object.values(fields)], record_id_list: [recordId] } };
}

test("Beta超分配置快照冻结实际版本且其他功能不带超分版本", () => {
  const input = { featureMode: "imageUpscale", upscaleWorkflowKey: "ks_seedvr2_2x_direct", resolution: "6K" };
  const snapshot = betaConfigSnapshot(input);
  assert.equal(snapshot.upscaleWorkflowVersion, imageUpscaleWorkflow(input.upscaleWorkflowKey).version);
  assert.equal(betaConfigSnapshot({ ...input, upscaleWorkflowVersion: "2026-10-21.1" }).upscaleWorkflowVersion, "2026-10-21.1");
  assert.equal("upscaleWorkflowVersion" in betaConfigSnapshot({ ...input, featureMode: "free" }), false);
});

test("飞书创建 null 被默认可用填充时，草稿与新样本创建后必须更新清空再继续", async () => {
  const records = new Map();
  const commands = [];
  const store = createBetaBaseStore({ async run(config, args, { cwd } = {}) {
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
    if (args.includes("+record-upload-attachment")) {
      assert.equal(args[args.indexOf("--field-id") + 1], config.sampleImageFieldId);
      const name = args[args.indexOf("--file") + 1];
      const bytes = await readFile(join(cwd, name));
      assert.deepEqual(bytes, onePixelPngBytes);
      records.get(recordId).fields["样本图"] = [{ name, size: bytes.length, file_token: "sample-image-token" }];
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

  const imageDraft = await store.createSampleSet({ featureMode: "free", name: "图片样本集", sampleType: "image" });
  assert.equal(imageDraft.sampleType, "image");
  await assert.rejects(store.addSample(imageDraft.sampleSetId, { sampleId: "SAMPLE-IMAGE", prompt: "只有文字" }), /有效图片/);
  const imageSample = await store.addSample(imageDraft.sampleSetId, { sampleId: "SAMPLE-IMAGE",
    image: { dataUrl: onePixelPng, name: "sample.png", type: "image/png" } });
  const imageSet = await store.completeSampleSet(imageDraft.sampleSetId, [imageSample.sampleId]);
  assert.equal(imageSet.sampleType, "image");
  assert.equal(imageSet.samples[0].prompt, "");
  assert.equal(imageSet.samples[0].image.type, "image/png");
  assert.equal((await store.listSampleSets()).find((set) => set.sampleSetId === imageSet.sampleSetId).sampleType, "image");
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

test("Beta跑图接受十个工作台出图功能，扩图/风格转换/新旧美化和全景独立映射", () => {
  assert.deepEqual([
    betaFeatureLabel("whiteModel"),
    betaFeatureLabel("emptyRoom"),
    betaFeatureLabel("styleTransfer"),
    betaFeatureLabel("refinedModel"),
    betaFeatureLabel("effectEnhancement"),
    betaFeatureLabel("effectBeautification"),
    betaFeatureLabel("panoramaEnhancement"),
    betaFeatureLabel("free"),
    betaFeatureLabel("imageOutpaint"),
    betaFeatureLabel("imageUpscale"),
  ], ["白模渲染", "空房设计", "风格转换", "精模渲染", "效果图氛围转换", "效果图美化", "全景图美化", "自由生图", "AI扩图", "AI超分"]);
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

test("Beta精模保留模板与双Prompt版本摘要，版本列标明实际使用氛围资产", () => {
  const refinedRender = { preset: "custom", time: "dusk", weather: "rainy", tone: "warm" };
  const input = { featureMode: "refinedModel", modelKey: "aiTextureEnhancement", promptVersion: 7,
    refinedPromptSha256: "a".repeat(64), refinedRender, refinedAtmospherePromptVersion: 3,
    refinedAtmospherePromptSha256: "b".repeat(64) };
  const fields = buildBetaRunFields({ batchId: "BETA-refinedrender", featureMode: "refinedModel",
    item: { runId: "RUN-refinedrender", caseId: "CASE-1", input } });
  assert.deepEqual(JSON.parse(fields["场景参数"]).refinedRender, refinedRender);
  assert.equal(JSON.parse(fields["配置快照"]).promptVersion, 7);
  assert.equal(JSON.parse(fields["配置快照"]).refinedPromptSha256, "a".repeat(64));
  assert.equal(JSON.parse(fields["配置快照"]).refinedAtmospherePromptVersion, 3);
  assert.equal(JSON.parse(fields["配置快照"]).refinedAtmospherePromptSha256, "b".repeat(64));
  assert.equal(betaResultVersion({ prompt: { code: "refined-model-render", version: 7 },
    atmospherePrompt: { code: "effect-render-enhancement", version: 3 } }),
  "refined-model-render@v7 · effect-render-enhancement@v3");
  assert.equal("refinedRender" in betaSceneParameters({ ...input, featureMode: "free" }), false);
  assert.equal("refinedAtmospherePromptVersion" in betaConfigSnapshot({ ...input, featureMode: "free" }), false);
});

test("Beta 模型标签由目录解析，忽略伪造展示名并保留合法历史标签快照", () => {
  const build = (item) => buildBetaRunFields({ batchId: "BETA-tags", featureMode: "free", item });
  assert.equal(build({ input: { modelKey: "banana21" }, modelLabel: "客户端伪造标签" })["出图模型"], "Banana 2.1");
  assert.equal(build({ input: { modelKey: "seedream50" }, modelLabel: "Seedream 5.0" })["出图模型"], "Seedream 5.0");
  assert.throws(() => build({ input: {} }), (error) => error.statusCode === 409 && error.retryable === false);
  assert.throws(() => build({ input: { modelKey: "unsupported" }, modelLabel: "未知标签" }), /合法的目录标签/);
});

test("AI扩图冻结真实引擎和画布，四候选按真源区分且忽略客户端模型标签", () => {
  const canvas = { ratio: "16:9", resolution: "2K", scale: 1.5, x: 0.25, y: 0.5 };
  for (const [engine, model, label] of [
    ["comfyui", "oneRewardFp8", "Flux Fill OneReward（FP8）"],
    ["comfyui", "fluxFillDev", "Flux Fill Dev（原版）"],
    ["qwenImageEdit2511", undefined, "Qwen Image Edit 2511"],
    ["gptImage25Sunburst", undefined, "GPT Image 2.5 Sunburst"],
  ]) {
    const input = { featureMode: "imageOutpaint", outpaintCanvas: canvas,
      outpaintEngine: engine, outpaintModel: model, outpaintWorkflowKey: `workflow-${engine}` };
    const fields = buildBetaRunFields({ featureMode: "imageOutpaint", item: { input, modelLabel: "假标签" } });
    assert.equal(fields["功能"], "AI扩图");
    assert.equal(fields["出图模型"], label);
    assert.deepEqual(JSON.parse(fields["配置快照"]), { outpaintCanvas: canvas,
      outpaintEngine: engine, ...(model ? { outpaintModel: model } : {}), outpaintWorkflowKey: `workflow-${engine}` });
    assert.deepEqual(JSON.parse(fields["场景参数"]).outpaintCanvas, canvas);
  }
  assert.throws(() => buildBetaRunFields({ featureMode: "imageOutpaint", item: {
    input: { outpaintEngine: "comfyui", outpaintModel: "not-a-model" }, modelLabel: "Flux Fill Dev（原版）",
  } }), (error) => error.statusCode === 409);
});

test("AI扩图样本仅信实际字节和尺寸，8MB容量保护保留且尺寸由执行引擎再准入", async () => {
  const bytes = await sharp({ create: { width: 4200, height: 32, channels: 3, background: "white" } }).png().toBuffer();
  const image = { dataUrl: `data:image/png;base64,${bytes.toString("base64")}`, type: "image/png",
    size: bytes.length, name: "outpaint.png", width: 1, height: 1 };
  const normalized = normalizeBetaSampleImage(image, "imageOutpaint");
  assert.equal(normalized.width, 4200);
  assert.equal(normalized.height, 32);
  assert.throws(() => normalizeBetaSampleImage({ ...image, size: 1 }, "imageOutpaint"), /字节数/);
  assert.throws(() => normalizeBetaSampleImage({ ...image, type: "image/jpeg" }, "imageOutpaint"), /MIME/);
  assert.throws(() => normalizeBetaSampleImage({ ...image, dataUrl: "data:image/png;base64,ZmFrZQ==", size: 4 }, "imageOutpaint"), /内容或 MIME/);
  const oversized = Buffer.alloc(8 * 1024 * 1024 + 1);
  bytes.copy(oversized);
  assert.throws(() => normalizeBetaSampleImage({ ...image,
    dataUrl: `data:image/png;base64,${oversized.toString("base64")}`, size: 1 }, "imageOutpaint"), /8MB/);
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
  assert.equal(betaResultCostUsd({ upstream: { usageCost: { costUsd: 0.047 } } }), 0.047);
  assert.equal(betaResultCostUsd({ upstream: { usageCost: { costUsd: null } } }), null);
  assert.equal(betaResultVersion({ workflow: { key: "image-outpaint", version: "2026-10-19.1" },
    upstream: { metadata: { workflowVersion: "actual-version" } } }), "image-outpaint@actual-version");
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
    { prompt: "GPT 6.2 Astra", returned: ["GPT 6.2 Astra"] },
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

test("Beta 禁止向 Prompt融合 单选提交未知模型、纯文本 Agent或多值数组", async () => {
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

test("AI扩图只在独立Beta表归档真实Prompt/工作流/费用与源图结果附件回读后展示预览", async () => {
  for (const drift of [null, "source-size", "source-count", "result-count", "workflow"]) {
    const written = {};
    const store = createBetaBaseStore({ run: async (config, args) => {
      assert.equal(config.baseToken, BETA_BASE_CONFIG.baseToken);
      assert.equal(args[args.indexOf("--table-id") + 1], BETA_BASE_CONFIG.tableId);
      assert.notEqual(config.baseToken, LARK_SYNC_CONFIG.baseToken);
      if (args.includes("+record-batch-create")) {
        const body = JSON.parse(args[args.indexOf("--json") + 1]);
        Object.assign(written, Object.fromEntries(body.fields.map((name, index) => [name, body.rows[0][index]])));
        return { ok: true, data: { record_id_list: ["rec-outpaint"] } };
      }
      if (args.includes("+record-upsert")) Object.assign(written, JSON.parse(args[args.indexOf("--json") + 1]));
      if (args.includes("+record-get")) {
        const fields = { ...written, "输入图": [{ file_token: "source-token", size: onePixelPngBytes.length }],
          "风格参考图": [], "结果图": [{ file_token: "result-token", size: onePixelPngBytes.length }] };
        if (drift === "source-size") fields["输入图"][0].size = 1;
        if (drift === "source-count") fields["输入图"] = [];
        if (drift === "result-count") fields["结果图"].push({ file_token: "extra", size: onePixelPngBytes.length });
        if (drift === "workflow") fields["生成参数"] = "{}";
        return recordEnvelope("rec-outpaint", fields);
      }
      return { ok: true, data: {} };
    } });
    await store.beginRun({ batchId: "BETA-outpaint", featureMode: "imageOutpaint", item: {
      caseId: "SOURCE-1", runId: "RUN-outpaint", input: { featureMode: "imageOutpaint",
        outpaintEngine: "qwenImageEdit2511", outpaintWorkflowKey: "qwen2511",
        outpaintCanvas: { ratio: "original", resolution: "2K", scale: 1.5 },
        referenceImages: [{ dataUrl: onePixelPng, name: "source.png", type: "image/png" }] },
    } });
    const sync = captureBetaGenerationArchive({ durationMs: 123, modelLabel: "Qwen Image Edit 2511",
      finalPrompt: "Actual Janus prompt\nwith exact whitespace.",
      preview: { outputFormat: "png", resolution: "2K", ratio: "original" },
      workflow: { feature: "image-outpaint", engine: "qwenImageEdit2511", workflowVersion: "actual-v3",
        model: "qwen_image_edit_2511_fp8mixed.safetensors", outputWidth: 8, outputHeight: 8,
        outpaintCanvas: { ratio: "original", scale: 1.5 }, outputSha256: "actual-sha" },
    });
    const result = { images: [{ url: onePixelPng }], request: { outputFormat: "png" }, sync, durationMs: 123,
      workflow: { key: "qwen-image-edit-2511-outpaint", version: "actual-v3" },
      upstream: { usageCost: { costUsd: 0.025 } } };
    if (drift) await assert.rejects(store.completeRun("rec-outpaint", result), (error) => error.statusCode === 409);
    else {
      const archived = await store.completeRun("rec-outpaint", result);
      assert.match(archived.previewUrl, /^data:image\/webp;base64,/);
      assert.equal(written["最终 Prompt"], "Actual Janus prompt\nwith exact whitespace.");
      assert.equal(written["Prompt / 工作流版本"], "qwen-image-edit-2511-outpaint@actual-v3");
      assert.equal(written["费用（USD）"], 0.025);
      assert.equal(written["尺寸"], "8x8");
      assert.equal(written["出图模型"], "Qwen Image Edit 2511");
      assert.equal(written["Prompt融合"], null);
      assert.equal(JSON.parse(written["生成参数"]).workflow.outputSha256, "actual-sha");
    }
  }
});

test("Beta 机位归档实际送模图与最终词，成功和冷恢复都核对下载字节", async () => {
  const digest = value => createHash("sha256").update(value).digest("hex");
  const guide = await sharp(onePixelPngBytes).resize(16, 8).png().toBuffer();
  const resultSha = digest(onePixelPngBytes);
  const sourceSha = digest("original sample");
  const guideSha = digest(guide);
  const camera = { x: .25, y: .55, heading: 91, fov: 60, height: 1.5 };
  const prompt = { code: "floor-plan-camera-frame-agent", version: 9, sha256: digest("immutable agent") };
  const agent = { key: "gpt61Sol", id: "gpt-6.1-sol", label: "GPT 6.1 Sol" };
  const item = { runId: "RUN-camera-base", caseId: "CASE-camera", input: {
    featureMode: "floorPlanCamera", modelKey: "banana21", camera, aspectRatio: "16:9", resolution: "2K",
    outputFormat: "png", prompt: "保持墙体", promptVersion: prompt.version, promptAgentModelKey: agent.key,
    floorPlanCameraWorkflowVersion: FLOOR_PLAN_CAMERA_WORKFLOW, floorPlanCameraPromptSha256: prompt.sha256,
  } };
  const archiveItem = { ...item, input: { ...item.input, floorPlanCameraSubmittedSha256: guideSha,
    floorPlanCameraSourceSha256: sourceSha, referenceImages: [{ type: "image/png", size: guide.length,
      name: "机位标注图.png", dataUrl: `data:image/png;base64,${guide.toString("base64")}` }] } };
  const finalPrompt = "Exact final prompt\nincluding line breaks.";
  const receipts = { agent: { requestId: "shared-agent", usageCost: { costUsd: .01 } },
    image: { requestId: "image-slot", usageCost: { costUsd: .02 } } };
  const result = {
    images: [{ url: onePixelPng }], prompt, durationMs: 123, request: { outputFormat: "png" },
    upstream: { metadata: { costUsd: .03 } }, workflow: { key: "floor-plan-camera", version: FLOOR_PLAN_CAMERA_WORKFLOW },
    sync: { archiveFields: { "最终 Prompt": finalPrompt, "Prompt融合": agent.label,
      "Agent 编码": prompt.code, "Agent 版本": prompt.version, "生成参数": JSON.stringify({
        referenceImageCount: 1, workflow: { featureMode: "floorPlanCamera", workflowVersion: FLOOR_PLAN_CAMERA_WORKFLOW,
          camera, prompt, agent, model: { key: "banana21" }, resolution: "2K", aspectRatio: "16:9",
          compiledPromptSha256: digest(finalPrompt), source: { sha256: sourceSha }, receipts, agentCostAttributed: true,
          betaCostUsd: .03, outputWidth: 8, outputHeight: 8, outputSha256: resultSha,
          actual: { camera, aspectRatio: "16:9", referenceImageCount: 1, referenceImageRole: "camera-annotated-plan",
            generationMode: "image-to-image", referenceImageSha256: guideSha, agentInputImageSha256: guideSha,
            agentInputImageFormat: "png", agentInputImageWidth: 16, agentInputImageHeight: 8,
            actualOutputWidth: 8, actualOutputHeight: 8, outputSha256: resultSha } },
      }) } },
  };
  const fields = {}, files = new Map(), commands = [];
  const recordId = "rec-camera";
  const run = async (config, args, { cwd } = {}) => {
    const param = name => args[args.indexOf(name) + 1];
    assert.equal(config.baseToken, BETA_BASE_CONFIG.baseToken);
    assert.equal(param("--table-id"), BETA_BASE_CONFIG.tableId);
    commands.push(args[1]);
    if (args.includes("+record-batch-create")) {
      const body = JSON.parse(param("--json"));
      for (const [index, name] of body.fields.entries()) fields[name] = body.rows[0][index];
      return { ok: true, data: { record_id_list: [recordId] } };
    }
    if (args.includes("+record-upsert")) Object.assign(fields, JSON.parse(param("--json")));
    if (args.includes("+record-upload-attachment")) {
      const isInput = param("--field-id") === config.inputFieldId;
      const name = param("--file");
      const bytes = await readFile(join(cwd, name));
      const token = isInput ? "guide-token" : "result-token";
      files.set(token, bytes);
      fields[isInput ? "输入图" : "结果图"] = [{ name, size: bytes.length, file_token: token }];
    }
    if (args.includes("+record-download-attachment")) {
      await writeFile(join(cwd, param("--output")), files.get(param("--file-token")));
    }
    if (args.includes("+record-get")) return recordEnvelope(recordId, { ...fields });
    if (args.includes("+record-list")) return recordEnvelope(recordId, { ...fields });
    return { ok: true, data: {} };
  };
  const testTime = "2026-11-10 12:00:00", batchId = "BETA-camera-base", featureMode = "floorPlanCamera";
  const store = createBetaBaseStore({ run });
  await assert.rejects(store.beginRun({ batchId, featureMode, testTime, item }), /实际送模标注图/);
  assert.equal(commands.length, 0);
  await store.beginRun({ batchId, featureMode, testTime, item: archiveItem });
  assert.deepEqual(JSON.parse(fields["场景参数"]).camera, camera);
  assert.equal(JSON.parse(fields["配置快照"]).floorPlanCameraSubmittedSha256, guideSha);
  assert.deepEqual(files.get("guide-token"), guide);
  const altered = Buffer.from(guide);
  altered[altered.length - 1] ^= 1;
  files.set("guide-token", altered);
  await assert.rejects(store.completeRun(recordId, result), /输入附件字节/);
  assert.equal(fields["状态"], "运行中");
  files.set("guide-token", guide);
  await store.completeRun(recordId, result);
  assert.equal(fields["状态"], "成功");
  assert.equal(fields["最终 Prompt"], finalPrompt);
  assert.equal(fields["Prompt融合"], agent.label);
  assert.equal(fields["费用（USD）"], .03);
  assert.deepEqual(JSON.parse(fields["生成参数"]).workflow.agent, agent);
  assert.deepEqual(JSON.parse(fields["生成参数"]).workflow.receipts, receipts);
  assert.equal(commands.filter(command => command === "+record-upload-attachment").length, 2);
  const coldStore = createBetaBaseStore({ run });
  assert.equal((await coldStore.recoverRun({ batchId, featureMode, item, testTime })).runId, item.runId);
  files.set("guide-token", altered);
  await assert.rejects(coldStore.recoverRun({ batchId, featureMode, item, testTime }), /输入附件字节/);
});

test("自由生图图片批次归档保留多行提示词，源图缺失不能完成或冷恢复", async () => {
  const fields = {}, recordId = "rec-free-image";
  const run = async (config, args, { cwd } = {}) => {
    const param = (flag) => args[args.indexOf(flag) + 1];
    if (args.includes("+record-batch-create")) {
      const body = JSON.parse(param("--json"));
      Object.assign(fields, Object.fromEntries(body.fields.map((name, index) => [name, body.rows[0][index]])));
      return { ok: true, data: { record_id_list: [recordId] } };
    }
    if (args.includes("+record-upsert")) Object.assign(fields, JSON.parse(param("--json")));
    if (args.includes("+record-upload-attachment")) {
      const name = param("--file");
      const bytes = await readFile(join(cwd, name));
      const input = param("--field-id") === config.inputFieldId;
      assert.deepEqual(bytes, onePixelPngBytes);
      fields[input ? "输入图" : "结果图"] = [{ name, size: bytes.length, file_token: input ? "source-token" : "result-token" }];
    }
    if (args.includes("+record-download-attachment")) await writeFile(join(cwd, param("--output")), onePixelPngBytes);
    if (args.includes("+record-get") || args.includes("+record-list")) return recordEnvelope(recordId, { ...fields });
    return { ok: true, data: {} };
  };
  const prompt = "整批统一提示词\n\n保留空间关系";
  const input = { modelKey: "banana21", prompt, referenceImages: [{ dataUrl: onePixelPng, type: "image/png" }] };
  const item = { runId: "RUN-free-image-001", caseId: "SAMPLE-FREE-1", usesSampleImage: true, input };
  const batch = { batchId: "BETA-free-image", featureMode: "free", testTime: "2026-11-10 12:00:00", item };
  const store = createBetaBaseStore({ run });
  await store.beginRun(batch);
  assert.equal(fields["输入文本"], prompt);
  const sourceAttachment = fields["输入图"];
  const result = { images: [{ url: onePixelPng }], durationMs: 123, request: { outputFormat: "png" },
    sync: captureBetaGenerationArchive({ durationMs: 123, modelLabel: "Banana 2.1", finalPrompt: prompt,
      preview: { outputFormat: "png", referenceImageCount: 1 },
      workflow: { feature: "free-image-generation", provider: "oneapi" } }) };
  fields["输入图"] = [];
  await assert.rejects(store.completeRun(recordId, result), /输入图附件/);
  fields["输入图"] = sourceAttachment;
  await store.completeRun(recordId, result);
  assert.equal(fields["最终 Prompt"], prompt);
  const coldStore = createBetaBaseStore({ run });
  const recovery = { ...batch, item: { ...item, input: { ...input, referenceImages: [] } } };
  assert.equal((await coldStore.recoverRun(recovery)).runId, item.runId);
  fields["最终 Prompt"] = "与冻结内容不一致";
  await assert.rejects(coldStore.recoverRun(recovery), /最终提示词.*不匹配/);
  fields["最终 Prompt"] = prompt;
  fields["输入图"] = [];
  await assert.rejects(coldStore.recoverRun(recovery), /输入附件不可恢复/);
});

test("Beta多角度实际指令和90°机位入档，可回读原件并冷恢复现有结果", async () => {
  const fields = {}, attachments = new Map(), recordId = "rec-beta-multi-angle";
  const reference = await sharp({ create: { width: 80, height: 64, channels: 3, background: "#ff8800" } }).png().toBuffer();
  const run = async (config, args, { cwd } = {}) => {
    const flag = (key) => args[args.indexOf(key) + 1];
    assert.equal(flag("--table-id"), config.tableId);
    if (args.includes("+record-batch-create")) {
      const body = JSON.parse(flag("--json"));
      Object.assign(fields, Object.fromEntries(body.fields.map((name, index) => [name, body.rows[0][index]])));
      return { ok: true, data: { record_id_list: [recordId] } };
    }
    if (args.includes("+record-upsert")) Object.assign(fields, JSON.parse(flag("--json")));
    if (args.includes("+record-upload-attachment")) {
      const name = flag("--file"), bytes = await readFile(join(cwd, name));
      const fieldName = flag("--field-id") === config.inputFieldId ? "输入图" : "结果图";
      attachments.set(fieldName, bytes);
      fields[fieldName] = [{ name, size: bytes.length, file_token: fieldName }];
    }
    if (args.includes("+record-download-attachment")) await writeFile(join(cwd, flag("--output")), attachments.get(flag("--file-token")));
    if (args.includes("+record-get") || args.includes("+record-list")) return recordEnvelope(recordId, { ...fields });
    return { ok: true, data: {} };
  };
  const modelKey = "gptImage26Sunburst", cameraPose = { azimuth: 120, elevation: 90, distance: 100 };
  const input = { modelKey, multiAngleModel: modelKey, cameraPose, multiAnglePromptVersion: MULTI_ANGLE_PROMPT_VERSION,
    resolution: "2K", quality: "medium", referenceImages: [{ name: "room.png", type: "image/png",
      dataUrl: `data:image/png;base64,${reference.toString("base64")}` }] };
  const item = { runId: "RUN-beta-angle-001", caseId: "ROOM-1", input };
  const batch = { batchId: "BETA-angle", featureMode: "imageMultiAngle", testTime: "2026-11-10 12:00:00", item };
  const store = createBetaBaseStore({ run });
  await store.beginRun(batch);
  assert.equal(fields["功能"], "多角度");
  assert.equal(fields["出图模型"], "GPT Image 2.6 Sunburst");
  assert.deepEqual(JSON.parse(fields["配置快照"]).cameraPose, cameraPose);
  assert.deepEqual(attachments.get("输入图"), reference);
  let calls = 0;
  const service = createGenerationService({
    imageClientForModel: () => ({ async editImage(request) {
      calls++;
      assert.equal(request.prompt, multiAnglePrompt(cameraPose));
      assert.equal(request.images.length, 1);
      return { images: [{ url: onePixelPng }], transport: "fixture", usageCost: { costUsd: 0.01 } };
    } }),
    getSessionModelCatalog: async () => [{ id: "gpt-image-2.6-sunburst" }],
    scheduleGenerationSync: captureBetaGenerationArchive,
  });
  const result = await service.executeForMode(batch.featureMode, input);
  await store.completeRun(recordId, { ...result, durationMs: 123 });
  assert.equal(fields["最终 Prompt"], multiAnglePrompt(cameraPose));
  assert.equal(fields["费用（USD）"], 0.01);
  assert.equal(fields["Prompt融合"], null);
  assert.deepEqual(JSON.parse(fields["生成参数"]).workflow.pose, cameraPose);
  const coldStore = createBetaBaseStore({ run });
  assert.equal((await coldStore.recoverRun(batch)).runId, item.runId);
  const parameters = JSON.parse(fields["生成参数"]);
  parameters.workflow.pose.elevation = 60;
  fields["生成参数"] = JSON.stringify(parameters);
  await assert.rejects(coldStore.recoverRun(batch), /实际机位.*冻结配置不一致/);
  assert.equal(calls, 1);
});

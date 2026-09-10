/**
 * [INPUT]: 依赖正式生图记录映射、node:test/assert、sharp 真实编码夹具、Beta Base 配置与字段映射纯函数
 * [OUTPUT]: 对外提供新 Base 隔离、测试时间分组视图链接、五功能映射、场景/配置快照、版本/费用回填、结果附件 token/字节数回读门槛与轻量预览的回归保障
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

test("Beta跑图仅接受五个工作台出图功能", () => {
  assert.deepEqual([
    betaFeatureLabel("whiteModel"),
    betaFeatureLabel("emptyRoom"),
    betaFeatureLabel("refinedModel"),
    betaFeatureLabel("effectEnhancement"),
    betaFeatureLabel("free"),
  ], ["白模渲染", "空房设计", "精模渲染", "效果图美化", "自由生图"]);
  assert.throws(() => betaFeatureLabel("styleDnaReverse"), /不受支持/);
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
  assert.equal(fields["功能"], "效果图美化");
  assert.equal(fields["Attempt"], 2);
  assert.deepEqual(JSON.parse(fields["场景参数"]), betaSceneParameters(input));
  assert.deepEqual(JSON.parse(fields["配置快照"]), betaConfigSnapshot(input));
  assert.equal(fields["输入文本"], "保持空间结构");
  assert.equal(fields["测试时间"], "2026-09-02 14:03:21");
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
  const run = async (_config, args) => {
    commands.push(args);
    if (args.includes("+record-get")) {
      return {
        data: {
          data: [["成功", [{
            file_token: "file-result",
            name: "result.png",
            size: resultSize,
          }]]],
          fields: ["状态", "结果图"],
          record_id_list: ["rec-result"],
        },
        ok: true,
      };
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
  const store = createBetaBaseStore({
    config: { ...BETA_BASE_CONFIG },
    async run(_config, args) {
      if (args.includes("+record-get")) {
        return {
          data: {
            data: [["成功", []]],
            fields: ["状态", "结果图"],
            record_id_list: ["rec-missing"],
          },
          ok: true,
        };
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
  const store = createBetaBaseStore({
    config: { ...BETA_BASE_CONFIG },
    async run(_config, args) {
      if (args.includes("+record-get")) {
        return {
          data: {
            data: [["成功", [{
              file_token: "file-truncated",
              name: "result.png",
              size: 1,
            }]]],
            fields: ["状态", "结果图"],
            record_id_list: ["rec-truncated"],
          },
          ok: true,
        };
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

test("最终 Prompt 原文必须写入且回读一致，差异不能误报完成", async () => {
  for (const returnedPrompt of ["exact\nfinal prompt", "different prompt"]) {
    const patches = [];
    const store = createBetaBaseStore({ run: async (_config, args) => {
      if (args.includes("+record-upsert")) patches.push(JSON.parse(args[args.indexOf("--json") + 1]));
      if (args.includes("+record-get")) return { ok: true, data: {
        fields: ["状态", "结果图", "最终 Prompt"], record_id_list: ["rec-meta"],
        data: [["成功", [{ file_token: "token", size: onePixelPngBytes.length }], returnedPrompt]],
      } };
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

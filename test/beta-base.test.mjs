/**
 * [INPUT]: 依赖 node:test/assert、Beta Base 配置与字段映射纯函数
 * [OUTPUT]: 对外提供新 Base 隔离、五功能映射、场景/配置快照、版本/费用回填与结果附件回读门槛的回归保障
 * [POS]: test 的 Beta跑图独立持久化合同测试，不调用 CLI、不读写真实 Base
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  BETA_BASE_CONFIG,
  betaConfigSnapshot,
  betaFeatureLabel,
  betaResultCostUsd,
  betaResultVersion,
  betaSceneParameters,
  buildBetaRunFields,
  createBetaBaseStore,
} from "../src/beta-base.mjs";
import { LARK_SYNC_CONFIG } from "../src/lark-sync.mjs";

test("Beta跑图只指向新 Base 的样本集、样本和跑图明细三表", () => {
  assert.equal(BETA_BASE_CONFIG.baseToken, "ORwJbt5EYauNORsrhqJcpetLnEb");
  assert.equal(BETA_BASE_CONFIG.sampleSetTableId, "tblQmKbAHOCPcct7");
  assert.equal(BETA_BASE_CONFIG.sampleTableId, "tblZHiPlolFYcG1t");
  assert.equal(BETA_BASE_CONFIG.sampleImageFieldId, "flda615mNm");
  assert.equal(BETA_BASE_CONFIG.tableId, "tblrue5KUj7VNDD2");
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
  const run = async (_config, args) => {
    commands.push(args);
    if (args.includes("+record-get")) {
      return {
        data: {
          data: [["成功", [{ file_token: "file-result", name: "result.png" }]]],
          fields: ["状态", "结果图"],
          record_id_list: ["rec-result"],
        },
        ok: true,
      };
    }
    return { data: {}, ok: true };
  };
  const store = createBetaBaseStore({ config, run });
  const archived = await store.completeRun("rec-result", {
    durationMs: 1200,
    images: [{ url: "data:image/png;base64,iVBORw0KGgo=" }],
    request: { outputFormat: "png" },
  });

  assert.equal(archived.recordId, "rec-result");
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
    images: [{ url: "data:image/png;base64,iVBORw0KGgo=" }],
    request: { outputFormat: "png" },
  }), /结果附件校验失败/);
});

/**
 * [INPUT]: 依赖 node:test/assert 与 benchmark-base.mjs 的环境配置、Base 返回解析和可注入 CLI 边界
 * [OUTPUT]: 对外提供 Benchmark 五表快照字段、分页保护与 Prompt/Run/横评幂等写入参数回归保障
 * [POS]: test 的 Benchmark 飞书适配测试，使用内存 CLI 替身且不读写真实 Base
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  benchmarkBaseConfigFromEnv,
  createBenchmarkBaseStore,
  parseBenchmarkRecordEnvelope,
} from "../src/benchmark-base.mjs";

const config = {
  baseToken: "base",
  cliPath: "lark-cli",
  compareTableId: "comparisons",
  configTableId: "configs",
  promptTableId: "prompts",
  resultTableId: "results",
  sampleTableId: "samples",
};

function envelope(fields, row, recordId) {
  return {
    data: {
      data: [row],
      fields,
      has_more: false,
      record_id_list: [recordId],
    },
    ok: true,
  };
}

test("环境变量要求五表与 Base token 完整", () => {
  assert.deepEqual(
    benchmarkBaseConfigFromEnv({
      BENCHMARK_BASE_TOKEN: "base",
      BENCHMARK_COMPARE_TABLE_ID: "comparisons",
      BENCHMARK_CONFIG_TABLE_ID: "configs",
      BENCHMARK_PROMPT_TABLE_ID: "prompts",
      BENCHMARK_RESULT_TABLE_ID: "results",
      BENCHMARK_SAMPLE_TABLE_ID: "samples",
      LARK_CLI_PATH: "/cli",
    }),
    { ...config, cliPath: "/cli" },
  );
  assert.throws(
    () => benchmarkBaseConfigFromEnv({}),
    /BENCHMARK_BASE_TOKEN/,
  );
});

test("Base envelope 拒绝不完整分页", () => {
  assert.throws(
    () => parseBenchmarkRecordEnvelope({
      data: { data: [], fields: [], has_more: true },
      ok: true,
    }),
    /超过 200 条/,
  );
});

test("五张表解析为编排快照且 Banana Pro 保持停用", async () => {
  const calls = [];
  const run = async (_config, args) => {
    calls.push(args);
    const table = args[args.indexOf("--table-id") + 1];
    if (table === "samples") {
      return envelope(
        ["Case ID", "白模参考图", "任务状态"],
        ["LIVING-001", [{ file_token: "file", name: "white.png" }], ["待生成"]],
        "rec-sample",
      );
    }
    if (table === "configs") {
      return envelope(
        [
          "配置 ID", "横评组", "Style DNA", "融合 Agent",
          "融合基座模型", "出图模型", "输出规格",
          "提示词批次数", "每批次每模型出图数", "启用",
        ],
        [
          "CFG-002", "GROUP", ["奶油法式 [cream-french@v4]"],
          ["融合 [white-model-fusion@v7]"],
          ["Gemini [gemini-3.1-pro-preview]"],
          ["Banana Pro [gemini-3-pro-image]"],
          ["跟随原图比例 · 2K · PNG"], 3, 1, false,
        ],
        "rec-config",
      );
    }
    if (table === "prompts") {
      return envelope(
        [
          "Prompt ID", "融合 Prompt", "融合状态", "错误信息",
          "Prompt 耗时（秒）", "Prompt 成本（元）", "Prompt 请求 ID",
          "Prompt 哈希",
        ],
        ["P1", "{}", ["完成"], "", 1.2, null, "req-prompt", "hash"],
        "rec-prompt",
      );
    }
    if (table === "results") {
      return envelope(
        [
          "Run ID", "关联 Case", "提示词批次", "生成配置",
          "实验 ID", "实验类型", "模型与版本", "模型提供商",
          "采样序号", "尝试序号", "重试来源", "输出参数",
          "Prompt 哈希", "Prompt 耗时（秒）", "Prompt 成本（元）",
          "Image 请求 ID", "Image 耗时（秒）", "Image 成本（元）",
          "生成状态", "错误信息", "生成结果图",
        ],
        [
          "RUN-1", [{ id: "rec-sample" }], [{ id: "rec-prompt" }],
          [{ id: "rec-config" }], "GROUP", ["模型横评"], "Banana Pro",
          "Google", 1, 1, "", "{}", "hash", 1.2, null, "req-image",
          20, null, ["成功"], "", [{ file_token: "result" }],
        ],
        "rec-result",
      );
    }
    return envelope(
      [
        "对比 ID", "关联 Case", "提示词批次", "横评组",
        "白模参考图", "Banana Pro",
      ],
      [
        "CASE__GROUP__P1", [{ id: "rec-sample" }], [{ id: "rec-prompt" }],
        "GROUP", [{ file_token: "reference" }], [{ file_token: "result" }],
      ],
      "rec-comparison",
    );
  };
  const store = createBenchmarkBaseStore(config, { run });
  const snapshot = await store.loadSnapshot();

  assert.equal(snapshot.samples[0].caseId, "LIVING-001");
  assert.equal(snapshot.configs[0].enabled, false);
  assert.equal(snapshot.configs[0].imageModel, "Banana Pro [gemini-3-pro-image]");
  assert.equal(snapshot.configs[0].imageModelLabel, "Banana Pro");
  assert.equal(snapshot.prompts[0].status, "完成");
  assert.equal(snapshot.results[0].runId, "RUN-1");
  assert.equal(snapshot.results[0].attachments.length, 1);
  assert.equal(
    snapshot.comparisons[0].modelAttachments["Banana Pro"].length,
    1,
  );
  assert.equal(snapshot.comparisons[0].referenceAttachments.length, 1);
  assert.equal(calls.length, 5);
});

test("Prompt 批次写入关联 Case 与全部配置", async () => {
  let written;
  const run = async (_config, args) => {
    written = JSON.parse(args[args.indexOf("--json") + 1]);
    return { data: { record_id_list: ["rec-new"] }, ok: true };
  };
  const store = createBenchmarkBaseStore(config, { run });
  const recordId = await store.savePromptBatch({
    batch: 2,
    caseRecordId: "case-rec",
    configRecordIds: ["cfg-a", "cfg-b"],
    error: "",
    finalPrompt: "{}",
    groupId: "GROUP",
    promptId: "CASE__GROUP__P2",
    status: "完成",
  });

  assert.equal(recordId, "rec-new");
  const fields = Object.fromEntries(
    written.fields.map((field, index) => [field, written.rows[0][index]]),
  );
  assert.deepEqual(fields["关联 Case"], [{ id: "case-rec" }]);
  assert.deepEqual(fields["生成配置"], [{ id: "cfg-a" }, { id: "cfg-b" }]);
  assert.equal(fields["提示词批次"], 2);
});

test("横评宽表写入关联 Case 与 Prompt 批次", async () => {
  let written;
  const run = async (_config, args) => {
    written = JSON.parse(args[args.indexOf("--json") + 1]);
    return { data: { record_id_list: ["rec-compare"] }, ok: true };
  };
  const store = createBenchmarkBaseStore(config, { run });
  const recordId = await store.saveComparisonRow({
    caseRecordId: "case-rec",
    compareId: "CASE__GROUP__P1",
    error: "",
    groupId: "GROUP",
    promptRecordId: "prompt-rec",
  });

  assert.equal(recordId, "rec-compare");
  const fields = Object.fromEntries(
    written.fields.map((field, index) => [field, written.rows[0][index]]),
  );
  assert.equal(fields["对比 ID"], "CASE__GROUP__P1");
  assert.deepEqual(fields["关联 Case"], [{ id: "case-rec" }]);
  assert.deepEqual(fields["提示词批次"], [{ id: "prompt-rec" }]);
});

test("模型结果一图一行写入运行、重试和成本字段", async () => {
  let written;
  const run = async (_config, args) => {
    written = JSON.parse(args[args.indexOf("--json") + 1]);
    return { data: { record_id_list: ["rec-result"] }, ok: true };
  };
  const store = createBenchmarkBaseStore(config, { run });
  const recordId = await store.saveRunResult({
    attempt: 2,
    caseRecordId: "case-rec",
    configRecordId: "config-rec",
    durationSeconds: 42.5,
    imageCost: 0.42,
    experimentId: "GROUP",
    experimentType: "模型横评",
    model: "Banana 2",
    output: "{\"resolution\":\"2K\"}",
    promptDurationSeconds: 1.2,
    promptHash: "hash",
    promptRecordId: "prompt-rec",
    provider: "Google",
    retrySource: "RUN-1",
    runId: "RUN-1__A2",
    sampleIndex: 1,
    status: "成功",
  });

  assert.equal(recordId, "rec-result");
  const fields = Object.fromEntries(
    written.fields.map((field, index) => [field, written.rows[0][index]]),
  );
  assert.equal(fields["Run ID"], "RUN-1__A2");
  assert.equal(fields["尝试序号"], 2);
  assert.equal(fields["重试来源"], "RUN-1");
  assert.equal(fields["Image 成本（元）"], 0.42);
  assert.deepEqual(fields["关联 Case"], [{ id: "case-rec" }]);
});

test("横评宽表参考图上传到固定附件列", async () => {
  let uploadArgs;
  const run = async (_config, args) => {
    if (args.includes("+field-list")) {
      return {
        data: {
          fields: [{ id: "fld-reference", name: "白模参考图" }],
        },
        ok: true,
      };
    }
    uploadArgs = args;
    return { data: { attachments: {} }, ok: true };
  };
  const store = createBenchmarkBaseStore(config, { run });

  await store.uploadComparisonReference("rec-compare", {
    imageUrl: "data:image/png;base64,aQ==",
    mimeType: "image/png",
  });

  assert.equal(uploadArgs[uploadArgs.indexOf("--table-id") + 1], "comparisons");
  assert.equal(uploadArgs[uploadArgs.indexOf("--record-id") + 1], "rec-compare");
  assert.equal(uploadArgs[uploadArgs.indexOf("--field-id") + 1], "fld-reference");
  assert.equal(uploadArgs[uploadArgs.indexOf("--file") + 1], "reference.png");
});

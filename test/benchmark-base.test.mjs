/**
 * [INPUT]: 依赖 node:test/assert 与 benchmark-base.mjs 的环境配置、Base 返回解析、实时单选项适配和可注入 CLI 边界
 * [OUTPUT]: 对外提供 Benchmark 五表快照字段、全部普通回填的实时字段类型/单选阻断、按稳定编码解析真实选项且隔离系统时间字段的冻结配置创建、阶段化错误上下文、样本录入、实验筛选链接与 Prompt/Run/横评幂等写入回归保障
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

const configFields = [
  { name: "创建时间", type: "created_at" },
  { name: "配置 ID", type: "text" },
  { name: "横评组", type: "text" },
  { name: "Style DNA", options: [{ name: "奶油法式 v4 [cream-french@v4]" }], type: "select" },
  { name: "融合 Agent", options: [{ name: "白模渲染融合 Agent-即梦 v7 [white-model-fusion@v7]" }], type: "select" },
  { name: "融合基座模型", options: [{ name: "Gemini 3.1 Pro [gemini-3.1-pro-preview]" }], type: "select" },
  { name: "出图模型", options: [{ name: "GPT Image 2 [gpt-image-2]" }], type: "select" },
  { name: "输出规格", options: [{ name: "跟随原图比例 · 2K · PNG" }], type: "select" },
  { name: "提示词批次数", type: "number" },
  { name: "每批次每模型出图数", type: "number" },
  { name: "启用", type: "checkbox" },
];

const sampleWriteFields = [
  { name: "Case ID", type: "text" },
  { name: "数据集版本", type: "text" },
  { name: "任务状态", options: ["待生成", "生成中", "完成", "部分失败", "失败"].map((name) => ({ name })), type: "select" },
  { name: "样本类型", options: ["有效白模", "边缘输入"].map((name) => ({ name })), type: "select" },
  { name: "边缘类型", options: ["CAD/线稿"].map((name) => ({ name })), type: "select" },
  { name: "样本来源", options: ["用户输入"].map((name) => ({ name })), type: "select" },
  { name: "空间类型", options: ["客厅"].map((name) => ({ name })), type: "select" },
  ...["镜头复杂度", "软装复杂度", "材质复杂度", "输入质量", "空间结构"].map((name) => ({
    name,
    options: ["低", "中", "高"].map((option) => ({ name: option })),
    type: "select",
  })),
  { id: "fld-image", name: "白模参考图", type: "attachment" },
];

const promptWriteFields = [
  ...["Prompt ID", "横评组", "融合 Prompt", "错误信息", "Prompt 请求 ID", "Prompt 哈希"].map((name) => ({ name, type: "text" })),
  ...["Prompt 耗时（秒）", "Prompt 成本（元）", "Prompt 成本（USD）", "提示词批次"].map((name) => ({ name, type: "number" })),
  { name: "融合状态", options: ["待生成", "生成中", "完成", "失败"].map((name) => ({ name })), type: "select" },
  ...["关联 Case", "生成配置"].map((name) => ({ name, type: "link" })),
];

const resultWriteFields = [
  ...["Run ID", "实验 ID", "模型与版本", "模型提供商", "重试来源", "输出参数", "Prompt 哈希", "Image 请求 ID", "错误信息", "评分细则", "判断理由（≤50字）"].map((name) => ({ name, type: "text" })),
  ...["采样序号", "尝试序号", "Prompt 耗时（秒）", "Prompt 成本（元）", "Prompt 成本（USD）", "Image 耗时（秒）", "Image 成本（元）", "Image 成本（USD）", "保持一致性", "风格与材质", "渲染质量"].map((name) => ({ name, type: "number" })),
  { name: "实验类型", options: ["模型横评", "Prompt 横评", "端到端回归"].map((name) => ({ name })), type: "select" },
  { name: "生成状态", options: ["生成中", "成功", "失败"].map((name) => ({ name })), type: "select" },
  ...["关联 Case", "提示词批次", "生成配置"].map((name) => ({ name, type: "link" })),
  { name: "评审时间", type: "datetime" },
];

const comparisonWriteFields = [
  ...["对比 ID", "横评组", "评审备注"].map((name) => ({ name, type: "text" })),
  ...["关联 Case", "提示词批次"].map((name) => ({ name, type: "link" })),
];

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

test("横评图片字段目录直接来自实时 Schema", async () => {
  const store = createBenchmarkBaseStore(config, {
    run: async () => ({
      data: { fields: [
        { id: "fld-ref", name: "白模参考图", type: "attachment" },
        { id: "fld-gpt", name: "GPT Image 2", type: "attachment" },
      ] },
      ok: true,
    }),
  });
  assert.deepEqual(
    await store.listComparisonImageFields(),
    ["白模参考图", "GPT Image 2"],
  );
});

test("前端飞书跳转先按实验 ID 更新运行明细视图筛选", async () => {
  const calls = [];
  const store = createBenchmarkBaseStore(config, {
    run: async (_config, args) => {
      calls.push(args);
      if (args[1] === "+view-list") {
        return { data: { views: [{ id: "vew-run", name: "01 运行明细" }] }, ok: true };
      }
      if (args[1] === "+field-list") {
        return { data: { fields: [{ id: "fld-experiment", name: "实验 ID" }] }, ok: true };
      }
      if (args[1] === "+base-get") {
        return { data: { base: { url: "https://example.feishu.cn/base/base" } }, ok: true };
      }
      return { data: {}, ok: true };
    },
  });
  const target = await store.prepareExperimentView("EXP-001");
  const filterCall = calls.find((args) => args[1] === "+view-set-filter");
  assert.deepEqual(JSON.parse(filterCall[filterCall.indexOf("--json") + 1]), {
    conditions: [["fld-experiment", "intersects", "EXP-001"]],
    logic: "and",
  });
  assert.equal(
    target.url,
    "https://example.feishu.cn/base/base?table=results&view=vew-run",
  );
});

test("前端从全部实验跳转时清空运行明细视图筛选", async () => {
  let filter;
  const store = createBenchmarkBaseStore(config, {
    run: async (_config, args) => {
      if (args[1] === "+view-list") {
        return { data: { views: [{ id: "vew-run", name: "01 运行明细" }] }, ok: true };
      }
      if (args[1] === "+view-set-filter") {
        filter = JSON.parse(args[args.indexOf("--json") + 1]);
      }
      if (args[1] === "+base-get") {
        return { data: { base: { url: "https://example.feishu.cn/base/base" } }, ok: true };
      }
      return { data: {}, ok: true };
    },
  });
  const target = await store.prepareExperimentView("");
  assert.deepEqual(filter, { conditions: [], logic: "and" });
  assert.equal(target.experimentId, null);
});

test("批量运行与数据分析分别跳转横评对比和结果报告", async () => {
  const filterCalls = [];
  const store = createBenchmarkBaseStore(config, {
    run: async (_config, args) => {
      const action = args[1];
      const tableId = args[args.indexOf("--table-id") + 1];
      if (action === "+table-list") {
        return { data: { tables: [{ id: "reports", name: "06 结果报告" }] }, ok: true };
      }
      if (action === "+view-list") {
        return { data: { views: [{
          id: tableId === "comparisons" ? "vew-compare" : "vew-report",
          name: tableId === "comparisons" ? "01 横向对比（展示）" : "01 模型总表",
        }] }, ok: true };
      }
      if (action === "+field-list") {
        return { data: { fields: [{
          id: tableId === "comparisons" ? "fld-group" : "fld-experiment",
          name: tableId === "comparisons" ? "横评组" : "实验 ID",
        }] }, ok: true };
      }
      if (action === "+view-set-filter") {
        filterCalls.push({
          filter: JSON.parse(args[args.indexOf("--json") + 1]),
          tableId,
        });
      }
      if (action === "+base-get") {
        return { data: { base: { url: "https://example.feishu.cn/base/base" } }, ok: true };
      }
      return { data: {}, ok: true };
    },
  });
  const comparison = await store.prepareExperimentView("EXP-001", "comparison");
  const report = await store.prepareExperimentView("EXP-001", "report");
  assert.equal(comparison.url, "https://example.feishu.cn/base/base?table=comparisons&view=vew-compare");
  assert.equal(report.url, "https://example.feishu.cn/base/base?table=reports&view=vew-report");
  assert.deepEqual(filterCalls, [
    { filter: { conditions: [["fld-group", "intersects", "EXP-001"]], logic: "and" }, tableId: "comparisons" },
    { filter: { conditions: [["fld-experiment", "intersects", "EXP-001"]], logic: "and" }, tableId: "reports" },
  ]);
});

test("正式运行前创建一条冻结生成配置", async () => {
  let created;
  const run = async (_config, args) => {
    if (args[1] === "+field-list") {
      return { data: { fields: configFields }, ok: true };
    }
    created = JSON.parse(args[args.indexOf("--json") + 1]);
    return { data: { record_id_list: ["rec-config-new"] }, ok: true };
  };
  const store = createBenchmarkBaseStore(config, { run });
  const recordId = await store.createGenerationConfig({
    configId: "CFG-FROZEN",
    fusionAgent: "白模渲染融合 Agent [white-model-fusion@v7]",
    fusionModel: "Gemini 3.1 Pro [gemini-3.1-pro-preview]",
    groupId: "EXP-NEW",
    imageModel: "GPT Image 2 [gpt-image-2]",
    outputSpec: "跟随原图比例 · 2K · PNG · 质量 medium",
    perBatchImages: 4,
    promptBatches: 1,
    styleDna: "Style DNA [cream-french@v4]",
  });
  const fields = Object.fromEntries(
    created.fields.map((field, index) => [field, created.rows[0][index]]),
  );
  assert.equal(recordId, "rec-config-new");
  assert.equal(fields["配置 ID"], "CFG-FROZEN");
  assert.equal(fields["横评组"], "EXP-NEW");
  assert.equal(Object.hasOwn(fields, "创建时间"), false);
  assert.equal(fields["Style DNA"], "奶油法式 v4 [cream-french@v4]");
  assert.equal(fields["融合 Agent"], "白模渲染融合 Agent-即梦 v7 [white-model-fusion@v7]");
  assert.equal(fields["输出规格"], "跟随原图比例 · 2K · PNG");
  assert.equal(fields["启用"], true);
});

test("Base 未独立承载非默认质量档时在写记录前阻止参数丢失", async () => {
  let createCalls = 0;
  const store = createBenchmarkBaseStore(config, {
    run: async (_config, args) => {
      if (args[1] === "+field-list") return { data: { fields: configFields }, ok: true };
      createCalls += 1;
      return { data: { record_id_list: ["should-not-create"] }, ok: true };
    },
  });
  await assert.rejects(
    () => store.createGenerationConfig({
      configId: "CFG-HIGH",
      fusionAgent: "白模渲染融合 Agent [white-model-fusion@v7]",
      fusionModel: "Gemini 3.1 Pro [gemini-3.1-pro-preview]",
      groupId: "EXP-HIGH",
      imageModel: "GPT Image 2 [gpt-image-2]",
      outputSpec: "跟随原图比例 · 2K · PNG · 质量 high",
      perBatchImages: 1,
      promptBatches: 1,
      styleDna: "Style DNA [cream-french@v4]",
    }),
    /质量档 high 尚未在 Benchmark Base 配置表中独立建模/,
  );
  assert.equal(createCalls, 0);
});

test("冻结配置写入失败时保留配置 ID、Base 阶段和原始错误", async () => {
  const store = createBenchmarkBaseStore(config, {
    run: async () => { throw new Error("not_found"); },
  });
  await assert.rejects(
    () => store.createGenerationConfig({
      configId: "CFG-FAILED",
      fusionAgent: "融合 [white-model-fusion@v7]",
      fusionModel: "Gemini [gemini-3.1-pro-preview]",
      groupId: "EXP-FAILED",
      imageModel: "GPT Image 2 [gpt-image-2]",
      outputSpec: "跟随原图比例 · 2K · PNG · 质量 medium",
      perBatchImages: 1,
      promptBatches: 1,
      styleDna: "奶油法式 [cream-french@v4]",
    }),
    /冻结配置 CFG-FAILED 写入 Benchmark Base 失败：not_found/,
  );
});

test("五张表解析为编排快照、可选 USD 成本且 Banana Pro 保持停用", async () => {
  const calls = [];
  const run = async (_config, args) => {
    calls.push(args);
    const table = args[args.indexOf("--table-id") + 1];
    if (args[1] === "+field-list") {
      return { data: { fields: [{ name: table === "prompts" ? "Prompt 成本（USD）" : "Image 成本（USD）" }] }, ok: true };
    }
    if (table === "samples") {
      return envelope(
        ["Case ID", "白模参考图", "任务状态", "样本类型", "样本来源", "空间类型", "数据集版本"],
        ["LIVING-001", [{ file_token: "file", name: "white.png" }], ["待生成"], ["有效白模"], ["用户输入"], ["客厅"], "WM-MVP-v2"],
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
          "Prompt 哈希", "Prompt 成本（USD）",
        ],
        ["P1", "{}", ["完成"], "", 1.2, null, "req-prompt", "hash", 0.01],
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
          "生成状态", "错误信息", "生成结果图", "Image 成本（USD）",
        ],
        [
          "RUN-1", [{ id: "rec-sample" }], [{ id: "rec-prompt" }],
          [{ id: "rec-config" }], "GROUP", ["模型横评"], "Banana Pro",
          "Google", 1, 1, "", "{}", "hash", 1.2, null, "req-image",
          20, null, ["成功"], "", [{ file_token: "result" }], 0.2,
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
  assert.equal(snapshot.samples[0].category, "客厅");
  assert.equal(snapshot.samples[0].datasetVersion, "WM-MVP-v2");
  assert.equal(snapshot.configs[0].enabled, false);
  assert.equal(snapshot.configs[0].imageModel, "Banana Pro [gemini-3-pro-image]");
  assert.equal(snapshot.configs[0].imageModelLabel, "Banana Pro");
  assert.equal(snapshot.prompts[0].status, "完成");
  assert.equal(snapshot.prompts[0].costUsd, 0.01);
  assert.equal(snapshot.results[0].runId, "RUN-1");
  assert.equal(snapshot.results[0].imageCostUsd, 0.2);
  assert.equal(snapshot.results[0].attachments.length, 1);
  assert.equal(
    snapshot.comparisons[0].modelAttachments["Banana Pro"].length,
    1,
  );
  assert.equal(snapshot.comparisons[0].referenceAttachments.length, 1);
  assert.equal(calls.length, 7);
});

test("分类样本写入飞书字段并上传唯一参考图", async () => {
  let created;
  let uploadArgs;
  const run = async (_config, args) => {
    if (args.includes("+record-batch-create")) {
      created = JSON.parse(args[args.indexOf("--json") + 1]);
      return { data: { record_id_list: ["rec-case"] }, ok: true };
    }
    if (args.includes("+field-list")) {
      return { data: { fields: sampleWriteFields }, ok: true };
    }
    uploadArgs = args;
    return { data: { attachments: {} }, ok: true };
  };
  const store = createBenchmarkBaseStore(config, { run });
  await store.createSample({
    caseId: "LIVING-010",
    category: "客厅",
    datasetVersion: "WM-MVP-v2",
    edgeType: "CAD/线稿",
    image: { dataUrl: "data:image/png;base64,aQ==", type: "image/png" },
    inputQuality: "低",
    lensComplexity: "高",
    materialComplexity: "中",
    sampleType: "边缘输入",
    source: "用户输入",
    spatialComplexity: "高",
    stylingComplexity: "低",
  });

  const fields = Object.fromEntries(
    created.fields.map((field, index) => [field, created.rows[0][index]]),
  );
  assert.equal(fields["空间类型"], "客厅");
  assert.equal(fields["数据集版本"], "WM-MVP-v2");
  assert.equal(fields["边缘类型"], "CAD/线稿");
  assert.equal(fields["样本类型"], "边缘输入");
  assert.equal(fields["样本来源"], "用户输入");
  assert.equal(fields["空间结构"], "高");
  assert.equal(fields["镜头复杂度"], "高");
  assert.equal(fields["软装复杂度"], "低");
  assert.equal(fields["材质复杂度"], "中");
  assert.equal(fields["输入质量"], "低");
  assert.equal(uploadArgs[uploadArgs.indexOf("--field-id") + 1], "fld-image");
});

test("样本集重命名以同值 patch 批量更新飞书样本", async () => {
  let written;
  const run = async (_config, args) => {
    if (args.includes("+field-list")) return { data: { fields: sampleWriteFields }, ok: true };
    written = { args, body: JSON.parse(args[args.indexOf("--json") + 1]) };
    return { data: { record_id_list: written.body.record_id_list }, ok: true };
  };
  const store = createBenchmarkBaseStore(config, { run });
  await store.updateSampleDataset(["rec-a", "rec-b"], "白模回归集 v3");

  assert.ok(written.args.includes("+record-batch-update"));
  assert.deepEqual(written.body.record_id_list, ["rec-a", "rec-b"]);
  assert.deepEqual(written.body.patch, { "数据集版本": "白模回归集 v3" });
});

test("Prompt 批次写入关联 Case 与全部配置", async () => {
  let written;
  const run = async (_config, args) => {
    if (args.includes("+field-list")) return { data: { fields: promptWriteFields }, ok: true };
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
    if (args.includes("+field-list")) return { data: { fields: comparisonWriteFields }, ok: true };
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
    if (args.includes("+field-list")) return { data: { fields: resultWriteFields }, ok: true };
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

test("可选 USD 成本与三维评分写回运行明细", async () => {
  const writes = [];
  const run = async (_config, args) => {
    if (args[1] === "+field-list") {
      return { data: { fields: resultWriteFields }, ok: true };
    }
    writes.push(JSON.parse(args[args.indexOf("--json") + 1]));
    return { data: { record_id_list: ["rec-result"] }, ok: true };
  };
  const store = createBenchmarkBaseStore(config, { run });
  await store.saveRunResult({
    attempt: 1,
    caseRecordId: "case-rec",
    configRecordId: "config-rec",
    experimentId: "EXP",
    experimentType: "模型横评",
    imageCostUsd: 0.0757,
    model: "GPT Image 2",
    promptCostUsd: 0.0123,
    promptRecordId: "prompt-rec",
    runId: "RUN-USD",
    sampleIndex: 1,
    status: "成功",
  }, "rec-result");
  await store.saveRunReview("rec-result", {
    consistencyScore: 4,
    createdAt: "2026-08-05T15:33:00.000Z",
    issues: [{ description: "镜头轻微偏移", dimension: "consistency", evidence: "右墙变窄", severity: "MINOR" }],
    protocolVersion: "white-model-review@v3.1-single-pass",
    reason: "这是一个超过五十个字符后必须被截断的评分理由，用于确认飞书短文本不会无限增长并保持字段契约稳定。额外字符。",
    renderQualityScore: 3,
    reviewable: true,
    scoreDetails: {
      consistency: { comment: "整体一致", deduction_reason: "镜头轻微偏移", evidence: "右墙变窄", score: 4 },
    },
    styleMaterialScore: 5,
    weightedScore: 4,
  });

  assert.equal(writes[0]["Prompt 成本（USD）"], 0.0123);
  assert.equal(writes[0]["Image 成本（USD）"], 0.0757);
  assert.deepEqual([
    writes[1]["保持一致性"], writes[1]["风格与材质"], writes[1]["渲染质量"],
  ], [4, 5, 3]);
  assert.equal(Array.from(writes[1]["判断理由（≤50字）"]).length, 50);
  assert.equal(writes[1]["评审时间"], "2026-08-05 15:33:00");
  assert.match(writes[1]["评分细则"], /保持一致性：4 \/ 5/);
  assert.match(writes[1]["评分细则"], /问题明细/);
});

test("运行明细单选值不在飞书实时选项时在写入前阻断", async () => {
  let writeCalls = 0;
  const store = createBenchmarkBaseStore(config, {
    run: async (_config, args) => {
      if (args.includes("+field-list")) return { data: { fields: resultWriteFields }, ok: true };
      writeCalls += 1;
      return { data: { record_id_list: ["should-not-write"] }, ok: true };
    },
  });
  await assert.rejects(() => store.saveRunResult({
    attempt: 1,
    caseRecordId: "case-rec",
    configRecordId: "config-rec",
    experimentId: "EXP",
    experimentType: "单变量横评",
    model: "GPT Image 2",
    promptRecordId: "prompt-rec",
    runId: "RUN-INVALID-TYPE",
    sampleIndex: 1,
    status: "生成中",
  }), /实验类型.*没有选项：单变量横评/);
  assert.equal(writeCalls, 0);
});

test("正式执行前按飞书实时选项校验全部状态与实验类型", async () => {
  const store = createBenchmarkBaseStore(config, {
    run: async (_config, args) => {
      const tableId = args[args.indexOf("--table-id") + 1];
      const fields = {
        prompts: promptWriteFields,
        results: resultWriteFields,
        samples: sampleWriteFields,
      }[tableId];
      return { data: { fields }, ok: true };
    },
  });
  assert.equal(await store.validateExecutionContract(["模型横评", "Prompt 横评"]), true);
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

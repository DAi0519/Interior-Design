/**
 * [INPUT]: 依赖 node:test/assert 与 benchmark-runner.mjs 的可筛选纯计划器、可注入模型/飞书执行边界
 * [OUTPUT]: 对外提供 Case/配置筛选、停用模型排除、Prompt 隔离、Run 真源、失败重试、横评展示与 63 图规模回归保障
 * [POS]: test 的模型横评核心集成测试，所有资源与模型调用均使用内存替身
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBenchmarkPlan,
  runBenchmark,
} from "../src/benchmark-runner.mjs";

const onePixelPng =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z7JkAAAAASUVORK5CYII=";
const pngBytes = Buffer.from(onePixelPng.split(",")[1], "base64");

function config({
  configId,
  enabled,
  imageModel,
  recordId = `rec-${configId}`,
}) {
  return {
    configId,
    enabled,
    fusionAgent: "融合 Agent [white-model-fusion@v7]",
    fusionModel: "Gemini 3.1 Pro [gemini-3.1-pro-preview]",
    groupId: "MODEL-COMPARE-001",
    imageModel,
    outputSpec: "跟随原图比例 · 2K · PNG",
    perBatchImages: 1,
    promptBatches: 3,
    recordId,
    styleDna: "奶油法式 v4 [cream-french@v4]",
  };
}

function snapshot(caseCount = 1) {
  return {
    comparisons: [],
    configs: [
      config({
        configId: "CFG-001",
        enabled: true,
        imageModel: "Seedream 5.0 [doubao-seedream-5.0]",
      }),
      config({
        configId: "CFG-002",
        enabled: false,
        imageModel: "Banana Pro [gemini-3-pro-image]",
      }),
      config({
        configId: "CFG-003",
        enabled: true,
        imageModel: "Banana 2 [gemini-3.1-flash-image-preview]",
      }),
      config({
        configId: "CFG-004",
        enabled: true,
        imageModel: "GPT Image 2 [gpt-image-2]",
      }),
    ],
    prompts: [],
    results: [],
    samples: Array.from({ length: caseCount }, (_, index) => ({
      attachments: [{ file_token: `file-${index}`, name: "white.png" }],
      caseId: `CASE-${String(index + 1).padStart(3, "0")}`,
      recordId: `rec-case-${index + 1}`,
      status: "待生成",
    })),
  };
}

function agentPayload(batch) {
  return {
    generation_requirement: `要求-${batch}`,
    scene_preservation: "保持空间与机位",
    visual_application: {
      colors: "奶油白",
      materials: "真实材质",
      photography: "专业摄影",
    },
  };
}

test("七个样本只规划三个启用模型，共 21 次融合与 63 张图", () => {
  const plan = buildBenchmarkPlan(snapshot(7));

  assert.equal(plan.groups[0].configs.length, 3);
  assert.deepEqual(
    plan.groups[0].configs.map((entry) => entry.imageModelLabel),
    ["Seedream 5.0", "Banana 2", "GPT Image 2"],
  );
  assert.equal(plan.summary.cases, 7);
  assert.equal(plan.summary.promptBatches, 21);
  assert.equal(plan.summary.imageRuns, 63);
});

test("边缘输入不进入白模模型横评计划", () => {
  const data = snapshot(2);
  data.samples[0].sampleType = "有效白模";
  data.samples[1].sampleType = "边缘输入";

  const plan = buildBenchmarkPlan(data);

  assert.equal(plan.summary.cases, 1);
  assert.equal(plan.summary.promptBatches, 3);
  assert.equal(plan.summary.imageRuns, 9);
});

test("工作台可选择 Case、配置并显式纳入已完成样本", () => {
  const data = snapshot(2);
  data.samples[0].status = "完成";
  const plan = buildBenchmarkPlan(data, {
    caseIds: ["CASE-001"],
    configIds: ["CFG-001"],
    includeCompletedSamples: true,
  });

  assert.equal(plan.summary.cases, 1);
  assert.equal(plan.summary.activeImageModels, 1);
  assert.equal(plan.summary.imageRuns, 3);
});

test("每批重新融合一次，批内三个模型严格共享冻结 Prompt", async () => {
  const plan = buildBenchmarkPlan(snapshot());
  const promptCalls = [];
  const imageCalls = [];
  const savedPrompts = [];
  const savedRuns = [];
  const savedComparisons = [];
  const uploadedReferences = [];
  const uploaded = [];
  const uploadedRunImages = [];
  const statuses = [];
  const progress = [];
  const client = {
    generateImage: async (request) => {
      imageCalls.push(request);
      return {
        images: [{ url: "data:image/png;base64,aQ==" }],
        outputFormat: "png",
      };
    },
    generatePrompt: async (request) => {
      promptCalls.push(request);
      return { text: JSON.stringify(agentPayload(promptCalls.length)) };
    },
    listModels: async () => [
      { id: "gemini-3.1-pro-preview" },
      { id: "doubao-seedream-5.0" },
      { id: "gemini-3.1-flash-image-preview" },
      { id: "gpt-image-2" },
    ],
  };
  const store = {
    downloadSampleImage: async () => ({
      dataUrl: onePixelPng,
      name: "white.png",
      size: pngBytes.length,
      type: "image/png",
    }),
    savePromptBatch: async (value, recordId) => {
      savedPrompts.push(value);
      return recordId || `prompt-rec-${value.batch}`;
    },
    saveComparisonRow: async (value, recordId) => {
      savedComparisons.push(value);
      return recordId || `comparison-rec-${value.compareId}`;
    },
    saveRunResult: async (value, recordId) => {
      savedRuns.push(value);
      return recordId || `result-rec-${savedRuns.length}`;
    },
    updateSampleStatus: async (_recordId, status) => statuses.push(status),
    uploadComparisonImage: async (recordId, modelLabel, image, format) => {
      uploaded.push({ format, image, modelLabel, recordId });
    },
    uploadComparisonReference: async (recordId, reference) => {
      uploadedReferences.push({ recordId, reference });
    },
    uploadResultImage: async (recordId, image, format) => {
      uploadedRunImages.push({ format, image, recordId });
    },
  };

  const result = await runBenchmark(plan, {
    client,
    execute: true,
    loadAgent: async () => ({
      code: "white-model-fusion",
      systemPrompt: "system",
      version: 7,
    }),
    loadStyle: async () => ({
      code: "cream-french@v4",
      styleDna: { style_dna: { overall_style: "cream" } },
      version: 4,
    }),
    onProgress: (value) => progress.push(value),
    store,
  });

  assert.equal(promptCalls.length, 3);
  assert.equal(imageCalls.length, 9);
  assert.equal(savedPrompts.filter((entry) => entry.status === "完成").length, 3);
  assert.equal(savedComparisons.length, 3);
  assert.equal(uploadedReferences.length, 3);
  assert.equal(uploaded.length, 9);
  assert.equal(uploadedRunImages.length, 9);
  assert.equal(savedRuns.filter((entry) => entry.status === "成功").length, 9);
  assert.equal(savedRuns.filter((entry) => entry.status === "生成中").length, 9);
  assert.equal(new Set(uploaded.map((entry) => entry.recordId)).size, 3);
  assert.deepEqual(statuses, ["生成中", "完成"]);
  assert.equal(result.generatedPrompts, 3);
  assert.equal(result.generatedImages, 9);
  assert.equal(progress.at(-1).completed, 9);
  assert.equal(progress.at(-1).total, 9);

  for (let batch = 0; batch < 3; batch += 1) {
    const prompts = imageCalls
      .slice(batch * 3, batch * 3 + 3)
      .map((request) => request.prompt);
    assert.equal(new Set(prompts).size, 1);
    assert.equal(JSON.parse(prompts[0]).generation_requirement, `要求-${batch + 1}`);
  }
  assert.equal(new Set(imageCalls.map((request) => request.prompt)).size, 3);
});

test("预演模式不调用模型或写入 Base", async () => {
  const plan = buildBenchmarkPlan(snapshot());
  const result = await runBenchmark(plan);
  assert.equal(result.mode, "plan");
  assert.equal(result.imageRuns, 9);
});

test("只跑部分 Prompt 批次后保留待生成状态供全量续跑", async () => {
  const plan = buildBenchmarkPlan(snapshot(), { maxPromptBatches: 1 });
  const statuses = [];
  const client = {
    generateImage: async () => ({
      images: [{ url: "data:image/png;base64,aQ==" }],
      outputFormat: "png",
    }),
    generatePrompt: async () => ({ text: JSON.stringify(agentPayload(1)) }),
    listModels: async () => [
      { id: "gemini-3.1-pro-preview" },
      { id: "doubao-seedream-5.0" },
      { id: "gemini-3.1-flash-image-preview" },
      { id: "gpt-image-2" },
    ],
  };
  let nextId = 0;
  const store = {
    downloadSampleImage: async () => ({
      dataUrl: onePixelPng,
      name: "white.png",
      size: pngBytes.length,
      type: "image/png",
    }),
    savePromptBatch: async (_value, recordId) =>
      recordId || `prompt-${nextId += 1}`,
    saveComparisonRow: async (_value, recordId) =>
      recordId || `comparison-${nextId += 1}`,
    saveRunResult: async (_value, recordId) =>
      recordId || `result-${nextId += 1}`,
    updateSampleStatus: async (_recordId, status) => statuses.push(status),
    uploadComparisonImage: async () => {},
    uploadComparisonReference: async () => {},
    uploadResultImage: async () => {},
  };

  await runBenchmark(plan, {
    client,
    execute: true,
    loadAgent: async () => ({ systemPrompt: "system" }),
    loadStyle: async () => ({
      styleDna: { style_dna: { overall_style: "cream" } },
    }),
    store,
  });

  assert.deepEqual(statuses, ["生成中", "待生成"]);
});

test("失败 Run 生成新尝试且保留重试来源", () => {
  const value = snapshot();
  const logicalRunId =
    "CASE-001__MODEL-COMPARE-001__P1__CFG-001__S1";
  value.results = [{
    attachments: [],
    attempt: 1,
    recordId: "failed-rec",
    runId: logicalRunId,
    status: "失败",
  }];

  const plan = buildBenchmarkPlan(value, { maxPromptBatches: 1 });
  const run = plan.groups[0].cases[0].batches[0].runs[0];

  assert.equal(run.runId, logicalRunId);
  assert.equal(run.nextAttempt, 2);
  assert.equal(run.retrySource, logicalRunId);
});

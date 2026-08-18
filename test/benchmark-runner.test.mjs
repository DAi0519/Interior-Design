/**
 * [INPUT]: 依赖 node:test/assert 与 benchmark-runner.mjs 的可筛选纯计划器、可注入模型/飞书执行边界
 * [OUTPUT]: 对外提供 Case/配置筛选、八类单变量的 Prompt 共享或隔离、飞书实验类型映射、停用模型排除、Provider 智能路由、主动取消、OneAPI 费用传递、Run 真源、失败重试、横评展示与规模回归保障
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
  fusionAgent = "融合 Agent [white-model-fusion@v7]",
  fusionModel = "Gemini 3.1 Pro [gemini-3.1-pro-preview]",
  imageModel,
  outputSpec = "跟随原图比例 · 2K · PNG",
  recordId = `rec-${configId}`,
  styleDna = "奶油法式 v4 [cream-french@v4]",
}) {
  return {
    configId,
    enabled,
    fusionAgent,
    fusionModel,
    groupId: "MODEL-COMPARE-001",
    imageModel,
    outputSpec,
    perBatchImages: 1,
    promptBatches: 3,
    recordId,
    styleDna,
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

test("取消当前 Provider 请求后立即停止后续 Run", async () => {
  const data = snapshot();
  data.configs = data.configs
    .filter((entry) => entry.enabled)
    .map((entry) => ({ ...entry, promptBatches: 1 }));
  const plan = buildBenchmarkPlan(data);
  const controller = new AbortController();
  const reason = new Error("用户已停止任务");
  reason.name = "AbortError";
  let imageCalls = 0;
  const client = {
    async generateImage() {
      imageCalls += 1;
      controller.abort(reason);
      throw reason;
    },
    async generatePrompt() {
      return { text: JSON.stringify(agentPayload(1)) };
    },
    async listModels() {
      return [
        { id: "gemini-3.1-pro-preview" },
        { id: "doubao-seedream-5.0" },
        { id: "gemini-3.1-flash-image-preview" },
        { id: "gpt-image-2" },
      ];
    },
  };
  let nextId = 0;
  const store = {
    async downloadSampleImage() {
      return { dataUrl: onePixelPng, name: "white.png", size: pngBytes.length, type: "image/png" };
    },
    async saveComparisonRow(_value, recordId) { return recordId || `comparison-${nextId += 1}`; },
    async savePromptBatch(_value, recordId) { return recordId || `prompt-${nextId += 1}`; },
    async saveRunResult(_value, recordId) { return recordId || `result-${nextId += 1}`; },
    async updateSampleStatus() {},
    async uploadComparisonImage() {},
    async uploadComparisonReference() {},
    async uploadResultImage() {},
  };

  await assert.rejects(
    runBenchmark(plan, {
      client,
      execute: true,
      loadAgent: async () => ({ systemPrompt: "system" }),
      loadStyle: async () => ({ styleDna: "style" }),
      signal: controller.signal,
      store,
    }),
    (error) => error === reason,
  );
  assert.equal(imageCalls, 1);
});

test("Prompt 版本实验固定模型并为每个版本规划独立 Prompt", () => {
  const data = snapshot();
  data.configs = [
    config({
      configId: "CFG-PROMPT-V6",
      enabled: true,
      fusionAgent: "融合 Agent [white-model-fusion@v6]",
      imageModel: "Seedream 5.0 [doubao-seedream-5.0]",
    }),
    config({
      configId: "CFG-PROMPT-V7",
      enabled: true,
      fusionAgent: "融合 Agent [white-model-fusion@v7]",
      imageModel: "Seedream 5.0 [doubao-seedream-5.0]",
    }),
  ];
  const plan = buildBenchmarkPlan(data);

  assert.equal(plan.groups[0].variableType, "prompt-version");
  assert.equal(plan.groups[0].cases[0].batches.length, 6);
  assert.equal(new Set(plan.groups[0].cases[0].batches.map((batch) => batch.promptId)).size, 6);
  assert.ok(plan.groups[0].cases[0].batches.every((batch) => batch.configs.length === 1));
  assert.equal(plan.summary.activeImageModels, 1);
  assert.equal(plan.summary.activeVariants, 2);
  assert.equal(plan.summary.promptBatches, 6);
  assert.equal(plan.summary.imageRuns, 6);
});

test("Prompt 版本实验运行时逐版本加载 Agent 且固定同一出图模型", async () => {
  const data = snapshot();
  data.configs = [
    { ...config({ configId: "CFG-PROMPT-V6", enabled: true, fusionAgent: "融合 Agent [white-model-fusion@v6]", imageModel: "Seedream 5.0 [doubao-seedream-5.0]" }), promptBatches: 1 },
    { ...config({ configId: "CFG-PROMPT-V7", enabled: true, fusionAgent: "融合 Agent [white-model-fusion@v7]", imageModel: "Seedream 5.0 [doubao-seedream-5.0]" }), promptBatches: 1 },
  ];
  const plan = buildBenchmarkPlan(data);
  const loadedVersions = [];
  const promptSystemPrompts = [];
  const imageModels = [];
  const runTypes = [];
  let promptRecord = 0;
  let resultRecord = 0;
  const client = {
    async generateImage(request) {
      imageModels.push(request.model);
      return { images: [{ url: onePixelPng }], outputFormat: "png" };
    },
    async generatePrompt(request) {
      promptSystemPrompts.push(request.systemPrompt);
      return { text: JSON.stringify(agentPayload(promptSystemPrompts.length)) };
    },
    async listModels() {
      return [{ id: "gemini-3.1-pro-preview" }, { id: "doubao-seedream-5.0" }];
    },
  };
  const store = {
    async downloadSampleImage() {
      return { dataUrl: onePixelPng, name: "white.png", size: pngBytes.length, type: "image/png" };
    },
    async saveComparisonRow(_value, recordId) { return recordId || "comparison-rec"; },
    async savePromptBatch(_value, recordId) { promptRecord += recordId ? 0 : 1; return recordId || `prompt-rec-${promptRecord}`; },
    async saveRunResult(value, recordId) { runTypes.push(value.experimentType); resultRecord += recordId ? 0 : 1; return recordId || `result-rec-${resultRecord}`; },
    async updateSampleStatus() {},
    async uploadComparisonImage() {},
    async uploadComparisonReference() {},
    async uploadResultImage() {},
  };

  const result = await runBenchmark(plan, {
    client,
    execute: true,
    loadAgent: async (_code, { version }) => {
      loadedVersions.push(version);
      return { systemPrompt: `system-v${version}` };
    },
    loadStyle: async () => ({ styleDna: "style" }),
    store,
  });

  assert.deepEqual(loadedVersions, [6, 7]);
  assert.deepEqual(promptSystemPrompts, ["system-v6", "system-v7"]);
  assert.deepEqual(imageModels, ["doubao-seedream-5.0", "doubao-seedream-5.0"]);
  assert.deepEqual([...new Set(runTypes)], ["Prompt 横评"]);
  assert.equal(result.generatedPrompts, 2);
  assert.equal(result.generatedImages, 2);
});

test("出图阶段变量共享同一冻结 Prompt，并为候选值建立独立对比行", async () => {
  const data = snapshot();
  data.configs = [
    config({
      configId: "CFG-RES-1K",
      enabled: true,
      imageModel: "GPT Image 2 [gpt-image-2]",
      outputSpec: "4:3 · 1K · PNG · 质量 medium",
    }),
    config({
      configId: "CFG-RES-2K",
      enabled: true,
      imageModel: "GPT Image 2 [gpt-image-2]",
      outputSpec: "4:3 · 2K · PNG · 质量 medium",
    }),
  ].map((entry) => ({ ...entry, promptBatches: 1 }));
  const plan = buildBenchmarkPlan(data);
  const promptCalls = [];
  const imageCalls = [];
  const comparisonIds = [];
  let nextId = 0;
  const client = {
    async generateImage(request) {
      imageCalls.push(request);
      return { images: [{ url: onePixelPng }] };
    },
    async generatePrompt(request) {
      promptCalls.push(request);
      return { text: JSON.stringify(agentPayload(1)) };
    },
    async listModels() {
      return [{ id: "gemini-3.1-pro-preview" }, { id: "gpt-image-2" }];
    },
  };
  const store = {
    async downloadSampleImage() {
      return { dataUrl: onePixelPng, name: "white.png", size: pngBytes.length, type: "image/png" };
    },
    async saveComparisonRow(value, recordId) {
      comparisonIds.push(value.compareId);
      return recordId || `comparison-${nextId += 1}`;
    },
    async savePromptBatch(_value, recordId) { return recordId || `prompt-${nextId += 1}`; },
    async saveRunResult(_value, recordId) { return recordId || `result-${nextId += 1}`; },
    async updateSampleStatus() {},
    async uploadComparisonImage() {},
    async uploadComparisonReference() {},
    async uploadResultImage() {},
  };

  const result = await runBenchmark(plan, {
    client,
    execute: true,
    loadAgent: async () => ({ systemPrompt: "system" }),
    loadStyle: async () => ({ styleDna: "style" }),
    store,
  });

  assert.equal(plan.groups[0].variableKey, "resolution");
  assert.equal(plan.groups[0].variableStage, "image");
  assert.equal(new Set(plan.groups[0].cases[0].batches.map((batch) => batch.promptId)).size, 1);
  assert.equal(new Set(plan.groups[0].cases[0].batches.map((batch) => batch.comparisonId)).size, 2);
  assert.equal(promptCalls.length, 1);
  assert.equal(imageCalls.length, 2);
  assert.equal(new Set(imageCalls.map((request) => request.prompt)).size, 1);
  assert.equal(new Set(comparisonIds.filter(Boolean)).size, 2);
  assert.equal(result.generatedPrompts, 1);
  assert.equal(result.generatedImages, 2);
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
        cost: 0.2,
        costUsd: 0.2 / 7,
        images: [{ url: "data:image/png;base64,aQ==" }],
        outputFormat: "png",
      };
    },
    generatePrompt: async (request) => {
      promptCalls.push(request);
      return { cost: 0.01, costUsd: 0.01 / 7, text: JSON.stringify(agentPayload(promptCalls.length)) };
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
  assert.equal(savedPrompts.find((entry) => entry.status === "完成").cost, 0.01);
  assert.equal(savedPrompts.find((entry) => entry.status === "完成").costUsd, 0.01 / 7);
  assert.equal(savedComparisons.length, 3);
  assert.equal(uploadedReferences.length, 3);
  assert.equal(uploaded.length, 9);
  assert.equal(savedRuns.findLast((entry) => entry.status === "成功").imageCostUsd, 0.2 / 7);
  assert.equal(uploadedRunImages.length, 9);
  assert.equal(savedRuns.filter((entry) => entry.status === "成功").length, 9);
  assert.equal(savedRuns.filter((entry) => entry.status === "生成中").length, 9);
  assert.deepEqual([...new Set(savedRuns.map((entry) => entry.experimentType))], ["模型横评"]);
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

test("计划模式不调用模型或写入 Base", async () => {
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

test("断点重试跳过成功 Run 并只生成失败 Run 的下一次尝试", async () => {
  const value = snapshot();
  value.configs = value.configs.filter((entry) => entry.enabled);
  value.configs.forEach((entry) => { entry.promptBatches = 1; });
  const promptId = "CASE-001__MODEL-COMPARE-001__P1";
  const runId = (configId) => `${promptId}__${configId}__S1`;
  value.prompts = [{
    finalPrompt: JSON.stringify(agentPayload(1)),
    promptId,
    recordId: "prompt-existing",
    status: "完成",
  }];
  value.results = [
    { attachments: [{ file_token: "ok-1" }], attempt: 1, runId: runId("CFG-001"), status: "成功" },
    { attachments: [], attempt: 1, runId: runId("CFG-003"), status: "失败" },
    { attachments: [{ file_token: "ok-4" }], attempt: 1, runId: runId("CFG-004"), status: "成功" },
  ];
  const plan = buildBenchmarkPlan(value);
  const savedRuns = [];
  const progress = [];
  let imageCalls = 0;
  const client = {
    async generateImage() {
      imageCalls += 1;
      return { images: [{ url: "data:image/png;base64,aQ==" }] };
    },
    async generatePrompt() { throw new Error("不应重新融合 Prompt"); },
    async listModels() {
      return [
        { id: "gemini-3.1-pro-preview" },
        { id: "doubao-seedream-5.0" },
        { id: "gemini-3.1-flash-image-preview" },
        { id: "gpt-image-2" },
      ];
    },
  };
  let nextId = 0;
  const store = {
    async downloadSampleImage() {
      return { dataUrl: onePixelPng, name: "white.png", size: pngBytes.length, type: "image/png" };
    },
    async saveComparisonRow(_value, recordId) { return recordId || `comparison-${nextId += 1}`; },
    async saveRunResult(run, recordId) {
      savedRuns.push(run);
      return recordId || `result-${nextId += 1}`;
    },
    async updateSampleStatus() {},
    async uploadComparisonImage() {},
    async uploadComparisonReference() {},
    async uploadResultImage() {},
  };

  const result = await runBenchmark(plan, {
    client,
    execute: true,
    loadAgent: async () => ({ systemPrompt: "system" }),
    loadStyle: async () => ({ styleDna: {} }),
    onProgress: (entry) => progress.push(entry),
    store,
  });

  assert.equal(plan.summary.processedImages, 3);
  assert.equal(imageCalls, 1);
  assert.equal(result.generatedImages, 1);
  assert.equal(result.processedImages, 3);
  assert.equal(result.skippedImages, 2);
  assert.equal(progress.at(0).completed, 3);
  assert.equal(progress.at(-1).completed, 3);
  assert.equal(savedRuns.at(-1).attempt, 2);
  assert.equal(savedRuns.at(-1).retrySource, runId("CFG-003"));
});

test("混合 Provider 横评共享输出策略并按模型路由分辨率", () => {
  const value = snapshot();
  value.configs = [
    config({
      configId: "CFG-FLUX",
      enabled: true,
      imageModel: "Flux2 Klein [comfyui:ai-texture-enhancement]",
    }),
    config({
      configId: "CFG-GPT",
      enabled: true,
      imageModel: "GPT Image 2 [gpt-image-2]",
    }),
  ];
  value.configs[0].outputSpec = "跟随原图比例 · 2K · PNG · 质量 medium";

  const plan = buildBenchmarkPlan(value, { maxPromptBatches: 1 });

  assert.equal(plan.groups[0].output.resolution, "2K");
  assert.deepEqual(
    plan.groups[0].configs.map((entry) => [
      entry.imageModelLabel,
      entry.output.resolution,
    ]),
    [
      ["Flux2 Klein", "2K"],
      ["GPT Image 2", "2K"],
    ],
  );
  assert.deepEqual(
    plan.groups[0].cases[0].batches[0].runs.map((run) =>
      run.config.output.resolution),
    ["2K", "2K"],
  );
});

test("同一横评组仍拒绝两个不同的预设分辨率", () => {
  const value = snapshot();
  value.configs = value.configs.filter((entry) => entry.enabled).slice(0, 2);
  value.configs[1].outputSpec = "跟随原图比例 · 4K · PNG";

  assert.throws(
    () => buildBenchmarkPlan(value),
    /分辨率必须完全一致/,
  );
});

test("Flux2 Klein 横评由 OneAPI 融合 Prompt 并由 ComfyUI 出图", async () => {
  const value = snapshot();
  value.configs = [config({
    configId: "CFG-FLUX",
    enabled: true,
    imageModel: "Flux2 Klein [comfyui:ai-texture-enhancement]",
  })];
  value.configs[0].outputSpec = "跟随原图比例 · 2K · PNG";
  value.configs[0].promptBatches = 1;
  const plan = buildBenchmarkPlan(value);
  const savedRuns = [];
  let comfyCalls = 0;
  let oneApiImageCalls = 0;
  const oneApiClient = {
    async generateImage() { oneApiImageCalls += 1; },
    async generatePrompt() {
      return { text: JSON.stringify(agentPayload(1)) };
    },
    async listModels() {
      return [{ id: "gemini-3.1-pro-preview" }];
    },
  };
  const comfyUiClient = {
    async checkHealth() { return { available: true }; },
    async generateImage(request) {
      comfyCalls += 1;
      assert.equal(request.model, "comfyui:ai-texture-enhancement");
      assert.equal(request.size, "2048x2048");
      assert.equal(request.resolution, "2K");
      return {
        images: [{ url: "data:image/png;base64,aQ==" }],
        outputFormat: "png",
        requestId: "comfy-prompt-1",
      };
    },
  };
  let nextId = 0;
  const store = {
    async downloadSampleImage() {
      return {
        dataUrl: onePixelPng,
        name: "white.png",
        size: pngBytes.length,
        type: "image/png",
      };
    },
    async savePromptBatch(_value, recordId) {
      return recordId || `prompt-${nextId += 1}`;
    },
    async saveComparisonRow(_value, recordId) {
      return recordId || `comparison-${nextId += 1}`;
    },
    async saveRunResult(value, recordId) {
      savedRuns.push(value);
      return recordId || `result-${nextId += 1}`;
    },
    async updateSampleStatus() {},
    async uploadComparisonImage() {},
    async uploadComparisonReference() {},
    async uploadResultImage() {},
  };

  const result = await runBenchmark(plan, {
    client: oneApiClient,
    execute: true,
    imageClientForModel: (model) => {
      assert.equal(model.imageModelProvider, "comfyui");
      return comfyUiClient;
    },
    loadAgent: async () => ({ systemPrompt: "system" }),
    loadStyle: async () => ({
      styleDna: { style_dna: { overall_style: "cream" } },
    }),
    store,
  });

  assert.equal(plan.groups[0].configs[0].imageModelProvider, "comfyui");
  assert.equal(oneApiImageCalls, 0);
  assert.equal(comfyCalls, 1);
  assert.equal(result.generatedImages, 1);
  assert.equal(savedRuns.at(-1).provider, "ComfyUI");
});

/**
 * [INPUT]: 依赖 node:test/assert、临时目录、Benchmark 本地存储、计划器与 benchmark-workbench.mjs
 * [OUTPUT]: 对外提供样本集迁移/CRUD、空间与五维 AI 待审标签、人工准入、Gemini 3.5 Flash 默认及用户指定视觉模型、自动 Case ID、实验计划生成零 Base 写入、停止实验 Base 进度重建、冻结配置失败持久化、已完成实验直接评分/写回及失败批次落库、按实验 ID 汇总分析、正式/旧协议隔离的脱敏逐图评分结果与历史 Run 协议漂移拦截的回归保障
 * [POS]: test 的 Benchmark 工作台应用护栏测试，不调用真实模型或飞书
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { BENCHMARK_REVIEW_PROTOCOL_VERSION } from "../src/benchmark-review.mjs";
import { buildBenchmarkPlan } from "../src/benchmark-runner.mjs";
import { createBenchmarkWorkbenchStore } from "../src/benchmark-workbench-store.mjs";
import { createBenchmarkWorkbenchService, publicBenchmarkPlan } from "../src/benchmark-workbench.mjs";

test("样本预标注默认使用 Gemini 3.5 Flash", async () => {
  let request;
  const service = createBenchmarkWorkbenchService({ baseStore: {}, localStore: {} });
  const imageBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zp6sAAAAASUVORK5CYII=";
  const result = await service.labelCase({
    image: {
      dataUrl: `data:image/png;base64,${imageBase64}`,
      name: "white.png",
      size: Buffer.from(imageBase64, "base64").length,
      type: "image/png",
    },
  }, {
    client: {
      async analyzeImage(input) {
        request = input;
        return {
          text: '{"category":"客厅","spatial_complexity":"高","lens_complexity":"中","styling_complexity":"低","material_complexity":"中","input_quality":"高","reason":"空间层级较多","confidence":0.93}',
        };
      },
    },
  });

  assert.equal(request.model, "gemini-3.5-flash");
  assert.equal(result.modelKey, "gemini35flash");
  assert.equal(result.spatialComplexity, "高");
  assert.equal("sampleType" in result, false);
});

test("样本预标注尊重用户选择的可用视觉模型", async () => {
  let requestedModel;
  const service = createBenchmarkWorkbenchService({ baseStore: {}, localStore: {} });
  const imageBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zp6sAAAAASUVORK5CYII=";
  const result = await service.labelCase({
    image: {
      dataUrl: `data:image/png;base64,${imageBase64}`,
      name: "white.png",
      size: Buffer.from(imageBase64, "base64").length,
      type: "image/png",
    },
    modelKey: "qwen3vlplus",
  }, {
    client: {
      async analyzeImage(input) {
        requestedModel = input.model;
        return {
          text: '{"category":"客厅","spatial_complexity":"中","lens_complexity":"中","styling_complexity":"中","material_complexity":"中","input_quality":"中","reason":"常规客厅","confidence":0.9}',
        };
      },
    },
  });

  assert.equal(requestedModel, "qwen3-vl-plus");
  assert.equal(result.modelKey, "qwen3vlplus");
});

test("历史 Run 不在当前计划时阻止继续混跑", () => {
  const snapshot = {
    comparisons: [],
    configs: [{
      configId: "CFG-1",
      enabled: true,
      fusionAgent: "融合 [white-model-fusion@v7]",
      fusionModel: "Gemini [gemini-3.1-pro-preview]",
      groupId: "GROUP-1",
      imageModel: "GPT Image 2 [gpt-image-2]",
      outputSpec: "跟随原图比例 · 2K · PNG",
      perBatchImages: 1,
      promptBatches: 1,
      recordId: "rec-config",
      styleDna: "奶油法式 [cream-french@v4]",
    }],
    prompts: [],
    results: [{ experimentId: "GROUP-1", runId: "OLD-PROTOCOL-RUN" }],
    samples: [{
      attachments: [{ file_token: "file", name: "white.png" }],
      caseId: "CASE-1",
      recordId: "rec-case",
      sampleType: "有效白模",
      status: "完成",
    }],
  };
  const plan = buildBenchmarkPlan(snapshot, {
    groupId: "GROUP-1",
    includeCompletedSamples: true,
  });
  const result = publicBenchmarkPlan(plan, snapshot);

  assert.equal(result.drift.blocked, true);
  assert.match(result.drift.message, /历史 Run/);
});

test("生成实验计划时不创建 Base 配置", async () => {
  let createdConfigs = 0;
  let savedExperiment;
  const baseStore = {
    async createGenerationConfig() {
      createdConfigs += 1;
    },
    async loadSnapshot() {
      return {
        comparisons: [],
        configs: [],
        prompts: [],
        results: [],
        samples: [{
          attachments: [{ file_token: "file", name: "white.png" }],
          caseId: "CASE-1",
          recordId: "rec-case",
          sampleType: "有效白模",
          status: "待生成",
        }],
      };
    },
  };
  const localStore = {
    async saveExperiment(experiment) {
      savedExperiment = experiment;
    },
  };
  const service = createBenchmarkWorkbenchService({ baseStore, localStore });
  const plan = await service.planExperiment({
    caseIds: ["CASE-1"],
    draftConfig: {
      agentCode: "white-model-fusion",
      agentVersion: 7,
      fusionModelKey: "gemini3pro",
      imageModelKeys: ["seedream5", "gptImage2"],
      outputFormat: "png",
      perBatchImages: 4,
      promptBatches: 1,
      quality: "medium",
      ratioMode: "source",
      resolution: "2K",
      styleCode: "cream-french@v4",
    },
    experimentId: "EXP-DRAFT-001",
    groupId: "EXP-DRAFT-001",
  });

  assert.equal(createdConfigs, 0);
  assert.equal(plan.summary.activeImageModels, 2);
  assert.equal(plan.summary.imageRuns, 8);
  assert.equal(savedExperiment.status, "planned");
  assert.ok(savedExperiment.options.draftConfig);
});

test("停止实验从 Base Run 真源重建已处理进度", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "benchmark-stopped-progress-test-"));
  context.after(() => rm(directory, { force: true, recursive: true }));
  const localStore = createBenchmarkWorkbenchStore(join(directory, "state.json"));
  await localStore.saveExperiment({
    experimentId: "EXP-STOPPED",
    groupId: "EXP-STOPPED",
    options: {
      caseIds: ["CASE-1"],
      configIds: ["CFG-1"],
      groupId: "EXP-STOPPED",
      includeCompletedSamples: true,
    },
    status: "cancelled",
    summary: { imageRuns: 2 },
  });
  const baseStore = {
    async loadSnapshot() {
      return {
        comparisons: [],
        configs: [{
          configId: "CFG-1",
          enabled: true,
          fusionAgent: "融合 [white-model-fusion@v7]",
          fusionModel: "Gemini [gemini-3.1-pro-preview]",
          groupId: "EXP-STOPPED",
          imageModel: "GPT Image 2 [gpt-image-2]",
          outputSpec: "跟随原图比例 · 2K · PNG",
          perBatchImages: 2,
          promptBatches: 1,
          recordId: "rec-config",
          styleDna: "奶油法式 [cream-french@v4]",
        }],
        prompts: [],
        results: [{
          attachments: [],
          attempt: 1,
          caseLinks: [{ id: "rec-case" }],
          experimentId: "EXP-STOPPED",
          runId: "CASE-1__EXP-STOPPED__P1__CFG-1__S1",
          status: "失败",
        }],
        samples: [{
          attachments: [{ file_token: "file", name: "white.png" }],
          caseId: "CASE-1",
          datasetVersion: "停止续跑集",
          recordId: "rec-case",
          sampleType: "有效白模",
          status: "部分失败",
        }],
      };
    },
  };
  const service = createBenchmarkWorkbenchService({ baseStore, localStore });

  const overview = await service.overview();
  const experiment = overview.experiments.find((entry) => entry.experimentId === "EXP-STOPPED");

  assert.equal(experiment.summary.imageRuns, 2);
  assert.equal(experiment.summary.processedImages, 1);
});

test("正式运行冻结配置失败时持久化阶段且不进入出图", async () => {
  const savedExperiments = [];
  const updates = [];
  let imageCalls = 0;
  const baseStore = {
    async createGenerationConfig() {
      throw new Error("冻结配置 CFG-FAILED 写入 Benchmark Base 失败：not_found");
    },
    async listComparisonImageFields() {
      return ["Banana 2", "GPT Image 2", "Seedream 5.0"];
    },
    async loadSnapshot() {
      return {
        comparisons: [],
        configs: [],
        prompts: [],
        results: [],
        samples: [{
          attachments: [{ file_token: "file", name: "white.png" }],
          caseId: "CASE-1",
          recordId: "rec-case",
          sampleType: "有效白模",
          status: "待生成",
        }],
      };
    },
  };
  const localStore = {
    async saveExperiment(experiment) {
      savedExperiments.push(experiment);
    },
  };
  const service = createBenchmarkWorkbenchService({ baseStore, localStore });
  const input = {
    caseIds: ["CASE-1"],
    confirm: true,
    draftConfig: {
      agentCode: "white-model-fusion",
      agentVersion: 7,
      fusionModelKey: "gemini3pro",
      imageModelKeys: ["banana2", "gptImage2", "seedream5"],
      outputFormat: "png",
      perBatchImages: 1,
      promptBatches: 1,
      quality: "medium",
      ratioMode: "source",
      resolution: "2K",
      styleCode: "cream-french@v4",
    },
    experimentId: "EXP-FAILED",
    groupId: "EXP-FAILED",
    maxCases: 1,
  };
  await assert.rejects(
    () => service.runExperiment(input, {
      client: {
        async generateImage() { imageCalls += 1; },
        async listModels() {
          return [
            { id: "gemini-3.1-pro-preview" },
            { id: "gemini-3.1-flash-image-preview" },
            { id: "gpt-image-2" },
            { id: "doubao-seedream-5.0" },
          ];
        },
      },
      update: (progress) => updates.push(progress),
    }),
    /Benchmark Base.*not_found/,
  );

  assert.equal(imageCalls, 0);
  assert.equal(updates.at(-1).phase, "config-write");
  assert.equal(updates.at(-1).persisted, false);
  assert.equal(savedExperiments.at(-1).status, "failed");
  assert.equal(savedExperiments.at(-1).phase, "config-write");
  assert.match(savedExperiments.at(-1).error, /not_found/);
});

test("概览从成功结果真源列出当前可直接评分的已完成实验", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "benchmark-reviewable-test-"));
  context.after(() => rm(directory, { force: true, recursive: true }));
  const localStore = createBenchmarkWorkbenchStore(join(directory, "state.json"));
  await localStore.saveExperiment({
    completedAt: "2026-08-04T08:33:55.769Z",
    experimentId: "EXP-DONE",
    status: "completed",
  });
  await localStore.saveReview({
    caseId: "CASE-1",
    confidence: 0.9,
    consistencyScore: 5,
    createdAt: "2026-08-04T08:53:28.560Z",
    experimentId: "EXP-DONE",
    issueTags: ["geometry_drift"],
    model: "模型 A",
    protocolVersion: BENCHMARK_REVIEW_PROTOCOL_VERSION,
    reason: "结构轻微偏移",
    renderQualityScore: 4,
    requestId: "private-request-id",
    reviewBatchId: "REVIEW-1",
    reviewId: "REVIEW-1__RUN-1",
    reviewable: true,
    runId: "RUN-1",
    scorerModelId: "gemini-3.1-pro-preview",
    styleMaterialScore: 3,
    weightedScore: 4.2,
  });
  await localStore.saveReview({
    caseId: "CASE-1",
    createdAt: "2026-08-04T08:54:28.560Z",
    experimentId: "EXP-DONE",
    imageQuality: 5,
    instructionFollowing: 5,
    reviewBatchId: "REVIEW-LEGACY",
    reviewId: "REVIEW-LEGACY__RUN-2",
    reviewable: true,
    runId: "RUN-2",
    specializedScore: 5,
  });
  const baseStore = {
    async loadSnapshot() {
      return {
        comparisons: [],
        configs: [],
        prompts: [],
        results: ["RUN-1", "RUN-2"].map((runId) => ({
          attachments: [{ file_token: runId, name: `${runId}.png` }],
          caseLinks: [{ id: "rec-case" }],
          experimentId: "EXP-DONE",
          model: "模型 A",
          runId,
          status: "成功",
        })),
        samples: [{
          attachments: [{ file_token: "file", name: "white.png" }],
          caseId: "CASE-1",
          datasetVersion: "评分集",
          recordId: "rec-case",
          sampleType: "有效白模",
          status: "完成",
        }],
      };
    },
  };
  const service = createBenchmarkWorkbenchService({ baseStore, localStore });

  const overview = await service.overview();

  assert.deepEqual(overview.reviewableExperiments, [{
    cases: [{ caseId: "CASE-1", legacyReviewedCount: 1, resultCount: 2, reviewedCount: 1 }],
    completedAt: "2026-08-04T08:33:55.769Z",
    experimentId: "EXP-DONE",
    legacyReviewedCount: 1,
    resultCount: 2,
    reviewedCount: 1,
    status: "completed",
  }]);
  const current = overview.reviewResults.find((review) => review.runId === "RUN-1");
  const legacy = overview.reviewResults.find((review) => review.runId === "RUN-2");
  assert.deepEqual({
    compatible: current.compatible,
    consistencyScore: current.consistencyScore,
    protocolVersion: current.protocolVersion,
    renderQualityScore: current.renderQualityScore,
    styleMaterialScore: current.styleMaterialScore,
    usable: current.usable,
    weightedScore: current.weightedScore,
  }, {
    compatible: true,
    consistencyScore: 5,
    protocolVersion: BENCHMARK_REVIEW_PROTOCOL_VERSION,
    renderQualityScore: 4,
    styleMaterialScore: 3,
    usable: true,
    weightedScore: 4.1,
  });
  assert.deepEqual({
    compatible: legacy.compatible,
    protocolVersion: legacy.protocolVersion,
    usable: legacy.usable,
  }, { compatible: false, protocolVersion: "legacy-unknown", usable: false });
});

test("AI 评分在当前样本集没有成功结果时前置阻止空批次", async () => {
  let savedBatch = false;
  const baseStore = {
    async loadSnapshot() {
      return {
        comparisons: [],
        configs: [],
        prompts: [],
        results: [],
        samples: [{ caseId: "CASE-1", recordId: "rec-case" }],
      };
    },
  };
  const localStore = {
    async saveReviewBatch() { savedBatch = true; },
  };
  const service = createBenchmarkWorkbenchService({ baseStore, localStore });

  await assert.rejects(() => service.runReview({
    caseIds: ["CASE-1"],
    confirm: true,
    experimentId: "EXP-DONE",
    groupId: "EXP-DONE",
    scorerModelKey: "gemini35flash",
  }, { client: {} }), /没有可评分的成功结果图/);
  assert.equal(savedBatch, false);
});

test("AI 评分传输失败时把评审批次更新为失败", async () => {
  const savedBatches = [];
  const baseStore = {
    async downloadResultImage() {
      return { dataUrl: "data:image/png;base64,cmVzdWx0" };
    },
    async downloadSampleImage() {
      return { dataUrl: "data:image/png;base64,c291cmNl" };
    },
    async loadSnapshot() {
      return {
        comparisons: [],
        configs: [],
        prompts: [],
        results: [{
          attachments: [{ file_token: "result", name: "result.png" }],
          caseLinks: [{ id: "rec-case" }],
          experimentId: "EXP-FAIL",
          model: "Banana 2",
          runId: "RUN-FAIL",
          status: "成功",
        }],
        samples: [{ caseId: "CASE-1", recordId: "rec-case" }],
      };
    },
  };
  const localStore = {
    async saveReviewBatch(batch) {
      savedBatches.push(batch);
    },
  };
  const service = createBenchmarkWorkbenchService({ baseStore, localStore });

  await assert.rejects(() => service.runReview({
    confirm: true,
    experimentId: "EXP-FAIL",
    groupId: "EXP-FAIL",
    reviewBatchId: "REVIEW-FAIL",
    scorerModelKey: "gemini35flash",
  }, {
    client: {
      async reviewImages() {
        throw new Error("评分图片超过上游限制");
      },
    },
  }), /评分图片超过上游限制/);

  assert.equal(savedBatches[0].status, "running");
  assert.deepEqual({
    completed: savedBatches[1].completed,
    error: savedBatches[1].error,
    status: savedBatches[1].status,
  }, {
    completed: 0,
    error: "评分图片超过上游限制",
    status: "failed",
  });
});

test("AI 评分同时保存本地事实并写回对应飞书 Run", async () => {
  const reviews = [];
  const writes = [];
  const baseStore = {
    async downloadResultImage() { return { dataUrl: "data:image/png;base64,cmVzdWx0" }; },
    async downloadSampleImage() { return { dataUrl: "data:image/png;base64,c291cmNl" }; },
    async loadSnapshot() {
      return {
        comparisons: [], configs: [], prompts: [],
        results: [{
          attachments: [{ file_token: "result", name: "result.png" }],
          caseLinks: [{ id: "rec-case" }],
          experimentId: "EXP-SCORE",
          model: "Banana 2",
          recordId: "rec-run",
          runId: "RUN-SCORE",
          status: "成功",
        }],
        samples: [{ caseId: "CASE-1", recordId: "rec-case" }],
      };
    },
    async saveRunReview(recordId, review) { writes.push({ recordId, review }); },
  };
  const localStore = {
    async saveReview(review) { reviews.push(review); },
    async saveReviewBatch() {},
  };
  const service = createBenchmarkWorkbenchService({ baseStore, localStore });
  const result = await service.runReview({
    confirm: true,
    experimentId: "EXP-SCORE",
    groupId: "EXP-SCORE",
    reviewBatchId: "REVIEW-SCORE",
    scorerModelKey: "gemini35flash",
  }, {
    client: {
      async reviewImages() {
        return {
          requestId: "req-score",
          text: JSON.stringify({
            consistency: { comment: "好", deduction_reason: "轻微偏差", evidence: "门框", score: 4 },
            input_eligibility: { category: "valid_white_model", reason: "", valid: true },
            issues: [],
            rendering_quality: { comment: "好", deduction_reason: "轻微瑕疵", evidence: "边缘", score: 4 },
            style_material: { comment: "好", deduction_reason: "轻微不足", evidence: "织物", score: 4 },
          }),
        };
      },
    },
  });

  assert.deepEqual(result, { completed: 1, reviewBatchId: "REVIEW-SCORE", total: 1 });
  assert.equal(reviews.length, 1);
  assert.equal(writes[0].recordId, "rec-run");
  assert.equal(writes[0].review.weightedScore, 4);
});

test("AI 评分断点继续按 Run ID 跳过已有正式评分", async () => {
  const calls = [];
  const savedBatches = [];
  const results = ["RUN-DONE", "RUN-PENDING"].map((runId, index) => ({
    attachments: [{ file_token: runId, name: `${runId}.png` }],
    caseLinks: [{ id: "rec-case" }],
    experimentId: "EXP-RESUME",
    model: "Banana 2",
    recordId: `rec-run-${index}`,
    runId,
    status: "成功",
  }));
  const baseStore = {
    async downloadResultImage() { return { dataUrl: "data:image/png;base64,cmVzdWx0" }; },
    async downloadSampleImage() { return { dataUrl: "data:image/png;base64,c291cmNl" }; },
    async loadSnapshot() {
      return { comparisons: [], configs: [], prompts: [], results, samples: [{ caseId: "CASE-1", recordId: "rec-case" }] };
    },
    async saveRunReview() {},
  };
  const localStore = {
    async read() {
      return { reviews: [{ experimentId: "EXP-RESUME", protocolVersion: BENCHMARK_REVIEW_PROTOCOL_VERSION, runId: "RUN-DONE" }] };
    },
    async saveReview() {},
    async saveReviewBatch(batch) { savedBatches.push(batch); },
  };
  const service = createBenchmarkWorkbenchService({ baseStore, localStore });
  const result = await service.runReview({
    confirm: true,
    experimentId: "EXP-RESUME",
    groupId: "EXP-RESUME",
    resume: true,
    reviewBatchId: "REVIEW-RESUME",
    scorerModelKey: "gpt",
  }, { client: { async reviewImages() {
    calls.push(true);
    return { requestId: "req-resume", text: JSON.stringify({
      consistency: { comment: "好", deduction_reason: "轻微偏差", evidence: "门框", score: 4 },
      input_eligibility: { category: "valid_white_model", reason: "", valid: true },
      issues: [],
      rendering_quality: { comment: "好", deduction_reason: "轻微瑕疵", evidence: "边缘", score: 4 },
      style_material: { comment: "好", deduction_reason: "轻微不足", evidence: "织物", score: 4 },
    }) };
  } } });

  assert.equal(calls.length, 1);
  assert.deepEqual(result, { completed: 2, reviewBatchId: "REVIEW-RESUME", total: 2 });
  assert.equal(savedBatches[0].resumedFrom, 1);
  assert.equal(savedBatches[0].total, 2);
});

test("现有数据集迁移为样本集并由系统生成 Case ID", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "benchmark-workbench-test-"));
  context.after(() => rm(directory, { force: true, recursive: true }));
  const snapshot = {
    comparisons: [],
    configs: [],
    prompts: [],
    results: [{
      attachments: [{ file_token: "result", name: "result.png" }],
      caseLinks: [{ id: "rec-legacy" }],
      experimentId: "EXP-LEGACY",
      model: "模型 A",
      runId: "RUN-LEGACY",
      status: "成功",
    }],
    samples: [{
      attachments: [{ file_token: "file", name: "white.png" }],
      caseId: "LEGACY-001",
      datasetVersion: "WM-MVP-v2",
      recordId: "rec-legacy",
      sampleType: "有效白模",
      status: "完成",
    }],
  };
  let createdSample;
  const baseStore = {
    async createSample(input) {
      createdSample = input;
      return "rec-new";
    },
    async loadSnapshot() {
      return snapshot;
    },
    async updateSampleDataset(recordIds, name) {
      for (const sample of snapshot.samples) {
        if (recordIds.includes(sample.recordId)) sample.datasetVersion = name;
      }
    },
  };
  const localStore = createBenchmarkWorkbenchStore(join(directory, "state.json"));
  const service = createBenchmarkWorkbenchService({ baseStore, localStore });

  const overview = await service.overview();
  assert.equal(overview.datasets.length, 1);
  assert.equal(overview.datasets[0].name, "WM-MVP-v2");
  assert.equal(overview.datasets[0].caseCount, 1);
  assert.equal(overview.datasetAnalyses[overview.datasets[0].datasetId].summary.total, 1);
  assert.equal(
    overview.datasetExperimentAnalyses[overview.datasets[0].datasetId]["EXP-LEGACY"].summary.total,
    1,
  );

  const renamed = await service.renameDataset({
    datasetId: overview.datasets[0].datasetId,
    name: "白模回归集 v3",
  });
  assert.equal(renamed.name, "白模回归集 v3");
  assert.equal(snapshot.samples[0].datasetVersion, "白模回归集 v3");

  const created = await service.createDataset({ name: "厨房专项集" });
  const overviewAfterCreate = await service.overview();
  assert.equal(overviewAfterCreate.datasetAnalyses[created.datasetId].summary.total, 0);
  const imageBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zp6sAAAAASUVORK5CYII=";
  const sample = await service.createCase({
    category: "厨房",
    datasetId: created.datasetId,
    image: {
      dataUrl: `data:image/png;base64,${imageBase64}`,
      name: "white.png",
      size: Buffer.from(imageBase64, "base64").length,
      type: "image/png",
    },
  });
  assert.match(sample.caseId, /^CASE-[A-F0-9]{12}$/);
  assert.equal(createdSample.datasetVersion, "厨房专项集");
  assert.equal(createdSample.sampleType, "有效白模");
  assert.equal(createdSample.spatialComplexity, "中");

  const archived = await service.archiveDataset({ confirm: true, datasetId: created.datasetId });
  assert.ok(archived.archivedAt);
});

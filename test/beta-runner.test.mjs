/**
 * [INPUT]: 依赖 node:test/assert、Beta跑图任务服务与内存 Base/生成替身
 * [OUTPUT]: 对外提供超分旧版本零入队阻断、精模模板/双Prompt版本摘要冻结与漂移阻断、异构光影配置串行准备/重复去重及失败零入队、十功能样本准入、Agent权限门禁、409不重试、两路并发单图隔离/保序归档、生成/同步双阶段与仅同步重试、终态前忙碌守卫回归保障
 * [POS]: test 的 Beta跑图应用服务内存集成测试，不调用真实模型或飞书
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";
import { publicModelCatalog } from "../src/model-config.mjs";

import {
  BETA_FEATURE_MODES,
  BETA_MAX_ATTEMPTS,
  assertBetaPromptAgentAccess,
  createBetaApiHandler,
  createBetaRunnerService,
  isRetryableBetaError,
} from "../src/beta-runner.mjs";

const TEST_TIME = "2026-09-02 14:03:21";

test("Beta超分显式旧工作流版本在读样本、建档和GPU执行之前阻断", async () => {
  const calls = [];
  const service = createBetaRunnerService({
    baseStore: { async getSampleSet() { calls.push("sample"); }, async beginRun() { calls.push("archive"); } },
    generationService: { async executeForMode() { calls.push("gpu"); } },
    async getUpscaleConfig() { calls.push("capability"); return { comfyUi: { available: true } }; },
  });
  await assert.rejects(async () => service.start({ batchId: "BETA-upscale-old-version", featureMode: "imageUpscale",
    jobId: "beta-upscale-old-version", sampleSetId: "SET-upscale", testTime: TEST_TIME,
    items: [{ caseId: "CASE-1", sampleId: "SAMPLE-1", runId: "RUN-upscale-old-version",
      input: { upscaleWorkflowKey: "ks_seedvr2_2x_direct", upscaleWorkflowVersion: "2026-10-21.1", resolution: "6K" } }],
  }), (error) => error.statusCode === 409 && error.retryable === false);
  assert.deepEqual(calls, []);
  assert.equal(service.hasActiveJobs(), false);
});

function nextTurn() {
  return new Promise((resolve) => setImmediate(resolve));
}

function waitForJob(service, jobId) {
  return new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      const job = service.getJob(jobId);
      if (!job || job.status === "running") return;
      clearInterval(timer);
      if (job.status === "failed") reject(new Error(job.error));
      else resolve(job);
    }, 5);
  });
}

test("Beta 批次入队及飞书同步期间保持忙碌，成功或失败终态后释放守卫", async () => {
  const generated = Promise.withResolvers();
  const synced = Promise.withResolvers();
  const failed = Promise.withResolvers();
  const service = createBetaRunnerService({
    baseStore: {
      async beginRun({ item }) { return { recordId: item.runId }; },
      completeRun() { return synced.promise; },
      async failRun() {},
    },
    generationService: {
      executeForMode(_mode, input) {
        return input.prompt === "失败样本" ? failed.promise : generated.promise;
      },
    },
    maxAttempts: 1,
  });
  const batch = {
    batchId: "BETA-busyguard01",
    featureMode: "free",
    items: [{ caseId: "CASE-1", input: { prompt: "成功样本" }, runId: "RUN-busyguard01" }],
    jobId: "beta-busyguard-success",
    testTime: TEST_TIME,
  };
  assert.equal(service.hasActiveJobs(), false);
  assert.equal(service.start(batch).status, "running");
  assert.equal(service.hasActiveJobs(), true);
  await nextTurn();
  generated.resolve({ images: [] });
  await nextTurn();
  assert.deepEqual(service.getJob(batch.jobId).stages, { generated: 1, synced: 0 });
  assert.equal(service.hasActiveJobs(), true);
  synced.resolve({ recordId: "rec-success" });
  await nextTurn();
  assert.equal(service.getJob(batch.jobId).status, "success");
  assert.equal(service.hasActiveJobs(), false);

  const failedJobId = "beta-busyguard-failure";
  service.start({ ...batch, jobId: failedJobId,
    items: [{ caseId: "CASE-2", input: { prompt: "失败样本" }, runId: "RUN-busyguard02" }] });
  assert.equal(service.hasActiveJobs(), true);
  await nextTurn();
  failed.reject(new Error("生成失败"));
  await nextTurn();
  assert.equal(service.getJob(failedJobId).status, "failed");
  assert.equal(service.hasActiveJobs(), false);
});

test("Beta跑图公开十个场景且不发布结果数量上限", () => {
  assert.deepEqual(BETA_FEATURE_MODES, [
    "whiteModel",
    "emptyRoom",
    "styleTransfer",
    "refinedModel",
    "effectEnhancement",
    "effectBeautification",
    "panoramaEnhancement",
    "free",
    "imageOutpaint",
    "imageUpscale",
  ]);
  assert.equal(BETA_MAX_ATTEMPTS, 3);
});

test("Beta精模整批共用入队冻结的模板与版本摘要，执行不重新选择当前版本", async () => {
  const prepared = [];
  const generated = [];
  const archived = [];
  const service = createBetaRunnerService({
    baseStore: {
      async beginRun({ item }) { archived.push(structuredClone(item.input)); return { recordId: item.runId }; },
      async completeRun(recordId) { return { recordId }; },
      async failRun() {},
    },
    generationService: { async executeForMode(mode, input) { generated.push({ mode, input }); return { images: [] }; } },
    async prepareRefinedInput(input) {
      prepared.push(input);
      return { ...input, refinedRender: { preset: "sunset", time: "dusk", weather: "clear", tone: "warm" },
        promptVersion: 7, refinedPromptSha256: "a".repeat(64),
        refinedAtmospherePromptVersion: 3, refinedAtmospherePromptSha256: "b".repeat(64) };
    },
  });
  const batch = { batchId: "BETA-refinedfreeze01", featureMode: "refinedModel", jobId: "beta-refined-freeze01", testTime: TEST_TIME,
    items: [1, 2, 3].map((index) => ({ caseId: `CASE-${index}`, runId: `RUN-refinedfreeze-${index}`,
      input: { modelKey: "seedream50", prompt: `样本${index}`, refinedRender: { preset: "sunset" }, promptVersion: 7 } })) };
  await service.start(batch);
  await waitForJob(service, batch.jobId);
  assert.equal(prepared.length, 1);
  assert.equal(generated.length, 3);
  for (const [index, result] of generated.entries()) {
    assert.equal(result.mode, "refinedModel");
    assert.equal(result.input.prompt, `样本${index + 1}`);
    assert.equal(result.input.refinedAtmospherePromptVersion, 3);
    assert.equal(result.input.refinedAtmospherePromptSha256, "b".repeat(64));
    assert.equal(result.input.refinedPromptSha256, "a".repeat(64));
    assert.deepEqual(result.input.refinedRender, archived[index].refinedRender);
  }
  assert.equal("refinedPromptSha256" in batch.items[0].input, false);
});

test("Beta精模异构光影配置串行准备、重复键去重，准备失败仍零入队", async () => {
  const selections = [];
  for (const modelKey of ["gptImage25Sunburst", "seedream5Pro", "banana2", "aiTextureEnhancement"]) {
    for (const presetId of ["sun-window", "warm-night", "film"]) {
      for (const execution of ["prompt-only", "prompt-and-reference"]) {
        selections.push({ modelKey, refinedLighting: { mode: "preset", presetId, execution } });
      }
    }
  }
  for (const rejectPreparation of [false, true]) {
    const prepared = [];
    let activePreparations = 0;
    let maxPreparations = 0;
    let generated = 0;
    let archived = 0;
    let activeGenerations = 0;
    let maxGenerations = 0;
    const service = createBetaRunnerService({
      baseStore: {
        async beginRun({ item }) { archived += 1; return { recordId: item.runId }; },
        async completeRun(recordId) { return { recordId }; },
        async failRun() {},
      },
      async prepareRefinedLighting(input) {
        activePreparations += 1;
        maxPreparations = Math.max(maxPreparations, activePreparations);
        prepared.push(JSON.stringify([input.modelKey, input.refinedLighting]));
        await nextTurn();
        return input;
      },
      async prepareRefinedInput(input) {
        await nextTurn();
        activePreparations -= 1;
        if (rejectPreparation && prepared.length === 3) {
          throw Object.assign(new Error("飞书资产读取限流"), { statusCode: 429 });
        }
        return { ...input, promptCode: "refined-lighting-base", promptVersion: 2,
          refinedPromptSha256: "a".repeat(64) };
      },
      generationService: {
        async executeForMode() {
          assert.equal(activePreparations, 0);
          assert.equal(prepared.length, selections.length);
          activeGenerations += 1;
          maxGenerations = Math.max(maxGenerations, activeGenerations);
          await nextTurn();
          activeGenerations -= 1;
          generated += 1;
          return { images: [] };
        },
      },
    });
    const suffix = rejectPreparation ? "blocked" : "success";
    const batch = { batchId: `BETA-refined-serial-${suffix}`, featureMode: "refinedModel",
      jobId: `beta-refined-serial-${suffix}`, testTime: TEST_TIME,
      items: [...selections, ...selections].map((input, index) => ({ caseId: `CASE-${index}`,
        runId: `RUN-refined-serial-${suffix}-${index}`, input: structuredClone(input) })) };
    if (rejectPreparation) {
      await assert.rejects(service.start(batch), error => error.statusCode === 429);
      assert.equal(prepared.length, 3);
      assert.equal(generated, 0);
      assert.equal(archived, 0);
      assert.equal(service.getJob(batch.jobId), null);
      assert.equal(service.hasActiveJobs(), false);
    } else {
      await service.start(batch);
      const job = await waitForJob(service, batch.jobId);
      assert.equal(job.completed, batch.items.length);
      assert.equal(generated, batch.items.length);
      assert.equal(archived, batch.items.length);
      assert.equal(prepared.length, selections.length);
      assert.equal(new Set(prepared).size, selections.length);
      assert.equal(maxGenerations, 2);
    }
    assert.equal(maxPreparations, 1);
    assert.equal(activePreparations, 0);
  }
});

test("Beta精模非法模板或已下架Prompt在建档和出图前阻断", async () => {
  let executed = 0;
  const service = createBetaRunnerService({
    baseStore: { async beginRun() { executed += 1; }, async completeRun() {} },
    generationService: { async executeForMode() { executed += 1; } },
    async prepareRefinedInput() { throw Object.assign(new Error("所选氛围Prompt已下架"), { statusCode: 409 }); },
  });
  await assert.rejects(service.start({ batchId: "BETA-refinedblocked", featureMode: "refinedModel",
    jobId: "beta-refined-blocked01", testTime: TEST_TIME,
    items: [{ caseId: "CASE-1", runId: "RUN-refinedblocked01", input: { refinedRender: { preset: "sunset" } } }],
  }), (error) => error.statusCode === 409);
  assert.equal(executed, 0);
});

test("ComfyUI 产物下载 404 作为瞬时故障重试，显式永久错误仍立即停止", () => {
  const pendingOutput = Object.assign(new Error("读取 ComfyUI 输出失败（404）"), {
    code: "output_download",
    statusCode: 404,
  });
  const missingRoute = Object.assign(new Error("接口不存在"), { statusCode: 404 });
  const permanentOutput = Object.assign(new Error("输出永久不可用"), {
    code: "output_download",
    retryable: false,
    statusCode: 404,
  });

  assert.equal(isRetryableBetaError(pendingOutput), true);
  assert.equal(isRetryableBetaError(missingRoute), false);
  assert.equal(isRetryableBetaError(permanentOutput), false);
  assert.equal(isRetryableBetaError(Object.assign(new Error("模型未开放"), { statusCode: 409 })), false);
});

test("Beta 白模批次在入队前拒绝当前 Key 未开放的提示词模型", async () => {
  const body = {
    featureMode: "whiteModel",
    items: [{ input: { promptAgentModelKey: "deepseekFlash" } }],
  };
  const agentModels = [
    { key: "deepseekFlash", label: "DeepSeek V4.1 Flash", selectable: false },
    { key: "gemini3pro", label: "Gemini 3.1 Pro", selectable: true },
  ];
  assert.throws(() => assertBetaPromptAgentAccess(body, agentModels),
    /DeepSeek V4.1 Flash 当前未向这个 API Key 开放/);
  let enqueued = false;
  const handler = createBetaApiHandler({
    getAgentModels: async () => agentModels,
    readJson: async () => body,
    sendJson: () => {},
    service: { start: () => { enqueued = true; } },
  });
  await assert.rejects(handler({ method: "POST" }, {}, "/api/beta/jobs"), /当前未向这个 API Key 开放/);
  assert.equal(enqueued, false);
  assert.doesNotThrow(() => assertBetaPromptAgentAccess({
    ...body,
    items: [{ input: { promptAgentModelKey: "gemini3pro" } }],
  }, agentModels));
});

test("Beta 样本集按功能保存且样本数量不设上限", async () => {
  const created = [];
  const service = createBetaRunnerService({
    baseStore: {
      config: { baseUrl: "https://example.test/base/new", tableId: "tbl-new" },
      async createSampleSet(input) {
        created.push(input);
        return { ...input, sampleSetId: "SET-1" };
      },
    },
    generationService: {},
  });
  const sampleSet = await service.createSampleSet({
    featureMode: "free",
    name: "自由生图回归",
    samples: [{ prompt: "现代客厅" }, { prompt: "极简卧室" }],
  });
  assert.equal(sampleSet.sampleSetId, "SET-1");
  assert.equal(created[0].samples.length, 2);
  const largeSampleSet = await service.createSampleSet({
    featureMode: "free",
    name: "大样本集",
    samples: Array.from({ length: 25 }, (_, index) => ({ prompt: `样本 ${index + 1}` })),
  });
  assert.equal(largeSampleSet.samples.length, 25);
  assert.equal("maxRuns" in await service.config(), false);
  assert.throws(() => service.createSampleSet({
    featureMode: "whiteModel",
    name: "缺图",
    samples: [{ prompt: "无图" }],
  }), /缺少有效图片/);
});

test("全目录超过四模型且超过 20 个 Run 仍两路并发单图执行并保序归档", async () => {
  const models = publicModelCatalog();
  assert.ok(models.length > 4);
  const executedModels = new Set();
  const archived = [];
  let active = 0;
  let maxActive = 0;
  const service = createBetaRunnerService({
    baseStore: {
      config: { baseUrl: "https://example.test/base/new", tableId: "tbl-new" },
      async beginRun({ item }) {
        return { recordId: item.runId };
      },
      async completeRun(recordId) {
        archived.push(recordId);
        return { recordId };
      },
      async failRun() {},
    },
    generationService: {
      async executeForMode(_featureMode, input) {
        assert.equal("batchCount" in input, false);
        assert.equal("batchId" in input, false);
        assert.equal("batchIndex" in input, false);
        executedModels.add(input.modelKey);
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 1));
        active -= 1;
        return { images: [{ url: "data:image/png;base64,iVBORw0KGgo=" }] };
      },
    },
  });
  const items = Array.from({ length: 24 }, (_, index) => ({
    caseId: `CASE-${index + 1}`,
    input: {
      batchCount: 24,
      batchId: "legacy-batch-metadata",
      batchIndex: index + 1,
      modelKey: models[index % models.length].key,
      prompt: `样本 ${index + 1}`,
    },
    modelLabel: models[index % models.length].label,
    runId: `RUN-unlimited-${String(index + 1).padStart(2, "0")}`,
  }));
  const jobId = "beta-unlimited123";
  service.start({
    batchId: "BETA-unlimited1",
    featureMode: "free",
    items,
    jobId,
    testTime: TEST_TIME,
  });
  const job = await waitForJob(service, jobId);
  assert.equal(job.status, "success");
  assert.equal(job.completed, 24);
  assert.deepEqual(job.stages, { generated: 24, synced: 24 });
  assert.equal(maxActive, 2);
  assert.deepEqual([...executedModels], models.map((model) => model.key));
  assert.equal(archived.length, items.length);
  assert.deepEqual(job.result.results.map((item) => item.runId), items.map((item) => item.runId));
  assert.deepEqual(job.result.results.map((item) => item.modelLabel), items.map((item) => item.modelLabel));
});

test("单项失败会新建 Attempt 自动重跑，整批只在全部同步后成功", async () => {
  const events = [];
  const attempts = [];
  let active = 0;
  let maxActive = 0;
  let failedOnce = false;
  const baseStore = {
    config: { baseUrl: "https://example.test/base/new", tableId: "tbl-new" },
    async beginRun({ item, testTime }) {
      events.push(`begin:${item.runId}`);
      attempts.push(item.attempt);
      assert.equal(testTime, TEST_TIME);
      return { recordId: `rec-${item.runId}` };
    },
    async completeRun(recordId) {
      events.push(`complete:${recordId}`);
      return {
        previewUrl: "data:image/webp;base64,UklGRg==",
        recordId,
        recordUrl: `https://example.test/${recordId}`,
      };
    },
    async failRun(recordId) {
      events.push(`fail:${recordId}`);
    },
  };
  const generationService = {
    async executeForMode(_featureMode, input) {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active -= 1;
      if (input.prompt === "重试" && !failedOnce) {
        failedOnce = true;
        throw new Error("模型失败");
      }
      return { images: [{ url: "data:image/png;base64,iVBORw0KGgo=" }] };
    },
  };
  const service = createBetaRunnerService({
    baseStore,
    generationService,
    sleep: async () => {},
  });
  const jobId = "beta-123456789abc";
  service.start({
    batchId: "BETA-12345678",
    featureMode: "free",
    jobId,
    items: [
      { caseId: "CASE-A", input: { prompt: "成功" }, runId: "RUN-12345678-A" },
      { caseId: "CASE-B", input: { prompt: "重试" }, runId: "RUN-12345678-B" },
    ],
    testTime: TEST_TIME,
  });
  const job = await waitForJob(service, jobId);

  assert.equal(job.status, "success");
  assert.equal(job.completed, 2);
  assert.deepEqual(job.stages, { generated: 2, synced: 2 });
  assert.deepEqual(job.result.outcomes.map((outcome) => outcome.status), ["fulfilled", "fulfilled"]);
  assert.equal(job.result.outcomes[1].value.attempt, 2);
  assert.equal("result" in job.result.outcomes[0].value, false);
  assert.deepEqual(job.result.results.map((result) => result.caseId), ["CASE-A", "CASE-B"]);
  assert.ok(job.result.results.every((result) => result.previewUrl.startsWith("data:image/webp")));
  assert.ok(maxActive <= 2);
  assert.equal(events.length, 6);
  assert.deepEqual(attempts.sort(), [1, 1, 2]);
  assert.deepEqual(new Set(events), new Set([
    "begin:RUN-12345678-A",
    "begin:RUN-12345678-B",
    "begin:RUN-12345678-B-A2",
    "complete:rec-RUN-12345678-A",
    "fail:rec-RUN-12345678-B",
    "complete:rec-RUN-12345678-B-A2",
  ]));
});

test("飞书归档失败只重试同步，耗尽后整批不能假完成", async () => {
  let generationCount = 0;
  const runIds = [];
  const service = createBetaRunnerService({
    baseStore: {
      config: { baseUrl: "https://example.test/base/new", tableId: "tbl-new" },
      async beginRun({ item }) {
        runIds.push(item.runId);
        return { recordId: item.runId };
      },
      async completeRun() {
        throw new Error("飞书结果附件校验失败");
      },
      async failRun() {},
    },
    generationService: {
      async executeForMode() {
        generationCount += 1;
        return { images: [{ url: "data:image/png;base64,iVBORw0KGgo=" }] };
      },
    },
    sleep: async () => {},
  });
  const jobId = "beta-retry1234567";
  service.start({
    batchId: "BETA-retry123",
    featureMode: "free",
    items: [{ caseId: "CASE-A", input: { prompt: "客厅" }, runId: "RUN-retry123-A" }],
    jobId,
    testTime: TEST_TIME,
  });

  await assert.rejects(waitForJob(service, jobId), /仍未同步飞书/);
  assert.equal(generationCount, 1);
  assert.deepEqual(runIds, ["RUN-retry123-A"]);
  assert.equal(service.getJob(jobId).status, "failed");
  assert.equal(service.getJob(jobId).completed, 0);
  assert.deepEqual(service.getJob(jobId).stages, { generated: 1, synced: 0 });
});

test("参数错误立即失败并公开原始原因，不做无意义重试", async () => {
  let attempts = 0;
  const service = createBetaRunnerService({
    baseStore: {
      config: { baseUrl: "https://example.test/base/new", tableId: "tbl-new" },
      async beginRun({ item }) { return { recordId: item.runId }; },
      async completeRun(recordId) { return { recordId }; },
      async failRun() {},
    },
    generationService: {
      async executeForMode() {
        attempts += 1;
        const error = new Error("一次最多生成 4 张图");
        error.statusCode = 400;
        throw error;
      },
    },
    sleep: async () => {},
  });
  const jobId = "beta-validation123";
  service.start({
    batchId: "BETA-validation1",
    featureMode: "free",
    items: [{ caseId: "CASE-A", input: { prompt: "客厅" }, runId: "RUN-validation1-A" }],
    jobId,
    testTime: TEST_TIME,
  });

  await assert.rejects(waitForJob(service, jobId), /一次最多生成 4 张图.*不可重试错误，已停止/);
  assert.equal(attempts, 1);
  assert.match(service.getJob(jobId).error, /一次最多生成 4 张图/);
});

test("生成完成后、飞书归档完成前可分别观察两段进度", async () => {
  let releaseSync;
  const syncGate = new Promise((resolve) => { releaseSync = resolve; });
  const service = createBetaRunnerService({
    baseStore: {
      config: { baseUrl: "https://example.test/base/new", tableId: "tbl-new" },
      async beginRun({ item }) { return { recordId: item.runId }; },
      async completeRun(recordId) {
        await syncGate;
        return { recordId };
      },
      async failRun() {},
    },
    generationService: {
      async executeForMode() {
        return { images: [{ url: "data:image/png;base64,iVBORw0KGgo=" }] };
      },
    },
  });
  const jobId = "beta-stages123456";
  service.start({
    batchId: "BETA-stages1234",
    featureMode: "free",
    items: [{ caseId: "CASE-A", input: { prompt: "客厅" }, runId: "RUN-stages1234-A" }],
    jobId,
    testTime: TEST_TIME,
  });
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.deepEqual(service.getJob(jobId).stages, { generated: 1, synced: 0 });
  releaseSync();
  const job = await waitForJob(service, jobId);
  assert.deepEqual(job.stages, { generated: 1, synced: 1 });
  assert.equal(job.result.results.length, 1);
});

test("无效功能与重复 Run 在入队前阻断", () => {
  const service = createBetaRunnerService({
    baseStore: { config: { baseUrl: "x", tableId: "y" } },
    generationService: {},
  });
  const base = {
    batchId: "BETA-12345678",
    featureMode: "free",
    jobId: "beta-123456789abc",
    testTime: TEST_TIME,
  };
  assert.throws(() => service.start({
    ...base,
    featureMode: "styleDnaReverse",
    items: [{ caseId: "A", input: {}, runId: "RUN-12345678-A" }],
  }), /不受支持/);
  assert.throws(() => service.start({
    ...base,
    items: [
      { caseId: "A", input: {}, runId: "RUN-12345678-A" },
      { caseId: "B", input: {}, runId: "RUN-12345678-A" },
    ],
  }), /重复/);
  assert.throws(() => service.start({
    ...base,
    items: [{ caseId: "A", input: {}, runId: "RUN-12345678-A" }],
    testTime: "不是时间",
  }), /测试时间无效/);
});

test("批量图片资产只传一次并在执行前恢复到每个 Run", async () => {
  const seen = [];
  const service = createBetaRunnerService({
    baseStore: {
      config: { baseUrl: "https://example.test/base/new", tableId: "tbl-new" },
      async beginRun({ item }) {
        seen.push(item.input.referenceImages?.[0]?.name);
        return { recordId: item.runId };
      },
      async completeRun(recordId) {
        return { recordId };
      },
      async failRun() {},
    },
    generationService: {
      async executeForMode(_featureMode, input) {
        seen.push(input.referenceImages?.[0]?.name);
        return { images: [{ url: "data:image/png;base64,iVBORw0KGgo=" }] };
      },
    },
  });
  const jobId = "beta-assets123456";
  service.start({
    assets: { "source-CASE-A": [{ dataUrl: "data:image/png;base64,iVBORw0KGgo=", name: "a.png" }] },
    batchId: "BETA-assets1234",
    featureMode: "whiteModel",
    items: [
      {
        caseId: "CASE-A",
        input: { modelKey: "model-a" },
        referenceAssetKey: "source-CASE-A",
        runId: "RUN-assets1234-A",
      },
    ],
    jobId,
    testTime: TEST_TIME,
  });
  await waitForJob(service, jobId);
  assert.deepEqual(seen, ["a.png", "a.png"]);
});


test("空房混合房型逐图保存，缺失或非法详情在建档前拒绝", async () => {
  const service = createBetaRunnerService({
    baseStore: { config: {}, createSampleSet: async (input) => input }, generationService: {},
  });
  const image = { dataUrl: "data:image/png;base64,YQ==", type: "image/png" };
  const body = { featureMode: "emptyRoom", name: "混合空间", samples: [
    { image, roomType: "客厅" }, { image, roomType: "卧室" },
    { image, roomType: "其他", roomTypeDetail: "  衣帽间  " },
  ] };
  const result = await service.createSampleSet(body);
  assert.deepEqual(result.samples.map(({ roomType, roomTypeDetail }) => [roomType, roomTypeDetail]),
    [["客厅", ""], ["卧室", ""], ["其他", "衣帽间"]]);
  for (const sample of [{ image }, { image, roomType: "未知" },
    { image, roomType: "其他" }, { image, roomType: "其他", roomTypeDetail: "长".repeat(41) }]) {
    assert.throws(() => service.createSampleSet({ ...body, samples: [sample] }), /第 1 个样本需要有效房间类型/);
  }
});

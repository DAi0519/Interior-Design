/**
 * [INPUT]: 依赖 node:test/assert、Beta跑图任务服务与内存 Base/生成替身
 * [OUTPUT]: 对外提供五功能样本集准入、Prompt Agent 当前 Key 权限入队前阻断、409 配置错误不重试、测试时间归一化、不设结果数量上限的两路并发、单 Run 单图隔离、生成/飞书同步双阶段快照、附件回读后轻量结果公开、瞬时错误自动重跑/参数错误快速失败、飞书全量归档门槛与任务恢复保障
 * [POS]: test 的 Beta跑图应用服务内存集成测试，不调用真实模型或飞书
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  BETA_FEATURE_MODES,
  BETA_MAX_ATTEMPTS,
  assertBetaPromptAgentAccess,
  createBetaApiHandler,
  createBetaRunnerService,
  isRetryableBetaError,
} from "../src/beta-runner.mjs";

const TEST_TIME = "2026-09-02 14:03:21";

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

test("Beta跑图公开五个场景且不发布结果数量上限", () => {
  assert.deepEqual(BETA_FEATURE_MODES, [
    "whiteModel",
    "emptyRoom",
    "refinedModel",
    "effectEnhancement",
    "free",
  ]);
  assert.equal(BETA_MAX_ATTEMPTS, 3);
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
  assert.equal("maxRuns" in service.config(), false);
  assert.throws(() => service.createSampleSet({
    featureMode: "whiteModel",
    name: "缺图",
    samples: [{ prompt: "无图" }],
  }), /缺少有效图片/);
});

test("超过 20 个 Run 仍以两路并发排队执行", async () => {
  let active = 0;
  let maxActive = 0;
  const service = createBetaRunnerService({
    baseStore: {
      config: { baseUrl: "https://example.test/base/new", tableId: "tbl-new" },
      async beginRun({ item }) {
        return { recordId: item.runId };
      },
      async completeRun(recordId) {
        return { recordId };
      },
      async failRun() {},
    },
    generationService: {
      async executeForMode(_featureMode, input) {
        assert.equal("batchCount" in input, false);
        assert.equal("batchId" in input, false);
        assert.equal("batchIndex" in input, false);
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
      prompt: `样本 ${index + 1}`,
    },
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
  assert.ok(maxActive <= 2);
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

test("飞书归档失败同样触发重跑，耗尽后整批不能假完成", async () => {
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
  assert.equal(generationCount, BETA_MAX_ATTEMPTS);
  assert.deepEqual(runIds, ["RUN-retry123-A", "RUN-retry123-A-A2", "RUN-retry123-A-A3"]);
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

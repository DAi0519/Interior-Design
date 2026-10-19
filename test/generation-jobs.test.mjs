/**
 * [INPUT]: 依赖 node:test/assert、generation-job-api.mjs 的模型/飞书同步合同准入、generation-service.mjs 的真实归档投影与 generation-jobs.mjs 的可注入异步任务、进度及并发批处理
 * [OUTPUT]: 对外提供全目录超过四模型入队/两路并发/保序/完整批次归档，单模型1–4张及多模型单张保护、付费前飞书合同阻断、日常任务终态忙碌检查、查询恢复、领域阶段快照透传与部分失败回归保障
 * [POS]: test 的可恢复生成任务测试，不调用真实生图服务
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  createGenerationJobRegistry,
  runGenerationJobBatch,
} from "../src/generation-jobs.mjs";
import { createGenerationJobApiHandler } from "../src/generation-job-api.mjs";
import { createGenerationService } from "../src/generation-service.mjs";
import { publicModelCatalog } from "../src/model-config.mjs";

async function nextTurn() {
  await new Promise((resolve) => setImmediate(resolve));
}

test("生成任务入队即忙碌，成功或失败完成后释放更新守卫", async () => {
  const registry = createGenerationJobRegistry();
  const success = Promise.withResolvers();
  const failure = Promise.withResolvers();
  assert.equal(registry.hasActiveJobs(), false);

  registry.enqueue("generation-success", { featureMode: "free", total: 1 }, () => success.promise);
  assert.equal(registry.hasActiveJobs(), true);
  await nextTurn();
  assert.equal(registry.hasActiveJobs(), true);
  success.resolve({ images: [] });
  await nextTurn();
  assert.equal(registry.get("generation-success").status, "success");
  assert.equal(registry.hasActiveJobs(), false);

  registry.enqueue("generation-failure", { featureMode: "free", total: 1 }, () => failure.promise);
  assert.equal(registry.hasActiveJobs(), true);
  await nextTurn();
  failure.reject(new Error("生成失败"));
  await nextTurn();
  assert.equal(registry.get("generation-failure").status, "failed");
  assert.equal(registry.hasActiveJobs(), false);
});

test("飞书同步合同未通过时不创建付费生成任务", async () => {
  let enqueued = false;
  let response = null;
  const handler = createGenerationJobApiHandler({
    generationJobs: {
      enqueue() {
        enqueued = true;
      },
    },
    generationService: {},
    readJson: async () => ({
      featureMode: "free",
      items: [{ input: { modelKey: "seedream5Pro" }, key: "seedream5Pro" }],
      jobId: "generation-123456789012",
    }),
    sendJson(_rawResponse, statusCode, body) {
      response = { body, statusCode };
    },
    verifySyncContract: async () => {
      throw new Error("“生图模型”字段缺少选项：Seedream 5.0 Pro");
    },
  });

  assert.equal(
    await handler({ method: "POST" }, {}, "/api/generation-jobs"),
    true,
  );
  assert.equal(enqueued, false);
  assert.equal(response.statusCode, 409);
  assert.match(response.body.error, /已阻止生成.*Seedream 5\.0 Pro/);
});

test("生成任务入队后可查询进度与完整结果", async () => {
  const registry = createGenerationJobRegistry();
  const queued = registry.enqueue(
    "generation-123456789012",
    { featureMode: "whiteModel", stages: { generated: 0 }, total: 1 },
    async (update) => {
      update({ completed: 1, stages: { generated: 1 } });
      return { outcomes: [{ status: "fulfilled" }] };
    },
  );
  assert.equal(queued.status, "running");
  assert.equal(queued.featureMode, "whiteModel");
  await nextTurn();
  const completed = registry.get("generation-123456789012");
  assert.equal(completed.status, "success");
  assert.equal(completed.completed, 1);
  assert.deepEqual(completed.stages, { generated: 1 });
  assert.deepEqual(completed.result, {
    outcomes: [{ status: "fulfilled" }],
  });
});

test("超过四项批生成仍最多两路并发、按输入保序并保留单项失败", async () => {
  let active = 0;
  let maxActive = 0;
  const progress = [];
  const outcomes = await runGenerationJobBatch({
    concurrency: 2,
    items: ["A", "B", "C", "D", "E", "F"].map((label) => ({ key: label, label })),
    onProgress: ({ completed }) => progress.push(completed),
    async execute(item) {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await nextTurn();
      active -= 1;
      if (item.key === "B") throw new Error("B 失败");
      return { id: item.key };
    },
  });
  assert.equal(maxActive, 2);
  assert.deepEqual(outcomes.map((outcome) => outcome.item.key), ["A", "B", "C", "D", "E", "F"]);
  assert.deepEqual(outcomes.map((outcome) => outcome.status), [
    "fulfilled",
    "rejected",
    "fulfilled",
    "fulfilled",
    "fulfilled",
    "fulfilled",
  ]);
  assert.equal(outcomes[1].reason.message, "B 失败");
  assert.deepEqual(progress, [1, 2, 3, 4, 5, 6]);
});

test("完整模型目录超过四项可受理，两路出图并归档同一完整批次", async () => {
  const models = publicModelCatalog();
  assert.ok(models.length > 4);
  const registry = createGenerationJobRegistry();
  const archived = [];
  const requested = [];
  let active = 0;
  let maxActive = 0;
  let response;
  const generationService = createGenerationService({
    imageClientForModel(modelKey) {
      return {
        async generateImage(request) {
          requested.push(modelKey);
          assert.equal(request.n, 1);
          active += 1;
          maxActive = Math.max(maxActive, active);
          await nextTurn();
          active -= 1;
          return { images: [{ url: "data:image/png;base64,aQ==" }], outputFormat: "png" };
        },
      };
    },
    scheduleGenerationSync(input) {
      archived.push(input);
      return { generationId: `sync-${archived.length}`, status: "pending" };
    },
  });
  const jobId = "generation-full-model-catalog";
  const body = {
    batchId: "batch-full-model-catalog",
    featureMode: "free",
    items: models.map((model) => ({
      input: {
        modelKey: model.key, outputFormat: model.defaultFormat,
        ratio: model.defaultRatio, resolution: model.defaultResolution,
      },
      key: model.key, label: model.label,
    })),
    jobId,
    sharedInput: {
      prompt: "测试共同提示词",
      referenceImages: [{
        dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z7JkAAAAASUVORK5CYII=",
        name: "source.png", type: "image/png",
      }],
    },
  };
  const handler = createGenerationJobApiHandler({
    generationJobs: registry, generationService,
    readJson: async () => body,
    sendJson(_response, statusCode, value) { response = { statusCode, ...value }; },
  });
  await handler({ method: "POST" }, {}, "/api/generation-jobs");
  assert.equal(response.statusCode, 202);
  assert.equal(response.job.total, models.length);
  for (let turn = 0; turn < 100 && registry.get(jobId).status === "running"; turn += 1) await nextTurn();
  const job = registry.get(jobId);
  assert.equal(job.status, "success");
  assert.equal(maxActive, 2);
  assert.deepEqual(requested, models.map((model) => model.key));
  assert.deepEqual(job.result.outcomes.map((outcome) => outcome.item.key), requested);
  assert.ok(job.result.outcomes.every((outcome) => outcome.status === "fulfilled"));
  assert.equal(archived.length, models.length);
  assert.deepEqual(archived.map((input) => input.modelLabel), models.map((model) => model.label));
  assert.deepEqual(archived.map((input) => input.workflow.batchIndex), models.map((_model, index) => index + 1));
  assert.ok(archived.every((input) => input.workflow.batchId === body.batchId
    && input.workflow.batchCount === models.length));
});

test("移除模型总数上限仍在入队前阻断非法模型、重复多模型项与单模型超过四张", async () => {
  const registry = createGenerationJobRegistry();
  let currentItems;
  let response;
  let verified = 0;
  let executed = 0;
  const item = (modelKey) => ({ input: { modelKey }, key: modelKey });
  const handler = createGenerationJobApiHandler({
    generationJobs: registry,
    generationService: { async executeForMode() { executed += 1; return {}; } },
    readJson: async () => ({
      batchId: "batch-boundary-test", featureMode: "free", items: currentItems,
      jobId: "generation-selection-boundary",
    }),
    sendJson(_response, statusCode, value) { response = { statusCode, ...value }; },
    verifySyncContract: async () => { verified += 1; },
  });
  for (const [items, reason] of [
    [[], /至少需要 1/],
    [[item("unknown")], /不支持的出图模型/],
    [Array.from({ length: 5 }, () => item("banana21")), /单模型.*1–4/],
    [[item("banana21"), item("banana21"), item("gptImage2")], /每个模型只允许 1/],
  ]) {
    currentItems = items;
    await handler({ method: "POST" }, {}, "/api/generation-jobs");
    assert.equal(response.statusCode, 400);
    assert.match(response.error, reason);
    assert.equal(registry.get("generation-selection-boundary"), null);
  }
  assert.equal(verified, 0);
  assert.equal(executed, 0);
  currentItems = Array.from({ length: 4 }, () => item("banana21"));
  await handler({ method: "POST" }, {}, "/api/generation-jobs");
  assert.equal(response.statusCode, 202);
  await nextTurn();
  assert.equal(registry.get("generation-selection-boundary").status, "success");
  assert.equal(executed, 4);
});

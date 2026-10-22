/**
 * [INPUT]: 依赖 node:test/assert、Beta Runner/API 与生成任务注册表的内存替身
 * [OUTPUT]: 对外提供仅失败项手动重试、成功项保留、仅同步失败零生成、Attempt续号、并发重试幂等、旧批次附件恢复及结构化预警合同
 * [POS]: test 的 Beta重试状态机回归保障，不调用真实模型或飞书
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";
import { createBetaApiHandler, createBetaRunnerService } from "../src/beta-runner.mjs";
import { createGenerationJobRegistry } from "../src/generation-jobs.mjs";

const TEST_TIME = "2026-10-19 15:51:58";
const input = () => ({ batchId: "BETA-retry-state001", featureMode: "free", jobId: "beta-retry-original001", testTime: TEST_TIME,
  items: ["good", "generation", "sync"].map((prompt, index) => ({ caseId: `CASE-${index}`, label: prompt,
    modelLabel: "测试模型", runId: `RUN-retry-state-${index}`, input: { prompt } })) });
const turn = () => new Promise((resolve) => setImmediate(resolve));
async function settled(service, jobId) {
  for (let tries = 0; tries < 1000; tries += 1) {
    const job = service.getJob(jobId);
    if (job && job.status !== "running") return job;
    await turn();
  }
  throw new Error("内存测试任务未结算");
}
function mockStore(overrides = {}) {
  return { async beginRun({ item }) { return { recordId: item.runId, recordUrl: `https://example.test/${item.runId}` }; },
    async completeRun(recordId) { return { recordId, recordUrl: `https://example.test/${recordId}` }; },
    async failRun() {}, ...overrides };
}

test("手动RETRY保留成功项，只重生失败项；已生成同步失败复用原图和Attempt", async () => {
  const generated = [], attempts = [], syncs = [];
  let rejectGeneration = true, rejectSync = true;
  const service = createBetaRunnerService({ maxAttempts: 1, baseStore: mockStore({
    async beginRun({ item }) { attempts.push([item.runId, item.attempt]); return { recordId: item.runId, recordUrl: "https://example.test/run" }; },
    async completeRun(recordId) { syncs.push(recordId);
      if (recordId === "RUN-retry-state-2" && rejectSync) throw new Error("飞书附件服务暂不可用");
      return { recordId, recordUrl: "https://example.test/run" }; },
  }), generationService: { async executeForMode(_mode, value) {
    generated.push(value.prompt);
    if (value.prompt === "generation" && rejectGeneration) throw Object.assign(new Error("模型参数无效"), { statusCode: 400 });
    return { images: [{ url: "data:image/png;base64,PRIVATE-IMAGE" }], prompt: { text: "PRIVATE-PROMPT" } };
  } } });
  service.start(input());
  const failed = await settled(service, input().jobId);
  assert.equal(failed.status, "failed");
  assert.deepEqual(failed.stages, { generated: 2, synced: 1 });
  assert.equal(failed.result.warnings.length, 2);
  assert.deepEqual(failed.result.warnings.map(({ stage, retryable }) => [stage, retryable]), [["generation", false], ["sync", true]]);
  assert.equal(failed.result.warnings[1].recordUrl, "https://example.test/run");
  assert.doesNotMatch(JSON.stringify(failed), /PRIVATE-IMAGE|PRIVATE-PROMPT/);
  rejectGeneration = rejectSync = false;
  const retryId = "beta-retry-followup001";
  const accepted = service.start({ jobId: retryId, retryOfJobId: input().jobId });
  assert.equal(accepted.total, 3);
  assert.equal(accepted.completed, 1);
  assert.equal(accepted.result.results.length, 1);
  const done = await settled(service, retryId);
  assert.equal(done.status, "success");
  assert.deepEqual(done.stages, { generated: 3, synced: 3 });
  assert.deepEqual(generated, ["good", "generation", "sync", "generation"]);
  assert.deepEqual(attempts, [["RUN-retry-state-0", 1], ["RUN-retry-state-1", 1], ["RUN-retry-state-2", 1], ["RUN-retry-state-1-A2", 2]]);
  assert.deepEqual(done.result.results.map(({ attempt }) => attempt), [1, 2, 1]);
  assert.deepEqual(done.result.warnings, []);
  assert.equal(syncs.filter((id) => id === "RUN-retry-state-0").length, 1);
  assert.equal(syncs.filter((id) => id === "RUN-retry-state-2").length, 2);
});

test("自动同步重试不创建新Run也不重新调用模型，并保留归档合同", async () => {
  let generationCalls = 0, begins = 0, syncs = 0;
  const retained = [];
  const service = createBetaRunnerService({ sleep: async () => {}, baseStore: mockStore({
    async beginRun({ item }) { begins += 1; return { recordId: item.runId }; },
    async completeRun(recordId) { syncs += 1; if (syncs < 3) throw new Error("上传失败"); return { recordId }; },
    async failRun(_id, _error, options) { retained.push(options.retainArchive); },
  }), generationService: { async executeForMode() { generationCalls += 1; return { images: [] }; } } });
  service.start({ ...input(), items: input().items.slice(0, 1) });
  const job = await settled(service, input().jobId);
  assert.equal(job.status, "success");
  assert.deepEqual([generationCalls, begins, syncs], [1, 1, 3]);
  assert.deepEqual(retained, [true, true]);
  assert.equal(job.result.results[0].attempt, 1);
});

test("同一失败来源重复点击RETRY复用正在执行的新任务", async () => {
  let shouldFail = true;
  const gate = Promise.withResolvers();
  let calls = 0;
  const service = createBetaRunnerService({ maxAttempts: 1, baseStore: mockStore(), generationService: {
    async executeForMode() { calls += 1; if (shouldFail) throw new Error("暂不可用"); await gate.promise; return { images: [] }; },
  } });
  service.start({ ...input(), items: input().items.slice(0, 1) });
  await settled(service, input().jobId);
  shouldFail = false;
  const one = service.retry(input().jobId, { jobId: "beta-repeat-first001" });
  const two = service.retry(input().jobId, { jobId: "beta-repeat-second01" });
  assert.equal(one.jobId, two.jobId);
  await turn();
  assert.equal(calls, 2);
  gate.resolve();
  assert.equal((await settled(service, one.jobId)).status, "success");
});

async function legacyJob(jobs) {
  const batch = input();
  jobs.enqueue(batch.jobId, { featureMode: "free", total: 3 }, async (update) => {
    update({ completed: 1, stages: { generated: 2, synced: 1 }, result: { batchId: batch.batchId,
      results: [{ attempt: 1, index: 0, runId: batch.items[0].runId, caseId: "CASE-0", recordUrl: "https://example.test/old" }] } });
    throw new Error("旧批次未完成");
  });
  await turn();
}

test("旧registry迁移保留原成功项，已有附件恢复不生图，无附件项继续Attempt", async () => {
  const jobs = createGenerationJobRegistry();
  await legacyJob(jobs);
  const generated = [], recovered = [];
  const service = createBetaRunnerService({ jobs, maxAttempts: 1, baseStore: mockStore({
    async recoverRun({ item }) { recovered.push(item.caseId);
      return item.caseId === "CASE-1" ? { attempt: 1, recordId: "rec-existing", runId: item.runId, recordUrl: "https://example.test/recovered" } : null; },
  }), generationService: { async executeForMode(_mode, value) { generated.push(value.prompt); return { images: [] }; } } });
  const retryId = "beta-legacy-recover001";
  service.start({ ...input(), jobId: retryId, retryOfJobId: input().jobId });
  const job = await settled(service, retryId);
  assert.equal(job.status, "success");
  assert.deepEqual(recovered, ["CASE-1", "CASE-2"]);
  assert.deepEqual(generated, ["sync"]);
  assert.deepEqual(job.stages, { generated: 3, synced: 3 });
  assert.equal(job.result.results[0].recordUrl, "https://example.test/old");
  assert.equal(job.result.results[1].attempt, 1);
  assert.equal(job.result.results[2].attempt, 2);
});

test("已有附件恢复失败保持同步预警，禁止回退收费生成", async () => {
  const jobs = createGenerationJobRegistry();
  await legacyJob(jobs);
  let generationCalls = 0;
  const service = createBetaRunnerService({ jobs, maxAttempts: 1, baseStore: mockStore({
    async recoverRun() { throw Object.assign(new Error("已有结果 SHA-256 不一致"), { statusCode: 409, retryable: false }); },
  }), generationService: { async executeForMode() { generationCalls += 1; } } });
  const retryId = "beta-legacy-invalid001";
  service.start({ ...input(), jobId: retryId, retryOfJobId: input().jobId });
  const job = await settled(service, retryId);
  assert.equal(job.status, "failed");
  assert.equal(generationCalls, 0);
  assert.ok(job.result.warnings.every((warning) => warning.stage === "sync" && warning.retryable === false));
});

test("重试API支持新路由及已有/jobs轻请求，运行/成功任务和缺失任务拒绝重试", async () => {
  const calls = [];
  const handler = createBetaApiHandler({ readJson: async () => ({ jobId: "beta-http-retry-test01", retryOfJobId: "beta-http-original001" }),
    sendJson(_response, status, body) { calls.push([status, body.job]); },
    service: { retry(id, body) { return { jobId: body.jobId, source: id }; }, start(body) { return { jobId: body.jobId }; } },
  });
  assert.equal(await handler({ method: "POST" }, {}, "/api/beta/jobs/beta-http-original001/retry"), true);
  assert.equal(await handler({ method: "POST" }, {}, "/api/beta/jobs"), true);
  assert.deepEqual(calls.map(([status]) => status), [202, 202]);
  const service = createBetaRunnerService({ baseStore: mockStore(), generationService: { async executeForMode() { return { images: [] }; } } });
  assert.throws(() => service.retry("beta-no-such-task000", {}), (error) => error.statusCode === 404);
  service.start({ ...input(), items: input().items.slice(0, 1) });
  assert.throws(() => service.retry(input().jobId, { jobId: "beta-new-retry-test01" }), (error) => error.statusCode === 409);
  await settled(service, input().jobId);
  assert.throws(() => service.retry(input().jobId, { jobId: "beta-new-retry-test01" }), (error) => error.statusCode === 409);
});

test("手动重试使用原冻结free提示词，不采用随后修改的样本文本", async () => {
  let samplePrompt = "原始提示词", fail = true;
  const prompts = [];
  const service = createBetaRunnerService({ maxAttempts: 1, baseStore: mockStore({
    async getSampleSet() { return { status: "可用", recordId: "rec-set", samples: [
      { sampleId: "SAMPLE-1", recordId: "rec-sample", prompt: samplePrompt }] }; },
  }), generationService: { async executeForMode(_mode, value) {
    prompts.push(value.prompt); if (fail) throw new Error("暂不可用"); return { images: [] };
  } } });
  await service.start({ ...input(), sampleSetId: "SET-FROZEN", items: [{ ...input().items[0], sampleId: "SAMPLE-1" }] });
  await settled(service, input().jobId);
  samplePrompt = "后来更改的提示词";
  fail = false;
  const retried = await service.retry(input().jobId, { jobId: "beta-free-frozenretry01" });
  assert.equal((await settled(service, retried.jobId)).status, "success");
  assert.deepEqual(prompts, ["原始提示词", "原始提示词"]);
});

test("手动重试保留原冻结空房房型，不采用随后修改的样本元数据", async () => {
  let roomType = "客厅", fail = true;
  const rooms = [];
  const service = createBetaRunnerService({ maxAttempts: 1, baseStore: mockStore({
    async getSampleSet() { return { status: "可用", recordId: "rec-set", samples: [
      { sampleId: "SAMPLE-1", recordId: "rec-sample", roomType, image: { type: "image/png", size: 100 } }] }; },
  }), generationService: { async executeForMode(_mode, value) {
    rooms.push(value.roomType); if (fail) throw new Error("暂不可用"); return { images: [] };
  } } });
  await service.start({ ...input(), featureMode: "emptyRoom", sampleSetId: "SET-FROZEN",
    items: [{ ...input().items[0], sampleId: "SAMPLE-1" }] });
  await settled(service, input().jobId);
  roomType = "卧室";
  fail = false;
  const retried = await service.retry(input().jobId, { jobId: "beta-room-frozenretry01" });
  assert.equal((await settled(service, retried.jobId)).status, "success");
  assert.deepEqual(rooms, ["客厅", "客厅"]);
});

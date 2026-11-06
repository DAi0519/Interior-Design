/**
 * [INPUT]: 依赖平面布局 HTTP 适配器、真实任务注册表与内存准备/图像替身
 * [OUTPUT]: 验证并发准入幂等、准备期轮询、冲突、失败诊断恢复、失效任务不重提、换Key隔离及更新忙碌状态
 * [POS]: test 的平面布局独立API合同，不访问网络或付费模型
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createFloorPlanApiHandler } from "../src/floor-plan-api.mjs";
import { createGenerationJobRegistry } from "../src/generation-jobs.mjs";

function harness({ prepareGate = null, executeGate = null, rejectPaid = false, rejectPrepare = false, failureDiagnostic = null,
  registry = createGenerationJobRegistry(), getClient: customClient = null } = {}) {
  const calls = { prepare: [], execute: [], client: 0, config: [] };
  let connection = "private-key-one";
  const handler = createFloorPlanApiHandler({ generationJobs: registry,
    requireKey: () => connection,
    readJson: async (request) => request.body,
    sendJson(response, status, payload) { Object.assign(response, { status, payload }); },
    getModels: async () => [{ id: "vision-model" }],
    getClient: customClient || (() => { calls.client += 1; return {}; }),
    readConfig: async (options) => { calls.config.push(options); return { featureMode: "floorPlan", available: true }; },
    prepareInput: async (input) => {
      calls.prepare.push(input);
      if (prepareGate) await prepareGate.promise;
      if (rejectPrepare) throw Object.assign(new Error("未上架"), { statusCode: 409 });
      return { privatePrompt: "PRIVATE_SYSTEM_BODY" };
    },
    execute: async (prepared, { onProgress, getModels }) => {
      calls.execute.push(prepared);
      await getModels();
      if (executeGate) await executeGate.promise;
      if (rejectPaid) throw Object.assign(new Error("模型未返回结果"), failureDiagnostic
        ? { floorPlanSafe: true, floorPlanDiagnostic: failureDiagnostic } : {});
      onProgress({ message: "正在生成平面布局" });
      return { action: "layout", image: { url: "test-output", width: 1024, height: 1024 } };
    },
  });
  return { calls, handler, registry, setKey(value) { connection = value; },
    async post(body = { jobId: "floor-plan-job-0001", action: "layout", modelKey: "gptImage25Sunburst", userRequirements: "用户布局要求" }) {
      const response = {};
      assert.equal(await handler({ method: "POST", body }, response, "/api/floor-plan/jobs"), true);
      return response;
    },
    async get(id = "floor-plan-job-0001") {
      const response = {};
      assert.equal(await handler({ method: "GET" }, response, `/api/floor-plan/jobs/${id}`), true);
      return response;
    },
    async settled(id = "floor-plan-job-0001") {
      const deadline = Date.now() + 2000;
      while (registry.get(id)?.status === "running") {
        if (Date.now() > deadline) throw new Error("等待终态超时");
        await new Promise((resolve) => setTimeout(resolve, 1));
      }
      return registry.get(id);
    },
  };
}

test("独立配置和查询路由、刷新和未知任务不影响普通生图", async () => {
  const h = harness(), response = {};
  assert.equal(await h.handler({ method: "GET", url: "/api/floor-plan/config?refresh=1" }, response, "/api/floor-plan/config"), true);
  assert.equal(response.status, 200);
  assert.equal(h.calls.config[0].forceRefresh, true);
  assert.equal((await h.get("missing-layout")).status, 404);
  assert.equal(await h.handler({ method: "POST" }, {}, "/api/generation-jobs"), false);
  assert.equal(await h.handler({ method: "GET" }, {}, "/api/floor-plan/jobs"), false);
});

test("同ID并发请求共用一次准备和图像调用，准备期GET可恢复且无私有数据", async () => {
  const prepareGate = Promise.withResolvers(), executeGate = Promise.withResolvers();
  const h = harness({ prepareGate, executeGate });
  const first = h.post(), second = h.post();
  await Promise.resolve(); await Promise.resolve();
  assert.equal(h.handler.hasActiveJobs(), true);
  const pending = await h.get();
  assert.equal(pending.status, 200);
  assert.equal(pending.payload.job.status, "running");
  assert.doesNotMatch(JSON.stringify(pending), /用户布局要求|PRIVATE_SYSTEM_BODY|private-key|fingerprint/);
  prepareGate.resolve();
  const responses = await Promise.all([first, second]);
  assert.ok(responses.every(({ status }) => status === 202));
  assert.equal(h.calls.prepare.length, 1);
  assert.equal(h.handler.hasActiveJobs(), true);
  executeGate.resolve();
  assert.equal((await h.settled()).status, "success");
  assert.equal(h.calls.execute.length, 1);
  assert.equal(h.handler.hasActiveJobs(), false);
  assert.equal((await h.post()).payload.job.status, "success");
  assert.equal(h.calls.execute.length, 1);
});

test("准备期或终态后同ID修改输入409，旧结果不会触发新收费", async () => {
  const prepareGate = Promise.withResolvers(), h = harness({ prepareGate });
  const running = h.post(); await Promise.resolve(); await Promise.resolve();
  const changed = { jobId: "floor-plan-job-0001", userRequirements: "换个布局" };
  await assert.rejects(h.post(changed), { statusCode: 409 });
  prepareGate.resolve(); await running; await h.settled();
  await assert.rejects(h.post(changed), { statusCode: 409 });
  assert.equal(h.calls.execute.length, 1);
});

test("准备失败零客户端/收费任务，准备期间换Key阻断而不沿用权限", async () => {
  const failed = harness({ rejectPrepare: true });
  await assert.rejects(failed.post(), { statusCode: 409 });
  assert.equal(failed.calls.client, 0);
  assert.equal(failed.registry.get("floor-plan-job-0001"), null);
  assert.equal(failed.handler.hasActiveJobs(), false);
  const gate = Promise.withResolvers(), changed = harness({ prepareGate: gate });
  const running = changed.post(); await Promise.resolve(); await Promise.resolve();
  changed.setKey("private-key-two"); gate.resolve();
  await assert.rejects(running, { statusCode: 409 });
  assert.equal(changed.calls.execute.length, 0);
});

test("模型失败与结果过期不自动重跑；客户端连接错误脱敏", async () => {
  const failed = harness({ rejectPaid: true });
  await failed.post(); assert.equal((await failed.settled()).status, "failed");
  assert.equal((await failed.post()).payload.job.status, "failed");
  assert.equal(failed.calls.execute.length, 1);
  let now = 1;
  const expired = harness({ registry: createGenerationJobRegistry({ now: () => now, ttlMs: 10 }) });
  await expired.post(); await expired.settled(); now = 100;
  await assert.rejects(expired.post(), { statusCode: 409 });
  assert.equal(expired.calls.execute.length, 1);
  const connection = harness({ getClient: () => { throw new Error("secret-key PRIVATE_SYSTEM_BODY"); } });
  await connection.post();
  assert.doesNotMatch(JSON.stringify(await connection.settled()), /secret-key|PRIVATE_SYSTEM_BODY/);
});

test("请求类型和ID严格校验，其他功能任务不能被布局接口读取", async () => {
  const h = harness();
  for (const body of [null, [], {}, { jobId: "short" }, { jobId: "bad/path-name" }]) await assert.rejects(h.post(body), { statusCode: 400 });
  h.registry.enqueue("other-feature-job", { featureMode: "whiteModel", total: 1 }, async () => ({ privateResult: true }));
  assert.equal((await h.get("other-feature-job")).status, 404);
  await assert.rejects(h.post({ jobId: "other-feature-job" }), { statusCode: 409 });
});

test("失败诊断可只读恢复但不变成功，不自动重跑或暴露准备闭包", async () => {
  const diagnostic = { requestId: "same-model-call", usageCost: { costUsd: 0.002, currency: "USD" },
    upstreamResponseId: "submitted-image-id" };
  const h = harness({ rejectPaid: true, failureDiagnostic: diagnostic });
  await h.post();
  const failed = await h.settled();
  assert.equal(failed.status, "failed");
  assert.equal(failed.completed, 0);
  assert.deepEqual((await h.get()).payload.job.result, { diagnostic });
  assert.equal((await h.post()).payload.job.status, "failed");
  assert.equal(h.calls.execute.length, 1);
  assert.doesNotMatch(JSON.stringify(await h.get()), /PRIVATE_SYSTEM_BODY|private-key|privatePrompt/);
});

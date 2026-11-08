/**
 * [INPUT]: 依赖平面布局 HTTP 适配器、真实任务注册表与内存准备/图像替身
 * [OUTPUT]: 验证并发幂等、准备与故障恢复、连接隔离、归档准入和成功槽位逐图同步。
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

test("机位批次飞书准入失败不执行模型，成功槽位逐图且只安排一次同步", async () => {
  const generationJobs = createGenerationJobRegistry();
  const archived = [];
  let available = false, generations = 0;
  const original = "data:image/png;base64,b3JpZ2luYWw=", guide = "data:image/png;base64,Z3VpZGU=";
  const model = { key: "banana21", label: "Banana 2.1" };
  const agent = { key: "gemini3pro", label: "Gemini 3.1 Pro" };
  const result = { action: "render", model, agent, compiledPrompt: "frozen prompt", durationMs: 3000,
    image: { url: "data:image/png;base64,cmVzdWx0", type: "image/png", sha256: "a".repeat(64) } };
  const handler = createFloorPlanApiHandler({ generationJobs, featureMode: "floorPlanCamera", geometryEnabled: false,
    getClient: () => ({}), readJson: async request => request.body, sendJson: (response, status, payload) => Object.assign(response, { status, payload }),
    prepareInput: async () => ({ action: "render", guide: { imageUrl: guide }, batch: { models: [{ model }] }, agent }),
    verifyArchive: async ({ featureMode, modelLabels, agentLabels }) => {
      assert.equal(featureMode, "floorPlanCamera"); assert.deepEqual(modelLabels, [model.label]); assert.deepEqual(agentLabels, [agent.label]);
      if (!available) throw Object.assign(new Error("归档未就绪"), { statusCode: 409 });
    },
    scheduleArchive: input => { archived.push(input); return { generationId: input.archiveId, status: "pending" }; },
    execute: async () => {
      generations++;
      return { receipts: { agent: { requestId: "shared-agent" } }, items: [
        { index: 1, status: "success", result }, { index: 2, status: "failed", result: null }, { index: 3, status: "success", result },
      ] };
    },
  });
  const jobId = "camera-archive-batch";
  const post = () => handler({ method: "POST", body: { jobId, action: "render", referenceImage: { dataUrl: original } } }, {}, "/api/floor-plan/jobs");
  await assert.rejects(post(), { statusCode: 409 });
  assert.equal(generations, 0);
  available = true;
  await Promise.all([post(), post()]);
  await new Promise(resolve => setImmediate(resolve));
  await post();
  assert.equal(generations, 1);
  assert.deepEqual(archived.map(archive => archive.workflow.modelIndex), [1, 3]);
  assert.notEqual(archived[0].archiveId, archived[1].archiveId);
  assert.deepEqual(archived[0].referenceImages.map(image => image.imageUrl), [original, guide]);
  assert.equal(archived[0].workflow.receipts.agent.requestId, "shared-agent");
  const job = generationJobs.get(jobId);
  assert.equal(job.status, "success");
  assert.deepEqual(job.result.items.map(item => item.result?.sync?.status), ["pending", undefined, "pending"]);
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

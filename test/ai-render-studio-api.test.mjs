/**
 * [INPUT]: 依赖独立渲染台HTTP适配器、真实任务注册表与内存准备/模型替身
 * [OUTPUT]: 验证隔离路由、并发准备幂等、输入冲突、失败与过期不重复收费、忙碌守卫及私有状态不外泄
 * [POS]: test 的AI渲染台任务合同测试，不请求网络、不调用真实模型或飞书
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createAiRenderStudioApiHandler } from "../src/ai-render-studio-api.mjs";
import { createGenerationJobRegistry } from "../src/generation-jobs.mjs";

function harness(options = {}) {
  const registry = options.registry || createGenerationJobRegistry();
  const calls = { prepare: [], client: [], execute: [], config: [] };
  const completed = Promise.withResolvers();
  const handler = createAiRenderStudioApiHandler({
    generationJobs: registry,
    getOneApiModels: async () => [],
    getImageClient: options.getImageClient || (async (modelKey) => { calls.client.push(modelKey); return {}; }),
    readJson: async (request) => request.body,
    sendJson(response, status, payload) { Object.assign(response, { status, payload: structuredClone(payload) }); },
    readConfig: async (dependencies) => { calls.config.push(dependencies); return { available: true, featureMode: "aiRenderStudio" }; },
    prepareInput: async (input, dependencies) => {
      calls.prepare.push({ input: structuredClone(input), dependencies });
      if (options.prepareGate) await options.prepareGate.promise;
      if (options.rejectPrepare) throw Object.assign(new Error("未上架，已阻止生成"), { statusCode: 409 });
      return { privateSnapshot: { prompt: "PRIVATE_ASSET_BODY" }, input };
    },
    execute: async (prepared, dependencies) => {
      calls.execute.push({ prepared, dependencies });
      dependencies.onProgress({ phase: "executing", message: "正在生成", upstreamResponseId: "response-offline" });
      if (options.executeGate) await options.executeGate.promise;
      completed.resolve();
      if (options.rejectPaid) throw new Error("上游失败");
      return { images: [{ url: "data:image/png;base64,b2ZmbGluZQ==" }], workflow: { key: "ai-render-studio" },
        upstream: { metadata: { submittedPromptSha256: "0".repeat(64) } } };
    },
  });
  return { calls, registry, handler, completed: completed.promise,
    async post(body = { jobId: "studio-job-0001", input: { prompt: "用户要求", materialMode: "faithful" } }) {
      const response = {};
      assert.equal(await handler({ method: "POST", body }, response, "/api/ai-render-studio/jobs"), true);
      return response;
    },
    async get(jobId = "studio-job-0001") {
      const response = {};
      assert.equal(await handler({ method: "GET" }, response, `/api/ai-render-studio/jobs/${jobId}`), true);
      return response;
    },
    async settled(jobId = "studio-job-0001") {
      const started = Date.now();
      while (registry.get(jobId)?.status === "running") {
        if (Date.now() - started > 2000) throw new Error("等待任务终态超时");
        await new Promise((resolve) => setTimeout(resolve, 1));
      }
      return registry.get(jobId);
    },
  };
}

test("独立配置和任务路由不接管普通生图，未知任务404", async () => {
  const h = harness(), response = {};
  assert.equal(await h.handler({ method: "GET" }, response, "/api/ai-render-studio/config"), true);
  assert.equal(response.status, 200);
  assert.equal(response.payload.featureMode, "aiRenderStudio");
  assert.equal(h.calls.config.length, 1);
  assert.equal(await h.handler({ method: "POST" }, {}, "/api/generation-jobs"), false);
  assert.equal(await h.handler({ method: "GET" }, {}, "/api/ai-render-studio/jobs"), false);
  assert.equal((await h.get("studio-unknown-0001")).status, 404);
});

test("并发相同jobId共用一次准备和一次模型执行，准备与运行均被busy守卫覆盖", async () => {
  const prepareGate = Promise.withResolvers(), executeGate = Promise.withResolvers();
  const h = harness({ prepareGate, executeGate });
  const first = h.post(), second = h.post();
  await Promise.resolve(); await Promise.resolve();
  assert.equal(h.handler.hasActiveJobs(), true);
  prepareGate.resolve();
  const responses = await Promise.all([first, second]);
  assert.ok(responses.every((response) => response.status === 202));
  assert.equal(h.calls.prepare.length, 1);
  assert.equal(h.handler.hasActiveJobs(), true);
  executeGate.resolve();
  const job = await h.settled();
  assert.equal(job.status, "success");
  assert.equal(h.calls.client.length, 1);
  assert.equal(h.calls.execute.length, 1);
  assert.equal(h.handler.hasActiveJobs(), false);
  assert.equal((await h.post()).payload.job.status, "success");
  assert.equal(h.calls.execute.length, 1);
  assert.doesNotMatch(JSON.stringify((await h.get()).payload), /PRIVATE_ASSET_BODY|privateSnapshot|用户要求/);
});

test("相同任务ID换输入在准备期间或终态后均409，不新增模型请求", async () => {
  const prepareGate = Promise.withResolvers();
  const h = harness({ prepareGate });
  const first = h.post();
  await Promise.resolve(); await Promise.resolve();
  await assert.rejects(h.post({ jobId: "studio-job-0001", input: { prompt: "另一个要求" } }), { statusCode: 409 });
  prepareGate.resolve();
  await first;
  await h.settled();
  await assert.rejects(h.post({ jobId: "studio-job-0001", input: { prompt: "另一个要求" } }), { statusCode: 409 });
  assert.equal(h.calls.prepare.length, 1);
  assert.equal(h.calls.execute.length, 1);
});

test("POST响应未知且仍在准备时GET保留运行身份，不误报404或暴露私有参数", async () => {
  const prepareGate = Promise.withResolvers(), h = harness({ prepareGate });
  const submitted = h.post();
  await Promise.resolve(); await Promise.resolve();
  const during = await h.get();
  assert.equal(during.status, 200);
  assert.equal(during.payload.job.status, "running");
  assert.equal(during.payload.job.featureMode, "aiRenderStudio");
  assert.equal(during.payload.job.jobId, "studio-job-0001");
  assert.doesNotMatch(JSON.stringify(during), /用户要求|PRIVATE_ASSET_BODY|fingerprint|input/);
  assert.equal(h.calls.client.length, 0);
  prepareGate.resolve(); await submitted; await h.settled();
  assert.equal((await h.get()).payload.job.status, "success");
  assert.equal(h.calls.prepare.length, 1); assert.equal(h.calls.execute.length, 1);
});

test("配置刷新查询参数真实透传到资产读取", async () => {
  const h = harness();
  await h.handler({ method: "GET", url: "/api/ai-render-studio/config?refresh=1" }, {}, "/api/ai-render-studio/config");
  assert.equal(h.calls.config[0].forceRefresh, true);
});

test("上游失败保留失败任务，同ID重复提交不自动重试收费", async () => {
  const h = harness({ rejectPaid: true });
  await h.post();
  assert.equal((await h.settled()).status, "failed");
  assert.equal((await h.post()).payload.job.status, "failed");
  assert.equal(h.calls.execute.length, 1);
});

test("结果过期的已接受ID不能重新收费执行", async () => {
  let now = 1;
  const h = harness({ registry: createGenerationJobRegistry({ now: () => now, ttlMs: 10 }) });
  await h.post();
  await h.settled();
  now = 100;
  await assert.rejects(h.post(), { statusCode: 409 });
  assert.equal(h.calls.execute.length, 1);
});

test("未上架等准备失败不留下运行任务或读取模型客户端", async () => {
  const h = harness({ rejectPrepare: true });
  await assert.rejects(h.post(), { statusCode: 409 });
  assert.equal(h.registry.get("studio-job-0001"), null);
  assert.equal(h.calls.client.length, 0);
  assert.equal(h.calls.execute.length, 0);
  assert.equal(h.handler.hasActiveJobs(), false);
});

test("客户端读取失败只留下脱敏失败提示", async () => {
  const h = harness({ getImageClient() { throw new Error("PRIVATE_ASSET_BODY secret-key-example"); } });
  await h.post();
  const result = await h.settled();
  assert.equal(result.status, "failed");
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_ASSET_BODY|secret-key-example/);
  assert.equal(h.calls.execute.length, 0);
});

test("任务外层、ID与输入严格校验，普通任务不可通过预览接口读取", async () => {
  const h = harness();
  for (const body of [null, [], {}, { jobId: "short" }, { jobId: "studio-job-0001", input: [] },
    { jobId: "studio-job-0001", input: {}, snapshot: {} }]) {
    await assert.rejects(h.post(body), { statusCode: 400 });
  }
  assert.equal(h.calls.prepare.length, 0);
  h.registry.enqueue("studio-other-feature", { featureMode: "refinedModel", total: 1 }, async () => ({ secret: "old result" }));
  assert.equal((await h.get("studio-other-feature")).status, 404);
  await assert.rejects(h.post({ jobId: "studio-other-feature", input: {} }), { statusCode: 409 });
});

test("平铺输入只移除jobId，其余输入交给同一服务准入", async () => {
  const h = harness();
  const input = { prompt: "先执行用户要求", materialMode: "faithful" };
  await h.post({ jobId: "studio-flat-job", ...input });
  await h.settled("studio-flat-job");
  assert.deepEqual(h.calls.prepare[0].input, input);
});

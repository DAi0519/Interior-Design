/**
 * [INPUT]: 依赖node:test/assert、ComfyUI客户端/计时器、可控单调时钟与HTTP/ReadableStream替身
 * [OUTPUT]: 验证POST/History/view分段、空轮询与重试计数、跨时钟非纯排队、纯数字脱敏、并发隔离及失败body释放和收费POST一次性
 * [POS]: test的ComfyUI计时与连接资源回归，全部内存执行，不请求真实服务或GPU
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { createComfyUiClient } from "../src/comfyui-client.mjs";
import { createComfyTiming } from "../src/comfyui-timing.mjs";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z7JkAAAAASUVORK5CYII=", "base64");
const input = { images: [{ image_url: `data:image/png;base64,${png.toString("base64")}` }], prompt: "SECRET-PROMPT-and-key", resolution: "1K" };
const image = key => ({ filename: `CanvasLab_Flux2Klein_${key}_00001_.png`, type: "output", subfolder: "" });
const history = (id, key, messages = []) => ({ [id]: { outputs: { "72": { images: [image(key)] } },
  status: { completed: true, status_str: "success", messages } } });
const clientOptions = { baseUrl: "http://private-url.invalid/", randomId: () => "timing-fixture", pollIntervalMs: 0, waitImpl: async () => {} };

function assertNumericLeaves(value) {
  if (value && typeof value === "object") for (const child of Object.values(value)) assertNumericLeaves(child);
  else { assert.equal(typeof value, "number"); assert(Number.isFinite(value)); }
}

test("请求级本地计时精确区分headers/body/轮询等待/网关重试，view验证不混入body", async () => {
  let at = 0, posts = 0, historyRequests = 0, viewRequests = 0, cancelled = 0;
  const advance = ms => { at += ms; };
  const remoteStart = Date.now() + 100_000;
  const response = ({ status = 200, headersMs, bodyMs = 0, json, bytes, contentType = "image/png" }) => {
    advance(headersMs);
    return { status, ok: status >= 200 && status < 300,
      headers: { get(name) {
        if (name === "date") return "Thu, 29 Oct 2026 00:00:00 GMT";
        if (name === "content-type") { advance(2); return contentType; }
        return null;
      } },
      json: async () => { advance(bodyMs); return json; },
      arrayBuffer: async () => { advance(bodyMs); return bytes; },
      body: { cancel: async () => { cancelled += 1; } },
    };
  };
  const client = createComfyUiClient({ ...clientOptions, pollIntervalMs: 1000,
    timingNow: () => at, waitImpl: async ms => advance(ms),
    randomSeed: () => { advance(2); return 42; },
    webSocketFactory: () => { throw new Error("无onProgress时不应创建WebSocket"); },
    workflowFactory: ({ artifactKey, imageBase64, prompt }) => {
      advance(5);
      return { "72": { class_type: "SaveImage", inputs: { filename_prefix: `CanvasLab_Flux2Klein_${artifactKey}` } },
        source: { class_type: "fixture", inputs: { prompt, base64: imageBase64 } } };
    },
    workflowMetadataFactory: ({ executionDurationMs, queueDurationMs }) => {
      advance(3); return { unchanged: "factory-result", executionDurationMs, queueDurationMs };
    },
    fetchImpl: async (url, options) => {
      assert.equal("timing" in options, false); assert.equal("timingStage" in options, false);
      const path = new URL(url).pathname;
      if (path === "/prompt") {
        posts += 1;
        assert.equal(JSON.parse(options.body).prompt.source.inputs.prompt, input.prompt);
        return response({ headersMs: 11, bodyMs: 7, json: { prompt_id: "p1" } });
      }
      if (path === "/history/p1") {
        historyRequests += 1;
        if (historyRequests === 1) return response({ status: 502, headersMs: 3, bodyMs: 2, json: {} });
        if (historyRequests === 2) return response({ headersMs: 4, bodyMs: 3, json: {} });
        return response({ headersMs: 6, bodyMs: 5, json: history("p1", "timing-fixture", [
          ["execution_start", { timestamp: remoteStart }], ["execution_success", { timestamp: remoteStart + 100 }],
        ]) });
      }
      if (path === "/view") {
        viewRequests += 1;
        return response({ status: [404, 503, 200][viewRequests - 1], headersMs: [8, 9, 10][viewRequests - 1], bodyMs: 13, bytes: png });
      }
      throw new Error("意外请求");
    },
  });
  const result = await client.generateImage(input), timing = result.metadata.timing;
  assert.equal(posts, 1); assert.equal(cancelled, 2);
  assert.equal(result.metadata.unchanged, "factory-result"); assert.equal(result.metadata.executionDurationMs, 100);
  assert.equal(timing.inputPreparationMs, 2); assert.equal(timing.workflowBuildMs, 5);
  assert.equal(timing.webSocketWaitMs, 0); assert.equal(timing.totalMs, 4093);
  assert.equal(timing.prompt.headersMs, 11); assert.equal(timing.prompt.bodyMs, 7); assert.equal(timing.prompt.totalMs, 18);
  assert.equal(timing.history.pollCount, 2); assert.equal(timing.history.requestCount, 3);
  assert.equal(timing.history.emptyPollCount, 1); assert.equal(timing.history.pendingPollCount, 0);
  assert.equal(timing.history.networkMs, 23); assert.equal(timing.history.retryWaitMs, 1000);
  assert.equal(timing.history.pollWaitMs, 1000); assert.equal(timing.history.totalMs, 2023);
  assert.equal(timing.history.firstOutputObservedAtMs, 2048); assert.equal(timing.history.firstSuccessObservedAtMs, 2048);
  assert.deepEqual(timing.view.statusCounts, { 200: 1, 404: 1, 503: 1 });
  assert.deepEqual(timing.view.attempts.map(x => [x.status, x.headersMs, x.bodyMs, x.bodyRead]),
    [[404, 8, 0, 0], [503, 9, 0, 0], [200, 10, 13, 1]]);
  assert.equal(timing.view.networkMs, 40); assert.equal(timing.view.retryWaitMs, 2000);
  assert.equal(timing.view.validationMs, 2); assert.equal(timing.view.totalMs, 2042);
  assert.equal(timing.view.outputBytes, png.length); assert(timing.promptBytes > png.length);
  assert.equal(timing.clock.executionStartEpochMs, remoteStart);
  assert.equal(timing.clock.comparisonsUseMixedClocks, 1);
  assert.equal(timing.clock.postAckAfterExecutionStartCrossClock, 0);
  assert(timing.clock.postAckMinusExecutionStartCrossClockMs < 0);
  assert.equal(timing.clock.serverDateResolutionMs, 1000);
  assertNumericLeaves(timing);
  assert(!JSON.stringify(timing).includes("SECRET")); assert(!JSON.stringify(timing).includes("http"));
  assert(!JSON.stringify(timing).includes(png.toString("base64")));
});

test("History已有图片但未宣告success时保持原有返回行为，不伪造成功观测或缺失时钟", async () => {
  const client = createComfyUiClient({ ...clientOptions, fetchImpl: async url => {
    const path = new URL(url).pathname;
    if (path === "/prompt") return Response.json({ prompt_id: "p1" });
    if (path === "/history/p1") return Response.json({ p1: { outputs: { "72": { images: [image("timing-fixture")] } }, status: { completed: false, messages: [] } } });
    return new Response(png, { headers: { "Content-Type": "image/png" } });
  } });
  const result = await client.generateImage(input), timing = result.metadata.timing;
  assert.equal(result.metadata.executionDurationMs, null); assert.equal(result.metadata.queueDurationMs, null);
  assert(Number.isFinite(timing.history.firstOutputObservedAtMs));
  assert.equal("firstSuccessObservedAtMs" in timing.history, false);
  assert.equal("promptServerDateEpochMs" in timing.clock, false);
  assert.equal("postAckMinusExecutionStartCrossClockMs" in timing.clock, false);
  assertNumericLeaves(timing);
});

test("同客户端并发任务的计时计数隔离，不积累上一次请求", async () => {
  let sequence = 0;
  const polls = new Map();
  const client = createComfyUiClient({ ...clientOptions, randomId: () => `parallel-${++sequence}`,
    fetchImpl: async (url, options) => {
      const path = new URL(url).pathname;
      if (path === "/prompt") return Response.json({ prompt_id: JSON.parse(options.body).client_id });
      if (path.startsWith("/history/")) {
        const id = path.split("/").at(-1), count = (polls.get(id) || 0) + 1; polls.set(id, count);
        return Response.json(id === "parallel-1" && count === 1 ? {} : history(id, id));
      }
      return new Response(png, { headers: { "Content-Type": "image/png" } });
    } });
  const [a, b] = await Promise.all([client.generateImage(input), client.generateImage(input)]);
  assert.equal(a.metadata.timing.history.pollCount, 2); assert.equal(a.metadata.timing.history.emptyPollCount, 1);
  assert.equal(b.metadata.timing.history.pollCount, 1); assert.equal(b.metadata.timing.history.emptyPollCount, 0);
  for (const result of [a, b]) {
    assert.equal(result.metadata.timing.prompt.requestCount, 1);
    assert.equal(result.metadata.timing.view.requestCount, 1); assertNumericLeaves(result.metadata.timing);
  }
});

test("25次404旧body均取消后读取同次PNG，保留POST一次/文件身份/SHA和原始字节", async () => {
  let cancelled = 0, posts = 0, views = 0;
  const client = createComfyUiClient({ ...clientOptions, fetchImpl: async url => {
    const path = new URL(url).pathname;
    if (path === "/prompt") { posts += 1; return Response.json({ prompt_id: "p1" }); }
    if (path === "/history/p1") return Response.json(history("p1", "timing-fixture"));
    views += 1;
    if (views <= 25) return new Response(new ReadableStream({ cancel() { cancelled += 1; } }), { status: 404 });
    return new Response(png, { headers: { "Content-Type": "image/png" } });
  } });
  const result = await client.generateImage(input);
  assert.equal(posts, 1); assert.equal(views, 26); assert.equal(cancelled, 25);
  assert.deepEqual(Buffer.from(result.images[0].url.split(",")[1], "base64"), png);
  assert.equal(result.metadata.outputSha256, createHash("sha256").update(png).digest("hex"));
  assert.equal(result.metadata.timing.view.requestCount, 26);
  assert.deepEqual(result.metadata.timing.view.statusCounts, { 200: 1, 404: 25 });
});

test("终止错误和非图片body清理不覆盖原错误，取消卡住或无body也不阻塞", async () => {
  for (const variant of ["http", "type", "no-body"]) {
    let cancelled = 0;
    const client = createComfyUiClient({ ...clientOptions, fetchImpl: async url => {
      const path = new URL(url).pathname;
      if (path === "/prompt") return Response.json({ prompt_id: "p1" });
      if (path === "/history/p1") return Response.json(history("p1", "timing-fixture"));
      return { ok: variant !== "http", status: variant === "http" ? 400 : 200,
        headers: new Headers({ "Content-Type": "application/json" }),
        ...(variant === "no-body" ? {} : { body: { cancel() {
          cancelled += 1;
          return variant === "http" ? new Promise(() => {}) : Promise.reject(new Error("清理失败不得替换原错误"));
        } } }),
      };
    } });
    let timeout;
    try {
      await assert.rejects(Promise.race([client.generateImage(input), new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error("清理阻塞了原错误")), 500);
      })]), error => error.code === (variant === "http" ? "output_download" : "output_format"));
      assert.equal(cancelled, variant === "no-body" ? 0 : 1);
    } finally { clearTimeout(timeout); }
  }
});

test("请求计时不引入收费POST重试", async () => {
  let posts = 0;
  const client = createComfyUiClient({ ...clientOptions, fetchImpl: async () => {
    posts += 1; return Response.json({ error: "gateway" }, { status: 503 });
  } });
  await assert.rejects(client.generateImage(input), error => error.code === "service_unavailable");
  assert.equal(posts, 1);
});

test("持续404耗尽原60次取图上限时最后一个body也释放，不新增生成", async () => {
  let cancelled = 0, posts = 0, views = 0;
  const client = createComfyUiClient({ ...clientOptions, fetchImpl: async url => {
    const path = new URL(url).pathname;
    if (path === "/prompt") { posts += 1; return Response.json({ prompt_id: "p1" }); }
    if (path === "/history/p1") return Response.json(history("p1", "timing-fixture"));
    views += 1;
    return new Response(new ReadableStream({ cancel() { cancelled += 1; } }), { status: 404 });
  } });
  await assert.rejects(client.generateImage(input), error => error.code === "output_download");
  assert.equal(posts, 1); assert.equal(views, 60); assert.equal(cancelled, 60);
});

test("双参考图计时统计全部原件字节，metadata工厂仍可自定义", async () => {
  const client = createComfyUiClient({ ...clientOptions, referenceImageCount: 2,
    workflowFactory: ({ references }) => { assert.equal(references.length, 2); return {}; },
    workflowMetadataFactory: () => ({ custom: 1 }),
    fetchImpl: async url => {
      const path = new URL(url).pathname;
      if (path === "/prompt") return Response.json({ prompt_id: "p1" });
      if (path === "/history/p1") return Response.json(history("p1", "timing-fixture"));
      return new Response(png, { headers: { "Content-Type": "image/png" } });
    } });
  const result = await client.generateImage({ ...input, images: [input.images[0], input.images[0]] });
  assert.equal(result.metadata.custom, 1); assert.equal(result.metadata.timing.inputBytes, png.length * 2);
});

test("计时快照不随后续观察变化，跨时钟差保留负值而不伪装纯排队", () => {
  let at = 0, wall = 1000;
  const timing = createComfyTiming({ now: () => at, wallNow: () => wall });
  timing.queuedAt(1000);
  const request = timing.request("prompt"); at += 2;
  request.headers({ status: 200, headers: new Headers({ Date: "invalid-date" }) });
  request.bodyStart(); at += 3; wall = 1005; request.bodyDone();
  timing.observeHistory({ status: { completed: true, status_str: "success", messages: [
    ["execution_start", { timestamp: 2000 }], ["execution_success", { timestamp: 2100 }],
  ] } }, true);
  const first = timing.finish(); timing.poll(); at += 10;
  assert.equal(first.totalMs, 5); assert.equal(first.history.pollCount, 0);
  assert.equal(first.clock.postAckMinusExecutionStartCrossClockMs, -995);
  assert.equal(first.clock.postAckAfterExecutionStartCrossClock, 0);
  assert.equal("promptServerDateEpochMs" in first.clock, false);
  assert.equal("pureQueueMs" in first, false); assertNumericLeaves(first);
  assert.equal(timing.finish().history.pollCount, 1);
});

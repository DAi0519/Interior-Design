/**
 * [INPUT]: 依赖 node:test/assert 的虚拟时钟、node:http 回环服务、undici Agent、OneAPI 分阶段超时目录与可替换 fetch 边界
 * [OUTPUT]: 对外提供六类请求预算、响应正文超时、前后阶段预算隔离、真实传输层时限隔离、主动取消优先、收费 POST 不重试及定时器清理的回归保障
 * [POS]: test 的 OneAPI 超时行为测试，与 oneapi-client.test.mjs 的请求和响应契约互补，仅用内存替身及本机回环 HTTP，不请求外部 API
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { Agent } from "undici";

import {
  createOneApiClient,
  ONEAPI_REQUEST_TIMEOUTS,
} from "../src/oneapi-client.mjs";

const nativeFetch = globalThis.fetch;
const imageUrl = "data:image/png;base64,c2FtcGxl";
const promptInput = {
  imageUrl,
  model: "prompt-model",
  systemPrompt: "只返回 JSON",
  userPrompt: "生成提示词",
};
const imageInput = {
  model: "image-model",
  output_format: "png",
  prompt: "生成图片",
};

const requestCases = [
  {
    name: "模型目录",
    stage: "catalog",
    label: "模型目录读取",
    timeoutMs: 30_000,
    model: null,
    method: "GET",
    pathname: "/models",
    execute: (client) => client.listModels(),
  },
  {
    name: "Prompt Agent",
    stage: "prompt",
    label: "提示词生成",
    timeoutMs: 300_000,
    model: promptInput.model,
    method: "POST",
    pathname: "/responses",
    execute: (client) => client.generatePrompt(promptInput),
  },
  {
    name: "文生图",
    stage: "image",
    label: "图像生成",
    timeoutMs: 600_000,
    model: imageInput.model,
    method: "POST",
    pathname: "/images/generations",
    execute: (client) => client.generateImage(imageInput),
  },
  {
    name: "Responses 图生图",
    stage: "image",
    label: "图像生成",
    timeoutMs: 600_000,
    model: imageInput.model,
    method: "POST",
    pathname: "/responses",
    execute: (client) => client.generateImage({
      ...imageInput,
      images: [{ image_url: imageUrl }],
    }),
  },
  {
    name: "透明遮罩编辑",
    stage: "image",
    label: "图像生成",
    timeoutMs: 600_000,
    model: imageInput.model,
    method: "POST",
    pathname: "/images/edits",
    execute: (client) => client.editImage(imageInput),
  },
  {
    name: "单图分析",
    stage: "analysis",
    label: "图像分析",
    timeoutMs: 180_000,
    model: "analysis-model",
    method: "POST",
    pathname: "/responses",
    execute: (client) => client.analyzeImage({ ...promptInput, model: "analysis-model" }),
  },
  {
    name: "Responses 图片评审",
    stage: "review",
    label: "图像评审",
    timeoutMs: 180_000,
    model: "review-model",
    method: "POST",
    pathname: "/responses",
    execute: (client) => client.reviewImages({
      ...promptInput,
      imageUrls: [imageUrl, imageUrl],
      model: "review-model",
    }),
  },
  {
    name: "Claude 图片评审",
    stage: "review",
    label: "图像评审",
    timeoutMs: 180_000,
    model: "claude-review-model",
    method: "POST",
    pathname: "/chat/completions",
    execute: (client) => client.reviewImages({
      ...promptInput,
      imageUrls: [imageUrl, imageUrl],
      model: "claude-review-model",
    }),
  },
  {
    name: "风格反推",
    stage: "styleDna",
    label: "风格反推",
    timeoutMs: 300_000,
    model: "style-dna-model",
    method: "POST",
    pathname: "/responses",
    execute: (client) => client.generateStyleDna({
      messages: [{ role: "user", content: "提取风格" }],
      model: "style-dna-model",
      systemPrompt: "只返回 JSON",
    }),
  },
];

function waitForAbort(signal) {
  return new Promise((_resolve, reject) => {
    if (signal.aborted) reject(signal.reason);
    else signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
}

async function flushUntil(predicate) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (predicate()) return;
    await Promise.resolve();
  }
  assert.fail("离线请求未进入预期阶段");
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

function useClock(context) {
  context.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
  return context.mock.method(globalThis, "clearTimeout");
}

for (const requestCase of requestCases) {
  test(`${requestCase.name} 使用独立超时预算并保留失败阶段且不重试`, async (context) => {
    const clearTimeoutSpy = useClock(context);
    const diagnostics = [];
    let requestSignal;
    let requestCount = 0;
    context.mock.method(globalThis, "fetch", async (url, options) => {
      requestCount += 1;
      requestSignal = options.signal;
      assert.equal(new URL(url).pathname, `/v1${requestCase.pathname}`);
      assert.equal(options.method, requestCase.method);
      return waitForAbort(options.signal);
    });
    assert.deepEqual(ONEAPI_REQUEST_TIMEOUTS[requestCase.stage], {
      label: requestCase.label,
      timeoutMs: requestCase.timeoutMs,
    });
    const client = createOneApiClient("test-key", {
      diagnosticSink: (event) => diagnostics.push(event),
    });
    const outcome = requestCase.execute(client).then(
      () => ({ error: null }),
      (error) => ({ error }),
    );
    await flushUntil(() => Boolean(requestSignal));

    context.mock.timers.tick(requestCase.timeoutMs - 1);
    assert.equal(requestSignal.aborted, false);
    context.mock.timers.tick(1);
    const { error } = await outcome;

    assert.equal(error?.code, "timeout");
    assert.equal(error.statusCode, 504);
    assert.equal(error.stage, requestCase.stage);
    assert.equal(error.timeoutMs, requestCase.timeoutMs);
    assert.equal(error.message,
      `${requestCase.label}超过 ${requestCase.timeoutMs / 1000} 秒，已停止等待；上游任务可能仍在处理，请勿立即重复提交`);
    const failure = diagnostics.find((event) => event.event === "request_failed");
    assert.equal(failure.stage, requestCase.stage);
    assert.equal(failure.model, requestCase.model);
    assert.equal(failure.timeoutMs, requestCase.timeoutMs);
    assert.equal(failure.elapsedMs, requestCase.timeoutMs);
    assert.equal(failure.responseStatus, null);
    context.mock.timers.tick(requestCase.timeoutMs * 2);
    assert.equal(requestCount, 1);
    assert.equal(clearTimeoutSpy.mock.callCount(), 1);
  });
}

test("HTTP 已返回响应头但正文读取挂起仍受图像阶段时限约束", async (context) => {
  const clearTimeoutSpy = useClock(context);
  const diagnostics = [];
  let readingBody = false;
  let requestCount = 0;
  context.mock.method(globalThis, "fetch", async (_url, options) => {
    requestCount += 1;
    return {
      headers: new Headers({ "content-type": "application/json" }),
      ok: true,
      status: 200,
      json() {
        readingBody = true;
        return waitForAbort(options.signal);
      },
    };
  });
  const outcome = createOneApiClient("test-key", {
    diagnosticSink: (event) => diagnostics.push(event),
  }).editImage(imageInput).catch((error) => error);
  await flushUntil(() => readingBody);

  context.mock.timers.tick(600_000);
  const error = await outcome;

  assert.equal(error.code, "timeout");
  assert.equal(error.stage, "image");
  assert.equal(error.timeoutMs, 600_000);
  assert.equal(diagnostics[0].responseStatus, 200);
  assert.equal(requestCount, 1);
  assert.equal(clearTimeoutSpy.mock.callCount(), 1);
});

test("Prompt 接近时限完成后最终出图仍获得完整预算且成功会清理两个计时器", async (context) => {
  const clearTimeoutSpy = useClock(context);
  const requests = [];
  context.mock.method(globalThis, "fetch", (_url, options) => new Promise((resolve) => {
    requests.push({ resolve, signal: options.signal });
  }));
  const client = createOneApiClient("test-key", { diagnosticSink: () => {} });
  const prompt = client.generatePrompt(promptInput);
  await flushUntil(() => requests.length === 1);
  context.mock.timers.tick(299_999);
  requests[0].resolve(jsonResponse({ output_text: "最终提示词" }));
  assert.equal((await prompt).text, "最终提示词");

  const image = client.generateImage(imageInput);
  await flushUntil(() => requests.length === 2);
  context.mock.timers.tick(599_999);
  assert.equal(requests[0].signal.aborted, false);
  assert.equal(requests[1].signal.aborted, false);
  requests[1].resolve(jsonResponse({ data: [{ b64_json: "c2FtcGxl" }] }));
  assert.equal((await image).images.length, 1);

  context.mock.timers.tick(1_000_000);
  assert.equal(requests.every(({ signal }) => !signal.aborted), true);
  assert.equal(clearTimeoutSpy.mock.callCount(), 2);
});

test("主动取消与超时同轮发生时优先返回原始取消原因", async (context) => {
  const clearTimeoutSpy = useClock(context);
  const controller = new AbortController();
  const diagnostics = [];
  let started = false;
  context.mock.method(globalThis, "fetch", (_url, options) => {
    started = true;
    return waitForAbort(options.signal);
  });
  const outcome = createOneApiClient("test-key", {
    diagnosticSink: (event) => diagnostics.push(event),
    signal: controller.signal,
  }).generateImage(imageInput).catch((error) => error);
  await flushUntil(() => started);
  const reason = new Error("用户主动停止");
  reason.name = "AbortError";

  context.mock.timers.tick(600_000);
  controller.abort(reason);

  assert.equal(await outcome, reason);
  assert.equal(diagnostics[0].code, "AbortError");
  assert.equal(diagnostics[0].stage, "image");
  assert.equal(clearTimeoutSpy.mock.callCount(), 1);
});

test("已取消任务不发送收费 POST 且清理已创建的计时器", async (context) => {
  const clearTimeoutSpy = useClock(context);
  const controller = new AbortController();
  const reason = new Error("任务已停止");
  controller.abort(reason);
  const fetchSpy = context.mock.method(globalThis, "fetch", async () => {
    assert.fail("已取消任务不应触发 HTTP 请求");
  });

  await assert.rejects(createOneApiClient("test-key", {
    diagnosticSink: () => {},
    signal: controller.signal,
  }).editImage(imageInput), (error) => error === reason);

  assert.equal(fetchSpy.mock.callCount(), 0);
  assert.equal(clearTimeoutSpy.mock.callCount(), 1);
});

for (const failureMode of ["network", "upstream"]) {
  test(`${failureMode} 失败不会重试收费 POST 或遗留计时器`, async (context) => {
    const clearTimeoutSpy = useClock(context);
    let requestSignal;
    const fetchSpy = context.mock.method(globalThis, "fetch", async (_url, options) => {
      requestSignal = options.signal;
      if (failureMode === "network") throw new TypeError("socket closed");
      return jsonResponse({ error: { message: "模型暂不可用", code: "busy" } }, 503);
    });

    await assert.rejects(createOneApiClient("test-key", {
      diagnosticSink: () => {},
    }).generateImage(imageInput), (error) => {
      assert.equal(error.code, failureMode === "network" ? "network" : "busy");
      return true;
    });

    context.mock.timers.tick(1_000_000);
    assert.equal(requestSignal.aborted, false);
    assert.equal(fetchSpy.mock.callCount(), 1);
    assert.equal(clearTimeoutSpy.mock.callCount(), 1);
  });
}

async function startLoopbackServer(handler) {
  const server = createServer(handler);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    async close() {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

test("真实 HTTP 的响应头及正文延迟由阶段预算控制而非底层默认时限", {
  timeout: 10_000,
}, async (context) => {
  const pendingTimers = new Set();
  const body = JSON.stringify({ data: [{ b64_json: "c2FtcGxl" }] });
  const server = await startLoopbackServer((request, response) => {
    request.resume();
    if (request.url === "/body") {
      response.writeHead(200, { "content-type": "application/json" });
      response.write(body.slice(0, 9));
    }
    // undici 的解析器计时器约每 499ms 推进一次，留足两个时钟刻度供对照触发。
    const timer = setTimeout(() => {
      pendingTimers.delete(timer);
      if (response.destroyed) return;
      if (request.url === "/body") response.end(body.slice(9));
      else {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(body);
      }
    }, 1_500);
    pendingTimers.add(timer);
  });
  const shortTimeoutAgent = new Agent({
    bodyTimeout: 50,
    connections: 2,
    headersTimeout: 50,
  });
  const productionRequests = [];
  const diagnostics = [];
  context.mock.method(globalThis, "fetch", (url, options) => {
    productionRequests.push(options);
    const path = new URL(url).pathname.endsWith("/edits") ? "/body" : "/headers";
    return nativeFetch(`${server.origin}${path}`, options);
  });

  async function expectTransportTimeout(path, code) {
    await assert.rejects(async () => {
      const response = await nativeFetch(`${server.origin}${path}`, {
        dispatcher: shortTimeoutAgent,
        signal: AbortSignal.timeout(5_000),
      });
      await response.json();
    }, (error) => {
      assert.equal(error.cause?.code || error.code, code);
      return true;
    });
  }

  try {
    const client = createOneApiClient("test-key", {
      diagnosticSink: (event) => diagnostics.push(event),
    });
    const [, , generated, edited] = await Promise.all([
      expectTransportTimeout("/headers", "UND_ERR_HEADERS_TIMEOUT"),
      expectTransportTimeout("/body", "UND_ERR_BODY_TIMEOUT"),
      client.generateImage(imageInput),
      client.editImage(imageInput),
    ]);

    assert.equal(generated.images.length, 1);
    assert.equal(edited.images.length, 1);
    assert.equal(productionRequests.length, 2);
    assert.equal(productionRequests.every((options) => Boolean(options.dispatcher)), true);
    assert.equal(productionRequests.every((options) => options.dispatcher !== shortTimeoutAgent), true);
    assert.equal(diagnostics.some((event) => event.event === "request_failed"), false);
  } finally {
    for (const timer of pendingTimers) clearTimeout(timer);
    await shortTimeoutAgent.destroy();
    await server.close();
  }
});

test("生产 dispatcher 的真实 HTTP 正文等待仍可由用户立即取消", {
  timeout: 5_000,
}, async (context) => {
  const server = await startLoopbackServer((request, response) => {
    request.resume();
    response.writeHead(200, { "content-type": "application/json" });
    response.write('{"data":[');
  });
  let resolveHeaders;
  const headersReady = new Promise((resolve) => { resolveHeaders = resolve; });
  let requestCount = 0;
  context.mock.method(globalThis, "fetch", async (_url, options) => {
    requestCount += 1;
    const response = await nativeFetch(`${server.origin}/body`, options);
    resolveHeaders();
    return response;
  });
  const controller = new AbortController();
  const reason = new Error("用户停止真实正文等待");
  reason.name = "AbortError";
  const diagnostics = [];
  try {
    const outcome = createOneApiClient("test-key", {
      diagnosticSink: (event) => diagnostics.push(event),
      signal: controller.signal,
    }).editImage(imageInput).catch((error) => error);
    await headersReady;
    controller.abort(reason);

    assert.equal(await outcome, reason);
    assert.equal(requestCount, 1);
    assert.equal(diagnostics[0].stage, "image");
    assert.equal(diagnostics[0].responseStatus, 200);
    assert.equal(diagnostics[0].code, "AbortError");
  } finally {
    controller.abort(reason);
    await server.close();
  }
});

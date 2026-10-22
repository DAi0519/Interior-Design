/**
 * [INPUT]: 依赖node:test/assert、OneAPI客户端、内存fetch替身与AbortController
 * [OUTPUT]: 验证原生后台编辑的鉴权/图序/PNG字节、POST到GET轮询与结果费用归一化，以及取消和空结果失败不重提
 * [POS]: test 的OneAPI异步客户端集成测试，与独立轮询状态机测试互补，不访问外网或收费模型
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { createOneApiClient } from "../src/oneapi-client.mjs";
import { executeImageMaskFill } from "../src/image-mask-fill-service.mjs";

const generationRequest = {
  model: "gpt-image-2.5-sunburst", images: [
    { image_url: "data:image/png;base64,c291cmNl" },
    { image_url: "data:image/png;base64,cmVmZXJlbmNl" },
  ], prompt: "按用户指令修改目标物体", n: 1, size: "1536x1024",
  quality: "medium", output_format: "png", response_format: "b64_json",
};

test("异步编辑通过同一鉴权提交与查询，原样传PNG并归一化完整结果和费用", async context => {
  const calls = [];
  const submitted = [];
  context.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push({ url, options });
    assert.equal(options.headers.Authorization, "Bearer test-async-key");
    assert.equal(options.headers["Content-Type"], "application/json");
    assert.ok(options.signal instanceof AbortSignal);
    return calls.length === 1
      ? Response.json({ id: "resp_async_result", status: "queued" }, { status: 202 })
      : Response.json({ id: "resp_async_result", status: "completed", created_at: 42,
        output: [{ type: "image_generation_call", result: "cmVzdWx0" }],
        usage: { price: { currency: "CNY", exchange_rate: 7, payable_amount: 0.7 } } });
  });
  const client = createOneApiClient("test-async-key", { diagnosticSink: () => {} });
  const result = await client.editImageAsync(generationRequest, { onSubmitted(value) {
    submitted.push(value);
    assert.equal(calls.length, 1);
  } });
  assert.deepEqual(submitted, [{ id: "resp_async_result", status: "queued" }]);
  assert.deepEqual(calls.map(({ url, options }) => [url, options.method]), [
    ["https://oneapi.qunhequnhe.com/v1/responses", "POST"],
    ["https://oneapi.qunhequnhe.com/v1/responses/resp_async_result", "GET"],
  ]);
  const sent = JSON.parse(calls[0].options.body);
  assert.equal(sent.background, true);
  assert.deepEqual(sent.input[0].content.slice(1), generationRequest.images.map(image => ({
    type: "input_image", image_url: image.image_url,
  })));
  assert.deepEqual(result.images, [{ url: "data:image/png;base64,cmVzdWx0" }]);
  assert.equal(result.transport, "responses-background");
  assert.equal(result.requestId, "resp_async_result");
  assert.equal(result.created, 42);
  assert.equal(result.usageCost.cost, 0.7);
  assert.equal(result.usageCost.costUsd, 0.7 / 7);
});

test("异步编辑保留URL结果，完成但无产物时明确失败且不转同步或重提", async context => {
  let withImage = true;
  const calls = [];
  context.mock.method(globalThis, "fetch", async (url) => {
    calls.push(url);
    return Response.json({ id: "resp_completed", status: "completed",
      output: withImage ? [{ type: "image_generation_call", result: "https://example.com/native.png" }] : [] });
  });
  const client = createOneApiClient("test-key", { diagnosticSink: () => {} });
  assert.deepEqual((await client.editImageAsync(generationRequest)).images,
    [{ url: "https://example.com/native.png" }]);
  withImage = false;
  await assert.rejects(client.editImageAsync(generationRequest), error => error.code === "empty_image");
  assert.equal(calls.length, 2);
  assert.ok(calls.every(url => url.endsWith("/responses")));
});

test("异步HTTP正文读取中取消保留原始原因且不重提收费请求", async context => {
  const controller = new AbortController();
  const reason = new Error("停止本机等待");
  let reading;
  const bodyStarted = new Promise(resolve => { reading = resolve; });
  const calls = [];
  context.mock.method(globalThis, "fetch", async (_url, options) => {
    calls.push(options);
    return { ok: true, status: 202, headers: new Headers({ "content-type": "application/json" }),
      json() {
        reading();
        return new Promise((_resolve, reject) => {
          options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
        });
      } };
  });
  const pending = createOneApiClient("test-key", { signal: controller.signal, diagnosticSink: () => {} })
    .editImageAsync(generationRequest);
  await bodyStarted;
  controller.abort(reason);
  await assert.rejects(pending, error => error === reason);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].signal.aborted, true);
});

test("真实应用服务经原生异步客户端完成圈选，立即透传ID并逐字节交付模型PNG", async context => {
  const source = await sharp({ create: { width: 96, height: 64, channels: 3, background: "#243648" } }).png().toBuffer();
  const output = await sharp({ create: { width: 1536, height: 1024, channels: 3, background: "#586878" } }).png().toBuffer();
  const calls = [], progress = [];
  context.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push({ url, options });
    if (options.method === "POST") {
      assert.equal(JSON.parse(options.body).background, true);
      return Response.json({ id: "resp_native_png", status: "in_progress" }, { status: 202 });
    }
    assert.equal(progress.at(-1).upstreamResponseId, "resp_native_png");
    return Response.json({ id: "resp_native_png", status: "completed",
      output: [{ type: "image_generation_call", result: output.toString("base64") }] });
  });
  const result = await executeImageMaskFill({
    maskFillModel: "gptImage25Sunburst", maskFillMode: "prompt", prompt: "移除圈选的椅子",
    editRegion: { type: "polygon", points: [{ x: 0.2, y: 0.2 }, { x: 0.6, y: 0.3 }, { x: 0.4, y: 0.7 }] },
    referenceImages: [{ dataUrl: `data:image/png;base64,${source.toString("base64")}`, name: "source.png", type: "image/png", size: source.length }],
  }, {
    imageClient: createOneApiClient("test-key", { diagnosticSink: () => {} }),
    getOneApiModels: async () => [{ id: generationRequest.model }],
    onProgress: value => progress.push(value),
  });
  assert.deepEqual(Buffer.from(result.images[0].url.split(",")[1], "base64"), output);
  assert.equal(result.upstream.transport, "responses-background");
  assert.equal(result.upstream.metadata.upstreamAsync, true);
  assert.equal(result.upstream.requestId, "resp_native_png");
  assert.equal(result.upstream.metadata.protectedAreaComposited, false);
  assert.deepEqual(calls.map(call => call.options.method), ["POST", "GET"]);
});

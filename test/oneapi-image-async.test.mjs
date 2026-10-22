/**
 * [INPUT]: 依赖node:test、sharp合成PNG、可注入JSON请求与可取消时钟，以及OneAPI后台图像编辑构造/提交轮询边界
 * [OUTPUT]: 原PNG/图序/质量透传与mask零请求拒绝、单次POST同ID状态轮询、终态与ID校验、共享总截止时间/取消原Error与清理、失败不重提测试
 * [POS]: test 的OneAPI真实上游后台任务离线合同测试，不访问网络、不收费、不写飞书
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import { setImmediate as nextTurn } from "node:timers/promises";
import test from "node:test";
import sharp from "sharp";
import { buildAsyncImageEditRequest, runAsyncImageEdit } from "../src/oneapi-image-async.mjs";

const png = (width, height, background) => sharp({ create: { width, height, channels: 4, background } }).png().toBuffer();
const [sourceBytes, referenceBytes] = await Promise.all([
  png(96, 64, { r: 32, g: 64, b: 96, alpha: 0.25 }), png(48, 80, { r: 72, g: 96, b: 120, alpha: 1 }),
]);
const url = bytes => `data:image/png;base64,${bytes.toString("base64")}`;
const input = { model: "gpt-image-2.5-sunburst", images: [{ image_url: url(sourceBytes) }, { image_url: url(referenceBytes) }],
  prompt: "Remove the selected lamp.", size: "1536x1024", quality: "medium", n: 1, output_format: "png", response_format: "b64_json" };
const completed = { id: "resp_async_fixture", status: "completed", output: [{ type: "image_generation_call", result: sourceBytes.toString("base64") }],
  usage: { price: { currency: "USD", payable_amount: 0.0123 } } };
// -------- named timers/promises等待使用真实事件循环；不让mock Date下的微任务空转饿死轮询 --------
const realSetTimeout = globalThis.setTimeout;
async function until(predicate) {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await new Promise(resolve => realSetTimeout(resolve, 1));
  }
  assert.fail("离线异步请求未进入预期阶段");
}

test("后台图像请求保留原PNG透明度/参考顺序，固定background与工具参数且不压缩输入", async () => {
  const body = buildAsyncImageEditRequest(input);
  assert.deepEqual(body, { model: input.model, background: true, input: [{ type: "message", role: "user", content: [
    { type: "input_text", text: input.prompt }, { type: "input_image", image_url: input.images[0].image_url },
    { type: "input_image", image_url: input.images[1].image_url },
  ] }], tools: [{ type: "image_generation", n: 1, image_format: "png", response_format: "b64_json", size: input.size, quality: "medium" }] });
  assert.deepEqual(Buffer.from(body.input[0].content[1].image_url.split(",")[1], "base64"), sourceBytes);
  assert.deepEqual(Buffer.from(body.input[0].content[2].image_url.split(",")[1], "base64"), referenceBytes);
  assert.equal((await sharp(sourceBytes).metadata()).hasAlpha, true);
  assert.equal(Object.hasOwn(body, "mask"), false);
  assert.equal(Object.hasOwn(body.tools[0], "mask"), false);
  const defaults = buildAsyncImageEditRequest({ model: input.model, prompt: input.prompt, images: input.images });
  assert.equal(defaults.tools[0].image_format, "png");
  assert.equal(defaults.tools[0].response_format, "b64_json");
  assert.equal(buildAsyncImageEditRequest({ ...input, output_format: "jpeg" }).tools[0].image_format, "jpg");
});

test("mask/坏图片或输出参数在收费POST前拒绝，不能静默丢遮罩", async () => {
  let calls = 0;
  const request = async () => { calls++; assert.fail("非法输入不能发请求"); };
  for (const mask of [{ image_url: url(sourceBytes) }, {}, "mask"]) {
    await assert.rejects(runAsyncImageEdit({ ...input, mask }, { request }), error => error.statusCode === 409 && error.code === "async_mask_unsupported");
  }
  for (const images of [[], null, [{ image_url: " " }], [null]]) {
    await assert.rejects(runAsyncImageEdit({ ...input, images }, { request }), error => error.statusCode === 400 && error.code === "image_input");
  }
  await assert.rejects(runAsyncImageEdit({ ...input, output_format: "webp" }, { request }), error => error.code === "image_format");
  await assert.rejects(runAsyncImageEdit({ ...input, response_format: "invented" }, { request }), error => error.code === "image_response_format");
  assert.equal(calls, 0);
});

test("提交即通知真实ID，queued/in_progress仅查询同ID，完成后保留完整终态结果且只POST一次", async () => {
  const calls = [], events = [];
  const replies = [{ id: completed.id, status: "queued" }, { id: completed.id, status: "in_progress" }, completed];
  const result = await runAsyncImageEdit(input, { pollIntervalMs: 0,
    onSubmitted(info) { events.push(info); assert.equal(calls.length, 1, "拿到ID即回调，尚未查询任务"); },
    async request(path, options, details) {
      calls.push({ path, options, details });
      if (options.method === "GET") assert.equal(events.length, 1, "查询前业务已收到上游ID");
      return replies.shift();
    },
  });
  assert.equal(result, completed, "终态原对象与图片/费用载荷不被传输层重写");
  assert.deepEqual(events, [{ id: completed.id, status: "queued" }]);
  assert.deepEqual(calls.map(call => [call.path, call.options.method]), [["/responses", "POST"],
    [`/responses/${completed.id}`, "GET"], [`/responses/${completed.id}`, "GET"]]);
  assert.deepEqual(JSON.parse(calls[0].options.body), buildAsyncImageEditRequest(input));
  for (const call of calls) {
    assert.equal(call.details.model, input.model); assert.equal(call.details.stage, "image");
    assert.equal(call.details.signal, calls[0].details.signal);
    assert.ok(call.details.timeoutMs > 0 && call.details.timeoutMs <= 600_000);
  }
  assert.equal(calls[0].details.signal.aborted, false);
});

test("提交已完成不多查；终态失败/未知状态和非法提交ID均不重提收费POST", async () => {
  let calls = 0, submitted = 0;
  assert.equal(await runAsyncImageEdit(input, { async request() { calls++; return completed; }, onSubmitted() { submitted++; } }), completed);
  assert.equal(calls, 1); assert.equal(submitted, 1);
  for (const status of ["failed", "cancelled", "incomplete", "unknown"]) {
    const calls = [];
    await assert.rejects(runAsyncImageEdit(input, { async request(path, options) { calls.push(options.method); return { id: completed.id, status }; } }),
      error => error.code === (status === "unknown" ? "async_status" : `async_${status}`) && error.responseId === completed.id);
    assert.deepEqual(calls, ["POST"]);
  }
  for (const id of [undefined, "", "wrong-id", "resp_../other", "resp_x?query=1", 123]) {
    let calls = 0;
    await assert.rejects(runAsyncImageEdit(input, { async request() { calls++; return { id, status: "queued" }; } }), error => error.code === "async_response_id");
    assert.equal(calls, 1);
  }
});

test("查询缺ID/错ID拒绝交付，不能接受另一任务结果；GET失败保留原Error和已提交ID且不重新生成", async () => {
  for (const id of [undefined, "resp_other_task"]) {
    const methods = [];
    await assert.rejects(runAsyncImageEdit(input, { pollIntervalMs: 0, async request(path, options) {
      methods.push(options.method); return options.method === "POST" ? { id: completed.id, status: "queued" } : { ...completed, id };
    } }), error => error.code === "async_response_mismatch" && error.responseId === completed.id);
    assert.deepEqual(methods, ["POST", "GET"]);
  }
  for (const stage of ["POST", "GET"]) {
    const original = Object.assign(new Error("synthetic upstream failure"), { statusCode: 503, code: "busy" });
    const methods = [];
    await assert.rejects(runAsyncImageEdit(input, { pollIntervalMs: 0, async request(path, options) {
      methods.push(options.method);
      if (options.method === stage) throw original;
      return { id: completed.id, status: "queued" };
    } }), error => error === original && (stage === "POST" || error.responseId === completed.id));
    assert.deepEqual(methods, stage === "POST" ? ["POST"] : ["POST", "GET"]);
  }
});

test("已取消任务零POST，外部原始取消Error不被包装", async () => {
  const controller = new AbortController(), reason = Object.assign(new Error("用户已取消"), { name: "AbortError" });
  controller.abort(reason);
  await assert.rejects(runAsyncImageEdit(input, { signal: controller.signal, async request() { assert.fail("已取消不得收费提交"); } }), error => error === reason);
});

for (const phase of ["submit", "poll", "sleep", "callback"]) {
  test(`外部取消${phase}阶段立即结束并保留原Error，移除监听且无后续GET或收费重提`, async context => {
    const controller = new AbortController(), calls = [];
    const removeListener = context.mock.method(controller.signal, "removeEventListener");
    let callbackEntered = false;
    const outcome = runAsyncImageEdit(input, { signal: controller.signal, pollIntervalMs: phase === "sleep" ? 100_000 : 0,
      onSubmitted() { callbackEntered = true; if (phase === "callback") return new Promise(() => {}); },
      async request(path, options) {
        calls.push(options.method);
        if (phase === "submit" || options.method === "GET") return new Promise(() => {});
        return { id: completed.id, status: "queued" };
      },
    }).catch(error => error);
    await until(() => phase === "submit" ? calls.length === 1 : phase === "poll" ? calls.length === 2 : callbackEntered);
    const reason = Object.assign(new Error(`用户取消${phase}`), { name: "AbortError" });
    controller.abort(reason);
    assert.equal(await outcome, reason);
    assert.equal(removeListener.mock.callCount(), 1);
    const count = calls.length;
    await nextTurn();
    assert.equal(calls.length, count);
    assert.equal(calls.filter(method => method === "POST").length, 1);
  });
}

test("整体截止时间包含慢提交/轮询间隔/挂起查询，GET只获得剩余预算而非重置600秒", async context => {
  context.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
  const clearTimer = context.mock.method(globalThis, "clearTimeout"), calls = [];
  let submit, submitted = false;
  const outcome = runAsyncImageEdit(input, { timeoutMs: 100, pollIntervalMs: 20, onSubmitted() { submitted = true; },
    request(path, options, details) {
      calls.push({ method: options.method, details });
      return options.method === "POST" ? new Promise(resolve => { submit = resolve; }) : new Promise(() => {});
    },
  }).catch(error => error);
  await until(() => Boolean(submit));
  context.mock.timers.tick(60);
  submit({ id: completed.id, status: "queued" });
  await until(() => submitted);
  await nextTurn();
  context.mock.timers.tick(20);
  await until(() => calls.length === 2);
  assert.equal(calls[0].details.timeoutMs, 100);
  assert.equal(calls[1].details.timeoutMs, 20);
  context.mock.timers.tick(20);
  const error = await outcome;
  assert.equal(error.statusCode, 504); assert.equal(error.code, "timeout"); assert.equal(error.responseId, completed.id);
  assert.equal(error.timeoutMs, 100);
  assert.equal(calls[1].details.signal.aborted, true);
  context.mock.timers.tick(1_000);
  assert.deepEqual(calls.map(call => call.method), ["POST", "GET"]);
  assert.ok(clearTimer.mock.callCount() >= 1);
});

for (const phase of ["submit", "sleep", "callback"]) {
  test(`总截止时间覆盖${phase}挂起且清理计时器，不追加请求`, async context => {
    context.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
    const clearTimer = context.mock.method(globalThis, "clearTimeout");
    let calls = 0, callbackEntered = false;
    const outcome = runAsyncImageEdit(input, { timeoutMs: 100, pollIntervalMs: 1_000,
      onSubmitted() { callbackEntered = true; if (phase === "callback") return new Promise(() => {}); },
      async request() { calls++; return phase === "submit" ? new Promise(() => {}) : { id: completed.id, status: "queued" }; },
    }).catch(error => error);
    await until(() => phase === "submit" ? calls === 1 : callbackEntered);
    context.mock.timers.tick(100);
    const error = await outcome;
    assert.equal(error.code, "timeout"); assert.equal(error.statusCode, 504);
    if (phase !== "submit") assert.equal(error.responseId, completed.id);
    context.mock.timers.tick(1_000);
    assert.equal(calls, 1);
    assert.ok(clearTimer.mock.callCount() >= 1);
  });
}

test("取消和截止时间同轮发生时保留外部原始取消原因", async context => {
  context.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
  const controller = new AbortController(); let started = false;
  const outcome = runAsyncImageEdit(input, { timeoutMs: 100, signal: controller.signal,
    async request() { started = true; return new Promise(() => {}); },
  }).catch(error => error);
  await until(() => started);
  context.mock.timers.tick(100);
  const reason = Object.assign(new Error("用户主动停止"), { name: "AbortError" });
  controller.abort(reason);
  assert.equal(await outcome, reason);
});

/**
 * [INPUT]: 依赖 node:test/assert 与 src/runtime-cache.mjs 的异步 TTL 缓存
 * [OUTPUT]: 对外提供缓存命中、并发去重、过期和失败清理的回归保障
 * [POS]: test 的运行时缓存基础设施测试，不访问网络或真实飞书
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";

import { createAsyncTtlCache } from "../src/runtime-cache.mjs";

test("并发未命中只执行一次加载器且 TTL 内复用结果", async () => {
  let calls = 0;
  const cache = createAsyncTtlCache();
  const load = async () => ({ value: ++calls });

  const [first, second] = await Promise.all([
    cache.get("style", load),
    cache.get("style", load),
  ]);
  const third = await cache.get("style", load);

  assert.deepEqual(first, { value: 1 });
  assert.strictEqual(first, second);
  assert.strictEqual(first, third);
  assert.equal(calls, 1);
});

test("TTL 到期、主动刷新和加载失败均按预期失效", async () => {
  let currentTime = 0;
  let calls = 0;
  const cache = createAsyncTtlCache({ now: () => currentTime, ttlMs: 10 });
  const load = async () => ++calls;

  assert.equal(await cache.get("agent", load), 1);
  currentTime = 11;
  assert.equal(await cache.get("agent", load), 2);
  assert.equal(await cache.get("agent", load, { force: true }), 3);
  await assert.rejects(() => cache.get("broken", async () => {
    throw new Error("broken");
  }), /broken/);
  assert.equal(await cache.get("broken", load), 4);
});

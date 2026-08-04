/**
 * [INPUT]: 依赖 node:test/assert 与 benchmark-jobs.mjs 的可注入异步任务
 * [OUTPUT]: 对外提供评测任务即时入队、阶段/Base 落库状态、进度更新、完成与可诊断失败状态回归保障
 * [POS]: test 的 Benchmark 后台任务测试，不调用真实生图或评分服务
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";

import { createBenchmarkJobRegistry } from "../src/benchmark-jobs.mjs";

async function nextTurn() {
  await new Promise((resolve) => setImmediate(resolve));
}

test("评测任务入队后公开进度并保留结果", async () => {
  const registry = createBenchmarkJobRegistry();
  const queued = registry.enqueue("job-1", "review", async (update) => {
    update({ completed: 1, message: "已评分一张", persisted: true, phase: "review", total: 2 });
    return { reviewed: 2 };
  });
  assert.equal(queued.status, "running");
  assert.equal(queued.storage, "本地评分版本库");
  await nextTurn();
  const completed = registry.get("job-1");
  assert.equal(completed.status, "success");
  assert.equal(completed.phase, "review");
  assert.equal(completed.persisted, true);
  assert.deepEqual(completed.result, { reviewed: 2 });
});

test("评测任务失败时公开失败阶段、Base 落库状态和具体错误", async () => {
  const registry = createBenchmarkJobRegistry();
  registry.enqueue("job-2", "generation", async (update) => {
    update({ message: "正在冻结配置", persisted: false, phase: "config-write", total: 3 });
    throw new Error("上游失败");
  });
  await nextTurn();
  const failed = registry.get("job-2");
  assert.equal(failed.error, "上游失败");
  assert.equal(failed.message, "冻结生成配置失败");
  assert.equal(failed.phase, "config-write");
  assert.equal(failed.persisted, false);
  assert.equal(failed.storage, "Benchmark Base");
});

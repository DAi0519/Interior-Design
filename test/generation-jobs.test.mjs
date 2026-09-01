/**
 * [INPUT]: 依赖 node:test/assert 与 generation-jobs.mjs 的可注入异步任务、进度及并发批处理
 * [OUTPUT]: 对外提供日常生图任务即时入队、查询恢复、领域阶段快照透传、有界并发、保序与部分失败回归保障
 * [POS]: test 的可恢复生成任务测试，不调用真实生图服务
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  createGenerationJobRegistry,
  runGenerationJobBatch,
} from "../src/generation-jobs.mjs";

async function nextTurn() {
  await new Promise((resolve) => setImmediate(resolve));
}

test("生成任务入队后可查询进度与完整结果", async () => {
  const registry = createGenerationJobRegistry();
  const queued = registry.enqueue(
    "generation-123456789012",
    { featureMode: "whiteModel", stages: { generated: 0 }, total: 1 },
    async (update) => {
      update({ completed: 1, stages: { generated: 1 } });
      return { outcomes: [{ status: "fulfilled" }] };
    },
  );
  assert.equal(queued.status, "running");
  assert.equal(queued.featureMode, "whiteModel");
  await nextTurn();
  const completed = registry.get("generation-123456789012");
  assert.equal(completed.status, "success");
  assert.equal(completed.completed, 1);
  assert.deepEqual(completed.stages, { generated: 1 });
  assert.deepEqual(completed.result, {
    outcomes: [{ status: "fulfilled" }],
  });
});

test("批生成最多两路并发、按输入保序并保留单项失败", async () => {
  let active = 0;
  let maxActive = 0;
  const progress = [];
  const outcomes = await runGenerationJobBatch({
    concurrency: 2,
    items: ["A", "B", "C"].map((label) => ({ key: label, label })),
    onProgress: ({ completed }) => progress.push(completed),
    async execute(item) {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await nextTurn();
      active -= 1;
      if (item.key === "B") throw new Error("B 失败");
      return { id: item.key };
    },
  });
  assert.equal(maxActive, 2);
  assert.deepEqual(outcomes.map((outcome) => outcome.item.key), ["A", "B", "C"]);
  assert.deepEqual(outcomes.map((outcome) => outcome.status), [
    "fulfilled",
    "rejected",
    "fulfilled",
  ]);
  assert.equal(outcomes[1].reason.message, "B 失败");
  assert.deepEqual(progress, [1, 2, 3]);
});

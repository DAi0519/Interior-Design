/**
 * [INPUT]: 依赖 node:test/assert 与 src/sync-jobs.mjs 的进程内后台任务注册表
 * [OUTPUT]: 对外提供非阻塞入队、幂等、成功与失败状态查询回归保障
 * [POS]: test 的飞书后台同步调度测试，不执行真实飞书写入
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";

import { createSyncJobRegistry } from "../src/sync-jobs.mjs";

function nextTurn() {
  return new Promise((resolve) => setImmediate(resolve));
}

test("入队立即返回 pending，同一 generationId 只执行一次", async () => {
  let complete;
  let calls = 0;
  const registry = createSyncJobRegistry();
  const task = () => {
    calls += 1;
    return new Promise((resolve) => {
      complete = resolve;
    });
  };

  assert.equal(registry.enqueue("gen1", task).status, "pending");
  assert.equal(registry.enqueue("gen1", task).status, "pending");
  await nextTurn();
  assert.equal(calls, 1);

  complete({ ok: true, recordId: "rec1", recordUrl: "https://example.com" });
  await nextTurn();
  assert.deepEqual(registry.get("gen1"), {
    error: null,
    generationId: "gen1",
    recordId: "rec1",
    recordUrl: "https://example.com",
    status: "success",
  });
});

test("同步返回失败时保留错误与已创建记录", async () => {
  const registry = createSyncJobRegistry();
  registry.enqueue("gen2", async () => ({
    error: "附件上传失败",
    ok: false,
    recordId: "rec2",
    recordUrl: "https://example.com/rec2",
  }));
  await nextTurn();

  assert.equal(registry.get("gen2").status, "failed");
  assert.equal(registry.get("gen2").error, "附件上传失败");
  assert.equal(registry.get("gen2").recordId, "rec2");
});

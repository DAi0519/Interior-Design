/**
 * [INPUT]: 依赖 node:test/assert 与 benchmark-job-ui.js 的持久化任务投影和失败出图恢复输入纯函数
 * [OUTPUT]: 对外提供部分失败任务文案、完整进度、重试准入及同实验冻结参数恢复回归保障
 * [POS]: test 的 Benchmark 任务恢复前端护栏，不访问 DOM、Base 或模型
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  generationRetryInput,
  persistedGenerationJob,
  retryableFailedImages,
} from "../public/benchmark-job-ui.js";

const partialExperiment = {
  completedAt: "2026-08-05T04:00:00.000Z",
  experimentId: "EXP-PARTIAL",
  groupId: "EXP-PARTIAL",
  options: {
    caseIds: ["CASE-1"],
    draftConfig: { imageModelKeys: ["banana2", "aiTextureEnhancement"] },
    maxCases: 1,
  },
  result: { failedImages: 1, generatedImages: 3, skippedImages: 0 },
  status: "completed",
  summary: { imageRuns: 4 },
};

test("部分失败的持久化任务保留完整进度并暴露重试数量", () => {
  const job = persistedGenerationJob(partialExperiment);

  assert.equal(job.completed, 4);
  assert.equal(job.total, 4);
  assert.equal(job.message, "任务完成，1 张出图失败");
  assert.equal(retryableFailedImages(job), 1);
});

test("失败出图沿用同一实验与冻结参数发起断点重试", () => {
  const input = generationRetryInput(partialExperiment);

  assert.equal(input.experimentId, "EXP-PARTIAL");
  assert.equal(input.groupId, "EXP-PARTIAL");
  assert.deepEqual(input.caseIds, ["CASE-1"]);
  assert.deepEqual(input.draftConfig.imageModelKeys, ["banana2", "aiTextureEnhancement"]);
  assert.throws(
    () => generationRetryInput({ ...partialExperiment, result: { failedImages: 0 } }),
    /没有可重试的失败出图/,
  );
});

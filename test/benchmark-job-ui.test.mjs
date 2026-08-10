/**
 * [INPUT]: 依赖 node:test/assert 与 benchmark-job-ui.js 的持久化任务投影、停止/继续准入和失败出图恢复输入纯函数
 * [OUTPUT]: 对外提供运行中出图停止准入、停止任务真实进度与继续生成、部分失败任务文案、出图重试准入、评分断点继续及同实验冻结参数恢复回归保障
 * [POS]: test 的 Benchmark 任务恢复前端护栏，不访问 DOM、Base 或模型
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  canCancelGenerationJob,
  canResumeGenerationJob,
  generationResumeInput,
  generationRetryInput,
  persistedGenerationJob,
  reviewResumeLabel,
  retryableFailedImages,
} from "../public/benchmark-job-ui.js";

test("只有运行中的生成任务显示停止出图", () => {
  assert.equal(canCancelGenerationJob({ kind: "generation", status: "running" }), true);
  assert.equal(canCancelGenerationJob({ kind: "generation", status: "cancelled" }), false);
  assert.equal(canCancelGenerationJob({ kind: "review", status: "running" }), false);
});

test("已停止的生成任务显示真实进度并沿用冻结参数继续", () => {
  const experiment = {
    experimentId: "EXP-STOPPED",
    groupId: "EXP-STOPPED",
    options: { caseIds: ["CASE-1"], maxCases: 1 },
    status: "cancelled",
    summary: { imageRuns: 668, processedImages: 143 },
  };
  const job = persistedGenerationJob(experiment);
  const input = generationResumeInput(experiment);

  assert.equal(job.completed, 143);
  assert.equal(job.total, 668);
  assert.equal(canResumeGenerationJob(job), true);
  assert.equal(input.experimentId, "EXP-STOPPED");
  assert.deepEqual(input.caseIds, ["CASE-1"]);
  assert.throws(() => generationResumeInput({ ...experiment, status: "completed" }), /不是已停止状态/);
});

test("评分失败卡显示剩余结果的继续动作", () => {
  assert.equal(reviewResumeLabel({ completed: 1, phase: "review", status: "failed", total: 16 }), "继续评分剩余 15 张");
  assert.equal(reviewResumeLabel({ completed: 0, phase: "review", status: "failed", total: 16 }), "重试评分 16 张");
  assert.equal(reviewResumeLabel({ completed: 1, phase: "generation", status: "failed", total: 16 }), "");
});

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

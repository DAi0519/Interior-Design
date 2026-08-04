/**
 * [INPUT]: 依赖 node:test/assert 与 benchmark-review-ui.js 的可评分实验筛选、最新评分选择/汇总及任务归属纯函数
 * [OUTPUT]: 对外提供当前样本集评分范围、逐图结果版本、汇总指标和评分任务不跳页的回归保障
 * [POS]: test 的 Benchmark AI 评分前端护栏，不访问 DOM、Base 或模型
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  countLegacyReviewResults,
  jobPanelFor,
  scopeReviewableExperiments,
  selectLatestReviewResults,
  summarizeReviewResults,
} from "../public/benchmark-review-ui.js";

test("AI 评分只列出当前样本集已有成功结果的实验", () => {
  const result = scopeReviewableExperiments([{
    cases: [
      { caseId: "CASE-1", resultCount: 12, reviewedCount: 3 },
      { caseId: "CASE-2", resultCount: 4, reviewedCount: 4 },
    ],
    experimentId: "EXP-DONE",
    status: "completed",
  }, {
    cases: [{ caseId: "CASE-3", resultCount: 8, reviewedCount: 0 }],
    experimentId: "EXP-OTHER",
    status: "completed",
  }], ["CASE-1"]);

  assert.deepEqual(result.map((item) => ({
    experimentId: item.experimentId,
    resultCount: item.resultCount,
    reviewedCount: item.reviewedCount,
  })), [{ experimentId: "EXP-DONE", resultCount: 12, reviewedCount: 3 }]);
});

test("AI 评分任务留在评分页，出图任务留在批量运行页", () => {
  assert.equal(jobPanelFor({ kind: "review" }), "review");
  assert.equal(jobPanelFor({ phase: "review" }), "review");
  assert.equal(jobPanelFor({ kind: "generation" }), "run");
});

test("评分结果只展示当前实验和样本集内每个 Run 的最新版本", () => {
  const reviews = [
    { caseId: "CASE-1", compatible: true, consistencyScore: 3, createdAt: "2026-08-04T08:00:00Z", experimentId: "EXP-1", renderQualityScore: 3, runId: "RUN-1", styleMaterialScore: 3, usable: true },
    { caseId: "CASE-1", compatible: true, consistencyScore: 4, createdAt: "2026-08-04T09:00:00Z", experimentId: "EXP-1", renderQualityScore: 5, runId: "RUN-1", styleMaterialScore: 3, usable: true },
    { caseId: "CASE-1", compatible: false, createdAt: "2026-08-04T09:30:00Z", experimentId: "EXP-1", imageQuality: 5, instructionFollowing: 5, runId: "RUN-LEGACY", specializedScore: 5, usable: false },
    { caseId: "CASE-2", compatible: true, createdAt: "2026-08-04T09:00:00Z", experimentId: "EXP-1", runId: "RUN-2", usable: false },
    { caseId: "CASE-1", compatible: true, createdAt: "2026-08-04T09:00:00Z", experimentId: "EXP-2", runId: "RUN-3", usable: false },
  ];

  const selected = selectLatestReviewResults(reviews, "EXP-1", ["CASE-1"]);
  const summary = summarizeReviewResults(selected);

  assert.equal(selected.length, 1);
  assert.equal(selected[0].renderQualityScore, 5);
  assert.equal(countLegacyReviewResults(reviews, "EXP-1", ["CASE-1"]), 1);
  assert.deepEqual(summary, {
    consistencyScore: 4,
    reviewed: 1,
    renderQualityScore: 5,
    styleMaterialScore: 3,
    usable: 1,
  });
});

/**
 * [INPUT]: 依赖 node:test/assert 与 benchmark-review.mjs 的评分解析、准入和统计函数
 * [OUTPUT]: 对外提供 AI 评分 JSON 契约、可用图漏斗和模型分类分析的纯函数回归保障
 * [POS]: test 的 Benchmark AI 评审领域测试，不调用真实评分模型
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  BENCHMARK_REVIEW_PROTOCOL_VERSION,
  isUsableReview,
  parseBenchmarkReviewOutput,
  summarizeBenchmarkAnalysis,
} from "../src/benchmark-review.mjs";

test("AI 评分解析固定三维分数、标签和置信度", () => {
  const review = parseBenchmarkReviewOutput(`\`\`\`json
    {"reviewable":true,"consistency_score":4,"style_material_score":3,"render_quality_score":5,"issue_tags":["artifact"],"reason":"结构保持良好","confidence":0.86}
  \`\`\``);

  assert.equal(review.consistencyScore, 4);
  assert.equal(review.protocolVersion, BENCHMARK_REVIEW_PROTOCOL_VERSION);
  assert.deepEqual(review.issueTags, ["artifact"]);
  assert.equal(isUsableReview(review), true);
  assert.throws(
    () => parseBenchmarkReviewOutput('{"reviewable":true,"consistency_score":6,"style_material_score":3,"render_quality_score":3,"issue_tags":[],"reason":"","confidence":0.5}'),
    /1-5/,
  );
});

test("不可评审结果允许空分数但不进入可用图", () => {
  const review = parseBenchmarkReviewOutput(
    '{"reviewable":false,"consistency_score":null,"style_material_score":null,"render_quality_score":null,"issue_tags":["unreviewable"],"reason":"结果不可见","confidence":1}',
  );
  assert.equal(review.renderQualityScore, null);
  assert.equal(isUsableReview(review), false);
});

test("分析按模型和类别汇总成功率、可用图率与 P95", () => {
  const analysis = summarizeBenchmarkAnalysis({
    caseMetadata: [{ caseId: "CASE-1", category: "客厅" }],
    results: [
      { caseId: "CASE-1", durationSeconds: 10, model: "Model A", runId: "RUN-1", status: "成功" },
      { caseId: "CASE-1", durationSeconds: 20, model: "Model A", runId: "RUN-2", status: "失败" },
    ],
    reviews: [{
      consistencyScore: 4,
      protocolVersion: BENCHMARK_REVIEW_PROTOCOL_VERSION,
      renderQualityScore: 4,
      reviewable: true,
      runId: "RUN-1",
      styleMaterialScore: 3,
    }],
  });

  assert.equal(analysis.summary.generated, 1);
  assert.equal(analysis.summary.usable, 1);
  assert.equal(analysis.summary.p95Seconds, 20);
  assert.equal(analysis.groups[0].successRate, 0.5);
  assert.equal(analysis.groups[0].category, "客厅");
});

test("旧协议评分不进入正式分析和可用图漏斗", () => {
  const analysis = summarizeBenchmarkAnalysis({
    results: [{ caseId: "CASE-1", model: "Model A", runId: "RUN-1", status: "成功" }],
    reviews: [{
      imageQuality: 5,
      instructionFollowing: 5,
      reviewable: true,
      runId: "RUN-1",
      specializedScore: 5,
    }],
  });

  assert.equal(analysis.summary.reviewed, 0);
  assert.equal(analysis.summary.usable, 0);
});

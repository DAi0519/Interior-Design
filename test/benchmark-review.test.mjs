/**
 * [INPUT]: 依赖 node:test/assert 与 benchmark-review.mjs 的 v3.1 单次评分解析、本地校准、加权准入、飞书可读细则投影和统计函数
 * [OUTPUT]: 对外提供 seven_evaluate_v3.1 单次调用、小数分、证据隔离提示词、完整 JSON 提取/严格契约/修复、输入准入、问题严重度封顶、评分细则完整性、旧协议隔离与可用图漏斗回归保障
 * [POS]: test 的 Benchmark AI 评审领域测试，不调用真实评分模型
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  BENCHMARK_REVIEW_PROTOCOL_VERSION,
  BENCHMARK_REVIEW_SYSTEM_PROMPT,
  calibratedBenchmarkScore,
  formatBenchmarkReviewDetails,
  isUsableReview,
  parseBenchmarkReviewOutput,
  pendingBenchmarkReviewRuns,
  scoreBenchmarkImage,
  summarizeBenchmarkAnalysis,
  weightedBenchmarkScore,
} from "../src/benchmark-review.mjs";

test("断点继续只保留尚无正式协议评分的 Run", () => {
  const candidates = [{ runId: "RUN-1" }, { runId: "RUN-2" }];
  const reviews = [
    { experimentId: "EXP-1", protocolVersion: BENCHMARK_REVIEW_PROTOCOL_VERSION, runId: "RUN-1" },
    { experimentId: "EXP-1", protocolVersion: "legacy", runId: "RUN-2" },
  ];
  assert.deepEqual(pendingBenchmarkReviewRuns(candidates, reviews, "EXP-1", true), [{ runId: "RUN-2" }]);
  assert.equal(pendingBenchmarkReviewRuns(candidates, reviews, "EXP-1", false).length, 2);
});

function scoreBlock(score, deductionReason = score === 5 ? "无明显扣分点" : "存在可见问题") {
  return { comment: "简洁结论", deduction_reason: deductionReason, evidence: "可见证据", score };
}

function evaluationPayload({ consistency = 5, rendering = 5, style = 5, valid = true, issues = [] } = {}) {
  return JSON.stringify({
    consistency: valid ? scoreBlock(consistency) : null,
    input_eligibility: {
      category: valid ? "valid_white_model" : "already_materialized",
      reason: valid ? "" : "输入已经完成材质化",
      valid,
    },
    issues,
    rendering_quality: valid ? scoreBlock(rendering) : null,
    style_material: valid ? scoreBlock(style) : null,
  });
}

test("v3.1 单次响应接受 1-5 小数分且拒绝越界分和模型自报总分", () => {
  const parsed = parseBenchmarkReviewOutput(evaluationPayload({ consistency: 4, rendering: 3, style: 4 }));

  assert.equal(parsed.details.consistency.score, 4);
  assert.equal(parsed.details.rendering_quality.score, 3);
  assert.throws(
    () => parseBenchmarkReviewOutput(JSON.stringify({
      ...JSON.parse(evaluationPayload()),
      weighted_score: 3.5,
    })),
    /字段不符合评分协议/,
  );
  assert.equal(parseBenchmarkReviewOutput(
    evaluationPayload({ rendering: 4.5 }),
  ).details.rendering_quality.score, 4.5);
  assert.throws(() => parseBenchmarkReviewOutput(evaluationPayload({ rendering: 5.1 })), /1-5 数值/);
});

test("评分响应允许 JSON 前后带说明并诊断截断内容", () => {
  const parsed = parseBenchmarkReviewOutput(`结果如下：\n\`\`\`json\n${evaluationPayload({ style: 4.25 })}\n\`\`\``);
  assert.equal(parsed.details.style_material.score, 4.25);
  assert.throws(() => parseBenchmarkReviewOutput('{"input_eligibility":'), /可能被截断/);
});

test("单次 Prompt 固定三个维度的证据边界且不重复扣分", () => {
  assert.match(BENCHMARK_REVIEW_SYSTEM_PROMPT, /必须同时比较 source image 和 generated image/);
  assert.match(BENCHMARK_REVIEW_SYSTEM_PROMPT, /评分主体：只评价 generated image/);
  assert.match(BENCHMARK_REVIEW_SYSTEM_PROMPT, /只能依据 generated image 自身的可见结果/);
  assert.match(BENCHMARK_REVIEW_SYSTEM_PROMPT, /不得通过两图比较来评价本维度/);
  assert.match(BENCHMARK_REVIEW_SYSTEM_PROMPT, /同一问题不得跨维度重复扣分/);
});

test("问题严重度和 5 分扣分原因在本地封顶", () => {
  const major = calibratedBenchmarkScore("consistency", scoreBlock(5), [{
    description: "主要家具位置变化",
    dimension: "consistency",
    evidence: "沙发偏移",
    severity: "MAJOR",
  }]);
  const contradictoryFive = calibratedBenchmarkScore(
    "style_material",
    scoreBlock(5, "局部材质层次不足"),
    [],
  );

  assert.equal(major.score, 3);
  assert.equal(major.adjustment.rawScore, 5);
  assert.equal(contradictoryFive.score, 4);
});

test("飞书评分细则保留逐维证据、扣分问题和本地校准", () => {
  const details = formatBenchmarkReviewDetails({
    consistencyScore: 3,
    issues: [{
      description: "主要家具位置变化",
      dimension: "consistency",
      evidence: "沙发向右偏移",
      severity: "MAJOR",
    }],
    protocolVersion: BENCHMARK_REVIEW_PROTOCOL_VERSION,
    renderQualityScore: 4,
    reviewBatchId: "REVIEW-1",
    reviewable: true,
    scoreAdjustments: [{
      adjustedScore: 3,
      dimension: "consistency",
      rawScore: 5,
      reason: "按 MAJOR 问题封顶",
    }],
    scoreDetails: {
      consistency: scoreBlock(5, "沙发位置变化"),
      rendering_quality: scoreBlock(4, "局部反射偏硬"),
      style_material: scoreBlock(4, "木材层次略弱"),
    },
    scorerModelId: "gemini-3.1-pro",
    styleMaterialScore: 4,
    weightedScore: 3.6,
  });

  assert.match(details, /评分协议：white-model-review@v3\.1-single-pass/);
  assert.match(details, /保持一致性：3 \/ 5/);
  assert.match(details, /证据：可见证据/);
  assert.match(details, /问题明细：[\s\S]*MAJOR · 保持一致性 · 主要家具位置变化/);
  assert.match(details, /本地校准：[\s\S]*保持一致性：5 → 3/);
  assert.match(details, /加权结论：3\.60 \/ 5 · 可用/);
});

test("每张图只调用一次并按 40/30/30 本地计算", async () => {
  const calls = [];
  const responses = [evaluationPayload({
    consistency: 5,
    issues: [{
      description: "镜头有轻微偏移",
      dimension: "consistency",
      evidence: "右侧墙面变窄",
      severity: "MINOR",
    }],
    rendering: 2,
    style: 4,
  })];
  const client = {
    async reviewImages(input) {
      calls.push(input);
      return { requestId: `req-${calls.length}`, text: responses.shift() };
    },
  };

  const review = await scoreBenchmarkImage({
    client,
    model: "gpt-5.5",
    referenceImageUrl: "data:image/png;base64,source",
    resultImageUrl: "data:image/png;base64,result",
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, "gpt-5.5");
  assert.doesNotMatch(calls[0].systemPrompt + calls[0].userPrompt, /gpt-5\.5/);
  assert.equal(review.consistencyScore, 4);
  assert.equal(review.weightedScore, 3.4);
  assert.equal(isUsableReview(review), true);
  assert.deepEqual(review.requestIds, ["req-1"]);
  assert.equal(review.scoreAdjustments.length, 1);
});

test("单阶段 JSON 契约错误会携带校验原因重试一次并保留两次原文", async () => {
  const calls = [];
  const responses = ["{}", evaluationPayload()];
  const review = await scoreBenchmarkImage({
    client: {
      async reviewImages(input) {
        calls.push(input);
        return { requestId: `req-${calls.length}`, text: responses.shift() };
      },
    },
    model: "gpt-5.5",
    referenceImageUrl: "source",
    resultImageUrl: "result",
  });

  assert.equal(calls.length, 2);
  assert.match(calls[1].userPrompt, /校验错误/);
  assert.equal(review.rawEvaluationResponses.length, 2);
  assert.deepEqual(review.requestIds, ["req-1", "req-2"]);
});

test("输入不准入时同一次响应返回空三维分数", async () => {
  let calls = 0;
  const review = await scoreBenchmarkImage({
    client: {
      async reviewImages() {
        calls += 1;
        return { requestId: "req-invalid", text: evaluationPayload({ valid: false }) };
      },
    },
    model: "gpt-5.5",
    referenceImageUrl: "source",
    resultImageUrl: "result",
  });

  assert.equal(calls, 1);
  assert.equal(review.reviewable, false);
  assert.equal(review.weightedScore, null);
  assert.equal(isUsableReview(review), false);
});

test("可用线只看本地三维加权分大于等于 3.0", () => {
  const review = {
    consistencyScore: 2,
    protocolVersion: BENCHMARK_REVIEW_PROTOCOL_VERSION,
    renderQualityScore: 4,
    reviewable: true,
    styleMaterialScore: 4,
  };

  assert.equal(weightedBenchmarkScore(review), 3.2);
  assert.equal(isUsableReview(review), true);
});

test("分析按模型和类别汇总加权均分、可用图率与 P95", () => {
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
  assert.equal(analysis.groups[0].meanScore, 3.7);
  assert.equal(analysis.groups[0].successRate, 0.5);
  assert.equal(analysis.groups[0].category, "客厅");
});

test("旧协议评分不进入正式分析和可用图漏斗", () => {
  const analysis = summarizeBenchmarkAnalysis({
    results: [{ caseId: "CASE-1", model: "Model A", runId: "RUN-1", status: "成功" }],
    reviews: [{
      consistencyScore: 5,
      protocolVersion: "white-model-review@v2",
      renderQualityScore: 5,
      reviewable: true,
      runId: "RUN-1",
      styleMaterialScore: 5,
    }],
  });

  assert.equal(analysis.summary.reviewed, 0);
  assert.equal(analysis.summary.usable, 0);
});

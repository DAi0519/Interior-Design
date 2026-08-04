/**
 * [INPUT]: 依赖可注入的 OneAPI 多图评审客户端，接收白模参考图、生成结果和评分模型
 * [OUTPUT]: 对外提供与飞书同构的版本化三维评分协议、严格 JSON 解析、旧协议隔离、可用图判定、P95 与分模型/分类分析
 * [POS]: src 的 AI 评审领域层，评分规则与传输、存储和界面解耦
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export const BENCHMARK_REVIEW_PROTOCOL_VERSION = "white-model-review@v2";

export const BENCHMARK_REVIEW_DIMENSIONS = Object.freeze([
  Object.freeze({ key: "consistencyScore", label: "保持一致性", weight: 0.4 }),
  Object.freeze({ key: "styleMaterialScore", label: "风格与材质", weight: 0.3 }),
  Object.freeze({ key: "renderQualityScore", label: "渲染质量", weight: 0.3 }),
]);

export const BENCHMARK_REVIEW_SYSTEM_PROMPT = `你是室内设计白模渲染 Benchmark 评审员。输入第一张图是白模参考图，第二张图是生成结果图。必须严格使用飞书 Benchmark Base 的正式三维口径，不评价个人审美偏好：
1. 保持一致性：比较空间结构、镜头视角、门窗和主要家具是否忠实保持。
2. 风格与材质：比较目标风格是否生效、主要对象与材质是否匹配自然。
3. 渲染质量：评价光影、细节、清晰度以及畸变、融化、曝光等瑕疵。
必须只返回 JSON：
{"reviewable":true,"consistency_score":1,"style_material_score":1,"render_quality_score":1,"issue_tags":[],"reason":"不超过50字","confidence":0.0}
三个分数均为 1-5 整数。若结果不可见或无法评审，reviewable=false，三个分数为 null。issue_tags 只能从 geometry_drift、camera_drift、missing_content、artifact、style_mismatch、unreviewable 中选择。不要返回加权分或业务合格；它们由飞书公式字段计算。`;

const ISSUE_TAGS = new Set([
  "artifact",
  "camera_drift",
  "geometry_drift",
  "missing_content",
  "style_mismatch",
  "unreviewable",
]);

function reviewError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function score(value, field, reviewable) {
  if (!reviewable && value == null) return null;
  if (!Number.isInteger(value) || value < 1 || value > 5) {
    throw reviewError(`${field} 必须是 1-5 整数`);
  }
  return value;
}

export function parseBenchmarkReviewOutput(text) {
  const source = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let value;
  try {
    value = JSON.parse(source);
  } catch {
    throw reviewError("评分模型没有返回合法 JSON");
  }
  if (typeof value.reviewable !== "boolean") {
    throw reviewError("reviewable 必须是布尔值");
  }
  const tags = Array.isArray(value.issue_tags) ? value.issue_tags : [];
  if (tags.some((tag) => !ISSUE_TAGS.has(tag))) {
    throw reviewError("issue_tags 含未定义标签");
  }
  const confidence = Number(value.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw reviewError("confidence 必须在 0-1 之间");
  }
  return {
    confidence,
    consistencyScore: score(
      value.consistency_score,
      "consistency_score",
      value.reviewable,
    ),
    issueTags: [...new Set(tags)],
    protocolVersion: BENCHMARK_REVIEW_PROTOCOL_VERSION,
    reason: String(value.reason || "").trim().slice(0, 50),
    renderQualityScore: score(
      value.render_quality_score,
      "render_quality_score",
      value.reviewable,
    ),
    reviewable: value.reviewable,
    styleMaterialScore: score(
      value.style_material_score,
      "style_material_score",
      value.reviewable,
    ),
  };
}

export function isCurrentBenchmarkReview(review) {
  return review?.protocolVersion === BENCHMARK_REVIEW_PROTOCOL_VERSION;
}

export function isUsableReview(review) {
  return Boolean(
    isCurrentBenchmarkReview(review) &&
    review?.reviewable &&
    review.consistencyScore >= 3 &&
    review.styleMaterialScore >= 3 &&
    review.renderQualityScore >= 3,
  );
}

export async function scoreBenchmarkImage({
  client,
  model,
  referenceImageUrl,
  resultImageUrl,
}) {
  const response = await client.reviewImages({
    imageUrls: [referenceImageUrl, resultImageUrl],
    model,
    systemPrompt: BENCHMARK_REVIEW_SYSTEM_PROMPT,
    userPrompt: "对比白模参考图与生成结果，按协议评分。",
  });
  return {
    ...parseBenchmarkReviewOutput(response.text),
    requestId: response.requestId || null,
  };
}

function percentile95(values) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (sorted.length === 0) return null;
  return sorted[Math.ceil(sorted.length * 0.95) - 1];
}

function mean(values) {
  const valid = values.filter(Number.isFinite);
  return valid.length ? valid.reduce((total, value) => total + value, 0) / valid.length : null;
}

export function summarizeBenchmarkAnalysis({ caseMetadata = [], results = [], reviews = [] }) {
  const metadata = new Map(caseMetadata.map((entry) => [entry.caseId, entry]));
  const latestReview = new Map();
  for (const review of reviews) {
    if (isCurrentBenchmarkReview(review)) latestReview.set(review.runId, review);
  }
  const rows = results.map((result) => {
    const review = latestReview.get(result.runId) || null;
    const caseId = result.caseId || "未关联";
    return {
      ...result,
      category: metadata.get(caseId)?.category || "未分类",
      review,
      usable: review ? isUsableReview(review) : null,
    };
  });
  const groupMap = new Map();
  for (const row of rows) {
    const key = `${row.model || "未知模型"}||${row.category}`;
    const group = groupMap.get(key) || {
      category: row.category,
      failed: 0,
      latencies: [],
      model: row.model || "未知模型",
      reviewed: 0,
      scores: [],
      total: 0,
      usable: 0,
    };
    group.total += 1;
    if (row.status !== "成功") group.failed += 1;
    if (Number.isFinite(row.durationSeconds)) group.latencies.push(row.durationSeconds);
    if (row.review) {
      group.reviewed += 1;
      if (row.usable) group.usable += 1;
      if (row.review.reviewable) {
        group.scores.push(mean([
          row.review.consistencyScore,
          row.review.styleMaterialScore,
          row.review.renderQualityScore,
        ]));
      }
    }
    groupMap.set(key, group);
  }
  const groups = [...groupMap.values()].map((group) => ({
    category: group.category,
    failed: group.failed,
    meanScore: mean(group.scores),
    model: group.model,
    p95Seconds: percentile95(group.latencies),
    reviewed: group.reviewed,
    successRate: group.total ? (group.total - group.failed) / group.total : null,
    total: group.total,
    usableRate: group.reviewed ? group.usable / group.reviewed : null,
  }));
  return {
    groups,
    summary: {
      generated: rows.filter((row) => row.status === "成功").length,
      p95Seconds: percentile95(rows.map((row) => row.durationSeconds)),
      reviewed: rows.filter((row) => row.review).length,
      total: rows.length,
      usable: rows.filter((row) => row.usable).length,
    },
  };
}

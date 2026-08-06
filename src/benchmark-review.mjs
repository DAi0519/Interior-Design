/**
 * [INPUT]: 依赖可注入的 OneAPI 多图评审客户端，接收白模参考图、生成结果和评分模型
 * [OUTPUT]: 对外提供 seven_evaluate_v3.1 同构的单次三维小数评分协议、完整 JSON 提取/严格契约/单次修复、正式评分 Run 断点筛选、本地降档/加权、飞书可读评分细则投影、旧协议隔离、P95 与分模型/分类分析
 * [POS]: src 的 AI 评审领域层，评分规则与传输、存储和界面解耦
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export const BENCHMARK_REVIEW_PROTOCOL_VERSION = "white-model-review@v3.1-single-pass";

export const BENCHMARK_REVIEW_DIMENSIONS = Object.freeze([
  Object.freeze({ key: "consistencyScore", label: "保持一致性", weight: 0.4 }),
  Object.freeze({ key: "styleMaterialScore", label: "风格与材质", weight: 0.3 }),
  Object.freeze({ key: "renderQualityScore", label: "渲染质量", weight: 0.3 }),
]);

const BENCHMARK_REVIEW_DETAIL_DIMENSIONS = Object.freeze([
  Object.freeze({ detailKey: "consistency", issueKey: "consistency", scoreKey: "consistencyScore", label: "保持一致性" }),
  Object.freeze({ detailKey: "style_material", issueKey: "style_material", scoreKey: "styleMaterialScore", label: "风格与材质" }),
  Object.freeze({ detailKey: "rendering_quality", issueKey: "rendering_quality", scoreKey: "renderQualityScore", label: "渲染质量" }),
]);

const REVIEW_DETAIL_LIMIT = 10000;

export const WHITE_MODEL_TASK_REQUIREMENT =
  "白模渲染：在严格保持空间结构、镜头视角、家具位置和尺度的前提下，将可见表面完整材质化为奶油法式室内效果图，建立协调色彩、真实材质与自然光影。";

export const BENCHMARK_REVIEW_SYSTEM_PROMPT = `Role
你是家装 AI 生图白模渲染评测专家。你会在一次评测中完成输入准入、保持一致性、风格材质和渲染质量评分。

Image Identity
- source image：任务输入白模。
- generated image：待评分效果图。

总原则
1. 先逐项检查并找出可见问题，再按评分锚点给分。
2. 5 分不是“整体不错”，而是接近正式交付且该维度没有肉眼可见扣分点。只要能指出明确问题，该维度就不得给 5。
3. 三个维度必须严格遵守各自的证据范围；同一问题不得跨维度重复扣分。
4. 不评价设计创意、个人审美偏好或是否采用你偏爱的布局。

输入准入
有效白模必须是可判断室内空间的灰阶或近灰阶无完整材质渲染：空间结构清晰、物体关系明确、没有完整材质。
以下输入无效：CAD/平面图/蓝图、真正的二维线稿、只含粗略体块且物体语义不清的草模、已完成材质的效果图、非室内图、信息不足或损坏图。
输入无效时 input_eligibility.valid=false，三个评分对象必须全部为 null；不要评价 generated image。

维度一：保持一致性（consistency）
允许证据：必须同时比较 source image 和 generated image。
只评价：
1. 房间结构、墙体、门窗、梁柱、顶面和地面边界是否保持。
2. 镜头位置、视角、焦段感、透视和画面裁切是否保持。
3. 主家具、洁具、灯具、镜子、柜体等关键对象的位置、数量和尺度是否保持。
4. 对象之间的前后、左右、高低关系是否保持。
5. 是否丢失、错误新增或重排 source image 中的关键可见对象。
禁止扣分：颜色、纹理、材质属性、合理光影、目标风格，以及材质化所需的非结构性装饰细节。
证据要求：evidence 必须引用两图中都可观察的固定锚点、对象位置或尺度关系。

consistency 评分锚点
- 5：结构、镜头、主对象位置和尺度几乎完全对应，没有肉眼可见一致性扣分点。
- 4：高一致性，仅有轻微局部偏差，不影响同一空间、同一视角和主要对象的对应。
- 3：基本一致但有明确偏差，如小范围对象偏移、局部缺失/新增或轻微视角变化，仍可用于对比。
- 2：结构、镜头或主要家具变化明显，已经影响使用，需要重抽或人工修正。
- 1：结构、视角或主要对象大幅改变，无法建立可靠对应。

维度二：风格与材质（style_material）
评分主体：只评价 generated image。
source image 的唯一允许用途：识别对象身份、可见表面，以及判断表面是否完成材质化、材质是否与对象匹配。
只评价：
1. 是否明确是奶油法式，而不是普通现代暖色、轻奢、极简或泛欧式。
2. 色彩关系是否柔和协调，是否有不自然偏色、脏灰、过黄或过饱和。
3. 木材、石材、金属、玻璃、织物、墙地面等材质是否有层次且与对象匹配。
4. 是否存在大面积材质同质化、只上色但缺少材质属性、对象材质错配。
5. 可见表面是否完整、合理地完成材质化。
禁止扣分：source image 自身的美观和画质；两图的结构、视角、裁切、家具位置、数量或尺度差异。
证据要求：evidence 必须描述 generated image 中可见的风格或材质表现；若提到 source，只能用于对象/表面识别。

style_material 评分锚点
- 5：奶油法式准确明确，色彩协调，材质层次清楚且对象匹配，没有肉眼可见风格/材质扣分点。
- 4：风格和材质完成良好，仅有轻微偏差或局部材质层次不足。
- 3：风格方向基本正确，但材质同质化、层次一般、少量对象不匹配或局部未充分材质化，仍可使用。
- 2：风格偏离或材质问题明显，影响展示，需要重抽或人工修正。
- 1：风格未生效或明显偏离，材质关系混乱，基本不可用。

维度三：渲染质量（rendering_quality）
允许证据：只能依据 generated image 自身的可见结果。即使同时提供 source image，也必须忽略 source image，不得通过两图比较来评价本维度。
只评价：
1. 光源方向、明暗关系和阴影是否自然统一。
2. 曝光是否稳定，是否过曝、死黑、灰雾、脏污或塑料感。
3. 材质纹理、反射、粗糙度和透明度是否真实可信。
4. 边缘、细节和小物件是否清晰，是否存在模糊、糊边或重复伪影。
5. generated image 自身是否存在畸变、融化、穿模、漂浮、错误反射、脏纹理或大面积未完成区域。
禁止扣分：source image 的任何缺陷；两图的结构、布局、视角、裁切、家具增删、位置或尺度差异；已经记入 consistency 的问题。
普通构图只在 generated image 自身出现严重裁切、透视畸变或不可用时计入渲染质量。
证据要求：evidence 只能描述 generated image 中独立可见的画质现象，不得出现“相比 source”“与原图不同”等比较性依据。

rendering_quality 评分锚点
- 5：光影自然、真实感强、细节完整，没有肉眼可见渲染瑕疵，接近正式交付。
- 4：整体质量良好，仅有轻微局部瑕疵，不影响展示。
- 3：整体可看，但真实感一般或有明确局部瑕疵，仍可使用。
- 2：瑕疵明显并影响展示或使用，需要重抽或人工修正。
- 1：大面积畸变、融化、曝光错误、渲染失败或基本不可用。

统一硬性降档规则
- 某维度存在 1 个 MINOR 问题，该维度最高 4。
- 某维度存在 1 个 MAJOR 问题，该维度最高 3。
- 某维度存在 1 个 CRITICAL 问题，该维度最高 2。
- 两档之间难以判断时取较低档。
- score 必须是 1–5 的 JSON 数值，可以使用小数，不要输出字符串。
- deduction_reason 必须写该维度主要扣分原因；5 分只能写“无明显扣分点”。
- issues 中每个问题只能归属一个 dimension；severity 只能是 MINOR、MAJOR、CRITICAL。
- 不得输出权重、总分、合格结论或模型身份。
- 只输出严格 JSON，不要输出 Markdown 或额外文字。

Output Contract
有效输入时：
{
  "input_eligibility": {"valid": true, "category": "valid_white_model", "reason": ""},
  "consistency": {"score": 1, "evidence": "", "comment": "", "deduction_reason": ""},
  "style_material": {"score": 1, "evidence": "", "comment": "", "deduction_reason": ""},
  "rendering_quality": {"score": 1, "evidence": "", "comment": "", "deduction_reason": ""},
  "issues": [{"severity": "MINOR", "dimension": "consistency", "description": "", "evidence": ""}]
}

无效输入时：consistency、style_material、rendering_quality 必须全部为 null。`;

const SCORE_KEYS = new Set(["score", "evidence", "comment", "deduction_reason"]);
const ISSUE_KEYS = new Set(["severity", "dimension", "description", "evidence"]);
const SEVERITIES = new Set(["MINOR", "MAJOR", "CRITICAL"]);
const ELIGIBILITY_CATEGORIES = new Set([
  "valid_white_model",
  "cad_or_plan",
  "line_art",
  "rough_model",
  "already_materialized",
  "low_information",
  "non_interior",
]);
const SCORE_CAPS = Object.freeze({ CRITICAL: 2, MAJOR: 3, MINOR: 4 });
const NO_DEDUCTION_MARKERS = Object.freeze([
  "无明显扣分",
  "无扣分",
  "无明显问题",
  "无",
  "none",
  "no obvious deduction",
  "no visible issue",
]);

function reviewError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function parseJson(text) {
  const source = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const candidates = [source];
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start >= 0 && end > start) candidates.push(source.slice(start, end + 1));
  for (const candidate of [...new Set(candidates)]) {
    try {
      return JSON.parse(candidate);
    } catch {
      // 继续尝试从响应正文中提取完整 JSON 对象。
    }
  }
  const diagnosis = !source
    ? "响应为空"
    : start >= 0 && end < start
      ? "JSON 可能被截断，缺少闭合花括号"
      : `收到 ${Array.from(source).length} 个字符`;
  throw reviewError(`评分模型没有返回完整合法 JSON（${diagnosis}）`);
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw reviewError(`${label} 必须是对象`);
  }
  const actual = new Set(Object.keys(value));
  if (actual.size !== expected.size || [...expected].some((key) => !actual.has(key))) {
    throw reviewError(`${label} 字段不符合评分协议`);
  }
  return value;
}

function requiredText(value, label) {
  if (typeof value !== "string") throw reviewError(`${label} 必须是字符串`);
  return value;
}

function score(value, label) {
  if (!Number.isFinite(value) || value < 1 || value > 5) {
    throw reviewError(`${label} 必须是 1-5 数值`);
  }
  return value;
}

function scoreBlock(value, label) {
  const block = exactKeys(value, SCORE_KEYS, label);
  score(block.score, `${label}.score`);
  requiredText(block.evidence, `${label}.evidence`);
  requiredText(block.comment, `${label}.comment`);
  requiredText(block.deduction_reason, `${label}.deduction_reason`);
  return { ...block };
}

function reviewIssues(value, allowedDimensions) {
  if (!Array.isArray(value)) throw reviewError("issues 必须是数组");
  return value.map((entry, index) => {
    const issue = exactKeys(entry, ISSUE_KEYS, `issues.${index}`);
    if (!SEVERITIES.has(issue.severity)) {
      throw reviewError(`issues.${index}.severity 必须是 MINOR、MAJOR 或 CRITICAL`);
    }
    if (!allowedDimensions.has(issue.dimension)) {
      throw reviewError(`issues.${index}.dimension 不符合评分协议`);
    }
    requiredText(issue.description, `issues.${index}.description`);
    requiredText(issue.evidence, `issues.${index}.evidence`);
    return { ...issue };
  });
}

export function parseBenchmarkReviewOutput(text) {
  const scoreKeys = ["consistency", "style_material", "rendering_quality"];
  const value = exactKeys(
    parseJson(text),
    new Set(["input_eligibility", ...scoreKeys, "issues"]),
    "root",
  );
  const eligibility = exactKeys(
    value.input_eligibility,
    new Set(["valid", "category", "reason"]),
    "input_eligibility",
  );
  if (typeof eligibility.valid !== "boolean") {
    throw reviewError("input_eligibility.valid 必须是布尔值");
  }
  if (!ELIGIBILITY_CATEGORIES.has(eligibility.category)) {
    throw reviewError("input_eligibility.category 不符合评分协议");
  }
  requiredText(eligibility.reason, "input_eligibility.reason");
  if (eligibility.valid && eligibility.category !== "valid_white_model") {
    throw reviewError("有效输入必须使用 valid_white_model 分类");
  }
  const details = {};
  for (const key of scoreKeys) {
    if (!eligibility.valid && value[key] !== null) {
      throw reviewError(`输入无效时 ${key} 必须为 null`);
    }
    details[key] = eligibility.valid ? scoreBlock(value[key], key) : null;
  }
  const allowedDimensions = eligibility.valid
    ? new Set(["eligibility", ...scoreKeys])
    : new Set(["eligibility"]);
  return {
    details,
    inputEligibility: { ...eligibility },
    issues: reviewIssues(value.issues, allowedDimensions),
  };
}

function looksLikeNoDeduction(text) {
  const normalized = String(text || "").trim().toLowerCase().replace(/\s+/g, " ");
  return Boolean(normalized) && NO_DEDUCTION_MARKERS.some((marker) => normalized.includes(marker));
}

export function calibratedBenchmarkScore(dimension, block, issues = []) {
  const caps = issues
    .filter((issue) => issue.dimension === dimension && SCORE_CAPS[issue.severity])
    .map((issue) => SCORE_CAPS[issue.severity]);
  let cap = caps.length ? Math.min(...caps) : null;
  let reason = cap ? `${dimension} 存在问题，按严重度封顶为 ${cap}` : "";
  if (block.score === 5 && cap === null && !looksLikeNoDeduction(block.deduction_reason)) {
    cap = 4;
    reason = `${dimension} 给出扣分原因，5 分封顶为 4`;
  }
  if (cap === null || block.score <= cap) return { adjustment: null, score: block.score };
  return {
    adjustment: { adjustedScore: cap, dimension, rawScore: block.score, reason },
    score: cap,
  };
}

export function weightedBenchmarkScore(review) {
  const values = BENCHMARK_REVIEW_DIMENSIONS.map((dimension) => review?.[dimension.key]);
  if (values.some((value) => !Number.isFinite(value))) return null;
  return Math.round(BENCHMARK_REVIEW_DIMENSIONS.reduce(
    (total, dimension) => total + review[dimension.key] * dimension.weight,
    0,
  ) * 1000) / 1000;
}

function readableDetail(value, fallback = "—") {
  const text = String(value || "").trim();
  return text || fallback;
}

function dimensionLabel(key) {
  if (key === "eligibility") return "输入准入";
  return BENCHMARK_REVIEW_DETAIL_DIMENSIONS.find((item) => item.issueKey === key)?.label || key;
}

export function formatBenchmarkReviewDetails(review = {}) {
  const lines = [
    `评分协议：${readableDetail(review.protocolVersion, "未记录")}`,
    `输入准入：${review.reviewable ? "有效白模" : `不准入 · ${readableDetail(review.inputReason, "未说明原因")}`}`,
  ];
  if (review.reviewBatchId) lines.push(`评审批次：${review.reviewBatchId}`);
  if (review.scorerModelId) lines.push(`评分模型：${review.scorerModelId}`);

  for (const dimension of BENCHMARK_REVIEW_DETAIL_DIMENSIONS) {
    const detail = review.scoreDetails?.[dimension.detailKey];
    if (!detail) continue;
    lines.push(
      "",
      `${dimension.label}：${review[dimension.scoreKey] ?? detail.score ?? "—"} / 5`,
      `证据：${readableDetail(detail.evidence)}`,
      `评价：${readableDetail(detail.comment)}`,
      `扣分原因：${readableDetail(detail.deduction_reason, "无明显扣分点")}`,
    );
  }

  if (review.issues?.length) {
    lines.push("", "问题明细：", ...review.issues.map((issue) =>
      `- ${issue.severity} · ${dimensionLabel(issue.dimension)} · ${readableDetail(issue.description)}；证据：${readableDetail(issue.evidence)}`));
  }
  if (review.scoreAdjustments?.length) {
    lines.push("", "本地校准：", ...review.scoreAdjustments.map((adjustment) =>
      `- ${dimensionLabel(adjustment.dimension)}：${adjustment.rawScore} → ${adjustment.adjustedScore}；${readableDetail(adjustment.reason)}`));
  }
  if (Number.isFinite(review.weightedScore)) {
    lines.push("", `加权结论：${review.weightedScore.toFixed(2)} / 5 · ${review.weightedScore >= 3 ? "可用" : "未通过"}`);
  }
  return Array.from(lines.join("\n")).slice(0, REVIEW_DETAIL_LIMIT).join("");
}

function issueTags(entries) {
  return [...new Set(entries.map((issue) => `${issue.dimension}:${issue.severity.toLowerCase()}`))];
}

function reviewReason(details, entries, fallback = "") {
  const issue = entries.find((entry) => entry.description)?.description;
  if (issue) return issue;
  const comment = Object.values(details).find((entry) => entry?.comment)?.comment;
  return String(comment || fallback).trim().slice(0, 120);
}

export function isCurrentBenchmarkReview(review) {
  return review?.protocolVersion === BENCHMARK_REVIEW_PROTOCOL_VERSION;
}

export function pendingBenchmarkReviewRuns(candidates = [], reviews = [], experimentId = "", resume = false) {
  if (!resume) return candidates;
  const reviewedRunIds = new Set(reviews
    .filter((review) => review.experimentId === experimentId && isCurrentBenchmarkReview(review))
    .map((review) => review.runId));
  return candidates.filter((candidate) => !reviewedRunIds.has(candidate.runId));
}

export function isUsableReview(review) {
  return Boolean(
    isCurrentBenchmarkReview(review) &&
    review?.reviewable &&
    weightedBenchmarkScore(review) >= 3,
  );
}

function reviewUserPrompt() {
  return `任务名称：白模渲染\n任务要求：${WHITE_MODEL_TASK_REQUIREMENT}\n请先判断 source image 是否为有效白模；有效时在一次响应中完成三项独立评分，并严格遵守各维度的证据范围。`;
}

async function evaluateReview({ client, imageUrls, model }) {
  const attempts = [];
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const repairNote = attempt
      ? `\n\n上一轮响应不符合 JSON contract。请修正字段、类型和分数后只输出严格 JSON。校验错误：${lastError.message}`
      : "";
    const response = await client.reviewImages({
      imageUrls,
      model,
      systemPrompt: BENCHMARK_REVIEW_SYSTEM_PROMPT,
      userPrompt: reviewUserPrompt() + repairNote,
    });
    attempts.push({ requestId: response.requestId || null, text: response.text });
    try {
      return { attempts, output: parseBenchmarkReviewOutput(response.text) };
    } catch (error) {
      lastError = error;
    }
  }
  throw reviewError(`评分模型连续两次未遵循 JSON 协议：${lastError.message}`);
}

export async function scoreBenchmarkImage({ client, model, referenceImageUrl, resultImageUrl }) {
  const result = await evaluateReview({
    client,
    imageUrls: [referenceImageUrl, resultImageUrl],
    model,
  });
  const output = result.output;
  if (!output.inputEligibility.valid) {
    return {
      consistencyScore: null,
      inputCategory: output.inputEligibility.category,
      inputReason: output.inputEligibility.reason,
      issueTags: issueTags(output.issues),
      issues: output.issues,
      protocolVersion: BENCHMARK_REVIEW_PROTOCOL_VERSION,
      rawEvaluationResponses: result.attempts.map((attempt) => attempt.text),
      reason: reviewReason({}, output.issues, output.inputEligibility.reason),
      renderQualityScore: null,
      requestIds: result.attempts.map((attempt) => attempt.requestId),
      reviewable: false,
      scoreAdjustments: [],
      scoreDetails: {},
      styleMaterialScore: null,
      weightedScore: null,
    };
  }

  const calibrated = Object.fromEntries(Object.entries(output.details).map(([dimension, block]) => [
    dimension,
    calibratedBenchmarkScore(dimension, block, output.issues),
  ]));
  const review = {
    consistencyScore: calibrated.consistency.score,
    inputCategory: output.inputEligibility.category,
    inputReason: output.inputEligibility.reason,
    issueTags: issueTags(output.issues),
    issues: output.issues,
    protocolVersion: BENCHMARK_REVIEW_PROTOCOL_VERSION,
    rawEvaluationResponses: result.attempts.map((attempt) => attempt.text),
    reason: reviewReason(output.details, output.issues),
    renderQualityScore: calibrated.rendering_quality.score,
    requestIds: result.attempts.map((attempt) => attempt.requestId),
    reviewable: true,
    scoreAdjustments: Object.values(calibrated).map((entry) => entry.adjustment).filter(Boolean),
    scoreDetails: output.details,
    styleMaterialScore: calibrated.style_material.score,
  };
  return { ...review, weightedScore: weightedBenchmarkScore(review) };
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
      const weighted = weightedBenchmarkScore(row.review);
      if (weighted !== null) group.scores.push(weighted);
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

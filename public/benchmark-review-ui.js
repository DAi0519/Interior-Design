/**
 * [INPUT]: 依赖 AI 评分 DOM、当前样本集 Case ID、服务端 seven_evaluate_v3.1 正式/旧协议评分投影、可评分实验目录与评分模型目录
 * [OUTPUT]: 对外提供当前样本集可评分实验筛选、单次评测三维与加权分最新评分选择/汇总/渲染、旧协议提示、任务归属面板、默认最近完成实验/GPT 评分模型、评分表单状态与提交输入
 * [POS]: public 的 Benchmark AI 评分控制器，与实验草稿控制器和通用页面编排分责
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export function scopeReviewableExperiments(experiments = [], caseIds = []) {
  const selected = new Set(caseIds);
  return experiments.map((experiment) => {
    const cases = (experiment.cases || []).filter((item) => selected.has(item.caseId));
    return {
      ...experiment,
      legacyReviewedCount: cases.reduce(
        (total, item) => total + Number(item.legacyReviewedCount || 0),
        0,
      ),
      resultCount: cases.reduce((total, item) => total + Number(item.resultCount || 0), 0),
      reviewedCount: cases.reduce((total, item) => total + Number(item.reviewedCount || 0), 0),
    };
  }).filter((experiment) => experiment.resultCount > 0);
}

export function jobPanelFor(job = {}) {
  return job.kind === "review" || job.phase === "review" ? "review" : "run";
}

export function defaultReviewModelKey(models = []) {
  const selectable = models.filter((model) => model.selectable !== false);
  return selectable.find((model) => model.key === "gpt")?.key || selectable[0]?.key || "";
}

export function reviewAction(experiment) {
  if (!experiment) return { label: "暂无可评分结果", resume: false };
  const total = Number(experiment.resultCount || 0);
  const reviewed = Math.min(total, Number(experiment.reviewedCount || 0));
  if (reviewed >= total) return { label: `重新评分 ${total} 张结果`, resume: false };
  if (reviewed > 0) return { label: `继续评分剩余 ${total - reviewed} 张`, resume: true };
  const verb = experiment.legacyReviewedCount ? "按正式三维评分" : "直接评分";
  return { label: `${verb} ${total} 张结果`, resume: false };
}

export function selectLatestReviewResults(reviews = [], experimentId = "", caseIds = []) {
  const selectedCases = new Set(caseIds);
  const latest = new Map();
  for (const review of reviews) {
    if (
      review.compatible === false ||
      review.experimentId !== experimentId ||
      !selectedCases.has(review.caseId)
    ) continue;
    const current = latest.get(review.runId);
    if (!current || String(review.createdAt || "") >= String(current.createdAt || "")) {
      latest.set(review.runId, review);
    }
  }
  return [...latest.values()].sort((left, right) =>
    String(left.model || "").localeCompare(String(right.model || "")) ||
    String(left.runId || "").localeCompare(String(right.runId || "")));
}

export function countLegacyReviewResults(reviews = [], experimentId = "", caseIds = []) {
  const selectedCases = new Set(caseIds);
  return new Set(reviews
    .filter((review) => review.compatible === false &&
      review.experimentId === experimentId && selectedCases.has(review.caseId))
    .map((review) => review.runId)).size;
}

function mean(values) {
  const scores = values.filter(Number.isFinite);
  return scores.length ? scores.reduce((total, value) => total + value, 0) / scores.length : null;
}

export function summarizeReviewResults(reviews = []) {
  return {
    consistencyScore: mean(reviews.map((review) => review.consistencyScore)),
    reviewed: reviews.length,
    renderQualityScore: mean(reviews.map((review) => review.renderQualityScore)),
    styleMaterialScore: mean(reviews.map((review) => review.styleMaterialScore)),
    usable: reviews.filter((review) => review.usable).length,
    weightedScore: mean(reviews.map((review) => review.weightedScore)),
  };
}

export function createReviewController({ byId, escapeHtml, selectedCaseIds, storage }) {
  let sourceExperiments = [];
  let sourceReviews = [];
  let experiments = [];
  let apiConnected = false;
  let modelLabels = new Map();

  const issueLabels = {
    artifact: "画面伪影",
    camera_drift: "镜头偏移",
    geometry_drift: "结构偏移",
    missing_content: "内容缺失",
    style_mismatch: "风格不符",
    unreviewable: "无法评审",
  };

  function scoreText(value) {
    return Number.isFinite(value) ? String(value) : "—";
  }

  function averageText(value) {
    return Number.isFinite(value) ? value.toFixed(2) : "—";
  }

  function issueText(review) {
    if (review.issues?.length) {
      return review.issues.map((issue) =>
        `${issue.severity} · ${issue.description || issue.dimension}`).join("；");
    }
    return review.issueTags?.length
      ? review.issueTags.map((tag) => issueLabels[tag] || tag).join("、")
      : "无";
  }

  function renderResults(experimentId) {
    const reviews = selectLatestReviewResults(sourceReviews, experimentId, selectedCaseIds());
    const legacyCount = countLegacyReviewResults(sourceReviews, experimentId, selectedCaseIds());
    const summary = summarizeReviewResults(reviews);
    const latest = [...reviews].sort((left, right) =>
      String(right.createdAt || "").localeCompare(String(left.createdAt || "")))[0];
    byId("reviewResultSummary").innerHTML = [
      ["已评分", summary.reviewed],
      ["可用图", summary.usable],
      ["保持一致性", averageText(summary.consistencyScore)],
      ["风格与材质", averageText(summary.styleMaterialScore)],
      ["渲染质量", averageText(summary.renderQualityScore)],
      ["加权均分", averageText(summary.weightedScore)],
    ].map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join("");
    byId("reviewResultMeta").textContent = latest
      ? `v3.1 单次评测 · 最新批次 ${latest.reviewBatchId} · ${modelLabels.get(latest.scorerModelId) || latest.scorerModelId}`
      : legacyCount
        ? `检测到 ${legacyCount} 张旧协议评分；维度与飞书不一致，已隔离且不计入正式结果。`
        : "完成 AI 评分后，逐图分数与原因会显示在这里。";
    byId("reviewResultRows").innerHTML = reviews.map((review) => {
      const conclusion = !review.reviewable ? "输入不准入" : review.usable ? "可用" : "未通过";
      const adjustment = review.scoreAdjustments?.length
        ? `<small>本地校准 ${review.scoreAdjustments.length} 项</small>`
        : "";
      return `<tr>
        <td>${escapeHtml(review.model || "未知模型")}</td>
        <td class="review-run"><code title="${escapeHtml(review.runId)}">${escapeHtml(review.runId)}</code></td>
        <td class="review-score">${scoreText(review.consistencyScore)}</td>
        <td class="review-score">${scoreText(review.styleMaterialScore)}</td>
        <td class="review-score">${scoreText(review.renderQualityScore)}</td>
        <td class="review-score">${averageText(review.weightedScore)}</td>
        <td><span class="review-verdict" data-usable="${review.usable}">${conclusion}</span></td>
        <td>${escapeHtml(issueText(review))}</td>
        <td class="review-reason">${escapeHtml(review.reason || review.inputReason || "—")}${adjustment}</td>
      </tr>`;
    }).join("");
    byId("reviewResultTable").classList.toggle("hidden", !reviews.length);
    byId("reviewResultEmpty").classList.toggle("hidden", Boolean(reviews.length));
    byId("reviewResultEmpty").textContent = legacyCount
      ? `已有 ${legacyCount} 张旧协议评分已保留，但不能改名冒充正式三维。请点击“按正式三维评分”重新评审。`
      : "当前实验还没有正式三维评分结果。";
  }

  function syncButton() {
    const selected = experiments.find((item) => item.experimentId === byId("reviewExperimentSelect").value);
    const ready = Boolean(apiConnected && selected && byId("reviewModelSelect").value);
    byId("reviewButton").disabled = !ready;
    byId("reviewButton").textContent = reviewAction(selected).label;
  }

  function syncMeta() {
    const selected = experiments.find((item) => item.experimentId === byId("reviewExperimentSelect").value);
    if (!selected) {
      byId("reviewExperimentMeta").textContent = "当前样本集还没有已完成的成功结果图。";
      renderResults("");
      syncButton();
      return;
    }
    storage?.setItem("benchmark.reviewExperimentId", selected.experimentId);
    const status = selected.status === "completed" ? "实验已完成" : "结果已就绪";
    byId("reviewExperimentMeta").textContent =
      `${status} · ${selected.resultCount} 张成功结果 · ${selected.reviewedCount} 张正式评分` +
      `${selected.legacyReviewedCount ? ` · ${selected.legacyReviewedCount} 张旧协议已隔离` : ""}；评分不会重新出图。`;
    renderResults(selected.experimentId);
    syncButton();
  }

  function renderExperiments(entries) {
    sourceExperiments = entries;
    experiments = scopeReviewableExperiments(entries, selectedCaseIds());
    const preferred = storage?.getItem("benchmark.reviewExperimentId");
    const selected = experiments.find((item) => item.experimentId === preferred) || experiments[0] || null;
    byId("reviewExperimentSelect").innerHTML = experiments.length
      ? experiments.map((item) => `<option value="${escapeHtml(item.experimentId)}">${escapeHtml(item.experimentId)} · ${item.resultCount} 张结果</option>`).join("")
      : '<option value="">暂无可评分实验</option>';
    byId("reviewExperimentSelect").value = selected?.experimentId || "";
    byId("reviewExperimentSelect").disabled = !selected;
    syncMeta();
  }

  function renderModels(models = []) {
    const selectable = models.filter((model) => model.selectable !== false);
    modelLabels = new Map(models.map((model) => [model.id, model.label]));
    byId("reviewModelSelect").innerHTML = selectable.length
      ? selectable.map((model) => `<option value="${escapeHtml(model.key)}">${escapeHtml(model.label)}</option>`).join("")
      : '<option value="">暂无可用视觉模型</option>';
    byId("reviewModelSelect").value = defaultReviewModelKey(selectable);
    byId("reviewModelSelect").disabled = selectable.length === 0;
    syncButton();
  }

  byId("reviewExperimentSelect").addEventListener("change", syncMeta);
  byId("reviewModelSelect").addEventListener("change", syncButton);

  return {
    input() {
      const experimentId = byId("reviewExperimentSelect").value;
      const selected = experiments.find((item) => item.experimentId === experimentId);
      return {
        experimentId,
        groupId: experimentId,
        reviewBatchId: byId("reviewBatchInput").value,
        resume: reviewAction(selected).resume,
        scorerModelKey: byId("reviewModelSelect").value,
      };
    },
    load({ connected, reviewResults, reviewableExperiments, reviewModels }) {
      apiConnected = connected;
      sourceReviews = reviewResults;
      renderModels(reviewModels);
      renderExperiments(reviewableExperiments);
    },
    refreshScope() {
      renderExperiments(sourceExperiments);
    },
  };
}

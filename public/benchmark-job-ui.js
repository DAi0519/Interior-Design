/**
 * [INPUT]: 依赖 Benchmark 任务进度 DOM、任务阶段/状态以及任务所属面板解析器
 * [OUTPUT]: 对外提供生成/评分任务进度、落库状态、失败出图重试输入、评分断点继续动作、持久化实验任务投影和分层失败建议渲染器
 * [POS]: public 的 Benchmark 任务呈现组件，与 benchmark-app.js 的轮询编排和 benchmark-review-ui.js 的面板归属分责
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

const JOB_PHASE_LABELS = {
  "config-write": "冻结生成配置",
  generation: "批量出图",
  preflight: "运行前检查",
  queued: "等待执行",
  review: "AI 评分",
};

const JOB_STATUS_LABELS = {
  failed: "失败",
  running: "运行中",
  success: "已完成",
};

export function generationRetryInput(experiment) {
  const failedImages = Number(experiment?.result?.failedImages || 0);
  if (experiment?.status !== "completed" || failedImages < 1) {
    throw new Error("当前实验没有可重试的失败出图");
  }
  if (!experiment.options || !experiment.experimentId) {
    throw new Error("当前实验缺少可恢复的冻结参数");
  }
  return {
    ...experiment.options,
    experimentId: experiment.experimentId,
    groupId: experiment.groupId || experiment.experimentId,
  };
}

export function persistedGenerationJob(experiment) {
  const failedImages = Number(experiment?.result?.failedImages || 0);
  const total = Number(experiment?.summary?.imageRuns || 0);
  const completed = experiment?.status === "completed"
    ? total
    : Number(experiment?.result?.generatedImages || 0);
  const failedPhase = JOB_PHASE_LABELS[experiment?.phase];
  return {
    completed,
    error: experiment?.error || null,
    jobId: experiment?.experimentId || "",
    kind: "generation",
    message: experiment?.status === "failed"
      ? `${failedPhase || "任务执行"}失败`
      : experiment?.status === "completed"
        ? failedImages ? `任务完成，${failedImages} 张出图失败` : "任务完成"
        : "任务运行中",
    persisted: experiment?.status === "completed" || experiment?.phase === "generation",
    phase: experiment?.phase || (experiment?.status === "completed" ? "generation" : "preflight"),
    result: experiment?.result || null,
    status: experiment?.status === "completed" ? "success" : experiment?.status,
    storage: "Benchmark Base",
    total,
  };
}

export function retryableFailedImages(job) {
  if (job?.kind === "review" || job?.status !== "success") return 0;
  return Math.max(0, Number(job?.result?.failedImages || 0));
}

export function reviewResumeLabel(job) {
  if (job?.phase !== "review" || job?.status !== "failed") return "";
  const total = Number(job.total || 0);
  const completed = Number(job.completed || 0);
  const remaining = Math.max(0, total - completed);
  return completed > 0 ? `继续评分剩余 ${remaining} 张` : `重试评分 ${remaining} 张`;
}

function failureCopy(job) {
  const error = String(job.error || "");
  const idConflict = error.includes("已存在但冻结参数不同");
  if (job.phase === "config-write" || job.phase === "preflight") {
    return {
      action: idConflict,
      advice: idConflict
        ? "当前实验 ID 已关联旧配置。生成新 ID 后重新生成计划，不会覆盖历史实验。"
        : "返回实验配置检查提示；修正后重新生成计划，再开始正式运行。",
      impact: "尚未进入出图阶段，模型没有被调用，也没有产生结果图。",
      title: idConflict ? "实验 ID 与历史冻结配置冲突" : "运行在出图前被拦截",
    };
  }
  if (job.phase === "generation") {
    return {
      action: false,
      advice: "保留当前实验 ID 重试，系统会沿用已写入数据并从可断点位置继续。",
      impact: "部分 Prompt、Run 或结果可能已写入 Benchmark Base，请勿新建实验 ID。",
      title: "批量出图已中断",
    };
  }
  if (job.phase === "review") {
    return {
      action: false,
      advice: "点击继续评分；系统会按 Run ID 跳过已有正式评分，只处理剩余结果。",
      impact: "Benchmark Base 中的生成结果不受影响，已保存的评分版本也会保留。",
      title: "AI 评分未完成",
    };
  }
  return {
    action: false,
    advice: "保留当前任务标识，检查技术详情后重试。",
    impact: job.persisted ? "已有业务数据已保留。" : "本次任务尚未完整落库。",
    title: "任务未完成",
  };
}

export function createJobRenderer({ byId, jobPanelFor }) {
  function renderFailure(job) {
    const failed = job.status === "failed" && Boolean(job.error);
    const section = byId("jobFailure");
    const resumeButton = byId("jobReviewResumeButton");
    section.classList.toggle("hidden", !failed);
    resumeButton.classList.toggle("hidden", !reviewResumeLabel(job));
    if (!failed) return;
    const copy = failureCopy(job);
    byId("jobFailureTitle").textContent = copy.title;
    byId("jobFailureImpact").textContent = copy.impact;
    byId("jobFailureAdvice").textContent = copy.advice;
    byId("jobError").textContent = job.error;
    byId("jobNewExperimentButton").classList.toggle("hidden", !copy.action);
    resumeButton.textContent = reviewResumeLabel(job);
  }

  return function renderJob(job) {
    const card = byId("jobProgress");
    const reviewJob = jobPanelFor(job) === "review";
    const slot = byId(reviewJob ? "reviewJobSlot" : "generationJobSlot");
    if (card.parentElement !== slot) slot.append(card);
    const completed = Number(job.completed || 0);
    const total = Number(job.total || 0);
    card.classList.remove("hidden");
    card.dataset.status = job.status;
    byId("jobMessage").textContent = job.message || "任务运行中";
    byId("jobPhase").textContent = JOB_PHASE_LABELS[job.phase] || "后台任务";
    byId("jobStatus").textContent = JOB_STATUS_LABELS[job.status] || job.status;
    byId("jobId").textContent = job.jobId || "";
    byId("jobNumbers").textContent = total
      ? `${completed} / ${total}`
      : reviewJob ? "尚未进入评分" : "尚未进入出图";
    byId("jobBar").max = total || 1;
    byId("jobBar").value = completed || (job.status === "success" ? 1 : 0);
    byId("jobStorage").textContent = job.persisted
      ? `业务数据已写入 ${job.storage || "Benchmark Base"}`
      : `尚未写入 ${job.storage || "Benchmark Base"}`;
    const failedImages = retryableFailedImages(job);
    const retryButton = byId("jobRetryButton");
    retryButton.classList.toggle(
      "hidden",
      reviewJob || job.status !== "success" || failedImages < 1,
    );
    retryButton.textContent = `重试 ${failedImages} 张失败出图`;
    renderFailure(job);
  };
}

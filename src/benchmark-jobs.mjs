/**
 * [INPUT]: 依赖任务 ID、类型、异步执行函数、阶段更新与可选时钟
 * [OUTPUT]: 对外提供带进度/阶段/落库状态/具体错误的评测后台任务入队和状态查询
 * [POS]: src 的评测工作台进程内调度层，隔离长耗时生图与 AI 评分请求
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

function publicJob(job) {
  return {
    completed: job.completed,
    error: job.error,
    finishedAt: job.finishedAt,
    jobId: job.jobId,
    kind: job.kind,
    message: job.message,
    persisted: job.persisted,
    phase: job.phase,
    result: job.result,
    startedAt: job.startedAt,
    status: job.status,
    storage: job.storage,
    total: job.total,
  };
}

function failureMessage(job) {
  const messages = {
    "config-write": "冻结生成配置失败",
    generation: "批量出图中断",
    preflight: "运行前检查失败",
    review: "AI 评分中断",
  };
  return messages[job.phase] || "任务执行失败";
}

export function createBenchmarkJobRegistry({ maxJobs = 50, now = Date.now } = {}) {
  const jobs = new Map();

  function enqueue(jobId, kind, task) {
    if (jobs.has(jobId)) return publicJob(jobs.get(jobId));
    while (jobs.size >= maxJobs) {
      const finished = [...jobs.entries()].find(([, job]) => job.status !== "running");
      if (!finished) break;
      jobs.delete(finished[0]);
    }
    const job = {
      completed: 0,
      error: null,
      finishedAt: null,
      jobId,
      kind,
      message: "任务已入队",
      persisted: false,
      phase: "queued",
      result: null,
      startedAt: now(),
      status: "running",
      storage: kind === "generation" ? "Benchmark Base" : "本地评分版本库",
      total: 0,
    };
    jobs.set(jobId, job);
    const update = (progress = {}) => Object.assign(job, progress);
    Promise.resolve()
      .then(() => task(update))
      .then((result) => {
        job.finishedAt = now();
        job.persisted = true;
        job.result = result ?? null;
        job.status = "success";
        job.message = result?.failedImages
          ? `任务完成，${result.failedImages} 张出图失败`
          : "任务完成";
      })
      .catch((error) => {
        job.error = String(error?.message || "评测任务失败").slice(0, 1000);
        job.finishedAt = now();
        job.status = "failed";
        job.message = failureMessage(job);
      });
    return publicJob(job);
  }

  return {
    enqueue,
    get(jobId) {
      const job = jobs.get(String(jobId || ""));
      return job ? publicJob(job) : null;
    },
  };
}

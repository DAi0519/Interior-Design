/**
 * [INPUT]: 依赖 generationId、飞书同步异步任务、保留时间与可选时钟
 * [OUTPUT]: 提供幂等入队、状态查询、忙碌检查及已启用的同步失败重试。
 * [POS]: src 的后台同步调度基础设施，隔离图片生成响应与飞书归档耗时
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

function publicJob(job) {
  return {
    error: job.error,
    generationId: job.generationId,
    recordId: job.recordId,
    recordUrl: job.recordUrl,
    status: job.status,
    ...(job.retryTask && job.status === "failed" ? { retryable: true } : {}),
  };
}

export function createSyncJobRegistry({
  maxJobs = 100,
  now = Date.now,
  retentionMs = 60 * 60 * 1000,
} = {}) {
  const jobs = new Map();

  function prune() {
    const cutoff = now() - retentionMs;
    for (const [generationId, job] of jobs) {
      if (job.finishedAt && job.finishedAt < cutoff) jobs.delete(generationId);
    }
    while (jobs.size >= maxJobs) {
      const removable = [...jobs.entries()].find(([, job]) => job.finishedAt);
      if (!removable) break;
      jobs.delete(removable[0]);
    }
  }

  function enqueue(generationId, task, { retryable = false } = {}) {
    const normalizedId = String(generationId || "").trim();
    if (!normalizedId) throw new TypeError("generationId is required");
    if (typeof task !== "function") throw new TypeError("sync task is required");

    const existing = jobs.get(normalizedId);
    if (existing) return publicJob(existing);

    prune();
    const job = {
      error: null,
      finishedAt: null,
      generationId: normalizedId,
      recordId: null,
      recordUrl: null,
      status: "pending",
      retryTask: retryable ? task : null,
    };
    jobs.set(normalizedId, job);
    launch(job, task);
    return publicJob(job);
  }

  function launch(job, task) {
    job.status = "pending";
    job.error = null;
    job.finishedAt = null;
    Promise.resolve()
      .then(task)
      .then((result) => {
        job.finishedAt = now();
        job.error = result?.ok === false ? result.error || "飞书同步失败" : null;
        job.recordId = result?.recordId || null;
        job.recordUrl = result?.recordUrl || null;
        job.status = result?.ok === false ? "failed" : "success";
        if (job.status === "success") job.retryTask = null;
      })
      .catch((error) => {
        job.error = String(error?.message || "飞书同步失败");
        job.finishedAt = now();
        job.status = "failed";
      });

  }

  return {
    enqueue,
    retry(generationId) {
      prune();
      const job = jobs.get(String(generationId || "").trim());
      if (!job?.retryTask) return null;
      if (job.status === "failed") launch(job, job.retryTask);
      return publicJob(job);
    },
    hasActiveJobs() {
      return [...jobs.values()].some((job) => job.status === "pending");
    },
    get(generationId) {
      const job = jobs.get(String(generationId || "").trim());
      return job ? publicJob(job) : null;
    },
  };
}

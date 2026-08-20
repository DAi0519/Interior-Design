/**
 * [INPUT]: 依赖生成任务 ID、功能/模型摘要、异步批处理执行函数、进度回调与可选时钟
 * [OUTPUT]: 对外提供进程内生成任务入队/查询、有界并发批执行与可恢复结果快照
 * [POS]: src 的日常生图后台任务层，让页面切换不再中断生成状态
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

function publicJob(job) {
  return {
    completed: job.completed,
    error: job.error,
    featureMode: job.featureMode,
    finishedAt: job.finishedAt,
    jobId: job.jobId,
    message: job.message,
    result: job.result,
    startedAt: job.startedAt,
    status: job.status,
    total: job.total,
  };
}

export async function runGenerationJobBatch({
  concurrency = 2,
  execute,
  items,
  onProgress = () => {},
}) {
  const normalizedConcurrency = Math.max(1, Math.min(
    Number.parseInt(concurrency, 10) || 1,
    items.length || 1,
  ));
  const outcomes = new Array(items.length);
  let completed = 0;
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      const item = items[index];
      try {
        outcomes[index] = {
          index,
          item: { key: item.key, label: item.label },
          status: "fulfilled",
          value: await execute(item, index),
        };
      } catch (error) {
        outcomes[index] = {
          index,
          item: { key: item.key, label: item.label },
          reason: { message: String(error?.message || "生成失败") },
          status: "rejected",
        };
      } finally {
        completed += 1;
        onProgress({ completed, total: items.length });
      }
    }
  }

  await Promise.all(Array.from(
    { length: normalizedConcurrency },
    () => worker(),
  ));
  return outcomes;
}

export function createGenerationJobRegistry({
  maxJobs = 24,
  now = Date.now,
  ttlMs = 2 * 60 * 60 * 1000,
} = {}) {
  const jobs = new Map();

  function cleanup() {
    const cutoff = now() - ttlMs;
    for (const [jobId, job] of jobs) {
      if (job.finishedAt && job.finishedAt < cutoff) jobs.delete(jobId);
    }
    while (jobs.size >= maxJobs) {
      const finished = [...jobs.entries()].find(
        ([, job]) => job.status !== "running",
      );
      if (!finished) break;
      jobs.delete(finished[0]);
    }
  }

  function enqueue(jobId, { featureMode, total }, task) {
    cleanup();
    if (jobs.has(jobId)) return publicJob(jobs.get(jobId));
    const job = {
      completed: 0,
      error: null,
      featureMode,
      finishedAt: null,
      jobId,
      message: "生成任务已接收",
      result: null,
      startedAt: now(),
      status: "running",
      total,
    };
    jobs.set(jobId, job);
    const update = (progress = {}) => Object.assign(job, progress);
    Promise.resolve()
      .then(() => task(update))
      .then((result) => {
        job.completed = job.total;
        job.finishedAt = now();
        job.message = "生成任务已完成";
        job.result = result ?? null;
        job.status = "success";
      })
      .catch((error) => {
        job.error = String(error?.message || "生成任务失败").slice(0, 1000);
        job.finishedAt = now();
        job.message = "生成任务未完成";
        job.status = "failed";
      });
    return publicJob(job);
  }

  return {
    enqueue,
    get(jobId) {
      cleanup();
      const job = jobs.get(String(jobId || ""));
      return job ? publicJob(job) : null;
    },
  };
}

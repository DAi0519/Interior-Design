/**
 * [INPUT]: 依赖 sessionStorage 的当前标签页状态、含效果图美化的功能编码、生成任务 ID 与服务端任务快照
 * [OUTPUT]: 对外提供按功能持久化的生成任务引用、安全读取及按生成图片计数的结果区阶段推导
 * [POS]: public 的生成任务恢复状态层，只保存任务引用而不复制图片结果
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export const GENERATION_TASK_STORAGE_KEY = "canvas-lab:generation-tasks:v1";
const FEATURE_MODES = new Set([
  "effectEnhancement",
  "emptyRoom",
  "free",
  "refinedModel",
  "whiteModel",
]);

function validTask(task) {
  return task
    && FEATURE_MODES.has(task.featureMode)
    && typeof task.jobId === "string"
    && task.jobId.startsWith("generation-")
    && typeof task.loadingLabel === "string";
}

export function createGenerationTask({
  createId = () => crypto.randomUUID(),
  featureMode,
  loadingLabel,
  models,
  now = Date.now,
}) {
  if (!FEATURE_MODES.has(featureMode)) {
    throw new TypeError("生成功能不支持任务恢复");
  }
  return {
    createdAt: now(),
    featureMode,
    items: models.map(({ key, label }) => ({ key, label })),
    jobId: `generation-${createId()}`,
    loadingLabel,
  };
}

export function readGenerationTasks(storage) {
  try {
    const parsed = JSON.parse(storage.getItem(GENERATION_TASK_STORAGE_KEY) || "{}");
    return Object.fromEntries(Object.entries(parsed).filter(
      ([featureMode, task]) => featureMode === task?.featureMode && validTask(task),
    ));
  } catch {
    return {};
  }
}

export function saveGenerationTask(storage, task) {
  const tasks = readGenerationTasks(storage);
  tasks[task.featureMode] = task;
  storage.setItem(GENERATION_TASK_STORAGE_KEY, JSON.stringify(tasks));
  return tasks;
}

export function generationTaskView(task, job) {
  if (!task) return { stage: "empty" };
  if (!job || job.status === "running") {
    const completed = Number(job?.completed) || 0;
    const total = Number(job?.total) || task.items.length;
    return {
      message: completed > 0
        ? `已完成 ${completed} / ${total} 张图…`
        : task.loadingLabel,
      stage: "loading",
    };
  }
  if (job.status === "failed") {
    return {
      message: job.error || "生成任务未完成",
      stage: "error",
    };
  }
  if (job.status === "missing") {
    return {
      message: "生成任务已过期或本地服务已重启，请重新生成",
      stage: "error",
    };
  }
  return {
    outcomes: Array.isArray(job.result?.outcomes) ? job.result.outcomes : [],
    stage: "results",
  };
}

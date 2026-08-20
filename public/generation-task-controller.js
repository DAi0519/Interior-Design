/**
 * [INPUT]: 依赖生成任务存储/阶段推导、服务端任务查询、结果呈现器、当前功能与忙碌状态回调
 * [OUTPUT]: 对外提供按功能的任务启动、跟随、恢复、查询与结果区渲染控制器
 * [POS]: public 的生成任务交互层，连接纯状态契约与页面 DOM，不组装生图业务请求
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import {
  generationTaskView,
  readGenerationTasks,
  saveGenerationTask,
} from "./generation-task-state.js";

function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export function bindGenerationTaskController({
  generationResults,
  getFeatureMode,
  onBusy,
  storage = window.sessionStorage,
}) {
  const followers = new Map();
  const jobs = new Map();
  const tasks = new Map(Object.entries(readGenerationTasks(storage)));

  function task(featureMode = getFeatureMode()) {
    return tasks.get(featureMode);
  }

  function view(featureMode = getFeatureMode()) {
    const currentTask = task(featureMode);
    return generationTaskView(
      currentTask,
      currentTask ? jobs.get(currentTask.jobId) : null,
    );
  }

  function render() {
    if (getFeatureMode() === "styleDna") return;
    const current = view();
    onBusy(current.stage === "loading");
    if (current.stage === "empty") generationResults.showEmpty();
    if (current.stage === "loading") generationResults.showLoading(current.message);
    if (current.stage === "error") generationResults.showError(current.message);
    if (current.stage === "results") generationResults.showResults(current.outcomes);
  }

  async function load(jobId) {
    const response = await fetch(`/api/generation-jobs/${encodeURIComponent(jobId)}`);
    const body = await response.json().catch(() => ({}));
    if (response.status === 404) return { jobId, status: "missing" };
    if (!response.ok) {
      throw new Error(body.error || `任务查询失败（${response.status}）`);
    }
    return body.job;
  }

  function follow(currentTask) {
    if (followers.has(currentTask.jobId)) return followers.get(currentTask.jobId);
    const follower = (async () => {
      while (true) {
        const job = await load(currentTask.jobId);
        if (job.status === "missing" && Date.now() - currentTask.createdAt < 15_000) {
          await wait(750);
          continue;
        }
        jobs.set(currentTask.jobId, job);
        if (getFeatureMode() === currentTask.featureMode) render();
        if (job.status !== "running") return job;
        await wait(750);
      }
    })().finally(() => followers.delete(currentTask.jobId));
    followers.set(currentTask.jobId, follower);
    return follower;
  }

  function resume() {
    for (const currentTask of tasks.values()) {
      void follow(currentTask).catch((error) => {
        jobs.set(currentTask.jobId, {
          error: error.message,
          jobId: currentTask.jobId,
          status: "failed",
        });
        if (getFeatureMode() === currentTask.featureMode) render();
      });
    }
  }

  return {
    follow,
    render,
    resume,
    setJob(jobId, job) {
      jobs.set(jobId, job);
    },
    start(currentTask) {
      tasks.set(currentTask.featureMode, currentTask);
      jobs.delete(currentTask.jobId);
      saveGenerationTask(storage, currentTask);
      render();
    },
    task,
    view,
  };
}

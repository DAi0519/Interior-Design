/**
 * [INPUT]: 依赖 node:test/assert、内存 sessionStorage 替身与 generation-task-state.js 的任务引用/视图推导
 * [OUTPUT]: 对外提供按功能保留任务、按图片计数的生成中进度、完成结果与过期错误的纯状态回归保障
 * [POS]: test 的生成页恢复状态测试，不访问真实浏览器存储
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  createGenerationTask,
  generationTaskView,
  readGenerationTasks,
  saveGenerationTask,
} from "../public/generation-task-state.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

test("白模与自由生图任务按功能独立保留", () => {
  const storage = memoryStorage();
  const whiteModel = createGenerationTask({
    createId: () => "white-123456789",
    featureMode: "whiteModel",
    loadingLabel: "正在生成白模",
    models: [{ key: "seedream5", label: "Seedream 5.0" }],
    now: () => 1,
  });
  const free = createGenerationTask({
    createId: () => "free-1234567890",
    featureMode: "free",
    loadingLabel: "正在自由生图",
    models: [{ key: "seedream5", label: "Seedream 5.0" }],
    now: () => 2,
  });
  saveGenerationTask(storage, whiteModel);
  saveGenerationTask(storage, free);
  assert.deepEqual(Object.keys(readGenerationTasks(storage)).sort(), [
    "free",
    "whiteModel",
  ]);
});

test("任务快照稳定推导加载、结果与过期状态", () => {
  const task = createGenerationTask({
    createId: () => "white-123456789",
    featureMode: "whiteModel",
    loadingLabel: "正在生成白模",
    models: [
      { key: "a", label: "A" },
      { key: "b", label: "B" },
    ],
  });
  assert.deepEqual(generationTaskView(task, { completed: 1, status: "running", total: 2 }), {
    message: "已完成 1 / 2 张图…",
    stage: "loading",
  });
  const outcomes = [{ status: "fulfilled" }, { status: "rejected" }];
  assert.deepEqual(generationTaskView(task, {
    result: { outcomes },
    status: "success",
  }), { outcomes, stage: "results" });
  assert.equal(generationTaskView(task, { status: "missing" }).stage, "error");
});

test("图片超分优先显示 ComfyUI 排队与执行阶段", () => {
  const task = createGenerationTask({
    createId: () => "upscale-12345678",
    featureMode: "imageUpscale",
    loadingLabel: "正在用 SeedVR2 超分到 8K…",
    models: [{ key: "seedvr2_1mp", label: "SeedVR2 · 8K" }],
  });
  assert.equal(generationTaskView(task, {
    message: "8K 超分已提交 ComfyUI，正在排队",
    stages: { comfyUi: "queued" },
    status: "running",
  }).message, "8K 超分已提交 ComfyUI，正在排队");
  assert.equal(generationTaskView(task, {
    message: "ComfyUI 正在执行 8K 超分",
    stages: { comfyUi: "executing" },
    status: "running",
  }).message, "ComfyUI 正在执行 8K 超分");
});

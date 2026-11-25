/**
 * [INPUT]: 依赖 generation-results、任务控制器、带版本入口的生成编排器与结果视觉源码
 * [OUTPUT]: 对外提供原图/结果对比、键盘语义、原图内存边界、页面等待态及同一真实任务结果揭示的回归保障
 * [POS]: test 的生成结果对比专项测试，不提交真实生图任务或持久化图片数据
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  comparisonValueText,
  normalizeComparisonSplit,
} from "../public/generation-results.js";
import { bindGenerationTaskController } from "../public/generation-task-controller.js";
import { createGenerationTask } from "../public/generation-task-state.js";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("对比分界归一化到 0–100 且保留可读语义", () => {
  assert.equal(normalizeComparisonSplit(Number.NaN), 50);
  assert.equal(normalizeComparisonSplit(-20), 0);
  assert.equal(normalizeComparisonSplit(49.6), 50);
  assert.equal(normalizeComparisonSplit(140), 100);
  assert.equal(comparisonValueText(68), "原图显示 68%");
});

test("结果卡默认关闭对比，按需使用原生 range 并可切回纯结果", async () => {
  const [results, css] = await Promise.all([
    read("../public/generation-results.js"),
    read("../public/result.css"),
  ]);
  assert.match(results, /if \(!comparisonImage\?\.dataUrl\) return \{ media, toggle: null \}/);
  assert.match(results, /range\.type = "range"/);
  assert.match(results, /range\.min = "0"/);
  assert.match(results, /range\.max = "100"/);
  assert.match(results, /range\.value = "50"/);
  assert.doesNotMatch(results, /media\.classList\.add\("comparison-active"\)/);
  assert.match(results, /toggle\.textContent = "滑动对比"/);
  assert.match(results, /toggle\.ariaPressed = "false"/);
  assert.doesNotMatch(results, /handle\.textContent/);
  assert.match(results, /setPointerCapture\?\.\(event\.pointerId\)/);
  assert.match(results, /media\.classList\.add\("comparison-dragging"\)/);
  assert.match(results, /range\.addEventListener\("pointerup", stopDragging\)/);
  assert.match(results, /setAttribute\("aria-valuetext", comparisonValueText\(split\)\)/);
  assert.match(results, /media\.classList\.toggle\("comparison-active"\)/);
  assert.match(css, /clip-path: inset\(0 calc\(100% - var\(--comparison-split\)\) 0 0\)/);
  assert.match(css, /\.result-media:focus-within \.result-comparison-divider span/);
  assert.match(css, /\.result-comparison-range:focus-visible \{\s*outline: none;/);
  assert.doesNotMatch(css, /0 0 0 4px rgb\(32 32 36 \/ 48%\)/);
  assert.match(css, /--comparison-handle-size: 30px/);
  assert.match(css, /\.result-comparison-divider span::before/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /\.result-media:not\(\.comparison-active\) \.result-comparison-range/);
  assert.match(css, /\.result-gallery\.multiple \{[^}]*align-content: start;[^}]*grid-auto-rows: max-content;/s);
  assert.match(css, /\.result-gallery\.multiple \.result-media \{[^}]*flex-shrink: 0;/s);
});

test("任务原图只保存在当前页面内存并由生成入口显式传入", async () => {
  const [app, controller, html] = await Promise.all([
    read("../public/app.js"),
    read("../public/generation-task-controller.js"),
    read("../public/index.html"),
  ]);
  assert.match(app, /generationTasks\.start\(task, \{[^}]*\bcomparisonImage: featureMode === "imageOutpaint" \? null : sourceImage\b[^}]*\}\)/);
  assert.match(controller, /const comparisonImages = new Map\(\)/);
  assert.match(controller, /comparisonImages\.set\(currentTask\.featureMode, comparisonImage\)/);
  assert.match(controller, /saveGenerationTask\(storage, currentTask\)/);
  assert.doesNotMatch(controller, /saveGenerationTask\(storage, currentTask, comparisonImage\)/);
  assert.match(html, /result\.css\?v=17/);
  assert.match(html, /app\.js\?v=\d+/);
});

test("新任务切出后保留首次可见的揭示，历史回执与重复渲染直接显示", () => {
  const store = new Map();
  const calls = [];
  let visible = true;
  const options = {
    generationResults: {
      showLoading: (message) => calls.push(message),
      showResults: (outcomes, { jobId, reveal }) => calls.push([outcomes, jobId, reveal]),
    },
    getFeatureMode: () => "free",
    canPresent: () => visible,
    onBusy() {},
    storage: { getItem: (key) => store.get(key), setItem: (key, value) => store.set(key, value) },
  };
  const controller = bindGenerationTaskController(options);
  const task = createGenerationTask({
    featureMode: "free", loadingLabel: "正在提交…",
    models: [{ key: "example", label: "模型" }], createId: () => "feedback",
  });
  const outcomes = [{ status: "fulfilled" }, { status: "rejected" }];
  controller.start(task);
  controller.setJob(task.jobId, { status: "running", completed: 1, total: 2 });
  controller.render();
  const job = { status: "success", result: { outcomes } };
  visible = false;
  controller.setJob(task.jobId, job);
  controller.render();
  assert.deepEqual(calls, ["正在提交…", "已完成 1 / 2 张图…"]);
  visible = true;
  controller.render();
  controller.render();
  const restored = bindGenerationTaskController(options);
  restored.setJob(task.jobId, job);
  restored.render();
  assert.deepEqual(calls, [
    "正在提交…", "已完成 1 / 2 张图…",
    [outcomes, task.jobId, true],
    [outcomes, task.jobId, false],
    [outcomes, task.jobId, false],
  ]);
});

test("首页隐藏背景自由生图任务时继续同步忙碌状态和保留首次揭示", () => {
  const store = new Map();
  const states = [];
  const reveals = [];
  let ownsTask = false;
  const controller = bindGenerationTaskController({
    getFeatureMode: () => "free",
    canShowTask: () => ownsTask,
    onBusy: (busy, { running }) => states.push([busy, running]),
    generationResults: {
      showLoading: () => assert.fail("背景任务不进入首页画廊"),
      showResults: (outcomes, { reveal }) => reveals.push([outcomes, reveal]),
    },
    storage: { getItem: key => store.get(key), setItem: (key, value) => store.set(key, value) },
  });
  const task = createGenerationTask({ featureMode: "free", loadingLabel: "生成中",
    models: [{ key: "example", label: "模型" }], createId: () => "background" });
  controller.start(task);
  controller.setJob(task.jobId, { status: "running" });
  controller.render();
  const outcomes = [{ status: "fulfilled" }];
  controller.setJob(task.jobId, { status: "success", result: { outcomes } });
  controller.render();
  assert.deepEqual(states, [[true, false], [true, true], [false, false]]);
  assert.deepEqual(reveals, []);
  ownsTask = true;
  controller.render();
  assert.deepEqual(reveals, [[outcomes, true]]);
});

test("等待状态位于占位上方，画廊只揭示新任务的成功图片", async () => {
  const [results, html] = await Promise.all([read("../public/generation-results.js"), read("../public/index.html")]);
  assert.match(html, /id="loadingLabel" class="generation-feedback-text" role="status"[^>]*>[^<]+<\/p>\s*<div class="generation-feedback-preview" aria-hidden="true">/);
  assert.doesNotMatch(html, /class="scan-line"/);
  assert.match(results, /renderedResults\.outcomes === outcomes/);
  assert.match(results, /showResults\(outcomes, \{[^}]*reveal = false/);
  assert.match(results, /if \(outcome\.status === "fulfilled"\) \{\s*if \(reveal\) revealGenerationImage/);
});

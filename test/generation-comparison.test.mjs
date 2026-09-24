/**
 * [INPUT]: 依赖 generation-results、任务控制器、生成编排器与结果视觉源码
 * [OUTPUT]: 对外提供原图/结果图滑动对比、键盘语义、页面内存边界及无原图降级的回归保障
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
  assert.match(app, /generationTasks\.start\(task, \{ comparisonImage: sourceImage \}\)/);
  assert.match(controller, /const comparisonImages = new Map\(\)/);
  assert.match(controller, /comparisonImages\.set\(currentTask\.featureMode, comparisonImage\)/);
  assert.match(controller, /saveGenerationTask\(storage, currentTask\)/);
  assert.doesNotMatch(controller, /saveGenerationTask\(storage, currentTask, comparisonImage\)/);
  assert.match(html, /result\.css\?v=14/);
  assert.match(html, /app\.js\?v=54/);
});

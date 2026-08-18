/**
 * [INPUT]: 依赖 node:test/assert、node:fs 与 Benchmark 实验配置的 HTML/CSS/ID 生成契约
 * [OUTPUT]: 对外提供实验 ID、智能分辨率、八类因子、因子上置、选择器与计数同组、隐藏重复候选标题、收窄固定参数及紧凑候选项的回归保障
 * [POS]: test 的 Benchmark 实验前端标识与排版护栏，不访问 DOM、Base 或模型
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createExperimentId,
  experimentResolutionOptions,
} from "../public/benchmark-experiment.js";

const experimentModels = [
  { defaultResolution: "2K", sizes: { "4:3": { "2K": {} } }, sizingMode: "preset" },
  { defaultResolution: "2K", sizes: { source: { "1K": {}, "2K": {} } }, sizingMode: "source" },
];

test("每个新实验生成带秒级时间戳和随机后缀的独立 ID", () => {
  assert.equal(
    createExperimentId({
      now: new Date("2026-08-04T08:05:06.789Z"),
      randomValue: "a1b2-c3d4",
    }),
    "EXP-20260804T080506Z-A1B2",
  );
  assert.notEqual(
    createExperimentId({ now: new Date("2026-08-04T08:05:06Z"), randomValue: "a1b2" }),
    createExperimentId({ now: new Date("2026-08-04T08:05:06Z"), randomValue: "c3d4" }),
  );
});

test("Flux2 Klein 与固定分辨率模型同组时按各模型默认 2K 智能适配", () => {
  assert.deepEqual(
    experimentResolutionOptions(experimentModels, "source"),
    [{ label: "智能适配 · 各模型 2K", value: "adaptive" }],
  );
});

test("没有 Flux2 Klein 时继续使用共同固定分辨率", () => {
  assert.deepEqual(
    experimentResolutionOptions([experimentModels[0]], "source"),
    [{ label: "2K", value: "2K" }],
  );
});

test("实验因子上置且固定参数使用收窄栅格", async () => {
  const [html, css] = await Promise.all([
    readFile(new URL("../public/benchmark.html", import.meta.url), "utf8"),
    readFile(new URL("../public/benchmark-experiment.css", import.meta.url), "utf8"),
  ]);

  assert.match(html, /class="experiment-meta-grid"/);
  assert.match(html, /class="parameter-grid foundation"/);
  assert.match(html, /class="parameter-grid output"/);
  assert.match(html, /class="parameter-grid volume"/);
  assert.ok(html.indexOf("experiment-variable") < html.indexOf("experiment-section-heading"));
  assert.doesNotMatch(html, /experimentVariableHint|variable-lock|experimentIdHelp|对比维度/);
  assert.match(html, /class="experiment-variable-toolbar"[\s\S]*experimentVariableSelect[\s\S]*variantSelectionMeta/);
  assert.match(html, /id="variantLegend" class="experiment-variable-legend"/);
  assert.match(css, /\.experiment-meta-grid\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 5fr\) minmax\(0, 5fr\) minmax\(140px, 2fr\)/);
  assert.match(css, /\.parameter-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(4, minmax\(0, 220px\)\)[\s\S]*max-width:\s*916px/);
  assert.match(css, /\.experiment-card \.config-options\s*\{[\s\S]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.experiment-card \.config-option\s*\{[\s\S]*min-height:\s*44px/);
  assert.match(css, /\.experiment-variable-picker \.custom-select-trigger,[\s\S]*font-size:\s*12px/);
  assert.match(css, /\.experiment-variable-toolbar\s*\{[\s\S]*align-items:\s*flex-end[\s\S]*gap:\s*12px/);
  assert.match(css, /\.experiment-variable-legend\s*\{[\s\S]*clip-path:\s*inset\(50%\)/);
  assert.match(css, /@media \(max-width: 1000px\)[\s\S]*\.experiment-card \.config-options[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 680px\)[\s\S]*\.experiment-card \.config-options[\s\S]*grid-template-columns:\s*1fr/);
});

test("八类质量配置都能成为实验因子且固定项按注册表互斥", async () => {
  const [html, controller] = await Promise.all([
    readFile(new URL("../public/benchmark.html", import.meta.url), "utf8"),
    readFile(new URL("../public/benchmark-experiment.js", import.meta.url), "utf8"),
  ]);

  assert.match(html, /id="experimentVariableSelect"/);
  for (const key of ["style-dna", "prompt-version", "fusion-model", "image-model", "ratio", "resolution", "output-format", "quality"]) {
    assert.match(html, new RegExp(`option value="${key}"`));
  }
  for (const field of ["Style", "Agent", "FusionModel", "FixedImageModel", "Ratio", "Resolution", "Format", "Quality"]) {
    assert.match(html, new RegExp(`id="experiment${field}Field"`));
  }
  assert.match(controller, /export const EXPERIMENT_VARIABLES/);
  assert.match(controller, /variableKey:\s*"image-model"/);
  assert.match(controller, /variantValues:\s*variants/);
  assert.match(controller, /classList\.toggle\("hidden", key === state\.variableKey\)/);
});

test("实验配置只保留一个生成实验计划动作", async () => {
  const [html, app] = await Promise.all([
    readFile(new URL("../public/benchmark.html", import.meta.url), "utf8"),
    readFile(new URL("../public/benchmark-app.js", import.meta.url), "utf8"),
  ]);

  assert.match(html, /id="planButton"[^>]*>生成实验计划<\/button>/);
  assert.doesNotMatch(html, /生成只读预演|id="planResult"|尚未生成实验计划/);
  assert.doesNotMatch(app, /planResult|等待预演|预演通过/);
  assert.match(app, /计划已生成/);
});

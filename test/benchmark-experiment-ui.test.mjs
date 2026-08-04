/**
 * [INPUT]: 依赖 node:test/assert、node:fs 与 Benchmark 实验配置的 HTML/CSS/ID 生成契约
 * [OUTPUT]: 对外提供实验 ID 唯一性、稳定网格分区、双栏模型卡与响应式降列的回归保障
 * [POS]: test 的 Benchmark 实验前端标识与排版护栏，不访问 DOM、Base 或模型
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createExperimentId } from "../public/benchmark-experiment.js";

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

test("实验配置使用稳定分区网格且候选模型不会产生三列孤项", async () => {
  const [html, css] = await Promise.all([
    readFile(new URL("../public/benchmark.html", import.meta.url), "utf8"),
    readFile(new URL("../public/benchmark-experiment.css", import.meta.url), "utf8"),
  ]);

  assert.match(html, /class="experiment-meta-grid"/);
  assert.match(html, /class="parameter-grid foundation"/);
  assert.match(html, /class="parameter-grid output"/);
  assert.match(html, /class="parameter-grid volume"/);
  assert.match(css, /\.experiment-meta-grid\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 5fr\) minmax\(0, 5fr\) minmax\(140px, 2fr\)/);
  assert.match(css, /\.experiment-card \.config-options\s*\{[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 680px\)[\s\S]*\.experiment-card \.config-options[\s\S]*grid-template-columns:\s*1fr/);
});

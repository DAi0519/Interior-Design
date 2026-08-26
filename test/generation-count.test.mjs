/**
 * [INPUT]: 依赖 node:test/assert、node:fs、生成张数控制器与工作台 HTML/自定义下拉 CSS 静态合同
 * [OUTPUT]: 对外提供 1–4 张归一化、原生 select 渐进增强结构及向上菜单定位的回归保障
 * [POS]: test 的生成张数交互测试，不创建 DOM 或发送真实生成请求
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  GENERATION_COUNT_VALUES,
  normalizeGenerationCount,
} from "../public/generation-count.js";

test("生成张数只接受 1–4 并对非法值回退到一张", () => {
  assert.deepEqual(GENERATION_COUNT_VALUES, [1, 2, 3, 4]);
  assert.equal(normalizeGenerationCount("4"), 4);
  assert.equal(normalizeGenerationCount(0), 1);
  assert.equal(normalizeGenerationCount(5), 1);
  assert.equal(normalizeGenerationCount("invalid"), 1);
});

test("生成张数使用向上展开的四项下拉菜单", async () => {
  const [html, customSelectCss] = await Promise.all([
    readFile(new URL("../public/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/custom-select.css", import.meta.url), "utf8"),
  ]);
  const field = html.match(/<label id="generationCountField"[\s\S]*?<\/label>/)?.[0] || "";
  assert.match(field, /<select id="generationCountSelect"[^>]*data-dropdown-placement="top"/);
  assert.equal((field.match(/<option value="[1-4]">[1-4] 张<\/option>/g) || []).length, 4);
  assert.doesNotMatch(field, /data-generation-count=|role="radio"/);
  assert.match(customSelectCss, /\.custom-select--top \.custom-select-menu\s*{[^}]*bottom: calc\(100% \+ 4px\)[^}]*top: auto[^}]*transform-origin: bottom center/s);
});

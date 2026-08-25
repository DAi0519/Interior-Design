/**
 * [INPUT]: 依赖 node:test/assert、node:fs、生成张数控制器与工作台 HTML/CSS 静态合同
 * [OUTPUT]: 对外提供 1–4 张归一化、四键直接选择结构、无下拉菜单及紧凑四列布局的回归保障
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

test("生成张数使用四个直接选择键而不再创建下拉菜单", async () => {
  const [html, themeCss] = await Promise.all([
    readFile(new URL("../public/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/theme.css", import.meta.url), "utf8"),
  ]);
  const field = html.match(/<div id="generationCountField"[\s\S]*?<\/div>\s*<\/div>/)?.[0] || "";
  assert.match(field, /class="generation-count-list" role="radiogroup"/);
  assert.equal((field.match(/data-generation-count=/g) || []).length, 4);
  assert.doesNotMatch(field, /<select|<option/);
  assert.match(themeCss, /\.generation-count-list\s*{[^}]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/s);
  assert.match(themeCss, /\.generation-count-option\s*{[^}]*justify-content: center[^}]*text-align: center/s);
});

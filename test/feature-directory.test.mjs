/**
 * [INPUT]: 依赖 node:test/assert、node:fs 与生图工作台入口/主题 CSS
 * [OUTPUT]: 对外提供 AI设计/AI渲染/AI创作内嵌目录、八功能唯一入口、双面板桌面布局与窄屏降级的静态合同测试
 * [POS]: test 的生图工作台信息架构回归测试，不创建 DOM 或发送请求
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("八个功能只在三组内嵌目录中出现一次", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const directory = html.match(/<nav id="featureModeList"[\s\S]*?<\/nav>/)?.[0] || "";

  assert.match(directory, /<h2 id="aiDesignTitle">AI设计<\/h2>/);
  assert.match(directory, /<h2 id="aiRenderTitle">AI渲染<\/h2>/);
  assert.match(directory, /<h2 id="aiCreationTitle">AI创作<\/h2>/);
  assert.equal((html.match(/data-feature-mode=/g) || []).length, 8);
  assert.equal((directory.match(/>白模渲染<\/button>/g) || []).length, 1);
  assert.equal((directory.match(/>精模渲染<\/button>/g) || []).length, 1);
  assert.doesNotMatch(html, /id="featureModeTitle">功能/);
});

test("目录与配置共用左面板且窄屏转为三列导航", async () => {
  const css = await readFile(new URL("../public/theme.css", import.meta.url), "utf8");

  assert.match(css, /@media \(min-width: 761px\)[\s\S]*?\.control-panel\s*{[^}]*grid-template-columns: 120px minmax\(0, 1fr\)[^}]*grid-template-rows: minmax\(0, 1fr\) auto/s);
  assert.match(css, /\.feature-directory\s*{[^}]*grid-column: 1[^}]*grid-row: 1 \/ -1/s);
  assert.match(css, /\.control-panel-scroll\s*{[^}]*grid-column: 2[^}]*grid-row: 1/s);
  assert.match(css, /\.action-section\s*{[^}]*grid-column: 2[^}]*grid-row: 2/s);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.feature-directory\s*{[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/s);
});

test("目录分类与功能文字保持可读尺寸", async () => {
  const css = await readFile(new URL("../public/theme.css", import.meta.url), "utf8");

  assert.match(css, /\.feature-directory-group h2\s*{[^}]*color: var\(--text\)[^}]*font-size: 11px[^}]*font-weight: 700/s);
  assert.match(css, /\.feature-directory \.feature-mode-option\s*{[^}]*font-size: 12px[^}]*min-height: 34px/s);
});

test("所有生成功能先恢复顺序再把图片上传区置顶", async () => {
  const [appSource, source] = await Promise.all([
    readFile(new URL("../public/app.js", import.meta.url), "utf8"),
    readFile(new URL("../public/design-inputs.js", import.meta.url), "utf8"),
  ]);

  assert.match(appSource, /from "\.\/design-inputs\.js\?v=2"/);
  assert.match(source, /const reference = byId\("referenceInput"\)\.closest\("section"\)/);
  assert.match(source, /const emptyOrder = \[reference, styleReference, byId\("emptyRoomTypeSection"\)/);
  assert.match(source, /parent\.append\(\.\.\.originalOrder\)[\s\S]*parent\.prepend\(reference\)[\s\S]*reference\.after\(styleReference\)/s);
});

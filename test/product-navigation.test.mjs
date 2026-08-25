/**
 * [INPUT]: 依赖 node:test/assert、node:fs 与两页 HTML、共享顶栏 CSS/JS、Benchmark CSS、server.mjs、package.json 的字体与动效契约
 * [OUTPUT]: 对外提供同源 Inter Variable、Raycast 字形、固定依赖版本，以及只移动产品指示块且内容面板静止的回归保障
 * [POS]: test 的跨工作台品牌字体护栏，不启动服务或访问外部网络
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const fontHref = "/vendor/inter-variable-latin.woff2";

test("两页使用项目内嵌的 Raycast Inter Variable 品牌字体", async () => {
  const [indexHtml, benchmarkHtml, navigationCss, serverSource, packageSource, fontStat] =
    await Promise.all([
      readFile(new URL("../public/index.html", import.meta.url), "utf8"),
      readFile(new URL("../public/benchmark.html", import.meta.url), "utf8"),
      readFile(new URL("../public/product-navigation.css", import.meta.url), "utf8"),
      readFile(new URL("../server.mjs", import.meta.url), "utf8"),
      readFile(new URL("../package.json", import.meta.url), "utf8"),
      stat(new URL("../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2", import.meta.url)),
    ]);

  for (const html of [indexHtml, benchmarkHtml]) {
    assert.match(html, new RegExp(`<link rel="preload" href="${fontHref.replace(".", "\\.")}" as="font" type="font/woff2" crossorigin />`));
  }

  assert.match(navigationCss, /font-family: "Inter Raycast"/);
  assert.match(navigationCss, /font-feature-settings: "calt", "kern", "liga", "ss03"/);
  assert.match(navigationCss, /font-weight: 600/);
  assert.match(navigationCss, /transform: translateY\(0\.5px\)/);
  assert.match(navigationCss, /font-size: 15px;\s+transform: none;/);
  assert.match(serverSource, /"\/vendor\/inter-variable-latin\.woff2"/);
  assert.equal(JSON.parse(packageSource).dependencies["@fontsource-variable/inter"], "5.3.0");
  assert.ok(fontStat.size > 40_000);
});

test("跨工作台切换只移动产品指示块", async () => {
  const [navigationSource, navigationCss, benchmarkCss] = await Promise.all([
    readFile(new URL("../public/product-navigation.js", import.meta.url), "utf8"),
    readFile(new URL("../public/product-navigation.css", import.meta.url), "utf8"),
    readFile(new URL("../public/benchmark.css", import.meta.url), "utf8"),
  ]);

  assert.match(navigationSource, /gsap\.to\(indicator/);
  assert.doesNotMatch(navigationSource, /autoAlpha|\.control-panel|\.result-panel|\.step-nav|\.panel\.active/);
  assert.doesNotMatch(navigationCss, /\.product-switch-option:active\s*\{/);
  assert.doesNotMatch(benchmarkCss, /animation:\s*reveal|@keyframes\s+reveal/);
});

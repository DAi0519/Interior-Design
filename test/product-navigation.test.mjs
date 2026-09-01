/**
 * [INPUT]: 依赖 node:test/assert、node:fs 与三页 HTML、共享顶栏 CSS/JS、Benchmark CSS、server.mjs、package.json 的字体与动效契约
 * [OUTPUT]: 对外提供同源 Inter Variable、Raycast 字形、三页 1440px 外壳、全局无布局属性补间护栏，以及静态首帧激活层、140ms 导航前双层 transform 与 reduced-motion 原生降级的回归保障
 * [POS]: test 的跨工作台品牌字体护栏，不启动服务或访问外部网络
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import test from "node:test";

const fontHref = "/vendor/inter-variable-latin.woff2";

test("三页使用项目内嵌的 Raycast Inter Variable 品牌字体", async () => {
  const [indexHtml, betaHtml, benchmarkHtml, navigationCss, serverSource, packageSource, fontStat] =
    await Promise.all([
      readFile(new URL("../public/index.html", import.meta.url), "utf8"),
      readFile(new URL("../public/beta.html", import.meta.url), "utf8"),
      readFile(new URL("../public/benchmark.html", import.meta.url), "utf8"),
      readFile(new URL("../public/product-navigation.css", import.meta.url), "utf8"),
      readFile(new URL("../server.mjs", import.meta.url), "utf8"),
      readFile(new URL("../package.json", import.meta.url), "utf8"),
      stat(new URL("../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2", import.meta.url)),
    ]);

  for (const html of [indexHtml, betaHtml, benchmarkHtml]) {
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

test("三工作台外壳同宽，并用静态首帧与导航前 transform 移动激活视窗", async () => {
  const [indexHtml, betaHtml, benchmarkHtml, themeCss, betaCss, benchmarkCss, navigationCss, navigationSource, serverSource, packageSource] = await Promise.all([
    readFile(new URL("../public/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/beta.html", import.meta.url), "utf8"),
    readFile(new URL("../public/benchmark.html", import.meta.url), "utf8"),
    readFile(new URL("../public/theme.css", import.meta.url), "utf8"),
    readFile(new URL("../public/beta.css", import.meta.url), "utf8"),
    readFile(new URL("../public/benchmark.css", import.meta.url), "utf8"),
    readFile(new URL("../public/product-navigation.css", import.meta.url), "utf8"),
    readFile(new URL("../public/product-navigation.js", import.meta.url), "utf8"),
    readFile(new URL("../server.mjs", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  const pages = [indexHtml, betaHtml, benchmarkHtml];
  pages.forEach((html, activeIndex) => {
    assert.match(html, new RegExp(`id="productSwitcher" class="product-switcher" data-active-index="${activeIndex}"`));
    assert.equal((html.match(/product-switch-active-viewport/g) || []).length, 1);
    assert.equal((html.match(/product-switch-active-option/g) || []).length, 3);
    assert.match(html, /product-navigation\.css\?v=14/);
    assert.match(html, /product-navigation\.js\?v=9/);
    assert.doesNotMatch(html, /vendor\/gsap\.min\.js/);
  });

  for (const pageCss of [themeCss, betaCss, benchmarkCss]) {
    assert.match(pageCss, /\.app-shell\s*{[^}]*max-width: 1440px;[^}]*padding: 16px;/s);
  }
  assert.match(navigationCss, /\.app-shell\s*{[^}]*left: calc\(\(100vw - 100%\) \/ 2\);[^}]*position: relative;/s);

  assert.match(navigationCss, /\.product-switch-active-viewport\s*{[^}]*transition: transform 140ms cubic-bezier\(0\.77, 0, 0\.175, 1\)/s);
  assert.match(navigationCss, /\.product-switch-active-layer\s*{[^}]*transition: transform 140ms cubic-bezier\(0\.77, 0, 0\.175, 1\)/s);
  assert.match(navigationCss, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.product-switch-active-viewport,[\s\S]*\.product-switch-active-layer\s*{\s*transition-duration: 0\.01ms/s);
  assert.match(navigationCss, /--product-count: 3/);
  assert.match(navigationCss, /grid-template-columns: repeat\(var\(--product-count\), minmax\(0, 1fr\)\)/);
  assert.match(navigationCss, /\.product-switch-active-viewport\s*{[^}]*overflow: hidden[^}]*width: calc\(\(100% - 6px\) \/ var\(--product-count\)\)[^}]*will-change: transform/s);
  assert.match(navigationCss, /\.product-switch-active-layer\s*{[^}]*height: 100%[^}]*width: calc\(100% \* var\(--product-count\)\)[^}]*will-change: transform/s);
  assert.match(navigationCss, /data-active-index="1"[^}]*\.product-switch-active-viewport\s*{[^}]*translate3d\(100%, 0, 0\)/s);
  assert.match(navigationCss, /data-active-index="2"[^}]*\.product-switch-active-layer\s*{[^}]*translate3d\(calc\(-200% \/ 3\), 0, 0\)/s);
  assert.match(navigationCss, /\.product-switch-active-option\s*{[^}]*color: #fff[^}]*font-weight: 600/s);
  assert.doesNotMatch(navigationCss, /clip-path/);
  assert.doesNotMatch(navigationCss, /transition:[^;]*(?:color|font-weight)/s);
  assert.doesNotMatch(navigationCss, /\.product-switch-option:active\s*\{/);
  assert.match(navigationSource, /const navigationDurationMs = 140/);
  assert.match(navigationSource, /window\.matchMedia\("\(prefers-reduced-motion: reduce\)"\)/);
  assert.match(navigationSource, /event\.preventDefault\(\)/);
  assert.match(navigationSource, /switcher\.dataset\.activeIndex = String\(targetIndex\)/);
  assert.match(navigationSource, /window\.clearTimeout\(navigationTimer\)/);
  assert.match(navigationSource, /window\.location\.assign\(destination\.href\)/);
  assert.doesNotMatch(navigationSource, /sessionStorage|requestAnimationFrame|gsap|opacity|color/);
  assert.doesNotMatch(serverSource, /vendor\/gsap\.min\.js|GSAP_BROWSER_BUNDLE/);
  assert.equal(JSON.parse(packageSource).dependencies.gsap, undefined);
});

test("全局动效不补间布局属性并响应减少动态偏好", async () => {
  const publicDirectory = new URL("../public/", import.meta.url);
  const cssNames = (await readdir(publicDirectory)).filter((name) => name.endsWith(".css"));
  const cssEntries = await Promise.all(cssNames.map(async (name) => ({
    name,
    source: await readFile(new URL(name, publicDirectory), "utf8"),
  })));

  for (const { name, source } of cssEntries) {
    assert.doesNotMatch(source, /transition\s*:\s*all\b/, `${name} 不得使用 transition: all`);
    assert.doesNotMatch(
      source,
      /transition(?:-property)?\s*:[^;]*(?:width|height|top|right|bottom|left|margin|padding|grid|flex)[^;]*;/s,
      `${name} 不得补间会触发布局的属性`,
    );
  }

  const styles = cssEntries.find(({ name }) => name === "styles.css")?.source || "";
  const benchmarkResponsive = cssEntries.find(
    ({ name }) => name === "benchmark-responsive.css",
  )?.source || "";
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation-duration: 1ms !important/);
  assert.match(benchmarkResponsive, /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation-duration: 0\.01ms !important/);
});

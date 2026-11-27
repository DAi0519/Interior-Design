/**
 * [INPUT]: 依赖 node:test/assert、node:fs 与三页 HTML、共享侧栏 CSS/JS、server.mjs、package.json 的字体与动效契约
 * [OUTPUT]: 验证三页导航首帧、首页路由首帧识别、同源 Inter 字形、横排双入口、当前态与键盘焦点以及移动抽屉
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
  assert.match(navigationCss, /\.product-sidebar-head\s*{[^}]*align-items: center;[^}]*flex: 0 0 var\(--workbench-header-height\);/s);
  assert.match(navigationCss, /\.product-sidebar-head \.brand-title\s*{[^}]*font-size: 16px/s);
  assert.match(serverSource, /"\/vendor\/inter-variable-latin\.woff2"/);
  assert.equal(JSON.parse(packageSource).dependencies["@fontsource-variable/inter"], "5.3.0");
  assert.ok(fontStat.size > 40_000);
});

test("三页侧栏只提供生图测试和批量跑图，两页首帧标出当前入口", async () => {
  const routes = ["/", "/beta.html"];
  const labels = ["生图测试", "批量跑图"];
  const currentRoutes = { index: ["/"], beta: ["/beta.html"], benchmark: [] };
  const pages = await Promise.all(Object.entries(currentRoutes).map(async ([name, current]) => ({
    html: await readFile(new URL(`../public/${name}.html`, import.meta.url), "utf8"),
    current,
  })));
  for (const { html, current } of pages) {
    const sidebar = html.match(/<aside id="productSidebar"[^>]*>[\s\S]*?<\/aside>/)?.[0] || "";
    const navigation = sidebar.match(/<nav id="productSwitcher"[^>]*>[\s\S]*?<\/nav>/)?.[0] || "";
    const links = [...navigation.matchAll(/<a class="product-switch-option" href="([^"]+)"([^>]*)>([\s\S]*?)<\/a>/g)];
    assert.match(html, /class="app-shell workbench-shell"/);
    assert.deepEqual(links.map((link) => link[1]), routes);
    assert.deepEqual(links.filter((link) => link[2].includes('aria-current="page"')).map((link) => link[1]), current);
    assert.deepEqual(links.map((link) => link[2].match(/aria-label="([^"]+)"/)?.[1]), labels);
    assert.deepEqual(links.map((link) => link[2].match(/title="([^"]+)"/)?.[1]), labels);
    assert.deepEqual(links.map((link) => link[3].match(/class="product-switch-label">([^<]+)</)?.[1]), labels);
    assert.match(html, /id="productSidebarOpen"[^>]*aria-controls="productSidebarDialog"/);
    assert.match(html, /<dialog id="productSidebarDialog"/);
    assert.match(html, /product-navigation\.css\?v=30/);
    assert.match(html, /<script src="\/product-navigation\.js\?v=14"(?: data-home-image-chat)?><\/script>\s*<\/head>/);
    assert.equal(html.includes('data-home-image-chat></script>'), current.includes("/"));
    const footer = sidebar.match(/<footer class="product-sidebar-footer"[^>]*>[\s\S]*?<\/footer>/)?.[0] || "";
    const brand = sidebar.match(/<div class="product-sidebar-head">[\s\S]*?<\/div>/)?.[0] || "";
    assert.doesNotMatch(brand, /data-app-update|sidebar-update-notice/);
    assert.match(footer, /class="app-update-trigger sidebar-version"[^>]*data-app-update[\s\S]*?sidebar-version-label" data-app-update-label/);
    assert.match(footer, /product-status/);
    const header = html.match(/<header class="topbar[^"]*">[\s\S]*?<\/header>/)?.[0] || "";
    assert.doesNotMatch(header, /productSwitcher|data-app-update|product-status/);
  }

  const css = await readFile(new URL("../public/product-navigation.css", import.meta.url), "utf8");
  const source = await readFile(new URL("../public/product-navigation.js", import.meta.url), "utf8");
  assert.match(css, /\.app-shell\.workbench-shell\s*{[^}]*--workbench-sidebar-width: 144px;[^}]*height: 100dvh;[^}]*max-width: none;/s);
  assert.match(css, /\.workbench-sidebar-collapsed \.app-shell\.workbench-shell\s*{[^}]*--workbench-sidebar-width: 52px;/s);
  assert.match(css, /\.product-switcher\s*{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/s);
  assert.match(css, /\.workbench-sidebar-collapsed \.workbench-shell > \.product-sidebar \.product-switcher\s*{[^}]*grid-template-columns: minmax\(0, 1fr\)/s);
  assert.match(css, /\.product-switch-option\[aria-current="page"\]\s*{[^}]*var\(--brand-key-selected-bg,[^}]*var\(--brand-key-selected-ink,/s);
  const selectionRules = css.match(/\.product-switch-option\[aria-current="page"\]\s*{[^}]*}/)?.[0] || "";
  assert.doesNotMatch(selectionRules, /border|box-shadow|outline/);
  assert.match(css, /\.product-switch-option:focus-visible:where\(:not\(\[aria-current="page"\]\)\),\s*\.product-sidebar-footer > \.sidebar-version:focus-visible\s*\{[^}]*background:/s);
  assert.match(css, /\.product-switch-option\[aria-current="page"\]:focus-visible\s*\{[^}]*-webkit-text-stroke: 0\.5px currentColor;/);
  assert.match(css, /\.product-switch-option\[aria-current="page"\]:focus-visible svg\s*\{[^}]*stroke-width: 2\.25;/);
  assert.doesNotMatch(css, /\.product-switch-option[^\s,{]*:focus-visible::(?:before|after)/);
  assert.match(css, /@media \(max-width: 900px\)\s*{[\s\S]*grid-template-areas: "topbar" "content";/);
  assert.match(source, /window\.localStorage\.getItem\(storageKey\)[\s\S]*DOMContentLoaded/);
  assert.match(source, /document\.currentScript\?\.hasAttribute\("data-home-image-chat"\) && !new URLSearchParams\(window\.location\.search\)\.get\("feature"\)[\s\S]*?html\.classList\.add\("image-chat-home"\)[\s\S]*?DOMContentLoaded/);
  assert.match(source, /dialog\.append\(sidebar\)[\s\S]*shell\.prepend\(sidebar\)/);
  assert.match(source, /dialog\.showModal\(\)/);
  assert.match(source, /dialog\.addEventListener\("close",[\s\S]*opener\.focus\(/);
  assert.match(source, /if \(mobile\.matches && !openingUtility\) opener\.focus\(/);
  assert.match(source, /\[data-app-update\], #connectionButton[\s\S]*?openingUtility = true;\s*dialog\.close\(\);\s*opener\.focus\([\s\S]*?capture: true/);
  assert.match(source, /event\.repeat && \(event\.key === "Enter" \|\| event\.key === " "\)\) event\.preventDefault\(\)/);
  assert.match(source, /dialog\.addEventListener\("pointerdown",[\s\S]*backdropPress && onBackdrop\(event\)/);
  assert.doesNotMatch(source, /location\.assign|location\.replace/);
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

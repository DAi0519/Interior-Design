/**
 * [INPUT]: 依赖 node:test/assert、node:fs 与两页 HTML、共享顶栏 CSS/JS、Benchmark CSS、server.mjs、package.json 的字体与动效契约
 * [OUTPUT]: 对外提供同源 Inter Variable、Raycast 字形、全局无布局属性补间护栏，以及使用 GSAP 双层 transform、点击时间续播 180ms power3.inOut、overwrite auto 和 matchMedia reduced-motion 的回归保障
 * [POS]: test 的跨工作台品牌字体护栏，不启动服务或访问外部网络
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
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

test("跨工作台切换用 GSAP 同步移动激活视窗与文字轨道", async () => {
  const [indexHtml, benchmarkHtml, navigationSource, navigationCss] = await Promise.all([
    readFile(new URL("../public/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/benchmark.html", import.meta.url), "utf8"),
    readFile(new URL("../public/product-navigation.js", import.meta.url), "utf8"),
    readFile(new URL("../public/product-navigation.css", import.meta.url), "utf8"),
  ]);

  assert.match(navigationSource, /function createActiveLayer\(options\)/);
  assert.match(navigationSource, /product-switch-active-viewport/);
  assert.match(navigationSource, /product-switch-active-layer/);
  assert.match(navigationSource, /activeOption\.textContent = option\.textContent/);
  assert.match(navigationSource, /sessionStorage\.setItem\(transitionStorageKey/);
  assert.match(navigationSource, /sourceIndex,/);
  assert.match(navigationSource, /const transitionDurationSeconds = 0\.18/);
  assert.match(navigationSource, /\(Date\.now\(\) - rememberedState\.createdAt\) \/ 1_000/);
  assert.match(navigationSource, /const gsap = window\.gsap/);
  assert.match(navigationSource, /const media = gsap\.matchMedia\(\)/);
  assert.match(navigationSource, /reduceMotion: "\(prefers-reduced-motion: reduce\)"/);
  assert.match(navigationSource, /gsap\.set\(activeViewport, \{ force3D: true, xPercent: startIndex \* 100 \}\)/);
  assert.match(navigationSource, /gsap\.set\(activeLayer, \{ force3D: true, xPercent: startIndex \* -50 \}\)/);
  assert.match(navigationSource, /switcher\.dataset\.activeIndex = String\(currentIndex\)/);
  assert.match(navigationSource, /navigationTween = gsap\.to\(\[activeViewport, activeLayer\]/);
  assert.match(navigationSource, /duration: transitionDurationSeconds/);
  assert.match(navigationSource, /ease: "power3\.inOut"/);
  assert.match(navigationSource, /force3D: true/);
  assert.match(navigationSource, /overwrite: "auto"/);
  assert.match(navigationSource, /paused: true/);
  assert.match(navigationSource, /xPercent: \(index\) => \(index === 0 \? currentIndex \* 100 : currentIndex \* -50\)/);
  assert.match(navigationSource, /navigationTween\.time\(Math\.min\(\s*transitionElapsedSeconds,\s*transitionDurationSeconds,\s*\)\)/);
  assert.match(navigationSource, /if \(navigationTween\.progress\(\) < 1\) navigationTween\.play\(\)/);
  assert.match(navigationSource, /navigationTween\?\.kill\(\)/);
  assert.doesNotMatch(navigationSource, /requestAnimationFrame/);
  assert.doesNotMatch(navigationSource, /autoAlpha|opacity:|backgroundColor|color:/);
  assert.doesNotMatch(navigationSource, /transitioning|event\.preventDefault\(\)|window\.location\.assign/);
  assert.match(navigationCss, /\.product-switch-active-viewport\s*{[^}]*overflow: hidden[^}]*width: calc\(\(100% - 6px\) \/ 2\)[^}]*will-change: transform/s);
  assert.match(navigationCss, /\.product-switch-active-layer\s*{[^}]*height: 100%[^}]*width: 200%[^}]*will-change: transform/s);
  assert.match(navigationCss, /\.product-switch-active-option\s*{[^}]*color: #fff[^}]*font-weight: 600/s);
  assert.doesNotMatch(navigationCss, /clip-path/);
  assert.doesNotMatch(navigationCss, /transition:[^;]*(?:color|font-weight)/s);
  assert.doesNotMatch(navigationCss, /\.product-switch-option:active\s*\{/);
  for (const html of [indexHtml, benchmarkHtml]) {
    assert.match(html, /product-navigation\.css\?v=12/);
    assert.match(html, /raycast-accent\.css\?v=42/);
    assert.match(html, /product-navigation\.js\?v=7/);
    assert.match(html, /vendor\/gsap\.min\.js/);
    assert.ok(html.indexOf("vendor/gsap.min.js") < html.indexOf("product-navigation.js?v=7"));
  }
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

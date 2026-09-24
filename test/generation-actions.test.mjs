/**
 * [INPUT]: 依赖 node:test/assert、node:fs 与浏览器生成动作模块、入口 HTML、动作/主题 CSS 和内嵌 Smiley Sans 字体资产
 * [OUTPUT]: 对外提供白模/空房首次单按钮、提示词复用双按钮、输入失效、自由生图隔离、START/RUNNING… 视觉文案、中文 aria-label/aria-busy、保留橙色并带中性扫光的运行态、无图标展示字体、精密键帽反馈、桌面内嵌目录/独立滚动区与不遮挡配置的底部动作栏、窄屏自然流布局回归保障
 * [POS]: test 的生成动作状态与静态视觉合同测试，不创建 DOM 或发送真实请求
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

import { generationActionState } from "../public/generation-actions.js";

function state(overrides = {}) {
  return generationActionState({
    currentIdentity: "current",
    featureMode: "whiteModel",
    reusableIdentity: null,
    ...overrides,
  });
}

test("白模首次渲染显示 START 并保留中文动作语义", () => {
  assert.deepEqual(state(), {
    hasReusablePrompt: false,
    mainLabel: "START",
    mainAriaLabel: "开始渲染",
  });
});

test("相同融合输入成功后显示再次渲染与重新融合", () => {
  assert.deepEqual(state({ reusableIdentity: "current" }), {
    hasReusablePrompt: true,
    mainLabel: "START",
    mainAriaLabel: "再次渲染",
  });
});

test("空房设计与白模共享提示词复用动作", () => {
  assert.deepEqual(
    state({ featureMode: "emptyRoom", reusableIdentity: "current" }),
    { hasReusablePrompt: true, mainLabel: "START", mainAriaLabel: "再次渲染" },
  );
});

test("融合输入变化会恢复首次渲染状态", () => {
  assert.equal(
    state({ currentIdentity: "changed", reusableIdentity: "current" })
      .hasReusablePrompt,
    false,
  );
});

test("自由生图始终保持单一 START 按钮", () => {
  assert.deepEqual(
    state({ featureMode: "free", reusableIdentity: "current" }),
    { hasReusablePrompt: false, mainLabel: "START", mainAriaLabel: "开始生成" },
  );
});

test("生成期间主按钮显示 RUNNING 并保留中文忙碌语义", () => {
  assert.deepEqual(state({ busy: true }), {
    hasReusablePrompt: false,
    mainLabel: "RUNNING…",
    mainAriaLabel: "生成中",
  });
});

test("主动作使用项目内嵌展示字体且不包含装饰图标", async () => {
  const [html, css, themeCss, actionsJs, font, license] = await Promise.all([
    readFile(new URL("../public/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/generation-actions.css", import.meta.url), "utf8"),
    readFile(new URL("../public/theme.css", import.meta.url), "utf8"),
    readFile(new URL("../public/generation-actions.js", import.meta.url), "utf8"),
    stat(new URL("../public/smiley-sans-v2.0.1.woff2", import.meta.url)),
    readFile(new URL("../public/smiley-sans-OFL-1.1.txt", import.meta.url), "utf8"),
  ]);

  const button = html.match(/<button id="generateButton"[\s\S]*?<\/button>/)?.[0] || "";
  assert.match(html, /<link rel="preload" href="\/smiley-sans-v2\.0\.1\.woff2" as="font" type="font\/woff2" crossorigin \/>/);
  assert.match(button, /aria-label="开始生成"/);
  assert.match(button, /<span class="button-label">\s*<span>START<\/span>/);
  assert.doesNotMatch(button, /<svg\b/);
  assert.match(css, /font-family: "Canvas Action Display"/);
  assert.match(css, /src: url\("\/smiley-sans-v2\.0\.1\.woff2"\) format\("woff2"\)/);
  assert.match(css, /\.generation-actions \.generate-button \.button-label\s*{[^}]*font-size: 21px[^}]*letter-spacing: 0\.18em[^}]*text-indent: 0\.18em/s);
  assert.match(html, /\/theme\.css\?v=32/);
  assert.match(html, /\/generation-actions\.css\?v=16/);
  assert.match(css, /\.generation-actions \.generate-button \.button-label\s*{[^}]*transform: translateY\(-0\.5px\)/s);
  assert.match(actionsJs, /generateButton\.setAttribute\("aria-busy", String\(busy\)\)/);
  assert.match(actionsJs, /root\.classList\.toggle\("is-busy", busy\)/);
  assert.match(css, /\.generation-actions\.is-busy \.generate-button::after\s*{[^}]*animation: generation-action-scan 1\.8s[^}]*rgb\(255 255 255 \/ 20%\)[^}]*rgb\(32 32 36 \/ 8%\)/s);
  assert.match(css, /@keyframes generation-action-scan\s*{[^}]*translateX\(-120%\)[\s\S]*translateX\(120%\)/s);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*{[^}]*\.generation-actions\.is-busy \.generate-button::after\s*{[^}]*animation: none[^}]*opacity: 0/s);
  assert.match(css, /\.generation-actions\s*{[^}]*width: 100%/s);
  assert.match(css, /\.generation-actions\.has-reusable-prompt\s*{[^}]*width: 100%/s);
  assert.match(css, /\.panel-section\[aria-labelledby="parameterTitle"\]\s*{[^}]*border-bottom: 0/s);
  assert.match(css, /\.action-section\.generation-control\s*{[^}]*backdrop-filter: none[^}]*background: transparent[^}]*border: 0[^}]*box-shadow: none[^}]*min-height: 54px[^}]*margin: 0 12px[^}]*overflow: visible[^}]*padding: 0[^}]*width: calc\(100% - 24px\)/s);
  assert.match(html, /<aside class="control-panel"[^>]*>\s*<nav id="featureModeList" class="feature-directory"[\s\S]*<\/nav>\s*<div class="control-panel-scroll">[\s\S]*<\/div>\s*<section class="action-section generation-control">/);
  assert.match(css, /@media \(min-width: 761px\)\s*{[^}]*\.action-section\.generation-control\s*{[^}]*background: linear-gradient[^}]*box-shadow: 0 -12px 28px[^}]*margin: 0[^}]*min-height: 78px[^}]*padding: 12px[^}]*position: relative[^}]*width: 100%/s);
  assert.doesNotMatch(css, /position: sticky/);
  assert.match(css, /@media \(max-width: 760px\)\s*{[^}]*\.action-section\.generation-control\s*{[^}]*margin: 12px 12px/s);
  assert.doesNotMatch(css, /(?:^|\n)\.generation-control\s*{/);
  assert.match(css, /@media \(max-width: 560px\)\s*{[^}]*\.action-section\.generation-control\s*{[^}]*margin: 12px 10px 10px[^}]*width: calc\(100% - 20px\)/s);
  assert.match(themeCss, /grid-template-columns: minmax\(440px, clamp\(440px, 33vw, 490px\)\) minmax\(0, 1fr\)/);
  assert.match(themeCss, /\.control-panel\s*{[^}]*display: grid[^}]*grid-template-columns: 120px minmax\(0, 1fr\)[^}]*grid-template-rows: minmax\(0, 1fr\) auto[^}]*overflow: hidden/s);
  assert.match(themeCss, /\.control-panel-scroll\s*{[^}]*min-height: 0[^}]*overflow-y: auto[^}]*overscroll-behavior-x: none[^}]*overscroll-behavior-y: none/s);
  assert.doesNotMatch(themeCss, /overscroll-behavior: contain/);
  assert.ok(font.size > 1_000_000);
  assert.match(license, /SIL OPEN FONT LICENSE Version 1\.1/);
});

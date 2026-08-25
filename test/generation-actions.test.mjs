/**
 * [INPUT]: 依赖 node:test/assert、node:fs 与浏览器生成动作模块、入口 HTML、动作/主题 CSS 和内嵌 Smiley Sans 字体资产
 * [OUTPUT]: 对外提供白模/空房首次单按钮、提示词复用双按钮、输入失效、自由生图隔离、START/RUNNING… 视觉文案、中文 aria-label、无图标展示字体、无视觉套框/分割线/边界回弹、全断点内容安全间距且保留光学底距的横向悬浮动作与宽屏粘性行为回归保障
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
  const [html, css, themeCss, font, license] = await Promise.all([
    readFile(new URL("../public/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/generation-actions.css", import.meta.url), "utf8"),
    readFile(new URL("../public/theme.css", import.meta.url), "utf8"),
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
  assert.match(html, /\/theme\.css\?v=25/);
  assert.match(html, /\/generation-actions\.css\?v=12/);
  assert.match(css, /\.generation-actions\s*{[^}]*width: 100%/s);
  assert.match(css, /\.generation-actions\.has-reusable-prompt\s*{[^}]*width: 100%/s);
  assert.match(css, /\.panel-section\[aria-labelledby="parameterTitle"\]\s*{[^}]*border-bottom: 0/s);
  assert.match(css, /\.action-section\.generation-control\s*{[^}]*backdrop-filter: none[^}]*background: transparent[^}]*border: 0[^}]*box-shadow: none[^}]*min-height: 54px[^}]*margin: 0 12px[^}]*overflow: visible[^}]*padding: 0[^}]*width: calc\(100% - 24px\)/s);
  assert.match(css, /@media \(min-width: 901px\)\s*{[^}]*\.action-section\.generation-control\s*{[^}]*bottom: 20px[^}]*margin: 32px 12px 0[^}]*position: sticky/s);
  assert.match(css, /@media \(max-width: 900px\)\s*{[^}]*\.action-section\.generation-control\s*{[^}]*margin: 12px 12px/s);
  assert.doesNotMatch(css, /(?:^|\n)\.generation-control\s*{/);
  assert.match(css, /@media \(max-width: 560px\)\s*{[^}]*\.action-section\.generation-control\s*{[^}]*margin: 12px 10px 10px[^}]*width: calc\(100% - 20px\)/s);
  assert.match(themeCss, /grid-template-columns: minmax\(360px, clamp\(360px, 30vw, 420px\)\) minmax\(0, 1fr\)/);
  assert.match(themeCss, /\.control-panel\s*{[^}]*overflow-y: auto[^}]*overscroll-behavior-x: none[^}]*overscroll-behavior-y: none/s);
  assert.doesNotMatch(themeCss, /overscroll-behavior: contain/);
  assert.ok(font.size > 1_000_000);
  assert.match(license, /SIL OPEN FONT LICENSE Version 1\.1/);
});

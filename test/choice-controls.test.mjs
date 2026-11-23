/**
 * [INPUT]: 依赖 node:test/assert、node:fs、共享刷新符号和样式、静态与动态刷新入口及功能/超分/风格下拉主题
 * [OUTPUT]: 验证功能/超分共享尺寸/表面/选中态、风格下拉引用及主页面和嵌入工具共用刷新图标
 * [POS]: test 的工作台选择按钮视觉合同护栏，不启动服务或访问外部网络
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSources = async () => {
  const [html, themeCss, interactionCss, accentCss] = await Promise.all([
    readFile(new URL("../public/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/theme.css", import.meta.url), "utf8"),
    readFile(new URL("../public/theme-interactions.css", import.meta.url), "utf8"),
    readFile(new URL("../public/raycast-accent.css", import.meta.url), "utf8"),
  ]);
  return { accentCss, html, interactionCss, themeCss };
};

test("功能与超分按钮维持共享尺寸且加载风格下拉样式", async () => {
  const { html, themeCss } = await readSources();

  assert.match(themeCss, /--choice-control-height: 38px/);
  assert.match(themeCss, /--choice-control-radius: 6px/);
  assert.match(themeCss, /--choice-control-padding: 12px/);
  assert.match(themeCss, /--choice-control-gap: 8px/);
  assert.match(themeCss, /\.feature-mode-option,\s*\.model-option-toggle\s*{[^}]*min-height: var\(--choice-control-height\)[^}]*text-align: left/s);
  assert.match(themeCss, /\.feature-mode-option,\s*\.model-option-toggle\s*{[^}]*font-weight: 500[^}]*padding: 0 var\(--choice-control-padding\)/s);
  assert.match(html, /<link rel="stylesheet" href="\/theme\.css\?v=\d+" \/>/);
  assert.match(html, /\/theme-interactions\.css\?v=2/);
  assert.match(html, /\/white-model-render-mode\.css\?v=5/);
});

test("主页面和嵌入工具的刷新图标复用圆角单箭头符号", async () => {
  const pages = ["index.html", "beta.html", "ai-render-studio.html", "floor-plan-camera.html", "house-plan.html", "scene-cast.html"];
  const controls = ["config-refresh.js", "effect-beautification-controls.js", "image-relight.js", "panorama-lighting-controls.js", "refined-lighting-controls.js"];
  const files = [...pages, ...controls, "config-refresh-button.css", "theme.css", "icons/refresh.svg"];
  const sources = new Map(await Promise.all(files.map(async (file) => [
    file, await readFile(new URL(`../public/${file}`, import.meta.url), "utf8"),
  ])));
  for (const file of pages) {
    assert.equal((sources.get(file).match(/href="\/config-refresh-button\.css\?v=2"/g) || []).length, 1, file);
  }
  const sharedIcon = /<use href="\/icons\/refresh\.svg#refresh"><\/use>/;
  for (const file of ["index.html", "floor-plan-camera.html", "house-plan.html", "scene-cast.html", ...controls]) {
    const buttons = sources.get(file).match(/<button\b[^>]*aria-label="刷新[^"]*"[^>]*>[\s\S]*?<\/button>/g) || [];
    assert.ok(buttons.length > 0, file);
    for (const button of buttons) assert.match(button, sharedIcon, file);
  }
  assert.match(sources.get("icons/refresh.svg"), /<symbol id="refresh"[^>]*>[\s\S]*?stroke="currentColor"[\s\S]*?stroke-linecap="round"/);
  assert.match(sources.get("config-refresh-button.css"), /\.config-refresh-button \.refresh-icon\s*\{[^}]*height: 14px;[^}]*width: 14px;/s);
  const theme = sources.get("theme.css");
  assert.doesNotMatch(theme, /\.config-refresh-button\s*\{/);
});

test("功能与超分按钮保留原有选中态与键盘、指针反馈", async () => {
  const { accentCss, interactionCss, themeCss } = await readSources();

  assert.match(themeCss, /\.feature-mode-option\.selected,\s*\.model-option-toggle\.selected\s*{[^}]*box-shadow: var\(--choice-control-selected-shadow\)[^}]*font-weight: 600/s);
  assert.match(themeCss, /\.feature-mode-option:focus-visible,\s*\.model-option-toggle:focus-visible\s*{[^}]*outline: 2px solid/s);
  assert.match(themeCss, /\.model-option-toggle:active\s*{[^}]*transform: scale\(0\.97\)/s);
  assert.match(interactionCss, /\.feature-mode-option:hover:not\(\.selected\):not\(:disabled\),\s*\.model-option-toggle:hover:not\(\.selected\):not\(:disabled\)/s);
  assert.match(accentCss, /\.feature-mode-option\.selected,[^{]*\.room-type-option\.selected\s*\{[^}]*background: var\(--brand-key-selected-bg\)[^}]*border-color: var\(--brand-key-selected-border\)[^}]*color: var\(--brand-key-selected-ink\)/s);
  assert.match(accentCss, /--brand-key-selected-bg: #000/);
  assert.match(accentCss, /--brand-key-selected-border: #000/);
  assert.match(accentCss, /--brand-key-selected-ink: #fff/);
});

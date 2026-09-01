/**
 * [INPUT]: 依赖 node:test/assert、node:fs 与生图页功能/风格/出图模型三类按钮选择控件的结构 CSS、最终纯黑反色层和静态资源版本
 * [OUTPUT]: 对外提供共享高度、圆角、内距、字重、对齐、阴影、纯黑白字选中态与完整交互状态的回归保障
 * [POS]: test 的工作台选择按钮视觉合同护栏，不启动服务或访问外部网络
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSources = async () => {
  const [html, themeCss, styleCss, accentCss] = await Promise.all([
    readFile(new URL("../public/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/theme.css", import.meta.url), "utf8"),
    readFile(new URL("../public/white-model-render-mode.css", import.meta.url), "utf8"),
    readFile(new URL("../public/raycast-accent.css", import.meta.url), "utf8"),
  ]);
  return { accentCss, html, styleCss, themeCss };
};

test("三类选择按钮复用同一套紧凑控件尺寸与表面令牌", async () => {
  const { html, styleCss, themeCss } = await readSources();

  assert.match(themeCss, /--choice-control-height: 38px/);
  assert.match(themeCss, /--choice-control-radius: 6px/);
  assert.match(themeCss, /--choice-control-padding: 12px/);
  assert.match(themeCss, /--choice-control-gap: 8px/);
  assert.match(themeCss, /\.feature-mode-option,\s*\.model-option-toggle\s*{[^}]*min-height: var\(--choice-control-height\)[^}]*text-align: left/s);
  assert.match(themeCss, /\.feature-mode-option,\s*\.model-option-toggle\s*{[^}]*font-weight: 500[^}]*padding: 0 var\(--choice-control-padding\)/s);
  assert.match(styleCss, /\.style-choice-option\s*{[^}]*font-weight: 500[^}]*min-height: var\(--choice-control-height\)[^}]*padding: 0 var\(--choice-control-padding\)[^}]*text-align: left/s);
  assert.match(html, /\/theme\.css\?v=27/);
  assert.match(html, /\/white-model-render-mode\.css\?v=4/);
});

test("三类选择按钮共享纯黑白字选中态与键盘、指针反馈", async () => {
  const { accentCss, styleCss, themeCss } = await readSources();

  assert.match(themeCss, /\.feature-mode-option\.selected,\s*\.model-option-toggle\.selected\s*{[^}]*box-shadow: var\(--choice-control-selected-shadow\)[^}]*font-weight: 600/s);
  assert.match(themeCss, /\.feature-mode-option:focus-visible,\s*\.model-option-toggle:focus-visible\s*{[^}]*outline: 2px solid/s);
  assert.match(themeCss, /\.model-option-toggle:active\s*{[^}]*transform: scale\(0\.97\)/s);
  assert.match(themeCss, /\.feature-mode-option:hover:not\(\.selected\):not\(:disabled\),\s*\.model-option-toggle:hover:not\(\.selected\):not\(:disabled\)/s);
  assert.match(styleCss, /\.style-choice-option\.selected\s*{[^}]*box-shadow: var\(--choice-control-selected-shadow\)[^}]*font-weight: 600/s);
  assert.match(styleCss, /\.style-choice-option:focus-visible\s*{[^}]*outline: 2px solid/s);
  assert.match(styleCss, /\.style-choice-option:active\s*{[^}]*transform: scale\(0\.97\)/s);
  assert.match(styleCss, /\.style-choice-option:hover:not\(\.selected\):not\(:disabled\)/);
  assert.match(accentCss, /\.feature-mode-option\.selected,[^{]*\.custom-select-option\[aria-selected="true"\]\s*\{[^}]*background: var\(--brand-key-selected-bg\)[^}]*border-color: var\(--brand-key-selected-border\)[^}]*color: var\(--brand-key-selected-ink\)/s);
  assert.match(accentCss, /--brand-key-selected-bg: #000/);
  assert.match(accentCss, /--brand-key-selected-border: #000/);
  assert.match(accentCss, /--brand-key-selected-ink: #fff/);
});

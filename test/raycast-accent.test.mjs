/**
 * [INPUT]: 依赖 node:test/assert、node:fs 与两页 HTML、raycast-accent.css 的共享重点色合同及 connection-center.css 的动作按钮实现
 * [OUTPUT]: 对外提供珊瑚红与黑莓石墨令牌、双页最终加载顺序、全状态稳定白色连接键、全按钮近纸面淡灰粉/低透明暖白细边、Benchmark 白色普通步骤/黑莓当前步骤、结果下载白色次级键、START/连接中心动作全交互状态、生成黑白灰扫描动效及功能焦点回归保障
 * [POS]: test 的跨工作台 Raycast 重点色护栏，不启动服务或访问外部网络
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const accentHref = "raycast-accent.css?v=26";

test("两页最后加载同一份 Raycast 珊瑚红重点色层", async () => {
  const [indexHtml, benchmarkHtml] = await Promise.all([
    readFile(new URL("../public/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/benchmark.html", import.meta.url), "utf8"),
  ]);

  for (const html of [indexHtml, benchmarkHtml]) {
    const stylesheets = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)" \/>/g)]
      .map((match) => match[1]);
    assert.match(stylesheets.at(-1), new RegExp(`${accentHref.replace("?", "\\?")}$`));
  }
});

test("重点色以弥散渐变服务当前态并保留清晰功能焦点", async () => {
  const [css, themeCss] = await Promise.all([
    readFile(new URL("../public/raycast-accent.css", import.meta.url), "utf8"),
    readFile(new URL("../public/theme.css", import.meta.url), "utf8"),
  ]);

  assert.match(css, /--brand-accent: #ff6363/);
  assert.match(css, /--brand-accent-strong: #c9364d/);
  assert.match(css, /--brand-accent-haze-strong: rgb\(255 99 99 \/ 30%\)/);
  assert.match(css, /--brand-surface: #30272d/);
  assert.match(css, /--brand-surface-hover: #3b2d35/);
  assert.match(css, /--brand-surface-ink: #fff7f8/);
  assert.match(css, /--brand-control-radius: 6px/);
  assert.match(css, /--brand-key-bg: #fff/);
  assert.match(css, /--brand-key-border: #eee8eb/);
  assert.match(css, /--brand-key-hover-border: #e5dde1/);
  assert.match(css, /--brand-dark-key-border: rgb\(255 255 255 \/ 10%\)/);
  assert.match(css, /--brand-dark-key-hover-border: rgb\(255 255 255 \/ 14%\)/);
  assert.match(css, /--brand-dark-key-active-border: rgb\(255 255 255 \/ 8%\)/);
  assert.match(css, /--brand-dark-key-disabled-border: rgb\(255 255 255 \/ 6%\)/);
  assert.match(css, /--brand-key-ink: #5b5157/);
  const topbarBlock = css.match(/\.topbar\s*\{([^}]*)\}/)?.[1] || "";
  assert.equal(topbarBlock.match(/radial-gradient/g)?.length, 2);
  assert.match(topbarBlock, /var\(--brand-surface\)/);
  assert.match(topbarBlock, /border-color: var\(--brand-surface-border\)/);
  assert.match(topbarBlock, /inset 0 1px 0 rgb\(255 255 255 \/ 12%\)/);
  assert.match(topbarBlock, /0 18px 48px rgb\(64 38 49 \/ 20%\)/);
  assert.match(css, /\.topbar::before\s*\{[^}]*rgb\(255 255 255 \/ 10%\)/s);
  assert.match(css, /\.topbar::after\s*\{[^}]*rgb\(255 255 255 \/ 28%\)/s);
  assert.match(css, /\.topbar \.brand-title\s*\{[^}]*color: var\(--brand-surface-ink\)/s);
  assert.match(css, /\.topbar \.product-switcher\s*\{[^}]*rgb\(18 14 17 \/ 34%\)[^}]*rgb\(255 255 255 \/ 10%\)[^}]*border-radius: 9px/s);
  assert.match(css, /\.topbar \.topbar-actions\s*\{[^}]*background: transparent[^}]*border: 0[^}]*box-shadow: none[^}]*padding: 0/s);
  assert.match(css, /\.topbar \.product-switch-indicator,[^{]*\.topbar \.product-switch-option\[aria-current="page"\]\s*\{[^}]*var\(--brand-control-radius\)[^}]*var\(--brand-white-key-shadow\)/s);
  assert.match(css, /\.topbar \.product-switch-option\s*\{[^}]*rgb\(255 247 248 \/ 68%\)/s);
  assert.match(css, /\.topbar \.product-switch-option\[aria-current="page"\],[^{]*\.topbar \.product-switch-option\.is-transition-target\s*\{[^}]*var\(--text, var\(--ink\)\)/s);
  assert.match(css, /\.topbar \.product-status\s*\{[^}]*font-weight: 500[^}]*min-height: 30px/s);
  assert.match(css, /\.topbar \.connection-button,[^{]*\.topbar \.status-pill\s*\{[^}]*background: #fff[^}]*border-color: var\(--brand-key-border\)[^}]*border-radius: var\(--brand-control-radius\)[^}]*var\(--brand-white-key-shadow\)[^}]*font-weight: 600[^}]*min-height: 30px/s);
  assert.match(css, /\.topbar \.connection-button:not\(\.connected\) \.status-dot,[^{]*\.topbar \.status-pill:not\(\.ready\)::before\s*\{[^}]*background: #a69ca1[^}]*box-shadow: none[^}]*height: 6px[^}]*width: 6px/s);
  assert.match(css, /\.topbar \.connection-button\.connected \.status-dot,[^{]*\.topbar \.status-pill\.ready::before\s*\{[^}]*background: var\(--brand-surface\)[^}]*box-shadow: none[^}]*height: 6px[^}]*width: 6px/s);
  assert.match(css, /\.topbar \.connection-button:hover\s*{[^}]*background: var\(--brand-surface-ink\)[^}]*border-color: var\(--brand-key-hover-border\)[^}]*color: var\(--brand-surface\)/s);
  assert.match(css, /\.feature-mode-option,[^{]*\.secondary-button,[^{]*\.result-download-button\s*\{[^}]*var\(--brand-key-bg\)[^}]*var\(--brand-key-border\)[^}]*var\(--brand-key-shadow\)[^}]*var\(--brand-key-ink\)/s);
  assert.match(css, /\.result-download-button\s*\{[^}]*font-size: 11px[^}]*font-weight: 600[^}]*height: 30px[^}]*min-width: 48px[^}]*padding: 0 12px/s);
  assert.match(css, /\.result-download-button:disabled\s*\{[^}]*background: #f5f2f3[^}]*border-color: #f0ebed[^}]*box-shadow: none[^}]*color: #9b9297[^}]*opacity: 1/s);
  assert.match(css, /\.feature-mode-option:hover:not\(\.selected\):not\(:disabled\),[^{]*\.result-download-button:hover:not\(:disabled\),[^}]*\.step:hover:not\(\.active\)\s*\{[^}]*background: #fff[^}]*border-color: var\(--brand-key-hover-border\)[^}]*var\(--brand-key-hover-shadow\)[^}]*translateY\(-1px\)/s);
  assert.match(css, /\.feature-mode-option:active:not\(:disabled\),[^{]*\.result-download-button:active:not\(:disabled\),[^}]*\.step:active:not\(:disabled\)\s*\{[^}]*scale\(0\.985\)/s);
  assert.match(css, /\.feature-mode-option\.selected,[^{]*\.custom-select-option\[aria-selected="true"\]\s*{(?:[^}]*radial-gradient){2}/s);
  assert.match(css, /\.feature-mode-option\.selected,[^{]*\.custom-select-option\[aria-selected="true"\]\s*{[^}]*var\(--brand-surface\)[^}]*border-color: var\(--brand-dark-key-border\)/s);
  assert.match(css, /\.generate-button,[^{]*\.primary-button,[^{]*\.danger-button\s*{(?:[^}]*radial-gradient){2}/s);
  assert.match(css, /\.generate-button,[^{]*\.primary-button,[^{]*\.danger-button\s*{[^}]*var\(--brand-surface\)[^}]*border-color: var\(--brand-dark-key-border\)/s);
  assert.match(css, /\.generate-button:hover:not\(:disabled\),[^{]*\.danger-button:hover:not\(:disabled\)\s*{[^}]*var\(--brand-surface-hover\)[^}]*border-color: var\(--brand-dark-key-hover-border\)/s);
  const startBlock = css.match(/\.generation-actions \.generate-button\s*\{([^}]*)\}/)?.[1] || "";
  assert.match(startBlock, /backdrop-filter: none/);
  assert.equal(startBlock.match(/radial-gradient/g)?.length, 2);
  assert.match(startBlock, /rgb\(48 39 45 \/ 99%\)/);
  assert.match(startBlock, /border-color: var\(--brand-dark-key-border\)/);
  assert.match(startBlock, /0 16px 30px rgb\(64 38 49 \/ 32%\)/);
  assert.match(startBlock, /color: var\(--brand-surface-ink\)/);
  const startHoverBlock = css.match(/\.generation-actions \.generate-button:hover:not\(:disabled\)\s*\{([^}]*)\}/)?.[1] || "";
  assert.equal(startHoverBlock.match(/radial-gradient/g)?.length, 2);
  assert.match(startHoverBlock, /rgb\(59 45 53 \/ 99%\)/);
  assert.match(startHoverBlock, /border-color: var\(--brand-dark-key-hover-border\)/);
  assert.match(startHoverBlock, /0 18px 32px rgb\(64 38 49 \/ 36%\)/);
  assert.match(startHoverBlock, /color: #fff/);
  assert.match(css, /\.generation-actions \.generate-button:active:not\(:disabled\)\s*{[^}]*rgb\(41 35 41 \/ 99%\)[^}]*border-color: var\(--brand-dark-key-active-border\)[^}]*0 10px 22px rgb\(64 38 49 \/ 26%\)/s);
  assert.match(css, /\.generation-actions \.generate-button:disabled\s*{[^}]*rgb\(48 43 47 \/ 99%\)[^}]*border-color: var\(--brand-dark-key-disabled-border\)[^}]*0 14px 26px rgb\(64 38 49 \/ 22%\)[^}]*#cfc5c9[^}]*opacity: 1/s);
  assert.match(css, /\.step\s*\{[^}]*var\(--brand-key-bg\)[^}]*border: 1px solid var\(--brand-key-border\)[^}]*var\(--brand-key-shadow\)[^}]*var\(--brand-key-ink\)/s);
  assert.match(css, /\.step\.active,[^{]*\.step\.active:hover\s*{(?:[^}]*radial-gradient){2}[^}]*var\(--brand-surface\)[^}]*border-color: var\(--brand-dark-key-border\)[^}]*var\(--brand-selected-shadow\)[^}]*var\(--brand-surface-ink\)/s);
  assert.match(css, /\.ghost-button,[^{]*\.job-progress-actions \.job-cancel-button\s*\{[^}]*border-color: var\(--brand-key-border\)/s);
  assert.match(css, /\.connection-action-button,[^{]*\.job-progress-actions \.job-resume-button\s*\{[^}]*border-color: var\(--brand-dark-key-border\)/s);
  assert.match(css, /\.connection-action-button:active,[^{]*\.job-progress-actions \.job-resume-button:active:not\(:disabled\)\s*\{[^}]*border-color: var\(--brand-dark-key-active-border\)/s);
  assert.match(css, /\.regenerate-prompt-button:active:not\(:disabled\),[^{]*\.job-progress-actions \.job-cancel-button:active:not\(:disabled\)\s*\{[^}]*border-color: var\(--brand-key-hover-border\)/s);
  assert.doesNotMatch(css, /#ded5da|#cbbfc5/);
  assert.match(css, /:where\(button, a, input, textarea, select\):focus-visible/);
  assert.match(css, /\.feature-mode-option:focus-visible/);
  assert.match(css, /button:focus-visible,\s*a:focus-visible/s);
  assert.doesNotMatch(css, /\.scan-line\s*\{/);
  assert.match(themeCss, /\.scan-line\s*\{[^}]*background: var\(--accent\)[^}]*0 0 20px rgb\(25 26 28 \/ 22%\)/s);
  assert.match(css, /progress\s*{[^}]*accent-color: var\(--brand-accent-strong\)/s);
  assert.doesNotMatch(css, /body::before/);
  assert.doesNotMatch(css, /\.product-switcher:not\(\.is-motion-ready\)/);
  assert.doesNotMatch(css, /\.product-switch-option\[aria-current="page"\]::after/);
  assert.doesNotMatch(css, /\.feature-mode-option\.selected::after/);
  assert.doesNotMatch(css, /\.model-option-toggle\.selected i\s*{[^}]*background: var\(--brand-accent\)/s);
  assert.doesNotMatch(css, /\.style-choice-option\.selected small\s*{[^}]*background: var\(--brand-accent\)/s);
  assert.doesNotMatch(css, /(?:\.generate-button|\.primary-button)\s*{[^}]*background: var\(--brand-accent\)/s);
  assert.doesNotMatch(css, /(?:\.feature-mode-option\.selected|\.model-option-toggle\.selected)[^{]*{[^}]*var\(--accent, var\(--mist\)\)/s);
});

test("连接中心矩形动作统一使用黑莓暗面与暖白文字", async () => {
  const [html, css] = await Promise.all([
    readFile(new URL("../public/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/connection-center.css", import.meta.url), "utf8"),
  ]);

  assert.match(html, /\/connection-center\.css\?v=5/);
  for (const id of [
    "disconnectButton",
    "saveConnectionButton",
    "larkRefreshButton",
    "larkLoginButton",
  ]) {
    assert.match(html, new RegExp(`id="${id}"[\\s\\S]*?class="connection-action-button"`));
  }

  const buttonBlock = css.match(/\.connection-action-button\s*\{([^}]*)\}/)?.[1] || "";
  assert.equal(buttonBlock.match(/radial-gradient/g)?.length, 2);
  assert.match(buttonBlock, /var\(--brand-surface, #30272d\)/);
  assert.match(buttonBlock, /var\(--brand-surface-border, #503a45\)/);
  assert.match(buttonBlock, /var\(--brand-surface-ink, #fff7f8\)/);
  assert.match(buttonBlock, /border-radius: 6px/);
  assert.match(buttonBlock, /height: 32px/);
  assert.match(buttonBlock, /font-weight: 600/);
  assert.match(css, /\.connection-action-button:hover:not\(:disabled\)\s*{[^}]*var\(--brand-surface-hover, #3b2d35\)[^}]*color: #fff/s);
  assert.match(css, /\.connection-action-button:active\s*{[^}]*#292329[^}]*scale\(0\.97\)/s);
  assert.match(css, /\.connection-action-button:disabled\s*{[^}]*opacity: 0\.42/s);
  assert.doesNotMatch(css, /\.connection-action-button:hover:not\(:disabled\)\s*{[^}]*var\(--panel-soft\)/s);
});

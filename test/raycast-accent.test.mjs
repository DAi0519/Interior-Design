/**
 * [INPUT]: 依赖 node:test/assert、node:fs 与三页 HTML、raycast-accent.css 的共享重点色合同及 connection-center.css 的动作按钮实现
 * [OUTPUT]: 对外提供冷白银灰顶栏、由导航前 transform 位移的纯黑白字激活视窗、中性浅色普通按钮、含 Beta 全宽 START 的单一 #f37021 标志性盒橙关键动作及系统偏好、三页最终加载顺序和中性焦点回归保障
 * [POS]: test 的跨工作台 Raycast 重点色护栏，不启动服务或访问外部网络
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const accentHref = "raycast-accent.css?v=42";

test("三页最后加载同一份 Raycast 统一按钮层", async () => {
  const [indexHtml, betaHtml, benchmarkHtml] = await Promise.all([
    readFile(new URL("../public/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/beta.html", import.meta.url), "utf8"),
    readFile(new URL("../public/benchmark.html", import.meta.url), "utf8"),
  ]);

  for (const html of [indexHtml, betaHtml, benchmarkHtml]) {
    const stylesheets = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)" \/>/g)]
      .map((match) => match[1]);
    assert.match(stylesheets.at(-1), new RegExp(`${accentHref.replace("?", "\\?")}$`));
  }
});

test("按钮以纯黑白字表达选中并统一用 #f37021 标记关键执行与小面积状态", async () => {
  const [css, themeCss, indexHtml, betaHtml, benchmarkHtml] = await Promise.all([
    readFile(new URL("../public/raycast-accent.css", import.meta.url), "utf8"),
    readFile(new URL("../public/theme.css", import.meta.url), "utf8"),
    readFile(new URL("../public/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/beta.html", import.meta.url), "utf8"),
    readFile(new URL("../public/benchmark.html", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(css, /#ff6363|#c9364d|#ffe9ec|255 99 99|201 54 77|brand-accent/);
  assert.match(css, /--brand-nav-bg-top: rgb\(255 255 255 \/ 94%\)/);
  assert.match(css, /--brand-nav-bg-bottom: rgb\(245 245 247 \/ 90%\)/);
  assert.match(css, /--brand-nav-border: #d9dadd/);
  assert.match(css, /--brand-nav-track-bg: #f2f2f4/);
  assert.match(css, /--brand-nav-track-border: #dedfe2/);
  assert.match(css, /--brand-nav-selected-bg: #000/);
  assert.match(css, /--brand-nav-selected-border: #000/);
  assert.match(css, /--brand-nav-selected-ink: #fff/);
  assert.match(css, /--brand-nav-muted-ink: #6f7077/);
  assert.match(css, /--functional-action-bg: #f37021/);
  assert.match(css, /--functional-action-border: #f37021/);
  assert.match(css, /--functional-action-hover-bg: #f37021/);
  assert.match(css, /--functional-action-hover-border: #f37021/);
  assert.match(css, /--functional-action-active-bg: #f37021/);
  assert.match(css, /--functional-action-active-border: #f37021/);
  assert.match(css, /--functional-action-ink: #202024/);
  assert.doesNotMatch(css, /#de742f/);
  assert.match(css, /--functional-action-shadow:\s*inset 0 1px 0 rgb\(255 255 255 \/ 42%\),\s*inset 0 -1px 0 rgb\(32 32 36 \/ 18%\),\s*0 1px 2px rgb\(25 26 28 \/ 18%\),\s*0 8px 18px rgb\(25 26 28 \/ 14%\)/s);
  assert.match(css, /--functional-action-hover-shadow:[^;]*0 12px 24px rgb\(25 26 28 \/ 16%\)/s);
  assert.match(css, /--functional-action-active-shadow:[^;]*inset 0 2px 4px rgb\(25 26 28 \/ 18%\)[^;]*0 3px 8px rgb\(25 26 28 \/ 11%\)/s);
  assert.match(css, /--functional-action-busy-shadow:[^;]*inset 0 1px 0 rgb\(255 255 255 \/ 30%\)[^;]*0 4px 12px rgb\(25 26 28 \/ 13%\)/s);
  assert.doesNotMatch(css, /functional-accent-(?:mark|soft|on-dark)|#ffad73|#9a4318|#f5dfd0|#c9682b|#e9823d|#d57632|#cf6d32|#b95b26/);
  assert.match(css, /--brand-control-radius: 6px/);
  assert.match(css, /--brand-key-bg: #fff/);
  assert.match(css, /--brand-key-selected-bg: #000/);
  assert.match(css, /--brand-key-selected-active-bg: #000/);
  assert.match(css, /--brand-key-primary-bg: #f8f8f9/);
  assert.match(css, /--brand-key-active-bg: #dedfe3/);
  assert.match(css, /--brand-key-border: #e3e3e6/);
  assert.match(css, /--brand-key-hover-border: #d7d8dc/);
  assert.match(css, /--brand-key-selected-border: #000/);
  assert.match(css, /--brand-key-selected-active-border: #000/);
  assert.match(css, /--brand-key-primary-border: #c5c6cb/);
  assert.match(css, /--brand-key-active-border: #bbbcc2/);
  assert.match(css, /--brand-key-disabled-border: #e6e6e8/);
  assert.match(css, /--brand-key-ink: #5b5b61/);
  assert.match(css, /--brand-key-strong-ink: #202024/);
  assert.match(css, /--brand-key-selected-ink: #fff/);
  assert.match(css, /--brand-key-focus-ring: rgb\(109 110 117 \/ 14%\)/);
  assert.match(css, /--brand-check-bg: #000/);
  assert.doesNotMatch(css, /#45464b|#34353a|#393a3f|#2f3035/);
  const topbarBlock = css.match(/\.topbar\s*\{([^}]*)\}/)?.[1] || "";
  assert.doesNotMatch(topbarBlock, /radial-gradient|brand-accent|brand-surface|255 99 99|201 54 77/);
  assert.match(topbarBlock, /linear-gradient\(180deg, var\(--brand-nav-bg-top\), var\(--brand-nav-bg-bottom\)\)/);
  assert.match(topbarBlock, /border-color: var\(--brand-nav-border\)/);
  assert.match(topbarBlock, /inset 0 1px 0 #fff/);
  assert.match(topbarBlock, /0 18px 48px rgb\(20 20 24 \/ 10%\)/);
  assert.match(css, /\.topbar::before\s*\{[^}]*rgb\(255 255 255 \/ 46%\)/s);
  assert.match(css, /\.topbar::after\s*\{[^}]*rgb\(255 255 255 \/ 96%\)/s);
  assert.match(css, /\.topbar \.brand-title\s*\{[^}]*color: var\(--brand-key-strong-ink\)/s);
  assert.match(css, /\.topbar \.product-switcher\s*\{[^}]*var\(--brand-nav-track-bg\)[^}]*var\(--brand-nav-track-border\)[^}]*border-radius: 9px/s);
  assert.match(css, /\.topbar \.topbar-actions\s*\{[^}]*background: transparent[^}]*border: 0[^}]*box-shadow: none[^}]*padding: 0/s);
  assert.match(css, /--brand-nav-selected-shadow:\s*inset 0 0 0 1px var\(--brand-nav-selected-border\),\s*inset 0 1px 0 rgb\(255 255 255 \/ 14%\),\s*0 2px 5px rgb\(25 26 28 \/ 20%\)/s);
  assert.match(css, /\.topbar \.product-switch-active-viewport\s*\{[^}]*var\(--brand-nav-selected-bg\)[^}]*border-color: var\(--brand-nav-selected-border\)[^}]*var\(--brand-control-radius\)[^}]*var\(--brand-nav-selected-shadow\)/s);
  assert.match(css, /\.topbar \.product-switch-option\s*\{[^}]*var\(--brand-nav-muted-ink\)/s);
  assert.match(css, /\.topbar \.product-switch-active-option\s*\{[^}]*var\(--brand-nav-selected-ink\)/s);
  assert.match(css, /\.topbar \.product-status\s*\{[^}]*font-weight: 500[^}]*min-height: 30px/s);
  assert.match(css, /\.topbar \.connection-button,[^{]*\.topbar \.status-pill\s*\{[^}]*background: #fff[^}]*border-color: var\(--brand-key-border\)[^}]*border-radius: var\(--brand-control-radius\)[^}]*var\(--brand-key-shadow\)[^}]*font-weight: 600[^}]*min-height: 30px/s);
  assert.match(css, /\.topbar \.connection-button:not\(\.connected\) \.status-dot,[^{]*\.topbar \.status-pill:not\(\.ready\)::before\s*\{[^}]*background: #a69ca1[^}]*box-shadow: none[^}]*height: 6px[^}]*width: 6px/s);
  assert.match(css, /\.topbar \.connection-button\.connected \.status-dot,[^{]*\.topbar \.status-pill\.ready::before\s*\{[^}]*background: var\(--brand-check-bg\)[^}]*box-shadow: none[^}]*height: 6px[^}]*width: 6px/s);
  assert.match(css, /\.topbar \.connection-button:hover\s*{[^}]*background: var\(--brand-key-hover-bg\)[^}]*border-color: var\(--brand-key-hover-border\)[^}]*color: var\(--brand-key-strong-ink\)/s);
  assert.match(css, /\.feature-mode-option,[^{]*\.secondary-button,[^{]*\.result-download-button\s*\{[^}]*var\(--brand-key-bg\)[^}]*var\(--brand-key-border\)[^}]*var\(--brand-key-shadow\)[^}]*var\(--brand-key-ink\)/s);
  assert.match(css, /\.result-download-button\s*\{[^}]*font-size: 11px[^}]*font-weight: 600[^}]*height: 30px[^}]*min-width: 48px[^}]*padding: 0 12px/s);
  assert.match(css, /\.result-download-button:disabled\s*\{[^}]*background: var\(--brand-key-disabled-bg\)[^}]*border-color: var\(--brand-key-disabled-border\)[^}]*box-shadow: none[^}]*color: var\(--brand-key-muted-ink\)[^}]*opacity: 1/s);
  assert.match(css, /\.feature-mode-option:hover:not\(\.selected\):not\(:disabled\),[^{]*\.result-download-button:hover:not\(:disabled\),[^}]*\.step:hover:not\(\.active\)\s*\{[^}]*background: var\(--brand-key-hover-bg\)[^}]*border-color: var\(--brand-key-hover-border\)[^}]*var\(--brand-key-hover-shadow\)[^}]*translateY\(-1px\)/s);
  assert.match(css, /\.feature-mode-option:active:not\(:disabled\),[^{]*\.result-download-button:active:not\(:disabled\),[^}]*\.step:active:not\(:disabled\)\s*\{[^}]*scale\(0\.985\)/s);
  assert.match(css, /\.feature-mode-option\.selected,[^{]*\.custom-select-option\[aria-selected="true"\]\s*{[^}]*background: var\(--brand-key-selected-bg\)[^}]*border-color: var\(--brand-key-selected-border\)[^}]*var\(--brand-selected-shadow\)[^}]*var\(--brand-key-selected-ink\)/s);
  assert.match(css, /\.model-option-toggle\.selected i\s*\{[^}]*background: var\(--functional-action-bg\)[^}]*color: var\(--functional-action-ink\)/s);
  assert.match(css, /\.style-choice-option\.selected small\s*\{[^}]*background: var\(--functional-action-bg\)[^}]*color: var\(--functional-action-ink\)/s);
  assert.match(css, /\.custom-select-option\[aria-selected="true"\] small\s*\{[^}]*rgb\(255 255 255 \/ 72%\)/s);
  assert.match(css, /\.custom-select-option\[aria-selected="true"\] svg\s*\{[^}]*color: var\(--functional-action-bg\)/s);
  assert.match(css, /\.config-option:has\(input:checked\)\s*\{[^}]*background: var\(--brand-key-selected-bg\)[^}]*border-color: var\(--brand-key-selected-border\)[^}]*var\(--brand-selected-shadow\)[^}]*var\(--brand-key-selected-ink\)/s);
  assert.match(css, /\.config-option:has\(input:checked\) input\s*\{[^}]*accent-color: var\(--functional-action-bg\)/s);
  assert.match(css, /\.step\.active span\s*\{[^}]*color: var\(--functional-action-bg\)[^}]*font-weight: 700/s);
  assert.match(css, /\.empty-specs i\s*\{[^}]*background: var\(--functional-action-bg\)/s);
  assert.match(css, /\.generate-button,[^{]*\.primary-button\s*\{[^}]*background: var\(--brand-key-primary-bg\)[^}]*border-color: var\(--brand-key-primary-border\)[^}]*var\(--brand-primary-shadow\)[^}]*var\(--brand-key-strong-ink\)/s);
  assert.match(css, /\.danger-button\s*\{[^}]*background: var\(--brand-key-bg\)[^}]*border-color: var\(--brand-key-primary-border\)[^}]*var\(--brand-key-shadow\)[^}]*var\(--danger, #9f3028\)/s);
  assert.match(css, /\.generate-button:hover:not\(:disabled\),[^{]*\.primary-button:hover:not\(:disabled\)\s*\{[^}]*background: var\(--brand-key-hover-bg\)[^}]*border-color: var\(--brand-key-hover-border\)[^}]*var\(--brand-key-strong-ink\)/s);
  const startBlock = css.match(/\.generation-actions \.generate-button\s*\{([^}]*)\}/)?.[1] || "";
  assert.match(startBlock, /backdrop-filter: none/);
  assert.doesNotMatch(startBlock, /radial-gradient|brand-accent|brand-surface/);
  assert.match(startBlock, /rgb\(250 250 251 \/ 99%\)/);
  assert.match(startBlock, /border-color: var\(--brand-key-primary-border\)/);
  assert.match(startBlock, /box-shadow: var\(--brand-primary-shadow\)/);
  assert.match(startBlock, /color: var\(--brand-key-strong-ink\)/);
  const startHoverBlock = css.match(/\.generation-actions \.generate-button:hover:not\(:disabled\)\s*\{([^}]*)\}/)?.[1] || "";
  assert.doesNotMatch(startHoverBlock, /radial-gradient|brand-accent|brand-surface/);
  assert.match(startHoverBlock, /rgb\(255 255 255 \/ 99%\)/);
  assert.match(startHoverBlock, /border-color: var\(--brand-key-hover-border\)/);
  assert.match(startHoverBlock, /0 10px 22px rgb\(25 26 28 \/ 17%\)/);
  assert.match(startHoverBlock, /color: var\(--brand-key-strong-ink\)/);
  assert.match(css, /\.generation-actions \.generate-button:active:not\(:disabled\)\s*{[^}]*rgb\(236 236 239 \/ 99%\)[^}]*border-color: var\(--brand-key-active-border\)[^}]*0 5px 12px rgb\(25 26 28 \/ 12%\)/s);
  assert.match(css, /\.generation-actions \.generate-button:disabled\s*{[^}]*rgb\(243 243 244 \/ 99%\)[^}]*border-color: var\(--brand-key-disabled-border\)[^}]*var\(--brand-key-muted-ink\)[^}]*opacity: 1/s);
  assert.match(indexHtml, /id="generateButton" class="generate-button functional-accent-button"/);
  assert.match(betaHtml, /id="runButton" class="generate-button functional-accent-button"/);
  assert.match(benchmarkHtml, /id="planButton" class="secondary-button functional-accent-button"/);
  assert.match(benchmarkHtml, /id="runButton" class="danger-button functional-accent-button"/);
  assert.match(benchmarkHtml, /id="reviewButton" class="primary-button functional-accent-button"/);
  assert.doesNotMatch(benchmarkHtml, /id="saveCasesButton" class="[^"]*functional-accent-button/);
  assert.doesNotMatch(indexHtml, /id="larkCompleteButton" class="[^"]*functional-accent-button/);
  const functionalBlock = css.match(/\.functional-accent-button,\s*\.generation-actions \.generate-button\.functional-accent-button\s*\{([^}]*)\}/)?.[1] || "";
  assert.match(functionalBlock, /background: var\(--functional-action-bg\)/);
  assert.match(functionalBlock, /border-color: var\(--functional-action-border\)/);
  assert.match(functionalBlock, /box-shadow: var\(--functional-action-shadow\)/);
  assert.match(functionalBlock, /color: var\(--functional-action-ink\)/);
  assert.match(functionalBlock, /box-shadow 160ms ease/);
  assert.match(functionalBlock, /transform 140ms var\(--ease-out\)/);
  assert.match(css, /\.functional-accent-button:hover:not\(:disabled\),[^{]*\.generation-actions \.generate-button\.functional-accent-button:hover:not\(:disabled\)\s*\{[^}]*var\(--functional-action-hover-bg\)[^}]*var\(--functional-action-hover-border\)[^}]*var\(--functional-action-hover-shadow\)[^}]*var\(--functional-action-ink\)[^}]*translateY\(-1px\)/s);
  assert.match(css, /\.functional-accent-button:active:not\(:disabled\),[^{]*\.generation-actions \.generate-button\.functional-accent-button:active:not\(:disabled\)\s*\{[^}]*var\(--functional-action-active-bg\)[^}]*var\(--functional-action-active-border\)[^}]*var\(--functional-action-active-shadow\)[^}]*var\(--functional-action-ink\)[^}]*translateY\(1px\) scale\(0\.985\)/s);
  assert.match(css, /\.functional-accent-button:disabled,[^{]*\.generation-actions \.generate-button\.functional-accent-button:disabled\s*\{[^}]*var\(--brand-key-disabled-bg\)[^}]*var\(--brand-key-disabled-border\)[^}]*var\(--brand-key-muted-ink\)[^}]*opacity: 1/s);
  assert.match(css, /\.generation-actions\.is-busy \.generate-button\.functional-accent-button:disabled\s*\{[^}]*background: var\(--functional-action-bg\)[^}]*border-color: var\(--functional-action-border\)[^}]*box-shadow: var\(--functional-action-busy-shadow\)[^}]*color: var\(--functional-action-ink\)[^}]*cursor: progress/s);
  assert.match(css, /\.step\s*\{[^}]*var\(--brand-key-bg\)[^}]*border: 1px solid var\(--brand-key-border\)[^}]*var\(--brand-key-shadow\)[^}]*var\(--brand-key-ink\)/s);
  assert.match(css, /\.feature-mode-option\.selected:active:not\(:disabled\),[^{]*\.room-type-option\.selected:active:not\(:disabled\)\s*\{[^}]*var\(--brand-key-selected-active-bg\)[^}]*var\(--brand-key-selected-active-border\)[^}]*var\(--brand-key-selected-ink\)/s);
  assert.match(css, /\.step\.active,[^{]*\.step\.active:hover\s*\{[^}]*var\(--brand-key-selected-bg\)[^}]*border-color: var\(--brand-key-selected-border\)[^}]*var\(--brand-selected-shadow\)[^}]*var\(--brand-key-selected-ink\)/s);
  assert.match(css, /\.ghost-button,[^{]*\.job-progress-actions \.job-cancel-button\s*\{[^}]*var\(--brand-key-bg\)[^}]*border-color: var\(--brand-key-border\)[^}]*var\(--brand-key-shadow\)[^}]*var\(--brand-key-ink\)/s);
  assert.match(css, /\.connection-action-button,[^{]*\.job-progress-actions \.job-resume-button\s*\{[^}]*var\(--brand-key-primary-bg\)[^}]*border-color: var\(--brand-key-primary-border\)[^}]*var\(--brand-primary-shadow\)[^}]*var\(--brand-key-strong-ink\)/s);
  assert.match(css, /\.connection-action-button:active,[^{]*\.job-progress-actions \.job-resume-button:active:not\(:disabled\)\s*\{[^}]*var\(--brand-key-active-bg\)[^}]*border-color: var\(--brand-key-active-border\)/s);
  assert.match(css, /\.regenerate-prompt-button:active:not\(:disabled\),[^{]*\.job-progress-actions \.job-cancel-button:active:not\(:disabled\)\s*\{[^}]*var\(--brand-key-active-bg\)[^}]*border-color: var\(--brand-key-active-border\)/s);
  assert.doesNotMatch(css, /#ded5da|#cbbfc5/);
  assert.match(css, /:where\(button, a, input, textarea, select\):focus-visible/);
  assert.match(css, /\.feature-mode-option:focus-visible/);
  assert.match(css, /button:focus-visible,[^{]*\.regenerate-prompt-button:focus-visible\s*\{[^}]*outline-color: var\(--brand-key-focus\)/s);
  const keySection = css.match(/SHARED BRAND KEYS[\s\S]*?FOCUS \+ INPUT/)?.[0] || "";
  assert.doesNotMatch(keySection, /radial-gradient|brand-accent|brand-surface|255 99 99|201 54 77|64 38 49/);
  assert.doesNotMatch(css, /\.scan-line\s*\{/);
  assert.match(themeCss, /\.scan-line\s*\{[^}]*background: var\(--accent\)[^}]*0 0 20px rgb\(25 26 28 \/ 22%\)/s);
  assert.match(css, /:where\(button, a, input, textarea, select\):focus-visible\s*\{[^}]*outline-color: var\(--brand-key-focus\)/s);
  assert.match(css, /:where\(button, \.product-switch-option, \.custom-select-trigger, \.custom-select-option\)\s*\{[^}]*touch-action: manipulation/s);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*transition-duration: 0\.01ms !important[\s\S]*transform: none !important/s);
  assert.match(css, /@media \(prefers-reduced-transparency: reduce\)[\s\S]*backdrop-filter: none[\s\S]*background: #fcfcfd/s);
  assert.match(css, /@media \(prefers-contrast: more\)[\s\S]*background: #fff[\s\S]*border-color: #8f9097/s);
  assert.match(css, /\.custom-select-trigger:focus-visible\s*\{[^}]*border-color: var\(--brand-key-focus\)[^}]*var\(--brand-key-focus-ring\)/s);
  assert.match(css, /\.config-option input,[^{]*\.remember-control input\s*\{[^}]*accent-color: var\(--brand-check-bg\)/s);
  assert.match(css, /progress\s*{[^}]*accent-color: var\(--functional-action-bg\)/s);
  assert.doesNotMatch(css, /body::before/);
  assert.doesNotMatch(css, /\.product-switcher:not\(\.is-motion-ready\)/);
  assert.doesNotMatch(css, /\.product-switch-option\[aria-current="page"\]::after/);
  assert.doesNotMatch(css, /\.feature-mode-option\.selected::after/);
  assert.doesNotMatch(css, /\.model-option-toggle\.selected i\s*{[^}]*background: var\(--brand-accent\)/s);
  assert.doesNotMatch(css, /\.style-choice-option\.selected small\s*{[^}]*background: var\(--brand-accent\)/s);
  assert.doesNotMatch(css, /(?:\.generate-button|\.primary-button)\s*{[^}]*background: var\(--brand-accent\)/s);
  assert.doesNotMatch(css, /(?:\.feature-mode-option\.selected|\.model-option-toggle\.selected)[^{]*{[^}]*var\(--accent, var\(--mist\)\)/s);
});

test("连接中心矩形动作由最终颜色层统一为中性浅色", async () => {
  const [html, baseCss, accentCss] = await Promise.all([
    readFile(new URL("../public/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/connection-center.css", import.meta.url), "utf8"),
    readFile(new URL("../public/raycast-accent.css", import.meta.url), "utf8"),
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

  const baseButtonBlock = baseCss.match(/\.connection-action-button\s*\{([^}]*)\}/)?.[1] || "";
  assert.match(baseButtonBlock, /border-radius: 6px/);
  assert.match(baseButtonBlock, /height: 32px/);
  assert.match(baseButtonBlock, /font-weight: 600/);
  assert.match(baseButtonBlock, /background: var\(--brand-key-primary-bg, #f8f8f9\)/);
  assert.match(baseButtonBlock, /border: 1px solid var\(--brand-key-primary-border, #c5c6cb\)/);
  assert.doesNotMatch(baseCss, /#ff6363|#c9364d|#ffe9ec|255 99 99|201 54 77|brand-surface/);
  const finalButtonBlock = accentCss.match(/\.connection-action-button,[^{]*\.job-progress-actions \.job-resume-button\s*\{([^}]*)\}/)?.[1] || "";
  assert.match(finalButtonBlock, /background: var\(--brand-key-primary-bg\)/);
  assert.match(finalButtonBlock, /border-color: var\(--brand-key-primary-border\)/);
  assert.match(finalButtonBlock, /box-shadow: var\(--brand-primary-shadow\)/);
  assert.match(finalButtonBlock, /color: var\(--brand-key-strong-ink\)/);
  assert.doesNotMatch(finalButtonBlock, /radial-gradient|brand-surface|brand-accent/);
  assert.match(accentCss, /\.connection-action-button:hover:not\(:disabled\),[^{]*\.job-progress-actions \.job-resume-button:hover:not\(:disabled\)\s*\{[^}]*var\(--brand-key-hover-bg\)[^}]*var\(--brand-key-hover-border\)[^}]*var\(--brand-key-strong-ink\)/s);
  assert.match(accentCss, /\.connection-action-button:disabled,[^{]*\.job-progress-actions \.job-cancel-button:disabled\s*\{[^}]*var\(--brand-key-disabled-bg\)[^}]*var\(--brand-key-disabled-border\)[^}]*var\(--brand-key-muted-ink\)/s);
});

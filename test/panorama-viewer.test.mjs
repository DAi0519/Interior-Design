/**
 * [INPUT]: 依赖全景预览纯功能判定与页面/结果层接线源码
 * [OUTPUT]: 对外提供仅全景图美化可用、360° dialog 和本地 Pannellum 资产接入的回归保障
 * [POS]: test 的全景预览专项测试，不加载真实图片或启动 WebGL
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { isPanoramaPreviewFeature } from "../public/panorama-viewer.js";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("360°预览仅对全景图美化开放", () => {
  assert.equal(isPanoramaPreviewFeature("panoramaEnhancement"), true);
  for (const featureMode of [
    "effectEnhancement",
    "emptyRoom",
    "free",
    "imageUpscale",
    "refinedModel",
    "whiteModel",
  ]) {
    assert.equal(isPanoramaPreviewFeature(featureMode), false);
  }
});

test("页面从本地依赖加载 Pannellum 并提供可关闭预览 dialog", async () => {
  const [html, server, css] = await Promise.all([
    read("../public/index.html"),
    read("../server.mjs"),
    read("../public/panorama-viewer.css"),
  ]);
  assert.match(html, /href="\/vendor\/pannellum\.css"/);
  assert.match(html, /src="\/vendor\/pannellum\.js"/);
  assert.match(html, /id="panoramaViewerDialog"/);
  assert.match(html, /id="panoramaViewerReset"/);
  assert.match(html, /id="panoramaViewerClose"/);
  assert.match(html, /panorama-viewer\.css\?v=2/);
  assert.match(server, /"\/vendor\/pannellum\.js"/);
  assert.match(server, /"\/vendor\/pannellum\.css"/);
  assert.match(server, /img-src 'self' data: blob: https:/);
  assert.match(server, /connect-src 'self' blob:/);
  assert.match(css, /var\(--panel, #fcfcfd\)/);
  assert.match(css, /var\(--brand-key-bg, #fff\)/);
  assert.match(css, /var\(--functional-action-bg, #f37021\)/);
  assert.match(css, /\.panorama-viewer-canvas \.pnlm-controls/);
});

test("结果层按 featureMode 决定是否渲染 360°入口", async () => {
  const [results, controller] = await Promise.all([
    read("../public/generation-results.js"),
    read("../public/generation-task-controller.js"),
  ]);
  assert.match(results, /isPanoramaPreviewFeature\(featureMode\)/);
  assert.match(results, /panorama\.open/);
  assert.match(controller, /comparisonImage: comparisonImages\.get\(featureMode\) \|\| null/);
  assert.match(controller, /featureMode,/);
});

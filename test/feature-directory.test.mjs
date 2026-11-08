/**
 * [INPUT]: 依赖 node:test/assert、node:fs 与生图工作台入口/主题 CSS
 * [OUTPUT]: 对外提供四组内嵌目录/二十一功能唯一入口、平面布局/旧房/风格转换归AI设计、平面图机位渲染/AI渲染台及白模/精模归AI渲染和图片工具归AI编辑的布局合同
 * [POS]: test 的生图工作台信息架构回归测试，不创建 DOM 或发送请求
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("二十一个功能只在四组内嵌目录中出现一次，平面布局归AI设计、平面机位及白模/精模归AI渲染", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const directory = html.match(/<nav id="featureModeList"[\s\S]*?<\/nav>/)?.[0] || "";

  assert.match(directory, /<h2 id="aiDesignTitle">AI设计<\/h2>/);
  assert.match(directory, /<h2 id="aiRenderTitle">AI渲染<\/h2>/);
  assert.match(directory, /<h2 id="aiEditTitle">AI编辑<\/h2>/);
  assert.match(directory, /<h2 id="aiCreationTitle">AI创作<\/h2>/);
  assert.equal((html.match(/data-feature-mode=/g) || []).length, 21);
  const designGroup = directory.match(/<section[^>]*aria-labelledby="aiDesignTitle"[\s\S]*?<\/section>/)?.[0] || "";
  assert.deepEqual([...designGroup.matchAll(/data-feature-mode="([^"]+)"/g)].map((match) => match[1]), [
    "housePlanLayout", "floorPlan", "emptyRoom", "roomRenovation", "styleTransfer",
  ]);
  assert.match(directory, /data-feature-mode="effectBeautification"[^>]*>效果图美化<\/button>/);
  assert.match(directory, /data-feature-mode="effectEnhancement"[^>]*>效果图氛围转换<\/button>/);
  assert.match(directory, /data-feature-mode="textureEnhancement"[^>]*>质感增强<\/button>/);
  assert.match(directory, /data-feature-mode="lightingTransfer"[^>]*>光影转换<\/button>/);
  const renderGroup = directory.match(/<section[^>]*aria-labelledby="aiRenderTitle"[\s\S]*?<\/section>/)?.[0] || "";
  const editGroup = directory.match(/<section[^>]*aria-labelledby="aiEditTitle"[\s\S]*?<\/section>/)?.[0] || "";
  const creationGroup = directory.match(/<section[^>]*aria-labelledby="aiCreationTitle"[\s\S]*?<\/section>/)?.[0] || "";
  assert.deepEqual([...renderGroup.matchAll(/data-feature-mode="([^"]+)"/g)].map((match) => match[1]), [
    "aiRenderStudio", "floorPlanCamera", "whiteModel", "refinedModel", "effectBeautification", "effectEnhancement", "panoramaEnhancement", "textureEnhancement", "lightingTransfer",
  ]);
  assert.deepEqual([...editGroup.matchAll(/data-feature-mode="([^"]+)"/g)].map((match) => match[1]), [
    "imageUpscale", "imageOutpaint", "imageMultiAngle", "imageMaskFill", "imageRelight",
  ]);
  assert.deepEqual([...creationGroup.matchAll(/data-feature-mode="([^"]+)"/g)].map((match) => match[1]), [
    "styleDna", "free",
  ]);
  assert.equal((directory.match(/>白模渲染<\/button>/g) || []).length, 1);
  assert.equal((directory.match(/data-feature-mode="roomRenovation"[^>]*>旧房改造<\/button>/g) || []).length, 1);
  assert.equal((directory.match(/>精模渲染<\/button>/g) || []).length, 1);
  assert.doesNotMatch(html, /id="featureModeTitle">功能/);
});

test("目录与配置共用左面板且窄屏转为两列分组导航", async () => {
  const css = await readFile(new URL("../public/theme.css", import.meta.url), "utf8");

  assert.match(css, /@media \(min-width: 761px\)[\s\S]*?\.control-panel\s*{[^}]*grid-template-columns: 144px minmax\(0, 1fr\)[^}]*grid-template-rows: minmax\(0, 1fr\) auto[^}]*overflow: clip/s);
  assert.match(css, /\.feature-directory\s*{[^}]*grid-column: 1[^}]*grid-row: 1 \/ -1/s);
  assert.match(css, /\.control-panel-scroll\s*{[^}]*grid-column: 2[^}]*grid-row: 1[^}]*overflow-y: auto[^}]*position: relative/s);
  assert.match(css, /\.action-section\s*{[^}]*grid-column: 2[^}]*grid-row: 2/s);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.feature-directory\s*{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/s);
});

test("目录分类与功能文字保持可读尺寸", async () => {
  const css = await readFile(new URL("../public/theme.css", import.meta.url), "utf8");

  assert.match(css, /\.feature-directory-group h2\s*{[^}]*color: var\(--text\)[^}]*font-size: 11px[^}]*font-weight: 700/s);
  assert.match(css, /\.feature-directory \.feature-mode-option\s*{[^}]*font-size: 12px[^}]*min-height: 34px/s);
});

test("所有生成功能先恢复顺序再把图片上传区置顶", async () => {
  const [appSource, source] = await Promise.all([
    readFile(new URL("../public/app.js", import.meta.url), "utf8"),
    readFile(new URL("../public/design-inputs.js", import.meta.url), "utf8"),
  ]);

  assert.match(appSource, /from "\.\/design-inputs\.js\?v=2"/);
  assert.match(source, /const reference = byId\("referenceInput"\)\.closest\("section"\)/);
  assert.match(source, /const emptyOrder = \[reference, styleReference, byId\("emptyRoomTypeSection"\)/);
  assert.match(source, /parent\.append\(\.\.\.originalOrder\)[\s\S]*parent\.prepend\(reference\)[\s\S]*reference\.after\(styleReference\)/s);
});

/**
 * [INPUT]: 依赖 node:test/assert、node:fs 与生图工作台入口/主题 CSS、共享画布控件样式
 * [OUTPUT]: 验证静态首页首帧、默认折叠目录、底栏、功能参数草稿、原生画布退场、查找与参数栏、无标题带结果和反推画布
 * [POS]: test 的生图工作台信息架构回归测试，不创建 DOM 或发送请求
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { bindFeatureDrafts } from "../public/app-config-controls.js";
import { bindHomeComposerFeatures } from "../public/home-image-chat.js";

test("二十一个功能只在四组内嵌目录中出现一次，户型平面布局归AI设计、添加人物/宠物归AI渲染", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const directory = html.match(/<nav id="featureModeList"[\s\S]*?<\/nav>/)?.[0] || "";

  for (const [key, label] of [["Design", "AI设计"], ["Render", "AI渲染"], ["Edit", "AI编辑"], ["Creation", "AI创作"]]) {
    assert.ok(directory.includes(`id="ai${key}Title"`));
    assert.ok(directory.includes(`aria-controls="ai${key}Features">${label}</button>`));
    assert.ok(directory.includes(`id="ai${key}Features" class="feature-directory-items"`));
  }
  assert.equal((html.match(/data-feature-mode=/g) || []).length, 21);
  const designGroup = directory.match(/<section[^>]*aria-labelledby="aiDesignTitle"[\s\S]*?<\/section>/)?.[0] || "";
  assert.deepEqual([...designGroup.matchAll(/data-feature-mode="([^"]+)"/g)].map((match) => match[1]), [
    "housePlanLayout", "emptyRoom", "roomRenovation", "styleTransfer",
  ]);
  assert.match(directory, /data-feature-mode="effectBeautification"[^>]*>效果图美化<\/button>/);
  assert.match(directory, /data-feature-mode="effectEnhancement"[^>]*>效果图氛围转换<\/button>/);
  assert.match(directory, /data-feature-mode="textureEnhancement"[^>]*>质感增强<\/button>/);
  assert.match(directory, /data-feature-mode="lightingTransfer"[^>]*>光影转换<\/button>/);
  const renderGroup = directory.match(/<section[^>]*aria-labelledby="aiRenderTitle"[\s\S]*?<\/section>/)?.[0] || "";
  assert.doesNotMatch(renderGroup, /模型出图|画面优化/);
  const editGroup = directory.match(/<section[^>]*aria-labelledby="aiEditTitle"[\s\S]*?<\/section>/)?.[0] || "";
  const creationGroup = directory.match(/<section[^>]*aria-labelledby="aiCreationTitle"[\s\S]*?<\/section>/)?.[0] || "";
  assert.deepEqual([...renderGroup.matchAll(/data-feature-mode="([^"]+)"/g)].map((match) => match[1]), [
    "aiRenderStudio", "floorPlanCamera", "whiteModel", "refinedModel", "effectBeautification", "effectEnhancement", "panoramaEnhancement", "textureEnhancement", "lightingTransfer", "sceneCast",
  ]);
  assert.match(renderGroup, /data-feature-mode="sceneCast"[^>]*>添加人物\/宠物<\/button>/);
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

test("功能目录与参数分别滚动，收起侧栏时保留查找入口，窄屏参数使用原抽屉", async () => {
  const [html, panelCss, directoryCss, canvasCss] = await Promise.all(
    ["index.html", "workspace-panel.css", "feature-directory.css", "canvas-view-controls.css"].map((file) =>
      readFile(new URL(`../public/${file}`, import.meta.url), "utf8")),
  );

  const sidebar = html.match(/<aside\b[^>]*id="productSidebar"[\s\S]*?<\/aside>/)?.[0] || "";
  const search = sidebar.match(/<button\b[^>]*data-feature-catalog-open[\s\S]*?<\/button>/)?.[0] || "";
  assert.match(search, /title="查找功能"/);
  assert.match(search, /aria-keyshortcuts="Meta\+K Control\+K"/);
  assert.doesNotMatch(search, /<kbd\b|⌘|Ctrl/);
  assert.match(sidebar, /<nav id="featureModeList"/);
  const separator = html.match(/<[^>]+\bid="workspacePanelResize"[^>]*>/)?.[0] || "";
  assert.match(separator, /\brole="separator"/);
  assert.match(separator, /\btabindex="0"/);
  assert.match(separator, /\baria-orientation="vertical"/);
  assert.match(separator, /\baria-controls="configurationPanel"/);
  assert.match(separator, /\baria-keyshortcuts="Enter"/);
  assert.match(html, /<span class="workspace-panel-grip" aria-hidden="true"><\/span>/);
  const grip = panelCss.match(/^\.workspace-panel-grip\s*\{([^}]+)\}/m)?.[1] || "";
  assert.match(grip, /\binline-size: 2px;/);
  assert.doesNotMatch(grip, /\bborder|box-shadow/);
  assert.equal((html.match(/aria-controls="configurationPanel"/g) || []).length, 1);
  assert.doesNotMatch(html, /workspaceParametersToggle|workspace-parameters-toggle/);
  const mobileLauncher = html.match(/<button id="workspacePanelOpen"[^>]*>[\s\S]*?<\/button>/)?.[0] || "";
  assert.match(mobileLauncher, /<span class="workspace-panel-launcher-label">参数配置<\/span>/);
  assert.doesNotMatch(mobileLauncher, /data-active-feature|白模渲染/);
  assert.match(directoryCss, /#featureModeList\.feature-directory\s*{[^}]*overflow-y: auto/);
  assert.match(directoryCss, /\.feature-catalog-row button\[aria-current="true"\]\s*\{[^}]*background: var\(--brand-key-selected-bg,[^}]*color: var\(--brand-key-selected-ink,/s);
  assert.match(directoryCss, /:is\(#featureModeList \.feature-mode-option\[aria-checked="true"\], \.feature-catalog-row button\[aria-current="true"\]\):focus-visible\s*\{[^}]*-webkit-text-stroke: 0\.5px currentColor;[^}]*outline: none;/);
  assert.doesNotMatch(directoryCss, /:focus-visible::(?:before|after)/);
  assert.match(canvasCss, /\.canvas-view-button:focus-visible svg\s*\{[^}]*stroke-width: 2\.25;/);
  assert.doesNotMatch(canvasCss, /:focus-visible::(?:before|after)/);
  assert.match(directoryCss, /\.workbench-sidebar-collapsed \.workbench-shell > \.product-sidebar #featureModeList,[^{}]*{\s*display: none;/);
  assert.match(panelCss, /#configurationPanel\.workspace-configuration-panel\s*{[^}]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(panelCss, /#configurationPanel > \.control-panel-scroll\s*{[^}]*grid-column: 1[^}]*overflow-y: auto/);
  assert.match(panelCss, /@media \(max-width: 900px\)[\s\S]*\.workspace > \.workspace-mobile-actions\s*{[^}]*display: flex/);
  assert.match(panelCss, /#workspacePanelDialog #configurationPanel > \.control-panel-scroll\s*{[^}]*grid-column: 1/);
});

test("目录文字保持可读尺寸并与品牌共用内容内距", async () => {
  const [theme, directoryCss, navigationCss] = await Promise.all(["theme.css", "feature-directory.css", "product-navigation.css"].map((file) =>
    readFile(new URL(`../public/${file}`, import.meta.url), "utf8"),
  ));

  assert.match(theme, /\.feature-directory-group h2\s*{[^}]*color: var\(--text\)[^}]*font-size: 11px[^}]*font-weight: 700/s);
  assert.match(directoryCss, /#featureModeList \.feature-mode-option\s*{[^}]*font-size: 12px[^}]*min-height: 38px/s);
  assert.match(navigationCss, /\.product-sidebar-head \.brand\s*{[^}]*margin-inline-start: var\(--sidebar-item-inset\)/);
  assert.match(directoryCss, /#featureModeList \[data-feature-group-toggle\]\s*{[^}]*padding-inline: var\(--sidebar-item-inset, 8px\)/);
  assert.match(directoryCss, /\.feature-catalog-trigger\s*{[^}]*padding-inline: var\(--sidebar-item-inset, 8px\)/);
});

test("主标题、参数内容和底部动作都使用同一个侧边距", async () => {
  const [panel, responsive, refined, host] = await Promise.all([
    "workspace-panel.css", "workspace-panel-responsive.css", "refined-lighting-controls.css", "ai-render-studio-host.css",
  ].map((file) => readFile(new URL(`../public/${file}`, import.meta.url), "utf8")));
  assert.match(panel, /--workspace-parameter-inset: 16px;/);
  assert.match(panel, /\.workbench-shell > \.workspace-topbar\s*\{\s*padding-inline-start: var\(--workspace-parameter-inset\);/);
  assert.match(panel, /#configurationPanel > \.workspace-panel-header\s*\{[^}]*padding-inline: var\(--workspace-parameter-inset\);/);
  assert.match(panel, /#configurationPanel > \.action-section\s*\{[^}]*padding: 12px var\(--workspace-parameter-inset\);/);
  assert.doesNotMatch(responsive, /\.panel-section\s*\{[^}]*padding-inline:/);
  assert.match(refined, /#refinedRenderSection > \.refined-lighting-section\s*\{[^}]*var\(--workspace-parameter-inset,/);
  assert.match(host, /#housePlanSettingsMount > \.house-plan-settings-scroll > section,[^{]*\{[^}]*var\(--workspace-parameter-inset,/);
});

test("生成与风格反推右侧直接进入内容，保留底部新对话和发送", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  assert.match(html, /<section class="result-panel" aria-label="生成结果">\s*<div id="resultStage"/);
  assert.match(html, /<section id="styleDnaChat"[^>]*>\s*<div id="styleDnaThread"/);
  assert.match(html, /<div class="composer-submit-tools">\s*<button id="styleDnaResetButton"[^>]*>新对话<\/button>\s*<button id="styleDnaSendButton"/);
  assert.doesNotMatch(html, /result-toolbar|style-dna-chat-header/);
});

test("首页无默认选中功能，复用自由生图提交和主结果区", async () => {
  const [html, app, home, css, params] = await Promise.all(["index.html", "app.js", "home-image-chat.js", "home-image-chat.css", "home-image-chat-parameters.js"].map(file =>
    readFile(new URL(`../public/${file}`, import.meta.url), "utf8")));
  const directory = html.match(/<nav id="featureModeList"[\s\S]*?<\/nav>/)?.[0] || "";
  const groups = [...directory.matchAll(/<button\b[^>]*data-feature-group-toggle[^>]*\baria-expanded="([^"]+)"[^>]*\baria-controls="([^"]+)"/g)];
  assert.equal(groups.length, 4);
  for (const [, expanded, id] of groups) {
    assert.equal(expanded, "false", id);
    assert.match(directory, new RegExp(`<div\\b[^>]*id="${id}"[^>]*\\bhidden(?=[\\s>])`));
  }
  assert.doesNotMatch(html, /data-feature-mode="[^"]+"[^>]*aria-checked="true"/);
  assert.match(app, /!initialFeature\) selectFeatureMode\("free", \{ home: true \}\)/);
  assert.match(app, /send: prompt => void generate\(\{ homePrompt: prompt \}\)/);
  assert.match(home, /current\.append\(stage\)/);
  assert.match(html, /<main class="workspace workspace-panel-layout">[\s\S]*?<section id="homeImageChat"[^>]*\binert>[\s\S]*?<h1 lang="en">Make it great before we ship it\.<\/h1>[\s\S]*?<textarea id="homeImageChatInput"/);
  assert.match(html, /id="homeImageChatNew"[^>]*>新对话<\/button>/);
  assert.doesNotMatch(html, /home-image-chat-feature-row/);
  const footer = html.match(/<div class="home-image-chat-actions">[\s\S]*?<button id="homeImageChatSend"/)?.[0] || "";
  assert.match(footer, /home-image-chat-feature-control[\s\S]*?home-image-chat-feature-icon[\s\S]*?home-image-chat-feature-clear[\s\S]*?id="homeImageChatAttach"/);
  assert.match(footer, /home-image-chat-settings[\s\S]*?home-image-chat-inline-parameters[\s\S]*?home-image-chat-tool-quick[\s\S]*?home-image-chat-advanced-trigger[\s\S]*?home-image-chat-size-trigger[^>]*aria-controls="homeImageChatParameterDialog"/);
  assert.match(home, /freeModelField\.hidden = model\.hidden = mode !== "free"/);
  assert.match(home, /bindHomeChatToolbar\(root, \{ dialog: parameterDialog, parameterButton \}\)/);
  assert.match(home, /advancedTrigger\.hidden = !available \|\| compact[\s\S]*?sizeTrigger\.hidden = !available \|\| !compact/);
  assert.match(params, /const fields = placeSpecifications\(content\);[\s\S]*?host\.append\(content\);/);
  assert.match(params, /sizeTrigger\.addEventListener\("click", openAdvanced\)/);
  assert.match(css, /html:not\(\.image-chat-home\) \.home-image-chat,\s*\.image-chat-home \.result-panel > :is\(#resultStage, #styleDnaChat\),[^{]*\{\s*display: none !important;/);
  assert.match(home, /current\.append\(stage\);[\s\S]*?root\.inert = false;/);
  assert.match(app, /canShowTask: task => !homeChat\.active\(\) \|\| homeChat\.nativeActive\(\) \|\| homeChat\.owns\(task\)/);
  assert.match(app, /deactivateNativeCanvas: \(\) => imageTools\.setFeatureMode\(null\)/);
  assert.match(home, /if \(root\.dataset\.tool === "image"\) deactivateNativeCanvas\(\);\s*nativeTools\.unmount\(\);/);
  assert.match(home, /\["ratioField", "resolutionField", "generationCountField"\]/);
  assert.match(home, /settings\.append\(field\)/);
  assert.match(home, /anchor\.after\(field\)/);
  assert.match(home, /event\.shiftKey[^\n]*event\.isComposing/);
});

test("所有生成功能先恢复顺序再把图片上传区置顶", async () => {
  const [appSource, source] = await Promise.all([
    readFile(new URL("../public/app.js", import.meta.url), "utf8"),
    readFile(new URL("../public/design-inputs.js", import.meta.url), "utf8"),
  ]);

  assert.match(appSource, /from "\.\/design-inputs\.js\?v=5"/);
  assert.match(source, /const reference = byId\("referenceInput"\)\.closest\("section"\)/);
  assert.match(source, /const emptyOrder = \[reference, styleReference, byId\("emptyRoomTypeSection"\)/);
  assert.match(source, /parent\.append\(\.\.\.originalOrder\)[\s\S]*parent\.prepend\(reference\)[\s\S]*reference\.after\(styleReference\)/s);
});

test("首页选择机位或原生编辑时保留对话，独立画布不触发工作台路由", () => {
  const calls = [];
  const mount = {}, parameters = {}, actions = {};
  let embedded;
  let native = false;
  const state = { featureMode: "free", modelKeys: ["banana2"] };
  const homeChat = {
    active: () => true,
    retainTurn: () => {},
    closeTool: () => { native = false; },
    enter: keys => keys,
    route: feature => calls.push(["route", feature]),
    setFeature(mode, label, options) {
      native = mode === "imageOutpaint";
      calls.push(["feature", mode, label, options]);
      return { mount, parameters, actions };
    },
    nativeActive: () => native,
  };
  const host = {
    isEmbedded: () => Boolean(embedded),
    currentMode: () => embedded,
    supports: mode => mode === "floorPlanCamera",
    show(mode, options) { embedded = mode; calls.push(["show", options]); },
  };
  const open = bindHomeComposerFeatures({
    homeChat, host, state, view: () => null, render: () => calls.push(["render"]),
    selectFeatureMode(mode, options) { state.featureMode = mode; embedded = null; calls.push(["select", mode, options]); },
  });
  open({ featureMode: "floorPlanCamera", label: "平面图机位渲染" });
  assert.deepEqual(calls.map(([event]) => event), ["route", "feature", "show"]);
  assert.equal(calls[0][1], null);
  const { onFeatureChange, ...placement } = calls[2][1];
  assert.deepEqual(placement, { embedded: true, mount, parameters, actions });
  assert.equal(typeof onFeatureChange, "function");
  calls.length = 0;
  open({ featureMode: "imageOutpaint", label: "AI扩图" });
  assert.deepEqual(calls, [
    ["select", "imageOutpaint", { navigation: true, home: true }],
    ["feature", "imageOutpaint", "AI扩图", undefined],
    ["render"],
  ]);
});

test("切换功能各自恢复出图规格和 Agent 草稿，同功能刷新不覆盖编辑", () => {
  const state = { featureMode: "whiteModel", modelKeys: ["flux"], ratioMode: "auto", promptAgentModelKey: "gemini" };
  const count = { value: "1" };
  const elements = { ratioSelect: { value: "" }, resolutionSelect: { value: "" }, qualitySelect: { value: "" },
    generationCountField: { querySelector: () => count } };
  const switchDraft = bindFeatureDrafts({ elements, state });
  state.modelKeys = ["banana2"];
  state.ratioMode = "manual";
  state.promptAgentModelKey = "gpt";
  elements.ratioSelect.value = "16:9";
  elements.resolutionSelect.value = "2K";
  elements.qualitySelect.value = "high";
  count.value = "3";
  assert.deepEqual(switchDraft("emptyRoom"), { modelKeys: ["flux"], ratioMode: "auto", promptAgentModelKey: "gemini",
    ratio: "", resolution: "", quality: "", count: "1" });
  assert.equal(switchDraft("emptyRoom"), null);
  assert.deepEqual(switchDraft("whiteModel"), { modelKeys: ["banana2"], ratioMode: "manual", promptAgentModelKey: "gpt",
    ratio: "16:9", resolution: "2K", quality: "high", count: "3" });
  assert.equal(state.ratioMode, "manual");
  assert.equal(state.promptAgentModelKey, "gpt");
});

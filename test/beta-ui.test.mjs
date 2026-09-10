/**
 * [INPUT]: 依赖 node:test/assert、node:fs 与 Beta跑图 HTML/CSS/样本库/结果组件/浏览器编排器、飞书 Base 存储和 server 路由源码
 * [OUTPUT]: 对外提供默认 Flux 且跨工作台/刷新恢复本机配置的独立配置页、飞书样本集选择/创建及回读确认状态、不设结果数量上限的批量执行、独立测试时间、同选项键帽近距阴影的 38px 中性保存与右侧飞书结果按钮、同工作台下拉/上传/START/RETRY、桌面根容器禁止焦点滚动、配置区约束绝对定位控件且无页面空滚动的配置/监控双栏、生成/飞书同步双进度与已归档结果缩略图的静态回归保障
 * [POS]: test 的 Beta跑图页面合同测试，不启动浏览器或发送真实请求
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Beta跑图是独立第三工作台且只提供五个出图功能", async () => {
  const [html, source, configuration, sampleLibrary, resultSource, css, uploadSource, server, betaBase] = await Promise.all([
    readFile(new URL("../public/beta.html", import.meta.url), "utf8"),
    readFile(new URL("../public/beta-app.js", import.meta.url), "utf8"),
    readFile(new URL("../public/beta-configuration.js", import.meta.url), "utf8"),
    readFile(new URL("../public/beta-sample-library.js", import.meta.url), "utf8"),
    readFile(new URL("../public/beta-results.js", import.meta.url), "utf8"),
    readFile(new URL("../public/beta.css", import.meta.url), "utf8"),
    readFile(new URL("../public/beta-upload.js", import.meta.url), "utf8"),
    readFile(new URL("../server.mjs", import.meta.url), "utf8"),
    readFile(new URL("../src/beta-base.mjs", import.meta.url), "utf8"),
  ]);

  assert.match(html, /<title>Canvas Lab · Beta跑图<\/title>/);
  assert.match(html, /href="\/beta\.html" aria-current="page">Beta跑图/);
  assert.match(html, /data-feature-mode="whiteModel"/);
  assert.match(html, /data-feature-mode="emptyRoom"/);
  assert.match(html, /data-feature-mode="refinedModel"/);
  assert.match(html, /data-feature-mode="effectEnhancement"/);
  assert.match(html, /data-feature-mode="free"/);
  assert.doesNotMatch(html, /styleDnaReverse|风格反推/);
  assert.match(html, /id="sourceFilesInput"[^>]*multiple/);
  assert.doesNotMatch(html, /class="beta-hero"|选择样本集，设置后运行。/);
  assert.match(html, /最多选择 4 个/);
  assert.match(html, /结果自动同步飞书/);
  assert.match(html, /<h2>选择样本集<\/h2>/);
  assert.doesNotMatch(html, /<span>0[1-4]<\/span>/);
  assert.match(html, /id="sampleSetSelect"/);
  assert.match(html, /id="sampleSetSyncStatus"[^>]*role="status"[^>]*>读取飞书中/);
  assert.match(html, /id="saveSampleSetButton" class="quiet-button sample-set-save"[^>]*>保存样本集/);
  assert.doesNotMatch(html, /id="sampleSetStatus"|添加样本后保存|正在读取飞书样本集/);
  assert.doesNotMatch(html, /整批共用 · 仅智能默认|整批提示词共用/);
  assert.doesNotMatch(html, /BATCH GENERATION|<p class="eyebrow">RUNS|一条 Case/);
  assert.match(html, /custom-select\.css\?v=9/);
  assert.match(html, /generation-actions\.css\?v=15/);
  assert.match(html, /beta-app\.js\?v=19/);
  assert.match(configuration, /configurationState = "saved"/);
  assert.match(html, /class="beta-config-scroll"/);
  assert.match(html, /id="sourceFilesDropZone" class="reference-drop-zone"/);
  assert.match(html, /id="styleReferenceList" class="reference-list upload-reference-list"/);
  assert.match(html, /id="runButton" class="generate-button functional-accent-button"/);
  assert.match(html, /id="ratioSelect" data-dropdown-placement="top"/);
  assert.match(html, /ORwJbt5EYauNORsrhqJcpetLnEb/);
  assert.match(html, /<aside class="beta-card beta-monitor-card"[^>]*aria-labelledby="jobMonitorTitle"/);
  assert.match(html, /id="jobProgress" class="job-progress"/);
  assert.match(html, /id="generationProgressCount">0 \/ 0/);
  assert.match(html, /id="jobProgressCount">0 \/ 0/);
  assert.match(html, />生成进度<\/span>/);
  assert.match(html, />飞书同步<\/span>/);
  assert.match(html, /id="monitorBaseLink" class="quiet-button monitor-base-button"[^>]*>在飞书查看结果<\/a>/);
  assert.match(html, /id="monitorResults" class="monitor-results-grid"[^>]*aria-live="polite"/);
  assert.match(html, /id="monitorResultsCount">0 张/);
  assert.doesNotMatch(html, /id="betaBaseLink"|class="section-link"|>打开飞书<\/a>/);
  assert.match(source, /\/api\/beta\/jobs/);
  assert.match(source, /adaptGenerationInputForModel/);
  assert.match(source, /function packBatchAssets\(items\)/);
  assert.match(source, /referenceAssetKey/);
  assert.match(source, /import "\.\/custom-select\.js\?v=7"/);
  assert.match(source, /import \{ createBetaSampleLibrary \} from "\.\/beta-sample-library\.js\?v=5"/);
  assert.match(source, /import \{ renderBetaResults \} from "\.\/beta-results\.js\?v=1"/);
  assert.match(source, /import \{ createBetaRunId, formatBetaTestTime \} from "\.\/beta-run-id\.js\?v=2"/);
  assert.match(source, /testTime: formatBetaTestTime\(startedAt\)/);
  assert.match(source, /DEFAULT_BETA_MODEL_KEY/);
  assert.match(source, /readBetaPageState\(localStorage\)/);
  assert.match(source, /createBetaConfigurationPersistence/);
  assert.match(source, /storage: localStorage/);
  assert.match(configuration, /saveBetaPageState\(storage/);
  assert.match(configuration, /window\.addEventListener\("pagehide", save\)/);
  assert.match(configuration, /document\.visibilityState === "hidden"/);
  assert.match(source, /state\.sampleSetIds\[state\.featureMode\]/);
  assert.match(source, /runnable\.find\(\(model\) => model\.key === DEFAULT_BETA_MODEL_KEY\)/);
  assert.match(source, /bindImageDrop/);
  assert.match(source, /createBetaSampleLibrary/);
  assert.match(source, /runButtonLabel\.textContent = running \? "RUNNING…" : failed \? "RETRY" : "START"/);
  assert.match(source, /failed \? "重新运行当前批次" : "结果自动同步飞书"/);
  assert.match(source, /job\.stages\?\.generated/);
  assert.match(source, /job\.stages\?\.synced/);
  assert.match(source, /全部结果已生成并同步飞书/);
  assert.match(source, /results: job\?\.result\?\.results/);
  assert.match(resultSource, /export function renderBetaResults/);
  assert.match(resultSource, /result\?\.recordUrl/);
  assert.match(resultSource, /result\?\.previewUrl/);
  assert.match(resultSource, /已同步/);
  assert.match(sampleLibrary, /\/api\/beta\/sample-sets/);
  assert.match(sampleLibrary, /function beginCreate\(\)/);
  assert.match(sampleLibrary, /preferredSampleSetId/);
  assert.match(sampleLibrary, /onSelectionChange\(state\.featureMode, state\.activeSampleSetId\)/);
  assert.match(sampleLibrary, /setSyncStatus\("同步飞书中", "syncing"\)/);
  assert.match(sampleLibrary, /setSyncStatus\("已同步飞书", "success"\)/);
  assert.match(sampleLibrary, /setSyncStatus\("同步失败", "error", error\.message\)/);
  assert.doesNotMatch(source, /MAX_RUNS|20 张上限|单批最多运行/);
  assert.doesNotMatch(sampleLibrary, /maxRuns|\.slice\(0, maxRuns\)/);
  assert.match(betaBase, /return this\.getSampleSet\(sampleSetId\);/);
  assert.match(uploadSource, /renderImagePreviews/);
  assert.match(uploadSource, /拖入新图可直接替换/);
  assert.match(uploadSource, /dropZone\.addEventListener\("drop"/);
  assert.doesNotMatch(source, /\/api\/benchmark/);
  assert.match(server, /createBetaBaseStore/);
  assert.match(server, /scheduleGenerationSync: captureBetaGenerationArchive/);
  assert.doesNotMatch(css, /transition\s*:\s*all\b/);
  assert.match(css, /--choice-control-height:\s*38px/);
  assert.match(css, /\.sample-set-actions\s*\{[^}]*gap:\s*6px;/s);
  assert.match(css, /\.sample-set-actions \.quiet-button\s*\{\s*min-height:\s*38px;/);
  assert.match(css, /\.monitor-base-button\s*\{[^}]*min-height:\s*38px;[^}]*width:\s*100%;/s);
  assert.doesNotMatch(css, /\.section-link|\.monitor-base-link/);
  assert.doesNotMatch(source, /betaBaseLink/);
  assert.match(css, /\.quiet-button\.sample-set-save\s*\{[^}]*box-shadow:\s*var\(--brand-key-shadow, var\(--control-shadow\)\);/s);
  assert.doesNotMatch(css, /\.sample-set-save\s*\{[^}]*brand-primary-shadow/s);
  assert.match(css, /\.beta-section\s*\{[^}]*display:\s*grid;[^}]*gap:\s*16px;[^}]*padding:\s*18px 20px;/s);
  assert.match(css, /\.beta-section:first-child\s*\{\s*padding-top:\s*20px;/);
  assert.match(css, /\.section-heading\s*\{[^}]*margin-bottom:\s*-4px;/s);
  assert.match(css, /\.section-heading h2\s*\{[^}]*font-size:\s*13px;[^}]*font-weight:\s*600;[^}]*letter-spacing:\s*-\.006em;/s);
  assert.doesNotMatch(css, /\.section-heading > div > span/);
  assert.match(css, /\.beta-shell\s*\{[^}]*margin:\s*14px 0 0;[^}]*max-width:\s*none;[^}]*width:\s*100%;/s);
  assert.doesNotMatch(css, /\.beta-shell\s*\{[^}]*760px/s);
  assert.match(css, /\.beta-config-scroll\s*\{[^}]*position:\s*relative;/s);
  assert.match(css, /html\s*\{\s*overflow:\s*clip;/s);
  assert.match(css, /body\s*\{[^}]*overflow:\s*clip;/s);
  assert.match(css, /\.app-shell\s*\{[^}]*height:\s*100dvh;/s);
  assert.match(css, /\.beta-config-card\s*\{[^}]*height:\s*100%;/s);
  assert.doesNotMatch(css, /\.beta-hero|\.beta-intro-copy|\.base-link/);
  assert.match(css, /\.beta-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(288px, 336px\)/s);
  assert.match(css, /@media \(max-width: 960px\)\s*\{[^}]*html, body\s*\{\s*overflow:\s*auto;/s);
  assert.match(css, /\.sync-progress-track span\s*\{\s*background:\s*#f37021;/s);
  assert.match(css, /\.monitor-results-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);[^}]*overflow:\s*auto;/s);
  assert.match(css, /\.monitor-result-card\s*\{/);
  assert.match(css, /\.reference-drop-zone\s*\{/);
  assert.doesNotMatch(css, /\.model-options \+ \.output-grid|\.field-grid \+ \.field|\.compact-upload\s*\{[^}]*margin-top/s);
  assert.match(css, /\.run-bar \.generation-actions \.generate-button\s*\{[^}]*min-height:\s*54px/s);
});

test("原 Benchmark 保留独立页面和原评测编排器", async () => {
  const benchmarkHtml = await readFile(
    new URL("../public/benchmark.html", import.meta.url),
    "utf8",
  );
  assert.match(benchmarkHtml, /模型评测/);
  assert.match(benchmarkHtml, /benchmark-app\.js/);
  assert.match(benchmarkHtml, /id="reviewButton"/);
  assert.doesNotMatch(benchmarkHtml, /beta-app\.js/);
});

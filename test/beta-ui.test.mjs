/**
 * [INPUT]: 依赖 node:test/assert、node:fs 与 Beta 十功能目录、HTML/CSS/样本库/预警组件/浏览器编排器、批次图片去重、飞书 Base 存储和 server 路由源码
 * [OUTPUT]: 对外提供十功能配置、全景光影用户要求/固定Prompt功能隔离、权限普通说明隐藏/真实状态保留、精模参考去重、尺寸/模型/目标/样本ID及同步进度/RETRY和预警回归
 * [POS]: test 的 Beta跑图页面合同测试，不启动浏览器或发送真实请求
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { packBatchAssets } from "../public/beta-assets.js";
import { BETA_FEATURE_COPY } from "../public/beta-model-rules.js";
import { betaJobWarnings, renderBetaWarnings } from "../public/beta-results.js";

test("Beta提示词模型正常授权不显示说明，检测/断连/权限失败与自动候补仍可见", async () => {
  const source = await readFile(new URL("../public/beta-app.js", import.meta.url), "utf8");
  const body = source.match(/function renderPromptAgentModels\(\) \{([\s\S]*?)\n\}/)?.[1];
  assert.ok(body);
  const render = new Function("state", "elements", "fillSelect", "renderRunSummary", body);
  const catalog = [{ key: "gemini3pro", label: "Gemini", imageInput: true },
    { key: "claude", label: "Claude", imageInput: true }];
  const check = ({ connected = true, checked = true, access = [true, true] } = {}) => {
    const classes = new Set();
    const elements = { promptAgentModelSelect: { value: "gemini3pro" },
      promptAgentAvailability: { classList: { toggle(name, enabled) {
        if (enabled) classes.add(name); else classes.delete(name);
      } } } };
    const state = { connected, agentAccessChecked: checked, catalog: { agentModels: catalog },
      agentAccess: new Map(catalog.map((model, index) => [model.key, { selectable: access[index] }])) };
    render(state, elements, (select, options, current) => {
      select.value = (options.find(option => option.value === current && !option.disabled)
        || options.find(option => !option.disabled))?.value || "";
    }, () => {});
    return { note: elements.promptAgentAvailability, classes };
  };
  const ready = check();
  assert.equal(ready.note.hidden, true);
  assert.equal(ready.classes.has("error"), false);
  for (const [input, message, error] of [
    [{ connected: false, checked: false }, /请先连接/, true],
    [{ checked: false }, /正在检测/, false],
    [{ access: [false, false] }, /没有可用/, true],
    [{ access: [false, true] }, /已切换为 Claude/, true],
  ]) {
    const status = check(input);
    assert.equal(status.note.hidden, false);
    assert.match(status.note.textContent, message);
    assert.equal(status.classes.has("error"), error);
  }
});

test("Beta跑图是独立第三工作台，十功能任务使用共享可搜索下拉并保留配置与监控", async () => {
  const [html, source, assetSource, configuration, sampleLibrary, resultSource, css, uploadSource, server, betaBase] = await Promise.all([
    readFile(new URL("../public/beta.html", import.meta.url), "utf8"),
    readFile(new URL("../public/beta-app.js", import.meta.url), "utf8"),
    readFile(new URL("../public/beta-assets.js", import.meta.url), "utf8"),
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
  const featureSelect = html.match(/<select\b[^>]*id="betaFeatureSelect"[^>]*>/)?.[0] || "";
  assert.match(featureSelect, /data-searchable="true"/);
  assert.match(featureSelect, /aria-label="选择任务"/);
  assert.doesNotMatch(html, /betaFeatureOptions|data-feature-mode=/);
  assert.deepEqual(Object.entries(BETA_FEATURE_COPY).map(([key, copy]) => [key, copy.label]), [
    ["whiteModel", "白模渲染"], ["emptyRoom", "空房设计"], ["styleTransfer", "风格转换"],
    ["refinedModel", "精模渲染"], ["effectEnhancement", "效果图氛围转换"],
    ["effectBeautification", "效果图美化"], ["panoramaEnhancement", "全景图美化"],
    ["free", "自由生图"], ["imageOutpaint", "AI扩图"], ["imageUpscale", "AI超分"],
  ]);
  assert.match(source, /BETA_FEATURE_COPY as FEATURE_COPY[^\n]+"\.\/beta-model-rules\.js\?v=5"/);
  assert.match(source, /fillSelect\(elements\.betaFeatureSelect,\s*Object\.entries\(FEATURE_COPY\)\.map/);
  assert.match(source, /elements\.betaFeatureSelect\.value = state\.featureMode/);
  assert.match(source, /elements\.betaFeatureSelect\.disabled = sampleLibrary\.isBusy\(\)/);
  const featureChange = source.match(/elements\.betaFeatureSelect\.addEventListener\("change", \(\) => \{([\s\S]*?)\n  \}\);/)?.[1] || "";
  assert.match(featureChange, /const featureMode = elements\.betaFeatureSelect\.value/);
  assert.match(featureChange, /if \(sampleLibrary\.isBusy\(\) \|\| !Object\.hasOwn\(FEATURE_COPY, featureMode\) \|\| featureMode === state\.featureMode\) return/);
  assert.match(featureChange, /state\.featureMode = featureMode;\s*renderFeature\(\);\s*sampleLibrary\.setFeatureMode\(\s*state\.featureMode,\s*state\.sampleSetIds\[state\.featureMode\],\s*\)\.then\(saveConfiguration\)\.catch\(reportUploadError\)/);
  assert.doesNotMatch(source, /betaFeatureOptions|button\.dataset\.featureMode/);
  assert.doesNotMatch(html, /styleDnaReverse|风格反推/);
  assert.match(html, /id="sourceFilesInput"[^>]*multiple/);
  assert.doesNotMatch(html, /class="beta-hero"|选择样本集，设置后运行。/);
  assert.match(html, /可多选全部可用模型/);
  assert.match(html, /结果自动同步飞书/);
  assert.match(html, /<h2>选择样本集<\/h2>/);
  assert.doesNotMatch(html, /<span>0[1-4]<\/span>/);
  assert.match(html, /id="sampleSetSelect"/);
  assert.match(html, /id="sampleSetSyncStatus"[^>]*role="status"[^>]*>读取飞书中/);
  assert.match(html, /id="saveSampleSetButton" class="quiet-button sample-set-save"[^>]*>保存样本集/);
  assert.doesNotMatch(html, /id="sampleSetStatus"|添加样本后保存|正在读取飞书样本集/);
  assert.doesNotMatch(html, /整批共用 · 仅智能默认|整批提示词共用/);
  assert.doesNotMatch(html, /BATCH GENERATION|<p class="eyebrow">RUNS|一条 Case/);
  assert.match(html, /custom-select\.css\?v=10/);
  assert.match(html, /generation-actions\.css\?v=15/);
  assert.match(html, /beta-app\.js\?v=38/);
  assert.match(html, /id="upscaleResolutionField"[^>]*><span>输出尺寸<\/span>/);
  assert.match(html, /id="upscaleResolutionSelect"[^>]*aria-label="超分输出尺寸"[^>]*><\/select>/);
  assert.match(html, /id="upscaleResolutionNote"[^>]*>按所选工作流的共同尺寸输出，保持每张原图比例。/);
  assert.match(source, /createBetaUpscaleConfiguration[^\n]+"\.\/beta-upscale\.js\?v=3"/);
  assert.doesNotMatch(html, /model-picker\.css/);
  assert.match(source, /import \{ bindModelMultiSelect \} from "\.\/model-multi-select\.js\?v=5"/);
  assert.match(source, /const modelSelection = bindModelMultiSelect\(\{/);
  assert.match(source, /modelSelection\.render\(runnable, state\.selectedModelKeys\)/);
  assert.match(source, /state\.selectedModelKeys = refinedModelSelection\.chooseByUser\(state\.featureMode, keys\);\s*renderOutputControls\(\);\s*saveConfiguration\(\);/);
  assert.match(source, /const selectable = betaModelSelectable\(model, state\.featureMode\)/);
  assert.match(source, /reason: selectable \? "" : "不支持 2:1"/);
  assert.doesNotMatch(source, /modelOptions\.replaceChildren|modelOptions\.addEventListener/);
  assert.doesNotMatch(configuration, /modelOptions\.querySelector/);
  assert.match(html, /单张 8MB · 逐张上传/);
  assert.doesNotMatch(html, /合计 20MB/);
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
  assert.match(html, /id="monitorWarnings" class="monitor-warnings-list"[^>]*aria-live="polite"/);
  assert.match(html, /id="monitorWarningsCount">暂无异常/);
  assert.doesNotMatch(html, /id="betaBaseLink"|class="section-link"|>打开飞书<\/a>/);
  assert.match(source, /\/api\/beta\/jobs/);
  assert.match(source, /adaptGenerationInputForModel/);
  assert.match(source, /packBatchAssets\(buildItems\(startedAt\), state\.featureMode\)/);
  assert.match(assetSource, /export function packBatchAssets\(items, featureMode\)/);
  assert.match(assetSource, /referenceAssetKey/);
  assert.match(source, /import "\.\/custom-select\.js\?v=9"/);
  assert.match(source, /import \{ createBetaSampleLibrary \} from "\.\/beta-sample-library\.js\?v=8"/);
  assert.match(source, /sampleSetId: sampleLibrary\.activeSampleSetId\(\)/);
  assert.match(source, /sampleId: currentCase\.caseId/);
  assert.doesNotMatch(source, /MAX_BATCH_IMAGE_BYTES|assertBatchImageSize|assertCurrentAssetSize/);
  assert.match(source, /import \{ renderBetaWarnings \} from "\.\/beta-results\.js\?v=2"/);
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
  assert.match(source, /selectable\.find\(\(model\) => model\.key === DEFAULT_BETA_MODEL_KEY\)/);
  assert.match(source, /bindImageDrop/);
  assert.match(source, /createBetaSampleLibrary/);
  assert.match(source, /runButtonLabel\.textContent = running \? "RUNNING…" : failed \? "RETRY" : "START"/);
  assert.match(source, /failed \? "仅重试失败项，已成功结果保留" : "结果自动同步飞书"/);
  assert.match(source, /job\.stages\?\.generated/);
  assert.match(source, /job\.stages\?\.synced/);
  assert.match(source, /全部结果已生成并同步飞书/);
  assert.match(source, /retryOfJobId: previousJob\.jobId/);
  assert.match(source, /state\.submitting/);
  assert.match(html, /id="newBatchButton"[^>]*type="button">新批次/);
  assert.match(source, /newBatchButton\.addEventListener\("click"[^]*sessionStorage\.removeItem\(JOB_STORAGE_KEY\);\s*renderJob\(null\)/);
  assert.match(resultSource, /export function renderBetaWarnings/);
  assert.match(resultSource, /warning\.recordUrl/);
  assert.doesNotMatch(resultSource, /createElement\("img"\)|previewUrl|innerHTML/);
  assert.match(resultSource, /飞书同步失败/);
  assert.match(sampleLibrary, /\/api\/beta\/sample-sets/);
  assert.match(sampleLibrary, /function beginCreate\(\)/);
  assert.match(sampleLibrary, /preferredSampleSetId/);
  assert.match(sampleLibrary, /onSelectionChange\(state\.featureMode, state\.activeSampleSetId\)/);
  assert.match(sampleLibrary, /setSyncStatus\("同步飞书中", "syncing"\)/);
  assert.match(sampleLibrary, /setSyncStatus\("已同步飞书", "success"\)/);
  assert.match(sampleLibrary, /setSyncStatus\(`同步失败 · \$\{completed\} \/ \$\{samples.length\}`, "error", error\.message\)/);
  assert.doesNotMatch(source, /MAX_RUNS|20 张上限|单批最多运行/);
  assert.doesNotMatch(sampleLibrary, /maxRuns|\.slice\(0, maxRuns\)/);
  assert.match(betaBase, /createBetaSampleStore/);
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
  assert.match(css, /\.monitor-warnings-list\s*\{[^}]*overflow:\s*auto;/s);
  assert.match(css, /\.monitor-warning\s*\{/);
  assert.match(css, /\.reference-drop-zone\s*\{/);
  assert.doesNotMatch(css, /\.model-options \+ \.output-grid|\.field-grid \+ \.field|\.compact-upload\s*\{[^}]*margin-top/s);
  assert.match(css, /\.run-bar \.generation-actions \.generate-button\s*\{[^}]*min-height:\s*54px/s);
});

test("Beta效果图美化与氛围转换分别准入和传参，强度色调复用主工作台控件并恢复", async () => {
  const [html, source, configuration, css, featureRules] = await Promise.all([
    readFile(new URL("../public/beta.html", import.meta.url), "utf8"),
    readFile(new URL("../public/beta-app.js", import.meta.url), "utf8"),
    readFile(new URL("../public/beta-configuration.js", import.meta.url), "utf8"),
    readFile(new URL("../public/beta.css", import.meta.url), "utf8"),
    readFile(new URL("../public/beta-model-rules.js", import.meta.url), "utf8"),
  ]);
  assert.match(html, /effect-beautification\.css\?v=1/);
  assert.match(html, /id="effectBeautificationIntensityOptions"[^>]*role="radiogroup"/);
  assert.match(html, /id="effectBeautificationToneOptions"[^>]*role="radiogroup"[^>]*data-effect-tones/);
  assert.deepEqual([...html.matchAll(/data-effect-intensity="([^"]+)"/g)].map((match) => match[1]), ["low", "high"]);
  assert.deepEqual([...html.matchAll(/data-effect-tone="([^"]+)"/g)].map((match) => match[1]), ["natural", "warm", "cool"]);
  assert.match(featureRules, /promptConfig: "effectBeautificationPrompt"/);
  assert.match(featureRules, /promptConfig: "effectEnhancementPrompt"/);
  assert.match(source, /effectBeautification: effectBeautificationControls\.value\(\)/);
  assert.match(source, /effectBeautificationPromptVersion: state\.stylesConfig\?\.effectBeautificationPrompt\?\.version/);
  assert.match(source, /\|\| !effectReady/);
  const promptExpression = source.match(/\n\s+prompt: ([^\n]+),\n/)?.[1];
  assert.ok(promptExpression, "批次构造必须显式决定实际用户Prompt");
  const promptFor = new Function("state", "panoramaLighting", "FEATURE_COPY", "currentCase", `return (${promptExpression});`);
  const lighting = { requestFields: () => ({ prompt: "夜晚暖灯，减弱窗外日光" }) };
  const currentCase = { prompt: "样本补充要求" };
  for (const featureMode of ["effectBeautification", "effectEnhancement"]) {
    assert.equal(promptFor({ featureMode }, lighting, BETA_FEATURE_COPY, currentCase), "");
  }
  assert.equal(promptFor({ featureMode: "panoramaEnhancement" }, lighting, BETA_FEATURE_COPY, currentCase), "夜晚暖灯，减弱窗外日光");
  assert.equal(promptFor({ featureMode: "free" }, lighting, BETA_FEATURE_COPY, currentCase), "样本补充要求");
  assert.match(source, /panoramaLighting: panoramaLightingRequestSelection\(model\.panoramaLightingSelection \|\| panoramaLighting\.requestFields\(\)\.panoramaLighting\)/);
  assert.match(configuration, /effectBeautificationControls\.restore\(/);
  assert.match(configuration, /effectBeautificationIntensity: beautification\.intensity/);
  assert.match(configuration, /effectBeautificationTone: beautification\.tone/);
  assert.doesNotMatch(css, /\.feature-options \.feature-mode-option:last-child/);
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

test("已有样本跨模型只发送稳定 ID 且风格图仅携带一份", () => {
  const image = { dataUrl: "data:image/png;base64,example" };
  const items = ["flux", "seedream"].map((modelKey) => ({
    caseId: "sample-1",
    sampleId: "sample-1",
    input: { referenceImages: [image], styleReferenceImages: [image] },
    modelKey,
  }));
  const packed = packBatchAssets(items, "whiteModel");
  assert.deepEqual(Object.keys(packed.assets), ["shared-style"]);
  assert.equal(packed.items[0].referenceAssetKey, undefined);
  assert.equal(packed.items[0].sampleId, "sample-1");
  assert.equal(packed.items[0].styleReferenceAssetKey, packed.items[1].styleReferenceAssetKey);
  assert.equal(packed.items[0].input.referenceImages, undefined);
  assert.equal(packed.items[1].input.styleReferenceImages, undefined);
});

test("自由生图的共享主图和风格图各传一份", () => {
  const source = { dataUrl: "data:image/png;base64,source" };
  const style = { dataUrl: "data:image/png;base64,style" };
  const items = ["one", "two", "three"].map((caseId) => ({
    caseId, sampleId: caseId, input: { referenceImages: [source], styleReferenceImages: [style] },
  }));
  const packed = packBatchAssets(items, "free");
  assert.deepEqual(packed.assets, { "shared-source": [source], "shared-style": [style] });
  assert.ok(packed.items.every((item) => item.referenceAssetKey === "shared-source"));
  assert.ok(packed.items.every((item) => !item.input.referenceImages && !item.input.styleReferenceImages));
});

test("精模光影参考按角色只传一份，非活动来源不携带旧参考", () => {
  const image = { dataUrl: "data:image/png;base64,mood" };
  const items = ["gpt", "banana"].map(modelKey => ({ sampleId: "sample-1", input: {
    modelKey, refinedLighting: { mode: "reference" }, lightingReferenceImages: [image],
  } }));
  const packed = packBatchAssets(items, "refinedModel");
  assert.deepEqual(packed.assets, { "shared-lighting": [image] });
  assert.ok(packed.items.every(item => item.lightingReferenceAssetKey === "shared-lighting"));
  assert.ok(packed.items.every(item => !("lightingReferenceImages" in item.input)));
  for (const mode of ["original", "preset"]) {
    const inactive = packBatchAssets([{ input: { refinedLighting: { mode }, lightingReferenceImages: [image] } }], "refinedModel");
    assert.deepEqual(inactive.assets, {});
    assert.equal("lightingReferenceAssetKey" in inactive.items[0], false);
    assert.equal("lightingReferenceImages" in inactive.items[0].input, false);
  }
  assert.deepEqual(packBatchAssets(items, "whiteModel").assets, {});
});


test("预警保留逐项阶段与原始原因，旧批次错误和连接错误均可见", () => {
  const warnings = [{ runId: "failed-1", stage: "sync", message: "费用回读不一致", label: "样本 · Flux" }];
  const job = { status: "failed", error: "1 张失败", result: { warnings } };
  const actual = betaJobWarnings(job, "网络断开");
  assert.equal(actual.length, 2);
  assert.equal(actual[0].stage, "connection");
  assert.deepEqual(actual[1], warnings[0]);
  assert.notEqual(actual[1], warnings[0]);
  assert.equal(betaJobWarnings({ status: "failed", error: "旧任务失败" })[0].message, "旧任务失败");
  assert.deepEqual(betaJobWarnings({ status: "success", result: { warnings: [] } }), []);
});

test("预警渲染使用安全文本且不渲染图片，非法记录链接不可执行", () => {
  const previous = globalThis.document;
  const node = (tag) => ({ tag, dataset: {}, children: [], append(...children) { this.children.push(...children); }, replaceChildren(...children) { this.children = children; } });
  globalThis.document = { createElement: node };
  try {
    const container = node("div");
    const count = node("small");
    renderBetaWarnings({ container, count, job: { status: "failed", result: { warnings: [{
      stage: "sync", label: "<img onerror=alert(1)>", message: "附件校验失败", recordUrl: "javascript:alert(1)",
    }] } } });
    assert.equal(count.textContent, "1 项");
    assert.deepEqual(container.children[0].children.map((child) => child.tag), ["strong", "span", "p"]);
    assert.equal(container.children[0].children[1].textContent, "<img onerror=alert(1)>");
    renderBetaWarnings({ container, count, job: { status: "success" } });
    assert.equal(count.textContent, "暂无异常");
    assert.match(container.children[0].textContent, /全部结果已同步/);
  } finally { globalThis.document = previous; }
});

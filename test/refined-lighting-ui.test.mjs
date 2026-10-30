/**
 * [INPUT]: 依赖精模常显图卡控制器、实际模型目录与请求投影，以及内存DOM/上传替身
 * [OUTPUT]: 验证共享小勾/纯名称/单行光影数量及无计数渲染方式、单选收起/多选保持展开、失效阻断/预览复用、光影×方式分流和上传互斥/草稿恢复
 * [POS]: test 的精模光影库浏览器合同验证，不访问飞书或调用图像模型
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { bindRefinedLightingControls, normalizeRefinedLighting, refinedLightingValidation, usesRefinedLightingReferencePrompt } from "../public/refined-lighting-controls.js";
import { buildGenerationInput } from "../public/generation-input.js";
import { buildGenerationJobRequest, generationLoadingCopy } from "../public/generation-task-request.js";
import { resultMetadata } from "../public/workbench-utils.js";
import { publicModelCatalog } from "../src/model-config.mjs";
const rule = { ruleVersion: 1, ruleSha256: "a".repeat(64) };
const referenceRule = { ruleVersion: 3, ruleSha256: "c".repeat(64) };
const hybridRule = { ruleVersion: 4, ruleSha256: "d".repeat(64) };
const preset = { id: "preset-soft", code: "soft", name: "自然柔光", description: "柔和漫射光", category: "日光", version: 2, sha256: "b".repeat(64) };
const config = { available: true, promptAvailable: true, presetExecutions: ["prompt-only", "prompt-and-reference"], referenceAvailable: true, referenceRuleVersion: referenceRule.ruleVersion, referenceRuleSha256: referenceRule.ruleSha256, hybridAvailable: true, hybridRuleVersion: hybridRule.ruleVersion, hybridRuleSha256: hybridRule.ruleSha256, tableUrl: "https://test.feishu.cn/base/lighting", ...rule, presets: [preset] };
const selection = { mode: "preset", execution: "prompt-only", presetId: preset.id, version: preset.version, sha256: preset.sha256, ...rule };
const combinedSelection = { ...selection, execution: "prompt-and-reference", ...referenceRule };
const source = { dataUrl: "data:image/png;base64,AA==", name: "model.png", size: 1, type: "image/png" };
const reference = { ...source, name: "light.png", dataUrl: "data:image/png;base64,AQ==" };
const multi = { key: "multi", label: "双图模型", maxReferenceImages: 4 };
const single = { key: "flux", label: "Flux", maxReferenceImages: 1 };
const nightPreset = { ...preset, id: "preset-night", name: "暖灯静夜", version: 3, sha256: "e".repeat(64) };
const filmPreset = { ...preset, id: "preset-film", name: "胶片", sha256: "f".repeat(64) };
const multiPresetConfig = { ...config, multiplePresetSelections: true, multiplePresetExecutions: true,
  presets: [preset, nightPreset, filmPreset] };
const identityOf = value => ({ presetId: value.id, version: value.version, sha256: value.sha256 });

function fixture(storageKey = null, options = {}) {
  const nodes = new Map(), changes = [];
  const doc = { activeElement: null, createElement: tag => new Node(tag) };
  class Node {
    constructor(tag) { this.tagName = tag; this.ownerDocument = doc; this.children = []; this.listeners = new Map(); this.attributes = {}; this.value = ""; this.hidden = false; this.srcAssignments = []; }
    set src(value) { this._src = value; this.srcAssignments.push(value); }
    get src() { return this._src; }
    querySelector(selector) {
      if (selector === 'button[aria-pressed="true"]') return this.children.find(node => node.tagName === "button" && node.attributes["aria-pressed"] === "true") || null;
      if (selector === "button:not(:disabled)") return this.children.find(node => node.tagName === "button" && !node.disabled) || null;
      if (!nodes.has(selector)) nodes.set(selector, new Node(selector)); return nodes.get(selector);
    }
    addEventListener(name, fn) { const list = this.listeners.get(name) || []; list.push(fn); this.listeners.set(name, list); }
    fire(name, extra = {}) { for (const fn of this.listeners.get(name) || []) fn({ target: this, ...extra }); }
    click() { this.fire("click"); }
    setAttribute(key, value) { this.attributes[key] = value; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    focus() { doc.activeElement = this; }
  }
  const root = new Node("root"); let images = [], uploadOptions;
  const controller = bindRefinedLightingControls({ root, storageKey, ...options, onChange: value => changes.push(value), bindUpload(options) {
    uploadOptions = options; return { images: () => images.slice(), render() {}, clear({ notify = true } = {}) {
      images = []; if (notify) options.onChange({ images });
    } };
  } });
  controller.setAvailability(config); controller.setModels([multi]);
  return { controller, changes, root, doc, node: selector => root.querySelector(selector),
    upload(value) { images = value; uploadOptions.onChange({ images }); }, uploadEnabled: () => uploadOptions.isEnabled(),
    cards: () => root.querySelector("[data-lighting-grid]").children,
    choose(index = 0) {
      if (root.querySelector("[data-lighting-grid]").hidden) root.querySelector("[data-lighting-toggle]").click();
      root.querySelector("[data-lighting-grid]").children[index].click();
    } };
}

test("仅保存有效光影身份，旧原始模式迁移为未选并剥离参数和图片", () => {
  assert.deepEqual(normalizeRefinedLighting(), { mode: "unselected" });
  assert.deepEqual(normalizeRefinedLighting({ mode: "original", time: "night", presetId: "x", referenceImages: [reference] }), { mode: "unselected" });
  assert.deepEqual(normalizeRefinedLighting({ ...selection, prompt: "private", image: reference }), selection);
  const legacy = { ...selection }; delete legacy.execution;
  assert.deepEqual(normalizeRefinedLighting(legacy), selection);
  assert.deepEqual(normalizeRefinedLighting(combinedSelection), combinedSelection);
  assert.equal(usesRefinedLightingReferencePrompt(selection), false);
  assert.equal(usesRefinedLightingReferencePrompt(combinedSelection), true);
  assert.equal(usesRefinedLightingReferencePrompt({ mode: "reference" }), true);
  assert.deepEqual(normalizeRefinedLighting({ mode: "reference", ...referenceRule, image: reference }), { mode: "reference", ...referenceRule });
  for (const value of [null, [], { mode: "night" }, { mode: "preset", version: 0 },
    { ...selection, execution: "image-reference" }, { ...selection, execution: null },
    { ...legacy, referenceSha256: "0".repeat(64) }]) assert.throws(() => normalizeRefinedLighting(value));
});

test("多光影草稿去重并只保存身份，相同ID的冲突版本不静默合并", () => {
  const value = normalizeRefinedLighting({ ...selection,
    presets: [{ ...identityOf(preset), name: "不保存名称", image: reference }, identityOf(nightPreset), identityOf(preset)] });
  assert.deepEqual(value.presets, [identityOf(preset), identityOf(nightPreset)]);
  assert.deepEqual(normalizeRefinedLighting({ ...selection, presets: [identityOf(nightPreset)] }), {
    ...selection, ...identityOf(nightPreset),
  });
  assert.throws(() => normalizeRefinedLighting({ ...selection, presets: [identityOf(preset), { ...identityOf(preset), version: 99 }] }), /版本不一致/);
  for (const presets of [[], null, [null], [{ presetId: "missing" }]]) {
    assert.throws(() => normalizeRefinedLighting({ ...selection, presets }));
  }
});

test("精模开启多光影后可连续点选，减到单张更新主项，全部取消后不能生成", () => {
  const f = fixture(null, { allowMultiplePresets: true });
  f.controller.setAvailability(multiPresetConfig);
  f.choose(0); assert.equal(f.node("[data-lighting-grid]").hidden, false);
  f.choose(1);
  assert.deepEqual(f.controller.value().presets, [identityOf(preset), identityOf(nightPreset)]);
  assert.deepEqual(f.cards().map(card => card.attributes["aria-pressed"]), ["true", "true", "false"]);
  assert.equal(f.doc.activeElement, f.cards()[1]);
  assert.equal(f.node("[data-lighting-selected-name]").textContent, "2 种光影");
  assert.deepEqual(f.cards().map(card => card.children[2].hidden), [false, false, true]);
  assert.deepEqual(f.cards().map(card => card.children[1].textContent), [preset.name, nightPreset.name, filmPreset.name]);
  assert.deepEqual(f.controller.selections().map(item => [item.presetId, item.presetName]), [[preset.id, preset.name], [nightPreset.id, nightPreset.name]]);
  f.choose(0);
  assert.deepEqual(f.cards().map(card => card.children[2].hidden), [true, false, true]);
  assert.equal(f.controller.value().presetId, nightPreset.id);
  assert.equal(f.controller.value().presets, undefined);
  assert.equal(f.controller.selections()[0].presetId, nightPreset.id);
  f.choose(1);
  assert.deepEqual(f.controller.value(), { mode: "unselected" });
  assert.deepEqual(f.controller.selections(), []);
  assert.equal(f.controller.isAvailable([multi]), false);
});

test("多光影共享执行方式并逐卡核验版本，配置变更不自动丢掉已选项", () => {
  const f = fixture(null, { allowMultiplePresets: true }); f.controller.setAvailability(multiPresetConfig);
  f.choose(0); f.choose(1);
  f.node('[data-lighting-execution="prompt-and-reference"]').click();
  assert.equal(f.controller.selections().length, 4);
  assert.deepEqual(f.controller.selections().map(item => item.ruleVersion), [rule.ruleVersion, referenceRule.ruleVersion, rule.ruleVersion, referenceRule.ruleVersion]);
  const stale = f.cards()[1], before = f.controller.value();
  f.controller.setAvailability({ ...multiPresetConfig, presets: [preset, { ...nightPreset, version: 4 }, filmPreset] });
  assert.deepEqual(f.controller.value(), before);
  assert.match(f.controller.validation(), /已更新或下架/);
  stale.click(); assert.deepEqual(f.controller.value(), before);
  f.choose(1); assert.equal(f.controller.validation(), null);
  assert.equal(f.controller.selections().find(item => item.presetId === nightPreset.id).version, 4);
});

test("显式重选有效卡片才清理下架ID，保留其他有效光影与执行方式", () => {
  const f = fixture(null, { allowMultiplePresets: true });
  f.controller.setAvailability(multiPresetConfig);
  const retired = { ...preset, id: "preset-soft-retired", version: 1, sha256: "0".repeat(64) };
  const executions = ["prompt-only", "prompt-and-reference"];
  f.controller.setValue({ ...selection, ...identityOf(retired),
    presets: [identityOf(retired), identityOf(nightPreset)], executions });
  const restored = f.controller.value();
  assert.deepEqual(restored.presets, [identityOf(retired), identityOf(nightPreset)]);
  assert.match(f.controller.validation(), /已更新或下架/);
  f.controller.setAvailability({ ...multiPresetConfig });
  assert.deepEqual(f.controller.value(), restored, "刷新目录不静默迁移旧冻结身份");
  assert.match(f.controller.validation(), /已更新或下架/);

  f.choose(0);
  const selected = f.controller.value();
  assert.deepEqual(selected.presets, [identityOf(nightPreset), identityOf(preset)]);
  assert.deepEqual(selected.executions, executions);
  assert.equal(selected.execution, restored.execution);
  assert.equal(f.controller.validation(), null);
  assert.equal(f.controller.selections().length, 4);
  assert.deepEqual(f.controller.selections().map(item => [item.presetId, item.execution]), [
    [nightPreset.id, executions[0]], [nightPreset.id, executions[1]],
    [preset.id, executions[0]], [preset.id, executions[1]],
  ]);
  assert.doesNotMatch(JSON.stringify(f.controller.requestFields()), /preset-soft-retired/);
});

test("选卡与切换方式复用图卡和预览请求，只有新目录才替换图卡", () => {
  const f = fixture(null, { allowMultiplePresets: true });
  f.controller.setAvailability(multiPresetConfig);
  const cards = [...f.cards()], images = cards.map(card => card.children[0]);
  f.choose(0); f.choose(1);
  f.node('[data-lighting-execution="prompt-and-reference"]').click();
  f.controller.setModels([multi]);
  f.controller.setAvailability({ ...multiPresetConfig });
  for (let i = 0; i < cards.length; i++) {
    assert.equal(f.cards()[i], cards[i]);
    assert.equal(f.cards()[i].children[0], images[i]);
    assert.equal(images[i].srcAssignments.length, 1);
  }
  assert.equal(f.node("[data-lighting-selected-preview]").srcAssignments.length, 1);
  assert.deepEqual(f.cards().map(card => card.attributes["aria-pressed"]), ["true", "true", "false"]);
  f.choose(1);
  assert.equal(f.controller.value().presetId, preset.id, "保留节点后的点击仍按当前状态取消选择");
  const before = f.controller.value();
  f.controller.setAvailability({ ...multiPresetConfig, presets: [{ ...preset, version: 99 }] });
  assert.notEqual(f.cards()[0], cards[0]);
  cards[1].click();
  assert.deepEqual(f.controller.value(), before, "旧节点事件不能覆盖当前版本身份");
});

test("预览失败仅自动重试一次，手动重试保留身份且不代替选卡", () => {
  const f = fixture(), card = f.cards()[0], image = card.children[0];
  const originalUrl = image.src;
  image.fire("error");
  assert.equal(image.srcAssignments.length, 2);
  const retryUrl = new URL(image.src, "https://canvas.test");
  const initialUrl = new URL(originalUrl, "https://canvas.test");
  for (const key of ["id", "version", "sha256"]) assert.equal(retryUrl.searchParams.get(key), initialUrl.searchParams.get(key));
  assert.equal(retryUrl.searchParams.get("previewRetry"), "1");
  image.fire("error"); image.fire("error");
  assert.equal(image.srcAssignments.length, 2, "持续失败或404不会无限重试或回退旧图");
  assert.equal(image.attributes["data-preview-failed"], "true");
  assert.match(card.children[1].textContent, /预览失败，点击重试/);
  f.choose();
  assert.equal(image.srcAssignments.length, 3);
  assert.match(image.src, /previewRetry=2$/);
  assert.deepEqual(f.controller.value(), { mode: "unselected" }, "显式重试只取预览，不修改光影或触发生图");
  image.fire("error");
  assert.equal(image.srcAssignments.length, 3, "一次用户重试只有一次请求");
  image.fire("load");
  assert.equal(image.attributes["data-preview-failed"], "false");
  assert.equal(card.children[1].textContent, preset.name);
  f.choose(); assert.deepEqual(f.controller.value(), selection);
});

test("选择入口预览同样有限重试，手动重试仍可打开图库且不改草稿", () => {
  const f = fixture(); f.choose();
  const image = f.node("[data-lighting-selected-preview]"), before = f.controller.value();
  image.fire("error"); image.fire("error");
  assert.equal(image.srcAssignments.length, 2);
  assert.match(f.node("[data-lighting-selected-name]").textContent, /预览失败，点击重试/);
  f.node("[data-lighting-toggle]").click();
  assert.equal(image.srcAssignments.length, 3);
  assert.equal(f.node("[data-lighting-grid]").hidden, false);
  assert.deepEqual(f.controller.value(), before);
  image.fire("load");
  assert.equal(f.node("[data-lighting-selected-name]").textContent, preset.name);
});

test("上传成功替换整组光影，取消上传不清选择，删图不复活旧组", () => {
  const f = fixture(null, { allowMultiplePresets: true }); f.controller.setAvailability(multiPresetConfig);
  f.choose(0); f.choose(1); const before = f.controller.value();
  f.upload([]); assert.deepEqual(f.controller.value(), before);
  f.upload([reference]);
  assert.deepEqual(f.controller.value(), { mode: "reference", ...referenceRule });
  assert.equal(f.controller.selections().length, 1);
  assert.equal(f.node("[data-lighting-toggle]").disabled, true);
  assert.ok(f.cards().every(card => card.disabled));
  f.upload([]);
  assert.deepEqual(f.controller.value(), { mode: "unselected" });
  assert.deepEqual(f.controller.selections(), []);
  assert.equal(f.node("[data-lighting-toggle]").disabled, false);
});

test("多光影草稿刷新后恢复选择，旧运行态阻断整组，其他功能保持单选", t => {
  const previousStorage = globalThis.sessionStorage; t.after(() => { globalThis.sessionStorage = previousStorage; });
  let saved = null; globalThis.sessionStorage = { getItem: () => saved, setItem(_key, value) { saved = value; } };
  const f = fixture("multi-lighting", { allowMultiplePresets: true }); f.controller.setAvailability(multiPresetConfig);
  f.choose(0); f.choose(1);
  assert.doesNotMatch(saved, /data:image|不保存名称/);
  const restored = fixture("multi-lighting", { allowMultiplePresets: true });
  assert.equal(restored.controller.value().presets.length, 2);
  assert.match(restored.controller.validation(), /当前服务不支持多光影/);
  restored.controller.setAvailability(multiPresetConfig); assert.equal(restored.controller.validation(), null);
  restored.node("[data-lighting-grid]").fire("keydown", { key: "Escape", preventDefault() {} });
  assert.equal(restored.node("[data-lighting-grid]").hidden, true);
  const singleFeature = fixture(); singleFeature.controller.setAvailability(multiPresetConfig);
  singleFeature.choose(0); singleFeature.choose(1);
  assert.equal(singleFeature.controller.value().presetId, nightPreset.id);
  assert.equal(singleFeature.controller.value().presets, undefined);
  assert.equal(singleFeature.node("[data-lighting-grid]").hidden, true);
});

test("主工作台恢复旧原始或损坏草稿不会默认套卡，须重新选择且不恢复图片", (t) => {
  const previousStorage = globalThis.sessionStorage;
  t.after(() => { globalThis.sessionStorage = previousStorage; });
  for (const saved of [JSON.stringify({ mode: "original", referenceImages: [reference] }), "{broken"]) {
    globalThis.sessionStorage = { getItem: () => saved, setItem() {} };
    const f = fixture("canvas-lab.refined-lighting");
    assert.deepEqual(f.controller.value(), { mode: "unselected" });
    assert.deepEqual(f.controller.requestFields(), { refinedLighting: null });
    assert.equal(f.controller.isAvailable([multi]), false);
    assert.match(f.controller.validation(), /选择光影预设/);
  }
});

test("主工作台旧预设草稿默认为仅提示词，新双图方式轻量保存并恢复同一卡片", t => {
  const previousStorage = globalThis.sessionStorage;
  t.after(() => { globalThis.sessionStorage = previousStorage; });
  const legacy = { ...selection }; delete legacy.execution;
  let saved = JSON.stringify(legacy);
  globalThis.sessionStorage = { getItem: () => saved, setItem(key, value) { saved = value; } };
  const f = fixture("canvas-lab.refined-lighting");
  assert.deepEqual(f.controller.value(), selection);
  f.node('[data-lighting-execution="prompt-and-reference"]').click();
  assert.deepEqual(JSON.parse(saved), combinedSelection);
  const restored = fixture("canvas-lab.refined-lighting");
  assert.deepEqual(restored.controller.value(), combinedSelection);
  assert.deepEqual(restored.controller.requestFields(), { refinedLighting: combinedSelection });
});

test("光影必须选择有效来源，预设提示词支持单图模型并阻断资产漂移", () => {
  for (const value of [null, { mode: "original" }, { mode: "unselected" }]) {
    assert.match(refinedLightingValidation(value, {}, [single]), /请选择光影预设/);
  }
  assert.equal(refinedLightingValidation(selection, config, [multi]), null);
  assert.equal(refinedLightingValidation(selection, config, [multi, single]), null);
  assert.match(refinedLightingValidation(selection, { ...config, promptAvailable: undefined }, [multi]), /光影提示词规则不可用/);
  assert.match(refinedLightingValidation({ ...selection, sha256: "old" }, config, [multi]), /已更新或下架/);
  assert.match(refinedLightingValidation(selection, { ...config, ruleSha256: "new" }, [multi]), /规则已更新/);
  assert.match(refinedLightingValidation({ mode: "reference", ...referenceRule }, config, [multi], 0), /重新上传/);
  assert.equal(refinedLightingValidation({ mode: "reference", ...referenceRule }, config, [multi], 1), null);
  assert.match(refinedLightingValidation({ mode: "reference", ...referenceRule }, config, [single], 1), /Flux.*不支持双图/);
  assert.match(refinedLightingValidation({ mode: "reference", ...rule }, config, [multi], 1), /参考规则已更新/);
  assert.equal(refinedLightingValidation({ mode: "reference", ...referenceRule }, { ...config, available: false, promptAvailable: false }, [multi], 1), null);
  assert.equal(refinedLightingValidation(selection, { ...config, referenceAvailable: false }, [single]), null);
  assert.equal(refinedLightingValidation(combinedSelection, config, [multi]), null);
  assert.match(refinedLightingValidation({ ...combinedSelection, ...rule }, config, [multi]), /参考规则已更新/);
  assert.equal(refinedLightingValidation(combinedSelection, { ...config, promptAvailable: false, ruleVersion: undefined, ruleSha256: undefined }, [multi]), null);
  assert.match(refinedLightingValidation(combinedSelection, { ...config, referenceAvailable: false }, [multi]), /参考规则不可用/);
  assert.match(refinedLightingValidation(combinedSelection, config, [single]), /Flux.*不支持双图/);
  assert.match(refinedLightingValidation(combinedSelection, { ...config, presetExecutions: undefined }, [multi]), /服务不支持/);
  assert.equal(refinedLightingValidation(selection, { ...config, presetExecutions: undefined }, [single]), null);
});

test("图卡默认收在选择入口，栏内三列展开，选后以缩略图名称收起并归还焦点", async () => {
  const f = fixture();
  assert.deepEqual(f.controller.value(), { mode: "unselected" });
  assert.match(f.controller.validation(), /请选择光影预设/);
  assert.deepEqual(f.controller.requestFields(), { refinedLighting: null });
  assert.doesNotMatch(f.root.innerHTML, /data-lighting-original|原始光影|data-lighting-library|data-lighting-upload(?:\s|>)|data-lighting-dialog|data-lighting-picker(?:\s|>)|data-lighting-source|飞书维护|data-lighting-status|data-lighting-clear|清除光影预设/);
  assert.match(f.root.innerHTML, /data-lighting-reference[\s\S]*光影参考图[\s\S]*最多1张[\s\S]*data-lighting-drop[\s\S]*data-lighting-preset-section[\s\S]*光影选择[\s\S]*data-lighting-grid/);
  assert.equal(f.node("[data-lighting-reference]").hidden, false);
  assert.equal(f.node("[data-lighting-grid]").hidden, true);
  assert.equal(f.node("[data-lighting-toggle]").attributes["aria-expanded"], "false");
  assert.equal(f.node("[data-lighting-selected-name]").textContent, "选择光影模板");
  f.node("[data-lighting-toggle]").click();
  assert.equal(f.node("[data-lighting-grid]").hidden, false);
  assert.equal(f.node("[data-lighting-toggle]").attributes["aria-expanded"], "true");
  f.node("[data-lighting-grid]").fire("keydown", { key: "Escape", preventDefault() {} });
  assert.equal(f.node("[data-lighting-grid]").hidden, true);
  assert.equal(f.doc.activeElement, f.node("[data-lighting-toggle]"));
  const ten = [preset, ...Array.from({ length: 9 }, (_, i) => ({ ...preset, id: `card-${i}`, name: `光影${i + 1}` }))];
  f.controller.setAvailability({ ...config, presets: ten });
  assert.equal(f.cards().length, 10);
  assert.equal(f.node("[data-lighting-availability]").textContent, "10 个预设");
  assert.ok(f.cards().every(card => card.children.length === 3 && card.children[0].tagName === "img" && card.children[1].tagName === "span"));
  assert.ok(f.cards().every(card => card.children[2].className === "refined-lighting-check" && card.children[2].hidden));
  assert.ok(f.cards().every(card => card.attributes["aria-pressed"] === "false"));
  assert.match(f.cards()[0].children[0].src, /\/api\/refined-lighting\/preview\?id=preset-soft&version=2&sha256=b{64}$/);
  assert.equal(f.cards()[0].children[1].textContent, preset.name);
  f.choose();
  assert.deepEqual(f.controller.value(), selection); assert.equal(f.controller.validation(), null);
  f.controller.setModels([single]); assert.equal(f.controller.validation(), null);
  assert.deepEqual(f.controller.requestFields(), { refinedLighting: selection });
  assert.equal(f.cards()[0].attributes["aria-pressed"], "true");
  assert.equal(f.cards()[0].children[1].textContent, preset.name);
  assert.equal(f.cards()[0].children[2].hidden, false);
  assert.equal(f.node("[data-lighting-grid]").hidden, true);
  assert.equal(f.node("[data-lighting-toggle]").attributes["aria-expanded"], "false");
  assert.equal(f.doc.activeElement, f.node("[data-lighting-toggle]"));
  assert.equal(f.node("[data-lighting-selected-name]").textContent, preset.name);
  assert.equal(f.node("[data-lighting-selected-preview]").hidden, false);
  assert.match(f.node("[data-lighting-selected-preview]").src, /id=preset-soft&version=2&sha256=b{64}$/);
  assert.equal(f.node("[data-lighting-input]").disabled, false, "选预设后仍允许上传替换来源");
  assert.match(f.root.innerHTML, /data-lighting-grid[^>]*hidden><\/div>\s*<div data-lighting-execution-field/, "渲染方式位于折叠面板外");
  const refresh = fixture(null, { withConfigRefresh: true });
  assert.match(refresh.root.innerHTML, /data-config-refresh/);
  assert.doesNotMatch(f.root.innerHTML, /data-config-refresh/, "Beta无全局刷新处理器时不渲染死按钮");
  const css = await readFile(new URL("../public/refined-lighting-controls.css", import.meta.url), "utf8");
  assert.match(css, /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.doesNotMatch(css, /\[aria-pressed="true"\][^{]*\{[^}]*(?:border|outline|box-shadow|background)/s);
  assert.doesNotMatch(css, /\[aria-checked="true"\][^{]*\{[^}]*(?:border|outline|box-shadow|background)/s);
});

test("同一预设切换两种渲染方式保持卡片和模型，键盘可操作且不向浏览器复制卡图", () => {
  const f = fixture();
  const only = f.node('[data-lighting-execution="prompt-only"]');
  const combined = f.node('[data-lighting-execution="prompt-and-reference"]');
  assert.equal(f.node("[data-lighting-execution-field]").hidden, true);
  f.choose();
  assert.equal(f.node("[data-lighting-execution-field]").hidden, false);
  assert.equal(only.attributes["aria-checked"], "true");
  combined.click();
  assert.deepEqual(f.controller.value(), combinedSelection);
  assert.deepEqual(f.controller.requestFields(), { refinedLighting: combinedSelection });
  assert.equal(f.cards()[0].attributes["aria-pressed"], "true");
  assert.deepEqual(f.controller.referenceImages(), []);
  assert.equal(f.node("[data-lighting-input]").disabled, false);
  f.controller.setModels([single]);
  assert.match(f.controller.validation(), /Flux.*不支持双图/);
  assert.deepEqual(f.controller.value(), combinedSelection, "单图模型仍保留原选择，明确阻断");
  only.fire("keydown", { key: "End", preventDefault() {} });
  assert.equal(f.doc.activeElement, combined);
  combined.fire("keydown", { key: "Home", preventDefault() {} });
  assert.deepEqual(f.controller.value(), selection);
  assert.equal(f.controller.validation(), null);
  assert.equal(f.doc.activeElement, only);
  assert.equal(only.attributes["aria-checked"], "true");
});

test("氛围词加图使用独立前置版本，三按钮键盘切换且旧服务不能偷跑", () => {
  const f = fixture(); f.choose();
  const hybrid = f.node('[data-lighting-execution="prompt-with-reference"]');
  hybrid.click();
  assert.deepEqual(f.controller.value(), selection, "旧服务未声明新方式时不能提交");
  f.controller.setAvailability({ ...config, presetExecutions: [...config.presetExecutions, "prompt-with-reference"] });
  hybrid.click();
  const expected = { ...selection, execution: "prompt-with-reference", ...hybridRule };
  assert.deepEqual(f.controller.value(), expected);
  assert.equal(usesRefinedLightingReferencePrompt(expected), false, "双图输入不等于迁移Prompt");
  assert.equal(f.controller.validation(), null);
  const request = buildGenerationInput({ featureMode: "refinedModel", model: { ...multi, qualityOptions: [] }, referenceImages: [source],
    promptVersion: 2, refinedLighting: expected, ratio: "1:1", resolution: "1K", prompt: { refined: "USER" }, renderMode: {} });
  assert.equal(request.promptVersion, 4, "第三种模式只投影自己的前置版本");
  assert.equal("lightingReferenceImages" in request, false, "卡图仅由服务端读取");
  assert.match(generationLoadingCopy({ refinedModelRequest: true, refinedLighting: expected }), /图序前置词、氛围词与预设参考图/);
  f.controller.setModels([single]); assert.match(f.controller.validation(), /不支持双图/);
  f.controller.setModels([multi]);
  hybrid.fire("keydown", { key: "Home", preventDefault() {} });
  assert.deepEqual(f.controller.value(), selection);
  f.node('[data-lighting-execution="prompt-only"]').fire("keydown", { key: "End", preventDefault() {} });
  assert.equal(f.doc.activeElement, hybrid);
  assert.deepEqual(f.controller.value(), expected);
  hybrid.fire("keydown", { key: "ArrowLeft", preventDefault() {} });
  assert.deepEqual(f.controller.value(), combinedSelection);
  assert.match(f.root.innerHTML, />参考图迁移<span.*[\s\S]*>氛围词＋参考图<span/);
});

test("三种渲染方式独立勾选、身份逐模式分流，空选阻断且上传退出对比", () => {
  const f = fixture();
  f.controller.setAvailability({ ...config, multiplePresetExecutions: true,
    presetExecutions: ["prompt-only", "prompt-and-reference", "prompt-with-reference"] });
  f.choose();
  const button = execution => f.node(`[data-lighting-execution="${execution}"]`);
  button("prompt-and-reference").click(); button("prompt-with-reference").click();
  const value = f.controller.value();
  assert.deepEqual(value.executions, ["prompt-only", "prompt-and-reference", "prompt-with-reference"]);
  assert.deepEqual(f.controller.selections().map(x => [x.execution, x.ruleVersion]),
    [["prompt-only", 1], ["prompt-and-reference", 3], ["prompt-with-reference", 4]]);
  assert.ok(f.controller.selections().every(x => !Object.hasOwn(x, "executions")));
  assert.equal(usesRefinedLightingReferencePrompt(value), false);
  assert.equal(f.controller.validation(), null);
  assert.doesNotMatch(f.root.innerHTML, /data-lighting-execution-count|已选.*种/);
  assert.equal((f.root.innerHTML.match(/class="refined-lighting-execution-check" aria-hidden="true"/g) || []).length, 3);
  for (const mode of value.executions) {
    assert.equal(button(mode).attributes.role, "checkbox");
    assert.equal(button(mode).attributes["aria-checked"], "true");
  }
  button("prompt-with-reference").fire("keydown", { key: "ArrowLeft", preventDefault() {} });
  assert.deepEqual(f.controller.value(), value, "方向键仅移动复选框焦点，不改变已选模式");
  f.choose(); assert.deepEqual(f.controller.value(), value, "重新选卡保留模式组合");
  assert.deepEqual(normalizeRefinedLighting(JSON.parse(JSON.stringify(value))), value, "草稿完整恢复多选");
  f.controller.setModels([single]); assert.match(f.controller.validation(), /不支持双图/);
  f.controller.setModels([multi]);
  for (const mode of value.executions) button(mode).click();
  assert.match(f.controller.validation(), /至少一种/);
  assert.equal(f.controller.selections().length, 0);
  button("prompt-only").click(); assert.equal(f.controller.validation(), null);
  f.upload([reference]);
  assert.equal(f.controller.value().mode, "reference");
  assert.equal(f.controller.value().executions, undefined);
  assert.equal(f.controller.selections().length, 1);
});

test("旧服务只兼容纯提示词，已存双图预设不静默降级并可主动恢复", () => {
  const f = fixture();
  f.controller.setAvailability({ ...config, presetExecutions: undefined });
  f.choose();
  assert.deepEqual(f.controller.value(), selection);
  assert.equal(f.node("[data-lighting-execution-field]").hidden, true);
  const combined = f.node('[data-lighting-execution="prompt-and-reference"]');
  combined.click(); assert.deepEqual(f.controller.value(), selection);
  f.controller.setValue(combinedSelection);
  assert.deepEqual(f.controller.value(), combinedSelection);
  assert.equal(f.node("[data-lighting-execution-field]").hidden, false);
  assert.equal(combined.disabled, true);
  assert.match(f.controller.validation(), /服务不支持/);
  f.node('[data-lighting-execution="prompt-only"]').click();
  assert.deepEqual(f.controller.value(), selection);
  assert.equal(f.controller.validation(), null);
});

test("仅迁移规则可用时卡片仍可选，默认纯词明确报错，显式切图文才绑定专用规则", () => {
  const f = fixture();
  f.controller.setAvailability({ ...config, promptAvailable: false, ruleVersion: undefined, ruleSha256: undefined,
    presetExecutions: ["prompt-and-reference"] });
  assert.equal(f.cards()[0].disabled, false);
  f.choose();
  assert.equal(f.controller.value().execution, "prompt-only", "不能静默改成图文");
  assert.match(f.controller.validation(), /不支持所选渲染方式/);
  assert.equal(f.node('[data-lighting-execution="prompt-and-reference"]').tabIndex, 0, "默认纯词不可用时键盘仍可进入可用图文选项");
  f.node('[data-lighting-execution="prompt-and-reference"]').click();
  assert.deepEqual(f.controller.value(), combinedSelection);
  assert.equal(f.controller.validation(), null);
  assert.deepEqual(f.controller.requestFields(), { refinedLighting: combinedSelection });
  f.controller.setAvailability(config);
  f.node('[data-lighting-execution="prompt-only"]').click();
  assert.deepEqual(f.controller.value(), selection, "切回纯词重新绑定文字rule");
  f.node('[data-lighting-execution="prompt-and-reference"]').click();
  f.choose();
  assert.deepEqual(f.controller.value(), combinedSelection, "图文模式换卡保持专用rule");
});

test("上传参考恢复须重传，无图草稿不锁卡片，旧三字段与原始模式恢复未选", () => {
  const f = fixture(); f.controller.setValue({ mode: "reference", ...referenceRule });
  assert.deepEqual(f.controller.value(), { mode: "reference", ...referenceRule });
  assert.match(f.controller.validation(), /重新上传/);
  assert.equal(f.node("[data-lighting-reference]").hidden, false);
  assert.equal(f.cards()[0].disabled, false, "没有实际图片的恢复草稿不锁定预设");
  f.choose(); assert.deepEqual(f.controller.value(), selection);
  f.controller.setValue({ preset: "night", time: "night", weather: "clear", tone: "warm" });
  assert.deepEqual(f.controller.value(), { mode: "unselected" });
  f.controller.setValue({ mode: "original" });
  assert.deepEqual(f.controller.value(), { mode: "unselected" });
  assert.match(f.controller.validation(), /请选择光影预设/);
  f.controller.setAvailability({ ...config, presets: [] }); assert.equal(f.cards().length, 0);
  f.controller.setAvailability({ ...config, available: false, promptAvailable: false, referenceAvailable: false, hybridAvailable: false, reason: "提示词读取失败" });
  assert.equal(f.cards()[0].disabled, true);
  f.choose(); assert.deepEqual(f.controller.value(), { mode: "unselected" });
});

test("预设下架不自动套新卡，失效选择仍可改选或上传替换，旧事件不能覆盖新资产", () => {
  const f = fixture(); const stale = f.cards()[0]; f.choose();
  f.controller.setAvailability({ ...config, presets: [{ ...preset, id: "remaining", name: "剩余用户模板" }] });
  assert.deepEqual(f.controller.value(), selection);
  assert.match(f.controller.validation(), /已更新或下架/);
  assert.equal(f.node("[data-lighting-selected-name]").textContent, "重新选择光影模板");
  assert.equal(f.cards().length, 1, "不虚构失效占位卡片");
  assert.equal(f.cards()[0].attributes["aria-pressed"], "false");
  stale.click(); assert.deepEqual(f.controller.value(), selection, "残留旧卡片必须校验当前资产身份");
  f.choose(); assert.equal(f.controller.value().presetId, "remaining");
  assert.equal(f.node("[data-lighting-input]").disabled, false);
  f.upload([reference]); assert.equal(f.controller.value().mode, "reference");
  f.upload([]); assert.deepEqual(f.controller.value(), { mode: "unselected" });
  f.controller.setValue(selection); f.controller.setAvailability({ ...config, presets: [] });
  assert.equal(f.node("[data-lighting-input]").disabled, false);
  f.upload([reference]); assert.equal(f.controller.value().mode, "reference", "没有卡片时仍可直接上传替换");
});

test("预设始终可上传替换，成功上传关闭并锁模板，删图回未选且不复选旧模板", () => {
  const f = fixture();
  assert.equal(f.cards()[0].disabled, false);
  assert.equal(f.node("[data-lighting-input]").disabled, false);
  f.choose();
  assert.equal(f.node("[data-lighting-input]").disabled, false);
  assert.equal(f.uploadEnabled(), true);
  f.upload([]); assert.deepEqual(f.controller.value(), selection);
  f.node("[data-lighting-toggle]").click();
  assert.equal(f.node("[data-lighting-grid]").hidden, false);
  const stale = f.cards()[0];
  f.upload([reference]);
  assert.deepEqual(f.controller.value(), { mode: "reference", ...referenceRule });
  assert.deepEqual(f.controller.referenceImages(), [reference]);
  assert.deepEqual(f.controller.requestFields().lightingReferenceImages, [reference]);
  assert.equal(f.controller.validation(), null);
  assert.equal(f.node("[data-lighting-toggle]").disabled, true);
  assert.equal(f.node("[data-lighting-grid]").hidden, true);
  assert.equal(f.node("[data-lighting-execution-field]").hidden, true);
  assert.equal(f.cards()[0].disabled, true);
  f.node("[data-lighting-toggle]").click();
  assert.equal(f.node("[data-lighting-grid]").hidden, true);
  stale.click(); assert.equal(f.controller.value().mode, "reference", "旧卡片事件不能覆盖已上传参考图");
  f.choose(); assert.equal(f.controller.value().mode, "reference", "禁用卡片事件也不能覆盖上传来源");
  f.controller.setModels([single]); assert.match(f.controller.validation(), /不支持双图/);
  assert.equal(f.node("[data-lighting-error]").hidden, false, "保留真实校验报错，不显示常驻说明");
  f.upload([]);
  assert.deepEqual(f.controller.value(), { mode: "unselected" });
  assert.equal(f.node("[data-lighting-toggle]").disabled, false);
  assert.equal(f.node("[data-lighting-selected-preview]").hidden, true);
  assert.equal(f.node("[data-lighting-grid]").hidden, true);
  assert.equal(f.cards()[0].disabled, false);
  assert.equal(f.node("[data-lighting-input]").disabled, false);
  f.choose(); assert.deepEqual(f.controller.requestFields(), { refinedLighting: selection });
  assert.equal(f.controller.validation(), null, "单图模型可使用预设提示词");
  assert.deepEqual(f.controller.referenceImages(), []);
  f.controller.setModels([multi]); f.upload([reference]); f.upload([]);
  assert.deepEqual(f.controller.value(), { mode: "unselected" });
});

test("精模预设不带氛围图，上传路径共享一次参考图，其他功能不泄漏", () => {
  const models = publicModelCatalog().filter(model => model.maxReferenceImages >= 2).slice(0, 2);
  const values = { featureMode: "refinedModel", model: models[0], referenceImages: [source], lightingReferenceImages: [reference],
    refinedLighting: selection, refinedRender: { time: "night" }, refinedAtmospherePromptVersion: 13,
    prompt: { free: "free", refined: "quality" }, renderMode: {}, ratio: "1:1", resolution: "1K" };
  const input = buildGenerationInput(values); assert.equal("refinedRender" in input, false); assert.equal("refinedAtmospherePromptVersion" in input, false);
  assert.equal("lightingReferenceImages" in input, false);
  const combinedInput = buildGenerationInput({ ...values, refinedLighting: combinedSelection });
  assert.deepEqual(combinedInput.refinedLighting, combinedSelection);
  assert.equal(combinedInput.promptVersion, referenceRule.ruleVersion);
  assert.equal("lightingReferenceImages" in combinedInput, false, "预设原始卡图由服务端读取");
  const referenceInput = buildGenerationInput({ ...values, promptVersion: 12, promptCode: "refined-lighting-base", refinedPromptSha256: "private-base-sha",
    refinedLighting: { mode: "reference", ...referenceRule } });
  assert.equal(referenceInput.promptVersion, referenceRule.ruleVersion);
  assert.equal("promptCode" in referenceInput, false);
  assert.equal("refinedPromptSha256" in referenceInput, false);
  const job = buildGenerationJobRequest({ baseInput: referenceInput, featureMode: "refinedModel", models });
  assert.deepEqual(job.sharedInput.referenceImages, [source]);
  assert.deepEqual(job.sharedInput.lightingReferenceImages, [reference]);
  assert.ok(job.items.every(item => !item.input.referenceImages && !item.input.lightingReferenceImages));
  for (const refinedLighting of [null, { mode: "original" }]) {
    const other = buildGenerationInput({ ...values, refinedLighting });
    assert.equal(other.refinedLighting, null); assert.equal("lightingReferenceImages" in other, false);
  }
  for (const featureMode of ["free", "whiteModel", "styleTransfer"]) {
    const other = buildGenerationInput({ ...values, featureMode }); assert.equal("refinedLighting" in other, false); assert.equal("lightingReferenceImages" in other, false);
  }
  assert.match(generationLoadingCopy({ refinedModelRequest: true, refinedLighting: selection }), /光影提示词/);
  assert.match(generationLoadingCopy({ refinedModelRequest: true, refinedLighting: combinedSelection }), /光影提示词与预设参考图/);
  assert.match(generationLoadingCopy({ refinedModelRequest: true, refinedLighting: { mode: "reference" } }), /参考上传图/);
});

test("主/Beta挂载共享光影来源，不再显示六组合效果层", async () => {
  for (const file of ["index.html", "beta.html"]) {
    const html = await readFile(new URL(`../public/${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(html, /refinedFinishSection|refinedFinishFields|refined-finish-controls/);
    assert.match(html, /refinedRender(?:Section|Fields)/);
    assert.match(html, /effectBeautification(?:Section|Fields)/);
  }
});

test("结果摘要明确区分两种新预设执行方式，上传图与旧历史不补造方式", () => {
  const summary = refinedLighting => resultMetadata({ refinedLighting,
    request: { size: "1024x1024", outputFormat: "png", referenceImageCount: 1 } });
  assert.match(summary({ ...selection, name: preset.name }), /光影预设：自然柔光.*仅提示词/);
  assert.match(summary({ ...combinedSelection, name: preset.name }), /光影预设：自然柔光.*参考图迁移/);
  assert.match(summary({ ...selection, execution: "prompt-with-reference", name: preset.name }), /光影预设：自然柔光.*氛围词＋参考图/);
  assert.match(summary({ mode: "reference", execution: "image-reference" }), /氛围参考图/);
  assert.doesNotMatch(summary({ mode: "reference", execution: "image-reference" }), /仅提示词|提示词＋参考图/);
  const legacy = { ...selection }; delete legacy.execution;
  assert.doesNotMatch(summary(legacy), /仅提示词|提示词＋参考图/);
});

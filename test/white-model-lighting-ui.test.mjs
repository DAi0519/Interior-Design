/**
 * [INPUT]: 依赖白模光影适配层、真实共享图卡、生成输入/批次请求/复用状态及内存DOM与sessionStorage
 * [OUTPUT]: 验证自动兼容旧服务、单选纯身份、能力与版本阻断、草稿/跨功能隔离、复用身份与后台请求冻结
 * [POS]: test 的主工作台白模可选纯词光影合同，不调用网络、飞书或生图模型
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { bindWhiteModelLighting, normalizeWhiteModelLighting, whiteModelLightingRequestFields } from "../public/white-model-lighting.js";
import { bindRefinedLightingControls } from "../public/refined-lighting-controls.js";
import { buildGenerationInput } from "../public/generation-input.js";
import { buildGenerationJobRequest, generationItemsForSelection } from "../public/generation-task-request.js";
import { generationActionState } from "../public/generation-actions.js";
import { createGenerationTask, readGenerationTasks, saveGenerationTask } from "../public/generation-task-state.js";
import { publicModelCatalog } from "../src/model-config.mjs";

const day = { id: "recDaylight", name: "晴窗树影", version: 5, sha256: "a".repeat(64) };
const night = { id: "recNight", name: "暖灯静夜", version: 5, sha256: "b".repeat(64) };
const identity = ({ id, version, sha256 }) => ({ presetId: id, version, sha256 });
const library = { available: false, promptAvailable: false, referenceAvailable: false, hybridAvailable: false, presets: [day, night] };
const capabilities = { whiteModel: { promptLighting: true } };
const source = { id: "source", dataUrl: "data:image/png;base64,AA==", name: "white.png", size: 1, type: "image/png", width: 1600, height: 900 };
const model = publicModelCatalog().find(item => item.key === "aiTextureEnhancement");
let storage, previousStorage;
test.beforeEach(() => {
  previousStorage = globalThis.sessionStorage;
  const values = new Map();
  storage = { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  globalThis.sessionStorage = storage;
});
test.afterEach(() => { globalThis.sessionStorage = previousStorage; });

function fixture() {
  const nodes = new Map(), changes = [];
  const doc = { activeElement: null, createElement: tag => new Node(tag) };
  class Node {
    constructor(tag) { this.tagName = tag; this.ownerDocument = doc; this.children = []; this.listeners = new Map(); this.attributes = {}; this.hidden = false;
      this.classes = new Set(); this.classList = { toggle: (name, active) => this.classes[active ? "add" : "delete"](name) }; }
    querySelector(selector) { if (!nodes.has(selector)) nodes.set(selector, new Node(selector)); return nodes.get(selector); }
    addEventListener(name, fn) { this.listeners.set(name, [...(this.listeners.get(name) || []), fn]); }
    click() { if (!this.disabled) for (const fn of this.listeners.get("click") || []) fn({ target: this }); }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    focus() { doc.activeElement = this; }
  }
  const root = new Node("root");
  const controller = bindWhiteModelLighting({ root, onChange: value => changes.push(value),
    bindControls: options => bindRefinedLightingControls({ ...options, bindUpload: () => ({ images: () => [], render() {}, clear() {} }) }) });
  return { root, controller, changes, node: selector => root.querySelector(selector),
    choose(index = 0) { if (root.querySelector("[data-lighting-grid]").hidden) root.querySelector("[data-lighting-toggle]").click();
      root.querySelector("[data-lighting-grid]").children[index].click(); } };
}
function input(value, featureMode = "whiteModel") {
  return buildGenerationInput({ featureMode, model, whiteModelLighting: value, referenceImages: [source], styleReferenceImages: [source],
    prompt: { free: "保留原开口", refined: "其他精模要求" }, renderMode: { mode: "smart-default", agentVersion: 2 },
    ratio: "source", ratioMode: "auto", resolution: "2K", promptAgentVersion: 2 });
}

test("白模光影身份仅允许单卡三字段，自动与其他功能兼容旧请求", () => {
  assert.equal(normalizeWhiteModelLighting(), null);
  assert.deepEqual(normalizeWhiteModelLighting(identity(day)), identity(day));
  for (const value of [[], {}, { ...identity(day), prompt: "禁止携带正文" }, { ...identity(day), version: 0 }, { ...identity(day), sha256: "bad" }]) {
    assert.throws(() => normalizeWhiteModelLighting(value));
  }
  assert.deepEqual(whiteModelLightingRequestFields("whiteModel", null), { whiteModelLighting: null });
  assert.deepEqual(whiteModelLightingRequestFields("emptyRoom", { invalid: true }), {});
  assert.equal(input().whiteModelLighting, null);
  for (const feature of ["emptyRoom", "roomRenovation", "styleTransfer", "free", "refinedModel", "panoramaEnhancement"]) {
    assert.equal(Object.hasOwn(input({ invalid: true }, feature), "whiteModelLighting"), false);
  }
});

test("默认自动不套首卡且旧服务可用，卡片不依赖精模规则并隐藏上传和渲染方式", () => {
  const f = fixture();
  assert.equal(f.controller.validation(), null);
  assert.deepEqual(f.controller.requestFields("whiteModel"), { whiteModelLighting: null });
  assert.equal(f.node("[data-lighting-selected-name]").textContent, "自动");
  f.controller.setLightingConfig(library);
  assert.equal(f.controller.value(), null);
  assert.equal(f.controller.validation(), null);
  assert.equal(f.node("[data-lighting-reference]").hidden, true);
  assert.equal(f.node("[data-lighting-input]").disabled, true);
  assert.equal(f.node("[data-lighting-execution-field]").hidden, true);
  f.choose();
  assert.deepEqual(f.controller.value(), identity(day));
  assert.match(f.controller.validation(), /当前服务尚未支持白模光影/);
  f.controller.setCapabilities(capabilities);
  assert.equal(f.controller.validation(), null, "只用卡片正文，不依赖精模文字或迁移规则");
  assert.equal(f.node("[data-lighting-execution-field]").hidden, true);
  assert.equal(f.node("[data-lighting-grid]").hidden, true, "单选后收起");
});

test("白模单选与回到自动不携带精模规则、原图附件或提示词正文", () => {
  const f = fixture(); f.controller.setLightingConfig(library); f.controller.setCapabilities(capabilities);
  f.choose(0); f.choose(1);
  assert.deepEqual(f.controller.requestFields("whiteModel"), { whiteModelLighting: identity(night) });
  assert.equal(f.node("[data-lighting-selected-name]").textContent, night.name);
  const saved = storage.getItem("canvas-lab:white-model:lighting:selection");
  assert.doesNotMatch(saved, /ruleVersion|ruleSha256|prompt:|data:image|presets|referenceSha256/);
  assert.equal(storage.getItem("canvas-lab.refined-lighting"), null);
  f.node("[data-lighting-automatic]").click();
  assert.equal(f.controller.value(), null);
  assert.equal(f.node("[data-lighting-selected-name]").textContent, "自动");
  assert.equal(f.controller.validation(), null);
});

test("切功能只隐藏白模选择，独立草稿恢复且配置更新不迁移旧冻结身份", () => {
  const f = fixture(); f.controller.setLightingConfig(library); f.controller.setCapabilities(capabilities); f.choose();
  f.controller.setVisible(false);
  assert.equal(f.root.classes.has("hidden"), true);
  assert.deepEqual(f.controller.requestFields("emptyRoom"), {});
  f.controller.setVisible(true);
  assert.deepEqual(f.controller.value(), identity(day));
  const restored = fixture(); restored.controller.setLightingConfig(library); restored.controller.setCapabilities(capabilities);
  assert.deepEqual(restored.controller.value(), identity(day));
  restored.controller.setLightingConfig({ ...library, presets: [{ ...day, version: 6 }, night] });
  assert.deepEqual(restored.controller.value(), identity(day));
  assert.match(restored.controller.validation(), /已更新或下架/);
  restored.choose();
  assert.deepEqual(restored.controller.value(), { ...identity(day), version: 6 });
  assert.equal(restored.controller.validation(), null);
  restored.controller.setCapabilities({});
  assert.match(restored.controller.validation(), /当前服务尚未支持白模光影/);
  restored.node("[data-lighting-automatic]").click();
  assert.equal(restored.controller.validation(), null, "旧服务仍允许自动");
});

test("损坏白模身份显示错误且不影响其他功能请求和提示词身份读取", () => {
  storage.setItem("canvas-lab:white-model:lighting:selection", JSON.stringify({ mode: "preset", execution: "prompt-only",
    presetId: "legacy-id", version: 1, sha256: "bad-hash" }));
  const f = fixture(); f.controller.setLightingConfig(library); f.controller.setCapabilities(capabilities);
  assert.match(f.controller.validation(), /白模光影身份无效/);
  assert.doesNotThrow(() => JSON.stringify(f.controller.value()), "读取复用指纹不会导致页面初始化失败");
  for (const feature of ["emptyRoom", "roomRenovation", "styleTransfer", "free", "refinedModel"]) assert.deepEqual(f.controller.requestFields(feature), {});
  f.node("[data-lighting-automatic]").click();
  assert.deepEqual(f.controller.requestFields("whiteModel"), { whiteModelLighting: null });
});

test("改变光影使提示词复用身份失效，已组装任务与失败重试保持所选版本", () => {
  const f = fixture(); f.controller.setLightingConfig(library); f.controller.setCapabilities(capabilities); f.choose();
  const fingerprint = () => JSON.stringify(["whiteModel", f.controller.value()]);
  const reusableIdentity = fingerprint(), baseInput = input(f.controller.value());
  const build = () => buildGenerationJobRequest({ baseInput, featureMode: "whiteModel", models: generationItemsForSelection([model], 2), sourceImage: source });
  const request = build();
  f.choose(1);
  assert.equal(generationActionState({ featureMode: "whiteModel", currentIdentity: fingerprint(), reusableIdentity }).hasReusablePrompt, false);
  for (const batch of [request, build()]) {
    assert.deepEqual(batch.sharedInput.whiteModelLighting, identity(day));
    assert.equal(batch.sharedInput.referenceImages.length, 1);
    assert.equal(batch.sharedInput.styleReferenceImages.length, 1);
    for (const item of batch.items) assert.deepEqual(item.input.whiteModelLighting, identity(day));
    assert.doesNotMatch(JSON.stringify(batch), /lightingReferenceImages|ruleVersion|ruleSha256/);
  }
  saveGenerationTask(storage, createGenerationTask({ featureMode: "whiteModel", models: [model], loadingLabel: "白模生成中", createId: () => "white-model-lighting" }));
  saveGenerationTask(storage, createGenerationTask({ featureMode: "refinedModel", models: [model], loadingLabel: "精模生成中", createId: () => "refined-lighting" }));
  assert.equal(readGenerationTasks(storage).whiteModel.jobId, "generation-white-model-lighting");
  assert.equal(readGenerationTasks(storage).refinedModel.jobId, "generation-refined-lighting");
});

test("主工作台风格后挂载白模光影，刷新/复用/重试共用门禁且Beta不新增控件", async () => {
  const [html, app, beta] = await Promise.all(["index.html", "app.js", "beta.html"].map(file => readFile(new URL(`../public/${file}`, import.meta.url), "utf8")));
  assert.ok(html.indexOf('id="styleSection"') < html.indexOf('id="whiteModelLightingSection"'));
  assert.ok(html.indexOf('id="whiteModelLightingSection"') < html.indexOf('id="promptAgentSection"'));
  assert.match(app, /whiteModelLighting\.setVisible\(isWhiteModel\)/);
  assert.match(app, /whiteModelLighting\.setCapabilities\(catalogBody\.generationFeatureCapabilities\)/);
  assert.match(app, /onRefinedLighting\(config\)[^\n]*whiteModelLighting\.setLightingConfig\(config\)/);
  assert.match(app, /state\.featureMode === "whiteModel" \? whiteModelLighting\.value\(\) : null/);
  assert.match(app, /state\.featureMode === "whiteModel" \? whiteModelLighting\.validation\(\)/);
  assert.match(app, /retryButton\.addEventListener\("click", \(\) => generate\(\)\)/);
  assert.doesNotMatch(beta, /whiteModelLightingSection/);
  assert.ok(app.split("\n").length <= 800);
});

/**
 * [INPUT]: 依赖Beta超分配置/持久化、真实共享select增强器及MutationObserver/DOM替身、共享搜索多选和六工作流目录
 * [OUTPUT]: 验证十任务/工作流准入、输出档位交集与统一展开、KS旧2X及4K/6K恢复、普通/扩图/超分持久化，以及动态原生/增强下拉一致且不递归change
 * [POS]: test的Beta AI超分交互与输入合同测试，不访问OneAPI/GPU/飞书或持久化真实图片
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";
import { publicBetaUpscaleConfig } from "../src/beta-upscale.mjs";
import { createBetaConfigurationPersistence } from "../public/beta-configuration.js";
import { BETA_FEATURE_COPY } from "../public/beta-model-rules.js";
import { readBetaPageState, saveBetaPageState } from "../public/beta-page-state.js";
import { BETA_UPSCALE_WORKFLOW_KEYS, buildBetaUpscaleItems, createBetaUpscaleConfiguration,
  betaUpscaleResolutionKeys, normalizeBetaUpscaleState } from "../public/beta-upscale.js";
import { toggleAvailableModels, toggleModelSelection } from "../public/model-multi-select.js";
import { enhanceSearchableSelect } from "../public/custom-select.js";

const CONFIG = publicBetaUpscaleConfig({ comfyUi: { available: true } });
const CASES = [{ caseId: "SAMPLE-1", label: "客厅" }, { caseId: "SAMPLE-2", label: "卧室" }];
const NOW = new Date("2026-10-20T08:00:00.000Z");

class Field extends EventTarget {
  constructor(value = "") {
    super();
    this.value = value;
    this.options = [];
    this.textContent = "";
    this.ownerDocument = { createElement: () => new Field() };
    this.attributes = new Map();
    this.classes = new Set();
    this.classList = {
      contains: (key) => this.classes.has(key),
      toggle: (key, enabled) => enabled ? this.classes.add(key) : this.classes.delete(key),
    };
  }
  replaceChildren(...options) { this.options = options; }
  setAttribute(key, value) { this.attributes.set(key, String(value)); }
  toggleAttribute(key, enabled) { if (enabled) this.attributes.set(key, ""); else this.attributes.delete(key); }
  change(value) { this.value = value; this.dispatchEvent(new Event("change")); }
}

function fixture(initialState, config = CONFIG) {
  const elements = Object.fromEntries(["upscaleWorkflowOptions", "upscaleResolutionField",
    "upscaleResolutionSelect", "upscaleResolutionNote", "upscaleAvailability"].map((key) => [key, new Field()]));
  let binding, rendered = { catalog: [], selected: [] }, changes = 0;
  const messages = [];
  const controller = createBetaUpscaleConfiguration({
    elements, initialState,
    onChange: () => { changes += 1; }, onMessage: (message) => messages.push(message),
    bindChoice(options) {
      binding = options;
      return { render(catalog, selected) { rendered = { catalog, selected: [...selected] }; } };
    },
  });
  controller.configure(config);
  return { controller, elements, messages, binding, changes: () => changes,
    select(key) {
      const entry = rendered.catalog.find((workflow) => workflow.key === key);
      const result = toggleModelSelection(rendered.selected, key, binding.presentOption(entry));
      if (result.changed) binding.onChange(result.values);
      return result;
    },
    selectSearch(query) {
      const result = toggleAvailableModels(rendered.selected, rendered.catalog, { query, presentOption: binding.presentOption });
      if (result.changed) binding.onChange(result.values);
      return result;
    },
  };
}

function storageFixture() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

test("AI超分作为第十个图像任务，默认攸行且目录与六套真源相同", () => {
  assert.equal(Object.keys(BETA_FEATURE_COPY).length, 10);
  assert.deepEqual(BETA_FEATURE_COPY.imageUpscale, { label: "AI超分", prompt: "", source: "待超分图片" });
  assert.deepEqual(CONFIG.workflows.map((workflow) => workflow.key), [...BETA_UPSCALE_WORKFLOW_KEYS]);
  const ui = fixture();
  assert.deepEqual(ui.controller.snapshot(), { workflowKeys: ["youxing_seedvr2_3b"], resolution: "4K" });
  assert.equal(ui.binding.multiple, true);
  assert.equal(ui.binding.label, "超分工作流");
  assert.equal(ui.controller.ready(), true);
  assert.equal(ui.elements.upscaleResolutionField.classList.contains("hidden"), false);
});

test("搜索多选追加两套KS后统一保留6K，仅提供所有所选工作流共同支持的档位", () => {
  const ui = fixture();
  ui.elements.upscaleResolutionSelect.change("6K");
  ui.selectSearch("KS");
  assert.deepEqual(ui.controller.snapshot(), { workflowKeys: ["youxing_seedvr2_3b", "ks_seedvr2_2x", "ks_seedvr2_2x_direct"], resolution: "6K" });
  assert.deepEqual(ui.elements.upscaleResolutionSelect.options.map(option => option.value), ["4K", "6K"]);
  assert.match(ui.elements.upscaleResolutionNote.textContent, /384–3200/);
  const items = ui.controller.buildItems(CASES, NOW);
  assert.equal(items.length, 6);
  assert.deepEqual(items.slice(0, 3).map((item) => item.input.resolution), ["6K", "6K", "6K"]);
  for (const item of items) {
    assert.equal(item.modelKey, item.input.upscaleWorkflowKey);
    assert.equal(item.input.modelKey, item.modelKey);
    assert.deepEqual(Object.keys(item.input).sort(), ["featureMode", "modelKey", "resolution", "upscaleWorkflowKey"]);
    assert.equal(item.input.featureMode, "imageUpscale");
    assert.equal(item.sampleId, item.caseId);
  }
  ui.select("youxing_seedvr2_3b");
  assert.equal(ui.elements.upscaleResolutionField.classList.contains("hidden"), false);
  assert.deepEqual(ui.elements.upscaleResolutionSelect.options.map(option => option.value), ["2X", "4K", "6K"]);
  assert.equal(ui.elements.upscaleResolutionSelect.value, "6K");
  ui.select("seedvr2_7b_direct");
  assert.equal(ui.elements.upscaleResolutionSelect.value, "6K", "只选KS后再加常规仍恢复原长边档位");
  assert.equal(ui.elements.upscaleResolutionField.classList.contains("hidden"), false);
  assert.equal(items[0].input.resolution, "6K", "后续选择不能改写已构造批次");
  assert.ok(ui.changes() >= 4);
});

test("六工作流乘样本各有唯一Run ID，并且不附带图片、Prompt或普通模型参数", () => {
  const items = buildBetaUpscaleItems({ cases: CASES, workflows: CONFIG.workflows,
    settings: { workflowKeys: [...BETA_UPSCALE_WORKFLOW_KEYS], resolution: "6K" }, startedAt: NOW });
  assert.equal(items.length, 12);
  assert.equal(new Set(items.map((item) => item.runId)).size, 12);
  assert.ok(items.every((item) => item.attempt === 1));
  assert.deepEqual(items.map((item) => item.sampleId), [Array(6).fill("SAMPLE-1"), Array(6).fill("SAMPLE-2")].flat());
  assert.deepEqual(items.slice(0, 6).map((item) => item.input.resolution), Array(6).fill("6K"));
  assert.doesNotMatch(JSON.stringify(items), /referenceImages|styleReference|prompt|quality|ratio|dataUrl/);
  assert.throws(() => buildBetaUpscaleItems({ cases: [], workflows: CONFIG.workflows }), /请先添加超分样本/);
  assert.throws(() => buildBetaUpscaleItems({ cases: CASES, workflows: [] }), /请选择超分工作流/);
});

test("所选工作流失效时保留选择和原始原因，必须显式取消，不能自动换流", () => {
  const config = structuredClone(CONFIG);
  config.workflows[0].available = false;
  config.workflows[0].reason = "缺少3B模型";
  const ui = fixture(undefined, config);
  assert.equal(ui.controller.ready(), false);
  assert.deepEqual(ui.controller.snapshot().workflowKeys, ["youxing_seedvr2_3b"]);
  assert.match(ui.elements.upscaleAvailability.textContent, /攸行.*缺少3B模型/);
  assert.equal(ui.binding.presentOption(config.workflows[0]).selectable, true, "已选失效项仍可取消");
  ui.select("ks_seedvr2_2x_direct");
  assert.equal(ui.controller.ready(), false);
  assert.throws(() => ui.controller.buildItems(CASES, NOW), /缺少3B模型/);
  ui.select("youxing_seedvr2_3b");
  assert.equal(ui.controller.ready(), true);
  assert.deepEqual(ui.controller.buildItems(CASES, NOW).map((item) => item.input.resolution), ["4K", "4K"]);
  ui.controller.configure({ workflows: [] });
  assert.equal(ui.controller.ready(), false);
  assert.match(ui.controller.unavailableReason(), /不在目录/);
});

test("普通2K、扩图倍率与超分6K及独立样本集可通过真实持久化控制器完整往返", () => {
  const storage = storageFixture();
  const restored = saveBetaPageState(storage, {
    featureMode: "imageUpscale", selectedModelKeys: ["banana21"],
    controls: { resolution: "2K", ratio: "16:9", quality: "high" },
    outpaint: { workflowKeys: ["outpaint-qwen-2511"], ratio: "3:4", multiple: 3 },
    upscale: { workflowKeys: ["ks_seedvr2_2x_direct", "seedvr2_1mp"], resolution: "6K" },
    sampleSetIds: { imageUpscale: "SET-SHARED", imageOutpaint: "SET-SHARED", whiteModel: "SET-WHITE" },
  });
  const ui = fixture(restored.upscale);
  const elements = Object.fromEntries(["commonPromptInput", "effectTimeSelect", "effectWeatherSelect", "negativePromptInput",
    "promptAgentModelSelect", "promptAgentVersionSelect", "qualitySelect", "ratioSelect", "refinedPromptSelect",
    "renderModeSelect", "resolutionSelect", "roomTypeSelect", "roomTypeDetailInput", "styleSelect"].map((key) => [key, new Field()]));
  elements.betaForm = { dataset: {} };
  elements.roomTypeDetailField = new Field();
  elements.resolutionSelect.options = [{ value: "2K" }];
  elements.ratioSelect.options = [{ value: "16:9" }];
  elements.qualitySelect.options = [{ value: "high" }];
  const persistence = createBetaConfigurationPersistence({
    currentState: () => ({ ...restored, upscale: ui.controller.snapshot(), stylesReady: true }), elements,
    effectBeautificationControls: { restore() {}, value: () => ({ intensity: "low", tone: "natural" }) },
    renderFeature() {}, renderOutputControls() {}, renderRunSummary() {}, restoredPageState: restored, storage,
  });
  persistence.restore();
  persistence.markReady();
  assert.equal(elements.betaForm.dataset.configurationState, "saved");
  ui.elements.upscaleResolutionSelect.change("4K");
  persistence.save();
  const next = readBetaPageState(storage);
  assert.equal(next.featureMode, "imageUpscale");
  assert.deepEqual(next.selectedModelKeys, ["banana21"]);
  assert.deepEqual(next.upscale, { workflowKeys: ["ks_seedvr2_2x_direct", "seedvr2_1mp"], resolution: "4K" });
  assert.deepEqual(next.outpaint, restored.outpaint);
  assert.equal(next.controls.resolution, "2K");
  assert.equal(next.controls.ratio, "16:9");
  assert.equal(next.controls.quality, "high");
  assert.deepEqual(next.sampleSetIds, restored.sampleSetIds);
});

test("损坏超分存储安全回退，外部快照修改不能污染正在使用的选择", () => {
  assert.deepEqual(normalizeBetaUpscaleState({ workflowKeys: ["banana21"], resolution: "2K" }), {
    workflowKeys: ["youxing_seedvr2_3b"], resolution: "4K",
  });
  const ui = fixture({ workflowKeys: ["seedvr2_1mp", "seedvr2_1mp"], resolution: "6K" });
  const snapshot = ui.controller.snapshot();
  snapshot.workflowKeys.push("ks_seedvr2_2x");
  assert.deepEqual(ui.controller.snapshot(), { workflowKeys: ["seedvr2_1mp"], resolution: "6K" });
});

test("三种工作流组合的输出交集及旧KS缓存迁移，不改写明确4K/6K", () => {
  const ks = CONFIG.workflows.filter(workflow => workflow.key.startsWith("ks_"));
  const ordinary = CONFIG.workflows.filter(workflow => !workflow.key.startsWith("ks_"));
  assert.deepEqual(betaUpscaleResolutionKeys(ks), ["2X", "4K", "6K"]);
  assert.deepEqual(betaUpscaleResolutionKeys(ordinary), ["4K", "6K", "8K"]);
  assert.deepEqual(betaUpscaleResolutionKeys(CONFIG.workflows), ["4K", "6K"]);
  for (const workflows of [ks, ordinary, CONFIG.workflows]) {
    const workflowKeys = workflows.map(workflow => workflow.key);
    const fallback = workflows === ks ? "2X" : "4K";
    for (const resolution of [undefined, "invalid"]) {
      const normalized = normalizeBetaUpscaleState({ workflowKeys, resolution });
      assert.equal(normalized.resolution, fallback);
      const ui = fixture({ workflowKeys, resolution });
      assert.equal(ui.controller.snapshot().resolution, fallback);
      assert.equal(ui.elements.upscaleResolutionField.classList.contains("hidden"), false);
      assert.deepEqual(ui.controller.buildItems(CASES, NOW).map(item => item.input.resolution),
        Array(workflows.length * CASES.length).fill(fallback));
    }
    for (const resolution of ["4K", "6K"]) {
      const normalized = normalizeBetaUpscaleState({ workflowKeys, resolution });
      assert.equal(normalized.resolution, resolution);
      assert.equal(fixture(normalized).controller.snapshot().resolution, resolution);
    }
  }
  const ui = fixture({ workflowKeys: ks.map(workflow => workflow.key), resolution: "2X" });
  ui.select("youxing_seedvr2_3b");
  assert.equal(ui.controller.snapshot().resolution, "4K", "2X遇到普通工作流应回退共同档位");
  assert.deepEqual(ui.elements.upscaleResolutionSelect.options.map(option => option.value), ["4K", "6K"]);
  const ordinaryUi = fixture({ workflowKeys: ordinary.map(workflow => workflow.key), resolution: "8K" });
  ordinaryUi.select(ks[0].key);
  assert.equal(ordinaryUi.controller.snapshot().resolution, "4K");
  assert.deepEqual(ordinaryUi.controller.buildItems(CASES, NOW).map(item => item.input.resolution), Array(10).fill("4K"));
});

test("真实目录刷新缩减档位时同步选项和选择，无共同档位则阻断而不暗换工作流", () => {
  const selected = ["youxing_seedvr2_3b", "ks_seedvr2_2x_direct"];
  const ui = fixture({ workflowKeys: selected, resolution: "6K" });
  const config = structuredClone(CONFIG);
  config.workflows.find(workflow => workflow.key === selected[1]).resolutions = [{ key: "4K", longEdge: 4096 }];
  ui.controller.configure(config);
  assert.deepEqual(ui.elements.upscaleResolutionSelect.options.map(option => option.value), ["4K"]);
  assert.equal(ui.controller.snapshot().resolution, "4K");
  assert.deepEqual(ui.controller.buildItems(CASES, NOW).map(item => item.input.resolution), Array(4).fill("4K"));
  config.workflows.find(workflow => workflow.key === selected[0]).resolutions = [{ key: "8K", longEdge: 8192 }];
  ui.controller.configure(config);
  assert.deepEqual(ui.controller.snapshot().workflowKeys, selected);
  assert.equal(ui.elements.upscaleResolutionSelect.disabled, true);
  assert.equal(ui.controller.ready(), false);
  assert.throws(() => ui.controller.buildItems(CASES, NOW), /没有共同/);
});

// -------- 使用真实原生适配器与共享渲染器，属性变更按微任务送入观察器 --------
class SelectElement {
  constructor(tag, doc) {
    this.tagName = tag; this.ownerDocument = doc; this.children = []; this.attributes = new Map();
    this.listeners = new Map(); this.dataset = {}; this.style = {}; this.className = "";
    this.value = ""; this.textContent = ""; this.hidden = false; this.disabled = false; this.labels = [];
    const classes = () => new Set(this.className.split(/\s+/).filter(Boolean));
    this.classList = {
      add: (key) => { const set = classes(); set.add(key); this.className = [...set].join(" "); },
      remove: (key) => { const set = classes(); set.delete(key); this.className = [...set].join(" "); },
      toggle: (key, value) => this.classList[value ? "add" : "remove"](key),
      contains: (key) => classes().has(key),
    };
  }
  get options() { return this.children; }
  get parentElement() { return this.parentNode; }
  setAttribute(key, value) { this.attributes.set(key, String(value)); this.ownerDocument.notify(this); }
  getAttribute(key) { return this.attributes.get(key) ?? null; }
  toggleAttribute(key, enabled) {
    if (enabled === this.attributes.has(key)) return enabled;
    if (enabled) this.attributes.set(key, ""); else this.attributes.delete(key);
    this.ownerDocument.notify(this);
    return enabled;
  }
  addEventListener(key, callback) {
    if (!this.listeners.has(key)) this.listeners.set(key, []);
    this.listeners.get(key).push(callback);
  }
  removeEventListener(key, callback) {
    this.listeners.set(key, (this.listeners.get(key) || []).filter((entry) => entry !== callback));
  }
  dispatchEvent(event) { (this.listeners.get(event.type) || []).forEach((callback) => callback(event)); return true; }
  append(...children) {
    for (const child of children) { child.remove(); child.parentNode = this; this.children.push(child); }
    this.ownerDocument.notify(this);
  }
  replaceChildren(...children) {
    this.children.forEach((child) => { child.parentNode = null; }); this.children = []; this.append(...children);
  }
  insertAdjacentElement(_position, child) {
    const index = this.parentNode.children.indexOf(this);
    child.parentNode = this.parentNode; this.parentNode.children.splice(index + 1, 0, child);
  }
  remove() {
    if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    this.parentNode = null;
  }
  contains(child) { return this === child || this.children.some((entry) => entry.contains(child)); }
  closest() { return null; }
  getBoundingClientRect() { return { left: 100, top: 120, right: 360, bottom: 158, width: 260, height: 38 }; }
  focus() { this.ownerDocument.activeElement = this; }
  click() { if (!this.disabled) this.dispatchEvent({ type: "click", detail: 0, target: this, preventDefault() {} }); }
}

function enhancedResolutionFixture(initialState) {
  const observers = new Set();
  const doc = {
    notify(target) { for (const observer of observers) observer.notify(target); },
    createElement(tag) { return new SelectElement(tag, this); },
    createElementNS(_namespace, tag) { return this.createElement(tag); },
    addEventListener() {}, removeEventListener() {},
  };
  doc.defaultView = {
    innerWidth: 1280, innerHeight: 720, addEventListener() {}, removeEventListener() {},
    requestAnimationFrame: () => 1, cancelAnimationFrame() {},
    MutationObserver: class {
      constructor(callback) { this.callback = callback; this.root = null; this.queued = false; }
      observe(root) { this.root = root; observers.add(this); }
      notify(target) {
        if (!this.root?.contains(target) || this.queued) return;
        this.queued = true;
        queueMicrotask(() => { this.queued = false; if (this.root) this.callback(); });
      }
      disconnect() { this.root = null; observers.delete(this); }
    },
  };
  doc.body = doc.createElement("body");
  const select = doc.createElement("select");
  select.value = "4K";
  for (const [value, label] of [["4K", "4K · 4096px"], ["6K", "6K · 6144px"], ["8K", "8K · 8192px"]]) {
    const option = doc.createElement("option"); option.value = value; option.textContent = label;
    option.toggleAttribute("selected", value === "4K"); select.append(option);
  }
  doc.body.append(select);
  const enhanced = enhanceSearchableSelect(select, undefined, { searchable: false });
  const root = doc.body.children[1];
  const elements = Object.fromEntries(["upscaleWorkflowOptions", "upscaleResolutionField",
    "upscaleResolutionNote", "upscaleAvailability"].map((key) => [key, new Field()]));
  elements.upscaleResolutionSelect = select;
  let changes = 0;
  const controller = createBetaUpscaleConfiguration({ elements, initialState, onChange: () => { changes += 1; },
    onMessage() {}, bindChoice: () => ({ render() {} }) });
  const walk = (node) => [node, ...node.children.flatMap(walk)];
  const label = () => walk(root).find((node) => node.classList.contains("model-picker-primary")).textContent;
  return { controller, select, enhanced, label, changes: () => changes,
    choose(value) {
      root.children[0].click();
      walk(doc.body).find((node) => node.dataset.modelKey === value).click();
    },
  };
}

test("混选刷新恢复6K后真实增强下拉显示6K和4K交集，改4K后标签与下次刷新一致且不递归change", async () => {
  const storage = storageFixture();
  saveBetaPageState(storage, { featureMode: "imageUpscale", upscale: {
    workflowKeys: ["youxing_seedvr2_3b", "ks_seedvr2_2x"], resolution: "6K",
  } });
  const ui = enhancedResolutionFixture(readBetaPageState(storage).upscale);
  try {
    assert.equal(ui.label(), "4K · 4096px", "HTML默认值先由真实增强器呈现");
    ui.controller.configure(CONFIG);
    await Promise.resolve();
    assert.equal(ui.select.value, "6K");
    assert.equal(ui.label(), "6K · 6144px", "属性变更须让共享MutationObserver刷新可见标签");
    assert.deepEqual(ui.enhanced.values(), ["6K"]);
    assert.deepEqual(ui.select.options.map(option => option.value), ["4K", "6K"]);
    assert.equal(ui.changes(), 0, "恢复只同步属性，不伪造用户change");
    ui.choose("4K");
    await Promise.resolve();
    assert.equal(ui.select.value, "4K");
    assert.equal(ui.label(), "4K · 4096px");
    assert.equal(ui.controller.snapshot().resolution, "4K");
    assert.equal(ui.changes(), 1, "真实点击只触发一次配置变更");
    ui.controller.render();
    await Promise.resolve();
    assert.equal(ui.changes(), 1, "重复render不能进入change递归");
    saveBetaPageState(storage, { featureMode: "imageUpscale", upscale: ui.controller.snapshot() });
    const refreshed = enhancedResolutionFixture(readBetaPageState(storage).upscale);
    try {
      refreshed.controller.configure(CONFIG);
      await Promise.resolve();
      assert.equal(refreshed.select.value, "4K");
      assert.equal(refreshed.label(), "4K · 4096px");
      assert.deepEqual(refreshed.enhanced.values(), ["4K"]);
    } finally { refreshed.enhanced.destroy(); }
  } finally { ui.enhanced.destroy(); }
});

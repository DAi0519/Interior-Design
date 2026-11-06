/**
 * [INPUT]: 依赖node:test/assert、美化六氛围/共享图卡控制器、参考图能力及配置状态投影与内存DOM
 * [OUTPUT]: 验证六档强度/色调直白标签、十五项同网格主单选/Beta混选逐项映射与空选/草稿恢复、非首卡版本漂移阻断、键盘焦点及单图合同
 * [POS]: test 的效果图美化浏览器合同回归测试，不调用真实模型或飞书
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { bindEffectBeautificationControls, EFFECT_BEAUTIFICATION_ATMOSPHERES, normalizeEffectBeautification, normalizeEffectBeautificationSelections } from "../public/effect-beautification-controls.js";
import { bindEffectBeautificationLighting, effectBeautificationLightingRequestFields, normalizeEffectBeautificationLighting } from "../public/effect-beautification-lighting.js";
import { bindRefinedLightingControls } from "../public/refined-lighting-controls.js";
import { effectBeautificationPromptStatus } from "../public/config-refresh.js";
import { referenceCapability, referenceSubject } from "../public/model-capabilities.js";

test("六种美化选择保持原值，恢复无效配置使用低强度自然调", () => {
  for (const intensity of ["low", "high"]) for (const tone of ["natural", "warm", "cool"]) {
    assert.deepEqual(normalizeEffectBeautification({ intensity, tone }), { intensity, tone });
  }
  for (const input of [undefined, null, {}, { intensity: "extreme", tone: "night" }]) {
    assert.deepEqual(normalizeEffectBeautification(input), { intensity: "low", tone: "natural" });
  }
});

test("主工作台启用美化混选，旧进程多选与缺旧档Prompt的混选均阻断", async () => {
  const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  assert.match(app, /const effectBeautification = bindEffectBeautificationControls\(\{\s*root: elements\.effectBeautificationSection,\s*multiple: true/);
  const source = app.slice(app.indexOf("function generationUnavailableReason()"), app.indexOf("\nconst generationActions ="));
  const state = { featureMode: "effectBeautification", generationFeatureModes: ["effectBeautification"],
    effectBeautificationPrompt: { available: true }, generationFeatureCapabilities: {} };
  let count = 2, requiresOriginal = false, invalid = null;
  const context = { state, selectedModels: () => [], generationSize: { unavailableReason: () => null },
    generationFeatureUnavailableReason: () => null, effectBeautification: {
      validation: () => invalid, selections: () => Array(count).fill({}), requiresOriginalPrompt: () => requiresOriginal,
    } };
  const reason = new Function(...Object.keys(context), `${source}; return generationUnavailableReason;`)(...Object.values(context));
  assert.match(reason(), /当前服务尚未支持美化光影多选/);
  count = 1;
  assert.equal(reason(), null);
  count = 2;
  state.generationFeatureCapabilities = { effectBeautification: { multipleLightingSelections: true } };
  assert.equal(reason(), null);
  state.effectBeautificationPrompt = { available: false, reason: "旧六档Prompt缺失" };
  assert.equal(reason(), null, "只选图库卡片不依赖旧六档Prompt");
  requiresOriginal = true;
  assert.equal(reason(), "旧六档Prompt缺失");
  invalid = "请至少选择一种光影模板";
  assert.equal(reason(), invalid);
});

test("美化与氛围转换上传均固定单图并明确当前主题", () => {
  for (const featureMode of ["effectBeautification", "effectEnhancement"]) {
    const result = referenceCapability({ featureMode, model: { maxReferenceImages: 4 }, policy: { maxCount: 4 } });
    assert.equal(result.limit, 1);
    assert.equal(result.multiple, false);
    assert.equal(result.optionalLabel, "必填 · 1张");
  }
  assert.equal(referenceSubject("effectBeautification"), "待美化效果图");
  assert.equal(referenceSubject("effectEnhancement"), "待转换效果图");
});

test("美化就绪仅展示版本状态，配置失败保留恢复原因", () => {
  const status = effectBeautificationPromptStatus({ available: true, version: 1 });
  assert.equal(status.availability, "Prompt v1 · 已上架");
  assert.equal(status.note, "");
  assert.equal(status.ready, true);
  const unavailable = effectBeautificationPromptStatus({ available: false, reason: "请检查新表配置" });
  assert.equal(unavailable.ready, false);
  assert.match(unavailable.note, /请检查新表配置/);
});

test("美化控件与氛围天气时段分区隔离", async () => {
  const [html, controls] = await Promise.all([
    readFile(new URL("../public/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/effect-beautification-controls.js", import.meta.url), "utf8"),
  ]);
  assert.match(html, /<section id="effectBeautificationSection"[^>]*><\/section>/);
  const section = controls.match(/const BEAUTIFICATION_SECTION_HTML = `([\s\S]*?)`;/)?.[1];
  assert.ok(section);
  assert.match(section, /id="effectAtmosphereGroup"/);
  assert.match(section, /id="effectBeautificationLightingSection"/);
  assert.match(section, /aria-live="polite"/);
  assert.doesNotMatch(section, /effectTimeSelect|effectWeatherSelect|textarea/);
});

const day = { id: "recDaylight", name: "晴窗树影", version: 5, sha256: "a".repeat(64) };
const night = { id: "recNight", name: "暖灯静夜", version: 5, sha256: "b".repeat(64) };
const identity = ({ id, version, sha256 }) => ({ presetId: id, version, sha256 });
const library = { available: false, promptAvailable: false, presets: [day, night] };

function fixture(options = {}) {
  const nodes = new Map(), changes = [];
  const doc = { activeElement: null, createElement: tag => new Node(tag) };
  class Node {
    constructor(tag) {
      this.tagName = tag; this.ownerDocument = doc; this.children = []; this.listeners = new Map();
      this.attributes = {}; this.dataset = {}; this.hidden = false; this.classes = new Set();
      this.classList = { toggle: (name, active) => this.classes[active ? "add" : "delete"](name) };
    }
    set innerHTML(html) {
      this.html = html;
      if (this.tagName === "#effectAtmosphereGroup") this.children = [...html.matchAll(/data-effect-atmosphere="([^"]+)"/g)].map(([, key]) => {
        const node = new Node("button"); node.dataset.effectAtmosphere = key; return node;
      });
    }
    querySelector(selector) { if (!nodes.has(selector)) nodes.set(selector, new Node(selector)); return nodes.get(selector); }
    querySelectorAll(selector) {
      const dataKey = selector.includes("atmosphere") ? "effectAtmosphere" : selector.includes("intensity") ? "effectIntensity" : "effectTone";
      return this.children.filter(node => Object.hasOwn(node.dataset, dataKey));
    }
    closest(selector) { return this.dataset.effectAtmosphere && selector === "[data-effect-atmosphere]" ? this : null; }
    contains(node) { return this.children.includes(node); }
    addEventListener(name, fn) { this.listeners.set(name, [...(this.listeners.get(name) || []), fn]); }
    dispatch(name, event) { for (const fn of this.listeners.get(name) || []) fn(event); }
    click() { if (!this.disabled) this.dispatch("click", { target: this }); }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    focus() { doc.activeElement = this; }
  }
  const root = new Node("root");
  const controller = bindEffectBeautificationControls({ ...options, root, onChange: value => changes.push(value),
    bindLighting: options => bindEffectBeautificationLighting({ ...options,
      bindControls: options => bindRefinedLightingControls({ ...options, bindUpload: () => ({ images: () => [], render() {}, clear() {} }) }) }) });
  controller.setLightingConfig(library);
  controller.setCapabilities({ effectBeautification: { promptLighting: true } });
  return { root, controller, changes, doc, node: selector => root.querySelector(selector),
    chooseAtmosphere(index) { const group = root.querySelector("#effectAtmosphereGroup"); group.dispatch("click", { target: group.children[index] }); },
    chooseTemplate(index = 0) { if (root.querySelector("[data-lighting-grid]").hidden) root.querySelector("[data-lighting-toggle]").click();
      root.querySelector("[data-lighting-grid]").children[index + 1].click(); } };
}

test("六种无图氛围与图卡共用折叠入口，选后标签与焦点一致且刷新不移除六档", () => {
  const f = fixture();
  const grid = f.node("[data-lighting-grid]");
  const group = f.node("#effectAtmosphereGroup");
  const toggle = f.node("[data-lighting-toggle]");
  const label = f.node("[data-lighting-selected-name]");
  assert.equal(grid.children[0], group);
  assert.equal(grid.hidden, true);
  assert.equal(label.textContent, "低强度自然调");
  assert.equal(f.node("[data-lighting-availability]").textContent, "8 个预设");
  toggle.click();
  assert.equal(grid.hidden, false);
  f.chooseAtmosphere(3);
  assert.equal(label.textContent, "高强度暖调");
  assert.equal(grid.hidden, true);
  assert.equal(f.doc.activeElement, toggle);
  assert.equal(f.node("[data-lighting-selected-preview]").hidden, true);
  f.chooseTemplate();
  assert.equal(label.textContent, day.name);
  assert.equal(f.node("[data-lighting-selected-preview]").hidden, false);
  f.controller.setLightingConfig({ ...library, presets: [{ ...day, version: 6 }, night] });
  assert.equal(grid.children[0], group);
  toggle.click();
  grid.dispatch("keydown", { key: "Escape", target: group.children[0], preventDefault() {} });
  assert.equal(grid.hidden, true);
  assert.equal(f.doc.activeElement, toggle);
  f.controller.restore({ intensity: "high", tone: "cool" });
  assert.equal(label.textContent, "高强度冷调");
  assert.equal(f.controller.lightingValue(), null);
});

test("六氛围名称保留各自原工作流，新增模板与六档互斥且只用低强度自然调", () => {
  assert.deepEqual(EFFECT_BEAUTIFICATION_ATMOSPHERES.map(item => [item.key, item.name]), [
    ["low-natural", "低强度自然调"], ["low-warm", "低强度暖调"], ["low-cool", "低强度冷调"],
    ["high-warm", "高强度暖调"], ["high-natural", "高强度自然调"], ["high-cool", "高强度冷调"],
  ]);
  const f = fixture();
  for (const [index, item] of EFFECT_BEAUTIFICATION_ATMOSPHERES.entries()) {
    f.chooseAtmosphere(index);
    assert.deepEqual(f.controller.value(), { intensity: item.intensity, tone: item.tone });
    assert.equal(f.controller.lightingValue(), null);
  }
  f.chooseTemplate();
  assert.deepEqual(f.controller.value(), { intensity: "low", tone: "natural" });
  assert.deepEqual(f.controller.lightingValue(), identity(day));
  assert.ok(f.node("#effectAtmosphereGroup").children.every(button => button.attributes["aria-checked"] === "false"));
  assert.equal(f.node("[data-lighting-reference]").hidden, true);
  assert.equal(f.node("[data-lighting-execution-field]").hidden, true);
  f.chooseAtmosphere(3);
  assert.deepEqual(f.controller.value(), { intensity: "high", tone: "warm" });
  assert.equal(f.controller.lightingValue(), null);
  assert.equal(f.node("[data-lighting-grid]").children[1].attributes["aria-pressed"], "false");
});

test("Beta全选覆盖原六档与可用图卡，清空后阻断批次且不自动恢复默认", () => {
  const f = fixture({ multiple: true });
  f.controller.selectAll();
  assert.equal(f.controller.selections().length, 8);
  assert.equal(f.controller.selections().filter(item => !item.effectBeautificationLighting).length, 6);
  assert.equal(f.node("[data-lighting-selected-name]").textContent, "8 种光影");
  assert.equal(f.controller.validation(), null);
  f.controller.clearSelection();
  assert.deepEqual(f.controller.selections(), []);
  assert.match(f.controller.validation(), /至少选择/);
  assert.equal(f.node("[data-lighting-selected-name]").textContent, "选择光影模板");
});

test("Beta六原氛围与多张图卡可混合选择，同一网格保留展开并逐项返回正确工作流", () => {
  const f = fixture({ multiple: true });
  const grid = f.node("[data-lighting-grid]");
  const group = f.node("#effectAtmosphereGroup");
  f.node("[data-lighting-toggle]").click();
  f.chooseAtmosphere(3);
  assert.equal(grid.hidden, false);
  assert.equal(f.doc.activeElement, group.children[3]);
  f.chooseTemplate(0);
  f.chooseTemplate(1);
  assert.equal(grid.hidden, false);
  assert.equal(f.node("[data-lighting-selected-name]").textContent, "4 种光影");
  assert.equal(f.node("[data-lighting-selected-preview]").hidden, true);
  assert.deepEqual(f.controller.selections(), [
    { key: "atmosphere:low-natural", name: "低强度自然调", effectBeautification: { intensity: "low", tone: "natural" }, effectBeautificationLighting: null },
    { key: "atmosphere:high-warm", name: "高强度暖调", effectBeautification: { intensity: "high", tone: "warm" }, effectBeautificationLighting: null },
    { key: "lighting:recDaylight", name: day.name, effectBeautification: { intensity: "low", tone: "natural" }, effectBeautificationLighting: identity(day) },
    { key: "lighting:recNight", name: night.name, effectBeautification: { intensity: "low", tone: "natural" }, effectBeautificationLighting: identity(night) },
  ]);
  assert.equal(f.controller.requiresOriginalPrompt(), true);
  assert.equal(f.controller.validation(), null);
  f.chooseAtmosphere(0);
  f.chooseAtmosphere(3);
  assert.equal(f.controller.requiresOriginalPrompt(), false);
  assert.equal(f.node("[data-lighting-selected-name]").textContent, "2 种光影");
  assert.equal(grid.children[0], group);
  assert.equal(f.controller.selections().length, 2);
});

test("Beta取消非默认原氛围后显示剩余名称，空选阻断且混选草稿按逐项身份恢复", () => {
  const f = fixture({ multiple: true });
  const warm = { effectBeautification: { intensity: "high", tone: "warm" }, effectBeautificationLighting: null };
  const cool = { effectBeautification: { intensity: "high", tone: "cool" }, effectBeautificationLighting: null };
  const template = { effectBeautification: { intensity: "low", tone: "natural" }, effectBeautificationLighting: identity(night) };
  f.controller.restoreSelections([warm, cool]);
  assert.equal(f.node("[data-lighting-selected-name]").textContent, "2 种光影");
  f.node("[data-lighting-toggle]").click();
  f.chooseAtmosphere(5);
  assert.equal(f.node("[data-lighting-selected-name]").textContent, "高强度暖调");
  assert.deepEqual(f.controller.selections().map(({ effectBeautification }) => effectBeautification), [warm.effectBeautification]);
  f.chooseAtmosphere(3);
  assert.deepEqual(f.controller.selections(), []);
  assert.match(f.controller.validation(), /至少选择一种/);
  f.controller.restoreSelections([template, warm]);
  assert.deepEqual(normalizeEffectBeautificationSelections(f.controller.selections()), [warm, template]);
  assert.equal(f.node("[data-lighting-selected-name]").textContent, "2 种光影");
  assert.equal(f.controller.validation(), null);
  f.controller.restoreSelections([]);
  assert.deepEqual(f.controller.selections(), []);
  assert.match(f.controller.validation(), /至少选择一种/);
});

test("Beta混选时非首张图卡版本漂移同样阻断，改回原六档不受图库或旧服务影响", () => {
  const f = fixture({ multiple: true });
  const warm = { effectBeautification: { intensity: "high", tone: "warm" }, effectBeautificationLighting: null };
  f.controller.restoreSelections([warm, ...[day, night].map(item => ({
    effectBeautification: { intensity: "low", tone: "natural" }, effectBeautificationLighting: identity(item),
  }))]);
  assert.deepEqual(f.controller.lightingValue(), identity(day));
  assert.equal(f.controller.validation(), null);
  f.controller.setLightingConfig({ ...library, presets: [day, { ...night, version: 6 }] });
  assert.match(f.controller.validation(), /已更新或下架/);
  f.controller.restoreSelections([warm]);
  f.controller.setCapabilities({});
  f.controller.setLightingConfig({ presets: [] });
  assert.equal(f.controller.validation(), null);
  assert.equal(f.node("[data-lighting-selected-name]").textContent, "高强度暖调");
  assert.deepEqual(f.controller.selections().map(({ effectBeautification }) => effectBeautification), [warm.effectBeautification]);
});

test("美化混选快照只留逐项执行身份，去重且新卡固定低自然，冲突版本不能静默合并", () => {
  const original = { effectBeautification: { intensity: "high", tone: "cool" }, effectBeautificationLighting: null };
  const template = { effectBeautification: { intensity: "high", tone: "warm" }, effectBeautificationLighting: identity(day) };
  assert.deepEqual(normalizeEffectBeautificationSelections([
    { ...original, name: "名称不落盘", prompt: "正文不落盘" }, original, template,
  ]), [original, { effectBeautification: { intensity: "low", tone: "natural" }, effectBeautificationLighting: identity(day) }]);
  assert.deepEqual(normalizeEffectBeautificationSelections([]), []);
  assert.throws(() => normalizeEffectBeautificationSelections([template, {
    ...template, effectBeautificationLighting: { ...identity(day), version: 6 },
  }]), /版本不一致/);
});

test("模板身份轻量且跨功能隔离，卡片版本与旧进程阻断不影响原六档", () => {
  assert.equal(normalizeEffectBeautificationLighting(), null);
  assert.deepEqual(normalizeEffectBeautificationLighting(identity(day)), identity(day));
  for (const value of [[], {}, { ...identity(day), prompt: "禁止正文" }, { ...identity(day), version: 0 }, { ...identity(day), sha256: "bad" }]) {
    assert.throws(() => normalizeEffectBeautificationLighting(value));
  }
  assert.deepEqual(effectBeautificationLightingRequestFields("whiteModel", { invalid: true }), {});
  const f = fixture(); f.chooseTemplate();
  assert.deepEqual(f.controller.requestFields("effectBeautification"), { effectBeautificationLighting: identity(day) });
  assert.equal(f.controller.validation(), null, "模板不依赖精模Prompt");
  f.controller.setLightingConfig({ ...library, presets: [{ ...day, version: 6 }, night] });
  assert.match(f.controller.validation(), /已更新或下架/);
  f.controller.setCapabilities({});
  assert.match(f.controller.validation(), /当前服务尚未支持美化/);
  f.chooseAtmosphere(5);
  assert.equal(f.controller.validation(), null);
  assert.deepEqual(f.controller.value(), { intensity: "high", tone: "cool" });
  f.controller.restore({ intensity: "high", tone: "warm" });
  f.controller.setLightingValue(identity(night));
  assert.deepEqual(f.controller.lightingValue(), identity(night));
  assert.deepEqual(f.controller.value(), { intensity: "low", tone: "natural" });
});

test("六氛围方向键跳过禁用选项且回选清除模板", () => {
  const f = fixture(); f.chooseTemplate();
  const group = f.node("#effectAtmosphereGroup");
  group.children[1].disabled = true;
  let prevented = false;
  group.dispatch("keydown", { key: "ArrowRight", target: group.children[0], preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.deepEqual(f.controller.value(), { intensity: "low", tone: "cool" });
  assert.equal(f.controller.lightingValue(), null);
  assert.equal(group.children[2].attributes["aria-checked"], "true");
});

test("独立宿主刷新按钮执行一次读取并保留冻结身份，读取失败显示真实原因", async () => {
  let calls = 0, finish;
  const f = fixture({ reload: () => { calls++; return new Promise(resolve => { finish = resolve; }); } });
  f.chooseTemplate();
  const button = f.node("[data-config-refresh]"), refresh = button.listeners.get("click")[0];
  const pending = refresh();
  await refresh();
  assert.equal(calls, 1);
  assert.equal(button.disabled, true);
  finish({ refinedLighting: { ...library, presets: [{ ...day, version: 6 }, night] } });
  await pending;
  assert.equal(button.disabled, false);
  assert.deepEqual(f.controller.lightingValue(), identity(day));
  assert.match(f.controller.validation(), /已更新或下架/);
  const failed = fixture({ reload: async () => { throw new Error("飞书读取连接中断，请重试"); } });
  await failed.node("[data-config-refresh]").listeners.get("click")[0]();
  assert.equal(failed.node("[data-lighting-error]").hidden, false);
  assert.match(failed.node("[data-lighting-error]").textContent, /飞书读取连接中断/);
});

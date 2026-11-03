/**
 * [INPUT]: 依赖node:test/assert、美化六氛围/共享图卡控制器、参考图能力及配置状态投影与内存DOM
 * [OUTPUT]: 验证六原工作流映射、新模板互斥/low-natural与身份版本能力门禁、旧groups兼容及单图和脱敏界面合同
 * [POS]: test 的效果图美化浏览器合同回归测试，不调用真实模型或飞书
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { bindEffectBeautificationControls, EFFECT_BEAUTIFICATION_ATMOSPHERES, normalizeEffectBeautification } from "../public/effect-beautification-controls.js";
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
  return { root, controller, changes, node: selector => root.querySelector(selector),
    chooseAtmosphere(index) { const group = root.querySelector("#effectAtmosphereGroup"); group.dispatch("click", { target: group.children[index] }); },
    chooseTemplate(index = 0) { if (root.querySelector("[data-lighting-grid]").hidden) root.querySelector("[data-lighting-toggle]").click();
      root.querySelector("[data-lighting-grid]").children[index].click(); } };
}

test("六氛围名称保留各自原工作流，新增模板与六档互斥且只用低强度自然调", () => {
  assert.deepEqual(EFFECT_BEAUTIFICATION_ATMOSPHERES.map(item => [item.key, item.name]), [
    ["low-natural", "明亮自然"], ["low-warm", "暖阳通透"], ["low-cool", "清透冷调"],
    ["high-warm", "温润柔光"], ["high-natural", "自然柔光"], ["high-cool", "静谧柔光"],
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
  assert.equal(f.node("[data-lighting-grid]").children[0].attributes["aria-pressed"], "false");
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

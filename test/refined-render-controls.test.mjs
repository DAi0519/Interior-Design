/**
 * [INPUT]: 依赖 node:test/assert、精模共享控制器、真实模型目录与主工作台请求/结果摘要映射
 * [OUTPUT]: 对外提供旧三下拉/历史恢复、主页面预设基础/上传迁移Prompt独立切换准入及版本恢复、无说明和跨功能隔离回归
 * [POS]: test 的精模氛围交互合同测试，不访问飞书或调用图像模型
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";
import { bindRefinedRenderControls } from "../public/refined-render-controls.js";
import { bindRefinedModelControls } from "../public/refined-model-controls.js";
import { describeRefinedRender, REFINED_RENDER_TIMES, REFINED_RENDER_WEATHERS, REFINED_RENDER_TONES } from "../public/refined-render-presets.js";
import { buildGenerationInput } from "../public/generation-input.js";
import { buildGenerationJobRequest, generationLoadingCopy } from "../public/generation-task-request.js";
import { publicModelCatalog } from "../src/model-config.mjs";

function fixture() {
  const changes = [];
  const element = (catalog) => ({ attributes: {}, listeners: {}, options: catalog.map(({ key }) => ({ value: key })),
    addEventListener(name, listener) { this.listeners[name] = listener; },
    setAttribute(name, value) { this.attributes[name] = value; },
  });
  const fields = Object.fromEntries(Object.entries({time: REFINED_RENDER_TIMES, weather: REFINED_RENDER_WEATHERS, tone: REFINED_RENDER_TONES}).map(([key, catalog]) => [key, element(catalog)]));
  const asset = {}, error = {}, source = {}, link = { removeAttribute(name) { delete this[name]; } };
  const root = { innerHTML: "", querySelector(selector) {
    return ({ "[data-refined-asset]": asset,
      "[data-refined-source]": source, "[data-refined-prompt-link]": link,
      "[data-refined-error]": error, ...Object.fromEntries(Object.entries(fields).map(([key, value]) => [`[data-refined-${key}]`, value])) })[selector];
  } };
  const controls = bindRefinedRenderControls({ root, onChange: value => changes.push(value) });
  return { controls, root, fields, changes, error, asset, source, link,
    change(key, value) { fields[key].value = value; fields[key].listeners.change(); },
  };
}

test("精模只显示常显三下拉，历史模板恢复后可直接修改任一参数", () => {
  const f = fixture();
  f.controls.setAvailability({ available: true, version: 13 });
  assert.doesNotMatch(f.root.innerHTML, /data-refined-preset|<details|<summary|<button|微调光照与色调/);
  assert.equal((f.root.innerHTML.match(/<select /g) || []).length, 3);
  f.controls.setValue({preset:"night"});
  assert.deepEqual(f.controls.value(), { preset: "night", time: "night", weather: "clear", tone: "preserve" });
  assert.equal(f.fields.time.value, "night");
  f.change("weather", "rainy");
  f.change("tone", "warm");
  assert.deepEqual(f.controls.value(), { preset: "custom", time: "night", weather: "rainy", tone: "warm" });
  assert.equal(f.controls.atmosphereVersion(), 13);
  f.change("time", "daytime");
  assert.deepEqual(f.controls.value(), { preset: "custom", time: "daytime", weather: "rainy", tone: "warm" });
});

test("精模一体Prompt展示来源入口，组合参数不携带旧氛围版本且拒绝非飞书链接", () => {
  const f = fixture();
  const tableUrl = "https://example.feishu.cn/base/source?table=tblRefined";
  f.controls.setValue({ preset: "night", tone: "cool" });
  f.controls.setAvailability({ source: "refined-prompt", available: true, version: 11, tableUrl });
  assert.equal(f.controls.isAvailable(), true);
  assert.equal(f.controls.atmosphereVersion(), undefined);
  assert.match(f.asset.textContent, /精模 Prompt v11.*基础\/时段\/天气\/色调统一管理/);
  assert.equal(f.source.hidden, false);
  assert.equal(f.link.href, tableUrl);
  for (const url of ["javascript:alert(1)", "https://feishu.cn.evil.test/base/source", "http://example.feishu.cn/base/source"]) {
    f.controls.setAvailability({ source: "refined-prompt", available: true, version: 11, tableUrl: url });
    assert.equal(f.source.hidden, true);
    assert.equal("href" in f.link, false);
  }
});

test("主工作台Prompt版本与新光影库独立，切换旧版本不再产生旧三字段", (t) => {
  const previousDocument = globalThis.document, previousStorage = globalThis.sessionStorage;
  const storage = new Map(), listeners = new Map();
  const select = { replaceChildren(...options) { this.options = options; }, addEventListener(name, fn) {
    const list = listeners.get(name) || []; list.push(fn); listeners.set(name, list);
  } };
  globalThis.document = { createElement: () => ({}) };
  globalThis.sessionStorage = { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
  t.after(() => { globalThis.document = previousDocument; globalThis.sessionStorage = previousStorage; });
  let lightingConfig;
  const controls = { setAvailability(value) { lightingConfig = value; }, validation: () => null,
    requestFields: () => ({ refinedLighting: null }),
    setModels() {}, setPolicy() {} };
  const elements = { refinedRenderSection: {}, refinedPromptAvailability: {classList:{toggle(){}}},
    refinedPromptNote: { classList: { toggle() {} } }, refinedPromptVersionSelect: select,
    refinedPromptInput: { value: "", addEventListener(){} }, refinedPromptCount: {} };
  const model = bindRefinedModelControls({ elements, onChange(){}, bindControls: () => controls });
  const versions = [
    { name: "精模质量", version: 12, published: true, atmosphereSource: "refined-prompt", atmosphereAvailable: true },
    { name: "旧精模", version: 10, published: true },
  ];
  model.setPromptConfig({ defaultVersion:12, versions });
  model.setLightingConfig({ available: true, presets: [] });
  assert.equal(lightingConfig.available, true);
  assert.equal(model.validation(), null);
  assert.deepEqual(model.requestFields(), { refinedLighting: null });
  assert.equal(elements.refinedPromptNote.textContent, "");
  assert.equal(elements.refinedPromptNote.hidden, true);
  for (const fn of listeners.get("change")) fn({ target: { value: "10" } });
  assert.equal(model.promptVersion(), 10);
  assert.equal("refinedRender" in model.requestFields(), false);
  assert.equal("refinedAtmospherePromptVersion" in model.requestFields(), false);
  model.setPromptConfig({ defaultVersion:12, versions });
  assert.equal(model.promptVersion(), 10);
});

test("氛围资产失效仍可在三个下拉选择精模默认，逐项归零后允许生成", () => {
  const f = fixture();
  f.controls.setValue({ preset: "night", tone: "cool" });
  f.controls.setAvailability({ available: false, version: null });
  assert.equal(f.controls.isAvailable(), false);
  assert.equal(f.error.hidden, false);
  for (const field of Object.values(f.fields)) {
    assert.equal(field.disabled, false);
    assert.equal(field.options[0].disabled, false);
    assert.equal(field.options[1].disabled, true);
  }
  f.change("time", "preserve");
  f.change("weather", "preserve");
  assert.equal(f.controls.isAvailable(), false);
  f.change("tone", "preserve");
  assert.equal(f.controls.isAvailable(), true);
  assert.equal(f.controls.atmosphereVersion(), undefined);
  assert.deepEqual(f.controls.value(), { preset: "custom", time: "preserve", weather: "preserve", tone: "preserve" });
  assert.equal(f.error.hidden, true);
  f.controls.setValue({ preset: "custom" });
  assert.equal(f.controls.isAvailable(), true);
});

test("主工作台预设图文和上传统一迁移Prompt，基础不可用仍可用，切纯词恢复基础版本", t => {
  const previousDocument = globalThis.document, previousStorage = globalThis.sessionStorage;
  const storage = new Map(), listeners = [];
  globalThis.document = { createElement: () => ({}) };
  globalThis.sessionStorage = { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
  t.after(() => { globalThis.document = previousDocument; globalThis.sessionStorage = previousStorage; });
  const select = { replaceChildren(...options) { this.options = options; }, addEventListener(name, fn) { listeners.push(fn); } };
  const elements = { refinedRenderSection: {}, refinedPromptAvailability: { classList: { toggle() {} } },
    refinedPromptNote: { classList: { toggle() {} } }, refinedPromptVersionSelect: select,
    refinedPromptInput: { value: "", addEventListener() {} }, refinedPromptCount: {} };
  let selection = null, changed;
  const controls = { setAvailability() {}, validation: () => null,
    requestFields: () => ({ refinedLighting: selection }), setModels() {}, setPolicy() {} };
  const model = bindRefinedModelControls({ elements, onChange() {}, bindControls(options) { changed = options.onChange; return controls; } });
  const config = { defaultVersion: 12, versions: [
    { name: "精模基础", version: 12, published: true }, { name: "精模基础", version: 10, published: true },
  ] };
  model.setPromptConfig(config);
  for (const fn of listeners) fn({ target: { value: "10" } });
  model.setLightingConfig({ referenceAvailable: true, referenceRuleVersion: 1, referenceRuleSha256: "a".repeat(64) });
  selection = { mode: "preset", execution: "prompt-and-reference", presetId: "card", ruleVersion: 1, ruleSha256: "a".repeat(64) }; changed();
  assert.equal(model.promptVersion(), 1);
  assert.equal(select.disabled, true);
  assert.deepEqual(select.options.map(option => option.textContent), ["参考图光影迁移 · v1"]);
  model.setPromptConfig({ available: false, versions: [] });
  assert.equal(model.validation(), null);
  assert.equal(model.promptVersion(), 1);
  assert.equal(storage.get("canvas-lab.refined-lighting-base-version"), "10");
  selection = { mode: "reference", ruleVersion: 1, ruleSha256: "a".repeat(64) }; changed();
  assert.equal(model.promptVersion(), 1);
  assert.equal(model.validation(), null);
  assert.equal(storage.get("canvas-lab.refined-lighting-base-version"), "10");
  model.setPromptConfig(config); selection = { mode: "preset", execution: "prompt-only" }; changed();
  assert.equal(model.promptVersion(), 10);
  assert.equal(select.disabled, false);
});

test("损坏恢复与不可用存储安全回退，恢复不会触发变更回调", () => {
  const f = fixture();
  f.controls.setValue({ preset: "unknown" });
  assert.equal(f.controls.value().preset, "preserve");
  assert.equal(f.changes.length, 0);
  assert.doesNotThrow(() => bindRefinedRenderControls({ root: null, storageKey: "not-available" }));
});

test("主工作台模板穿透多模型请求且图片只共享一次，其他功能不混入精模氛围", () => {
  const refinedRender = { preset: "custom", time: "night", weather: "rainy", tone: "cool" };
  const model = publicModelCatalog().find(entry => entry.key === "gptImage2");
  const values = { featureMode: "refinedModel", model, refinedRender, refinedAtmospherePromptVersion: 13,
    refinedFinish: { intensity: "high", tone: "cool" }, refinedFinishPromptVersion: 1, refinedFinishPromptSha256: "a".repeat(64),
    prompt: { refined: "柔和高光", free: "其他内容" }, promptVersion: 10,
    referenceImages: [{ dataUrl: "data:image/png;base64,abc", name: "model.png" }],
    renderMode: {}, resolution: "1K", ratio: "1:1", ratioMode: "auto" };
  const baseInput = buildGenerationInput(values);
  for (const key of ["refinedFinish", "refinedFinishPromptVersion", "refinedFinishPromptSha256"]) assert.equal(key in baseInput, false);
  const job = buildGenerationJobRequest({ baseInput, featureMode: "refinedModel", models: [model, publicModelCatalog().find(entry => entry.key === "banana21")] });
  for (const item of job.items) {
    assert.deepEqual(item.input.refinedRender, refinedRender);
    assert.equal(item.input.refinedAtmospherePromptVersion, 13);
    assert.equal("referenceImages" in item.input, false);
  }
  assert.equal(job.sharedInput.referenceImages.length, 1);
  for (const featureMode of ["free", "whiteModel", "effectEnhancement"]) {
    const input = buildGenerationInput({ ...values, featureMode });
    assert.equal("refinedRender" in input, false);
    assert.equal("refinedAtmospherePromptVersion" in input, false);
  }
  assert.equal(describeRefinedRender(refinedRender), "自定义 · 夜晚 · 雨天 · 冷调");
  assert.match(generationLoadingCopy({ refinedModelRequest: true, refinedRender }), /按所选氛围渲染精模/);
});

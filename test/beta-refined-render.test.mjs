/**
 * [INPUT]: 依赖 node:test/assert、Beta精模光影适配器与共享控制器替身及真实来源校验
 * [OUTPUT]: 验证纯词基础版本、迁移及氛围词前置版本分流、光影乘三模式展开与单项settings、光影方式独立计数摘要、多光影显式启用、三规则身份/独立准入/基础记忆隔离和双图模型准入
 * [POS]: test 的 Beta 精模光影交互合同测试，不访问浏览器、飞书或付费模型
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";
import { betaRefinedLightingRunSummary, createBetaRefinedRenderConfiguration } from "../public/beta-refined-render.js";
import { normalizeRefinedLighting, refinedLightingSelections, refinedLightingValidation } from "../public/refined-lighting-controls.js";

const preset = { mode: "preset", execution: "prompt-only", presetId: "rec-light", version: 2, sha256: "a".repeat(64),
  ruleVersion: 1, ruleSha256: "b".repeat(64) };

test("Beta计划分别展示光影与方式，三卡单方式不误报成三种模式", () => {
  const presets = ["day", "night", "film"].map(id => ({ presetId: id, version: 1, sha256: "a".repeat(64) }));
  const value = { ...preset, ...presets[0], presets };
  const config = { multiplePresetSelections: true, presets: presets.map(item => ({ id: item.presetId })) };
  const summarize = (selection, models = 1) => betaRefinedLightingRunSummary({
    samples: 10, models, selections: refinedLightingSelections(selection, config),
  });
  assert.equal(summarize(value), "10 个样本 × 1 个模型 × 3 种光影 = 30 张结果");
  assert.equal(summarize({ ...value, executions: ["prompt-only", "prompt-and-reference", "prompt-with-reference"] }, 2),
    "10 个样本 × 2 个模型 × 3 种光影 × 3 种方式 = 180 张结果");
  assert.equal(summarize({ ...preset, executions: ["prompt-only", "prompt-and-reference"] }),
    "10 个样本 × 1 个模型 × 2 种方式 = 20 张结果");
  assert.equal(summarize({ mode: "reference", ruleVersion: 3, ruleSha256: "c".repeat(64) }),
    "10 个样本 × 1 个模型 = 10 张结果");
});

function fixture() {
  let selection = { mode: "unselected" }, images = [], asset = null, models = [], binding = null;
  const state = { featureMode: "refinedModel", catalog: {}, stylesConfig: {
    refinedPrompt: { defaultVersion: 10, versions: [
      { name: "精模渲染", version: 10, published: true },
      { name: "精模渲染", version: 7, published: true },
      { name: "旧版本", version: 3, published: false },
    ] },
    refinedLighting: { available: true, promptAvailable: true, presetExecutions: ["prompt-only", "prompt-and-reference"], referenceAvailable: true, referenceRuleVersion: 3, referenceRuleSha256: "c".repeat(64), ruleVersion: 1, ruleSha256: "b".repeat(64), hybridAvailable: true, hybridRuleVersion: 1, hybridRuleSha256: "d".repeat(64),
      presets: [{ id: preset.presetId, name: "自然柔光", version: 2, sha256: preset.sha256 }] },
  } };
  const elements = { refinedRenderFields: { classList: { toggle() {} } },
    refinedPromptSelect: { value: "7" }, configStatus: { textContent: "" } };
  const controls = {
    setValue(value) { selection = value?.mode ? normalizeRefinedLighting(value) : { mode: "unselected" }; },
    value: () => ({ ...selection }), setModels(value) { models = value; },
    setAvailability(value) { asset = value; },
    validation(value) {
      models = value;
      return refinedLightingValidation(selection, asset, models, selection.mode === "reference" ? images.length : 0);
    },
    requestFields: () => ({ refinedLighting: selection.mode === "unselected" ? null : { ...selection },
      ...(selection.mode === "reference" ? { lightingReferenceImages: images } : {}) }),
  };
  let selected = [{ key: "gpt", maxReferenceImages: 4 }];
  const configuration = createBetaRefinedRenderConfiguration({
    elements, getState: () => state, getModels: () => selected,
    fillSelect(select, options, value) { select.options = options; select.value = value == null ? "" : String(value); },
    bindControls: options => { binding = options; return controls; },

  });
  return { configuration, elements, state, asset: () => asset, models: () => models, binding: () => binding,
    setModels(value) { selected = value; }, setImages(value) { images = value; } };
}

test("Beta精模刷新保留仍已上架的版本，下架后回退当前默认", () => {
  const { configuration, elements, state } = fixture();
  configuration.render();
  assert.equal(elements.refinedPromptSelect.value, "7");
  assert.deepEqual(elements.refinedPromptSelect.options.map(option => option.value), [10, 7]);
  state.stylesConfig.refinedPrompt.versions[1].published = false;
  configuration.render();
  assert.equal(elements.refinedPromptSelect.value, "10");
  configuration.restore(preset);
  assert.equal(configuration.settings().promptVersion, 10);
});

test("Beta光影模板不依赖已撤销的六组合配置，也不投影旧六组合参数", () => {
  const { configuration, state } = fixture();
  state.stylesConfig.refinedFinishPrompt = { available: false, reason: "已撤销" };
  configuration.restore(preset, { intensity: "high", tone: "cool" });
  configuration.render();
  const settings = configuration.settings();
  assert.deepEqual(settings.refinedLighting, preset);
  for (const key of ["refinedFinish", "refinedFinishPromptVersion", "refinedFinishPromptSha256"]) {
    assert.equal(key in settings, false);
  }
});

test("Beta精模只投影新光影身份，Prompt切换不再借用旧氛围表", () => {
  const { configuration, elements, state, asset } = fixture();
  configuration.render(); configuration.restore(preset);
  assert.equal(asset(), state.stylesConfig.refinedLighting);
  assert.deepEqual(configuration.snapshot(), preset);
  const settings = configuration.settings();
  assert.deepEqual(settings.refinedLighting, preset);
  assert.equal("refinedRender" in settings, false);
  assert.equal("refinedAtmospherePromptVersion" in settings, false);
  elements.refinedPromptSelect.value = "10";
  assert.equal(configuration.settings().promptVersion, 10);
  assert.deepEqual(configuration.settings().refinedLighting, preset);
});

test("Beta氛围词双图使用独立前置版本，三路往返不污染基础选择", () => {
  const { configuration, elements, state } = fixture();
  state.stylesConfig.refinedLighting.presetExecutions.push("prompt-with-reference");
  configuration.render();
  const hybrid = { ...preset, execution: "prompt-with-reference", ruleSha256: "d".repeat(64) };
  configuration.restore(hybrid); configuration.render();
  assert.equal(elements.refinedPromptSelect.disabled, true);
  assert.equal(configuration.settings().promptVersion, 1);
  assert.deepEqual(elements.refinedPromptSelect.options, [{ label: "氛围词参考前置 · v1", value: 1 }]);
  assert.deepEqual(configuration.settings().refinedLighting, hybrid);
  configuration.restore({ ...preset, execution: "prompt-and-reference", ruleVersion: 3, ruleSha256: "c".repeat(64) });
  assert.equal(configuration.settings().promptVersion, 3);
  assert.equal(elements.refinedPromptSelect.disabled, true);
  configuration.restore(hybrid);
  assert.equal(configuration.settings().promptVersion, 1);
  state.stylesConfig.refinedLighting.referenceAvailable = false;
  state.stylesConfig.refinedLighting.promptAvailable = false;
  state.stylesConfig.refinedPrompt = { versions: [] };
  configuration.render();
  assert.equal(configuration.validation(), null, "新方式不依赖基础及迁移规则上架");
  assert.equal(configuration.basePromptVersion(), "7");
});

test("Beta多选三模式分别投影基础和迁移版本，不把界面数组传给单条任务", () => {
  const { configuration, elements, state } = fixture();
  state.stylesConfig.refinedLighting.multiplePresetExecutions = true;
  state.stylesConfig.refinedLighting.presetExecutions.push("prompt-with-reference");
  configuration.render(); configuration.restore({ ...preset,
    executions: ["prompt-only", "prompt-and-reference", "prompt-with-reference"] });
  const selections = configuration.selections();
  assert.equal(selections.length, 3);
  assert.equal(elements.refinedPromptSelect.disabled, false);
  assert.deepEqual(selections.map(selection => configuration.settings(selection).promptVersion), [7, 3, 1]);
  assert.ok(selections.every(selection => !Object.hasOwn(configuration.settings(selection).refinedLighting, "executions")));
  assert.equal(configuration.snapshot().executions.length, 3);
});

test("Beta多光影显式启用，逐卡逐模式settings只携带单个冻结身份", () => {
  const { configuration, state, binding } = fixture();
  assert.equal(binding().allowMultiplePresets, true);
  const lighting = state.stylesConfig.refinedLighting;
  lighting.multiplePresetSelections = true;
  lighting.multiplePresetExecutions = true;
  const other = { id: "rec-night", name: "暖灯静夜", version: 4, sha256: "e".repeat(64) };
  lighting.presets.push(other);
  const presets = [
    { presetId: preset.presetId, version: preset.version, sha256: preset.sha256 },
    { presetId: other.id, version: other.version, sha256: other.sha256 },
  ];
  configuration.render();
  configuration.restore({ ...preset, presets, executions: ["prompt-only", "prompt-and-reference"] });
  const selections = configuration.selections();
  assert.equal(selections.length, 4);
  const settings = selections.map(value => configuration.settings(value));
  assert.deepEqual(settings.map(value => value.refinedLighting.presetId),
    [preset.presetId, preset.presetId, other.id, other.id]);
  assert.deepEqual(settings.map(value => value.promptVersion), [7, 3, 7, 3]);
  for (const value of [...settings, configuration.settings()]) {
    for (const key of ["presets", "presetName", "executions"]) assert.equal(key in value.refinedLighting, false);
  }
  assert.deepEqual(configuration.snapshot().presets, presets, "界面草稿保留多选，单项传输不污染草稿");
});

test("Beta上传参考恢复须重传，使用独立参考规则且不持久化图片", () => {
  const { configuration, setImages } = fixture();
  configuration.render(); configuration.restore({ mode: "reference", ruleVersion: 3, ruleSha256: "c".repeat(64) });
  assert.throws(() => configuration.settings(), /重新上传/);
  const image = { dataUrl: "data:image/png;base64,AA==", name: "mood.png" };
  setImages([image]);
  assert.deepEqual(configuration.settings().lightingReferenceImages, [image]);
  assert.equal("lightingReferenceImages" in configuration.snapshot(), false);
  configuration.restore({ mode: "original" });
  assert.deepEqual(configuration.snapshot(), { mode: "unselected" });
  assert.throws(() => configuration.settings(), /请选择光影预设/);
  configuration.restore(preset);
  assert.equal("lightingReferenceImages" in configuration.settings(), false);
});

test("Beta上传专用光影迁移Prompt只读且不依赖基础，清除上传恢复之前基础版本", () => {
  const { configuration, elements, state, setImages } = fixture();
  configuration.render();
  const reference = { mode: "reference", ruleVersion: 3, ruleSha256: "c".repeat(64) };
  configuration.restore(reference); setImages([{ name: "mood.png", dataUrl: "data:image/png;base64,AA==" }]);
  assert.deepEqual(elements.refinedPromptSelect.options, [{ label: "参考图光影迁移 · v3", value: 3 }]);
  assert.equal(elements.refinedPromptSelect.disabled, true);
  assert.equal(configuration.settings().promptVersion, 3);
  assert.equal(configuration.basePromptVersion(), "7");
  state.stylesConfig.refinedPrompt = { available: false, versions: [] };
  configuration.render();
  assert.equal(configuration.validation(), null);
  assert.equal(configuration.settings().promptVersion, 3);
  assert.equal(configuration.basePromptVersion(), "7");
  state.stylesConfig.refinedLighting.referenceAvailable = false;
  state.stylesConfig.refinedLighting.referenceReason = "专用迁移Prompt未上架";
  configuration.render();
  assert.match(configuration.validation(), /专用迁移Prompt未上架/);
  assert.equal(elements.refinedPromptSelect.options.length, 0);
  state.stylesConfig.refinedLighting.referenceAvailable = true;
  state.stylesConfig.refinedPrompt = { defaultVersion: 10, versions: [
    { name: "精模渲染", version: 10, published: true }, { name: "精模渲染", version: 7, published: true },
  ] };
  configuration.render(); configuration.restore(preset);
  assert.equal(elements.refinedPromptSelect.value, "7");
  assert.equal(elements.refinedPromptSelect.disabled, false);
  assert.equal(configuration.settings().promptVersion, 7);
});

test("Beta初始未选阻断，预设提示词可配手动单图模型且保留选择", () => {
  const { configuration, state, setModels, models } = fixture();
  const flux = { key: "aiTextureEnhancement", maxReferenceImages: 1 };
  setModels([flux]);
  configuration.render();
  assert.match(configuration.validation(), /请选择光影预设/);
  configuration.restore(preset);
  assert.equal(configuration.validation(), null);
  assert.deepEqual(models(), [flux]);
  assert.doesNotThrow(() => configuration.validate());
  assert.equal("lightingReferenceImages" in configuration.settings(), false);
});

test("Beta两种预设执行方式往返，双图方式阻断单图模型且不静默换卡或丢方式", () => {
  const { configuration, setModels, models } = fixture();
  configuration.render();
  const legacy = { ...preset }; delete legacy.execution;
  configuration.restore(legacy);
  assert.deepEqual(configuration.snapshot(), preset);
  const combined = { ...preset, execution: "prompt-and-reference", ruleVersion: 3, ruleSha256: "c".repeat(64) };
  configuration.restore(combined);
  assert.deepEqual(configuration.settings().refinedLighting, combined);
  assert.equal("lightingReferenceImages" in configuration.settings(), false);
  const flux = { key: "aiTextureEnhancement", label: "Flux", maxReferenceImages: 1 };
  setModels([flux]);
  assert.match(configuration.validation(), /Flux.*不支持双图/);
  assert.throws(() => configuration.settings(), /不支持双图/);
  assert.deepEqual(models(), [flux]);
  assert.deepEqual(configuration.snapshot(), combined);
  configuration.restore(preset);
  assert.equal(configuration.validation(), null);
});

test("Beta预设图文与上传共用迁移版本，缺基础Prompt仍可用且切纯词恢复基础选择", () => {
  const { configuration, elements, state, setImages } = fixture();
  const baseConfig = state.stylesConfig.refinedPrompt;
  configuration.render();
  const paired = { ...preset, execution: "prompt-and-reference", ruleVersion: 3, ruleSha256: "c".repeat(64) };
  configuration.restore(paired);
  assert.equal(elements.refinedPromptSelect.disabled, true);
  assert.deepEqual(elements.refinedPromptSelect.options, [{ label: "参考图光影迁移 · v3", value: 3 }]);
  assert.equal(configuration.settings().promptVersion, 3);
  assert.equal(configuration.basePromptVersion(), "7");
  state.stylesConfig.refinedPrompt = { available: false, versions: [] };
  state.stylesConfig.refinedLighting.promptAvailable = false;
  configuration.render();
  assert.equal(configuration.validation(), null);
  assert.equal(configuration.settings().promptVersion, 3);
  configuration.restore({ mode: "reference", ruleVersion: 3, ruleSha256: "c".repeat(64) });
  setImages([{ name: "mood.png", dataUrl: "data:image/png;base64,AA==" }]);
  assert.equal(configuration.settings().promptVersion, 3);
  assert.equal(configuration.basePromptVersion(), "7");
  state.stylesConfig.refinedPrompt = baseConfig; state.stylesConfig.refinedLighting.promptAvailable = true;
  configuration.restore(preset);
  assert.equal(elements.refinedPromptSelect.disabled, false);
  assert.equal(elements.refinedPromptSelect.value, "7");
  assert.equal(configuration.settings().promptVersion, 7);
});

test("旧时段天气草稿迁移为未选，新START必须重新选择光影", () => {
  const { configuration, elements } = fixture();
  configuration.restore({ preset: "night", time: "night", weather: "rainy", tone: "cool" });
  configuration.render();
  assert.deepEqual(configuration.snapshot(), { mode: "unselected" });
  assert.throws(() => configuration.settings(), /请选择光影预设/);
  elements.refinedPromptSelect.value = "";
  assert.throws(() => configuration.validate(), /精模 Prompt 版本不可用/);
});

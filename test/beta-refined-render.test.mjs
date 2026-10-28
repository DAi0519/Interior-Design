/**
 * [INPUT]: 依赖 node:test/assert、Beta精模光影适配器与共享控制器替身及真实来源校验
 * [OUTPUT]: 验证纯词基础版本/预设图文与上传迁移只读版本统一分流、双规则身份/独立准入/基础记忆隔离和双图模型准入
 * [POS]: test 的 Beta 精模光影交互合同测试，不访问浏览器、飞书或付费模型
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";
import { createBetaRefinedRenderConfiguration } from "../public/beta-refined-render.js";
import { normalizeRefinedLighting, refinedLightingValidation } from "../public/refined-lighting-controls.js";

const preset = { mode: "preset", execution: "prompt-only", presetId: "rec-light", version: 2, sha256: "a".repeat(64),
  ruleVersion: 1, ruleSha256: "b".repeat(64) };

function fixture() {
  let selection = { mode: "unselected" }, images = [], asset = null, models = [];
  const state = { featureMode: "refinedModel", catalog: {}, stylesConfig: {
    refinedPrompt: { defaultVersion: 10, versions: [
      { name: "精模渲染", version: 10, published: true },
      { name: "精模渲染", version: 7, published: true },
      { name: "旧版本", version: 3, published: false },
    ] },
    refinedLighting: { available: true, promptAvailable: true, presetExecutions: ["prompt-only", "prompt-and-reference"], referenceAvailable: true, referenceRuleVersion: 3, referenceRuleSha256: "c".repeat(64), ruleVersion: 1, ruleSha256: "b".repeat(64),
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
    bindControls: () => controls,

  });
  return { configuration, elements, state, asset: () => asset, models: () => models,
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

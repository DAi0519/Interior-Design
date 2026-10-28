/**
 * [INPUT]: 依赖 node:test/assert、公开模型目录、内存 localStorage/DOM 替身与 beta-page-state/beta-configuration 的配置归一化/持久化/恢复能力
 * [OUTPUT]: 对外提供Beta默认模型、精模预设两执行方式/旧草稿恢复、上传迁移版本与基础记忆独立保存、损坏迁移未选、无图片持久化和多功能配置往返回归
 * [POS]: test 的 Beta页面配置恢复纯状态测试，不访问浏览器、飞书或图片数据
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  BETA_PAGE_STATE_STORAGE_KEY,
  DEFAULT_BETA_MODEL_KEY,
  readBetaPageState,
  saveBetaPageState,
} from "../public/beta-page-state.js";
import { createBetaConfigurationPersistence } from "../public/beta-configuration.js";
import { publicModelCatalog } from "../src/model-config.mjs";

function memoryStorage(initialValue = null) {
  const values = new Map(initialValue === null
    ? []
    : [[BETA_PAGE_STATE_STORAGE_KEY, initialValue]]);
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

test("Beta跑图首次进入默认选择 Flux2 Klein", () => {
  const state = readBetaPageState(memoryStorage());
  assert.equal(state.featureMode, "whiteModel");
  assert.deepEqual(state.selectedModelKeys, [DEFAULT_BETA_MODEL_KEY]);
  assert.equal(state.controls.effectBeautificationIntensity, "low");
  assert.equal(state.controls.effectBeautificationTone, "natural");
});

test("Beta 全部可用模型跨页和刷新恢复时去重且不截断", () => {
  const storage = memoryStorage();
  const modelKeys = publicModelCatalog().map((model) => model.key);
  assert.ok(modelKeys.length > 4);
  const saved = saveBetaPageState(storage, {
    featureMode: "free",
    selectedModelKeys: [modelKeys[0], modelKeys[0], ...modelKeys.slice(1), "", null],
  });
  assert.deepEqual(saved.selectedModelKeys, modelKeys);
  assert.deepEqual(readBetaPageState(storage).selectedModelKeys, modelKeys);
  saveBetaPageState(storage, readBetaPageState(storage));
  assert.deepEqual(readBetaPageState(storage).selectedModelKeys, modelKeys);
});

test("效果图美化六组合和氛围转换样本集分别持久保存", () => {
  const storage = memoryStorage();
  for (const intensity of ["low", "high"]) {
    for (const tone of ["natural", "warm", "cool"]) {
      saveBetaPageState(storage, {
        controls: { effectBeautificationIntensity: intensity, effectBeautificationTone: tone },
        featureMode: "effectBeautification",
        sampleSetIds: {
          effectBeautification: "SET-BEAUTIFY-1",
          effectEnhancement: "SET-ATMOSPHERE-1",
        },
      });
      const restored = readBetaPageState(storage);
      assert.equal(restored.featureMode, "effectBeautification");
      assert.equal(restored.controls.effectBeautificationIntensity, intensity);
      assert.equal(restored.controls.effectBeautificationTone, tone);
      assert.equal(restored.sampleSetIds.effectBeautification, "SET-BEAUTIFY-1");
      assert.equal(restored.sampleSetIds.effectEnhancement, "SET-ATMOSPHERE-1");
    }
  }
  saveBetaPageState(storage, { controls: { effectBeautificationIntensity: "ultra", effectBeautificationTone: "pink" } });
  const invalid = readBetaPageState(storage);
  assert.equal(invalid.controls.effectBeautificationIntensity, "low");
  assert.equal(invalid.controls.effectBeautificationTone, "natural");
});

test("Beta精模模板与自定义时段天气色调独立往返，损坏存储回退默认精模", () => {
  const storage = memoryStorage();
  const refinedRender = { preset: "custom", time: "night", weather: "rainy", tone: "cool" };
  saveBetaPageState(storage, {
    controls: { refinedRender, effectTime: "dusk", effectWeather: "clear", refinedPromptVersion: "7" },
    featureMode: "refinedModel",
  });
  const state = readBetaPageState(storage);
  assert.deepEqual(state.controls.refinedRender, refinedRender);
  assert.equal(state.controls.effectTime, "dusk");
  assert.equal(state.controls.effectWeather, "clear");
  assert.equal(state.controls.refinedPromptVersion, "7");
  saveBetaPageState(storage, { controls: { refinedRender: { preset: "unknown" } } });
  assert.deepEqual(readBetaPageState(storage).controls.refinedRender,
    { preset: "preserve", time: "preserve", weather: "preserve", tone: "preserve" });
});

test("Beta光影只保存来源和版本，参考图刷新后仍须重新上传", () => {
  const storage = memoryStorage();
  const selection = { mode: "preset", execution: "prompt-only", presetId: "rec-preset", version: 2, sha256: "a".repeat(64),
    ruleVersion: 1, ruleSha256: "b".repeat(64) };
  saveBetaPageState(storage, { controls: { refinedLighting: selection } });
  assert.deepEqual(readBetaPageState(storage).controls.refinedLighting, selection);
  const legacy = { ...selection }; delete legacy.execution;
  saveBetaPageState(storage, { controls: { refinedLighting: legacy } });
  assert.deepEqual(readBetaPageState(storage).controls.refinedLighting, selection);
  const combined = { ...selection, execution: "prompt-and-reference", ruleVersion: 3, ruleSha256: "c".repeat(64) };
  saveBetaPageState(storage, { controls: { refinedLighting: combined } });
  assert.deepEqual(readBetaPageState(storage).controls.refinedLighting, combined);
  saveBetaPageState(storage, { controls: { refinedLighting: {
    mode: "reference", ruleVersion: 1, ruleSha256: "b".repeat(64),
  }, lightingReferenceImages: [{ dataUrl: "data:image/png;base64,AA==" }] } });
  const restored = readBetaPageState(storage);
  assert.equal(restored.controls.refinedLighting.mode, "reference");
  assert.equal("lightingReferenceImages" in restored.controls, false);
  saveBetaPageState(storage, { controls: { refinedLighting: { mode: "unknown" } } });
  assert.deepEqual(readBetaPageState(storage).controls.refinedLighting, { mode: "unselected" });
  saveBetaPageState(storage, { controls: { refinedLighting: { mode: "original" } } });
  assert.deepEqual(readBetaPageState(storage).controls.refinedLighting, { mode: "unselected" });
});

test("Beta恢复已保存美化控件，并把新选择落盘", () => {
  const storage = memoryStorage();
  const modelKeys = publicModelCatalog().map((model) => model.key);
  const restoredPageState = saveBetaPageState(storage, {
    controls: { effectBeautificationIntensity: "high", effectBeautificationTone: "warm" },
    featureMode: "effectBeautification",
    selectedModelKeys: modelKeys,
  });
  const elements = Object.fromEntries([
    "commonPromptInput", "effectTimeSelect", "effectWeatherSelect", "negativePromptInput",
    "promptAgentModelSelect", "promptAgentVersionSelect", "qualitySelect", "ratioSelect",
    "refinedPromptSelect", "renderModeSelect", "resolutionSelect", "roomTypeSelect",
    "roomTypeDetailInput", "styleSelect",
  ].map((key) => [key, { value: "", options: [], dispatchEvent() {} }]));
  elements.betaForm = { dataset: {} };
  elements.roomTypeDetailField = { classList: { toggle() {} } };
  let selection = { intensity: "low", tone: "natural" };
  const persistence = createBetaConfigurationPersistence({
    currentState: () => ({ ...restoredPageState, stylesReady: true }),
    effectBeautificationControls: {
      restore(value) { selection = { ...value }; },
      value: () => ({ ...selection }),
    },
    elements,
    renderFeature() {},
    renderOutputControls() {},
    renderRunSummary() {},
    restoredPageState,
    storage,
  });
  persistence.restore();
  assert.deepEqual(selection, { intensity: "high", tone: "warm" });
  persistence.markReady();
  selection = { intensity: "low", tone: "cool" };
  persistence.save();
  const saved = readBetaPageState(storage);
  assert.equal(saved.controls.effectBeautificationIntensity, "low");
  assert.equal(saved.controls.effectBeautificationTone, "cool");
  assert.deepEqual(saved.selectedModelKeys, modelKeys);
  assert.equal(elements.betaForm.dataset.configurationState, "saved");
});

test("Beta默认光影未选，真实旧参数仅作为迁移输入且落盘改为新身份", () => {
  for (const [stored, expected] of [
    [{}, { mode: "unselected" }],
    [{ refinedLighting: { mode: "original" } }, { mode: "unselected" }],
    [{ refinedRender: { preset: "night" } }, { preset: "night", time: "night", weather: "clear", tone: "preserve" }],
    [{ refinedLighting: { mode: "reference", ruleVersion: 1 } }, { mode: "reference", ruleVersion: 1 }],
  ]) {
    const storage = memoryStorage();
    const restoredPageState = saveBetaPageState(storage, { controls: stored });
    const elements = Object.fromEntries([
      "commonPromptInput", "effectTimeSelect", "effectWeatherSelect", "negativePromptInput",
      "promptAgentModelSelect", "promptAgentVersionSelect", "qualitySelect", "ratioSelect",
      "refinedPromptSelect", "renderModeSelect", "resolutionSelect", "roomTypeSelect",
      "roomTypeDetailInput", "styleSelect",
    ].map(key => [key, { value: "", options: [], dispatchEvent() {} }]));
    elements.betaForm = { dataset: {} }; elements.roomTypeDetailField = { classList: { toggle() {} } };
    let restored;
    const persistence = createBetaConfigurationPersistence({
      currentState: () => ({ ...restoredPageState, stylesReady: true }),
      effectBeautificationControls: { restore() {}, value: () => ({ intensity: "low", tone: "natural" }) },
      refinedRenderConfiguration: { restore(value) { restored = value; }, snapshot: () => ({ mode: "unselected" }) },
      elements, renderFeature() {}, renderOutputControls() {}, renderRunSummary() {}, restoredPageState, storage,
    });
    persistence.restore();
    assert.deepEqual(restored, expected);
    persistence.markReady();
    const saved = readBetaPageState(storage).controls;
    assert.deepEqual(saved.refinedLighting, { mode: "unselected" });
    assert.equal(saved.refinedRender.time, "preserve");
  }
});

test("Beta上传迁移版本只用于当前展示，持久化仍保存独立基础Prompt版本", () => {
  const storage = memoryStorage();
  const lighting = { mode: "reference", ruleVersion: 3, ruleSha256: "a".repeat(64) };
  const restoredPageState = saveBetaPageState(storage, {
    featureMode: "refinedModel", controls: { refinedPromptVersion: "7", refinedLighting: lighting },
  });
  const elements = Object.fromEntries([
    "commonPromptInput", "effectTimeSelect", "effectWeatherSelect", "negativePromptInput",
    "promptAgentModelSelect", "promptAgentVersionSelect", "qualitySelect", "ratioSelect",
    "refinedPromptSelect", "renderModeSelect", "resolutionSelect", "roomTypeSelect", "roomTypeDetailInput", "styleSelect",
  ].map(key => [key, { value: "", options: [], dispatchEvent() {} }]));
  elements.betaForm = { dataset: {} }; elements.roomTypeDetailField = { classList: { toggle() {} } };
  const restored = [];
  const persistence = createBetaConfigurationPersistence({
    currentState: () => ({ ...restoredPageState, stylesReady: true }),
    effectBeautificationControls: { restore() {}, value: () => ({ intensity: "low", tone: "natural" }) },
    refinedRenderConfiguration: {
      restorePromptVersion(value) { restored.push(["base", value]); },
      restore(value) { restored.push(["lighting", value]); elements.refinedPromptSelect.value = "3"; },
      basePromptVersion: () => "7", snapshot: () => lighting,
    },
    elements, renderFeature() {}, renderOutputControls() {}, renderRunSummary() {}, restoredPageState, storage,
  });
  persistence.restore();
  assert.deepEqual(restored, [["base", "7"], ["lighting", lighting]]);
  assert.equal(elements.refinedPromptSelect.value, "3");
  persistence.markReady();
  assert.equal(readBetaPageState(storage).controls.refinedPromptVersion, "7");
  assert.deepEqual(readBetaPageState(storage).controls.refinedLighting, lighting);
});

test("Beta跑图配置与各功能样本集引用可在本机浏览器完整往返", () => {
  const storage = memoryStorage();
  saveBetaPageState(storage, {
    controls: {
      commonPrompt: "保持空间结构",
      quality: "high",
      ratio: "auto",
      resolution: "2K",
      roomType: "客厅",
    },
    featureMode: "emptyRoom",
    sampleSetIds: {
      emptyRoom: "SET-EMPTY-1",
      whiteModel: "SET-WHITE-1",
    },
    selectedModelKeys: ["aiTextureEnhancement", "aiTextureEnhancement", "banana2"],
  });

  const restored = readBetaPageState(storage);
  assert.equal(restored.featureMode, "emptyRoom");
  assert.deepEqual(restored.selectedModelKeys, ["aiTextureEnhancement", "banana2"]);
  assert.deepEqual(restored.sampleSetIds, {
    emptyRoom: "SET-EMPTY-1",
    whiteModel: "SET-WHITE-1",
  });
  assert.equal(restored.controls.commonPrompt, "保持空间结构");
  assert.equal(restored.controls.resolution, "2K");
  assert.equal("images" in restored, false);
});

test("Beta跑图损坏或越界配置安全回退，不覆盖 Flux 默认值", () => {
  assert.deepEqual(
    readBetaPageState(memoryStorage("not-json")).selectedModelKeys,
    [DEFAULT_BETA_MODEL_KEY],
  );
  const storage = memoryStorage();
  const saved = saveBetaPageState(storage, {
    featureMode: "styleDnaReverse",
    selectedModelKeys: [],
  });
  assert.equal(saved.featureMode, "whiteModel");
  assert.deepEqual(saved.selectedModelKeys, [DEFAULT_BETA_MODEL_KEY]);
});

test("全景配置保留独立样本集和合法 4K，恢复时不能覆盖锁定的 2:1", () => {
  const storage = memoryStorage();
  const restoredPageState = saveBetaPageState(storage, {
    featureMode: "panoramaEnhancement",
    sampleSetIds: { panoramaEnhancement: "SET-PANORAMA-1", effectBeautification: "SET-BEAUTIFY-1" },
    selectedModelKeys: ["seedream5Pro"],
    controls: { ratio: "4:3", resolution: "4K", quality: "max" },
  });
  const elements = Object.fromEntries([
    "commonPromptInput", "effectTimeSelect", "effectWeatherSelect", "negativePromptInput",
    "promptAgentModelSelect", "promptAgentVersionSelect", "qualitySelect", "ratioSelect",
    "refinedPromptSelect", "renderModeSelect", "resolutionSelect", "roomTypeSelect",
    "roomTypeDetailInput", "styleSelect",
  ].map((key) => [key, { value: "", options: [], dispatchEvent() {} }]));
  elements.betaForm = { dataset: {} };
  elements.roomTypeDetailField = { classList: { toggle() {} } };
  elements.ratioSelect.options = [{ value: "2:1" }];
  elements.ratioSelect.value = "2:1";
  elements.resolutionSelect.options = [{ value: "2K" }, { value: "4K" }];
  elements.qualitySelect.options = [{ value: "high" }];
  elements.qualitySelect.value = "high";
  const persistence = createBetaConfigurationPersistence({
    currentState: () => ({ ...restoredPageState, stylesReady: true }),
    effectBeautificationControls: { restore() {}, value: () => ({ intensity: "low", tone: "natural" }) },
    elements,
    renderFeature() {},
    renderOutputControls() {},
    renderRunSummary() {},
    restoredPageState,
    storage,
  });
  persistence.restore();
  assert.equal(elements.ratioSelect.value, "2:1");
  assert.equal(elements.resolutionSelect.value, "4K");
  assert.equal(elements.qualitySelect.value, "high");
  persistence.markReady();
  const restored = readBetaPageState(storage);
  assert.equal(restored.featureMode, "panoramaEnhancement");
  assert.equal(restored.sampleSetIds.panoramaEnhancement, "SET-PANORAMA-1");
  assert.equal(restored.sampleSetIds.effectBeautification, "SET-BEAUTIFY-1");
  assert.deepEqual(restored.selectedModelKeys, ["seedream5Pro"]);
  assert.equal(restored.controls.ratio, "2:1");
  assert.equal(restored.controls.resolution, "4K");
  assert.equal(restored.controls.quality, "high");
});


test("Beta忽略已撤销精模六组合草稿且保留光影来源", () => {
  const storage = memoryStorage();
  const refinedLighting = { mode: "unselected" };
  saveBetaPageState(storage, { featureMode: "refinedModel", controls: {
    refinedLighting, refinedFinish: { intensity: "high", tone: "cool" },
    refinedFinishPromptVersion: 1, refinedFinishPromptSha256: "a".repeat(64),
  } });
  const restored = readBetaPageState(storage);
  assert.deepEqual(restored.controls.refinedLighting, refinedLighting);
  for (const key of ["refinedFinish", "refinedFinishPromptVersion", "refinedFinishPromptSha256"]) {
    assert.equal(key in restored.controls, false);
  }
});

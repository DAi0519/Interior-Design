/**
 * [INPUT]: 依赖 node:test/assert、内存 localStorage/DOM 替身与 beta-page-state/beta-configuration 的配置归一化/持久化/恢复能力
 * [OUTPUT]: 对外提供 Beta跑图默认 Flux、八功能目录兼容与美化强度色调配置往返、全景固定比例/4K 配置恢复、控制器恢复后落盘、非法存储降级与轻量状态边界回归保障
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

test("Beta恢复已保存美化控件，并把新选择落盘", () => {
  const storage = memoryStorage();
  const restoredPageState = saveBetaPageState(storage, {
    controls: { effectBeautificationIntensity: "high", effectBeautificationTone: "warm" },
    featureMode: "effectBeautification",
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
  assert.equal(elements.betaForm.dataset.configurationState, "saved");
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

/**
 * [INPUT]: 依赖 node:test/assert、内存 localStorage 替身与 beta-page-state 的配置归一化/持久化能力
 * [OUTPUT]: 对外提供 Beta跑图默认 Flux、配置往返、非法存储降级与轻量状态边界回归保障
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

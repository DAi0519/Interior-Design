/**
 * [INPUT]: 依赖 node:test/assert 与浏览器生成动作模块的纯状态推导函数
 * [OUTPUT]: 对外提供白模/空房首次单按钮、提示词复用双按钮、输入失效、自由生图隔离与忙碌态回归保障
 * [POS]: test 的生成动作状态单元测试，不创建 DOM 或发送真实请求
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";

import { generationActionState } from "../public/generation-actions.js";

function state(overrides = {}) {
  return generationActionState({
    currentIdentity: "current",
    featureMode: "whiteModel",
    reusableIdentity: null,
    ...overrides,
  });
}

test("白模首次渲染只显示开始渲染", () => {
  assert.deepEqual(state(), {
    hasReusablePrompt: false,
    mainLabel: "开始渲染",
  });
});

test("相同融合输入成功后显示再次渲染与重新融合", () => {
  assert.deepEqual(state({ reusableIdentity: "current" }), {
    hasReusablePrompt: true,
    mainLabel: "再次渲染",
  });
});

test("空房设计与白模共享提示词复用动作", () => {
  assert.deepEqual(
    state({ featureMode: "emptyRoom", reusableIdentity: "current" }),
    { hasReusablePrompt: true, mainLabel: "再次渲染" },
  );
});

test("融合输入变化会恢复首次渲染状态", () => {
  assert.equal(
    state({ currentIdentity: "changed", reusableIdentity: "current" })
      .hasReusablePrompt,
    false,
  );
});

test("自由生图始终保持单一开始生成按钮", () => {
  assert.deepEqual(
    state({ featureMode: "free", reusableIdentity: "current" }),
    { hasReusablePrompt: false, mainLabel: "开始生成" },
  );
});

test("生成期间主按钮显示忙碌文案", () => {
  assert.equal(state({ busy: true }).mainLabel, "生成中…");
});

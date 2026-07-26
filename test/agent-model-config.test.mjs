/**
 * [INPUT]: 依赖 src/agent-model-config.mjs 的 Prompt Agent 候选目录与能力过滤
 * [OUTPUT]: 验证真实模型 ID、图片输入门槛及接口可用性组合
 * [POS]: test 的 Prompt Agent 模型回归测试，不发送真实 API 请求
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  checkAgentModelAvailability,
  publicAgentModelCatalog,
} from "../src/agent-model-config.mjs";

test("Prompt Agent 目录只暴露七个已决策模型", () => {
  const catalog = publicAgentModelCatalog();
  assert.deepEqual(
    catalog.map(({ id, key }) => ({ id, key })),
    [
      { id: "deepseek-v4-pro", key: "deepseek4pro" },
      { id: "gemini-3.1-pro-preview", key: "gemini3pro" },
      { id: "gpt-5.5", key: "gpt" },
      { id: "claude-sonnet-5", key: "claude" },
      { id: "qwen3.5-plus", key: "qwen35plus" },
      { id: "doubao-seed-1.6-vision", key: "doubaoVision" },
      { id: "kimi-k2.5", key: "kimi25" },
    ],
  );
  assert.deepEqual(
    catalog
      .filter((model) => model.key === "gemini3pro")
      .map(({ id, label, shortLabel }) => ({ id, label, shortLabel })),
    [
      {
        id: "gemini-3.1-pro-preview",
        label: "Gemini 3.1 Pro",
        shortLabel: "Gemini 3.1 Pro",
      },
    ],
  );
});

test("接口存在但不支持图片输入的模型不可选择", () => {
  const availability = checkAgentModelAvailability([
    { id: "deepseek-v4-pro" },
    { id: "gemini-3.1-pro-preview" },
    { id: "gpt-5.5" },
    { id: "claude-sonnet-5" },
    { id: "qwen3.5-plus" },
    { id: "doubao-seed-1.6-vision" },
    { id: "kimi-k2.5" },
  ]);

  assert.equal(availability[0].available, true);
  assert.equal(availability[0].selectable, false);
  assert.equal(availability[0].reason, "不支持图片输入");
  assert.equal(availability.slice(1).every((model) => model.selectable), true);
});

test("API Key 未开放的候选模型不可选择", () => {
  const [deepseek, gemini] = checkAgentModelAvailability([
    { id: "deepseek-v4-pro" },
  ]);

  assert.equal(deepseek.available, true);
  assert.equal(gemini.available, false);
  assert.equal(gemini.selectable, false);
  assert.equal(gemini.reason, "当前 API Key 未开放");
});

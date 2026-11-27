/**
 * [INPUT]: 依赖 src/agent-model-config.mjs 的 Prompt Agent 候选目录与能力过滤
 * [OUTPUT]: 验证通用候选真实 ID、户型及机位共用 GPT 模型、图片输入门槛和逐模型 Key 权限
 * [POS]: test 的 Prompt Agent 模型回归测试，不发送真实 API 请求
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  agentModelOrThrow,
  checkAgentModelAvailability,
  publicAgentModelCatalog,
} from "../src/agent-model-config.mjs";

test("Prompt Agent 目录保持已验证模型的稳定 key 和 OneAPI ID", () => {
  const catalog = publicAgentModelCatalog();
  assert.deepEqual(
    catalog.map(({ id, key }) => ({ id, key })),
    [
      { id: "deepseek-v4-pro", key: "deepseek4pro" },
      { id: "deepseek-flash", key: "deepseekFlash" },
      { id: "gemini-3.1-pro-preview", key: "gemini3pro" },
      { id: "gemini-3.5-flash", key: "gemini35flash" },
      { id: "gpt-5.5", key: "gpt" },
      { id: "claude-sonnet-5", key: "claude" },
      { id: "qwen3.5-plus", key: "qwen35plus" },
      { id: "qwen3-vl-plus", key: "qwen3vlplus" },
      { id: "doubao-seed-1.8", key: "doubaoVision" },
      { id: "doubao-seed-2.0-lite", key: "doubaoSeed20Lite" },
      { id: "kimi-k2.5", key: "kimi25" },
      { id: "gpt-6.1-sol", key: "gpt61Sol" },
      { id: "gpt-6.2-sol", key: "gpt62Sol" },
      { id: "gpt-6.2-astra", key: "gpt62Astra" },
      { id: "gpt-6.1-terra", key: "gpt61Terra" },
      { id: "gemini-4-hydrogen", key: "gemini4Hydrogen" },
      { id: "claude-sonnet-5-5", key: "claudeSonnet55" },
      { id: "claude-opus-5-5", key: "claudeOpus55" },
      { id: "claude-haiku-5-5", key: "claudeHaiku55" },
      { id: "deepseek-v4-flash-vision-exp", key: "deepseekFlashVisionExp" },
      { id: "doubao-seed-2.0-mini", key: "doubaoSeed20Mini" },
      { id: "kimi-k3.1-pro", key: "kimi31Pro" },
      { id: "qwen3.6-plus", key: "qwen36plus" },
      { id: "qwen3.8-flash", key: "qwen38flash" },
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
    { id: "deepseek-flash" },
    { id: "gemini-3.1-pro-preview" },
    { id: "gemini-3.5-flash" },
    { id: "gpt-5.5" },
    { id: "claude-sonnet-5" },
    { id: "qwen3.5-plus" },
    { id: "qwen3-vl-plus" },
    { id: "doubao-seed-1.8" },
    { id: "doubao-seed-2.0-lite" },
    { id: "kimi-k2.5" },
    { id: "gpt-6.1-sol" },
    { id: "gpt-6.2-sol" },
    { id: "gpt-6.2-astra" },
    { id: "gpt-6.1-terra" },
    { id: "gemini-4-hydrogen" },
    { id: "claude-sonnet-5-5" },
    { id: "claude-opus-5-5" },
    { id: "claude-haiku-5-5" },
    { id: "deepseek-v4-flash-vision-exp" },
    { id: "doubao-seed-2.0-mini" },
    { id: "kimi-k3.1-pro" },
    { id: "qwen3.6-plus" },
    { id: "qwen3.8-flash" },
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

test("GPT 6.1 与 GPT 6.2 候选出现在户型、机位和其他 Agent，并逐项检查 Key 权限", () => {
  const candidates = [
    ["gpt61Sol", "gpt-6.1-sol"],
    ["gpt61Terra", "gpt-6.1-terra"],
    ["gpt62Sol", "gpt-6.2-sol"],
    ["gpt62Astra", "gpt-6.2-astra"],
  ];
  for (const featureMode of [undefined, "housePlanLayout", "floorPlanCamera", "emptyRoom", "whiteModel", "styleDna"]) {
    for (const [key, id] of candidates) {
      assert.equal(agentModelOrThrow(key, featureMode).id, id);
      const access = checkAgentModelAvailability([{ id }], featureMode);
      for (const [candidate] of candidates) {
        assert.equal(access.find((model) => model.key === candidate).selectable, candidate === key);
      }
    }
  }
});

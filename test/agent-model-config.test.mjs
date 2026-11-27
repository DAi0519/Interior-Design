/**
 * [INPUT]: 依赖 src/agent-model-config.mjs 的 Prompt Agent 候选目录与能力过滤
 * [OUTPUT]: 验证十一个通用模型的真实 ID、机位专用 GPT 6.1 Sol 与 GPT 6.2 Sol/Astra、图片输入门槛及接口可用性组合
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

test("Prompt Agent 目录只暴露十一个已决策模型", () => {
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

test("GPT 6.1 Sol 与 GPT 6.2 Sol/Astra 仅在平面图机位目录按当前 Key 开放", () => {
  const featureMode = "floorPlanCamera";
  const cameraModels = [
    { key: "gpt61Sol", id: "gpt-6.1-sol", label: "GPT 6.1 Sol", imageInput: true },
    { key: "gpt62Sol", id: "gpt-6.2-sol", label: "GPT 6.2 Sol", imageInput: true },
    { key: "gpt62Astra", id: "gpt-6.2-astra", label: "GPT 6.2 Astra", imageInput: true },
  ];
  const sharedKeys = new Set(publicAgentModelCatalog().map(({ key }) => key));
  assert.deepEqual(publicAgentModelCatalog(featureMode)
    .filter(({ key }) => !sharedKeys.has(key))
    .map(({ key, id, label, imageInput }) => ({ key, id, label, imageInput })), cameraModels);

  for (const { key, id } of cameraModels) {
    const listed = [{ id }];
    assert.equal(agentModelOrThrow(key, featureMode).id, id);
    assert.throws(() => agentModelOrThrow(key), /允许列表/);
    assert.equal(checkAgentModelAvailability(listed).some((model) => model.id === id), false);
    assert.equal(checkAgentModelAvailability(listed, "housePlanLayout").some((model) => model.id === id), false);

    const cameraAccess = checkAgentModelAvailability(listed, featureMode);
    assert.equal(cameraAccess.find((model) => model.key === key).selectable, true);
    for (const other of cameraModels.filter((model) => model.key !== key)) {
      const disabled = cameraAccess.find((model) => model.key === other.key);
      assert.equal(disabled.selectable, false);
      assert.equal(disabled.reason, "当前 API Key 未开放");
    }
  }
});

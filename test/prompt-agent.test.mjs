/**
 * [INPUT]: 依赖 node:test/assert 与 src/prompt-agent.mjs 的飞书行解析和配置读取
 * [OUTPUT]: 对外提供无 Agent 名称字段时的白模/反推展示名派生、脱敏已上架目录、版本选择、System Prompt 与分页边界回归保障
 * [POS]: test 的 Prompt Agent 配置测试，不读取或修改真实飞书 Base
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  getPublishedPromptAgent,
  listPublishedPromptAgentVersions,
  parsePromptAgentEnvelope,
} from "../src/prompt-agent.mjs";

const fields = [
  "Agent 编码",
  "版本",
  "上架状态",
  "场景类型",
  "System Prompt",
];

function envelope(rows, hasMore = false) {
  return { data: { data: rows, fields, has_more: hasMore }, ok: true };
}

test("解析已上架白模 Prompt Agent", async () => {
  const run = async () =>
    envelope([
      ["white-model-fusion", 2, ["上架"], ["白模渲染"], "Only JSON"],
    ]);
  const agent = await getPublishedPromptAgent("white-model-fusion", {
    config: { baseToken: "base", cliPath: "lark-cli", tableId: "table" },
    run,
  });

  assert.equal(agent.name, "白模渲染融合 Agent");
  assert.equal(agent.version, 2);
  assert.equal(agent.systemPrompt, "Only JSON");
});

test("同编码多版本只选择最高已上架完整版本", async () => {
  const run = async () =>
    envelope([
      ["white-model-fusion", 1, ["下架"], ["白模渲染"], "v1"],
      ["white-model-fusion", 2, ["上架"], ["白模渲染"], "v2"],
      ["white-model-fusion", 4, ["上架"], ["白模渲染"], ""],
      ["white-model-fusion", 3, ["上架"], ["白模渲染"], "v3"],
      ["other-agent", 99, ["上架"], [], "other"],
    ]);

  const agent = await getPublishedPromptAgent("white-model-fusion", {
    config: { baseToken: "base", cliPath: "lark-cli", tableId: "table" },
    run,
  });

  assert.equal(agent.version, 3);
  assert.equal(agent.systemPrompt, "v3");

  const versions = await listPublishedPromptAgentVersions(
    "white-model-fusion",
    {
      config: { baseToken: "base", cliPath: "lark-cli", tableId: "table" },
      run,
    },
  );
  assert.deepEqual(versions, [
    { code: "white-model-fusion", name: "白模渲染融合 Agent", version: 3 },
    { code: "white-model-fusion", name: "白模渲染融合 Agent", version: 2 },
  ]);
});

test("可以精确选择任一已上架 Prompt 版本", async () => {
  const run = async () =>
    envelope([
      ["style-dna-reverse", 1, ["上架"], ["风格反推"], "v1"],
      ["style-dna-reverse", 2, ["上架"], ["风格反推"], "v2"],
    ]);
  const agent = await getPublishedPromptAgent("style-dna-reverse", {
    config: { baseToken: "base", cliPath: "lark-cli", tableId: "table" },
    run,
    version: 1,
  });

  assert.equal(agent.version, 1);
  assert.equal(agent.systemPrompt, "v1");
  await assert.rejects(
    getPublishedPromptAgent("style-dna-reverse", {
      config: { baseToken: "base", cliPath: "lark-cli", tableId: "table" },
      run,
      version: 3,
    }),
    /v3 未上架/,
  );
});

test("拒绝不完整分页和下架配置", async () => {
  assert.throws(() => parsePromptAgentEnvelope(envelope([], true)), /超过 200 条/);
  await assert.rejects(
    () =>
      getPublishedPromptAgent("white-model-fusion", {
        config: { baseToken: "base", cliPath: "lark-cli", tableId: "table" },
        run: async () =>
          envelope([["white-model-fusion", 1, ["下架"], [], "prompt"]]),
      }),
    /未上架/,
  );
});

test("同一读取器支持 AI 生图 Base 内独立的风格反推 Prompt 表", async () => {
  const agent = await getPublishedPromptAgent("style-dna-reverse", {
    config: { baseToken: "reverse-base", cliPath: "lark-cli", tableId: "reverse-table" },
    run: async () =>
      envelope([
        ["style-dna-reverse", 1, ["上架"], ["风格反推"], "Reverse JSON"],
      ]),
  });

  assert.equal(agent.code, "style-dna-reverse");
  assert.equal(agent.name, "Style DNA 反推 Agent");
  assert.equal(agent.systemPrompt, "Reverse JSON");
});

/**
 * [INPUT]: 依赖 node:test/assert 与 src/prompt-agent.mjs 的飞书行解析和配置读取
 * [OUTPUT]: 对外提供 Prompt Agent 上架状态、System Prompt 与分页边界回归保障
 * [POS]: test 的 Prompt Agent 配置测试，不读取或修改真实飞书 Base
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  getPublishedPromptAgent,
  parsePromptAgentEnvelope,
} from "../src/prompt-agent.mjs";

const fields = [
  "Agent 名称",
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
      ["白模渲染融合 Agent", "white-model-fusion", 2, ["上架"], ["白模渲染"], "Only JSON"],
    ]);
  const agent = await getPublishedPromptAgent("white-model-fusion", {
    config: { baseToken: "base", cliPath: "lark-cli", tableId: "table" },
    run,
  });

  assert.equal(agent.version, 2);
  assert.equal(agent.systemPrompt, "Only JSON");
});

test("拒绝不完整分页和下架配置", async () => {
  assert.throws(() => parsePromptAgentEnvelope(envelope([], true)), /超过 200 条/);
  await assert.rejects(
    () =>
      getPublishedPromptAgent("white-model-fusion", {
        config: { baseToken: "base", cliPath: "lark-cli", tableId: "table" },
        run: async () =>
          envelope([["白模", "white-model-fusion", 1, ["下架"], [], "prompt"]]),
      }),
    /未上架/,
  );
});

/**
 * [INPUT]: 依赖 node:test/assert 与 src/prompt-agent.mjs 的飞书行解析和配置读取
 * [OUTPUT]: 对外提供可选 Agent 名称字段、无名称字段时的白模/空房/风格转换双模式/反推展示名派生、脱敏已上架目录、独立空房和风格转换双配置、版本选择、System Prompt 与分页边界回归保障
 * [POS]: test 的 Prompt Agent 配置测试，不读取或修改真实飞书 Base
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  getPublishedPromptAgent,
  listPublishedPromptAgentVersions,
  parsePromptAgentEnvelope,
  publicEmptyRoomConfig,
  publicStyleTransferConfig,
  STYLE_TRANSFER_PROMPT_CONFIG,
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

test("Agent 名称字段存在时优先作为版本目录展示名", async () => {
  const namedFields = [...fields, "Agent 名称"];
  const run = async () => ({
    data: {
      data: [[
        "white-model-fusion",
        7,
        ["上架"],
        ["白模渲染"],
        "Only JSON",
        "白模场景融合 Agent",
      ]],
      fields: namedFields,
      has_more: false,
    },
    ok: true,
  });

  const versions = await listPublishedPromptAgentVersions(
    "white-model-fusion",
    {
      config: { baseToken: "base", cliPath: "lark-cli", tableId: "table" },
      run,
    },
  );

  assert.deepEqual(versions, [
    { code: "white-model-fusion", name: "白模场景融合 Agent", version: 7 },
  ]);
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

test("空房设计独立表向前端公开智能默认与融合版本目录", async () => {
  const config = await publicEmptyRoomConfig({
    run: async () =>
      envelope([
        ["empty-room-smart-default", 1, ["上架"], ["空房设计"], "Smart Prompt"],
        ["empty-room-fusion", 2, ["上架"], ["空房设计"], "Fusion Prompt"],
      ]),
  });

  assert.deepEqual(config, {
    promptAgent: {
      defaultVersion: 2,
      versions: [{
        code: "empty-room-fusion",
        name: "空房风格融合 Agent",
        published: true,
        validPrompt: true,
        version: 2,
      }],
    },
    smartDefault: {
      available: true,
      description: "AI 根据空间自主确定整体风格，统筹墙地顶、材质与灯光，并满足家具需求；有参考图时遵循参考风格",
      name: "空房智能默认 Agent",
      version: 1,
    },
  });
  assert.equal("systemPrompt" in config.smartDefault, false);
});

test("风格转换独立表公开双 Agent 脱敏目录，正文与白模空房资产隔离", async () => {
  const reads = [];
  const config = await publicStyleTransferConfig({ forceRefresh: true, run: async (_config, args) => {
    reads.push(args);
    return envelope([
      ["style-transfer-reference", 1, ["上架"], ["风格转换"], "Reference secret"],
      ["style-transfer-fusion", 2, ["上架"], ["风格转换"], "Fusion secret"],
    ]);
  } });
  assert.equal(reads.every((args) => args[args.indexOf("--table-id") + 1] === STYLE_TRANSFER_PROMPT_CONFIG.tableId), true);
  assert.equal(config.promptAgent.defaultVersion, 2);
  assert.equal(config.promptAgent.versions[0].code, "style-transfer-fusion");
  assert.equal(config.promptAgent.versions[0].name, "风格转换融合 Agent");
  assert.equal(config.reference.available, true);
  assert.equal(config.reference.name, "风格转换参考图 Agent");
  assert.match(config.reference.description, /保留原图空间结构、视角与布局/);
  assert.equal("smartDefault" in config, false);
  assert.equal(JSON.stringify(config).includes("secret"), false);
});

test("风格转换双 Agent 各自降级可用性，不回退到其他功能 Prompt", async () => {
  const config = await publicStyleTransferConfig({ run: async () => envelope([
    ["style-transfer-reference", 1, ["下架"], ["风格转换"], "Reference"],
    ["style-transfer-fusion", 1, ["上架"], ["风格转换"], ""],
    ["white-model-fusion", 9, ["上架"], ["白模渲染"], "Do not reuse"],
  ]) });
  assert.equal(config.reference.available, false);
  assert.equal(config.reference.version, null);
  assert.equal("smartDefault" in config, false);
  assert.equal(config.promptAgent.defaultVersion, null);
  assert.deepEqual(config.promptAgent.versions, []);
  assert.match(config.promptAgent.reason, /未上架或 System Prompt 为空/);
});

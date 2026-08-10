/**
 * [INPUT]: 依赖 node:test/assert 与精模 Prompt 飞书资产解析边界
 * [OUTPUT]: 对外提供草稿测试、已上架优先、指定版本、正文脱敏和分页字段校验回归保障
 * [POS]: test 的精模 Prompt 配置测试，不读取或修改真实飞书 Base
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  getRefinedModelPrompt,
  parseRefinedModelPromptEnvelope,
  publicRefinedModelPromptConfig,
} from "../src/refined-model-prompt.mjs";

const fields = ["Prompt 名称", "Prompt 编码", "版本", "上架状态", "Prompt 正文", "变更说明"];
const envelope = (rows, hasMore = false) => ({
  data: { data: rows, fields, has_more: hasMore },
  ok: true,
});
const options = {
  config: { baseToken: "base", cliPath: "lark-cli", tableId: "table" },
  run: async () => envelope([
    ["精模忠实渲染", "refined-model-render", 1, ["下架"], "fixed v1", "首版"],
    ["精模忠实渲染", "refined-model-render", 2, ["上架"], "fixed v2", "发布"],
  ]),
};

test("公开目录包含测试状态但绝不下发 Prompt 正文", async () => {
  const config = await publicRefinedModelPromptConfig(options);
  assert.equal(config.defaultVersion, 2);
  assert.deepEqual(config.versions.map((entry) => entry.published), [true, false]);
  assert.equal(JSON.stringify(config).includes("fixed v"), false);
});

test("服务端允许内部精确选择草稿并阻止正式链路读取草稿", async () => {
  const draft = await getRefinedModelPrompt("refined-model-render", {
    ...options,
    allowDraft: true,
    version: 1,
  });
  assert.equal(draft.prompt, "fixed v1");
  await assert.rejects(
    getRefinedModelPrompt("refined-model-render", { ...options, version: 1 }),
    /尚未上架/,
  );
});

test("拒绝不完整分页和缺失字段", () => {
  assert.throws(() => parseRefinedModelPromptEnvelope(envelope([], true)), /超过 200 条/);
  assert.throws(
    () => parseRefinedModelPromptEnvelope({ data: { data: [], fields: [] }, ok: true }),
    /缺少字段/,
  );
});

/**
 * [INPUT]: 依赖 node:test/assert 与精模 Prompt 飞书资产解析边界
 * [OUTPUT]: 对外提供仅已上架目录、下架版本阻断、最高/指定上架版本、正文脱敏和分页字段校验回归保障
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
    ["精模忠实渲染", "refined-model-render", 3, ["下架"], "fixed v3", "停用"],
  ]),
};

test("公开目录只包含已上架版本且绝不下发 Prompt 正文", async () => {
  const config = await publicRefinedModelPromptConfig(options);
  assert.equal(config.defaultVersion, 2);
  assert.deepEqual(config.versions.map((entry) => entry.version), [2]);
  assert.ok(config.versions.every((entry) => entry.published));
  assert.equal(JSON.stringify(config).includes("fixed v"), false);
});

test("下架版本即使使用旧内部测试参数也必须阻断", async () => {
  for (const version of [1, 3]) {
    await assert.rejects(
      getRefinedModelPrompt("refined-model-render", { ...options, allowDraft: true, version }),
      (error) => error.statusCode === 409 && /尚未上架/.test(error.message),
    );
  }
  const current = await getRefinedModelPrompt("refined-model-render", {
    ...options,
    allowDraft: true,
  });
  assert.equal(current.version, 2);
  const selected = await getRefinedModelPrompt("refined-model-render", { ...options, version: 2 });
  assert.equal(selected.prompt, "fixed v2");
});

test("全下架时目录为空且不能默认回退到下架版本", async () => {
  const retired = {
    ...options,
    run: async () => envelope([
      ["精模忠实渲染", "refined-model-render", 1, ["下架"], "retired", "停用"],
    ]),
  };
  assert.deepEqual(await publicRefinedModelPromptConfig(retired), { defaultVersion: null, versions: [] });
  await assert.rejects(
    getRefinedModelPrompt("refined-model-render", { ...retired, allowDraft: true }),
    (error) => error.statusCode === 409,
  );
});

test("默认最高完整上架版本并排除状态缺失和正文不完整的记录", async () => {
  const candidates = {
    ...options,
    run: async () => envelope([
      ["精模忠实渲染", "refined-model-render", 2, ["上架"], "fixed v2", "发布"],
      ["精模忠实渲染", "refined-model-render", 4, ["上架"], "fixed v4", "发布"],
      ["精模忠实渲染", "refined-model-render", 5, [], "fixed v5", "未配置状态"],
      ["精模忠实渲染", "refined-model-render", 6, ["上架"], "", "缺正文"],
    ]),
  };
  const config = await publicRefinedModelPromptConfig(candidates);
  assert.equal(config.defaultVersion, 4);
  assert.deepEqual(config.versions.map((entry) => entry.version), [4, 2]);
  assert.equal((await getRefinedModelPrompt("refined-model-render", candidates)).version, 4);
});

test("拒绝不完整分页和缺失字段", () => {
  assert.throws(() => parseRefinedModelPromptEnvelope(envelope([], true)), /超过 200 条/);
  assert.throws(
    () => parseRefinedModelPromptEnvelope({ data: { data: [], fields: [] }, ok: true }),
    /缺少字段/,
  );
});

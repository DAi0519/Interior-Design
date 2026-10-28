/**
 * [INPUT]: 依赖 node:test/assert/crypto、质感增强独立飞书资产读取器及同构Base响应夹具
 * [OUTPUT]: 验证独立表/编码隔离、最新与指定上架版本、缺失/下架零回退、正文SHA和脱敏可用性目录
 * [POS]: test 的质感增强Prompt资产合同测试，飞书CLI全部使用内存替身
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  DEFAULT_TEXTURE_ENHANCEMENT_PROMPT_CODE,
  getTextureEnhancementPrompt,
  publicTextureEnhancementPromptConfig,
} from "../src/texture-enhancement-prompt.mjs";

const fields = ["Prompt 名称", "Prompt 编码", "版本", "上架状态", "Prompt 正文", "变更说明"];
const config = { baseToken: "texture-base", tableId: "texture-table", cliPath: "lark-cli" };
const envelope = rows => ({ ok: true, data: { fields, data: rows, has_more: false } });
const row = (version, status = "上架", prompt = `质感增强飞书正文 v${version}`, code = DEFAULT_TEXTURE_ENHANCEMENT_PROMPT_CODE) =>
  ["质感增强 Prompt", code, version, [status], prompt, "独立配置"];

test("独立质感表选择最新上架正文与明确版本，不消费其他功能或本地词", async () => {
  const calls = [];
  const options = { config, run: async (_options, args) => { calls.push(args); return envelope([
    row(1), row(2), row(3, "下架"), row(99, "上架", "不可跨功能读取", "effect-render-beautification"),
  ]); } };
  const latest = await getTextureEnhancementPrompt(options);
  assert.equal(latest.version, 2);
  assert.equal(latest.prompt, "质感增强飞书正文 v2");
  assert.equal(latest.sha256, createHash("sha256").update(latest.prompt).digest("hex"));
  assert.equal((await getTextureEnhancementPrompt({ ...options, version: 1 })).prompt, "质感增强飞书正文 v1");
  for (const args of calls) {
    assert.equal(args[args.indexOf("--table-id") + 1], config.tableId);
    assert.equal(args.includes("时段提示词"), false);
  }
  await assert.rejects(getTextureEnhancementPrompt({ ...options, version: 3 }), error => error.statusCode === 409 && /尚未上架/.test(error.message));
  await assert.rejects(getTextureEnhancementPrompt({ ...options, version: "invalid" }), error => error.statusCode === 400);
});

test("配置缺失、全部下架、正文无效与CLI失败均不回退本地固定词", async () => {
  const unavailable = [
    { config: { ...config, tableId: "" }, run: async () => { throw new Error("不应读取"); } },
    { config, run: async () => envelope([]) },
    { config, run: async () => envelope([row(1, "下架")]) },
    { config, run: async () => envelope([row(1, "上架", "")]) },
    { config, run: async () => { throw new Error("独立Prompt表不可访问"); } },
  ];
  for (const options of unavailable) {
    await assert.rejects(getTextureEnhancementPrompt(options), error => error.statusCode === 409);
    const publicConfig = await publicTextureEnhancementPromptConfig(options);
    assert.equal(publicConfig.available, false);
    assert.equal(publicConfig.version, null);
    assert.deepEqual(publicConfig.versions, []);
    assert.equal("prompt" in publicConfig, false);
    assert.ok(publicConfig.reason);
  }
});

test("公开目录仅包含上架质感版本与SHA，不泄漏运营正文", async () => {
  const publicConfig = await publicTextureEnhancementPromptConfig({ config, forceRefresh: true,
    run: async () => envelope([row(1), row(2, "上架", "独立表专属秘密正文"), row(3, "下架")]) });
  assert.equal(publicConfig.available, true);
  assert.equal(publicConfig.defaultVersion, 2);
  assert.equal(publicConfig.version, 2);
  assert.deepEqual(publicConfig.versions.map(entry => entry.version), [2, 1]);
  assert.equal(publicConfig.tableUrl, "https://lq9n5lvfn2i.feishu.cn/base/texture-base?table=texture-table");
  assert.equal(publicConfig.sha256, createHash("sha256").update("独立表专属秘密正文").digest("hex"));
  assert.doesNotMatch(JSON.stringify(publicConfig), /独立表专属秘密正文|质感增强飞书正文/);
});

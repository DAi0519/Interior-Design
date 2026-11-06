/**
 * [INPUT]: 依赖独立平面布局 Prompt 读取器与飞书 Agent 列表/记录替身
 * [OUTPUT]: 验证独立表、唯一上架版本、正文SHA、缺配置/下架/漂移阻断及目录脱敏
 * [POS]: test 的平面布局 Prompt 资产合同，不访问真实飞书
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { getFloorPlanPrompt, publicFloorPlanPromptConfig, parseFloorPlanPrompt, FLOOR_PLAN_PROMPT_CODE } from "../src/floor-plan-prompt.mjs";

const body = JSON.stringify({ version: 2, layout: "PRIVATE_FLOOR_PLAN_SYSTEM_PROMPT", adjust: "ADJUST_RULE", interior: "INTERIOR_RULE" });
const sha256 = createHash("sha256").update(body).digest("hex");
const config = { baseToken: "test-base", tableId: "test-floor-plan", cliPath: "unused" };
const record = { code: FLOOR_PLAN_PROMPT_CODE, name: "平面布局 Prompt", version: 2, published: true, systemPrompt: body + "\n" };
const options = { config, listVersions: async () => [{ code: record.code, name: record.name, version: 2 }],
  getAgent: async () => record };

test("独立表和编码读取资产，冻结实际trim后正文SHA且公开配置没有正文", async () => {
  const calls = [];
  const asset = await getFloorPlanPrompt({ ...options, forceRefresh: true, version: 2, expectedSha256: sha256,
    getAgent: async (code, reading) => { calls.push({ code, reading }); return record; } });
  assert.equal(asset.sha256, sha256);
  assert.equal(asset.prompt, body);
  assert.equal(calls[0].code, "floor-plan-layout");
  assert.equal(calls[0].reading.config.tableId, config.tableId);
  assert.equal(calls[0].reading.forceRefresh, true);
  const publicConfig = await publicFloorPlanPromptConfig(options);
  assert.equal(publicConfig.available, true);
  assert.equal(publicConfig.version, 2);
  assert.doesNotMatch(JSON.stringify(publicConfig), /PRIVATE_FLOOR_PLAN_SYSTEM_PROMPT|systemPrompt/);
});

test("缺配置、缺版本、重复上架版本、下架和正文漂移均阻断，无本地回退", async () => {
  for (const override of [
    { config: { ...config, tableId: "" } },
    { listVersions: async () => [] },
    { listVersions: async () => [{ version: 2 }, { version: 2 }] },
    { listVersions: async () => [{ version: 3 }], version: 2 },
    { getAgent: async () => ({ ...record, published: false }) },
    { getAgent: async () => ({ ...record, systemPrompt: "" }) },
    { expectedSha256: "0".repeat(64) },
  ]) await assert.rejects(getFloorPlanPrompt({ ...options, ...override }), { statusCode: 409 });
});

test("版本和SHA格式在资产I/O前拒绝，读取失败错误不会泄露上游正文", async () => {
  let reads = 0;
  for (const override of [{ version: "1" }, { version: 0 }, { expectedSha256: "bad" }]) {
    await assert.rejects(getFloorPlanPrompt({ ...options, ...override, listVersions: async () => { reads += 1; return []; } }), { statusCode: 400 });
  }
  assert.equal(reads, 0);
  const unavailable = await publicFloorPlanPromptConfig({ ...options, getAgent: async () => { throw new Error(body + " secret-key"); } });
  assert.equal(unavailable.available, false);
  assert.doesNotMatch(JSON.stringify(unavailable), /PRIVATE_FLOOR_PLAN_SYSTEM_PROMPT|secret-key/);
});


test("JSON资产仅接受完整v2三动作文本，旧HouseSpec正文不可继续执行", () => {
  assert.equal(parseFloorPlanPrompt(body).version, 2);
  for (const source of ["legacy raw prompt", JSON.stringify({ version: 1, layout: "a", adjust: "b", interior: "c" }),
    JSON.stringify({ version: 2, layout: "a", adjust: "b" }),
    JSON.stringify({ version: 2, layout: "a", adjust: "b", interior: "c", camera: "extra" }),
    JSON.stringify({ version: 2, layout: "{{placeholder}}", adjust: "b", interior: "c" }),
    JSON.stringify({ version: 2, layout: "a", adjust: "", interior: "c" })]) {
    assert.throws(() => parseFloorPlanPrompt(source), { statusCode: 409 });
  }
});

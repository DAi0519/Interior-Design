/**
 * [INPUT]: 依赖平面图机位渲染独立资产读取器、同构飞书记录与只读CLI替身
 * [OUTPUT]: 验证独立Agent资产全文/SHA、最低v2门槛、拒旧直接生图编码、版本冻结、缺失下架重复阻断、单表读取及公开脱敏
 * [POS]: test 的机位渲染 Prompt 合同，不访问真实飞书或生图模型
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { FLOOR_PLAN_CAMERA_PROMPT_CODE, FLOOR_PLAN_CAMERA_PROMPT_CONFIG, FLOOR_PLAN_CAMERA_PROMPT_MIN_VERSION,
  parseFloorPlanCameraPrompt, getFloorPlanCameraPrompt, publicFloorPlanCameraPromptConfig } from "../src/floor-plan-camera-prompt.mjs";

const fields = ["Prompt 名称", "Prompt 编码", "版本", "上架状态", "Prompt 正文", "变更说明"];
const config = { baseToken: "camera-base", tableId: "camera-table", cliPath: "camera-cli" };
const raw = "PRIVATE_BODY 单图空间推理系统指令。\n\n  从C点按箭头方向拍摄真实室内。";
const hash = (text) => createHash("sha256").update(text).digest("hex");
const row = (extra = {}) => ({ name: "平面图机位空间推理 Agent", code: FLOOR_PLAN_CAMERA_PROMPT_CODE,
  version: 2, prompt: raw, published: true, ...extra });
function reader(entries, extra = {}) {
  const calls = [];
  return { calls, async run(options, args) {
    calls.push({ options, args });
    return { ok: true, data: { fields, has_more: false,
      data: entries.map((entry) => [entry.name, entry.code, entry.version, [entry.published ? "上架" : "下架"], entry.prompt, "fixture"]), ...extra } };
  } };
}
const load = (entries, options = {}) => getFloorPlanCameraPrompt({ config, run: reader(entries).run, ...options });
const safe = (error) => error.statusCode === 409 && error.floorPlanSafe && !error.message.includes("PRIVATE");

test("独立表单次读取最高上架版本，保留完整正文与内部空白并按trim原文计算SHA", async () => {
  const fixture = reader([row(), row({ version: 3, prompt: ` \n${raw}\n ` }), row({ version: 4, published: false }),
    row({ code: "floor-plan-layout", version: 999 })]);
  const asset = await getFloorPlanCameraPrompt({ config, run: fixture.run, forceRefresh: true });
  assert.equal(asset.version, 3); assert.equal(asset.prompt, raw); assert.equal(asset.sha256, hash(raw));
  assert.equal(asset.source, "feishu:camera-table:floor-plan-camera-agent@v3"); assert.equal(fixture.calls.length, 1);
  assert.ok(fixture.calls[0].args.includes("camera-table"));
  assert.equal(fixture.calls[0].args.includes("时段提示词"), false);
  assert.equal(FLOOR_PLAN_CAMERA_PROMPT_CONFIG.tableId, "tblfaU86CV0kY0L1");
});

test("显式冻结版本和SHA，正文漂移或下架不回退其他版本", async () => {
  const asset = await load([row(), row({ version: 3, prompt: "v2" })], { version: 2, expectedSha256: hash(raw).toUpperCase() });
  assert.equal(asset.prompt, raw);
  await assert.rejects(load([row()], { expectedSha256: hash("changed") }), safe);
  await assert.rejects(load([row({ published: false }), row({ version: 3 })], { version: 2 }), safe);
  await assert.rejects(load([row()], { version: 99 }), safe);
});

test("缺失、同号重复及任一已上架非法正文阻断，不采用旧资产或其他编码", async () => {
  for (const entries of [[], [row({ code: "floor-plan-layout" })], [row({ code: "floor-plan-camera" })], [row(), row()],
    [row(), row({ published: false })], [row(), row({ version: 3, prompt: " " })],
    [row(), row({ version: 3, name: "" })], [row(), row({ version: 0 })],
    [row(), row({ version: 3, prompt: "${PRIVATE}" })]]) await assert.rejects(load(entries), safe);
});

test("无效版本与SHA在读取前拒绝，正文超长及未处理占位符不能上架运行", async () => {
  for (const version of [true, {}, [], "", 0, -1, 1.2, Infinity]) {
    const fixture = reader([row()]);
    await assert.rejects(getFloorPlanCameraPrompt({ config, run: fixture.run, version }), (error) => error.statusCode === 400);
    assert.equal(fixture.calls.length, 0);
  }
  for (const expectedSha256 of [1, {}, "", "z".repeat(64), "a".repeat(63)]) {
    await assert.rejects(load([row()], { expectedSha256 }), (error) => error.statusCode === 400);
  }
  for (const text of [null, {}, [], "", " ", "a".repeat(16001), "{{PRIVATE}}", "${PRIVATE}"]) {
    assert.throws(() => parseFloorPlanCameraPrompt(text), safe);
  }
});

test("公开配置只含身份无正文，远端异常脱敏且缺资产明确不可用", async () => {
  const value = await publicFloorPlanCameraPromptConfig({ config, run: reader([row()]).run });
  assert.equal(value.available, true); assert.equal(value.defaultVersion, 2);
  assert.equal(value.sha256, hash(raw)); assert.ok(!JSON.stringify(value).includes("PRIVATE_BODY"));
  assert.equal(value.prompt, undefined);
  const unavailable = await publicFloorPlanCameraPromptConfig({ config, run: async () => { throw new Error("PRIVATE_CREDENTIAL"); } });
  assert.equal(unavailable.available, false); assert.deepEqual(unavailable.versions, []);
  assert.ok(!JSON.stringify(unavailable).includes("PRIVATE"));
  await assert.rejects(getFloorPlanCameraPrompt({ config, run: reader([row()], { has_more: true }).run }), safe);
});

test("v1自由正文资产不能进入新JSON链路，目录仅暴露v2及以上", async () => {
  assert.equal(FLOOR_PLAN_CAMERA_PROMPT_MIN_VERSION, 2);
  await assert.rejects(load([row({ version: 1 })]), safe);
  const fixture = reader([row(), row({ version: 1 })]);
  await assert.rejects(getFloorPlanCameraPrompt({ config, run: fixture.run, version: 1 }), safe);
  assert.equal(fixture.calls.length, 0);
  const value = await publicFloorPlanCameraPromptConfig({ config, run: fixture.run });
  assert.equal(value.defaultVersion, 2); assert.deepEqual(value.versions.map(item => item.version), [2]);
});

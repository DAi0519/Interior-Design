/**
 * [INPUT]: 依赖渲染台纯卡片读取/冻结工具、共享typed几何和内存光影库替身
 * [OUTPUT]: 验证现有库最高上架目录、公开身份脱敏、单卡正文冻结/漂移阻断与无卡零库读取
 * [POS]: test 的AI渲染台光影来源合同，不读取精模/打光Prompt或卡片图片，不调用网络和模型
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { readAiRenderStudioLightingConfig, prepareAiRenderStudioLightingPreset, assertAiRenderStudioLightingPresetCurrent,
  normalizeAiRenderStudioLightingPresetSnapshot, aiRenderStudioLightingPresetIdentity, aiRenderStudioLightingPlan } from "../src/ai-render-studio-lighting.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const preset = { id: "recStudioLight1", code: "cinematic-soft-light", name: "电影柔光", version: 5,
  sha256: hash("real-card-identity"), prompt: "CARD_ATMOSPHERE\n\nCARD_SOURCE_ARRANGEMENT\n\nCARD_TEMPERATURE_EXPOSURE",
  description: "卡片说明", category: "自然光", order: 1, attachment: { fileToken: "PRIVATE_ATTACHMENT_TOKEN" } };
const selection = { id: preset.id, version: preset.version, sha256: preset.sha256 };

test("目录只用现有库卡片并按code取最高版，九卡身份与预览脱敏公开", async () => {
  const cards = Array.from({ length: 9 }, (_, i) => ({ ...preset, id: `recStudioLight${i + 1}`, code: `card-${i + 1}`, order: i }));
  const config = await readAiRenderStudioLightingConfig({ loadAssets: async () => ({ presets: [
    ...cards, { ...cards[0], id: "recOlderCard", version: 4, sha256: hash("old"), order: 0 },
  ] }) });
  assert.equal(config.lightingPresets.length, 9);
  assert.equal(config.lightingPresets[0].id, cards[0].id);
  assert.equal(config.defaultLightingPreset, null);
  assert.match(config.lightingPresets[0].previewUrl, /api\/refined-lighting\/preview\?id=recStudioLight1&version=5&sha256=/);
  assert.doesNotMatch(JSON.stringify(config), /CARD_ATMOSPHERE|PRIVATE_ATTACHMENT_TOKEN|fileToken|prompt/);
});

test("单卡身份读取三段原文，强制新鲜读取且不保留附件token", async () => {
  const options = [];
  const frozen = await prepareAiRenderStudioLightingPreset(selection, { loadAssets: async (value) => { options.push(value); return { presets: [preset] }; } });
  assert.equal(frozen.prompt, preset.prompt);
  assert.equal(frozen.promptSha256, hash(preset.prompt));
  assert.deepEqual(options, [{ forceRefresh: true }]);
  assert.equal(Object.keys(frozen).length, 7);
  assert.equal(Object.hasOwn(frozen, "attachment"), false);
  assert.equal(Object.hasOwn(aiRenderStudioLightingPresetIdentity(frozen), "prompt"), false);
});

test("无卡可只材质或手动控光，不依赖光影库可用性", async () => {
  const loadAssets = () => assert.fail("无卡不能读取光影库");
  assert.equal(await prepareAiRenderStudioLightingPreset(null, { loadAssets }), null);
  await assertAiRenderStudioLightingPresetCurrent(null, { loadAssets });
  const unavailable = await readAiRenderStudioLightingConfig({ loadAssets: async () => { throw new Error("offline"); } });
  assert.equal(unavailable.lightingPresetAvailable, false);
  assert.deepEqual(unavailable.lightingPresets, []);
});

test("客户端不能替换卡片词或跳过冻结身份，旧版/下架及正文漂移在执行前拒绝", async () => {
  for (const value of [{ ...selection, prompt: "CLIENT_INJECTED" }, { id: preset.id }, { ...selection, version: "5" },
    { ...selection, sha256: "bad" }, { ...selection, id: "" }]) {
    await assert.rejects(prepareAiRenderStudioLightingPreset(value, { loadAssets: () => assert.fail("非法身份不能读库") }), { statusCode: 400 });
  }
  const frozen = await prepareAiRenderStudioLightingPreset(selection, { loadAssets: async () => ({ presets: [preset] }) });
  for (const presets of [[], [{ ...preset, version: 6 }], [{ ...preset, sha256: hash("changed") }], [{ ...preset, prompt: "CHANGED_SAME_IDENTITY" }]]) {
    await assert.rejects(assertAiRenderStudioLightingPresetCurrent(frozen, { loadAssets: async () => ({ presets }) }), { statusCode: 409 });
  }
  assert.throws(() => normalizeAiRenderStudioLightingPresetSnapshot({ ...frozen, attachment: {} }), { statusCode: 409 });
  assert.throws(() => normalizeAiRenderStudioLightingPresetSnapshot({ ...frozen, prompt: "CHANGED" }), { statusCode: 409 });
});

test("完整计划只允许custom底层，卡片原词纳入计划而旧五模板一律拒绝", async () => {
  const frozen = await prepareAiRenderStudioLightingPreset(selection, { loadAssets: async () => ({ presets: [preset] }) });
  const input = { templateKey: "custom", blendMode: "balanced", originalLights: { action: "keep" }, lights: [], lightingPreset: frozen };
  const plan = aiRenderStudioLightingPlan(input);
  assert.equal(plan.lightingPreset.prompt, preset.prompt);
  for (const templateKey of ["naturalFill", "warmAmbient", "windowDaylight", "accentWash", "softStudio"]) {
    assert.throws(() => aiRenderStudioLightingPlan({ ...input, templateKey }), { statusCode: 409 });
  }
});

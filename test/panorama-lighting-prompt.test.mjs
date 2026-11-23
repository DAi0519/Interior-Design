/**
 * [INPUT]: 依赖飞书规则加载器/编译器、离线分段词夹具与Node测试
 * [OUTPUT]: 验证缺失/下架/重复/漂移在执行前阻断，且模板内部段落与用户文本保持
 * [POS]: 飞书全景规则真实资产合同测试，不访问飞书或GPU
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from "node:assert/strict";
import test from "node:test";
import { getPanoramaLightingRule, composePanoramaLightingRule, normalizePanoramaLightingRule,
  validatePanoramaLightingRulePrompt, PANORAMA_LIGHTING_PRESET_SLOT } from "../src/panorama-lighting-prompt.mjs";
import { panoramaRule, panoramaRuleSelection } from "./panorama-lighting-fixture.mjs";

const fields = ["Prompt 名称", "Prompt 编码", "版本", "上架状态", "Prompt 正文", "变更说明"];
const fake = rows => async () => ({ ok: true, data: { fields,
  data: rows.map(row => [row.name, row.code, row.version, row.published ? ["上架"] : ["下架"], row.prompt, ""]),
  record_id_list: rows.map(row => row.id), has_more: false } });

test("飞书规则按稳定编码读取并按完整正文SHA冻结，模板分段与美元字符不改写", async () => {
  const asset = await getPanoramaLightingRule({ run: fake([panoramaRule]) });
  assert.equal(asset.sha256, panoramaRuleSelection.sha256);
  assert.equal((await getPanoramaLightingRule({ run: fake([panoramaRule]), selection: panoramaRuleSelection })).id, panoramaRule.id);
  const preset = "[Atmosphere]\nKeep teal $& tones.\n\n[Lighting]\nWarm existing lights.";
  const body = composePanoramaLightingRule(asset.prompt, preset);
  assert.ok(body.includes(preset));
  assert.equal(body, panoramaRule.prompt.replace(PANORAMA_LIGHTING_PRESET_SLOT, () => preset));
  assert.ok(body.indexOf(preset) > body.indexOf("physical boundaries"));
  assert.ok(body.indexOf(preset) < body.indexOf("Only clearly identifiable existing luminaires"));
});

test("规则缺失/下架、重复版本、ID或全文漂移均拒绝，无本地正文回退", async () => {
  for (const rows of [[], [{ ...panoramaRule, published: false }], [panoramaRule, { ...panoramaRule, id: "recDuplicate" }]]) {
    await assert.rejects(getPanoramaLightingRule({ run: fake(rows) }));
  }
  for (const change of [{ id: "recDifferent" }, { prompt: panoramaRule.prompt + " Changed." }]) {
    await assert.rejects(getPanoramaLightingRule({ run: fake([{ ...panoramaRule, ...change }]), selection: panoramaRuleSelection }), /已更新/);
  }
});

test("非法/重复占位、提前附加触发词和伪造规则身份在编译前拒绝", () => {
  for (const prompt of ["", "No slot", PANORAMA_LIGHTING_PRESET_SLOT.repeat(2), panoramaRule.prompt + " zhiganEnhance"]) {
    assert.throws(() => validatePanoramaLightingRulePrompt(prompt));
  }
  for (const selection of [{ ...panoramaRuleSelection, version: 0 }, { ...panoramaRuleSelection, sha256: "invalid" },
    { ...panoramaRuleSelection, prompt: "injected" }]) assert.throws(() => normalizePanoramaLightingRule(selection));
});

test("完整保护规则模式保留模板段落，纯自定义不留下空模板标题", () => {
  const rule = `[LIGHTING PRESET]\n${PANORAMA_LIGHTING_PRESET_SLOT}\n\nPreserve existing structures and reflections.`;
  assert.equal(composePanoramaLightingRule(rule, "[Atmosphere]\nNight.\n\n[Lighting]\nExisting lamps."),
    "[LIGHTING PRESET]\n[Atmosphere]\nNight.\n\n[Lighting]\nExisting lamps.\n\nPreserve existing structures and reflections.");
  assert.equal(composePanoramaLightingRule(rule, ""), "Preserve existing structures and reflections.");
});

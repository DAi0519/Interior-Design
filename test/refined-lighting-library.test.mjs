/**
 * [INPUT]: 依赖 node:test/assert、临时文件与 sharp，注入光影卡片、独立精模Prompt及附件替身
 * [OUTPUT]: 对外提供卡片与控制Prompt分表/故障隔离、三模式目录脱敏、分页与原件/轻量预览身份的离线合同测试
 * [POS]: test 的光影资产边界验证，与预设单双图编译及浏览器测试分工，无真实飞书或生图调用
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from "node:assert/strict";
import test from "node:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { loadRefinedLightingAssets, loadRefinedLightingReference, parseRefinedLightingLibrary,
  publicRefinedLightingLibrary, readRefinedLightingPreview, loadRefinedRenderAssets } from "../src/refined-lighting-library.mjs";

const fields = ["名称", "编码", "类型", "分类", "说明", "氛围参考图", "光影提示词", "版本", "上架状态", "排序"];
const rule = ["参考规则", "lighting-prompt-render", ["参考规则"], ["规则"], "规则说明", [], "PRIVATE RULE", 1, ["上架"], 0];
const preset = ["自然柔光", "natural-soft", ["光影预设"], ["自然光"], "柔和漫射", [{file_token:"file-token",name:"soft.png",size:100}], "PRIVATE PRESET", 1, ["上架"], 1];
const envelope = (rows = [rule, preset]) => ({ ok: true, data: { fields, data: structuredClone(rows),
  record_id_list: rows.map((_, i) => `rec${i + 1}`), has_more: false } });
const promptAsset = (code, version) => ({ code, version, prompt: "PRIVATE CONTROL", published: true,
  sha256: "a".repeat(64), source: `feishu:prompts:${code}@v${version}`, tableId: "prompts" });
const promptAssets = {
  purePrompt: promptAsset("refined-lighting-base", 5),
  referenceRule: promptAsset("lighting-reference-transfer", 7),
  hybridRule: promptAsset("lighting-prompt-reference", 4),
  promptTableUrl: "https://example.test/base/prompts",
};
const noPrompts = { purePrompt: null, referenceRule: null, hybridRule: null, promptTableUrl: promptAssets.promptTableUrl };
const loadPrompts = async () => structuredClone(promptAssets);

test("光影库只解析上架卡片且忽略旧控制规则，正文/图片变化改变摘要，缺图与重复版本阻断", async () => {
  const draft = [...preset]; draft[8] = ["下架"]; draft[5] = [];
  const unknownRule = structuredClone(rule); unknownRule[1] = "unknown-old-rule"; unknownRule[6] = "";
  const entries = parseRefinedLightingLibrary(envelope([rule, unknownRule, preset, draft]));
  assert.equal(entries.length, 1);
  const changed = [...preset]; changed[6] = "changed";
  assert.notEqual(entries[0].sha256, parseRefinedLightingLibrary(envelope([changed]))[0].sha256);
  const changedImage = structuredClone(preset); changedImage[5][0].file_token = "replacement";
  assert.notEqual(entries[0].sha256, parseRefinedLightingLibrary(envelope([changedImage]))[0].sha256);
  const bad = [...preset]; bad[5] = [];
  assert.throws(() => parseRefinedLightingLibrary(envelope([bad])), /需要一张/);
  await assert.rejects(loadRefinedLightingAssets({ run: async () => envelope([rule, preset, preset]) }), /重复上架版本/);
});

test("共享卡片读取不调用精模Prompt，组合读取分别传递库和Prompt配置", async () => {
  const run = async (_config, args) => {
    const filter = JSON.parse(args[args.indexOf("--filter-json") + 1]);
    assert.ok(filter.conditions.some(condition => condition[0] === "类型" && condition[2][0] === "光影预设"));
    return envelope();
  };
  const library = await loadRefinedLightingAssets({ run,
    loadPrompts: () => assert.fail("共享卡片不读取精模Prompt") });
  assert.deepEqual(Object.keys(library).sort(), ["presets", "tableUrl"]);
  assert.equal(library.presets.length, 1);
  let promptQueries = 0;
  const combined = await loadRefinedRenderAssets({ run, forceRefresh: true,
    config: { baseToken: "cards", tableId: "cards-table" }, promptOptions: { marker: "prompt-only" },
    loadPrompts: async options => {
      promptQueries += 1;
      assert.deepEqual(options, { marker: "prompt-only", forceRefresh: true });
      return structuredClone(promptAssets);
    } });
  assert.equal(promptQueries, 1);
  assert.equal(combined.presets.length, 1);
  assert.equal(combined.purePrompt.version, 5);
  assert.equal(combined.referenceRule.tableId, "prompts");
  assert.equal(combined.rule, undefined);
  assert.match(combined.tableUrl, /base\/cards\?table=cards-table$/);
  assert.equal(combined.promptTableUrl, promptAssets.promptTableUrl);
});

test("公开目录以精模表三模式决定能力，纯词不再公开独立rule身份且正文附件脱敏", async () => {
  const config = await publicRefinedLightingLibrary({ run: async () => envelope(), loadPrompts });
  assert.equal(config.available, true);
  assert.equal(config.promptAvailable, true);
  assert.equal(config.multiplePresetSelections, true);
  assert.equal(config.referenceAvailable, true);
  assert.equal(config.hybridAvailable, true);
  assert.deepEqual(config.presetExecutions, ["prompt-only", "prompt-and-reference", "prompt-with-reference"]);
  assert.equal(config.ruleVersion, null);
  assert.equal(config.ruleSha256, null);
  assert.equal(config.referenceRuleVersion, 7);
  assert.equal(config.hybridRuleVersion, 4);
  assert.equal(config.referenceRuleSha256, promptAssets.referenceRule.sha256);
  assert.equal(config.hybridRuleSha256, promptAssets.hybridRule.sha256);
  assert.equal(config.promptTableUrl, promptAssets.promptTableUrl);
  assert.equal(config.presets[0].name, "自然柔光");
  assert.match(config.presets[0].previewUrl, /^\/api\/refined-lighting\/preview\?.*&sha256=[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(config), /PRIVATE|file-token|fileToken|"prompt"/);
  for (const [key, execution] of [["purePrompt", "prompt-only"], ["referenceRule", "prompt-and-reference"], ["hybridRule", "prompt-with-reference"]]) {
    const one = await publicRefinedLightingLibrary({ run: async () => envelope([preset]),
      loadPrompts: async () => ({ ...noPrompts, [key]: promptAssets[key] }) });
    assert.deepEqual(one.presetExecutions, [execution]);
    assert.equal(one.presets.length, 1);
  }
});

test("精模Prompt缺失或读取失败仍保留共享卡片，旧库规则不能充当回退", async () => {
  const missing = await publicRefinedLightingLibrary({ run: async () => envelope(), loadPrompts: async () => noPrompts });
  assert.equal(missing.available, false);
  assert.equal(missing.promptAvailable, false);
  assert.deepEqual(missing.presetExecutions, []);
  assert.equal(missing.presets.length, 1);
  assert.match(missing.reason, /精模渲染 Prompt 表/);
  const isolated = await publicRefinedLightingLibrary({ run: async () => envelope(),
    loadPrompts: async () => { throw new Error("精模Prompt无权限"); } });
  assert.equal(isolated.available, false);
  assert.equal(isolated.referenceAvailable, false);
  assert.equal(isolated.hybridAvailable, false);
  assert.equal(isolated.presets.length, 1);
  assert.match(isolated.reason, /精模Prompt无权限/);
  const syncFailure = await loadRefinedRenderAssets({ run: async () => envelope(),
    promptOptions: { config: { tableUrl: "https://example.test/unavailable-prompts" } },
    loadPrompts: () => { throw new Error("Prompt配置错误"); } });
  assert.equal(syncFailure.presets.length, 1);
  assert.equal(syncFailure.purePrompt, null);
  assert.equal(syncFailure.promptTableUrl, "https://example.test/unavailable-prompts");
  assert.match(syncFailure.promptReason, /Prompt配置错误/);
  const unavailable = await publicRefinedLightingLibrary({ loadPrompts,
    run: async () => { throw new Error("光影表不可用"); } });
  assert.equal(unavailable.available, false);
  assert.deepEqual(unavailable.presetExecutions, []);
  assert.deepEqual(unavailable.presets, []);
  assert.match(unavailable.reason, /光影表不可用/);
});

test("光影库分页不悄悄丢弃第201条，并只公开同编码最新上架版本", async () => {
  const rows = Array.from({length:199}, (_, i) => {
    const row = [...preset]; row[1] = `preset-${i}`; return row;
  });
  const first = envelope([rule,...rows]); first.data.has_more = true;
  const last = [...preset]; last[1] = "preset-0"; last[7] = 2;
  const second = envelope([last]); second.data.record_id_list = ["rec201"];
  const offsets = [];
  const run = async (_config, args) => {
    const offset = args[args.indexOf("--offset")+1]; offsets.push(offset);
    return offset === "0" ? first : second;
  };
  const result = await publicRefinedLightingLibrary({ run, loadPrompts });
  assert.deepEqual(offsets,["0","200"]);
  assert.equal(result.presets.length,199);
  assert.equal(result.presets.find(item => item.code === "preset-0").version,2);
});

test("库附件下载校验真实字节/尺寸，预览必须匹配版本和SHA且不返回原图", async () => {
  const bytes = await sharp({create:{width:800,height:600,channels:3,background:"#eee"}}).png().toBuffer();
  const row = structuredClone(preset); row[5][0].size = bytes.length;
  const assets = await loadRefinedLightingAssets({run:async () => envelope([rule,row])});
  const entry = assets.presets[0];
  const run = async (_config,args,options) => {
    if (args.includes("+record-list")) return envelope([rule,row]);
    assert.equal(args[args.indexOf("--file-token")+1],"file-token");
    await writeFile(join(options.cwd,args[args.indexOf("--output")+1]),bytes);
    return {ok:true};
  };
  const image = await loadRefinedLightingReference(entry,{run});
  assert.equal(image.width,800); assert.equal(image.height,600); assert.equal(image.size,bytes.length);
  assert.deepEqual(Buffer.from(image.dataUrl.split(",")[1], "base64"), bytes);
  await assert.rejects(loadRefinedLightingReference({...entry,attachment:{...entry.attachment,size:bytes.length+1}},{run}),/字节数校验/);
  await assert.rejects(readRefinedLightingPreview({id:entry.id,version:1,sha256:"bad"},{run}),/已变更或下架/);
  const preview = await readRefinedLightingPreview({id:entry.id,version:1,sha256:entry.sha256},{run});
  assert.equal(preview.mimeType,"image/webp");
  assert.equal((await sharp(preview.bytes).metadata()).width,640);
});

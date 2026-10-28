/**
 * [INPUT]: 依赖 node:test/assert、临时文件与 sharp，注入飞书光影库记录及附件替身
 * [OUTPUT]: 对外提供光影库上架/重复/分页/正文脱敏、预设两模式能力及原图完整字节/轻量预览身份的离线合同测试
 * [POS]: test 的光影资产边界验证，与预设单双图编译及浏览器测试分工，无真实飞书或生图调用
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from "node:assert/strict";
import test from "node:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { loadRefinedLightingAssets, loadRefinedLightingReference, parseRefinedLightingLibrary,
  publicRefinedLightingLibrary, readRefinedLightingPreview } from "../src/refined-lighting-library.mjs";

const fields = ["名称", "编码", "类型", "分类", "说明", "氛围参考图", "光影提示词", "版本", "上架状态", "排序"];
const rule = ["参考规则", "lighting-prompt-render", ["参考规则"], ["规则"], "规则说明", [], "PRIVATE RULE", 1, ["上架"], 0];
const preset = ["自然柔光", "natural-soft", ["光影预设"], ["自然光"], "柔和漫射", [{file_token:"file-token",name:"soft.png",size:100}], "PRIVATE PRESET", 1, ["上架"], 1];
const envelope = (rows = [rule, preset]) => ({ ok: true, data: { fields, data: structuredClone(rows),
  record_id_list: rows.map((_, i) => `rec${i + 1}`), has_more: false } });

test("光影库只解析上架资产，正文/图片变化改变摘要，缺图与重复版本阻断", async () => {
  const draft = [...preset]; draft[8] = ["下架"]; draft[5] = [];
  const entries = parseRefinedLightingLibrary(envelope([rule, preset, draft]));
  assert.equal(entries.length, 2);
  const changed = [...preset]; changed[6] = "changed";
  assert.notEqual(entries[1].sha256, parseRefinedLightingLibrary(envelope([changed]))[0].sha256);
  const bad = [...preset]; bad[5] = [];
  assert.throws(() => parseRefinedLightingLibrary(envelope([bad])), /需要一张/);
  await assert.rejects(loadRefinedLightingAssets({ run: async () => envelope([rule, preset, preset]) }), /重复上架版本/);
});

test("公开光影目录不含正文和附件token，保留版本摘要和同源预览；错误仅禁用光影模式", async () => {
  const config = await publicRefinedLightingLibrary({ run: async () => envelope() });
  assert.equal(config.available, true);
  assert.equal(config.promptAvailable, true);
  assert.equal(config.referenceAvailable, false);
  assert.deepEqual(config.presetExecutions, ["prompt-only"]);
  assert.equal(config.presets[0].name, "自然柔光");
  assert.match(config.presets[0].previewUrl, /^\/api\/refined-lighting\/preview\?.*&sha256=[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(config), /PRIVATE|file-token|fileToken|"prompt"/);
  const missing = await publicRefinedLightingLibrary({ run: async () => envelope([preset]) });
  assert.equal(missing.referenceAvailable, false);
  assert.equal(missing.promptAvailable, false);
  const oldRule = structuredClone(rule); oldRule[1] = "lighting-reference-transfer";
  const legacy = await publicRefinedLightingLibrary({ run: async () => envelope([oldRule, preset]) });
  assert.equal(legacy.available, true);
  assert.equal(legacy.promptAvailable, false);
  assert.deepEqual(legacy.presetExecutions, ["prompt-and-reference"]);
  assert.equal(legacy.referenceAvailable, true);
  assert.equal(legacy.ruleVersion, null);
  assert.equal(legacy.referenceRuleVersion, 1);
  const both = await publicRefinedLightingLibrary({ run: async () => envelope([rule, oldRule, preset]) });
  assert.equal(both.promptAvailable, true);
  assert.equal(both.referenceAvailable, true);
  assert.deepEqual(both.presetExecutions, ["prompt-only", "prompt-and-reference"]);
  assert.match(both.referenceRuleSha256, /^[a-f0-9]{64}$/);
  const unknown = structuredClone(rule); unknown[1] = "unknown-rule";
  const invalid = await publicRefinedLightingLibrary({ run: async () => envelope([rule, unknown, preset]) });
  assert.equal(invalid.available, false);
  assert.match(invalid.reason, /未知规则编码/);
  const unavailable = await publicRefinedLightingLibrary({ run: async () => { throw new Error("光影表不可用"); } });
  assert.equal(unavailable.available, false);
  assert.deepEqual(unavailable.presetExecutions, []);
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
  const result = await publicRefinedLightingLibrary({ run });
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

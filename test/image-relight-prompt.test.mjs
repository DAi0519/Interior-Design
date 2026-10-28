/**
 * [INPUT]: 依赖显式v7迁移快照、飞书表内存替身、打光JSON解析/版本loader及纯编译器
 * [OUTPUT]: 验证独立表准入/下架重复版本阻断、正文可编辑与安全错误、SHA冻结、脱敏目录和迁移Prompt语义
 * [POS]: test 的打光Prompt资产离线合同，不访问真实飞书、模型或Base写入
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { parseImageRelightPrompt, getImageRelightPrompt, publicImageRelightPromptConfig,
  DEFAULT_IMAGE_RELIGHT_PROMPT_CODE, IMAGE_RELIGHT_PROMPT_CONFIG } from "../src/image-relight-prompt.mjs";
import { buildRelightPrompt } from "../src/image-relight-oneapi.mjs";
import { relightSceneInstructions, relightPhotographicInstructions } from "../src/image-relight-presets.mjs";

const raw = (await readFile(new URL("../docs/image-relight-prompt-v7.json", import.meta.url), "utf8")).trim();
const seed = JSON.parse(raw);
const hash = value => createHash("sha256").update(value).digest("hex");
const config = { baseToken: "relight-unit-base", tableId: "relight-unit-table", cliPath: "fixture-cli" };
const fields = ["Prompt 名称", "Prompt 编码", "版本", "上架状态", "Prompt 正文", "变更说明"];
const row = (overrides = {}) => ({ name: "打光 Prompt", code: "image-relight", version: 7,
  published: true, prompt: raw, changeNote: "fixture", ...overrides });
function reader(entries) {
  const calls = [];
  const run = async (options, args) => {
    calls.push({ options, args });
    return { ok: true, data: { fields, data: entries.map(entry => [entry.name, entry.code,
      entry.version, [entry.published ? "上架" : "下架"], entry.prompt, entry.changeNote]), has_more: false } };
  };
  return { run, calls };
}
const load = (entries, options = {}) => getImageRelightPrompt({ config, run: reader(entries).run, ...options });
const light = { id: "L1", type: "point", points: [{ x: 0.2, y: 0.3 }], target: { x: 0.7, y: 0.6 },
  mode: "lightOnly", kelvin: 3000, intensity: 1, softness: "soft", fixture: "" };

test("JSON资产完整覆盖9模板与共享段落，解析原样返回且摄影正文可编辑", () => {
  assert.deepEqual(parseImageRelightPrompt(raw), seed);
  const changed = structuredClone(seed);
  changed.PHOTOGRAPHY.CAMERA_PROFILE = "  用户自定义相机参数原文  ";
  changed.TEMPLATES.naturalFill = "另一个运营确认的光照要求";
  assert.deepEqual(parseImageRelightPrompt(JSON.stringify(changed)), changed);
  assert.equal(parseImageRelightPrompt(JSON.stringify(changed)).PHOTOGRAPHY.CAMERA_PROFILE, "  用户自定义相机参数原文  ");
  assert.equal(Object.keys(seed.TEMPLATES).length, 9);
});

test("缺字段、错误类型、未知模板、空正文和未处理占位符阻断且错误不回显内容", () => {
  for (const mutate of [
    value => { delete value.TEMPLATES.warmAmbient; },
    value => { value.TEMPLATES.unknown = "unexpected"; },
    value => { value.STRENGTH.REBUILD.subtle = []; },
    value => { value.SCENE.LOCAL.BASELINE = "   "; },
    value => { value.PHOTOGRAPHY.CAMERA_PROFILE = 42; },
    value => { value.ADAPTER.INPUT.PLAIN = "{{secretPrompt}}"; },
    value => { value.ADAPTER.REBUILD_GUIDE = "${secretPrompt}"; },
    value => { value.SCHEMA_VERSION = 2; },
  ]) {
    const changed = structuredClone(seed); mutate(changed);
    assert.throws(() => parseImageRelightPrompt(JSON.stringify(changed)), error => error.statusCode === 409 && !error.message.includes("secretPrompt"));
  }
  assert.throws(() => parseImageRelightPrompt('{"secretPrompt":"不可泄露"'), error => error.statusCode === 409 && !error.message.includes("不可泄露"));
});

test("loader只读独立同构表，最高已上架资产按trim原文计算SHA并保留内部文本", async () => {
  const older = row({ version: 6, name: "旧上架" });
  const draft = row({ version: 9, name: "未上架", published: false });
  const fixture = reader([older, row({ prompt: " \n" + raw + "\n " }), draft]);
  const asset = await getImageRelightPrompt({ config, run: fixture.run, forceRefresh: true });
  assert.equal(asset.version, 7); assert.equal(asset.prompt, raw); assert.deepEqual(asset.bundle, seed);
  assert.equal(asset.code, "image-relight"); assert.equal(asset.published, true);
  assert.equal(asset.sha256, hash(raw)); assert.equal(asset.source, "feishu:relight-unit-table:image-relight@v7");
  assert.match(asset.tableUrl, /relight-unit-base\?table=relight-unit-table/);
  for (const call of fixture.calls) {
    assert.equal(call.options.cliPath, "fixture-cli");
    assert.ok(call.args.includes("relight-unit-table")); assert.ok(call.args.includes("relight-unit-base"));
    assert.equal(call.args.includes("tblzaSfyUMPnfARO"), false);
  }
  assert.equal(IMAGE_RELIGHT_PROMPT_CONFIG.tableId, "tblDCXNib9XeWuza");
  assert.equal(DEFAULT_IMAGE_RELIGHT_PROMPT_CODE, "image-relight");
});

test("版本下架或不存在不回退，最高上架非法也不挑更旧可用版本", async () => {
  const bad = row({ version: 8, prompt: "not-json-secret" });
  await assert.rejects(load([row(), bad]), error => error.statusCode === 409 && !error.message.includes("not-json-secret"));
  const unavailable = await publicImageRelightPromptConfig({ config, run: reader([row(), bad]).run });
  assert.equal(unavailable.available, false); assert.deepEqual(unavailable.versions, []);
  assert.equal(unavailable.reason.includes("not-json-secret"), false);
  await assert.rejects(load([row(), row({ version: 8, prompt: "" })]), { statusCode: 409 });
  await assert.rejects(load([row({ published: false })]), { statusCode: 409 });
  await assert.rejects(load([row(), row({ version: 8, published: false })], { version: 8 }), { statusCode: 409 });
  await assert.rejects(load([row()], { version: 99 }), { statusCode: 409 });
  await assert.rejects(load([row({ code: "refined-model-render" })]), { statusCode: 409 });
  for (const version of [0, -1, 2.5, "bad"]) await assert.rejects(load([row()], { version }), { statusCode: 400 });
});

test("同编码同版本重复阻断，不能凭表顺序选正文", async () => {
  for (const published of [true, false]) {
    const duplicates = [row(), row({ published, prompt: JSON.stringify({ ...seed, SCHEMA_VERSION: 2 }) })];
    await assert.rejects(load(duplicates), /重复版本/);
    assert.equal((await publicImageRelightPromptConfig({ config, run: reader(duplicates).run })).available, false);
  }
});

test("expectedSha冻结检测同版本正文变更，未冻结时允许运营修改摄影文本", async () => {
  const changed = structuredClone(seed); changed.PHOTOGRAPHY.CAMERA_PROFILE = "运营修订摄影文本";
  const editedRaw = JSON.stringify(changed);
  const updated = await load([row({ prompt: editedRaw })]);
  assert.equal(updated.bundle.PHOTOGRAPHY.CAMERA_PROFILE, "运营修订摄影文本");
  assert.notEqual(updated.sha256, hash(raw));
  await assert.rejects(load([row({ prompt: editedRaw })], { expectedSha256: hash(raw) }), /正文已变更/);
  assert.equal((await load([row()], { expectedSha256: hash(raw).toUpperCase() })).sha256, hash(raw));
  for (const expectedSha256 of ["", "abc", 1]) await assert.rejects(load([row()], { expectedSha256 }), { statusCode: 400 });
});

test("公开配置只给版本来源与SHA，解析和CLI故障不泄露正文", async () => {
  const published = await publicImageRelightPromptConfig({ config, run: reader([row(), row({ version: 6 })]).run });
  assert.equal(published.available, true); assert.equal(published.defaultVersion, 7);
  assert.equal(published.sha256, hash(raw)); assert.equal(published.versions.length, 2);
  for (const entry of [published, ...published.versions]) {
    assert.equal(Object.hasOwn(entry, "prompt"), false); assert.equal(Object.hasOwn(entry, "bundle"), false);
  }
  assert.equal(JSON.stringify(published).includes("佳能R1"), false);
  const failed = await publicImageRelightPromptConfig({ config, run: async () => { throw new Error("secret-body-fragment"); } });
  assert.equal(failed.available, false); assert.equal(failed.reason.includes("secret-body-fragment"), false);
});

test("编译必须显式注入资产，修改bundle共享段能进入全部模板而无默认代码回退", async () => {
  assert.throws(() => buildRelightPrompt({ templateKey: "naturalFill" }), { statusCode: 409 });
  assert.throws(() => relightSceneInstructions({ templateKey: "naturalFill" }), { statusCode: 409 });
  assert.throws(() => relightPhotographicInstructions({ templateKey: "naturalFill" }), { statusCode: 409 });
  const asset = await load([row()]);
  const changed = structuredClone(asset);
  changed.bundle.PHOTOGRAPHY.CAMERA_PROFILE = "运营摄影参数试验";
  for (const templateKey of Object.keys(seed.TEMPLATES)) {
    const text = buildRelightPrompt({ templateKey, lights: templateKey === "custom" ? [light] : [], relightPromptSnapshot: changed });
    assert.ok(text.includes("运营摄影参数试验")); assert.equal(text.includes("摄影参数：设备：佳能R1"), false);
  }
});

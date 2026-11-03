/**
 * [INPUT]: 依赖 AI 渲染台 JSON 解析器、飞书只读版本加载器和内存 CLI 记录替身
 * [OUTPUT]: 验证严格四风格与唯一保原材质模式、重复与下架阻断、单次读取、SHA冻结和公开目录脱敏
 * [POS]: test 的独立 AI 渲染台资产合同，不访问真实飞书或模型，不写 Base
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { AI_RENDER_STUDIO_PROMPT_CODE, AI_RENDER_STUDIO_PROMPT_CONFIG,
  parseAiRenderStudioPrompt, getAiRenderStudioPrompt, publicAiRenderStudioPromptConfig } from "../src/ai-render-studio-prompt.mjs";
import { REFINED_MODEL_PROMPT_CONFIG } from "../src/refined-model-prompt.mjs";

const seed = { schemaVersion: 1, renderBoundary: "RENDER_BODY_PRIVATE: 保持结构和材质身份。",
  lightingBoundary: "LIGHTING_BODY_PRIVATE: 仅按已确认光源方案照明。",
  materialModes: { faithful: "FAITHFUL_BODY_PRIVATE" },
  renderStyles: { photoreal: "PHOTOREAL_BODY_PRIVATE", soft: "SOFT_BODY_PRIVATE",
    cinematic: "CINEMATIC_BODY_PRIVATE", film: "FILM_BODY_PRIVATE" },
  output: "OUTPUT_BODY_PRIVATE: 返回单张真实摄影质感图片。" };
const raw = JSON.stringify(seed);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const config = { baseToken: "studio-unit-base", tableId: "studio-unit-table", cliPath: "studio-unit-cli" };
const fields = ["Prompt 名称", "Prompt 编码", "版本", "上架状态", "Prompt 正文", "变更说明"];
const row = (overrides = {}) => ({ name: "AI 渲染台 Prompt", code: "ai-render-studio", version: 1,
  published: true, prompt: raw, changeNote: "fixture", ...overrides });

function reader(entries, overrides = {}) {
  const calls = [];
  return {
    calls,
    async run(options, args) {
      calls.push({ options, args });
      return { ok: true, data: { fields,
        data: entries.map((entry) => [entry.name, entry.code, entry.version,
          [entry.published ? "上架" : "下架"], entry.prompt, entry.changeNote]),
        has_more: false, ...overrides } };
    },
  };
}
const load = (entries, options = {}) => getAiRenderStudioPrompt({ config, run: reader(entries).run, ...options });
const safeRejection = (error) => error.statusCode === 409 && !/PRIVATE|secret|不可泄露/.test(error.message);

test("独立 JSON 资产保留四风格与保原材质原文及内部空白，不注入其他功能正文", () => {
  assert.deepEqual(parseAiRenderStudioPrompt(raw), seed);
  const changed = structuredClone(seed);
  changed.materialModes.faithful = "  运营确认的保原材质与真实感目标  ";
  changed.renderStyles.film = "  运营确认的克制胶片表现  ";
  assert.deepEqual(parseAiRenderStudioPrompt(JSON.stringify(changed)), changed);
  assert.notDeepEqual(AI_RENDER_STUDIO_PROMPT_CONFIG, REFINED_MODEL_PROMPT_CONFIG);
  assert.equal(AI_RENDER_STUDIO_PROMPT_CODE, "ai-render-studio");
  assert.equal(AI_RENDER_STUDIO_PROMPT_CONFIG.tableId, "tbl9Djf4iVWzRxf5");
  assert.equal(AI_RENDER_STUDIO_PROMPT_CONFIG.viewId, "vewJGtaGq3");
});

test("JSON 缺字段、未知字段、错误类型、空值、版本和占位符全部失败关闭", () => {
  for (const mutate of [
    (value) => { delete value.output; },
    (value) => { value.extra = "PRIVATE"; },
    (value) => { value.schemaVersion = "1"; },
    (value) => { value.schemaVersion = 2; },
    (value) => { value.renderBoundary = "  "; },
    (value) => { value.lightingBoundary = []; },
    (value) => { value.output = 42; },
    (value) => { value.materialModes = []; },
    (value) => { delete value.materialModes.faithful; },
    (value) => { value.materialModes.designed = "PRIVATE"; },
    (value) => { value.materialModes.faithful = null; },
    (value) => { value.materialModes.refined = "REFINED_BODY_PRIVATE"; },
    (value) => { value.materialModes.tactile = "TACTILE_BODY_PRIVATE"; },
    (value) => { delete value.renderStyles; },
    (value) => { delete value.renderStyles.photoreal; },
    (value) => { value.renderStyles.unknown = "PRIVATE"; },
    (value) => { value.renderStyles.soft = "  "; },
    (value) => { value.renderStyles.cinematic = []; },
    (value) => { value.renderStyles.film = "${secret}"; },
    (value) => { value.renderBoundary = "{{secret}}"; },
    (value) => { value.lightingBoundary = "${secret}"; },
    (value) => { value.materialModes.faithful = "secret}}"; },
    (value) => { value.output = "${secret}"; },
  ]) {
    const changed = structuredClone(seed);
    mutate(changed);
    assert.throws(() => parseAiRenderStudioPrompt(JSON.stringify(changed)), safeRejection);
  }
  for (const invalid of [null, {}, [], "null", "[]", "\"secret\"", '{"secret":"不可泄露"']) {
    assert.throws(() => parseAiRenderStudioPrompt(invalid), safeRejection);
  }
});

test("loader 单次读取独立渲染台表，只选择稳定编码的最高上架资产并计算真实来源摘要", async () => {
  const fixture = reader([row({ version: 2, prompt: " \n" + raw + "\n " }), row(),
    row({ version: 3, published: false }), row({ code: "image-relight", version: 99, prompt: "not-json-secret" })]);
  const asset = await getAiRenderStudioPrompt({ config, run: fixture.run, forceRefresh: true });
  assert.equal(fixture.calls.length, 1);
  assert.equal(asset.version, 2);
  assert.equal(asset.prompt, raw);
  assert.deepEqual(asset.bundle, seed);
  assert.equal(asset.sha256, hash(raw));
  assert.equal(asset.source, "feishu:studio-unit-table:ai-render-studio@v2");
  assert.equal(asset.code, AI_RENDER_STUDIO_PROMPT_CODE);
  assert.equal(asset.published, true);
  assert.match(asset.tableUrl, /studio-unit-base\?table=studio-unit-table/);
  const call = fixture.calls[0];
  assert.equal(call.options.cliPath, "studio-unit-cli");
  assert.ok(call.args.includes("studio-unit-table"));
  assert.ok(call.args.includes("studio-unit-base"));
  assert.equal(call.args.includes("时段提示词"), false);
  assert.equal(call.args.includes("tblDCXNib9XeWuza"), false);
});

test("指定版本可读取仍上架旧版，指定下架或缺失版本不能回退", async () => {
  assert.equal((await load([row(), row({ version: 2 })], { version: "1" })).version, 1);
  await assert.rejects(load([row(), row({ version: 2, published: false })], { version: 2 }), safeRejection);
  await assert.rejects(load([row()], { version: 99 }), safeRejection);
  await assert.rejects(load([row({ published: false })]), safeRejection);
  await assert.rejects(load([row({ code: "refined-lighting-base" })]), safeRejection);
});

test("任一上架同编码资产非法均阻断，不挑旧正文或其他编码兜底", async () => {
  for (const invalid of [
    row({ version: 2, prompt: "not-json-secret" }),
    row({ version: 2, prompt: "" }),
    row({ version: 2, name: "" }),
    row({ version: "bad" }),
    row({ version: 0 }),
    row({ version: Number.MAX_SAFE_INTEGER + 1 }),
  ]) await assert.rejects(load([row(), invalid]), safeRejection);
  await assert.rejects(load([row({ prompt: "not-json-secret" }), row({ version: 2 })]), safeRejection);
  const unavailable = await publicAiRenderStudioPromptConfig({ config,
    run: reader([row(), row({ version: 2, prompt: "not-json-secret" })]).run });
  assert.equal(unavailable.available, false);
  assert.deepEqual(unavailable.versions, []);
  assert.equal(unavailable.reason.includes("not-json-secret"), false);
});

test("同编码同版本在任意上架状态组合下重复都阻断，其他编码不干扰", async () => {
  for (const left of [true, false]) {
    for (const right of [true, false]) {
      await assert.rejects(load([row({ published: left }), row({ published: right })]), /重复版本/);
    }
  }
  const fixture = reader([row(), row({ code: "image-relight" }), row({ code: "refined-lighting-base" })]);
  assert.equal((await getAiRenderStudioPrompt({ config, run: fixture.run })).version, 1);
  assert.equal(fixture.calls.length, 1);
});

test("版本和冻结摘要格式错误在读取飞书之前拒绝", async () => {
  const fixture = reader([row()]);
  for (const version of [0, -1, 2.5, "bad", "", " ", true, [], {}, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(getAiRenderStudioPrompt({ config, run: fixture.run, version }), { statusCode: 400 });
  }
  for (const expectedSha256 of ["", "abc", 1, [], {}]) {
    await assert.rejects(getAiRenderStudioPrompt({ config, run: fixture.run, expectedSha256 }), { statusCode: 400 });
  }
  assert.equal(fixture.calls.length, 0);
});

test("SHA冻结核验同版本正文漂移，运营修改正文后只接受新的摘要", async () => {
  const changed = { ...seed, output: "运营新输出目标" };
  const changedRaw = JSON.stringify(changed);
  const asset = await load([row({ prompt: changedRaw })]);
  assert.equal(asset.sha256, hash(changedRaw));
  await assert.rejects(load([row({ prompt: changedRaw })], { expectedSha256: hash(raw) }), /正文已变更/);
  assert.equal((await load([row()], { expectedSha256: hash(raw).toUpperCase() })).sha256, hash(raw));
});

test("公开目录只暴露身份版本，不包含正文、bundle或任一材质档文本", async () => {
  const fixture = reader([row(), row({ version: 2 }), row({ version: 3, published: false })]);
  const catalog = await publicAiRenderStudioPromptConfig({ config, run: fixture.run });
  assert.equal(fixture.calls.length, 1);
  assert.equal(catalog.available, true);
  assert.equal(catalog.defaultVersion, 2);
  assert.equal(catalog.sha256, hash(raw));
  assert.deepEqual(catalog.versions.map((entry) => entry.version), [2, 1]);
  for (const entry of [catalog, ...catalog.versions]) {
    assert.equal(Object.hasOwn(entry, "prompt"), false);
    assert.equal(Object.hasOwn(entry, "bundle"), false);
    assert.equal(Object.hasOwn(entry, "materialModes"), false);
    assert.equal(Object.hasOwn(entry, "renderStyles"), false);
  }
  assert.equal(JSON.stringify(catalog).includes("PRIVATE"), false);
});

test("CLI或不完整分页失败的公开错误脱敏，不回显远程内容或尝试其他资产", async () => {
  let reads = 0;
  const run = async () => { reads += 1; throw new Error("secret-body-fragment"); };
  await assert.rejects(getAiRenderStudioPrompt({ config, run }), safeRejection);
  assert.equal(reads, 1);
  const catalog = await publicAiRenderStudioPromptConfig({ config, run });
  assert.equal(catalog.available, false);
  assert.equal(catalog.reason.includes("secret-body-fragment"), false);
  assert.deepEqual(catalog.versions, []);
  await assert.rejects(load([row()], { run: reader([row()], { has_more: true }).run }), safeRejection);
  await assert.rejects(load([row()], { run: reader([row()], { fields: [] }).run }), safeRejection);
});

test("服务端返回的 bundle 可独立冻结，修改一次读取不污染后续读取", async () => {
  const fixture = reader([row()]);
  const first = await getAiRenderStudioPrompt({ config, run: fixture.run });
  first.bundle.materialModes.faithful = "调用方临时替换";
  const second = await getAiRenderStudioPrompt({ config, run: fixture.run });
  assert.deepEqual(second.bundle, seed);
  assert.equal(second.sha256, hash(raw));
});

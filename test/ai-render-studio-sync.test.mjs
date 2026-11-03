/**
 * [INPUT]: 依赖真实渲染台服务/归档/同步/API与sharp图片及内存飞书CLI替身
 * [OUTPUT]: 验证Schema收费前阻断、归档逐字段/附件下载SHA、网络未知续传与仅同步重试零再次生图
 * [POS]: test 的渲染台生成到飞书归档合同，无真实网络、飞书写入或收费模型
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import sharp from "sharp";
import { createAiRenderStudioApiHandler } from "../src/ai-render-studio-api.mjs";
import { prepareAiRenderStudioInput, executeAiRenderStudio } from "../src/ai-render-studio-service.mjs";
import { syncAiRenderStudioToLark } from "../src/ai-render-studio-sync.mjs";
import { AI_RENDER_STUDIO_ARCHIVE_FIELDS, verifyAiRenderStudioSyncSchema, AI_RENDER_STUDIO_GUIDE_FIELD } from "../src/ai-render-studio-archive.mjs";
import { AI_RENDER_STUDIO_PROMPT_CONFIG } from "../src/ai-render-studio-prompt.mjs";
import { AI_RENDER_STUDIO_RENDER_STYLES } from "../src/ai-render-studio-definitions.mjs";
import { RELIGHT_ONEAPI_MODEL } from "../src/image-relight-oneapi.mjs";
import { LARK_SYNC_CONFIG } from "../src/lark-sync.mjs";

const digest = (value) => createHash("sha256").update(value).digest("hex");
const cardPrompt = "[Atmosphere] Quiet cinematic daylight.\n[Lighting] Soft side daylight.\n[Exposure] Natural contrast.";
const card = { id: "recStudioSyncCard", code: "cinematic-soft-light", name: "电影柔光", version: 5,
  sha256: digest("card-identity-with-attachment"), prompt: cardPrompt, order: 1 };
const config = { ...LARK_SYNC_CONFIG, baseToken: "base-fixture", tableId: "tbl-fixture", baseUrl: "https://example.feishu.cn/base/base-fixture",
  referenceFieldId: "fldSourceFixture", resultFieldId: "fldResultFixture" };
const commonTypes = { "标题": "text", "功能": "select", "生图模型": "select", "原始 Prompt": "text", "最终 Prompt": "text",
  "生成参数": "text", "尺寸": "text", "耗时（秒）": "number", "状态": "select", "错误信息": "text", "参考图": "attachment", "结果图": "attachment" };
function fieldsFixture() {
  const options = { "功能": ["AI渲染台"], "生图模型": [RELIGHT_ONEAPI_MODEL.label], "状态": ["成功", "同步失败"],
    "AI渲染台渲染风格": AI_RENDER_STUDIO_RENDER_STYLES.map((entry) => entry.label), "AI渲染台材质策略": ["保留原材质"],
    "AI渲染台光照方案": ["原光影/自定义", card.name], "AI渲染台原灯处理": ["保留", "整体减弱", "全部关闭"] };
  return Object.entries({ ...commonTypes, ...AI_RENDER_STUDIO_ARCHIVE_FIELDS }).map(([name, type], index) => ({
    name, type, id: name === "参考图" ? config.referenceFieldId : name === "结果图" ? config.resultFieldId : `fldFixture${index}`,
    ...(options[name] ? { options: options[name].map((option) => ({ name: option, hue: 20, lightness: 0.5 })) } : {}),
  }));
}

function larkFixture({ failAfterResultUpload = false, corruptDownload = false, driftField = false, missingSchema = false } = {}) {
  const schema = fieldsFixture(), records = new Map(), attachments = new Map(), calls = [];
  let didFail = false;
  const run = async (_config, args, options = {}) => {
    calls.push(args[1]);
    const at = (key) => args[args.indexOf(key) + 1];
    if (args[1] === "+field-list") return { ok: true, data: { fields: missingSchema ? schema.filter((x) => x.name !== "AI渲染台渲染风格") : schema } };
    if (args[1] === "+record-list") {
      const id = JSON.parse(at("--filter-json")).conditions[0][2];
      const matches = [...records].filter(([, fields]) => fields["AI渲染台任务ID"] === id);
      return { ok: true, data: { fields: ["AI渲染台任务ID"], data: matches.map(([, fields]) => [fields["AI渲染台任务ID"]]),
        record_id_list: matches.map(([id]) => id), has_more: false } };
    }
    if (args[1] === "+record-batch-create") {
      const body = JSON.parse(at("--json")), id = `recFixture${records.size + 1}`;
      const fields = Object.fromEntries(body.fields.map((name, i) => [name, body.rows[0][i]]));
      if (driftField) fields["AI渲染台材质策略"] = "错误策略";
      records.set(id, fields);
      return { ok: true, data: { record_id_list: [id] } };
    }
    const id = at("--record-id"), record = records.get(id);
    assert.ok(record, "只能访问已存在的本次任务记录");
    if (args[1] === "+record-get") return { ok: true, data: { record: { record_id: id, fields: structuredClone(record) } } };
    if (args[1] === "+record-upsert") {
      Object.assign(record, JSON.parse(at("--json")));
      return { ok: true, data: { record_id: id } };
    }
    if (args[1] === "+record-upload-attachment") {
      const field = schema.find((field) => field.id === at("--field-id"));
      assert.ok(field);
      const files = [];
      for (let i = 0; i < args.length; i++) if (args[i] === "--file") {
        const bytes = await readFile(join(options.cwd, args[i + 1])), token = `attachment-${attachments.size + 1}`;
        attachments.set(token, bytes);
        files.push({ file_token: token, size: bytes.length });
      }
      record[field.name] = [...(record[field.name] || []), ...files];
      if (field.name === "结果图" && failAfterResultUpload && !didFail) { didFail = true; throw new Error("上传响应丢失，远端已提交"); }
      return { ok: true };
    }
    if (args[1] === "+record-download-attachment") {
      const stored = attachments.get(at("--file-token"));
      assert.ok(stored);
      const bytes = Buffer.from(stored);
      if (corruptDownload) bytes[bytes.length - 1] ^= 1;
      await writeFile(join(options.cwd, at("--output")), bytes);
      return { ok: true };
    }
    assert.fail(`未预期CLI命令${args[1]}`);
  };
  return { run, records, attachments, calls };
}

async function generationFixture({ withGuide = true, withPreset = false } = {}) {
  const bytes = await sharp({ create: { width: 96, height: 64, channels: 3, background: "#a19a89" } }).png().toBuffer();
  const dataUrl = `data:image/png;base64,${bytes.toString("base64")}`;
  const bundle = { schemaVersion: 1, renderBoundary: "PRIVATE_RENDER_BOUNDARY", lightingBoundary: "PRIVATE_LIGHTING_BOUNDARY",
    materialModes: { faithful: "PRIVATE_MATERIAL_FAITHFUL" }, renderStyles: { photoreal: "PRIVATE_STYLE_PHOTO", soft: "PRIVATE_STYLE_SOFT",
      cinematic: "PRIVATE_STYLE_CINEMA", film: "PRIVATE_STYLE_FILM" }, output: "PRIVATE_OUTPUT" };
  const prompt = JSON.stringify(bundle);
  const snapshot = { code: "ai-render-studio", name: "AI渲染台", version: 1, published: true, prompt, bundle,
    sha256: digest(prompt), source: `feishu:${AI_RENDER_STUDIO_PROMPT_CONFIG.tableId}:ai-render-studio@v1` };
  const input = { referenceImages: [{ dataUrl, name: "room.png", type: "image/png", size: bytes.length }], prompt: "纯室内，背光场景",
    lightingPreset: withPreset ? { id: card.id, version: card.version, sha256: card.sha256 } : null,
    lights: withGuide ? [{ id: "lamp1", type: "point", action: "brighten", mode: "lightOnly", points: [{ x: 0.2, y: 0.2 }],
      target: { x: 0.7, y: 0.7 }, kelvin: 3500, intensity: 1, softness: "soft", fixture: "" }] : [] };
  const calls = [];
  let libraryReads = 0;
  const loadLightingAssets = async () => {
    libraryReads += 1;
    assert.equal(withPreset, true, "原光影不得读取光影库或旧模板");
    return { presets: [structuredClone(card)], tableUrl: "https://example.invalid/lighting-library" };
  };
  const imageClient = { async editImageAsync(request) {
    calls.push(request);
    const [width, height] = request.size.split("x").map(Number);
    const result = await sharp({ create: { width, height, channels: 3, background: "#b7a99a" } }).png().toBuffer();
    return { images: [{ url: `data:image/png;base64,${result.toString("base64")}` }], requestId: "offline-request", transport: "responses-background" };
  } };
  const getPrompt = async () => structuredClone(snapshot), getOneApiModels = async () => [{ id: RELIGHT_ONEAPI_MODEL.id }];
  return { input, imageClient, getPrompt, getOneApiModels, loadLightingAssets, calls, libraryReads: () => libraryReads,
    async archive() {
      const prepared = await prepareAiRenderStudioInput(input, { getPrompt, getOneApiModels, loadLightingAssets, verifySyncContract: async () => ({}) });
      let archive;
      await executeAiRenderStudio(prepared, { imageClient, getOneApiModels, loadLightingAssets, verifySyncContract: async () => ({}), jobId: "studio-sync-fixture-0001",
        scheduleSync(factory) { archive = factory(); return { generationId: "offline-sync", status: "pending" }; } });
      return archive;
    } };
}

test("渲染台写入独立字段、三列附件逐字节下载SHA并完成成功状态双回读", async () => {
  const fixture = await generationFixture(), archive = await fixture.archive(), lark = larkFixture();
  const result = await syncAiRenderStudioToLark(archive, config, { run: lark.run });
  assert.equal(result.ok, true, result.error);
  assert.equal(lark.records.size, 1);
  const record = lark.records.get(result.recordId);
  assert.equal(record["状态"], "成功");
  assert.equal(record["功能"], "AI渲染台");
  assert.equal(record["AI渲染台Prompt来源"], archive.workflow.promptSource);
  assert.equal(record["原始 Prompt"], "纯室内，背光场景");
  assert.ok(record["最终 Prompt"].startsWith("纯室内，背光场景\n\n"));
  for (const field of ["参考图", "结果图", AI_RENDER_STUDIO_GUIDE_FIELD]) assert.equal(record[field].length, 1);
  assert.equal(lark.calls.filter((call) => call === "+record-download-attachment").length, 3);
  assert.equal(fixture.calls.length, 1);
  assert.equal(fixture.libraryReads(), 0);
  assert.equal(record["AI渲染台光照方案"], "原光影/自定义");
  assert.doesNotMatch(JSON.stringify(record), /image-relight@|relightPromptCode/);
});

test("真实库读取替身冻结卡片三段正文到同次单图与飞书方案，卡图不成为额外参考图", async () => {
  const fixture = await generationFixture({ withGuide: false, withPreset: true }), archive = await fixture.archive(), lark = larkFixture();
  const result = await syncAiRenderStudioToLark(archive, config, { run: lark.run });
  assert.equal(result.ok, true, result.error);
  assert.equal(fixture.libraryReads(), 2);
  assert.equal(fixture.calls.length, 1);
  assert.equal(fixture.calls[0].images.length, 1);
  assert.equal(fixture.calls[0].prompt.split(cardPrompt).length - 1, 1);
  const record = lark.records.get(result.recordId), parameters = JSON.parse(record["生成参数"]);
  assert.equal(record["AI渲染台光照方案"], card.name);
  assert.equal(record["最终 Prompt"].split(cardPrompt).length - 1, 1);
  assert.equal(parameters.workflow.lightingPreset.id, card.id);
  assert.equal(parameters.workflow.lightingPreset.version, card.version);
  assert.equal(parameters.workflow.lightingPreset.sha256, card.sha256);
  assert.equal(parameters.workflow.lightingPreset.promptSha256, digest(cardPrompt));
  assert.equal(parameters.workflow.lightingPreset.prompt, cardPrompt);
  assert.equal(record[AI_RENDER_STUDIO_GUIDE_FIELD]?.length || 0, 0);
});

test("上传响应未知后按同任务恢复记录，只续传缺失引导图，不重复附件或生图", async () => {
  const fixture = await generationFixture(), archive = await fixture.archive(), lark = larkFixture({ failAfterResultUpload: true });
  const first = await syncAiRenderStudioToLark(archive, config, { run: lark.run });
  assert.equal(first.ok, false);
  const second = await syncAiRenderStudioToLark(archive, config, { run: lark.run });
  assert.equal(second.ok, true, second.error);
  assert.equal(second.recordId, first.recordId);
  assert.equal(lark.records.size, 1);
  assert.equal(lark.calls.filter((call) => call === "+record-batch-create").length, 1);
  assert.equal(lark.calls.filter((call) => call === "+record-upload-attachment").length, 3);
  assert.equal(fixture.calls.length, 1);
});

test("Schema或字段回读漂移失败关闭，实际附件字节错误不能标记成功", async () => {
  const fixture = await generationFixture({ withGuide: false }), archive = await fixture.archive();
  for (const options of [{ missingSchema: true }, { driftField: true }, { corruptDownload: true }]) {
    const lark = larkFixture(options), result = await syncAiRenderStudioToLark(archive, config, { run: lark.run });
    assert.equal(result.ok, false);
    if (options.missingSchema) assert.equal(lark.records.size, 0);
    else if (options.driftField) {
      assert.equal(lark.records.get(result.recordId)["状态"], undefined);
      assert.equal(lark.calls.filter((call) => call === "+record-upsert").length, 0);
      assert.equal(lark.calls.filter((call) => call === "+record-upload-attachment").length, 0);
    } else assert.equal(lark.records.get(result.recordId)["状态"], "同步失败");
  }
  assert.equal(fixture.calls.length, 1);
});

test("收费前与执行前Schema均校验，准备成功后Schema失效零模型调用", async () => {
  const fixture = await generationFixture(), lark = larkFixture({ missingSchema: true });
  const verifySyncContract = () => verifyAiRenderStudioSyncSchema(config, { run: lark.run });
  await assert.rejects(prepareAiRenderStudioInput(fixture.input, { ...fixture, verifySyncContract }), { statusCode: 409 });
  const prepared = await prepareAiRenderStudioInput(fixture.input, { ...fixture, verifySyncContract: async () => ({}) });
  await assert.rejects(executeAiRenderStudio(prepared, { ...fixture, verifySyncContract }), { statusCode: 409 });
  assert.equal(fixture.calls.length, 0);
});

test("真实API生成后同步失败可单独重试，GET映射最新同步状态且busy包含同步", async () => {
  const fixture = await generationFixture(), lark = larkFixture({ failAfterResultUpload: true });
  const handler = createAiRenderStudioApiHandler({ ...fixture, getImageClient: async () => fixture.imageClient,
    readJson: async (request) => request.body, sendJson(response, status, payload) { Object.assign(response, { status, payload }); },
    verifySyncContract: () => verifyAiRenderStudioSyncSchema(config, { run: lark.run }),
    syncGeneration: (archive) => syncAiRenderStudioToLark(archive, config, { run: lark.run }) });
  const jobId = "studio-api-sync-fixture-0001";
  await handler({ method: "POST", body: { jobId, input: fixture.input } }, {}, "/api/ai-render-studio/jobs");
  async function waitForSync(status) {
    for (let i = 0; i < 200; i++) {
      const response = {};
      await handler({ method: "GET" }, response, `/api/ai-render-studio/jobs/${jobId}`);
      if (response.payload.job?.result?.sync?.status === status) return response.payload.job;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.fail(`未等到同步${status}`);
  }
  const failed = await waitForSync("failed");
  assert.equal(failed.status, "success");
  assert.equal(failed.result.images.length, 1);
  assert.equal(handler.hasActiveJobs(), false);
  const retry = {};
  await handler({ method: "POST", body: {} }, retry, `/api/ai-render-studio/jobs/${jobId}/sync-retry`);
  assert.equal(retry.status, 202);
  assert.equal(handler.hasActiveJobs(), true);
  const success = await waitForSync("success");
  assert.ok(success.result.sync.recordUrl.startsWith("https://"));
  assert.equal(handler.hasActiveJobs(), false);
  assert.equal(fixture.calls.length, 1);
  assert.equal(lark.records.size, 1);
  assert.doesNotMatch(JSON.stringify(success), /PRIVATE_|compiledPrompt|snapshot|finalPrompt/);
});

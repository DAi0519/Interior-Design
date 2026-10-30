/**
 * [INPUT]: 依赖sharp真实PNG、打光归档/含光影转换/质感增强普通功能的飞书Schema边界、打光资产离线种子和内存CLI替身
 * [OUTPUT]: 验证v10整体原灯/可选精修计划及飞书资产冻结、历史v1-v9原摘要与Prompt不重写、动作摘要与单双图字段附件双回读
 * [POS]: test 的 GPT 打光飞书归档合同测试，不调用真实模型、CLI 或飞书
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import sharp from "sharp";
import { publicAgentModelCatalog } from "../src/agent-model-config.mjs";
import { EMPTY_ROOM_TYPES } from "../src/empty-room-type.mjs";
import { publicModelCatalog, MODEL_CONFIGS } from "../src/model-config.mjs";
import { IMAGE_OUTPAINT_ARCHIVE_MODEL_LABELS } from "../src/image-outpaint-archive.mjs";
import { MULTI_ANGLE_ARCHIVE_MODEL_LABELS } from "../src/image-multi-angle-archive.mjs";
import { buildImageRelightArchive, relightArchiveManifest } from "../src/image-relight-archive.mjs";
import { normalizeRelightLights } from "../public/image-relight-geometry.js";
import { assertLarkSyncSchema, buildRecordFields, LARK_SYNC_CONFIG, syncGenerationToLark } from "../src/lark-sync.mjs";

const offlineConfig = { ...LARK_SYNC_CONFIG, cliPath: "/__canvas_lab_relight_archive_test_no_real_cli__" };
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const picture = color => sharp({ create: { width: 96, height: 64, channels: 3, background: color } }).png().toBuffer();
const [sourceBytes, guideBytes, resultBytes] = await Promise.all([picture("#82644c"), picture("#257795"), picture("#779970")]);
const dataUrl = bytes => `data:image/png;base64,${bytes.toString("base64")}`;
const PHOTOGRAPHY_PARAMETERS = "摄影参数：设备：佳能R1，光圈：f/8，ISO：100，焦段：24mm，拍摄技术:高动态范围（HDR）拍摄，包围曝光，白平衡锁定，暗部不失真，亮部不过曝";
const legacyAssetPrompt = await readFile(new URL("../docs/image-relight-prompt-v7.json", import.meta.url), "utf8");
const assetPrompt = await readFile(new URL("../docs/image-relight-prompt-v8.json", import.meta.url), "utf8");
const currentAssetPrompt = await readFile(new URL("../docs/image-relight-prompt-v9.json", import.meta.url), "utf8");
const lights = [
  { id: "light-1", type: "point", points: [{ x: 0.2, y: 0.2 }], target: { x: 0.4, y: 0.7 }, mode: "lightOnly", kelvin: 3000, intensity: 1, softness: "soft", fixture: "" },
  { id: "light-2", type: "line", points: [{ x: 0.1, y: 0.4 }, { x: 0.7, y: 0.4 }], target: { x: 0.5, y: 0.8 }, mode: "addFixture", kelvin: 4000, intensity: 0.8, softness: "hard", fixture: "细长隐藏灯带" },
];

function archiveFixture() {
  const input = { referenceImages: [{ dataUrl: dataUrl(sourceBytes), type: "image/png", name: "用户原图.png", size: sourceBytes.length }], lights: structuredClone(lights), prompt: "保持室内原有设计" };
  const validated = { lights: structuredClone(lights), prompt: input.prompt };
  const metadata = { modelKey: "gptImage25Sunburst", prompt: "Image 1 is the clean scene. Apply actual lighting according to image 2.\nRemove guide marks.", lights: structuredClone(lights),
    model: MODEL_CONFIGS.gptImage25Sunburst.apiModel, version: "2026-10-25.1", workflowVersion: "2026-10-25.1",
    sourceSha256: digest(sourceBytes), submittedSourceSha256: digest(sourceBytes), guideSha256: digest(guideBytes), outputSha256: digest(resultBytes),
    sourceWidth: 96, sourceHeight: 64, outputWidth: 96, outputHeight: 64, outputResolution: "1k", quality: "medium", usageCost: { totalCost: 0.12 } };
  const result = { durationMs: 3210, images: [{ url: dataUrl(resultBytes) }], request: { outputFormat: "png", quality: "medium", resolution: "1k", sizeMode: "source", referenceImageCount: 2 },
    workflow: { key: "gpt-relight", version: "2026-10-25.1" }, upstream: { transport: "responses-background", metadata } };
  const guideImage = { imageUrl: dataUrl(guideBytes), mimeType: "image/png", size: guideBytes.length, fileName: "guide.png" };
  return { input, validated, result, guideImage };
}

function schemaFields({ relight = true } = {}) {
  const select = (name, options) => ({ name, type: "select", options: options.map(name => ({ name })) });
  return [
    { id: LARK_SYNC_CONFIG.referenceFieldId, name: "参考图", type: "attachment" },
    { id: LARK_SYNC_CONFIG.resultFieldId, name: "结果图", type: "attachment" },
    { id: LARK_SYNC_CONFIG.styleReferenceFieldId, name: "风格参考图", type: "attachment" },
    select("Prompt融合", publicAgentModelCatalog().filter(model => model.imageInput).map(model => model.label)),
    select("功能", ["自由生图", "白模渲染", "空房设计", "风格转换", "精模渲染", "效果图氛围转换", "效果图美化", "全景图美化", "质感增强", "光影转换", "AI扩图", "多角度", ...(relight ? ["打光"] : [])]),
    select("状态", ["成功", "生成失败", "同步失败"]),
    select("生图模型", [...publicModelCatalog().map(model => model.label), ...IMAGE_OUTPAINT_ARCHIVE_MODEL_LABELS, ...MULTI_ANGLE_ARCHIVE_MODEL_LABELS]),
    select("空间类型", EMPTY_ROOM_TYPES), select("设计方式", ["智能默认", "平台风格", "参考图风格"]), select("景别", ["特写", "标准", "远景"]),
    ...["Agent 编码", "其他空间类型", "家具选择", "原始 Prompt", "尺寸", "标题", "生成参数", "最终 Prompt", "错误信息", "风格选择", "镜头指令版本"].map(name => ({ name, type: "text" })),
    ...["水平角度（°）", "俯仰角度（°）", "Agent 版本", "耗时（秒）"].map(name => ({ name, type: "number" })),
  ];
}

function cliFixture({ schema = schemaFields(), transformRead = null } = {}) {
  const fields = {}, commands = [], uploads = [];
  let reads = 0;
  const run = async (config, args, options = {}) => {
    commands.push(args);
    assert.equal(config.baseToken, offlineConfig.baseToken);
    if (args.includes("+field-list")) return { data: { fields: schema } };
    if (args.includes("+record-batch-create")) {
      const body = JSON.parse(args[args.indexOf("--json") + 1]);
      Object.assign(fields, Object.fromEntries(body.fields.map((name, i) => [name, body.rows[0][i]])));
      return { data: { record_id_list: ["rec-relight"] } };
    }
    if (args.includes("+record-upsert")) {
      Object.assign(fields, JSON.parse(args[args.indexOf("--json") + 1]));
      return { data: {} };
    }
    if (args.includes("+record-upload-attachment")) {
      const fieldId = args[args.indexOf("--field-id") + 1];
      const name = schema.find(field => field.id === fieldId)?.name;
      assert.ok(name);
      const files = args.flatMap((value, i) => value === "--file" ? [args[i + 1]] : []);
      fields[name] = await Promise.all(files.map(async (file, i) => {
        const bytes = await readFile(join(options.cwd, file));
        uploads.push({ name, fieldId, index: i, file, bytes });
        return { file_token: `${fieldId}-token-${i}`, name: file, size: bytes.length };
      }));
      return { data: {} };
    }
    if (args.includes("+record-get")) {
      reads++;
      const snapshot = structuredClone(fields);
      transformRead?.(snapshot, reads);
      return { data: { record: { record_id: "rec-relight", fields: snapshot } } };
    }
    throw new Error(`不允许的内存 CLI 操作：${args[1]}`);
  };
  return { fields, commands, uploads, run, reads: () => reads };
}

test("打光专属 scope 要求功能选项，复用原有字段和 GPT 模型且不依赖遮罩列", () => {
  const old = { fields: schemaFields({ relight: false }) };
  assert.doesNotThrow(() => assertLarkSyncSchema(old));
  assert.throws(() => assertLarkSyncSchema(old, { scope: "imageRelight" }), error => error.statusCode === 409 && error.message.includes("打光"));
  assert.doesNotThrow(() => assertLarkSyncSchema({ fields: schemaFields() }, { scope: "imageRelight" }));
  const fields = schemaFields();
  fields.find(field => field.name === "生图模型").options = fields.find(field => field.name === "生图模型").options.filter(option => option.name !== MODEL_CONFIGS.gptImage25Sunburst.label);
  assert.throws(() => assertLarkSyncSchema({ fields }, { scope: "imageRelight" }), /Sunburst/);
});

test("逐光源两模式、实际完整 Prompt、费用和原图引导图次序按执行回执归档", () => {
  const fixture = archiveFixture();
  const archive = buildImageRelightArchive(fixture);
  assert.equal(archive.workflow.feature, "image-relight");
  assert.equal(archive.modelLabel, MODEL_CONFIGS.gptImage25Sunburst.label);
  assert.equal(archive.finalPrompt, fixture.result.upstream.metadata.prompt);
  assert.equal(archive.sourcePrompt, fixture.input.prompt);
  assert.deepEqual(archive.referenceImages.map(image => image.imageUrl), [dataUrl(sourceBytes), dataUrl(guideBytes)]);
  assert.deepEqual(archive.workflow.referenceRoles, ["original-source", "submitted-light-guide"]);
  assert.deepEqual(archive.workflow.lights, normalizeRelightLights(lights));
  fixture.validated.lights[0].kelvin = 6000;
  assert.equal(archive.workflow.lights[0].kelvin, 3000);
  const fields = buildRecordFields({ ...archive, actualSize: "96x64" });
  assert.equal(fields["功能"], "打光");
  assert.equal(fields["耗时（秒）"], 3.21);
  assert.deepEqual(JSON.parse(fields["生成参数"]).workflow.usageCost, { totalCost: 0.12 });
  assert.equal(Object.hasOwn(fields, "二次编辑模式"), false);
});

test("归档拒绝来源/引导/结果字节漂移、模式参数漂移、错模型及尺寸回执", () => {
  for (const mutate of [
    fixture => { fixture.result.upstream.metadata.sourceSha256 = "0".repeat(64); },
    fixture => { fixture.result.upstream.metadata.guideSha256 = "0".repeat(64); },
    fixture => { fixture.result.upstream.metadata.outputSha256 = "0".repeat(64); },
    fixture => { fixture.result.upstream.metadata.lights[0].mode = "addFixture"; },
    fixture => { fixture.result.upstream.metadata.modelKey = "gptImage25Flare"; },
    fixture => { fixture.result.upstream.metadata.sourceWidth = 128; },
    fixture => { fixture.result.upstream.metadata.outputHeight = 128; },
    fixture => { fixture.guideImage.size++; },
    fixture => { fixture.guideImage.mimeType = "image/jpeg"; },
  ]) {
    const fixture = archiveFixture(); mutate(fixture);
    assert.throws(() => buildImageRelightArchive(fixture), /打光/);
  }
});

test("原图引导图和结果只上传一次，字段及附件双回读后成功", async () => {
  const archive = buildImageRelightArchive(archiveFixture());
  const cli = cliFixture();
  const result = await syncGenerationToLark(archive, offlineConfig, { run: cli.run });
  assert.equal(result.ok, true);
  assert.equal(result.recordId, "rec-relight");
  assert.equal(cli.reads(), 2);
  assert.equal(cli.fields["状态"], "成功");
  assert.deepEqual(cli.uploads.filter(entry => entry.fieldId === LARK_SYNC_CONFIG.resultFieldId).map(entry => entry.bytes), [resultBytes]);
  const references = cli.uploads.filter(entry => entry.fieldId === LARK_SYNC_CONFIG.referenceFieldId).sort((a, b) => a.index - b.index);
  assert.deepEqual(references.map(entry => entry.bytes), [sourceBytes, guideBytes]);
  assert.deepEqual(cli.fields["参考图"].map(entry => entry.name), references.map(entry => entry.file));
  const manifest = JSON.parse(cli.fields["生成参数"]).workflow.attachmentManifest;
  assert.deepEqual(manifest["参考图"].map(entry => entry.sha256), [digest(sourceBytes), digest(guideBytes)]);
  assert.equal(manifest["结果图"][0].sha256, digest(resultBytes));
  assert.equal(cli.commands.filter(args => args.includes("+record-upload-attachment")).length, 2);
});

test("实时Schema缺打光选项或错误图片摘要时，建档前阻断", async () => {
  const archive = buildImageRelightArchive(archiveFixture());
  const cli = cliFixture({ schema: schemaFields({ relight: false }) });
  const missing = await syncGenerationToLark(archive, offlineConfig, { run: cli.run });
  assert.equal(missing.ok, false);
  assert.match(missing.error, /打光/);
  assert.equal(cli.commands.some(args => args.includes("+record-batch-create")), false);
  const validCli = cliFixture();
  archive.workflow.guideSha256 = "0".repeat(64);
  const digestMismatch = await syncGenerationToLark(archive, offlineConfig, { run: validCli.run });
  assert.equal(digestMismatch.ok, false);
  assert.equal(validCli.commands.some(args => args.includes("+record-batch-create")), false);
});

test("字段/附件漂移不能报同步成功，失败不重复上传", async () => {
  for (const transformRead of [
    fields => { fields["功能"] = "自由生图"; },
    fields => { const p = JSON.parse(fields["生成参数"]); p.workflow.lights[0].kelvin = 9000; fields["生成参数"] = JSON.stringify(p); },
    fields => { fields["参考图"].pop(); },
    fields => { fields["参考图"][1].size++; },
    fields => { fields["结果图"][0].file_token = ""; },
    (fields, reads) => { if (reads === 2) fields["参考图"][1].file_token = "unexpected-token"; },
  ]) {
    const cli = cliFixture({ transformRead });
    const result = await syncGenerationToLark(buildImageRelightArchive(archiveFixture()), offlineConfig, { run: cli.run });
    assert.equal(result.ok, false);
    assert.match(result.error, /打光归档/);
    assert.equal(cli.fields["状态"], "同步失败");
    assert.equal(cli.commands.filter(args => args.includes("+record-upload-attachment")).length, 2);
  }
});

test("manifest 不能将引导图顺序颠倒、夹带遮罩或丢失光源参数", () => {
  for (const mutate of [
    archive => archive.referenceImages.reverse(),
    archive => { archive.maskImage = archive.referenceImages[0]; },
    archive => { archive.workflow.lights = []; },
    archive => { archive.workflow.referenceRoles.reverse(); },
  ]) {
    const archive = buildImageRelightArchive(archiveFixture()); mutate(archive);
    assert.throws(() => relightArchiveManifest(archive, resultBytes), /打光/);
  }
});


function templateArchiveFixture({ templateKey = "naturalFill", blendMode = "balanced", manualLights = [], revision = 2, date = "2026-10-25",
  capturedPrompt = "Integrate the selected template with the original lighting.", templateSource = "server-template-catalog" } = {}) {
  const fixture = archiveFixture();
  for (const target of [fixture.input, fixture.validated, fixture.result.upstream.metadata]) {
    Object.assign(target, { templateKey, blendMode, lights: structuredClone(manualLights) });
  }
  const version = `${date}.gpt-relight.${revision}`;
  Object.assign(fixture.result.upstream.metadata, { workflowVersion: version, version,
    lightCount: manualLights.length, templateSource, prompt: capturedPrompt });
  fixture.result.request.referenceImageCount = manualLights.length ? 2 : 1;
  if (!manualLights.length) {
    fixture.guideImage = null;
    delete fixture.result.upstream.metadata.guideSha256;
  }
  return fixture;
}

test("纯模板按单原图归档融合设置与零手工灯，参考附件不伪造引导图", async () => {
  const fixture = templateArchiveFixture({ templateKey: "windowDaylight", blendMode: "subtle" });
  const archive = buildImageRelightArchive(fixture);
  assert.equal(archive.preview.referenceImageCount, 1);
  assert.equal(archive.preview.templateKey, "windowDaylight");
  assert.equal(archive.preview.blendMode, "subtle");
  assert.equal(archive.workflow.templateKey, "windowDaylight");
  assert.equal(archive.workflow.blendMode, "subtle");
  assert.deepEqual(archive.workflow.lights, []);
  assert.equal(archive.workflow.lightCount, 0);
  assert.equal(Object.hasOwn(archive.workflow, "guideSha256"), false);
  assert.deepEqual(archive.workflow.referenceRoles, ["original-source"]);
  assert.deepEqual(archive.referenceImages.map(image => image.imageUrl), [dataUrl(sourceBytes)]);
  const manifest = relightArchiveManifest(archive, resultBytes);
  assert.equal(manifest["参考图"].length, 1);
  const cli = cliFixture();
  const synced = await syncGenerationToLark(archive, offlineConfig, { run: cli.run });
  assert.equal(synced.ok, true);
  assert.equal(cli.reads(), 2);
  assert.equal(cli.fields["参考图"].length, 1);
  assert.deepEqual(cli.uploads.filter(entry => entry.fieldId === LARK_SYNC_CONFIG.referenceFieldId).map(entry => entry.bytes), [sourceBytes]);
  const parameters = JSON.parse(cli.fields["生成参数"]);
  assert.equal(parameters.workflow.templateKey, "windowDaylight");
  assert.equal(parameters.workflow.blendMode, "subtle");
  assert.equal(parameters.workflow.attachmentManifest["参考图"].length, 1);
});

test("模板和手工灯混用仍保存实际双图与逐灯模式，设置漂移在归档前拒绝", () => {
  const fixture = templateArchiveFixture({ templateKey: "warmAmbient", blendMode: "pronounced", manualLights: lights });
  const archive = buildImageRelightArchive(fixture);
  assert.equal(archive.preview.referenceImageCount, 2);
  assert.equal(archive.workflow.templateKey, "warmAmbient");
  assert.equal(archive.workflow.blendMode, "pronounced");
  assert.deepEqual(archive.workflow.lights, normalizeRelightLights(lights));
  assert.deepEqual(archive.workflow.referenceRoles, ["original-source", "submitted-light-guide"]);
  assert.equal(relightArchiveManifest(archive, resultBytes)["参考图"].length, 2);
  for (const mutate of [
    f => { f.result.upstream.metadata.templateKey = "naturalFill"; },
    f => { f.result.upstream.metadata.blendMode = "subtle"; },
    f => { f.validated.templateKey = "custom"; },
    f => { f.input.blendMode = "subtle"; },
    f => { f.result.upstream.metadata.lightCount = 0; },
    f => { f.result.request.referenceImageCount = 1; },
    f => { f.guideImage = null; },
  ]) {
    const copy = templateArchiveFixture({ templateKey: "warmAmbient", blendMode: "pronounced", manualLights: lights });
    mutate(copy);
    assert.throws(() => buildImageRelightArchive(copy), /打光/);
  }
});

test("旧版双图默认自定义和自然融合，v2不能通过缺字段伪装成旧版", () => {
  const archive = buildImageRelightArchive(archiveFixture());
  assert.equal(archive.workflow.templateKey, "custom");
  assert.equal(archive.workflow.blendMode, "balanced");
  delete archive.workflow.templateKey; delete archive.workflow.blendMode;
  delete archive.preview.templateKey; delete archive.preview.blendMode;
  assert.equal(relightArchiveManifest(archive, resultBytes)["参考图"].length, 2);
  for (const mutate of [
    f => { delete f.result.upstream.metadata.templateKey; delete f.result.upstream.metadata.blendMode; },
    f => { delete f.result.upstream.metadata.blendMode; },
    f => { f.result.upstream.metadata.templateKey = "unknown"; },
    f => { f.result.upstream.metadata.blendMode = "unknown"; },
    f => { delete f.result.upstream.metadata.lightCount; },
  ]) {
    const fixture = templateArchiveFixture(); mutate(fixture);
    assert.throws(() => buildImageRelightArchive(fixture), /打光/);
  }
});

test("零灯仅可用于真实模板，模板归档拒绝伪引导图或错误参考角色", () => {
  for (const mutate of [
    f => { f.input.templateKey = f.validated.templateKey = f.result.upstream.metadata.templateKey = "custom"; },
    f => { f.guideImage = archiveFixture().guideImage; },
    f => { f.result.upstream.metadata.guideSha256 = digest(guideBytes); },
    f => { f.result.request.referenceImageCount = 2; },
  ]) {
    const fixture = templateArchiveFixture(); mutate(fixture);
    assert.throws(() => buildImageRelightArchive(fixture), /打光/);
  }
  for (const mutate of [
    a => { a.referenceImages.push(archiveFixture().guideImage); },
    a => { a.workflow.referenceRoles.push("submitted-light-guide"); },
    a => { a.preview.referenceImageCount = 2; },
    a => { a.preview.blendMode = "subtle"; },
    a => { a.workflow.templateKey = "custom"; },
    a => { a.workflow.prompt = "rewritten after execution"; },
  ]) {
    const archive = buildImageRelightArchive(templateArchiveFixture()); mutate(archive);
    assert.throws(() => relightArchiveManifest(archive, resultBytes), /打光/);
  }
});

test("模板或融合方式在字段回读中漂移时，不能报告同步成功", async () => {
  for (const change of [p => { p.workflow.templateKey = "warmAmbient"; }, p => { p.workflow.blendMode = "pronounced"; }]) {
    const cli = cliFixture({ transformRead(fields) {
      const parameters = JSON.parse(fields["生成参数"]); change(parameters); fields["生成参数"] = JSON.stringify(parameters);
    } });
    const synced = await syncGenerationToLark(buildImageRelightArchive(templateArchiveFixture()), offlineConfig, { run: cli.run });
    assert.equal(synced.ok, false);
    assert.match(synced.error, /打光归档/);
    assert.equal(cli.fields["状态"], "同步失败");
  }
});

function actionArchiveFixture({ templateKey = "mainLight", manualLights, revision = 3, date = "2026-10-25" } = {}) {
  const annotations = manualLights || [
    { ...structuredClone(lights[0]), action: "brighten" },
    { id: "shade-wall", action: "darken", type: "area", amount: 0.6,
      points: [{ x: 0.1, y: 0.2 }, { x: 0.4, y: 0.2 }, { x: 0.4, y: 0.6 }, { x: 0.1, y: 0.6 }] },
    { id: "old-strip", action: "turnOff", type: "line", points: [{ x: 0.2, y: 0.1 }, { x: 0.8, y: 0.1 }] },
    { id: "protected-chair", action: "preserve", type: "point", points: [{ x: 0.8, y: 0.7 }] },
  ];
  return templateArchiveFixture({ templateKey, manualLights: normalizeRelightLights(annotations), revision, date });
}

function feishuArchiveFixture({ revision = 9, assetVersion = 8, assetText = assetPrompt, ...options } = {}) {
  const source = `feishu:tblDCXNib9XeWuza:image-relight@v${assetVersion}`;
  const fixture = templateArchiveFixture({ ...options, revision, date: "2026-10-26", templateSource: source });
  fixture.validated.relightPromptSnapshot = { code: "image-relight", name: "GPT打光", version: assetVersion, published: true,
    prompt: assetText, bundle: JSON.parse(assetText), sha256: digest(assetText), source };
  Object.assign(fixture.input, { relightPromptVersion: assetVersion, relightPromptSha256: digest(assetText) });
  Object.assign(fixture.result.upstream.metadata, { relightPromptCode: "image-relight", relightPromptVersion: assetVersion,
    relightPromptSha256: digest(assetText), relightPromptSource: source });
  return fixture;
}

test("v3四动作及压暗幅度冻结在既有生成参数JSON，写前按计划摘要复核", async () => {
  const fixture = actionArchiveFixture();
  const archive = buildImageRelightArchive(fixture);
  assert.deepEqual(archive.workflow.lights.map(light => light.action), ["brighten", "darken", "turnOff", "preserve"]);
  assert.equal(archive.workflow.lights[1].amount, 0.6);
  for (const light of archive.workflow.lights.slice(1)) {
    for (const key of ["target", "mode", "kelvin", "intensity", "softness", "fixture"]) assert.equal(Object.hasOwn(light, key), false);
  }
  assert.match(archive.workflow.lightingPlanSha256, /^[a-f0-9]{64}$/);
  assert.equal(relightArchiveManifest(archive, resultBytes)["参考图"].length, 2);
  fixture.validated.lights[1].amount = 0.2;
  assert.equal(archive.workflow.lights[1].amount, 0.6);
  const cli = cliFixture();
  assert.equal((await syncGenerationToLark(archive, offlineConfig, { run: cli.run })).ok, true);
  const workflow = JSON.parse(cli.fields["生成参数"]).workflow;
  assert.deepEqual(workflow.lights, archive.workflow.lights);
  assert.equal(workflow.lightingPlanSha256, archive.workflow.lightingPlanSha256);
});

test("v3动作或幅度在输入、执行回执、写前计划和字段回读漂移均阻断", async () => {
  for (const mutate of [
    fixture => { fixture.input.lights[1].amount = 0.3; },
    fixture => { fixture.validated.lights[2].action = "preserve"; },
    fixture => { fixture.result.upstream.metadata.lights[1].amount = 0.2; },
    fixture => { delete fixture.result.upstream.metadata.lights[0].action; },
    fixture => { fixture.result.upstream.metadata.lights[2].kelvin = 4000; },
  ]) {
    const fixture = actionArchiveFixture(); mutate(fixture);
    assert.throws(() => buildImageRelightArchive(fixture), /打光/);
  }
  for (const mutate of [
    archive => { archive.workflow.lights[1].amount = 0.4; },
    archive => { archive.workflow.lights[2].action = "preserve"; },
    archive => { archive.workflow.templateKey = "noMainLight"; archive.preview.templateKey = "noMainLight"; },
    archive => { delete archive.workflow.lightingPlanSha256; },
    archive => { archive.workflow.lightingPlanSha256 = "0".repeat(64); },
  ]) {
    const archive = buildImageRelightArchive(actionArchiveFixture()); mutate(archive);
    assert.throws(() => relightArchiveManifest(archive, resultBytes), /打光.*摘要/);
  }
  for (const change of [
    workflow => { workflow.lights[1].amount = 0.2; },
    workflow => { workflow.lights[2].action = "preserve"; },
    workflow => { workflow.lightingPlanSha256 = "0".repeat(64); },
  ]) {
    const cli = cliFixture({ transformRead(fields) {
      const parameters = JSON.parse(fields["生成参数"]); change(parameters.workflow); fields["生成参数"] = JSON.stringify(parameters);
    } });
    const synced = await syncGenerationToLark(buildImageRelightArchive(actionArchiveFixture()), offlineConfig, { run: cli.run });
    assert.equal(synced.ok, false);
    assert.match(synced.error, /打光归档/);
    assert.equal(cli.fields["状态"], "同步失败");
    assert.equal(cli.commands.filter(args => args.includes("+record-upload-attachment")).length, 2);
  }
});

test("历史v1/v2无action和计划摘要仍可读取为提亮，v3起必须显式冻结动作", () => {
  for (const fixture of [archiveFixture(), templateArchiveFixture({ manualLights: lights })]) {
    const archive = buildImageRelightArchive(fixture);
    assert.ok(archive.workflow.lights.every(light => light.action === "brighten"));
    archive.workflow.lights.forEach(light => { delete light.action; });
    delete archive.workflow.lightingPlanSha256;
    assert.equal(relightArchiveManifest(archive, resultBytes)["参考图"].length, 2);
  }
  for (const revision of [3, 4, 5, 6, 7]) {
    const fixture = actionArchiveFixture({ revision, date: revision === 7 ? "2026-10-26" : "2026-10-25" });
    delete fixture.result.upstream.metadata.lights[0].action;
    assert.throws(() => buildImageRelightArchive(fixture), /规范化动作/);
  }
});

test("只保护不变可叠加照明模板，自定义归档必须包含实际调光动作", () => {
  const protectedOnly = [{ id: "protected", action: "preserve", type: "point", points: [{ x: 0.5, y: 0.5 }] }];
  const template = buildImageRelightArchive(actionArchiveFixture({ manualLights: protectedOnly }));
  assert.equal(template.workflow.lightCount, 1);
  assert.equal(template.referenceImages.length, 2);
  assert.equal(relightArchiveManifest(template, resultBytes)["参考图"].length, 2);
  assert.throws(() => buildImageRelightArchive(actionArchiveFixture({ templateKey: "custom", manualLights: protectedOnly })), /实际调光动作/);
});

test("历史v3三方案、v4-v7五效果及custom保留已存Prompt与版本身份，不读取当前飞书资产", () => {
  for (const templateKey of ["naturalFill", "warmAmbient", "windowDaylight", "accentWash", "softStudio"]) {
    const capturedPrompt = `Stored v4 ${templateKey} prompt. Preserve the original key-light direction and established warm/cool balance.\nThis is the already submitted historical text.`;
    const archive = buildImageRelightArchive(templateArchiveFixture({ templateKey, revision: 4, capturedPrompt,
      templateSource: "server-scene-lighting@2026-10-25.3" }));
    const snapshot = structuredClone(archive);
    assert.equal(archive.workflow.workflowVersion, "2026-10-25.gpt-relight.4");
    assert.equal(archive.workflow.templateSource, "server-scene-lighting@2026-10-25.3");
    assert.equal(archive.workflow.templateKey, templateKey);
    assert.equal(archive.preview.templateKey, templateKey);
    assert.deepEqual(archive.workflow.lights, []);
    assert.deepEqual(archive.workflow.referenceRoles, ["original-source"]);
    assert.equal(archive.referenceImages.length, 1);
    assert.equal(archive.finalPrompt, capturedPrompt);
    assert.equal(archive.workflow.prompt, capturedPrompt);
    const fields = buildRecordFields(archive);
    assert.equal(fields["最终 Prompt"], capturedPrompt);
    assert.equal(JSON.parse(fields["生成参数"]).workflow.prompt, capturedPrompt);
    assert.equal(relightArchiveManifest(archive, resultBytes)["参考图"].length, 1);
    assert.deepEqual(archive, snapshot, "历史归档读取不得重写既有Prompt或参数");
    delete archive.workflow.lightingPlanSha256;
    assert.throws(() => relightArchiveManifest(archive, resultBytes), /冻结计划摘要/);
  }
  for (const templateKey of ["mainLight", "noMainLight", "naturalDaylight"]) {
    const capturedPrompt = `Stored v3 ${templateKey} scheme. Preserve the original dominant light and overall exposure baseline.\nRetain this captured instruction unchanged.`;
    const archive = buildImageRelightArchive(templateArchiveFixture({ templateKey, revision: 3, capturedPrompt,
      templateSource: "server-scene-lighting@2026-10-25.2" }));
    const snapshot = structuredClone(archive);
    assert.equal(archive.workflow.workflowVersion, "2026-10-25.gpt-relight.3");
    assert.equal(archive.workflow.templateSource, "server-scene-lighting@2026-10-25.2");
    assert.equal(archive.workflow.templateKey, templateKey);
    assert.equal(archive.preview.templateKey, templateKey);
    assert.equal(archive.workflow.lightingPlanSha256, digest(JSON.stringify({ templateKey, blendMode: "balanced", lights: [] })));
    assert.equal(archive.finalPrompt, capturedPrompt);
    assert.equal(archive.workflow.prompt, capturedPrompt);
    assert.equal(relightArchiveManifest(archive, resultBytes)["参考图"].length, 1);
    assert.deepEqual(archive, snapshot, "三历史方案读取不得映射为当前重打光模板");
  }
  for (const [revision, templateSource] of [[5, "server-scene-lighting@2026-10-25.4"], [6, "server-scene-lighting@2026-10-25.5"], [7, "server-scene-lighting@2026-10-26.6"]]) {
    for (const templateKey of ["naturalFill", "warmAmbient", "windowDaylight", "accentWash", "softStudio"]) {
      const capturedPrompt = `Stored v${revision} ${templateKey} prompt. REBUILD ALL LIGHTING with its submitted independent lighting target.\n${revision === 7 ? PHOTOGRAPHY_PARAMETERS : "Keep this historical text without adding later photographic parameters."}`;
      const date = revision === 7 ? "2026-10-26" : "2026-10-25";
      const archive = buildImageRelightArchive(templateArchiveFixture({ templateKey, revision, date, capturedPrompt, templateSource }));
      const snapshot = structuredClone(archive);
      assert.equal(archive.workflow.workflowVersion, `${date}.gpt-relight.${revision}`);
      assert.equal(archive.workflow.templateSource, templateSource);
      assert.equal(archive.workflow.templateKey, templateKey);
      assert.equal(archive.finalPrompt, capturedPrompt);
      assert.equal(archive.workflow.prompt, capturedPrompt);
      assert.equal(archive.finalPrompt.includes(PHOTOGRAPHY_PARAMETERS), revision === 7);
      assert.equal(relightArchiveManifest(archive, resultBytes)["参考图"].length, 1);
      assert.deepEqual(archive, snapshot);
    }
  }
  for (const [revision, templateSource] of [[3, "server-scene-lighting@2026-10-25.2"], [4, "server-scene-lighting@2026-10-25.3"], [5, "server-scene-lighting@2026-10-25.4"], [6, "server-scene-lighting@2026-10-25.5"], [7, "server-scene-lighting@2026-10-26.6"]]) {
    const capturedPrompt = `Stored v${revision} CUSTOM LIGHTING. Apply only the captured local edits; retain unrelated original lighting.\nDo not reinterpret this historical custom plan as a global relight.${revision === 7 ? "\n" + PHOTOGRAPHY_PARAMETERS : ""}`;
    const date = revision === 7 ? "2026-10-26" : "2026-10-25";
    const fixture = actionArchiveFixture({ templateKey: "custom", revision, date });
    Object.assign(fixture.result.upstream.metadata, { prompt: capturedPrompt, templateSource });
    const archive = buildImageRelightArchive(fixture), snapshot = structuredClone(archive);
    assert.equal(archive.workflow.templateKey, "custom");
    assert.equal(archive.workflow.workflowVersion, `${date}.gpt-relight.${revision}`);
    assert.equal(archive.workflow.templateSource, templateSource);
    assert.equal(archive.finalPrompt, capturedPrompt);
    assert.equal(archive.workflow.prompt, capturedPrompt);
    assert.equal(archive.finalPrompt.includes(PHOTOGRAPHY_PARAMETERS), revision === 7);
    assert.equal(relightArchiveManifest(archive, resultBytes)["参考图"].length, 2);
    assert.deepEqual(archive, snapshot);
  }
});

test("UI默认naturalFill不改变旧请求省略模板的自定义归档语义，v7回执不可缺少冻结模板", () => {
  const fixture = actionArchiveFixture({ templateKey: "custom", revision: 7, date: "2026-10-26" });
  delete fixture.input.templateKey;
  delete fixture.validated.templateKey;
  const archive = buildImageRelightArchive(fixture);
  assert.equal(archive.workflow.templateKey, "custom");
  assert.equal(archive.preview.templateKey, "custom");
  assert.deepEqual(archive.workflow.lights, normalizeRelightLights(fixture.input.lights));
  assert.equal(relightArchiveManifest(archive, resultBytes)["参考图"].length, 2);
  for (const mutate of [
    f => { f.result.upstream.metadata.templateKey = "naturalFill"; },
    f => { delete f.result.upstream.metadata.templateKey; delete f.result.upstream.metadata.blendMode; },
  ]) {
    const changed = actionArchiveFixture({ templateKey: "custom", revision: 7, date: "2026-10-26" });
    delete changed.input.templateKey;
    delete changed.validated.templateKey;
    mutate(changed);
    assert.throws(() => buildImageRelightArchive(changed), /打光/);
  }
});

test("历史workflow v8及资产v7沿用已存受光区语义和原资产摘要，不被v9原灯规则重写", () => {
  const capturedPrompt = "Stored workflow v8 prompt. If the mark encloses a receiving surface with no clear emitter, reduce received illumination there. Keep this submitted wording unchanged.";
  const fixture = feishuArchiveFixture({ revision: 8, assetVersion: 7, assetText: legacyAssetPrompt, templateKey: "custom",
    manualLights: actionArchiveFixture().validated.lights, capturedPrompt });
  const archive = buildImageRelightArchive(fixture), snapshot = structuredClone(archive);
  assert.equal(archive.workflow.workflowVersion, "2026-10-26.gpt-relight.8");
  assert.equal(archive.workflow.relightPromptVersion, 7);
  assert.equal(archive.workflow.relightPromptSha256, digest(legacyAssetPrompt));
  assert.equal(archive.workflow.templateSource, "feishu:tblDCXNib9XeWuza:image-relight@v7");
  assert.equal(archive.finalPrompt, capturedPrompt);
  assert.equal(archive.workflow.prompt, capturedPrompt);
  assert.doesNotMatch(archive.finalPrompt, /DIM EXISTING LIGHT|ADD NEW LIGHT/);
  assert.equal(relightArchiveManifest(archive, resultBytes)["参考图"].length, 2);
  assert.deepEqual(archive, snapshot);
});

test("v9零标注按飞书资产实际回执冻结摄影原文、四身份及独立目标，保留单原图", () => {
  for (const templateKey of ["naturalFill", "warmAmbient", "windowDaylight", "accentWash", "softStudio"]) {
    const capturedPrompt = `REBUILD ALL LIGHTING. New lighting target for ${templateKey}.\nPHOTOGRAPHIC LIGHTING QUALITY. MATERIAL AND TONAL RENDERING. CAMERA AND OPTICAL CHARACTER.\n${PHOTOGRAPHY_PARAMETERS}`;
    const fixture = feishuArchiveFixture({ templateKey, capturedPrompt });
    const archive = buildImageRelightArchive(fixture);
    assert.equal(archive.workflow.workflowVersion, "2026-10-26.gpt-relight.9");
    assert.equal(archive.workflow.templateSource, "feishu:tblDCXNib9XeWuza:image-relight@v8");
    assert.equal(archive.workflow.relightPromptCode, "image-relight");
    assert.equal(archive.workflow.relightPromptVersion, 8);
    assert.equal(archive.workflow.relightPromptSha256, digest(assetPrompt));
    assert.equal(archive.workflow.relightPromptSource, archive.workflow.templateSource);
    assert.equal(archive.workflow.templateKey, templateKey);
    assert.equal(archive.workflow.blendMode, "balanced");
    assert.deepEqual(archive.workflow.lights, []);
    assert.equal(archive.workflow.lightCount, 0);
    assert.equal(archive.preview.referenceImageCount, 1);
    assert.equal(archive.referenceImages[0].imageUrl, dataUrl(sourceBytes));
    assert.deepEqual(archive.workflow.referenceRoles, ["original-source"]);
    assert.equal(archive.finalPrompt, capturedPrompt);
    assert.equal(archive.workflow.prompt, capturedPrompt);
    assert.equal(archive.finalPrompt.split(PHOTOGRAPHY_PARAMETERS).length - 1, 1);
    assert.equal(archive.workflow.lightingPlanSha256, digest(JSON.stringify({ templateKey, blendMode: "balanced", lights: [] })));
    assert.equal(relightArchiveManifest(archive, resultBytes)["参考图"].length, 1);
  }
});

test("v9归档前复核输入/快照/执行回执，manifest及字段回读拒绝飞书资产身份漂移", async () => {
  for (const mutate of [
    f => { f.input.relightPromptVersion = 6; },
    f => { f.input.relightPromptSha256 = "0".repeat(64); },
    f => { delete f.validated.relightPromptSnapshot; },
    f => { f.validated.relightPromptSnapshot.prompt += " "; },
    f => { f.validated.relightPromptSnapshot.bundle.TEMPLATES.naturalFill += " changed"; },
    f => { f.validated.relightPromptSnapshot.published = false; },
    f => { f.result.upstream.metadata.relightPromptCode = "effect-render-beautification"; },
    f => { f.result.upstream.metadata.relightPromptVersion = 9; },
    f => { f.result.upstream.metadata.relightPromptSha256 = "0".repeat(64); },
    f => { f.result.upstream.metadata.relightPromptSource = "server-local"; },
    f => { f.result.upstream.metadata.templateSource = "server-local"; },
  ]) {
    const fixture = feishuArchiveFixture(); mutate(fixture);
    assert.throws(() => buildImageRelightArchive(fixture), /打光归档/);
  }
  for (const change of [
    workflow => { workflow.relightPromptVersion = 9; },
    workflow => { workflow.relightPromptSha256 = "0".repeat(64); },
    workflow => { workflow.relightPromptSource = "different-source"; },
  ]) {
    const archive = buildImageRelightArchive(feishuArchiveFixture()); change(archive.workflow);
    assert.throws(() => relightArchiveManifest(archive, resultBytes), /飞书Prompt/);
    const cli = cliFixture({ transformRead(fields) {
      const parameters = JSON.parse(fields["生成参数"]); change(parameters.workflow); fields["生成参数"] = JSON.stringify(parameters);
    } });
    const result = await syncGenerationToLark(buildImageRelightArchive(feishuArchiveFixture()), offlineConfig, { run: cli.run });
    assert.equal(result.ok, false);
    assert.match(result.error, /打光归档/);
  }
});


function globalArchiveFixture({ originalLights = { action: "darken", amount: 0.5 }, manualLights = [], templateKey = "custom" } = {}) {
  const fixture = feishuArchiveFixture({ revision: 10, assetVersion: 9, assetText: currentAssetPrompt, templateKey, manualLights,
    capturedPrompt: "Stored v10 whole-scene ORIGINAL LIGHTS instruction. Keep the actual submitted prompt unchanged." });
  for (const target of [fixture.input, fixture.validated, fixture.result.upstream.metadata, fixture.result.request]) {
    target.originalLights = structuredClone(originalLights);
  }
  return fixture;
}

test("v10整体减弱/全部关闭无需标注，单原图与原灯计划进入既有参数JSON并双回读", async () => {
  for (const originalLights of [{ action: "darken", amount: 0.7 }, { action: "turnOff" }]) {
    const fixture = globalArchiveFixture({ originalLights }), archive = buildImageRelightArchive(fixture);
    assert.deepEqual(archive.workflow.originalLights, originalLights); assert.deepEqual(archive.preview.originalLights, originalLights);
    assert.deepEqual(archive.workflow.lights, []); assert.equal(archive.workflow.lightCount, 0);
    assert.equal(archive.referenceImages.length, 1); assert.equal(archive.preview.referenceImageCount, 1);
    assert.deepEqual(archive.workflow.referenceRoles, ["original-source"]);
    assert.equal(archive.workflow.relightPromptVersion, 9); assert.equal(archive.workflow.relightPromptSha256, digest(currentAssetPrompt));
    assert.equal(archive.workflow.lightingPlanSha256, digest(JSON.stringify({ templateKey: "custom", blendMode: "balanced", originalLights, lights: [] })));
    assert.equal(relightArchiveManifest(archive, resultBytes)["参考图"].length, 1);
    const cli = cliFixture(), result = await syncGenerationToLark(archive, offlineConfig, { run: cli.run });
    assert.equal(result.ok, true); assert.equal(cli.reads(), 2);
    assert.deepEqual(JSON.parse(cli.fields["生成参数"]).workflow.originalLights, originalLights);
    assert.deepEqual(cli.uploads.filter(entry => entry.name === "参考图").map(entry => entry.bytes), [sourceBytes]);
  }
});

test("v10整体操作与两模式新光/原灯精修共存，输出深冻结且manifest拒绝动作幅度漂移", async () => {
  const mixed = normalizeRelightLights([...lights, ...actionArchiveFixture().validated.lights.slice(1)]);
  const fixture = globalArchiveFixture({ manualLights: mixed }), archive = buildImageRelightArchive(fixture);
  assert.equal(archive.referenceImages.length, 2); assert.deepEqual(archive.workflow.lights, mixed);
  fixture.input.originalLights.amount = 0.9; fixture.validated.originalLights.amount = 0.8; fixture.result.upstream.metadata.originalLights.amount = 0.7;
  assert.deepEqual(archive.workflow.originalLights, { action: "darken", amount: 0.5 });
  assert.deepEqual(archive.preview.originalLights, { action: "darken", amount: 0.5 });
  for (const change of [
    a => { a.workflow.originalLights.amount = 0.9; }, a => { a.workflow.originalLights = { action: "turnOff" }; },
    a => { delete a.workflow.originalLights; }, a => { a.preview.originalLights.amount = 0.2; },
    a => { delete a.preview.originalLights; }, a => { a.workflow.lightingPlanSha256 = "0".repeat(64); },
  ]) {
    const altered = structuredClone(archive); change(altered); assert.throws(() => relightArchiveManifest(altered, resultBytes), /打光/);
  }
  const cli = cliFixture({ transformRead(fields) { const p = JSON.parse(fields["生成参数"]); p.workflow.originalLights.amount = 0.1; fields["生成参数"] = JSON.stringify(p); } });
  assert.equal((await syncGenerationToLark(archive, offlineConfig, { run: cli.run })).ok, false);
});

test("v10输入执行回执必须一致且为canonical原灯参数；模板null，保留仍需实际局部操作", () => {
  for (const change of [
    f => { f.input.originalLights.amount = 0.8; }, f => { f.validated.originalLights.action = "turnOff"; },
    f => { delete f.result.upstream.metadata.originalLights; }, f => { delete f.result.upstream.metadata.originalLights.amount; },
    f => { f.result.upstream.metadata.originalLights.extra = true; }, f => { f.result.request.originalLights.amount = 0.3; },
    f => { delete f.result.request.originalLights; }, f => { f.guideImage = archiveFixture().guideImage; },
  ]) { const fixture = globalArchiveFixture(); change(fixture); assert.throws(() => buildImageRelightArchive(fixture), /打光/); }
  for (const originalLights of [null, { action: "keep" }]) {
    assert.throws(() => buildImageRelightArchive(globalArchiveFixture({ originalLights })), /打光/);
    assert.doesNotThrow(() => buildImageRelightArchive(globalArchiveFixture({ originalLights, manualLights: normalizeRelightLights(lights) })));
  }
  assert.throws(() => buildImageRelightArchive(globalArchiveFixture({ templateKey: "naturalFill" })), /打光/);
  const template = buildImageRelightArchive(globalArchiveFixture({ templateKey: "naturalFill", originalLights: null }));
  assert.equal(template.workflow.originalLights, null); assert.equal(template.preview.originalLights, null);
  assert.equal(relightArchiveManifest(template, resultBytes)["参考图"].length, 1);
  const legacy = buildImageRelightArchive(feishuArchiveFixture());
  assert.equal(Object.hasOwn(legacy.workflow, "originalLights"), false); assert.equal(Object.hasOwn(legacy.preview, "originalLights"), false);
  assert.equal(legacy.workflow.lightingPlanSha256, digest(JSON.stringify({ templateKey: "naturalFill", blendMode: "balanced", lights: [] })));
});

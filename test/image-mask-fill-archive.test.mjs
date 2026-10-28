/**
 * [INPUT]: 依赖 sharp 真实图片、遮罩归档投影、含质感增强普通功能的飞书Schema/同步边界及可注入内存CLI
 * [OUTPUT]: 遮罩七字段准入、GPT参考用途默认/换物品/换材质和三定位空原文/真实固定Prompt与两次回读、矩形/自由圈选送模原图独立附件和真实来源、原件与空manifest/缺图SHA及回读故障阻断测试
 * [POS]: test 的遮罩填充飞书归档合同测试，不调用真实模型、CLI 或飞书
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
import { publicModelCatalog } from "../src/model-config.mjs";
import { IMAGE_OUTPAINT_ARCHIVE_MODEL_LABELS } from "../src/image-outpaint-archive.mjs";
import { MULTI_ANGLE_ARCHIVE_MODEL_LABELS } from "../src/image-multi-angle-archive.mjs";
import {
  IMAGE_MASK_FILL_ARCHIVE_FIELDS, IMAGE_MASK_FILL_ARCHIVE_MODEL_LABEL,
  buildImageMaskFillArchive, maskFillRecordFields,
} from "../src/image-mask-fill-archive.mjs";
import { validateMaskFillInput } from "../src/image-mask-fill-service.mjs";
import { prepareSunburstMaskInput, sunburstMaskPrompt } from "../src/image-mask-fill-oneapi.mjs";
import { assertLarkSyncSchema, buildRecordFields, LARK_SYNC_CONFIG, syncGenerationToLark, verifyLarkSyncSchema } from "../src/lark-sync.mjs";

// -------- 即使实现意外忽略 run 替身，也必须在本机失败而不能调用真实 CLI --------
const offlineConfig = { ...LARK_SYNC_CONFIG, cliPath: "/__canvas_lab_mask_archive_test_no_real_cli__" };
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const picture = (width, height, background) => sharp({ create: { width, height, channels: 3, background } }).png().toBuffer();
const [sourceBytes, resultBytes, maskBytes, referenceBytes] = await Promise.all([
  picture(96, 64, "#82644c"), picture(96, 64, "#779970"), picture(96, 64, "#ffffff"), picture(40, 56, "#257795"),
]);
const descriptor = (bytes, name) => ({ dataUrl: `data:image/png;base64,${bytes.toString("base64")}`, type: "image/png", name, size: bytes.length });
const inputFor = (mode = "reference") => ({ referenceImages: [descriptor(sourceBytes, "source.png")],
  maskImage: descriptor(maskBytes, "mask.png"), maskFillMode: mode, prompt: "用户确认的填充指令", inferenceTier: "2k",
  ...(mode === "reference" ? { fillReferenceImage: descriptor(referenceBytes, "object.png") } : {}) });
const actualPrompt = mode => `image1: <|vision_start|><|image_pad|><|vision_end|> ${mode === "reference" ? "image2: <|vision_start|><|image_pad|><|vision_end|> " : ""}已实际提交的完整英文指令\nKeep the scene coherent.`;

async function archiveFor(mode = "reference", { inferenceTier = "2k", inferenceEvidence = null, modelKey = "flux2Klein", hasMask = true, editRegion = null,
  prompt = "用户确认的填充指令", fillReferencePurpose } = {}) {
  const input = { ...inputFor(mode), prompt, ...(fillReferencePurpose !== undefined ? { fillReferencePurpose } : {}), inferenceTier, maskFillModel: modelKey, ...(!hasMask ? { maskImage: null } : {}), ...(editRegion ? { editRegion } : {}) };
  const validated = await validateMaskFillInput(input);
  const prepared = editRegion ? await prepareSunburstMaskInput(validated) : null;
  const boxedSourceImage = prepared ? { imageUrl: prepared.request.images[0].image_url, mimeType: "image/png",
    fileName: "submitted-boxed-source-fixture.png", size: prepared.sourceBytes.length } : null;
  const version = validated.provider === "oneapi" ? "2026-10-22.sunburst.15" : "test-executed-version";
  const inference = inferenceTier === "original" ? inferenceEvidence : inferenceTier === "2k"
    ? { width: 2048, height: 1376 } : { width: 4096, height: 2720 };
  const inferenceSize = inference ? Math.max(inference.width, inference.height) : null;
  const result = { durationMs: 3210, images: [{ url: `data:image/png;base64,${resultBytes.toString("base64")}` }],
    request: { outputFormat: "png", maskFillMode: mode, inferenceTier, inferenceSize, maskExpand: validated.maskExpand, hasMask,
      referenceImageCount: mode === "reference" ? 2 : 1, size: "96x64", syncMode: "local-only" },
    upstream: { outputFormat: "png", transport: validated.provider === "oneapi" ? hasMask ? "images-edits" : "responses-background" : "comfyui-workflow", metadata: {
      prompt: prepared?.request.prompt || (validated.provider === "oneapi" ? sunburstMaskPrompt(validated) : actualPrompt(mode)),
      sourcePrompt: validated.prompt, mode, inferenceTier, inferenceSize, hasMask,
      ...(validated.fillReferencePurpose ? { fillReferencePurpose: validated.fillReferencePurpose } : {}),
      ...(validated.provider === "oneapi" ? { upstreamAsync: !hasMask } : {}),
      ...(prepared ? { editRegion: validated.editRegion, editRegionPixels: prepared.editRegionPixels, regionAnnotation: prepared.regionAnnotation,
        sourceSha256: digest(sourceBytes), submittedSourceSha256: digest(prepared.sourceBytes) } : {}),
      inferenceWidth: inference?.width ?? null, inferenceHeight: inference?.height ?? null, maskExpand: validated.maskExpand,
      actualOutputWidth: 96, actualOutputHeight: 64, outputWidth: 96, outputHeight: 64,
      sourceWidth: 96, sourceHeight: 64, sourceSha256Actual: digest(sourceBytes), maskSha256: hasMask ? digest(maskBytes) : null,
      submittedMaskSha256: hasMask ? digest(maskBytes) : null, drawnMaskSha256: hasMask ? digest(maskBytes) : null,
      referenceSha256: mode === "reference" ? digest(referenceBytes) : null,
      outputSha256: digest(resultBytes), seed: 42, promptId: "mask-archive-prompt", version,
    } },
    workflow: { key: validated.provider === "oneapi" ? "sunburst-mask-fill" : "flux2-mask-fill", mode, version, label: "遮罩填充" } };
  return { input, validated, result, prepared, boxedSourceImage,
    archive: buildImageMaskFillArchive({ input, validated, result, boxedSourceImage }) };
}

function schemaFields({ mask = true } = {}) {
  const select = (name, options) => ({ name, type: "select", options: options.map(name => ({ name })) });
  const base = [
    { id: LARK_SYNC_CONFIG.referenceFieldId, name: "参考图", type: "attachment" },
    { id: LARK_SYNC_CONFIG.resultFieldId, name: "结果图", type: "attachment" },
    { id: LARK_SYNC_CONFIG.styleReferenceFieldId, name: "风格参考图", type: "attachment" },
    select("Prompt融合", publicAgentModelCatalog().filter(model => model.imageInput).map(model => model.label)),
    select("功能", ["自由生图", "白模渲染", "空房设计", "风格转换", "精模渲染", "效果图氛围转换", "效果图美化", "全景图美化", "质感增强", "AI扩图", "多角度", ...(mask ? ["遮罩填充"] : [])]),
    select("状态", ["成功", "生成失败", "同步失败"]),
    select("生图模型", [...publicModelCatalog().map(model => model.label), ...IMAGE_OUTPAINT_ARCHIVE_MODEL_LABELS, ...MULTI_ANGLE_ARCHIVE_MODEL_LABELS, ...(mask ? [IMAGE_MASK_FILL_ARCHIVE_MODEL_LABEL] : [])]),
    select("空间类型", EMPTY_ROOM_TYPES), select("设计方式", ["智能默认", "平台风格", "参考图风格"]), select("景别", ["特写", "标准", "远景"]),
    ...["Agent 编码", "其他空间类型", "家具选择", "原始 Prompt", "尺寸", "标题", "生成参数", "最终 Prompt", "错误信息", "风格选择", "镜头指令版本"].map(name => ({ name, type: "text" })),
    ...["水平角度（°）", "俯仰角度（°）", "Agent 版本", "耗时（秒）"].map(name => ({ name, type: "number" })),
  ];
  if (mask) base.push(
    select("遮罩填充模式", ["提示词填充", "参考图填充"]),
    { name: "局部推理尺寸（px）", type: "number" }, { name: "遮罩扩展（px）", type: "number" },
    { name: "遮罩工作流版本", type: "text" },
    { id: "fld-mask-dynamic", name: "遮罩图", type: "attachment" },
    { id: "fld-fill-reference-dynamic", name: "填充参考图", type: "attachment" },
    { id: "fld-boxed-source-dynamic", name: "框选原图", type: "attachment" },
  );
  return base;
}

function cliFixture({ schema = schemaFields(), transformRead = null } = {}) {
  const fields = {}, commands = [], uploads = [];
  let reads = 0;
  const run = async (config, args, options = {}) => {
    commands.push(args);
    assert.equal(config.baseToken, LARK_SYNC_CONFIG.baseToken);
    assert.equal(args[args.indexOf("--table-id") + 1], LARK_SYNC_CONFIG.tableId);
    if (args.includes("+field-list")) return { ok: true, data: { fields: schema } };
    if (args.includes("+record-batch-create")) {
      const body = JSON.parse(args[args.indexOf("--json") + 1]);
      Object.assign(fields, Object.fromEntries(body.fields.map((name, index) => [name, body.rows[0][index]])));
      return { ok: true, data: { record_id_list: ["rec-mask-archive"] } };
    }
    if (args.includes("+record-upsert")) {
      Object.assign(fields, JSON.parse(args[args.indexOf("--json") + 1]));
      return { ok: true, data: {} };
    }
    if (args.includes("+record-upload-attachment")) {
      const fieldId = args[args.indexOf("--field-id") + 1];
      const name = schema.find(field => field.id === fieldId)?.name;
      assert.ok(name, `上传必须使用当前 Schema 的真实字段 ID：${fieldId}`);
      const files = args.flatMap((arg, index) => arg === "--file" ? [args[index + 1]] : []);
      fields[name] = await Promise.all(files.map(async (file, index) => {
        const bytes = await readFile(join(options.cwd, file));
        uploads.push({ name, bytes });
        return { file_token: `${fieldId}-token-${index}`, name: file, size: bytes.length };
      }));
      return { ok: true, data: {} };
    }
    if (args.includes("+record-get")) {
      reads++;
      const returned = structuredClone(fields);
      transformRead?.(returned, reads);
      return { ok: true, data: { fields: Object.keys(returned), data: [Object.values(returned)], record_id_list: ["rec-mask-archive"] } };
    }
    throw new Error(`不允许的内存 CLI 操作：${args[1]}`);
  };
  return { fields, commands, uploads, run, reads: () => reads };
}

test("遮罩七字段和两个模式只在专属 scope 要求，旧功能不依赖新增字段或模型标签", () => {
  assert.deepEqual(IMAGE_MASK_FILL_ARCHIVE_FIELDS, { "遮罩填充模式": "select", "局部推理尺寸（px）": "number",
    "遮罩扩展（px）": "number", "遮罩工作流版本": "text", "遮罩图": "attachment", "填充参考图": "attachment", "框选原图": "attachment" });
  assert.equal(IMAGE_MASK_FILL_ARCHIVE_MODEL_LABEL, "Flux2 Klein 9B · 遮罩填充");
  assert.doesNotThrow(() => assertLarkSyncSchema({ fields: schemaFields({ mask: false }) }));
  assert.throws(() => assertLarkSyncSchema({ fields: schemaFields({ mask: false }) }, { scope: "imageMaskFill" }), error => error.statusCode === 409);
  assert.doesNotThrow(() => assertLarkSyncSchema({ fields: schemaFields() }, { scope: "imageMaskFill" }));
  for (const name of Object.keys(IMAGE_MASK_FILL_ARCHIVE_FIELDS)) {
    const fields = schemaFields(); fields.splice(fields.findIndex(field => field.name === name), 1);
    assert.throws(() => assertLarkSyncSchema({ fields }, { scope: "imageMaskFill" }), error => error.statusCode === 409 && error.message.includes(name));
    assert.doesNotThrow(() => assertLarkSyncSchema({ fields }));
  }
  for (const [name, option] of [["遮罩填充模式", "提示词填充"], ["遮罩填充模式", "参考图填充"], ["功能", "遮罩填充"], ["生图模型", IMAGE_MASK_FILL_ARCHIVE_MODEL_LABEL]]) {
    const fields = schemaFields(); fields.find(field => field.name === name).options = fields.find(field => field.name === name).options.filter(entry => entry.name !== option);
    assert.throws(() => assertLarkSyncSchema({ fields }, { scope: "imageMaskFill" }), error => error.statusCode === 409 && error.message.includes(option));
    assert.doesNotThrow(() => assertLarkSyncSchema({ fields }));
  }
});

test("Schema 读取透传 scope 与内存 CLI，动态附件列类型漂移前置409", async () => {
  const valid = cliFixture();
  await assert.doesNotReject(verifyLarkSyncSchema(offlineConfig, { scope: "imageMaskFill", run: valid.run }));
  for (const name of ["遮罩图", "框选原图"]) {
    const fields = schemaFields(); fields.find(field => field.name === name).type = "text";
    const invalid = cliFixture({ schema: fields });
    await assert.rejects(verifyLarkSyncSchema(offlineConfig, { scope: "imageMaskFill", run: invalid.run }), error => error.statusCode === 409 && error.message.includes(name));
    assert.equal(invalid.commands.some(args => args.includes("+record-batch-create")), false);
  }
});

test("两模式归档区分完整实际提示词和用户原文，主图/遮罩/填充参考图独立投影", async () => {
  assert.deepEqual(maskFillRecordFields({ feature: "free-image-generation" }), {});
  for (const mode of ["prompt", "reference"]) {
    const { archive, validated, result } = await archiveFor(mode);
    assert.equal(archive.workflow.feature, "image-mask-fill");
    assert.equal(archive.modelLabel, IMAGE_MASK_FILL_ARCHIVE_MODEL_LABEL);
    assert.equal(archive.finalPrompt, actualPrompt(mode));
    assert.equal(archive.sourcePrompt, validated.prompt);
    assert.equal(archive.referenceImages.length, 1);
    assert.equal(archive.referenceImages[0].imageUrl, validated.source.imageUrl);
    assert.equal(archive.maskImage.imageUrl, validated.mask.imageUrl);
    assert.equal(archive.boxedSourceImage, null);
    assert.equal(archive.styleReferenceImages?.length || 0, 0);
    if (mode === "reference") assert.equal(archive.fillReferenceImage.imageUrl, validated.reference.imageUrl);
    else assert.equal(archive.fillReferenceImage, null);
    assert.equal(archive.resultImage, result.images[0]);
    const fields = buildRecordFields({ ...archive, actualSize: "96x64" });
    assert.equal(fields["功能"], "遮罩填充");
    assert.equal(fields["遮罩填充模式"], mode === "prompt" ? "提示词填充" : "参考图填充");
    assert.equal(fields["局部推理尺寸（px）"], 2048);
    assert.equal(fields["遮罩扩展（px）"], mode === "prompt" ? 10 : 80);
    assert.equal(fields["遮罩工作流版本"], "test-executed-version");
    assert.equal(fields["最终 Prompt"], actualPrompt(mode));
    assert.equal(fields["原始 Prompt"], validated.prompt);
    assert.equal(JSON.parse(fields["生成参数"]).workflow.feature, "image-mask-fill");
  }
});

test("原图档位仅归档有证据的实际crop尺度，未知时数值列留空且保留独立原图尺寸", async () => {
  const unknown = await archiveFor("prompt", { inferenceTier: "original" });
  const unknownFields = buildRecordFields({ ...unknown.archive, actualSize: "96x64" });
  assert.equal(unknown.archive.workflow.inferenceTier, "original");
  assert.equal(unknown.archive.workflow.inferenceSize, null);
  assert.equal(unknown.archive.workflow.inferenceWidth, null);
  assert.equal(unknown.archive.workflow.inferenceHeight, null);
  assert.ok(unknownFields["局部推理尺寸（px）"] == null || unknownFields["局部推理尺寸（px）"] === "");
  assert.deepEqual([unknown.archive.workflow.sourceWidth, unknown.archive.workflow.sourceHeight], [96, 64]);
  const known = await archiveFor("prompt", { inferenceTier: "original", inferenceEvidence: { width: 64, height: 64 } });
  const knownFields = buildRecordFields({ ...known.archive, actualSize: "96x64" });
  assert.equal(known.archive.workflow.inferenceSize, 64, "真实crop长边64不能被整图长边96覆盖");
  assert.equal(knownFields["局部推理尺寸（px）"], 64);
  const fourK = await archiveFor("reference", { inferenceTier: "4k" });
  const fourKFields = buildRecordFields({ ...fourK.archive, actualSize: "96x64" });
  assert.equal(fourK.archive.workflow.inferenceTier, "4k");
  assert.equal(fourKFields["局部推理尺寸（px）"], 4096);
});

test("参考模式四类附件按真实字段ID和实际字节上传，两次完整回读后才成功", async () => {
  const { archive } = await archiveFor(); const f = cliFixture();
  const synced = await syncGenerationToLark(archive, offlineConfig, { run: f.run });
  assert.equal(synced.ok, true, synced.error);
  assert.equal(synced.recordId, "rec-mask-archive");
  assert.equal(f.reads(), 2);
  assert.equal(f.fields["状态"], "成功");
  assert.deepEqual(new Set(f.uploads.map(upload => upload.name)), new Set(["参考图", "结果图", "遮罩图", "填充参考图"]));
  for (const [name, bytes] of [["参考图", sourceBytes], ["结果图", resultBytes], ["遮罩图", maskBytes], ["填充参考图", referenceBytes]]) {
    const actual = f.uploads.filter(upload => upload.name === name);
    assert.equal(actual.length, 1, `${name} 只上传一次`);
    assert.deepEqual(actual[0].bytes, bytes);
    assert.equal(f.fields[name][0].size, bytes.length);
    assert.ok(f.fields[name][0].file_token);
  }
  assert.equal(f.fields["风格参考图"], undefined);
  assert.equal(f.fields["最终 Prompt"], actualPrompt("reference"));
});

test("提示词模式只上传主图/结果/遮罩，既有普通生图仍不执行遮罩回读", async () => {
  const { archive } = await archiveFor("prompt"); const f = cliFixture();
  assert.equal((await syncGenerationToLark(archive, offlineConfig, { run: f.run })).ok, true);
  assert.deepEqual(new Set(f.uploads.map(upload => upload.name)), new Set(["参考图", "结果图", "遮罩图"]));
  assert.equal(f.fields["填充参考图"], undefined);
  const ordinary = { ...archive, workflow: { feature: "free-image-generation" }, modelLabel: "Flux2 Klein" };
  delete ordinary.maskImage; delete ordinary.fillReferenceImage;
  const old = cliFixture({ schema: schemaFields({ mask: false }) });
  assert.equal((await syncGenerationToLark(ordinary, offlineConfig, { run: old.run })).ok, true);
  assert.deepEqual(new Set(old.uploads.map(upload => upload.name)), new Set(["参考图", "结果图"]));
  assert.equal(old.reads(), 0);
});

test("GPT无mask两模式只归档真实图片，遮罩附件留空且参数和两次回读保留未提交事实", async () => {
  for (const mode of ["prompt", "reference"]) {
    const { archive } = await archiveFor(mode, { modelKey: "gptImage25Sunburst", hasMask: false });
    assert.equal(archive.maskImage, null);
    assert.equal(archive.boxedSourceImage, null);
    assert.equal(archive.workflow.provider, "oneapi"); assert.equal(archive.workflow.hasMask, false);
    assert.equal(archive.preview.fillReferencePurpose, mode === "reference" ? "object" : undefined);
    assert.equal(archive.workflow.fillReferencePurpose, mode === "reference" ? "object" : undefined);
    assert.equal(archive.workflow.maskExpand, 0); assert.equal(archive.workflow.maskSha256, null);
    assert.equal(archive.workflow.submittedMaskSha256, null); assert.equal(archive.workflow.drawnMaskSha256, null);
    const f = cliFixture();
    const synced = await syncGenerationToLark(archive, offlineConfig, { run: f.run });
    assert.equal(synced.ok, true, synced.error); assert.equal(f.reads(), 2);
    assert.deepEqual(new Set(f.uploads.map(upload => upload.name)),
      new Set(["参考图", "结果图", ...(mode === "reference" ? ["填充参考图"] : [])]));
    assert.ok(f.fields["遮罩图"] == null || f.fields["遮罩图"].length === 0);
    const recorded = JSON.parse(f.fields["生成参数"]).workflow;
    assert.equal(recorded.hasMask, false); assert.equal(recorded.maskSha256, null);
    assert.equal(recorded.submittedMaskSha256, null); assert.equal(recorded.maskExpand, 0);
    assert.deepEqual(recorded.attachmentManifest["框选原图"], []);
    assert.equal(recorded.promptSource, "submitted Responses background prompt");
    assert.equal(f.fields["遮罩工作流版本"], "2026-10-22.sunburst.15");
    assert.equal(f.fields["状态"], "成功");
  }
});

test("GPT参考模式三定位两种用途空原文留空，用途/固定Prompt/附件两次回读后成功", async () => {
  for (const location of [{ hasMask: false }, { hasMask: true },
    { hasMask: false, editRegion: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 } }]) {
    for (const fillReferencePurpose of [undefined, "object", "material"]) for (const prompt of ["", " \n\t "]) {
      const { archive, validated } = await archiveFor("reference", { modelKey: "gptImage25Sunburst", prompt, fillReferencePurpose, ...location });
      assert.equal(validated.prompt, "");
      assert.equal(archive.sourcePrompt, "");
      assert.ok(archive.finalPrompt.trim());
      assert.match(archive.finalPrompt, fillReferencePurpose === "material" ? /Apply the material from image 2 to/i : /Replace .* with the corresponding object from image 2/i);
      assert.equal(archive.preview.fillReferencePurpose, fillReferencePurpose || "object");
      assert.doesNotMatch(archive.finalPrompt, /User instruction:|undefined|\{用户|推荐写法/);
      const f = cliFixture();
      const synced = await syncGenerationToLark(archive, offlineConfig, { run: f.run });
      assert.equal(synced.ok, true, synced.error); assert.equal(f.reads(), 2);
      assert.equal(f.fields["原始 Prompt"], "");
      assert.equal(f.fields["最终 Prompt"], archive.finalPrompt);
      const recorded = JSON.parse(f.fields["生成参数"]);
      assert.equal(recorded.workflow.sourcePrompt, "");
      assert.equal(recorded.workflow.fillReferencePurpose, fillReferencePurpose || "object");
      assert.equal(Object.hasOwn(f.fields, "参考用途"), false, "用途归入参数JSON，不新增飞书列");
      assert.equal(f.fields["状态"], "成功");
    }
  }
});

test("参考用途回执与归档须一致，用途JSON第二次回读漂移不能报成功或重新上传", async () => {
  const { input, validated, result, archive } = await archiveFor("reference", { modelKey: "gptImage25Sunburst", hasMask: false,
    prompt: "", fillReferencePurpose: "material" });
  const wrongReceipt = structuredClone(result); wrongReceipt.upstream.metadata.fillReferencePurpose = "object";
  assert.throws(() => buildImageMaskFillArchive({ input, validated, result: wrongReceipt }), /参考用途/);
  const f = cliFixture({ transformRead(fields, reads) {
    if (reads !== 2) return;
    const parameters = JSON.parse(fields["生成参数"]);
    parameters.workflow.fillReferencePurpose = "object";
    fields["生成参数"] = JSON.stringify(parameters);
  } });
  const synced = await syncGenerationToLark(archive, offlineConfig, { run: f.run });
  assert.equal(synced.ok, false); assert.equal(f.reads(), 2);
  assert.equal(f.fields["状态"], "同步失败");
  assert.equal(f.uploads.length, 3, "只上传原图/结果/参考，回读失败不重复上传");
  assert.equal(f.commands.filter(args => args.includes("+record-batch-create")).length, 1);
});

test("GPT两模式矩形和自由圈选实际送模PNG独立上传，原件与真实点/轮廓/摘要/指令经两次回读冻结", async () => {
  const regions = [{ x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
    { type: "polygon", points: [{ x: 0.25, y: 0.25 }, { x: 0.75, y: 0.25 }, { x: 0.5, y: 0.75 }] }];
  for (const editRegion of regions) for (const mode of ["prompt", "reference"]) {
    const { archive, prepared } = await archiveFor(mode, { modelKey: "gptImage25Sunburst", hasMask: false, editRegion });
    const f = cliFixture();
    assert.equal((await syncGenerationToLark(archive, offlineConfig, { run: f.run })).ok, true);
    assert.equal(f.reads(), 2);
    assert.equal(f.fields["遮罩图"], undefined);
    assert.equal(archive.maskImage, null);
    assert.deepEqual(f.uploads.find(upload => upload.name === "参考图").bytes, sourceBytes, "原参考图保留未标框用户原件");
    const boxedUpload = f.uploads.filter(upload => upload.name === "框选原图");
    assert.equal(boxedUpload.length, 1);
    assert.deepEqual(boxedUpload[0].bytes, prepared.sourceBytes, "独立附件必须逐字节等于实际提交给GPT的蓝色圈选原图");
    assert.deepEqual(Buffer.from(archive.boxedSourceImage.imageUrl.split(",")[1], "base64"), prepared.sourceBytes);
    assert.equal(archive.boxedSourceImage.size, prepared.sourceBytes.length);
    assert.equal(f.uploads.filter(upload => upload.name === "填充参考图").length, mode === "reference" ? 1 : 0);
    const recorded = JSON.parse(f.fields["生成参数"]).workflow;
    assert.deepEqual(recorded.editRegion, editRegion);
    assert.deepEqual(recorded.editRegionPixels, prepared.editRegionPixels);
    if (editRegion.type === "polygon") {
      assert.deepEqual(recorded.editRegionPixels, { type: "polygon", points: [{ x: 24, y: 16 }, { x: 72, y: 16 }, { x: 48, y: 48 }],
        bounds: { left: 24, top: 16, width: 49, height: 33 } });
      assert.equal(recorded.regionAnnotation.shape, "polygon");
      assert.equal(recorded.regionAnnotation.placement, "centered-on-contour");
    } else assert.deepEqual(recorded.editRegionPixels, { left: 24, top: 16, width: 48, height: 32 });
    assert.equal(recorded.regionAnnotation.color, "#3b82f6");
    assert.equal(recorded.sourceSha256, digest(sourceBytes));
    assert.equal(recorded.submittedSourceSha256, archive.workflow.submittedSourceSha256);
    assert.deepEqual(recorded.attachmentManifest["框选原图"], [{ size: prepared.sourceBytes.length, sha256: digest(prepared.sourceBytes) }]);
    assert.notEqual(recorded.submittedSourceSha256, recorded.sourceSha256);
    assert.equal(recorded.hasMask, false); assert.equal(recorded.maskExpand, 0);
    assert.equal(recorded.promptSource, "submitted Responses background prompt");
    assert.equal(f.fields["最终 Prompt"], archive.finalPrompt);
    assert.match(f.fields["最终 Prompt"], /blue outline/i);
    assert.match(f.fields["最终 Prompt"], /The temporary blue outline identifies the edit target/i);
    assert.match(f.fields["最终 Prompt"], /Edit this selected target and preserve unrelated content/i);
    if (mode === "reference") {
      assert.match(f.fields["最终 Prompt"], /Replace .* with the corresponding object from image 2/i);
      assert.match(f.fields["最终 Prompt"], /If additional instructions are provided, follow them/i);
      assert.match(f.fields["最终 Prompt"], /Do not copy unrelated content or background from image 2/i);
    }
    assert.doesNotMatch(f.fields["最终 Prompt"], /\bred\b|rectangle|only inside|restyle/i);
    assert.match(f.fields["最终 Prompt"], /remove[^\n]*(?:outline|selection|guide)/i);
    assert.equal(f.fields["状态"], "成功");
  }
});

test("框选归档缺实际框图/摘要漂移或非框选注入框图均拒绝，不静默替换原件", async () => {
  const editRegion = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
  const { input, validated, result, boxedSourceImage } = await archiveFor("reference", { modelKey: "gptImage25Sunburst", hasMask: false, editRegion });
  const build = (extra = {}) => buildImageMaskFillArchive({ input, validated, result, boxedSourceImage, ...extra });
  assert.throws(() => build({ boxedSourceImage: null }), /框选/);
  assert.throws(() => build({ boxedSourceImage: { ...boxedSourceImage, imageUrl: descriptor(sourceBytes, "unmarked.png").dataUrl, size: sourceBytes.length } }), /框选|SHA/);
  const wrongSha = structuredClone(result); wrongSha.upstream.metadata.submittedSourceSha256 = "0".repeat(64);
  assert.throws(() => build({ result: wrongSha }), /框选|SHA/);
  const missingSha = structuredClone(result); delete missingSha.upstream.metadata.submittedSourceSha256;
  assert.throws(() => build({ result: missingSha }), /框选|SHA/);
  assert.throws(() => build({ boxedSourceImage: { ...boxedSourceImage, size: boxedSourceImage.size + 1 } }), /框选|字节/);
  const ordinary = await archiveFor("prompt", { modelKey: "gptImage25Sunburst", hasMask: false });
  assert.throws(() => buildImageMaskFillArchive({ input: ordinary.input, validated: ordinary.validated, result: ordinary.result, boxedSourceImage }), /框选/);
});

test("框选原图Schema/字节/摘要在建档前准入，独立附件两次回读缺失或漂移均阻断成功且不重传", async () => {
  const { archive } = await archiveFor("reference", { modelKey: "gptImage25Sunburst", hasMask: false,
    editRegion: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 } });
  for (const changed of [{ boxedSourceImage: null }, { boxedSourceImage: { ...archive.boxedSourceImage, size: archive.boxedSourceImage.size + 1 } },
    { workflow: { ...archive.workflow, submittedSourceSha256: "0".repeat(64) } }]) {
    const f = cliFixture();
    const result = await syncGenerationToLark({ ...archive, ...changed }, offlineConfig, { run: f.run });
    assert.equal(result.ok, false);
    assert.equal(f.commands.some(args => args.includes("+record-batch-create")), false, "框图合同错误在建档/上传前阻断");
    assert.equal(f.uploads.length, 0);
  }
  const faults = [
    ["缺附件", fields => { fields["框选原图"] = []; }],
    ["空token", fields => { fields["框选原图"][0].file_token = ""; }],
    ["无size", fields => { delete fields["框选原图"][0].size; }],
    ["错size", fields => { fields["框选原图"][0].size += 1; }],
    ["二次token漂移", (fields, read) => { if (read === 2) fields["框选原图"][0].file_token = "changed-boxed-token"; }],
    ["二次size漂移", (fields, read) => { if (read === 2) fields["框选原图"][0].size += 1; }],
  ];
  for (const [label, transformRead] of faults) {
    const f = cliFixture({ transformRead });
    const synced = await syncGenerationToLark(archive, offlineConfig, { run: f.run });
    assert.equal(synced.ok, false, label);
    assert.equal(f.fields["状态"], "同步失败", label);
    assert.equal(f.commands.filter(args => args.includes("+record-batch-create")).length, 1, label);
    assert.equal(f.uploads.filter(upload => upload.name === "框选原图").length, 1, "回读失败不重新上传框图");
    assert.equal(f.uploads.length, 4, label);
  }
});

test("完整字段与每类附件缺失/空token/错尺寸或第二次token漂移均返回失败，归档不重复上传", async () => {
  const { archive } = await archiveFor();
  const cases = [
    ["最终Prompt截断", fields => { fields["最终 Prompt"] = "truncated"; }],
    ["原文漂移", fields => { fields["原始 Prompt"] = "changed"; }],
    ["模式漂移", fields => { fields["遮罩填充模式"] = "提示词填充"; }],
    ["局部尺寸漂移", fields => { fields["局部推理尺寸（px）"] = 1024; }],
    ["工作流丢失", fields => { fields["生成参数"] = "{}"; }],
    ["无框选混入框图", fields => { fields["框选原图"] = [{ file_token: "unexpected-box", size: 1 }]; }],
    ...["参考图", "结果图", "遮罩图", "填充参考图"].flatMap(name => [
      [`${name}缺失`, fields => { fields[name] = []; }],
      [`${name}空token`, fields => { fields[name][0].file_token = ""; }],
      [`${name}无size`, fields => { delete fields[name][0].size; }],
      [`${name}错size`, fields => { fields[name][0].size += 1; }],
    ]),
    ["第二次token变化", (fields, read) => { if (read === 2) fields["遮罩图"][0].file_token = "different-token"; }],
    ["第二次size变化", (fields, read) => { if (read === 2) fields["结果图"][0].size += 1; }],
  ];
  for (const [label, transformRead] of cases) {
    const f = cliFixture({ transformRead });
    const synced = await syncGenerationToLark(archive, offlineConfig, { run: f.run });
    assert.equal(synced.ok, false, label);
    assert.ok(synced.error, label);
    assert.equal(f.fields["状态"], "同步失败", label);
    assert.equal(f.commands.filter(args => args.includes("+record-batch-create")).length, 1, label);
    assert.equal(f.uploads.length, 4, `${label} 不重传或重新生成`);
  }
});

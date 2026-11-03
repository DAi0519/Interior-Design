/**
 * [INPUT]: 依赖独立归档合同、真实图片解码/光源引导编译器与sharp内存PNG和CLI Schema替身
 * [OUTPUT]: 验证单源/点线面双图、独立字段投影、Prompt/光源/图片身份漂移和真实CLI无选项ID形态
 * [POS]: test 的AI渲染台写入前归档合同，不调用模型、飞书或真实同步
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import sharp from "sharp";
import { AI_RENDER_STUDIO_ARCHIVE_FIELDS, AI_RENDER_STUDIO_GUIDE_FIELD,
  assertAiRenderStudioSyncSchema, verifyAiRenderStudioSyncSchema, buildAiRenderStudioArchive,
  aiRenderStudioArchiveManifest, aiRenderStudioRecordFields } from "../src/ai-render-studio-archive.mjs";
import { AI_RENDER_STUDIO_WORKFLOW_VERSION, AI_RENDER_STUDIO_RENDER_STYLES,
  AI_RENDER_STUDIO_IMAGE_POLICY } from "../src/ai-render-studio-definitions.mjs";
import { AI_RENDER_STUDIO_PROMPT_CONFIG } from "../src/ai-render-studio-prompt.mjs";
import { buildAiRenderStudioPrompt } from "../src/ai-render-studio-service.mjs";
import { validateRelightInput } from "../src/image-relight-service.mjs";
import { executeRelightOneApi, RELIGHT_ONEAPI_MODEL } from "../src/image-relight-oneapi.mjs";
import { aiRenderStudioLightingPlan } from "../src/ai-render-studio-lighting.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const bundle = { schemaVersion: 1, renderBoundary: "Keep source design and materials.", lightingBoundary: "Follow typed lighting.",
  materialModes: { faithful: "Improve realism while retaining material identities." },
  renderStyles: { photoreal: "Photographic rendering.", soft: "Soft photographic response.", cinematic: "Cinematic response.", film: "Analog response." },
  output: "Return one native PNG." };
const rawPrompt = JSON.stringify(bundle);
const snapshot = { code: "ai-render-studio", name: "AI渲染台", version: 1, published: true, prompt: rawPrompt, bundle,
  sha256: hash(rawPrompt), source: `feishu:${AI_RENDER_STUDIO_PROMPT_CONFIG.tableId}:ai-render-studio@v1` };
const presetPrompt = "[Atmosphere] Calm cinematic daylight.\n[Lighting] Diffuse side daylight.\n[Exposure] Preserve natural depth.";
const lightingPreset = { id: "recStudioCard", code: "cinematic-soft-light", name: "电影柔光", version: 5,
  sha256: hash("live-card-identity"), prompt: presetPrompt, promptSha256: hash(presetPrompt) };
const schemaConfig = { baseToken: "archive-unit-base", tableId: "archive-unit-table", cliPath: "unit-cli",
  referenceFieldId: "fldReference", resultFieldId: "fldResult" };
const commonTypes = { "标题": "text", "功能": "select", "生图模型": "select", "原始 Prompt": "text", "最终 Prompt": "text",
  "生成参数": "text", "尺寸": "text", "耗时（秒）": "number", "状态": "select", "错误信息": "text", "参考图": "attachment", "结果图": "attachment" };
function schema() {
  const choices = { "功能": ["AI渲染台"], "生图模型": [RELIGHT_ONEAPI_MODEL.label], "状态": ["成功", "同步失败"],
    "AI渲染台渲染风格": AI_RENDER_STUDIO_RENDER_STYLES.map((entry) => entry.label), "AI渲染台材质策略": ["保留原材质"],
    "AI渲染台光照方案": ["原光影/自定义", lightingPreset.name], "AI渲染台原灯处理": ["保留", "整体减弱", "全部关闭"] };
  return { ok: true, data: { fields: Object.entries({ ...commonTypes, ...AI_RENDER_STUDIO_ARCHIVE_FIELDS }).map(([name, type], index) => ({
    name, type, id: name === "参考图" ? schemaConfig.referenceFieldId : name === "结果图" ? schemaConfig.resultFieldId : `fldFixture${index}`,
    ...(choices[name] ? { options: choices[name].map((label) => ({ name: label, hue: 20, lightness: 0.5 })) } : {}),
  })) } };
}
const photo = async (width = 96, height = 64) => sharp({ create: { width, height, channels: 3, background: "#afa394" } }).png().toBuffer();
const descriptor = (bytes, type) => ({ dataUrl: `data:${type};base64,${bytes.toString("base64")}`, name: "source", type, size: bytes.length });
const marked = (type) => ({ id: "light-1", type, action: "brighten", mode: "lightOnly", kelvin: 4000, intensity: 1,
  softness: "soft", fixture: "", target: { x: 0.8, y: 0.7 },
  points: type === "point" ? [{ x: 0.2, y: 0.2 }] : type === "line" ? [{ x: 0.2, y: 0.2 }, { x: 0.4, y: 0.2 }]
    : [{ x: 0.2, y: 0.2 }, { x: 0.4, y: 0.2 }, { x: 0.3, y: 0.4 }] });

async function fixture({ type = null, sourceBytes, mimeType = "image/png", renderStyle = "photoreal", preset = null } = {}) {
  const bytes = sourceBytes || await photo();
  const normalized = await validateRelightInput({ referenceImages: [descriptor(bytes, mimeType)],
    lights: type ? [marked(type)] : [], templateKey: "custom", originalLights: { action: "keep" },
    prompt: "用户要求先保留材料与机位。" }, { allowMaterialRender: true, imagePolicy: AI_RENDER_STUDIO_IMAGE_POLICY });
  const validated = { ...normalized, renderStyle, materialMode: "faithful", lightingPreset: structuredClone(preset), relightPromptSnapshot: structuredClone(snapshot) };
  const prepared = { validated, snapshot: validated.relightPromptSnapshot, renderStyle, materialMode: "faithful",
    compiledPrompt: buildAiRenderStudioPrompt(validated) };
  let outputBytes;
  const completed = await executeRelightOneApi(validated, { buildPrompt: buildAiRenderStudioPrompt,
    imageClient: { async editImageAsync(request) {
      const [width, height] = request.size.split("x").map(Number); outputBytes = await photo(width, height);
      return { images: [{ url: `data:image/png;base64,${outputBytes.toString("base64")}` }], transport: "offline-stub" };
    } } });
  const { relightPromptCode, relightPromptVersion, relightPromptSha256, relightPromptSource, templateSource, ...actual } = completed.upstream.metadata;
  const plan = aiRenderStudioLightingPlan(validated);
  const result = { ...completed, upstream: { ...completed.upstream, metadata: { ...actual, feature: "ai-render-studio",
    version: AI_RENDER_STUDIO_WORKFLOW_VERSION, workflowVersion: AI_RENDER_STUDIO_WORKFLOW_VERSION,
    promptCode: snapshot.code, promptVersion: snapshot.version, promptSha256: snapshot.sha256, promptSource: snapshot.source,
    materialMode: "faithful", renderStyle, lightingPreset: structuredClone(preset), submittedPromptSha256: hash(prepared.compiledPrompt), lightingPlanSha256: hash(JSON.stringify(plan)) } } };
  const input = { jobId: "studio-archive-unit-0001", prepared, result, guideImage: completed.archiveGuideImage };
  return { input, outputBytes, sourceBytes: bytes, archive: buildAiRenderStudioArchive(input) };
}

test("真实CLI选项无ID形态和13独立字段通过，Schema只依赖本功能所写字段", async () => {
  const body = schema(), result = assertAiRenderStudioSyncSchema(body, { config: schemaConfig });
  assert.equal(Object.keys(AI_RENDER_STUDIO_ARCHIVE_FIELDS).length, 13);
  assert.equal(result.attachmentFieldIds["参考图"], schemaConfig.referenceFieldId);
  assert.ok(result.attachmentFieldIds[AI_RENDER_STUDIO_GUIDE_FIELD]);
  const calls = [];
  const verified = await verifyAiRenderStudioSyncSchema(schemaConfig, { run: async (config, args) => { calls.push({ config, args }); return body; } });
  assert.deepEqual(verified, result);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args.slice(0, 4), ["base", "+field-list", "--as", "user"]);
});

test("缺列、错型、缺选项/重复选项、重复字段与无效附件ID或分页都阻断", () => {
  const at = (body, name) => body.data.fields.find((entry) => entry.name === name);
  for (const mutate of [
    (body) => { body.ok = false; }, (body) => { body.data.has_more = true; },
    (body) => { body.data.fields = body.data.fields.filter((entry) => entry.name !== "AI渲染台计划SHA256"); },
    (body) => { at(body, "AI渲染台Prompt版本").type = "text"; },
    (body) => { at(body, "AI渲染台渲染风格").options.pop(); },
    (body) => { const field = at(body, "功能"); field.options.push({ ...field.options[0] }); },
    (body) => { at(body, "状态").options = {}; },
    (body) => { body.data.fields.push({ ...at(body, "AI渲染台Prompt编码") }); },
    (body) => { at(body, AI_RENDER_STUDIO_GUIDE_FIELD).id = "not-a-field-id"; },
    (body) => { at(body, AI_RENDER_STUDIO_GUIDE_FIELD).id = schemaConfig.referenceFieldId; },
  ]) {
    const body = schema(); mutate(body);
    assert.throws(() => assertAiRenderStudioSyncSchema(body, { config: schemaConfig }), { statusCode: 409 });
  }
});

for (const type of [null, "point", "line", "area"]) test(`归档${type || "仅材质"}准确保存实际原图/结果${type ? "/标注图" : "，不伪造标注图"}`, async () => {
  const { archive, outputBytes, sourceBytes } = await fixture({ type });
  const manifest = aiRenderStudioArchiveManifest(archive, outputBytes);
  assert.equal(manifest["参考图"][0].sha256, hash(sourceBytes));
  assert.equal(manifest["结果图"][0].sha256, hash(outputBytes));
  assert.equal(manifest[AI_RENDER_STUDIO_GUIDE_FIELD].length, type ? 1 : 0);
  if (type) assert.equal(manifest[AI_RENDER_STUDIO_GUIDE_FIELD][0].width, manifest["参考图"][0].width);
  assert.equal(archive.workflow.promptCode, "ai-render-studio");
  assert.equal(archive.workflow.promptSource, snapshot.source);
  assert.equal(archive.workflow.promptSha256, snapshot.sha256);
  assert.equal(archive.workflow.lightingPreset, null);
  assert.equal(archive.finalPrompt, archive.workflow.prompt);
  assert.equal(archive.sourcePrompt, archive.workflow.sourcePrompt);
  assert.equal(Object.keys(archive.workflow).some((key) => key.startsWith("relightPrompt")), false);
});

test("方向归一JPEG按真实归一字节归档，不把重编码送模PNG摘要当原件", async () => {
  const original = await sharp(await photo()).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const { archive, outputBytes } = await fixture({ sourceBytes: original, mimeType: "image/jpeg" });
  const manifest = aiRenderStudioArchiveManifest(archive, outputBytes), workflow = archive.workflow;
  assert.equal(workflow.sourceSha256, hash(original));
  assert.notEqual(workflow.sourceSha256, workflow.normalizedSourceSha256);
  assert.notEqual(workflow.submittedSourceSha256, workflow.normalizedSourceSha256);
  assert.equal(manifest["参考图"][0].sha256, workflow.normalizedSourceSha256);
  assert.equal(manifest["参考图"][0].width, 64);
  assert.equal(manifest["参考图"][0].height, 96);
});

test("独立字段投影保留任务/风格/保原材质/灯光JSON/独立Prompt身份且不写附件普通值", async () => {
  const { archive } = await fixture({ renderStyle: "film", preset: lightingPreset });
  const fields = aiRenderStudioRecordFields(archive);
  assert.equal(Object.keys(fields).length, 13);
  assert.equal(fields["功能"], "AI渲染台");
  assert.equal(fields["AI渲染台渲染风格"], "胶片质感");
  assert.equal(fields["AI渲染台材质策略"], "保留原材质");
  assert.equal(fields["AI渲染台光照方案"], lightingPreset.name);
  assert.equal(fields["AI渲染台原灯处理"], "保留");
  assert.deepEqual(JSON.parse(fields["AI渲染台光源方案"]), archive.workflow.lightingPlan);
  assert.equal(fields["AI渲染台Prompt来源"], snapshot.source);
  assert.equal(Object.hasOwn(fields, AI_RENDER_STUDIO_GUIDE_FIELD), false);
});

test("选卡冻结真实身份与完整三段正文，单源归档不把卡片当第二图，选项按实际卡名准入", async () => {
  const { archive, outputBytes } = await fixture({ preset: lightingPreset });
  assert.deepEqual(archive.workflow.lightingPreset, lightingPreset);
  assert.deepEqual(archive.workflow.lightingPlan.lightingPreset, lightingPreset);
  assert.equal(archive.finalPrompt.split(lightingPreset.prompt).length - 1, 1);
  assert.equal(archive.workflow.referenceImageCount, 1);
  assert.equal(aiRenderStudioArchiveManifest(archive, outputBytes)[AI_RENDER_STUDIO_GUIDE_FIELD].length, 0);
  assertAiRenderStudioSyncSchema(schema(), { config: schemaConfig, lightingPresetNames: [lightingPreset.name] });
  const missingCard = schema();
  missingCard.data.fields.find((entry) => entry.name === "AI渲染台光照方案").options.pop();
  assertAiRenderStudioSyncSchema(missingCard, { config: schemaConfig });
  assert.throws(() => assertAiRenderStudioSyncSchema(missingCard, { config: schemaConfig, lightingPresetNames: [lightingPreset.name] }), { statusCode: 409 });
});

test("卡片正文、身份与计划在构造或写入前漂移均被拒，旧五打光模板不能替代真实卡片", async () => {
  const { input, archive, outputBytes } = await fixture({ preset: lightingPreset });
  for (const mutate of [
    (value) => { value.result.upstream.metadata.lightingPreset.prompt += "drift"; },
    (value) => { value.result.upstream.metadata.lightingPreset.sha256 = "0".repeat(64); },
    (value) => { value.prepared.validated.lightingPreset.promptSha256 = "0".repeat(64); },
    (value) => { delete value.result.upstream.metadata.lightingPreset.prompt; },
    (value) => { value.prepared.validated.templateKey = "naturalFill"; },
    (value) => { delete value.prepared.validated.lightingPreset; },
  ]) {
    const changed = structuredClone(input); mutate(changed);
    assert.throws(() => buildAiRenderStudioArchive(changed), { statusCode: 409 });
  }
  for (const mutate of [
    (value) => { value.workflow.lightingPreset.prompt += "drift"; },
    (value) => { value.workflow.lightingPreset.name += "drift"; },
    (value) => { value.workflow.lightingPlan.lightingPreset.prompt += "drift"; },
    (value) => { value.workflow.lightingPreset = null; },
  ]) {
    const changed = structuredClone(archive); mutate(changed);
    assert.throws(() => aiRenderStudioArchiveManifest(changed, outputBytes), { statusCode: 409 });
  }
});

test("实际Prompt、资产、风格、灯光、图数或源图身份漂移均在归档构造前阻断", async () => {
  const { input } = await fixture({ type: "point" });
  for (const mutate of [
    (value) => { value.result.upstream.metadata.prompt += "drift"; },
    (value) => { value.result.upstream.metadata.sourcePrompt += "drift"; },
    (value) => { value.prepared.snapshot.bundle.output = "drift"; },
    (value) => { value.result.upstream.metadata.promptSource = "feishu:tblDCXNib9XeWuza:image-relight@v1"; },
    (value) => { value.result.upstream.metadata.renderStyle = "film"; },
    (value) => { value.prepared.validated.materialMode = "refined"; },
    (value) => { value.result.upstream.metadata.normalizedSourceSha256 = "0".repeat(64); },
    (value) => { value.result.upstream.metadata.referenceImageCount = 1; },
    (value) => { value.result.upstream.metadata.relightPromptCode = "image-relight"; },
    (value) => { value.result.upstream.metadata.provider = "other"; },
    (value) => { value.result.upstream.metadata.lights[0].kelvin = 6000; },
    (value) => { value.guideImage = null; },
  ]) {
    const changed = structuredClone(input); mutate(changed);
    assert.throws(() => buildAiRenderStudioArchive(changed), { statusCode: 409 });
  }
});

test("写入前原始/最终Prompt、图片字节/格式尺寸或计划发生漂移时manifest和字段投影拒绝", async () => {
  const { archive, outputBytes } = await fixture({ type: "line" });
  for (const mutate of [
    (value) => { value.sourcePrompt += "drift"; },
    (value) => { value.finalPrompt += "drift"; },
    (value) => { value.workflow.jobId = "bad"; },
    (value) => { value.workflow.lightingPlanSha256 = "0".repeat(64); },
    (value) => { value.workflow.outputWidth += 16; },
    (value) => { value.referenceImages[0].mimeType = "image/jpeg"; },
    (value) => { value.guideImage.size += 1; },
    (value) => { value.preview.referenceImageCount = 1; },
  ]) {
    const changed = structuredClone(archive); mutate(changed);
    assert.throws(() => aiRenderStudioArchiveManifest(changed, outputBytes), { statusCode: 409 });
  }
  const changed = structuredClone(archive); changed.sourcePrompt += "drift";
  assert.throws(() => aiRenderStudioRecordFields(changed), { statusCode: 409 });
  assert.throws(() => aiRenderStudioArchiveManifest(archive, Buffer.from("invalid")), { statusCode: 409 });
});

/**
 * [INPUT]: 依赖 Node测试/文件与SHA、sharp真实全景、飞书规则夹具与旧v1-v4光影合同、Beta Base Store与全景元数据替身
 * [OUTPUT]: 对外提供当前合同归档、旧v1-v3合同/旧R5_4成品原词恢复，以及未知身份/回执篡改/缺成品与未成图套旧词拒绝测试
 * [POS]: test 的 Beta 全景归档闭环测试，实际编解码图片但不读写飞书或提交GPU
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import sharp from "sharp";
import { BETA_BASE_CONFIG, betaConfigSnapshot, betaResultVersion, buildBetaRunFields,
  captureBetaGenerationArchive, createBetaBaseStore } from "../src/beta-base.mjs";
import { executeEffectRenderEnhancementWorkflow as executeWorkflow } from "../src/effect-render-enhancement-workflow.mjs";
import { PANORAMA_WORKFLOW, panoramaWorkflowMetadata } from "../src/panorama-workflow.mjs";
import { panoramaRuleIdentity as PANORAMA_LIGHTING_IDENTITY, panoramaRuleSelection, loadPanoramaRule } from "./panorama-lighting-fixture.mjs";

const executeEffectRenderEnhancementWorkflow = (input, options) => executeWorkflow(input, { loadPanoramaLightingRule: loadPanoramaRule, ...options });

const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const legacyContract = { code: "panorama-lighting-transform", version: 1,
  sha256: "a1d773698284fbe502e27e212d0ad9d8a6aee0fd4db964283c28db6d1ef25985" };
const legacyContractBody = [
  "Relight the supplied equirectangular 360-degree panorama according to the lighting target below.",
  "Preserve the complete room geometry, layout, camera position, projection, openings, furniture, object positions, material types, textures, and intrinsic material colors. Do not add, remove, move, or redesign objects or structures.",
  "Change the time-of-day appearance, existing light-source balance, shadow softness, color temperature, exposure, and white balance as needed to realize the target. Use existing windows, openings, and luminaires; do not invent light fixtures or openings. Suppress source illumination that conflicts with the target.",
  "Keep lighting physically coherent throughout the whole sphere. The left and right image edges are adjacent; match illumination, materials, shadows, and reflections across that seam and maintain continuity at the poles. Do not crop or change the panorama projection.",
  "Render natural material response, readable shadows, controlled highlights, and smooth tonal transitions. Preserve ambiguous or occluded structure rather than inventing detail. Interpret target colors as illumination, not as replacement material colors.",
  "Apply the preset target and then the user's refinements; user refinements override the preset lighting preferences while the geometry and material constraints above remain fixed.",
].join("\n");
const legacyV2Contract = { code: "panorama-lighting-transform", version: 2,
  sha256: "5da9e8b87206a4f9234ac4e9c0a927d5515f212ea4d1a29f00471b813c68f633" };
const legacyV3Contract = { code: "panorama-lighting-transform", version: 3,
  sha256: "3c4167532f69715756f1eed9393f4cfa46657c54fe9282ac028df9b3c2162936" };
const legacyV3Document = await readFile(new URL("../workflows/panorama-enhancement/光影规则模板-v3.md", import.meta.url), "utf8");
const legacyV3ContractBody = legacyV3Document.match(/```text\n([\s\S]+?)\n```/)?.[1];
assert.ok(legacyV3ContractBody, "历史v3完整正文缺失");
const legacyV2ContractBody = "Preserve the input's existing geometry, layout, camera perspective, boundaries, and object placement. Do not add, remove, move, or complete any structure. When an area is distant, dark, blurred, or ambiguous, retain its original visibility and tonal simplicity. Do not reinterpret ambiguous areas. Treat every existing surface as continuous and unchanged unless its boundary is clearly visible in the input. Preserve intrinsic surface color and opacity, while allowing brightness to follow the lighting target. Treat indoor transparent and reflective surfaces as existing interior surfaces. Preserve their original content and opacity, while allowing brightness and reflection intensity to follow the lighting target. A bright, translucent, or reflective area is not evidence of additional visible content. Keep white balance and warm-and-cool variation consistent with the lighting target, while preserving original material color identity. Preserve readable shadow detail and smooth highlight roll-off. Keep the tonal range natural and photographic. More clearly increase tonal separation within existing materials while preserving smooth transitions and the lighting target's overall exposure. Let already-visible form turning, fabric relief, wood grain, stone variation, and metal response read with greater tactile depth without adding pattern or surface detail. Enrich the existing color density, tonal layering, and diffuse-to-specular response of materials with an irregular camera-captured character, avoiding clean synthetic sheen while preserving their original color identity and overall balance. Refine existing luminance layers across already visible materials, with smooth gradual transitions. Improve gentle color differentiation between existing materials while preserving their original identities. Refine the smooth transition between existing highlights and shadows, allowing their extent to follow the lighting target. Build a richer, more immersive sense of the target ambient light through gentle but more legible tonal gradation across visible material forms, with no extra visible content. Preserve existing subtle natural unevenness in material response and tonal variation. Favor restrained camera-captured irregularity over uniform polish, idealized clarity, perfectly smooth gradients, or showroom-like surfaces. Keep local contrast and edge definition restrained, retaining natural irregularity and gentle optical softness in existing fine repetitive textures and distant detail. Avoid simulated render crispness, pristine edge separation, and overly controlled tonal shaping. Keep overall color saturation consistent with the lighting target, while preserving original material color identity and balance. In already bright distant regions, retain broad exposure roll-off with slightly reduced color separation, without recovering detail. Use existing windows, openings, and luminaires; do not invent light fixtures or openings. Apply the preset target and then the user's refinements; user refinements override the preset lighting preferences while the geometry and material constraints above remain fixed.";
const bytes = await sharp({ create: { width: 64, height: 32, channels: 3, background: "#999999" } }).png().toBuffer();
const url = `data:image/png;base64,${bytes.toString("base64")}`;
const image = { dataUrl: url, type: "image/png", size: bytes.length, name: "source.png" };
const preset = { id: "recPanoramaCard", code: "warm-night", name: "暖色夜景", version: 3,
  sha256: "a".repeat(64), prompt: "A dark warm night interior with existing lamps as the dominant lighting." };
const input = { featureMode: "panoramaEnhancement", modelKey: "aiTextureEnhancement", ratio: "2:1", ratioMode: "original",
  resolution: "original", outputFormat: "png", referenceImages: [image], panoramaLightingRule: panoramaRuleSelection, panoramaLighting: {
    presetId: preset.id, version: preset.version, sha256: preset.sha256 }, prompt: "Keep soft shadows." };
const request = { batchId: "BETA-panoramaarchive", featureMode: "panoramaEnhancement", testTime: "2026-10-28 17:00:00",
  item: { caseId: "CASE-1", runId: "RUN-panoramaarchive", input } };

function envelope(fields) {
  return { ok: true, data: { fields: Object.keys(fields), data: [Object.values(fields)],
    record_id_list: ["rec-panorama"], has_more: false } };
}
function fixture() {
  const fields = {}, commands = [];
  let downloadedSource = bytes;
  const run = async (_config, args, options) => {
    commands.push(args);
    if (args.includes("+record-batch-create")) {
      const body = JSON.parse(args[args.indexOf("--json") + 1]);
      Object.assign(fields, Object.fromEntries(body.fields.map((key, index) => [key, body.rows[0][index]])));
      return { ok: true, data: { record_id_list: ["rec-panorama"] } };
    }
    if (args.includes("+record-upsert")) {
      Object.assign(fields, JSON.parse(args[args.indexOf("--json") + 1]));
      return { ok: true, data: {} };
    }
    if (args.includes("+record-upload-attachment")) {
      const fieldId = args[args.indexOf("--field-id") + 1];
      const field = fieldId === BETA_BASE_CONFIG.inputFieldId ? "输入图" : fieldId === BETA_BASE_CONFIG.resultFieldId ? "结果图" : "风格参考图";
      const name = args[args.indexOf("--file") + 1];
      const content = await readFile(join(options.cwd, name));
      fields[field] = [{ file_token: field === "输入图" ? "source-token" : "result-token", name, size: content.length }];
      return { ok: true, data: {} };
    }
    if (args.includes("+record-get") || args.includes("+record-list")) return envelope(fields);
    if (args.includes("+record-download-attachment")) {
      const content = args[args.indexOf("--file-token") + 1] === "source-token" ? downloadedSource : bytes;
      await writeFile(join(options.cwd, args[args.indexOf("--output") + 1]), content);
      return { ok: true, data: {} };
    }
    throw new Error(`未建模命令 ${args[1]}`);
  };
  return { fields, commands, run, store: createBetaBaseStore({ run }), setSource(value) { downloadedSource = value; } };
}
async function generated(value = input) {
  const result = await executeEffectRenderEnhancementWorkflow(value, {
    loadPanoramaLightingAssets: async () => ({ presets: [preset] }),
    imageClient: { async generateImage(generationRequest) { return { images: [{ url }], metadata: generationRequest.workflow_kind ? panoramaWorkflowMetadata({
      generationRequest, width: 64, height: 32, actualOutputWidth: 64, actualOutputHeight: 32,
      outputSha256: digest(bytes), promptId: "panorama-prompt", outputFilename: "unique-panorama.png",
    }) : {} }; } },
    scheduleSync: captureBetaGenerationArchive,
  });
  return { ...result, durationMs: 100 };
}

async function historicalLightingFixture({ legacyWorkflow = false, contract = legacyContract, contractBody = legacyContractBody } = {}) {
  const f = fixture();
  await f.store.beginRun(request);
  await f.store.completeRun("rec-panorama", await generated());
  const snapshot = JSON.parse(f.fields["配置快照"]);
  const parameters = JSON.parse(f.fields["生成参数"]);
  snapshot.panoramaLightingContract = { ...contract };
  parameters.workflow.panoramaLighting.contract = { ...contract };
  if (legacyWorkflow) {
    snapshot.panoramaWorkflowVersion = "2026-10-28.1";
    snapshot.panoramaWorkflowSourceSha256 = "1390e507c446a82d45e9fec795358d4df7b29f52e6625cd988c53e6150e16b2a";
    parameters.workflow.workflowVersion = snapshot.panoramaWorkflowVersion;
    parameters.workflow.sourceWorkflowSha256 = snapshot.panoramaWorkflowSourceSha256;
    for (const key of ["lora", "loraStrength", "attentionBackend", "attention", "kvCache", "colorMatchChannels", "colorMatchStrength"]) {
      delete parameters.workflow[key];
    }
  }
  assert.equal(digest(contractBody), contract.sha256);
  const historicalPrompt = `[USER LIGHTING REFINEMENTS]\n${input.prompt}\n\n${contractBody}\n\n[LIGHTING PRESET]\n${preset.prompt}`;
  f.fields["最终 Prompt"] = legacyWorkflow ? historicalPrompt
    : contract.version === 1 ? `zhiganEnhance, ${historicalPrompt}` : `${historicalPrompt} zhiganEnhance`;
  parameters.workflow.panoramaLighting.promptSha256 = digest(f.fields["最终 Prompt"]);
  Object.assign(f.fields, { "状态": "失败", "配置快照": JSON.stringify(snapshot), "生成参数": JSON.stringify(parameters),
    "Prompt / 工作流版本": f.fields["Prompt / 工作流版本"]
      .replace(PANORAMA_WORKFLOW.version, snapshot.panoramaWorkflowVersion)
      .replace(`${PANORAMA_LIGHTING_IDENTITY.code}@v${PANORAMA_LIGHTING_IDENTITY.version}`, `${contract.code}@v${contract.version}`) });
  const lazyRequest = structuredClone(request);
  delete lazyRequest.item.input.referenceImages;
  return { ...f, lazyRequest };
}
const historicalR54Fixture = () => historicalLightingFixture({ legacyWorkflow: true });

test("全景冻结真实原图与R5_4版本来源，版本摘要从request光影元数据取卡片", async () => {
  const snapshot = betaConfigSnapshot(input);
  assert.equal(snapshot.panoramaArchiveVersion, 1);
  assert.deepEqual(snapshot.panoramaSource, { width: 64, height: 32, sha256: digest(bytes) });
  assert.equal(snapshot.panoramaWorkflowVersion, PANORAMA_WORKFLOW.version);
  assert.equal(snapshot.panoramaWorkflowSourceSha256, PANORAMA_WORKFLOW.sourceWorkflowSha256);
  assert.equal(snapshot.panoramaLightingContract.version, PANORAMA_LIGHTING_IDENTITY.version);
  assert.equal("panoramaSource" in betaConfigSnapshot({ ...input, featureMode: "free" }), false);
  const result = await generated();
  assert.ok(betaResultVersion(result).includes(`${PANORAMA_WORKFLOW.id}@${PANORAMA_WORKFLOW.version}`));
  assert.ok(betaResultVersion(result).includes(`${PANORAMA_LIGHTING_IDENTITY.code}@v${PANORAMA_LIGHTING_IDENTITY.version}`));
  assert.match(betaResultVersion(result), /warm-night@v3/);
  const f = fixture();
  await f.store.beginRun(request);
  const archived = await f.store.completeRun("rec-panorama", result);
  assert.equal(archived.recordId, "rec-panorama");
  assert.equal(f.fields["尺寸"], "64x32");
  assert.match(f.fields["Prompt / 工作流版本"], /warm-night@v3/);
});

test("全景卡片ID/版本/SHA、PromptSHA、单图数及R5_4回执漂移全部阻断结果上传", async () => {
  const variants = [
    p => { p.workflow.panoramaLighting.preset.id = "recOther"; },
    p => { p.workflow.panoramaLighting.preset.version = 4; },
    p => { p.workflow.panoramaLighting.preset.sha256 = "b".repeat(64); },
    p => { p.workflow.panoramaLighting.promptSha256 = "0".repeat(64); },
    p => { p.referenceImageCount = 2; },
    p => { p.workflow.panoramaLighting.execution = "prompt-and-reference"; },
    p => { p.workflow.panoramaLighting.customPromptSha256 = "0".repeat(64); },
    p => { p.workflow.workflowId = "ai-texture-enhancement"; },
    p => { p.workflow.workflowVersion = "wrong"; },
    p => { p.workflow.sourceWorkflowSha256 = "c".repeat(64); },
    p => { p.workflow.outputWidth = 128; },
    p => { p.workflow.outputSha256 = "0".repeat(64); },
  ];
  for (const mutate of variants) {
    const f = fixture();
    await f.store.beginRun(request);
    const result = await generated();
    const parameters = JSON.parse(result.sync.archiveFields["生成参数"]);
    mutate(parameters);
    result.sync.archiveFields["生成参数"] = JSON.stringify(parameters);
    await assert.rejects(f.store.completeRun("rec-panorama", result), error => error.statusCode === 409 && error.retryable === false);
    assert.equal(f.fields["结果图"], undefined);
    assert.equal(f.fields["状态"], "运行中");
  }
});

test("OneAPI全景保留同一光影归档合同，不声明R5_4原尺寸执行图", async () => {
  const value = { ...input, modelKey: "gptImage2", resolution: "1K", panoramaLighting: null };
  const f = fixture();
  await f.store.beginRun({ ...request, item: { ...request.item, input: value } });
  const result = await generated(value);
  assert.equal(JSON.parse(f.fields["配置快照"]).panoramaWorkflowId, undefined);
  assert.equal((await f.store.completeRun("rec-panorama", result)).recordId, "rec-panorama");
  assert.ok(f.fields["Prompt / 工作流版本"].includes(`${PANORAMA_LIGHTING_IDENTITY.code}@v${PANORAMA_LIGHTING_IDENTITY.version}`));
  assert.doesNotMatch(f.fields["Prompt / 工作流版本"], /panorama-r5-4/);
});

test("现代全景归档恢复同时下载原图与结果复核SHA，原图漂移不能成功", async () => {
  const f = fixture();
  await f.store.beginRun(request);
  await f.store.completeRun("rec-panorama", await generated());
  const lazyRequest = structuredClone(request);
  delete lazyRequest.item.input.referenceImages;
  f.fields["状态"] = "失败";
  const store = createBetaBaseStore({ run: f.run });
  assert.equal((await store.recoverRun(lazyRequest)).recordId, "rec-panorama");
  assert.equal(f.commands.filter(args => args.includes("+record-download-attachment")).length, 2);
  const otherBytes = await sharp({ create: { width: 64, height: 32, channels: 3, background: "#333333" } }).png().toBuffer();
  f.setSource(otherBytes);
  await assert.rejects(createBetaBaseStore({ run: f.run }).recoverRun(lazyRequest), /原图附件尺寸或SHA/);
});

for (const historical of [{ contract: legacyContract, contractBody: legacyContractBody },
  { contract: legacyV2Contract, contractBody: legacyV2ContractBody },
  { contract: legacyV3Contract, contractBody: legacyV3ContractBody }]) {
  test(`公共规则升级后已有FastFlux2的v${historical.contract.version}成品按原词和原合同恢复，仍下载双附件`, async () => {
    const f = await historicalLightingFixture(historical);
    const before = { snapshot: f.fields["配置快照"], prompt: f.fields["最终 Prompt"], parameters: f.fields["生成参数"],
      version: f.fields["Prompt / 工作流版本"] };
    const commandsBefore = f.commands.length;
    const result = await createBetaBaseStore({ run: f.run }).recoverRun(f.lazyRequest);
    assert.equal(result.recordId, "rec-panorama");
    assert.equal(f.fields["状态"], "成功");
    assert.equal(f.fields["配置快照"], before.snapshot);
    assert.equal(f.fields["最终 Prompt"], before.prompt);
    assert.equal(f.fields["生成参数"], before.parameters);
    assert.equal(f.fields["Prompt / 工作流版本"], before.version);
    assert.equal(f.commands.slice(commandsBefore).filter(args => args.includes("+record-download-attachment")).length, 2);
    assert.equal(f.commands.slice(commandsBefore).some(args => args.includes("+record-batch-create")), false);
  });

  test(`v${historical.contract.version}成品的未知合同版本/SHA或实际回执漂移不能借恢复套用新公共词`, async () => {
    for (const mutate of [
      (snapshot, parameters) => { snapshot.panoramaLightingContract.version = parameters.workflow.panoramaLighting.contract.version = 99; },
      (snapshot, parameters) => { snapshot.panoramaLightingContract.sha256 = parameters.workflow.panoramaLighting.contract.sha256 = "c".repeat(64); },
      (snapshot, parameters) => { snapshot.panoramaLightingContract.code = parameters.workflow.panoramaLighting.contract.code = "unknown-lighting"; },
      (_snapshot, parameters) => { parameters.workflow.panoramaLighting.contract.version = 99; },
      (_snapshot, parameters) => { parameters.workflow.panoramaLighting.contract.sha256 = "c".repeat(64); },
    ]) {
      const f = await historicalLightingFixture(historical);
      const snapshot = JSON.parse(f.fields["配置快照"]), parameters = JSON.parse(f.fields["生成参数"]);
      mutate(snapshot, parameters);
      f.fields["配置快照"] = JSON.stringify(snapshot);
      f.fields["生成参数"] = JSON.stringify(parameters);
      const commandsBefore = f.commands.length;
      await assert.rejects(createBetaBaseStore({ run: f.run }).recoverRun(f.lazyRequest),
        error => error.statusCode === 409 && error.retryable === false);
      assert.equal(f.fields["状态"], "失败");
      assert.equal(f.commands.slice(commandsBefore).some(args => args.includes("+record-upsert")), false);
    }
  });

  test(`新Run完成归档不能使用旧v${historical.contract.version}回执绕过当前冻结规则`, async () => {
    const f = fixture();
    await f.store.beginRun(request);
    const result = await generated();
    const parameters = JSON.parse(result.sync.archiveFields["生成参数"]);
    parameters.workflow.panoramaLighting.contract = { ...historical.contract };
    result.sync.archiveFields["生成参数"] = JSON.stringify(parameters);
    await assert.rejects(f.store.completeRun("rec-panorama", result), /实际提示词合同与冻结版本不一致/);
    assert.equal(f.fields["结果图"], undefined);
    assert.equal(f.fields["状态"], "运行中");
    assert.equal(JSON.parse(f.fields["配置快照"]).panoramaLightingContract.version, PANORAMA_LIGHTING_IDENTITY.version);
  });
}

test("FastFlux2升级后只恢复已知旧R5_4已有成品，保留原Prompt/执行图版本且下载双附件核验", async () => {
  const f = await historicalR54Fixture();
  const before = { snapshot: f.fields["配置快照"], prompt: f.fields["最终 Prompt"], parameters: f.fields["生成参数"],
    version: f.fields["Prompt / 工作流版本"] };
  const commandsBefore = f.commands.length;
  const result = await createBetaBaseStore({ run: f.run }).recoverRun(f.lazyRequest);
  assert.equal(result.recordId, "rec-panorama");
  assert.equal(f.fields["状态"], "成功");
  assert.equal(f.fields["配置快照"], before.snapshot);
  assert.equal(f.fields["最终 Prompt"], before.prompt);
  assert.equal(f.fields["生成参数"], before.parameters);
  assert.equal(f.fields["Prompt / 工作流版本"], before.version);
  assert.equal(f.commands.slice(commandsBefore).filter(args => args.includes("+record-download-attachment")).length, 2);
  assert.equal(f.commands.slice(commandsBefore).some(args => args.includes("+record-batch-create")), false);
});

test("旧R5_4成品的未知版本、源SHA和实际回执漂移不能借恢复迁移到新图", async () => {
  for (const mutate of [
    (snapshot, parameters) => { snapshot.panoramaWorkflowVersion = parameters.workflow.workflowVersion = "2026-10-28.unknown"; },
    (snapshot, parameters) => { snapshot.panoramaWorkflowSourceSha256 = parameters.workflow.sourceWorkflowSha256 = "c".repeat(64); },
    (_snapshot, parameters) => { parameters.workflow.workflowVersion = PANORAMA_WORKFLOW.version; },
    (_snapshot, parameters) => { parameters.workflow.sourceWorkflowSha256 = PANORAMA_WORKFLOW.sourceWorkflowSha256; },
  ]) {
    const f = await historicalR54Fixture();
    const snapshot = JSON.parse(f.fields["配置快照"]), parameters = JSON.parse(f.fields["生成参数"]);
    mutate(snapshot, parameters);
    f.fields["配置快照"] = JSON.stringify(snapshot);
    f.fields["生成参数"] = JSON.stringify(parameters);
    const commandsBefore = f.commands.length;
    await assert.rejects(createBetaBaseStore({ run: f.run }).recoverRun(f.lazyRequest),
      error => error.statusCode === 409 && error.retryable === false);
    assert.equal(f.fields["状态"], "失败");
    assert.equal(f.commands.slice(commandsBefore).some(args => args.includes("+record-upsert")), false);
  }
});

test("旧R5_4缺少完整成品附件不能恢复，未成图记录不修改冻结版本或建立新Run", async () => {
  for (const attachment of [[], [{ size: bytes.length }], [{ file_token: "result-token", size: 0 }]]) {
    const f = await historicalR54Fixture();
    f.fields["结果图"] = attachment;
    const snapshot = f.fields["配置快照"], commandsBefore = f.commands.length;
    const recovery = createBetaBaseStore({ run: f.run }).recoverRun(f.lazyRequest);
    if (!attachment.length) assert.equal(await recovery, null);
    else await assert.rejects(recovery, /缺少唯一 token 或字节数/);
    assert.equal(f.fields["配置快照"], snapshot);
    assert.equal(f.fields["状态"], "失败");
    assert.equal(f.commands.slice(commandsBefore).some(args => args.includes("+record-upsert") || args.includes("+record-batch-create")), false);
  }
});

test("旧全景仅恢复已有原美化附件，不冒充球面链路或新光影目标", async () => {
  const f = fixture();
  const legacyInput = { ...input, resolution: "2K", panoramaLighting: null, prompt: "", panoramaPromptVersion: 7 };
  const legacyRequest = { ...request, item: { ...request.item, input: legacyInput } };
  const fields = buildBetaRunFields(legacyRequest);
  const snapshot = JSON.parse(fields["配置快照"]);
  for (const key of Object.keys(snapshot).filter(key => key.startsWith("panorama") && key !== "panoramaPromptVersion")) delete snapshot[key];
  Object.assign(f.fields, fields, { "配置快照": JSON.stringify(snapshot), "状态": "失败", "时延（ms）": 100,
    "最终 Prompt": "Preserve original panorama illumination.", "尺寸": "64x32", "Prompt / 工作流版本": "panorama-render-enhancement@v7",
    "输入图": [{ file_token: "source-token", size: bytes.length }], "结果图": [{ file_token: "result-token", size: bytes.length }],
    "生成参数": JSON.stringify({ referenceImageCount: 1, workflow: { feature: "panorama-render-enhancement" } }),
  });
  assert.equal((await f.store.recoverRun(legacyRequest)).recordId, "rec-panorama");
  await assert.rejects(createBetaBaseStore({ run: f.run }).recoverRun(request), /旧全景归档不能恢复新的光影目标任务/);
});

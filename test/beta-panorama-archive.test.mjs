/**
 * [INPUT]: 依赖 Node测试/文件与SHA、sharp真实全景、Beta Base Store及全景服务/执行图元数据替身
 * [OUTPUT]: 对外提供全景卡片与合同版本摘要、单原图/最终PromptSHA/球面执行图及原尺寸回执核验，归档回读和新旧附件恢复边界测试
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
import { executeEffectRenderEnhancementWorkflow } from "../src/effect-render-enhancement-workflow.mjs";
import { PANORAMA_WORKFLOW, panoramaWorkflowMetadata } from "../src/panorama-workflow.mjs";

const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const bytes = await sharp({ create: { width: 64, height: 32, channels: 3, background: "#999999" } }).png().toBuffer();
const url = `data:image/png;base64,${bytes.toString("base64")}`;
const image = { dataUrl: url, type: "image/png", size: bytes.length, name: "source.png" };
const preset = { id: "recPanoramaCard", code: "warm-night", name: "暖色夜景", version: 3,
  sha256: "a".repeat(64), prompt: "A dark warm night interior with existing lamps as the dominant lighting." };
const input = { featureMode: "panoramaEnhancement", modelKey: "aiTextureEnhancement", ratio: "2:1", ratioMode: "original",
  resolution: "original", outputFormat: "png", referenceImages: [image], panoramaLighting: {
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

test("全景冻结真实原图与R5_4版本来源，版本摘要从request光影元数据取卡片", async () => {
  const snapshot = betaConfigSnapshot(input);
  assert.equal(snapshot.panoramaArchiveVersion, 1);
  assert.deepEqual(snapshot.panoramaSource, { width: 64, height: 32, sha256: digest(bytes) });
  assert.equal(snapshot.panoramaWorkflowVersion, PANORAMA_WORKFLOW.version);
  assert.equal(snapshot.panoramaWorkflowSourceSha256, PANORAMA_WORKFLOW.sourceWorkflowSha256);
  assert.equal(snapshot.panoramaLightingContract.version, 1);
  assert.equal("panoramaSource" in betaConfigSnapshot({ ...input, featureMode: "free" }), false);
  const result = await generated();
  assert.match(betaResultVersion(result), /panorama-r5-4@2026-10-28.1/);
  assert.match(betaResultVersion(result), /panorama-lighting-transform@v1/);
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
  assert.match(f.fields["Prompt / 工作流版本"], /panorama-lighting-transform@v1/);
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

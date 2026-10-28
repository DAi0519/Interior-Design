/**
 * [INPUT]: 依赖真实PNG字节、KS执行计划/元数据、Beta Runner/任务注册表和Base内存CLI替身
 * [OUTPUT]: 验证KS直入固定5K/其他档20MP与历史整图/分块合同；受信旧任务冷恢复附件，缺结果或篡改冻结字段零建档/零GPU拒绝
 * [POS]: test 的KS版本化整图归档与历史分块冷恢复跨层测试，补充beta-upscale与beta-base常规用例
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import sharp from "sharp";
import { buildBetaRunFields, captureBetaGenerationArchive, createBetaBaseStore } from "../src/beta-base.mjs";
import { normalizeBetaUpscaleInput, readBetaUpscaleConfig, verifyBetaUpscaleBatch } from "../src/beta-upscale.mjs";
import { createBetaRunnerService } from "../src/beta-runner.mjs";
import { createGenerationJobRegistry } from "../src/generation-jobs.mjs";
import { createImageUpscaleWorkflow, IMAGE_UPSCALE_WORKFLOWS,
  imageUpscaleTargetDimensions, imageUpscaleWorkflowMetadata, imageUpscaleAreaCapDimensions } from "../src/image-upscale-workflow.mjs";

const KEY = "ks_seedvr2_2x_direct";
const TEST_TIME = "2026-10-26 18:00:00";
const sourceBytes = await sharp({ create: { width: 1152, height: 864, channels: 3, background: "#65717b" } }).png().toBuffer();
const outputBytes = await sharp({ create: { width: 6144, height: 4608, channels: 3, background: "#65717b" } }).png().toBuffer();
const source = { name: "source.png", type: "image/png", dataUrl: `data:image/png;base64,${sourceBytes.toString("base64")}` };
const definition = IMAGE_UPSCALE_WORKFLOWS[KEY];
const normalizedInput = () => normalizeBetaUpscaleInput({ upscaleWorkflowKey: KEY, resolution: "6K" });
const envelope = (fields) => ({ ok: true, data: { fields: Object.keys(fields), data: [Object.values(fields)], record_id_list: ["rec-tiling"] } });

function capabilityFixture() {
  const info = {};
  for (const workflow of Object.values(IMAGE_UPSCALE_WORKFLOWS)) {
    for (const tiled of workflow.key.startsWith("ks_") ? [false, true] : [false]) {
      const resolution = tiled ? "6K" : workflow.resolutions[0].key;
      const target = imageUpscaleTargetDimensions({ width: tiled ? 2048 : 1024, height: tiled ? 2048 : 768 }, resolution, workflow.key);
      const graph = createImageUpscaleWorkflow({ artifactKey: "test-capabilities", imageBase64: "", seed: 4,
        generationRequest: { upscaleWorkflowKey: workflow.key, resolution, sourceWidth: tiled ? 2048 : 1024, sourceHeight: tiled ? 2048 : 768 }, ...target });
      for (const node of Object.values(graph)) {
        const required = (info[node.class_type] ||= { input: { required: {} } }).input.required;
        for (const field of Object.keys(node.inputs)) required[field] = ["ANY"];
      }
    }
  }
  return info;
}

test("两KS整图不依赖Split或Merge，缺画布缩放节点只禁两KS", async () => {
  for (const missing of [null, "ImageScale"]) {
    const info = capabilityFixture();
    assert.ok(info.ImageScale);
    assert.equal(info.SplitImageToTileList, undefined);
    assert.equal(info.ImageMergeTileList, undefined);
    if (missing) delete info[missing];
    const config = await readBetaUpscaleConfig({ async checkHealth() { return { available: true }; },
      async getObjectInfo([type]) { return info[type] ? { [type]: info[type] } : {}; } });
    assert.equal(config.workflows.filter((workflow) => workflow.available).length, missing ? 4 : 6);
    if (missing) assert.ok(config.workflows.filter((workflow) => !workflow.available).every((workflow) => workflow.key.startsWith("ks_")));
  }
});

test("固定5K所需现有读尺寸/数学节点失效只禁直入版，不影响KS075", async () => {
  for (const missing of ["GetImageSize", "SimpleMathDual+", "SimpleMath+"]) {
    const info = capabilityFixture(); assert.ok(info[missing]); delete info[missing];
    const config = await readBetaUpscaleConfig({ async checkHealth() { return { available: true }; },
      async getObjectInfo([type]) { return info[type] ? { [type]: info[type] } : {}; } });
    assert.equal(config.workflows.find(w => w.key === KEY).available, false);
    assert.equal(config.workflows.find(w => w.key === "ks_seedvr2_2x").available, true);
    assert.equal(config.workflows.filter(w => w.available).length, 5);
  }
});

test("Beta超分服务端冻结版本，执行准入拒绝后续输入漂移", () => {
  const input = normalizedInput();
  assert.equal(input.upscaleWorkflowVersion, definition.version);
  const batch = { featureMode: "imageUpscale", items: [{ input }] };
  verifyBetaUpscaleBatch(batch, { comfyUi: { available: true } });
  input.upscaleWorkflowVersion = "2026-10-21.1";
  assert.throws(() => verifyBetaUpscaleBatch(batch, { comfyUi: { available: true } }),
    (error) => error.statusCode === 409 && error.retryable === false);
});

function archiveFixture({ legacy = false, legacyArea = false, legacyTiled = false, legacyCapped = false, patch = () => {},
  workflowKey = KEY,
  snapshotVersion = legacy ? undefined : legacyArea ? "2026-10-26.1" : legacyTiled ? "2026-10-26.2" : legacyCapped ? "2026-10-26.3" : IMAGE_UPSCALE_WORKFLOWS[workflowKey].version,
  resolution = "6K", sourceWidth = 1152, sourceHeight = 864, sourceImage = source, png = outputBytes } = {}) {
  const input = { ...normalizeBetaUpscaleInput({ upscaleWorkflowKey: workflowKey, resolution }), referenceImages: [sourceImage] };
  const target = imageUpscaleTargetDimensions({ width: sourceWidth, height: sourceHeight }, resolution, workflowKey);
  const inputBytes = Buffer.from(sourceImage.dataUrl.slice(sourceImage.dataUrl.indexOf(",") + 1), "base64");
  const item = { runId: "RUN-ks-tiling-contract", caseId: "CASE-1", input };
  const frozen = buildBetaRunFields({ batchId: "BETA-ks-tiling-contract", featureMode: "imageUpscale", item, testTime: TEST_TIME });
  const snapshot = JSON.parse(frozen["配置快照"]);
  if (snapshotVersion === undefined) delete snapshot.upscaleWorkflowVersion;
  else snapshot.upscaleWorkflowVersion = snapshotVersion;
  frozen["配置快照"] = JSON.stringify(snapshot);
  const metadata = { ...imageUpscaleWorkflowMetadata({ generationRequest: { ...input, sourceWidth, sourceHeight },
    ...target, resolution, actualOutputWidth: target.width, actualOutputHeight: target.height,
    artifactKey: "test-ks-tiling", outputFilename: "CanvasLab_SeedVR2_test-ks-tiling_00001_.png",
    outputSha256: createHash("sha256").update(png).digest("hex"),
    promptId: "test-prompt-tiling", seed: 42, executionDurationMs: 123, queueDurationMs: 1 }), feature: "image-upscale" };
  if (legacy || legacyArea || legacyTiled) {
    for (const key of ["inferenceWidth", "inferenceHeight", "paddedInferencePixels", "inferencePixelLimit", "deliveryPostResize", "fixedInferenceLongEdge"]) delete metadata[key];
  }
  if (legacy) {
    metadata.workflowVersion = "2026-10-21.1";
    metadata.seedVrResolution = Math.min(target.width, target.height);
    metadata.seedVrMaxResolution = resolution === "2X" ? 0 : target.longEdge;
    for (const key of ["executionStrategy", "executionPolicyVersion", "tiling", "blocksToSwap", "swapIoComponents"]) delete metadata[key];
  }
  if (legacyArea) {
    metadata.workflowVersion = "2026-10-26.1";
    metadata.executionPolicyVersion = "ks-area-tiling-v1";
    const tiled = target.width * target.height > 25000000;
    metadata.executionStrategy = tiled ? "tiled" : "whole";
    metadata.blocksToSwap = tiled ? 36 : 32;
    metadata.swapIoComponents = tiled;
    metadata.seedVrResolution = tiled ? 2048 : Math.min(target.width, target.height);
    metadata.seedVrMaxResolution = tiled ? 2048 : resolution === "2X" ? 0 : target.longEdge;
    const count = length => 1 + Math.ceil(Math.max(0, length - 2048) / 1792);
    if (tiled) metadata.tiling = { thresholdPixels: 25000000, tileWidth: 2048, tileHeight: 2048, overlap: 256,
      rows: count(target.height), columns: count(target.width), tileCount: count(target.height) * count(target.width) };
    else delete metadata.tiling;
  }
  if (legacyTiled) {
    const tileWidth = Math.min(2048, target.width), tileHeight = Math.min(2048, target.height);
    const count = (length, size) => 1 + Math.ceil(Math.max(0, length - size) / Math.round(Math.max(size * 0.25, size - 256)));
    metadata.workflowVersion = "2026-10-26.2";
    metadata.executionPolicyVersion = "ks-always-tiled-v2";
    metadata.executionStrategy = "tiled";
    metadata.blocksToSwap = 36; metadata.swapIoComponents = true;
    metadata.seedVrResolution = Math.min(tileWidth, tileHeight);
    metadata.seedVrMaxResolution = Math.max(tileWidth, tileHeight);
    metadata.tiling = { tileWidth, tileHeight, overlap: 256, rows: count(target.height, tileHeight),
      columns: count(target.width, tileWidth), tileCount: count(target.height, tileHeight) * count(target.width, tileWidth) };
  }
  if (legacyCapped) {
    const { width, height } = imageUpscaleAreaCapDimensions(target.width, target.height);
    Object.assign(metadata, { workflowVersion: "2026-10-26.3", executionPolicyVersion: "ks-whole-area-cap-v3",
      inferenceWidth: width, inferenceHeight: height, inferencePixelLimit: 20000000,
      paddedInferencePixels: Math.ceil(width / 16) * 16 * Math.ceil(height / 16) * 16,
      seedVrResolution: Math.min(width, height), seedVrMaxResolution: Math.max(width, height),
      deliveryPostResize: width !== target.width || height !== target.height });
    delete metadata.fixedInferenceLongEdge;
  }
  patch(metadata);
  const sync = captureBetaGenerationArchive({ durationMs: 123, modelLabel: IMAGE_UPSCALE_WORKFLOWS[workflowKey].label, finalPrompt: "",
    preview: { outputFormat: "png", resolution, ratio: "original" }, workflow: metadata });
  const result = { durationMs: 123, images: [{ url: `data:image/png;base64,${png.toString("base64")}` }],
    request: { outputFormat: "png" }, sync, upstream: { metadata },
    workflow: { key: workflowKey, version: metadata.workflowVersion } };
  const fields = { ...frozen, ...sync.archiveFields, "Prompt / 工作流版本": `${workflowKey}@${metadata.workflowVersion}`,
    "尺寸": `${target.width}x${target.height}`, "时延（ms）": 123, "状态": "失败", "错误信息": "仅同步待恢复" };
  const commands = [];
  const store = createBetaBaseStore({ async run(_config, args, options = {}) {
    commands.push(args[1]);
    if (args.includes("+record-batch-create")) {
      const body = JSON.parse(args[args.indexOf("--json") + 1]);
      Object.assign(fields, Object.fromEntries(body.fields.map((field, index) => [field, body.rows[0][index]])));
      return { ok: true, data: { record_id_list: ["rec-tiling"] } };
    }
    if (args.includes("+record-upsert")) Object.assign(fields, JSON.parse(args[args.indexOf("--json") + 1]));
    if (args.includes("+record-get") || args.includes("+record-list")) return envelope({ ...fields,
      "输入图": [{ file_token: "input-token", name: "source.png", size: inputBytes.length }], "风格参考图": [],
      "结果图": [{ file_token: "output-token", name: "result.png", size: png.length }] });
    if (args.includes("+record-download-attachment")) await writeFile(join(options.cwd, "result-image"), png);
    return { ok: true, data: {} };
  } });
  return { store, fields, result, item, commands, target };
}

test("KS直入固定5K推理并恢复6K成品，参数漂移在上传前阻断", async () => {
  const corruptions = [null, (m) => { m.seedVrResolution = 4608; }, (m) => { m.seedVrMaxResolution = 6144; },
    (m) => { m.blocksToSwap = 32; }, (m) => { m.swapIoComponents = false; },
    (m) => { m.tiling = { overlap: 256 }; }, (m) => { m.inferenceWidth += 2; },
    (m) => { m.executionStrategy = "tiled"; }, (m) => { m.paddedInferencePixels = 20000000; },
    (m) => { m.inferencePixelLimit = 20000000; }, (m) => { m.fixedInferenceLongEdge = 4992; }, (m) => { m.deliveryPostResize = false; },
    (m) => { delete m.inferenceHeight; },
    (m) => { delete m.executionStrategy; }, (m) => { m.workflowVersion = "2026-10-21.1"; }];
  for (const corruption of corruptions) {
    const fixture = archiveFixture({ patch: corruption || (() => {}) });
    await fixture.store.beginRun({ batchId: "BETA-ks-tiling-contract", featureMode: "imageUpscale", item: fixture.item, testTime: TEST_TIME });
    const before = fixture.commands.filter((command) => command === "+record-upload-attachment").length;
    if (corruption) {
      await assert.rejects(fixture.store.completeRun("rec-tiling", fixture.result), (error) => error.statusCode === 409 && error.retryable === false);
      assert.equal(fixture.commands.filter((command) => command === "+record-upload-attachment").length, before);
    } else {
      const archived = await fixture.store.completeRun("rec-tiling", fixture.result);
      assert.equal(archived.attachment.fileToken, "output-token");
      assert.equal(archived.attachment.size, outputBytes.length);
      const metadata = JSON.parse(fixture.fields["生成参数"]).workflow;
      assert.equal(metadata.seedVrResolution, 3840);
      assert.equal(metadata.seedVrMaxResolution, 5120);
      assert.deepEqual([metadata.inferenceWidth, metadata.inferenceHeight], [5120, 3840]);
      assert.equal(metadata.paddedInferencePixels, 19660800);
      assert.equal(metadata.fixedInferenceLongEdge, 5120);
      assert.equal(Object.hasOwn(metadata, "inferencePixelLimit"), false);
      assert.equal(metadata.deliveryPostResize, true);
      assert.equal(metadata.requestedOutputWidth, 6144);
      assert.equal(metadata.outputWidth, 6144);
    }
  }
});

test("两KS小图与横竖窄图保持整图推理，未超限不做交付插值", async () => {
  for (const workflowKey of ["ks_seedvr2_2x", KEY]) {
    for (const [sourceWidth, sourceHeight, width, height] of [
      [384, 512, 768, 1024], [3200, 384, 6400, 768], [384, 3200, 768, 6400],
    ]) {
      const inputBytes = await sharp({ create: { width: sourceWidth, height: sourceHeight, channels: 3, background: "#65717b" } }).png().toBuffer();
      const png = await sharp({ create: { width, height, channels: 3, background: "#65717b" } }).png().toBuffer();
      const options = { workflowKey, resolution: "2X", sourceWidth, sourceHeight, png,
        sourceImage: { name: "source.png", type: "image/png", dataUrl: `data:image/png;base64,${inputBytes.toString("base64")}` } };
      const fixture = archiveFixture(options);
      await fixture.store.beginRun({ batchId: "BETA-ks-tiling-contract", featureMode: "imageUpscale", item: fixture.item, testTime: TEST_TIME });
      await fixture.store.completeRun("rec-tiling", fixture.result);
      const metadata = JSON.parse(fixture.fields["生成参数"]).workflow;
      assert.equal(metadata.workflowVersion, IMAGE_UPSCALE_WORKFLOWS[workflowKey].version);
      assert.equal(metadata.executionStrategy, "whole");
      assert.equal(metadata.executionPolicyVersion, "ks-whole-area-cap-v3");
      assert.equal(metadata.seedVrResolution, Math.min(width, height));
      assert.equal(metadata.seedVrMaxResolution, Math.max(width, height));
      assert.equal(metadata.tiling, undefined);
      assert.deepEqual([metadata.inferenceWidth, metadata.inferenceHeight], [width, height]);
      assert.equal(metadata.paddedInferencePixels, width * height);
      assert.equal(metadata.deliveryPostResize, false);
      assert.deepEqual([metadata.requestedOutputWidth, metadata.requestedOutputHeight, metadata.outputWidth, metadata.outputHeight], [width, height, width, height]);
      const wrong = archiveFixture({ ...options, patch(m) { m.seedVrResolution = 2048; } });
      await wrong.store.beginRun({ batchId: "BETA-ks-tiling-contract", featureMode: "imageUpscale", item: wrong.item, testTime: TEST_TIME });
      await assert.rejects(wrong.store.completeRun("rec-tiling", wrong.result), { statusCode: 409, retryable: false });
    }
  }
});

test("直入6K归档接受真实固定5K超过20MP，拒绝混入旧面积上限或伪造固定长边", async () => {
  for (const [sourceWidth, sourceHeight, iw, ih] of [[960, 1200, 4096, 5120], [2048, 2048, 5120, 5120]]) {
    const inputBytes = await sharp({ create: { width: sourceWidth, height: sourceHeight, channels: 3, background: "#65717b" } }).png().toBuffer();
    const target = imageUpscaleTargetDimensions({ width: sourceWidth, height: sourceHeight }, "6K", KEY);
    const png = await sharp({ create: { width: target.width, height: target.height, channels: 3, background: "#65717b" } }).png().toBuffer();
    const options = { sourceWidth, sourceHeight, png,
      sourceImage: { name: "fixed5k.png", type: "image/png", dataUrl: `data:image/png;base64,${inputBytes.toString("base64")}` } };
    const fixture = archiveFixture(options);
    await fixture.store.beginRun({ batchId: "BETA-fixed5k", featureMode: "imageUpscale", item: fixture.item, testTime: TEST_TIME });
    await fixture.store.completeRun("rec-tiling", fixture.result);
    const actual = JSON.parse(fixture.fields["生成参数"]).workflow;
    assert.equal(actual.workflowVersion, "2026-10-27.1");
    assert.equal(actual.executionPolicyVersion, "ks-fixed-5k-to-6k-v1");
    assert.deepEqual([actual.inferenceWidth, actual.inferenceHeight], [iw, ih]);
    assert.ok(actual.paddedInferencePixels > 20000000);
    assert.equal(actual.fixedInferenceLongEdge, 5120);
    assert.equal(Object.hasOwn(actual, "inferencePixelLimit"), false);
    for (const patch of [(m) => { m.inferencePixelLimit = 20000000; }, (m) => { delete m.fixedInferenceLongEdge; },
      (m) => { m.fixedInferenceLongEdge = 4992; }, (m) => { m.executionPolicyVersion = "ks-whole-area-cap-v3"; }]) {
      const wrong = archiveFixture({ ...options, patch });
      await wrong.store.beginRun({ batchId: "BETA-fixed5k", featureMode: "imageUpscale", item: wrong.item, testTime: TEST_TIME });
      const beforeUploads = wrong.commands.filter(command => command === "+record-upload-attachment").length;
      await assert.rejects(wrong.store.completeRun("rec-tiling", wrong.result), { statusCode: 409, retryable: false });
      assert.equal(wrong.commands.filter(command => command === "+record-upload-attachment").length, beforeUploads);
    }
  }
});

test("旧直入26.3只恢复原20MP附件，不能新建GPU或按固定5K合同改写历史", async () => {
  for (const resolution of ["2X", "4K", "6K"]) {
    const target = imageUpscaleTargetDimensions({ width: 1152, height: 864 }, resolution, KEY);
    const png = await sharp({ create: { width: target.width, height: target.height, channels: 3, background: "#65717b" } }).png().toBuffer();
    const fixture = archiveFixture({ legacyCapped: true, resolution, png });
    const before = fixture.fields["生成参数"];
    const recovered = await fixture.store.recoverRun({ batchId: "BETA-ks-tiling-contract", featureMode: "imageUpscale", item: fixture.item, testTime: TEST_TIME });
    assert.equal(recovered.recordId, "rec-tiling");
    assert.equal(fixture.fields["生成参数"], before);
    assert.equal(JSON.parse(before).workflow.inferencePixelLimit, 20000000);
    assert.equal(fixture.commands.includes("+record-upload-attachment"), false);
    const input = { upscaleWorkflowKey: KEY, upscaleWorkflowVersion: "2026-10-26.3", resolution };
    assert.equal(normalizeBetaUpscaleInput(input, { recoveringLegacy: true }).upscaleWorkflowVersion, "2026-10-26.3");
    assert.throws(() => normalizeBetaUpscaleInput(input), { statusCode: 409, retryable: false });
    assert.throws(() => verifyBetaUpscaleBatch({ featureMode: "imageUpscale", items: [{ input }] }, { comfyUi: { available: true } }), { statusCode: 409, retryable: false });
    const newRun = archiveFixture({ legacyCapped: true, resolution, png });
    await newRun.store.beginRun({ batchId: "BETA-legacy26-3", featureMode: "imageUpscale", item: newRun.item, testTime: TEST_TIME });
    await assert.rejects(newRun.store.completeRun("rec-tiling", newRun.result), { statusCode: 409, retryable: false });
    const wrong = archiveFixture({ legacyCapped: true, resolution, png, patch(m) { m.executionPolicyVersion = "ks-fixed-5k-to-6k-v1"; } });
    await assert.rejects(wrong.store.recoverRun({ batchId: "BETA-ks-tiling-contract", featureMode: "imageUpscale", item: wrong.item, testTime: TEST_TIME }), { statusCode: 409, retryable: false });
  }
});

test("26.1旧面积策略whole和tiled按原合同恢复，不能用于26.3新归档", async () => {
  for (const resolution of ["2X", "4K", "6K"]) {
    const target = imageUpscaleTargetDimensions({ width: 1152, height: 864 }, resolution, KEY);
    const png = await sharp({ create: { width: target.width, height: target.height, channels: 3, background: "#65717b" } }).png().toBuffer();
    const fixture = archiveFixture({ legacyArea: true, resolution, png });
    const originalParameters = fixture.fields["生成参数"];
    await fixture.store.recoverRun({ batchId: "BETA-ks-tiling-contract", featureMode: "imageUpscale", item: fixture.item, testTime: TEST_TIME });
    assert.equal(fixture.fields["生成参数"], originalParameters);
    assert.equal(fixture.commands.filter(command => command === "+record-download-attachment").length, 1);
    assert.equal(fixture.commands.includes("+record-upload-attachment"), false);
    const metadata = JSON.parse(originalParameters).workflow;
    assert.equal(metadata.workflowVersion, "2026-10-26.1");
    assert.equal(metadata.executionStrategy, resolution === "6K" ? "tiled" : "whole");
    const newArchive = archiveFixture({ legacyArea: true, resolution, png });
    await newArchive.store.beginRun({ batchId: "BETA-ks-tiling-contract", featureMode: "imageUpscale", item: newArchive.item, testTime: TEST_TIME });
    await assert.rejects(newArchive.store.completeRun("rec-tiling", newArchive.result), { statusCode: 409, retryable: false });
    const missingFreeze = archiveFixture({ legacyArea: true, resolution, png });
    const snapshot = JSON.parse(missingFreeze.fields["配置快照"]); delete snapshot.upscaleWorkflowVersion;
    missingFreeze.fields["配置快照"] = JSON.stringify(snapshot);
    await assert.rejects(missingFreeze.store.recoverRun({ batchId: "BETA-ks-tiling-contract", featureMode: "imageUpscale", item: missingFreeze.item, testTime: TEST_TIME }), { statusCode: 409, retryable: false });
  }
});

test("26.2旧全档分块仅恢复，大图和窄小tile仍按旧尺寸与参数核验", async () => {
  for (const resolution of ["2X", "4K", "6K"]) {
    const target = imageUpscaleTargetDimensions({ width: 1152, height: 864 }, resolution, KEY);
    const png = await sharp({ create: { width: target.width, height: target.height, channels: 3, background: "#65717b" } }).png().toBuffer();
    const fixture = archiveFixture({ legacyTiled: true, resolution, png });
    const before = fixture.fields["生成参数"];
    await fixture.store.recoverRun({ batchId: "BETA-ks-tiling-contract", featureMode: "imageUpscale", item: fixture.item, testTime: TEST_TIME });
    assert.equal(fixture.fields["生成参数"], before);
    assert.equal(fixture.commands.includes("+record-upload-attachment"), false);
    const next = archiveFixture({ legacyTiled: true, resolution, png });
    await next.store.beginRun({ batchId: "BETA-ks-tiling-contract", featureMode: "imageUpscale", item: next.item, testTime: TEST_TIME });
    await assert.rejects(next.store.completeRun("rec-tiling", next.result), { statusCode: 409, retryable: false });
    const wrong = archiveFixture({ legacyTiled: true, resolution, png, patch(metadata) { metadata.executionPolicyVersion = "ks-whole-area-cap-v3"; } });
    await assert.rejects(wrong.store.recoverRun({ batchId: "BETA-ks-tiling-contract", featureMode: "imageUpscale", item: wrong.item, testTime: TEST_TIME }), { statusCode: 409, retryable: false });
  }
});

test("旧KS21.1整图归档可恢复原附件，新版缺分块策略或伪造旧版本不可恢复", async () => {
  for (const snapshotVersion of [undefined, "2026-10-21.1"]) {
    const fixture = archiveFixture({ legacy: true, snapshotVersion });
    const recovered = await fixture.store.recoverRun({ batchId: "BETA-ks-tiling-contract", featureMode: "imageUpscale",
      item: fixture.item, testTime: TEST_TIME });
    assert.equal(recovered.recordId, "rec-tiling");
    assert.equal(fixture.commands.includes("+record-download-attachment"), true);
    assert.equal(fixture.commands.includes("+record-upload-attachment"), false);
    assert.equal(fixture.fields["状态"], "成功");
  }
  for (const patch of [(m) => { delete m.executionStrategy; }, (m) => { m.workflowVersion = "unrecognized-old"; }]) {
    const fixture = archiveFixture({ patch });
    await assert.rejects(fixture.store.recoverRun({ batchId: "BETA-ks-tiling-contract", featureMode: "imageUpscale",
      item: fixture.item, testTime: TEST_TIME }), (error) => error.statusCode === 409 && error.retryable === false);
    assert.equal(fixture.commands.includes("+record-download-attachment"), false);
  }
  const fixture = archiveFixture();
  const snapshot = JSON.parse(fixture.fields["配置快照"]);
  delete snapshot.upscaleWorkflowVersion;
  fixture.fields["配置快照"] = JSON.stringify(snapshot);
  await assert.rejects(fixture.store.recoverRun({ batchId: "BETA-ks-tiling-contract", featureMode: "imageUpscale",
    item: fixture.item, testTime: TEST_TIME }), (error) => error.statusCode === 409 && error.retryable === false);
  assert.equal(fixture.commands.includes("+record-download-attachment"), false);
});

async function settledJob(getJob, id) {
  for (let i = 0; i < 1000; i += 1) {
    const job = getJob(id);
    if (job?.status && job.status !== "running") return job;
    await new Promise(resolve => setImmediate(resolve));
  }
  throw new Error("内存冷恢复任务未结算");
}

async function coldRecoveryFixture({ missing = false, tampered = false, version = "2026-10-26.1" } = {}) {
  const fixture = archiveFixture(version === "2026-10-26.2" ? { legacyTiled: true }
    : version === "2026-10-26.3" ? { legacyCapped: true } : { legacyArea: true });
  if (tampered) {
    const snapshot = JSON.parse(fixture.fields["配置快照"]);
    snapshot.resolution = "4K";
    fixture.fields["配置快照"] = JSON.stringify(snapshot);
  }
  const jobs = createGenerationJobRegistry();
  const oldId = "beta-ks-cold-original001", newId = "beta-ks-cold-recovery001";
  jobs.enqueue(oldId, { featureMode: "imageUpscale", total: 1 }, async update => {
    update({ result: { batchId: "BETA-ks-tiling-contract", results: [] } });
    throw new Error("旧进程仅同步失败");
  });
  await settledJob(id => jobs.get(id), oldId);
  const calls = { recovered: 0, began: 0, generated: 0 };
  const service = createBetaRunnerService({ jobs, maxAttempts: 1,
    getUpscaleConfig: async () => ({ comfyUi: { available: true } }),
    baseStore: {
      async recoverRun(input) { calls.recovered += 1; return missing ? null : fixture.store.recoverRun(input); },
      async beginRun() { calls.began += 1; throw new Error("旧版本不得建新Run"); },
    },
    generationService: { async executeForMode() { calls.generated += 1; throw new Error("旧版本不得重新生成"); } },
  });
  const body = { batchId: "BETA-ks-tiling-contract", featureMode: "imageUpscale", jobId: newId,
    retryOfJobId: oldId, testTime: TEST_TIME, items: [{ runId: fixture.item.runId, caseId: "CASE-1",
      input: { modelKey: KEY, upscaleWorkflowKey: KEY, upscaleWorkflowVersion: version, resolution: "6K" } }] };
  return { fixture, service, body, calls, done: () => settledJob(id => service.getJob(id), newId) };
}

for (const version of ["2026-10-26.1", "2026-10-26.2", "2026-10-26.3"]) {
test(`正式Runner冷恢复旧${version}已有原附件，保留旧参数且零建档/零GPU`, async () => {
  const { fixture, service, body, calls, done } = await coldRecoveryFixture({ version });
  const parameters = fixture.fields["生成参数"];
  assert.throws(() => service.start({ ...body, retryOfJobId: undefined, recoveringLegacyUpscale: true }), { statusCode: 409 });
  assert.throws(() => service.start({ ...body, retryOfJobId: "beta-ks-missing-source001" }), { statusCode: 404 });
  await service.start(body);
  const job = await done();
  assert.equal(job.status, "success");
  assert.deepEqual(calls, { recovered: 1, began: 0, generated: 0 });
  assert.equal(fixture.fields["生成参数"], parameters);
  assert.equal(fixture.commands.filter(command => command === "+record-download-attachment").length, 1);
});

test(`旧${version}冷恢复无原结果或冻结字段被篡改，均零建档/零GPU拒绝`, async () => {
  for (const options of [{ missing: true }, { tampered: true }]) {
    const { service, body, calls, done } = await coldRecoveryFixture({ ...options, version });
    await service.start(body);
    const job = await done();
    assert.equal(job.status, "failed");
    assert.deepEqual(calls, { recovered: 1, began: 0, generated: 0 });
    assert.equal(job.result.warnings[0].retryable, false);
    assert.match(job.result.warnings[0].message, options.missing ? /版本已变化/ : /回读不一致/);
  }
});
}

/**
 * [INPUT]: 依赖 Beta超分页面请求、Runner、正式生成服务、工作流元数据真源、Beta归档投影及 sharp 真实图片
 * [OUTPUT]: 对外提供六工作流统一长边从样本ID到执行/独立归档的跨层保障，KS全档分块区分实际tile与最终尺寸，以及主工作台2X保持本机结果的回归验证
 * [POS]: test 的 Beta超分跨层合同测试，ComfyUI和Base全部使用内存替身，不提交真实GPU任务或飞书写入
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import sharp from "sharp";
import { buildBetaUpscaleItems } from "../public/beta-upscale.js";
import { publicBetaUpscaleConfig } from "../src/beta-upscale.mjs";
import { createBetaRunnerService } from "../src/beta-runner.mjs";
import { betaConfigSnapshot, betaResultVersion, captureBetaGenerationArchive } from "../src/beta-base.mjs";
import { createGenerationService } from "../src/generation-service.mjs";
import { imageUpscaleWorkflowMetadata } from "../src/image-upscale-workflow.mjs";

async function image(width, height) {
  const bytes = await sharp({ create: { width, height, channels: 3, background: "#778493" } }).png().toBuffer();
  return { dataUrl: `data:image/png;base64,${bytes.toString("base64")}`, name: "room.png",
    type: "image/png", size: bytes.length, width, height, bytes };
}

test("Beta超分六工作流经正式执行保留真实尺寸/版本/来源和双阶段归档，Main继续本机结果", async () => {
  const source = await image(384, 512);
  const rawConfig = { comfyUi: { available: true } };
  const workflows = publicBetaUpscaleConfig(rawConfig).workflows;
  const submitted = [], completed = [], events = [];
  const client = { async generateImage(request) {
    submitted.push(request);
    assert.equal(request.images[0].image_url, source.dataUrl);
    const output = await image(request.width, request.height);
    return { images: [{ url: output.dataUrl }], outputFormat: "png", transport: "comfyui-workflow",
      metadata: imageUpscaleWorkflowMetadata({ generationRequest: request,
        width: request.width, height: request.height, resolution: request.resolution,
        actualOutputWidth: output.width, actualOutputHeight: output.height,
        outputSha256: createHash("sha256").update(output.bytes).digest("hex"),
        artifactKey: "fixture1234", outputFilename: "fixture.png", promptId: "prompt-fixture", seed: 123 }) };
  } };
  const generationService = createGenerationService({ imageUpscaleClient: client,
    archiveImageUpscale: true, scheduleGenerationSync: captureBetaGenerationArchive,
    requireApiKey() { assert.fail("超分不读取OneAPI密钥"); },
    imageClientForModel() { assert.fail("超分不进入普通模型路由"); } });
  const baseStore = {
    config: { baseUrl: "https://example.test/base/beta", tableId: "beta-runs" },
    async verifySchema() { events.push("schema"); },
    async getSampleSet() { return { status: "可用", featureMode: "whiteModel", recordId: "set-1",
      samples: [{ sampleId: "SAMPLE-1", recordId: "sample-1", image: { type: source.type, size: source.size } }] }; },
    async resolveSample(_setId, _sampleId, options) {
      assert.equal(options.targetFeatureMode, "imageUpscale");
      events.push("source"); return { featureMode: "whiteModel", image: source };
    },
    async beginRun({ item }) {
      events.push("begin");
      assert.equal(item.input.referenceImages.length, 1);
      assert.equal(betaConfigSnapshot(item.input).upscaleWorkflowKey, item.input.upscaleWorkflowKey);
      assert.equal(item.input.modelKey, item.input.upscaleWorkflowKey);
      return { recordId: item.runId };
    },
    async completeRun(recordId, result) {
      assert.equal(result.sync.status, "skipped");
      assert.equal(result.sync.generationId, null);
      assert.equal(result.sync.archiveFields["Prompt融合"] ?? null, null);
      const parameters = JSON.parse(result.sync.archiveFields["生成参数"]);
      assert.equal(parameters.workflow.feature, "image-upscale");
      assert.equal(parameters.workflow.sourceWidth, 384);
      assert.equal(parameters.workflow.sourceHeight, 512);
      assert.match(parameters.workflow.outputSha256, /^[a-f0-9]{64}$/);
      assert.match(parameters.workflow.sourceSha256, /^[a-f0-9]{64}$/);
      assert.equal(parameters.workflow.resolution, "4K");
      assert.equal(parameters.workflow.outputScale, undefined);
      const ks = parameters.workflow.workflowId.startsWith("ks_");
      assert.equal(parameters.workflow.seedVrMaxResolution, ks ? 2048 : 4096);
      if (ks) {
        assert.equal(parameters.workflow.executionStrategy, "tiled");
        assert.equal(parameters.workflow.executionPolicyVersion, "ks-always-tiled-v2");
        assert.equal(parameters.workflow.workflowVersion, "2026-10-26.2");
      }
      assert.match(betaResultVersion(result), /@/);
      assert.equal(result.request.size, `${parameters.workflow.outputWidth}x${parameters.workflow.outputHeight}`);
      assert.equal(result.images.length, 1);
      completed.push(result);
      return { recordUrl: `https://example.test/run/${recordId}` };
    },
    async failRun() {},
  };
  const runner = createBetaRunnerService({ baseStore, generationService, getUpscaleConfig: async () => rawConfig });
  const settings = { workflowKeys: workflows.map(({ key }) => key), resolution: "4K" };
  const items = buildBetaUpscaleItems({ cases: [{ caseId: "SAMPLE-1", label: "客厅" }], workflows, settings,
    startedAt: new Date("2026-10-20T06:00:00+08:00") });
  assert.equal(items.length, 6);
  assert.ok(items.every(({ input }) => !input.referenceImages && !input.prompt && !input.ratio && !input.quality));
  const jobId = "beta-upscaleintegration01";
  await runner.start({ featureMode: "imageUpscale", sampleSetId: "SET-1", batchId: "BETA-upscaleintegration01",
    jobId, testTime: "2026-10-20 06:00:00", items });
  for (let attempt = 0; attempt < 3000 && runner.getJob(jobId).status === "running"; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  const job = runner.getJob(jobId);
  assert.equal(job.status, "success", job.message);
  assert.deepEqual(job.stages, { generated: 6, synced: 6 });
  assert.equal(completed.length, 6);
  assert.equal(submitted.length, 6);
  assert.equal(submitted.filter(({ resolution }) => resolution === "4K").length, 6);
  assert.ok(submitted.every(({ width, height }) => width === 3072 && height === 4096));
  assert.equal(events.filter((event) => event === "source").length, 6);
  assert.ok(events.indexOf("source") < events.indexOf("begin"));

  let oldSyncCalls = 0;
  const main = createGenerationService({ imageUpscaleClient: client,
    scheduleGenerationSync() { oldSyncCalls += 1; } });
  const result = await main.executeForMode("imageUpscale", {
    upscaleWorkflowKey: workflows.at(-1).key, resolution: "2X", referenceImages: [source] });
  assert.equal(result.request.syncMode, "local-only");
  assert.equal(result.sync.archiveFields, undefined);
  assert.equal(oldSyncCalls, 0);
});

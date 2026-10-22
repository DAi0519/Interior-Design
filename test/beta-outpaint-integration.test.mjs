/**
 * [INPUT]: 依赖Beta扩图页面纯请求、Runner、正式生成服务、三引擎扩图合同、Beta归档投影及sharp真实图片
 * [OUTPUT]: 对外提供样本乘工作流从页面到真实执行适配器和独立Beta归档的跨层验证，以及普通配置/扩图状态隔离保障
 * [POS]: test 的Beta扩图跨层回归，模型与Base均使用内存替身，不提交GPU、收费请求或飞书写入
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { buildBetaOutpaintItems, normalizeBetaOutpaintState } from "../public/beta-outpaint.js";
import { normalizeBetaPageState } from "../public/beta-page-state.js";
import { BETA_OUTPAINT_WORKFLOWS, publicBetaOutpaintConfig } from "../src/beta-outpaint.mjs";
import { createBetaRunnerService } from "../src/beta-runner.mjs";
import { betaConfigSnapshot, betaResultVersion, captureBetaGenerationArchive } from "../src/beta-base.mjs";
import { createGenerationService } from "../src/generation-service.mjs";
import { publicImageOutpaintConfig } from "../src/image-outpaint-service.mjs";
import { publicQwenOutpaintConfig } from "../src/image-outpaint-qwen.mjs";
import { publicOneApiOutpaintConfig } from "../src/image-outpaint-oneapi.mjs";

function rawConfig() {
  const flux = publicImageOutpaintConfig({ available: true });
  return { ...flux, engines: [{ ...flux, key: "comfyui" },
    publicQwenOutpaintConfig({ available: true }), publicOneApiOutpaintConfig({ available: true })] };
}

async function image(width, height) {
  const bytes = await sharp({ create: { width, height, channels: 3, background: "#778493" } }).png().toBuffer();
  return { dataUrl: `data:image/png;base64,${bytes.toString("base64")}`, name: "room.png", type: "image/png", size: bytes.length };
}

test("Beta扩图页面展开四工作流，经正式执行适配器捕获实际Prompt与独立Beta归档", async () => {
  const source = await image(864, 1184);
  const workflows = publicBetaOutpaintConfig(rawConfig()).workflows;
  const events = [], completed = [], submitted = [];
  const comfyClient = (engine) => ({
    async generateImage(request) {
      submitted.push({ engine, request });
      const output = await image(request.width, request.height);
      return { images: [{ url: output.dataUrl }], outputFormat: "png", transport: "comfyui-workflow", metadata: {
        outputWidth: request.width, outputHeight: request.height, workflowVersion: `fixture-${engine}`,
        finalPrompt: `actual ${engine} Janus scene`, finalPromptCaptured: true, promptSource: "SaveText.text",
      } };
    },
  });
  const apiClient = {
    async editImage(request) {
      const [width, height] = request.size.split("x").map(Number);
      submitted.push({ engine: "sunburst", request });
      const output = await image(width, height);
      return { images: [{ url: output.dataUrl }], outputFormat: "png", transport: "images-edits",
        usageCost: { currency: "USD", costUsd: 0.01 } };
    },
  };
  const generationService = createGenerationService({
    imageOutpaintClient: comfyClient("flux"), qwenImageClient: comfyClient("qwen"),
    imageClientForModel(key) { assert.equal(key, "gptImage25Sunburst"); return apiClient; },
    scheduleGenerationSync: captureBetaGenerationArchive,
  });
  const baseStore = {
    config: { baseUrl: "https://example.test/base/beta", tableId: "beta-runs" },
    async verifySchema() { events.push("schema"); },
    async getSampleSet() {
      return { status: "可用", featureMode: "imageOutpaint", recordId: "set-1",
        samples: [{ sampleId: "SAMPLE-1", recordId: "sample-1", image: { type: source.type, size: source.size } }] };
    },
    async resolveSample() { events.push("source"); return { featureMode: "imageOutpaint", image: source }; },
    async beginRun({ item }) {
      events.push("begin");
      assert.equal(item.input.referenceImages.length, 1);
      assert.equal(betaConfigSnapshot(item.input).outpaintWorkflowKey, item.input.outpaintWorkflowKey);
      return { recordId: item.runId };
    },
    async completeRun(recordId, result) {
      assert.equal(result.sync.status, "skipped");
      assert.equal(result.sync.generationId, null);
      assert.match(result.sync.archiveFields["最终 Prompt"], /Janus scene|Outpaint this image/);
      const parameters = JSON.parse(result.sync.archiveFields["生成参数"]);
      assert.equal(parameters.workflow.feature, "image-outpaint");
      assert.equal(parameters.workflow.outpaintCanvas.ratio, "original");
      assert.equal(parameters.resolution, "2K");
      assert.match(betaResultVersion(result), /@/);
      assert.equal(result.images.length, 1);
      completed.push({ recordId, result });
      return { recordUrl: `https://example.test/run/${recordId}`, previewUrl: "data:image/webp;base64,fixture" };
    },
    async failRun(_id, error) { throw error; },
  };
  const runner = createBetaRunnerService({ baseStore, generationService, getOutpaintConfig: async () => rawConfig() });
  const startedAt = new Date("2026-10-19T06:00:00+08:00");
  const items = buildBetaOutpaintItems({ cases: [{ caseId: "SAMPLE-1", label: "客厅" }], workflows,
    settings: { workflowKeys: workflows.map(({ key }) => key), ratio: "original", multiple: 1.5 }, startedAt });
  await runner.start({ featureMode: "imageOutpaint", sampleSetId: "SET-1", batchId: "BETA-integration001",
    jobId: "beta-integration001", testTime: "2026-10-19 06:00:00", items });
  for (let attempt = 0; attempt < 1500 && runner.getJob("beta-integration001").status === "running"; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  const job = runner.getJob("beta-integration001");
  assert.equal(job.status, "success", job.message);
  assert.deepEqual(job.stages, { generated: 4, synced: 4 });
  assert.equal(completed.length, 4);
  assert.equal(submitted.length, 4);
  assert.deepEqual(submitted.filter(({ engine }) => engine === "flux").map(({ request }) => request.outpaintModel).sort(),
    ["fluxFillDev", "oneRewardFp8"]);
  assert.equal(submitted.filter(({ engine }) => engine === "qwen").length, 1);
  assert.equal(submitted.filter(({ engine }) => engine === "sunburst").length, 1);
  assert.equal(events.filter((event) => event === "source").length, 4);
  assert.equal(job.result.results.length, 4);
  assert.ok(job.result.results.every(({ previewUrl, recordUrl }) => previewUrl && recordUrl));
});

test("Beta扩图配置与普通模型和分辨率分开保存，请求只引用样本ID和扩图合同", () => {
  const page = normalizeBetaPageState({ featureMode: "imageOutpaint", selectedModelKeys: ["banana21"],
    controls: { ratio: "16:9", resolution: "4K" },
    outpaint: { workflowKeys: ["outpaint-flux-dev"], ratio: "3:4", multiple: 2 } });
  assert.deepEqual(page.selectedModelKeys, ["banana21"]);
  assert.equal(page.controls.resolution, "4K");
  assert.deepEqual(page.outpaint, { workflowKeys: ["outpaint-flux-dev"], ratio: "3:4", multiple: 2 });
  const workflows = publicBetaOutpaintConfig(rawConfig()).workflows.filter(({ key }) => page.outpaint.workflowKeys.includes(key));
  const [item] = buildBetaOutpaintItems({ cases: [{ caseId: "SAMPLE-1", label: "样本" }], workflows, settings: page.outpaint });
  assert.equal(item.sampleId, "SAMPLE-1");
  assert.equal(item.input.outpaintCanvas.resolution, "2K");
  assert.equal(item.input.outpaintCanvas.scale, 0.5);
  assert.equal(item.input.modelKey, undefined);
  assert.equal(item.input.referenceImages, undefined);
  assert.equal(item.input.prompt, undefined);
  assert.deepEqual(normalizeBetaOutpaintState({ workflowKeys: ["evil"], ratio: "evil", multiple: 8 }),
    { workflowKeys: [BETA_OUTPAINT_WORKFLOWS[0].key, BETA_OUTPAINT_WORKFLOWS[2].key], ratio: "original", multiple: 1.5 });
});

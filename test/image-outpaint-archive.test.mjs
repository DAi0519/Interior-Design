/**
 * [INPUT]: 依赖三引擎扩图服务/归档投影、飞书记录字段与内存图片/客户端/同步调度
 * [OUTPUT]: 对外提供实际归一源图、Qwen/Sunburst真实Prompt、Flux缺失正文事实、模型/工作流/费用与真实尺寸通过后仅同步一次的回归保障
 * [POS]: test 的扩图到飞书应用合同测试，不调用真实模型或飞书
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { buildImageOutpaintArchive, IMAGE_OUTPAINT_ARCHIVE_MODEL_LABELS } from "../src/image-outpaint-archive.mjs";
import { executeImageOutpaint, normalizeImageOutpaintInput } from "../src/image-outpaint-service.mjs";
import { createGenerationService } from "../src/generation-service.mjs";
import { QWEN_OUTPAINT_ENGINE_KEY, QWEN_OUTPAINT_PROMPT, QWEN_OUTPAINT_WORKFLOW } from "../src/image-outpaint-qwen.mjs";
import { buildOneApiOutpaintPrompt } from "../src/image-outpaint-oneapi.mjs";
import { buildRecordFields } from "../src/lark-sync.mjs";

const bytes = await sharp({ create: { width: 403, height: 301, channels: 3, background: "#679fac" } }).png().toBuffer();
const source = { name: "actual.png", dataUrl: `data:image/png;base64,${bytes.toString("base64")}`, width: 9000, height: 9000 };
const base = { referenceImages: [source], outpaintCanvas: { ratio: "4:3", resolution: "1K", position: { x: 0.3, y: 0.7 } } };
const outputBytes = await sharp({ create: { width: 1024, height: 768, channels: 3, background: "#aab" } }).png().toBuffer();
const outputUrl = `data:image/png;base64,${outputBytes.toString("base64")}`;

function generated(request) {
  return {
    images: [{ url: outputUrl }], outputFormat: "png", transport: "comfyui-workflow",
    metadata: { outputWidth: request.width, outputHeight: request.height, seed: 42, outputSha256: "a".repeat(64),
      workflowVersion: "actual-version", lora: "actual-lora.safetensors", executionDurationMs: 3000, queueDurationMs: 100 },
  };
}

test("三引擎四模型扩图在产物校验后投影归档且返回原同步任务身份", async () => {
  const cases = [
    { outpaintEngine: "comfyui", outpaintModel: "oneRewardFp8", label: "Flux Fill OneReward（FP8）" },
    { outpaintEngine: "comfyui", outpaintModel: "fluxFillDev", label: "Flux Fill Dev（原版）" },
    { outpaintEngine: QWEN_OUTPAINT_ENGINE_KEY, label: QWEN_OUTPAINT_WORKFLOW.label },
    { outpaintEngine: "gptImage25Sunburst", label: "GPT Image 2.5 Sunburst" },
  ];
  for (const { label, ...selection } of cases) {
    let actualRequest, payload, syncCalls = 0;
    const sync = { generationId: `sync-${selection.outpaintEngine}`, status: "pending" };
    const result = await executeImageOutpaint({ ...base, ...selection, prompt: "未参与执行的伪造Prompt" }, {
      imageClient: {
        async generateImage(request) { actualRequest = request; return generated(request); },
        async editImage(request) {
          actualRequest = request;
          return { images: [{ url: outputUrl }], outputFormat: "png", transport: "images-edits",
            usageCost: { nativeAmount: 1.2, currency: "CNY" }, requestId: "actual-request" };
        },
      },
      scheduleSync(archive) { syncCalls += 1; payload = archive; return sync; },
    });
    assert.equal(syncCalls, 1, label);
    assert.strictEqual(result.sync, sync);
    assert.equal(result.request.syncMode, "lark");
    assert.equal(payload.modelLabel, label);
    assert.equal(payload.preview.ratio, "4:3");
    assert.equal(payload.preview.resolution, "1K");
    assert.equal(payload.preview.size, "1024x768");
    assert.equal(payload.preview.outputFormat, "png");
    assert.equal(payload.preview.referenceImageCount, 1);
    assert.equal(payload.workflow.feature, "image-outpaint");
    assert.equal(payload.workflow.engine, selection.outpaintEngine);
    assert.equal(payload.workflow.originalSourceWidth, 403);
    assert.equal(payload.workflow.originalSourceHeight, 301);
    assert.equal(payload.workflow.sourceResized, false);
    assert.deepEqual(payload.workflow.outpaintCanvas, base.outpaintCanvas);
    assert.equal(payload.referenceImages[0].imageUrl, source.dataUrl);
    assert.equal(payload.referenceImages[0].mimeType, "image/png");
    assert.equal(payload.sourcePrompt, "");
    assert.strictEqual(payload.resultImage, result.images[0]);
    assert.equal(JSON.stringify(payload).includes("未参与执行的伪造Prompt"), false);
    const fields = buildRecordFields({ ...payload, actualSize: "1024x768" });
    assert.equal(fields["功能"], "AI扩图");
    assert.equal(fields["生图模型"], label);
    if (selection.outpaintEngine === "gptImage25Sunburst") {
      assert.equal(payload.finalPrompt, actualRequest.prompt);
      assert.deepEqual(payload.workflow.usageCost, { nativeAmount: 1.2, currency: "CNY" });
      assert.equal(payload.workflow.requestId, "actual-request");
    } else {
      assert.equal(payload.workflow.seed, 42);
      assert.equal(payload.workflow.outputSha256, "a".repeat(64));
      assert.equal(payload.workflow.workflowVersion, "actual-version");
      assert.equal(payload.referenceImages[0].imageUrl, actualRequest.images[0].image_url);
      assert.equal(payload.workflow.executionDurationMs, 3000);
      assert.equal(payload.workflow.queueDurationMs, 100);
      if (selection.outpaintEngine === QWEN_OUTPAINT_ENGINE_KEY) {
        assert.equal(payload.finalPrompt, QWEN_OUTPAINT_PROMPT);
        assert.equal(payload.workflow.finalPromptCaptured, true);
        assert.equal(payload.workflow.lora, "actual-lora.safetensors");
      } else {
        assert.equal(payload.finalPrompt, "");
        assert.equal(payload.workflow.finalPromptCaptured, false);
        assert.match(payload.workflow.promptSource, /Janus.*未返回正文/);
      }
    }
  }
  assert.deepEqual(IMAGE_OUTPAINT_ARCHIVE_MODEL_LABELS, ["Flux Fill OneReward（FP8）", "Flux Fill Dev（原版）", "Qwen Image Edit 2511"]);
});

test("归档使用EXIF归一及目标适配后的实际源图，不重复解码客户端伪造尺寸", async () => {
  const largeJpeg = await sharp(bytes).resize(2000, 1500).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  let payload, actualRequest;
  await executeImageOutpaint({ ...base, outpaintEngine: QWEN_OUTPAINT_ENGINE_KEY,
    referenceImages: [{ name: "rotated.jpg", dataUrl: `data:image/jpeg;base64,${largeJpeg.toString("base64")}`, width: 1, height: 2 }],
  }, {
    imageClient: { async generateImage(request) { actualRequest = request; return generated(request); } },
    scheduleSync(archive) { payload = archive; return { generationId: "normalized", status: "pending" }; },
  });
  assert.deepEqual([payload.workflow.originalSourceWidth, payload.workflow.originalSourceHeight], [1500, 2000]);
  assert.equal(payload.workflow.sourceResized, true);
  assert.equal(payload.referenceImages[0].fileName, "rotated.png");
  assert.equal(payload.referenceImages[0].mimeType, "image/png");
  assert.equal(payload.referenceImages[0].imageUrl, actualRequest.images[0].image_url);
  const actual = await sharp(Buffer.from(payload.referenceImages[0].imageUrl.split(",")[1], "base64")).metadata();
  assert.deepEqual([payload.workflow.sourceWidth, payload.workflow.sourceHeight], [actual.width, actual.height]);
});

test("错尺寸和生成异常均不入同步队列，底层无调度时仍可独立验证工作流", async () => {
  let syncCalls = 0;
  const scheduleSync = () => { syncCalls += 1; };
  await assert.rejects(executeImageOutpaint(base, {
    imageClient: { async generateImage() { return generated({ width: 16, height: 16 }); } }, scheduleSync,
  }), /实际输出尺寸/);
  await assert.rejects(executeImageOutpaint(base, {
    imageClient: { async generateImage() { throw new Error("生成失败"); } }, scheduleSync,
  }), /生成失败/);
  assert.equal(syncCalls, 0);
  const result = await executeImageOutpaint(base, { imageClient: { async generateImage(request) { return generated(request); } } });
  assert.deepEqual(result.sync, { generationId: null, status: "skipped" });
});

test("归档投影可复用已完成产物，批次和legacy四边尺寸事实均保留", async () => {
  const input = { outpaintEngine: "gptImage25Sunburst", referenceImages: [source], expansion: { left: 100, top: 80, right: 521, bottom: 387 },
    batchId: "outpaint-batch-test", batchIndex: 1, batchCount: 2 };
  const normalized = await normalizeImageOutpaintInput(input);
  const payload = buildImageOutpaintArchive({ input, normalized, result: { durationMs: 3456, images: [{ url: outputUrl }],
    request: { size: "1024x768", outputFormat: "png" }, workflow: { key: "image-outpaint-sunburst", version: "stored-version" },
    upstream: { metadata: { seed: 15, outputSha256: "b".repeat(64) }, outputFormat: "png", transport: "images-edits" },
  } });
  assert.equal(payload.finalPrompt, buildOneApiOutpaintPrompt(normalized));
  assert.equal(payload.durationMs, 3456);
  assert.equal(payload.preview.ratio, "4:3");
  assert.equal(payload.preview.resolution, "custom");
  assert.equal(payload.workflow.workflowVersion, "stored-version");
  assert.equal(payload.workflow.batchId, input.batchId);
  assert.deepEqual(payload.workflow.expansion, input.expansion);
});

test("扩图路由复用归档调度，图片超分仍保持本机结果", async () => {
  const service = createGenerationService({
    imageUpscaleClient: { async generateImage(request) {
      return { images: [{ url: outputUrl }], outputFormat: "png", metadata: { outputWidth: request.width, outputHeight: request.height } };
    } },
    scheduleGenerationSync() { assert.fail("图片超分无需飞书归档"); },
  });
  const result = await service.executeForMode("imageUpscale", { referenceImages: [source], resolution: "4K", upscaleWorkflowKey: "youxing_seedvr2_3b" });
  assert.equal(result.sync.status, "skipped");
});

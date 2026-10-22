/**
 * [INPUT]: 依赖三引擎扩图服务/归档投影、飞书记录字段与内存图片/客户端/同步调度
 * [OUTPUT]: 对外提供原比例选择/实际2K尺寸与工作流参数原样归档、真实归一源图、实际Prompt原文/缺省中性来源与显式历史来源保留、模型/费用及尺寸校验后仅同步一次的回归保障
 * [POS]: test 的扩图到飞书应用合同测试，不调用真实模型或飞书
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { buildImageOutpaintArchive, IMAGE_OUTPAINT_ARCHIVE_MODEL_LABELS } from "../src/image-outpaint-archive.mjs";
import { executeImageOutpaint, normalizeImageOutpaintInput } from "../src/image-outpaint-service.mjs";
import { createGenerationService } from "../src/generation-service.mjs";
import { QWEN_OUTPAINT_ENGINE_KEY, QWEN_OUTPAINT_WORKFLOW } from "../src/image-outpaint-qwen.mjs";
import { buildOneApiOutpaintPrompt } from "../src/image-outpaint-oneapi.mjs";
import { buildRecordFields } from "../src/lark-sync.mjs";

const bytes = await sharp({ create: { width: 403, height: 301, channels: 3, background: "#679fac" } }).png().toBuffer();
const source = { name: "actual.png", dataUrl: `data:image/png;base64,${bytes.toString("base64")}`, width: 9000, height: 9000 };
const base = { referenceImages: [source], outpaintCanvas: { ratio: "4:3", position: { x: 0.3, y: 0.7 } } };
const outputBytes = await sharp({ create: { width: 2048, height: 1536, channels: 3, background: "#aab" } }).png().toBuffer();
const outputUrl = `data:image/png;base64,${outputBytes.toString("base64")}`;
const executedQwenPrompt = "A calm room with warm lighting.";
const executedFluxPrompt = "A calm room with warm lighting, extending the architecture and surfaces with coherent perspective.";

function generated(request, { finalPrompt = executedQwenPrompt, promptSource = "Janus-Pro-1B" } = {}) {
  return {
    images: [{ url: outputUrl }], outputFormat: "png", transport: "comfyui-workflow",
    metadata: { outputWidth: request.width, outputHeight: request.height, seed: 42, outputSha256: "a".repeat(64),
      workflowVersion: "actual-version", lora: "actual-lora.safetensors", executionDurationMs: 3000, queueDurationMs: 100,
      finalPrompt, finalPromptCaptured: true, promptSource },
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
        async generateImage(request) {
          actualRequest = request;
          return generated(request, selection.outpaintEngine === "comfyui"
            ? { finalPrompt: executedFluxPrompt, promptSource: "Janus-Pro-1B" } : {});
        },
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
    assert.equal(payload.preview.resolution, "2K");
    assert.equal(payload.preview.size, "2048x1536");
    assert.equal(payload.preview.outputFormat, "png");
    assert.equal(payload.preview.referenceImageCount, 1);
    assert.equal(payload.workflow.feature, "image-outpaint");
    assert.equal(payload.workflow.engine, selection.outpaintEngine);
    assert.equal(payload.workflow.originalSourceWidth, 403);
    assert.equal(payload.workflow.originalSourceHeight, 301);
    assert.equal(payload.workflow.sourceResized, false);
    assert.deepEqual(payload.workflow.outpaintCanvas, { ...base.outpaintCanvas, resolution: "2K" });
    assert.equal(payload.referenceImages[0].imageUrl, source.dataUrl);
    assert.equal(payload.referenceImages[0].mimeType, "image/png");
    assert.equal(payload.sourcePrompt, "");
    assert.strictEqual(payload.resultImage, result.images[0]);
    assert.equal(JSON.stringify(payload).includes("未参与执行的伪造Prompt"), false);
    const fields = buildRecordFields({ ...payload, actualSize: "2048x1536" });
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
        assert.equal(payload.finalPrompt, executedQwenPrompt);
        assert.equal(fields["最终 Prompt"], executedQwenPrompt);
        assert.equal(payload.workflow.finalPromptCaptured, true);
        assert.equal(payload.workflow.promptSource, "Janus-Pro-1B");
        assert.equal(payload.workflow.lora, "actual-lora.safetensors");
      } else {
        assert.equal(payload.finalPrompt, executedFluxPrompt);
        assert.equal(fields["最终 Prompt"], executedFluxPrompt);
        assert.equal(payload.workflow.finalPromptCaptured, true);
        assert.match(payload.workflow.promptSource, /Janus-Pro-1B/);
      }
    }
  }
  assert.deepEqual(IMAGE_OUTPAINT_ARCHIVE_MODEL_LABELS, ["Flux Fill OneReward（FP8）", "Flux Fill Dev（原版）", "Qwen Image Edit 2511"]);
});

test("Qwen和Flux归档只信执行正文，缺失/非法/未捕获时留空且不回退固定约束或用户值", async () => {
  for (const outpaintEngine of [QWEN_OUTPAINT_ENGINE_KEY, "comfyui"]) {
    for (const [finalPrompt, finalPromptCaptured] of [
      [undefined, undefined], [executedQwenPrompt, false], [executedQwenPrompt, "true"],
      ["", true], [" \n ", true], [null, true], [[executedQwenPrompt], true], [42, true],
    ]) {
      let payload;
      await executeImageOutpaint({ ...base, outpaintEngine, prompt: "未执行的用户值" }, {
        imageClient: { async generateImage(request) {
          const result = generated(request);
          result.metadata = { ...result.metadata, finalPrompt, finalPromptCaptured };
          return result;
        } },
        scheduleSync(archive) { payload = archive; return { generationId: "missing-prompt", status: "pending" }; },
      });
      assert.equal(payload.finalPrompt, "");
      assert.equal(payload.workflow.finalPromptCaptured, false);
      assert.match(payload.workflow.promptSource, /Janus-Pro-1B/);
      assert.equal(buildRecordFields({ ...payload, actualSize: "2048x1536" })["最终 Prompt"], "");
    }
  }
});

test("任意原比例的选择与网格后尺寸独立归档，飞书参数JSON保留original且无需新增字段", async () => {
  const portraitBytes = await sharp(bytes).resize(864, 1184).png().toBuffer();
  const outpaintCanvas = { ratio: "original", resolution: "2K", scale: 2 / 3, position: { x: 0.3, y: 0.7 } };
  const resultBytes = await sharp({ create: { width: 1488, height: 2048, channels: 3, background: "#abc" } }).png().toBuffer();
  let archive, actualRequest, syncCalls = 0;
  const result = await executeImageOutpaint({ outpaintEngine: QWEN_OUTPAINT_ENGINE_KEY, outpaintCanvas,
    referenceImages: [{ ...source, dataUrl: `data:image/png;base64,${portraitBytes.toString("base64")}` }] }, {
    imageClient: { async generateImage(request) { actualRequest = request; return { ...generated(request), images: [{ url: `data:image/png;base64,${resultBytes.toString("base64")}` }] }; } },
    scheduleSync(payload) { archive = payload; syncCalls += 1; return { generationId: "original-ratio-archive", status: "pending" }; },
  });
  assert.equal(syncCalls, 1);
  assert.deepEqual([actualRequest.width, actualRequest.height], [1488, 2048]);
  assert.equal(result.request.size, "1488x2048");
  assert.deepEqual(result.request.outpaintCanvas, outpaintCanvas);
  assert.deepEqual(archive.workflow.outpaintCanvas, outpaintCanvas);
  assert.deepEqual([archive.workflow.originalSourceWidth, archive.workflow.originalSourceHeight], [864, 1184]);
  assert.equal(archive.preview.ratio, "original");
  assert.equal(archive.preview.resolution, "2K");
  assert.equal(archive.preview.size, "1488x2048");
  const fields = buildRecordFields({ ...archive, actualSize: "1488x2048" });
  assert.equal(fields["功能"], "AI扩图");
  assert.match(JSON.stringify(fields), /original/);
  assert.match(JSON.stringify(fields), /1488x2048/);
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
  const input = { outpaintEngine: "gptImage25Sunburst", referenceImages: [source], expansion: { left: 100, top: 80, right: 1545, bottom: 1155 },
    batchId: "outpaint-batch-test", batchIndex: 1, batchCount: 2 };
  const normalized = await normalizeImageOutpaintInput(input);
  const payload = buildImageOutpaintArchive({ input, normalized, result: { durationMs: 3456, images: [{ url: outputUrl }],
    request: { size: "2048x1536", outputFormat: "png" }, workflow: { key: "image-outpaint-sunburst", version: "stored-version" },
    upstream: { metadata: { seed: 15, outputSha256: "b".repeat(64) }, outputFormat: "png", transport: "images-edits" },
  } });
  assert.equal(payload.finalPrompt, buildOneApiOutpaintPrompt(normalized));
  assert.equal(payload.durationMs, 3456);
  assert.equal(payload.preview.ratio, "4:3");
  assert.equal(payload.preview.resolution, "2K");
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

test("ComfyUI实际Prompt原文保留，缺省来源用SaveText且显式历史来源不改写", async () => {
  const finalPrompt = "  A calm room with warm lighting.\nContinue the same architecture.  ";
  const historicalSource = "Janus-Pro-1B + QWEN_OUTPAINT_PROMPT";
  for (const outpaintEngine of [QWEN_OUTPAINT_ENGINE_KEY, "comfyui"]) {
    for (const promptSource of [undefined, "", historicalSource]) {
      let archive;
      await executeImageOutpaint({ ...base, outpaintEngine, prompt: "未执行的用户值" }, {
        imageClient: { async generateImage(request) {
          const result = generated(request, { finalPrompt });
          if (promptSource === undefined) delete result.metadata.promptSource;
          else result.metadata.promptSource = promptSource;
          return result;
        } },
        scheduleSync(payload) { archive = payload; return { generationId: "prompt-source-proof", status: "pending" }; },
      });
      assert.equal(archive.finalPrompt, finalPrompt);
      assert.equal(archive.workflow.finalPrompt, finalPrompt);
      assert.equal(archive.workflow.finalPromptCaptured, true);
      assert.equal(archive.workflow.promptSource, promptSource || "ComfyUI SaveText");
      const fields = buildRecordFields({ ...archive, actualSize: "2048x1536" });
      assert.equal(fields["最终 Prompt"], finalPrompt);
      assert.doesNotMatch(archive.finalPrompt, /Scene continuation:|gray canvas|grey canvas/i);
    }
  }
});

/**
 * [INPUT]: 依赖KS整图面积规划/执行图/元数据、真实PNG与内存ComfyUI客户端
 * [OUTPUT]: 验证补齐后严格20MP上限、最大偶数等比缩放、无外部切块、真实推理/插值交付及异常不重提
 * [POS]: test 的KS面积预算合同回归，不提交GPU或写飞书
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { createImageUpscaleWorkflow, imageUpscaleExecutionPlan, imageUpscaleTargetDimensions,
  imageUpscaleWorkflowMetadata } from "../src/image-upscale-workflow.mjs";
import { executeImageUpscale, IMAGE_UPSCALE_KS_TIMEOUT_MS } from "../src/image-upscale-service.mjs";

const KEYS = ["ks_seedvr2_2x", "ks_seedvr2_2x_direct"];
const args = (workflowKey, width = 6144, height = 4608, resolution = "6K") => ({
  generationRequest: { upscaleWorkflowKey: workflowKey, resolution }, width, height,
  imageBase64: "original-bytes", artifactKey: "ks-area-contract", seed: 42,
});
const padded = (w, h) => Math.ceil(w / 16) * 16 * Math.ceil(h / 16) * 16;
for (const key of KEYS) {
  test(`${key} 小图及所有档位一次整图推理，保留VAE省显存槽位`, () => {
    for (const [width, height, resolution] of [[768, 768, "2X"], [4096, 492, "4K"],
      [4096, 4096, "4K"], [6144, 4608, "6K"], [6400, 6400, "2X"]]) {
      const a = args(key, width, height, resolution), graph = createImageUpscaleWorkflow(a);
      const p = imageUpscaleExecutionPlan({ workflowKey: key, width, height, resolution });
      assert.equal(p.strategy, "whole"); assert.equal(p.policyVersion, "ks-whole-area-cap-v3");
      assert(p.paddedInferencePixels < 20_000_000); assert.equal(p.inferencePixelLimit, 20_000_000);
      assert.equal(p.blocksToSwap, 36); assert.equal(p.swapIoComponents, true);
      assert(!Object.values(graph).some(n => ["SplitImageToTileList", "ImageMergeTileList"].includes(n.class_type)));
      assert.equal(Object.values(graph).filter(n => n.class_type === "SeedVR2VideoUpscaler").length, 1);
      assert.equal(graph["74"].inputs.encode_tiled, true); assert.equal(graph["74"].inputs.decode_tiled, true);
      assert.equal(graph["74"].inputs.encode_tile_size, 1024); assert.equal(graph["74"].inputs.decode_tile_overlap, 128);
      assert.deepEqual(graph["75"].inputs.image, ["77", 0]);
      assert.deepEqual(graph["77"].inputs.image, [key === KEYS[0] ? "72" : "71", 0]);
    }
  });
  test(`${key} 推理预算和交付尺寸分开，只有超限才插值恢复`, () => {
    for (const [w, h, res, iw, ih] of [[6144, 4608, "6K", 5152, 3864],
      [6144, 6144, "6K", 4464, 4464], [6400, 6400, "2X", 4464, 4464],
      [6144, 3456, "6K", 5952, 3348], [4096, 492, "4K", 4096, 492]]) {
      const a = args(key, w, h, res), graph = createImageUpscaleWorkflow(a), m = imageUpscaleWorkflowMetadata(a);
      const restored = w !== iw || h !== ih;
      assert.equal(graph["77"].inputs.width, iw); assert.equal(graph["77"].inputs.height, ih);
      assert.equal(graph["75"].inputs.resolution, Math.min(iw, ih));
      assert.equal(graph["75"].inputs.max_resolution, Math.max(iw, ih));
      assert.equal(m.inferenceWidth, iw); assert.equal(m.inferenceHeight, ih);
      assert.equal(m.paddedInferencePixels, padded(iw, ih));
      assert.equal(m.deliveryPostResize, restored); assert.equal(m.tiling, undefined);
      assert.equal(m.workflowVersion, "2026-10-26.3"); assert.equal(m.executionStrategy, "whole");
      assert.equal(m.requestedOutputWidth, w); assert.equal(m.outputWidth, w); assert.equal(m.outputHeight, h);
      assert.equal(Object.values(graph).filter(n => n.class_type === "SaveImage").length, 1);
      assert.deepEqual(graph["76"].inputs.images, [restored ? "78" : "75", 0]);
      if (restored) assert.deepEqual(graph["78"].inputs, { image: ["75", 0], upscale_method: "lanczos", width: w, height: h, crop: "disabled" });
      else assert.equal(graph["78"], undefined);
    }
  });
}
test("恰20MP与原像素不足20MP但padding超限，都必须缩小", () => {
  for (const [width, height, iw, ih] of [[2000, 10000, 1996, 9984], [5000, 4000, 4992, 3994], [5000, 3998, 4992, 3992]]) {
    const p = imageUpscaleExecutionPlan({ width, height, resolution: "2X", workflowKey: KEYS[1] });
    assert(padded(width, height) >= 20_000_000); assert(p.paddedInferencePixels < 20_000_000);
    assert.equal(p.inferenceWidth, iw); assert.equal(p.inferenceHeight, ih);
  }
});
test("来源尺寸矩阵保持安全目标，受限结果为最大合法偶数长边", () => {
  let state = 19;
  for (let i = 0; i < 1000; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0; const sw = 384 + state % 2817;
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0; const sh = 384 + state % 2817;
    for (const resolution of ["2X", "4K", "6K"]) {
      const target = imageUpscaleTargetDimensions({ width: sw, height: sh }, resolution, KEYS[1]);
      const p = imageUpscaleExecutionPlan({ ...target, resolution, workflowKey: KEYS[1] });
      assert(p.inferenceWidth <= target.width && p.inferenceHeight <= target.height);
      assert.equal(p.inferenceWidth % 2, 0); assert.equal(p.inferenceHeight % 2, 0);
      assert(p.paddedInferencePixels < 20_000_000);
      if (padded(target.width, target.height) < 20_000_000) {
        assert.equal(p.inferenceWidth, target.width); assert.equal(p.inferenceHeight, target.height);
      } else {
        const nextLong = Math.max(p.inferenceWidth, p.inferenceHeight) + 2;
        const nextShort = Math.round(Math.min(target.width, target.height) * nextLong / Math.max(target.width, target.height) / 2) * 2;
        assert(padded(nextLong, nextShort) >= 20_000_000);
      }
    }
  }
});
test("普通四套不带KS预算或后置恢复，保持原长边和卸载参数", () => {
  for (const key of ["youxing_seedvr2_3b", "seedvr2_1mp", "seedvr2_075mp", "seedvr2_7b_direct"]) {
    const a = args(key, 8192, 8192, "8K"), graph = createImageUpscaleWorkflow(a), m = imageUpscaleWorkflowMetadata(a);
    assert.equal(graph["77"], undefined); assert.equal(graph["75"].inputs.resolution, 8192);
    assert.equal(graph["73"].inputs.swap_io_components, false); assert.equal(m.inferenceWidth, undefined);
    assert.equal(m.executionPolicyVersion, undefined); assert.equal(m.deliveryPostResize, undefined);
  }
});
const bytes = await sharp({ create: { width: 1024, height: 768, channels: 3, background: "#808080" } }).png().toBuffer();
const input = { upscaleWorkflowKey: KEYS[1], resolution: "6K", referenceImages: [{ name: "source.png", type: "image/png",
  dataUrl: `data:image/png;base64,${bytes.toString("base64")}` }] };
test("KS整图同样15分钟并追踪Prompt，任何异常不重复提交", async () => {
  let calls = 0; const error = Object.assign(new Error("HTTP读取超时"), { code: "timeout" });
  await assert.rejects(() => executeImageUpscale(input, { imageClient: { async generateImage(request, options) {
    calls++; assert.equal(options.executionTimeoutMs, IMAGE_UPSCALE_KS_TIMEOUT_MS);
    assert.equal(request.upscaleWorkflowVersion, "2026-10-26.3");
    options.onProgress({ phase: "executing", promptId: "whole-cap-prompt" }); throw error;
  } } }), e => e === error && e.retryable === false && e.details.promptId === "whole-cap-prompt");
  assert.equal(calls, 1);
});
test("交付宽高缺失/错误不能冒充6K；新请求拒绝已发布分块版本", async () => {
  for (const metadata of [{ outputWidth: 6142, outputHeight: 4608 }, {}]) {
    await assert.rejects(() => executeImageUpscale(input, { imageClient: { async generateImage() {
      return { images: [], metadata, outputFormat: "png" };
    } } }), e => e.code === "output_dimensions" && e.retryable === false);
  }
  await assert.rejects(() => executeImageUpscale({ ...input, upscaleWorkflowVersion: "2026-10-26.2" }, {
    imageClient: { async generateImage() { assert.fail("旧版不可提交GPU"); } },
  }), e => e.statusCode === 409 && e.retryable === false);
});

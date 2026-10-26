/**
 * [INPUT]: 依赖KS统一分块策略/执行图/服务与真实源PNG，注入内存ComfyUI客户端
 * [OUTPUT]: 验证全档位分块和小/窄图原尺寸、重叠布局、预处理位置/唯一输出、实际送模元数据与时限/身份/错误重试边界
 * [POS]: test的KS统一分块合同测试；不提交GPU或写飞书
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { createImageUpscaleWorkflow, imageUpscaleExecutionPlan, imageUpscaleWorkflowMetadata }
  from "../src/image-upscale-workflow.mjs";
import { executeImageUpscale, IMAGE_UPSCALE_TILED_TIMEOUT_MS } from "../src/image-upscale-service.mjs";

const KEYS = ["ks_seedvr2_2x", "ks_seedvr2_2x_direct"];
const args = (workflowKey, width = 6144, height = 4608, resolution = "6K") => ({
  generationRequest: { upscaleWorkflowKey: workflowKey, resolution },
  width, height, imageBase64: "original-bytes", artifactKey: "ks-tiled-contract", seed: 42,
});
for (const key of KEYS) {
  test(`${key} 所有面积与2X/4K/6K均走分块，非KS不改变`, () => {
    for (const [width, height, resolution] of [[768, 768, "2X"], [6250, 4000, "2X"],
      [6250, 4002, "2X"], [4096, 4096, "4K"], [6144, 3456, "6K"]]) {
      const plan = imageUpscaleExecutionPlan({ workflowKey: key, resolution, width, height });
      assert.equal(plan.strategy, "tiled");
      assert.equal(plan.thresholdPixels, undefined);
      assert.equal(plan.blocksToSwap, 36); assert.equal(plan.swapIoComponents, true);
    }
    const ordinary = createImageUpscaleWorkflow(args("seedvr2_7b_direct", 8192, 8192, "8K"));
    assert(!Object.values(ordinary).some(n => n.class_type === "SplitImageToTileList"));
  });
  test(`${key} 横竖12块/方图16块保持2048原尺寸，唯一Save接融合结果`, () => {
    for (const [width, height, columns, rows] of [[6144, 4608, 4, 3], [4608, 6144, 3, 4], [6144, 6144, 4, 4]]) {
      const a = args(key, width, height), graph = createImageUpscaleWorkflow(a);
      const m = imageUpscaleWorkflowMetadata(a);
      assert.deepEqual(m.tiling, { tileWidth: 2048, tileHeight: 2048,
        overlap: 256, rows, columns, tileCount: rows * columns });
      assert.equal(m.executionStrategy, "tiled"); assert.equal(m.workflowVersion, "2026-10-26.2");
      assert.equal(m.executionPolicyVersion, "ks-always-tiled-v2");
      assert.equal(m.seedVrResolution, 2048); assert.equal(m.seedVrMaxResolution, 2048);
      assert.equal(m.requestedOutputWidth, width); assert.equal(m.requestedOutputHeight, height);
      assert.equal(graph["75"].inputs.batch_size, 1); assert.equal(graph["75"].inputs.resolution, 2048);
      assert.equal(graph["75"].inputs.max_resolution, 2048);
      assert.deepEqual(graph["75"].inputs.image, ["78", 0]);
      assert.deepEqual(graph["78"].inputs, { image: ["77", 0], tile_width: 2048, tile_height: 2048, overlap: 256 });
      assert.deepEqual(graph["79"].inputs, { image_list: ["75", 0], final_width: width, final_height: height, overlap: 256 });
      assert.deepEqual(graph["76"].inputs.images, ["79", 0]);
      assert.equal(Object.values(graph).filter(n => n.class_type === "SaveImage").length, 1);
      assert.equal(graph["73"].inputs.blocks_to_swap, 36); assert.equal(graph["73"].inputs.swap_io_components, true);
      assert.deepEqual(graph["77"].inputs.image, [key === "ks_seedvr2_2x" ? "72" : "71", 0]);
      assert.equal(Object.values(graph).filter(n => n.class_type === "ImageScaleToTotalPixels").length,
        key === "ks_seedvr2_2x" ? 1 : 0);
      assert.equal(graph["77"].inputs.width, width); assert.equal(graph["77"].inputs.height, height);
      assert.equal(graph["77"].inputs.crop, "disabled");
    }
  });
  test(`${key} 小图一块和窄图多块保持真实块宽高，不再整图回退`, () => {
    for (const [resolution, width, height, tw, th, columns, rows] of [
      ["2X", 768, 768, 768, 768, 1, 1],
      ["2X", 1432, 2588, 1432, 2048, 1, 2],
      ["4K", 4096, 492, 2048, 492, 3, 1],
      ["6K", 738, 6144, 738, 2048, 1, 4],
      ["2X", 6400, 768, 2048, 768, 4, 1],
    ]) {
      const a = args(key, width, height, resolution), graph = createImageUpscaleWorkflow(a);
      const m = imageUpscaleWorkflowMetadata(a);
      assert.equal(m.executionStrategy, "tiled");
      assert.equal(m.outputWidth, width); assert.equal(m.outputHeight, height);
      assert.deepEqual(m.tiling, { tileWidth: tw, tileHeight: th, overlap: 256,
        columns, rows, tileCount: columns * rows });
      assert.equal(graph["75"].inputs.resolution, Math.min(tw, th));
      assert.equal(graph["75"].inputs.max_resolution, Math.max(tw, th));
      assert.deepEqual(graph["76"].inputs.images, ["79", 0]);
      assert.equal(graph["79"].inputs.final_width, width);
      assert.equal(graph["79"].inputs.final_height, height);
    }
  });
}
const sourceBytes = await sharp({ create: { width: 1024, height: 768, channels: 3, background: "#808080" } }).png().toBuffer();
const input = { upscaleWorkflowKey: KEYS[1], resolution: "6K", referenceImages: [{ name: "source.png",
  type: "image/png", size: sourceBytes.length, dataUrl: `data:image/png;base64,${sourceBytes.toString("base64")}` }] };
test("分块服务给15分钟、冻结当前版本，HTTP取图失败也不重提整图", async () => {
  let calls = 0;
  const error = Object.assign(new Error("HTTP读取超时"), { code: "timeout" });
  await assert.rejects(() => executeImageUpscale(input, { imageClient: { async generateImage(request, options) {
    calls += 1; assert.equal(options.executionTimeoutMs, IMAGE_UPSCALE_TILED_TIMEOUT_MS);
    assert.equal(request.upscaleWorkflowVersion, "2026-10-26.2");
    options.onProgress({ phase: "executing", promptId: "tiled-prompt" }); throw error;
  } } }), e => e === error && e.retryable === false && e.details.promptId === "tiled-prompt");
  assert.equal(calls, 1);
});
test("分块错误输出尺寸或缺真实宽高不能冒称6K成功", async () => {
  for (const metadata of [{ outputWidth: 6142, outputHeight: 4608 }, {}]) {
    await assert.rejects(() => executeImageUpscale(input, { imageClient: { async generateImage() {
      return { images: [{ url: "data:image/png;base64,unused" }], metadata, outputFormat: "png" };
    } } }), e => e.code === "output_dimensions" && e.retryable === false);
  }
});
test("冻结版本漂移在GPU前拒绝", async () => {
  let called = false;
  await assert.rejects(() => executeImageUpscale({ ...input, upscaleWorkflowVersion: "2026-10-21.1" }, {
    imageClient: { async generateImage() { called = true; } },
  }), e => e.statusCode === 409 && e.retryable === false);
  assert.equal(called, false);
  assert.throws(() => createImageUpscaleWorkflow({ ...args(KEYS[1]), generationRequest: {
    ...args(KEYS[1]).generationRequest, upscaleWorkflowVersion: "2026-10-21.1",
  } }), e => e.statusCode === 409);
});

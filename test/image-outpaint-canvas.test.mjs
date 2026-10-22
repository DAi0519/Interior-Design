/**
 * [INPUT]: 依赖共享 outpaintCanvasPlan/outpaintScaleBounds/outpaintVisualPlan、扩图服务/公开三引擎合同与 sharp 生成的真实图片字节
 * [OUTPUT]: 对外提供原比例真实尺寸/模型网格误差与Sunburst比例边界、固定2K预设与旧1K/4K拒绝、适配定位/非法参数400及EXIF后真实方向重算保障
 * [POS]: test 的目标画布跨层合同测试，与旧 expansion 兼容测试并列，使用内存客户端不提交 GPU 或付费任务
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { OUTPAINT_RESOLUTION, outpaintCanvasPlan, outpaintScaleBounds } from "../public/image-outpaint-geometry.js";
import { executeImageOutpaint, normalizeImageOutpaintInput, publicImageOutpaintConfig } from "../src/image-outpaint-service.mjs";
import { publicQwenOutpaintConfig } from "../src/image-outpaint-qwen.mjs";
import { outpaintVisualPlan } from "../public/image-outpaint-transform.js";
import { prepareOneApiOutpaintCanvas, publicOneApiOutpaintConfig } from "../src/image-outpaint-oneapi.mjs";

const comfy = publicImageOutpaintConfig({ available: true });
const sunburst = publicOneApiOutpaintConfig({ available: true });
const qwen = publicQwenOutpaintConfig({ available: true });
const ratios = ["1:1", "4:3", "16:9", "3:4", "9:16"];
const targets = {
  "1:1": { width: 2048, height: 2048 },
  "4:3": { width: 2048, height: 1536 },
  "16:9": { width: 2048, height: 1152 },
  "3:4": { width: 1536, height: 2048 },
  "9:16": { width: 1152, height: 2048 },
};

function assertPlan(plan) {
  const { prepared, target, expansion } = plan;
  assert.equal(prepared.width + expansion.left + expansion.right, target.width);
  assert.equal(prepared.height + expansion.top + expansion.bottom, target.height);
  assert.ok(prepared.width > 0 && prepared.height > 0);
  assert.ok(prepared.width <= target.width && prepared.height <= target.height);
  assert.ok(Object.values(expansion).every((value) => Number.isSafeInteger(value) && value >= 0));
  assert.ok(Object.values(expansion).some((value) => value > 0));
}

test("Flux所有比例按固定2K目标输出，源尺寸与构图位置不改变分辨率", () => {
  for (const ratio of ratios) {
    const resolution = OUTPAINT_RESOLUTION;
    const target = targets[ratio];
    for (const source of [{ width: 32, height: 32 }, { width: 1000, height: 751 }, { width: 4096, height: 3072 }]) {
      for (const position of [{ x: 0.5, y: 0.5 }, { x: 0, y: 1 }, { x: 1, y: 0 }]) {
        const plan = outpaintCanvasPlan({ source, ratio, resolution, position, limits: comfy });
        assert.deepEqual(plan.target, target);
        assert.equal(plan.ratio, ratio);
        assert.equal(plan.resolution, resolution);
        assert.equal(plan.target.width % 8, 0);
        assert.equal(plan.target.height % 8, 0);
        assert.equal(plan.prepared.width % 32, 0);
        assert.equal(plan.prepared.height % 32, 0);
        assertPlan(plan);
        if (position.x === 0) assert.equal(plan.expansion.left, 0);
        if (position.x === 1) assert.equal(plan.expansion.right, 0);
        if (position.y === 0) assert.equal(plan.expansion.top, 0);
        if (position.y === 1) assert.equal(plan.expansion.bottom, 0);
      }
    }
  }
});

test("省略分辨率默认2K，三引擎显式1K与4K不能升级或降级", async () => {
  const referenceImages = [await pngSource(1000, 751)];
  for (const [outpaintEngine, limits] of [["comfyui", comfy], ["qwenImageEdit2511", qwen], ["gptImage25Sunburst", sunburst]]) {
    const options = { source: { width: 1000, height: 751 }, ratio: "16:9", limits };
    const plan = outpaintCanvasPlan(options);
    assert.equal(limits.resolution, "2K");
    assert.deepEqual(outpaintScaleBounds(options), { min: 1 / 3, max: 1 });
    assert.deepEqual(outpaintVisualPlan({ ...options, target: plan.target, scale: 2 / 3 }).target, plan.target);
    assert.equal(plan.resolution, "2K");
    assert.deepEqual(plan.target, { width: 2048, height: 1152 });
    const normalized = await normalizeImageOutpaintInput({ outpaintEngine, referenceImages, outpaintCanvas: { ratio: "16:9" } });
    assert.equal(normalized.outpaintCanvas.resolution, "2K");
    for (const resolution of ["1K", "4K", null]) {
      for (const calculate of [outpaintCanvasPlan, outpaintScaleBounds]) {
        assert.throws(() => calculate({ ...options, resolution, scale: 2 / 3 }), (error) => error.statusCode === 400);
      }
      await assert.rejects(normalizeImageOutpaintInput({ outpaintEngine, referenceImages, outpaintCanvas: { ratio: "16:9", resolution } }), (error) => error.statusCode === 400);
    }
  }
});

test("共享画布规划保留能放入的源图，只在必要时缩小并为同尺寸源图留出扩展空间", () => {
  const retained = outpaintCanvasPlan({ source: { width: 1000, height: 751 }, ratio: "16:9", resolution: "2K", limits: comfy });
  assert.equal(retained.resize, null);
  assert.deepEqual(retained.prepared, { width: 1024, height: 768 });
  assert.deepEqual(retained.expansion, { left: 512, top: 192, right: 512, bottom: 192 });
  const fitted = outpaintCanvasPlan({ source: { width: 4096, height: 3072 }, ratio: "16:9", resolution: "2K", limits: comfy });
  assert.ok(fitted.resize.width < 4096 && fitted.resize.height < 3072);
  assert.ok(Math.abs(fitted.resize.width / fitted.resize.height - 4 / 3) < 0.02);
  assertPlan(fitted);
  const sameSize = outpaintCanvasPlan({ source: { width: 2048, height: 2048 }, ratio: "1:1", resolution: "2K", limits: comfy });
  assert.ok(sameSize.resize.width <= 0.91 * 2048);
  assert.ok(sameSize.resize.height <= 0.91 * 2048);
  assert.ok(sameSize.expansion.left > 0 && sameSize.expansion.top > 0);
  assertPlan(sameSize);
  const sameRatio = outpaintCanvasPlan({ source: { width: 4096, height: 2304 }, ratio: "16:9", resolution: "2K", limits: comfy });
  assert.deepEqual(sameRatio.target, { width: 2048, height: 1152 });
  assert.ok(sameRatio.prepared.width < sameRatio.target.width);
  assert.ok(sameRatio.prepared.height < sameRatio.target.height);
  assertPlan(sameRatio);
});

test("Flux与Qwen原比例由真实源图决定，仅短边按模型网格取整且缩放不改变目标", () => {
  for (const limits of [comfy, qwen]) {
    for (const source of [{ width: 32, height: 32 }, { width: 97, height: 149 }, { width: 149, height: 97 },
      { width: 1000, height: 751 }, { width: 864, height: 1184 }, { width: 4096, height: 3072 }]) {
      const options = { source, ratio: "original", limits };
      const plans = [1 / 3, 1 / 2, 2 / 3].map((scale) => outpaintCanvasPlan({ ...options, scale }));
      const expectedShort = 2048 * Math.min(source.width, source.height) / Math.max(source.width, source.height);
      for (const plan of plans) {
        assertPlan(plan);
        assert.equal(plan.ratio, "original");
        assert.equal(plan.resolution, "2K");
        assert.equal(Math.max(plan.target.width, plan.target.height), 2048);
        assert.equal(plan.target.width % limits.outputAlignment, 0);
        assert.equal(plan.target.height % limits.outputAlignment, 0);
        assert.ok(Math.abs(Math.min(plan.target.width, plan.target.height) - expectedShort) <= limits.outputAlignment / 2);
        assert.equal(plan.target.width >= plan.target.height, source.width >= source.height);
        assert.deepEqual(plan.target, plans[0].target);
      }
    }
  }
  const source = { width: 864, height: 1184 };
  assert.deepEqual(outpaintCanvasPlan({ source, ratio: "original", scale: 2 / 3, limits: comfy }).target, { width: 1496, height: 2048 });
  assert.deepEqual(outpaintCanvasPlan({ source, ratio: "original", scale: 2 / 3, limits: qwen }).target, { width: 1488, height: 2048 });
});

test("Sunburst原比例按16px网格输出固定2K，超出3:1只扩大目标短边并保全原图", async () => {
  assert.equal(sunburst.supportsOriginalRatio, true);
  assert.equal(sunburst.maxAspectRatio, 3);
  for (const source of [{ width: 1200, height: 900 }, { width: 900, height: 1200 }, { width: 1000, height: 1000 },
    { width: 864, height: 1184 }, { width: 3000, height: 1000 }, { width: 1000, height: 3000 }]) {
    const plan = outpaintCanvasPlan({ source, ratio: "original", scale: 2 / 3, limits: sunburst });
    assert.equal(Math.max(plan.target.width, plan.target.height), 2048);
    assert.equal(plan.target.width % 16, 0);
    assert.equal(plan.target.height % 16, 0);
    assert.equal(plan.ratio, "original");
    assertPlan(plan);
  }
  assert.deepEqual(outpaintCanvasPlan({ source: { width: 1200, height: 900 }, ratio: "original", limits: sunburst }).target,
    { width: 2048, height: 1536 });
  assert.deepEqual(outpaintCanvasPlan({ source: { width: 864, height: 1184 }, ratio: "original", limits: sunburst }).target,
    { width: 1488, height: 2048 });
  const normalized = await normalizeImageOutpaintInput({ outpaintEngine: "gptImage25Sunburst", referenceImages: [await pngSource(864, 1184)],
    outpaintCanvas: { ratio: "original", scale: 2 / 3 } });
  assert.deepEqual([normalized.width, normalized.height], [1488, 2048]);
  for (const source of [{ width: 3200, height: 1000 }, { width: 3073, height: 1024 }, { width: 1024, height: 3073 }]) {
    const adapted = await normalizeImageOutpaintInput({ outpaintEngine: "gptImage25Sunburst",
      referenceImages: [await pngSource(source.width, source.height)], outpaintCanvas: { ratio: "original", scale: 2 / 3 } });
    assert.deepEqual([adapted.width, adapted.height], source.width >= source.height ? [2048, 688] : [688, 2048]);
    assert.deepEqual(adapted.originalSource, source);
    assert.ok(Math.abs(adapted.source.width / adapted.source.height - source.width / source.height) < 0.005);
    assert.equal(adapted.outpaintCanvas.ratio, "original");
  }
});

test("Sunburst画布严格映射公开比例/分辨率，适配大图也不自动升级用户档位", () => {
  for (const ratio of ratios) {
    const resolution = OUTPAINT_RESOLUTION;
    const expected = sunburst.targetSizes.find((entry) => entry.ratio === ratio && entry.resolution === resolution);
    const plan = outpaintCanvasPlan({ source: { width: 3000, height: 3000 }, ratio, resolution, limits: sunburst });
    assert.deepEqual(plan.target, { width: expected.width, height: expected.height });
    assert.equal(plan.target.width % 16, 0);
    assert.equal(plan.target.height % 16, 0);
    assertPlan(plan);
  }
  const plan = outpaintCanvasPlan({ source: { width: 1000, height: 751 }, ratio: "16:9", resolution: "2K", limits: sunburst });
  assert.deepEqual(plan.target, { width: 2048, height: 1152 });
  assert.deepEqual(plan.prepared, { width: 1000, height: 751 });
  assert.equal(plan.resize, null);
});

test("目标合同拒绝无效比例/档位/归一化位置/原图，所有错误保持400", () => {
  const valid = { source: { width: 1000, height: 751 }, ratio: "16:9", resolution: "2K", limits: comfy };
  for (const override of [
    { ratio: "Original" }, { ratio: "2:1" }, { ratio: "" }, { ratio: null },
    { resolution: "1K" }, { resolution: "4K" }, { resolution: "8K" }, { resolution: "2k" }, { resolution: null },
    { position: { x: -0.01, y: 0.5 } }, { position: { x: 0.5, y: 1.01 } },
    { position: { x: NaN, y: 0.5 } }, { position: { x: "0.5", y: 0.5 } },
    { position: { x: 0.5 } }, { position: null },
    { source: { width: 31, height: 100 } }, { source: { width: 4097, height: 100 } },
    { source: { width: 100.5, height: 100 } }, { source: null },
  ]) {
    assert.throws(() => outpaintCanvasPlan({ ...valid, ...override }), (error) => error.statusCode === 400);
  }
  assert.throws(() => outpaintCanvasPlan({ ...valid, source: { width: 16385, height: 100 }, limits: sunburst }), (error) => error.statusCode === 400);
});

async function pngSource(width, height) {
  const bytes = await sharp({ create: { width, height, channels: 3, background: "#abc" } }).png().toBuffer();
  return { dataUrl: `data:image/png;base64,${bytes.toString("base64")}`, name: "room.png", width: 9999, height: 9999 };
}

test("服务端根据解码后的真实源图重算新合同，缩小后的尺寸与实际提交字节一致", async () => {
  const source = await pngSource(4096, 3072);
  const outpaintCanvas = { ratio: "16:9", resolution: "2K", position: { x: 0.2, y: 0.8 } };
  const expected = outpaintCanvasPlan({ source: { width: 4096, height: 3072 }, ...outpaintCanvas, limits: comfy });
  const normalized = await normalizeImageOutpaintInput({ referenceImages: [source], outpaintCanvas });
  assert.deepEqual(normalized.originalSource, { width: 4096, height: 3072 });
  assert.equal(normalized.sourceResized, true);
  assert.deepEqual(normalized.prepared, expected.prepared);
  assert.deepEqual(normalized.expansion, expected.expansion);
  assert.deepEqual([normalized.width, normalized.height], [2048, 1152]);
  assert.deepEqual(normalized.outpaintCanvas, outpaintCanvas);
  const payload = Buffer.from(normalized.source.imageUrl.split(",")[1], "base64");
  const metadata = await sharp(payload).metadata();
  assert.deepEqual([metadata.width, metadata.height], [expected.resize.width, expected.resize.height]);
  assert.deepEqual([normalized.source.width, normalized.source.height], [metadata.width, metadata.height]);
  assert.equal(normalized.source.size, payload.length);
  let calls = 0;
  const result = await executeImageOutpaint({ referenceImages: [source], outpaintCanvas }, { imageClient: { generateImage: async (request) => {
    calls += 1;
    const actual = await sharp(Buffer.from(request.images[0].image_url.split(",")[1], "base64")).metadata();
    assert.deepEqual([request.sourceWidth, request.sourceHeight], [actual.width, actual.height]);
    assert.deepEqual([request.preparedWidth, request.preparedHeight], [expected.prepared.width, expected.prepared.height]);
    assert.deepEqual(request.expansion, expected.expansion);
    assert.deepEqual([request.width, request.height], [2048, 1152]);
    return { images: [{ url: "data:image/png;base64,fixture" }], metadata: { outputWidth: request.width, outputHeight: request.height }, outputFormat: "png" };
  } } });
  assert.equal(calls, 1);
  assert.equal(result.request.size, "2048x1152");
  assert.deepEqual(result.request.outpaintCanvas, outpaintCanvas);
});

test("EXIF旋转完成后才按用户目标与位置计算画布，客户端伪造宽高不参与规划", async () => {
  const png = await pngSource(1000, 751);
  const jpeg = await sharp(Buffer.from(png.dataUrl.split(",")[1], "base64")).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const outpaintCanvas = { ratio: "16:9", resolution: "2K", position: { x: 1, y: 0 } };
  const normalized = await normalizeImageOutpaintInput({
    referenceImages: [{ dataUrl: `data:image/jpeg;base64,${jpeg.toString("base64")}`, name: "phone.jpg", width: 9999, height: 9999 }], outpaintCanvas,
  });
  const expected = outpaintCanvasPlan({ source: { width: 751, height: 1000 }, ...outpaintCanvas, limits: comfy });
  assert.deepEqual(normalized.originalSource, { width: 751, height: 1000 });
  assert.deepEqual(normalized.prepared, expected.prepared);
  assert.deepEqual(normalized.expansion, expected.expansion);
  const metadata = await sharp(Buffer.from(normalized.source.imageUrl.split(",")[1], "base64")).metadata();
  assert.equal(metadata.orientation, undefined);
  assert.deepEqual([metadata.width, metadata.height], [normalized.source.width, normalized.source.height]);
  assert.equal(normalized.expansion.right, 0);
  assert.equal(normalized.expansion.top, 0);
});

test("原比例在EXIF旋转后按可信尺寸计算，忽略客户端伪造的横图宽高", async () => {
  const png = await pngSource(1000, 751);
  const jpeg = await sharp(Buffer.from(png.dataUrl.split(",")[1], "base64")).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const outpaintCanvas = { ratio: "original", scale: 2 / 3, position: { x: 1, y: 0 } };
  for (const outpaintEngine of ["comfyui", "qwenImageEdit2511", "gptImage25Sunburst"]) {
    const normalized = await normalizeImageOutpaintInput({ outpaintEngine, outpaintCanvas,
      referenceImages: [{ dataUrl: `data:image/jpeg;base64,${jpeg.toString("base64")}`, name: "rotated.jpg", width: 3840, height: 1000 }] });
    assert.deepEqual(normalized.originalSource, { width: 751, height: 1000 });
    assert.deepEqual([normalized.width, normalized.height], [1536, 2048]);
    assert.deepEqual(normalized.outpaintCanvas, { ...outpaintCanvas, resolution: "2K" });
    assert.equal(normalized.expansion.right, 0);
    assert.equal(normalized.expansion.top, 0);
    const actual = await sharp(Buffer.from(normalized.source.imageUrl.split(",")[1], "base64")).metadata();
    assert.equal(actual.orientation, undefined);
    assert.deepEqual([actual.width, actual.height], [normalized.source.width, normalized.source.height]);
    assert.ok(actual.width < actual.height);
  }
});

test("Sunburst固定2K可接受适配后的大源图，透明画布与遮罩使用相同实际尺寸和位置", async () => {
  const normalized = await normalizeImageOutpaintInput({
    outpaintEngine: "gptImage25Sunburst", referenceImages: [await pngSource(1500, 1500)],
    outpaintCanvas: { ratio: "16:9", resolution: "2K", position: { x: 1, y: 0 } },
  });
  assert.deepEqual([normalized.width, normalized.height], [2048, 1152]);
  assert.equal(normalized.sourceResized, true);
  const { canvas, mask, placement } = await prepareOneApiOutpaintCanvas(normalized);
  assert.deepEqual(placement, { left: normalized.expansion.left, top: normalized.expansion.top, width: normalized.source.width, height: normalized.source.height });
  assert.equal(placement.left + placement.width, 2048);
  const actualCanvas = await sharp(canvas).metadata();
  assert.deepEqual([actualCanvas.width, actualCanvas.height], [2048, 1152]);
  const { data, info } = await sharp(mask).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const alphaAt = (x, y) => data[(y * info.width + x) * info.channels + 3];
  assert.equal(alphaAt(0, 0), 0);
  assert.equal(alphaAt(placement.left, placement.top), 255);
  assert.equal(alphaAt(placement.left + placement.width - 1, placement.top + placement.height - 1), 255);
});

test("服务端新合同拒绝非法目标，旧四边请求仍严格检查原整数和对齐边界", async () => {
  const referenceImages = [await pngSource(1000, 751)];
  for (const outpaintCanvas of [{ ratio: "Original", resolution: "2K" }, { ratio: "16:9", resolution: "8K" }, { ratio: "16:9", resolution: "2K", position: { x: 2, y: 0 } }]) {
    await assert.rejects(normalizeImageOutpaintInput({ referenceImages, outpaintCanvas }), (error) => error.statusCode === 400);
  }
  await assert.rejects(normalizeImageOutpaintInput({ referenceImages, expansion: { left: "8", right: 0, top: 0, bottom: 0 } }), /整数像素/);
  await assert.rejects(normalizeImageOutpaintInput({ referenceImages, expansion: { left: 5, right: 0, top: 0, bottom: 0 } }), /8px/);
  await assert.rejects(normalizeImageOutpaintInput({ referenceImages, expansion: { left: 8, right: 0, top: 0, bottom: 0 } }), (error) => error.statusCode === 400 && /2K/.test(error.message));
  const legacy = await normalizeImageOutpaintInput({ referenceImages, expansion: { left: 512, right: 512, top: 192, bottom: 192 } });
  assert.deepEqual([legacy.width, legacy.height], [2048, 1152]);
  assert.equal(legacy.source.imageUrl, referenceImages[0].dataUrl);
});

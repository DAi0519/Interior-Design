/**
 * [INPUT]: 依赖共享 outpaintCanvasPlan、扩图服务/公开双引擎合同与 sharp 生成的真实图片字节
 * [OUTPUT]: 对外提供比例/分辨率固定目标、原图适配/定位、非法参数400、EXIF后服务端重算与实际提交字节一致性回归保障
 * [POS]: test 的目标画布跨层合同测试，与旧 expansion 兼容测试并列，使用内存客户端不提交 GPU 或付费任务
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { outpaintCanvasPlan } from "../public/image-outpaint-geometry.js";
import { executeImageOutpaint, normalizeImageOutpaintInput, publicImageOutpaintConfig } from "../src/image-outpaint-service.mjs";
import { prepareOneApiOutpaintCanvas, publicOneApiOutpaintConfig } from "../src/image-outpaint-oneapi.mjs";

const comfy = publicImageOutpaintConfig({ available: true });
const sunburst = publicOneApiOutpaintConfig({ available: true });
const ratios = ["1:1", "4:3", "16:9", "3:4", "9:16"];
const resolutions = ["1K", "2K", "4K"];
const baseTargets = {
  "1:1": { width: 1024, height: 1024 },
  "4:3": { width: 1024, height: 768 },
  "16:9": { width: 1024, height: 576 },
  "3:4": { width: 768, height: 1024 },
  "9:16": { width: 576, height: 1024 },
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

test("Flux所有比例与1K/2K/4K按固定目标输出，源尺寸与构图位置不改变分辨率", () => {
  for (const ratio of ratios) {
    for (const [index, resolution] of resolutions.entries()) {
      const scale = 2 ** index;
      const target = { width: baseTargets[ratio].width * scale, height: baseTargets[ratio].height * scale };
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
  }
});

test("共享画布规划保留能放入的源图，只在必要时缩小并为同尺寸源图留出扩展空间", () => {
  const retained = outpaintCanvasPlan({ source: { width: 1000, height: 751 }, ratio: "16:9", resolution: "2K", limits: comfy });
  assert.equal(retained.resize, null);
  assert.deepEqual(retained.prepared, { width: 1024, height: 768 });
  assert.deepEqual(retained.expansion, { left: 512, top: 192, right: 512, bottom: 192 });
  const fitted = outpaintCanvasPlan({ source: { width: 4096, height: 3072 }, ratio: "16:9", resolution: "1K", limits: comfy });
  assert.ok(fitted.resize.width < 4096 && fitted.resize.height < 3072);
  assert.ok(Math.abs(fitted.resize.width / fitted.resize.height - 4 / 3) < 0.02);
  assertPlan(fitted);
  const sameSize = outpaintCanvasPlan({ source: { width: 1024, height: 1024 }, ratio: "1:1", resolution: "1K", limits: comfy });
  assert.ok(sameSize.resize.width <= 0.91 * 1024);
  assert.ok(sameSize.resize.height <= 0.91 * 1024);
  assert.ok(sameSize.expansion.left > 0 && sameSize.expansion.top > 0);
  assertPlan(sameSize);
  const sameRatio = outpaintCanvasPlan({ source: { width: 4096, height: 2304 }, ratio: "16:9", resolution: "1K", limits: comfy });
  assert.deepEqual(sameRatio.target, { width: 1024, height: 576 });
  assert.ok(sameRatio.prepared.width < sameRatio.target.width);
  assert.ok(sameRatio.prepared.height < sameRatio.target.height);
  assertPlan(sameRatio);
});

test("Sunburst画布严格映射公开比例/分辨率，适配大图也不自动升级用户档位", () => {
  for (const ratio of ratios) {
    for (const resolution of resolutions) {
      const expected = sunburst.targetSizes.find((entry) => entry.ratio === ratio && entry.resolution === resolution);
      const plan = outpaintCanvasPlan({ source: { width: 3000, height: 3000 }, ratio, resolution, limits: sunburst });
      assert.deepEqual(plan.target, { width: expected.width, height: expected.height });
      assert.equal(plan.target.width % 16, 0);
      assert.equal(plan.target.height % 16, 0);
      assertPlan(plan);
    }
  }
  const plan = outpaintCanvasPlan({ source: { width: 1000, height: 751 }, ratio: "16:9", resolution: "1K", limits: sunburst });
  assert.deepEqual(plan.target, { width: 1536, height: 864 });
  assert.deepEqual(plan.prepared, { width: 1000, height: 751 });
  assert.equal(plan.resize, null);
});

test("目标合同拒绝无效比例/档位/归一化位置/原图，所有错误保持400", () => {
  const valid = { source: { width: 1000, height: 751 }, ratio: "16:9", resolution: "2K", limits: comfy };
  for (const override of [
    { ratio: "original" }, { ratio: "2:1" }, { ratio: "" }, { ratio: null },
    { resolution: "8K" }, { resolution: "2k" }, { resolution: null },
    { position: { x: -0.01, y: 0.5 } }, { position: { x: 0.5, y: 1.01 } },
    { position: { x: NaN, y: 0.5 } }, { position: { x: "0.5", y: 0.5 } },
    { position: { x: 0.5 } }, { position: null },
    { source: { width: 31, height: 100 } }, { source: { width: 4097, height: 100 } },
    { source: { width: 100.5, height: 100 } }, { source: null },
  ]) {
    assert.throws(() => outpaintCanvasPlan({ ...valid, ...override }), (error) => error.statusCode === 400);
  }
  assert.throws(() => outpaintCanvasPlan({ ...valid, source: { width: 3841, height: 100 }, limits: sunburst }), (error) => error.statusCode === 400);
});

async function pngSource(width, height) {
  const bytes = await sharp({ create: { width, height, channels: 3, background: "#abc" } }).png().toBuffer();
  return { dataUrl: `data:image/png;base64,${bytes.toString("base64")}`, name: "room.png", width: 9999, height: 9999 };
}

test("服务端根据解码后的真实源图重算新合同，缩小后的尺寸与实际提交字节一致", async () => {
  const source = await pngSource(4096, 3072);
  const outpaintCanvas = { ratio: "16:9", resolution: "1K", position: { x: 0.2, y: 0.8 } };
  const expected = outpaintCanvasPlan({ source: { width: 4096, height: 3072 }, ...outpaintCanvas, limits: comfy });
  const normalized = await normalizeImageOutpaintInput({ referenceImages: [source], outpaintCanvas });
  assert.deepEqual(normalized.originalSource, { width: 4096, height: 3072 });
  assert.equal(normalized.sourceResized, true);
  assert.deepEqual(normalized.prepared, expected.prepared);
  assert.deepEqual(normalized.expansion, expected.expansion);
  assert.deepEqual([normalized.width, normalized.height], [1024, 576]);
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
    assert.deepEqual([request.width, request.height], [1024, 576]);
    return { images: [{ url: "data:image/png;base64,fixture" }], metadata: { outputWidth: request.width, outputHeight: request.height }, outputFormat: "png" };
  } } });
  assert.equal(calls, 1);
  assert.equal(result.request.size, "1024x576");
  assert.deepEqual(result.request.outpaintCanvas, outpaintCanvas);
});

test("EXIF旋转完成后才按用户目标与位置计算画布，客户端伪造宽高不参与规划", async () => {
  const png = await pngSource(1000, 751);
  const jpeg = await sharp(Buffer.from(png.dataUrl.split(",")[1], "base64")).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const outpaintCanvas = { ratio: "16:9", resolution: "1K", position: { x: 1, y: 0 } };
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

test("Sunburst小目标可接受适配后的大源图，透明画布与遮罩使用相同实际尺寸和位置", async () => {
  const normalized = await normalizeImageOutpaintInput({
    outpaintEngine: "gptImage25Sunburst", referenceImages: [await pngSource(1500, 1500)],
    outpaintCanvas: { ratio: "16:9", resolution: "1K", position: { x: 1, y: 0 } },
  });
  assert.deepEqual([normalized.width, normalized.height], [1536, 864]);
  assert.equal(normalized.sourceResized, true);
  const { canvas, mask, placement } = await prepareOneApiOutpaintCanvas(normalized);
  assert.deepEqual(placement, { left: normalized.expansion.left, top: normalized.expansion.top, width: normalized.source.width, height: normalized.source.height });
  assert.equal(placement.left + placement.width, 1536);
  const actualCanvas = await sharp(canvas).metadata();
  assert.deepEqual([actualCanvas.width, actualCanvas.height], [1536, 864]);
  const { data, info } = await sharp(mask).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const alphaAt = (x, y) => data[(y * info.width + x) * info.channels + 3];
  assert.equal(alphaAt(0, 0), 0);
  assert.equal(alphaAt(placement.left, placement.top), 255);
  assert.equal(alphaAt(placement.left + placement.width - 1, placement.top + placement.height - 1), 255);
});

test("服务端新合同拒绝非法目标，旧四边请求仍严格检查原整数和对齐边界", async () => {
  const referenceImages = [await pngSource(1000, 751)];
  for (const outpaintCanvas of [{ ratio: "original", resolution: "2K" }, { ratio: "16:9", resolution: "8K" }, { ratio: "16:9", resolution: "2K", position: { x: 2, y: 0 } }]) {
    await assert.rejects(normalizeImageOutpaintInput({ referenceImages, outpaintCanvas }), (error) => error.statusCode === 400);
  }
  await assert.rejects(normalizeImageOutpaintInput({ referenceImages, expansion: { left: "8", right: 0, top: 0, bottom: 0 } }), /整数像素/);
  await assert.rejects(normalizeImageOutpaintInput({ referenceImages, expansion: { left: 5, right: 0, top: 0, bottom: 0 } }), /8px/);
  const legacy = await normalizeImageOutpaintInput({ referenceImages, expansion: { left: 8, right: 0, top: 0, bottom: 0 } });
  assert.deepEqual([legacy.width, legacy.height], [1032, 768]);
});

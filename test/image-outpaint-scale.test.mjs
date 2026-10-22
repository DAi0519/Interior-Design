/**
 * [INPUT]: 依赖共享扩图缩放/画布合同、三引擎应用服务/归档与 sharp 真实图片字节
 * [OUTPUT]: 对外提供固定目标下等比缩放边界、真实放大缩小/EXIF字节、零扩展与非法缩放400及飞书归档保留缩放的回归保障
 * [POS]: test 的扩图缩放跨层验证，与旧自动适配合同并列，不调用网络、飞书或 GPU
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { outpaintCanvasPlan, outpaintScaleBounds } from "../public/image-outpaint-geometry.js";
import { executeImageOutpaint, normalizeImageOutpaintInput, publicImageOutpaintConfig } from "../src/image-outpaint-service.mjs";
import { publicOneApiOutpaintConfig, prepareOneApiOutpaintCanvas } from "../src/image-outpaint-oneapi.mjs";
import { publicQwenOutpaintConfig } from "../src/image-outpaint-qwen.mjs";

const engines = [
  { key: "comfyui", limits: publicImageOutpaintConfig({ available: true }) },
  { key: "qwenImageEdit2511", limits: publicQwenOutpaintConfig({ available: true }) },
  { key: "gptImage25Sunburst", limits: publicOneApiOutpaintConfig({ available: true }) },
];
const dimensions = { width: 768, height: 512 };
const base = { source: dimensions, ratio: "16:9", resolution: "2K" };
const position = { x: 0.2, y: 0.8 };
const decode = (url) => Buffer.from(url.split(",")[1], "base64");
const badRequest = (error) => error.statusCode === 400;

async function pngSource(width, height) {
  const bytes = await sharp({ create: { width, height, channels: 3, background: "#73a1c2" } }).png().toBuffer();
  return { dataUrl: `data:image/png;base64,${bytes.toString("base64")}`, name: "room.png", width: 9999, height: 9999 };
}

function assertInside(plan) {
  const { target, prepared, expansion } = plan;
  assert.equal(prepared.width + expansion.left + expansion.right, target.width);
  assert.equal(prepared.height + expansion.top + expansion.bottom, target.height);
  assert.ok(Object.values(expansion).every((value) => Number.isSafeInteger(value) && value >= 0));
  assert.ok(prepared.width <= target.width && prepared.height <= target.height);
}

test("三引擎的1.5/2/3倍只改变原图占比，五种画幅与2K目标始终固定", () => {
  for (const { key, limits } of engines) {
    for (const ratio of ["1:1", "4:3", "16:9", "3:4", "9:16"]) {
      const selection = { ...base, ratio, limits, position };
      assert.deepEqual(outpaintScaleBounds(selection), { min: 1 / 3, max: 1 });
      const plans = [1 / 3, 1 / 2, 2 / 3, 1].map((scale) => outpaintCanvasPlan({ ...selection, scale }));
      for (const plan of plans) {
        assertInside(plan);
        assert.deepEqual(plan.target, plans[0].target, key);
        assert.equal(plan.scale >= 1 / 3 && plan.scale <= 1, true);
        assert.ok(plan.prepared.width >= 32 && plan.prepared.height >= 32);
      }
      for (let index = 1; index < plans.length; index += 1) {
        assert.ok(plans[index].prepared.width >= plans[index - 1].prepared.width);
        assert.ok(plans[index].prepared.height >= plans[index - 1].prepared.height);
      }
    }
  }
  const qwen = engines[1].limits;
  assert.deepEqual(outpaintCanvasPlan({ ...base, limits: qwen, scale: 2 / 3 }).resize, { width: 1152, height: 768 });
});

test("极端长宽比提高缩小下限，无法保留32px短边的图直接400", () => {
  for (const { limits } of engines) {
    const selection = { source: { width: 2048, height: 64 }, ratio: "16:9", resolution: "2K", limits };
    const bounds = outpaintScaleBounds(selection);
    assert.ok(bounds.min >= 1 / 3 && bounds.min <= 1);
    const minimum = outpaintCanvasPlan({ ...selection, scale: bounds.min });
    assert.ok((minimum.resize?.height ?? 64) >= 32);
    assertInside(minimum);
    if (bounds.min > 1 / 3) assert.throws(() => outpaintCanvasPlan({ ...selection, scale: bounds.min - 0.001 }), badRequest);
    assert.throws(() => outpaintScaleBounds({ ...selection, source: { width: 3840, height: 32 }, ratio: "9:16" }), badRequest);
  }
  const bounds = outpaintScaleBounds({ source: { width: 2048, height: 64 }, ratio: "16:9", resolution: "2K", limits: engines[1].limits });
  assert.deepEqual(bounds, { min: 0.5, max: 1 });
});

test("缩放非法值和越过动态下限均400，省略scale继续遵循旧自动适配", async () => {
  const referenceImages = [await pngSource(768, 512)];
  for (const scale of [null, "0.5", NaN, Infinity, -1, 0, 1 / 3 - 0.00001, 1.00001]) {
    assert.throws(() => outpaintCanvasPlan({ ...base, scale }), badRequest);
    await assert.rejects(normalizeImageOutpaintInput({ referenceImages, outpaintCanvas: { ratio: "16:9", resolution: "2K", scale } }), badRequest);
  }
  const legacy = await normalizeImageOutpaintInput({ referenceImages, outpaintCanvas: { ratio: "16:9", resolution: "2K" } });
  assert.equal(legacy.sourceResized, false);
  assert.equal(Object.hasOwn(legacy.outpaintCanvas, "scale"), false);
  assert.equal(legacy.source.imageUrl, referenceImages[0].dataUrl);
});

test("显式最大值可预览铺满，实际生成在零GPU调用前阻断零扩展", async () => {
  let gpuCalls = 0;
  const referenceImages = [await pngSource(768, 768)];
  for (const { key, limits } of engines) {
    const canvas = { ratio: "1:1", resolution: "2K", scale: 1 };
    const preview = outpaintCanvasPlan({ source: { width: 768, height: 768 }, ...canvas, limits });
    assert.deepEqual(preview.expansion, { left: 0, top: 0, right: 0, bottom: 0 });
    const input = { outpaintEngine: key, referenceImages, outpaintCanvas: canvas };
    await assert.rejects(executeImageOutpaint(input, { imageClient: {
      async generateImage() { gpuCalls += 1; }, async editImage() { gpuCalls += 1; },
    } }), (error) => badRequest(error) && /缩小原图/.test(error.message));
  }
  assert.equal(gpuCalls, 0);
  const valid = await normalizeImageOutpaintInput({ outpaintEngine: "qwenImageEdit2511", referenceImages,
    outpaintCanvas: { ratio: "16:9", resolution: "2K", scale: 1 } });
  assert.ok(valid.expansion.left + valid.expansion.right > 0);
});

test("三引擎实际提交字节随缩放放大或缩小，尺寸与预览计划/固定目标闭合", async () => {
  for (const { key, limits } of engines) {
    for (const [width, height, resolution, scale] of [[384, 256, "2K", 2 / 3], [3000, 2000, "2K", 1 / 3], [768, 512, "2K", 1 / 2]]) {
      const original = { width, height };
      const canvas = { ratio: "16:9", resolution, scale, position };
      const expected = outpaintCanvasPlan({ source: original, ...canvas, limits });
      const normalized = await normalizeImageOutpaintInput({ outpaintEngine: key, referenceImages: [await pngSource(width, height)], outpaintCanvas: canvas });
      const payload = decode(normalized.source.imageUrl);
      const actual = await sharp(payload).metadata();
      assert.deepEqual([actual.width, actual.height], [expected.resize.width, expected.resize.height], key);
      assert.deepEqual([normalized.source.width, normalized.source.height, normalized.source.size], [actual.width, actual.height, payload.length]);
      assert.deepEqual(normalized.originalSource, original);
      assert.deepEqual(normalized.prepared, expected.prepared);
      assert.deepEqual(normalized.expansion, expected.expansion);
      assert.deepEqual([normalized.width, normalized.height], [expected.target.width, expected.target.height]);
      assert.deepEqual(normalized.outpaintCanvas, canvas);
      assert.equal(normalized.sourceResized, true);
      assert.ok(Math.abs(actual.width / actual.height - width / height) <= 1 / actual.height);
      if (width === 384) assert.ok(actual.width > width && actual.height > height);
      if (width === 3000) assert.ok(actual.width < width && actual.height < height);
      if (key === "gptImage25Sunburst") {
        const prepared = await prepareOneApiOutpaintCanvas(normalized);
        assert.deepEqual(prepared.placement, { left: normalized.expansion.left, top: normalized.expansion.top, width: actual.width, height: actual.height });
        const mask = await sharp(prepared.mask).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        const alphaAt = (x, y) => mask.data[(y * mask.info.width + x) * mask.info.channels + 3];
        assert.equal(alphaAt(prepared.placement.left, prepared.placement.top), 255);
        assert.equal(alphaAt(0, 0), 0);
      }
    }
  }
});

test("EXIF旋转后再等比缩放，用户伪造尺寸不影响原始方向/归档输入", async () => {
  const source = await pngSource(768, 512);
  const jpeg = await sharp(decode(source.dataUrl)).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const canvas = { ratio: "9:16", resolution: "2K", scale: 1 / 2, position: { x: 1, y: 0 } };
  for (const { key, limits } of engines) {
    const original = { width: 512, height: 768 };
    const expected = outpaintCanvasPlan({ source: original, ...canvas, limits });
    const normalized = await normalizeImageOutpaintInput({ outpaintEngine: key, outpaintCanvas: canvas,
      referenceImages: [{ dataUrl: `data:image/jpeg;base64,${jpeg.toString("base64")}`, name: "phone.jpg", width: 111, height: 9999 }] });
    const actual = await sharp(decode(normalized.source.imageUrl)).metadata();
    assert.deepEqual(normalized.originalSource, original);
    assert.deepEqual([actual.width, actual.height], [expected.resize.width, expected.resize.height]);
    assert.equal(actual.orientation, undefined);
    assert.equal(actual.format, "png");
    assert.equal(normalized.expansion.right, 0);
    assert.equal(normalized.expansion.top, 0);
    assert.equal(normalized.outpaintCanvas.scale, 1 / 2);
  }
});

test("缩放任务提交真实放大后原图且归档保留scale和来源尺寸，无需新飞书字段", async () => {
  const referenceImages = [await pngSource(384, 256)];
  const outpaintCanvas = { ratio: "16:9", resolution: "2K", scale: 2 / 3, position };
  let actualRequest, archive, syncCalls = 0;
  const result = await executeImageOutpaint({ outpaintEngine: "qwenImageEdit2511", referenceImages, outpaintCanvas }, {
    imageClient: { async generateImage(request) {
      actualRequest = request;
      const actual = await sharp(decode(request.images[0].image_url)).metadata();
      assert.deepEqual([actual.width, actual.height], [1152, 768]);
      assert.deepEqual([request.sourceWidth, request.sourceHeight], [actual.width, actual.height]);
      return { images: [{ url: "data:image/png;base64,fixture" }], outputFormat: "png",
        metadata: { outputWidth: 2048, outputHeight: 1152, seed: 1 } };
    } },
    scheduleSync(payload) { archive = payload; syncCalls += 1; return { status: "pending", generationId: "scaled-output" }; },
  });
  assert.equal(syncCalls, 1);
  assert.equal(result.sync.generationId, "scaled-output");
  assert.deepEqual(result.request.outpaintCanvas, outpaintCanvas);
  assert.deepEqual(archive.workflow.outpaintCanvas, outpaintCanvas);
  assert.deepEqual([archive.workflow.originalSourceWidth, archive.workflow.originalSourceHeight], [384, 256]);
  assert.deepEqual([archive.workflow.sourceWidth, archive.workflow.sourceHeight], [1152, 768]);
  assert.equal(archive.workflow.sourceResized, true);
  assert.equal(archive.referenceImages[0].imageUrl, actualRequest.images[0].image_url);
  assert.equal(archive.preview.size, "2048x1152");
});

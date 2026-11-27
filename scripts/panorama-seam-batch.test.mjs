/**
 * [INPUT]: 依赖 node:test、sharp、全景遮罩工具及可注入网关的批处理入口
 * [OUTPUT]: 验证蒙版和旧版合成工具、模型 RGBA 回包直接逆移、罩外差异审计、批次续跑和更换修缝提示词
 * [POS]: scripts 的全景修缝回归测试，使用模拟回包及临时目录
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import sharp from "sharp";
import {
  applyCenteredMask,
  prepareCenteredMask,
  rollHalfPanorama,
} from "./panorama-seam-mask.mjs";

function rgbPanorama(width, height, pixel) {
  const bytes = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixel(x, y);
      const i = (y * width + x) * 3;
      bytes[i] = r;
      bytes[i + 1] = g;
      bytes[i + 2] = b;
    }
  }
  return bytes;
}

const rgbOffset = (width, x, y) => (y * width + x) * 3;
const pixelAt = (bytes, width, x, y) => {
  const i = rgbOffset(width, x, y);
  return bytes.subarray(i, i + 3);
};

test("半幅循环平移把首尾缝移到中央，再移半幅逐像素回原位", () => {
  const width = 12;
  const height = 6;
  const source = rgbPanorama(width, height, (x, y) => [x, y, x + y * width]);
  const initial = Buffer.from(source);
  const centered = rollHalfPanorama(source, width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      assert.deepEqual(pixelAt(centered, width, x, y), pixelAt(source, width, (x + width / 2) % width, y));
    }
  }
  assert.deepEqual(rollHalfPanorama(centered, width, height), source);
  assert.deepEqual(source, initial);
});

test("中央窄条的 RGBA 遮罩原尺寸、整高透明、外侧全不透明", async () => {
  const width = 1536;
  const height = 768;
  const bandWidth = 96;
  const plan = await prepareCenteredMask(width, height, bandWidth);
  assert.equal(plan.left, width / 2 - bandWidth / 2);
  assert.equal(plan.right, width / 2 + bandWidth / 2);
  assert.equal(plan.editablePixels, bandWidth * height);
  assert.ok(plan.featherPx > 0 && plan.featherPx < bandWidth / 2);

  const image = sharp(plan.maskPng);
  const metadata = await image.metadata();
  assert.equal(metadata.format, "png");
  assert.equal(metadata.hasAlpha, true);
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  assert.deepEqual([info.width, info.height, info.channels], [width, height, 4]);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const expectedAlpha = x >= plan.left && x < plan.right ? 0 : 255;
      assert.equal(data[(y * width + x) * 4 + 3], expectedAlpha);
    }
  }
});

test("整张模型回包均变化时只在窄条羽化回贴，逆移后对面经度像素与输入一致", async () => {
  const width = 1536;
  const height = 768;
  const source = rgbPanorama(width, height, (x, y) => [12 + x % 21, 24 + y % 17, 40 + (x + y) % 16]);
  const centered = rollHalfPanorama(source, width, height);
  const initial = Buffer.from(centered);
  const model = rgbPanorama(width, height, (x, y) => [231, 120 + x % 15, 222 - y % 16]);
  const edited = await sharp(model, { raw: { width, height, channels: 3 } }).png().toBuffer();
  const plan = await prepareCenteredMask(width, height, 96);
  const { pixels, changedPixels, outsideMaskPixelIdentical } = await applyCenteredMask(centered, width, height, plan, edited);

  assert.equal(outsideMaskPixelIdentical, true);
  assert.equal(pixels.length, centered.length);
  assert.deepEqual(centered, initial);
  for (let y = 0; y < height; y++) {
    const rowStart = rgbOffset(width, 0, y);
    const left = rgbOffset(width, plan.left, y);
    const right = rgbOffset(width, plan.right, y);
    const rowEnd = rgbOffset(width, 0, y + 1);
    assert.ok(pixels.subarray(rowStart, left).equals(centered.subarray(rowStart, left)));
    assert.ok(pixels.subarray(right, rowEnd).equals(centered.subarray(right, rowEnd)));
    for (const x of [width / 2 - 1, width / 2]) {
      assert.deepEqual(pixelAt(pixels, width, x, y), pixelAt(model, width, x, y));
    }
  }

  const y = Math.floor(height / 2);
  const insideFeather = Array.from({ length: plan.featherPx }, (_, i) => plan.left + i);
  assert.ok(insideFeather.some(x => {
    const i = rgbOffset(width, x, y);
    return pixels[i] > centered[i] && pixels[i] < model[i];
  }), "罩内边缘应平滑混合原图和回包");

  let observedChanges = 0;
  for (let i = 0; i < pixels.length; i += 3) {
    if (pixels[i] !== centered[i] || pixels[i + 1] !== centered[i + 1] || pixels[i + 2] !== centered[i + 2]) observedChanges++;
  }
  assert.ok(observedChanges > 0 && observedChanges <= plan.editablePixels);
  assert.equal(changedPixels, observedChanges);

  const restored = rollHalfPanorama(pixels, width, height);
  const unaffectedLeft = plan.right - width / 2;
  const unaffectedRight = plan.left + width / 2;
  for (let row = 0; row < height; row++) {
    const from = rgbOffset(width, unaffectedLeft, row);
    const to = rgbOffset(width, unaffectedRight, row);
    assert.ok(restored.subarray(from, to).equals(source.subarray(from, to)));
    assert.deepEqual(pixelAt(restored, width, 0, row), pixelAt(model, width, width / 2, row));
    assert.deepEqual(pixelAt(restored, width, width - 1, row), pixelAt(model, width, width / 2 - 1, row));
  }
});

test("拒绝非 2:1、无效原图像素长度和尺寸不匹配的回包", async () => {
  assert.throws(() => rollHalfPanorama(Buffer.alloc(12 * 5 * 3), 12, 5));
  assert.throws(() => rollHalfPanorama(Buffer.alloc(12 * 6 * 3 - 1), 12, 6));
  await assert.rejects(() => prepareCenteredMask(1536, 769, 96));

  const width = 1536;
  const height = 768;
  const source = Buffer.alloc(width * height * 3, 63);
  const plan = await prepareCenteredMask(width, height, 96);
  const wrongSize = await sharp({ create: { width: width - 16, height, channels: 3, background: "#eeeeee" } })
    .png().toBuffer();
  await assert.rejects(() => applyCenteredMask(source, width, height, plan, wrongSize));
  assert.ok(source.every(value => value === 63));
});

test("模型回包 alpha 参与罩内合成，完全透明处保留原像素", async () => {
  const width = 80;
  const height = 40;
  const source = Buffer.alloc(width * height * 3, 38);
  const plan = await prepareCenteredMask(width, height, 16);
  const model = Buffer.alloc(width * height * 4, 214);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      model[(y * width + x) * 4 + 3] = x === width / 2 ? 0 : 128;
    }
  }
  const edited = await sharp(model, { raw: { width, height, channels: 4 } }).png().toBuffer();
  const { pixels, outsideMaskPixelIdentical } = await applyCenteredMask(source, width, height, plan, edited);
  const row = height / 2;
  const blended = Math.round(38 * (127 / 255) + 214 * (128 / 255));
  assert.deepEqual(pixelAt(pixels, width, width / 2, row), Buffer.from([38, 38, 38]));
  assert.deepEqual(pixelAt(pixels, width, width / 2 - 1, row), Buffer.from([blended, blended, blended]));
  assert.ok(pixelAt(pixels, width, plan.left + 1, row)[0] > 38);
  assert.ok(pixelAt(pixels, width, plan.left + 1, row)[0] < blended);
  assert.deepEqual(pixelAt(pixels, width, plan.left - 1, row), Buffer.from([38, 38, 38]));
  assert.equal(outsideMaskPixelIdentical, true);
});

test("清单批流程逐图先优化再整图遮罩，直接逆移模型回包并能续跑复用两阶段", async t => {
  const { runPanoramaSeamBatch } = await import("./panorama-seam-batch.mjs");
  const folder = await mkdtemp(join(tmpdir(), "panorama-seam-batch-test-"));
  t.after(() => rm(folder, { recursive: true, force: true }));

  const width = 2880;
  const height = 1440;
  const bandWidth = 128;
  const png = (bytes, w, h) => sharp(bytes, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
  const fromImageUrl = url => {
    assert.match(url, /^data:image\/png;base64,/);
    return Buffer.from(url.slice(url.indexOf(",") + 1), "base64");
  };
  const reply = (bytes, requestId) => ({
    requestId,
    images: [{ url: `data:image/png;base64,${bytes.toString("base64")}` }],
  });
  const files = [
    { name: "一号全景", path: "first.png", width: 64, height: 32, shade: 27 },
    { name: "无效方图", path: "square.png", width: 32, height: 32, shade: 48 },
    { name: "二号全景", path: "second.png", width: 96, height: 48, shade: 75 },
  ];
  const inputs = await Promise.all(files.map(async file => {
    const bytes = await png(Buffer.alloc(file.width * file.height * 3, file.shade), file.width, file.height);
    await writeFile(join(folder, file.path), bytes);
    return bytes;
  }));
  const manifest = join(folder, "inputs.json");
  await writeFile(manifest, JSON.stringify(files.map(({ name, path }) => ({ name, path }))));

  const mockOptimized = await Promise.all([0, 1].map(async number => {
    const pixels = rgbPanorama(width, height, (x, y) => [
      (x < width / 2 ? 30 : 90) + number * 11, 40 + y % 23, 65 + x % 29,
    ]);
    return { pixels, bytes: await png(pixels, width, height) };
  }));
  const editedPixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      editedPixels[offset] = 200 + x % 37;
      editedPixels[offset + 1] = (x < width / 2 ? 110 : 200) + x % 17;
      editedPixels[offset + 2] = 178 + y % 19;
      editedPixels[offset + 3] = x < width / 2 ? 128 : x === width / 2 ? 0 : 255;
    }
  }
  const allEdited = await sharp(editedPixels, { raw: { width, height, channels: 4 } }).png().toBuffer();
  const stages = [];
  let loadedPrompts = 0;
  const optimizePrompt = "Keep the panoramic composition. Match exposure and material.";
  const values = {
    manifest,
    output: join(folder, "results"),
    optimizer: "seedream55",
    "mask-width": String(bandWidth),
    "max-new-requests": "4",
  };
  const dependencies = {
    loadPrompt: async () => {
      loadedPrompts++;
      return { code: "test-prompt", version: "test-v1", prompt: optimizePrompt };
    },
    createClient: () => ({
      listModels: async () => [{ id: "doubao-seedream-5.5" }, { id: "gpt-image-2.6-sunburst" }],
      generateImage: async request => {
        const index = stages.length / 2;
        stages.push(`整图优化 ${index}`);
        assert.equal(request.model, "doubao-seedream-5.5");
        assert.equal(request.size, "2880x1440");
        assert.equal(request.prompt, optimizePrompt);
        assert.equal(request.images.length, 1);
        assert.deepEqual(fromImageUrl(request.images[0].image_url), inputs[index * 2]);
        return reply(mockOptimized[index].bytes, `optimize-${index}`);
      },
      editImage: async request => {
        const index = (stages.length - 1) / 2;
        stages.push(`中央遮罩 ${index}`);
        assert.equal(request.model, "gpt-image-2.6-sunburst");
        assert.equal(request.size, "2880x1440");
        assert.equal(request.quality, "medium");
        assert.equal(request.images.length, 1);
        const centered = await sharp(fromImageUrl(request.images[0].image_url)).raw().toBuffer();
        assert.deepEqual(centered, rollHalfPanorama(mockOptimized[index].pixels, width, height));
        const { data: alpha, info } = await sharp(fromImageUrl(request.mask.image_url)).extractChannel("alpha")
          .raw().toBuffer({ resolveWithObject: true });
        assert.deepEqual([info.width, info.height, info.channels], [width, height, 1]);
        const halfBand = bandWidth / 2;
        for (const row of [0, height / 2, height - 1]) {
          const stripe = alpha.subarray(row * width, (row + 1) * width);
          assert.ok(stripe.subarray(0, width / 2 - halfBand).every(value => value === 255));
          assert.ok(stripe.subarray(width / 2 - halfBand, width / 2 + halfBand).every(value => value === 0));
          assert.ok(stripe.subarray(width / 2 + halfBand).every(value => value === 255));
        }
        return reply(allEdited, `edit-${index}`);
      },
    }),
  };

  const initial = await runPanoramaSeamBatch(values, dependencies);
  assert.equal(loadedPrompts, 1);
  assert.equal(initial.freshCalls, 4);
  assert.deepEqual(stages, ["整图优化 0", "中央遮罩 0", "整图优化 1", "中央遮罩 1"]);
  assert.deepEqual(initial.results.map(row => [row.name, row.phase]), [
    [files[0].name, "completed"], [files[1].name, "input"], [files[2].name, "completed"],
  ]);
  assert.match(initial.results[1].detail, /2:1/);
  assert.equal(initial.results[1].audit, undefined);

  async function checkOutput(result) {
    const outsidePixels = (width - bandWidth) * height;
    assert.equal(result.audit.changedPixels, width * height);
    assert.equal(result.audit.changedWithinMask, bandWidth * height);
    assert.equal(result.audit.outsideMaskPixelIdentical, false);
    assert.deepEqual(result.audit.outsideMask, {
      pixels: outsidePixels,
      changedRgbPixels: outsidePixels,
      changedAlphaPixels: outsidePixels / 2,
    });
    assert.deepEqual(result.audit.modelTransparency, {
      transparentPixels: height,
      partialPixels: width * height / 2,
    });
    const file = join(values.output, result.job, result.repair, "final.png");
    const { data, info } = await sharp(await readFile(file)).raw().toBuffer({ resolveWithObject: true });
    assert.deepEqual([info.width, info.height, info.channels], [width, height, 4]);
    for (let y = 0; y < height; y++) {
      const start = y * width * 4;
      const center = start + width * 2;
      const end = start + width * 4;
      assert.ok(data.subarray(start, center).equals(editedPixels.subarray(center, end)));
      assert.ok(data.subarray(center, end).equals(editedPixels.subarray(start, center)));
    }
  }
  const successful = initial.results.filter(result => result.audit);
  assert.equal(successful.length, 2);
  await Promise.all(successful.map(checkOutput));

  let unexpectedCalls = 0;
  const noCall = () => {
    unexpectedCalls++;
    throw new Error("已完成批次不应访问模型或重新获取提示词");
  };
  const resumed = await runPanoramaSeamBatch({ ...values, "max-new-requests": "0" }, {
    createClient: noCall, loadPrompt: noCall,
  });
  assert.equal(unexpectedCalls, 0);
  assert.equal(resumed.freshCalls, 0);
  const reused = resumed.results.filter(result => result.audit);
  assert.equal(reused.length, 2);
  assert.deepEqual(reused.map(row => [row.optimizeReused, row.repairReused]), [[true, true], [true, true]]);
  assert.deepEqual(reused.map(row => row.audit.finalSha256), successful.map(row => row.audit.finalSha256));
  assert.equal(resumed.results[1].phase, "input");

  const editedWords = "Match brightness and texture only where a visible seam interrupts the same surface.";
  const repairPrompt = join(folder, "repair-v2.txt");
  await writeFile(repairPrompt, editedWords + "\n");
  let variantEdits = 0;
  const changedPrompt = await runPanoramaSeamBatch({ ...values, "repair-prompt": repairPrompt, "max-new-requests": "2" }, {
    loadPrompt: noCall,
    createClient: () => ({
      listModels: async () => [{ id: "gpt-image-2.6-sunburst" }],
      generateImage: noCall,
      editImage: async request => {
        assert.equal(request.prompt, editedWords);
        const index = variantEdits++;
        const centered = await sharp(fromImageUrl(request.images[0].image_url)).raw().toBuffer();
        assert.deepEqual(centered, rollHalfPanorama(mockOptimized[index].pixels, width, height));
        return reply(allEdited, `prompt-variant-${index}`);
      },
    }),
  });
  assert.equal(unexpectedCalls, 0);
  assert.equal(variantEdits, 2);
  assert.equal(changedPrompt.freshCalls, 2);
  assert.notEqual(changedPrompt.repairPromptSha256, initial.repairPromptSha256);
  const variants = changedPrompt.results.filter(result => result.audit);
  assert.equal(variants.length, 2);
  for (const [i, variant] of variants.entries()) {
    assert.equal(variant.job, successful[i].job);
    assert.equal(variant.optimizeReused, true);
    assert.notEqual(variant.repair, successful[i].repair);
    assert.equal(variant.mask.centeredSha256, successful[i].mask.centeredSha256);
    assert.equal(variant.mask.maskSha256, successful[i].mask.maskSha256);
  }
  await Promise.all(variants.map(checkOutput));
});

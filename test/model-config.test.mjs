/**
 * [INPUT]: 依赖 node:test/assert 与 src/model-config.mjs 的模型目录和请求构造器
 * [OUTPUT]: 对外提供模型 ID、尺寸映射、模型专属参数和非法组合的回归保障
 * [POS]: test 的模型参数契约测试，不触发任何真实图片生成或公司额度消耗
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  MODEL_CONFIGS,
  createGenerationRequest,
  publicModelCatalog,
} from "../src/model-config.mjs";

test("目录只暴露目标四个模型和真实模型 ID", () => {
  assert.deepEqual(
    publicModelCatalog().map(({ id, key }) => ({ id, key })),
    [
      { id: "gemini-3-pro-image", key: "bananaPro" },
      { id: "gemini-3.1-flash-image-preview", key: "banana2" },
      { id: "gpt-image-2", key: "gptImage2" },
      { id: "doubao-seedream-5.0", key: "seedream5" },
    ],
  );
});

test("Banana Pro 4:3 2K 映射为公司文档精确尺寸", () => {
  const generation = createGenerationRequest({
    modelKey: "bananaPro",
    outputFormat: "png",
    prompt: "现代简约客厅，柔和自然光",
    ratio: "4:3",
    resolution: "2K",
  });
  assert.equal(generation.request.size, "2400x1792");
  assert.equal(generation.request.model, "gemini-3-pro-image");
  assert.equal("quality" in generation.request, false);
});

test("Banana 2 使用公司文档的 512 到 4K 极端画幅矩阵", () => {
  const generation = createGenerationRequest({
    modelKey: "banana2",
    outputFormat: "jpeg",
    prompt: "横向超宽室内空间概念图",
    ratio: "8:1",
    resolution: "512",
  });
  assert.equal(generation.request.model, "gemini-3.1-flash-image-preview");
  assert.equal(generation.request.size, "1536x192");
  assert.equal(generation.request.output_format, "jpeg");
  assert.deepEqual(Object.keys(MODEL_CONFIGS.banana2.sizes["1:1"]), [
    "512",
    "1K",
    "2K",
    "4K",
  ]);
});

test("GPT Image 2 保留质量参数与 WebP", () => {
  const generation = createGenerationRequest({
    modelKey: "gptImage2",
    outputFormat: "webp",
    prompt: "现代简约客厅，柔和自然光",
    quality: "high",
    ratio: "16:9",
    resolution: "4K",
  });
  assert.equal(generation.request.size, "3840x2160");
  assert.equal(generation.request.quality, "high");
  assert.equal(generation.request.output_format, "webp");
});

test("多张参考图转换为公司接口的 images[].image_url", () => {
  const pngDataUrl =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z7JkAAAAASUVORK5CYII=";
  const bytes = Buffer.from(pngDataUrl.split(",")[1], "base64").length;
  const generation = createGenerationRequest({
    modelKey: "bananaPro",
    outputFormat: "png",
    prompt: "保持参考图布局，改为现代简约风格",
    ratio: "4:3",
    referenceImages: [
      {
        dataUrl: pngDataUrl,
        name: "reference-a.png",
        size: bytes,
        type: "image/png",
      },
      {
        dataUrl: pngDataUrl,
        name: "reference-b.png",
        size: bytes,
        type: "image/png",
      },
    ],
    resolution: "2K",
  });

  assert.deepEqual(
    generation.request.images.map((image) => image.image_url),
    [pngDataUrl, pngDataUrl],
  );
  assert.equal(generation.preview.referenceImageCount, 2);
  assert.deepEqual(
    generation.preview.referenceImages.map((image) => image.fileName),
    ["reference-a.png", "reference-b.png"],
  );
});

test("Seedream 5.0 不暴露 1K，并保持横竖比例一致", () => {
  assert.deepEqual(Object.keys(MODEL_CONFIGS.seedream5.sizes["1:1"]), [
    "2K",
    "3K",
    "4K",
  ]);
  assert.equal(MODEL_CONFIGS.seedream5.sizes["3:2"]["4K"], "4992x3328");
  assert.equal(MODEL_CONFIGS.seedream5.sizes["2:3"]["4K"], "3328x4992");
});

test("拒绝模型不支持的参数组合", () => {
  assert.throws(
    () =>
      createGenerationRequest({
        modelKey: "seedream5",
        outputFormat: "webp",
        prompt: "现代简约客厅，柔和自然光",
        ratio: "1:1",
        resolution: "1K",
      }),
    /不支持这个分辨率档位/,
  );
});

test("拒绝空提示词与未知模型", () => {
  assert.throws(
    () =>
      createGenerationRequest({
        modelKey: "bananaPro",
        outputFormat: "png",
        prompt: " ",
        ratio: "1:1",
        resolution: "1K",
      }),
    /提示词长度/,
  );
  assert.throws(
    () =>
      createGenerationRequest({
        modelKey: "unknown",
        outputFormat: "png",
        prompt: "有效提示词",
        ratio: "1:1",
        resolution: "1K",
      }),
    /不支持的模型/,
  );
});

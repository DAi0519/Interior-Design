/**
 * [INPUT]: 依赖 node:test/assert、src/model-config.mjs 的模型目录和请求构造器，以及浏览器出图模型目录解释器
 * [OUTPUT]: 对外提供模型 ID、目录漏报不锁死选项、合法尺寸映射、四模型及自由生图首张参考图最近比例、模型专属参数和非法组合的回归保障
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
import {
  describeFinalModelOption,
  finalModelCatalogStatus,
} from "../public/final-model-availability.js";

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

test("出图模型未被模型目录返回时仍允许真实请求尝试", () => {
  assert.deepEqual(
    describeFinalModelOption({ label: "GPT Image 2" }, false),
    {
      label: "GPT Image 2 · 目录未返回，可尝试",
      selectable: true,
    },
  );
  assert.equal(
    finalModelCatalogStatus([
      { available: false },
      { available: false },
      { available: false },
      { available: true },
    ]),
    "4 个可选 · 1 个目录可见",
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

test("白模在模型合法集合中选择最接近原图的比例", () => {
  const generation = createGenerationRequest(
    {
      modelKey: "bananaPro",
      outputFormat: "png",
      prompt: "保持白模构图，只映射材质与灯光",
      ratio: "4:3",
      resolution: "2K",
    },
    {
      preferSourceAspect: true,
      sourceDimensions: { height: 900, width: 1600 },
    },
  );

  assert.equal(generation.request.size, "2752x1536");
  assert.equal(generation.preview.ratio, "16:9");
  assert.equal(generation.preview.resolution, "2K");
  assert.equal(generation.preview.sizeMode, "source-nearest");
});

test("自由生图按首张参考图可信宽高选择最近合法比例", () => {
  const wideJpeg = Buffer.from([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x02,
    0xff, 0xc0, 0x00, 0x0b, 0x08,
    0x04, 0x38,
    0x07, 0x80,
    0x01, 0x01, 0x11, 0x00,
    0xff, 0xd9,
  ]);
  const squarePng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z7JkAAAAASUVORK5CYII=",
    "base64",
  );
  const generation = createGenerationRequest(
    {
      modelKey: "gptImage2",
      outputFormat: "png",
      prompt: "保持首张参考图构图，生成现代住宅客厅",
      ratio: "1:1",
      referenceImages: [
        {
          dataUrl: `data:image/jpeg;base64,${wideJpeg.toString("base64")}`,
          name: "wide-reference.jpg",
          size: wideJpeg.length,
          type: "image/jpeg",
        },
        {
          dataUrl: `data:image/png;base64,${squarePng.toString("base64")}`,
          name: "square-reference.png",
          size: squarePng.length,
          type: "image/png",
        },
      ],
      resolution: "2K",
    },
    { preferSourceAspect: true },
  );

  assert.equal(generation.preview.ratio, "16:9");
  assert.equal(generation.request.size, "2048x1152");
  assert.equal(generation.preview.referenceImageCount, 2);
  assert.equal(generation.preview.sizeMode, "source-nearest");
});

test("四个模型统一适配合法比例并拒绝缺失原图尺寸", () => {
  const gptGeneration = createGenerationRequest(
    {
      modelKey: "gptImage2",
      outputFormat: "png",
      prompt: "保持白模构图，只映射材质与灯光",
      ratio: "4:3",
      resolution: "2K",
    },
    {
      preferSourceAspect: true,
      sourceDimensions: { height: 900, width: 1600 },
    },
  );
  assert.equal(gptGeneration.preview.ratio, "16:9");
  assert.equal(gptGeneration.request.size, "2048x1152");

  assert.throws(
    () =>
      createGenerationRequest(
        {
          modelKey: "bananaPro",
          outputFormat: "png",
          prompt: "保持白模构图，只映射材质与灯光",
          ratio: "4:3",
          resolution: "2K",
        },
        { preferSourceAspect: true },
      ),
    /无法读取参考图画幅比例/,
  );
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

test("GPT Image 2 未指定质量时默认使用中等质量", () => {
  const generation = createGenerationRequest({
    modelKey: "gptImage2",
    outputFormat: "png",
    prompt: "现代简约客厅，柔和自然光",
    ratio: "4:3",
    resolution: "2K",
  });

  assert.equal(MODEL_CONFIGS.gptImage2.defaultQuality, "medium");
  assert.equal(generation.request.quality, "medium");
  assert.equal(generation.preview.quality, "medium");
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

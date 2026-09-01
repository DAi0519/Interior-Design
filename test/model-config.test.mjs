/**
 * [INPUT]: 依赖 node:test/assert、src/model-config.mjs 请求构造器，以及浏览器出图模型目录与 Provider 能力解释器
 * [OUTPUT]: 对外提供三个 OneAPI 模型与一个默认 9B FP8/7 steps ComfyUI 工作流、Provider/单图/原图比例约 1MP/4MP 的 1K-2K 契约、全模型 2:1 自动适配、合法尺寸映射和非法组合回归保障
 * [POS]: test 的模型参数契约测试，不触发任何真实图片生成或公司额度消耗
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  MODEL_CONFIGS,
  createGenerationRequest,
  fitSourceDimensionsToPixelArea,
  publicModelCatalog,
} from "../src/model-config.mjs";
import {
  describeFinalModelOption,
  finalModelCatalogStatus,
} from "../public/final-model-availability.js";
import {
  referenceCapability,
  sizeControlState,
  sizeSummary,
} from "../public/model-capabilities.js";

test("目录暴露三个 OneAPI 模型和一个 ComfyUI 工作流", () => {
  assert.deepEqual(
    publicModelCatalog().map(({ id, key }) => ({ id, key })),
    [
      { id: "gemini-3.1-flash-image-preview", key: "banana2" },
      { id: "gpt-image-2", key: "gptImage2" },
      { id: "comfyui:ai-texture-enhancement", key: "aiTextureEnhancement" },
      { id: "doubao-seedream-5.0", key: "seedream5" },
    ],
  );
});

test("出图模型统一可选且不向使用者暴露内部目录状态", () => {
  assert.deepEqual(
    describeFinalModelOption({ label: "GPT Image 2" }, false),
    {
      label: "GPT Image 2",
      selectable: true,
    },
  );
  assert.equal(
    finalModelCatalogStatus([
      { available: false },
      { available: false },
      { available: true },
      { available: true },
    ]),
    "4 个模型可选",
  );
});

test("白模在模型合法集合中选择最接近原图的比例", () => {
  const generation = createGenerationRequest(
    {
      modelKey: "banana2",
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

test("精模、效果图美化、白模与空房设计都强制单张业务输入", () => {
  const model = publicModelCatalog().find((entry) => entry.key === "seedream5");
  assert.deepEqual(
    referenceCapability({ featureMode: "effectEnhancement", model, policy: { maxCount: 4 } }),
    {
      ariaLabel: "添加待美化效果图",
      dropLabel: "添加或拖入待美化效果图",
      limit: 1,
      multiple: false,
      optionalLabel: "必填 · 1张",
      title: "待美化效果图",
    },
  );
  assert.deepEqual(
    referenceCapability({ featureMode: "refinedModel", model, policy: { maxCount: 4 } }),
    {
      ariaLabel: "添加精模图",
      dropLabel: "添加或拖入精模图",
      limit: 1,
      multiple: false,
      optionalLabel: "必填 · 1张",
      title: "精模图",
    },
  );
  assert.deepEqual(
    referenceCapability({ featureMode: "emptyRoom", model, policy: { maxCount: 4 } }),
    {
      ariaLabel: "添加空房图",
      dropLabel: "添加或拖入空房图",
      limit: 1,
      multiple: false,
      optionalLabel: "必填 · 1张",
      title: "空房图",
    },
  );
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

test("OneAPI 模型统一适配合法比例并拒绝缺失原图尺寸", () => {
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
          modelKey: "banana2",
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
    modelKey: "banana2",
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

test("Flux2 Klein 走 ComfyUI、允许空补充要求并按原图比例输出 1K/2K", () => {
  const pngDataUrl =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z7JkAAAAASUVORK5CYII=";
  const bytes = Buffer.from(pngDataUrl.split(",")[1], "base64").length;
  const generation = createGenerationRequest({
    modelKey: "aiTextureEnhancement",
    outputFormat: "png",
    prompt: "",
    ratio: "source",
    referenceImages: [{
      dataUrl: pngDataUrl,
      name: "source.png",
      size: bytes,
      type: "image/png",
    }],
    resolution: "1K",
  }, { sourceDimensions: { height: 900, width: 1600 } });

  assert.equal(generation.provider, "comfyui");
  assert.equal(generation.request.model, "comfyui:ai-texture-enhancement");
  assert.equal(MODEL_CONFIGS.aiTextureEnhancement.label, "Flux2 Klein");
  assert.equal(generation.request.images[0].fileName, "source.png");
  assert.equal(generation.preview.resolution, "1K");
  assert.equal(generation.preview.size, "1360x768");
  assert.equal(generation.preview.sizeMode, "source-tier");
  assert.equal(generation.request.width, 1360);
  assert.equal(generation.request.height, 768);
  assert.equal("workflow_profile" in generation.request, false);
  assert.equal("workflowProfileLabel" in generation.preview, false);

  const defaults = createGenerationRequest({
    modelKey: "aiTextureEnhancement",
    outputFormat: "png",
    prompt: "",
    ratio: "source",
    referenceImages: [{
      dataUrl: pngDataUrl,
      name: "source.png",
      size: bytes,
      type: "image/png",
    }],
    resolution: "2K",
    workflowProfile: "fast",
  }, { sourceDimensions: { height: 900, width: 1600 } });
  assert.equal("workflow_profile" in defaults.request, false);
  assert.equal(defaults.request.size, "2720x1536");
  assert.equal("workflowProfileLabel" in defaults.preview, false);

  const longPrompt = "完整正向提示词".repeat(1200);
  const longPromptGeneration = createGenerationRequest({
    modelKey: "aiTextureEnhancement",
    outputFormat: "png",
    prompt: longPrompt,
    ratio: "source",
    referenceImages: [{
      dataUrl: pngDataUrl,
      name: "source.png",
      size: bytes,
      type: "image/png",
    }],
    resolution: "2K",
  }, { sourceDimensions: { height: 900, width: 1600 } });
  assert.ok(longPrompt.length > 8000);
  assert.equal(longPromptGeneration.request.prompt, longPrompt);
});

test("Flux2 Klein 分辨率按约 1MP/4MP 像素面积计算并对齐 16 像素网格", () => {
  assert.deepEqual(
    fitSourceDimensionsToPixelArea({ height: 1600, width: 900 }, 1024 ** 2),
    { height: 1360, width: 768 },
  );
  assert.deepEqual(
    fitSourceDimensionsToPixelArea({ height: 1000, width: 1500 }, 2048 ** 2),
    { height: 1664, width: 2496 },
  );
  assert.deepEqual(
    fitSourceDimensionsToPixelArea({ height: 1000, width: 2000 }, 2048 ** 2),
    { height: 1440, width: 2880 },
  );
});

test("Flux2 Klein 拒绝缺图和多图", () => {
  const pngDataUrl =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z7JkAAAAASUVORK5CYII=";
  const image = {
    dataUrl: pngDataUrl,
    name: "source.png",
    size: Buffer.from(pngDataUrl.split(",")[1], "base64").length,
    type: "image/png",
  };
  const base = {
    modelKey: "aiTextureEnhancement",
    outputFormat: "png",
    prompt: "",
    ratio: "source",
    resolution: "2K",
  };

  assert.throws(
    () => createGenerationRequest({ ...base, referenceImages: [] }),
    /需要且只允许 1 张参考图/,
  );
  assert.throws(
    () => createGenerationRequest({ ...base, referenceImages: [image, image] }),
    /需要且只允许 1 张参考图/,
  );
});

test("Flux2 Klein 前端能力锁定原图比例并开放 1K/2K", () => {
  const model = publicModelCatalog().find(
    (entry) => entry.key === "aiTextureEnhancement",
  );
  const reference = referenceCapability({
    featureMode: "free",
    model,
    policy: { maxCount: 4 },
  });
  const controls = sizeControlState({
    currentRatio: "4:3",
    currentResolution: "2K",
    model,
    preserveResolution: false,
    ratioMode: "manual",
    sourceImage: { height: 900, width: 1600 },
  });
  const summary = sizeSummary({
    model,
    ratio: controls.ratio,
    ratioMode: "auto",
    resolution: controls.resolution,
    sourceImage: { height: 900, width: 1600 },
  });

  assert.equal(reference.limit, 1);
  assert.equal(reference.multiple, false);
  assert.equal(reference.optionalLabel, "必填 · 1张");
  assert.equal(controls.ratio, "source");
  assert.equal(controls.ratioDisabled, true);
  assert.equal(controls.resolution, "2K");
  assert.equal(controls.resolutionDisabled, false);
  assert.deepEqual(controls.resolutionOptions, [
    { label: "1K", value: "1K" },
    { label: "2K", value: "2K" },
  ]);
  assert.equal("workflowProfiles" in model, false);
  assert.equal("defaultWorkflowProfile" in model, false);
  assert.equal(summary.exactSize, "2720 × 1536");
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

test("Seedream 5.0 支持 2:1 画幅并按原图自动命中", () => {
  assert.deepEqual(MODEL_CONFIGS.seedream5.sizes["2:1"], {
    "2K": "2880x1440",
    "3K": "4352x2176",
    "4K": "5760x2880",
  });

  const generation = createGenerationRequest(
    {
      modelKey: "seedream5",
      outputFormat: "png",
      prompt: "保持室内效果图构图并提升真实感",
      ratio: "16:9",
      resolution: "2K",
    },
    {
      preferSourceAspect: true,
      sourceDimensions: { height: 1000, width: 2000 },
    },
  );

  assert.equal(generation.preview.ratio, "2:1");
  assert.equal(generation.preview.size, "2880x1440");
  assert.equal(generation.request.size, "2880x1440");
});

test("Banana 2 与 GPT Image 2 公开网关实测可用的 2:1 尺寸", () => {
  assert.deepEqual(MODEL_CONFIGS.banana2.sizes["2:1"], {
    "512": "720x360",
    "1K": "1440x720",
    "2K": "2880x1440",
    "4K": "5760x2880",
  });
  assert.deepEqual(MODEL_CONFIGS.gptImage2.sizes["2:1"], {
    "1K": "1024x512",
    "2K": "2048x1024",
    "4K": "3840x1920",
  });
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
        modelKey: "banana2",
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

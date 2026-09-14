/**
 * [INPUT]: 依赖公司 Model Link 参数矩阵、Seedream 5.0 Pro 1K-2K 合同、Flux2 Klein 原图比例 1K/2K 推理与同图 2K→4K/6K 攸行超分契约、负向 Prompt 及参考图安全校验
 * [OUTPUT]: 对外提供模型公开目录、Provider 查询、原图比例尺寸适配器，以及区分 Flux 推理尺寸与最终超分尺寸的请求构造器和 MODEL_CONFIGS
 * [POS]: src 的模型参数真源，被自由生图 API、白模合法比例适配与双 Provider 路由共同消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { resolveAiTextureNegativePrompt } from "./ai-texture-workflow.mjs";
import {
  IMAGE_UPSCALE_DEFAULT_WORKFLOW_KEY,
  imageUpscaleTargetDimensions,
} from "./image-upscale-workflow.mjs";
import { normalizeReferenceImages } from "./reference-image.mjs";

const GPT_IMAGE_SIZES = {
  "1:1": { "1K": "1024x1024", "2K": "2048x2048", "4K": "3840x3840" },
  "2:1": { "1K": "1024x512", "2K": "2048x1024", "4K": "3840x1920" },
  "3:2": { "1K": "1536x1024", "2K": "3072x2048", "4K": "3840x2560" },
  "2:3": { "1K": "1024x1536", "2K": "2048x3072", "4K": "2560x3840" },
  "3:4": { "1K": "768x1024", "2K": "1536x2048", "4K": "2880x3840" },
  "4:3": { "1K": "1024x768", "2K": "2048x1536", "4K": "3840x2880" },
  "16:9": { "1K": "1024x576", "2K": "2048x1152", "4K": "3840x2160" },
  "9:16": { "1K": "576x1024", "2K": "1152x2048", "4K": "2160x3840" },
  "21:9": { "1K": "1024x439", "2K": "2048x878", "4K": "3840x1646" },
  "9:21": { "1K": "439x1024", "2K": "878x2048", "4K": "1646x3840" },
};

const BANANA_2_SIZES = {
  "1:1": { "512": "512x512", "1K": "1024x1024", "2K": "2048x2048", "4K": "4096x4096" },
  "1:4": { "512": "256x1024", "1K": "512x2048", "2K": "1024x4096", "4K": "2048x8192" },
  "1:8": { "512": "192x1536", "1K": "384x3072", "2K": "768x6144", "4K": "1536x12288" },
  "2:3": { "512": "424x632", "1K": "848x1264", "2K": "1696x2528", "4K": "3392x5056" },
  "2:1": { "512": "720x360", "1K": "1440x720", "2K": "2880x1440", "4K": "5760x2880" },
  "3:2": { "512": "632x424", "1K": "1264x848", "2K": "2528x1696", "4K": "5056x3392" },
  "3:4": { "512": "448x600", "1K": "896x1200", "2K": "1792x2400", "4K": "3584x4800" },
  "4:1": { "512": "1024x256", "1K": "2048x512", "2K": "4096x1024", "4K": "8192x2048" },
  "4:3": { "512": "600x448", "1K": "1200x896", "2K": "2400x1792", "4K": "4800x3584" },
  "4:5": { "512": "464x576", "1K": "928x1152", "2K": "1856x2304", "4K": "3712x4608" },
  "5:4": { "512": "576x464", "1K": "1152x928", "2K": "2304x1856", "4K": "4608x3712" },
  "8:1": { "512": "1536x192", "1K": "3072x384", "2K": "6144x768", "4K": "12288x1536" },
  "9:16": { "512": "384x688", "1K": "768x1376", "2K": "1536x2752", "4K": "3072x5504" },
  "16:9": { "512": "688x384", "1K": "1376x768", "2K": "2752x1536", "4K": "5504x3072" },
  "21:9": { "512": "792x168", "1K": "1584x672", "2K": "3168x1344", "4K": "6336x2688" },
};

const SEEDREAM_5_SIZES = {
  "1:1": { "2K": "2048x2048", "3K": "3072x3072", "4K": "4096x4096" },
  "2:1": { "2K": "2880x1440", "3K": "4352x2176", "4K": "5760x2880" },
  "3:4": { "2K": "1728x2304", "3K": "2592x3456", "4K": "3520x4704" },
  "4:3": { "2K": "2304x1728", "3K": "3456x2592", "4K": "4704x3520" },
  "16:9": { "2K": "2848x1600", "3K": "4096x2304", "4K": "5504x3040" },
  "9:16": { "2K": "1600x2848", "3K": "2304x4096", "4K": "3040x5504" },
  // 公司文档的 3:2 / 2:3 高分辨率两行横竖互换；此处按比例一致性修正。
  "3:2": { "2K": "2496x1664", "3K": "3744x2496", "4K": "4992x3328" },
  "2:3": { "2K": "1664x2496", "3K": "2496x3744", "4K": "3328x4992" },
  "21:9": { "2K": "3136x1344", "3K": "4704x2016", "4K": "6240x2656" },
};

const SEEDREAM_5_PRO_SIZES = {
  "1:1": { "1K": "1024x1024", "2K": "2048x2048" },
  "2:1": { "1K": "1440x720", "2K": "2880x1440" },
  "3:4": { "1K": "864x1152", "2K": "1728x2304" },
  "4:3": { "1K": "1152x864", "2K": "2304x1728" },
  "16:9": { "1K": "1424x800", "2K": "2848x1600" },
  "9:16": { "1K": "800x1424", "2K": "1600x2848" },
  "3:2": { "1K": "1248x832", "2K": "2496x1664" },
  "2:3": { "1K": "832x1248", "2K": "1664x2496" },
  "21:9": { "1K": "1568x672", "2K": "3136x1344" },
};

const FLUX_SOURCE_SIZES = {
  source: { "1K": "1048576", "2K": "4194304" },
};

export const MODEL_CONFIGS = Object.freeze({
  banana2: {
    accent: "purple",
    defaultFormat: "png",
    defaultRatio: "4:3",
    defaultResolution: "2K",
    description: "新一代快速通用模型，支持更多极端画幅",
    formats: ["png", "jpeg"],
    id: "gemini-3.1-flash-image-preview",
    label: "Banana 2",
    qualityOptions: [],
    sizes: BANANA_2_SIZES,
  },
  gptImage2: {
    accent: "blue",
    defaultFormat: "png",
    defaultQuality: "medium",
    defaultRatio: "4:3",
    defaultResolution: "2K",
    description: "写实与编辑稳定，支持质量档和 WebP",
    formats: ["png", "jpeg", "webp"],
    id: "gpt-image-2",
    label: "GPT Image 2",
    qualityOptions: ["auto", "low", "medium", "high"],
    sizes: GPT_IMAGE_SIZES,
  },
  aiTextureEnhancement: {
    accent: "lime",
    defaultFormat: "png",
    defaultRatio: "source",
    defaultResolution: "2K",
    description: "ComfyUI · Flux2 Klein，1K/2K 原生输出，4K/6K 在同一工作流接攸行超分",
    formats: ["png"],
    id: "comfyui:ai-texture-enhancement",
    label: "Flux2 Klein",
    maxReferenceImages: 1,
    provider: "comfyui",
    postUpscale: {
      "4K": { longEdge: 4096, sourceResolution: "2K" },
      "6K": { longEdge: 6144, sourceResolution: "2K" },
    },
    qualityOptions: [],
    requiresReferenceImage: true,
    sizes: FLUX_SOURCE_SIZES,
    sizingMode: "source",
  },
  seedream5: {
    accent: "orange",
    defaultFormat: "png",
    defaultRatio: "4:3",
    defaultResolution: "2K",
    description: "高分辨率中文语义生成，最低从 2K 起",
    formats: ["png", "jpeg"],
    id: "doubao-seedream-5.0",
    label: "Seedream 5.0",
    qualityOptions: [],
    sizes: SEEDREAM_5_SIZES,
  },
  seedream5Pro: {
    accent: "orange",
    defaultFormat: "png",
    defaultRatio: "4:3",
    defaultResolution: "2K",
    description: "结构与文字遵循更稳，支持 1K/2K 自定义画幅",
    formats: ["png", "jpeg"],
    id: "doubao-seedream-5.0-pro",
    label: "Seedream 5.0 Pro",
    qualityOptions: [],
    sizes: SEEDREAM_5_PRO_SIZES,
  },
});

function modelOrThrow(modelKey) {
  const model = MODEL_CONFIGS[modelKey];
  if (!model) {
    const error = new Error("不支持的模型");
    error.statusCode = 400;
    throw error;
  }
  return model;
}

function optionOrThrow(options, value, message) {
  if (!options.includes(value)) {
    const error = new Error(message);
    error.statusCode = 400;
    throw error;
  }
  return value;
}

function validDimensions(value) {
  return (
    Number.isInteger(value?.width) &&
    Number.isInteger(value?.height) &&
    value.width > 0 &&
    value.height > 0
  );
}

function alignToLatentGrid(value) {
  return Math.max(16, Math.round(value / 16) * 16);
}

function alignDownToLatentGrid(value) {
  return Math.max(16, Math.floor(value / 16) * 16);
}

export function fitSourceDimensionsToPixelArea(sourceDimensions, pixelArea) {
  if (!validDimensions(sourceDimensions)) {
    throw new TypeError("无法读取参考图尺寸");
  }
  const target = Number(pixelArea);
  if (!Number.isInteger(target) || target < 256) {
    throw new TypeError("Flux2 Klein 分辨率档位不正确");
  }
  const aspectRatio = sourceDimensions.width / sourceDimensions.height;
  const height = alignDownToLatentGrid(Math.sqrt(target / aspectRatio));
  let width = alignToLatentGrid(height * aspectRatio);
  while (width * height > target && width > 16) width -= 16;
  return {
    height,
    width,
  };
}

function ratioNumber(value) {
  const [width, height] = String(value).split(":").map(Number);
  return width / height;
}

function nearestSupportedRatio(model, sourceDimensions) {
  const sourceRatio = sourceDimensions.width / sourceDimensions.height;
  return Object.keys(model.sizes).reduce((nearest, candidate) =>
    Math.abs(Math.log(ratioNumber(candidate) / sourceRatio)) <
    Math.abs(Math.log(ratioNumber(nearest) / sourceRatio))
      ? candidate
      : nearest,
  model.defaultRatio);
}

export function publicModelCatalog() {
  return Object.entries(MODEL_CONFIGS).map(([key, model]) => ({
    accent: model.accent,
    defaultFormat: model.defaultFormat,
    defaultQuality: model.defaultQuality || null,
    defaultRatio: model.defaultRatio,
    defaultResolution: model.defaultResolution,
    description: model.description,
    formats: model.formats,
    id: model.id,
    key,
    label: model.label,
    maxReferenceImages: model.maxReferenceImages || 4,
    provider: model.provider || "oneapi",
    qualityOptions: model.qualityOptions,
    postUpscale: model.postUpscale || null,
    requiresReferenceImage: model.requiresReferenceImage === true,
    sizes: model.sizes,
    sizingMode: model.sizingMode || "preset",
  }));
}

export function imageProviderForModel(modelKey) {
  return modelOrThrow(String(modelKey || "")).provider || "oneapi";
}

export function createGenerationRequest(
  input,
  { preferSourceAspect = false, sourceDimensions = null } = {},
) {
  const modelKey = String(input.modelKey || "");
  const model = modelOrThrow(modelKey);
  const prompt = String(input.prompt || "").trim();
  const referenceImages = normalizeReferenceImages(input.referenceImages);
  const resolvedSourceDimensions = sourceDimensions || referenceImages[0];

  if (model.provider === "comfyui") {
    if (referenceImages.length !== 1) {
      const error = new Error("Flux2 Klein 需要且只允许 1 张参考图");
      error.statusCode = 400;
      throw error;
    }
    if (!validDimensions(resolvedSourceDimensions)) {
      const error = new Error("无法读取 Flux2 Klein 参考图尺寸");
      error.statusCode = 400;
      throw error;
    }
    const resolution = optionOrThrow(
      [...Object.keys(model.sizes.source), ...Object.keys(model.postUpscale || {})],
      String(input.resolution || model.defaultResolution),
      "Flux2 Klein 不支持这个分辨率档位",
    );
    const postUpscale = model.postUpscale?.[resolution] || null;
    const inferenceResolution = postUpscale?.sourceResolution || resolution;
    const dimensions = fitSourceDimensionsToPixelArea(
      resolvedSourceDimensions,
      Number(model.sizes.source[inferenceResolution]),
    );
    const outputDimensions = postUpscale
      ? imageUpscaleTargetDimensions(dimensions, resolution)
      : dimensions;
    const negativePrompt = resolveAiTextureNegativePrompt(input.negativePrompt);
    const size = `${outputDimensions.width}x${outputDimensions.height}`;
    return {
      preview: {
        referenceImageCount: 1,
        model: model.id,
        negativePromptMode: negativePrompt.mode,
        outputFormat: "png",
        quality: null,
        ratio: "source",
        referenceImages: referenceImages.map((image) => ({
          fileName: image.fileName,
          height: image.height,
          mimeType: image.mimeType,
          size: image.size,
          width: image.width,
        })),
        resolution,
        size,
        sizeMode: postUpscale ? "source-tier-upscale" : "source-tier",
        ...(postUpscale ? {
          inferenceResolution,
          inferenceSize: `${dimensions.width}x${dimensions.height}`,
          upscaleWorkflowKey: IMAGE_UPSCALE_DEFAULT_WORKFLOW_KEY,
        } : {}),
      },
      provider: "comfyui",
      request: {
        images: referenceImages.map((image) => ({
          fileName: image.fileName,
          image_url: image.imageUrl,
          mimeType: image.mimeType,
        })),
        model: model.id,
        n: 1,
        negative_prompt: negativePrompt.text,
        negative_prompt_mode: negativePrompt.mode,
        output_format: "png",
        prompt,
        resolution,
        size,
        height: dimensions.height,
        width: dimensions.width,
        ...(postUpscale ? {
          upscale_height: outputDimensions.height,
          upscale_resolution: resolution,
          upscale_width: outputDimensions.width,
          upscale_workflow_key: IMAGE_UPSCALE_DEFAULT_WORKFLOW_KEY,
        } : {}),
      },
      workflowMetadata: {
        negativePrompt: negativePrompt.text,
        negativePromptMode: negativePrompt.mode,
        ...(postUpscale ? {
          inferenceResolution,
          inferenceSize: `${dimensions.width}x${dimensions.height}`,
          upscaleResolution: resolution,
          upscaleWorkflowKey: IMAGE_UPSCALE_DEFAULT_WORKFLOW_KEY,
        } : {}),
      },
    };
  }

  if (prompt.length < 3 || prompt.length > 8000) {
    const error = new Error("提示词长度需要在 3–8000 字符之间");
    error.statusCode = 400;
    throw error;
  }

  if (preferSourceAspect && !validDimensions(resolvedSourceDimensions)) {
    const error = new Error("无法读取参考图画幅比例");
    error.statusCode = 400;
    throw error;
  }
  const ratio = preferSourceAspect
    ? nearestSupportedRatio(model, resolvedSourceDimensions)
    : optionOrThrow(
        Object.keys(model.sizes),
        String(input.ratio || ""),
        "该模型不支持这个画幅比例",
      );
  const resolution = optionOrThrow(
    Object.keys(model.sizes[ratio]),
    String(input.resolution || ""),
    "该模型不支持这个分辨率档位",
  );
  const outputFormat = optionOrThrow(
    model.formats,
    String(input.outputFormat || ""),
    "该模型不支持这个输出格式",
  );
  const quality =
    model.qualityOptions.length > 0
      ? optionOrThrow(
          model.qualityOptions,
          String(input.quality || model.defaultQuality || "auto"),
          "GPT Image 2 不支持这个质量档位",
        )
      : null;

  const size = model.sizes[ratio][resolution];
  const request = {
    model: model.id,
    n: 1,
    output_format: outputFormat,
    prompt,
    response_format: "url",
    size,
  };

  if (quality) request.quality = quality;
  if (referenceImages.length > 0) {
    request.images = referenceImages.map((image) => ({
      fileName: image.fileName,
      image_url: image.imageUrl,
      mimeType: image.mimeType,
    }));
  }

  return {
    preview: {
      referenceImageCount: referenceImages.length,
      model: model.id,
      outputFormat,
      quality,
      ratio,
      referenceImages: referenceImages.map((image) => ({
        fileName: image.fileName,
        height: image.height,
        mimeType: image.mimeType,
        size: image.size,
        width: image.width,
      })),
      resolution,
      size,
      sizeMode: preferSourceAspect ? "source-nearest" : "preset",
    },
    provider: "oneapi",
    request,
  };
}

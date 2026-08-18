/**
 * [INPUT]: 依赖公司 Model Link 最终出图模型参数矩阵、Flux2 Klein ComfyUI 原图尺寸/双档契约与 reference-image.mjs 的参考图安全校验
 * [OUTPUT]: 对外提供含生成 Provider/参考图/工作流档位能力的 publicModelCatalog、模型 Provider 查询、请求构造器与 MODEL_CONFIGS
 * [POS]: src 的模型参数真源，被自由生图 API、白模合法比例适配与双 Provider 路由共同消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { normalizeReferenceImages } from "./reference-image.mjs";

const GPT_IMAGE_SIZES = {
  "1:1": { "1K": "1024x1024", "2K": "2048x2048", "4K": "3840x3840" },
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
  "3:4": { "2K": "1728x2304", "3K": "2592x3456", "4K": "3520x4704" },
  "4:3": { "2K": "2304x1728", "3K": "3456x2592", "4K": "4704x3520" },
  "16:9": { "2K": "2848x1600", "3K": "4096x2304", "4K": "5504x3040" },
  "9:16": { "2K": "1600x2848", "3K": "2304x4096", "4K": "3040x5504" },
  // 公司文档的 3:2 / 2:3 高分辨率两行横竖互换；此处按比例一致性修正。
  "3:2": { "2K": "2496x1664", "3K": "3744x2496", "4K": "4992x3328" },
  "2:3": { "2K": "1664x2496", "3K": "2496x3744", "4K": "3328x4992" },
  "21:9": { "2K": "3136x1344", "3K": "4704x2016", "4K": "6240x2656" },
};

const SEEDREAM_4_5_SIZES = Object.fromEntries(
  Object.entries(SEEDREAM_5_SIZES).map(([ratio, sizes]) => [
    ratio,
    { "2K": sizes["2K"], "4K": sizes["4K"] },
  ]),
);

const SOURCE_IMAGE_SIZE = {
  source: { source: "保持原图" },
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
    defaultResolution: "source",
    defaultWorkflowProfile: "quality",
    description: "ComfyUI · Flux2 Klein 双档工作流，单图保持结构与尺寸并增强真实材质和光影",
    formats: ["png"],
    id: "comfyui:ai-texture-enhancement",
    label: "Flux2 Klein",
    maxReferenceImages: 1,
    provider: "comfyui",
    qualityOptions: [],
    requiresReferenceImage: true,
    sizes: SOURCE_IMAGE_SIZE,
    sizingMode: "source",
    workflowProfiles: [
      { label: "质量优先", value: "quality" },
      { label: "快速", value: "fast" },
    ],
  },
  seedream45: {
    accent: "orange",
    defaultFormat: "png",
    defaultRatio: "4:3",
    defaultResolution: "2K",
    description: "上一代 Seedream 写实对照，支持 2K 与 4K",
    formats: ["png", "jpeg"],
    id: "doubao-seedream-4.5",
    label: "Seedream 4.5",
    qualityOptions: [],
    sizes: SEEDREAM_4_5_SIZES,
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
    requiresReferenceImage: model.requiresReferenceImage === true,
    sizes: model.sizes,
    sizingMode: model.sizingMode || "preset",
    workflowProfiles: model.workflowProfiles || [],
    defaultWorkflowProfile: model.defaultWorkflowProfile || null,
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
    if (prompt.length > 8000) {
      const error = new Error("补充要求不能超过 8000 字符");
      error.statusCode = 400;
      throw error;
    }
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
    const workflowProfile = optionOrThrow(
      (model.workflowProfiles || []).map((profile) => profile.value),
      String(input.workflowProfile || model.defaultWorkflowProfile),
      "Flux2 Klein 不支持这个生成档位",
    );
    const workflowProfileLabel = model.workflowProfiles.find(
      (profile) => profile.value === workflowProfile,
    ).label;
    const size = `${resolvedSourceDimensions.width}x${resolvedSourceDimensions.height}`;
    return {
      preview: {
        referenceImageCount: 1,
        model: model.id,
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
        resolution: "source",
        size,
        sizeMode: "source-original",
        workflowProfile,
        workflowProfileLabel,
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
        output_format: "png",
        prompt,
        size,
        workflow_profile: workflowProfile,
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

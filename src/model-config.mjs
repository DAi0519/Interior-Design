/**
 * [INPUT]: 依赖 Banana 2.1 官方十四比例/1K-4K 与公司模型 ID、GPT Image 2/2.5 官方 16px 网格/像素/边长约束与公司模型准入矩阵、Seedream 5.0 Lite 的 260128 上游身份及 Pro 通用 1K-2K 与全景 4K 实验合同、Flux2 Klein 原图比例 1K/2K 推理与同图 2K→KS直入4K/6K超分与历史攸行冻结契约、普通/旧房独立负向 Prompt 及参考图安全校验
 * [OUTPUT]: 含GPT2.6 Sunburst/Flare独立模型身份与complexity能力/严格准入； 对外提供模型目录/Provider、用户词长度边界与服务端编译正文独立长度准入、功能尺寸解析、全景R5_4原尺寸与Flux后置超分/双图请求构造器
 * [POS]: src 的模型参数真源，被自由生图 API、白模合法比例适配与双 Provider 路由共同消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { REFINED_FLUX_REFERENCE, isRefinedFluxReference, refinedFluxDimensions } from "../public/refined-flux-reference.js";
import { PANORAMA_WORKFLOW } from "./panorama-workflow.mjs";
import { resolveAiTextureNegativePrompt } from "./ai-texture-workflow.mjs";
import {
  IMAGE_UPSCALE_DEFAULT_WORKFLOW_KEY,
  FLUX_POST_UPSCALE_WORKFLOW_KEY,
  imageUpscaleWorkflow,
  imageUpscaleTargetDimensions,
} from "./image-upscale-workflow.mjs";
import { normalizeReferenceImages } from "./reference-image.mjs";

export const USER_PROMPT_LENGTH = Object.freeze({ min: 3, max: 8000 });
const FLUX_POST_UPSCALE_WORKFLOW = imageUpscaleWorkflow(FLUX_POST_UPSCALE_WORKFLOW_KEY);
const FLUX_POST_UPSCALE_CAPABILITY = Object.freeze({
  workflowKey: FLUX_POST_UPSCALE_WORKFLOW.key,
  workflowVersion: FLUX_POST_UPSCALE_WORKFLOW.version,
  workflowLabel: FLUX_POST_UPSCALE_WORKFLOW.shortLabel,
  inputSize: FLUX_POST_UPSCALE_WORKFLOW.inputSize,
});

// -- GPT 尺寸合同 -----------------------------------------------------------
// 1K/2K/4K 是工作台档位，实际尺寸按比例满足 16px 对齐、655360-8294400 像素、边长 <=3840。
// 16:9 基础档采用官方示例；4K 在保持精确比例的同时受总像素上限约束。
// 来源：https://developers.openai.com/api/docs/guides/image-generation#size-and-quality-options
const GPT_IMAGE_SIZES = {
  "1:1": { "1K": "1024x1024", "2K": "2048x2048", "4K": "2880x2880" },
  "2:1": { "1K": "1536x768", "2K": "2048x1024", "4K": "3840x1920" },
  "3:2": { "1K": "1536x1024", "2K": "3072x2048", "4K": "3504x2336" },
  "2:3": { "1K": "1024x1536", "2K": "2048x3072", "4K": "2336x3504" },
  "3:4": { "1K": "768x1024", "2K": "1536x2048", "4K": "2448x3264" },
  "4:3": { "1K": "1024x768", "2K": "2048x1536", "4K": "3264x2448" },
  "16:9": { "1K": "1536x864", "2K": "2048x1152", "4K": "3840x2160" },
  "9:16": { "1K": "864x1536", "2K": "1152x2048", "4K": "2160x3840" },
  "21:9": { "1K": "1568x672", "2K": "2016x864", "4K": "3808x1632" },
  "9:21": { "1K": "672x1568", "2K": "864x2016", "4K": "1632x3808" },
};

// GPT Image 2 的 2:1 为网关实测补充档；2.5 官方模板只列出其余九种比例。
const GPT_IMAGE_25_SIZES = Object.fromEntries(
  Object.entries(GPT_IMAGE_SIZES).filter(([ratio]) => ratio !== "2:1"),
);

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

// Banana 2.1 独立遵循官方矩阵，不继承旧 Banana 2 的 512 和网关补充 2:1 档。
// 来源：https://ai.google.dev/gemini-api/docs/image-generation 的 Nano Banana 2.1 尺寸表。
const BANANA_21_SIZES = {
  "1:1": { "1K": "1024x1024", "2K": "2048x2048", "4K": "4096x4096" },
  "1:4": { "1K": "512x2048", "2K": "1024x4096", "4K": "2048x8192" },
  "1:8": { "1K": "384x3072", "2K": "768x6144", "4K": "1536x12288" },
  "2:3": { "1K": "848x1264", "2K": "1696x2528", "4K": "3392x5056" },
  "3:2": { "1K": "1264x848", "2K": "2528x1696", "4K": "5056x3392" },
  "3:4": { "1K": "896x1200", "2K": "1792x2400", "4K": "3584x4800" },
  "4:1": { "1K": "2048x512", "2K": "4096x1024", "4K": "8192x2048" },
  "4:3": { "1K": "1200x896", "2K": "2400x1792", "4K": "4800x3584" },
  "4:5": { "1K": "928x1152", "2K": "1856x2304", "4K": "3712x4608" },
  "5:4": { "1K": "1152x928", "2K": "2304x1856", "4K": "4608x3712" },
  "8:1": { "1K": "3072x384", "2K": "6144x768", "4K": "12288x1536" },
  "9:16": { "1K": "768x1376", "2K": "1536x2752", "4K": "3072x5504" },
  "16:9": { "1K": "1376x768", "2K": "2752x1536", "4K": "5504x3072" },
  "21:9": { "1K": "1584x672", "2K": "3168x1344", "4K": "6336x2688" },
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
  banana21: {
    accent: "purple",
    defaultFormat: "png",
    defaultRatio: "4:3",
    defaultResolution: "2K",
    description: "通用图像模型，支持十四种画幅与 1K/2K/4K 输出",
    formats: ["png", "jpeg"],
    id: "gemini-nano-banana-2.1",
    label: "Banana 2.1",
    qualityOptions: [],
    sizes: BANANA_21_SIZES,
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
  gptImage25Sunburst: {
    accent: "blue",
    defaultFormat: "png",
    defaultQuality: "medium",
    defaultRatio: "4:3",
    defaultResolution: "2K",
    description: "GPT Image 2.5 · 编辑精度优先，支持 xhigh/max 质量档",
    formats: ["png", "jpeg", "webp"],
    id: "gpt-image-2.5-sunburst",
    label: "GPT Image 2.5 Sunburst",
    qualityOptions: ["low", "medium", "high", "xhigh", "max"],
    sizes: GPT_IMAGE_25_SIZES,
  },
  gptImage25Flare: {
    accent: "blue",
    defaultFormat: "png",
    defaultQuality: "medium",
    defaultRatio: "4:3",
    defaultResolution: "2K",
    description: "GPT Image 2.5 · 快速日常生图，支持 xhigh/max 质量档",
    formats: ["png", "jpeg", "webp"],
    id: "gpt-image-2.5-flare",
    label: "GPT Image 2.5 Flare",
    qualityOptions: ["low", "medium", "high", "xhigh", "max"],
    sizes: GPT_IMAGE_25_SIZES,
  },
  ...Object.fromEntries(["Sunburst", "Flare"].map(variant => [`gptImage26${variant}`, {
    accent: "blue", defaultFormat: "png", defaultQuality: "medium", defaultRatio: "4:3", defaultResolution: "2K",
    description: "GPT Image 2.6 · 支持图像生成与编辑",
    formats: ["png", "jpeg", "webp"], id: `gpt-image-2.6-${variant.toLowerCase()}`, label: `GPT Image 2.6 ${variant}`,
    qualityOptions: ["low", "medium", "high", "xhigh", "max"],
    complexityOptions: ["low", "medium", "high"],
    sizes: GPT_IMAGE_25_SIZES,
  }])),
  aiTextureEnhancement: {
    accent: "lime",
    defaultFormat: "png",
    defaultRatio: "source",
    defaultResolution: "2K",
    description: "ComfyUI · Flux2 Klein，1K/2K 原生输出，4K/6K 在同一工作流接 KS直入7B，6K以5K推理后交付",
    formats: ["png"],
    id: "comfyui:ai-texture-enhancement",
    label: "Flux2 Klein",
    maxReferenceImages: 1,
    panoramaWorkflow: { id: PANORAMA_WORKFLOW.id, version: PANORAMA_WORKFLOW.version, label: "R5_4 全景", sourceSize: true },
    refinedLightingReference: REFINED_FLUX_REFERENCE,
    provider: "comfyui",
    postUpscale: {
      "4K": { longEdge: 4096, sourceResolution: "2K", ...FLUX_POST_UPSCALE_CAPABILITY },
      "6K": { longEdge: 6144, sourceResolution: "2K", ...FLUX_POST_UPSCALE_CAPABILITY },
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
    description: "Lite 版本，高分辨率中文语义生成，最低从 2K 起",
    formats: ["png", "jpeg"],
    id: "doubao-seedream-5.0",
    label: "Seedream 5.0 Lite",
    legacyLabels: ["Seedream 5.0"],
    qualityOptions: [],
    sizes: SEEDREAM_5_SIZES,
  },
  seedream5Pro: {
    accent: "orange",
    defaultFormat: "png",
    defaultRatio: "4:3",
    defaultResolution: "2K",
    description: "结构与文字遵循更稳，通用 1K/2K，全景 4K 实验档",
    featureSizeOverrides: {
      panoramaEnhancement: {
        "2:1": { "4K": "3040x1520" },
      },
    },
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
    featureSizeOverrides: model.featureSizeOverrides || null,
    formats: model.formats,
    id: model.id,
    key,
    label: model.label,
    legacyLabels: model.legacyLabels || [],
    maxReferenceImages: model.maxReferenceImages || 4,
    refinedLightingReference: model.refinedLightingReference || null,
    panoramaWorkflow: model.panoramaWorkflow || null,
    provider: model.provider || "oneapi",
    qualityOptions: model.qualityOptions,
    complexityOptions: model.complexityOptions || [],
    postUpscale: model.postUpscale || null,
    requiresReferenceImage: model.requiresReferenceImage === true,
    sizes: model.sizes,
    sizingMode: model.sizingMode || "preset",
  }));
}

export function imageProviderForModel(modelKey) {
  return modelOrThrow(String(modelKey || "")).provider || "oneapi";
}

// --- 出图前规划独立于quality；默认省略，由模型决定，不推断网关是否执行 ---
export function normalizeImageComplexity(modelId, value) {
  if (value == null) return null;
  const model = Object.values(MODEL_CONFIGS).find(entry => entry.id === modelId);
  if (!model?.complexityOptions?.length) {
    throw Object.assign(new TypeError("所选模型不支持独立思考强度"), { statusCode: 400 });
  }
  if (typeof value !== "string" || !model.complexityOptions.includes(value)) {
    throw Object.assign(new TypeError("思考强度请选择低、中或高"), { statusCode: 400 });
  }
  return value;
}

export function normalizeFluxPostUpscaleInput(input, { legacy = false } = {}) {
  const hasKey = input.postUpscaleWorkflowKey !== undefined;
  const hasVersion = input.postUpscaleWorkflowVersion !== undefined;
  const ordinary = ["free", "whiteModel", "emptyRoom", "roomRenovation", "styleTransfer", "refinedModel",
    "effectEnhancement", "effectBeautification", "textureEnhancement"].includes(input.featureMode || "free");
  const enabled = input.modelKey === "aiTextureEnhancement" && ["4K", "6K"].includes(input.resolution)
    && ordinary && !isRefinedFluxReference(input);
  if (!enabled) {
    if (hasKey || hasVersion) throw Object.assign(new Error("后置超分身份仅支持普通Flux的4K/6K档位"), { statusCode: 400, retryable: false });
    return input;
  }
  if (hasKey !== hasVersion) throw Object.assign(new Error("后置超分工作流和版本必须同时冻结，请刷新配置"), { statusCode: 409, retryable: false });
  const key = hasKey ? input.postUpscaleWorkflowKey : legacy ? IMAGE_UPSCALE_DEFAULT_WORKFLOW_KEY : FLUX_POST_UPSCALE_WORKFLOW_KEY;
  if (![FLUX_POST_UPSCALE_WORKFLOW_KEY, IMAGE_UPSCALE_DEFAULT_WORKFLOW_KEY].includes(key)) {
    throw Object.assign(new Error("Flux后置超分工作流不受支持"), { statusCode: 400, retryable: false });
  }
  const workflow = imageUpscaleWorkflow(key);
  if (hasVersion && input.postUpscaleWorkflowVersion !== workflow.version) {
    throw Object.assign(new Error("后置超分工作流版本已变化，请刷新配置后重新运行"), { statusCode: 409, retryable: false });
  }
  return { ...input, postUpscaleWorkflowKey: workflow.key, postUpscaleWorkflowVersion: workflow.version };
}

export function createGenerationRequest(
  input,
  { compiledPrompt = false, preferSourceAspect = false, sourceDimensions = null } = {},
) {
  if (input.designScenario !== undefined
    && (input.featureMode !== "emptyRoom" || input.designScenario !== "room-renovation")) {
    const error = new TypeError("旧房负向提示词场景仅支持空房设计的 room-renovation");
    error.statusCode = 400;
    throw error;
  }
  input = normalizeFluxPostUpscaleInput(input);
  const modelKey = String(input.modelKey || "");
  const model = modelOrThrow(modelKey);
  const complexity = normalizeImageComplexity(model.id, input.complexity);
  const featureSizeOverrides = model.featureSizeOverrides?.[input.featureMode] || {};
  const sizes = Object.fromEntries(
    Object.entries(model.sizes).map(([ratio, values]) => [
      ratio,
      { ...values, ...(featureSizeOverrides[ratio] || {}) },
    ]),
  );
  if (input.featureMode === "panoramaEnhancement"
    && model.sizingMode !== "source" && !sizes["2:1"]) {
    const error = new Error(`${model.label} 不支持全景图所需的 2:1 画幅`);
    error.statusCode = 400;
    throw error;
  }
  const prompt = String(input.prompt || "").trim();
  const referenceImages = normalizeReferenceImages(input.referenceImages);
  const resolvedSourceDimensions = sourceDimensions || referenceImages[0];
  // -------- 用户输入与服务端合成正文分开计长；请求字段不能开启内部额度 --------
  const maxPromptLength = compiledPrompt === true ? 32_000 : USER_PROMPT_LENGTH.max;
  if ((compiledPrompt === true || model.provider !== "comfyui")
    && (prompt.length < USER_PROMPT_LENGTH.min || prompt.length > maxPromptLength)) {
    const error = new Error(`提示词长度需要在 ${USER_PROMPT_LENGTH.min}–${maxPromptLength} 字符之间`);
    error.statusCode = 400;
    throw error;
  }

  if (model.provider === "comfyui") {
    const dual = isRefinedFluxReference(input);
    const panorama = input.featureMode === "panoramaEnhancement";
    if (referenceImages.length !== (dual ? 2 : 1)) {
      const error = new Error(dual ? "精模Flux参考链路需要且只允许2张图片" : "Flux2 Klein 需要且只允许 1 张参考图");
      error.statusCode = 400;
      throw error;
    }
    if (!validDimensions(resolvedSourceDimensions)) {
      const error = new Error("无法读取 Flux2 Klein 参考图尺寸");
      error.statusCode = 400;
      throw error;
    }
    if (panorama && referenceImages[0].width !== referenceImages[0].height * 2) {
      const error = new Error("全景图美化需要真实尺寸为2:1的全景图");
      error.statusCode = 400;
      throw error;
    }
    const resolution = panorama ? "original" : optionOrThrow(
      dual ? Object.keys(REFINED_FLUX_REFERENCE.longEdges) : [...Object.keys(model.sizes.source), ...Object.keys(model.postUpscale || {})],
      String(input.resolution || model.defaultResolution),
      "Flux2 Klein 不支持这个分辨率档位",
    );
    const postUpscale = dual || panorama ? null : model.postUpscale?.[resolution] || null;
    const inferenceResolution = postUpscale?.sourceResolution || resolution;
    const dimensions = panorama ? { width: referenceImages[0].width, height: referenceImages[0].height }
      : dual ? refinedFluxDimensions(resolvedSourceDimensions, resolution) : fitSourceDimensionsToPixelArea(
      resolvedSourceDimensions,
      Number(model.sizes.source[inferenceResolution]),
    );
    const upscaleWorkflow = postUpscale ? imageUpscaleWorkflow(input.postUpscaleWorkflowKey) : null;
    const outputDimensions = postUpscale
      ? imageUpscaleTargetDimensions(dimensions, resolution, upscaleWorkflow.key)
      : dimensions;
    const panoramaNegative = String(input.negativePrompt || "").trim();
    const negativePrompt = dual ? { text: "", mode: "disabled-cfg1" }
      : panorama ? { text: panoramaNegative, mode: panoramaNegative ? "custom" : "empty-panorama" }
      : resolveAiTextureNegativePrompt(input.negativePrompt, {
      designScenario: input.designScenario,
    });
    if (negativePrompt.text.length > 8000) throw Object.assign(new Error("负向提示词不能超过8000字符"), { statusCode: 400 });
    const size = `${outputDimensions.width}x${outputDimensions.height}`;
    return {
      preview: {
        referenceImageCount: dual ? 2 : 1,
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
        sizeMode: panorama ? "panorama-source" : dual ? "source-long-edge-reference" : postUpscale ? "source-tier-upscale" : "source-tier",
        ...(panorama ? { workflowId: model.panoramaWorkflow.id } : {}),
        ...(postUpscale ? {
          inferenceResolution,
          inferenceSize: `${dimensions.width}x${dimensions.height}`,
          upscaleWorkflowKey: upscaleWorkflow.key,
          upscaleWorkflowVersion: upscaleWorkflow.version,
          upscaleWorkflowLabel: upscaleWorkflow.shortLabel,
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
        ...(dual ? { workflow_kind: REFINED_FLUX_REFERENCE.id } : {}),
        ...(panorama ? { workflow_kind: model.panoramaWorkflow.id } : {}),
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
          upscale_workflow_key: upscaleWorkflow.key,
          upscale_workflow_version: upscaleWorkflow.version,
          upscale_source_width: dimensions.width,
          upscale_source_height: dimensions.height,
        } : {}),
      },
      workflowMetadata: {
        negativePrompt: negativePrompt.text,
        negativePromptMode: negativePrompt.mode,
        ...(panorama ? { workflowId: model.panoramaWorkflow.id, sourceSize: true } : {}),
        ...(postUpscale ? {
          inferenceResolution,
          inferenceSize: `${dimensions.width}x${dimensions.height}`,
          upscaleResolution: resolution,
          upscaleWorkflowKey: upscaleWorkflow.key,
          upscaleWorkflowVersion: upscaleWorkflow.version,
          upscaleWorkflowLabel: upscaleWorkflow.shortLabel,
        } : {}),
      },
    };
  }

  if (preferSourceAspect && !validDimensions(resolvedSourceDimensions)) {
    const error = new Error("无法读取参考图画幅比例");
    error.statusCode = 400;
    throw error;
  }
  const ratio = preferSourceAspect
    ? nearestSupportedRatio({ ...model, sizes }, resolvedSourceDimensions)
    : optionOrThrow(
        Object.keys(sizes),
        String(input.ratio || ""),
        "该模型不支持这个画幅比例",
      );
  const resolution = optionOrThrow(
    Object.keys(sizes[ratio]),
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
          `${model.label} 不支持这个质量档位`,
        )
      : null;

  const size = sizes[ratio][resolution];
  const request = {
    model: model.id,
    n: 1,
    output_format: outputFormat,
    prompt,
    response_format: "url",
    size,
  };

  if (quality) request.quality = quality;
  if (complexity !== null) request.complexity = complexity;
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

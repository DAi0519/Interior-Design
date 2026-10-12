/**
 * [INPUT]: 依赖单图安全校验、sharp 方向归一化、ComfyUI 几何/节点合同、Sunburst 画布/遮罩适配、异步缓存及扩图客户端与阶段回调
 * [OUTPUT]: 对外提供双引擎脱敏配置、节点/模型准入、各引擎四边尺寸校验与单图本机结果服务
 * [POS]: src 的 AI 扩图应用边界，真实工作流适配器与浏览器任务之间的单一校验入口
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { normalizeReferenceImages } from "./reference-image.mjs";
import sharp from "sharp";
import { createAsyncTtlCache } from "./runtime-cache.mjs";
import {
  ONEAPI_OUTPAINT_ENGINE_KEY, assertOneApiOutpaintTarget, executeOneApiOutpaint,
  oneApiOutpaintPreparedDimensions, publicOneApiOutpaintConfig,
} from "./image-outpaint-oneapi.mjs";
import { MODEL_CONFIGS } from "./model-config.mjs";
import {
  IMAGE_OUTPAINT_GEOMETRY, IMAGE_OUTPAINT_WORKFLOW, IMAGE_OUTPAINT_REQUIRED_NODES,
  assertImageOutpaintAlignedTarget, createImageOutpaintWorkflow,
  imageOutpaintPreparedDimensions,
} from "./image-outpaint-workflow.mjs";

// -------- 本机请求保护上限，并非 MaaS 策略的能力声明 --------
export const IMAGE_OUTPAINT_LIMITS = Object.freeze({
  maxEdge: 16384,
  maxExpansion: 8192,
  maxPixels: 32 * 1024 * 1024,
});
export const IMAGE_OUTPAINT_PENDING_REASON = "扩图客户端尚未配置";
export const IMAGE_OUTPAINT_QUEUE_TIMEOUT_MS = 5 * 60 * 1000;

export function publicImageOutpaintConfig({ available = false, reason = IMAGE_OUTPAINT_PENDING_REASON } = {}) {
  return {
    ...IMAGE_OUTPAINT_LIMITS,
    available,
    reason: available ? null : reason,
    minInputEdge: IMAGE_OUTPAINT_GEOMETRY.minInputEdge,
    maxInputEdge: IMAGE_OUTPAINT_GEOMETRY.maxInputEdge,
    inputAlignment: IMAGE_OUTPAINT_GEOMETRY.sourceMultiple,
    outputAlignment: IMAGE_OUTPAINT_GEOMETRY.targetMultiple,
    workflow: {
      key: IMAGE_OUTPAINT_WORKFLOW.key,
      label: IMAGE_OUTPAINT_WORKFLOW.label,
      version: IMAGE_OUTPAINT_WORKFLOW.version,
    },
  };
}

// -------- 只读准入：核对实际节点接口与模型枚举，不启动 GPU --------
export function verifyImageOutpaintCapabilities(objectInfo = {}) {
  const graph = createImageOutpaintWorkflow({
    artifactKey: "capability-check", generationRequest: { expansion: { left: 8, top: 0, right: 0, bottom: 0 } },
    height: 512, imageBase64: "", seed: 4, width: 520,
  });
  for (const node of Object.values(graph)) {
    const schema = objectInfo[node.class_type]?.input;
    if (!schema) throw new Error(`缺少扩图节点：${node.class_type}`);
    for (const field of Object.keys(schema.required || {})) {
      if (!(field in node.inputs)) throw new Error(`扩图节点接口不兼容：${node.class_type}.${field}`);
    }
    for (const [field, value] of Object.entries(node.inputs)) {
      const specification = schema.required?.[field] || schema.optional?.[field];
      if (!specification) throw new Error(`扩图节点接口不兼容：${node.class_type}.${field}`);
      if (Array.isArray(value)) continue;
      const choices = specification[0];
      if (Array.isArray(choices) && !choices.includes(value)) {
        throw new Error(`扩图节点缺少配置项：${node.class_type}.${field} = ${value}`);
      }
    }
  }
}

export function createImageOutpaintConfigReader(imageClient, { getOneApiModels = null } = {}) {
  const cache = createAsyncTtlCache({ maxEntries: 1, ttlMs: 30_000 });
  async function comfyConfig() {
    if (!imageClient?.getObjectInfo) return publicImageOutpaintConfig();
    try {
      await cache.get("capabilities", async () => verifyImageOutpaintCapabilities(await imageClient.getObjectInfo(IMAGE_OUTPAINT_REQUIRED_NODES)));
      return publicImageOutpaintConfig({ available: true });
    } catch (error) {
      return publicImageOutpaintConfig({ reason: `扩图服务暂不可用：${String(error.message).slice(0, 500)}` });
    }
  }
  async function oneApiConfig() {
    if (!getOneApiModels) return publicOneApiOutpaintConfig();
    try {
      const models = await getOneApiModels();
      const available = models.some((model) => (model.id || model.name) === MODEL_CONFIGS[ONEAPI_OUTPAINT_ENGINE_KEY].id);
      return publicOneApiOutpaintConfig({ available, reason: "当前 OneAPI Key 未开放 GPT Image 2.5 Sunburst" });
    } catch {
      return publicOneApiOutpaintConfig({ reason: "OneAPI 未连接或模型权限读取失败，请检查连接后重试" });
    }
  }
  return async () => {
    const [comfy, oneApi] = await Promise.all([comfyConfig(), oneApiConfig()]);
    return { ...comfy, engines: [{ ...comfy, key: "comfyui", label: "Flux Fill", provider: "comfyui" }, oneApi] };
  };
}

function inputError(message) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

export function imageOutpaintEngineKey(input = {}) {
  const key = input.outpaintEngine ?? "comfyui";
  if (!["comfyui", ONEAPI_OUTPAINT_ENGINE_KEY].includes(key)) throw inputError("不支持的扩图引擎");
  return key;
}

export async function normalizeImageOutpaintInput(input = {}) {
  const oneApi = imageOutpaintEngineKey(input) === ONEAPI_OUTPAINT_ENGINE_KEY;
  const dimensions = oneApi ? oneApiOutpaintPreparedDimensions : imageOutpaintPreparedDimensions;
  let [source] = normalizeReferenceImages(input.referenceImages, { maxCount: 1 });
  if (!source?.width || !source?.height) throw inputError("AI 扩图需要 1 张可读取尺寸的图片");
  dimensions(source);
  const bytes = Buffer.from(source.imageUrl.split(",")[1], "base64");
  let metadata;
  try {
    metadata = await sharp(bytes).metadata();
    if (metadata.orientation && metadata.orientation !== 1) {
      const oriented = await sharp(bytes).autoOrient().png().toBuffer({ resolveWithObject: true });
      source = {
        ...source, width: oriented.info.width, height: oriented.info.height,
        fileName: source.fileName.replace(/\.[^.]+$/, "") + ".png",
        imageUrl: `data:image/png;base64,${oriented.data.toString("base64")}`,
        mimeType: "image/png", size: oriented.data.length,
      };
    }
  } catch {
    throw inputError("AI 扩图无法读取图片，请重新导出 PNG/JPEG/WebP");
  }
  const prepared = dimensions(source);
  const expansion = {};
  for (const side of ["left", "top", "right", "bottom"]) {
    const value = input.expansion?.[side];
    if (!Number.isSafeInteger(value) || value < 0 || value > IMAGE_OUTPAINT_LIMITS.maxExpansion) {
      throw inputError(`四边扩展尺寸必须为 0–${IMAGE_OUTPAINT_LIMITS.maxExpansion} 的整数像素`);
    }
    expansion[side] = value;
  }
  if (!Object.values(expansion).some((value) => value > 0)) throw inputError("请至少扩展一边");
  const width = prepared.width + expansion.left + expansion.right;
  const height = prepared.height + expansion.top + expansion.bottom;
  if (Math.max(width, height) > IMAGE_OUTPAINT_LIMITS.maxEdge || width * height > IMAGE_OUTPAINT_LIMITS.maxPixels) {
    throw inputError("目标画布超过本机请求保护上限，请减少扩展尺寸");
  }
  (oneApi ? assertOneApiOutpaintTarget : assertImageOutpaintAlignedTarget)({ width, height });
  return { expansion, height, prepared, source, width };
}

export async function executeImageOutpaint(input, { imageClient = null, onProgress = null } = {}) {
  if (!imageClient) throw Object.assign(new Error(IMAGE_OUTPAINT_PENDING_REASON), { statusCode: 409 });
  const normalized = await normalizeImageOutpaintInput(input);
  if (imageOutpaintEngineKey(input) === ONEAPI_OUTPAINT_ENGINE_KEY) return executeOneApiOutpaint(normalized, { imageClient, onProgress });
  const { expansion, height, prepared, source, width } = normalized;
  const startedAt = Date.now();
  const progress = typeof onProgress === "function" ? ({ phase, promptId }) => onProgress({
    message: phase === "executing" ? "ComfyUI 正在补全扩展区域" : "扩图已提交 ComfyUI，正在排队",
    phase, promptId,
  }) : null;
  const result = await imageClient.generateImage({
    expansion,
    height,
    images: [{ fileName: source.fileName, image_url: source.imageUrl }],
    preparedWidth: prepared.width, preparedHeight: prepared.height,
    sourceWidth: source.width, sourceHeight: source.height,
    width,
  }, { onProgress: progress, queueTimeoutMs: IMAGE_OUTPAINT_QUEUE_TIMEOUT_MS });
  if (result.metadata?.outputWidth !== width || result.metadata?.outputHeight !== height) {
    throw new Error("扩图实际输出尺寸与目标画布不一致");
  }
  return {
    durationMs: Date.now() - startedAt,
    images: result.images,
    request: { expansion, outputFormat: result.outputFormat, referenceImageCount: 1, size: `${width}x${height}`, syncMode: "local-only" },
    sync: { generationId: null, status: "skipped" },
    upstream: { created: result.created, metadata: result.metadata, outputFormat: result.outputFormat, transport: result.transport },
    workflow: { key: "image-outpaint", label: "AI 扩图", version: result.metadata?.workflowVersion || null },
  };
}

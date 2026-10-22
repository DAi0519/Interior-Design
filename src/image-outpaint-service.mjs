/**
 * [INPUT]: 依赖单图安全校验、sharp方向归一化与等比缩放、共享原比例/预设固定2K画幅与缩放计划、三引擎合同、归档投影及扩图客户端/同步调度
 * [OUTPUT]: 对外提供三引擎独立准入与固定2K脱敏配置、Flux模型选择/枚举校验、Sunburst大图单次等比适配及狭长原比例最小目标补边追溯、真实构图与旧四边2K目标校验、实际尺寸通过后的飞书同步结果
 * [POS]: src 的 AI 扩图应用边界，真实工作流适配器与浏览器任务之间的单一校验入口
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { normalizeReferenceImages } from "./reference-image.mjs";
import sharp from "sharp";
import { OUTPAINT_LONG_EDGE, OUTPAINT_RESOLUTION, assertOutpaintResolution, outpaintCanvasPlan } from "../public/image-outpaint-geometry.js";
import { createAsyncTtlCache } from "./runtime-cache.mjs";
import { buildImageOutpaintArchive } from "./image-outpaint-archive.mjs";
import {
  ONEAPI_OUTPAINT_ENGINE_KEY, assertOneApiOutpaintTarget, executeOneApiOutpaint,
  oneApiOutpaintPreparedDimensions, publicOneApiOutpaintConfig,
} from "./image-outpaint-oneapi.mjs";
import { MODEL_CONFIGS } from "./model-config.mjs";
import {
  QWEN_OUTPAINT_ENGINE_KEY, QWEN_OUTPAINT_REQUIRED_NODES, QWEN_OUTPAINT_WORKFLOW,
  assertQwenOutpaintTarget, publicQwenOutpaintConfig, qwenOutpaintPreparedDimensions,
  verifyQwenOutpaintCapabilities,
} from "./image-outpaint-qwen.mjs";
import {
  IMAGE_OUTPAINT_GEOMETRY, IMAGE_OUTPAINT_WORKFLOW, IMAGE_OUTPAINT_REQUIRED_NODES,
  IMAGE_OUTPAINT_DEFAULT_MODEL_KEY, IMAGE_OUTPAINT_MODELS, resolveImageOutpaintModel,
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

export function publicImageOutpaintConfig({
  available = false, reason = IMAGE_OUTPAINT_PENDING_REASON, models = null,
} = {}) {
  const candidates = IMAGE_OUTPAINT_MODELS.map((model) => {
    const status = models?.find((candidate) => candidate.key === model.key);
    const modelAvailable = status ? Boolean(status.available) : available;
    return { ...model, available: modelAvailable, reason: modelAvailable ? null : status?.reason || reason };
  });
  const defaultModelKey = candidates.find((model) => model.key === IMAGE_OUTPAINT_DEFAULT_MODEL_KEY && model.available)?.key
    || candidates.find((model) => model.available)?.key || IMAGE_OUTPAINT_DEFAULT_MODEL_KEY;
  return {
    ...IMAGE_OUTPAINT_LIMITS,
    resolution: OUTPAINT_RESOLUTION,
    available,
    reason: available ? null : reason,
    defaultModelKey,
    models: candidates,
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
export function verifyImageOutpaintCapabilities(objectInfo = {}, outpaintModel = IMAGE_OUTPAINT_DEFAULT_MODEL_KEY) {
  const graph = createImageOutpaintWorkflow({
    artifactKey: "capability-check", generationRequest: { outpaintModel, expansion: { left: 8, top: 0, right: 0, bottom: 0 } },
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
      const choices = Array.isArray(specification[0]) ? specification[0] : specification[0] === "COMBO" ? specification[1]?.options : null;
      if (choices && !choices.includes(value)) {
        throw new Error(`扩图节点缺少配置项：${node.class_type}.${field} = ${value}`);
      }
    }
  }
}

export function createImageOutpaintConfigReader(imageClient, { getOneApiModels = null, qwenImageClient = null } = {}) {
  const cache = createAsyncTtlCache({ maxEntries: 1, ttlMs: 30_000 });
  const qwenCache = createAsyncTtlCache({ maxEntries: 1, ttlMs: 30_000 });
  async function comfyConfig() {
    if (!imageClient?.getObjectInfo) return publicImageOutpaintConfig();
    try {
      return await cache.get("capabilities", async () => {
        const objectInfo = await imageClient.getObjectInfo(IMAGE_OUTPAINT_REQUIRED_NODES);
        const models = IMAGE_OUTPAINT_MODELS.map((model) => {
          try {
            verifyImageOutpaintCapabilities(objectInfo, model.key);
            return { key: model.key, available: true, reason: null };
          } catch (error) {
            return { key: model.key, available: false, reason: `扩图模型暂不可用：${String(error.message).slice(0, 500)}` };
          }
        });
        const available = models.some((model) => model.available);
        const config = publicImageOutpaintConfig({ available, models, reason: models[0].reason });
        if (!available) throw Object.assign(new Error(config.reason), { outpaintConfig: config });
        return config;
      });
    } catch (error) {
      if (error.outpaintConfig) return error.outpaintConfig;
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
  async function qwenConfig() {
    if (!qwenImageClient?.getObjectInfo) return publicQwenOutpaintConfig();
    try {
      return await qwenCache.get("capabilities", async () => {
        verifyQwenOutpaintCapabilities(await qwenImageClient.getObjectInfo(QWEN_OUTPAINT_REQUIRED_NODES));
        return publicQwenOutpaintConfig({ available: true });
      });
    } catch (error) {
      return publicQwenOutpaintConfig({ reason: `Qwen 扩图暂不可用：${String(error.message).slice(0, 500)}` });
    }
  }
  return async () => {
    const [comfy, oneApi, qwen] = await Promise.all([comfyConfig(), oneApiConfig(), qwenConfig()]);
    return { ...comfy, engines: [{ ...comfy, key: "comfyui", label: "Flux Fill", provider: "comfyui" }, oneApi, qwen] };
  };
}

function inputError(message) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

// -------- 显式缩放仅指定长边，不裁切；旧自动适配保持已有整数像素合同 --------
async function resizeOutpaintSource(source, resize, proportional = false) {
  try {
    const bytes = Buffer.from(source.imageUrl.split(",")[1], "base64");
    const image = sharp(bytes);
    if (proportional) {
      const axis = source.width >= source.height ? "width" : "height";
      image.resize({ [axis]: resize[axis], withoutEnlargement: false });
    } else image.resize(resize.width, resize.height, { fit: "cover" });
    const result = await image.png().toBuffer({ resolveWithObject: true });
    return {
      ...source, width: result.info.width, height: result.info.height,
      fileName: source.fileName.replace(/\.[^.]+$/, "") + ".png",
      imageUrl: `data:image/png;base64,${result.data.toString("base64")}`,
      mimeType: "image/png", size: result.data.length,
    };
  } catch {
    throw inputError("AI 扩图无法适配图片，请重新导出 PNG/JPEG/WebP");
  }
}

function sourceAdaptationMetadata(normalized) {
  return {
    resolution: OUTPAINT_RESOLUTION,
    originalSourceWidth: normalized.originalSource.width,
    originalSourceHeight: normalized.originalSource.height,
    sourceResized: normalized.sourceResized,
    ...(normalized.targetAdaptation ? { targetAdaptation: normalized.targetAdaptation } : {}),
    ...(normalized.outpaintCanvas ? { outpaintCanvas: normalized.outpaintCanvas } : {}),
  };
}

export function imageOutpaintEngineKey(input = {}) {
  const key = input.outpaintEngine ?? "comfyui";
  if (!["comfyui", ONEAPI_OUTPAINT_ENGINE_KEY, QWEN_OUTPAINT_ENGINE_KEY].includes(key)) throw inputError("不支持的扩图引擎");
  if (key !== "comfyui" && input.outpaintModel != null && input.outpaintModel !== "") {
    throw inputError(`${key === ONEAPI_OUTPAINT_ENGINE_KEY ? "Sunburst" : "Qwen"} 扩图不支持 Flux Fill 模型选择`);
  }
  return key;
}

export async function normalizeImageOutpaintInput(input = {}) {
  assertOutpaintResolution(input.resolution);
  assertOutpaintResolution(input.outpaintCanvas?.resolution);
  const engineKey = imageOutpaintEngineKey(input);
  const oneApi = engineKey === ONEAPI_OUTPAINT_ENGINE_KEY;
  const qwen = engineKey === QWEN_OUTPAINT_ENGINE_KEY;
  const dimensions = oneApi ? oneApiOutpaintPreparedDimensions : qwen ? qwenOutpaintPreparedDimensions : imageOutpaintPreparedDimensions;
  const assertTarget = oneApi ? assertOneApiOutpaintTarget : qwen ? assertQwenOutpaintTarget : assertImageOutpaintAlignedTarget;
  const limits = oneApi ? publicOneApiOutpaintConfig() : qwen ? publicQwenOutpaintConfig() : publicImageOutpaintConfig();
  let [source] = normalizeReferenceImages(input.referenceImages, { maxCount: 1 });
  if (!source?.width || !source?.height) throw inputError("AI 扩图需要 1 张可读取尺寸的图片");
  if (!oneApi || input.outpaintCanvas === undefined) dimensions(source);
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
  const originalSource = { width: source.width, height: source.height };
  let prepared = oneApi && input.outpaintCanvas !== undefined ? { width: source.width, height: source.height } : dimensions(source);
  if (input.outpaintCanvas !== undefined) {
    const canvas = input.outpaintCanvas;
    if (!canvas || typeof canvas !== "object" || Array.isArray(canvas)) throw inputError("扩图画布设置无效");
    const position = canvas.position === undefined ? { x: 0.5, y: 0.5 } : canvas.position;
    const plan = outpaintCanvasPlan({
      source, ratio: canvas.ratio, resolution: canvas.resolution, position, scale: canvas.scale,
      limits,
    });
    if (!Object.values(plan.expansion).some((value) => value > 0)) throw inputError("请缩小原图以留出扩图区域");
    if (plan.resize) source = await resizeOutpaintSource(source, plan.resize, plan.scale !== undefined);
    prepared = dimensions(source);
    if (prepared.width !== plan.prepared.width || prepared.height !== plan.prepared.height) {
      throw inputError("扩图原图适配尺寸与目标计划不一致，请重新上传图片");
    }
    const { width, height } = plan.target;
    assertTarget({ width, height });
    return {
      expansion: plan.expansion, height, prepared, source, width,
      originalSource, sourceResized: plan.resize !== null,
      ...(plan.targetAdaptation ? { targetAdaptation: plan.targetAdaptation } : {}),
      outpaintCanvas: { ratio: plan.ratio, resolution: plan.resolution, position: { x: position.x, y: position.y }, ...(plan.scale === undefined ? {} : { scale: plan.scale }) },
    };
  }
  const expansion = {};
  for (const side of ["left", "top", "right", "bottom"]) {
    const value = input.expansion?.[side];
    if (!Number.isSafeInteger(value) || value < 0 || value > limits.maxExpansion) {
      throw inputError(`四边扩展尺寸必须为 0–${limits.maxExpansion} 的整数像素`);
    }
    expansion[side] = value;
  }
  if (!Object.values(expansion).some((value) => value > 0)) throw inputError("请至少扩展一边");
  const width = prepared.width + expansion.left + expansion.right;
  const height = prepared.height + expansion.top + expansion.bottom;
  if (Math.max(width, height) > limits.maxEdge || width * height > limits.maxPixels) {
    throw inputError("目标画布超过本机请求保护上限，请减少扩展尺寸");
  }
  assertTarget({ width, height });
  if (engineKey !== ONEAPI_OUTPAINT_ENGINE_KEY && Math.max(width, height) !== OUTPAINT_LONG_EDGE) {
    throw inputError(`AI扩图固定使用${OUTPAINT_RESOLUTION}，旧四边请求的输出长边必须为${OUTPAINT_LONG_EDGE}px`);
  }
  return { expansion, height, prepared, source, width, originalSource, sourceResized: false };
}

function archiveOutpaintResult(input, normalized, result, scheduleSync) {
  if (!scheduleSync) return result;
  const archive = buildImageOutpaintArchive({ input, normalized, result });
  return { ...result, request: archive.preview, sync: scheduleSync(archive) };
}

export async function executeImageOutpaint(input, { imageClient = null, onProgress = null, scheduleSync = null } = {}) {
  if (!imageClient) throw Object.assign(new Error(IMAGE_OUTPAINT_PENDING_REASON), { statusCode: 409 });
  const normalized = await normalizeImageOutpaintInput(input);
  const engineKey = imageOutpaintEngineKey(input);
  if (engineKey === ONEAPI_OUTPAINT_ENGINE_KEY) {
    const result = await executeOneApiOutpaint(normalized, { imageClient, onProgress });
    result.upstream.metadata = { ...result.upstream.metadata, ...sourceAdaptationMetadata(normalized) };
    if (normalized.outpaintCanvas) result.request.outpaintCanvas = normalized.outpaintCanvas;
    return archiveOutpaintResult(input, normalized, result, scheduleSync);
  }
  const qwen = engineKey === QWEN_OUTPAINT_ENGINE_KEY;
  const model = qwen ? null : resolveImageOutpaintModel(input.outpaintModel);
  const modelIdentity = qwen ? { model: QWEN_OUTPAINT_WORKFLOW.model } : {
    model: model.fileName, outpaintModel: model.key, weightDtype: model.weightDtype,
  };
  if (imageClient.getObjectInfo) {
    try {
      if (qwen) verifyQwenOutpaintCapabilities(await imageClient.getObjectInfo(QWEN_OUTPAINT_REQUIRED_NODES));
      else verifyImageOutpaintCapabilities(await imageClient.getObjectInfo(IMAGE_OUTPAINT_REQUIRED_NODES), model.key);
    } catch (error) {
      throw Object.assign(new Error(`所选扩图模型暂不可用：${error.message}`), { statusCode: 409 });
    }
  }
  const { expansion, height, prepared, source, width } = normalized;
  const startedAt = Date.now();
  const progress = typeof onProgress === "function" ? ({ phase, promptId }) => onProgress({
    message: phase === "executing" ? "ComfyUI 正在补全扩展区域" : "扩图已提交 ComfyUI，正在排队",
    phase, promptId,
  }) : null;
  const result = await imageClient.generateImage({
    resolution: OUTPAINT_RESOLUTION,
    expansion,
    ...(!qwen ? { outpaintModel: model.key } : {}),
    height,
    images: [{ fileName: source.fileName, image_url: source.imageUrl }],
    preparedWidth: prepared.width, preparedHeight: prepared.height,
    sourceWidth: source.width, sourceHeight: source.height,
    width,
  }, { onProgress: progress, queueTimeoutMs: IMAGE_OUTPAINT_QUEUE_TIMEOUT_MS });
  if (result.metadata?.outputWidth !== width || result.metadata?.outputHeight !== height) {
    throw new Error("扩图实际输出尺寸与目标画布不一致");
  }
  const output = {
    durationMs: Date.now() - startedAt,
    images: result.images,
    request: {
      resolution: OUTPAINT_RESOLUTION,
      expansion, outputFormat: result.outputFormat, referenceImageCount: 1, size: `${width}x${height}`, syncMode: "local-only",
      ...modelIdentity,
      ...(normalized.outpaintCanvas ? { outpaintCanvas: normalized.outpaintCanvas } : {}),
    },
    sync: { generationId: null, status: "skipped" },
    upstream: { created: result.created, metadata: {
      ...result.metadata, ...modelIdentity,
      ...sourceAdaptationMetadata(normalized),
    }, outputFormat: result.outputFormat, transport: result.transport },
    workflow: {
      key: qwen ? QWEN_OUTPAINT_WORKFLOW.key : "image-outpaint", label: qwen ? QWEN_OUTPAINT_WORKFLOW.label : "AI 扩图",
      version: result.metadata?.workflowVersion || (qwen ? QWEN_OUTPAINT_WORKFLOW.version : null),
    },
  };
  return archiveOutpaintResult(input, normalized, output, scheduleSync);
}

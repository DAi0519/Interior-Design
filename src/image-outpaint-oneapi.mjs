/**
 * [INPUT]: 依赖 sharp、模型目录按官方 16px 网格/像素/边长约束映射的 Sunburst 尺寸真源、图片字节读取、服务层按比例适配后的真实输入尺寸/四边定位和注入的 OneAPI 编辑客户端
 * [OUTPUT]: 对外提供 Sunburst 扩图公开合同、提交输入尺寸/27个合法目标档位校验、透明画布/编辑遮罩、动态 Prompt 真源及真实产物/费用元数据
 * [POS]: src 的 API 扩图适配器，与 MaaS/ComfyUI 工作流并列，沿用单图工具结果边界
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createHash } from "node:crypto";
import sharp from "sharp";
import { loadImageBytes } from "./image-artifact.mjs";
import { readImageDimensions } from "./image-dimensions.mjs";
import { MODEL_CONFIGS } from "./model-config.mjs";

export const ONEAPI_OUTPAINT_ENGINE_KEY = "gptImage25Sunburst";
const MODEL = MODEL_CONFIGS[ONEAPI_OUTPAINT_ENGINE_KEY];
const VERSION = "2026-10-15.2";
const MAX_IMAGE_URL_LENGTH = 20 * 1024 * 1024;
const MAX_MASK_BYTES = 4 * 1024 * 1024;
const TARGET_SIZES = Object.entries(MODEL.sizes).flatMap(([ratio, sizes]) =>
  Object.entries(sizes).map(([resolution, size]) => {
    const [width, height] = size.split("x").map(Number);
    return { height, ratio, resolution, width };
  }),
);

function inputError(message) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function pngDataUrl(bytes) {
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

export function publicOneApiOutpaintConfig({ available = false, reason = "请先连接有 Sunburst 权限的 OneAPI Key" } = {}) {
  return {
    available,
    inputAlignment: 1,
    key: ONEAPI_OUTPAINT_ENGINE_KEY,
    label: MODEL.label,
    maxEdge: 3840,
    maxExpansion: 8192,
    maxInputEdge: 3840,
    maxPixels: 8294400,
    minInputEdge: 32,
    outputAlignment: 16,
    provider: "oneapi",
    quality: "medium",
    reason: available ? null : reason,
    sourceSizing: "original",
    targetSizes: TARGET_SIZES,
    workflow: { key: "image-outpaint-sunburst", label: MODEL.label, version: VERSION },
  };
}

export function oneApiOutpaintPreparedDimensions(source) {
  const width = Number(source?.width);
  const height = Number(source?.height);
  if (![width, height].every((value) => Number.isSafeInteger(value) && value >= 32 && value <= 3840)) {
    throw inputError("Sunburst 扩图输入宽高必须在本机 32–3840px 范围内，目标还需满足模型尺寸档位");
  }
  return { width, height };
}

export function assertOneApiOutpaintTarget({ width, height }) {
  if (!TARGET_SIZES.some((size) => size.width === width && size.height === height)) {
    throw inputError("Sunburst 目标尺寸需匹配支持的 1K/2K/4K 档位，请选择快捷比例后调整四边位置");
  }
  return { width, height };
}

// -------- 保持已适配输入尺寸：外围透明，输入所在矩形在遮罩中保持不透明 --------
export async function prepareOneApiOutpaintCanvas({ source, expansion, width, height }) {
  const input = Buffer.from(source.imageUrl.split(",")[1], "base64");
  const position = { left: expansion.left, top: expansion.top };
  const canvas = await sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input, ...position }]).png().toBuffer();
  const protectedRectangle = await sharp({ create: {
    width: source.width, height: source.height, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 },
  } }).png().toBuffer();
  const mask = await sharp({ create: { width, height, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 0 } } })
    .composite([{ input: protectedRectangle, ...position }]).png().toBuffer();
  const imageUrl = pngDataUrl(canvas);
  if (imageUrl.length > MAX_IMAGE_URL_LENGTH || mask.length > MAX_MASK_BYTES) {
    throw inputError("扩图画布或遮罩超过 API 请求容量，请缩小输入图片或目标档位");
  }
  return { canvas, imageUrl, mask, maskUrl: pngDataUrl(mask), placement: { ...position, width: source.width, height: source.height } };
}

export function buildOneApiOutpaintPrompt({ source, expansion, width, height }) {
  return [
    `Outpaint this image to fill the entire ${width} by ${height} canvas.`,
    `The original image occupies the rectangle at x=${expansion.left}, y=${expansion.top}, width=${source.width}, height=${source.height}.`,
    "Only generate in the transparent editable areas indicated by the mask. Preserve the original image's content, scale, camera perspective, geometry, materials, lighting and text inside the protected rectangle.",
    "Continue the existing scene naturally beyond its borders, with seamless edges and consistent perspective. Do not add frames, margins, solid-color borders, watermarks or unrelated objects. Return one complete image.",
  ].join(" ");
}

export async function executeOneApiOutpaint(normalized, { imageClient, onProgress = null } = {}) {
  if (typeof imageClient?.editImage !== "function") {
    throw Object.assign(new Error("Sunburst 扩图编辑客户端未配置"), { statusCode: 409 });
  }
  const { source, expansion, width, height } = normalized;
  const prepared = await prepareOneApiOutpaintCanvas(normalized);
  const startedAt = Date.now();
  onProgress?.({ phase: "executing", provider: "oneapi", message: "GPT Image 2.5 Sunburst 正在补全扩展区域" });
  const prompt = buildOneApiOutpaintPrompt(normalized);
  const result = await imageClient.editImage({
    images: [{ image_url: prepared.imageUrl }],
    mask: { image_url: prepared.maskUrl },
    model: MODEL.id,
    n: 1,
    output_format: "png",
    prompt,
    quality: "medium",
    response_format: "b64_json",
    size: `${width}x${height}`,
  });
  if (result.images?.length !== 1) throw new Error("Sunburst 扩图未返回唯一图片结果");
  const bytes = await loadImageBytes(result.images[0].url);
  const actual = readImageDimensions(bytes);
  if (!actual || actual.width !== width || actual.height !== height) {
    throw new Error(`Sunburst 扩图实际输出 ${actual ? `${actual.width}x${actual.height}` : "无法读取尺寸"} 与目标 ${width}x${height} 不一致`);
  }
  const metadata = {
    canvasSha256: digest(prepared.canvas), expansion, maskSha256: digest(prepared.mask),
    model: MODEL.id, outputHeight: actual.height, outputSha256: digest(bytes), outputWidth: actual.width,
    placement: prepared.placement, provider: "oneapi", quality: "medium", requestId: result.requestId || null,
    sourceHeight: source.height, sourceWidth: source.width, targetHeight: height, targetWidth: width,
    workflowId: "image-outpaint-sunburst", workflowVersion: VERSION,
  };
  return {
    durationMs: Date.now() - startedAt,
    images: [{ url: `data:image/${result.outputFormat || "png"};base64,${bytes.toString("base64")}` }],
    request: { expansion, model: MODEL.id, outputFormat: result.outputFormat || "png", quality: "medium", referenceImageCount: 1, size: `${width}x${height}`, syncMode: "local-only" },
    sync: { generationId: null, status: "skipped" },
    upstream: { created: result.created, metadata, outputFormat: result.outputFormat || "png", requestId: result.requestId, transport: result.transport, usageCost: result.usageCost || null },
    workflow: { key: "image-outpaint-sunburst", label: MODEL.label, version: VERSION },
  };
}

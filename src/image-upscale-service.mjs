/**
 * [INPUT]: 依赖单张参考图安全校验、图片超分工作流目录/4K-8K 尺寸规则、专用 ComfyUI 图片客户端与可选阶段回调
 * [OUTPUT]: 对外提供 executeImageUpscale、5 分钟独立排队时限、仅 8K 使用的 15 分钟执行时限、带 Prompt ID 的阶段进度，以及可被统一结果画廊消费的本机结果与真实目标尺寸元数据
 * [POS]: src 的图片超分应用服务，隔离页面输入、工作流参数、分辨率级时限与 ComfyUI 传输层
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import {
  imageUpscaleTargetDimensions,
  imageUpscaleWorkflow,
} from "./image-upscale-workflow.mjs";
import { normalizeReferenceImages } from "./reference-image.mjs";

export const IMAGE_UPSCALE_8K_TIMEOUT_MS = 15 * 60 * 1000;
export const IMAGE_UPSCALE_QUEUE_TIMEOUT_MS = 5 * 60 * 1000;

export function imageUpscaleExecutionTimeoutMs(resolution) {
  return String(resolution || "") === "8K"
    ? IMAGE_UPSCALE_8K_TIMEOUT_MS
    : undefined;
}

export async function executeImageUpscale(input, { imageClient, onProgress = null }) {
  const [source] = normalizeReferenceImages(input.referenceImages, { maxCount: 1 });
  if (!source) {
    const error = new Error("图片超分需要且只允许 1 张待处理图片");
    error.statusCode = 400;
    throw error;
  }
  const workflow = imageUpscaleWorkflow(input.upscaleWorkflowKey);
  const target = imageUpscaleTargetDimensions(source, input.resolution);
  const resolution = String(input.resolution);
  const clientOptions = {
    executionTimeoutMs: imageUpscaleExecutionTimeoutMs(resolution),
    queueTimeoutMs: IMAGE_UPSCALE_QUEUE_TIMEOUT_MS,
  };
  if (typeof onProgress === "function") {
    onProgress({
      message: `正在提交 ${resolution} 超分任务`,
      phase: "submitting",
    });
    clientOptions.onProgress = ({ phase, promptId }) => {
      const promptLabel = promptId ? `（Prompt ID：${promptId}）` : "";
      onProgress({
        message: phase === "executing"
          ? `ComfyUI 正在执行 ${resolution} 超分${promptLabel}`
          : `${resolution} 超分已提交 ComfyUI，正在排队${promptLabel}`,
        phase,
        promptId,
      });
    };
  }
  const startedAt = Date.now();
  const result = await imageClient.generateImage({
    height: target.height,
    images: [{ fileName: source.fileName, image_url: source.imageUrl }],
    prompt: "",
    resolution,
    upscaleWorkflowKey: workflow.key,
    width: target.width,
  }, clientOptions);
  const outputWidth = result.metadata?.outputWidth || target.width;
  const outputHeight = result.metadata?.outputHeight || target.height;
  return {
    durationMs: Date.now() - startedAt,
    images: result.images,
    request: {
      outputFormat: result.outputFormat,
      referenceImageCount: 1,
      resolution: input.resolution,
      size: `${outputWidth}x${outputHeight}`,
      syncMode: "local-only",
    },
    sync: { generationId: null, status: "skipped" },
    upstream: {
      created: result.created,
      metadata: result.metadata,
      outputFormat: result.outputFormat,
      transport: result.transport,
    },
    workflow: { key: workflow.key, label: workflow.label, version: workflow.version },
  };
}

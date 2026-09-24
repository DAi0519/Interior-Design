/**
 * [INPUT]: 依赖 Flux 固定采样步数及 SeedVR2 默认工作流键
 * [OUTPUT]: 对外提供普通 Flux 工作流身份、默认模型参数及统一归档元数据
 * [POS]: src 的 Flux 工作流配置真源，把稳定参数合同与节点图编排解耦，并供应用服务复用
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { IMAGE_UPSCALE_DEFAULT_WORKFLOW_KEY } from "./image-upscale-workflow.mjs";

export const AI_TEXTURE_WORKFLOW = Object.freeze({
  id: "ai-texture-enhancement",
  label: "Flux2 Klein",
  model: "flux-2-klein-9b-fp8.safetensors",
  outputNodeId: "72",
  version: "2026-09-16.1",
});

export const AI_TEXTURE_DEFAULTS = Object.freeze({
  model: AI_TEXTURE_WORKFLOW.model,
  steps: 7,
});

export function buildAiTextureWorkflowMetadata({
  actualOutputHeight,
  actualOutputWidth,
  artifactKey,
  executionDurationMs,
  generationRequest,
  height,
  negativePromptMode,
  outputFilename,
  outputSha256,
  promptId,
  queueDurationMs,
  resolution,
  seed,
  width,
}) {
  const upscaleResolution = String(generationRequest?.upscale_resolution || "") || null;
  return {
    artifactKey,
    engine: "comfyui",
    executionDurationMs,
    inferenceHeight: height,
    inferenceWidth: width,
    model: AI_TEXTURE_DEFAULTS.model,
    negativePromptMode,
    outputFilename,
    outputHeight: actualOutputHeight || Number(generationRequest?.upscale_height) || height,
    outputSha256,
    outputWidth: actualOutputWidth || Number(generationRequest?.upscale_width) || width,
    promptId,
    queueDurationMs,
    resolution,
    seed,
    steps: AI_TEXTURE_DEFAULTS.steps,
    upscaleResolution,
    upscaleWorkflowKey: upscaleResolution
      ? generationRequest?.upscale_workflow_key || IMAGE_UPSCALE_DEFAULT_WORKFLOW_KEY
      : null,
    workflowId: AI_TEXTURE_WORKFLOW.id,
    workflowVersion: AI_TEXTURE_WORKFLOW.version,
  };
}

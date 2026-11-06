/**
 * [INPUT]: 依赖普通Flux固定采样、效果图美化六预设元数据及KS直入后置超分/历史攸行身份与正式尺寸和元数据工厂
 * [OUTPUT]: 对外提供AI_TEXTURE_WORKFLOW/DEFAULTS、aiTexturePostUpscaleRequest冻结KS源尺寸/版本与正式计划，及buildAiTextureWorkflowMetadata的Flux/美化核心与后置超分独立元数据
 * [POS]: src 的 Flux 工作流配置真源，把稳定参数合同与节点图编排解耦，并供应用服务复用
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { FLUX_POST_UPSCALE_WORKFLOW_KEY, imageUpscaleTargetDimensions, imageUpscaleWorkflow, imageUpscaleWorkflowMetadata } from "./image-upscale-workflow.mjs";
import { effectBeautificationMetadata } from "./effect-beautification-workflow.mjs";

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

export function aiTexturePostUpscaleRequest(generationRequest, width, height) {
  const resolution = String(generationRequest?.upscale_resolution || "");
  if (!resolution) return null;
  const workflow = imageUpscaleWorkflow(generationRequest.upscale_workflow_key || FLUX_POST_UPSCALE_WORKFLOW_KEY);
  const version = generationRequest.upscale_workflow_version ?? workflow.version;
  if (version !== workflow.version) throw Object.assign(new Error("后置超分工作流版本已变化，请刷新配置后重新运行"), { statusCode: 409, retryable: false });
  const sourceWidth = Number(generationRequest.upscale_source_width ?? width);
  const sourceHeight = Number(generationRequest.upscale_source_height ?? height);
  if (sourceWidth !== width || sourceHeight !== height) {
    throw Object.assign(new Error("后置超分冻结源尺寸与Flux中间成图不一致"), { statusCode: 400, retryable: false });
  }
  const target = { width: Number(generationRequest.upscale_width), height: Number(generationRequest.upscale_height) };
  if (workflow.areaCap) {
    const expected = imageUpscaleTargetDimensions({ width: sourceWidth, height: sourceHeight }, resolution, workflow.key);
    if (expected.width !== target.width || expected.height !== target.height) {
      throw Object.assign(new Error("KS后置超分交付尺寸与真实中间成图比例不一致"), { statusCode: 400, retryable: false });
    }
  }
  return { ...target, generationRequest: { upscaleWorkflowKey: workflow.key, upscaleWorkflowVersion: version,
    resolution, sourceWidth, sourceHeight } };
}

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
  const stage = aiTexturePostUpscaleRequest(generationRequest, width, height);
  const postUpscale = stage ? imageUpscaleWorkflowMetadata({ ...stage, actualOutputHeight, actualOutputWidth,
    artifactKey, executionDurationMs, outputFilename, outputSha256, promptId, queueDurationMs, seed,
    resolution: stage.generationRequest.resolution }) : null;
  if (postUpscale?.executionPolicyVersion && ((actualOutputWidth != null && actualOutputWidth !== stage.width)
    || (actualOutputHeight != null && actualOutputHeight !== stage.height))) {
    throw Object.assign(new Error("KS后置超分实际成品尺寸与目标画布不一致"), { statusCode: 502, retryable: false, code: "output_dimensions", details: { promptId } });
  }
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
    upscaleWorkflowKey: postUpscale?.workflowId || null,
    ...(postUpscale ? { upscaleWorkflowVersion: postUpscale.workflowVersion,
      upscaleWorkflowLabel: imageUpscaleWorkflow(postUpscale.workflowId).shortLabel, postUpscale } : {}),
    workflowId: AI_TEXTURE_WORKFLOW.id,
    workflowVersion: AI_TEXTURE_WORKFLOW.version,
    ...(generationRequest?.effect_beautification
      ? effectBeautificationMetadata(generationRequest) : {}),
  };
}

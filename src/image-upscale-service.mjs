/**
 * [INPUT]: 依赖真实单图安全校验、KS固定5K或20MP整图计划/冻结版本、专用ComfyUI客户端与阶段回调
 * [OUTPUT]: 提供主/Beta共用且缺能力即不可用的整图目录和executeImageUpscale、5分钟排队/KS或8K的15分钟执行、Prompt追踪、最终尺寸核验及KS异常不自动重提
 * [POS]: src 的图片超分应用服务，隔离页面输入、工作流参数、分辨率级时限与 ComfyUI 传输层
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import {
  createImageUpscaleWorkflow,
  publicImageUpscaleConfig,
  imageUpscaleTargetDimensions,
  imageUpscaleExecutionPlan,
  imageUpscaleWorkflow,
} from "./image-upscale-workflow.mjs";
import { normalizeReferenceImages } from "./reference-image.mjs";

export const IMAGE_UPSCALE_8K_TIMEOUT_MS = 15 * 60 * 1000;
export const IMAGE_UPSCALE_KS_TIMEOUT_MS = 15 * 60 * 1000;
export const IMAGE_UPSCALE_QUEUE_TIMEOUT_MS = 5 * 60 * 1000;

export function imageUpscaleExecutionTimeoutMs(resolution, executionPlan = null) {
  if (executionPlan?.policyVersion) return IMAGE_UPSCALE_KS_TIMEOUT_MS;
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
  if (input.upscaleWorkflowVersion && input.upscaleWorkflowVersion !== workflow.version) {
    throw Object.assign(new Error("超分工作流版本已变化，请刷新配置后重新运行"), { statusCode: 409, retryable: false });
  }
  const target = imageUpscaleTargetDimensions(source, input.resolution, workflow.key);
  const resolution = String(input.resolution);
  const plan = imageUpscaleExecutionPlan({ ...target, resolution, workflowKey: workflow.key,
    sourceWidth: source.width, sourceHeight: source.height });
  const clientOptions = {
    executionTimeoutMs: imageUpscaleExecutionTimeoutMs(resolution, plan),
    queueTimeoutMs: IMAGE_UPSCALE_QUEUE_TIMEOUT_MS,
  };
  let acceptedPromptId = null;
  if (typeof onProgress === "function" || plan.policyVersion) {
    onProgress?.({
      message: `正在提交 ${resolution} 超分任务${plan.policyVersion ? "（整图推理）" : ""}`,
      phase: "submitting",
    });
    clientOptions.onProgress = ({ phase, promptId }) => {
      acceptedPromptId = promptId || acceptedPromptId;
      const promptLabel = promptId ? `（Prompt ID：${promptId}）` : "";
      onProgress?.({
        message: phase === "executing"
          ? `ComfyUI 正在执行 ${resolution} 超分${promptLabel}`
          : `${resolution} 超分已提交 ComfyUI，正在排队${promptLabel}`,
        phase,
        promptId,
      });
    };
  }
  const startedAt = Date.now();
  let result;
  try { result = await imageClient.generateImage({
    height: target.height,
    images: [{ fileName: source.fileName, image_url: source.imageUrl }],
    prompt: "",
    resolution,
    sourceHeight: source.height,
    sourceWidth: source.width,
    upscaleWorkflowKey: workflow.key,
    upscaleWorkflowVersion: workflow.version,
    width: target.width,
  }, clientOptions); }
  catch (error) {
    // 超时未证明远端失败；保留同一Prompt，KS异常不自动重新提交GPU。
    if (plan.policyVersion || ["execution_timeout", "queue_timeout"].includes(error?.code)) {
      error.retryable = false;
      if (acceptedPromptId) error.details = { ...error.details, promptId: acceptedPromptId };
    }
    throw error;
  }
  const outputWidth = result.metadata?.outputWidth || target.width;
  const outputHeight = result.metadata?.outputHeight || target.height;
  if (plan.policyVersion && (!Number.isInteger(result.metadata?.outputWidth)
    || !Number.isInteger(result.metadata?.outputHeight) || outputWidth !== target.width || outputHeight !== target.height)) {
    throw Object.assign(new Error("整图超分最终输出尺寸与目标画布不一致"), {
      statusCode: 502, retryable: false, code: "output_dimensions", details: { promptId: result.metadata?.promptId },
    });
  }
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

// -------- 直接从执行图推导节点合同，所选模型失效不影响其他候选 --------
function capabilityGraphs(workflow) {
  const resolution = workflow.resolutions[0];
  const width = resolution.scale ? 1024 : resolution.longEdge;
  const graphs = [createImageUpscaleWorkflow({ artifactKey: "beta-capability", imageBase64: "", seed: 4,
    generationRequest: { upscaleWorkflowKey: workflow.key, resolution: resolution.key },
    width, height: resolution.scale ? 1024 : width / 2 })];
  if (imageUpscaleWorkflow(workflow.key).areaCap) graphs.push(createImageUpscaleWorkflow({
    artifactKey: "upscale-area-cap-capability", imageBase64: "", seed: 4,
    generationRequest: { upscaleWorkflowKey: workflow.key, resolution: "6K", sourceWidth: 1024, sourceHeight: 1024 }, width: 6144, height: 6144,
  }));
  return graphs;
}

function verifyGraphCapabilities(graph, objectInfo) {
  for (const node of Object.values(graph)) {
    const schema = objectInfo[node.class_type]?.input;
    if (!schema) throw new Error(`缺少超分节点：${node.class_type}`);
    for (const field of Object.keys(schema.required || {})) {
      if (!(field in node.inputs)) throw new Error(`超分节点接口不兼容：${node.class_type}.${field}`);
    }
    for (const [field, value] of Object.entries(node.inputs)) {
      const specification = schema.required?.[field] || schema.optional?.[field];
      if (!specification) throw new Error(`超分节点接口不兼容：${node.class_type}.${field}`);
      if (Array.isArray(value)) continue;
      const choices = Array.isArray(specification[0]) ? specification[0]
        : specification[0] === "COMBO" ? specification[1]?.options : null;
      if (choices && !choices.includes(value)) {
        throw new Error(`超分节点配置尚未就绪：${node.class_type}.${field}`);
      }
    }
  }
}

export async function readImageUpscaleConfig(imageClient) {
  const config = publicImageUpscaleConfig();
  const unavailable = reason => ({ ...config, comfyUi: { available: false, reason, version: null },
    workflows: config.workflows.map(workflow => ({ ...workflow, available: false, reason })) });
  if (!imageClient?.checkHealth) return unavailable("ComfyUI超分服务未连接");
  try {
    if (!imageClient.getObjectInfo) return unavailable("ComfyUI 超分工作流尚未连接或不可用");
    const graphs = config.workflows.map(capabilityGraphs);
    const classes = [...new Set(graphs.flat().flatMap(graph => Object.values(graph).map(node => node.class_type)))];
    const [health, schemas] = await Promise.all([imageClient.checkHealth(),
      Promise.allSettled(classes.map(type => imageClient.getObjectInfo([type])))]);
    if (!health?.available) return unavailable(health?.reason || health?.error || "ComfyUI超分连接不可用");
    const objectInfo = Object.assign({}, ...schemas.filter(result => result.status === "fulfilled").map(result => result.value));
    return { ...config, comfyUi: health, workflows: config.workflows.map((workflow, index) => {
      try {
        for (const graph of graphs[index]) verifyGraphCapabilities(graph, objectInfo);
        return { ...workflow, available: true, reason: null };
      } catch (error) { return { ...workflow, available: false, reason: error.message }; }
    }) };
  } catch { return unavailable("ComfyUI超分连接或能力读取失败，请检查连接后重试"); }
}

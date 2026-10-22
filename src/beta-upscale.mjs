/**
 * [INPUT]: 依赖六套图片超分执行图/安全目录/真实尺寸真源、参考图字节校验与专用 ComfyUI 只读健康及节点接口
 * [OUTPUT]: 对外提供 Beta 超分安全目录、无缓存能力读取、普通长边与KS原图2倍/4K/6K逐档冻结输入、显示标签与建档前真实尺寸核验
 * [POS]: src 的 Beta AI超分合同边界，复用正式超分执行图与尺寸规则，不复制推理或归档逻辑
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import {
  createImageUpscaleWorkflow,
  imageUpscaleTargetDimensions,
  imageUpscaleWorkflow,
  publicImageUpscaleConfig,
} from "./image-upscale-workflow.mjs";
import { normalizeReferenceImages } from "./reference-image.mjs";

function inputError(message) {
  return Object.assign(new Error(message), { statusCode: 400, retryable: false });
}

function resolveWorkflow(key) {
  try { return imageUpscaleWorkflow(key); }
  catch { throw inputError("请选择支持的超分工作流"); }
}

export function publicBetaUpscaleConfig(rawConfig = {}) {
  const config = publicImageUpscaleConfig();
  return {
    ...config,
    defaultWorkflowKeys: [config.defaultWorkflowKey],
    workflows: config.workflows.map((workflow) => {
      const status = Array.isArray(rawConfig.workflows)
        ? rawConfig.workflows.find((candidate) => candidate.key === workflow.key) : null;
      const available = typeof status?.available === "boolean"
        ? status.available : rawConfig.comfyUi?.available === true;
      return { ...workflow, available, reason: available ? null
        : String(status?.reason || rawConfig.comfyUi?.reason || "ComfyUI 超分工作流尚未连接或不可用").slice(0, 500) };
    }),
  };
}

// -------- 直接从执行图推导节点合同，所选模型失效不影响其他候选 --------
function capabilityGraph(workflow) {
  const resolution = workflow.resolutions[0];
  const width = resolution.scale ? 1024 : resolution.longEdge;
  return createImageUpscaleWorkflow({ artifactKey: "beta-capability", imageBase64: "", seed: 4,
    generationRequest: { upscaleWorkflowKey: workflow.key, resolution: resolution.key },
    width, height: resolution.scale ? 1024 : width / 2 });
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

export async function readBetaUpscaleConfig(imageClient) {
  const config = publicImageUpscaleConfig();
  if (!imageClient?.checkHealth || !imageClient?.getObjectInfo) return publicBetaUpscaleConfig();
  const graphs = config.workflows.map((workflow) => capabilityGraph(workflow));
  const classTypes = [...new Set(graphs.flatMap((graph) => Object.values(graph).map((node) => node.class_type)))];
  try {
    const [health, schemas] = await Promise.all([imageClient.checkHealth(),
      Promise.allSettled(classTypes.map((type) => imageClient.getObjectInfo([type])))]);
    if (!health?.available) return publicBetaUpscaleConfig();
    const objectInfo = Object.assign({}, ...schemas.filter((result) => result.status === "fulfilled").map((result) => result.value));
    const workflows = config.workflows.map((workflow, index) => {
      try {
        verifyGraphCapabilities(graphs[index], objectInfo);
        return { key: workflow.key, available: true };
      } catch (error) {
        return { key: workflow.key, available: false, reason: error.message };
      }
    });
    return publicBetaUpscaleConfig({ workflows });
  } catch {
    return publicBetaUpscaleConfig({ comfyUi: { available: false, reason: "ComfyUI 超分连接或能力读取失败，请检查连接后重试" } });
  }
}

export function normalizeBetaUpscaleInput(input = {}) {
  const workflow = resolveWorkflow(input.upscaleWorkflowKey);
  if (input.modelKey !== undefined && input.modelKey !== workflow.key) {
    throw inputError("出图模型与所选超分工作流不一致");
  }
  const resolution = input.resolution;
  if (!workflow.resolutions.some((candidate) => candidate.key === resolution)) {
    throw inputError(workflow.resolutions.some((candidate) => candidate.scale)
      ? "KS 超分只支持原图2倍、4K 或 6K" : "图片超分只支持 4K、6K 或 8K");
  }
  if (input.referenceImages?.length || input.styleReferenceImages?.length) {
    throw inputError("Beta超分请仅提交飞书样本ID，不接受重传原图或风格参考图");
  }
  return { featureMode: "imageUpscale", modelKey: workflow.key,
    upscaleWorkflowKey: workflow.key, resolution };
}

export function verifyBetaUpscaleBatch(batch, rawConfig) {
  if (batch.featureMode !== "imageUpscale") return;
  const workflows = publicBetaUpscaleConfig(rawConfig).workflows;
  for (const item of batch.items) {
    const workflow = resolveWorkflow(item.input.upscaleWorkflowKey);
    const status = workflows.find((candidate) => candidate.key === workflow.key);
    if (!status?.available) throw Object.assign(new Error(`${workflow.displayLabel || workflow.label} 暂不可用：${status?.reason || "目录不可用"}`),
      { statusCode: 409, retryable: false });
    item.modelLabel = workflow.displayLabel || workflow.label;
    item.upscaleWorkflowKey = workflow.key;
  }
}

export function validateBetaUpscaleSource(input) {
  const [source] = normalizeReferenceImages(input.referenceImages, { maxCount: 1 });
  if (!source) throw inputError("图片超分需要且只允许 1 张待处理图片");
  return imageUpscaleTargetDimensions(source, input.resolution, input.upscaleWorkflowKey);
}

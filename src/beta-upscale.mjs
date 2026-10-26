/**
 * [INPUT]: 依赖六套超分尺寸/安全目录、image-upscale-service共用的整图/分块能力读取及参考图真实字节校验
 * [OUTPUT]: 对外提供 Beta 超分目录/版本冻结与执行前阻断；仅受信失败批次可保留白名单旧KS版本进入已有附件恢复，不能重新生成
 * [POS]: src 的 Beta AI超分合同边界，复用正式超分执行图与尺寸规则，不复制推理或归档逻辑
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import {
  imageUpscaleTargetDimensions,
  imageUpscaleWorkflow,
  publicImageUpscaleConfig,
} from "./image-upscale-workflow.mjs";
import { readImageUpscaleConfig } from "./image-upscale-service.mjs";
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

// -------- 主工作台与Beta共用同一套执行图能力门禁 --------
export async function readBetaUpscaleConfig(imageClient) {
  if (!imageClient?.checkHealth || !imageClient?.getObjectInfo) return publicBetaUpscaleConfig();
  return publicBetaUpscaleConfig(await readImageUpscaleConfig(imageClient));
}

export function normalizeBetaUpscaleInput(input = {}, { recoveringLegacy = false } = {}) {
  const workflow = resolveWorkflow(input.upscaleWorkflowKey);
  const legacyVersion = recoveringLegacy && workflow.key.startsWith("ks_")
    && (["2026-10-21.1", "2026-10-26.1"].includes(input.upscaleWorkflowVersion)
      || input.upscaleWorkflowVersion === "2026-10-20.1" && input.resolution === "2X");
  if (!legacyVersion) verifyFrozenVersion(input, workflow);
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
    upscaleWorkflowKey: workflow.key,
    upscaleWorkflowVersion: legacyVersion ? input.upscaleWorkflowVersion : workflow.version, resolution };
}

function verifyFrozenVersion(input, workflow) {
  if (input.upscaleWorkflowVersion !== undefined && input.upscaleWorkflowVersion !== workflow.version) {
    throw Object.assign(new Error("超分工作流版本已变化，请重新确认配置后运行"), { statusCode: 409, retryable: false });
  }
}

export function verifyBetaUpscaleBatch(batch, rawConfig) {
  if (batch.featureMode !== "imageUpscale") return;
  const workflows = publicBetaUpscaleConfig(rawConfig).workflows;
  for (const item of batch.items) {
    const workflow = resolveWorkflow(item.input.upscaleWorkflowKey);
    verifyFrozenVersion(item.input, workflow);
    const status = workflows.find((candidate) => candidate.key === workflow.key);
    if (!status?.available) throw Object.assign(new Error(`${workflow.displayLabel || workflow.label} 暂不可用：${status?.reason || "目录不可用"}`),
      { statusCode: 409, retryable: false });
    item.modelLabel = workflow.displayLabel || workflow.label;
    item.upscaleWorkflowKey = workflow.key;
  }
}

export function validateBetaUpscaleSource(input) {
  verifyFrozenVersion(input, resolveWorkflow(input.upscaleWorkflowKey));
  const [source] = normalizeReferenceImages(input.referenceImages, { maxCount: 1 });
  if (!source) throw inputError("图片超分需要且只允许 1 张待处理图片");
  return imageUpscaleTargetDimensions(source, input.resolution, input.upscaleWorkflowKey);
}

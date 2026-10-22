/**
 * [INPUT]: 依赖 Flux/Qwen/Sunburst 扩图模型真源、固定2K合同与运行时只读能力目录，接收 Beta 工作流键及固定构图参数
 * [OUTPUT]: 对外提供四工作流脱敏目录、严格生成输入归一化与入队前可用性核验，冻结真实模型身份并拒绝客户端覆盖
 * [POS]: src 的 Beta扩图合同边界，与正式扩图共用模型及执行链路，不复制推理或归档逻辑
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { IMAGE_OUTPAINT_MODELS } from "./image-outpaint-workflow.mjs";
import { QWEN_OUTPAINT_ENGINE_KEY, QWEN_OUTPAINT_WORKFLOW } from "./image-outpaint-qwen.mjs";
import { ONEAPI_OUTPAINT_ENGINE_KEY } from "./image-outpaint-oneapi.mjs";
import { MODEL_CONFIGS } from "./model-config.mjs";
import { OUTPAINT_RESOLUTION, assertOutpaintResolution } from "../public/image-outpaint-geometry.js";

const fluxWorkflow = (key, model) => ({ key, label: model.label, provider: "comfyui", engine: "comfyui", model: model.key });
export const BETA_OUTPAINT_WORKFLOWS = Object.freeze([
  fluxWorkflow("outpaint-flux-onereward", IMAGE_OUTPAINT_MODELS.find((model) => model.key === "oneRewardFp8")),
  fluxWorkflow("outpaint-flux-dev", IMAGE_OUTPAINT_MODELS.find((model) => model.key === "fluxFillDev")),
  { key: "outpaint-qwen-2511", label: QWEN_OUTPAINT_WORKFLOW.label, provider: "comfyui", engine: QWEN_OUTPAINT_ENGINE_KEY, model: QWEN_OUTPAINT_ENGINE_KEY },
  { key: "outpaint-sunburst", label: MODEL_CONFIGS[ONEAPI_OUTPAINT_ENGINE_KEY].label, provider: "oneapi", engine: ONEAPI_OUTPAINT_ENGINE_KEY, model: ONEAPI_OUTPAINT_ENGINE_KEY },
].map(Object.freeze));
const RATIOS = Object.freeze(["original", "1:1", "4:3", "16:9", "3:4", "9:16"]);
const SCALES = Object.freeze([1 / 1.5, 1 / 2, 1 / 3]);
const DEFAULT_KEYS = Object.freeze(["outpaint-flux-onereward", "outpaint-qwen-2511"]);

function inputError(message) { return Object.assign(new Error(message), { statusCode: 400, retryable: false }); }
function resolveWorkflow(key) {
  const workflow = BETA_OUTPAINT_WORKFLOWS.find((candidate) => candidate.key === key);
  if (!workflow) throw inputError("请选择支持的扩图工作流");
  return workflow;
}

export function publicBetaOutpaintConfig(rawConfig = {}) {
  const engines = Array.isArray(rawConfig.engines) ? rawConfig.engines : [];
  const workflows = BETA_OUTPAINT_WORKFLOWS.map((workflow) => {
    const engine = engines.find((candidate) => candidate.key === workflow.engine)
      || (workflow.engine === "comfyui" ? rawConfig : null);
    const status = workflow.engine === "comfyui"
      ? engine?.models?.find((model) => model.key === workflow.model) : engine;
    const available = Boolean(engine?.available && status?.available);
    return { ...workflow, available, reason: available ? null
      : String(status?.reason || engine?.reason || "扩图工作流尚未配置或不可用").slice(0, 500) };
  });
  return { workflows, resolution: OUTPAINT_RESOLUTION, ratios: RATIOS,
    scales: SCALES, defaultWorkflowKeys: DEFAULT_KEYS };
}

export function normalizeBetaOutpaintInput(input = {}) {
  const workflow = resolveWorkflow(input.outpaintWorkflowKey);
  assertOutpaintResolution(input.resolution);
  if (input.expansion !== undefined) throw inputError("Beta扩图仅使用固定画幅构图，不接受四边像素扩展");
  if (input.outpaintEngine !== undefined && input.outpaintEngine !== workflow.engine) {
    throw inputError("扩图引擎与所选工作流不一致");
  }
  const flux = workflow.engine === "comfyui";
  if (input.modelKey !== undefined && input.modelKey !== workflow.model) {
    throw inputError("出图模型与所选扩图工作流不一致");
  }
  if (input.outpaintModel !== undefined && input.outpaintModel !== (flux ? workflow.model : undefined)) {
    throw inputError("扩图模型与所选工作流不一致");
  }
  const canvas = input.outpaintCanvas === undefined ? {} : input.outpaintCanvas;
  if (!canvas || typeof canvas !== "object" || Array.isArray(canvas)) throw inputError("扩图画布设置无效");
  assertOutpaintResolution(canvas.resolution);
  const ratio = canvas.ratio ?? "original";
  const scale = canvas.scale ?? SCALES[0];
  if (!RATIOS.includes(ratio)) throw inputError("请选择支持的扩图画幅");
  if (!SCALES.includes(scale)) throw inputError("Beta扩图仅支持1.5倍、2倍或3倍扩图");
  if (canvas.position !== undefined && (canvas.position?.x !== 0.5 || canvas.position?.y !== 0.5)) {
    throw inputError("Beta扩图固定居中构图");
  }
  if (input.referenceImages?.length || input.styleReferenceImages?.length) {
    throw inputError("Beta扩图请仅提交飞书样本ID，不接受重传原图或风格参考图");
  }
  return {
    featureMode: "imageOutpaint", outpaintWorkflowKey: workflow.key,
    outpaintEngine: workflow.engine, ...(flux ? { outpaintModel: workflow.model } : {}),
    modelKey: workflow.model, resolution: OUTPAINT_RESOLUTION,
    outpaintCanvas: { ratio, resolution: OUTPAINT_RESOLUTION, scale, position: { x: 0.5, y: 0.5 } },
  };
}

export function verifyBetaOutpaintBatch(batch, rawConfig) {
  if (batch.featureMode !== "imageOutpaint") return;
  const workflows = publicBetaOutpaintConfig(rawConfig).workflows;
  for (const item of batch.items) {
    const workflow = resolveWorkflow(item.input.outpaintWorkflowKey);
    const status = workflows.find((candidate) => candidate.key === workflow.key);
    if (!status?.available) throw Object.assign(new Error(`${workflow.label} 暂不可用：${status?.reason || "目录不可用"}`),
      { statusCode: 409, retryable: false });
    item.modelLabel = workflow.label;
    item.outpaintWorkflowKey = workflow.key;
  }
}

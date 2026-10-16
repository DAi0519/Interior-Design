/**
 * [INPUT]: 依赖三引擎扩图身份与真实 Prompt 真源、批次合同，以及校验后的源图/产物和既有飞书调度 payload
 * [OUTPUT]: 对外提供独立扩图模型归档目录与三引擎共用归档投影，保留源图、画布、实际模型/产物/费用与 Prompt 来源事实
 * [POS]: src 的扩图归档适配层，被扩图应用服务与飞书 Schema 共用，不扩展通用生图目录或执行模型
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { normalizeGenerationBatch } from "./generation-batch.mjs";
import { MODEL_CONFIGS } from "./model-config.mjs";
import { ONEAPI_OUTPAINT_ENGINE_KEY, buildOneApiOutpaintPrompt } from "./image-outpaint-oneapi.mjs";
import { QWEN_OUTPAINT_ENGINE_KEY, QWEN_OUTPAINT_PROMPT, QWEN_OUTPAINT_WORKFLOW } from "./image-outpaint-qwen.mjs";
import { IMAGE_OUTPAINT_MODELS, IMAGE_OUTPAINT_WORKFLOW, resolveImageOutpaintModel } from "./image-outpaint-workflow.mjs";

export const IMAGE_OUTPAINT_ARCHIVE_MODEL_LABELS = Object.freeze([
  ...IMAGE_OUTPAINT_MODELS.map((model) => model.label), QWEN_OUTPAINT_WORKFLOW.label,
]);

function identityFor(input) {
  const engine = input.outpaintEngine ?? "comfyui";
  if (engine === QWEN_OUTPAINT_ENGINE_KEY) return {
    engine, modelLabel: QWEN_OUTPAINT_WORKFLOW.label, provider: "comfyui", workflow: QWEN_OUTPAINT_WORKFLOW,
    model: QWEN_OUTPAINT_WORKFLOW.model,
  };
  if (engine === ONEAPI_OUTPAINT_ENGINE_KEY) return {
    engine, modelLabel: MODEL_CONFIGS[engine].label, provider: "oneapi",
    model: MODEL_CONFIGS[engine].id,
  };
  if (engine !== "comfyui") throw new TypeError("不支持的扩图归档引擎");
  const model = resolveImageOutpaintModel(input.outpaintModel);
  return { engine, modelLabel: model.label, provider: "comfyui", workflow: IMAGE_OUTPAINT_WORKFLOW, model: model.fileName };
}

// -------- 固定或动态 Prompt 均读取执行真源；Janus 节点正文未返回时留空 --------
function promptFor(identity, normalized) {
  if (identity.engine === QWEN_OUTPAINT_ENGINE_KEY) return {
    finalPrompt: QWEN_OUTPAINT_PROMPT, promptSource: "image-outpaint-qwen.QWEN_OUTPAINT_PROMPT",
    finalPromptCaptured: true,
  };
  if (identity.engine === ONEAPI_OUTPAINT_ENGINE_KEY) return {
    finalPrompt: buildOneApiOutpaintPrompt(normalized), promptSource: "image-outpaint-oneapi.buildOneApiOutpaintPrompt",
    finalPromptCaptured: true,
  };
  return {
    finalPrompt: "", finalPromptCaptured: false,
    promptSource: "Janus-Pro-1B 内部生成；当前 ComfyUI 结果未返回正文",
  };
}

function actualRatio(width, height) {
  function gcd(a, b) { return b ? gcd(b, a % b) : a; }
  const divisor = gcd(width, height);
  return `${width / divisor}:${height / divisor}`;
}

export function buildImageOutpaintArchive({ input = {}, normalized, result }) {
  if (!normalized?.source || !result?.images?.[0]?.url) throw new TypeError("扩图归档缺少实际源图或结果");
  const identity = identityFor(input);
  const { source, prepared, width, height, expansion, originalSource, sourceResized, outpaintCanvas } = normalized;
  const prompt = promptFor(identity, normalized);
  const metadata = result.upstream?.metadata || {};
  const preview = {
    ...result.request,
    outputFormat: result.upstream?.outputFormat || result.request.outputFormat || "png",
    provider: identity.provider,
    ratio: outpaintCanvas?.ratio || actualRatio(width, height),
    referenceImageCount: 1, resolution: outpaintCanvas?.resolution || "custom",
    size: `${width}x${height}`, sizeMode: outpaintCanvas ? "preset" : "custom",
    syncMode: "lark", transport: result.upstream?.transport || (identity.provider === "oneapi" ? "images-edits" : "comfyui-workflow"),
  };
  return {
    durationMs: result.durationMs,
    finalPrompt: prompt.finalPrompt, sourcePrompt: "", modelLabel: identity.modelLabel, preview,
    referenceImages: [{ fileName: source.fileName, imageUrl: source.imageUrl, mimeType: source.mimeType }],
    resultImage: result.images[0],
    workflow: {
      ...normalizeGenerationBatch(input), ...metadata,
      engine: identity.engine, feature: "image-outpaint", provider: identity.provider, model: identity.model,
      workflowId: result.workflow?.key || identity.workflow?.key,
      workflowVersion: metadata.workflowVersion || result.workflow?.version || identity.workflow?.version,
      sourceWidth: source.width, sourceHeight: source.height,
      preparedWidth: prepared.width, preparedHeight: prepared.height,
      originalSourceWidth: originalSource.width, originalSourceHeight: originalSource.height,
      sourceResized: Boolean(sourceResized), expansion: { ...expansion },
      ...(outpaintCanvas ? { outpaintCanvas } : {}),
      targetWidth: width, targetHeight: height,
      usageCost: result.upstream?.usageCost || null,
      ...Object.fromEntries(Object.entries(prompt).filter(([key]) => key !== "finalPrompt")),
    },
  };
}

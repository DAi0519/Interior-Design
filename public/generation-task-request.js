/**
 * [INPUT]: 依赖统一生成输入、逐模型参数适配、单模型 1–4 张选择、效果图/全景图美化、风格、参考图状态与后台任务批次元数据
 * [OUTPUT]: 对外提供单模型多张生成项展开、不重复图片载荷的后台生成任务请求与含效果图/全景图美化的分功能加载文案
 * [POS]: public 的生成任务请求组装层，介于页面状态与服务端任务契约之间
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { adaptGenerationInputForModel } from "./generation-batch.js";

export function generationItemsForSelection(models, generationCount = 1) {
  if (!Array.isArray(models) || models.length < 1 || models.length > 4) {
    throw new RangeError("请选择 1–4 个出图模型");
  }
  const count = Number(generationCount);
  if (!Number.isInteger(count) || count < 1 || count > 4) {
    throw new RangeError("单模型生成张数需要在 1–4 张之间");
  }
  if (models.length > 1) return models;
  if (count === 1) return models;
  const [model] = models;
  return Array.from({ length: count }, (_, index) => ({
    ...model,
    label: `${model.label} · ${index + 1}/${count}`,
  }));
}

export function generationLoadingCopy({
  designPromptRequest,
  emptyRoomRequest,
  effectEnhancementRequest,
  forcePromptRegeneration,
  generationCount = 1,
  models,
  panoramaEnhancementRequest,
  refinedModelRequest,
  refinedPrompt,
  renderMode,
  styleReferenceCount,
}) {
  if (effectEnhancementRequest) {
    return "正在按时段与天气规则美化效果图…";
  }
  if (panoramaEnhancementRequest) {
    return "正在按全景连续性规则美化全景图…";
  }
  if (designPromptRequest && forcePromptRegeneration) {
    return "正在重新生成提示词并渲染…";
  }
  if (emptyRoomRequest) {
    if (renderMode === "style-dna") {
      return "正在读取 Style DNA 并生成完整空房设计…";
    }
    return styleReferenceCount
      ? "正在结合空房与风格参考图生成完整设计…"
      : "正在分析空房并生成布局、家具与材质方案…";
  }
  if (designPromptRequest) {
    if (renderMode === "smart-default") {
      return styleReferenceCount
        ? "正在结合白模与风格参考图生成提示词…"
        : "正在分析白模并智能匹配材质与光线…";
    }
    return styleReferenceCount
      ? "正在结合白模、风格参考图与 Style DNA…"
      : "正在读取 Style DNA，由 Prompt Agent 整合后渲染…";
  }
  if (refinedModelRequest) {
    return refinedPrompt
      ? "正在拼接自定义要求并忠实渲染精模…"
      : "正在读取固定 Prompt 并忠实渲染精模…";
  }
  if (models.length === 1 && generationCount > 1) {
    return `正在向 ${models[0].label} 提交 ${generationCount} 张生成请求…`;
  }
  return models.length > 1
    ? `正在向 ${models.length} 个模型提交请求…`
    : `正在向 ${models[0].label} 提交生成请求…`;
}

export function buildGenerationJobRequest({
  baseInput,
  batchId,
  featureMode,
  forcePromptRegeneration,
  jobId,
  models,
  sourceImage,
}) {
  const {
    referenceImages,
    styleReferenceImages,
    ...sharedInput
  } = baseInput;
  const items = models.map((model) => {
    const adapted = adaptGenerationInputForModel(baseInput, model, {
      featureMode,
      sourceImage,
    });
    const {
      referenceImages: _referenceImages,
      styleReferenceImages: _styleReferenceImages,
      ...input
    } = adapted;
    return { input, key: model.key, label: model.label };
  });
  return {
    batchId,
    featureMode,
    forcePromptRegeneration,
    items,
    jobId,
    sharedInput: {
      ...sharedInput,
      referenceImages,
      ...(styleReferenceImages ? { styleReferenceImages } : {}),
    },
  };
}

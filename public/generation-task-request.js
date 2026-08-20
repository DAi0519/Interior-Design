/**
 * [INPUT]: 依赖统一生成输入、逐模型参数适配、功能/风格/参考图状态与后台任务批次元数据
 * [OUTPUT]: 对外提供不重复图片载荷的后台生成任务请求与分功能加载文案
 * [POS]: public 的生成任务请求组装层，介于页面状态与服务端任务契约之间
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { adaptGenerationInputForModel } from "./generation-batch.js";

export function generationLoadingCopy({
  designPromptRequest,
  emptyRoomRequest,
  forcePromptRegeneration,
  models,
  refinedModelRequest,
  refinedPrompt,
  renderMode,
  styleReferenceCount,
}) {
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

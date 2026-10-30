/**
 * [INPUT]: 依赖统一生成输入、逐模型参数适配、单模型每光影每模式1–4张及精模光影/三方式多选与旧氛围兼容、各功能状态与后台任务批次元数据
 * [OUTPUT]: 对外提供全景/精模多光影×模型独立展开与标签、精模逐模式版本及全景逐卡身份投影、光影对比进度文案和不重复图片载荷的后台请求
 * [POS]: public 的生成任务请求组装层，介于页面状态与服务端任务契约之间
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { adaptGenerationInputForModel } from "./generation-batch.js";
import { REFINED_LIGHTING_EXECUTION_LABELS } from "./refined-flux-reference.js";

export function refinedLightingRequestSelection(value) {
  if (!value) return value;
  const { executions: _executions, presets: _presets, presetName: _presetName, ...selection } = value;
  return selection;
}

export function panoramaLightingRequestSelection(value) {
  if (!value) return null;
  const { presetId, version, sha256 } = value;
  return { presetId, version, sha256 };
}

export function panoramaItemsForSelection(models, generationCount = 1, selections = null) {
  const items = generationItemsForSelection(models, generationCount);
  if (!selections?.length) return items;
  return items.flatMap(model => selections.map(selection => ({
    ...model, panoramaLightingSelection: selection,
    label: [model.label, selection.presetName || selection.presetId].join(" · "),
  })));
}

export function generationItemsForSelection(models, generationCount = 1, lightingSelections = null) {
  if (!Array.isArray(models) || models.length < 1) {
    throw new RangeError("请至少选择 1 个出图模型");
  }
  const count = Number(generationCount);
  if (!Number.isInteger(count) || count < 1 || count > 4) {
    throw new RangeError("单模型生成张数需要在 1–4 张之间");
  }
  const repeated = models.length > 1 || count === 1 ? models : Array.from({ length: count }, (_, index) => ({
    ...models[0], label: `${models[0].label} · ${index + 1}/${count}`,
  }));
  if (!lightingSelections?.length) return repeated;
  const multiplePresets = new Set(lightingSelections.map(selection => selection.presetId).filter(Boolean)).size > 1;
  return repeated.flatMap(model => lightingSelections.map(lightingSelection => ({
    ...model, modelLabel: model.label, lightingSelection,
    label: lightingSelections.length > 1 || lightingSelection.presetName
      ? [model.label, lightingSelection.presetName || (multiplePresets ? lightingSelection.presetId : null),
        REFINED_LIGHTING_EXECUTION_LABELS[lightingSelection.execution]].filter(Boolean).join(" · ")
      : model.label,
  })));
}

export function generationLoadingCopy({
  designPromptRequest,
  emptyRoomRequest,
  effectBeautificationRequest,
  effectEnhancementRequest,
  textureEnhancementRequest,
  lightingTransferRequest,
  forcePromptRegeneration,
  generationCount = 1,
  models,
  panoramaEnhancementRequest,
  panoramaLightingSelections,
  refinedModelRequest,
  refinedPrompt,
  refinedRender,
  refinedLighting,
  renderMode,
  styleReferenceCount,
  styleTransferRequest,
}) {
  if (lightingTransferRequest) return "正在保留设计与材质，将效果图转换为所选光影氛围…";
  if (effectEnhancementRequest) {
    return "正在按时段与天气规则转换效果图氛围…";
  }
  if (effectBeautificationRequest) {
    return "正在按所选强度与色调美化效果图…";
  }
  if (textureEnhancementRequest) {
    return "正在增强材质质感与光影细节…";
  }
  if (panoramaEnhancementRequest) {
    if (panoramaLightingSelections?.length > 1) return `正在保持全景连续性，分别对比 ${panoramaLightingSelections.length} 种光影氛围…`;
    return "正在保持全景连续性，按光影要求生成全景图…";
  }
  if (designPromptRequest && forcePromptRegeneration) {
    return "正在重新生成提示词并渲染…";
  }
  if (styleTransferRequest) {
    return renderMode === "style-dna"
      ? "正在读取平台风格，保留空间结构与原视角转换风格…"
      : "正在提取参考图风格，保留空间结构与原视角转换风格…";
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
    if (refinedLighting?.presets?.length > 1) return `正在对比 ${refinedLighting.presets.length} 种光影氛围…`;
    if (refinedLighting?.executions?.length > 1) return `正在对比 ${refinedLighting.executions.length} 种精模渲染方式…`;
    if (refinedLighting?.mode === "preset" && refinedLighting.execution === "prompt-with-reference") {
      return "正在保留设计与材质，结合图序前置词、氛围词与预设参考图渲染精模…";
    }
    if (refinedLighting?.mode === "preset") return refinedLighting.execution === "prompt-and-reference"
      ? "正在保留设计与材质，结合光影提示词与预设参考图渲染精模…"
      : "正在保留设计与材质，按光影提示词渲染精模…";
    if (refinedLighting?.mode === "reference") return "正在保留设计与材质，参考上传图渲染精模…";
    if (refinedRender && (refinedRender.time !== "preserve" || refinedRender.weather !== "preserve" || refinedRender.tone !== "preserve")) {
      return "正在保留设计与材质，按所选氛围渲染精模…";
    }
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
    lightingReferenceImages,
    ...sharedInput
  } = baseInput;
  const items = models.map((model) => {
    const selectedLighting = refinedLightingRequestSelection(model.lightingSelection || baseInput.refinedLighting);
    const lightingInput = selectedLighting ? { ...baseInput, refinedLighting: selectedLighting,
      promptVersion: selectedLighting.mode === "preset" && ["prompt-and-reference", "prompt-with-reference"].includes(selectedLighting.execution)
        ? selectedLighting.ruleVersion : baseInput.promptVersion } : baseInput;
    const modeInput = featureMode === "panoramaEnhancement" ? { ...lightingInput,
      panoramaLighting: panoramaLightingRequestSelection(model.panoramaLightingSelection || baseInput.panoramaLighting),
    } : lightingInput;
    const adapted = adaptGenerationInputForModel(modeInput, model, {
      featureMode,
      sourceImage,
    });
    const {
      referenceImages: _referenceImages,
      styleReferenceImages: _styleReferenceImages,
      lightingReferenceImages: _lightingReferenceImages,
      ...input
    } = adapted;
    return { input, key: model.key, label: model.label };
  });
  return {
    batchId,
    featureMode: featureMode === "roomRenovation" ? "emptyRoom" : featureMode,
    forcePromptRegeneration,
    items,
    jobId,
    sharedInput: {
      ...sharedInput,
      ...(baseInput.refinedLighting ? { refinedLighting: items[0].input.refinedLighting } : {}),
      referenceImages,
      ...(styleReferenceImages ? { styleReferenceImages } : {}),
      ...(lightingReferenceImages ? { lightingReferenceImages } : {}),
    },
  };
}

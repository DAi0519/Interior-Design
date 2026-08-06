/**
 * [INPUT]: 依赖浏览器 File 形态、Benchmark 样本草稿与 sample-labeling@v2 返回的空间类别、五维标签和模型元数据
 * [OUTPUT]: 对外提供文件累加去重、样本草稿创建、标签选项、空间类型来源文案、AI 回填合并与草稿状态文案纯函数
 * [POS]: public 的 Benchmark 样本交互规则层，维护可累加待保存清单，确保已有人工空间分类不被 AI 覆盖并让未分类样本显式接受 AI 分类
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export const SAMPLE_CATEGORIES = ["客厅", "客餐厅一体", "独立餐厅", "卧室", "厨房", "卫生间", "玄关", "走廊", "书房", "阳台", "儿童房"];
export const SAMPLE_COMPLEXITY_LEVELS = ["低", "中", "高"];
export const SAMPLE_TYPES = ["有效白模", "边缘输入"];
export const SAMPLE_EDGE_TYPES = ["CAD/线稿", "草模/概念图", "已完成材质", "输入不可判断", "内容不相关"];
export const SAMPLE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const SAMPLE_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const AI_DIMENSION_FIELDS = new Set([
  "inputQuality", "lensComplexity", "materialComplexity", "spatialComplexity", "stylingComplexity",
]);

export function uniqueSampleFiles(existingFiles, incomingFiles) {
  const keys = new Set(existingFiles.map((file) => `${file.name}:${file.size}:${file.lastModified}`));
  return incomingFiles.filter((file) => {
    const key = `${file.name}:${file.size}:${file.lastModified}`;
    if (keys.has(key)) return false;
    keys.add(key);
    return true;
  });
}

export function createSampleDraft(file, { category, categoryMode, previewUrl, sampleType }) {
  return {
    aiCategory: null, aiReason: "", category, categoryMode, categorySource: "human", confidence: null,
    edgeType: sampleType === "边缘输入" ? "输入不可判断" : null, file, image: null, inputQuality: "中",
    labelModel: null, labelPromptVersion: null, labelSource: "human", lensComplexity: "中",
    materialComplexity: "中", previewUrl, reason: "", sampleType, spatialComplexity: "中",
    status: "waiting", stylingComplexity: "中",
  };
}

export function sampleLabelScopeCopy(categoryMode, category) {
  return categoryMode === "ai"
    ? "AI 将识别空间类型并补齐五维标签，结果仍可逐图修改。"
    : `空间类型固定为“${category}”；AI 只补空间结构、镜头、软装、材质和输入质量。`;
}

export function applyAiSampleLabel(draft, label) {
  const aiCategory = label.category;
  const aiReason = label.reason || "";
  const acceptsAiCategory = draft.categoryMode === "ai";
  return {
    aiCategory,
    aiReason,
    category: acceptsAiCategory ? aiCategory : draft.category,
    categorySource: acceptsAiCategory ? "ai" : "human",
    confidence: label.confidence,
    inputQuality: label.inputQuality,
    labelModel: label.modelKey,
    labelPromptVersion: label.promptVersion,
    labelSource: "ai",
    lensComplexity: label.lensComplexity,
    materialComplexity: label.materialComplexity,
    reason: acceptsAiCategory ? aiReason : `空间类型沿用“${draft.category}”；${aiReason}`,
    spatialComplexity: label.spatialComplexity,
    status: "ai",
    stylingComplexity: label.stylingComplexity,
  };
}

export function sampleDraftStatusCopy(draft) {
  if (draft.status === "labeling") return "AI 打标中";
  if (draft.status === "ai") return `${draft.categoryMode === "ai" ? "AI 分类 + 五维" : "AI 五维"} ${Math.round(draft.confidence * 100)}%`;
  if (draft.status === "manual-category") return "空间类型已人工调整";
  if (draft.status === "manual") return "五维已人工修改";
  if (draft.status === "manual-required") return "需人工确认";
  return "等待打标";
}

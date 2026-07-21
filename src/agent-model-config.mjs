/**
 * [INPUT]: 依赖公司 Model Link 当前模型目录与 2026-07-21 白模图片输入探针结果
 * [OUTPUT]: 对外提供模型目录、可用性检查与 Prompt Agent 模型解析器
 * [POS]: src 的 Prompt Agent 模型白名单，区分“接口存在”与“可读取白模图片”
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export const AGENT_MODEL_CONFIGS = Object.freeze({
  deepseek4pro: {
    accent: "purple",
    id: "deepseek-v4-pro",
    imageInput: false,
    label: "DeepSeek 4 Pro",
    note: "当前公司路由仅接受文本输入",
    shortLabel: "DeepSeek 4 Pro",
  },
  gemini3pro: {
    accent: "blue",
    id: "gemini-3.1-pro-preview",
    imageInput: true,
    label: "Gemini 3 Pro",
    note: "已通过白模图片输入探针",
    shortLabel: "Gemini 3 Pro",
  },
  gpt: {
    accent: "lime",
    id: "gpt-5.5",
    imageInput: true,
    label: "GPT 5.5",
    note: "已通过白模图片输入探针",
    shortLabel: "GPT 5.5",
  },
  claude: {
    accent: "orange",
    id: "claude-sonnet-5",
    imageInput: true,
    label: "Claude Sonnet 5",
    note: "已通过白模图片输入探针",
    shortLabel: "Claude Sonnet 5",
  },
  qwen35plus: {
    accent: "purple",
    id: "qwen3.5-plus",
    imageInput: true,
    label: "Qwen 3.5 Plus",
    note: "综合能力，已通过白模图片输入探针",
    shortLabel: "Qwen 3.5 Plus",
  },
  doubaoVision: {
    accent: "orange",
    id: "doubao-seed-1.6-vision",
    imageInput: true,
    label: "Doubao Seed 1.6 Vision",
    note: "中文低成本候选，已通过白模图片输入探针",
    shortLabel: "Doubao Vision",
  },
  kimi25: {
    accent: "lime",
    id: "kimi-k2.5",
    imageInput: true,
    label: "Kimi K2.5",
    note: "中文与长上下文候选，已通过白模图片输入探针",
    shortLabel: "Kimi K2.5",
  },
});

export function publicAgentModelCatalog() {
  return Object.entries(AGENT_MODEL_CONFIGS).map(([key, model]) => ({
    accent: model.accent,
    id: model.id,
    imageInput: model.imageInput,
    key,
    label: model.label,
    note: model.note,
    shortLabel: model.shortLabel,
  }));
}

export function agentModelOrThrow(modelKey) {
  const model = AGENT_MODEL_CONFIGS[String(modelKey || "")];
  if (!model) {
    const error = new Error("Prompt Agent 模型不在允许列表中");
    error.statusCode = 400;
    throw error;
  }
  if (!model.imageInput) {
    const error = new Error(`${model.label} 不支持白模图片输入`);
    error.statusCode = 400;
    throw error;
  }
  return model;
}

export function checkAgentModelAvailability(availableModels) {
  const availableIds = new Set(
    availableModels.map((model) => model.id || model.name).filter(Boolean),
  );

  return publicAgentModelCatalog().map((model) => {
    const listed = availableIds.has(model.id);
    const selectable = listed && model.imageInput;
    return {
      ...model,
      available: listed,
      reason: !listed
        ? "当前 API Key 未开放"
        : !model.imageInput
          ? "不支持图片输入"
          : null,
      selectable,
    };
  });
}

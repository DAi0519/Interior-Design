/**
 * [INPUT]: 依赖 Flux2 Klein 模型编码、当前功能、负向提示词文本域、字数与状态说明 DOM
 * [OUTPUT]: 提供可按功能保留负向草稿、Flux 模型显隐、全景与美化空默认说明、自定义覆盖及字数反馈
 * [POS]: public 的 Flux 负向 Prompt 交互边界，隔离 app.js 编排与具体 DOM 反馈
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

const FLUX_MODEL_KEY = "aiTextureEnhancement";

export function negativePromptNote(value, featureMode = "") {
  if (["effectBeautification", "panoramaEnhancement"].includes(featureMode)) {
    return String(value || "").length > 0
      ? "已填写自定义内容：本次将覆盖美化工作流的空负向，仅影响 Flux2 Klein。"
      : "当前美化工作流默认不使用负向提示词；填写后使用自定义内容。";
  }
  if (featureMode === "roomRenovation") {
    return String(value || "").length > 0
      ? "已填写自定义内容：本次将整段覆盖旧房专属默认，仅影响 Flux2 Klein。"
      : "当前使用旧房专属默认；允许重设计材质、配色、家具和装饰，仅保留真实结构与原视角。";
  }
  return String(value || "").length > 0
    ? "已填写自定义内容：本次将整段覆盖系统默认，仅影响 Flux2 Klein。"
    : "当前使用系统默认；填写后整段覆盖，仅影响 Flux2 Klein。";
}

export function bindFluxNegativePrompt({ count, note, root, textarea, scopeByFeature = false }) {
  let currentFeatureMode = "";
  let scope = "";
  const drafts = new Map();
  function update() {
    count.textContent = `${textarea.value.length} / 8000`;
    note.textContent = negativePromptNote(textarea.value, currentFeatureMode);
  }

  textarea.addEventListener("input", update);
  update();

  return {
    render(modelKeys = [], featureMode = "") {
      currentFeatureMode = featureMode;
      const nextScope = scopeByFeature || ["roomRenovation", "panoramaEnhancement"].includes(featureMode) ? featureMode : "";
      if (nextScope !== scope) {
        drafts.set(scope, textarea.value);
        scope = nextScope;
        textarea.value = drafts.get(scope) ?? "";
      }
      update();
      root.classList.toggle("hidden", ["textureEnhancement", "panoramaEnhancement"].includes(featureMode) || !modelKeys.includes(FLUX_MODEL_KEY));
    },
    value() {
      return textarea.value.trim();
    },
  };
}

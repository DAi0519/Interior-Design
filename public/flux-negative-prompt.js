/**
 * [INPUT]: 依赖 Flux2 Klein 模型编码、当前功能、负向提示词文本域、字数与状态说明 DOM
 * [OUTPUT]: 对外提供质感增强/CFG1全景隐藏负向编辑、其他功能仅在选中Flux时显示、旧房/全景/普通草稿隔离、美化和全景空默认负向说明和自定义整段覆盖的输入控制器
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

export function bindFluxNegativePrompt({ count, note, root, textarea }) {
  let scope = "default";
  let currentFeatureMode = "";
  const drafts = { default: textarea.value, roomRenovation: "", panoramaEnhancement: "" };
  function update() {
    drafts[scope] = textarea.value;
    count.textContent = `${textarea.value.length} / 8000`;
    note.textContent = negativePromptNote(textarea.value, currentFeatureMode);
  }

  textarea.addEventListener("input", update);
  update();

  return {
    render(modelKeys = [], featureMode = "") {
      currentFeatureMode = featureMode;
      const nextScope = ["roomRenovation", "panoramaEnhancement"].includes(featureMode) ? featureMode : "default";
      if (nextScope !== scope) {
        drafts[scope] = textarea.value;
        scope = nextScope;
        textarea.value = drafts[scope];
      }
      update();
      root.classList.toggle("hidden", ["textureEnhancement", "panoramaEnhancement"].includes(featureMode) || !modelKeys.includes(FLUX_MODEL_KEY));
    },
    value() {
      return textarea.value.trim();
    },
  };
}

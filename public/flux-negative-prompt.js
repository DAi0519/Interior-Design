/**
 * [INPUT]: 依赖 Flux2 Klein 模型编码、负向提示词文本域、字数与状态说明 DOM
 * [OUTPUT]: 对外提供仅在选中 Flux 时显示、空值回退默认、有值明确整段覆盖的负向 Prompt 输入控制器
 * [POS]: public 的 Flux 负向 Prompt 交互边界，隔离 app.js 编排与具体 DOM 反馈
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

const FLUX_MODEL_KEY = "aiTextureEnhancement";

export function negativePromptNote(value) {
  return String(value || "").length > 0
    ? "已填写自定义内容：本次将整段覆盖系统默认，仅影响 Flux2 Klein。"
    : "当前使用系统默认；填写后整段覆盖，仅影响 Flux2 Klein。";
}

export function bindFluxNegativePrompt({ count, note, root, textarea }) {
  function update() {
    count.textContent = `${textarea.value.length} / 8000`;
    note.textContent = negativePromptNote(textarea.value);
  }

  textarea.addEventListener("input", update);
  update();

  return {
    render(modelKeys = []) {
      root.classList.toggle("hidden", !modelKeys.includes(FLUX_MODEL_KEY));
    },
    value() {
      return textarea.value.trim();
    },
  };
}

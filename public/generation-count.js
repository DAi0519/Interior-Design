/**
 * [INPUT]: 依赖生成张数按钮组 DOM、单模型/多模型状态与用户点击事件
 * [OUTPUT]: 对外提供 1–4 张归一化、直接选择、选中态同步及多模型隐藏复位控制器
 * [POS]: public 的生成张数交互层，用四个直接选择键替代容易被 sticky 动作遮挡的下拉菜单
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export const GENERATION_COUNT_VALUES = Object.freeze([1, 2, 3, 4]);

export function normalizeGenerationCount(value) {
  const count = Number(value);
  return GENERATION_COUNT_VALUES.includes(count) ? count : 1;
}

export function bindGenerationCount({ root }) {
  const buttons = Array.from(root.querySelectorAll("[data-generation-count]"));
  let current = 1;

  function render() {
    for (const button of buttons) {
      const selected = normalizeGenerationCount(button.dataset.generationCount) === current;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-checked", String(selected));
    }
    root.querySelector("[role='radiogroup']")?.setAttribute(
      "aria-label",
      `生成张数，当前 ${current} 张`,
    );
  }

  function set(value) {
    current = normalizeGenerationCount(value);
    render();
  }

  for (const button of buttons) {
    button.addEventListener("click", () => set(button.dataset.generationCount));
  }
  render();

  return {
    setSingleModel(singleModel) {
      root.classList.toggle("hidden", !singleModel);
      for (const button of buttons) button.disabled = !singleModel;
      if (!singleModel) set(1);
    },
    value: () => current,
  };
}

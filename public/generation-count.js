/**
 * [INPUT]: 依赖生成张数原生 select、单模型/多模型状态与 change 事件
 * [OUTPUT]: 对外提供 1–4 张归一化、下拉取值及多模型隐藏复位控制器
 * [POS]: public 的生成张数交互层，配合自定义下拉的向上展开变体避开 sticky 动作区
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export const GENERATION_COUNT_VALUES = Object.freeze([1, 2, 3, 4]);

export function normalizeGenerationCount(value) {
  const count = Number(value);
  return GENERATION_COUNT_VALUES.includes(count) ? count : 1;
}

export function bindGenerationCount({ root }) {
  const select = root.querySelector("select");

  function set(value, { notify = false } = {}) {
    select.value = String(normalizeGenerationCount(value));
    if (notify) select.dispatchEvent(new Event("change", { bubbles: true }));
  }

  select.addEventListener("change", () => set(select.value));
  set(select.value);

  return {
    setSingleModel(singleModel) {
      root.classList.toggle("hidden", !singleModel);
      select.disabled = !singleModel;
      if (!singleModel) set(1, { notify: true });
    },
    value: () => normalizeGenerationCount(select.value),
  };
}

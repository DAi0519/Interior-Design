/**
 * [INPUT]: 依赖首页共用底栏、参数面板、选择器的可调状态、控件实测宽度与当前焦点
 * [OUTPUT]: 按可用宽度保留可调快捷项，放不下的参数在同一个面板中可调
 * [POS]: public 的首页底栏布局控制器，复用各功能原表单与快捷项
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

const shortcuts = ".home-image-chat-settings > :is(.field, .model-picker), .home-image-chat-inline-parameters > *, .workspace-quick-parameters > div";
const specifications = "#ratioField, #resolutionField, #generationCountField, [data-source-field='camera-aspectRatio'], [data-source-field='camera-resolution'], [data-source-field='camera-imageCount'], [data-source-field='castRatio'], [data-source-field='castResolution']";

export function hasOutputChoice(select) {
  return [...select.options].some(option => !option.hidden && !option.matches(":disabled") && option.value !== select.value);
}

export function bindHomeChatToolbar(root, { dialog, parameterButton }) {
  const doc = root.ownerDocument;
  const win = doc.defaultView;
  const composer = root.querySelector(".home-image-chat-composer");
  const tools = root.querySelector(".home-image-chat-tools");
  let observedRow;
  let frame;
  const resize = new win.ResizeObserver(schedule);

  function fit() {
    frame = undefined;
    if (dialog.open) return;
    const row = root.dataset.tool === "style" ? composer.querySelector(".composer-attachment-tools") : tools;
    if (row !== observedRow) {
      resize.disconnect();
      observedRow = row;
      if (row) resize.observe(row);
    }
    if (!row?.clientWidth) return;
    for (const node of composer.querySelectorAll("[data-toolbar-overflow]")) node.removeAttribute("data-toolbar-overflow");
    root.removeAttribute("data-toolbar-tight");
    const overflows = () => row.scrollWidth > row.clientWidth;
    const button = parameterButton();
    const focused = doc.activeElement;
    const controls = [...row.querySelectorAll(shortcuts)].filter(control => {
      const select = control.querySelector(":scope > select") || doc.getElementById(control.dataset.sourceField);
      const fixed = control.hasAttribute("data-choice-fixed")
        || control.querySelector(":scope > .model-picker[data-choice-fixed]")
        || (control.matches(specifications) && select?.matches("select") && !hasOutputChoice(select));
      const disabled = control.matches(":disabled") || control.querySelector(":scope > .model-picker-trigger:disabled") || select?.matches(":disabled");
      if (fixed || disabled) control.setAttribute("data-toolbar-overflow", "");
      return !fixed && !disabled && control.getClientRects().length;
    });
    if (button) {
      const main = controls.filter(node => !node.matches(specifications));
      const output = controls.filter(node => node.matches(specifications));
      const compact = root.hasAttribute("data-compact");
      if (compact) for (const control of output) control.setAttribute("data-toolbar-overflow", "");
      if (overflows()) {
        const candidates = compact ? main : [...main, ...output];
        for (const control of candidates) control.setAttribute("data-toolbar-overflow", "");
        for (const control of candidates) {
          control.removeAttribute("data-toolbar-overflow");
          if (overflows()) control.setAttribute("data-toolbar-overflow", "");
        }
      }
    }
    root.toggleAttribute("data-toolbar-tight", overflows());
    if (focused?.closest("[data-toolbar-overflow]")) button?.focus({ preventScroll: true });
  }

  function schedule() {
    if (frame === undefined) frame = win.requestAnimationFrame(fit);
  }

  new win.MutationObserver(schedule).observe(composer, {
    subtree: true, childList: true, characterData: true, attributes: true,
    attributeFilter: ["class", "hidden", "disabled", "selected", "data-choice-fixed", "data-parameter-fixed"],
  });
  root.addEventListener("change", schedule);
  dialog.addEventListener("close", schedule);
  doc.fonts?.ready.then(schedule);
  schedule();
}

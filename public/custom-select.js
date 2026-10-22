/**
 * [INPUT]: 依赖原生 select 的值/change/禁用/动态选项，以及 choice-select 共享组件库
 * [OUTPUT]: 原生 select 渐进增强、搜索/普通单选共用渲染器，保持表单值和变更事件合同
 * [POS]: public 表单适配层；所有页面及动态插入 select 统一接入组件，不维护第二套下拉
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { bindChoiceSelect } from "./choice-select.js?v=1";
export { stabilizePointerFocus } from "./choice-select.js?v=1";

export function enhanceSearchableSelect(select, bindChoice = bindChoiceSelect, { searchable = true } = {}) {
  const doc = select.ownerDocument || document;
  const root = doc.createElement("div");
  select.insertAdjacentElement("afterend", root);
  const picker = bindChoice({
    container: root,
    label: select.getAttribute("aria-label") || select.labels?.[0]?.querySelector?.("span")?.textContent.trim()
      || [...(select.labels?.[0]?.childNodes || [])].filter(node => node.nodeType === 3).map(node => node.textContent).join("").trim() || "选择选项",
    searchable, placement: select.dataset.dropdownPlacement || "auto",
    multiple: false,
    placeholder: select.dataset.placeholder || "请选择",
    searchPlaceholder: select.dataset.searchPlaceholder || "搜索选项名称",
    presentOption: (option) => ({ label: option.label, selectable: !option.disabled }),
    onChange(keys) {
      const option = [...select.options].find((entry) => entry.value === keys[0]);
      if (!option || (searchable && !option.value) || option.disabled || option.parentElement?.disabled === true || select.disabled) return;
      select.value = option.value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    },
  });

  function sync() {
    const catalog = [...select.options].filter((option) => (!searchable || option.value) && !option.hidden)
      .map((option) => ({ key: option.value, label: option.textContent,
        disabled: option.disabled || option.parentElement?.disabled === true }));
    root.hidden = select.hidden || select.classList.contains("hidden");
    picker.setDisabled(select.disabled || root.hidden);
    picker.render(catalog, catalog.some((option) => option.key === select.value) ? [select.value] : []);
  }

  select.addEventListener("change", sync);
  const Observer = doc.defaultView?.MutationObserver || MutationObserver;
  const observer = new Observer(sync);
  observer.observe(select, { attributes: true, childList: true, subtree: true });
  sync();
  return { ...picker, destroy() {
    observer.disconnect();
    select.removeEventListener("change", sync);
    picker.destroy();
    root.remove();
    delete select.dataset.enhanced;
  } };
}

const enhancedSelects = new Map();

export function enhanceSelect(select) {
  if (select.dataset.enhanced === "true") return;
  select.dataset.enhanced = "true";
  select.classList.add("custom-select-native");
  select.tabIndex = -1;
  select.setAttribute("aria-hidden", "true");
  const picker = enhanceSearchableSelect(select, bindChoiceSelect, { searchable: select.dataset.searchable === "true" });
  enhancedSelects.set(select, picker);
  return picker;
}

if (typeof document !== "undefined") {
  const enhanceWithin = (root) => {
    if (root.matches?.("select")) enhanceSelect(root);
    root.querySelectorAll?.("select").forEach(enhanceSelect);
  };
  enhanceWithin(document);
  new MutationObserver(records => {
    for (const record of records) for (const node of record.addedNodes) enhanceWithin(node);
    if (records.some(record => record.removedNodes.length)) {
      for (const [select, picker] of enhancedSelects) {
        if (!select.isConnected) { picker.destroy(); enhancedSelects.delete(select); }
      }
    }
  }).observe(document.body, { childList: true, subtree: true });
}

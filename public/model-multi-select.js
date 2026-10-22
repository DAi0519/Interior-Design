/**
 * [INPUT]: 依赖 choice-select 的共享下拉渲染器、公开模型目录及展示规则
 * [OUTPUT]: 模型至少一项、筛选全选/取消规则、bindModelMultiSelect 与兼容 bindSearchableChoice 入口
 * [POS]: public 的模型业务适配层，不再维护独立菜单 DOM 或视觉状态
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { bindChoiceSelect, filterChoiceCatalog as filterModelCatalog } from "./choice-select.js?v=1";
export { filterModelCatalog };

export function toggleModelSelection(currentKeys, modelKey, { selectable = true } = {}) {
  const values = [...new Set(currentKeys.map(String))];
  const selected = values.includes(modelKey);
  if (!selectable) return { changed: false, message: "该模型当前不可选", values };
  if (selected && values.length === 1) {
    return { changed: false, message: "至少保留 1 个出图模型", values };
  }
  return { changed: true, message: null,
    values: selected ? values.filter((value) => value !== modelKey) : [...values, modelKey] };
}


export function selectAvailableModels(currentKeys, catalog, {
  query = "", presentOption = (model) => ({ label: model.label, selectable: true }),
} = {}) {
  const retained = currentKeys.filter((key) => catalog.some((model) => model.key === key));
  const available = filterModelCatalog(catalog, query)
    .filter((model) => presentOption(model).selectable !== false)
    .map((model) => model.key);
  return [...new Set([...retained, ...available])];
}

export function toggleAvailableModels(currentKeys, catalog, {
  query = "", presentOption = (model) => ({ label: model.label, selectable: true }),
} = {}) {
  const values = [...new Set(currentKeys)].filter((key) => catalog.some((model) => model.key === key));
  const available = filterModelCatalog(catalog, query)
    .filter((model) => presentOption(model).selectable !== false)
    .map((model) => model.key);
  if (!available.length) return { changed: false, message: null, values };
  if (!available.every((key) => values.includes(key))) {
    return { changed: true, message: null,
      values: selectAvailableModels(values, catalog, { query, presentOption }) };
  }
  const remaining = values.filter((key) => !available.includes(key));
  const preservedPrimary = remaining.length === 0;
  const nextValues = preservedPrimary ? values.slice(0, 1) : remaining;
  return {
    changed: nextValues.length !== values.length,
    message: preservedPrimary ? "至少保留 1 个出图模型，已保留首选模型" : null,
    values: nextValues,
  };
}

export function bindModelMultiSelect(options) {
  return bindSearchableChoice({ ...options, multiple: true, label: "出图模型",
    placeholder: "选择出图模型", searchPlaceholder: "搜索模型名称" });
}

export function bindSearchableChoice(options) {
  return bindChoiceSelect({ label: "设计风格", placeholder: "请选择风格", searchPlaceholder: "搜索风格名称",
    ...options, toggleSelection: toggleModelSelection, toggleAll: toggleAvailableModels });
}

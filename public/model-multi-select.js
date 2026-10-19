/**
 * [INPUT]: 依赖公开模型/风格目录、选项展示解释器、DOM 与浏览器原生 Popover/焦点事件
 * [OUTPUT]: 对外提供模型多选与全选/取消纯规则、共享可搜索单选/多选浮层及显式禁用控制，以及 bindModelMultiSelect 多选包装入口
 * [POS]: public 的 Main/Beta 模型和设计风格共享选择层，以 body 顶层浮层隔离配置滚动区裁切，复用节点保留搜索和焦点
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

const PANEL_MAX_HEIGHT = 330;
const VIEWPORT_GUTTER = 12;
const PANEL_GAP = 4;
const MIN_USABLE_HEIGHT = 220;
let pickerSequence = 0;

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

export function filterModelCatalog(catalog, query = "") {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return catalog.filter((model) => {
    const text = `${model.label || ""} ${model.id || ""} ${model.key || ""}`
      .toLocaleLowerCase();
    return terms.every((term) => text.includes(term));
  });
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

export function bindSearchableChoice({ container, onChange, onMessage = () => {},
  presentOption = (model) => ({ label: model.label, selectable: true }), multiple = false,
  label = "设计风格", placeholder = "请选择风格", searchPlaceholder = "搜索风格名称" }) {
  const doc = container.ownerDocument || document;
  const win = doc.defaultView || window;
  const rows = new Map();
  let catalog = [];
  let selectedKeys = [];
  let structure = "";
  let isOpen = false;
  let positionFrame = null;
  let disabled = false;

  function element(tag, className, text) {
    const node = doc.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function icon(className, pathData) {
    const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    const path = doc.createElementNS("http://www.w3.org/2000/svg", "path");
    svg.setAttribute("class", className);
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("aria-hidden", "true");
    path.setAttribute("d", pathData);
    svg.append(path);
    return svg;
  }

  const trigger = element("button", "model-picker-trigger");
  trigger.type = "button";
  const primary = element("span", "model-picker-primary");
  const extra = multiple ? element("span", "model-picker-extra") : null;
  trigger.append(primary, ...(extra ? [extra] : []), icon("model-picker-chevron", "m4 6 4 4 4-4"));
  trigger.setAttribute("aria-haspopup", "dialog");
  trigger.setAttribute("aria-expanded", "false");
  const panel = element("div", "model-picker-popover");
  panel.id = `model-picker-${++pickerSequence}`;
  panel.setAttribute("popover", "auto");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", multiple ? `选择${label}` : label);
  trigger.setAttribute("aria-controls", panel.id);
  const nativePopover = typeof panel.showPopover === "function" && typeof panel.hidePopover === "function";
  if (nativePopover) trigger.setAttribute("popovertarget", panel.id);
  if (!nativePopover) panel.hidden = true;
  const searchWrap = element("div", "model-picker-search-wrap");
  const search = element("input", "model-picker-search");
  search.type = "search";
  search.placeholder = searchPlaceholder;
  search.setAttribute("aria-label", multiple ? `搜索${label}` : searchPlaceholder);
  search.setAttribute("autocomplete", "off");
  const selectAll = multiple ? element("button", "model-picker-action", "全选") : null;
  if (selectAll) selectAll.type = "button";
  searchWrap.append(search, ...(selectAll ? [selectAll] : []));
  const list = element("div", "model-picker-list");
  list.setAttribute("role", multiple ? "group" : "radiogroup");
  list.setAttribute("aria-label", label);
  const empty = element("p", "model-picker-empty", multiple ? "没有找到匹配的模型" : "没有找到匹配的风格");
  panel.append(searchWrap, list, empty);
  container.classList.add("model-picker");
  container.replaceChildren(trigger);
  doc.body.append(panel);

  function positionPanel() {
    if (!isOpen) return;
    const rect = trigger.getBoundingClientRect();
    if (!rect.width || !rect.height || rect.bottom <= 0 || rect.top >= win.innerHeight) { close(); return; }
    const viewportWidth = win.innerWidth;
    const viewportHeight = win.innerHeight;
    const width = Math.min(rect.width, viewportWidth - VIEWPORT_GUTTER * 2);
    panel.style.width = `${width}px`;
    panel.style.maxHeight = `${Math.min(PANEL_MAX_HEIGHT, viewportHeight - VIEWPORT_GUTTER * 2)}px`;
    const desiredHeight = panel.getBoundingClientRect().height;
    const below = viewportHeight - rect.bottom - PANEL_GAP - VIEWPORT_GUTTER;
    const above = rect.top - PANEL_GAP - VIEWPORT_GUTTER;
    const upward = above > below && below < desiredHeight;
    const fullHeight = Math.max(above, below) < Math.min(MIN_USABLE_HEIGHT, desiredHeight);
    const room = fullHeight ? viewportHeight - VIEWPORT_GUTTER * 2 : upward ? above : below;
    const maxHeight = Math.max(0, Math.min(PANEL_MAX_HEIGHT, room));
    panel.style.maxHeight = `${maxHeight}px`;
    panel.style.left = `${Math.max(VIEWPORT_GUTTER,
      Math.min(rect.left, viewportWidth - width - VIEWPORT_GUTTER))}px`;
    const height = Math.min(panel.getBoundingClientRect().height, maxHeight);
    const top = fullHeight ? VIEWPORT_GUTTER : upward ? rect.top - PANEL_GAP - height : rect.bottom + PANEL_GAP;
    panel.style.top = `${Math.max(VIEWPORT_GUTTER,
      Math.min(top, viewportHeight - height - VIEWPORT_GUTTER))}px`;
  }

  function schedulePosition() {
    if (!isOpen || positionFrame !== null) return;
    positionFrame = win.requestAnimationFrame(() => { positionFrame = null; positionPanel(); });
  }

  function close({ restoreFocus = false } = {}) {
    if (!isOpen) return;
    isOpen = false;
    trigger.setAttribute("aria-expanded", "false");
    if (nativePopover) panel.hidePopover();
    else { panel.hidden = true; panel.classList.remove("open"); }
    if (restoreFocus) trigger.focus({ preventScroll: true });
  }

  function open({ focusSearch = true } = {}) {
    if (trigger.disabled || isOpen) return;
    isOpen = true;
    trigger.setAttribute("aria-expanded", "true");
    if (nativePopover) panel.showPopover({ source: trigger });
    else { panel.hidden = false; panel.classList.add("open"); }
    positionPanel();
    if (focusSearch) search.focus({ preventScroll: true });
  }

  function commit(nextKeys) {
    selectedKeys = nextKeys;
    refresh();
    onChange([...selectedKeys]);
  }

  function updateDisabled(button, disabled) {
    // 先把焦点留在浮层内，避免禁用当前按钮触发空目标失焦并关闭浮层。
    if (isOpen && disabled && doc.activeElement === button) search.focus({ preventScroll: true });
    button.disabled = disabled;
  }

  function createRow(model) {
    const button = element("button", "model-picker-option");
    button.type = "button";
    button.dataset.modelKey = model.key;
    button.setAttribute("role", multiple ? "checkbox" : "radio");
    const label = element("span", "model-picker-option-label");
    const check = element("span", "model-picker-option-check");
    check.setAttribute("aria-hidden", "true");
    const checkIcon = icon("", "m3.5 8.2 2.7 2.7 6.3-6.3");
    check.append(checkIcon);
    const reason = element("span", "model-picker-option-reason");
    button.append(label, check, reason);
    button.addEventListener("click", () => {
      const current = catalog.find((entry) => entry.key === model.key);
      if (!current) return;
      if (!multiple) {
        if (presentOption(current).selectable === false) return;
        commit([model.key]);
        close({ restoreFocus: true });
        search.value = "";
        refresh();
        return;
      }
      const result = toggleModelSelection(selectedKeys, model.key, {
        selectable: presentOption(current).selectable !== false,
      });
      if (!result.changed) { onMessage(result.message); return; }
      commit(result.values);
    });
    return { button, label, reason, checkIcon };
  }

  function reconcileRows() {
    const nextStructure = catalog.map((model) => model.key).join("|");
    if (structure === nextStructure) return;
    structure = nextStructure;
    const focused = doc.activeElement;
    for (const model of catalog) {
      if (!rows.has(model.key)) rows.set(model.key, createRow(model));
    }
    list.replaceChildren(...catalog.map((model) => rows.get(model.key).button));
    for (const key of rows.keys()) if (!catalog.some((model) => model.key === key)) rows.delete(key);
    if (focused && list.contains(focused)) focused.focus({ preventScroll: true });
  }

  function refresh() {
    reconcileRows();
    const matched = filterModelCatalog(catalog, search.value);
    const matchedKeys = new Set(matched.map((model) => model.key));
    const available = matched.filter((model) => presentOption(model).selectable !== false);
    for (const model of catalog) {
      const row = rows.get(model.key);
      const presentation = presentOption(model);
      const selected = selectedKeys.includes(model.key);
      row.label.textContent = presentation.label || model.label;
      row.reason.textContent = presentation.reason || presentation.description || "";
      row.reason.hidden = !row.reason.textContent;
      row.button.title = presentation.title || [row.label.textContent, row.reason.textContent].filter(Boolean).join(" · ");
      row.button.setAttribute("aria-label", row.button.title);
      updateDisabled(row.button, presentation.selectable === false);
      row.button.hidden = !matchedKeys.has(model.key);
      row.button.setAttribute("aria-checked", String(selected));
      row.button.classList.toggle("selected", selected);
      row.checkIcon.style.display = selected ? "" : "none";
    }
    empty.hidden = matched.length > 0;
    const count = selectedKeys.length;
    const selectedLabels = selectedKeys.map((key) => catalog.find((model) => model.key === key))
      .filter(Boolean).map((model) => presentOption(model).label || model.label);
    primary.textContent = selectedLabels[0] || placeholder;
    if (extra) { extra.textContent = count > 1 ? `+${count - 1}` : ""; extra.hidden = count < 2; }
    trigger.title = selectedLabels.join("、");
    trigger.setAttribute("aria-label", multiple
      ? `选择${label}，已选 ${count} 个${trigger.title ? `：${trigger.title}` : ""}`
      : `${label}：${trigger.title || placeholder}`);
    trigger.disabled = disabled || catalog.length === 0;
    container.setAttribute("aria-label", multiple ? `${label}，已选择 ${count} 个` : label);
    if (selectAll) {
      const allSelected = available.length > 0 && available.every((model) => selectedKeys.includes(model.key));
      selectAll.textContent = allSelected ? "取消全选" : "全选";
      updateDisabled(selectAll, available.length === 0);
      selectAll.title = allSelected
        ? `${search.value.trim() ? "取消筛选结果中的可用模型，保留筛选外选择" : "取消全选"}；若会清空，至少保留首选模型`
        : search.value.trim() ? "全选筛选结果中的可用模型，保留已有选择" : "全选可用模型，保留首选和已有选择";
      selectAll.setAttribute("aria-label", selectAll.title);
    }
    schedulePosition();
  }

  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    if (isOpen) close(); else open({ focusSearch: event.detail === 0 });
  });
  search.addEventListener("input", refresh);
  selectAll?.addEventListener("click", () => {
    const result = toggleAvailableModels(selectedKeys, catalog, { query: search.value, presentOption });
    if (result.changed) commit(result.values);
    if (result.message) onMessage(result.message);
  });
  panel.addEventListener("toggle", (event) => {
    if (!nativePopover) return;
    isOpen = event.newState === "open";
    trigger.setAttribute("aria-expanded", String(isOpen));
  });
  panel.addEventListener("focusout", (event) => {
    if (isOpen && !panel.contains(event.relatedTarget) && event.relatedTarget !== trigger) close();
  });
  doc.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isOpen) { event.preventDefault(); close({ restoreFocus: true }); }
  });
  doc.addEventListener("pointerdown", (event) => {
    if (!nativePopover && isOpen && !panel.contains(event.target) && !trigger.contains(event.target)) close();
  });
  doc.addEventListener("focusin", (event) => {
    if (isOpen && !panel.contains(event.target) && !trigger.contains(event.target)) close();
  });
  doc.addEventListener("scroll", schedulePosition, true);
  win.addEventListener("resize", schedulePosition);
  win.addEventListener("blur", () => close());
  win.visualViewport?.addEventListener("resize", schedulePosition);

  function render(nextCatalog = catalog, nextKeys = selectedKeys) {
    catalog = nextCatalog;
    const validKeys = [...new Set(nextKeys)].filter((key) => catalog.some((model) => model.key === key));
    selectedKeys = multiple ? validKeys : validKeys.slice(0, 1);
    refresh();
  }

  function setDisabled(nextDisabled) {
    disabled = Boolean(nextDisabled);
    trigger.disabled = disabled || catalog.length === 0;
    if (trigger.disabled) close();
  }

  return { render, setDisabled, values: () => [...selectedKeys] };
}

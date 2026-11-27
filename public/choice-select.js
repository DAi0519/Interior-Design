/**
 * [INPUT]: 依赖 DOM/Popover、指针能力、选项目录与展示函数、多选业务规则及菜单方向设置
 * [OUTPUT]: bindChoiceSelect / filterChoiceCatalog / stabilizePointerFocus，统一下拉、模态浮层、触发按钮右侧定位与可配置菜单宽度
 * [POS]: public 共享下拉组件库唯一渲染器；custom-select 适配原生表单，model-multi-select 注入模型规则
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const PANEL_MAX_HEIGHT = 330;
const VIEWPORT_GUTTER = 12;
const PANEL_GAP = 4;
const MIN_USABLE_HEIGHT = 220;
const MOUSE_PICK_DISTANCE = 10;
const TYPEAHEAD_TIMEOUT = 1000;
const IME_END_GRACE = 5;
const SIDE_MENU_WIDTH = 152;
const SIDE_MENU_MIN_HEIGHT = 120;
const HOVER_OPEN_DELAY = 120;
const HOVER_CROSS_IDLE = 180;
const HOVER_EDGE_PADDING = 8;
const activeSideHovers = new WeakMap();
let pickerSequence = 0;

export function stabilizePointerFocus(event, item) {
  if (event.pointerType !== "mouse" || event.isPrimary === false || event.button !== 0 || event.ctrlKey) return false;
  event.preventDefault();
  item.focus({ preventScroll: true });
  return true;
}

export function filterChoiceCatalog(catalog, query = "") {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return catalog.filter((model) => {
    const text = `${model.label || ""} ${model.id || ""} ${model.key || ""}`
      .toLocaleLowerCase();
    return terms.every((term) => text.includes(term));
  });
}

export function bindChoiceSelect({ container, onChange, onMessage = () => {},
  presentOption = (model) => ({ label: model.label, selectable: true }), multiple = false,
  label = "选择选项", placeholder = "请选择", searchPlaceholder = "搜索选项名称",
  searchable = true, placement = "auto", toggleSelection, toggleAll }) {
  const doc = container.ownerDocument || document;
  const win = doc.defaultView || window;
  const sideChoice = placement === "right" && !searchable && !multiple;
  const choiceGroup = sideChoice ? container.closest?.("[data-choice-group]") : null;
  const desktopPointer = sideChoice ? win.matchMedia("(min-width: 901px) and (hover: hover) and (pointer: fine)") : null;
  const rows = new Map();
  const subscriptions = [];
  function listen(target, name, callback, options) {
    if (!target) return;
    target.addEventListener(name, callback, options);
    subscriptions.push(() => target.removeEventListener(name, callback, options));
  }
  let catalog = [];
  let selectedKeys = [];
  let structure = null;
  let isOpen = false;
  let positionFrame = null;
  let disabled = false;
  let openingPress = null;
  let mouseTriggerPress = false;
  let outsideTouchPress = false;
  let composing = false;
  let compositionEndedAt = -Infinity;
  let typeahead = "";
  let typedAt = -Infinity;
  let inline = false;
  let hoverOpened = false;
  let hoverTimer;
  let lastTriggerX;
  let crossing;
  let crossingTimer;

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

  const trigger = element("button", "model-picker-trigger custom-select-trigger");
  trigger.type = "button";
  const primary = element("span", "model-picker-primary");
  const extra = multiple ? element("span", "model-picker-extra") : null;
  if (sideChoice) {
    trigger.dataset.choiceSide = "";
    trigger.append(element("span", "model-picker-field-label", label));
  }
  trigger.append(primary, ...(extra ? [extra] : []), icon("model-picker-chevron", "m4 6 4 4 4-4"));
  trigger.setAttribute("aria-haspopup", searchable ? "dialog" : "listbox");
  if (!searchable) trigger.setAttribute("role", "combobox");
  trigger.setAttribute("aria-expanded", "false");
  const panel = element("div", "model-picker-popover");
  do { panel.id = `model-picker-${++pickerSequence}`; } while (doc.getElementById?.(panel.id));
  panel.setAttribute("popover", "auto");
  panel.setAttribute("role", searchable ? "dialog" : "listbox");
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
  list.setAttribute("role", multiple ? "group" : searchable ? "radiogroup" : "presentation");
  list.setAttribute("aria-label", label);
  const empty = element("p", "model-picker-empty", `没有找到匹配的${label === "出图模型" ? "模型" : label.includes("风格") ? "风格" : "选项"}`);
  searchWrap.hidden = !searchable;
  panel.append(searchWrap, list, empty);
  container.classList.add("model-picker");
  container.replaceChildren(trigger);
  doc.body.append(panel);

  function menuMinimum(style = win.getComputedStyle?.(trigger)) {
    return Number.parseFloat(style?.getPropertyValue("--model-picker-menu-min-width")) || 0;
  }

  function fitsOnRight(rect, width) {
    return win.innerWidth - rect.right >= width + PANEL_GAP + VIEWPORT_GUTTER;
  }

  function positionPanel() {
    if (!isOpen) return;
    const rect = trigger.getBoundingClientRect();
    if (!rect.width || !rect.height || rect.bottom <= 0 || rect.top >= win.innerHeight) { close(); return; }
    if (inline) return;
    const viewportWidth = win.innerWidth;
    const viewportHeight = win.innerHeight;
    const triggerStyle = win.getComputedStyle?.(trigger);
    const minimum = menuMinimum(triggerStyle);
    const sideWidth = Math.max(SIDE_MENU_WIDTH, minimum);
    const pinAbove = triggerStyle?.getPropertyValue("--model-picker-placement").trim() === "top";
    const onRight = desktopPointer?.matches && fitsOnRight(rect, sideWidth);
    if (hoverOpened && !onRight) { close(); return; }
    const width = onRight ? sideWidth : Math.min(Math.max(rect.width, minimum), viewportWidth - VIEWPORT_GUTTER * 2);
    if (sideChoice) panel.toggleAttribute("data-choice-right", onRight);
    panel.style.width = `${width}px`;
    panel.style.maxHeight = `${Math.min(PANEL_MAX_HEIGHT, viewportHeight - VIEWPORT_GUTTER * 2)}px`;
    const desiredHeight = panel.getBoundingClientRect().height;
    if (onRight) {
      const minimumHeight = Math.min(desiredHeight, SIDE_MENU_MIN_HEIGHT);
      const top = Math.max(VIEWPORT_GUTTER,
        Math.min(rect.top, viewportHeight - minimumHeight - VIEWPORT_GUTTER));
      panel.style.left = `${rect.right + PANEL_GAP}px`;
      panel.style.top = `${top}px`;
      panel.style.maxHeight = `${Math.min(PANEL_MAX_HEIGHT, viewportHeight - top - VIEWPORT_GUTTER)}px`;
      return;
    }
    let groupTop = rect.top, groupBottom = rect.bottom;
    for (const field of choiceGroup?.querySelectorAll("[data-choice-side]") || []) {
      const bounds = field.getBoundingClientRect();
      if (!bounds.width || !bounds.height) continue;
      groupTop = Math.min(groupTop, bounds.top);
      groupBottom = Math.max(groupBottom, bounds.bottom);
    }
    const below = viewportHeight - groupBottom - PANEL_GAP - VIEWPORT_GUTTER;
    const above = groupTop - PANEL_GAP - VIEWPORT_GUTTER;
    const upward = pinAbove || placement === "top" && above >= Math.min(desiredHeight, MIN_USABLE_HEIGHT)
      || above > below && below < desiredHeight;
    const fullHeight = !choiceGroup && !pinAbove && Math.max(above, below) < Math.min(MIN_USABLE_HEIGHT, desiredHeight);
    const room = fullHeight ? viewportHeight - VIEWPORT_GUTTER * 2 : upward ? above : below;
    const maxHeight = Math.max(0, Math.min(PANEL_MAX_HEIGHT, room));
    panel.style.maxHeight = `${maxHeight}px`;
    panel.style.left = `${Math.max(VIEWPORT_GUTTER, Math.min(rect.left, viewportWidth - width - VIEWPORT_GUTTER))}px`;
    const height = Math.min(panel.getBoundingClientRect().height, maxHeight);
    const top = fullHeight ? VIEWPORT_GUTTER : upward
      ? groupTop - PANEL_GAP - height : groupBottom + PANEL_GAP;
    panel.style.top = `${Math.max(VIEWPORT_GUTTER,
      Math.min(top, viewportHeight - height - VIEWPORT_GUTTER))}px`;
  }

  function schedulePosition() {
    if (!isOpen || positionFrame !== null) return;
    positionFrame = win.requestAnimationFrame(() => { positionFrame = null; positionPanel(); });
  }

  function clearOpeningPress() {
    if (!openingPress) return;
    openingPress = null;
    doc.removeEventListener("pointerup", finishOpeningPress, true);
    doc.removeEventListener("pointercancel", finishOpeningPress, true);
  }

  function resetInteraction() {
    clearOpeningPress();
    outsideTouchPress = false;
    composing = false;
    compositionEndedAt = -Infinity;
    typeahead = "";
    resetHover();
  }

  function close({ restoreFocus = false } = {}) {
    if (!isOpen) return;
    resetInteraction();
    isOpen = false;
    trigger.setAttribute("aria-expanded", "false");
    if (nativePopover && !inline) panel.hidePopover();
    else { panel.hidden = true; panel.classList.remove("open"); }
    if (restoreFocus) trigger.focus({ preventScroll: true });
  }

  function open({ focusSearch = true, fromHover = false } = {}) {
    if (trigger.disabled || isOpen) return;
    if (sideChoice) {
      if (!fromHover) win.clearTimeout(hoverTimer);
      inline = !desktopPointer.matches;
      panel.toggleAttribute("data-choice-inline", inline);
      if (inline) {
        panel.removeAttribute("data-choice-right");
        panel.removeAttribute("style");
      }
      if (nativePopover) {
        if (inline) {
          panel.removeAttribute("popover");
          trigger.removeAttribute("popovertarget");
        } else {
          panel.setAttribute("popover", "auto");
          trigger.setAttribute("popovertarget", panel.id);
          panel.hidden = false;
        }
      }
    }
    // -------- 浮层保留在当前模态内，避免被原生 dialog 的 inert 隔离 --------
    const host = inline ? choiceGroup || container
      : container.closest?.('dialog[open], [role="dialog"][aria-modal="true"], .parameter-popover') || doc.body;
    if (panel.parentNode !== host) host.append(panel);
    isOpen = true;
    trigger.setAttribute("aria-expanded", "true");
    if (nativePopover && !inline) panel.showPopover({ source: trigger });
    else { panel.hidden = false; panel.classList.add("open"); }
    positionPanel();
    if (isOpen && !fromHover) {
      if (!searchable) focusRow();
      else if (focusSearch) search.focus({ preventScroll: true });
    }
  }

  function commit(nextKeys) {
    selectedKeys = nextKeys;
    refresh();
    onChange([...selectedKeys]);
  }

  function updateDisabled(button, disabled) {
    // 先把焦点留在浮层内，避免禁用当前按钮触发空目标失焦并关闭浮层。
    if (isOpen && disabled && doc.activeElement === button) (searchable ? search : trigger).focus({ preventScroll: true });
    button.disabled = disabled;
  }

  function createRow(model) {
    const button = element("button", "model-picker-option");
    button.type = "button";
    button.dataset.modelKey = model.key;
    button.setAttribute("role", multiple ? "checkbox" : searchable ? "radio" : "option");
    const label = element("span", "model-picker-option-label");
    const check = element("span", "model-picker-option-check");
    check.setAttribute("aria-hidden", "true");
    const checkIcon = icon("", "m3.5 8.2 2.7 2.7 6.3-6.3");
    check.append(checkIcon);
    const reason = element("span", "model-picker-option-reason");
    button.append(label, check, reason);
    button.addEventListener("pointerdown", (event) => stabilizePointerFocus(event, button));
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
      const result = toggleSelection(selectedKeys, model.key, {
        selectable: presentOption(current).selectable !== false,
      });
      if (!result.changed) { onMessage(result.message); return; }
      commit(result.values);
    });
    return { button, label, reason, checkIcon };
  }

  function reconcileRows() {
    const nextStructure = JSON.stringify(catalog.map((model) => model.key));
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
    const matched = filterChoiceCatalog(catalog, search.value);
    const matchedKeys = new Set(matched.map((model) => model.key));
    const available = matched.filter((model) => presentOption(model).selectable !== false);
    const count = selectedKeys.length;
    let adjustable = false;
    for (const model of catalog) {
      const row = rows.get(model.key);
      const presentation = presentOption(model);
      const selected = selectedKeys.includes(model.key);
      if (presentation.selectable !== false && (!selected || (multiple && count > 1))) adjustable = true;
      row.label.textContent = presentation.label || model.label;
      row.reason.textContent = presentation.reason || presentation.description || "";
      row.reason.hidden = !row.reason.textContent;
      row.button.title = presentation.title || [row.label.textContent, row.reason.textContent].filter(Boolean).join(" · ");
      row.button.setAttribute("aria-label", row.button.title);
      updateDisabled(row.button, presentation.selectable === false);
      row.button.hidden = !matchedKeys.has(model.key);
      row.button.setAttribute(!multiple && !searchable ? "aria-selected" : "aria-checked", String(selected));
      row.button.classList.toggle("selected", selected);
      row.checkIcon.style.display = selected ? "" : "none";
    }
    empty.hidden = matched.length > 0;
    if (count > 0 && !adjustable) container.dataset.choiceFixed = "";
    else delete container.dataset.choiceFixed;
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

  function isInsidePicker(target) {
    return panel.contains(target) || trigger.contains(target);
  }

  function stopCrossing() {
    doc.removeEventListener("pointermove", followCrossing, true);
    win.clearTimeout(crossingTimer);
    crossing = null;
  }

  function resetHover() {
    if (!sideChoice) return;
    win.clearTimeout(hoverTimer);
    stopCrossing();
    hoverOpened = false;
    if (activeSideHovers.get(doc) === hoverSession) activeSideHovers.delete(doc);
  }

  function keepCrossing() {
    win.clearTimeout(crossingTimer);
    crossingTimer = win.setTimeout(() => close(), HOVER_CROSS_IDLE);
  }

  function followCrossing(event) {
    if (isInsidePicker(event.target)) { stopCrossing(); return; }
    const { x, y, edge, top, bottom } = crossing;
    // 穿过同排按钮时保留通往菜单的路线，停在另一个按钮时交还其悬停。
    const fraction = (event.clientX - x) / (edge - x);
    const minY = y + (top - y) * fraction - HOVER_EDGE_PADDING;
    const maxY = y + (bottom - y) * fraction + HOVER_EDGE_PADDING;
    if (event.clientX < crossing.lastX - 1 || fraction >= 1 || event.clientY < minY || event.clientY > maxY) {
      close();
      return;
    }
    crossing.lastX = event.clientX;
    keepCrossing();
  }

  const hoverSession = { close, isCrossing: () => Boolean(crossing) };
  if (sideChoice) {
    function openFromHover() {
      if (isOpen || trigger.disabled || !trigger.isConnected) return;
      const previous = activeSideHovers.get(doc);
      if (previous?.isCrossing()) {
        hoverTimer = win.setTimeout(openFromHover, HOVER_OPEN_DELAY);
        return;
      }
      if (!fitsOnRight(trigger.getBoundingClientRect(), Math.max(SIDE_MENU_WIDTH, menuMinimum()))) return;
      previous?.close();
      hoverOpened = true;
      activeSideHovers.set(doc, hoverSession);
      open({ fromHover: true });
      if (!isOpen) resetHover();
    }
    listen(desktopPointer, "change", () => { resetHover(); close(); });
    listen(trigger, "pointerenter", (event) => {
      if (event.pointerType !== "mouse" || !desktopPointer.matches || isOpen || trigger.disabled) return;
      lastTriggerX = event.clientX;
      hoverTimer = win.setTimeout(openFromHover, HOVER_OPEN_DELAY);
    });
    listen(trigger, "pointermove", (event) => { lastTriggerX = event.clientX; });
    listen(trigger, "pointerleave", (event) => {
      win.clearTimeout(hoverTimer);
      if (!hoverOpened || panel.contains(event.relatedTarget)) return;
      stopCrossing();
      const rect = panel.getBoundingClientRect();
      if (event.clientX <= lastTriggerX || event.clientX >= rect.left) { close(); return; }
      crossing = { x: event.clientX, y: event.clientY, lastX: event.clientX, edge: rect.left, top: rect.top, bottom: rect.bottom };
      doc.addEventListener("pointermove", followCrossing, true);
      keepCrossing();
    });
    listen(panel, "pointerenter", stopCrossing);
    listen(panel, "pointerleave", (event) => {
      if (hoverOpened && !trigger.contains(event.relatedTarget)) close();
    });
    listen(doc, "keydown", (event) => {
      if (hoverOpened && event.key === "Escape" && !event.isComposing && !event.defaultPrevented) {
        event.preventDefault();
        event.stopPropagation();
        close();
      }
    }, true);
  }

  function preventDragClick(event) {
    if (event.detail === 0) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  // -------- 鼠标按下开菜单，移动后才允许松手选择，触屏在点击时打开 --------
  function finishOpeningPress(event) {
    if (!openingPress || event.pointerId !== openingPress.id) return;
    const moved = Math.max(Math.abs(event.clientX - openingPress.x), Math.abs(event.clientY - openingPress.y));
    clearOpeningPress();
    if (event.type === "pointercancel" || moved <= MOUSE_PICK_DISTANCE) return;
    // 拦住随后派发到公共祖先的点击，特别是包含菜单的 dialog。
    doc.addEventListener("click", preventDragClick, true);
    win.setTimeout(() => doc.removeEventListener("click", preventDragClick, true), 0);
    const target = doc.elementFromPoint?.(event.clientX, event.clientY) || event.target;
    const item = target.closest?.(".model-picker-option");
    if (item && panel.contains(item) && !item.disabled) {
      item.focus({ preventScroll: true });
      item.click();
    } else if (!isInsidePicker(target)) close();
  }

  listen(trigger, "pointerdown", (event) => {
    mouseTriggerPress = event.pointerType === "mouse";
    if (!mouseTriggerPress || !stabilizePointerFocus(event, trigger)) return;
    if (hoverOpened) { resetHover(); focusRow(); return; }
    if (isOpen) { close({ restoreFocus: true }); return; }
    open({ focusSearch: false });
    if (!isOpen) return;
    openingPress = { id: event.pointerId, x: event.clientX, y: event.clientY };
    doc.addEventListener("pointerup", finishOpeningPress, true);
    doc.addEventListener("pointercancel", finishOpeningPress, true);
  });
  listen(trigger, "click", (event) => {
    event.preventDefault();
    if (event.detail !== 0 && (mouseTriggerPress || event.ctrlKey)) return;
    if (hoverOpened) { resetHover(); focusRow(); }
    else if (isOpen) close(); else open({ focusSearch: event.detail === 0 });
  });

  // -------- 所有下拉共享键盘导航，搜索过滤不改变选择 --------
  function availableOptions() {
    return catalog.map(({ key }) => rows.get(key)).filter(({ button }) => !button.hidden && !button.disabled);
  }

  function focusOption(button) {
    button.focus({ preventScroll: true });
    button.scrollIntoView?.({ block: "nearest" });
  }

  function focusRow(direction = 0, edge = null) {
    const items = availableOptions().map(({ button }) => button);
    if (!items.length) return;
    const current = items.indexOf(doc.activeElement);
    const selected = items.findIndex(button => selectedKeys.includes(button.dataset.modelKey));
    const base = current >= 0 ? current : selected;
    const index = edge === "first" ? 0 : edge === "last" ? items.length - 1
      : current < 0 ? Math.max(0, selected) : (base + direction + items.length) % items.length;
    focusOption(items[index]);
  }

  function navigateByTyping(event) {
    if (searchable || event.key.length !== 1 || event.metaKey || event.ctrlKey || event.altKey) return false;
    if (event.timeStamp - typedAt >= TYPEAHEAD_TIMEOUT) typeahead = "";
    if (event.key === " " && !typeahead) return false;
    typeahead += event.key.toLocaleLowerCase();
    typedAt = event.timeStamp;
    const query = [...typeahead].every(character => character === typeahead[0]) ? typeahead[0] : typeahead;
    const options = availableOptions();
    const current = options.findIndex(({ button }) => button === doc.activeElement);
    const start = query.length === 1 ? current + 1 : Math.max(current, 0);
    const ordered = [...options.slice(start), ...options.slice(0, start)];
    const match = ordered.find(({ label }) => label.textContent.toLocaleLowerCase().startsWith(query));
    if (match) focusOption(match.button);
    event.preventDefault();
    return true;
  }

  function handleEscape(event) {
    if (event.key !== "Escape" || (!isOpen && !event.repeat)) return false;
    event.stopPropagation?.();
    const nativeComposition = event.isComposing || event.keyCode === 229;
    if (!nativeComposition) event.preventDefault();
    if (!event.repeat && !nativeComposition && !composing
      && !(event.timeStamp - compositionEndedAt < IME_END_GRACE)) close({ restoreFocus: true });
    return true;
  }
  listen(trigger, "keydown", (event) => {
    if (handleEscape(event) || event.isComposing || event.keyCode === 229) return;
    if (event.repeat && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      return;
    }
    if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
    event.preventDefault();
    if (isOpen) { resetHover(); focusRow(event.key === "ArrowDown" ? 1 : -1); }
    else { open({ focusSearch: false }); if (searchable) focusRow(); }
  });
  listen(panel, "keydown", (event) => {
    if (handleEscape(event) || event.isComposing || event.keyCode === 229 || composing) return;
    if (navigateByTyping(event)) return;
    if (["ArrowDown", "ArrowUp"].includes(event.key)) {
      event.preventDefault(); focusRow(event.key === "ArrowDown" ? 1 : -1);
    } else if (doc.activeElement !== search && ["Home", "End"].includes(event.key)) {
      event.preventDefault(); focusRow(0, event.key === "Home" ? "first" : "last");
    } else if (event.key === "Enter" || event.key === " ") {
      const item = doc.activeElement;
      if (event.repeat && item !== search) { event.preventDefault(); return; }
      if (!list.contains(item)) return;
      event.preventDefault(); item.click();
    }
  });
  listen(search, "compositionstart", () => { composing = true; });
  listen(search, "compositionend", (event) => {
    composing = false;
    compositionEndedAt = event.timeStamp;
  });
  listen(search, "input", refresh);
  listen(selectAll, "click", () => {
    const result = toggleAll(selectedKeys, catalog, { query: search.value, presentOption });
    if (result.changed) commit(result.values);
    if (result.message) onMessage(result.message);
  });
  listen(panel, "toggle", (event) => {
    if (!nativePopover || inline) return;
    isOpen = event.newState === "open";
    trigger.setAttribute("aria-expanded", String(isOpen));
    if (!isOpen) resetInteraction();
  });
  listen(panel, "focusout", (event) => {
    if (isOpen && event.relatedTarget && !isInsidePicker(event.relatedTarget)) close();
  });
  if (!nativePopover || sideChoice) {
    listen(doc, "pointerdown", (event) => {
      if (!isOpen || (nativePopover && !inline) || event.isPrimary === false) return;
      const outside = !isInsidePicker(event.target);
      const waitsForClick = event.pointerType === "touch" || event.pointerType === "pen";
      outsideTouchPress = outside && waitsForClick;
      if (outside && !waitsForClick) close();
    });
    listen(doc, "click", (event) => {
      if (outsideTouchPress && isOpen && isInsidePicker(event.target) === false) close();
      outsideTouchPress = false;
    });
  }
  listen(doc, "focusin", (event) => {
    if (isOpen && !panel.contains(event.target) && !trigger.contains(event.target)) close();
  });
  listen(doc, "scroll", schedulePosition, true);
  listen(win, "resize", schedulePosition);
  listen(win, "blur", () => close());
  listen(win.visualViewport, "resize", schedulePosition);

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

  function destroy() {
    close();
    resetHover();
    if (positionFrame !== null) win.cancelAnimationFrame(positionFrame);
    subscriptions.forEach(unsubscribe => unsubscribe());
    panel.remove();
    rows.clear();
  }
  return { render, setDisabled, destroy, values: () => [...selectedKeys] };
}

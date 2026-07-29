/**
 * [INPUT]: 依赖 .compact-config-field 与 .field 内的原生 select 选项、禁用/change 语义与浏览器指针/焦点生命周期
 * [OUTPUT]: 对外提供与原生值同步且显式展示详情的自定义下拉触发器、稳定指针选择和完整键盘操作
 * [POS]: public 的表单渐进增强层，统一 Style DNA、场景融合 Agent、出图模型、反推模型与参数下拉视觉
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

function optionCopy(option) {
  const [label, ...details] = option.textContent.split(" · ");
  return { detail: details.join(" · "), label };
}

function renderOptionCopy(container, text) {
  const label = document.createElement("strong");
  const detail = document.createElement("small");
  label.textContent = text.label;
  detail.textContent = text.detail;
  detail.hidden = !text.detail;
  container.replaceChildren(label, detail);
}

function checkIcon() {
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("aria-hidden", "true");
  icon.setAttribute("viewBox", "0 0 16 16");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "m3.5 8.2 2.7 2.7 6.3-6.3");
  icon.append(path);
  return icon;
}

function enhanceSelect(select) {
  if (select.dataset.enhanced === "true") return;
  select.dataset.enhanced = "true";
  select.classList.add("custom-select-native");

  const root = document.createElement("div");
  const trigger = document.createElement("button");
  const value = document.createElement("span");
  const chevron = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const chevronPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
  const menu = document.createElement("div");
  const menuId = `${select.id}-menu`;

  root.className = "custom-select";
  trigger.className = "custom-select-trigger";
  trigger.type = "button";
  trigger.setAttribute("aria-controls", menuId);
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("role", "combobox");
  value.className = "custom-select-value";
  chevron.classList.add("custom-select-chevron");
  chevron.setAttribute("aria-hidden", "true");
  chevron.setAttribute("viewBox", "0 0 16 16");
  chevronPath.setAttribute("d", "m4 6 4 4 4-4");
  chevron.append(chevronPath);
  trigger.append(value, chevron);
  menu.className = "custom-select-menu";
  menu.hidden = true;
  menu.id = menuId;
  menu.setAttribute("role", "listbox");
  root.append(trigger, menu);
  select.insertAdjacentElement("afterend", root);

  function enabledItems() {
    return [...menu.querySelectorAll(".custom-select-option:not(:disabled)")];
  }

  function close({ focusTrigger = false } = {}) {
    root.classList.remove("open");
    trigger.setAttribute("aria-expanded", "false");
    menu.hidden = true;
    if (focusTrigger) trigger.focus();
  }

  function focusItem(direction = 0) {
    const items = enabledItems();
    if (items.length === 0) return;
    const currentIndex = items.indexOf(document.activeElement);
    const selectedIndex = items.findIndex(
      (item) => item.getAttribute("aria-selected") === "true",
    );
    const baseIndex = currentIndex >= 0 ? currentIndex : selectedIndex;
    const nextIndex = baseIndex < 0
      ? direction < 0 ? items.length - 1 : 0
      : (baseIndex + direction + items.length) % items.length;
    items[nextIndex].focus();
  }

  function open() {
    if (trigger.disabled) return;
    root.classList.add("open");
    trigger.setAttribute("aria-expanded", "true");
    menu.hidden = false;
    window.requestAnimationFrame(() => focusItem());
  }

  function sync() {
    const selected = select.selectedOptions[0] || select.options[0];
    if (selected) renderOptionCopy(value, optionCopy(selected));
    else value.textContent = "请选择";
    trigger.disabled = select.disabled;
    trigger.setAttribute("aria-label", select.getAttribute("aria-label") || value.textContent);
    menu.replaceChildren(
      ...[...select.options].map((option) => {
        const item = document.createElement("button");
        const copy = document.createElement("span");
        const text = optionCopy(option);
        item.className = "custom-select-option";
        item.type = "button";
        item.disabled = option.disabled;
        item.setAttribute("aria-selected", String(option.selected));
        item.setAttribute("role", "option");
        renderOptionCopy(copy, text);
        item.append(copy, checkIcon());
        item.addEventListener("click", () => {
          select.value = option.value;
          select.dispatchEvent(new Event("change", { bubbles: true }));
          sync();
          close({ focusTrigger: true });
        });
        return item;
      }),
    );
  }

  trigger.addEventListener("click", () => {
    if (root.classList.contains("open")) close();
    else open();
  });
  trigger.addEventListener("keydown", (event) => {
    if (!["ArrowDown", "ArrowUp", "Escape"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Escape") close();
    else open();
  });
  menu.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close({ focusTrigger: true });
    } else if (["ArrowDown", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      focusItem(event.key === "ArrowDown" ? 1 : -1);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const items = enabledItems();
      items[event.key === "Home" ? 0 : items.length - 1]?.focus();
    }
  });
  root.addEventListener("focusout", () => {
    window.requestAnimationFrame(() => {
      if (!root.contains(document.activeElement)) close();
    });
  });
  document.addEventListener("pointerdown", (event) => {
    if (!root.contains(event.target)) close();
  });
  select.addEventListener("change", sync);
  new MutationObserver(sync).observe(select, {
    attributes: true,
    childList: true,
    subtree: true,
  });
  sync();
}

document
  .querySelectorAll(".compact-config-field select, .field select")
  .forEach(enhanceSelect);

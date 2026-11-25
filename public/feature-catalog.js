/**
 * [INPUT]: 依赖工作台 #featureModeList 的原功能按钮、目录标题与别名、首页对话功能入口、原生搜索 dialog、连接中心及可选同源 iframe
 * [OUTPUT]: 提供分组展开、功能搜索、对话内功能选择事件、输入法与按键连发保护、原生弹窗轻触关闭，以及同源画布快捷键和焦点恢复
 * [POS]: public 的生图工作台功能目录交互层，通过原入口进入生成或保活工作区
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

const normalize = (text) => text.normalize("NFKC").toLowerCase();
const openOverlaySelector = 'dialog[open], #connectionDialog[aria-hidden="false"]';
const triggerSelector = "[data-feature-catalog-open]";
const shortcutsByDocument = new WeakMap();
const isCompositionKey = (event) => event.isComposing || event.keyCode === 229;

function preventRepeatedActivation(event) {
  if (event.repeat && (event.key === "Enter" || event.key === " ")) event.preventDefault();
}

function canFocus(node) {
  return node?.isConnected && !node.closest("[inert]") && node.getClientRects().length > 0;
}

function activeFramePath(frames) {
  return frames.every((frame, index) => !frame.hidden && !frame.inert && canFocus(frame)
    && (index === 0 || frames[index - 1].contentDocument === frame.ownerDocument));
}

// -------- 只监听同源子文档；保活画布及其编辑器可以独立重载 --------
export function bindFeatureCatalogFrame(frame) {
  const root = frame.ownerDocument;
  function watch(target, frames) {
    let connectedDocument;
    function connect() {
      const source = target.contentDocument;
      if (!source || source === connectedDocument) return;
      connectedDocument = source;
      source.addEventListener("keydown", (event) => {
        if (target.contentDocument === source) shortcutsByDocument.get(root)?.(event, source, frames);
      });
      for (const child of source.querySelectorAll("iframe")) watch(child, [...frames, child]);
    }
    target.addEventListener("load", connect);
    connect();
  }
  watch(frame, [frame]);
}

export function matchesFeatureQuery({ label, group, keywords, id }, query) {
  const fields = normalize([label, group, keywords, id].join(" "));
  return normalize(query).trim().split(/\s+/).every((word) => fields.includes(word));
}

export function bindFeatureCatalog(root) {
  const directory = root?.getElementById("featureModeList");
  const dialog = root?.getElementById("featureCatalogDialog");
  if (!directory || !dialog) return null;

  const input = dialog.querySelector("#featureCatalogQuery");
  const results = dialog.querySelector("#featureCatalogResults");
  const status = dialog.querySelector("#featureCatalogStatus");
  const empty = dialog.querySelector("#featureCatalogEmpty");

  const groups = Array.from(directory.querySelectorAll("[data-feature-group-toggle]"), (toggle) => {
    const items = root.getElementById(toggle.getAttribute("aria-controls"));
    const buttons = Array.from(items.querySelectorAll("[data-feature-mode]"));
    return { toggle, items, buttons };
  });
  let activeFeature;
  let returnFocus;
  let backdropPress = false;
  let composing = false;
  let compositionEnd;

  function expand(groupToOpen) {
    for (const group of groups) {
      const open = group === groupToOpen;
      group.toggle.setAttribute("aria-expanded", String(open));
      group.items.hidden = !open;
    }
  }

  directory.addEventListener("keydown", preventRepeatedActivation);
  for (const group of groups) {
    group.toggle.addEventListener("click", () => expand(group.items.hidden ? group : null));
    group.items.addEventListener("keydown", (event) => {
      if (event.defaultPrevented || isCompositionKey(event) || event.altKey || event.ctrlKey || event.metaKey) return;
      if (!["ArrowDown", "ArrowUp", "ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
      const enabled = group.buttons.filter((button) => !button.disabled);
      const current = enabled.indexOf(event.target);
      if (current === -1) return;
      event.preventDefault();
      const step = ["ArrowDown", "ArrowRight"].includes(event.key) ? 1 : -1;
      const next = (current + step + enabled.length) % enabled.length;
      const target = enabled[event.key === "Home" ? 0 : event.key === "End" ? enabled.length - 1 : next];
      if (directory.closest("#productSidebarDialog[open]")) {
        for (const button of enabled) button.tabIndex = button === target ? 0 : -1;
      } else if (target !== event.target) target.click();
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: "nearest" });
    });
  }

  const entries = groups.flatMap((group) => group.buttons.map((source) => {
    const label = source.textContent.trim();
    const groupLabel = group.toggle.textContent.trim();
    const row = root.createElement("li");
    const button = root.createElement("button");
    const name = root.createElement("span");
    const category = root.createElement("span");
    row.className = "feature-catalog-row";
    button.type = "button";
    name.textContent = label;
    category.textContent = groupLabel;
    category.className = "feature-catalog-category";
    button.append(name, category);
    row.append(button);
    results.append(row);
    button.addEventListener("click", () => {
      const composer = returnFocus?.composer;
      dialog.close();
      if (composer) {
        composer.dispatchEvent(new root.defaultView.CustomEvent("canvas-lab:composer-feature", {
          bubbles: true,
          detail: { featureMode: source.dataset.featureMode, label },
        }));
        return;
      }
      expand(group);
      if (source.getAttribute("aria-checked") !== "true") source.click();
    });
    return { label, group: groupLabel, keywords: source.dataset.featureKeywords, id: source.dataset.featureMode,
      source, button, row };
  }));

  function filter() {
    let count = 0;
    for (const entry of entries) {
      const matches = matchesFeatureQuery(entry, input.value);
      entry.row.hidden = !matches;
      if (matches) count += 1;
    }
    empty.hidden = count > 0;
    status.textContent = count ? `${count} 个功能` : empty.textContent;
  }

  function syncSelection() {
    const selected = entries.find(({ source }) => source.getAttribute("aria-checked") === "true");
    if (selected?.source !== activeFeature) {
      activeFeature = selected?.source;
      expand(groups.find(({ buttons }) => buttons.includes(activeFeature)));
      if (activeFeature?.getClientRects().length) activeFeature.scrollIntoView({ block: "nearest" });
    }
    for (const { buttons } of groups) {
      const tabbable = buttons.find((button) => button === activeFeature && !button.disabled)
        || buttons.find((button) => !button.disabled);
      for (const button of buttons) button.tabIndex = button === tabbable ? 0 : -1;
    }
    const composer = returnFocus?.composer;
    for (const { source, button, id } of entries) {
      button.disabled = source.disabled;
      const current = composer ? id === composer.dataset.featureCatalogCurrent : source === activeFeature;
      if (current) button.setAttribute("aria-current", "true");
      else button.removeAttribute("aria-current");
    }
  }

  function show(target, { frames = [], composer = null } = {}) {
    if (root.querySelector(openOverlaySelector)) return false;
    returnFocus = { target, frames, composer };
    input.value = "";
    syncSelection();
    filter();
    results.scrollTop = 0;
    dialog.showModal();
    return true;
  }

  root.addEventListener("click", (event) => {
    const trigger = event.target.closest?.(triggerSelector);
    if (trigger && !trigger.disabled && !event.defaultPrevented) {
      show(trigger, { composer: "featureCatalogComposer" in trigger.dataset ? trigger : null });
    }
  });
  dialog.querySelector("[data-feature-catalog-close]").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    if (dialog.open || !returnFocus) return;
    backdropPress = false;
    composing = false;
    root.defaultView.clearTimeout(compositionEnd);
    const { target, frames } = returnFocus;
    returnFocus = null;
    const frame = frames.at(-1);
    const source = frame ? frame.contentDocument : root;
    const sourceVisible = activeFramePath(frames);
    const element = sourceVisible && target?.ownerDocument === source && target !== source.body && canFocus(target)
      ? target : sourceVisible && frame ? frame : Array.from(root.querySelectorAll(triggerSelector)).find(canFocus);
    element?.focus({ preventScroll: true });
  });
  function onBackdrop(event) {
    if (event.target !== dialog) return false;
    const { left, right, top, bottom } = dialog.getBoundingClientRect();
    return event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom;
  }
  // -------- 从弹窗内拖出选择文字时，松手不能关闭弹窗 --------
  dialog.addEventListener("pointerdown", (event) => {
    if (event.isPrimary !== false && event.button === 0) backdropPress = !event.ctrlKey && onBackdrop(event);
  });
  dialog.addEventListener("pointercancel", () => { backdropPress = false; });
  dialog.addEventListener("click", (event) => {
    if (!event.defaultPrevented && backdropPress && onBackdrop(event)) dialog.close();
    backdropPress = false;
  });
  input.addEventListener("input", filter);
  input.addEventListener("compositionstart", () => {
    root.defaultView.clearTimeout(compositionEnd);
    composing = true;
  });
  input.addEventListener("compositionend", () => {
    // -------- WebKit 可能先结束组合，再派发对应的 Enter 或 Escape --------
    compositionEnd = root.defaultView.setTimeout(() => { composing = false; }, 5);
  });
  dialog.addEventListener("cancel", (event) => {
    if (composing) event.preventDefault();
  });

  dialog.addEventListener("keydown", (event) => {
    if (composing || isCompositionKey(event) || event.defaultPrevented) return;
    if (event.key === "Escape") {
      event.preventDefault();
      dialog.close();
      return;
    }
    const visible = entries.filter(({ row, button }) => !row.hidden && !button.disabled).map(({ button }) => button);
    if (event.key === "Enter" || (event.target !== input && event.key === " ")) {
      preventRepeatedActivation(event);
      if (event.defaultPrevented || event.key !== "Enter" || event.target !== input) return;
      event.preventDefault();
      visible[0]?.click();
      return;
    }
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const targets = [input, ...visible];
    const index = targets.indexOf(event.target);
    if (index < 0 || visible.length === 0) return;
    if (event.target === input && (event.key === "Home" || event.key === "End")) return;
    event.preventDefault();
    const step = event.key === "ArrowDown" ? 1 : -1;
    const next = event.key === "Home" ? visible[0] : event.key === "End" ? visible.at(-1)
      : targets[(index + step + targets.length) % targets.length];
    next.focus({ preventScroll: true });
    if (next !== input) next.scrollIntoView({ block: "nearest" });
  });

  function onShortcut(event, source = root, frames = []) {
    if (event.defaultPrevented || isCompositionKey(event) || event.repeat || event.altKey || event.shiftKey) return;
    if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") return;
    if (!activeFramePath(frames) || frames.some((frame) => frame.contentDocument?.querySelector(openOverlaySelector))) return;
    const home = root.getElementById("homeImageChat");
    const target = source.activeElement;
    const composer = home?.contains(frames[0] || target) || (!frames.length && target === root.body)
      ? home?.querySelector("[data-feature-catalog-composer]") : null;
    const opener = canFocus(composer) ? composer : null;
    if (!opener?.disabled && show(target, { frames, composer: opener })) event.preventDefault();
  }
  shortcutsByDocument.set(root, onShortcut);
  root.addEventListener("keydown", (event) => {
    if (event.target.closest?.(triggerSelector)) preventRepeatedActivation(event);
    onShortcut(event);
  });

  const observer = new root.defaultView.MutationObserver(syncSelection);
  observer.observe(directory, { attributes: true, subtree: true, attributeFilter: ["aria-checked", "disabled"] });
  syncSelection();
}

if (typeof document !== "undefined") bindFeatureCatalog(document);

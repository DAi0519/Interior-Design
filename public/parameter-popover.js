/**
 * [INPUT]: 依赖原生 Popover、原参数节点与触发按钮
 * [OUTPUT]: 底栏上方的可滚动非模态参数下拉，支持原内容暂回参数面板、关闭及焦点归还
 * [POS]: public 的参数下拉定位与键盘交互
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

let sequence = 0;
const gutter = 8;
const gap = 5;
const focusable = "button:enabled, input:enabled, textarea:enabled, [tabindex='0']";

export function bindParameterPopover({ trigger, content, beforeOpen = () => {}, onOpen = () => {}, closeOnClick = () => false }) {
  const doc = trigger.ownerDocument;
  const view = doc.defaultView;
  const originalId = content.id;
  if (!originalId) content.id = `parameter-popover-${++sequence}`;
  content.setAttribute("popover", "auto");
  content.classList.add("parameter-popover");
  trigger.setAttribute("popovertarget", content.id);
  trigger.setAttribute("aria-controls", content.id);
  trigger.setAttribute("aria-expanded", "false");
  const isOpen = () => content.matches(":popover-open");
  const focusTargets = () => [...content.querySelectorAll(focusable)].filter(node => node.getClientRects().length > 0);

  function position() {
    if (!isOpen()) return;
    const anchor = trigger.getBoundingClientRect();
    if (!anchor.width || anchor.bottom <= 0 || anchor.top >= view.innerHeight) { close(); return; }
    const width = Math.min(Math.max(anchor.width, 312), view.innerWidth - gutter * 2);
    const left = Math.max(gutter, Math.min(anchor.left, view.innerWidth - width - gutter));
    content.style.setProperty("--parameter-popover-width", `${width}px`);
    content.style.setProperty("--parameter-popover-left", `${left}px`);
    const space = Math.max(0, anchor.top - gap - gutter);
    content.style.setProperty("--parameter-popover-height", `${space}px`);
    const height = content.getBoundingClientRect().height;
    const top = Math.max(gutter, anchor.top - gap - height);
    content.style.setProperty("--parameter-popover-top", `${top}px`);
  }
  const resizeObserver = new ResizeObserver(position);
  const dismiss = () => close();
  function track(enabled) {
    const listen = enabled ? "addEventListener" : "removeEventListener";
    view[listen]("resize", position);
    view[listen]("blur", dismiss);
    doc[listen]("scroll", position, true);
    if (enabled) {
      resizeObserver.observe(content);
      resizeObserver.observe(trigger);
    } else resizeObserver.disconnect();
  }

  function open({ focus = true } = {}) {
    if (isOpen() || trigger.disabled || trigger.hidden) return;
    beforeOpen();
    content.showPopover({ source: trigger });
    onOpen();
    position();
    if (focus) {
      const items = focusTargets();
      (items.find(item => item.getAttribute("aria-checked") === "true") ||
        items.find(item => item.matches('[role="radio"], [role="checkbox"], .refined-lighting-card')) || items[0])?.focus({ preventScroll: true });
    }
  }
  function close({ focus = false } = {}) {
    if (isOpen()) content.hidePopover();
    if (focus && trigger.getClientRects().length) trigger.focus({ preventScroll: true });
  }
  function showInline() {
    close();
    content.removeAttribute("popover");
    content.classList.remove("parameter-popover");
    return () => {
      content.setAttribute("popover", "auto");
      content.classList.add("parameter-popover");
    };
  }
  function toggle(event) {
    event.preventDefault();
    if (isOpen()) close();
    else open();
  }
  function onToggle(event) {
    const active = event.newState === "open";
    trigger.setAttribute("aria-expanded", String(active));
    track(active);
  }
  function choose(event) {
    if (isOpen() && closeOnClick(event.target)) queueMicrotask(() => close({ focus: true }));
  }
  function onEscape(event) {
    if (event.key !== "Escape" || event.defaultPrevented || event.isComposing ||
      event.target.closest(".parameter-popover, .model-picker-popover") !== content) return;
    event.preventDefault();
    event.stopPropagation();
    close({ focus: true });
  }
  function onKey(event) {
    if (event.defaultPrevented || event.isComposing) return;
    if (!event.target.matches('[role="radio"], [role="checkbox"]')) return;
    const offsets = { ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1 };
    const offset = offsets[event.key];
    if (!offset) return;
    const items = focusTargets().filter(item => item.matches('[role="radio"], [role="checkbox"]'));
    const index = items.indexOf(event.target);
    if (index < 0) return;
    event.preventDefault();
    items[(items.length + index + offset) % items.length].focus();
  }
  trigger.addEventListener("click", toggle);
  content.addEventListener("toggle", onToggle);
  content.addEventListener("click", choose);
  content.addEventListener("keydown", onEscape, true);
  content.addEventListener("keydown", onKey);
  return { open, close, showInline, destroy() {
    close();
    track(false);
    trigger.removeEventListener("click", toggle);
    content.removeEventListener("toggle", onToggle);
    content.removeEventListener("click", choose);
    content.removeEventListener("keydown", onEscape, true);
    content.removeEventListener("keydown", onKey);
    content.removeAttribute("popover");
    content.classList.remove("parameter-popover");
    for (const key of ["width", "height", "left", "top"]) content.style.removeProperty(`--parameter-popover-${key}`);
    for (const key of ["popovertarget", "aria-controls", "aria-expanded"]) trigger.removeAttribute(key);
    if (!originalId) content.removeAttribute("id");
  } };
}

/**
 * [INPUT]: 依赖首页画布挂载槽、收展按钮和原工具的就绪信号
 * [OUTPUT]: 在同一个面板上管理画布收展、键盘焦点和同源 iframe 内的 Esc
 * [POS]: public 的首页共享画布面板，收起时保持原画布节点挂载
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export function bindHomeCanvasPanel(root, { onExpandedChange }) {
  const doc = root.ownerDocument;
  const panel = root.querySelector("#homeImageChatCanvasPanel");
  const toggle = root.querySelector("#homeImageChatCanvasToggle");
  const caption = toggle.querySelector("span");
  let label = "";
  let ready = false;
  let expanded = false;
  let frameDocument;

  function render() {
    panel.hidden = toggle.hidden = !ready;
    panel.inert = !expanded;
    root.toggleAttribute("data-canvas-ready", ready);
    if (label) root.dataset.canvasPanel = expanded ? "open" : "closed";
    else delete root.dataset.canvasPanel;
    toggle.setAttribute("aria-expanded", String(expanded));
    onExpandedChange(expanded);
  }

  function setExpanded(value) {
    if (expanded === value) return;
    expanded = value;
    render();
  }

  function handleEscape(event) {
    if (!expanded || event.key !== "Escape" || event.defaultPrevented || event.isComposing) return;
    const overlays = "dialog[open], [popover]:popover-open";
    if (doc.querySelector(overlays) || frameDocument?.querySelector(overlays)) return;
    event.preventDefault();
    event.stopPropagation();
    toggle.focus({ preventScroll: true });
    setExpanded(false);
  }

  function connectFrame() {
    const frame = panel.querySelector(".ai-render-studio-host:not([hidden]) > iframe:not([hidden])");
    const current = frame?.contentDocument;
    if (frameDocument === current) return;
    frameDocument?.removeEventListener("keydown", handleEscape);
    current?.addEventListener("keydown", handleEscape);
    frameDocument = current;
  }

  toggle.addEventListener("click", () => setExpanded(!expanded));
  toggle.addEventListener("keydown", handleEscape);
  panel.addEventListener("keydown", handleEscape);
  panel.addEventListener("load", connectFrame, true);
  new doc.defaultView.MutationObserver(connectFrame).observe(panel, {
    childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "data-ready"],
  });

  return {
    setLabel(value = "") {
      if (label === value) return;
      label = value;
      caption.textContent = label;
      ready = expanded = false;
      render();
    },
    update(available, reveal = false) {
      const nextReady = Boolean(label && available);
      const nextExpanded = nextReady && (expanded || !ready || reveal);
      if (ready === nextReady && expanded === nextExpanded) return;
      ready = nextReady;
      expanded = nextExpanded;
      render();
    },
    reveal() { if (ready) setExpanded(true); },
  };
}

/**
 * [INPUT]: 依赖三页共享侧栏、原生导航链接和 dialog、侧栏更新与连接入口、可选本地存储
 * [OUTPUT]: 启动时恢复桌面侧栏宽度，移动端复用侧栏节点，处理遮罩轻触、焦点恢复及向工具弹窗交接
 * [POS]: public 的跨工作台导航布局控制器，原生链接负责页面切换
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

(() => {
  const storageKey = "canvas-lab.product-sidebar-collapsed";
  const html = document.documentElement;
  function readCollapsed(fallback = false) {
    try { return window.localStorage.getItem(storageKey) === "true"; }
    catch { return fallback; }
  }
  let collapsed = readCollapsed();
  html.classList.toggle("workbench-sidebar-collapsed", collapsed);

  document.addEventListener("DOMContentLoaded", () => {
    const sidebar = document.getElementById("productSidebar");
    const dialog = document.getElementById("productSidebarDialog");
    const toggle = document.getElementById("productSidebarToggle");
    const opener = document.getElementById("productSidebarOpen");
    const shell = sidebar.parentElement;
    const mobile = window.matchMedia("(max-width: 900px)");
    let backdropPress = false;
    let openingUtility = false;

    function render() {
      const compact = !mobile.matches && collapsed;
      const label = mobile.matches ? "关闭侧栏" : compact ? "展开侧栏" : "折叠侧栏";
      html.classList.toggle("workbench-sidebar-collapsed", collapsed);
      toggle.setAttribute("aria-label", label);
      toggle.setAttribute("aria-expanded", String(!compact));
      toggle.title = label;
    }

    function placeSidebar() {
      const sidebarHadFocus = sidebar.contains(document.activeElement);
      if (mobile.matches) {
        if (sidebar.parentElement !== dialog) {
          dialog.append(sidebar);
          if (sidebarHadFocus) opener.focus({ preventScroll: true });
        }
      } else if (sidebar.parentElement !== shell) {
        const restoreFocus = dialog.open || document.activeElement === opener;
        if (dialog.open) dialog.close();
        shell.prepend(sidebar);
        if (restoreFocus) toggle.focus({ preventScroll: true });
      }
      render();
    }

    for (const button of [toggle, opener]) {
      button.addEventListener("keydown", (event) => {
        if (event.repeat && (event.key === "Enter" || event.key === " ")) event.preventDefault();
      });
    }
    toggle.addEventListener("click", () => {
      if (mobile.matches) {
        dialog.close();
        return;
      }
      collapsed = !collapsed;
      try { window.localStorage.setItem(storageKey, String(collapsed)); }
      catch { /* -------- 收展操作不依赖存储写入 -------- */ }
      render();
    });
    opener.addEventListener("click", () => {
      if (!mobile.matches || dialog.open) return;
      placeSidebar();
      dialog.showModal();
      opener.setAttribute("aria-expanded", "true");
      toggle.focus({ preventScroll: true });
    });
    dialog.addEventListener("close", () => {
      backdropPress = false;
      opener.setAttribute("aria-expanded", "false");
      if (mobile.matches && !openingUtility) opener.focus({ preventScroll: true });
      openingUtility = false;
    });
    // -------- 先关抽屉，再让工具打开弹窗并接管焦点 --------
    dialog.addEventListener("click", (event) => {
      if (event.defaultPrevented || !dialog.open || !event.target.closest("[data-app-update], #connectionButton")) return;
      openingUtility = true;
      dialog.close();
      opener.focus({ preventScroll: true });
    }, { capture: true });
    function onBackdrop(event) {
      if (event.target !== dialog) return false;
      const { left, right, top, bottom } = dialog.getBoundingClientRect();
      return event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom;
    }
    // -------- 从侧栏内部开始的拖动或文字选择，松手时不关闭抽屉 --------
    dialog.addEventListener("pointerdown", (event) => {
      if (event.isPrimary !== false && event.button === 0) backdropPress = !event.ctrlKey && onBackdrop(event);
    });
    dialog.addEventListener("pointercancel", () => { backdropPress = false; });
    dialog.addEventListener("click", (event) => {
      const clickedBackdrop = backdropPress && onBackdrop(event);
      backdropPress = false;
      if (!dialog.open || event.defaultPrevented) return;
      if (clickedBackdrop || event.target.closest("[data-feature-mode]")) dialog.close();
    });
    mobile.addEventListener("change", placeSidebar);
    window.addEventListener("pageshow", (event) => {
      if (!event.persisted) return;
      collapsed = readCollapsed(collapsed);
      placeSidebar();
    });
    placeSidebar();
  }, { once: true });
})();

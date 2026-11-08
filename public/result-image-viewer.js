/**
 * [INPUT]: 依赖结果图片与媒体容器、浏览器原生 dialog 和 result.css 的共享预览样式
 * [OUTPUT]: 对外提供结果图点击/键盘放大、滑动手势隔离、原始图片预览及关闭后的焦点归还
 * [POS]: public 的二维结果大图交互层，由 generation-results 挂接，不新增卡片按钮
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

const DRAG_THRESHOLD = 6;

export function bindResultImageViewer() {
  let dialog;
  let preview;
  let status;
  let caption;
  let trigger;

  function createDialog() {
    dialog = document.createElement("dialog");
    dialog.className = "result-image-viewer";
    dialog.tabIndex = -1;
    preview = document.createElement("img");
    preview.draggable = false;
    status = document.createElement("p");
    status.className = "result-image-viewer-status";
    status.setAttribute("role", "status");
    caption = document.createElement("p");
    caption.className = "result-image-viewer-caption";
    const hint = document.createElement("span");
    hint.className = "result-image-viewer-hint";
    hint.textContent = "点击任意位置或按 Esc 关闭";
    dialog.append(preview, status, caption, hint);
    document.body.append(dialog);
    preview.addEventListener("load", () => { status.hidden = true; });
    preview.addEventListener("error", () => {
      status.hidden = false;
      status.textContent = "图片加载失败，请关闭后重试";
    });
    dialog.addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => {
      preview.removeAttribute("src");
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
      trigger = null;
    });
  }

  function open(image) {
    if (!dialog) createDialog();
    trigger = image;
    status.textContent = "正在加载图片…";
    status.hidden = false;
    caption.textContent = image.alt;
    dialog.setAttribute("aria-label", `${image.alt} · 大图预览`);
    preview.alt = image.alt;
    preview.src = image.src;
    dialog.showModal();
    dialog.focus({ preventScroll: true });
  }

  return {
    bind(media, image) {
      let gesture = null;
      image.tabIndex = 0;
      image.setAttribute("role", "button");
      image.setAttribute("aria-haspopup", "dialog");
      image.setAttribute("aria-label", `查看大图：${image.alt}`);
      image.title = "点击查看大图";
      image.draggable = false;
      media.addEventListener("pointerdown", (event) => {
        gesture = { x: event.clientX, y: event.clientY, moved: false };
      });
      media.addEventListener("pointermove", (event) => {
        if (gesture && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > DRAG_THRESHOLD) {
          gesture.moved = true;
        }
      });
      media.addEventListener("pointercancel", () => {
        if (gesture) gesture.moved = true;
      });
      media.addEventListener("click", (event) => {
        const moved = gesture?.moved;
        gesture = null;
        if (moved || event.button > 0) return;
        if (event.target !== image && !event.target.classList.contains("result-comparison-range")) return;
        open(image);
      });
      image.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        open(image);
      });
    },
  };
}

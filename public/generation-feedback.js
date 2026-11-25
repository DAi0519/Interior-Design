/**
 * [INPUT]: 依赖实际结果图像的解码和显示尺寸、Canvas 模糊预览与 Web Animations API
 * [OUTPUT]: 提供新图首帧的模糊覆盖、自上而下揭示及取消，遵循减少动态效果偏好
 * [POS]: public 的共享生图反馈，仅由已知任务完成的显示层调用
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

const activeReveals = new WeakMap();
const veilHostClass = "generation-feedback-veil-host";
const decodingClass = "generation-feedback-decoding";

function createVeil(image, view, host) {
  const veil = image.ownerDocument.createElement("span");
  if (typeof veil.animate !== "function") return null;
  const { objectFit, borderRadius } = view.getComputedStyle(image);
  const { offsetWidth, offsetHeight } = image;
  if (!offsetWidth || !offsetHeight) return null;
  let width = offsetWidth;
  let height = offsetHeight;
  if (objectFit === "contain") {
    const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
    width = image.naturalWidth * scale;
    height = image.naturalHeight * scale;
  }
  // ---- 从已解码的结果图绘制轻量模糊层，避免重复加载图片 ----
  const preview = image.ownerDocument.createElement("canvas");
  const scale = 128 / Math.max(width, height);
  preview.width = Math.max(1, Math.round(width * scale));
  preview.height = Math.max(1, Math.round(height * scale));
  const context = preview.getContext("2d");
  if (!context) return null;
  try {
    context.drawImage(image, 0, 0, preview.width, preview.height);
  } catch {
    return null;
  }
  const positionHost = view.getComputedStyle(host).position === "static";
  if (positionHost) host.classList.add(veilHostClass);
  veil.className = "generation-feedback-veil";
  veil.setAttribute("aria-hidden", "true");
  veil.append(preview);
  Object.assign(veil.style, {
    left: `${image.offsetLeft + (offsetWidth - width) / 2}px`,
    top: `${image.offsetTop + (offsetHeight - height) / 2}px`,
    width: `${width}px`,
    height: `${height}px`,
    borderRadius,
  });
  image.after(veil);
  return {
    element: veil,
    remove() {
      veil.remove();
      if (positionHost) host.classList.remove(veilHostClass);
    },
  };
}

export function cancelGenerationReveal(image) {
  activeReveals.get(image)?.cancel();
}

export function revealGenerationImage(image) {
  const source = image?.src;
  const current = activeReveals.get(image);
  if (current?.source === source) return;
  current?.cancel();
  const view = image?.ownerDocument?.defaultView;
  if (!source || !view) return;
  const reducedMotion = view.matchMedia?.("(prefers-reduced-motion: reduce)");
  if (reducedMotion?.matches || typeof image.animate !== "function") return;

  const listener = new AbortController();
  let animation;
  let veil;
  const reveal = {
    source,
    cancel() {
      animation?.cancel();
      finish();
    },
  };

  function finish() {
    listener.abort();
    veil?.remove();
    veil = null;
    if (activeReveals.get(image) !== reveal) return;
    activeReveals.delete(image);
    image.classList.remove(decodingClass);
  }

  function start() {
    if (activeReveals.get(image) !== reveal) return;
    const host = image.parentElement;
    if (!host || image.src !== source || !image.naturalWidth || !image.naturalHeight || !image.isConnected || reducedMotion?.matches) {
      finish();
      return;
    }
    listener.abort();
    veil = createVeil(image, view, host);
    if (!veil) {
      finish();
      return;
    }
    animation = veil.element.animate([
      { maskPosition: "50% 90%" },
      { maskPosition: "50% 90%", offset: 0.14, easing: "cubic-bezier(0.32, 0, 0.25, 1)" },
      { maskPosition: "50% 10%" },
    ], { duration: 1100, fill: "both" });
    image.classList.remove(decodingClass);
    animation.finished.then(finish, finish);
  }

  activeReveals.set(image, reveal);
  image.classList.add(decodingClass);
  if (typeof image.decode === "function") image.decode().then(start, finish);
  else if (image.complete) queueMicrotask(start);
  else {
    image.addEventListener("load", start, { once: true, signal: listener.signal });
    image.addEventListener("error", finish, { once: true, signal: listener.signal });
  }
}

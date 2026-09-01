/**
 * [INPUT]: 依赖三页静态 product-switcher/data-active-index、同源导航链接与 prefers-reduced-motion 系统偏好
 * [OUTPUT]: 对外提供可打断的 140ms 导航前激活块位移，完成后使用原生 location.assign 切换工作台
 * [POS]: public 的跨工作台导航反馈层，只更新静态索引并将反复点击重定向到最后目标
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

const navigationDurationMs = 140;
const switcher = document.querySelector(".product-switcher");

function hasModifiedClick(event) {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

if (switcher) {
  const options = Array.from(switcher.querySelectorAll(".product-switch-option"));
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let navigationTimer = null;

  options.forEach((option, targetIndex) => {
    option.addEventListener("click", (event) => {
      const destination = new URL(option.href, window.location.href);
      if (
        event.defaultPrevented
        || hasModifiedClick(event)
        || reduceMotion.matches
        || destination.origin !== window.location.origin
        || option.getAttribute("aria-current") === "page"
      ) return;

      event.preventDefault();
      switcher.dataset.activeIndex = String(targetIndex);
      window.clearTimeout(navigationTimer);
      navigationTimer = window.setTimeout(() => {
        window.location.assign(destination.href);
      }, navigationDurationMs);
    });
  });
}

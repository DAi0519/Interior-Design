/**
 * [INPUT]: 依赖两页共享的 product-switcher DOM、服务端暴露的固定版本 GSAP 浏览器包与浏览器 reduced-motion 偏好
 * [OUTPUT]: 对外提供生图工作台/模型评测切换指示块、内容面板零入场动效，以及 reduced-motion 下的原生导航降级
 * [POS]: public 的跨工作台导航交互层，与 product-navigation.css 共同维护两页切换体验，不介入各页面业务状态
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

const gsap = window.gsap;
const switcher = document.querySelector(".product-switcher");

if (gsap && switcher) {
  const options = Array.from(switcher.querySelectorAll(".product-switch-option"));
  const currentIndex = Math.max(0, options.findIndex(
    (option) => option.getAttribute("aria-current") === "page",
  ));
  const indicator = document.createElement("span");
  indicator.className = "product-switch-indicator";
  indicator.setAttribute("aria-hidden", "true");
  switcher.prepend(indicator);
  gsap.set(indicator, { xPercent: currentIndex * 100 });
  switcher.classList.add("is-motion-ready");

  const media = gsap.matchMedia();
  media.add(
    {
      motionAllowed: "(prefers-reduced-motion: no-preference)",
      reduceMotion: "(prefers-reduced-motion: reduce)",
    },
    ({ conditions }) => {
      let transitioning = false;

      function navigate(event) {
        if (event.type === "keydown" && event.key !== "Enter") return;
        const option = event.currentTarget;
        const destination = new URL(option.href, window.location.href);
        const targetIndex = options.indexOf(option);
        const modifiedClick = event.metaKey
          || event.ctrlKey
          || event.shiftKey
          || event.altKey;

        if (
          modifiedClick
          || destination.origin !== window.location.origin
          || option.getAttribute("aria-current") === "page"
        ) return;

        if (conditions.reduceMotion) return;
        event.preventDefault();
        if (transitioning) return;
        transitioning = true;
        option.classList.add("is-transition-target");

        gsap.to(indicator, {
          duration: 0.16,
          ease: "power2.inOut",
          onComplete: () => window.location.assign(destination.href),
          overwrite: true,
          xPercent: targetIndex * 100,
        });
      }

      options.forEach((option) => {
        option.addEventListener("click", navigate);
        option.addEventListener("keydown", navigate);
      });
      return () => {
        options.forEach((option) => {
          option.removeEventListener("click", navigate);
          option.removeEventListener("keydown", navigate);
        });
      };
    },
  );
}

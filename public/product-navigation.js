/**
 * [INPUT]: 依赖两页共享的 product-switcher DOM、当前页 aria-current、同标签页 sessionStorage 与 window.gsap 核心运行时
 * [OUTPUT]: 对外提供 GSAP 双层 transform 工作台切换，以点击时间连续续播 180ms 黑色激活视窗与白字轨道，并通过 gsap.matchMedia 在 reduced-motion 下瞬时落位
 * [POS]: public 的跨工作台导航状态层，只用 GSAP xPercent 驱动合成层位移，不补间颜色、字重或内容面板
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

const switcher = document.querySelector(".product-switcher");
const transitionStorageKey = "canvas-lab:product-navigation-motion";
const transitionMaxAgeMs = 2_000;
const transitionDurationSeconds = 0.18;

function hasModifiedClick(event) {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

function currentLocationKey() {
  return `${window.location.pathname}${window.location.search}`;
}

function readTransitionState() {
  try {
    const state = JSON.parse(window.sessionStorage.getItem(transitionStorageKey));
    window.sessionStorage.removeItem(transitionStorageKey);
    if (
      !state
      || state.destination !== currentLocationKey()
      || Date.now() - state.createdAt > transitionMaxAgeMs
      || !Number.isInteger(state.sourceIndex)
    ) return null;
    return state;
  } catch {
    return null;
  }
}

function writeTransitionState(destination, sourceIndex) {
  try {
    window.sessionStorage.setItem(transitionStorageKey, JSON.stringify({
      createdAt: Date.now(),
      destination: `${destination.pathname}${destination.search}`,
      sourceIndex,
    }));
  } catch {
    // sessionStorage 不可用时仍保留原生导航，不阻塞工作台切换。
  }
}

function createActiveLayer(options) {
  const viewport = document.createElement("span");
  viewport.className = "product-switch-active-viewport";
  viewport.setAttribute("aria-hidden", "true");
  const layer = document.createElement("span");
  layer.className = "product-switch-active-layer";
  options.forEach((option) => {
    const activeOption = document.createElement("span");
    activeOption.className = "product-switch-active-option";
    activeOption.textContent = option.textContent;
    layer.append(activeOption);
  });
  viewport.append(layer);
  return { layer, viewport };
}

if (switcher) {
  const options = Array.from(switcher.querySelectorAll(".product-switch-option"));
  const currentIndex = Math.max(0, options.findIndex(
    (option) => option.getAttribute("aria-current") === "page",
  ));
  const reduceMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const rememberedState = readTransitionState();
  const sourceIndex = rememberedState && !reduceMotionQuery.matches
    ? Math.min(options.length - 1, Math.max(0, rememberedState.sourceIndex))
    : currentIndex;
  const transitionElapsedSeconds = rememberedState
    ? Math.max(0, (Date.now() - rememberedState.createdAt) / 1_000)
    : 0;
  const { layer: activeLayer, viewport: activeViewport } = createActiveLayer(options);
  const gsap = window.gsap;

  if (gsap) {
    switcher.prepend(activeViewport);
    switcher.classList.add("is-motion-ready");

    let navigationTween = null;
    const media = gsap.matchMedia();
    media.add(
      {
        allowMotion: "(prefers-reduced-motion: no-preference)",
        reduceMotion: "(prefers-reduced-motion: reduce)",
      },
      (context) => {
        const startIndex = context.conditions.reduceMotion ? currentIndex : sourceIndex;
        switcher.dataset.activeIndex = String(startIndex);
        gsap.set(activeViewport, { force3D: true, xPercent: startIndex * 100 });
        gsap.set(activeLayer, { force3D: true, xPercent: startIndex * -50 });

        if (startIndex !== currentIndex) {
          switcher.dataset.activeIndex = String(currentIndex);
          navigationTween = gsap.to([activeViewport, activeLayer], {
            duration: transitionDurationSeconds,
            ease: "power3.inOut",
            force3D: true,
            overwrite: "auto",
            paused: true,
            xPercent: (index) => (index === 0 ? currentIndex * 100 : currentIndex * -50),
          });
          navigationTween.time(Math.min(
            transitionElapsedSeconds,
            transitionDurationSeconds,
          ));
          if (navigationTween.progress() < 1) navigationTween.play();
        }

        return () => navigationTween?.kill();
      },
    );
  }

  options.forEach((option) => {
    option.addEventListener("click", (event) => {
      if (hasModifiedClick(event) || reduceMotionQuery.matches) return;
      const destination = new URL(option.href, window.location.href);
      if (
        destination.origin !== window.location.origin
        || option.getAttribute("aria-current") === "page"
      ) return;
      writeTransitionState(destination, currentIndex);
    });
  });
}

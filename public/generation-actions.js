/**
 * [INPUT]: 依赖生成动作 DOM、调用方提供的白模/空房设计 Prompt 输入指纹与普通生成/图片超分/强制重新生成 Prompt 回调
 * [OUTPUT]: 对外提供固定 START/RUNNING… 视觉文案、随生图/图片超分/复用态变化的中文 aria-label、运行态 is-busy/aria-busy 语义、纯状态推导 generationActionState 与 bindGenerationActions 生成动作控制器
 * [POS]: public 的生成动作状态层，负责首次单按钮与提示词可复用后的双按钮切换
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export function generationActionState({
  busy = false,
  currentIdentity = "",
  featureMode,
  reusableIdentity = null,
}) {
  const designPromptFlow = ["whiteModel", "emptyRoom"].includes(featureMode);
  const hasReusablePrompt = designPromptFlow
    && Boolean(reusableIdentity)
    && currentIdentity === reusableIdentity;
  return {
    hasReusablePrompt,
    mainLabel: busy ? "RUNNING…" : "START",
    mainAriaLabel: busy
      ? "生成中"
      : designPromptFlow
        ? hasReusablePrompt ? "再次渲染" : "开始渲染"
        : featureMode === "imageUpscale" ? "开始超分" : "开始生成",
  };
}

export function bindGenerationActions({
  getPromptIdentity,
  onGenerate,
  onRegenerate,
}) {
  const root = document.querySelector("#generationActions");
  const generateButton = document.querySelector("#generateButton");
  const regenerateButton = document.querySelector("#regeneratePromptButton");
  const label = generateButton.querySelector(".button-label span");
  let busy = false;
  let featureMode = "whiteModel";
  let reusableIdentity = null;

  function currentIdentity() {
    return getPromptIdentity();
  }

  function render() {
    const view = generationActionState({
      busy,
      currentIdentity: currentIdentity(),
      featureMode,
      reusableIdentity,
    });
    label.textContent = view.mainLabel;
    generateButton.setAttribute("aria-label", view.mainAriaLabel);
    generateButton.setAttribute("aria-busy", String(busy));
    root.classList.toggle("has-reusable-prompt", view.hasReusablePrompt);
    root.classList.toggle("is-busy", busy);
    regenerateButton.classList.toggle("hidden", !view.hasReusablePrompt);
    generateButton.disabled = busy;
    regenerateButton.disabled = busy;
  }

  generateButton.addEventListener("click", onGenerate);
  regenerateButton.addEventListener("click", onRegenerate);

  return {
    clearReusable() {
      reusableIdentity = null;
      render();
    },
    currentIdentity,
    markReusable(identity = currentIdentity()) {
      reusableIdentity = identity;
      render();
    },
    refresh: render,
    setBusy(value) {
      busy = Boolean(value);
      render();
    },
    setFeatureMode(value) {
      featureMode = value;
      render();
    },
  };
}

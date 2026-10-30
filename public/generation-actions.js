/**
 * [INPUT]: 依赖生成动作DOM、可选当前功能不可用原因、调用方的设计Prompt输入指纹与生成/强制重新生成回调
 * [OUTPUT]: 对外提供设计Prompt复用动作、固定START/RUNNING…文案及二次编辑等中文动作语义、运行态语义与可恢复配置门禁，导出generationActionState/bindGenerationActions
 * [POS]: public 的生成动作状态层，负责首次单按钮与提示词可复用后的双按钮切换
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export function generationActionState({
  busy = false,
  currentIdentity = "",
  featureMode,
  reusableIdentity = null,
}) {
  const designPromptFlow = ["whiteModel", "emptyRoom", "roomRenovation", "styleTransfer"].includes(featureMode);
  const hasReusablePrompt = designPromptFlow
    && Boolean(reusableIdentity)
    && currentIdentity === reusableIdentity;
  return {
    hasReusablePrompt,
    mainLabel: busy ? "RUNNING…" : "START",
    mainAriaLabel: busy
      ? "生成中"
      : designPromptFlow
        ? featureMode === "styleTransfer"
          ? hasReusablePrompt ? "再次转换风格" : "开始转换风格"
          : hasReusablePrompt ? "再次渲染" : "开始渲染"
        : featureMode === "imageMultiAngle" ? "开始多角度编辑"
        : featureMode === "imageOutpaint" ? "开始扩图"
        : featureMode === "imageMaskFill" ? "开始二次编辑"
        : featureMode === "imageRelight" ? "开始打光"
          : featureMode === "imageUpscale" ? "开始超分" : "开始生成",
  };
}

export function bindGenerationActions({
  getPromptIdentity,
  getUnavailableReason = () => null,
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
    const unavailableReason = getUnavailableReason();
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
    generateButton.disabled = busy || Boolean(unavailableReason);
    regenerateButton.disabled = busy || Boolean(unavailableReason);
    generateButton.title = unavailableReason || "";
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

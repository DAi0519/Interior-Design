/**
 * [INPUT]: 依赖旧房改造两阶段回执、当前原图、工作台共享图片安全检查与按钮样式
 * [OUTPUT]: 对外提供空房设计模式判定、旧房流程说明和原图/清空图/设计图切换及对应下载目标
 * [POS]: public 的旧房改造包装层，复用空房配置与统一结果画廊，不维护第二套设计流程
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { secureImageUrl } from "./workbench-utils.js";

export function isEmptyRoomDesign(featureMode) {
  return featureMode === "emptyRoom" || featureMode === "roomRenovation";
}

export function renderRenovationIntro(root, visible) {
  root.classList.toggle("hidden", !visible);
  if (root.childElementCount) return;
  const heading = document.createElement("h2");
  heading.textContent = "先清空，再设计";
  const steps = document.createElement("p");
  steps.className = "renovation-steps";
  steps.textContent = "旧房照片 → 清空房间 → 全新设计";
  const note = document.createElement("p");
  note.className = "compact-config-note";
  note.textContent = "移除家具、家电和杂物，保留墙体、门窗与原机位。每个方案分两次出图，完成后可查看清空图。";
  root.append(heading, steps, note);
}

export function renovationImageChoices(result, comparisonImage) {
  if (!result?.roomRenovation) return [];
  const pipeline = result.roomRenovation;
  return [
    { label: "原图", image: pipeline.originalImage || (comparisonImage?.dataUrl
      ? { url: comparisonImage.dataUrl, ...comparisonImage } : null) },
    { label: "清空图", image: pipeline.clearedImage },
    { label: "设计图", image: result.images?.[0] },
  ].filter(({ image }) => image?.url);
}

export function bindRenovationPreview({ result, comparisonImage, image, modelLabel }) {
  const choices = renovationImageChoices(result, comparisonImage);
  if (!choices.length) return null;
  const root = document.createElement("div");
  root.className = "renovation-image-choices";
  root.setAttribute("role", "group");
  root.setAttribute("aria-label", `${modelLabel} 旧房改造过程`);
  let current = choices.at(-1);
  const buttons = choices.map((choice) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "result-download-button";
    button.textContent = choice.label;
    button.addEventListener("click", () => { current = choice; render(); });
    root.append(button);
    return button;
  });
  function render() {
    image.src = secureImageUrl(current.image.url);
    image.alt = `${modelLabel} ${current.label}`;
    buttons.forEach((button, index) => {
      button.setAttribute("aria-pressed", String(choices[index] === current));
    });
  }
  render();
  return { root, selection: () => ({
    result: { ...result, images: [current.image], request: { ...result.request,
      outputFormat: current.image.url.startsWith("data:image/jpeg") ? "jpeg"
        : current.image.url.startsWith("data:image/webp") ? "webp" : "png" } },
    label: `${modelLabel}-${current.label}`,
  }) };
}

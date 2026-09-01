/**
 * [INPUT]: 依赖 workbench-utils 的字节格式化、Beta跑图上传槽 DOM 与调用方提供的图片状态/校验回调
 * [OUTPUT]: 对外提供同生图工作台语法的图片预览、删除、点击选择、多图拖放与单图原位替换交互
 * [POS]: public 的 Beta跑图上传呈现层，保持批量状态归 beta-app.js 管理，不复制图片读取和业务限制
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { formatBytes } from "./workbench-utils.js";

function createImagePreview(image, onRemove, { replaceEnabled = false } = {}) {
  const item = document.createElement("article");
  const preview = document.createElement("img");
  const copy = document.createElement("div");
  const name = document.createElement("strong");
  const size = document.createElement("span");
  const remove = document.createElement("button");
  item.className = "reference-item";
  preview.src = image.dataUrl;
  preview.alt = "";
  name.textContent = image.name;
  size.textContent = [
    formatBytes(image.size),
    image.width && image.height ? `${image.width} × ${image.height}` : null,
  ].filter(Boolean).join(" · ");
  copy.append(name, size);
  if (replaceEnabled) {
    const hint = document.createElement("span");
    hint.className = "reference-replace-hint";
    hint.textContent = "拖入新图可直接替换";
    copy.append(hint);
  }
  remove.type = "button";
  remove.className = "reference-remove";
  remove.ariaLabel = `移除 ${image.name}`;
  remove.textContent = "×";
  remove.addEventListener("click", onRemove);
  item.append(preview, copy, remove);
  return item;
}

export function renderImagePreviews(list, images, { onRemove, replaceEnabled = false } = {}) {
  list.classList.toggle("replace-enabled", replaceEnabled);
  if (!replaceEnabled) list.classList.remove("dragging");
  list.replaceChildren(...images.map((image, index) =>
    createImagePreview(image, () => onRemove(index), { replaceEnabled })));
}

export function bindImageDrop({ canReplace = () => false, dropZone, input, list, onFiles }) {
  input.addEventListener("change", async (event) => {
    await onFiles(event.target.files, { replace: false });
    event.target.value = "";
  });
  for (const eventName of ["dragenter", "dragover"]) {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropZone.classList.add("dragging");
    });
  }
  for (const eventName of ["dragleave", "drop"]) {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropZone.classList.remove("dragging");
    });
  }
  dropZone.addEventListener("drop", async (event) => {
    await onFiles(event.dataTransfer.files, { replace: false });
  });
  if (!list) return;
  for (const eventName of ["dragenter", "dragover"]) {
    list.addEventListener(eventName, (event) => {
      if (!canReplace()) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      list.classList.add("dragging");
    });
  }
  list.addEventListener("dragleave", (event) => {
    if (!list.contains(event.relatedTarget)) list.classList.remove("dragging");
  });
  list.addEventListener("drop", async (event) => {
    if (!canReplace()) return;
    event.preventDefault();
    list.classList.remove("dragging");
    await onFiles(event.dataTransfer.files, { replace: true });
  });
}

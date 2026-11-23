/**
 * [INPUT]: 依赖 workbench-utils 的字节格式化与文件读取、image-ratio 图片尺寸及 Beta 跑图上传槽
 * [OUTPUT]: 提供 8MB 静态图片读取、Blob/飞书轻量预览、可选删除、点击选择、多图拖放与单图原位替换
 * [POS]: public 的 Beta跑图上传层，保持批量状态归 beta-app.js 管理
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { readImageDimensions } from "./image-ratio.js";
import { formatBytes, readFileAsInput } from "./workbench-utils.js";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export async function readBetaImage(file, { previewOnly = false } = {}) {
  if (!file || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    throw new Error(`${file?.name || "文件"} 不是 PNG、JPEG 或 WebP`);
  }
  if (file.size > MAX_IMAGE_BYTES) throw new Error(`${file.name} 超过 8MB`);
  if (previewOnly) {
    const previewUrl = URL.createObjectURL(file);
    try {
      return { file, name: file.name, size: file.size, type: file.type, previewUrl,
        ...await readImageDimensions(previewUrl, file.name), lastModified: file.lastModified };
    } catch (error) {
      URL.revokeObjectURL(previewUrl);
      throw error;
    }
  }
  const input = await readFileAsInput(file);
  return {
    ...input,
    ...await readImageDimensions(input.dataUrl, file.name),
    lastModified: file.lastModified,
  };
}

function createImagePreview(image, onRemove, { replaceEnabled = false, canRemove = () => true } = {}) {
  const item = document.createElement("article");
  const preview = document.createElement("img");
  const copy = document.createElement("div");
  const name = document.createElement("strong");
  const size = document.createElement("span");
  const remove = document.createElement("button");
  item.className = "reference-item";
  preview.src = image.previewUrl || image.dataUrl;
  preview.loading = "lazy";
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
  remove.disabled = !canRemove(image);
  remove.addEventListener("click", onRemove);
  item.append(preview, copy, remove);
  return item;
}

export function renderImagePreviews(list, images, { onRemove, replaceEnabled = false, canRemove } = {}) {
  list.classList.toggle("replace-enabled", replaceEnabled);
  if (!replaceEnabled) list.classList.remove("dragging");
  list.replaceChildren(...images.map((image, index) =>
    createImagePreview(image, () => onRemove(index), { replaceEnabled, canRemove })));
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

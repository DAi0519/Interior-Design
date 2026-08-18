/**
 * [INPUT]: 依赖图片文件读取、可信尺寸探测、浏览器上传 DOM、服务端公开参考图策略与调用方数量/名称规则
 * [OUTPUT]: 对外提供可复用的单/多参考图上传控制器，统一预览、删除、拖放、单图原位替换、格式容量校验与变更通知
 * [POS]: public 的参考图上传交互层，被主白模/精模图与白模风格参考图两个独立输入位复用
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { readImageDimensions } from "./image-ratio.js";
import { formatBytes, readFileAsDataUrl } from "./workbench-utils.js";

function createReferenceItem(image, onRemove, { replaceEnabled = false } = {}) {
  const item = document.createElement("article");
  item.className = "reference-item";
  const preview = document.createElement("img");
  preview.src = image.dataUrl;
  preview.alt = "";
  const copy = document.createElement("div");
  const name = document.createElement("strong");
  const size = document.createElement("span");
  name.textContent = image.name;
  size.textContent = [
    formatBytes(image.size),
    image.width && image.height ? `${image.width} × ${image.height}` : null,
  ].filter(Boolean).join(" · ");
  copy.append(name, size);
  if (replaceEnabled) {
    const replaceHint = document.createElement("span");
    replaceHint.className = "reference-replace-hint";
    replaceHint.textContent = "拖入新图可直接替换";
    copy.append(replaceHint);
  }
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "reference-remove";
  remove.ariaLabel = `移除 ${image.name}`;
  remove.textContent = "×";
  remove.addEventListener("click", onRemove);
  item.append(preview, copy, remove);
  return item;
}

export function bindReferenceUpload({
  count,
  dropZone,
  getLimit,
  getPolicy,
  getSubject,
  input,
  list,
  onChange = () => {},
  showToast,
}) {
  let images = [];

  function render() {
    const limit = getLimit();
    const replaceEnabled = limit === 1 && images.length === 1;
    count.textContent = `${images.length} / ${limit}`;
    dropZone.classList.toggle("hidden", images.length >= limit);
    list.classList.toggle("replace-enabled", replaceEnabled);
    if (!replaceEnabled) list.classList.remove("dragging");
    list.replaceChildren(
      ...images.map((image) => createReferenceItem(image, () => {
        const previousImages = images;
        images = images.filter((entry) => entry.id !== image.id);
        render();
        onChange({ images: images.slice(), previousImages });
      }, { replaceEnabled })),
    );
  }

  async function addFiles(fileList, { replace = false } = {}) {
    const policy = getPolicy();
    if (!policy) return;
    const limit = getLimit();
    const subject = getSubject();
    const incoming = Array.from(fileList);
    if (incoming.length === 0) return;
    const baseImages = replace ? [] : images;
    const remaining = limit - baseImages.length;
    if (remaining <= 0) {
      showToast(`最多添加 ${limit} 张${subject}`);
      return;
    }
    const accepted = incoming.slice(0, remaining);
    if (incoming.length > remaining) {
      showToast(replace
        ? `本次只使用第一张${subject}替换旧图`
        : `本次只添加前 ${remaining} 张，最多支持 ${limit} 张${subject}`);
    }
    for (const file of accepted) {
      if (!policy.accept.includes(file.type)) {
        showToast(`${file.name} 不是 PNG、JPEG 或 WebP`);
        return;
      }
      if (file.size > policy.maxBytesPerImage) {
        showToast(`${file.name} 超过单张 8MB 限制`);
        return;
      }
    }
    const currentBytes = baseImages.reduce((total, image) => total + image.size, 0);
    const incomingBytes = accepted.reduce((total, file) => total + file.size, 0);
    if (currentBytes + incomingBytes > policy.maxTotalBytes) {
      showToast(`${subject}合计不能超过 20MB`);
      return;
    }

    let nextImages;
    try {
      nextImages = await Promise.all(accepted.map(async (file) => {
        const dataUrl = await readFileAsDataUrl(file);
        const dimensions = await readImageDimensions(dataUrl, file.name);
        return {
          dataUrl,
          ...dimensions,
          id: crypto.randomUUID(),
          name: file.name,
          size: file.size,
          type: file.type,
        };
      }));
    } catch (error) {
      showToast(error.message);
      return;
    }
    const previousImages = images;
    images = replace ? nextImages : [...images, ...nextImages];
    render();
    onChange({ images: images.slice(), previousImages });
  }

  input.addEventListener("change", async (event) => {
    await addFiles(event.target.files);
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
    await addFiles(event.dataTransfer.files);
  });

  function canReplaceByDrop() {
    return getLimit() === 1 && images.length === 1;
  }

  for (const eventName of ["dragenter", "dragover"]) {
    list.addEventListener(eventName, (event) => {
      if (!canReplaceByDrop()) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      list.classList.add("dragging");
    });
  }
  list.addEventListener("dragleave", (event) => {
    if (!list.contains(event.relatedTarget)) list.classList.remove("dragging");
  });
  list.addEventListener("drop", async (event) => {
    if (!canReplaceByDrop()) return;
    event.preventDefault();
    list.classList.remove("dragging");
    await addFiles(event.dataTransfer.files, { replace: true });
  });

  return { images: () => images.slice(), render };
}

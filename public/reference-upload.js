/**
 * [INPUT]: 依赖文件读取、图片像素解码、共享格式识别、浏览器上传 DOM 和调用方图片策略
 * [OUTPUT]: 提供按功能保留的上传、预览与替换、对话附件角标挂接点，以及上传格式处理
 * [POS]: public 的参考图上传交互层，供独立上传位与首页同一主参考图数据复用
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { loadImage } from "./image-ratio.js";
import { referenceImageMime } from "./reference-image-format.js";
import { formatBytes, readFileAsDataUrl } from "./workbench-utils.js";

async function readReferenceFile(file, normalizeFormats) {
  let dataUrl = await readFileAsDataUrl(file);
  let type = file.type;
  let size = file.size;
  let requiresConversion = false;
  if (normalizeFormats) {
    const comma = dataUrl.indexOf(",");
    const signature = atob(dataUrl.slice(comma + 1, comma + 17));
    const actualType = referenceImageMime(Uint8Array.from(signature, char => char.charCodeAt(0)));
    requiresConversion = !actualType;
    if (actualType) {
      type = actualType;
      dataUrl = `data:${type};base64,${dataUrl.slice(comma + 1)}`;
    }
  }

  const image = await loadImage(dataUrl, file.name);
  const { naturalWidth: width, naturalHeight: height } = image;
  if (requiresConversion) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error(`无法转换 ${file.name}`);
    context.drawImage(image, 0, 0);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/webp", 0.95));
    if (!blob) throw new Error(`无法转换 ${file.name}`);
    dataUrl = await readFileAsDataUrl(blob);
    type = blob.type;
    size = blob.size;
  }
  return { dataUrl, width, height, id: crypto.randomUUID(), name: file.name, size, type };
}

function createReferenceItem(image, onRemove, { replaceEnabled = false } = {}) {
  const item = document.createElement("article");
  item.className = "reference-item";
  item.setAttribute("data-chat-attachment", "");
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
  remove.setAttribute("data-chat-attachment-remove", "");
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
  getScope = () => null,
  isEnabled = () => true,
  onChange = () => {},
  showToast,
}) {
  list.setAttribute("data-chat-attachment-list", "");
  const drafts = new Map();
  function draftFor(scope) {
    if (!drafts.has(scope)) drafts.set(scope, { images: [], epoch: 0 });
    return drafts.get(scope);
  }

  function render() {
    const draft = draftFor(getScope());
    const { images } = draft;
    const enabled = isEnabled();
    input.disabled = !enabled;
    const policy = getPolicy();
    if (policy) input.accept = policy.normalizeFormats ? "" : policy.accept.join(",");
    if (!enabled) {
      draft.epoch += 1;
      dropZone.classList.remove("dragging");
    }
    const limit = getLimit();
    const replaceEnabled = canReplaceImage();
    count.textContent = `${images.length} / ${limit}`;
    dropZone.classList.toggle("hidden", images.length >= limit);
    list.classList.toggle("replace-enabled", replaceEnabled);
    if (!replaceEnabled) list.classList.remove("dragging");
    list.replaceChildren(
      ...images.map((image, index) => createReferenceItem(image, () => {
        remove(image.id);
        const neighbor = list.children[index] ?? list.lastElementChild;
        (neighbor?.querySelector(".reference-remove") ?? input).focus({ preventScroll: true });
      }, { replaceEnabled })),
    );
  }

  function remove(id) {
    const draft = draftFor(getScope());
    if (!draft.images.some(image => image.id === id)) return;
    draft.epoch += 1;
    const previousImages = draft.images;
    draft.images = previousImages.filter(image => image.id !== id);
    render();
    onChange({ images: draft.images.slice(), previousImages });
  }

  async function addFiles(fileList, { replace = false } = {}) {
    if (!isEnabled()) return;
    const policy = getPolicy();
    if (!policy) return;
    const limit = getLimit();
    const subject = getSubject();
    const scope = getScope();
    const draft = draftFor(scope);
    const incoming = Array.from(fileList);
    if (incoming.length === 0) return;
    const baseImages = replace ? [] : draft.images;
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
      if (!policy.normalizeFormats && !policy.accept.includes(file.type)) {
        showToast(`${file.name} 不是 PNG、JPEG 或 WebP`);
        return;
      }
      if (policy.maxBytesPerImage != null && file.size > policy.maxBytesPerImage) {
        showToast(`${file.name} 超过单张 ${Math.floor(policy.maxBytesPerImage / 1024 / 1024)}MB 限制`);
        return;
      }
    }
    const currentBytes = baseImages.reduce((total, image) => total + image.size, 0);
    const incomingBytes = accepted.reduce((total, file) => total + file.size, 0);
    if (currentBytes + incomingBytes > policy.maxTotalBytes) {
      showToast(`${subject}合计不能超过 ${Math.floor(policy.maxTotalBytes / 1024 / 1024)}MB`);
      return;
    }

    // --- 单图仅在同步校验通过后取消旧读取，非法文件与取消不影响在途有效图片 ---
    const readEpoch = limit === 1 ? ++draft.epoch : draft.epoch;
    let nextImages;
    try {
      nextImages = await Promise.all(accepted.map(file => readReferenceFile(file, policy.normalizeFormats)));
    } catch (error) {
      if (scope === getScope() && readEpoch === draft.epoch && isEnabled()) showToast(error.message);
      return;
    }
    // --- 来源已清除或切为互斥选项时，丢弃尚未完成的文件读取 ---
    const current = scope === getScope();
    if (readEpoch !== draft.epoch || (current && !isEnabled())) return;
    const next = replace ? nextImages : [...draft.images, ...nextImages];
    if (next.length > limit) {
      if (current) showToast(`最多添加 ${limit} 张${subject}`);
      return;
    }
    if (next.reduce((total, image) => total + image.size, 0) > policy.maxTotalBytes) {
      if (current) showToast(`${subject}合计不能超过 ${Math.floor(policy.maxTotalBytes / 1024 / 1024)}MB`);
      return;
    }
    const previousImages = draft.images;
    draft.images = next;
    if (!current) return;
    render();
    onChange({ images: next.slice(), previousImages });
  }

  input.addEventListener("change", (event) => {
    const files = Array.from(event.target.files);
    event.target.value = "";
    return addFiles(files, { replace: canReplaceImage() });
  });
  for (const eventName of ["dragenter", "dragover"]) {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      if (!isEnabled()) return;
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

  function canReplaceImage() {
    return isEnabled() && getLimit() === 1 && draftFor(getScope()).images.length === 1;
  }

  for (const eventName of ["dragenter", "dragover"]) {
    list.addEventListener(eventName, (event) => {
      if (!isEnabled()) { event.preventDefault(); return; }
      if (!canReplaceImage()) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      list.classList.add("dragging");
    });
  }
  list.addEventListener("dragleave", (event) => {
    if (!list.contains(event.relatedTarget)) list.classList.remove("dragging");
  });
  list.addEventListener("drop", async (event) => {
    if (!isEnabled()) { event.preventDefault(); list.classList.remove("dragging"); return; }
    if (!canReplaceImage()) return;
    event.preventDefault();
    list.classList.remove("dragging");
    await addFiles(event.dataTransfer.files, { replace: true });
  });

  function clear({ notify = true } = {}) {
    const draft = draftFor(getScope());
    draft.epoch += 1;
    const previousImages = draft.images;
    draft.images = [];
    input.value = "";
    render();
    if (notify) onChange({ images: [], previousImages });
  }

  const imagesForScope = scope => drafts.get(scope)?.images.slice() || [];
  return { images: () => imagesForScope(getScope()), imagesForScope, addFiles, remove, render, clear };
}

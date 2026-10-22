/**
 * [INPUT]: 依赖room-renovation 的三图选择器与两阶段回执、统一 API、结果摘要/安全图片 URL、任务原图、浏览器 Blob 与同源远程图片下载接口、全景预览器、结果区 DOM 与 Toast 回调
 * [OUTPUT]: 对外提供空态、加载态、错误态、旧房原图/清空图/设计图切换与设计失败后的清空产物、单模型多张/多模型结果画廊、默认关闭且按需开启的原图/结果图 50% 轻量滑动对比、全景图美化专属 360°预览、总耗时/ComfyUI 分段耗时、内嵌图片本地下载、远程图片代理下载和独立飞书同步轮询
 * [POS]: public 的生成结果呈现层，承接单模型最多四张或任意数量模型的成功与部分失败结果，隔离下载传输并按功能限定滑动对比与沉浸式预览
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { resultMetadata, secureImageUrl } from "./workbench-utils.js";
import { bindRenovationPreview } from "./room-renovation.js";
import {
  bindPanoramaViewer,
  isPanoramaPreviewFeature,
} from "./panorama-viewer.js";

const DOWNLOAD_EXTENSIONS = Object.freeze({
  jpeg: "jpg",
  png: "png",
  webp: "webp",
});

export function normalizeComparisonSplit(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 50;
  return Math.max(0, Math.min(100, Math.round(number)));
}

export function comparisonValueText(value) {
  return `原图显示 ${normalizeComparisonSplit(value)}%`;
}

function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export function downloadFileNameFromHeader(value) {
  const match = String(value || "").match(/filename\*=UTF-8''([^;]+)/i);
  if (!match) return "生成结果.png";
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return "生成结果.png";
  }
}

export function generatedClientImageFileName(
  modelLabel,
  outputFormat,
  now = new Date(),
) {
  const format = String(outputFormat || "").toLowerCase();
  if (!DOWNLOAD_EXTENSIONS[format]) throw new Error("不支持下载这个图片格式");
  const model = String(modelLabel || "生成结果")
    .trim()
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "生成结果";
  const timestamp = now.toISOString().replace(/\.\d{3}Z$/, "Z").replace(/[:]/g, "-");
  return `${model}-${timestamp}.${DOWNLOAD_EXTENSIONS[format]}`;
}

export function isInlineImageUrl(value) {
  return /^data:image\/(?:png|jpe?g|webp);base64,/i.test(String(value || ""));
}

export function inlineImageBlob(
  value,
  {
    BlobType = Blob,
    decodeBase64 = (chunk) => atob(chunk),
  } = {},
) {
  const match = String(value || "").match(
    /^data:(image\/(?:png|jpe?g|webp));base64,([a-z0-9+/=\s]+)$/i,
  );
  if (!match) throw new Error("浏览器中的图片数据无效");
  const base64 = match[2].replace(/\s/g, "");
  const chunks = [];
  const base64ChunkSize = 4 * 1024 * 1024;
  for (let offset = 0; offset < base64.length; offset += base64ChunkSize) {
    const decoded = decodeBase64(base64.slice(offset, offset + base64ChunkSize));
    const bytes = new Uint8Array(decoded.length);
    for (let index = 0; index < decoded.length; index += 1) {
      bytes[index] = decoded.charCodeAt(index);
    }
    chunks.push(bytes);
  }
  return new BlobType(chunks, { type: match[1].toLowerCase() });
}

export async function prepareBrowserImageDownload(
  { imageUrl, modelLabel, outputFormat },
  {
    createObjectUrl = (blob) => URL.createObjectURL(blob),
    createInlineBlob = (value) => inlineImageBlob(value),
    fetchImpl = (...args) => fetch(...args),
    now = new Date(),
  } = {},
) {
  if (isInlineImageUrl(imageUrl)) {
    return {
      fileName: generatedClientImageFileName(modelLabel, outputFormat, now),
      objectUrl: createObjectUrl(createInlineBlob(imageUrl)),
      transport: "inline",
    };
  }

  const response = await fetchImpl("/api/image-download", {
    body: JSON.stringify({ imageUrl, modelLabel, outputFormat }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `下载失败（${response.status}）`);
  }
  return {
    fileName: downloadFileNameFromHeader(response.headers.get("Content-Disposition")),
    objectUrl: createObjectUrl(await response.blob()),
    transport: "proxy",
  };
}

export function bindGenerationResults({ api, showToast }) {
  const elements = {
    empty: document.querySelector("#emptyState"),
    error: document.querySelector("#errorState"),
    errorMessage: document.querySelector("#errorMessage"),
    gallery: document.querySelector("#resultGallery"),
    loading: document.querySelector("#loadingState"),
    loadingLabel: document.querySelector("#loadingLabel"),
  };
  const panorama = bindPanoramaViewer({
    prepareImage: (input) => prepareBrowserImageDownload(input),
    showToast,
  });
  let renderId = 0;

  function comparisonMedia(resultImage, comparisonImage, modelLabel) {
    const media = document.createElement("div");
    media.className = "result-media";
    resultImage.className = "result-output-image";
    media.append(resultImage);
    if (!comparisonImage?.dataUrl) return { media, toggle: null };

    media.style.setProperty("--comparison-split", "50%");
    const before = document.createElement("img");
    before.className = "result-before-image";
    before.src = secureImageUrl(comparisonImage.dataUrl);
    before.alt = `${modelLabel} 原图`;
    const divider = document.createElement("div");
    divider.className = "result-comparison-divider";
    divider.ariaHidden = "true";
    const handle = document.createElement("span");
    divider.append(handle);
    const beforeLabel = document.createElement("span");
    beforeLabel.className = "result-comparison-label result-before-label";
    beforeLabel.textContent = "原图";
    const afterLabel = document.createElement("span");
    afterLabel.className = "result-comparison-label result-after-label";
    afterLabel.textContent = "结果";
    const range = document.createElement("input");
    range.className = "result-comparison-range";
    range.type = "range";
    range.min = "0";
    range.max = "100";
    range.value = "50";
    range.ariaLabel = `${modelLabel} 原图与生成结果对比分界`;
    range.setAttribute("aria-valuetext", comparisonValueText(50));
    range.addEventListener("input", () => {
      const split = normalizeComparisonSplit(range.value);
      media.style.setProperty("--comparison-split", `${split}%`);
      range.setAttribute("aria-valuetext", comparisonValueText(split));
    });
    range.addEventListener("pointerdown", (event) => {
      media.classList.add("comparison-dragging");
      range.setPointerCapture?.(event.pointerId);
    });
    const stopDragging = () => media.classList.remove("comparison-dragging");
    range.addEventListener("pointercancel", stopDragging);
    range.addEventListener("pointerup", stopDragging);
    media.append(before, divider, beforeLabel, afterLabel, range);

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "result-download-button result-compare-button";
    toggle.textContent = "滑动对比";
    toggle.ariaPressed = "false";
    toggle.addEventListener("click", () => {
      const active = media.classList.toggle("comparison-active");
      toggle.ariaPressed = String(active);
      toggle.textContent = active ? "只看结果" : "滑动对比";
      if (active) range.focus();
    });
    return { media, toggle };
  }

  function setStage(stage) {
    for (const [name, element] of Object.entries({
      empty: elements.empty,
      error: elements.error,
      gallery: elements.gallery,
      loading: elements.loading,
    })) {
      element.classList.toggle("hidden", name !== stage);
    }
  }

  function updateCardSummary(card, result, sync = result.sync) {
    card.querySelector("[data-result-meta]").textContent = resultMetadata(result, sync);
    const link = card.querySelector("[data-record-link]");
    link.classList.toggle("hidden", !sync?.recordUrl);
    if (sync?.recordUrl) link.href = sync.recordUrl;
    else link.removeAttribute("href");
  }

  async function followSync(card, result, currentRenderId) {
    const generationId = result.sync?.generationId;
    if (!generationId || result.sync.status !== "pending") return;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await wait(1500);
      if (renderId !== currentRenderId) return;
      try {
        const body = await api(`/api/sync-jobs/${encodeURIComponent(generationId)}`);
        if (renderId !== currentRenderId) return;
        updateCardSummary(card, result, body.sync);
        if (body.sync.status === "success") return;
        if (body.sync.status === "failed") {
          showToast(`飞书同步失败：${body.sync.error}`);
          return;
        }
      } catch (error) {
        if (attempt === 39) showToast(error.message);
      }
    }
  }

  function clearanceStatus(sync) {
    return `清空图归档 · ${({ pending: "同步中", success: "已同步飞书", failed: `同步失败：${sync?.error || "请检查飞书连接"}`, skipped: "未同步" })[sync?.status] || "等待同步"}`;
  }

  function clearanceRecord(card, pipeline, currentRenderId) {
    const root = document.createElement("div");
    const status = document.createElement("span");
    const record = document.createElement("a");
    record.className = "result-record-link";
    record.target = "_blank";
    record.rel = "noreferrer";
    record.textContent = "清空记录";
    root.className = "renovation-clearance-sync";
    root.append(status, record);
    function update(sync) {
      status.textContent = clearanceStatus(sync);
      record.classList.toggle("hidden", !sync?.recordUrl);
      if (sync?.recordUrl) record.href = sync.recordUrl;
    }
    update(pipeline.clearanceSync);
    card.append(root);
    void (async () => {
      let sync = pipeline.clearanceSync;
      for (let attempt = 0; sync?.generationId && sync.status === "pending" && attempt < 40; attempt += 1) {
        await wait(1500);
        if (renderId !== currentRenderId) return;
        try {
          const body = await api(`/api/sync-jobs/${encodeURIComponent(sync.generationId)}`);
          if (renderId !== currentRenderId) return;
          sync = body.sync;
          update(sync);
          if (sync.status === "failed") showToast(`清空图归档失败：${sync.error}`);
        } catch (error) {
          if (attempt === 39) status.textContent = `清空图归档 · 查询失败：${error.message}`;
        }
      }
    })();
  }

  async function downloadImage(button, result, modelLabel) {
    if (button.disabled) return;
    button.disabled = true;
    button.textContent = "准备中";
    try {
      const download = await prepareBrowserImageDownload({
        imageUrl: result.images[0].url,
        modelLabel,
        outputFormat: result.request.outputFormat,
      });
      const link = document.createElement("a");
      link.download = download.fileName;
      link.href = download.objectUrl;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(download.objectUrl), 1000);
      showToast("图片已开始下载");
    } catch (error) {
      showToast(`下载失败：${error.message}`);
    } finally {
      button.disabled = false;
      button.textContent = "下载";
    }
  }

  function resultCard(outcome, { comparisonImage, featureMode }) {
    const card = document.createElement("article");
    card.className = "result-card";
    if (outcome.status === "rejected") {
      card.classList.add("failed");
      const icon = document.createElement("div");
      icon.className = "result-card-error";
      icon.textContent = "!";
      const copy = document.createElement("div");
      const model = document.createElement("strong");
      const message = document.createElement("p");
      model.textContent = outcome.item.label;
      message.textContent = outcome.reason?.message || "生成失败";
      copy.append(model, message);
      card.append(icon, copy);
      if (outcome.reason?.roomRenovation?.clearedImage) {
        const result = { roomRenovation: outcome.reason.roomRenovation, images: [], request: { outputFormat: "png" } };
        const image = document.createElement("img");
        const preview = bindRenovationPreview({ result, comparisonImage, image, modelLabel: outcome.item.label });
        const media = document.createElement("div");
        media.className = "result-media";
        media.append(image);
        const download = document.createElement("button");
        download.type = "button";
        download.className = "result-download-button";
        download.textContent = "下载";
        download.addEventListener("click", () => {
          const selected = preview.selection();
          void downloadImage(download, selected.result, selected.label);
        });
        card.classList.remove("failed");
        card.replaceChildren(preview.root, media, copy, download);
        copy.className = "renovation-partial-note";
      }
      return card;
    }

    const result = outcome.value;
    const image = document.createElement("img");
    image.alt = `${outcome.item.label} 生成结果`;
    image.src = secureImageUrl(result.images[0].url);
    const comparison = comparisonMedia(image, result.roomRenovation ? null : comparisonImage, outcome.item.label);
    const renovationPreview = bindRenovationPreview({ result, comparisonImage, image, modelLabel: outcome.item.label });
    const caption = document.createElement("footer");
    const copy = document.createElement("div");
    const model = document.createElement("strong");
    const meta = document.createElement("span");
    const actions = document.createElement("div");
    const duration = document.createElement("span");
    const download = document.createElement("button");
    const record = document.createElement("a");
    model.textContent = outcome.item.label;
    meta.dataset.resultMeta = "";
    duration.textContent = `总 ${(result.durationMs / 1000).toFixed(1)} 秒`;
    actions.className = "result-card-actions";
    download.type = "button";
    download.className = "result-download-button";
    download.textContent = "下载";
    download.ariaLabel = `下载 ${outcome.item.label} 生成结果`;
    download.addEventListener("click", () => {
      const selected = renovationPreview?.selection();
      void downloadImage(download, selected?.result || result, selected?.label || outcome.item.label);
    });
    record.dataset.recordLink = "";
    record.className = "result-record-link hidden";
    record.target = "_blank";
    record.rel = "noreferrer";
    record.textContent = "飞书记录";
    copy.append(model, meta);
    actions.append(duration);
    if (comparison.toggle) actions.append(comparison.toggle);
    if (isPanoramaPreviewFeature(featureMode)) {
      const preview = document.createElement("button");
      preview.type = "button";
      preview.className = "result-download-button panorama-preview-button";
      preview.textContent = "360°预览";
      preview.ariaLabel = `360°预览 ${outcome.item.label} 生成结果`;
      preview.addEventListener("click", () => {
        void panorama.open({
          imageUrl: result.images[0].url,
          modelLabel: outcome.item.label,
          outputFormat: result.request.outputFormat,
        });
      });
      actions.append(preview);
    }
    actions.append(download, record);
    caption.append(copy, actions);
    if (renovationPreview) card.append(renovationPreview.root);
    card.append(comparison.media, caption);
    updateCardSummary(card, result);
    return card;
  }

  return {
    showEmpty() {
      renderId += 1;
      setStage("empty");
    },
    showError(message) {
      renderId += 1;
      elements.errorMessage.textContent = message;
      setStage("error");
    },
    showLoading(message) {
      renderId += 1;
      elements.loadingLabel.textContent = message;
      setStage("loading");
    },
    showResults(outcomes, { comparisonImage = null, featureMode } = {}) {
      renderId += 1;
      const currentRenderId = renderId;
      const cards = outcomes.map((outcome) => resultCard(outcome, {
        comparisonImage,
        featureMode,
      }));
      elements.gallery.replaceChildren(...cards);
      elements.gallery.classList.toggle("multiple", outcomes.length > 1);
      setStage("gallery");
      outcomes.forEach((outcome, index) => {
        const pipeline = outcome.value?.roomRenovation || outcome.reason?.roomRenovation;
        if (pipeline?.clearedImage) clearanceRecord(cards[index], pipeline, currentRenderId);
        if (outcome.status === "fulfilled") {
          void followSync(cards[index], outcome.value, currentRenderId);
        }
      });
    },
  };
}

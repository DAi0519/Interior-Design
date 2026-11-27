/**
 * [INPUT]: 依赖统一 API、含精模预设执行方式的结果摘要/安全图片 URL、当前任务标识及原图、真实图片揭示反馈、浏览器 Blob 与同源图片下载接口、二维大图/全景预览器
 * [OUTPUT]: 对外提供空态、真实等待态和错误态、新图揭示、当前与历史结果画廊、按需原图对比、大图与全景预览、耗时摘要、下载、独立飞书同步轮询、首页混合失败摘要和历史成功卡复用
 * [POS]: public 的生成结果呈现层，承接单模型最多四张或任意数量模型的成功与部分失败结果，隔离下载传输并按功能限定滑动对比与沉浸式预览
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { resultMetadata, secureImageUrl } from "./workbench-utils.js";
import { bindResultImageViewer } from "./result-image-viewer.js";
import { cancelGenerationReveal, revealGenerationImage } from "./generation-feedback.js?v=3";
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

function failureReason(outcome) {
  return outcome.reason?.message || "生成失败";
}

function failureDisclosure(failed) {
  const details = document.createElement("details");
  details.className = "result-failure-note";
  const summary = document.createElement("summary");
  summary.textContent = `${failed.length} 张未生成`;
  const reasons = document.createElement("ul");
  for (const reason of new Set(failed.map(outcome => `${outcome.item.label} · ${failureReason(outcome)}`))) {
    const item = document.createElement("li");
    item.textContent = reason;
    reasons.append(item);
  }
  details.append(summary, reasons);
  return details;
}

export function bindGenerationResults({ api, showToast, omitFailedCards = () => false }) {
  const imageViewer = bindResultImageViewer();
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
  let renderedResults;
  const archivedCards = new WeakSet();

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
    if (stage !== "gallery") renderedResults = undefined;
    for (const [name, element] of Object.entries({
      empty: elements.empty,
      error: elements.error,
      gallery: elements.gallery,
      loading: elements.loading,
    })) {
      element.classList.toggle("hidden", name !== stage);
    }
  }

  function showError(message) {
    renderId += 1;
    elements.errorMessage.textContent = message;
    setStage("error");
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
    const isCurrent = () => archivedCards.has(card) ? card.isConnected : renderId === currentRenderId;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await wait(1500);
      if (!isCurrent()) return;
      try {
        const body = await api(`/api/sync-jobs/${encodeURIComponent(generationId)}`);
        if (!isCurrent()) return;
        updateCardSummary(card, result, body.sync);
        if (body.sync.status === "success") return;
        if (body.sync.status === "failed") {
          showToast(`飞书同步失败：${body.sync.error}`);
          return;
        }
      } catch (error) {
        if (attempt === 39 && isCurrent()) showToast(error.message);
      }
    }
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
      message.textContent = failureReason(outcome);
      copy.append(model, message);
      card.append(icon, copy);
      return card;
    }

    const result = outcome.value;
    const image = document.createElement("img");
    image.alt = `${outcome.item.label} 生成结果`;
    image.src = secureImageUrl(result.images[0].url);
    const comparison = comparisonMedia(image, comparisonImage, outcome.item.label);
    imageViewer.bind(comparison.media, image);
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
      void downloadImage(download, result, outcome.item.label);
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
    card.append(comparison.media, caption);
    updateCardSummary(card, result);
    return card;
  }

  return {
    showArchive(gallery, { outcomes = [], comparisonImage, featureMode }, jobId) {
      const successes = outcomes.filter(outcome => outcome.status === "fulfilled" && outcome.value?.images?.[0]?.url);
      if (!successes.length) return;
      // -------- 移动已有卡片保留对比状态、预览事件及正在进行的归档轮询 --------
      const existing = jobId && renderedResults?.jobId === jobId && renderedResults.outcomes === outcomes
        ? [...elements.gallery.querySelectorAll(".result-card:not(.failed)")]
        : [];
      const reused = existing.length === successes.length;
      const cards = reused ? existing : successes.map(outcome => resultCard(outcome, { comparisonImage, featureMode }));
      for (const [index, card] of cards.entries()) {
        const image = card.querySelector(".result-output-image");
        cancelGenerationReveal(image);
        image.loading = "lazy";
        archivedCards.add(card);
        if (!reused) void followSync(card, successes[index].value);
      }
      gallery.replaceChildren(...cards);
      gallery.classList.toggle("multiple", cards.length > 1);
    },
    showEmpty() {
      renderId += 1;
      setStage("empty");
    },
    showError,
    showLoading(message) {
      renderId += 1;
      if (elements.loadingLabel.textContent !== message) elements.loadingLabel.textContent = message;
      setStage("loading");
    },
    showResults(outcomes, { comparisonImage = null, featureMode, jobId, reveal = false } = {}) {
      // -------- 同一回执保留画廊节点与正在进行的图片揭示 --------
      const omitFailed = omitFailedCards();
      if (jobId && renderedResults?.jobId === jobId && renderedResults.outcomes === outcomes
        && renderedResults.comparisonImage === comparisonImage && renderedResults.featureMode === featureMode
        && renderedResults.omitFailed === omitFailed) return;
      const visible = omitFailed ? outcomes.filter(outcome => outcome.status === "fulfilled") : outcomes;
      const failed = omitFailed ? outcomes.filter(outcome => outcome.status === "rejected") : [];
      if (omitFailed && !visible.length) {
        showError([...new Set(failed.map(failureReason))].join("\n") || "本轮未生成图片");
        return;
      }
      renderId += 1;
      const currentRenderId = renderId;
      const cards = visible.map((outcome) => resultCard(outcome, {
        comparisonImage,
        featureMode,
      }));
      elements.gallery.replaceChildren(...cards);
      if (failed.length) elements.gallery.append(failureDisclosure(failed));
      elements.gallery.classList.toggle("multiple", cards.length > 1);
      if (reveal) elements.loadingLabel.textContent = "正在加载结果图…";
      setStage("gallery");
      renderedResults = { comparisonImage, featureMode, jobId, outcomes, omitFailed };
      visible.forEach((outcome, index) => {
        if (outcome.status === "fulfilled") {
          if (reveal) revealGenerationImage(cards[index].querySelector(".result-output-image"));
          void followSync(cards[index], outcome.value, currentRenderId);
        }
      });
    },
  };
}

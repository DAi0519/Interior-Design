/**
 * [INPUT]: 依赖统一 API、结果摘要/安全图片 URL、同源图片下载接口、结果区 DOM 与 Toast 回调
 * [OUTPUT]: 对外提供空态、加载态、错误态、多模型结果画廊、总耗时/ComfyUI 分段耗时、逐图下载和独立飞书同步轮询
 * [POS]: public 的生成结果呈现层，承接单模型与最多四模型的成功或部分失败结果
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { resultMetadata, secureImageUrl } from "./workbench-utils.js";

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

export function bindGenerationResults({ api, showToast }) {
  const elements = {
    empty: document.querySelector("#emptyState"),
    error: document.querySelector("#errorState"),
    errorMessage: document.querySelector("#errorMessage"),
    gallery: document.querySelector("#resultGallery"),
    loading: document.querySelector("#loadingState"),
    loadingLabel: document.querySelector("#loadingLabel"),
  };
  let renderId = 0;

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

  async function downloadImage(button, result, modelLabel) {
    if (button.disabled) return;
    button.disabled = true;
    button.textContent = "准备中";
    try {
      const response = await fetch("/api/image-download", {
        body: JSON.stringify({
          imageUrl: result.images[0].url,
          modelLabel,
          outputFormat: result.request.outputFormat,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `下载失败（${response.status}）`);
      }
      const objectUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.download = downloadFileNameFromHeader(
        response.headers.get("Content-Disposition"),
      );
      link.href = objectUrl;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      showToast("图片已开始下载");
    } catch (error) {
      showToast(`下载失败：${error.message}`);
    } finally {
      button.disabled = false;
      button.textContent = "下载";
    }
  }

  function resultCard(outcome) {
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
      return card;
    }

    const result = outcome.value;
    const image = document.createElement("img");
    image.alt = `${outcome.item.label} 生成结果`;
    image.src = secureImageUrl(result.images[0].url);
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
    actions.append(duration, download, record);
    caption.append(copy, actions);
    card.append(image, caption);
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
    showResults(outcomes) {
      renderId += 1;
      const currentRenderId = renderId;
      const cards = outcomes.map(resultCard);
      elements.gallery.replaceChildren(...cards);
      elements.gallery.classList.toggle("multiple", outcomes.length > 1);
      setStage("gallery");
      outcomes.forEach((outcome, index) => {
        if (outcome.status === "fulfilled") {
          void followSync(cards[index], outcome.value, currentRenderId);
        }
      });
    },
  };
}

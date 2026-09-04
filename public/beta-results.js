/**
 * [INPUT]: 依赖 Beta 任务快照中仅在飞书附件回读成功后公开的轻量预览、Run/样本/模型标签与记录链接
 * [OUTPUT]: 对外提供右侧任务监控面板的安全结果缩略图、同步计数、空态与逐条飞书记录跳转渲染
 * [POS]: public 的 Beta跑图结果呈现组件，只消费服务端确认已归档的轻量结果，不持久化原始生成图
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

function previewUrl(value) {
  const normalized = String(value || "");
  return /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(normalized)
    ? normalized
    : "";
}

function recordUrl(value) {
  try {
    const url = new URL(String(value || ""), window.location.origin);
    return /^https?:$/.test(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function resultCard(result, index) {
  const href = recordUrl(result?.recordUrl);
  const card = document.createElement(href ? "a" : "article");
  card.className = "monitor-result-card";
  if (href) {
    card.href = href;
    card.target = "_blank";
    card.rel = "noreferrer";
    card.ariaLabel = `在飞书查看 ${result?.label || `结果 ${index + 1}`}`;
  }

  const imageUrl = previewUrl(result?.previewUrl);
  if (imageUrl) {
    const image = document.createElement("img");
    image.alt = result?.label || `结果 ${index + 1}`;
    image.loading = "lazy";
    image.src = imageUrl;
    card.append(image);
  } else {
    const unavailable = document.createElement("span");
    unavailable.className = "monitor-result-unavailable";
    unavailable.textContent = "预览不可用";
    card.append(unavailable);
  }

  const copy = document.createElement("span");
  copy.className = "monitor-result-copy";
  const title = document.createElement("strong");
  title.textContent = result?.label || `结果 ${index + 1}`;
  const meta = document.createElement("small");
  meta.textContent = `${result?.caseId || "样本"} · 已同步`;
  copy.append(title, meta);
  card.append(copy);
  return card;
}

export function renderBetaResults({ container, count, results = [] }) {
  const normalized = Array.isArray(results) ? results : [];
  count.textContent = `${normalized.length} 张`;
  if (normalized.length === 0) {
    const empty = document.createElement("p");
    empty.className = "monitor-results-empty";
    empty.textContent = "结果同步飞书后将在这里显示。";
    container.replaceChildren(empty);
    return;
  }
  container.replaceChildren(...normalized.map(resultCard));
}

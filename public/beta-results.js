/**
 * [INPUT]: 依赖 Beta 任务快照的逐项异常、阶段、样本/模型标签、飞书记录链接与页面请求错误
 * [OUTPUT]: 提供按任务阶段显示的监控、保留链接焦点的逐项预警，以及共享下拉和进度DOM工具
 * [POS]: public 的 Beta跑图监控预警组件，以安全文本呈现生成/归档/连接问题，结果继续在飞书查看
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export function betaJobWarnings(job, error = "") {
  const warnings = Array.isArray(job?.result?.warnings) ? job.result.warnings : [];
  const normalized = warnings.filter((warning) => warning?.message).map((warning) => ({ ...warning }));
  if (!normalized.length && job?.status === "failed" && job.error) {
    normalized.push({ stage: "generation", label: "批次执行失败", message: job.error });
  }
  if (error && !normalized.some(warning => warning.message === error)) {
    normalized.unshift({ stage: "connection", label: "请求未完成", message: String(error) });
  }
  return normalized;
}

function recordUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return /^https?:$/.test(url.protocol) ? url.href : "";
  } catch { return ""; }
}

function updateText(node, text) {
  if (node.textContent !== text) node.textContent = text;
}

function warningRow(doc, key) {
  const row = doc.createElement("article");
  row.className = "monitor-warning";
  row.dataset.warningKey = key;
  const label = doc.createElement("span");
  label.className = "monitor-warning-label";
  row.append(doc.createElement("strong"), label, doc.createElement("p"));
  return row;
}

function updateWarning(row, warning) {
  const [heading, label, message, previousLink] = row.children;
  const stage = warning.stage || "generation";
  if (row.dataset.stage !== stage) row.dataset.stage = stage;
  updateText(heading, warning.stage === "sync" || warning.stage === "archive"
    ? "飞书同步失败"
    : warning.stage === "connection" ? "连接或请求异常" : "生成异常");
  updateText(label, warning.label || warning.caseId || "当前批次");
  updateText(message, warning.message);
  const href = recordUrl(warning.recordUrl);
  if (!href) {
    previousLink?.remove();
    return;
  }
  const link = previousLink || row.ownerDocument.createElement("a");
  if (link.href !== href) link.href = href;
  if (!previousLink) {
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = "在飞书查看明细";
    row.append(link);
  }
}

export function renderBetaWarnings({ container, count, job = null, error = "" }) {
  const warnings = betaJobWarnings(job, error);
  updateText(count, warnings.length ? `${warnings.length} 项` : "");
  const previousRows = new Map([...container.children].map(row => [row.dataset.warningKey, row]));
  const occurrences = new Map();
  // 保持已有行原位，轮询不打断键盘焦点或正在阅读的位置。
  for (const warning of warnings) {
    const identity = [job?.jobId, warning.runId || [warning.stage, warning.caseId, warning.modelLabel, warning.label]];
    const baseKey = JSON.stringify(identity);
    const index = occurrences.get(baseKey) || 0;
    occurrences.set(baseKey, index + 1);
    const key = `${baseKey}:${index}`;
    const existing = previousRows.get(key);
    const row = existing || warningRow(container.ownerDocument, key);
    updateWarning(row, warning);
    if (existing) previousRows.delete(key);
    else container.append(row);
  }
  for (const row of previousRows.values()) row.remove();
  return warnings.length;
}

function runningDetail(job) {
  const message = job.message || "";
  const warnings = Array.isArray(job.result?.warnings) ? job.result.warnings : [];
  for (const warning of warnings) {
    if (!warning?.message) continue;
    if (message === warning.message) return "";
    const prefix = `${warning.label} · `;
    const start = message.startsWith(prefix) ? message.indexOf(warning.message, prefix.length) : -1;
    if (start === -1) continue;
    // 原因已展示在异常条目中，保留后面的自动重试提示。
    const suffix = message.slice(start + warning.message.length).replace(/^ · /, "");
    return suffix ? `${prefix}${suffix}` : "";
  }
  return message;
}

export function renderBetaMonitor(elements, job, { error = "", canRefresh = false } = {}) {
  const states = { running: ["运行中", "running"], success: ["已完成", "success"], failed: ["失败", "error"] };
  const [label, state] = error ? ["请求失败", "error"] : states[job?.status] || ["待运行", "idle"];
  updateText(elements.jobStatus, label);
  if (elements.jobStatus.dataset.state !== state) elements.jobStatus.dataset.state = state;
  const warningCount = renderBetaWarnings({ container: elements.monitorWarnings, count: elements.monitorWarningsCount, job, error });
  elements.monitorWarningsSection.hidden = !warningCount && job?.status !== "failed";
  elements.monitorRefresh.hidden = !canRefresh;
  elements.jobProgress.hidden = !job;
  if (!job) return;

  const total = Number(job.total) || 0;
  updateText(elements.monitorBatchSummary, `${total} 张结果`);
  const completed = Number(job.completed) || 0;
  const generated = Number(job.stages?.generated) || (job.status === "success" ? total : 0);
  const synced = Number(job.stages?.synced) || completed;
  const detail = !error && job.status === "running" ? runningDetail(job) : "";
  elements.jobProgressLabel.hidden = !detail;
  updateText(elements.jobProgressLabel, detail);
  renderBetaProgress(elements.generationProgressTrack, elements.generationProgressBar, elements.generationProgressCount, generated, total);
  renderBetaProgress(elements.jobProgressTrack, elements.jobProgressBar, elements.jobProgressCount, synced, total);
}

export function fillBetaSelect(select, options, current = "") {
  const selected = options.find((option) => String(option.value) === String(current) && !option.disabled)
    || options.find((option) => !option.disabled);
  select.replaceChildren(...options.map((entry) => {
    const { disabled = false, label, value } = entry;
    const option = document.createElement("option");
    option.value = String(value);
    option.textContent = label;
    option.disabled = disabled;
    option.selected = entry === selected;
    return option;
  }));
  if (!selected) select.value = "";
}
export function renderBetaProgress(track, bar, count, value, total) {
  const normalizedValue = Math.max(0, Math.min(Number(value) || 0, Number(total) || 0));
  const normalizedTotal = Math.max(0, Number(total) || 0);
  updateText(count, `${normalizedValue} / ${normalizedTotal}`);
  bar.style.transform = `scaleX(${normalizedTotal ? normalizedValue / normalizedTotal : 0})`;
  track.setAttribute("aria-valuemax", String(normalizedTotal));
  track.setAttribute("aria-valuenow", String(normalizedValue));
}

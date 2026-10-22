/**
 * [INPUT]: 依赖 Beta 任务快照的逐项异常、阶段、样本/模型标签、飞书记录链接与页面请求错误
 * [OUTPUT]: 对外提供 betaJobWarnings 异常归一化与 renderBetaWarnings 预警列表渲染，不展示结果图片
 * [POS]: public 的 Beta跑图监控预警组件，以安全文本呈现生成/归档/连接问题，结果继续在飞书查看
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export function betaJobWarnings(job, error = "") {
  const warnings = Array.isArray(job?.result?.warnings) ? job.result.warnings : [];
  const normalized = warnings.filter((warning) => warning?.message).map((warning) => ({ ...warning }));
  if (!normalized.length && job?.status === "failed" && job.error) {
    normalized.push({ stage: "generation", label: "批次执行失败", message: job.error });
  }
  if (error) normalized.unshift({ stage: "connection", label: "请求未完成", message: String(error) });
  return normalized;
}

function recordUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return /^https?:$/.test(url.protocol) ? url.href : "";
  } catch { return ""; }
}

function warningRow(warning) {
  const row = document.createElement("article");
  row.className = "monitor-warning";
  row.dataset.stage = warning.stage || "generation";
  const heading = document.createElement("strong");
  heading.textContent = warning.stage === "sync" || warning.stage === "archive"
    ? "飞书同步失败"
    : warning.stage === "connection" ? "连接或请求异常" : "生成异常";
  const label = document.createElement("span");
  label.className = "monitor-warning-label";
  label.textContent = warning.label || warning.caseId || "当前批次";
  const message = document.createElement("p");
  message.textContent = warning.message;
  row.append(heading, label, message);
  const href = recordUrl(warning.recordUrl);
  if (href) {
    const link = document.createElement("a");
    link.href = href;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = "在飞书查看明细";
    row.append(link);
  }
  return row;
}

export function renderBetaWarnings({ container, count, job = null, error = "" }) {
  const warnings = betaJobWarnings(job, error);
  count.textContent = warnings.length ? `${warnings.length} 项` : "暂无异常";
  if (!warnings.length) {
    const empty = document.createElement("p");
    empty.className = "monitor-warnings-empty";
    empty.textContent = job?.status === "success"
      ? "全部结果已同步，可在飞书查看。"
      : job?.status === "running" ? "暂未发现异常，正在生成与同步。" : "生成失败、同步失败等问题将在这里提示。";
    container.replaceChildren(empty);
    return;
  }
  container.replaceChildren(...warnings.map(warningRow));
}

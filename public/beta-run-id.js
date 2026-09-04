/**
 * [INPUT]: 依赖浏览器 Date 与 Beta跑图批内序号、模型键
 * [OUTPUT]: 对外提供面向飞书分组的本地测试时间，以及兼具批内唯一性的 Run ID 生成函数
 * [POS]: public 的 Beta跑图追溯标识领域层，被 beta-app.js 在整批启动时消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

function pad(value, length) {
  return String(value).padStart(length, "0");
}

export function formatBetaRunTimestamp(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError("Beta跑图测试时间无效");
  return [
    pad(date.getFullYear(), 4),
    pad(date.getMonth() + 1, 2),
    pad(date.getDate(), 2),
    "-",
    pad(date.getHours(), 2),
    pad(date.getMinutes(), 2),
    pad(date.getSeconds(), 2),
    "-",
    pad(date.getMilliseconds(), 3),
  ].join("");
}

export function formatBetaTestTime(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError("Beta跑图测试时间无效");
  return [
    `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1, 2)}-${pad(date.getDate(), 2)}`,
    `${pad(date.getHours(), 2)}:${pad(date.getMinutes(), 2)}:${pad(date.getSeconds(), 2)}`,
  ].join(" ");
}

export function createBetaRunId({ modelKey, sequence, startedAt = new Date() }) {
  const normalizedSequence = Number(sequence);
  const normalizedModelKey = String(modelKey || "")
    .replace(/[^A-Za-z0-9-]/g, "")
    .slice(0, 40);
  if (!Number.isInteger(normalizedSequence) || normalizedSequence < 1) {
    throw new TypeError("Beta跑图批内序号必须为正整数");
  }
  if (!normalizedModelKey) throw new TypeError("Beta跑图模型键不能为空");
  return `RUN-${formatBetaRunTimestamp(startedAt)}-${pad(normalizedSequence, 3)}-${normalizedModelKey}`;
}

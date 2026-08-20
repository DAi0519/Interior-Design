/**
 * [INPUT]: 依赖 Benchmark Base 快照中的样本、配置与本地模型目录
 * [OUTPUT]: 对外提供横评计划资源 ID/版本/正整数/同组一致性校验、样本准入筛选与显式 ID 集合归一化
 * [POS]: src 的 Benchmark 计划输入边界，为 benchmark-runner.mjs 隔离纯校验和样本选择规则
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

const COMPLETED_SAMPLE_STATUSES = new Set(["完成"]);

function benchmarkError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

export function labeledId(value, field) {
  const normalized = String(value || "").trim();
  const match = normalized.match(/\[([^\]]+)\]\s*$/);
  if (!match) throw benchmarkError(`${field} 缺少 [资源 ID]`);
  return match[1].trim();
}

export function versionedResource(value, field) {
  const resource = labeledId(value, field);
  const match = resource.match(/^(.+)@v(\d+)$/);
  if (!match) throw benchmarkError(`${field} 必须使用 code@vN`);
  return { code: match[1], version: Number(match[2]) };
}

export function positiveInteger(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    throw benchmarkError(`${field} 必须是正整数`);
  }
  return number;
}

export function catalogKeyById(catalog, id, field) {
  const entry = catalog.find((model) => model.id === id);
  if (!entry) throw benchmarkError(`${field} 不在本地模型目录：${id}`);
  return entry;
}

export function assertSame(configs, getter, field) {
  const values = new Set(configs.map(getter));
  if (values.size !== 1) throw benchmarkError(`同一横评组的 ${field} 必须完全一致`);
  return getter(configs[0]);
}

export function activeSamples(samples, maxCases, includeCompletedSamples = false) {
  const selected = samples
    .filter((sample) => sample.caseId)
    .filter((sample) => !sample.sampleType || sample.sampleType === "有效白模")
    .filter((sample) =>
      includeCompletedSamples || !COMPLETED_SAMPLE_STATUSES.has(sample.status))
    .sort((left, right) => left.caseId.localeCompare(right.caseId));
  return maxCases == null ? selected : selected.slice(0, maxCases);
}

export function selectedIdSet(values, field) {
  if (values == null) return null;
  if (!Array.isArray(values) || values.length === 0) {
    throw benchmarkError(`${field} 必须是非空数组`);
  }
  return new Set(values.map((value) => String(value || "").trim()).filter(Boolean));
}

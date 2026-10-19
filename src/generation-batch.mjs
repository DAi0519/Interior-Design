/**
 * [INPUT]: 依赖生成请求中的 batchId、batchIndex 与 batchCount
 * [OUTPUT]: 对外提供无模型数量上限的生成结果批次元数据校验与标准化，单模型张数由任务入口独立约束
 * [POS]: src 的轻量批次契约，被自由生图、白模和精模归档共同复用
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

function batchError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

export function normalizeGenerationBatch(input = {}) {
  const batchCount = input.batchCount == null ? 1 : Number(input.batchCount);
  const batchIndex = input.batchIndex == null ? 1 : Number(input.batchIndex);

  if (!Number.isSafeInteger(batchCount) || batchCount < 1) {
    throw batchError("批次总数需要为正安全整数");
  }
  if (!Number.isSafeInteger(batchIndex) || batchIndex < 1 || batchIndex > batchCount) {
    throw batchError("批次序号不合法");
  }
  if (batchCount === 1) return {};

  const batchId = String(input.batchId || "").trim();
  if (!/^[A-Za-z0-9._:-]{8,100}$/.test(batchId)) {
    throw batchError("多张生成缺少合法批次 ID");
  }
  return { batchCount, batchId, batchIndex };
}

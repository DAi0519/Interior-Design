/**
 * [INPUT]: 依赖生成请求中的 batchId、batchIndex 与 batchCount
 * [OUTPUT]: 对外提供最多四模型批次元数据的严格校验与标准化
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

  if (!Number.isInteger(batchCount) || batchCount < 1 || batchCount > 4) {
    throw batchError("一次最多选择 4 个出图模型");
  }
  if (!Number.isInteger(batchIndex) || batchIndex < 1 || batchIndex > batchCount) {
    throw batchError("批次序号不合法");
  }
  if (batchCount === 1) return {};

  const batchId = String(input.batchId || "").trim();
  if (!/^[A-Za-z0-9._:-]{8,100}$/.test(batchId)) {
    throw batchError("多模型生成缺少合法批次 ID");
  }
  return { batchCount, batchId, batchIndex };
}

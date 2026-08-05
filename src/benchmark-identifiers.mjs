/**
 * [INPUT]: 依赖 node:crypto，对 Benchmark Case/Prompt/配置/采样序号做纯确定性编码
 * [OUTPUT]: 对外提供兼容历史模型横评并支持任意提示阶段候选维度的稳定 Prompt/Run/重试 ID、SHA-256 与模型提供商归一化
 * [POS]: src 的 Benchmark 标识基础设施，被 Runner 与历史回填入口共同复用
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createHash } from "node:crypto";

export function stablePromptId(caseId, groupId, batch, variantId = "") {
  const base = `${caseId}__${groupId}__P${batch}`;
  return variantId ? `${base}__${variantId}` : base;
}

export function stableRunId(promptId, configId, sampleIndex) {
  return `${promptId}__${configId}__S${sampleIndex}`;
}

export function baseRunId(runId) {
  return String(runId || "").replace(/__A\d+$/, "");
}

export function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

export function providerFromModelId(modelId) {
  if (modelId.startsWith("comfyui:")) return "ComfyUI";
  if (modelId.startsWith("doubao-")) return "ByteDance";
  if (modelId.startsWith("gemini-")) return "Google";
  if (modelId.startsWith("gpt-")) return "OpenAI";
  return "Unknown";
}

export function runIdForAttempt(runId, attempt) {
  return attempt === 1 ? runId : `${runId}__A${attempt}`;
}

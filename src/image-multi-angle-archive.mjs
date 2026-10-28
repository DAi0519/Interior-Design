/**
 * [INPUT]: 依赖批次合同、Qwen模型身份、实际提交指令及独立指令版本、可信源图和执行产物
 * [OUTPUT]: 多角度专属字段/模型标签及统一飞书归档投影，原图/结果/机位/Prompt版本可追溯
 * [POS]: src 的多角度归档边界，由应用服务和lark-sync共享，不触发生成或同步
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { normalizeGenerationBatch } from "./generation-batch.mjs";
import { MULTI_ANGLE, normalizeCameraPose } from "./image-multi-angle-workflow.mjs";

export const MULTI_ANGLE_ARCHIVE_MODEL_LABELS = Object.freeze([MULTI_ANGLE.label]);
export const MULTI_ANGLE_FRAMING_LABELS = Object.freeze({ 0: "特写", 50: "标准", 100: "远景" });
export const MULTI_ANGLE_ARCHIVE_FIELDS = Object.freeze({
  "水平角度（°）": "number",
  "俯仰角度（°）": "number",
  "景别": "select",
  "镜头指令版本": "text",
});

export function multiAngleRecordFields(workflow) {
  if (workflow?.feature !== "image-multi-angle") return {};
  const pose = normalizeCameraPose(workflow.pose);
  if (!workflow.promptVersion) throw new TypeError("多角度归档缺少镜头指令版本");
  return {
    "水平角度（°）": pose.azimuth,
    "俯仰角度（°）": pose.elevation,
    "景别": MULTI_ANGLE_FRAMING_LABELS[pose.distance],
    "镜头指令版本": workflow.promptVersion,
  };
}

export function buildMultiAngleArchive({ input, reference, model, pose, finalPrompt, result, executionMetadata = {} }) {
  if (!reference?.imageUrl || !result.images?.[0]?.url || !finalPrompt?.trim()) {
    throw new TypeError("多角度归档缺少实际原图、结果图或已提交指令");
  }
  const metadata = result.upstream.metadata;
  return {
    durationMs: result.durationMs, finalPrompt, sourcePrompt: "", modelLabel: model.label,
    preview: { ...result.request, syncMode: "lark", provider: model.provider, transport: result.upstream.transport },
    referenceImages: [{ fileName: reference.fileName, imageUrl: reference.imageUrl, mimeType: reference.mimeType }],
    resultImage: result.images[0],
    workflow: {
      ...normalizeGenerationBatch(input), ...executionMetadata, ...metadata,
      feature: "image-multi-angle", modelKey: model.key, model: model.id || MULTI_ANGLE.model,
      provider: model.provider, pose: { ...pose }, promptVersion: result.workflow.promptVersion,
      workflowVersion: result.workflow.version, workflowId: result.workflow.key,
      promptSource: model.provider === "comfyui" ? "submitted ComfyUI text condition" : "submitted OneAPI image request",
      finalPromptCaptured: true, usageCost: result.upstream.usageCost || null, exactCameraGeometry: false,
    },
  };
}

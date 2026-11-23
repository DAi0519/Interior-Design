/**
 * [INPUT]: 依赖主机位服务的实际标注、推理和成图回执，Beta 冻结机位与飞书附件字节
 * [OUTPUT]: 提供机位归档快照、直出原文摘要、原图与实际送模身份、两种模式回执及附件 SHA 验证
 * [POS]: src 的 Beta 平面图机位归档合同，不负责生成或飞书读写
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { betaBaseContractError } from "./beta-base-schema.mjs";
import { floorPlanCameraPromptCode } from "./floor-plan-camera-prompt.mjs";
import { decodeImageDataUrl } from "./image-artifact.mjs";
import { readImageDimensions } from "./image-dimensions.mjs";

export const BETA_FLOOR_PLAN_CAMERA_LABEL = "平面图机位渲染";
const digest = value => createHash("sha256").update(value).digest("hex");
const validSha = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const shaFields = ["floorPlanCameraSourceSha256", "floorPlanCameraSubmittedSha256"];
const validCost = value => Number.isFinite(value) && value >= 0;
const empty = value => value == null || value === "" || (Array.isArray(value) && value.length === 0);
const receipt = value => value && (value.requestId === null || typeof value.requestId === "string")
  && value.usageCost && typeof value.usageCost === "object" && !Array.isArray(value.usageCost);

export function floorPlanCameraArchiveSnapshot(input) {
  if (input.featureMode !== "floorPlanCamera") return {};
  return {
    camera: input.camera,
    floorPlanCameraWorkflowVersion: input.floorPlanCameraWorkflowVersion,
    floorPlanCameraPromptSha256: input.floorPlanCameraPromptSha256,
    ...(input.floorPlanCameraGenerationMode === "direct" ? {
      floorPlanCameraGenerationMode: "direct",
      floorPlanCameraDirectPromptSha256: digest(input.prompt),
    } : {}),
    aspectRatio: input.aspectRatio,
    complexity: input.complexity,
    ...Object.fromEntries(shaFields.filter(key => input[key] !== undefined).map(key => [key, input[key]])),
  };
}

export function assertFloorPlanCameraArchiveInput(input) {
  const [image] = input.referenceImages || [];
  if (input.referenceImages?.length !== 1 || input.styleReferenceImages?.length || input.lightingReferenceImages?.length
    || !shaFields.every(key => validSha(input[key]))) {
    throw betaBaseContractError("平面图机位归档需要唯一实际送模标注图和原图及标注摘要");
  }
  let bytes;
  try { bytes = decodeImageDataUrl(image?.dataUrl); }
  catch (error) { throw betaBaseContractError("平面图机位实际送模标注图无效", error); }
  if (!readImageDimensions(bytes, image.type) || bytes.length !== image.size || digest(bytes) !== input.floorPlanCameraSubmittedSha256) {
    throw betaBaseContractError("平面图机位标注附件与实际送模摘要不一致");
  }
}

export function restoreFloorPlanCameraArchiveSnapshot(snapshot, stored) {
  let actual;
  try { actual = JSON.parse(stored); }
  catch (error) { throw betaBaseContractError("已有平面图机位结果缺少可信的冻结配置", error); }
  if (!shaFields.every(key => validSha(actual?.[key]) && (snapshot[key] === undefined || snapshot[key] === actual[key]))) {
    throw betaBaseContractError("已有平面图机位结果缺少原图及实际送模摘要");
  }
  return { ...snapshot, ...Object.fromEntries(shaFields.map(key => [key, actual[key]])) };
}

export function verifyFloorPlanCameraArchive(fields, snapshot, { imageBytes, submittedBytes, completion } = {}) {
  let parameters;
  try { parameters = JSON.parse(fields["生成参数"]); }
  catch (error) { throw betaBaseContractError("平面图机位缺少实际生成参数", error); }
  const result = parameters?.workflow;
  const actual = result?.actual;
  const prompt = result?.prompt;
  const agentLabel = fields["Prompt融合"];
  const direct = snapshot.floorPlanCameraGenerationMode === "direct";
  const promptCode = floorPlanCameraPromptCode(snapshot.promptVersion);
  const finalPrompt = fields["最终 Prompt"];
  if (result?.featureMode !== "floorPlanCamera" || !actual || !snapshot.camera
    || result.workflowVersion !== snapshot.floorPlanCameraWorkflowVersion
    || !isDeepStrictEqual(result.camera, snapshot.camera) || !isDeepStrictEqual(actual?.camera, snapshot.camera)
    || (result.generationMode === "direct") !== direct
    || result.model?.key !== snapshot.modelKey || result.resolution !== snapshot.resolution
    || result.aspectRatio !== snapshot.aspectRatio || actual.aspectRatio !== snapshot.aspectRatio
    || (result.requestedComplexity ?? null) !== (snapshot.complexity ?? null)
    || typeof finalPrompt !== "string" || !finalPrompt.trim() || digest(finalPrompt) !== result.compiledPromptSha256
    || !receipt(result.receipts?.image)) {
    throw betaBaseContractError("平面图机位实际机位、模型、Prompt 或推理回执与冻结配置不一致");
  }
  if (direct) {
    if (result.prompt != null || result.agent != null || result.receipts.agent != null
      || !empty(agentLabel) || !empty(fields["Agent 编码"]) || !empty(fields["Agent 版本"])
      || !validSha(snapshot.floorPlanCameraDirectPromptSha256) || result.compiledPromptSha256 !== snapshot.floorPlanCameraDirectPromptSha256
      || result.userRequirements !== finalPrompt || result.compiledPrompt !== finalPrompt) {
      throw betaBaseContractError("平面图机位直出原文或模式与冻结配置不一致");
    }
  } else if (prompt?.code !== promptCode || prompt.version !== snapshot.promptVersion
    || !validSha(prompt.sha256) || prompt.sha256 !== snapshot.floorPlanCameraPromptSha256
    || fields["Agent 编码"] !== promptCode || Number(fields["Agent 版本"]) !== snapshot.promptVersion
    || result.agent?.key !== snapshot.promptAgentModelKey || !result.agent?.label
    || (Array.isArray(agentLabel) ? agentLabel.length !== 1 || agentLabel[0] !== result.agent.label : agentLabel !== result.agent.label)
    || !receipt(result.receipts?.agent)) {
    throw betaBaseContractError("平面图机位实际Prompt或推理回执与冻结配置不一致");
  }
  if (parameters.referenceImageCount !== 1 || actual.referenceImageCount !== 1
    || actual.referenceImageRole !== "camera-annotated-plan" || actual.generationMode !== "image-to-image"
    || !validSha(actual.referenceImageSha256)
    || (direct ? actual.agentInputImageSha256 != null : actual.agentInputImageSha256 !== actual.referenceImageSha256)
    || actual.referenceImageSha256 !== snapshot.floorPlanCameraSubmittedSha256
    || !validSha(result.source?.sha256) || result.source.sha256 !== snapshot.floorPlanCameraSourceSha256) {
    throw betaBaseContractError("平面图机位原图、推理和实际送模标注身份与冻结配置不一致");
  }
  if (!validSha(result.outputSha256) || result.outputSha256 !== actual.outputSha256
    || !Number.isSafeInteger(result.outputWidth) || !Number.isSafeInteger(result.outputHeight)
    || result.outputWidth < 1 || result.outputHeight < 1
    || result.outputWidth !== actual.actualOutputWidth || result.outputHeight !== actual.actualOutputHeight
    || fields["尺寸"] !== `${result.outputWidth}x${result.outputHeight}`) {
    throw betaBaseContractError("平面图机位结果尺寸或摘要与实际回执不一致");
  }
  if (imageBytes && (digest(imageBytes) !== result.outputSha256
    || !isDeepStrictEqual(readImageDimensions(imageBytes, "image/png"), { width: result.outputWidth, height: result.outputHeight }))) {
    throw betaBaseContractError("平面图机位结果附件字节与实际回执不一致");
  }
  const inputFormat = direct ? actual.referenceImageFormat : actual.agentInputImageFormat;
  const inputWidth = direct ? actual.referenceImageWidth : actual.agentInputImageWidth;
  const inputHeight = direct ? actual.referenceImageHeight : actual.agentInputImageHeight;
  if (submittedBytes && (digest(submittedBytes) !== actual.referenceImageSha256
    || !isDeepStrictEqual(readImageDimensions(submittedBytes, `image/${inputFormat}`), { width: inputWidth, height: inputHeight }))) {
    throw betaBaseContractError("平面图机位输入附件字节与实际送模不一致");
  }
  const imageCost = result.receipts.image.usageCost.costUsd;
  const agentCost = result.receipts.agent?.usageCost.costUsd;
  const attributed = result.agentCostAttributed;
  const expectedCost = validCost(imageCost) && (!attributed || validCost(agentCost))
    ? imageCost + (attributed ? agentCost : 0) : undefined;
  const storedCost = completion?.["费用（USD）"];
  const workflowVersion = `floor-plan-camera@${result.workflowVersion}`;
  const expectedVersion = direct ? workflowVersion : `${workflowVersion} · ${promptCode}@v${prompt.version}`;
  if ((direct ? attributed !== undefined : typeof attributed !== "boolean") || result.betaCostUsd !== expectedCost
    || completion && (completion["Prompt / 工作流版本"] !== expectedVersion
      || (expectedCost === undefined ? storedCost != null && storedCost !== ""
        : storedCost == null || storedCost === "" || !Number.isFinite(Number(storedCost))
          || Math.abs(Number(storedCost) - expectedCost) > Number.EPSILON * Math.max(1, expectedCost) * 8))) {
    throw betaBaseContractError("平面图机位归档版本或推理费用分摊与实际回执不一致");
  }
}

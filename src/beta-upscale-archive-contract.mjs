/**
 * [INPUT]: 依赖KS当前固定5K/20MP与历史版本几何真源、Base合同错误、原件尺寸/SHA及调用方字段核验
 * [OUTPUT]: 对外提供isLegacyKsArchive与verifyUpscaleArchive，严格区分固定5K、新旧20MP和历史分块恢复
 * [POS]: src 的Beta超分归档纯合同，被beta-base调用；不写记录、不提交GPU，不处理其他功能
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { betaBaseContractError } from "./beta-base-schema.mjs";
import { actualImageSize } from "./lark-sync.mjs";
import { imageUpscaleExecutionPlan, imageUpscaleTargetDimensions, imageUpscaleWorkflow,
  imageUpscaleAreaCapDimensions, KS_UPSCALE_AREA_POLICY } from "./image-upscale-workflow.mjs";

// -------- 历史策略只用于原件恢复，不能成为新GPU任务入口 --------
export function isLegacyKsArchive(key, version, resolution) {
  return key?.startsWith("ks_") && (["2026-10-21.1", "2026-10-26.1", "2026-10-26.2"].includes(version)
    || (version === "2026-10-20.1" && resolution === "2X")
    || (key === "ks_seedvr2_2x_direct" && version === "2026-10-26.3"));
}

function legacyKsTiledPlan(target) {
  const width = Math.min(2048, target.width), height = Math.min(2048, target.height);
  const count = (length, size) => 1 + Math.ceil(Math.max(0, length - size) / Math.round(Math.max(size * 0.25, size - 256)));
  return { strategy: "tiled", policyVersion: "ks-always-tiled-v2", tileWidth: width, tileHeight: height,
    tileOverlap: 256, tileRows: count(target.height, height), tileColumns: count(target.width, width),
    tileCount: count(target.height, height) * count(target.width, width), blocksToSwap: 36, swapIoComponents: true,
    seedVrResolution: Math.min(width, height), seedVrMaxResolution: Math.max(width, height) };
}

function legacyKsAreaPlan(target, selectedResolution) {
  const tiled = target.width * target.height > 25000000;
  const count = length => 1 + Math.ceil(Math.max(0, length - 2048) / 1792);
  return { strategy: tiled ? "tiled" : "whole", policyVersion: "ks-area-tiling-v1", thresholdPixels: 25000000,
    tileWidth: 2048, tileHeight: 2048, tileOverlap: 256, tileRows: count(target.height), tileColumns: count(target.width),
    tileCount: count(target.height) * count(target.width), blocksToSwap: tiled ? 36 : 32, swapIoComponents: tiled,
    seedVrResolution: tiled ? 2048 : Math.min(target.width, target.height),
    seedVrMaxResolution: tiled ? 2048 : selectedResolution.scale ? 0 : target.longEdge };
}

function legacyKsCappedPlan(target) {
  const { width, height } = imageUpscaleAreaCapDimensions(target.width, target.height);
  return { strategy: "whole", policyVersion: KS_UPSCALE_AREA_POLICY.version,
    inferenceWidth: width, inferenceHeight: height, inferencePixelLimit: KS_UPSCALE_AREA_POLICY.pixelLimit,
    paddedInferencePixels: Math.ceil(width / 16) * 16 * Math.ceil(height / 16) * 16,
    deliveryPostResize: width !== target.width || height !== target.height,
    blocksToSwap: 36, swapIoComponents: true, seedVrResolution: Math.min(width, height), seedVrMaxResolution: Math.max(width, height) };
}

export function verifyUpscaleArchive(fields, snapshot, bytes = null, { recovering = false, verifyMetadata } = {}) {
  let parameters;
  try { parameters = JSON.parse(fields["生成参数"]); }
  catch { throw betaBaseContractError("已有超分缺少可信的生成参数"); }
  const workflow = parameters?.workflow;
  const key = snapshot.upscaleWorkflowKey;
  const positiveInteger = value => Number.isInteger(value) && value > 0;
  if (!workflow || workflow.feature !== "image-upscale" || workflow.workflowId !== key
    || (snapshot.modelKey != null && snapshot.modelKey !== key)
    || !String(workflow.workflowVersion || "").trim()
    || workflow.resolution !== snapshot.resolution || parameters.resolution !== snapshot.resolution
    || !String(workflow.model || "").trim() || !Object.hasOwn(workflow, "inputMegapixels")
    || !/^[a-f0-9]{64}$/.test(workflow.sourceSha256 || "")
    || !/^[a-f0-9]{64}$/.test(workflow.outputSha256 || "")
    || ![workflow.sourceWidth, workflow.sourceHeight, workflow.requestedOutputWidth,
      workflow.requestedOutputHeight, workflow.outputWidth, workflow.outputHeight].every(positiveInteger)) {
    throw betaBaseContractError("超分工作流身份、版本、来源、尺寸或产物元数据不完整");
  }
  let target;
  let definition;
  try {
    definition = imageUpscaleWorkflow(key);
    target = imageUpscaleTargetDimensions({ width: workflow.sourceWidth, height: workflow.sourceHeight },
      snapshot.resolution, key);
  } catch (cause) { throw betaBaseContractError("超分冻结工作流或源图尺寸合同不一致", cause); }
  const selectedResolution = definition.resolutions.find((resolution) => resolution.key === snapshot.resolution);
  const legacyKs = recovering && isLegacyKsArchive(key, workflow.workflowVersion, snapshot.resolution);
  const legacyArea = legacyKs && workflow.workflowVersion === "2026-10-26.1";
  const legacyTiled = legacyKs && workflow.workflowVersion === "2026-10-26.2";
  const legacyCapped = legacyKs && workflow.workflowVersion === "2026-10-26.3";
  const legacyWhole = legacyKs && !legacyArea && !legacyTiled && !legacyCapped;
  if ((!legacyKs && workflow.workflowVersion !== definition.version)
    || (snapshot.upscaleWorkflowVersion && snapshot.upscaleWorkflowVersion !== workflow.workflowVersion)
    || (key.startsWith("ks_") && !legacyWhole && snapshot.upscaleWorkflowVersion !== workflow.workflowVersion)) {
    throw betaBaseContractError("超分冻结版本与实际工作流不一致");
  }
  if (workflow.model !== definition.model || workflow.inputMegapixels !== definition.inputMegapixels
    || workflow.sourceSha256 !== definition.sourceSha256
    || workflow.outputScale !== selectedResolution.scale
    || workflow.requestedOutputWidth !== target.width || workflow.requestedOutputHeight !== target.height) {
    throw betaBaseContractError("超分源图、目标尺寸或 SeedVR2 参数回读不一致");
  }
  const plan = legacyWhole ? { strategy: "whole", seedVrResolution: Math.min(target.width, target.height),
    seedVrMaxResolution: selectedResolution.scale ? 0 : target.longEdge }
    : legacyArea ? legacyKsAreaPlan(target, selectedResolution)
      : legacyTiled ? legacyKsTiledPlan(target)
        : legacyCapped ? legacyKsCappedPlan(target)
          : imageUpscaleExecutionPlan({ ...target, resolution: snapshot.resolution, workflowKey: key,
            sourceWidth: workflow.sourceWidth, sourceHeight: workflow.sourceHeight });
  if (workflow.seedVrResolution !== plan.seedVrResolution || workflow.seedVrMaxResolution !== plan.seedVrMaxResolution) {
    throw betaBaseContractError("超分实际 SeedVR2 推理尺寸回读不一致");
  }
  if (key.startsWith("ks_") && !legacyWhole) {
    const tiling = plan.strategy === "tiled" ? { ...(plan.thresholdPixels === undefined ? {} : { thresholdPixels: plan.thresholdPixels }), tileWidth: plan.tileWidth,
      tileHeight: plan.tileHeight, overlap: plan.tileOverlap, rows: plan.tileRows,
      columns: plan.tileColumns, tileCount: plan.tileCount } : undefined;
    if (workflow.executionStrategy !== plan.strategy || workflow.executionPolicyVersion !== plan.policyVersion
      || workflow.blocksToSwap !== plan.blocksToSwap || workflow.swapIoComponents !== plan.swapIoComponents
      || !isDeepStrictEqual(workflow.tiling, tiling)
      || (plan.strategy === "tiled" && (workflow.outputWidth !== target.width || workflow.outputHeight !== target.height))) {
      throw betaBaseContractError("超分执行策略、实际参数或交付尺寸回读不一致");
    }
    if (!legacyKs || legacyCapped) {
      const fixed = plan.fixedInferenceLongEdge !== undefined;
      const inference = { inferenceWidth: plan.inferenceWidth, inferenceHeight: plan.inferenceHeight,
        ...(fixed ? { fixedInferenceLongEdge: plan.fixedInferenceLongEdge } : { inferencePixelLimit: plan.inferencePixelLimit }),
        paddedInferencePixels: plan.paddedInferencePixels, deliveryPostResize: plan.deliveryPostResize };
      const padded = Math.ceil(workflow.inferenceWidth / 16) * 16 * Math.ceil(workflow.inferenceHeight / 16) * 16;
      if (Object.entries(inference).some(([field, value]) => workflow[field] !== value)
        || ![workflow.inferenceWidth, workflow.inferenceHeight, workflow.paddedInferencePixels].every(positiveInteger)
        || padded !== workflow.paddedInferencePixels
        || (fixed ? Object.hasOwn(workflow, "inferencePixelLimit") : padded >= plan.inferencePixelLimit || Object.hasOwn(workflow, "fixedInferenceLongEdge"))
        || workflow.deliveryPostResize !== (workflow.inferenceWidth !== target.width || workflow.inferenceHeight !== target.height)
        || workflow.outputWidth !== target.width || workflow.outputHeight !== target.height) {
        throw betaBaseContractError("超分整图推理面积、画布或交付恢复参数回读不一致");
      }
    }
  } else if (legacyWhole && (workflow.executionStrategy && workflow.executionStrategy !== "whole"
    || workflow.tiling || workflow.executionPolicyVersion)) {
    throw betaBaseContractError("历史KS整图记录包含不兼容的分块策略");
  }
  verifyMetadata(fields, { "Prompt / 工作流版本": `${key}@${workflow.workflowVersion}`,
    "尺寸": `${workflow.outputWidth}x${workflow.outputHeight}` });
  if (bytes && (actualImageSize(bytes) !== fields["尺寸"]
    || createHash("sha256").update(bytes).digest("hex") !== workflow.outputSha256)) {
    throw betaBaseContractError("超分实际结果尺寸或 SHA-256 与工作流不一致");
  }
  return workflow;
}


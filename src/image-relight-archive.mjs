/**
 * [INPUT]: 依赖批次/模型与整体原灯和可选精修计划、服务器飞书Prompt快照、上传原件、实际引导PNG及Prompt/尺寸/费用/SHA回执
 * [OUTPUT]: 对外提供v10整体原灯三方冻结/计划摘要及归档manifest、飞书资产身份与单/双图复核，保留v1-v9原字段摘要与已存Prompt且不重拼
 * [POS]: src 的 GPT 打光归档边界，由应用服务与飞书同步消费，不读取当前Prompt表、不调用模型或写飞书
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { normalizeGenerationBatch } from "./generation-batch.mjs";
import { normalizeReferenceImage } from "./reference-image.mjs";
import { decodeImageDataUrl } from "./image-artifact.mjs";
import { readImageDimensions } from "./image-dimensions.mjs";
import { MODEL_CONFIGS } from "./model-config.mjs";
import { normalizeRelightSettings } from "../public/image-relight-presets.js";
import { normalizeRelightLights, normalizeRelightOriginalLights } from "../public/image-relight-geometry.js";

export const IMAGE_RELIGHT_ARCHIVE_FEATURE_LABEL = "打光";
const MODEL_KEY = "gptImage25Sunburst";
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const workflowRevision = workflow => Number(String(workflow?.workflowVersion || "").match(/gpt-relight\.(\d+)$/)?.[1] || 0);
const planSha256 = plan => sha256(JSON.stringify({ ...plan.settings,
  ...(plan.revision >= 10 ? { originalLights: plan.originalLights } : {}), lights: plan.lights }));
const hasOriginalEdit = originalLights => originalLights?.action === "darken" || originalLights?.action === "turnOff";

function normalizedLights(source, settings, originalLights = null) {
  const allowEmpty = settings.templateKey !== "custom" || hasOriginalEdit(originalLights);
  const value = source?.lights === undefined && allowEmpty ? [] : source?.lights;
  return normalizeRelightLights(value, { allowEmpty });
}

function normalizedOriginalLights(source, settings, revision, { captured = false } = {}) {
  if (revision < 10) {
    if (source?.originalLights != null) throw new TypeError("旧版打光归档不支持整体原灯参数");
    return null;
  }
  const originalLights = normalizeRelightOriginalLights(source?.originalLights);
  if (originalLights !== null && settings.templateKey !== "custom") throw new TypeError("原灯整体处理仅允许自定义打光");
  if (captured && (!Object.hasOwn(source || {}, "originalLights") || !isDeepStrictEqual(source.originalLights, originalLights))) {
    throw new TypeError("打光v10归档必须明确冻结规范化整体原灯参数");
  }
  return originalLights;
}

function imageIdentity(image, expectedSha256, { png = false } = {}) {
  const bytes = decodeImageDataUrl(image?.imageUrl || image?.url || "");
  const dimensions = readImageDimensions(bytes);
  if (!dimensions || !expectedSha256 || sha256(bytes) !== expectedSha256) throw new TypeError("打光归档图片 SHA-256 与实际提交或生成回执不一致");
  if (image.size !== undefined && image.size !== bytes.length) throw new TypeError("打光归档图片字节数与实际字节不一致");
  if (png && (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    || image.mimeType && image.mimeType !== "image/png")) throw new TypeError("打光引导图和结果必须为实际 PNG 图片");
  return { size: bytes.length, sha256: expectedSha256, width: dimensions.width, height: dimensions.height };
}

function archivePlan(workflow) {
  const revision = workflowRevision(workflow);
  const hasTemplate = Object.hasOwn(workflow || {}, "templateKey"), hasBlend = Object.hasOwn(workflow || {}, "blendMode");
  if (hasTemplate !== hasBlend || revision >= 2 && !hasTemplate) throw new TypeError("打光归档缺少实际模板或融合方式");
  let settings, lights, originalLights;
  try {
    settings = normalizeRelightSettings(workflow);
    originalLights = normalizedOriginalLights(workflow, settings, revision, { captured: true });
    lights = normalizedLights(workflow, settings, originalLights);
  } catch (error) { throw new TypeError(`打光归档参数无效：${error.message}`); }
  if (revision >= 3 && !isDeepStrictEqual(workflow.lights, lights)) throw new TypeError("打光v3归档必须明确记录规范化动作及对应参数");
  if (settings.templateKey === "custom" && !hasOriginalEdit(originalLights) && lights.every(light => light.action === "preserve")) throw new TypeError("自定义打光归档需要整体减弱/关闭或至少一项实际调光动作");
  if (workflow.lightCount !== undefined && workflow.lightCount !== lights.length || revision >= 2 && workflow.lightCount === undefined) {
    throw new TypeError("打光归档光源数量与实际参数不一致");
  }
  const hasGuide = lights.length > 0;
  if (!hasGuide && workflow.guideSha256 != null) throw new TypeError("无标注打光归档不能携带未提交的引导图");
  return { settings, originalLights, revision, lights, hasGuide, referenceCount: hasGuide ? 2 : 1,
    referenceRoles: hasGuide ? ["original-source", "submitted-light-guide"] : ["original-source"] };
}

function assertPromptIdentity(workflow, selection) {
  if (workflowRevision(workflow) < 8) return;
  if (workflow.relightPromptCode !== "image-relight" || !Number.isInteger(workflow.relightPromptVersion) || workflow.relightPromptVersion <= 0
    || !/^[a-f0-9]{64}$/.test(workflow.relightPromptSha256 || "") || !workflow.relightPromptSource
    || workflow.templateSource !== workflow.relightPromptSource
    || selection?.relightPromptVersion !== workflow.relightPromptVersion
    || selection?.relightPromptSha256 !== workflow.relightPromptSha256) throw new TypeError("打光归档飞书Prompt版本、来源或摘要与冻结身份不一致");
}

function assertSubmittedPromptSnapshot(metadata, input, validated) {
  if (workflowRevision(metadata) < 8) return;
  assertPromptIdentity(metadata, input);
  const snapshot = validated.relightPromptSnapshot;
  let matchingBundle = false;
  try { matchingBundle = isDeepStrictEqual(snapshot.bundle, JSON.parse(snapshot.prompt)); } catch {}
  if (!snapshot || snapshot.published !== true || typeof snapshot.prompt !== "string" || !snapshot.prompt.trim()
    || !matchingBundle || snapshot.sha256 !== sha256(snapshot.prompt)
    || snapshot.code !== metadata.relightPromptCode || snapshot.version !== metadata.relightPromptVersion
    || snapshot.sha256 !== metadata.relightPromptSha256 || snapshot.source !== metadata.relightPromptSource) {
    throw new TypeError("打光归档实际飞书Prompt快照与执行回执不一致");
  }
}

export function buildImageRelightArchive({ input, validated, result, guideImage }) {
  const metadata = result.upstream?.metadata;
  if (!metadata?.prompt?.trim() || metadata.modelKey !== MODEL_KEY || !result.images?.[0]?.url || !metadata.workflowVersion) {
    throw new TypeError("打光归档缺少实际 Prompt、固定 GPT 模型、版本或结果");
  }
  const plan = archivePlan(metadata);
  assertSubmittedPromptSnapshot(metadata, input, validated);
  let validatedSettings, inputSettings, validatedLights, inputLights, validatedOriginal, inputOriginal;
  try {
    validatedSettings = normalizeRelightSettings(validated);
    inputSettings = normalizeRelightSettings(input);
    validatedOriginal = normalizedOriginalLights(validated, validatedSettings, plan.revision);
    inputOriginal = normalizedOriginalLights(input, inputSettings, plan.revision);
    validatedLights = normalizedLights(validated, validatedSettings, validatedOriginal);
    inputLights = normalizedLights(input, inputSettings, inputOriginal);
  } catch (error) { throw new TypeError(`打光归档执行参数无效：${error.message}`); }
  if (!isDeepStrictEqual(plan.lights, validatedLights) || !isDeepStrictEqual(plan.lights, inputLights)
    || !isDeepStrictEqual(plan.settings, validatedSettings)
    || !isDeepStrictEqual(plan.settings, inputSettings)
    || !isDeepStrictEqual(plan.originalLights, validatedOriginal) || !isDeepStrictEqual(plan.originalLights, inputOriginal)
    || plan.revision >= 10 && (!Object.hasOwn(result.request || {}, "originalLights") || !isDeepStrictEqual(plan.originalLights, result.request.originalLights))
    || Boolean(guideImage) !== plan.hasGuide
    || result.request?.referenceImageCount !== undefined && result.request.referenceImageCount !== plan.referenceCount) {
    throw new TypeError("打光归档模板、融合方式、光源或实际引导图与执行参数不一致");
  }
  const original = normalizeReferenceImage(input.referenceImages?.[0]);
  imageIdentity(original, metadata.sourceSha256);
  const guide = plan.hasGuide ? imageIdentity(guideImage, metadata.guideSha256, { png: true }) : null;
  const output = imageIdentity(result.images[0], metadata.outputSha256, { png: true });
  if (guide && (guide.width !== metadata.sourceWidth || guide.height !== metadata.sourceHeight)
    || output.width !== metadata.outputWidth || output.height !== metadata.outputHeight) {
    throw new TypeError("打光归档实际引导图或结果尺寸与执行回执不一致");
  }
  return {
    durationMs: result.durationMs,
    finalPrompt: metadata.prompt,
    sourcePrompt: validated.prompt || "",
    modelLabel: MODEL_CONFIGS[MODEL_KEY].label,
    preview: { ...result.request, ...plan.settings, outputFormat: "png", referenceImageCount: plan.referenceCount,
      ...(plan.revision >= 10 ? { originalLights: structuredClone(plan.originalLights) } : {}),
      ...(workflowRevision(metadata) >= 8 ? { relightPromptVersion: metadata.relightPromptVersion, relightPromptSha256: metadata.relightPromptSha256 } : {}),
      syncMode: "lark", provider: "oneapi", transport: result.upstream.transport },
    referenceImages: [original, ...(plan.hasGuide ? [{ ...guideImage, fileName: "relight-guide-submitted.png" }] : [])],
    resultImage: result.images[0],
    workflow: { ...normalizeGenerationBatch(input), ...metadata, ...plan.settings, feature: "image-relight", provider: "oneapi",
      ...(plan.revision >= 10 ? { originalLights: structuredClone(plan.originalLights) } : {}),
      lights: structuredClone(plan.lights), lightCount: plan.lights.length, lightingPlanSha256: planSha256(plan), workflowId: result.workflow?.key || "gpt-relight",
      workflowVersion: metadata.workflowVersion, promptSource: "submitted Responses background prompt",
      finalPromptCaptured: true, referenceRoles: plan.referenceRoles, syncMode: "lark" },
  };
}

// -------- 在飞书写入前复核按实际光源确定的单图/双图次序与真实图片身份 --------
export function relightArchiveManifest(input, resultBytes) {
  const workflow = input.workflow;
  if (workflow?.feature !== "image-relight" || workflow.modelKey !== MODEL_KEY || !input.finalPrompt?.trim()
    || input.styleReferenceImages?.length || input.maskImage || input.fillReferenceImage || input.boxedSourceImage) {
    throw new TypeError("打光归档需提供固定 GPT 模型、完整光照配置及真实原图和结果");
  }
  const plan = archivePlan(workflow);
  assertPromptIdentity(workflow, input.preview);
  if ((workflowRevision(workflow) >= 3 || workflow.lightingPlanSha256 !== undefined)
    && workflow.lightingPlanSha256 !== planSha256(plan)) throw new TypeError("打光归档动作、压暗幅度或模板与冻结计划摘要不一致");
  if (input.referenceImages?.length !== plan.referenceCount || !isDeepStrictEqual(workflow.referenceRoles, plan.referenceRoles)
    || input.preview?.referenceImageCount !== undefined && input.preview.referenceImageCount !== plan.referenceCount
    || input.preview?.templateKey !== undefined && input.preview.templateKey !== plan.settings.templateKey
    || input.preview?.blendMode !== undefined && input.preview.blendMode !== plan.settings.blendMode
    || plan.revision >= 10 && (!Object.hasOwn(input.preview || {}, "originalLights") || !isDeepStrictEqual(input.preview.originalLights, plan.originalLights))
    || workflow.prompt !== undefined && workflow.prompt !== input.finalPrompt) {
    throw new TypeError("打光归档实际参考图数量、角色、模板或融合参数不一致");
  }
  const original = imageIdentity(input.referenceImages[0], workflow.sourceSha256);
  const guide = plan.hasGuide ? imageIdentity(input.referenceImages[1], workflow.guideSha256, { png: true }) : null;
  const output = imageIdentity({ url: `data:image/png;base64,${resultBytes.toString("base64")}` }, workflow.outputSha256, { png: true });
  if (guide && (guide.width !== workflow.sourceWidth || guide.height !== workflow.sourceHeight)
    || output.width !== workflow.outputWidth || output.height !== workflow.outputHeight) {
    throw new TypeError("打光归档实际尺寸与生成参数不一致");
  }
  return { "参考图": [original, ...(guide ? [guide] : [])], "结果图": [output] };
}

/**
 * [INPUT]: 依赖全景工作流、飞书光影槽冻结身份及已知旧v1-v4合同、模型目录和真实图片/参数
 * [OUTPUT]: 提供全景规则/卡片/输入快照及已有成品旧合同恢复，核对实际Prompt/单图/原尺寸归档
 * [POS]: src 的 Beta 全景纯归档合同，与精模和超分核验隔离，不调用模型或飞书
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createHash } from "node:crypto";
import { betaBaseContractError } from "./beta-base-schema.mjs";
import { readImageDimensions } from "./image-dimensions.mjs";
import { MODEL_CONFIGS } from "./model-config.mjs";
import { PANORAMA_LIGHTING_IDENTITY } from "./panorama-lighting.mjs";
import { normalizePanoramaLightingRule, PANORAMA_LIGHTING_PROMPT_CODE } from "./panorama-lighting-prompt.mjs";
import { PANORAMA_WORKFLOW } from "./panorama-workflow.mjs";
import { normalizeReferenceImages } from "./reference-image.mjs";

const digest = value => createHash("sha256").update(value).digest("hex");
const fail = message => { throw betaBaseContractError(message); };
const LEGACY_LIGHTING_CONTRACTS = Object.freeze([
  { code: "panorama-lighting-transform", version: 1,
    sha256: "a1d773698284fbe502e27e212d0ad9d8a6aee0fd4db964283c28db6d1ef25985" },
  { code: "panorama-lighting-transform", version: 2,
    sha256: "5da9e8b87206a4f9234ac4e9c0a927d5515f212ea4d1a29f00471b813c68f633" },
  { code: "panorama-lighting-transform", version: 3,
    sha256: "3c4167532f69715756f1eed9393f4cfa46657c54fe9282ac028df9b3c2162936" },
  { code: "panorama-lighting-transform", version: 4,
    sha256: "d8c87bf32bb89151e1da6685a5397a45a2c64f7c30a796aae71fafb163f0327e" },
]);
const LEGACY_SPHERICAL_WORKFLOW = Object.freeze({
  id: "panorama-r5-4", version: "2026-10-28.1",
  sourceSha256: "1390e507c446a82d45e9fec795358d4df7b29f52e6625cd988c53e6150e16b2a",
});

export function panoramaArchiveSnapshot(input) {
  if (input.featureMode !== "panoramaEnhancement") return {};
  const source = input.referenceImages?.length ? normalizeReferenceImages(input.referenceImages, { maxCount: 1 })[0] : null;
  if (source && source.width !== source.height * 2) fail("全景归档输入必须为真实2:1图片");
  const mode = input.panoramaLighting ? "preset" : String(input.prompt || "").trim() ? "custom" : "preserve";
  const flux = MODEL_CONFIGS[input.modelKey]?.panoramaWorkflow;
  const rule = mode === "preserve" ? null : normalizePanoramaLightingRule(input.panoramaLightingRule);
  return {
    panoramaArchiveVersion: 1, panoramaLightingMode: mode,
    ...(String(input.prompt || "").trim() ? { panoramaCustomPromptSha256: digest(String(input.prompt).trim()) } : {}),
    ...(source ? { panoramaSource: { width: source.width, height: source.height,
      sha256: digest(Buffer.from(source.imageUrl.split(",")[1], "base64")) } } : {}),
    ...(mode !== "preserve" ? { panoramaLightingContract: rule
      ? { code: PANORAMA_LIGHTING_PROMPT_CODE, version: rule.version, sha256: rule.sha256 }
      : { code: PANORAMA_LIGHTING_IDENTITY.code,
      version: PANORAMA_LIGHTING_IDENTITY.version, sha256: PANORAMA_LIGHTING_IDENTITY.sha256 } } : {}),
    ...(flux ? { panoramaWorkflowId: PANORAMA_WORKFLOW.id, panoramaWorkflowVersion: PANORAMA_WORKFLOW.version,
      panoramaWorkflowSourceSha256: PANORAMA_WORKFLOW.sourceWorkflowSha256 } : {}),
  };
}

// --- 仅供已有成品的恢复路径使用；实际回执与两份附件仍由归档核验器复核 ---
export function restorePanoramaArchiveSnapshot(expectedSnapshot, storedSource) {
  let stored;
  try { stored = JSON.parse(storedSource); }
  catch { fail("已有全景缺少可信的冻结配置"); }
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) fail("已有全景冻结配置格式不正确");
  const expected = { ...expectedSnapshot };
  if (stored.panoramaArchiveVersion === 1) {
    if (!expected.panoramaSource) expected.panoramaSource = stored.panoramaSource;
    if (expected.panoramaWorkflowId === LEGACY_SPHERICAL_WORKFLOW.id
      && stored.panoramaWorkflowId === expected.panoramaWorkflowId
      && stored.panoramaWorkflowVersion === LEGACY_SPHERICAL_WORKFLOW.version
      && stored.panoramaWorkflowSourceSha256 === LEGACY_SPHERICAL_WORKFLOW.sourceSha256) {
      expected.panoramaWorkflowVersion = stored.panoramaWorkflowVersion;
      expected.panoramaWorkflowSourceSha256 = stored.panoramaWorkflowSourceSha256;
    }
    const contract = stored.panoramaLightingContract;
    if (expected.panoramaLightingMode !== "preserve" && LEGACY_LIGHTING_CONTRACTS.some(legacy =>
      contract?.code === legacy.code && contract.version === legacy.version && contract.sha256 === legacy.sha256)) {
      expected.panoramaLightingContract = { ...contract };
    }
  }
  if (!stored.panoramaArchiveVersion) {
    if (expected.panoramaLightingMode !== "preserve") fail("旧全景归档不能恢复新的光影目标任务");
    for (const key of Object.keys(expected).filter(key => key.startsWith("panorama") && key !== "panoramaPromptVersion")) delete expected[key];
    if (expected.resolution === "original") expected.resolution = stored.resolution;
  }
  return expected;
}

export function verifyPanoramaArchive(fields, frozen, { bytes = null, sourceBytes = null, recovering = false } = {}) {
  let parameters;
  try { parameters = JSON.parse(fields["生成参数"]); }
  catch { fail("全景缺少实际生成参数"); }
  if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)) fail("全景实际生成参数格式不正确");
  const workflow = parameters.workflow || {};
  const actual = workflow.panoramaLighting;
  if (frozen.panoramaArchiveVersion !== 1) {
    // --- 旧全景只恢复已存在的原美化附件，不能声明新球面链路或光影目标 ---
    if (!recovering || frozen.panoramaLighting || workflow.workflowId === PANORAMA_WORKFLOW.id
      || actual && actual.mode !== "preserve") fail("旧全景归档不能作为R5_4或光影转换结果恢复");
    return { legacy: true };
  }
  if (parameters.referenceImageCount !== 1 || workflow.feature !== "panorama-render-enhancement"
    || actual?.execution !== "prompt-only" || actual.imageRoles?.source !== 1 || Object.keys(actual.imageRoles).length !== 1
    || !actual || actual.mode !== frozen.panoramaLightingMode
    || typeof fields["最终 Prompt"] !== "string" || !fields["最终 Prompt"].trim()
    || actual.promptSha256 !== digest(fields["最终 Prompt"])) {
    fail("全景实际光影模式、最终Prompt摘要或单图数量与冻结配置不一致");
  }
  const expected = frozen.panoramaLighting;
  if (expected ? actual.preset?.id !== expected.presetId || actual.preset?.version !== expected.version
    || actual.preset?.sha256 !== expected.sha256 : actual.preset != null) {
    fail("全景光影卡片实际版本、ID或SHA与冻结配置不一致");
  }
  const contract = frozen.panoramaLightingContract;
  if (contract && (actual.contract?.code !== contract.code || actual.contract?.version !== contract.version
    || actual.contract?.sha256 !== contract.sha256)) fail("全景光影实际提示词合同与冻结版本不一致");
  if (Boolean(frozen.panoramaCustomPromptSha256) !== Boolean(actual.customPromptUsed)
    || actual.customPromptSha256 !== frozen.panoramaCustomPromptSha256) fail("全景自定义光影要求摘要与冻结输入不一致");
  const source = frozen.panoramaSource;
  if (!source || source.width !== source.height * 2 || !/^[a-f0-9]{64}$/.test(source.sha256 || "")) {
    fail("全景归档缺少可信的原图尺寸或SHA");
  }
  if (sourceBytes) {
    const dimensions = readImageDimensions(sourceBytes);
    if (dimensions?.width !== source.width || dimensions?.height !== source.height || digest(sourceBytes) !== source.sha256) {
      fail("全景原图附件尺寸或SHA与冻结配置不一致");
    }
  }
  if (bytes) {
    const dimensions = readImageDimensions(bytes);
    if (!dimensions || dimensions.width !== dimensions.height * 2) fail("全景真实结果不是2:1图片");
  }
  if (frozen.panoramaWorkflowId) {
    if (workflow.workflowId !== frozen.panoramaWorkflowId || workflow.workflowVersion !== frozen.panoramaWorkflowVersion
      || workflow.sourceWorkflowSha256 !== frozen.panoramaWorkflowSourceSha256
      || workflow.panoramaSphericalSampling !== true || workflow.postUpscaled !== false
      || workflow.outputSizing !== "source-original" || workflow.outputWidth !== source.width || workflow.outputHeight !== source.height
      || !/^[a-f0-9]{64}$/.test(workflow.outputSha256 || "")) {
      fail("全景R5_4实际工作流版本、来源SHA或原尺寸输出与冻结配置不一致");
    }
    if (bytes) {
      const dimensions = readImageDimensions(bytes);
      if (dimensions?.width !== source.width || dimensions?.height !== source.height || digest(bytes) !== workflow.outputSha256) {
        fail("全景R5_4真实结果尺寸或SHA与执行回执不一致");
      }
    }
  }
  return { legacy: false, source };
}

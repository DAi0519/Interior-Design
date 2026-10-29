/**
 * [INPUT]: 依赖飞书光影三类规则/预设原附件、可注入独立迁移规则编码、旧精模参数、模型目录和原图字节校验
 * [OUTPUT]: 对外提供基础+氛围单图、专用迁移双图及图序前置+氛围双图编译、精模Flux独立双图准入与原图SHA冻结复核
 * [POS]: src 的精模预设三执行模式与上传参考边界，旧请求不读新库，Prompt与卡片原图仅服务端读取
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createHash } from "node:crypto";
import { isLightingReference, REFINED_LIGHTING_PRESET_EXECUTIONS, supportsLightingReference } from "../public/refined-flux-reference.js";
import { MODEL_CONFIGS } from "./model-config.mjs";
import { normalizeReferenceImages } from "./reference-image.mjs";
import { normalizeRefinedRender, requiresRefinedAtmosphere } from "../public/refined-render-presets.js";
import { loadRefinedLightingAssets, loadRefinedLightingReference, REFINED_LIGHTING_PROMPT_RULE_CODE, REFINED_LIGHTING_REFERENCE_RULE_CODE, REFINED_LIGHTING_HYBRID_RULE_CODE } from "./refined-lighting-library.mjs";

const digest = value => createHash("sha256").update(value).digest("hex");
const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const FIELDS = new Set(["mode", "presetId", "version", "sha256", "ruleVersion", "ruleSha256", "referenceSha256", "execution"]);

export function usesReferencePrompt(selection) {
  return selection?.mode === "reference"
    || selection?.mode === "preset" && selection.execution === "prompt-and-reference";
}
export function usesHybridPrompt(selection) {
  return selection?.mode === "preset" && selection.execution === "prompt-with-reference";
}

export function hasRefinedLightingInput(input = {}) {
  return Object.hasOwn(input, "refinedLighting");
}

function selectionOf(input) {
  const value = input.refinedLighting;
  if (value?.mode === "original") throw fail("原始光影已取消，请选择光影预设或上传氛围参考图");
  const presetReference = value?.mode === "preset" && isLightingReference(value);
  const execution = value?.mode === "reference" ? "image-reference" : value?.execution ?? "prompt-only";
  if (value?.mode === "preset" && value.referenceSha256 !== undefined && !presetReference
    || value?.mode === "preset" && !REFINED_LIGHTING_PRESET_EXECUTIONS.includes(execution)
    || value?.execution !== undefined && value.execution !== execution) {
    throw fail("旧双图光影任务不能再次执行，请重新选择光影预设", 409);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).some(key => !FIELDS.has(key)) || !["preset", "reference"].includes(value.mode)) {
    throw fail("请选择光影预设或上传氛围参考图");
  }
  if (requiresRefinedAtmosphere(normalizeRefinedRender(input.refinedRender))) throw fail("光影卡片不能与旧时段、天气或色调同时使用");
  if (input.styleReferenceImages?.length) throw fail("精模氛围图请使用独立的光影参考图入口");
  if (input.lightingReferenceImages != null && !Array.isArray(input.lightingReferenceImages)) throw fail("光影参考图列表格式不正确");
  if (value.mode === "preset" && input.lightingReferenceImages?.length) {
    throw fail("预设参考图由光影库读取，不能附带上传图片");
  }
  const selected = { mode: value.mode, ...(value.execution ? { execution: value.execution } : {}) };
  for (const key of ["version", "ruleVersion"]) {
    if (value[key] === undefined) continue;
    if (!["number", "string"].includes(typeof value[key]) || !Number.isInteger(Number(value[key])) || Number(value[key]) < 1) throw fail("光影资产版本必须为正整数");
    selected[key] = Number(value[key]);
  }
  for (const key of ["sha256", "ruleSha256", "referenceSha256"]) {
    if (value[key] === undefined) continue;
    if (typeof value[key] !== "string" || !/^[a-f0-9]{64}$/i.test(value[key])) throw fail("光影资产摘要必须为SHA-256");
    selected[key] = value[key].toLowerCase();
  }
  if (value.mode === "preset") {
    if (typeof value.presetId !== "string" || !value.presetId.trim()) throw fail("请选择光影氛围卡片");
    selected.presetId = value.presetId.trim();
  } else if (value.presetId !== undefined || value.version !== undefined || value.sha256 !== undefined) {
    throw fail("上传参考图不能携带预设卡片身份");
  }
  return selected;
}

export function assertRefinedLightingAdmission(input = {}) {
  if (hasRefinedLightingInput(input)) return selectionOf(input);
  const legacy = input.refinedRender;
  if (legacy && typeof legacy === "object" && !Array.isArray(legacy) && Object.keys(legacy).length
    && Object.values(legacy).every(value => typeof value === "string" && value.trim())) {
    normalizeRefinedRender(legacy);
    if (input.lightingReferenceImages != null && (!Array.isArray(input.lightingReferenceImages)
      || input.lightingReferenceImages.length)) throw fail("精模光影只使用提示词，不能附带氛围参考图");
    return null;
  }
  throw fail("请选择光影预设或上传氛围参考图");
}

function canonicalImage(image) {
  const normalized = normalizeReferenceImages([{ dataUrl: image?.dataUrl || image?.imageUrl,
    name: image?.name || image?.fileName, type: image?.type || image?.mimeType, size: image?.size }], { maxCount: 1 })[0];
  if (!normalized.width || !normalized.height) throw fail("图片无法读取真实尺寸");
  return { dataUrl: normalized.imageUrl, name: normalized.fileName, type: normalized.mimeType,
    size: normalized.size, width: normalized.width, height: normalized.height };
}

function imageSummary(image) {
  return { fileName: image.name, mimeType: image.type, size: image.size, width: image.width,
    height: image.height, sha256: digest(Buffer.from(image.dataUrl.split(",")[1], "base64")) };
}

export function refinedLightingImageSummary(image) {
  return imageSummary(canonicalImage(image));
}

function verifyAsset(asset, version, sha256, label) {
  if (!asset || typeof asset.prompt !== "string" || !asset.prompt.trim()
    || !Number.isInteger(asset.version) || asset.version < 1 || !/^[a-f0-9]{64}$/i.test(asset.sha256 || "")) {
    throw fail(`飞书${label}资产不完整或尚未上架`, 409);
  }
  if (version !== undefined && version !== asset.version || sha256 !== undefined && sha256 !== asset.sha256.toLowerCase()) {
    throw fail(`${label}资产已变更，请刷新光影库后重新提交`, 409);
  }
}

export function refinedLightingFreezeKey(input = {}) {
  if (!hasRefinedLightingInput(input)) return null;
  return JSON.stringify([input.modelKey, input.refinedLighting,
    (Array.isArray(input.lightingReferenceImages) ? input.lightingReferenceImages : [])
      .map(image => digest(String(image?.dataUrl || image?.imageUrl || "")))]);
}

export async function resolveRefinedLightingInput(input = {}, {
  loadAssets = loadRefinedLightingAssets,
  loadReference = loadRefinedLightingReference,
  referenceRuleCode = REFINED_LIGHTING_REFERENCE_RULE_CODE,
} = {}) {
  if (!hasRefinedLightingInput(input)) {
    if (input.lightingReferenceImages != null && (!Array.isArray(input.lightingReferenceImages)
      || input.lightingReferenceImages.length)) throw fail("精模光影只使用提示词，不能附带氛围参考图");
    return null;
  }
  const selection = selectionOf(input);
  const model = MODEL_CONFIGS[String(input.modelKey || "")];
  const featureLabel = input.featureMode === "lightingTransfer" ? "光影转换" : "精模";
  if (!model) throw fail(`请选择有效的${featureLabel}出图模型`);
  const referenceMode = selection.mode === "reference";
  const presetReference = selection.mode === "preset" && isLightingReference(selection);
  const referenceRequired = isLightingReference(selection);
  const referencePrompt = usesReferencePrompt(selection);
  const hybridPrompt = usesHybridPrompt(selection);
  if (referenceRequired && !supportsLightingReference({ ...model, maxReferenceImages: model.maxReferenceImages ?? 4 })) {
    throw fail(`${model.label}仅支持单图，提示词加参考图或上传参考图需要支持双图的模型`, 409);
  }
  if (referenceRequired && model.refinedLightingReference && !["1K", "2K"].includes(input.resolution || "2K")) throw fail(`${featureLabel}Flux双图只支持1K/2K`, 409);
  if (referenceMode && input.lightingReferenceImages?.length !== 1) throw fail("请上传且仅上传1张氛围参考图");
  const library = await loadAssets({ forceRefresh: true });
  const rule = referencePrompt ? library?.referenceRule : hybridPrompt ? library?.hybridRule : library?.rule;
  verifyAsset(rule, selection.ruleVersion, selection.ruleSha256, referencePrompt ? "光影参考规则" : hybridPrompt ? "氛围词参考前置规则" : "光影提示词规则");
  const expectedRuleCode = referencePrompt ? referenceRuleCode
    : hybridPrompt ? REFINED_LIGHTING_HYBRID_RULE_CODE : REFINED_LIGHTING_PROMPT_RULE_CODE;
  if (rule.code !== expectedRuleCode) throw fail("光影来源与规则不匹配，请刷新配置", 409);
  const preset = referenceMode ? null : library.presets?.find(entry => entry.id === selection.presetId);
  if (preset) verifyAsset(preset, selection.version, selection.sha256, "光影卡片");
  else if (!referenceMode) throw fail("飞书光影卡片资产不完整或尚未上架", 409);
  const reference = referenceMode ? canonicalImage(input.lightingReferenceImages[0])
    : presetReference ? canonicalImage(await loadReference(preset, { forceRefresh: true })) : null;
  const summary = reference ? imageSummary(reference) : null;
  if (summary && selection.referenceSha256 !== undefined && selection.referenceSha256 !== summary.sha256) {
    throw fail("光影参考图已变更，请重新选择后提交", 409);
  }
  const frozen = { ...selection, execution: referenceMode ? "image-reference" : selection.execution || "prompt-only",
    ruleVersion: rule.version, ruleSha256: rule.sha256.toLowerCase(),
    ...(preset ? { version: preset.version, sha256: preset.sha256.toLowerCase() } : {}),
    ...(summary ? { referenceSha256: summary.sha256 } : {}) };
  return { selection: frozen, rule, preset, referenceImages: reference ? [reference] : [], metadata: {
    ...frozen, name: preset?.name || "参考图氛围", ...(preset ? { presetName: preset.name } : {}),
    rule: { id: rule.id, code: rule.code, version: rule.version, sha256: rule.sha256 },
    ...(preset ? { preset: { id: preset.id, code: preset.code, name: preset.name, version: preset.version, sha256: preset.sha256 } } : {}),
    ...(summary ? { reference: summary } : {}),
    digestScope: reference ? "input-originals" : "source-original",
    imageRoles: reference ? { source: 1, atmosphere: 2 } : { source: 1 },
  } };
}

export async function prepareRefinedLightingInput(input = {}, dependencies = {}) {
  const assets = await resolveRefinedLightingInput(input, dependencies);
  if (!assets) return input;
  return { ...input, refinedLighting: assets.selection,
    lightingReferenceImages: assets.selection.mode === "reference" ? assets.referenceImages : [] };
}

export function composeRefinedLightingPrompt(basePrompt, assets, userPrompt = "") {
  const custom = String(userPrompt || "").trim();
  if (custom.length > 8000) throw fail("精模自定义要求不能超过 8000 个字符");
  if (usesReferencePrompt(assets.selection)) {
    return [assets.rule?.prompt, custom].filter(Boolean).join("\n\n");
  }
  if (usesHybridPrompt(assets.selection)) {
    return [assets.rule?.prompt, assets.preset?.prompt, custom].filter(Boolean).join("\n\n");
  }
  const atmospherePrompt = [assets.rule?.prompt, assets.preset?.prompt].filter(Boolean).join("\n\n");
  return [String(basePrompt || "").trim(), atmospherePrompt, custom].filter(Boolean).join("\n\n");
}

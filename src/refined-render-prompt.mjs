/**
 * [INPUT]: 依赖纯词独立基础、迁移与氛围词双图专用规则/原件冻结、旧精模模块及氛围 Prompt
 * [OUTPUT]: 对外提供基础词、迁移和氛围词前置规则分路的code/版本/正文SHA冻结、历史兼容与执行前复核
 * [POS]: src 的精模Prompt来源边界，纯词读基础；迁移/上传和氛围词双图各自只读专用规则
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createHash } from "node:crypto";
import { parseRefinedRenderPromptAsset } from "./refined-render-prompt-asset.mjs";
import { resolveRefinedLightingInput, usesReferencePrompt, usesHybridPrompt } from "./refined-lighting.mjs";
import { REFINED_LIGHTING_LIBRARY_CONFIG, REFINED_LIGHTING_REFERENCE_RULE_CODE, REFINED_LIGHTING_HYBRID_RULE_CODE } from "./refined-lighting-library.mjs";
import {
  DEFAULT_EFFECT_ENHANCEMENT_PROMPT_CODE,
  EFFECT_ENHANCEMENT_PROMPT_CONFIG,
  getEffectEnhancementPrompt,
  parseEffectEnhancementPrompt,
} from "./effect-render-enhancement-prompt.mjs";
import {
  DEFAULT_REFINED_MODEL_PROMPT_CODE,
  REFINED_LIGHTING_BASE_PROMPT_CODE,
  REFINED_MODEL_PROMPT_CONFIG,
  getRefinedModelPrompt,
} from "./refined-model-prompt.mjs";
import {
  normalizeRefinedRender,
  requiresRefinedAtmosphere,
} from "../public/refined-render-presets.js";

const digest = value => createHash("sha256").update(value).digest("hex");

function assetError(message) {
  const error = new Error(message);
  error.statusCode = 409;
  return error;
}

function assetIdentity(asset, config, source = asset.renderPrompt || asset.prompt) {
  return {
    code: asset.code,
    version: asset.version,
    sha256: digest(source),
    source: `feishu:${config.tableId}:${asset.code}@v${asset.version}`,
  };
}

function verifyIdentity(identity, expectedSha256, label) {
  if (expectedSha256 !== undefined && (typeof expectedSha256 !== "string"
    || !/^[a-f0-9]{64}$/i.test(expectedSha256)
    || identity.sha256 !== expectedSha256.toLowerCase())) {
    throw assetError(`${label} Prompt 正文已变更，请刷新配置后重新提交`);
  }
}

export async function getRefinedRenderAtmosphere({
  loadAtmospherePrompt = getEffectEnhancementPrompt,
  expectedSha256,
  version,
} = {}) {
  const asset = await loadAtmospherePrompt({ version });
  const modules = parseEffectEnhancementPrompt(asset.prompt);
  const identity = assetIdentity(asset, EFFECT_ENHANCEMENT_PROMPT_CONFIG);
  verifyIdentity(identity, expectedSha256, "氛围");
  return { ...asset, ...identity, modules };
}

export async function resolveRefinedRenderInput(input, {
  loadPrompt = getRefinedModelPrompt,
  loadAtmospherePrompt = getEffectEnhancementPrompt,
  lightingAssets,
  loadLightingAssets,
  loadLightingReference,
  resolveLighting = resolveRefinedLightingInput,
} = {}) {
  const selection = normalizeRefinedRender(input.refinedRender);
  if (usesReferencePrompt(input.refinedLighting) || usesHybridPrompt(input.refinedLighting)) {
    const expectedCode = usesHybridPrompt(input.refinedLighting) ? REFINED_LIGHTING_HYBRID_RULE_CODE : REFINED_LIGHTING_REFERENCE_RULE_CODE;
    if (input.promptCode !== undefined && input.promptCode !== expectedCode) {
      throw assetError("参考图渲染已改为专用光影规则，请重新提交；不能沿用基础渲染 Prompt");
    }
    const resolved = lightingAssets || await resolveLighting(input, {
      ...(loadLightingAssets ? { loadAssets: loadLightingAssets } : {}),
      ...(loadLightingReference ? { loadReference: loadLightingReference } : {}),
    });
    const rule = resolved?.rule;
    if (!(usesReferencePrompt(resolved?.selection) || usesHybridPrompt(resolved?.selection)) || rule?.code !== expectedCode) {
      throw assetError("参考图渲染缺少专用光影规则，请刷新配置后重新提交");
    }
    if (input.promptVersion !== undefined && (!["number", "string"].includes(typeof input.promptVersion)
      || !Number.isInteger(Number(input.promptVersion)) || Number(input.promptVersion) !== rule.version)) {
      throw assetError("参考图渲染专用规则版本已变更，请刷新配置后重新提交");
    }
    const promptAsset = { ...rule, published: true };
    const promptIdentity = assetIdentity(promptAsset, REFINED_LIGHTING_LIBRARY_CONFIG, rule.prompt);
    verifyIdentity(promptIdentity, input.refinedPromptSha256, "光影参考");
    return { selection, promptAsset, promptIdentity, promptDefinition: { format: "plain", main: rule.prompt },
      atmosphereAsset: null, lightingAssets: resolved };
  }
  const lighting = Object.hasOwn(input, "refinedLighting");
  if (lighting && input.promptCode !== undefined && input.promptCode !== REFINED_LIGHTING_BASE_PROMPT_CODE) {
    throw assetError("光影渲染必须使用独立基础 Prompt，请刷新配置后重新提交");
  }
  const code = lighting ? REFINED_LIGHTING_BASE_PROMPT_CODE : input.promptCode || DEFAULT_REFINED_MODEL_PROMPT_CODE;
  const promptAsset = await loadPrompt(
    code,
    { allowDraft: false, version: input.promptVersion },
  );
  if (lighting && promptAsset.code !== REFINED_LIGHTING_BASE_PROMPT_CODE) {
    throw assetError("光影基础 Prompt 编码不匹配，请刷新配置后重新提交");
  }
  const source = lighting ? promptAsset.prompt : promptAsset.renderPrompt || promptAsset.prompt;
  const promptIdentity = assetIdentity(promptAsset, REFINED_MODEL_PROMPT_CONFIG, source);
  verifyIdentity(promptIdentity, input.refinedPromptSha256, "精模");
  if (promptAsset.renderPromptError) throw assetError(promptAsset.renderPromptError);
  const promptDefinition = parseRefinedRenderPromptAsset(source);
  if (lighting && promptDefinition.format !== "plain") {
    throw assetError("光影基础 Prompt 必须是独立纯文本");
  }
  const atmosphereAsset = !lighting && promptDefinition.format === "plain" && requiresRefinedAtmosphere(selection)
    ? await getRefinedRenderAtmosphere({
      loadAtmospherePrompt,
      expectedSha256: input.refinedAtmospherePromptSha256,
      version: input.refinedAtmospherePromptVersion,
    })
    : null;
  return { selection, promptAsset, promptIdentity, promptDefinition, atmosphereAsset };
}

export async function prepareRefinedRenderInput(input, dependencies = {}) {
  const assets = await resolveRefinedRenderInput(input, dependencies);
  const prepared = {
    ...input,
    refinedRender: assets.selection,
    promptCode: assets.promptAsset.code,
    promptVersion: assets.promptAsset.version,
    refinedPromptSha256: assets.promptIdentity.sha256,
  };
  delete prepared.refinedAtmospherePromptVersion;
  delete prepared.refinedAtmospherePromptSha256;
  if (assets.lightingAssets) {
    prepared.refinedLighting = assets.lightingAssets.selection;
    prepared.lightingReferenceImages = assets.lightingAssets.selection.mode === "reference" ? assets.lightingAssets.referenceImages : [];
  }
  if (assets.atmosphereAsset) {
    prepared.refinedAtmospherePromptVersion = assets.atmosphereAsset.version;
    prepared.refinedAtmospherePromptSha256 = assets.atmosphereAsset.sha256;
  }
  return prepared;
}

export function composeRefinedRenderAppearance(corePrompt, selectionValue, atmosphereAsset, promptDefinition) {
  const selection = normalizeRefinedRender(selectionValue);
  if (!requiresRefinedAtmosphere(selection)) return corePrompt;
  if (promptDefinition?.format === "modular") {
    return [
      corePrompt,
      "[RENDER PRIORITY]\nPreserve the source design, material identities, furniture and camera. Selected time takes priority over weather.",
      ...selectedRefinedModules(selection).map(({ path, group, key }) => `[${path}]\n${promptDefinition.modules[group][key]}`),
    ].join("\n\n");
  }
  if (!atmosphereAsset?.modules) throw assetError("精模渲染缺少已上架氛围 Prompt");
  const active = [
    selection.time !== "preserve" ? `time=${selection.time}` : null,
    selection.weather !== "preserve" ? `weather=${selection.weather}` : null,
    selection.tone !== "preserve" ? `tone=${selection.tone}` : null,
  ].filter(Boolean).join(", ");
  const boundary = [
    "[RENDERING APPEARANCE OVERRIDES]",
    `Active parameters: ${active}.`,
    "Apply only the selected appearance dimensions. These selected time, weather, lighting and photographic tone instructions override conflicting default illumination, lamp output, color-temperature, saturation and contrast directions in the core rendering prompt. Unselected dimensions retain the core rendering defaults. Selected time takes priority over weather.",
    "All source design locks remain highest priority: preserve architecture, openings, camera, composition, every material identity, base color and texture, and all furniture, fixtures, objects, quantities, shapes and placements. Adjust lighting and surface response only; never redesign, replace, recolor or add objects. Weather effects stay outside verified windows and openings, and the interior stays clear and dry.",
  ].join("\n");
  const tone = selection.tone === "preserve" ? null
    : `[PHOTOGRAPHIC TONE:${selection.tone.toUpperCase()}]\nApply a restrained ${selection.tone} cast to illumination and photographic grading only. Preserve each material's base color, hue relationships and texture; never dye surfaces or apply a uniform color wash.`;
  return [
    corePrompt,
    boundary,
    selection.time === "preserve" ? null : atmosphereAsset.modules[selection.time],
    selection.weather === "preserve" ? null : atmosphereAsset.modules[selection.weather],
    tone,
    "[FINAL DESIGN LOCK]\nThe appearance choices never authorize changes to design, material identity or base color, furniture, fixtures, objects, geometry, camera or composition.",
  ].filter(Boolean).join("\n\n");
}

function selectedRefinedModules(selection) {
  return [["TIME", selection.time], ["WEATHER", selection.weather], ["TONE", selection.tone]]
    .filter(([, value]) => value !== "preserve")
    .map(([group, value]) => ({ group, key: value.toUpperCase(), path: `${group}.${value.toUpperCase()}` }));
}

export function refinedRenderPromptIdentity(definition, selectionValue, identity) {
  if (definition.format !== "modular") return null;
  return {
    source: "refined-prompt", schemaVersion: definition.schemaVersion,
    moduleKeys: ["MAIN", ...selectedRefinedModules(normalizeRefinedRender(selectionValue)).map(({ path }) => path)],
    version: identity.version, sha256: identity.sha256, assetSource: identity.source,
  };
}

export function refinedAtmosphereIdentity(asset) {
  return asset ? {
    code: asset.code || DEFAULT_EFFECT_ENHANCEMENT_PROMPT_CODE,
    version: asset.version,
    sha256: asset.sha256,
    source: asset.source,
  } : null;
}

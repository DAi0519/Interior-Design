/**
 * [INPUT]: 依赖飞书共享光影库卡片正文/版本/SHA、效果图美化的可选卡片身份与用户补充
 * [OUTPUT]: 对外提供新增氛围的纯词合同、卡片入队/执行复核、低增强自然调路由与脱敏归档身份
 * [POS]: src 的效果图美化光影边界，新增卡片与原六档互斥，不加载精模规则或卡片原图
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createHash } from "node:crypto";
import { loadRefinedLightingAssets } from "./refined-lighting-library.mjs";

const digest = value => createHash("sha256").update(value).digest("hex");
const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode, retryable: false });
const FIELDS = new Set(["presetId", "version", "sha256"]);

export const EFFECT_BEAUTIFICATION_LIGHTING_WORKFLOW = Object.freeze({ intensity: "low", tone: "natural" });
export const EFFECT_BEAUTIFICATION_LIGHTING_CONTRACT = [
  "Beautify and relight the supplied interior or architectural rendering according to the selected lighting target below.",
  "Preserve the original design, room geometry, openings, layout, camera, perspective, composition, furniture, object positions, material types, textures, and intrinsic material colors. Do not add, remove, move, or redesign structures or objects.",
  "Adapt the target to existing openings and identifiable luminaires. Change the time-of-day appearance, balance of natural and artificial light, direction, softness, shadows, color temperature, white balance, and exposure to realize the target. Suppress existing illumination that conflicts with the target, but do not invent openings, visible light fixtures, direct sun paths, or decorative shadows without support in the source image.",
  "Improve material response, depth, and photographic clarity while controlling highlights and retaining readable shadows. Interpret target colors as illumination rather than replacement surface colors. The selected lighting target defines illumination; no default diffuse-light or original-brightness preference overrides it.",
  "The user's refinements take priority over the preset lighting preferences. Keep the geometry, design, and intrinsic-material protection constraints above.",
].join("\n");

export const EFFECT_BEAUTIFICATION_LIGHTING_IDENTITY = Object.freeze({
  code: "effect-beautification-lighting", name: "效果图美化光影氛围", version: 1,
  published: false, sha256: digest(EFFECT_BEAUTIFICATION_LIGHTING_CONTRACT),
});

export function normalizeEffectBeautificationLighting(value) {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).some(key => !FIELDS.has(key))
    || typeof value.presetId !== "string" || !/^rec[a-zA-Z0-9]+$/.test(value.presetId)
    || !Number.isSafeInteger(value.version) || value.version < 1
    || typeof value.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(value.sha256)) {
    throw fail("请选择有效的美化光影氛围及版本，请刷新光影库后重选");
  }
  return { presetId: value.presetId, version: value.version, sha256: value.sha256.toLowerCase() };
}

export function assertEffectBeautificationLightingFeature(input = {}, featureMode = input.featureMode) {
  if (String(featureMode || "").trim() !== "effectBeautification") {
    if (input.effectBeautificationLighting != null) throw fail("美化光影氛围仅支持效果图美化");
    return null;
  }
  return normalizeEffectBeautificationLighting(input.effectBeautificationLighting);
}

export async function resolveEffectBeautificationLightingInput(input = {}, { loadAssets = loadRefinedLightingAssets } = {}) {
  const selection = assertEffectBeautificationLightingFeature(input);
  if (!selection) return { selection: null, prompt: null, metadata: null };
  if (input.prompt != null && typeof input.prompt !== "string") throw fail("效果图美化补充要求必须为文字");
  const custom = String(input.prompt || "").trim();
  if (custom.length > 8000) throw fail("效果图美化补充要求不能超过 8000 个字符");
  for (const images of [input.lightingReferenceImages, input.styleReferenceImages]) {
    if (images != null && (!Array.isArray(images) || images.length)) throw fail("美化光影氛围使用提示词，请仅上传待处理效果图");
  }
  const library = await loadAssets({ forceRefresh: true });
  const preset = library?.presets?.find(entry => entry.id === selection.presetId);
  if (!preset || preset.version !== selection.version || typeof preset.prompt !== "string" || !preset.prompt.trim()
    || typeof preset.sha256 !== "string" || preset.sha256.toLowerCase() !== selection.sha256) {
    throw fail("美化光影氛围已更新或下架，请刷新光影库后重选", 409);
  }
  const prompt = [
    ...(custom ? [`[USER REFINEMENTS]\n${custom}`] : []),
    EFFECT_BEAUTIFICATION_LIGHTING_CONTRACT,
    `[LIGHTING PRESET]\n${preset.prompt}`,
  ].join("\n\n");
  return { selection, prompt, metadata: {
    mode: "preset", execution: "prompt-only", imageRoles: { source: 1 },
    contract: { code: EFFECT_BEAUTIFICATION_LIGHTING_IDENTITY.code,
      version: EFFECT_BEAUTIFICATION_LIGHTING_IDENTITY.version, sha256: EFFECT_BEAUTIFICATION_LIGHTING_IDENTITY.sha256 },
    preset: { id: preset.id, code: preset.code, name: preset.name, version: preset.version, sha256: selection.sha256 },
    workflowSelection: { ...EFFECT_BEAUTIFICATION_LIGHTING_WORKFLOW },
    customPromptUsed: Boolean(custom), ...(custom ? { customPromptSha256: digest(custom) } : {}),
    promptSha256: digest(prompt),
  } };
}

export async function prepareEffectBeautificationLightingInput(input = {}, dependencies = {}) {
  const { selection } = await resolveEffectBeautificationLightingInput(input, dependencies);
  return { ...input, effectBeautificationLighting: selection,
    ...(selection ? { effectBeautification: { ...EFFECT_BEAUTIFICATION_LIGHTING_WORKFLOW } } : {}) };
}

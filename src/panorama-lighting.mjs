/**
 * [INPUT]: 依赖飞书光影库已上架卡片、请求中的卡片版本/SHA与用户光影要求，以及 Node SHA-256
 * [OUTPUT]: 对外提供全景纯词光影目标准入、卡片冻结、独立转换合同编译及不含正文的追溯元数据
 * [POS]: src 的全景光影编译边界，复用光影卡片真源，不读取精模基础/参考规则或第二张图片
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createHash } from "node:crypto";
import { loadRefinedLightingAssets } from "./refined-lighting-library.mjs";

const digest = value => createHash("sha256").update(value).digest("hex");
const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode, retryable: false });
const SELECTION_FIELDS = new Set(["presetId", "version", "sha256"]);

export const PANORAMA_LIGHTING_CONTRACT = [
  "Relight the supplied equirectangular 360-degree panorama according to the lighting target below.",
  "Preserve the complete room geometry, layout, camera position, projection, openings, furniture, object positions, material types, textures, and intrinsic material colors. Do not add, remove, move, or redesign objects or structures.",
  "Change the time-of-day appearance, existing light-source balance, shadow softness, color temperature, exposure, and white balance as needed to realize the target. Use existing windows, openings, and luminaires; do not invent light fixtures or openings. Suppress source illumination that conflicts with the target.",
  "Keep lighting physically coherent throughout the whole sphere. The left and right image edges are adjacent; match illumination, materials, shadows, and reflections across that seam and maintain continuity at the poles. Do not crop or change the panorama projection.",
  "Render natural material response, readable shadows, controlled highlights, and smooth tonal transitions. Preserve ambiguous or occluded structure rather than inventing detail. Interpret target colors as illumination, not as replacement material colors.",
  "Apply the preset target and then the user's refinements; user refinements override the preset lighting preferences while the geometry and material constraints above remain fixed.",
].join("\n");

export const PANORAMA_LIGHTING_IDENTITY = Object.freeze({
  code: "panorama-lighting-transform", name: "全景光影转换", version: 1,
  published: false, sha256: digest(PANORAMA_LIGHTING_CONTRACT),
});

export function normalizePanoramaLighting(value) {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).some(key => !SELECTION_FIELDS.has(key))
    || typeof value.presetId !== "string" || !/^rec[a-zA-Z0-9]+$/.test(value.presetId)
    || !Number.isSafeInteger(value.version) || value.version < 1
    || typeof value.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(value.sha256)) {
    throw fail("请选择有效的全景光影模板及版本，请刷新光影库后重选");
  }
  return { presetId: value.presetId, version: value.version, sha256: value.sha256.toLowerCase() };
}

export async function resolvePanoramaLightingInput(input = {}, { loadAssets = loadRefinedLightingAssets } = {}) {
  const selection = normalizePanoramaLighting(input.panoramaLighting);
  if (input.prompt != null && typeof input.prompt !== "string") throw fail("全景光影要求必须为文字");
  const custom = String(input.prompt || "").trim();
  if (custom.length > 8000) throw fail("全景光影要求不能超过 8000 个字符");
  for (const images of [input.lightingReferenceImages, input.styleReferenceImages]) {
    if (images != null && (!Array.isArray(images) || images.length)) throw fail("全景光影模板使用提示词，请仅上传待处理全景图");
  }
  if (!selection && !custom) return { selection: null, prompt: null,
    metadata: { mode: "preserve", execution: "prompt-only", imageRoles: { source: 1 } } };

  let preset = null;
  if (selection) {
    const library = await loadAssets({ forceRefresh: true });
    preset = library?.presets?.find(entry => entry.id === selection.presetId);
    if (!preset || preset.version !== selection.version || typeof preset.prompt !== "string" || !preset.prompt.trim()
      || typeof preset.sha256 !== "string" || preset.sha256.toLowerCase() !== selection.sha256) {
      throw fail("全景光影模板已更新或下架，请刷新光影库后重选", 409);
    }
  }
  const prompt = [PANORAMA_LIGHTING_CONTRACT,
    ...(preset ? [`[LIGHTING PRESET]\n${preset.prompt}`] : []),
    ...(custom ? [`[USER LIGHTING REFINEMENTS]\n${custom}`] : []),
  ].join("\n\n");
  return { selection, prompt, metadata: {
    mode: preset ? "preset" : "custom",
    contract: { code: PANORAMA_LIGHTING_IDENTITY.code, version: PANORAMA_LIGHTING_IDENTITY.version,
      sha256: PANORAMA_LIGHTING_IDENTITY.sha256 },
    ...(preset ? { preset: { id: preset.id, code: preset.code, name: preset.name,
      version: preset.version, sha256: selection.sha256 } } : {}),
    customPromptUsed: Boolean(custom), ...(custom ? { customPromptSha256: digest(custom) } : {}),
    promptSha256: digest(prompt), execution: "prompt-only", imageRoles: { source: 1 },
  } };
}

export async function preparePanoramaLightingInput(input = {}, dependencies = {}) {
  const assets = await resolvePanoramaLightingInput(input, dependencies);
  return { ...input, panoramaLighting: assets.selection };
}

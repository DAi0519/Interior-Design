/**
 * [INPUT]: 依赖飞书全景专用光影槽规则、共享光影卡片和请求中的规则/卡片版本SHA、用户要求及Node SHA-256
 * [OUTPUT]: 提供规则与卡片身份冻结、用户要求前置及飞书规则占位编译；保留旧v4常量供历史身份核验
 * [POS]: src 的全景光影编译边界，复用光影卡片真源，不读取精模基础/参考规则或第二张图片
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createHash } from "node:crypto";
import { loadRefinedLightingAssets } from "./refined-lighting-library.mjs";
import { composePanoramaLightingRule, getPanoramaLightingRule, normalizePanoramaLightingRule } from "./panorama-lighting-prompt.mjs";

const digest = value => createHash("sha256").update(value).digest("hex");
const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode, retryable: false });
const SELECTION_FIELDS = new Set(["presetId", "version", "sha256"]);

export const PANORAMA_LIGHTING_CONTRACT = [
  "Rebuild the illumination to match the lighting target; replace the input's time of day, light color, direct sunlight, sun patches, and cast-shadow patterns wherever they conflict with that target. Then preserve scene content as follows.",
  "Preserve the input's existing geometry, layout, camera perspective, physical boundaries, and object placement.",
  "Do not add, remove, move, or complete any structure.",
  "When an area is distant, dark, blurred, or ambiguous, preserve its original level of discernible detail and simple appearance, while allowing brightness to follow the lighting target. In dark or blurred glass and reflections, exposure changes must not reveal, reconstruct, or sharpen content that is not already clearly visible in the input.",
  "Do not reinterpret ambiguous areas.",
  "Treat every existing surface as continuous and unchanged unless its boundary is clearly visible in the input.",
  "Preserve intrinsic material color and opacity, not the input's illumination color or color grade; allow the target's light colors and light-and-shadow separation to change apparent surface color and brightness while retaining material identity.",
  "Treat indoor transparent and reflective surfaces as existing interior surfaces.",
  "Preserve their original content and opacity, while allowing brightness and the intensity of already discernible reflections to follow the lighting target. Do not create new reflected objects, luminaires, interior layouts, or spaces behind glass, including when the target is darker outside and brighter indoors.",
  "A bright, translucent, or reflective area is not evidence of additional visible content.",
  "Keep white balance and warm-and-cool variation consistent with the lighting target, while preserving original material color identity.",
  "Preserve readable shadow detail and smooth highlight roll-off.",
  "Keep the tonal range natural and photographic.",
  "More clearly increase tonal separation within existing materials while preserving smooth transitions and the lighting target's overall exposure.",
  "Let already-visible form turning, fabric relief, wood grain, stone variation, and metal response read with greater tactile depth without adding pattern or surface detail.",
  "Enrich the existing color density, tonal layering, and diffuse-to-specular response of materials with an irregular camera-captured character, avoiding clean synthetic sheen while preserving their original color identity and overall balance.",
  "Refine existing luminance layers across already visible materials, with smooth gradual transitions.",
  "Improve gentle color differentiation between existing materials while preserving their original identities.",
  "Refine the smooth transition between existing highlights and shadows, allowing their extent to follow the lighting target.",
  "Build a richer, more immersive sense of the target ambient light through gentle but more legible tonal gradation across visible material forms, with no extra visible content.",
  "Preserve existing subtle natural unevenness in material response and tonal variation.",
  "Favor restrained camera-captured irregularity over uniform polish, idealized clarity, perfectly smooth gradients, or showroom-like surfaces.",
  "Keep local contrast and edge definition restrained, retaining natural irregularity and gentle optical softness in existing fine repetitive textures and distant detail.",
  "Avoid simulated render crispness, pristine edge separation, and overly controlled tonal shaping.",
  "Keep overall color saturation consistent with the lighting target, while preserving original material color identity and balance.",
  "In distant regions that remain bright under the lighting target, retain broad exposure roll-off with slightly reduced color separation, without recovering detail. Let window and exterior brightness follow the target time of day and exposure rather than preserving their input daytime brightness.",
  "Use existing windows, openings, and luminaires; do not invent light fixtures or openings.",
  "Apply the preset lighting target and then the user's refinements; user refinements override the preset lighting preferences while geometry, scene content, and intrinsic material identity remain fixed. The input's illumination, exposure, and shadow patterns are not fixed.",
].join(" ");

export const PANORAMA_LIGHTING_IDENTITY = Object.freeze({
  code: "panorama-lighting-transform", name: "全景光影转换", version: 4,
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

export async function resolvePanoramaLightingInput(input = {}, { loadAssets = loadRefinedLightingAssets, loadRule = getPanoramaLightingRule } = {}) {
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
  const asset = await loadRule({ selection: normalizePanoramaLightingRule(input.panoramaLightingRule), forceRefresh: true });
  const ruleSelection = normalizePanoramaLightingRule({ id: asset.id, version: asset.version, sha256: digest(asset.prompt) });
  const prompt = [
    ...(custom ? [`[USER LIGHTING REFINEMENTS]\n${custom}`] : []),
    composePanoramaLightingRule(asset.prompt, preset?.prompt),
  ].join("\n\n");
  return { selection, ruleSelection, asset, prompt, metadata: {
    mode: preset ? "preset" : "custom",
    contract: { code: asset.code, version: asset.version, sha256: ruleSelection.sha256 },
    ...(preset ? { preset: { id: preset.id, code: preset.code, name: preset.name,
      version: preset.version, sha256: selection.sha256 } } : {}),
    customPromptUsed: Boolean(custom), ...(custom ? { customPromptSha256: digest(custom) } : {}),
    promptSha256: digest(prompt), execution: "prompt-only", imageRoles: { source: 1 },
  } };
}

export async function preparePanoramaLightingInput(input = {}, dependencies = {}) {
  const assets = await resolvePanoramaLightingInput(input, dependencies);
  return { ...input, panoramaLighting: assets.selection,
    ...(assets.ruleSelection ? { panoramaLightingRule: assets.ruleSelection } : {}) };
}

/**
 * [INPUT]: 依赖既有飞书光影库的卡片正文/版本/SHA，以及白模请求中的可选卡片身份
 * [OUTPUT]: 对外提供白模自动/纯词光影规范化、跨功能同步守卫、入队与执行前复核、Agent 输入段及脱敏归档身份
 * [POS]: src 的白模光影边界，仅复用光影卡片，不读取精模规则或卡片原图
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createHash } from "node:crypto";
import { loadRefinedLightingAssets } from "./refined-lighting-library.mjs";

const FIELDS = new Set(["presetId", "version", "sha256"]);
const digest = value => createHash("sha256").update(value).digest("hex");
const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode, retryable: false });
export const WHITE_MODEL_LIGHTING_TARGET_FIELD = "white_model_lighting_target";

export function normalizeWhiteModelLighting(value) {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).some(key => !FIELDS.has(key))
    || typeof value.presetId !== "string" || !/^rec[a-zA-Z0-9]+$/.test(value.presetId)
    || !Number.isSafeInteger(value.version) || value.version < 1
    || typeof value.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(value.sha256)) {
    throw fail("请选择有效的白模光影及版本，请刷新光影库后重选");
  }
  return { presetId: value.presetId, version: value.version, sha256: value.sha256.toLowerCase() };
}

export function assertWhiteModelLightingFeature(input = {}, featureMode = input.featureMode || "whiteModel") {
  if (String(featureMode).trim() !== "whiteModel") {
    if (input.whiteModelLighting != null) throw fail("白模光影仅支持白模渲染");
    return null;
  }
  return normalizeWhiteModelLighting(input.whiteModelLighting);
}

export async function resolveWhiteModelLightingInput(input = {}, { loadAssets = loadRefinedLightingAssets } = {}) {
  const selection = assertWhiteModelLightingFeature(input);
  if (String(input.featureMode || "whiteModel").trim() !== "whiteModel") {
    return { selection: null, prompt: null, metadata: null };
  }
  if (input.refinedLighting != null || input.lightingReferenceImages != null
    && (!Array.isArray(input.lightingReferenceImages) || input.lightingReferenceImages.length)) {
    throw fail("白模光影仅使用光影提示词，请通过白模光影选择卡片");
  }
  if (!selection) return { selection: null, prompt: null, metadata: { mode: "auto", execution: "prompt-only" } };
  const library = await loadAssets({ forceRefresh: true });
  const preset = library?.presets?.find(entry => entry.id === selection.presetId);
  if (!preset || preset.version !== selection.version || typeof preset.prompt !== "string" || !preset.prompt.trim()
    || typeof preset.sha256 !== "string" || preset.sha256.toLowerCase() !== selection.sha256) {
    throw fail("白模光影已更新或下架，请刷新光影库后重选", 409);
  }
  const prompt = [
    `${WHITE_MODEL_LIGHTING_TARGET_FIELD}:`,
    "以下是用户选择的照明目标，只控制时段、天气、主次光源、光向、软硬、色温、白平衡和曝光。",
    "空间、门窗开口、家具及物体位置、机位、透视和构图以白模为唯一事实来源；按既有开口和场景适配照明，不新增门窗、灯具或家具来复刻目标。",
    "材质和配色继续按既有风格任务生成，不把光色当作材质本色；本段照明优先于风格参考图、Style DNA 及默认摄影描述中冲突的灯光设置。用户明确补充的光影要求优先于本预设，空间保护约束始终保留。",
    "将目标整合到既有 visual_application.photography，并使 materials/colors 的表面响应与照明协调；仅按原 JSON Schema 输出，不增加字段，不另做分析或第二次出图。",
    "[LIGHTING PRESET]",
    preset.prompt,
  ].join("\n");
  return { selection, prompt, metadata: {
    mode: "preset", execution: "prompt-only",
    preset: { id: preset.id, code: preset.code, name: preset.name, version: preset.version, sha256: selection.sha256 },
    promptSha256: digest(prompt),
  } };
}

export async function prepareWhiteModelLightingInput(input = {}, dependencies = {}) {
  const { selection } = await resolveWhiteModelLightingInput(input, dependencies);
  return { ...input, whiteModelLighting: selection };
}

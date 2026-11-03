/**
 * [INPUT]: 依赖现有共享光影库的纯卡片读取器、卡片版本SHA和typed光源几何规范
 * [OUTPUT]: 对外提供当前卡片目录、单卡身份/三段词冻结及执行前重验、脱敏身份与完整光源计划
 * [POS]: src 的AI渲染台光影库边界，不读精模或打光Prompt，不向GPT增加卡片参考图或收费阶段
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { loadRefinedLightingAssets } from "./refined-lighting-library.mjs";
import { normalizeRelightSettings } from "../public/image-relight-presets.js";
import { normalizeRelightLights, normalizeRelightOriginalLights } from "../public/image-relight-geometry.js";

export const AI_RENDER_STUDIO_ORIGINAL_LIGHTING_LABEL = "原光影/自定义";
const digest = (value) => createHash("sha256").update(value).digest("hex");
const fail = (message, statusCode = 409) => Object.assign(new Error(message), { statusCode });
const validSha = (value) => typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
const snapshotKeys = ["id", "code", "name", "version", "sha256", "prompt", "promptSha256"];

async function currentPresets({ loadAssets = loadRefinedLightingAssets, forceRefresh = false } = {}) {
  const library = await loadAssets({ forceRefresh });
  if (!Array.isArray(library?.presets)) throw fail("光影氛围库返回格式无效");
  const latest = new Map();
  for (const preset of library.presets) {
    if (!preset || typeof preset.code !== "string" || !Number.isSafeInteger(preset.version) || preset.version < 1) throw fail("光影氛围库卡片身份无效");
    if (!latest.has(preset.code) || latest.get(preset.code).version < preset.version) latest.set(preset.code, preset);
  }
  return { ...library, presets: [...latest.values()].sort((a, b) => a.order - b.order) };
}

function snapshotOf(preset) {
  const snapshot = { id: preset.id, code: preset.code, name: preset.name, version: preset.version,
    sha256: preset.sha256, prompt: preset.prompt, promptSha256: digest(preset.prompt || "") };
  return normalizeAiRenderStudioLightingPresetSnapshot(snapshot);
}

export function normalizeAiRenderStudioLightingPresetSnapshot(value) {
  if (value == null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== snapshotKeys.length
    || snapshotKeys.some((key) => !Object.hasOwn(value, key)) || !/^rec[A-Za-z0-9]+$/.test(value.id || "")
    || !/^[a-z][a-z0-9-]{0,79}$/.test(value.code || "") || typeof value.name !== "string" || !value.name.trim()
    || !Number.isSafeInteger(value.version) || value.version < 1 || !validSha(value.sha256) || !validSha(value.promptSha256)
    || typeof value.prompt !== "string" || !value.prompt.trim() || value.promptSha256 !== digest(value.prompt)) {
    throw fail("光影卡片冻结正文或身份不完整，请刷新光影库");
  }
  return { id: value.id, code: value.code, name: value.name, version: value.version,
    sha256: value.sha256.toLowerCase(), prompt: value.prompt, promptSha256: value.promptSha256.toLowerCase() };
}

export function aiRenderStudioLightingPresetIdentity(value) {
  const snapshot = normalizeAiRenderStudioLightingPresetSnapshot(value);
  if (!snapshot) return null;
  const { prompt, ...identity } = snapshot;
  return identity;
}

export async function readAiRenderStudioLightingConfig(options = {}) {
  try {
    const library = await currentPresets(options);
    return { lightingPresetAvailable: true, lightingPresetReason: null, lightingPresetTableUrl: library.tableUrl,
      lightingPresets: library.presets.map((preset) => {
        const { promptSha256, ...identity } = aiRenderStudioLightingPresetIdentity(snapshotOf(preset));
        return { ...identity, description: preset.description, category: preset.category,
          previewUrl: `/api/refined-lighting/preview?id=${encodeURIComponent(preset.id)}&version=${preset.version}&sha256=${preset.sha256}` };
      }), defaultLightingPreset: null };
  } catch {
    return { lightingPresetAvailable: false, lightingPresetReason: "光影氛围库暂不可用，仍可沿用原光影或手动控光",
      lightingPresets: [], defaultLightingPreset: null };
  }
}

export async function prepareAiRenderStudioLightingPreset(value, options = {}) {
  if (value == null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== 3
    || !["id", "version", "sha256"].every((key) => Object.hasOwn(value, key)) || !/^rec[A-Za-z0-9]+$/.test(value.id || "")
    || !Number.isSafeInteger(value.version) || value.version < 1 || !validSha(value.sha256)) throw fail("请选择有效的光影氛围卡片身份", 400);
  const library = await currentPresets({ ...options, forceRefresh: true });
  const selected = library.presets.find((preset) => preset.id === value.id);
  if (!selected || selected.version !== value.version || selected.sha256.toLowerCase() !== value.sha256.toLowerCase()) {
    throw fail("光影卡片已变更或下架，请刷新光影库后重新选择");
  }
  return snapshotOf(selected);
}

export async function assertAiRenderStudioLightingPresetCurrent(value, options = {}) {
  const frozen = normalizeAiRenderStudioLightingPresetSnapshot(value);
  if (!frozen) return;
  const current = await prepareAiRenderStudioLightingPreset({ id: frozen.id, version: frozen.version, sha256: frozen.sha256 }, options);
  if (!isDeepStrictEqual(current, frozen)) throw fail("光影卡片正文已变更，请刷新光影库后重新提交");
}

export function aiRenderStudioLightingPlan(value) {
  const settings = normalizeRelightSettings(value);
  if (settings.templateKey !== "custom") throw fail("AI渲染台光影只允许现有氛围库或原光影，不能使用旧打光模板");
  const originalLights = normalizeRelightOriginalLights(value.originalLights);
  const lights = normalizeRelightLights(value.lights, { allowEmpty: true });
  const lightingPreset = normalizeAiRenderStudioLightingPresetSnapshot(value.lightingPreset);
  if (!isDeepStrictEqual(originalLights, value.originalLights) || !isDeepStrictEqual(lights, value.lights)
    || value.lightingPreset !== undefined && !isDeepStrictEqual(lightingPreset, value.lightingPreset)) throw fail("AI渲染台光源或卡片身份必须是规范化冻结值");
  return { ...settings, originalLights, lights, lightingPreset };
}

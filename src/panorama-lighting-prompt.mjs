/**
 * [INPUT]: 依赖独立全景Prompt表、版本化读取器与Node SHA-256，接收已冻结的规则ID/版本/SHA
 * [OUTPUT]: 提供飞书全景规则读取/身份冻结、模板占位替换及纯自定义时省略空模板标题；缺失、下架、漂移或非法占位阻断
 * [POS]: 全景模板模式的专用规则资产边界，与默认MAIN及共享氛围卡词隔离
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createHash } from "node:crypto";
import { listRefinedModelPrompts } from "./refined-model-prompt.mjs";
import { PANORAMA_ENHANCEMENT_PROMPT_CONFIG } from "./effect-render-enhancement-prompt.mjs";

export const PANORAMA_LIGHTING_PROMPT_CODE = "panorama-lighting-slot";
export const PANORAMA_LIGHTING_PRESET_SLOT = "{LIGHTING_PRESET_PROMPT}";
const digest = value => createHash("sha256").update(value).digest("hex");
const fail = message => Object.assign(new Error(message), { statusCode: 409, retryable: false });

export function normalizePanoramaLightingRule(value) {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).some(key => !["id", "version", "sha256"].includes(key))
    || !/^rec[A-Za-z0-9]+$/.test(value.id || "") || !Number.isSafeInteger(value.version) || value.version < 1
    || !/^[a-f0-9]{64}$/.test(value.sha256 || "")) throw fail("全景光影规则身份无效，请刷新后重试");
  return { id: value.id, version: value.version, sha256: value.sha256 };
}

export function validatePanoramaLightingRulePrompt(prompt) {
  if (typeof prompt !== "string" || !prompt.trim()
    || prompt.split(PANORAMA_LIGHTING_PRESET_SLOT).length !== 2
    || /zhiganEnhance/i.test(prompt)) throw fail("飞书全景光影规则必须包含一个模板占位符，且不含Flux触发词");
  return prompt.trim();
}

export async function getPanoramaLightingRule({ selection = null, forceRefresh = true, ...options } = {}) {
  const frozen = normalizePanoramaLightingRule(selection);
  const entries = (await listRefinedModelPrompts({ ...options, forceRefresh,
    config: options.config || PANORAMA_ENHANCEMENT_PROMPT_CONFIG, label: "全景光影规则", includeRefinedModules: false }))
    .filter(entry => entry.code === PANORAMA_LIGHTING_PROMPT_CODE && entry.validPrompt && entry.published);
  const versions = entries.map(entry => entry.version);
  if (new Set(versions).size !== versions.length) throw fail("飞书全景光影规则存在重复上架版本");
  const entry = frozen ? entries.find(entry => entry.version === frozen.version)
    : entries.sort((left, right) => right.version - left.version)[0];
  if (!entry) throw fail("飞书全景光影规则缺失或已下架，请刷新规则后重试");
  const prompt = validatePanoramaLightingRulePrompt(entry.prompt), sha256 = digest(prompt);
  if (frozen && (entry.id !== frozen.id || sha256 !== frozen.sha256)) throw fail("全景光影规则已更新，请重新创建批次");
  return { ...entry, prompt, sha256 };
}

export function composePanoramaLightingRule(prompt, presetPrompt) {
  const body = validatePanoramaLightingRulePrompt(prompt), preset = String(presetPrompt || "").trim();
  if (!preset) return body.replace(`[LIGHTING PRESET]\n${PANORAMA_LIGHTING_PRESET_SLOT}`, "")
    .replace(PANORAMA_LIGHTING_PRESET_SLOT, "").trim();
  return body.replace(PANORAMA_LIGHTING_PRESET_SLOT, () => preset);
}

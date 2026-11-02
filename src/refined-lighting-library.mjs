/**
 * [INPUT]: 依赖飞书光影卡片、独立精模 Prompt 读取器、lark-cli 附件读取、缓存与轻量预览
 * [OUTPUT]: 对外提供无控制规则的卡片读取、三模式精模组合目录、原件SHA复核及同源预览
 * [POS]: src 的共享光影卡片边界，白模/全景/光影转换不依赖精模 Prompt，精模另用组合读取器
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { runLarkCli } from "./lark-cli.mjs";
import { createAsyncTtlCache } from "./runtime-cache.mjs";
import { normalizeReferenceImage, REFERENCE_IMAGE_POLICY } from "./reference-image.mjs";
import { createImagePreviewDataUrl, decodeImageDataUrl } from "./image-artifact.mjs";
import { loadRefinedLightingPromptAssets, REFINED_MODEL_PROMPT_CONFIG,
  REFINED_LIGHTING_BASE_PROMPT_CODE, REFINED_LIGHTING_REFERENCE_RULE_CODE,
  REFINED_LIGHTING_HYBRID_RULE_CODE } from "./refined-model-prompt.mjs";

export { REFINED_LIGHTING_REFERENCE_RULE_CODE, REFINED_LIGHTING_HYBRID_RULE_CODE };

export const REFINED_LIGHTING_LIBRARY_CONFIG = Object.freeze({
  baseToken: process.env.LARK_REFINED_LIGHTING_BASE_TOKEN || "SALobKnnra17iSsGT2ccC52PnHd",
  tableId: process.env.LARK_REFINED_LIGHTING_TABLE_ID || "tblhzZwxBUkiQAgG",
  cliPath: process.env.LARK_CLI_PATH || "lark-cli",
});
const FIELDS = ["名称", "编码", "类型", "分类", "说明", "氛围参考图", "光影提示词", "版本", "上架状态", "排序"];
const MIME_TYPES = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };
const assetCache = createAsyncTtlCache();
const imageCache = createAsyncTtlCache({ maxEntries: 8 });
const previewCache = createAsyncTtlCache({ maxEntries: 32 });
const digest = (value) => createHash("sha256").update(value).digest("hex");
const selected = (value) => Array.isArray(value) ? value[0] : value;
const fail = (message, statusCode = 409) => Object.assign(new Error(message), { statusCode, retryable: false });
const tableUrl = (config) => config.tableUrl || `https://lq9n5lvfn2i.feishu.cn/base/${encodeURIComponent(config.baseToken)}?table=${encodeURIComponent(config.tableId)}`;

export function parseRefinedLightingLibrary(body) {
  const data = body?.data;
  if (body?.ok !== true || !Array.isArray(data?.fields) || !Array.isArray(data?.data)
    || !Array.isArray(data?.record_id_list) || data.data.length !== data.record_id_list.length) {
    throw fail("飞书光影氛围库返回格式不正确");
  }
  if (FIELDS.some((field) => !data.fields.includes(field))) throw fail("飞书光影氛围库字段不完整");
  return data.data.flatMap((row, index) => {
    const at = (name) => row[data.fields.indexOf(name)];
    if (selected(at("上架状态")) !== "上架") return [];
    const kind = selected(at("类型"));
    if (kind !== "光影预设") return [];
    const entry = {
      id: data.record_id_list[index], code: String(at("编码") || "").trim(),
      name: String(at("名称") || "").trim(), description: String(at("说明") || "").trim(),
      category: String(selected(at("分类")) || "").trim(),
      prompt: String(at("光影提示词") || "").trim(), version: Number(at("版本")),
      order: Number(at("排序")) || 0, kind,
    };
    if (!/^rec[a-zA-Z0-9]+$/.test(entry.id || "") || !/^[a-z][a-z0-9-]{0,79}$/.test(entry.code)
      || !entry.name || !entry.prompt || !Number.isSafeInteger(entry.version) || entry.version < 1) {
      throw fail(`光影库已上架记录不完整：${entry.name || entry.id}`);
    }
    const files = at("氛围参考图");
    const file = files?.[0];
    const mimeType = MIME_TYPES[extname(file?.name || "").toLowerCase()];
    if (!Array.isArray(files) || files.length !== 1 || !file?.file_token || !mimeType
      || !(Number(file.size) > 0) || Number(file.size) > REFERENCE_IMAGE_POLICY.maxBytesPerImage) {
      throw fail(`光影预设“${entry.name}”需要一张不超过 8MB 的 PNG、JPEG 或 WebP 参考图`);
    }
    entry.attachment = { fileToken: file.file_token, name: file.name, mimeType, size: Number(file.size) };
    entry.sha256 = digest(JSON.stringify({ code: entry.code, name: entry.name, version: entry.version,
      prompt: entry.prompt, attachment: entry.attachment || null }));
    return [entry];
  });
}

export async function loadRefinedLightingAssets({
  config = REFINED_LIGHTING_LIBRARY_CONFIG, forceRefresh = false, run = runLarkCli,
} = {}) {
  const load = async () => {
    const entries = [];
    for (let offset = 0; ; offset += 200) {
      const body = await run(config, ["base", "+record-list", "--as", "user", "--base-token", config.baseToken,
        "--table-id", config.tableId, ...FIELDS.flatMap((field) => ["--field-id", field]),
        "--filter-json", JSON.stringify({ logic: "and", conditions: [["上架状态", "intersects", ["上架"]], ["类型", "intersects", ["光影预设"]]] }),
        "--offset", String(offset), "--limit", "200", "--format", "json"]);
      entries.push(...parseRefinedLightingLibrary(body));
      if (!body.data.has_more) break;
      if (body.data.data.length !== 200) throw fail("光影库分页返回不完整，请刷新配置");
    }
    const versions = new Set();
    for (const entry of entries) {
      const key = `${entry.code}@${entry.version}`;
      if (versions.has(key)) throw fail(`光影库存在重复上架版本：${key}`);
      versions.add(key);
    }
    return { presets: entries
      .sort((a, b) => a.order - b.order || b.version - a.version || a.name.localeCompare(b.name)), tableUrl: tableUrl(config) };
  };
  return run === runLarkCli ? assetCache.get(`${config.baseToken}:${config.tableId}`, load, { force: forceRefresh }) : load();
}

export async function loadRefinedRenderAssets({
  loadPrompts = loadRefinedLightingPromptAssets, promptOptions = {}, ...libraryOptions
} = {}) {
  const [library, prompts] = await Promise.allSettled([
    loadRefinedLightingAssets(libraryOptions),
    Promise.resolve().then(() => loadPrompts({ ...promptOptions,
      ...(libraryOptions.forceRefresh !== undefined ? { forceRefresh: libraryOptions.forceRefresh } : {}) })),
  ]);
  if (library.status === "rejected") throw library.reason;
  if (prompts.status === "fulfilled") return { ...library.value, ...prompts.value };
  return { ...library.value, purePrompt: null, referenceRule: null, hybridRule: null,
    promptTableUrl: tableUrl(promptOptions.config || REFINED_MODEL_PROMPT_CONFIG),
    promptReason: prompts.reason?.message || "精模 Prompt 表不可用" };
}

export async function publicRefinedLightingLibrary(options = {}) {
  try {
    const assets = await loadRefinedRenderAssets(options);
    const latest = new Map();
    for (const entry of assets.presets) {
      if (!latest.has(entry.code) || latest.get(entry.code).version < entry.version) latest.set(entry.code, entry);
    }
    const promptAvailable = assets.purePrompt?.code === REFINED_LIGHTING_BASE_PROMPT_CODE;
    const referenceAvailable = assets.referenceRule?.code === REFINED_LIGHTING_REFERENCE_RULE_CODE;
    const hybridAvailable = assets.hybridRule?.code === REFINED_LIGHTING_HYBRID_RULE_CODE;
    return {
      available: promptAvailable || referenceAvailable || hybridAvailable, promptAvailable, referenceAvailable, hybridAvailable,
      presetExecutions: [...(promptAvailable ? ["prompt-only"] : []), ...(referenceAvailable ? ["prompt-and-reference"] : []),
        ...(hybridAvailable ? ["prompt-with-reference"] : [])],
      multiplePresetExecutions: true,
      multiplePresetSelections: true,
      ruleVersion: null, ruleSha256: null,
      referenceRuleVersion: assets.referenceRule?.version || null, referenceRuleSha256: assets.referenceRule?.sha256 || null,
      hybridRuleVersion: assets.hybridRule?.version || null, hybridRuleSha256: assets.hybridRule?.sha256 || null,
      reason: assets.promptReason || (promptAvailable || referenceAvailable || hybridAvailable ? null : "请在飞书精模渲染 Prompt 表上架对应模式的完整提示词。"),
      tableUrl: assets.tableUrl,
      promptTableUrl: assets.promptTableUrl,
      presets: [...latest.values()].sort((a, b) => a.order - b.order).map(({ id, code, name, description, category, version, sha256 }) => ({
        id, code, name, description, category, version, sha256,
        previewUrl: `/api/refined-lighting/preview?id=${encodeURIComponent(id)}&version=${version}&sha256=${sha256}`,
      })),
    };
  } catch (error) {
    return { available: false, promptAvailable: false, referenceAvailable: false, hybridAvailable: false,
      ruleVersion: null, ruleSha256: null, presetExecutions: [], reason: error.message, presets: [],
      tableUrl: tableUrl(options.config || REFINED_LIGHTING_LIBRARY_CONFIG),
      promptTableUrl: tableUrl(options.promptOptions?.config || REFINED_MODEL_PROMPT_CONFIG) };
  }
}

export async function loadRefinedLightingReference(preset, {
  config = REFINED_LIGHTING_LIBRARY_CONFIG, run = runLarkCli, forceRefresh = false,
} = {}) {
  if (!preset?.attachment?.fileToken) throw fail("所选光影卡片缺少参考图");
  const load = async () => {
    const directory = await mkdtemp(join(tmpdir(), "canvas-lab-lighting-"));
    const file = `reference${extname(preset.attachment.name).toLowerCase()}`;
    try {
      await run(config, ["base", "+record-download-attachment", "--as", "user", "--base-token", config.baseToken,
        "--table-id", config.tableId, "--record-id", preset.id, "--file-token", preset.attachment.fileToken,
        "--output", file, "--overwrite", "--format", "json"], { cwd: directory });
      if ((await stat(join(directory, file))).size > REFERENCE_IMAGE_POLICY.maxBytesPerImage) throw fail("光影参考图超过 8MB");
      const bytes = await readFile(join(directory, file));
      const normalized = normalizeReferenceImage({ name: preset.attachment.name, size: preset.attachment.size,
        type: preset.attachment.mimeType, dataUrl: `data:${preset.attachment.mimeType};base64,${bytes.toString("base64")}` });
      return { dataUrl: normalized.imageUrl, fileName: normalized.fileName, name: normalized.fileName,
        type: normalized.mimeType, mimeType: normalized.mimeType, size: normalized.size,
        width: normalized.width, height: normalized.height };
    } finally { await rm(directory, { recursive: true, force: true }); }
  };
  return run === runLarkCli ? imageCache.get(`${config.baseToken}:${config.tableId}:${preset.id}:${preset.sha256}`, load,
    { force: forceRefresh }) : load();
}

export async function readRefinedLightingPreview({ id, version, sha256 }, options = {}) {
  const assets = await loadRefinedLightingAssets(options);
  const preset = assets.presets.find((entry) => entry.id === id && entry.version === Number(version) && entry.sha256 === sha256);
  if (!preset) throw fail("光影卡片已变更或下架，请刷新光影库", 404);
  const load = async () => {
    const reference = await loadRefinedLightingReference(preset, options);
    const dataUrl = await createImagePreviewDataUrl(decodeImageDataUrl(reference.dataUrl), { maxDimension: 640, quality: 82 });
    return { bytes: decodeImageDataUrl(dataUrl), mimeType: "image/webp" };
  };
  return options.run ? load() : previewCache.get(`${id}:${sha256}`, load);
}

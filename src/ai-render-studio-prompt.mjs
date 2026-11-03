/**
 * [INPUT]: 依赖 refined-model-prompt 的同构只读记录与独立AI渲染台Prompt表、缓存和版本元数据
 * [OUTPUT]: 对外提供含四渲染风格与保原材质的JSON资产严格解析、唯一飞书版本/SHA读取及脱敏目录
 * [POS]: src 的独立 AI 渲染台 Prompt 边界，与旧精模正文、光影卡和打光资产隔离
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createHash } from "node:crypto";
import { listRefinedModelPrompts } from "./refined-model-prompt.mjs";

export const AI_RENDER_STUDIO_PROMPT_CODE = "ai-render-studio";
export const AI_RENDER_STUDIO_PROMPT_CONFIG = Object.freeze({
  baseToken: process.env.LARK_AI_RENDER_STUDIO_PROMPT_BASE_TOKEN || "SALobKnnra17iSsGT2ccC52PnHd",
  tableId: process.env.LARK_AI_RENDER_STUDIO_PROMPT_TABLE_ID || "tbl9Djf4iVWzRxf5",
  viewId: "vewJGtaGq3",
  cliPath: process.env.LARK_CLI_PATH || "lark-cli",
});

const MATERIAL_MODES = ["faithful"];
const RENDER_STYLES = ["photoreal", "soft", "cinematic", "film"];
const ROOT_KEYS = ["schemaVersion", "renderBoundary", "lightingBoundary", "materialModes", "renderStyles", "output"];
const digest = (value) => createHash("sha256").update(value).digest("hex");
const fail = (message, statusCode = 409) => Object.assign(new Error(message), { statusCode, studioPromptSafe: true });

function exactObject(value, keys, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) {
    throw fail(`AI 渲染台 Prompt JSON 字段不完整或包含未知字段：${path}`);
  }
}

function requiredText(value, path) {
  if (typeof value !== "string" || !value.trim()) throw fail(`AI 渲染台 Prompt JSON 需要非空文本：${path}`);
  if (/\{\{|\}\}|\$\{/.test(value)) throw fail(`AI 渲染台 Prompt JSON 不允许未处理的占位符：${path}`);
}

export function parseAiRenderStudioPrompt(source) {
  let bundle;
  try {
    if (typeof source !== "string") throw new TypeError();
    bundle = JSON.parse(source);
  } catch { throw fail("AI 渲染台 Prompt JSON 语法错误"); }
  exactObject(bundle, ROOT_KEYS, "root");
  if (bundle.schemaVersion !== 1) throw fail("AI 渲染台 Prompt JSON schemaVersion 必须为1");
  for (const key of ["renderBoundary", "lightingBoundary", "output"]) requiredText(bundle[key], key);
  exactObject(bundle.materialModes, MATERIAL_MODES, "materialModes");
  for (const key of MATERIAL_MODES) requiredText(bundle.materialModes[key], `materialModes.${key}`);
  exactObject(bundle.renderStyles, RENDER_STYLES, "renderStyles");
  for (const key of RENDER_STYLES) requiredText(bundle.renderStyles[key], `renderStyles.${key}`);
  return bundle;
}

function tableUrl(config) {
  return config.tableUrl || `https://lq9n5lvfn2i.feishu.cn/base/${encodeURIComponent(config.baseToken)}?table=${encodeURIComponent(config.tableId)}`;
}

function normalizedVersion(version) {
  if (version == null) return null;
  if (!["number", "string"].includes(typeof version) || !Number.isSafeInteger(Number(version)) || Number(version) < 1) {
    throw fail("AI 渲染台 Prompt 版本必须为正整数", 400);
  }
  return Number(version);
}

function normalizedSha256(expectedSha256) {
  if (expectedSha256 == null) return null;
  if (typeof expectedSha256 !== "string" || !/^[a-f0-9]{64}$/i.test(expectedSha256)) {
    throw fail("AI 渲染台 Prompt SHA-256 必须为64位十六进制文本", 400);
  }
  return expectedSha256.toLowerCase();
}

function selectRecords(records, requestedVersion) {
  const matching = records.filter((entry) => entry.code === AI_RENDER_STUDIO_PROMPT_CODE);
  if (!matching.length) throw fail("飞书AI渲染台独立Prompt表缺少 ai-render-studio 配置");
  const seen = new Set();
  for (const entry of matching) {
    if (Number.isSafeInteger(entry.version) && entry.version > 0) {
      if (seen.has(entry.version)) throw fail("AI 渲染台 Prompt 同一编码存在重复版本");
      seen.add(entry.version);
    }
    if (entry.published) {
      if (!entry.validPrompt || !Number.isSafeInteger(entry.version) || entry.version < 1) {
        throw fail("AI 渲染台已上架 Prompt 的名称、版本或正文不完整");
      }
      parseAiRenderStudioPrompt(entry.prompt);
    }
  }
  const published = matching.filter((entry) => entry.published).sort((left, right) => right.version - left.version);
  const record = requestedVersion == null ? published[0] : matching.find((entry) => entry.version === requestedVersion);
  if (!record || !record.validPrompt) throw fail("指定的 AI 渲染台 Prompt 版本不存在或正文不完整");
  if (!record.published) throw fail("指定的 AI 渲染台 Prompt 版本尚未上架");
  return { record, published };
}

function sourceOptions(options) {
  return { config: options.config || AI_RENDER_STUDIO_PROMPT_CONFIG,
    forceRefresh: Boolean(options.forceRefresh), run: options.run, label: "AI 渲染台", includeRefinedModules: false };
}

function safeError(error) {
  return error?.studioPromptSafe ? error : fail("飞书 AI 渲染台 Prompt 读取失败，请检查独立表权限与连接");
}

function assetFrom(record, config) {
  const prompt = record.prompt.trim();
  return { code: AI_RENDER_STUDIO_PROMPT_CODE, name: record.name, version: record.version, published: true,
    prompt, bundle: parseAiRenderStudioPrompt(prompt), sha256: digest(prompt),
    source: `feishu:${config.tableId}:${AI_RENDER_STUDIO_PROMPT_CODE}@v${record.version}`, tableUrl: tableUrl(config) };
}

export async function getAiRenderStudioPrompt({ version = null, expectedSha256 = null, ...options } = {}) {
  try {
    const requestedVersion = normalizedVersion(version);
    const expected = normalizedSha256(expectedSha256);
    const reading = sourceOptions(options);
    const records = await listRefinedModelPrompts(reading);
    const { record } = selectRecords(records, requestedVersion);
    const asset = assetFrom(record, reading.config);
    if (expected !== null && asset.sha256 !== expected) throw fail("AI 渲染台 Prompt 正文已变更，请刷新配置后重新提交");
    return asset;
  } catch (error) { throw safeError(error); }
}

export async function publicAiRenderStudioPromptConfig(options = {}) {
  const reading = sourceOptions(options);
  try {
    const records = await listRefinedModelPrompts(reading);
    const { record, published } = selectRecords(records, null);
    const { prompt, bundle, ...identity } = assetFrom(record, reading.config);
    return { ...identity, available: true, reason: null, defaultVersion: record.version,
      versions: published.map(({ code, name, version }) => ({ code, name, version, published: true })) };
  } catch (error) {
    return { available: false, reason: safeError(error).message, code: AI_RENDER_STUDIO_PROMPT_CODE,
      name: "AI 渲染台 Prompt", version: null, defaultVersion: null, published: false,
      sha256: null, source: null, tableUrl: tableUrl(reading.config), versions: [] };
  }
}

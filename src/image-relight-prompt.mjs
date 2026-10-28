/**
 * [INPUT]: 依赖同构飞书打光独立表、refined-model-prompt 的版本读取/缓存和共享模板目录
 * [OUTPUT]: 对外提供完整JSON资产校验、已上架版本/正文SHA冻结读取与不含正文的公开配置
 * [POS]: src 的打光Prompt唯一运营资产边界，不读本地快照、不跨表回退、不调用模型或写Base
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createHash } from "node:crypto";
import { getRefinedModelPrompt, listRefinedModelPrompts } from "./refined-model-prompt.mjs";
import { RELIGHT_TEMPLATES, RELIGHT_LEGACY_TEMPLATES } from "../public/image-relight-presets.js";

export const DEFAULT_IMAGE_RELIGHT_PROMPT_CODE = "image-relight";
export const IMAGE_RELIGHT_PROMPT_CONFIG = Object.freeze({
  baseToken: process.env.LARK_IMAGE_RELIGHT_PROMPT_BASE_TOKEN || "SALobKnnra17iSsGT2ccC52PnHd",
  tableId: process.env.LARK_IMAGE_RELIGHT_PROMPT_TABLE_ID || "tblDCXNib9XeWuza",
  viewId: process.env.LARK_IMAGE_RELIGHT_PROMPT_VIEW_ID || "vews5JwdmF",
  cliPath: process.env.LARK_CLI_PATH || "lark-cli",
});
const digest = value => createHash("sha256").update(value).digest("hex");
const error = (message, statusCode = 409) => Object.assign(new Error(message), { statusCode, relightPromptSafe: true });
const MODES = ["REBUILD", "LOCAL"];
const STRENGTHS = ["subtle", "balanced", "pronounced"];
const INPUTS = ["PLAIN", "GUIDED"];

function object(value, keys, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) {
    throw error("打光 Prompt JSON 字段不完整或包含未知字段：" + path);
  }
}
function text(value, path) {
  if (typeof value !== "string" || !value.trim()) throw error("打光 Prompt JSON 需要非空文本：" + path);
  if (/\{\{|\}\}|\$\{/.test(value)) throw error("打光 Prompt JSON 不允许未处理的占位符：" + path);
}
function textMap(value, keys, path) {
  object(value, keys, path);
  for (const key of keys) text(value[key], path + "." + key);
}

export function parseImageRelightPrompt(source) {
  let bundle;
  try { bundle = JSON.parse(String(source || "")); }
  catch { throw error("打光 Prompt JSON 语法错误"); }
  object(bundle, ["SCHEMA_VERSION", "TEMPLATES", "STRENGTH", "SCENE", "PHOTOGRAPHY", "ADAPTER"], "root");
  if (bundle.SCHEMA_VERSION !== 1) throw error("打光 Prompt JSON SCHEMA_VERSION 必须为1");
  textMap(bundle.TEMPLATES, [...RELIGHT_TEMPLATES, ...RELIGHT_LEGACY_TEMPLATES].map(entry => entry.key), "TEMPLATES");
  object(bundle.STRENGTH, MODES, "STRENGTH");
  for (const mode of MODES) textMap(bundle.STRENGTH[mode], STRENGTHS, "STRENGTH." + mode);
  object(bundle.SCENE, MODES, "SCENE");
  textMap(bundle.SCENE.REBUILD, ["RESET", "PRESERVE", "HARDWARE", "MANUAL"], "SCENE.REBUILD");
  textMap(bundle.SCENE.LOCAL, ["BASELINE", "HARDWARE", "RECONCILE"], "SCENE.LOCAL");
  object(bundle.PHOTOGRAPHY, ["SCOPE", "LIGHTING_QUALITY", "MATERIAL_TONAL", "CAMERA_OPTICS", "WHITE_BALANCE", "CAMERA_PROFILE"], "PHOTOGRAPHY");
  for (const key of ["SCOPE", "WHITE_BALANCE"]) textMap(bundle.PHOTOGRAPHY[key], MODES, "PHOTOGRAPHY." + key);
  for (const key of ["LIGHTING_QUALITY", "MATERIAL_TONAL", "CAMERA_OPTICS", "CAMERA_PROFILE"]) text(bundle.PHOTOGRAPHY[key], "PHOTOGRAPHY." + key);
  object(bundle.ADAPTER, ["INTRO", "INPUT", "REBUILD_GUIDE", "GUIDE_LEGEND", "SCENE_CONSTRAINT", "OUTPUT"], "ADAPTER");
  for (const key of ["INTRO", "SCENE_CONSTRAINT"]) textMap(bundle.ADAPTER[key], MODES, "ADAPTER." + key);
  for (const key of ["INPUT", "OUTPUT"]) textMap(bundle.ADAPTER[key], INPUTS, "ADAPTER." + key);
  for (const key of ["REBUILD_GUIDE", "GUIDE_LEGEND"]) text(bundle.ADAPTER[key], "ADAPTER." + key);
  return bundle;
}

function tableUrl(config) {
  if (config.tableUrl) return config.tableUrl;
  return "https://lq9n5lvfn2i.feishu.cn/base/" + encodeURIComponent(config.baseToken)
    + "?table=" + encodeURIComponent(config.tableId)
    + (config.viewId ? "&view=" + encodeURIComponent(config.viewId) : "");
}
function selectRecord(records, version) {
  const matching = records.filter(entry => entry.code === DEFAULT_IMAGE_RELIGHT_PROMPT_CODE);
  if (!matching.length) throw error("飞书打光 Prompt 表缺少 image-relight 配置");
  const seen = new Set();
  for (const entry of matching) {
    if (Number.isInteger(entry.version) && entry.version > 0) {
      if (seen.has(entry.version)) throw error("飞书打光 Prompt 同一编码存在重复版本");
      seen.add(entry.version);
    }
  }
  const requested = version == null ? null : Number(version);
  if (requested != null && (!Number.isInteger(requested) || requested < 1)) throw error("打光 Prompt 版本必须为正整数", 400);
  const published = matching.filter(entry => entry.published);
  if (published.some(entry => !Number.isInteger(entry.version) || entry.version < 1)) throw error("飞书打光 Prompt 已上架记录的版本无效");
  const record = requested == null ? published.sort((a, b) => b.version - a.version)[0]
    : matching.find(entry => entry.version === requested);
  if (!record || !record.validPrompt) throw error("指定的打光 Prompt 版本不存在或正文不完整");
  if (!record.published) throw error("指定的打光 Prompt 版本尚未上架");
  return { record, matching };
}
function optionsFor(options) {
  return { config: options.config || IMAGE_RELIGHT_PROMPT_CONFIG, forceRefresh: Boolean(options.forceRefresh), run: options.run, label: "打光" };
}
function safeError(caught) {
  return caught?.relightPromptSafe ? caught : error("飞书打光 Prompt 读取失败，请检查独立表权限与连接");
}

export async function getImageRelightPrompt({ version = null, expectedSha256 = null, ...options } = {}) {
  try {
    const sourceOptions = optionsFor(options);
    const records = await listRefinedModelPrompts(sourceOptions);
    const { record } = selectRecord(records, version);
    const asset = await getRefinedModelPrompt(DEFAULT_IMAGE_RELIGHT_PROMPT_CODE, {
      ...sourceOptions, forceRefresh: false, version: record.version,
    });
    const prompt = asset.prompt.trim(), bundle = parseImageRelightPrompt(prompt), sha256 = digest(prompt);
    if (expectedSha256 != null) {
      if (typeof expectedSha256 !== "string" || !/^[a-fA-F0-9]{64}$/.test(expectedSha256)) throw error("打光 Prompt SHA-256 必须为64位十六进制文本", 400);
      if (expectedSha256.toLowerCase() !== sha256) throw error("打光 Prompt 正文已变更，请刷新配置后重新提交");
    }
    return { code: asset.code, name: asset.name, version: asset.version, published: true,
      prompt, bundle, sha256, source: "feishu:" + sourceOptions.config.tableId + ":image-relight@v" + asset.version,
      tableUrl: tableUrl(sourceOptions.config) };
  } catch (caught) { throw safeError(caught); }
}

export async function publicImageRelightPromptConfig(options = {}) {
  const sourceOptions = optionsFor(options);
  try {
    const records = await listRefinedModelPrompts(sourceOptions);
    const { record, matching } = selectRecord(records, null);
    const prompt = record.prompt.trim();
    parseImageRelightPrompt(prompt);
    return { available: true, reason: null, code: record.code, name: record.name,
      version: record.version, defaultVersion: record.version, published: true, sha256: digest(prompt),
      source: "feishu:" + sourceOptions.config.tableId + ":image-relight@v" + record.version,
      tableUrl: tableUrl(sourceOptions.config),
      versions: matching.filter(entry => entry.published).sort((a, b) => b.version - a.version)
        .map(({ code, name, version, published }) => ({ code, name, version, published })) };
  } catch (caught) {
    return { available: false, reason: safeError(caught).message, code: DEFAULT_IMAGE_RELIGHT_PROMPT_CODE,
      name: "打光 Prompt", version: null, defaultVersion: null, published: false, sha256: null,
      source: null, tableUrl: tableUrl(sourceOptions.config), versions: [] };
  }
}

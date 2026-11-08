/**
 * [INPUT]: 依赖 refined-model-prompt 的同构只读记录、独立平面图机位空间推理 Agent 表与版本缓存
 * [OUTPUT]: 对外提供Agent完整纯文本资产校验、最低v2的JSON输出合同版本门槛、上架版本/SHA冻结读取与脱敏目录
 * [POS]: src 的平面图机位空间推理资产边界，不回退旧直接生图编码、设计实验室或其他渲染正文
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createHash } from "node:crypto";
import { listRefinedModelPrompts } from "./refined-model-prompt.mjs";

export const FLOOR_PLAN_CAMERA_PROMPT_CODE = "floor-plan-camera-agent";
export const FLOOR_PLAN_CAMERA_PROMPT_MIN_VERSION = 2;
export const FLOOR_PLAN_CAMERA_PROMPT_CONFIG = Object.freeze({
  baseToken: process.env.LARK_FLOOR_PLAN_CAMERA_PROMPT_BASE_TOKEN || "SALobKnnra17iSsGT2ccC52PnHd",
  tableId: process.env.LARK_FLOOR_PLAN_CAMERA_PROMPT_TABLE_ID || "tblfaU86CV0kY0L1",
  viewId: "vewSsQvPam",
  cliPath: process.env.LARK_CLI_PATH || "lark-cli",
});

const fail = (message, statusCode = 409) => Object.assign(new Error(message), { statusCode, floorPlanSafe: true });
const hash = (text) => createHash("sha256").update(text).digest("hex");
const tableUrl = (config) => config.tableUrl || `https://lq9n5lvfn2i.feishu.cn/base/${encodeURIComponent(config.baseToken)}?table=${encodeURIComponent(config.tableId)}`;

// --- 只校验完整正文合同，不在代码中提供运营词或跨表兜底 ---
export function parseFloorPlanCameraPrompt(source) {
  if (typeof source !== "string" || !source.trim() || source.trim().length > 16000) {
    throw fail("平面图机位空间推理 Agent 正文必须为1–16000字符的完整文本");
  }
  if (/\{\{|\}\}|\$\{/.test(source)) throw fail("平面图机位空间推理 Agent 含未处理占位符");
  return source.trim();
}

function normalizeVersion(value) {
  if (value == null) return null;
  if (!["string", "number"].includes(typeof value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) {
    throw fail("平面图机位空间推理 Agent 版本必须为正整数", 400);
  }
  if (Number(value) < FLOOR_PLAN_CAMERA_PROMPT_MIN_VERSION) throw fail("空间推理 Agent 需升级至v2或以上，请刷新配置");
  return Number(value);
}

function normalizeHash(value) {
  if (value == null) return null;
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/i.test(value)) {
    throw fail("平面图机位空间推理 Agent SHA-256必须为64位十六进制文本", 400);
  }
  return value.toLowerCase();
}

function select(records, version) {
  const matching = records.filter((entry) => entry.code === FLOOR_PLAN_CAMERA_PROMPT_CODE);
  if (!matching.length) throw fail("飞书独立表缺少平面图机位空间推理 Agent");
  const seen = new Set();
  for (const entry of matching) {
    if (Number.isSafeInteger(entry.version) && entry.version > 0) {
      if (seen.has(entry.version)) throw fail("平面图机位空间推理 Agent 存在重复版本");
      seen.add(entry.version);
    }
    if (entry.published) {
      if (!entry.validPrompt || !Number.isSafeInteger(entry.version) || entry.version < 1) {
        throw fail("平面图机位渲染已上架 Prompt 的名称、版本或正文不完整");
      }
      parseFloorPlanCameraPrompt(entry.prompt);
    }
  }
  const published = matching.filter((entry) => entry.published && entry.version >= FLOOR_PLAN_CAMERA_PROMPT_MIN_VERSION).sort((a, b) => b.version - a.version);
  const record = version === null ? published[0] : matching.find((entry) => entry.version === version);
  if (!record?.validPrompt || !record.published || record.version < FLOOR_PLAN_CAMERA_PROMPT_MIN_VERSION) throw fail("所选平面图机位空间推理 Agent 不存在、未上架或未升级至v2");
  return { record, published };
}

function sourceOptions(options) {
  return { config: options.config || FLOOR_PLAN_CAMERA_PROMPT_CONFIG,
    run: options.run, forceRefresh: Boolean(options.forceRefresh),
    label: "平面图机位渲染", includeRefinedModules: false };
}

function safeError(error) {
  return error?.floorPlanSafe ? error : fail("飞书平面图机位空间推理 Agent 读取失败，请检查独立表权限与连接");
}

function assetFrom(record, config) {
  const prompt = parseFloorPlanCameraPrompt(record.prompt);
  return { code: FLOOR_PLAN_CAMERA_PROMPT_CODE, name: record.name, version: record.version,
    published: true, prompt, sha256: hash(prompt),
    source: `feishu:${config.tableId}:${FLOOR_PLAN_CAMERA_PROMPT_CODE}@v${record.version}`, tableUrl: tableUrl(config) };
}

export async function getFloorPlanCameraPrompt({ version = null, expectedSha256 = null, ...options } = {}) {
  try {
    const requestedVersion = normalizeVersion(version), expected = normalizeHash(expectedSha256);
    const reading = sourceOptions(options);
    const { record } = select(await listRefinedModelPrompts(reading), requestedVersion);
    const asset = assetFrom(record, reading.config);
    if (expected !== null && asset.sha256 !== expected) throw fail("平面图机位空间推理 Agent 正文已变更，请刷新配置后重新提交");
    return asset;
  } catch (error) { throw safeError(error); }
}

export async function publicFloorPlanCameraPromptConfig(options = {}) {
  const reading = sourceOptions(options);
  try {
    const { record, published } = select(await listRefinedModelPrompts(reading), null);
    const { prompt, ...identity } = assetFrom(record, reading.config);
    return { ...identity, available: true, reason: null, defaultVersion: record.version,
      versions: published.map(({ code, name, version }) => ({ code, name, version, published: true })) };
  } catch (error) {
    return { available: false, reason: safeError(error).message, code: FLOOR_PLAN_CAMERA_PROMPT_CODE,
      name: "平面图机位空间推理 Agent", version: null, defaultVersion: null, published: false,
      sha256: null, source: null, tableUrl: tableUrl(reading.config), versions: [] };
  }
}

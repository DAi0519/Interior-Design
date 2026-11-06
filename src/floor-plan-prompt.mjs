/**
 * [INPUT]: 依赖 prompt-agent 的只读飞书 Agent 表协议与独立平面布局 Prompt 表，接收资产刷新及冻结身份
 * [OUTPUT]: 对外提供 floor-plan-layout 图像工作流JSON资产、唯一上架版本/SHA与脱敏目录，缺失、漂移、下架时阻断且没有本地正文回退
 * [POS]: src 的平面布局 Prompt 真源边界，与空房、旧房及渲染 Prompt 完全隔离
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createHash } from "node:crypto";
import { getPublishedPromptAgent, listPublishedPromptAgentVersions } from "./prompt-agent.mjs";

export const FLOOR_PLAN_PROMPT_CODE = "floor-plan-layout";
export const FLOOR_PLAN_PROMPT_CONFIG = Object.freeze({
  baseToken: process.env.LARK_FLOOR_PLAN_PROMPT_BASE_TOKEN || "SALobKnnra17iSsGT2ccC52PnHd",
  tableId: process.env.LARK_FLOOR_PLAN_PROMPT_TABLE_ID || "tblsJnSq7Qg9f4Nb",
  cliPath: process.env.LARK_CLI_PATH || "lark-cli",
  displayNameField: "Agent 名称",
});

const fail = (message, statusCode = 409) => Object.assign(new Error(message), { statusCode, floorPlanSafe: true });
const hash = (value) => createHash("sha256").update(value).digest("hex");
const tableUrl = (config) => `https://lq9n5lvfn2i.feishu.cn/base/${encodeURIComponent(config.baseToken)}?table=${encodeURIComponent(config.tableId)}`;
const safeError = (error) => error?.floorPlanSafe ? error : fail("飞书平面布局 Prompt 读取失败，请检查独立表权限与连接");

export function parseFloorPlanPrompt(source) {
  let bundle;
  try { bundle = JSON.parse(source); } catch { throw fail("平面布局 Prompt 必须是完整JSON资产"); }
  const keys = ["version", "layout", "adjust", "interior"];
  if (!bundle || typeof bundle !== "object" || Array.isArray(bundle) || Object.keys(bundle).length !== keys.length
    || keys.some((key) => !Object.hasOwn(bundle, key)) || bundle.version !== 2) throw fail("平面布局 Prompt JSON 字段或版本不正确");
  for (const key of keys.slice(1)) {
    if (typeof bundle[key] !== "string" || !bundle[key].trim() || bundle[key].length > 20_000
      || /\{\{|\}\}|\$\{/.test(bundle[key])) throw fail(`平面布局 Prompt ${key}需要完整文本，不能含占位符`);
  }
  return bundle;
}

export async function getFloorPlanPrompt({ version = null, expectedSha256 = null, forceRefresh = false,
  config = FLOOR_PLAN_PROMPT_CONFIG, run, listVersions = listPublishedPromptAgentVersions, getAgent = getPublishedPromptAgent } = {}) {
  try {
    if (!config.baseToken || !config.tableId) throw fail("尚未配置独立的平面布局 Prompt 表");
    if (version !== null && (!Number.isSafeInteger(version) || version < 1)) throw fail("平面布局 Prompt 版本必须为正整数", 400);
    if (expectedSha256 !== null && (typeof expectedSha256 !== "string" || !/^[a-f0-9]{64}$/.test(expectedSha256))) throw fail("平面布局 Prompt SHA-256 格式无效", 400);
    const options = { config, forceRefresh, ...(run ? { run } : {}) };
    const versions = await listVersions(FLOOR_PLAN_PROMPT_CODE, options);
    if (!versions.length || versions.some((entry) => !Number.isSafeInteger(entry.version) || entry.version < 1)
      || new Set(versions.map((entry) => entry.version)).size !== versions.length) throw fail("平面布局已上架 Prompt 版本无效或重复");
    const current = [...versions].sort((left, right) => right.version - left.version)[0];
    if (version !== null && version !== current.version) throw fail("平面布局 Prompt 已更新，请刷新配置后新建任务");
    const record = await getAgent(FLOOR_PLAN_PROMPT_CODE, { ...options, version: current.version });
    const prompt = typeof record.systemPrompt === "string" ? record.systemPrompt.trim() : "";
    if (!record.published || record.version !== current.version || record.code !== FLOOR_PLAN_PROMPT_CODE || !prompt || prompt.length > 80_000) {
      throw fail("平面布局 Prompt 未上架或正文不完整");
    }
    const sha256 = hash(prompt);
    if (expectedSha256 !== null && sha256 !== expectedSha256) throw fail("平面布局 Prompt 正文已变更，请刷新配置后新建任务");
    return { code: record.code, name: record.name || "平面布局 Prompt", version: record.version, published: true,
      prompt, bundle: parseFloorPlanPrompt(prompt), sha256, source: `feishu:${config.tableId}:${record.code}@v${record.version}`, tableUrl: tableUrl(config) };
  } catch (error) { throw safeError(error); }
}

export function floorPlanPromptIdentity(asset) {
  return { code: asset.code, name: asset.name, version: asset.version, sha256: asset.sha256,
    source: asset.source, ...(asset.tableUrl ? { tableUrl: asset.tableUrl } : {}) };
}

export async function publicFloorPlanPromptConfig(options = {}) {
  try {
    const asset = await getFloorPlanPrompt(options);
    return { ...floorPlanPromptIdentity(asset), available: true, published: true, reason: null };
  } catch (error) {
    return { code: FLOOR_PLAN_PROMPT_CODE, name: "平面布局 Prompt", version: null, sha256: null,
      source: null, available: false, published: false, reason: safeError(error).message,
      tableUrl: tableUrl(options.config || FLOOR_PLAN_PROMPT_CONFIG) };
  }
}

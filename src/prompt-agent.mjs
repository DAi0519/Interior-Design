/**
 * [INPUT]: 依赖 lark-cli.mjs 的只读 Base 查询与“AI 生图 / 场景融合 Agent”真实字段
 * [OUTPUT]: 对外提供 Prompt Agent 配置解析与已上架 System Prompt 精确读取
 * [POS]: src 的 Prompt Agent 配置边界，让执行链按飞书后台当前版本运行
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { runLarkCli } from "./lark-cli.mjs";

const AGENT_FIELDS = [
  "Agent 名称",
  "Agent 编码",
  "版本",
  "上架状态",
  "场景类型",
  "System Prompt",
];

export const PROMPT_AGENT_CONFIG = Object.freeze({
  baseToken:
    process.env.LARK_AGENT_BASE_TOKEN || "SALobKnnra17iSsGT2ccC52PnHd",
  cliPath: process.env.LARK_CLI_PATH || "lark-cli",
  tableId: process.env.LARK_AGENT_TABLE_ID || "tblrnwp76L0ig6pm",
});

function values(value) {
  return Array.isArray(value) ? value.map(String) : [];
}

export function parsePromptAgentEnvelope(body) {
  if (body?.ok !== true || !Array.isArray(body?.data?.data)) {
    throw new Error("飞书 Prompt Agent 表返回格式不正确");
  }
  if (body.data.has_more) {
    throw new Error("飞书 Prompt Agent 表超过 200 条，请增加服务端分页读取");
  }
  const fields = body.data.fields || [];
  const missing = AGENT_FIELDS.filter((field) => !fields.includes(field));
  if (missing.length > 0) {
    throw new Error(`飞书 Prompt Agent 表缺少字段：${missing.join("、")}`);
  }
  const at = (row, name) => row[fields.indexOf(name)];
  return body.data.data.map((row) => ({
    code: String(at(row, "Agent 编码") || "").trim(),
    name: String(at(row, "Agent 名称") || "").trim(),
    published: values(at(row, "上架状态")).includes("上架"),
    scenes: values(at(row, "场景类型")),
    systemPrompt: String(at(row, "System Prompt") || "").trim(),
    version: Number(at(row, "版本") || 1),
  }));
}

export async function getPublishedPromptAgent(
  code = "white-model-fusion",
  { config = PROMPT_AGENT_CONFIG, run = runLarkCli } = {},
) {
  const fieldArgs = AGENT_FIELDS.flatMap((field) => ["--field-id", field]);
  const body = await run(
    { cliPath: config.cliPath },
    [
      "base",
      "+record-list",
      "--base-token",
      config.baseToken,
      "--table-id",
      config.tableId,
      ...fieldArgs,
      "--limit",
      "200",
      "--json",
      "--as",
      "user",
    ],
  );
  const agent = parsePromptAgentEnvelope(body).find(
    (entry) => entry.code === String(code || "").trim(),
  );
  if (!agent) {
    const error = new Error("飞书 Prompt Agent 表中没有白模渲染配置");
    error.statusCode = 404;
    throw error;
  }
  if (!agent.published || !agent.systemPrompt) {
    const error = new Error(`${agent.name} 未上架或 System Prompt 为空`);
    error.statusCode = 409;
    throw error;
  }
  return agent;
}

/**
 * [INPUT]: 依赖 lark-cli.mjs 的只读 Base 查询、runtime-cache.mjs 与 AI 生图 Base 内独立表的统一 Prompt Agent 版本协议
 * [OUTPUT]: 对外提供保留 Agent 编码且支持可选展示名的白模/空房双模式/风格反推 Prompt 资源配置、脱敏已上架版本目录、默认最高版本与指定已上架版本读取
 * [POS]: src 的服务端 Prompt 资产边界，让不同执行链复用同一发布与缓存语义
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { runLarkCli } from "./lark-cli.mjs";
import { createAsyncTtlCache } from "./runtime-cache.mjs";

const promptAgentCatalogCache = createAsyncTtlCache();

const AGENT_FIELDS = [
  "Agent 编码",
  "版本",
  "上架状态",
  "场景类型",
  "System Prompt",
];
const AGENT_NAME_FIELD = "Agent 名称";

const AGENT_DISPLAY_NAMES = Object.freeze({
  "empty-room-design": "空房设计 Agent",
  "empty-room-fusion": "空房风格融合 Agent",
  "empty-room-smart-default": "空房智能默认 Agent",
  "style-dna-reverse": "Style DNA 反推 Agent",
  "white-model-smart-default": "白模智能默认 Agent",
  "white-model-fusion": "白模渲染融合 Agent",
});

export const PROMPT_AGENT_CONFIG = Object.freeze({
  baseToken:
    process.env.LARK_AGENT_BASE_TOKEN || "SALobKnnra17iSsGT2ccC52PnHd",
  cliPath: process.env.LARK_CLI_PATH || "lark-cli",
  displayNameField: AGENT_NAME_FIELD,
  tableId: process.env.LARK_AGENT_TABLE_ID || "tblrnwp76L0ig6pm",
});

export const STYLE_DNA_REVERSE_PROMPT_CONFIG = Object.freeze({
  baseToken:
    process.env.LARK_STYLE_DNA_PROMPT_BASE_TOKEN ||
    "SALobKnnra17iSsGT2ccC52PnHd",
  cliPath: process.env.LARK_CLI_PATH || "lark-cli",
  tableId:
    process.env.LARK_STYLE_DNA_PROMPT_TABLE_ID || "tblzu0zDCdS6QRfK",
});

export const EMPTY_ROOM_PROMPT_CONFIG = Object.freeze({
  baseToken:
    process.env.LARK_EMPTY_ROOM_PROMPT_BASE_TOKEN ||
    "SALobKnnra17iSsGT2ccC52PnHd",
  cliPath: process.env.LARK_CLI_PATH || "lark-cli",
  displayNameField: AGENT_NAME_FIELD,
  tableId:
    process.env.LARK_EMPTY_ROOM_PROMPT_TABLE_ID || "tbly0sllVNcZwkXl",
});

function values(value) {
  return Array.isArray(value) ? value.map(String) : [];
}

function agentDisplayName(code) {
  return AGENT_DISPLAY_NAMES[code] || code || "Prompt Agent";
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
  const displayNameField = fields.includes(AGENT_NAME_FIELD)
    ? AGENT_NAME_FIELD
    : null;
  const at = (row, name) => row[fields.indexOf(name)];
  return body.data.data.map((row) => {
    const code = String(at(row, "Agent 编码") || "").trim();
    const displayName = displayNameField
      ? String(at(row, displayNameField) || "").trim()
      : "";
    return {
      code,
      name: displayName || agentDisplayName(code),
      published: values(at(row, "上架状态")).includes("上架"),
      scenes: values(at(row, "场景类型")),
      systemPrompt: String(at(row, "System Prompt") || "").trim(),
      version: Number(at(row, "版本") || 1),
    };
  });
}

async function listPromptAgents({
  config = PROMPT_AGENT_CONFIG,
  forceRefresh = false,
  run = runLarkCli,
} = {}) {
  const load = async () => {
    const fields = [
      ...AGENT_FIELDS,
      ...(
        config.displayNameField
          ? [config.displayNameField]
          : []
      ),
    ];
    const fieldArgs = fields.flatMap((field) => ["--field-id", field]);
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
    return parsePromptAgentEnvelope(body);
  };
  const agents = run === runLarkCli
    ? await promptAgentCatalogCache.get(
        `${config.baseToken}:${config.tableId}`,
        load,
        {
          force: forceRefresh,
        },
      )
    : await load();
  return agents;
}

async function matchingPromptAgents(code, options = {}) {
  const normalizedCode = String(code || "").trim();
  const agents = await listPromptAgents(options);
  const matchingAgents = agents.filter((entry) => entry.code === normalizedCode);
  if (matchingAgents.length === 0) {
    const error = new Error(`飞书 Prompt Agent 表中没有 ${normalizedCode} 配置`);
    error.statusCode = 404;
    throw error;
  }
  return matchingAgents;
}

function validPublishedAgents(agents) {
  return agents
    .filter((entry) => entry.published && entry.systemPrompt)
    .sort((left, right) => right.version - left.version);
}

export async function listPublishedPromptAgentVersions(
  code = "white-model-fusion",
  options = {},
) {
  const matchingAgents = await matchingPromptAgents(code, options);
  const agents = validPublishedAgents(matchingAgents);
  if (agents.length === 0) {
    const error = new Error(
      `${matchingAgents[0].name || "Prompt Agent"} 未上架或 System Prompt 为空`,
    );
    error.statusCode = 409;
    throw error;
  }
  return agents.map(({ code: agentCode, name, version }) => ({
    code: agentCode,
    name,
    version,
  }));
}

export function publicPromptAgentCatalog(promptAgents) {
  return {
    defaultVersion: promptAgents[0]?.version || null,
    versions: promptAgents.map((entry) => ({
      ...entry,
      published: true,
      validPrompt: true,
    })),
  };
}

async function publicSingleAgentConfig({
  code,
  config,
  description,
  fallbackName,
  options = {},
}) {
  try {
    const [agent] = await listPublishedPromptAgentVersions(code, {
      ...options,
      ...(config ? { config } : {}),
    });
    return {
      available: true,
      ...(description ? { description } : {}),
      name: agent.name,
      version: agent.version,
    };
  } catch (error) {
    return {
      available: false,
      ...(description ? { description } : {}),
      name: fallbackName,
      reason: error.message,
      version: null,
    };
  }
}

export function publicSmartDefaultConfig(options = {}) {
  return publicSingleAgentConfig({
    code: "white-model-smart-default",
    fallbackName: "白模智能默认 Agent",
    options,
  });
}

export async function publicEmptyRoomConfig(options = {}) {
  const smartDefault = await publicSingleAgentConfig({
    code: "empty-room-smart-default",
    config: EMPTY_ROOM_PROMPT_CONFIG,
    description: "AI 根据空房空间自动完成布局、家具、材质与光线",
    fallbackName: "空房智能默认 Agent",
    options,
  });
  try {
    const promptAgents = await listPublishedPromptAgentVersions(
      "empty-room-fusion",
      { ...options, config: EMPTY_ROOM_PROMPT_CONFIG },
    );
    return { promptAgent: publicPromptAgentCatalog(promptAgents), smartDefault };
  } catch (error) {
    return {
      promptAgent: { defaultVersion: null, reason: error.message, versions: [] },
      smartDefault,
    };
  }
}

export async function getPublishedPromptAgent(
  code = "white-model-fusion",
  {
    version = null,
    ...options
  } = {},
) {
  const matchingAgents = await matchingPromptAgents(code, options);
  const agents = validPublishedAgents(matchingAgents);
  if (agents.length === 0) {
    const error = new Error(
      `${matchingAgents[0].name || "Prompt Agent"} 未上架或 System Prompt 为空`,
    );
    error.statusCode = 409;
    throw error;
  }
  if (version == null || version === "") return agents[0];
  const requestedVersion = Number(version);
  if (!Number.isInteger(requestedVersion) || requestedVersion <= 0) {
    const error = new Error("Prompt 版本必须是正整数");
    error.statusCode = 400;
    throw error;
  }
  const agent = agents.find((entry) => entry.version === requestedVersion);
  if (!agent) {
    const error = new Error(
      `${matchingAgents[0].name || "Prompt Agent"} 的 v${requestedVersion} 未上架或正文为空`,
    );
    error.statusCode = 409;
    throw error;
  }
  return agent;
}

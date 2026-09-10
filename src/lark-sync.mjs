/**
 * [INPUT]: 依赖 node:fs/os/path、最终出图/Prompt Agent 模型目录、空房房间类型/其他详情真源、image-artifact.mjs、image-dimensions.mjs、lark-cli.mjs、效果图美化/白模/精模参考图与可选风格参考图，以及已创建的飞书 Base
 * [OUTPUT]: 对外提供原始/最终 Prompt、真实产物尺寸、含效果图美化的产品链路/空间类型/其他空间类型/家具选择及未指定搭配说明/设计方式/Agent/风格字段投影、覆盖全部可写字段类型/单选值/附件 ID 的生成记录 Schema 准入、模型字段映射、记录 ID 解析、三类附件及完整工作流元数据同步
 * [POS]: src 的飞书同步边界，将生成输入、模型选择与实际出图结果归档成一条 Base 记录
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  decodeImageDataUrl,
  extensionForImageFormat,
  loadImageBytes,
} from "./image-artifact.mjs";
import { readImageDimensions } from "./image-dimensions.mjs";
import {
  EMPTY_ROOM_TYPES,
  normalizeEmptyRoomType,
  normalizeEmptyRoomTypeDetail,
} from "./empty-room-type.mjs";
import { publicAgentModelCatalog } from "./agent-model-config.mjs";
import { runLarkCli } from "./lark-cli.mjs";
import { publicModelCatalog } from "./model-config.mjs";

export const LARK_SYNC_CONFIG = Object.freeze({
  baseToken:
    process.env.LARK_BASE_TOKEN || "SALobKnnra17iSsGT2ccC52PnHd",
  baseUrl:
    process.env.LARK_BASE_URL ||
    "https://lq9n5lvfn2i.feishu.cn/base/SALobKnnra17iSsGT2ccC52PnHd",
  cliPath: process.env.LARK_CLI_PATH || "lark-cli",
  referenceFieldId:
    process.env.LARK_REFERENCE_FIELD_ID || "fldhktY1vR",
  resultFieldId: process.env.LARK_RESULT_FIELD_ID || "fldZPmZ1YY",
  styleReferenceFieldId:
    process.env.LARK_STYLE_REFERENCE_FIELD_ID || "fldFxH3Sxj",
  tableId: process.env.LARK_TABLE_ID || "tblFWdK9RlSiZRKC",
});

const FEATURE_LABELS = Object.freeze({
  "effect-render-enhancement": "效果图美化",
  "empty-room-design": "空房设计",
  "free-image-generation": "自由生图",
  "refined-model-rendering": "精模渲染",
  "white-model-rendering": "白模渲染",
});
const REQUIRED_FEATURE_LABELS = Object.freeze(Object.values(FEATURE_LABELS));
const REQUIRED_MODEL_LABELS = Object.freeze(
  publicModelCatalog().map((model) => model.label),
);
const REQUIRED_AGENT_MODEL_LABELS = Object.freeze(
  publicAgentModelCatalog()
    .filter((model) => model.imageInput)
    .map((model) => model.label),
);

const RENDER_MODE_LABELS = Object.freeze({
  "smart-default": "智能默认",
  "style-dna": "平台风格",
});

export function actualImageSize(bytes) {
  const dimensions = readImageDimensions(bytes);
  if (!dimensions) throw new Error("无法读取生成结果的真实尺寸");
  return `${dimensions.width}x${dimensions.height}`;
}

function titleFromPrompt(prompt) {
  const compact = String(prompt).replace(/\s+/g, " ").trim();
  return compact.length > 36 ? `${compact.slice(0, 36)}…` : compact;
}

function furnitureSelectionText(selection) {
  if (!selection.items.length && !selection.other) return "未指定家具；Agent 按房型与风格搭配";
  return ["用户确认", selection.items.join("、"), selection.other ? `其他：${selection.other}` : ""]
    .filter(Boolean).join("；");
}

function workflowRecordFields(workflow) {
  if (!workflow) return {};
  const feature = FEATURE_LABELS[workflow.feature];
  const renderMode = RENDER_MODE_LABELS[workflow.renderMode];
  const roomType = normalizeEmptyRoomType(workflow.roomType);
  const roomTypeDetail = roomType === "其他"
    ? normalizeEmptyRoomTypeDetail(workflow.roomTypeDetail)
    : "";
  const agentCode = String(workflow.agentCode || "").trim();
  const agentVersion = Number(workflow.agentVersion);
  const styleName = String(workflow.styleName || "").trim();
  const selectionName = String(workflow.selectionName || "").trim();
  const styleVersion = Number(workflow.styleVersion);
  const styleSelection = styleName && Number.isInteger(styleVersion)
    ? `${styleName} · v${styleVersion}`
    : styleName || selectionName;

  return {
    ...(feature ? { "功能": feature } : {}),
    ...(workflow.furnitureSelection ? { "家具选择": furnitureSelectionText(workflow.furnitureSelection) } : {}),
    ...(roomType ? { "空间类型": roomType } : {}),
    ...(roomTypeDetail ? { "其他空间类型": roomTypeDetail } : {}),
    ...(renderMode ? { "设计方式": renderMode } : {}),
    ...(agentCode ? { "Agent 编码": agentCode } : {}),
    ...(Number.isInteger(agentVersion) && agentVersion > 0
      ? { "Agent 版本": agentVersion }
      : {}),
    ...(styleSelection ? { "风格选择": styleSelection } : {}),
  };
}

export function buildRecordFields({
  actualSize,
  durationMs,
  finalPrompt,
  modelLabel,
  preview,
  sourcePrompt = "",
  workflow,
}) {
  const parameters = {
    outputFormat: preview.outputFormat,
    quality: preview.quality,
    ratio: preview.ratio,
    referenceImageCount: preview.referenceImageCount,
    resolution: preview.resolution,
    sizeMode: preview.sizeMode || "preset",
    transport: preview.transport || "images-generations",
    ...(workflow ? { workflow } : {}),
  };

  return {
    "标题": titleFromPrompt(finalPrompt),
    ...workflowRecordFields(workflow),
    "生图模型": modelLabel,
    ...(workflow?.agentModelLabel
      ? { "Prompt融合": workflow.agentModelLabel }
      : {}),
    "原始 Prompt": String(sourcePrompt || "").trim(),
    "最终 Prompt": finalPrompt,
    "尺寸": actualSize,
    "生成参数": JSON.stringify(parameters),
    "耗时（秒）": Number((durationMs / 1000).toFixed(2)),
  };
}

export function recordIdFrom(body) {
  return (
    body?.data?.record_id_list?.[0] ||
    body?.record_id_list?.[0] ||
    body?.data?.record?.record_id ||
    body?.data?.record?._record_id ||
    body?.data?.record?.id ||
    body?.data?.record_id ||
    body?.data?.id ||
    null
  );
}

const REQUIRED_FIELD_TYPES = Object.freeze({
  "Agent 编码": "text",
  "Agent 版本": "number",
  "Prompt融合": "select",
  "功能": "select",
  "家具选择": "text",
  "其他空间类型": "text",
  "原始 Prompt": "text",
  "尺寸": "text",
  "标题": "text",
  "状态": "select",
  "生成参数": "text",
  "生图模型": "select",
  "空间类型": "select",
  "最终 Prompt": "text",
  "耗时（秒）": "number",
  "设计方式": "select",
  "错误信息": "text",
  "风格选择": "text",
});

function optionNames(field) {
  return new Set((field?.options || []).map((option) => option.name));
}

export function assertLarkSyncSchema(
  body,
  {
    config = LARK_SYNC_CONFIG,
    requiredAgentModelLabels = REQUIRED_AGENT_MODEL_LABELS,
    requiredModelLabels = REQUIRED_MODEL_LABELS,
  } = {},
) {
  const fields = body?.data?.fields || body?.fields || [];
  const fieldsByName = new Map(fields.map((field) => [field.name, field]));
  const issues = [];

  for (const [name, type] of Object.entries(REQUIRED_FIELD_TYPES)) {
    const field = fieldsByName.get(name);
    if (!field) issues.push(`缺少“${name}”字段`);
    else if (field.type !== type) {
      issues.push(`“${name}”字段应为 ${type}，当前为 ${field.type || "未知"}`);
    }
  }

  const requiredOptions = new Map([
    ["Prompt融合", requiredAgentModelLabels],
    ["功能", REQUIRED_FEATURE_LABELS],
    ["状态", ["成功", "同步失败"]],
    ["生图模型", requiredModelLabels],
    ["空间类型", EMPTY_ROOM_TYPES],
    ["设计方式", Object.values(RENDER_MODE_LABELS)],
  ]);
  for (const [name, required] of requiredOptions) {
    const field = fieldsByName.get(name);
    if (field?.type !== "select") continue;
    const options = optionNames(field);
    const missing = required.filter((label) => !options.has(label));
    if (missing.length > 0) {
      issues.push(`“${name}”字段缺少选项：${missing.join("、")}`);
    }
  }

  for (const [name, fieldId] of [
    ["参考图", config.referenceFieldId],
    ["结果图", config.resultFieldId],
    ["风格参考图", config.styleReferenceFieldId],
  ]) {
    const field = fields.find((entry) => entry.id === fieldId);
    if (!field) issues.push(`“${name}”附件字段 ID ${fieldId} 不存在`);
    else if (field.type !== "attachment") {
      issues.push(`“${name}”字段应为 attachment，当前为 ${field.type || "未知"}`);
    } else if (field.name !== name) {
      issues.push(`“${name}”附件字段 ID ${fieldId} 实际指向“${field.name || "未命名"}”`);
    }
  }

  if (issues.length > 0) {
    throw new Error(`飞书生成记录 Schema 不兼容：${issues.join("；")}`);
  }

  return {
    featureOptions: [...optionNames(fieldsByName.get("功能"))],
    modelOptions: [...optionNames(fieldsByName.get("生图模型"))],
  };
}

export async function verifyLarkSyncSchema(config = LARK_SYNC_CONFIG) {
  const body = await runLarkCli(config, [
    "base",
    "+field-list",
    "--as",
    "user",
    "--base-token",
    config.baseToken,
    "--table-id",
    config.tableId,
  ]);
  return assertLarkSyncSchema(body);
}

async function createRecord(config, fields) {
  const entries = Object.entries(fields);
  return runLarkCli(config, [
    "base",
    "+record-batch-create",
    "--as",
    "user",
    "--base-token",
    config.baseToken,
    "--table-id",
    config.tableId,
    "--json",
    JSON.stringify({
      fields: entries.map(([field]) => field),
      rows: [entries.map(([, value]) => value)],
    }),
  ]);
}

async function upsertRecord(config, fields, recordId = null) {
  const args = [
    "base",
    "+record-upsert",
    "--as",
    "user",
    "--base-token",
    config.baseToken,
    "--table-id",
    config.tableId,
    "--json",
    JSON.stringify(fields),
  ];
  if (recordId) args.push("--record-id", recordId);
  return runLarkCli(config, args);
}

function safeFileName(value, fallback) {
  const name = String(value || fallback)
    .replace(/[^\p{L}\p{N}._ -]/gu, "")
    .trim()
    .slice(0, 100);
  return name || fallback;
}

async function uploadAttachments(config, recordId, fieldId, fileNames, cwd) {
  if (fileNames.length === 0) return null;
  const args = [
    "base",
    "+record-upload-attachment",
    "--as",
    "user",
    "--base-token",
    config.baseToken,
    "--table-id",
    config.tableId,
    "--record-id",
    recordId,
    "--field-id",
    fieldId,
  ];
  for (const fileName of fileNames) args.push("--file", fileName);
  return runLarkCli(config, args, { cwd });
}

async function materializeReferenceImages(
  images = [],
  temporaryDirectory,
  { prefix = "" } = {},
) {
  const fileNames = [];
  for (const [index, reference] of images.entries()) {
    const extension = reference.mimeType === "image/jpeg"
      ? "jpg"
      : reference.mimeType.split("/")[1];
    const position = index + 1;
    const fileName = safeFileName(
      reference.fileName,
      `${prefix || "reference"}-${position}.${extension}`,
    );
    const storedName = [prefix, position, fileName.includes(".")
      ? fileName
      : `${fileName}.${extension}`].filter(Boolean).join("-");
    const path = join(temporaryDirectory, storedName);
    await writeFile(path, decodeImageDataUrl(reference.imageUrl));
    fileNames.push(storedName);
  }
  return fileNames;
}

function recordUrl(config, recordId) {
  const url = new URL(config.baseUrl);
  url.searchParams.set("table", config.tableId);
  if (recordId) url.searchParams.set("record", recordId);
  return url.toString();
}

export async function syncGenerationToLark(input, config = LARK_SYNC_CONFIG) {
  let recordId = null;
  let temporaryDirectory = null;

  try {
    const resultBytes = await loadImageBytes(input.resultImage.url);
    const fields = buildRecordFields({
      ...input,
      actualSize: actualImageSize(resultBytes),
    });
    const created = await createRecord(config, fields);
    recordId = recordIdFrom(created);
    if (!recordId) throw new Error("飞书已响应，但没有返回记录 ID");

    temporaryDirectory = await mkdtemp(join(tmpdir(), "canvas-lab-lark-"));

    const resultFileName =
      `result.${extensionForImageFormat(input.preview.outputFormat)}`;
    const resultPath = join(temporaryDirectory, resultFileName);
    await writeFile(resultPath, resultBytes);
    await uploadAttachments(
      config,
      recordId,
      config.resultFieldId,
      [resultFileName],
      temporaryDirectory,
    );

    const referenceFileNames = await materializeReferenceImages(
      input.referenceImages,
      temporaryDirectory,
    );
    await uploadAttachments(
      config,
      recordId,
      config.referenceFieldId,
      referenceFileNames,
      temporaryDirectory,
    );
    const styleReferenceFileNames = await materializeReferenceImages(
      input.styleReferenceImages,
      temporaryDirectory,
      { prefix: "style" },
    );
    await uploadAttachments(
      config,
      recordId,
      config.styleReferenceFieldId,
      styleReferenceFileNames,
      temporaryDirectory,
    );

    await upsertRecord(config, { "状态": "成功", "错误信息": null }, recordId);
    return {
      ok: true,
      recordId,
      recordUrl: recordUrl(config, recordId),
    };
  } catch (error) {
    const message = String(error?.message || "飞书同步失败");
    if (recordId) {
      try {
        await upsertRecord(
          config,
          { "状态": "同步失败", "错误信息": message.slice(0, 1000) },
          recordId,
        );
      } catch {
        // 保留原始同步错误，避免状态回写失败覆盖根因。
      }
    }
    return {
      error: message,
      ok: false,
      recordId,
      recordUrl: recordUrl(config, recordId),
    };
  } finally {
    if (temporaryDirectory) {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  }
}

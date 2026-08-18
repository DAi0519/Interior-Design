/**
 * [INPUT]: 依赖 node:fs/os/path、image-artifact.mjs、lark-cli.mjs、白模/精模参考图与可选风格参考图，以及已创建的飞书 Base
 * [OUTPUT]: 对外提供原始/最终 Prompt、模型字段映射、记录 ID 解析、结果图/参考图/风格参考图分列附件及工作流元数据同步
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
import { runLarkCli } from "./lark-cli.mjs";

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

function titleFromPrompt(prompt) {
  const compact = String(prompt).replace(/\s+/g, " ").trim();
  return compact.length > 36 ? `${compact.slice(0, 36)}…` : compact;
}

export function buildRecordFields({
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
    "生图模型": modelLabel,
    ...(workflow?.agentModelLabel
      ? { "Prompt融合": workflow.agentModelLabel }
      : {}),
    "原始 Prompt": String(sourcePrompt || "").trim(),
    "最终 Prompt": finalPrompt,
    "尺寸": preview.size,
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
    const fields = buildRecordFields(input);
    const created = await createRecord(config, fields);
    recordId = recordIdFrom(created);
    if (!recordId) throw new Error("飞书已响应，但没有返回记录 ID");

    temporaryDirectory = await mkdtemp(join(tmpdir(), "canvas-lab-lark-"));

    const resultFileName =
      `result.${extensionForImageFormat(input.preview.outputFormat)}`;
    const resultPath = join(temporaryDirectory, resultFileName);
    await writeFile(resultPath, await loadImageBytes(input.resultImage.url));
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

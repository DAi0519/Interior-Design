/**
 * [INPUT]: 依赖 node:child_process/fs/os/path、lark-cli 用户身份与已创建的飞书 Base
 * [OUTPUT]: 对外提供 buildRecordFields、recordIdFrom、syncGenerationToLark 与 LARK_SYNC_CONFIG
 * [POS]: src 的飞书同步边界，将一次生成写成 Base 记录并把结果图、多参考图上传为附件
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const MAX_RESULT_BYTES = 60 * 1024 * 1024;
const CLI_TIMEOUT_MS = 180_000;
const IMAGE_FETCH_TIMEOUT_MS = 60_000;

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
  tableId: process.env.LARK_TABLE_ID || "tblFWdK9RlSiZRKC",
});

function safeErrorMessage(error) {
  for (const raw of [error?.stderr, error?.stdout]) {
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.error?.message) return parsed.error.message;
    } catch {
      // 非 JSON 输出继续使用通用错误信息。
    }
  }
  return error?.message || "飞书同步失败";
}

async function runCli(config, args, options = {}) {
  try {
    const { stdout } = await execFileAsync(config.cliPath, args, {
      encoding: "utf8",
      cwd: options.cwd,
      env: {
        ...process.env,
        LARKSUITE_CLI_NO_SKILLS_NOTIFIER: "1",
        LARKSUITE_CLI_NO_UPDATE_NOTIFIER: "1",
      },
      maxBuffer: 8 * 1024 * 1024,
      timeout: CLI_TIMEOUT_MS,
    });
    const body = JSON.parse(stdout);
    if (body?.ok !== true) throw new Error("飞书 CLI 未返回成功结果");
    return body;
  } catch (error) {
    throw new Error(safeErrorMessage(error));
  }
}

function titleFromPrompt(prompt) {
  const compact = String(prompt).replace(/\s+/g, " ").trim();
  return compact.length > 36 ? `${compact.slice(0, 36)}…` : compact;
}

export function buildRecordFields({
  durationMs,
  modelLabel,
  prompt,
  revisedPrompt,
  preview,
}) {
  const parameters = {
    outputFormat: preview.outputFormat,
    quality: preview.quality,
    ratio: preview.ratio,
    referenceImageCount: preview.referenceImageCount,
    resolution: preview.resolution,
  };

  return {
    "标题": titleFromPrompt(prompt),
    "模型": modelLabel,
    "原始 Prompt": prompt,
    ...(revisedPrompt ? { "模型修订 Prompt": revisedPrompt } : {}),
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
  return runCli(config, [
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
  return runCli(config, args);
}

function extensionFor(format) {
  return format === "jpeg" ? "jpg" : format;
}

function safeFileName(value, fallback) {
  const name = String(value || fallback)
    .replace(/[^\p{L}\p{N}._ -]/gu, "")
    .trim()
    .slice(0, 100);
  return name || fallback;
}

function decodeDataUrl(dataUrl) {
  const match = String(dataUrl).match(
    /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\r\n]+)$/,
  );
  if (!match) throw new Error("图片数据格式不正确");
  return Buffer.from(match[2].replace(/\s/g, ""), "base64");
}

async function imageBytes(imageUrl) {
  if (String(imageUrl).startsWith("data:")) return decodeDataUrl(imageUrl);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(imageUrl, {
      redirect: "follow",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`读取生成结果失败（${response.status}）`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0) throw new Error("生成结果为空");
    if (bytes.length > MAX_RESULT_BYTES) throw new Error("生成结果超过 60MB");
    return bytes;
  } catch (error) {
    if (error.name === "AbortError") throw new Error("读取生成结果超时");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
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
  return runCli(config, args, { cwd });
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

    const resultFileName = `result.${extensionFor(input.preview.outputFormat)}`;
    const resultPath = join(temporaryDirectory, resultFileName);
    await writeFile(resultPath, await imageBytes(input.resultImage.url));
    await uploadAttachments(
      config,
      recordId,
      config.resultFieldId,
      [resultFileName],
      temporaryDirectory,
    );

    const referenceFileNames = [];
    for (const [index, reference] of input.referenceImages.entries()) {
      const extension = reference.mimeType === "image/jpeg" ? "jpg" : reference.mimeType.split("/")[1];
      const fileName = safeFileName(
        reference.fileName,
        `reference-${index + 1}.${extension}`,
      );
      const storedName = `${index + 1}-${fileName.includes(".") ? fileName : `${fileName}.${extension}`}`;
      const path = join(temporaryDirectory, storedName);
      await writeFile(path, decodeDataUrl(reference.imageUrl));
      referenceFileNames.push(storedName);
    }
    await uploadAttachments(
      config,
      recordId,
      config.referenceFieldId,
      referenceFileNames,
      temporaryDirectory,
    );

    await upsertRecord(config, { "状态": "成功", "错误信息": null }, recordId);
    return {
      ok: true,
      recordId,
      recordUrl: recordUrl(config, recordId),
    };
  } catch (error) {
    const message = safeErrorMessage(error);
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

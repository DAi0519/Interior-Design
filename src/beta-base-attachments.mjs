/**
 * [INPUT]: 依赖 Beta 飞书 CLI、图片读取及临时附件目录
 * [OUTPUT]: 提供附件落盘、上传、下载和附件元数据回读校验
 * [POS]: src 的 Beta 归档附件操作，被跑图和样本 Store 共用
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadImageBytes } from "./image-artifact.mjs";
import { betaBaseContractError } from "./beta-base-schema.mjs";

export async function uploadAttachments(run, config, recordId, fieldId, files, cwd, tableId = config.tableId) {
  if (files.length === 0) return;
  const args = [
    "base", "+record-upload-attachment", "--as", "user",
    "--base-token", config.baseToken,
    "--table-id", tableId,
    "--record-id", recordId,
    "--field-id", fieldId,
  ];
  files.forEach((file) => args.push("--file", file));
  await run(config, args, { cwd });
}

export async function downloadBetaAttachment(run, config, recordId, fileToken, file, cwd) {
  await run(config, ["base", "+record-download-attachment", "--as", "user", "--base-token", config.baseToken,
    "--table-id", config.tableId, "--record-id", recordId, "--file-token", fileToken,
    "--output", file, "--overwrite", "--format", "json"], { cwd });
  return readFile(join(cwd, file));
}

function safeFileName(value, fallback) {
  return String(value || fallback)
    .replace(/[^\p{L}\p{N}._ -]/gu, "")
    .trim()
    .slice(0, 100) || fallback;
}

export async function materializeImages(images, directory, prefix) {
  const files = [];
  const sizes = [];
  for (const [index, image] of (images || []).entries()) {
    const source = image?.dataUrl || image?.imageUrl || image?.url;
    if (!source) continue;
    const mimeType = String(image.type || image.mimeType || "image/png");
    const extension = mimeType === "image/jpeg" ? "jpg" : mimeType.split("/")[1] || "png";
    const file = `${prefix}-${index + 1}-${safeFileName(image.name || image.fileName, `image.${extension}`)}`;
    const bytes = await loadImageBytes(source);
    await writeFile(join(directory, file), bytes);
    files.push(file);
    sizes.push(bytes.length);
  }
  return { files, sizes };
}

export function assertAttachmentReadback(fields, name, expectedSizes) {
  const attachments = fields?.[name] ?? [];
  if (!Array.isArray(attachments) || attachments.length !== expectedSizes.length
    || expectedSizes.some((size, index) => !attachments[index]?.file_token || Number(attachments[index].size) !== size)) {
    throw betaBaseContractError(`飞书${name}附件数量、token 或字节数回读不一致`);
  }
}

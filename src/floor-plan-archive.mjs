/**
 * [INPUT]: 依赖平面出图的冻结请求身份、参考图及实际结果，复用共享飞书字段、记录和附件接口
 * [OUTPUT]: 提供三类平面出图的归档准入、按结果身份续传、字段与附件下载 SHA 回读
 * [POS]: src 的平面出图归档边界，归档失败独立于图片生成
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { decodeImageDataUrl } from "./image-artifact.mjs";
import { readImageDimensions } from "./image-dimensions.mjs";
import { runLarkCli } from "./lark-cli.mjs";
import {
  LARK_SYNC_CONFIG, buildRecordFields, createRecord, materializeReferenceImages,
  readVerifiedArchiveRecord, recordIdFrom, recordUrl, uploadAttachments, upsertRecord,
  verifyArchiveAttachments, verifyArchiveFields,
} from "./lark-sync.mjs";

export const FLOOR_PLAN_ARCHIVE_ID_FIELD = "平面出图任务ID";
export const FLOOR_PLAN_ARCHIVE_LABELS = Object.freeze({
  floorPlanCamera: "平面图机位渲染",
  housePlanLayout: "户型平面布局",
  floorPlan: "设计实验室 · Beta",
});

const FIELD_TYPES = {
  [FLOOR_PLAN_ARCHIVE_ID_FIELD]: "text",
  "标题": "text", "功能": "select", "生图模型": "select", "Prompt融合": "select",
  "Agent 编码": "text", "Agent 版本": "number", "原始 Prompt": "text", "最终 Prompt": "text",
  "生成参数": "text", "尺寸": "text", "耗时（秒）": "number", "状态": "select", "错误信息": "text",
  "参考图": "attachment", "结果图": "attachment",
};
const LABEL = "平面出图";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const conflict = (message) => Object.assign(new Error(message), { statusCode: 409 });
const successFields = { "状态": "成功", "错误信息": null };

export async function verifyFloorPlanArchiveSchema(
  { featureMode, modelLabels = [], agentLabels = [] }, config = LARK_SYNC_CONFIG, { run = runLarkCli } = {},
) {
  if (!Object.hasOwn(FLOOR_PLAN_ARCHIVE_LABELS, featureMode)) throw conflict("未知的平面出图归档功能");
  const body = await run(config, ["base", "+field-list", "--as", "user", "--base-token", config.baseToken,
    "--table-id", config.tableId, "--limit", "200", "--format", "json"]);
  const fields = body?.data?.fields;
  if (body?.ok !== true || !Array.isArray(fields) || body.data.has_more) throw conflict("平面出图生成记录字段读取不完整");
  const byName = new Map(fields.map((field) => [field.name, field]));
  for (const [name, type] of Object.entries(FIELD_TYPES)) {
    if (byName.get(name)?.type !== type || fields.filter((field) => field.name === name).length !== 1) {
      throw conflict(`平面出图生成记录字段“${name}”缺失、重复或类型不符`);
    }
  }
  for (const [name, required] of Object.entries({
    "功能": [FLOOR_PLAN_ARCHIVE_LABELS[featureMode]], "生图模型": modelLabels,
    "Prompt融合": agentLabels, "状态": ["成功", "同步失败"],
  })) {
    const options = new Set(byName.get(name).options?.map(({ name: option }) => option));
    const missing = required.filter((option) => !options.has(option));
    if (missing.length) throw conflict(`平面出图生成记录“${name}”缺少选项 ${missing.join("、")}`);
  }
  const attachmentFieldIds = { "参考图": config.referenceFieldId, "结果图": config.resultFieldId };
  for (const [name, id] of Object.entries(attachmentFieldIds)) {
    if (!id || byName.get(name).id !== id) throw conflict(`平面出图生成记录“${name}”附件字段ID与配置不符`);
  }
  return { attachmentFieldIds };
}

function checkedImage(image, url, name) {
  const bytes = decodeImageDataUrl(url);
  const mimeType = url.slice(5, url.indexOf(";"));
  const dimensions = readImageDimensions(bytes, mimeType);
  if (!dimensions?.width || !dimensions.height || sha256(bytes) !== image.sha256
    || (image.mimeType && image.mimeType !== mimeType)) {
    throw conflict(`平面出图${name}的类型、尺寸或 SHA 与实际字节不一致`);
  }
  return { imageUrl: url, mimeType, fileName: image.fileName,
    identity: { ...dimensions, mimeType, size: bytes.length, sha256: image.sha256 } };
}

async function findRecord(config, archiveId, run) {
  const body = await run(config, ["base", "+record-list", "--as", "user", "--base-token", config.baseToken,
    "--table-id", config.tableId, "--field-id", FLOOR_PLAN_ARCHIVE_ID_FIELD,
    "--filter-json", JSON.stringify({ logic: "and", conditions: [[FLOOR_PLAN_ARCHIVE_ID_FIELD, "==", archiveId]] }),
    "--limit", "2", "--format", "json"]);
  const ids = body?.data?.record_id_list;
  const rows = body?.data?.data;
  if (body?.ok !== true || !Array.isArray(ids) || !Array.isArray(rows) || ids.length !== rows.length) {
    throw new Error("平面出图归档查重返回格式不正确");
  }
  if (body.data.has_more || ids.length > 1) throw new Error("平面出图同一结果存在重复记录，已停止同步");
  return ids[0] || null;
}

async function verifyAttachmentBytes(config, recordId, directory, run, verified, name, files, manifest) {
  const identities = verifyArchiveAttachments({ [name]: files }, { [name]: manifest }, null, LABEL)[name];
  for (const [index, { file_token: token }] of identities.entries()) {
    const expected = manifest[index];
    if (verified.get(token) === expected.sha256) continue;
    const output = "verify-attachment.bin";
    await run(config, ["base", "+record-download-attachment", "--as", "user", "--base-token", config.baseToken,
      "--table-id", config.tableId, "--record-id", recordId, "--file-token", token,
      "--output", output, "--overwrite", "--format", "json"], { cwd: directory });
    const bytes = await readFile(join(directory, output));
    if (bytes.length !== expected.size || sha256(bytes) !== expected.sha256) {
      throw new Error(`平面出图“${name}”附件下载字节或 SHA 与实际图片不一致`);
    }
    verified.set(token, expected.sha256);
  }
  return identities;
}

export async function syncFloorPlanToLark(input, config = LARK_SYNC_CONFIG, { run = runLarkCli } = {}) {
  let recordId = null, directory = null, canWriteStatus = false;
  try {
    const { archiveId, featureMode, title, modelLabel, referenceImages, resultImage } = input;
    if (typeof archiveId !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{7,239}$/.test(archiveId)
      || typeof title !== "string" || !title.trim() || typeof modelLabel !== "string" || !modelLabel.trim()
      || !Number.isFinite(input.durationMs) || input.durationMs < 0 || typeof input.finalPrompt !== "string"
      || !input.finalPrompt.trim() || !Array.isArray(referenceImages) || referenceImages.length === 0 || !resultImage) {
      throw conflict("平面出图归档缺少有效的结果身份、提示词或图像");
    }
    const result = checkedImage(resultImage, resultImage.url, "结果图");
    const attachments = {
      "参考图": referenceImages.map((image) => checkedImage(image, image.imageUrl, "参考图")),
      "结果图": [result],
    };
    const manifest = Object.fromEntries(Object.entries(attachments)
      .map(([name, images]) => [name, images.map(({ identity }) => identity)]));
    const { attachmentFieldIds } = await verifyFloorPlanArchiveSchema({ featureMode, modelLabels: [modelLabel],
      agentLabels: input.workflow?.agentModelLabel ? [input.workflow.agentModelLabel] : [] }, config, { run });
    const fields = {
      ...buildRecordFields({ ...input, actualSize: `${result.identity.width}x${result.identity.height}`,
        workflow: { ...input.workflow, attachmentManifest: manifest } }),
      "标题": title, "功能": FLOOR_PLAN_ARCHIVE_LABELS[featureMode], [FLOOR_PLAN_ARCHIVE_ID_FIELD]: archiveId,
    };
    recordId = await findRecord(config, archiveId, run);
    if (!recordId) recordId = recordIdFrom(await createRecord(config, fields, run));
    if (!recordId) throw new Error("平面出图创建记录未返回记录ID，请以同一归档身份重试");

    const before = await readVerifiedArchiveRecord(config, recordId, run, LABEL);
    verifyArchiveFields(before, fields, LABEL);
    const alreadySuccessful = before["状态"] === "成功" || before["状态"]?.[0] === "成功";
    canWriteStatus = !alreadySuccessful;
    directory = await mkdtemp(join(tmpdir(), "canvas-floor-plan-archive-"));
    const verified = new Map();
    for (const [name, images] of Object.entries(attachments)) {
      const existing = before[name] ?? [];
      if (!Array.isArray(existing) || existing.length > images.length || (alreadySuccessful && existing.length !== images.length)) {
        throw new Error(`平面出图“${name}”已有附件数量不符，未覆盖`);
      }
      await verifyAttachmentBytes(config, recordId, directory, run, verified, name, existing, manifest[name].slice(0, existing.length));
      if (existing.length < images.length) {
        // --- 网络响应丢失后先核验已有前缀，只补尚未上传的图片 ---
        const files = await materializeReferenceImages(images, directory, { prefix: name === "参考图" ? "reference" : "result" });
        await uploadAttachments(config, recordId, attachmentFieldIds[name], files.slice(existing.length), directory, run);
      }
    }
    const attached = await readVerifiedArchiveRecord(config, recordId, run, LABEL);
    verifyArchiveFields(attached, fields, LABEL);
    const identities = {};
    for (const [name, expected] of Object.entries(manifest)) {
      identities[name] = await verifyAttachmentBytes(config, recordId, directory, run, verified, name, attached[name], expected);
    }
    if (!alreadySuccessful) await upsertRecord(config, successFields, recordId, run);
    const final = await readVerifiedArchiveRecord(config, recordId, run, LABEL);
    verifyArchiveFields(final, { ...fields, ...successFields }, LABEL);
    verifyArchiveAttachments(final, manifest, identities, LABEL);
    return { ok: true, recordId, recordUrl: recordUrl(config, recordId) };
  } catch (error) {
    const message = String(error?.message || "平面出图同步失败").slice(0, 700);
    if (recordId && canWriteStatus) {
      try { await upsertRecord(config, { "状态": "同步失败", "错误信息": message }, recordId, run); }
      catch { /* 保留首次失败原因，任务身份仍可查回。 */ }
    }
    return { ok: false, error: message, recordId, recordUrl: recordId ? recordUrl(config, recordId) : null };
  } finally {
    if (directory) await rm(directory, { recursive: true, force: true });
  }
}

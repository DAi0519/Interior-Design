/**
 * [INPUT]: 依赖 node:fs/os/path/crypto/util、模型/空房/遮罩/打光归档真源、图片产物/尺寸/飞书 CLI、生图结果及原图/实际提交的引导图附件、已创建飞书 Base
 * [OUTPUT]: 原始/最终Prompt及真实尺寸同步；包含质感增强功能标签准入，遮罩与打光独立scope校验附件，字段/token/字节双回读后成功
 * [POS]: src 的飞书同步边界，将生成输入、模型选择与实际出图结果归档成一条 Base 记录
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

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
import { MULTI_ANGLE_ARCHIVE_FIELDS, MULTI_ANGLE_ARCHIVE_MODEL_LABELS, MULTI_ANGLE_FRAMING_LABELS, multiAngleRecordFields } from "./image-multi-angle-archive.mjs";
import { IMAGE_OUTPAINT_ARCHIVE_MODEL_LABELS } from "./image-outpaint-archive.mjs";
import { IMAGE_MASK_FILL_ARCHIVE_FIELDS, IMAGE_MASK_FILL_ARCHIVE_MODEL_LABEL, IMAGE_MASK_FILL_ARCHIVE_MODE_LABELS, maskFillRecordFields } from "./image-mask-fill-archive.mjs";
import { IMAGE_RELIGHT_ARCHIVE_FEATURE_LABEL, relightArchiveManifest } from "./image-relight-archive.mjs";

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
  "effect-render-enhancement": "效果图氛围转换",
  "effect-render-beautification": "效果图美化",
  "empty-room-design": "空房设计",
  "free-image-generation": "自由生图",
  "image-outpaint": "AI扩图",
  "image-multi-angle": "多角度",
  "image-mask-fill": "遮罩填充",
  "image-relight": IMAGE_RELIGHT_ARCHIVE_FEATURE_LABEL,
  "panorama-render-enhancement": "全景图美化",
  "refined-model-rendering": "精模渲染",
  "style-transfer": "风格转换",
  "texture-render-enhancement": "质感增强",
  "white-model-rendering": "白模渲染",
});
const REQUIRED_FEATURE_LABELS = Object.freeze(Object.values(FEATURE_LABELS).filter((label) => !["遮罩填充", IMAGE_RELIGHT_ARCHIVE_FEATURE_LABEL].includes(label)));
const REQUIRED_MODEL_LABELS = Object.freeze(
  [...new Set([...publicModelCatalog().map((model) => model.label), ...IMAGE_OUTPAINT_ARCHIVE_MODEL_LABELS, ...MULTI_ANGLE_ARCHIVE_MODEL_LABELS])],
);
const REQUIRED_AGENT_MODEL_LABELS = Object.freeze(
  publicAgentModelCatalog()
    .filter((model) => model.imageInput)
    .map((model) => model.label),
);

const RENDER_MODE_LABELS = Object.freeze({
  "smart-default": "智能默认",
  "style-dna": "平台风格",
  "style-reference": "参考图风格",
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
    "标题": titleFromPrompt(finalPrompt || FEATURE_LABELS[workflow?.feature] || ""),
    ...workflowRecordFields(workflow),
    ...multiAngleRecordFields(workflow),
    ...maskFillRecordFields(workflow),
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
  ...MULTI_ANGLE_ARCHIVE_FIELDS,
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
    scope = null,
  } = {},
) {
  const fields = body?.data?.fields || body?.fields || [];
  const fieldsByName = new Map(fields.map((field) => [field.name, field]));
  const issues = [];

  const maskFill = scope === "imageMaskFill";
  const relight = scope === "imageRelight";
  const requiredTypes = { ...REQUIRED_FIELD_TYPES, ...(maskFill ? IMAGE_MASK_FILL_ARCHIVE_FIELDS : {}) };
  for (const [name, type] of Object.entries(requiredTypes)) {
    const field = fieldsByName.get(name);
    if (!field) issues.push(`缺少“${name}”字段`);
    else if (field.type !== type) {
      issues.push(`“${name}”字段应为 ${type}，当前为 ${field.type || "未知"}`);
    }
  }

  const requiredOptions = new Map([
    ["Prompt融合", requiredAgentModelLabels],
    ["功能", [...REQUIRED_FEATURE_LABELS, ...(maskFill ? ["遮罩填充"] : []), ...(relight ? [IMAGE_RELIGHT_ARCHIVE_FEATURE_LABEL] : [])]],
    ["景别", Object.values(MULTI_ANGLE_FRAMING_LABELS)],
    ["状态", ["成功", "同步失败"]],
    ["生图模型", maskFill ? [...requiredModelLabels, IMAGE_MASK_FILL_ARCHIVE_MODEL_LABEL] : requiredModelLabels],
    ["空间类型", EMPTY_ROOM_TYPES],
    ["设计方式", Object.values(RENDER_MODE_LABELS)],
  ]);
  if (maskFill) requiredOptions.set("遮罩填充模式", IMAGE_MASK_FILL_ARCHIVE_MODE_LABELS);
  for (const [name, required] of requiredOptions) {
    const field = fieldsByName.get(name);
    if (field?.type !== "select") continue;
    const options = optionNames(field);
    const missing = required.filter((label) => !options.has(label));
    if (missing.length > 0) {
      issues.push(`“${name}”字段缺少选项：${missing.join("、")}`);
    }
  }

  const attachmentFieldIds = {};
  if (maskFill) {
    for (const name of ["参考图", "结果图", "遮罩图", "填充参考图", "框选原图"]) {
      const field = fieldsByName.get(name);
      if (!field?.id || field.type !== "attachment") issues.push(`“${name}”附件字段缺少有效 ID 或类型`);
      else attachmentFieldIds[name] = field.id;
    }
    if (new Set(Object.values(attachmentFieldIds)).size !== Object.keys(attachmentFieldIds).length) issues.push("遮罩填充附件列 ID 不能重复");
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
    const error = new Error(`飞书生成记录 Schema 不兼容：${issues.join("；")}`);
    error.statusCode = 409;
    throw error;
  }

  return {
    featureOptions: [...optionNames(fieldsByName.get("功能"))],
    modelOptions: [...optionNames(fieldsByName.get("生图模型"))],
    ...(maskFill ? { attachmentFieldIds } : {}),
  };
}

export async function verifyLarkSyncSchema(config = LARK_SYNC_CONFIG, { scope = null, run = runLarkCli } = {}) {
  const body = await run(config, [
    "base",
    "+field-list",
    "--as",
    "user",
    "--base-token",
    config.baseToken,
    "--table-id",
    config.tableId,
  ]);
  return assertLarkSyncSchema(body, { config, scope });
}

async function createRecord(config, fields, run = runLarkCli) {
  const entries = Object.entries(fields);
  return run(config, [
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

async function upsertRecord(config, fields, recordId = null, run = runLarkCli) {
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
  return run(config, args);
}

function safeFileName(value, fallback) {
  const name = String(value || fallback)
    .replace(/[^\p{L}\p{N}._ -]/gu, "")
    .trim()
    .slice(0, 100);
  return name || fallback;
}

async function uploadAttachments(config, recordId, fieldId, fileNames, cwd, run = runLarkCli) {
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
  return run(config, args, { cwd });
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

// -------- 遮罩与打光归档启用回读；普通同步保持既有字段与调用范围 --------
async function readVerifiedArchiveRecord(config, recordId, run, label = "遮罩") {
  const body = await run(config, ["base", "+record-get", "--as", "user", "--base-token", config.baseToken,
    "--table-id", config.tableId, "--record-id", recordId, "--format", "json"]);
  const record = body?.data?.record || body?.record;
  if (record?.fields && !Array.isArray(record.fields)) {
    if (record.record_id && record.record_id !== recordId) throw new Error(`${label}归档回读返回了另一条记录`);
    return record.fields;
  }
  const data = body?.data;
  if (Array.isArray(data?.fields) && Array.isArray(data.data) && data.data.length === 1
    && data.record_id_list?.[0] === recordId) {
    return Object.fromEntries(data.fields.map((name, index) => [name, data.data[0][index]]));
  }
  throw new Error(`${label}归档记录回读格式不正确或记录身份不符`);
}

function verifyArchiveFields(actual, expected, label = "遮罩") {
  for (const [name, value] of Object.entries(expected)) {
    let found = actual[name];
    if (Array.isArray(found)) {
      if (found.length === 1 && typeof found[0] !== "object") found = found[0];
      else if (found.every((part) => typeof part?.text === "string")) found = found.map((part) => part.text).join("");
    }
    if (value == null && (found == null || found === "")) continue;
    if (name === "生成参数") {
      try { if (isDeepStrictEqual(typeof found === "string" ? JSON.parse(found) : found, JSON.parse(value))) continue; } catch { /* 继续按字段拒绝。 */ }
    } else if (typeof value === "number" && found != null && found !== "" && Number(found) === value) continue;
    else if (String(found ?? "") === String(value ?? "")) continue;
    throw new Error(`${label}归档字段回读不一致：${name}`);
  }
}

function verifyArchiveAttachments(fields, manifest, identities = null, label = "遮罩") {
  const current = {};
  for (const [name, expected] of Object.entries(manifest)) {
    const files = fields[name] ?? [];
    if (!Array.isArray(files) || files.length !== expected.length || expected.some((file, index) =>
      !String(files[index]?.file_token || "").trim() || Number(files[index]?.size) !== file.size)) {
      throw new Error(`${label}归档${name}附件数量、token 或字节数回读不一致`);
    }
    current[name] = files.map((file) => ({ file_token: file.file_token, size: Number(file.size) }));
    if (identities && !isDeepStrictEqual(current[name], identities[name])) throw new Error(`${label}归档${name}附件身份回读发生变化`);
  }
  return current;
}

async function maskFillManifest(input, resultBytes) {
  const referenceMode = input.workflow.mode === "reference";
  const maskOmitted = input.workflow.provider === "oneapi" && input.workflow.hasMask === false;
  const boxSelected = input.workflow.provider === "oneapi" && Boolean(input.workflow.editRegion);
  if (input.referenceImages?.length !== 1 || (maskOmitted ? Boolean(input.maskImage) : !input.maskImage) || (referenceMode && !input.fillReferenceImage)
    || (!referenceMode && input.fillReferenceImage) || input.styleReferenceImages?.length || !input.finalPrompt?.trim()) {
    throw new Error("遮罩归档需分别提供主图/结果及实际使用的遮罩，仅GPT可省略遮罩，且仅参考模式提供填充参考图");
  }
  if (Boolean(input.boxedSourceImage) !== boxSelected
    || input.workflow.editRegion && !boxSelected || boxSelected && !maskOmitted) {
    throw new Error("框选归档需独立提供实际提交的GPT圈选标记原图，且不能与遮罩同时使用");
  }
  const summarize = async (image) => {
    const bytes = await loadImageBytes(image.imageUrl);
    return { size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
  };
  const outputSha256 = createHash("sha256").update(resultBytes).digest("hex");
  if (input.workflow.outputSha256 && input.workflow.outputSha256 !== outputSha256) throw new Error("遮罩结果图 SHA-256 与生成回执不一致");
  let boxedSource = null;
  if (boxSelected) {
    const bytes = await loadImageBytes(input.boxedSourceImage.imageUrl);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (input.boxedSourceImage.mimeType !== "image/png" || !readImageDimensions(bytes, "image/png")) {
      throw new Error("框选原图必须为实际提交的PNG图片");
    }
    if (input.boxedSourceImage.size !== bytes.length) throw new Error("框选原图字节数与归档描述不一致");
    if (!input.workflow.submittedSourceSha256 || input.workflow.submittedSourceSha256 !== sha256) {
      throw new Error("框选原图 SHA-256 与实际提交回执不一致");
    }
    boxedSource = { size: bytes.length, sha256 };
  }
  return {
    "参考图": [await summarize(input.referenceImages[0])],
    "结果图": [{ size: resultBytes.length, sha256: outputSha256 }],
    "遮罩图": input.maskImage ? [await summarize(input.maskImage)] : [],
    "填充参考图": referenceMode ? [await summarize(input.fillReferenceImage)] : [],
    "框选原图": boxedSource ? [boxedSource] : [],
  };
}

export async function syncGenerationToLark(input, config = LARK_SYNC_CONFIG, { run = runLarkCli } = {}) {
  let recordId = null;
  let temporaryDirectory = null;

  try {
    const maskFill = input.workflow?.feature === "image-mask-fill";
    const relight = input.workflow?.feature === "image-relight";
    const readback = maskFill || relight;
    const label = relight ? "打光" : "遮罩";
    const schema = readback ? await verifyLarkSyncSchema(config, { scope: maskFill ? "imageMaskFill" : "imageRelight", run }) : null;
    const resultBytes = await loadImageBytes(input.resultImage.url);
    const manifest = maskFill ? await maskFillManifest(input, resultBytes) : relight ? relightArchiveManifest(input, resultBytes) : null;
    const fields = buildRecordFields({
      ...input,
      ...(readback ? { workflow: { ...input.workflow, outputSha256: manifest["结果图"][0].sha256, attachmentManifest: manifest } } : {}),
      actualSize: actualImageSize(resultBytes),
    });
    const created = await createRecord(config, fields, run);
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
      run,
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
      run,
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
      run,
    );

    let attachmentIdentities = null;
    if (maskFill) {
      for (const [name, image, prefix] of [["遮罩图", input.maskImage, "mask"],
        ["填充参考图", input.fillReferenceImage, "fill-reference"], ["框选原图", input.boxedSourceImage, "boxed-source"]]) {
        const fileNames = await materializeReferenceImages(image ? [image] : [], temporaryDirectory, { prefix });
        await uploadAttachments(config, recordId, schema.attachmentFieldIds[name], fileNames, temporaryDirectory, run);
      }
    }
    if (readback) {
      const initial = await readVerifiedArchiveRecord(config, recordId, run, label);
      verifyArchiveFields(initial, fields, label);
      attachmentIdentities = verifyArchiveAttachments(initial, manifest, null, label);
    }
    await upsertRecord(config, { "状态": "成功", "错误信息": null }, recordId, run);
    if (readback) {
      const final = await readVerifiedArchiveRecord(config, recordId, run, label);
      verifyArchiveFields(final, { ...fields, "状态": "成功", "错误信息": null }, label);
      verifyArchiveAttachments(final, manifest, attachmentIdentities, label);
    }
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
          run,
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

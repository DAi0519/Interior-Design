/**
 * [INPUT]: 依赖 Beta跑图 Base 的样本集/样本/跑图明细三表、lark-cli.mjs 与图片产物基础设施，接收可复用样本集、已冻结批次 Run、输入附件和正式生成结果
 * [OUTPUT]: 对外提供正式生成信息捕获、最终 Prompt/多选场景 Tag/真实尺寸归档与回读，以及样本集目录/含逐图房型的明细读取与创建，以及带测试时间、实际请求功能与家具条件的一行一 Run 建档、附件上传、成功/失败回写、结果附件 token/字节数回读校验、轻量结果预览和最新测试优先视图链接
 * [POS]: src 的 Beta跑图独立持久化边界，以样本集→样本→跑图明细组织资产，以测试时间分组隔离各批结果，并以飞书成功状态和结果附件回读共同裁决完成态
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";

import {
  createImagePreviewDataUrl,
  extensionForImageFormat,
  loadImageBytes,
} from "./image-artifact.mjs";
import { runLarkCli } from "./lark-cli.mjs";
import { actualImageSize, buildRecordFields, recordIdFrom } from "./lark-sync.mjs";

export const BETA_BASE_CONFIG = Object.freeze({
  baseToken: process.env.BETA_BASE_TOKEN || "ORwJbt5EYauNORsrhqJcpetLnEb",
  baseUrl: process.env.BETA_BASE_URL
    || "https://lq9n5lvfn2i.feishu.cn/base/ORwJbt5EYauNORsrhqJcpetLnEb",
  cliPath: process.env.LARK_CLI_PATH || "lark-cli",
  inputFieldId: process.env.BETA_INPUT_FIELD_ID || "fldcEwglW6",
  resultFieldId: process.env.BETA_RESULT_FIELD_ID || "fldPHrJeCe",
  sampleImageFieldId: process.env.BETA_SAMPLE_IMAGE_FIELD_ID || "flda615mNm",
  sampleSetTableId: process.env.BETA_SAMPLE_SET_TABLE_ID || "tblQmKbAHOCPcct7",
  sampleTableId: process.env.BETA_SAMPLE_TABLE_ID || "tblZHiPlolFYcG1t",
  styleReferenceFieldId: process.env.BETA_STYLE_REFERENCE_FIELD_ID || "fldqe5gRKY",
  tableId: process.env.BETA_TABLE_ID || "tblrue5KUj7VNDD2",
  testTimeFieldId: process.env.BETA_TEST_TIME_FIELD_ID || "fld71lZlMH",
  viewId: process.env.BETA_VIEW_ID || "vewGYQGQ1U",
});

const FEATURE_LABELS = Object.freeze({
  effectEnhancement: "效果图美化",
  emptyRoom: "空房设计",
  free: "自由生图",
  refinedModel: "精模渲染",
  whiteModel: "白模渲染",
});

function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) =>
    entry !== undefined && entry !== null && entry !== ""));
}

function selectValue(value) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function linkRecordIds(value) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => typeof entry === "string"
    ? entry
    : entry?.record_id || entry?.recordId || entry?.id).filter(Boolean);
}

function parseRecordPage(body) {
  if (body?.ok !== true || !Array.isArray(body?.data?.data)) {
    throw new Error("飞书 Beta 表返回格式不正确");
  }
  const fields = body.data.fields || [];
  const recordIds = body.data.record_id_list || [];
  return body.data.data.map((row, index) => ({
    fields: Object.fromEntries(fields.map((field, fieldIndex) => [field, row[fieldIndex]])),
    recordId: recordIds[index],
  }));
}

export function betaFeatureLabel(featureMode) {
  const label = FEATURE_LABELS[String(featureMode || "")];
  if (!label) throw new TypeError("Beta跑图功能不受支持");
  return label;
}

export function betaSceneParameters(input = {}) {
  return compactObject({
    featureMode: input.featureMode,
    furnitureSelection: input.furnitureSelection,
    effectTime: input.effectTime,
    effectWeather: input.effectWeather,
    renderMode: input.renderMode,
    roomType: input.roomType,
    roomTypeDetail: input.roomTypeDetail,
    styleCode: input.styleCode,
  });
}

export function betaConfigSnapshot(input = {}) {
  return compactObject({
    emptyRoomPromptAgentVersion: input.emptyRoomPromptAgentVersion,
    emptyRoomSmartDefaultVersion: input.emptyRoomSmartDefaultVersion,
    modelKey: input.modelKey,
    outputFormat: input.outputFormat,
    promptAgentModelKey: input.promptAgentModelKey,
    promptAgentVersion: input.promptAgentVersion,
    promptVersion: input.promptVersion,
    quality: input.quality,
    ratio: input.ratio,
    ratioMode: input.ratioMode,
    resolution: input.resolution,
    smartDefaultAgentVersion: input.smartDefaultAgentVersion,
  });
}

export function betaResultVersion(result = {}) {
  const values = [
    result.prompt?.code && result.prompt?.version
      ? `${result.prompt.code}@v${result.prompt.version}`
      : null,
    result.promptAgent?.version ? `Prompt Agent v${result.promptAgent.version}` : null,
    result.style?.code && result.style?.version
      ? `${result.style.code}@v${result.style.version}`
      : null,
  ].filter(Boolean);
  return values.join(" · ");
}

export function betaResultCostUsd(result = {}) {
  const value = Number(
    result.upstream?.metadata?.costUsd
      ?? result.upstream?.metadata?.usageCost?.costUsd,
  );
  return Number.isFinite(value) && value >= 0 ? value : null;
}

// 仅供 Beta 服务端归档消费，不写旧表，也不进入浏览器任务快照。
export function captureBetaGenerationArchive(input) {
  const fields = buildRecordFields(input);
  return {
    generationId: null,
    status: "skipped",
    archiveFields: compactObject({
      "场景标签": [fields["空间类型"], fields["其他空间类型"]].filter(Boolean),
      "最终 Prompt": fields["最终 Prompt"],
      "设计方式": fields["设计方式"],
      "风格选择": fields["风格选择"],
      "家具选择": fields["家具选择"],
      "Prompt融合": fields["Prompt融合"],
      "Agent 编码": fields["Agent 编码"],
      "Agent 版本": fields["Agent 版本"],
      "生成参数": fields["生成参数"],
    }),
  };
}

export function buildBetaRunFields({ batchId, featureMode, item, testTime }) {
  const attempt = Number(item.attempt || 1);
  return {
    "Run ID": String(item.runId || ""),
    "批次 ID": String(batchId || ""),
    "测试时间": String(testTime || ""),
    "功能": betaFeatureLabel(featureMode),
    "样本 ID": String(item.caseId || ""),
    "状态": "运行中",
    "输入文本": String(item.input?.prompt || "").trim(),
    "场景参数": JSON.stringify(betaSceneParameters(item.input)),
    "配置快照": JSON.stringify(betaConfigSnapshot(item.input)),
    "出图模型": String(item.modelLabel || item.input?.modelKey || ""),
    "Prompt / 工作流版本": "",
    "Attempt": Number.isInteger(attempt) && attempt > 0 ? attempt : 1,
    "错误信息": "",
  };
}

function recordUrl(config, recordId) {
  const url = new URL(config.baseUrl);
  url.searchParams.set("table", config.tableId);
  if (config.viewId) url.searchParams.set("view", config.viewId);
  if (recordId) url.searchParams.set("record", recordId);
  return url.toString();
}

async function createRecord(run, config, fields, tableId = config.tableId) {
  const entries = Object.entries(fields);
  const body = await run(config, [
    "base", "+record-batch-create", "--as", "user",
    "--base-token", config.baseToken,
    "--table-id", tableId,
    "--json", JSON.stringify({
      fields: entries.map(([field]) => field),
      rows: [entries.map(([, value]) => value)],
    }),
  ]);
  const recordId = recordIdFrom(body);
  if (!recordId) throw new Error("Beta跑图 Base 已响应，但没有返回记录 ID");
  return recordId;
}

function updateRecord(run, config, recordId, fields, tableId = config.tableId) {
  return run(config, [
    "base", "+record-upsert", "--as", "user",
    "--base-token", config.baseToken,
    "--table-id", tableId,
    "--record-id", recordId,
    "--json", JSON.stringify(fields),
  ]);
}

async function uploadAttachments(
  run,
  config,
  recordId,
  fieldId,
  files,
  cwd,
  tableId = config.tableId,
) {
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

async function listRecords(run, config, tableId, fields) {
  const records = [];
  let offset = 0;
  while (true) {
    const args = [
      "base", "+record-list", "--as", "user",
      "--base-token", config.baseToken,
      "--table-id", tableId,
    ];
    fields.forEach((field) => args.push("--field-id", field));
    args.push("--limit", "200", "--offset", String(offset), "--format", "json");
    const body = await run(config, args);
    records.push(...parseRecordPage(body));
    if (!body.data.has_more) return records;
    offset += 200;
  }
}

async function getRecord(run, config, tableId, recordId, fields) {
  const args = [
    "base", "+record-get", "--as", "user",
    "--base-token", config.baseToken,
    "--table-id", tableId,
    "--record-id", recordId,
  ];
  fields.forEach((field) => args.push("--field-id", field));
  args.push("--format", "json");
  const body = await run(config, args);
  return parseRecordPage(body)[0] || null;
}

function safeFileName(value, fallback) {
  return String(value || fallback)
    .replace(/[^\p{L}\p{N}._ -]/gu, "")
    .trim()
    .slice(0, 100) || fallback;
}

async function materializeImages(images, directory, prefix) {
  const files = [];
  for (const [index, image] of (images || []).entries()) {
    const source = image?.dataUrl || image?.imageUrl || image?.url;
    if (!source) continue;
    const mimeType = String(image.type || image.mimeType || "image/png");
    const extension = mimeType === "image/jpeg" ? "jpg" : mimeType.split("/")[1] || "png";
    const file = `${prefix}-${index + 1}-${safeFileName(image.name || image.fileName, `image.${extension}`)}`;
    await writeFile(join(directory, file), await loadImageBytes(source));
    files.push(file);
  }
  return files;
}

function mimeTypeFromFileName(fileName) {
  const extension = extname(String(fileName || "")).toLowerCase();
  const types = {
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
  };
  const type = types[extension];
  if (!type) throw new Error(`不支持的样本附件格式：${extension || "未知"}`);
  return type;
}

async function downloadAttachment(run, config, { attachment, recordId }) {
  const directory = await mkdtemp(join(tmpdir(), "canvas-lab-beta-sample-"));
  const extension = extname(attachment.name || "").toLowerCase() || ".png";
  const fileName = `sample${extension}`;
  try {
    await run(config, [
      "base", "+record-download-attachment", "--as", "user",
      "--base-token", config.baseToken,
      "--table-id", config.sampleTableId,
      "--record-id", recordId,
      "--file-token", attachment.file_token,
      "--output", fileName,
      "--overwrite",
      "--format", "json",
    ], { cwd: directory });
    const bytes = await readFile(join(directory, fileName));
    const type = mimeTypeFromFileName(attachment.name);
    return {
      dataUrl: `data:${type};base64,${bytes.toString("base64")}`,
      name: attachment.name,
      size: bytes.length,
      type,
    };
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

export function createBetaBaseStore({
  config = BETA_BASE_CONFIG,
  run = runLarkCli,
} = {}) {
  return {
    config: {
      baseUrl: recordUrl(config),
      sampleSetTableId: config.sampleSetTableId,
      sampleTableId: config.sampleTableId,
      tableId: config.tableId,
      viewId: config.viewId,
    },
    async listSampleSets() {
      const rows = await listRecords(run, config, config.sampleSetTableId, [
        "样本集 ID", "名称", "功能", "状态", "样本数量", "说明",
      ]);
      return rows.map(({ fields, recordId }) => ({
        featureMode: Object.entries(FEATURE_LABELS)
          .find(([, label]) => label === selectValue(fields["功能"]))?.[0] || null,
        name: String(fields["名称"] || "").trim(),
        recordId,
        sampleCount: Number(fields["样本数量"]) || 0,
        sampleSetId: String(fields["样本集 ID"] || "").trim(),
        status: selectValue(fields["状态"]),
      })).filter((entry) => entry.sampleSetId && entry.status === "可用");
    },
    async getSampleSet(sampleSetId) {
      const sets = await this.listSampleSets();
      const sampleSet = sets.find((entry) => entry.sampleSetId === sampleSetId);
      if (!sampleSet) return null;
      const rows = await listRecords(run, config, config.sampleTableId, [
        "样本 ID", "样本集", "样本图", "提示词", "文件名", "状态", "空间类型", "其他空间类型",
      ]);
      const matching = rows.filter(({ fields }) =>
        selectValue(fields["状态"]) === "可用"
        && linkRecordIds(fields["样本集"]).includes(sampleSet.recordId));
      const samples = [];
      for (const { fields, recordId } of matching) {
        const attachments = Array.isArray(fields["样本图"]) ? fields["样本图"] : [];
        samples.push({
          image: attachments[0]
            ? await downloadAttachment(run, config, { attachment: attachments[0], recordId })
            : null,
          roomType: selectValue(fields["空间类型"]) || "",
          roomTypeDetail: String(fields["其他空间类型"] || "").trim(),
          prompt: String(fields["提示词"] || "").trim(),
          recordId,
          sampleId: String(fields["样本 ID"] || "").trim(),
        });
      }
      return { ...sampleSet, samples };
    },
    async createSampleSet({ featureMode, name, samples }) {
      const sampleSetId = `SET-${randomUUID().slice(0, 12).toUpperCase()}`;
      const sampleSetRecordId = await createRecord(run, config, {
        "样本集 ID": sampleSetId,
        "名称": name,
        "功能": betaFeatureLabel(featureMode),
        "状态": "可用",
        "样本数量": samples.length,
      }, config.sampleSetTableId);
      for (const [index, sample] of samples.entries()) {
        const sampleId = `${sampleSetId}-${String(index + 1).padStart(3, "0")}`;
        const recordId = await createRecord(run, config, {
          "样本 ID": sampleId,
          "样本集": [sampleSetRecordId],
          ...(featureMode === "emptyRoom" ? { "空间类型": sample.roomType, "其他空间类型": sample.roomTypeDetail || "" } : {}),
          "提示词": sample.prompt || "",
          "文件名": sample.image?.name || "",
          "状态": "可用",
        }, config.sampleTableId);
        if (!sample.image) continue;
        const directory = await mkdtemp(join(tmpdir(), "canvas-lab-beta-library-"));
        try {
          const extension = sample.image.type === "image/jpeg"
            ? "jpg" : sample.image.type.split("/")[1] || "png";
          const fileName = `${sampleId}.${extension}`;
          await writeFile(join(directory, fileName), await loadImageBytes(sample.image.dataUrl));
          await uploadAttachments(
            run,
            config,
            recordId,
            config.sampleImageFieldId,
            [fileName],
            directory,
            config.sampleTableId,
          );
        } finally {
          await rm(directory, { force: true, recursive: true });
        }
      }
      return this.getSampleSet(sampleSetId);
    },
    async beginRun({ batchId, featureMode, item, testTime }) {
      const recordId = await createRecord(
        run,
        config,
        buildBetaRunFields({ batchId, featureMode, item, testTime }),
      );
      const directory = await mkdtemp(join(tmpdir(), "canvas-lab-beta-"));
      try {
        const inputFiles = await materializeImages(
          item.input?.referenceImages,
          directory,
          "input",
        );
        const styleFiles = await materializeImages(
          item.input?.styleReferenceImages,
          directory,
          "style",
        );
        await uploadAttachments(
          run,
          config,
          recordId,
          config.inputFieldId,
          inputFiles,
          directory,
        );
        await uploadAttachments(
          run,
          config,
          recordId,
          config.styleReferenceFieldId,
          styleFiles,
          directory,
        );
      } finally {
        await rm(directory, { force: true, recursive: true });
      }
      return { recordId, recordUrl: recordUrl(config, recordId) };
    },
    async completeRun(recordId, result) {
      const directory = await mkdtemp(join(tmpdir(), "canvas-lab-beta-result-"));
      let previewUrl;
      let resultBytes;
      try {
        const image = result.images?.[0];
        if (!image?.url) throw new Error("Beta跑图没有可归档的结果图");
        const format = result.request?.outputFormat || result.upstream?.outputFormat || "png";
        const file = `result.${extensionForImageFormat(format) || "png"}`;
        resultBytes = await loadImageBytes(image.url);
        await updateRecord(run, config, recordId, {
          ...(result.sync?.archiveFields || {}),
          "尺寸": actualImageSize(resultBytes),
        });
        previewUrl = await createImagePreviewDataUrl(resultBytes);
        await writeFile(join(directory, file), resultBytes);
        await uploadAttachments(
          run,
          config,
          recordId,
          config.resultFieldId,
          [file],
          directory,
        );
      } finally {
        await rm(directory, { force: true, recursive: true });
      }
      const costUsd = betaResultCostUsd(result);
      await updateRecord(run, config, recordId, {
        "状态": "成功",
        "Prompt / 工作流版本": betaResultVersion(result),
        "时延（ms）": Math.round(Number(result.durationMs) || 0),
        ...(costUsd == null ? {} : { "费用（USD）": costUsd }),
        "错误信息": "",
      });
      const archived = await getRecord(
        run,
        config,
        config.tableId,
        recordId,
        ["状态", "结果图", ...Object.keys(result.sync?.archiveFields || {})],
      );
      for (const [field, value] of Object.entries(result.sync?.archiveFields || {})) {
        if (String(archived?.fields?.[field] ?? "") !== String(value)) {
          throw new Error(`飞书生成信息回读不一致：${field}`);
        }
      }
      const resultAttachment = archived?.fields?.["结果图"]?.[0];
      if (selectValue(archived?.fields?.["状态"]) !== "成功"
        || !resultAttachment?.file_token
        || Number(resultAttachment.size) !== resultBytes.length) {
        throw new Error("飞书结果附件校验失败");
      }
      return {
        attachment: {
          fileToken: resultAttachment.file_token,
          name: resultAttachment.name,
          size: Number(resultAttachment.size),
        },
        previewUrl,
        recordId,
        recordUrl: recordUrl(config, recordId),
      };
    },
    async failRun(recordId, error) {
      await updateRecord(run, config, recordId, {
        "状态": "失败",
        "错误信息": String(error?.message || "跑图失败").slice(0, 1000),
      });
      return { recordId, recordUrl: recordUrl(config, recordId) };
    },
  };
}

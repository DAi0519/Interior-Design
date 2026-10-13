/**
 * [INPUT]: 依赖 Beta 三表、beta-sample-store.mjs 逐张资产边界、beta-base-schema.mjs 实时合同、lark-cli.mjs 与图片产物基础设施，接收样本集、已冻结 Run、附件和正式生成结果
 * [OUTPUT]: 对外提供三表 Schema 准入、七功能映射与强度色调/独立全景版本快照、全部实际写入字段及结果附件归档回读、样本草稿/单图保存/元数据/按需图片读取、Run 建档与轻量预览；合同错误不可重试
 * [POS]: src 的 Beta跑图独立持久化边界，以样本集→样本→跑图明细组织资产，以测试时间分组隔离各批结果，并以飞书成功状态和结果附件回读共同裁决完成态
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createImagePreviewDataUrl,
  extensionForImageFormat,
  loadImageBytes,
} from "./image-artifact.mjs";
import { runLarkCli } from "./lark-cli.mjs";
import { createBetaSampleStore } from "./beta-sample-store.mjs";
import { betaBaseContractError, normalizeBetaBaseError, verifyBetaBaseSchema } from "./beta-base-schema.mjs";
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
  effectEnhancement: "效果图氛围转换",
  effectBeautification: "效果图美化",
  panoramaEnhancement: "全景图美化",
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
    effectBeautification: input.effectBeautification,
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
    effectBeautificationPromptVersion: input.effectBeautificationPromptVersion,
    panoramaPromptVersion: input.panoramaPromptVersion,
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

export function createBetaBaseStore({
  config = BETA_BASE_CONFIG,
  run: executeCli = runLarkCli,
} = {}) {
  const runFields = new Map();
  const run = async (...args) => {
    try { return await executeCli(...args); }
    catch (error) { throw normalizeBetaBaseError(error); }
  };
  return {
    verifySchema() {
      return verifyBetaBaseSchema({ config, featureLabels: Object.values(FEATURE_LABELS), run });
    },
    config: {
      baseUrl: recordUrl(config),
      sampleSetTableId: config.sampleSetTableId,
      sampleTableId: config.sampleTableId,
      tableId: config.tableId,
      viewId: config.viewId,
    },
    ...createBetaSampleStore({ config, run, featureLabels: FEATURE_LABELS, createRecord, updateRecord,
      listRecords, getRecord, uploadAttachments }),
    async beginRun({ batchId, featureMode, item, testTime }) {
      const fields = buildBetaRunFields({ batchId, featureMode, item, testTime });
      const recordId = await createRecord(
        run,
        config,
        fields,
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
      runFields.set(recordId, fields);
      return { recordId, recordUrl: recordUrl(config, recordId) };
    },
    async completeRun(recordId, result) {
      const directory = await mkdtemp(join(tmpdir(), "canvas-lab-beta-result-"));
      let previewUrl;
      let resultBytes;
      let generatedFields;
      try {
        const image = result.images?.[0];
        if (!image?.url) throw new Error("Beta跑图没有可归档的结果图");
        const format = result.request?.outputFormat || result.upstream?.outputFormat || "png";
        const file = `result.${extensionForImageFormat(format) || "png"}`;
        resultBytes = await loadImageBytes(image.url);
        generatedFields = {
          ...(result.sync?.archiveFields || {}),
          "尺寸": actualImageSize(resultBytes),
        };
        await updateRecord(run, config, recordId, generatedFields);
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
      const completionFields = {
        "状态": "成功",
        "Prompt / 工作流版本": betaResultVersion(result),
        "时延（ms）": Math.round(Number(result.durationMs) || 0),
        ...(costUsd == null ? {} : { "费用（USD）": costUsd }),
        "错误信息": "",
      };
      await updateRecord(run, config, recordId, completionFields);
      const expectedFields = { ...(runFields.get(recordId) || {}), ...generatedFields, ...completionFields };
      const archived = await getRecord(
        run,
        config,
        config.tableId,
        recordId,
        ["结果图", ...Object.keys(expectedFields)],
      );
      for (const [field, value] of Object.entries(expectedFields)) {
        if (String(archived?.fields?.[field] ?? "") !== String(value)) {
          throw betaBaseContractError(`飞书生成信息回读不一致：${field}`);
        }
      }
      const resultAttachment = archived?.fields?.["结果图"]?.[0];
      if (selectValue(archived?.fields?.["状态"]) !== "成功"
        || !resultAttachment?.file_token
        || Number(resultAttachment.size) !== resultBytes.length) {
        throw betaBaseContractError("飞书结果附件校验失败");
      }
      runFields.delete(recordId);
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
      runFields.delete(recordId);
      await updateRecord(run, config, recordId, {
        "状态": "失败",
        "错误信息": String(error?.message || "跑图失败").slice(0, 1000),
      });
      return { recordId, recordUrl: recordUrl(config, recordId) };
    },
  };
}

/**
 * [INPUT]: 依赖模型/图片输入Agent/精模三方式冻结资产与共享双图判定、扩图真源、全景及超分独立归档合同、Beta三表和图片基础设施
 * [OUTPUT]: 对外提供三表Schema/十功能快照、精模图序及全景光影卡片/执行图/原图与结果SHA归档回读、KS固定5K/20MP纯合同和旧归档恢复
 * [POS]: src 的 Beta跑图独立持久化边界，以样本集→样本→跑图明细组织资产，以测试时间分组隔离各批结果，并以飞书成功状态和结果附件回读共同裁决完成态
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";

import {
  createImagePreviewDataUrl,
  extensionForImageFormat,
  loadImageBytes,
} from "./image-artifact.mjs";
import { runLarkCli } from "./lark-cli.mjs";
import { createBetaSampleStore } from "./beta-sample-store.mjs";
import { betaBaseContractError, normalizeBetaBaseError, verifyBetaBaseSchema } from "./beta-base-schema.mjs";
import { actualImageSize, buildRecordFields, recordIdFrom } from "./lark-sync.mjs";
import { publicAgentModelCatalog } from "./agent-model-config.mjs";
import { MODEL_CONFIGS, publicModelCatalog } from "./model-config.mjs";
import { ONEAPI_OUTPAINT_ENGINE_KEY } from "./image-outpaint-oneapi.mjs";
import { QWEN_OUTPAINT_ENGINE_KEY, QWEN_OUTPAINT_WORKFLOW } from "./image-outpaint-qwen.mjs";
import { resolveImageOutpaintModel } from "./image-outpaint-workflow.mjs";
import { imageUpscaleWorkflow } from "./image-upscale-workflow.mjs";
import { isLegacyKsArchive, verifyUpscaleArchive as verifyUpscaleArchiveContract } from "./beta-upscale-archive-contract.mjs";
import { hasRefinedLightingInput, resolveRefinedLightingInput } from "./refined-lighting.mjs";
import { isLightingReference } from "../public/refined-flux-reference.js";
import { panoramaArchiveSnapshot, verifyPanoramaArchive } from "./beta-panorama-archive-contract.mjs";

async function lightingReferences(input, featureMode = input?.featureMode, resolveLighting = resolveRefinedLightingInput) {
  if (featureMode === "refinedModel" && hasRefinedLightingInput(input)) {
    if (input.refinedLighting?.mode === "preset" && isLightingReference(input.refinedLighting)) {
      return (await resolveLighting(input)).referenceImages;
    }
    return input.refinedLighting?.execution === "prompt-only" ? [] : input.lightingReferenceImages;
  }
  return input?.styleReferenceImages;
}

function verifyLightingArchive(fields, frozen) {
  const expected = frozen?.refinedLighting;
  if (!expected) return;
  let parameters;
  try { parameters = JSON.parse(fields["生成参数"]); }
  catch { throw betaBaseContractError("精模光影缺少实际生成参数"); }
  const actual = parameters.workflow?.refinedLighting;
  const promptOnly = expected.execution === "prompt-only";
  const expectedCount = promptOnly || expected.mode === "original" ? 1 : 2;
  const invalidReference = promptOnly
    ? actual?.reference != null || !isDeepStrictEqual(actual?.imageRoles, { source: 1 })
    : expected.mode !== "original" && (actual?.reference?.sha256 !== expected.referenceSha256
      || !isDeepStrictEqual(actual?.imageRoles, { source: 1, atmosphere: 2 }));
  if (!actual || Object.entries(expected).some(([key, value]) => !isDeepStrictEqual(actual[key], value))
    || !/^[a-f0-9]{64}$/.test(actual.source?.sha256 || "")
    || parameters.referenceImageCount !== expectedCount || invalidReference) {
    throw betaBaseContractError("精模光影实际来源、版本、图序或图片摘要与冻结配置不一致");
  }
}

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
  imageOutpaint: "AI扩图",
  imageUpscale: "AI超分",
  refinedModel: "精模渲染",
  styleTransfer: "风格转换",
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
    refinedRender: input.featureMode === "refinedModel" ? input.refinedRender : undefined,
    refinedLighting: input.featureMode === "refinedModel" ? input.refinedLighting : undefined,
    renderMode: input.renderMode,
    roomType: input.roomType,
    roomTypeDetail: input.roomTypeDetail,
    styleCode: input.featureMode !== "styleTransfer" || input.renderMode === "style-dna" ? input.styleCode : undefined,
    styleReferenceUsed: input.featureMode === "styleTransfer" ? Boolean(input.styleReferenceImages?.length)
      : input.featureMode === "refinedModel" && hasRefinedLightingInput(input) ? Boolean(input.lightingReferenceImages?.length) : undefined,
    outpaintCanvas: input.featureMode === "imageOutpaint" ? input.outpaintCanvas : undefined,
    upscaleWorkflowKey: input.featureMode === "imageUpscale" ? input.upscaleWorkflowKey : undefined,
  });
}

export function betaConfigSnapshot(input = {}) {
  return compactObject({
    emptyRoomPromptAgentVersion: input.emptyRoomPromptAgentVersion,
    emptyRoomSmartDefaultVersion: input.emptyRoomSmartDefaultVersion,
    modelKey: input.modelKey,
    outpaintEngine: input.featureMode === "imageOutpaint" ? input.outpaintEngine : undefined,
    outpaintModel: input.featureMode === "imageOutpaint" ? input.outpaintModel : undefined,
    outpaintWorkflowKey: input.featureMode === "imageOutpaint" ? input.outpaintWorkflowKey : undefined,
    outpaintCanvas: input.featureMode === "imageOutpaint" ? input.outpaintCanvas : undefined,
    upscaleWorkflowKey: input.featureMode === "imageUpscale" ? input.upscaleWorkflowKey : undefined,
    upscaleWorkflowVersion: input.featureMode === "imageUpscale"
      ? input.upscaleWorkflowVersion ?? imageUpscaleWorkflow(input.upscaleWorkflowKey).version : undefined,
    outputFormat: input.outputFormat,
    promptAgentModelKey: input.promptAgentModelKey,
    promptAgentVersion: input.promptAgentVersion,
    promptVersion: input.promptVersion,
    promptCode: input.featureMode === "refinedModel" ? input.promptCode : undefined,
    refinedPromptSha256: input.featureMode === "refinedModel" ? input.refinedPromptSha256 : undefined,
    refinedLighting: input.featureMode === "refinedModel" ? input.refinedLighting : undefined,
    refinedAtmospherePromptVersion: input.featureMode === "refinedModel" ? input.refinedAtmospherePromptVersion : undefined,
    refinedAtmospherePromptSha256: input.featureMode === "refinedModel" ? input.refinedAtmospherePromptSha256 : undefined,
    effectBeautificationPromptVersion: input.effectBeautificationPromptVersion,
    panoramaPromptVersion: input.panoramaPromptVersion,
    panoramaLighting: input.featureMode === "panoramaEnhancement" ? input.panoramaLighting : undefined,
    ...panoramaArchiveSnapshot(input),
    quality: input.quality,
    ratio: input.ratio,
    ratioMode: input.ratioMode,
    resolution: input.resolution,
    smartDefaultAgentVersion: input.smartDefaultAgentVersion,
    styleTransferPromptAgentVersion: input.renderMode === "style-dna" ? input.styleTransferPromptAgentVersion : undefined,
    styleTransferReferenceVersion: input.renderMode === "style-reference" ? input.styleTransferReferenceVersion : undefined,
  });
}

export function betaResultVersion(result = {}) {
  const workflowVersion = result.upstream?.metadata?.workflowVersion || result.workflow?.version;
  const workflowKey = result.upstream?.metadata?.workflowId || result.workflow?.key;
  const atmospherePrompt = result.atmospherePrompt || result.workflow?.atmospherePrompt;
  const lighting = result.refinedLighting || result.workflow?.refinedLighting;
  const panoramaLighting = result.panoramaLighting || result.workflow?.panoramaLighting || result.request?.panoramaLighting;
  const values = [
    workflowKey && workflowVersion ? `${workflowKey}@${workflowVersion}` : null,
    result.prompt?.code && result.prompt?.version
      ? `${result.prompt.code}@v${result.prompt.version}`
      : null,
    atmospherePrompt?.code && atmospherePrompt?.version
      ? `${atmospherePrompt.code}@v${atmospherePrompt.version}`
      : null,
    result.promptAgent?.version ? `Prompt Agent v${result.promptAgent.version}` : null,
    result.style?.code && result.style?.version
      ? `${result.style.code}@v${result.style.version}`
      : null,
    ...[lighting?.rule, lighting?.preset].map(asset => asset?.code && asset?.version ? `${asset.code}@v${asset.version}` : null),
    panoramaLighting?.preset?.code && panoramaLighting.preset.version
      ? `${panoramaLighting.preset.code}@v${panoramaLighting.preset.version}` : null,
    lighting?.mode === "preset" && isLightingReference(lighting) ? lighting.execution : null,
  ].filter(Boolean);
  return [...new Set(values)].join(" · ");
}

export function betaResultCostUsd(result = {}) {
  const raw = result.upstream?.metadata?.costUsd
      ?? result.upstream?.metadata?.usageCost?.costUsd
      ?? result.upstream?.usageCost?.costUsd;
  if (raw == null || raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

// 仅供 Beta 服务端归档消费，不写旧表，也不进入浏览器任务快照。
export function captureBetaGenerationArchive(input) {
  const fields = buildRecordFields(input);
  return {
    generationId: null,
    status: "skipped",
    archiveFields: { ...compactObject({
      "场景标签": [fields["空间类型"], fields["其他空间类型"]].filter(Boolean),
      "最终 Prompt": fields["最终 Prompt"],
      "设计方式": fields["设计方式"],
      "风格选择": fields["风格选择"],
      "家具选择": fields["家具选择"],
      "Prompt融合": fields["Prompt融合"],
      "Agent 编码": fields["Agent 编码"],
      "Agent 版本": fields["Agent 版本"],
      "生成参数": fields["生成参数"],
    }), ...(input.workflow?.feature === "image-upscale" ? { "最终 Prompt": "" } : {}) },
  };
}

function runModelLabel(item, featureMode) {
  if (featureMode === "imageUpscale") {
    try {
      const workflow = imageUpscaleWorkflow(item.input?.upscaleWorkflowKey);
      if (item.input.modelKey != null && item.input.modelKey !== workflow.key) throw new Error("模型与工作流不一致");
      return workflow.label;
    } catch (cause) { throw betaBaseContractError("Beta 超分工作流缺少合法的目录标签", cause); }
  }
  if (featureMode === "imageOutpaint") {
    const engine = item.input?.outpaintEngine ?? "comfyui";
    if (engine === QWEN_OUTPAINT_ENGINE_KEY) return QWEN_OUTPAINT_WORKFLOW.label;
    if (engine === ONEAPI_OUTPAINT_ENGINE_KEY) return MODEL_CONFIGS[engine].label;
    if (engine === "comfyui") {
      try { return resolveImageOutpaintModel(item.input?.outpaintModel).label; }
      catch (cause) { throw betaBaseContractError("Beta 扩图模型缺少合法的目录标签", cause); }
    }
    throw betaBaseContractError("Beta 扩图引擎缺少合法的目录标签");
  }
  const catalog = publicModelCatalog();
  const model = catalog.find((entry) => entry.key === item.input?.modelKey)
    || catalog.find((entry) => entry.label === item.modelLabel);
  if (!model) throw betaBaseContractError("Beta 出图模型缺少合法的目录标签");
  return model.label;
}

function promptModelLabel(value) {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw betaBaseContractError("Beta Prompt融合必须是单个模型标签");
  const label = value.trim();
  if (!label) return null;
  if (!publicAgentModelCatalog().some((model) => model.imageInput && model.label === label)) {
    throw betaBaseContractError(`Beta Prompt融合不在图片输入 Agent 目录：${label}`);
  }
  return label;
}

export function buildBetaRunFields({ batchId, featureMode, item, testTime }) {
  const attempt = Number(item.attempt || 1);
  const input = ["imageUpscale", "panoramaEnhancement"].includes(featureMode) ? { ...item.input, featureMode } : item.input;
  const modelLabel = runModelLabel(item, featureMode);
  return {
    "Run ID": String(item.runId || ""),
    "批次 ID": String(batchId || ""),
    "测试时间": String(testTime || ""),
    "功能": betaFeatureLabel(featureMode),
    "样本 ID": String(item.caseId || ""),
    "状态": "运行中",
    "输入文本": String(item.input?.prompt || "").trim(),
    "场景参数": JSON.stringify(betaSceneParameters(input)),
    "配置快照": JSON.stringify(betaConfigSnapshot(input)),
    "出图模型": modelLabel,
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

function assertAttachmentReadback(fields, name, expectedSizes) {
  const attachments = fields?.[name] ?? [];
  if (!Array.isArray(attachments) || attachments.length !== expectedSizes.length
    || expectedSizes.some((size, index) => !attachments[index]?.file_token || Number(attachments[index].size) !== size)) {
    throw betaBaseContractError(`飞书${name}附件数量、token 或字节数回读不一致`);
  }
}

function verifyMetadata(fields, expected) {
  for (const [field, value] of Object.entries(expected)) {
    const actual = fields?.[field];
    if (["状态", "出图模型", "Prompt融合"].includes(field) && Array.isArray(actual) && actual.length > 1) {
      throw betaBaseContractError(`飞书标签回读不是单选：${field}`);
    }
    if (["场景参数", "配置快照", "生成参数"].includes(field)) {
      try { if (isDeepStrictEqual(JSON.parse(actual), JSON.parse(value))) continue; } catch { /* 非 JSON 仍按原值拒绝。 */ }
    }
    if (typeof value === "number" && actual != null && actual !== "") {
      const number = Number(actual);
      if (Number.isFinite(number) && Math.abs(number - value) <= Number.EPSILON * Math.max(1, Math.abs(value)) * 8) continue;
    }
    if (String(actual ?? "") !== String(value ?? "")) throw betaBaseContractError(`飞书生成信息回读不一致：${field}`);
  }
}

// -------- 超分纯合同独立维护，其他归档继续共用本文件字段核验 --------
function verifyUpscaleArchive(fields, snapshot, bytes = null, options = {}) {
  return verifyUpscaleArchiveContract(fields, snapshot, bytes, { ...options, verifyMetadata });
}

export function createBetaBaseStore({
  config = BETA_BASE_CONFIG,
  run: executeCli = runLarkCli,
  resolveLighting = resolveRefinedLightingInput,
} = {}) {
  const runArchives = new Map();
  const recoveryRecords = new Map();
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
      if (featureMode === "panoramaEnhancement" && (item.input?.referenceImages?.length !== 1
        || item.input?.styleReferenceImages?.length || item.input?.lightingReferenceImages?.length)) {
        throw betaBaseContractError("全景归档需要唯一原图且不使用第二张参考图");
      }
      if (featureMode === "imageUpscale" && (item.input?.referenceImages?.length !== 1
        || item.input?.styleReferenceImages?.length)) throw betaBaseContractError("AI超分归档需要唯一原图且不使用风格参考图");
      const styleReferences = await lightingReferences(item.input, featureMode, resolveLighting);
      const fields = buildBetaRunFields({ batchId, featureMode, item, testTime });
      const recordId = await createRecord(
        run,
        config,
        fields,
      );
      const directory = await mkdtemp(join(tmpdir(), "canvas-lab-beta-"));
      let inputAttachments = null;
      try {
        const inputFiles = await materializeImages(
          item.input?.referenceImages,
          directory,
          "input",
        );
        const styleFiles = await materializeImages(
          styleReferences,
          directory,
          "style",
        );
        await uploadAttachments(
          run,
          config,
          recordId,
          config.inputFieldId,
          inputFiles.files,
          directory,
        );
        await uploadAttachments(
          run,
          config,
          recordId,
          config.styleReferenceFieldId,
          styleFiles.files,
          directory,
        );
        if (["styleTransfer", "imageOutpaint", "imageUpscale", "panoramaEnhancement"].includes(featureMode)
          || featureMode === "refinedModel" && hasRefinedLightingInput(item.input)) {
          inputAttachments = { "输入图": inputFiles.sizes, "风格参考图": styleFiles.sizes };
        }
      } finally {
        await rm(directory, { force: true, recursive: true });
      }
      runArchives.set(recordId, { fields, inputAttachments });
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
          "Prompt融合": promptModelLabel(result.sync?.archiveFields?.["Prompt融合"]),
          "尺寸": actualImageSize(resultBytes),
        };
        const frozen = runArchives.get(recordId)?.fields;
        if (frozen?.["功能"] === "精模渲染") verifyLightingArchive(generatedFields, JSON.parse(frozen["配置快照"]));
        if (frozen?.["功能"] === "全景图美化") {
          if (result.images.length !== 1) throw betaBaseContractError("全景结果必须是唯一图片");
          verifyPanoramaArchive(generatedFields, JSON.parse(frozen["配置快照"]), { bytes: resultBytes });
        }
        if (frozen?.["功能"] === "AI超分") {
          if (result.images.length !== 1) throw betaBaseContractError("AI超分结果必须是唯一图片");
          verifyUpscaleArchive({ ...generatedFields, "Prompt / 工作流版本": betaResultVersion(result) },
            JSON.parse(frozen["配置快照"]), resultBytes);
        }
        await updateRecord(run, config, recordId, generatedFields);
        previewUrl = await createImagePreviewDataUrl(resultBytes);
        await writeFile(join(directory, file), resultBytes);
        const uploadIdentity = { name: file, size: resultBytes.length,
          sha256: createHash("sha256").update(resultBytes).digest("hex") };
        const previousUpload = runArchives.get(recordId)?.resultUpload;
        let uploaded = false;
        if (previousUpload?.sha256 === uploadIdentity.sha256) {
          const previous = await getRecord(run, config, config.tableId, recordId, ["结果图"]);
          const files = previous?.fields?.["结果图"];
          uploaded = Array.isArray(files) && files.length === 1 && files[0]?.file_token
            && files[0].name === file && Number(files[0].size) === resultBytes.length;
        }
        const context = runArchives.get(recordId) || {};
        context.resultUpload = uploadIdentity;
        runArchives.set(recordId, context);
        if (!uploaded) await uploadAttachments(run, config, recordId, config.resultFieldId, [file], directory);
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
      const runArchive = runArchives.get(recordId);
      const expectedFields = { ...(runArchive?.fields || {}), ...generatedFields, ...completionFields };
      const archived = await getRecord(
        run,
        config,
        config.tableId,
        recordId,
        ["结果图", ...Object.keys(runArchive?.inputAttachments || {}), ...Object.keys(expectedFields)],
      );
      verifyMetadata(archived?.fields, expectedFields);
      if (runArchive?.inputAttachments) {
        for (const [name, sizes] of Object.entries(runArchive.inputAttachments)) {
          assertAttachmentReadback(archived?.fields, name, sizes);
        }
        assertAttachmentReadback(archived?.fields, "结果图", [resultBytes.length]);
      }
      const resultAttachment = archived?.fields?.["结果图"]?.[0];
      if (selectValue(archived?.fields?.["状态"]) !== "成功"
        || !resultAttachment?.file_token
        || Number(resultAttachment.size) !== resultBytes.length) {
        throw betaBaseContractError("飞书结果附件校验失败");
      }
      runArchives.delete(recordId);
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
    async recoverRun({ batchId, featureMode, item, testTime }) {
      if (!recoveryRecords.has(batchId)) {
        recoveryRecords.set(batchId, listRecords(run, config, config.tableId,
          ["Run ID", "批次 ID", "Attempt", "结果图"]).catch((error) => {
          recoveryRecords.delete(batchId);
          throw error;
        }));
      }
      const records = await recoveryRecords.get(batchId);
      const candidate = records.filter(({ fields }) => fields["批次 ID"] === batchId
        && (fields["Run ID"] === item.runId || String(fields["Run ID"]).startsWith(`${item.runId}-A`))
        && fields["结果图"]?.length).sort((a, b) => Number(b.fields["Attempt"]) - Number(a.fields["Attempt"]))[0];
      if (!candidate) return null;
      const runId = String(candidate.fields["Run ID"]);
      const attempt = Number(candidate.fields["Attempt"]);
      const frozen = buildBetaRunFields({ batchId, featureMode, testTime, item: { ...item, runId, attempt } });
      delete frozen["状态"];
      delete frozen["错误信息"];
      delete frozen["Prompt / 工作流版本"];
      const fieldsToRead = [...new Set([...Object.keys(frozen), "状态", "错误信息", "结果图", "输入图", "风格参考图",
        "生成参数", "最终 Prompt", "尺寸", "时延（ms）", "费用（USD）", "Prompt融合", "Prompt / 工作流版本"])];
      const archived = await getRecord(run, config, config.tableId, candidate.recordId, fieldsToRead);
      const fields = archived?.fields || {};
      if (featureMode === "imageUpscale") {
        let storedSnapshot;
        try { storedSnapshot = JSON.parse(fields["配置快照"]); }
        catch { throw betaBaseContractError("已有超分缺少可信的冻结配置"); }
        // 旧快照没有版本字段；其余冻结字段仍逐项匹配，实际历史版本稍后由产物合同核验。
        const expectedSnapshot = JSON.parse(frozen["配置快照"]);
        if (!Object.hasOwn(storedSnapshot, "upscaleWorkflowVersion")) delete expectedSnapshot.upscaleWorkflowVersion;
        else if (isLegacyKsArchive(storedSnapshot.upscaleWorkflowKey,
          storedSnapshot.upscaleWorkflowVersion, storedSnapshot.resolution)) {
          expectedSnapshot.upscaleWorkflowVersion = storedSnapshot.upscaleWorkflowVersion;
        }
        frozen["配置快照"] = JSON.stringify(expectedSnapshot);
      }
      if (featureMode === "panoramaEnhancement") {
        let stored;
        try { stored = JSON.parse(fields["配置快照"]); } catch { throw betaBaseContractError("已有全景缺少可信的冻结配置"); }
        if (!stored || typeof stored !== "object" || Array.isArray(stored)) throw betaBaseContractError("已有全景冻结配置格式不正确");
        const expected = JSON.parse(frozen["配置快照"]);
        if (stored.panoramaArchiveVersion === 1 && !expected.panoramaSource) expected.panoramaSource = stored.panoramaSource;
        if (!stored.panoramaArchiveVersion) {
          if (expected.panoramaLightingMode !== "preserve") throw betaBaseContractError("旧全景归档不能恢复新的光影目标任务");
          for (const key of Object.keys(expected).filter(key => key.startsWith("panorama") && key !== "panoramaPromptVersion")) delete expected[key];
          if (expected.resolution === "original") expected.resolution = stored.resolution;
        }
        frozen["配置快照"] = JSON.stringify(expected);
      }
      verifyMetadata(fields, frozen);
      const attachments = fields["结果图"];
      if (!Array.isArray(attachments) || attachments.length !== 1 || !attachments[0]?.file_token
        || !(Number(attachments[0].size) > 0)) throw betaBaseContractError("已有结果附件不可恢复：缺少唯一 token 或字节数");
      if (featureMode !== "free") {
        const inputs = fields["输入图"];
        if (!Array.isArray(inputs) || inputs.length !== 1 || !inputs[0]?.file_token || !(Number(inputs[0].size) > 0)) {
          throw betaBaseContractError("已有结果的输入附件不可恢复");
        }
      }
      const styleAttachments = fields["风格参考图"] || [];
      const styleCount = lightingReferences(item.input, featureMode)?.length || 0;
      if (styleAttachments.length !== styleCount || styleAttachments.some((file) => !file.file_token || !(Number(file.size) > 0))) {
        throw betaBaseContractError("已有结果的风格参考附件不可恢复");
      }
      let parameters;
      try { parameters = JSON.parse(fields["生成参数"]); }
      catch { throw betaBaseContractError("已有结果缺少可信的生成参数"); }
      const workflow = parameters.workflow || {};
      if (featureMode === "refinedModel") verifyLightingArchive(fields, JSON.parse(frozen["配置快照"]));
      if (featureMode === "panoramaEnhancement") verifyPanoramaArchive(fields, JSON.parse(frozen["配置快照"]), { recovering: true });
      if ((featureMode !== "imageUpscale" && !fields["最终 Prompt"])
        || !fields["Prompt / 工作流版本"] || !(Number(fields["时延（ms）"]) > 0)) {
        throw betaBaseContractError("已有结果缺少最终 Prompt、版本或时延");
      }
      if (featureMode === "imageUpscale") verifyUpscaleArchive(fields, JSON.parse(frozen["配置快照"]), null, { recovering: true });
      if (featureMode === "imageOutpaint") {
        if (!/^[a-f0-9]{64}$/.test(workflow.outputSha256 || "")) throw betaBaseContractError("已有扩图缺少产物 SHA-256");
        verifyMetadata(fields, { "Prompt / 工作流版本": `${workflow.workflowId}@${workflow.workflowVersion}`,
          "尺寸": `${workflow.outputWidth}x${workflow.outputHeight}` });
        if (workflow.usageCost?.costUsd != null) verifyMetadata(fields, { "费用（USD）": Number(workflow.usageCost.costUsd) });
      }
      const directory = await mkdtemp(join(tmpdir(), "canvas-lab-beta-recover-"));
      try {
        await run(config, ["base", "+record-download-attachment", "--as", "user", "--base-token", config.baseToken,
          "--table-id", config.tableId, "--record-id", candidate.recordId, "--file-token", attachments[0].file_token,
          "--output", "result-image", "--overwrite", "--format", "json"], { cwd: directory });
        const bytes = await readFile(join(directory, "result-image"));
        if (bytes.length !== Number(attachments[0].size) || actualImageSize(bytes) !== fields["尺寸"]
          || (workflow.outputSha256 && createHash("sha256").update(bytes).digest("hex") !== workflow.outputSha256)) {
          throw betaBaseContractError("已有结果附件字节数、尺寸或 SHA-256 不一致");
        }
        if (featureMode === "panoramaEnhancement") {
          const snapshot = JSON.parse(frozen["配置快照"]);
          let sourceBytes = null;
          if (snapshot.panoramaArchiveVersion === 1) {
            await run(config, ["base", "+record-download-attachment", "--as", "user", "--base-token", config.baseToken,
              "--table-id", config.tableId, "--record-id", candidate.recordId, "--file-token", fields["输入图"][0].file_token,
              "--output", "input-image", "--overwrite", "--format", "json"], { cwd: directory });
            sourceBytes = await readFile(join(directory, "input-image"));
          }
          verifyPanoramaArchive(fields, snapshot, { bytes, sourceBytes, recovering: true });
        }
      } finally { await rm(directory, { force: true, recursive: true }); }
      const completion = { "状态": "成功", "错误信息": "" };
      await updateRecord(run, config, candidate.recordId, completion);
      const confirmed = await getRecord(run, config, config.tableId, candidate.recordId, fieldsToRead);
      const expected = { ...fields, ...completion };
      delete expected["结果图"];
      delete expected["输入图"];
      delete expected["风格参考图"];
      verifyMetadata(confirmed?.fields, expected);
      for (const name of ["结果图", "输入图", "风格参考图"]) {
        assertAttachmentReadback(confirmed?.fields, name, (fields[name] || []).map((file) => Number(file.size)));
        if ((fields[name] || []).some((file, index) => file.file_token !== confirmed?.fields?.[name]?.[index]?.file_token)) {
          throw betaBaseContractError(`已有结果恢复后${name}附件 token 改变`);
        }
      }
      return { attempt, recordId: candidate.recordId, recordUrl: recordUrl(config, candidate.recordId), runId };
    },
    async failRun(recordId, error, { retainArchive = false } = {}) {
      if (!retainArchive) runArchives.delete(recordId);
      await updateRecord(run, config, recordId, {
        "状态": "失败",
        "错误信息": String(error?.message || "跑图失败").slice(0, 1000),
      });
      return { recordId, recordUrl: recordUrl(config, recordId) };
    },
  };
}

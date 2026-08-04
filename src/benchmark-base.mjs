/**
 * [INPUT]: 依赖 node:fs/os/path、benchmark-base-config/schema.mjs、image-artifact.mjs、lark-cli.mjs 与带人工准入类型及空间/五维标签的 Benchmark Base 五张运行主表
 * [OUTPUT]: 对外提供 Benchmark 配置解析/按实时单选项适配的冻结配置创建、分页快照、含空间和五个独立维度的样本录入/样本集批量重命名、Prompt/Run/横评幂等写入、按页面语义筛选飞书横评对比/运行明细/结果报告视图、参考图与结果附件读写及历史宽表回填
 * [POS]: src 的 Benchmark 飞书持久化边界，以模型结果为运行真源、横评宽表为展示派生层
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";

import {
  resolveGenerationConfigFields,
  TABLE_FIELDS,
} from "./benchmark-base-schema.mjs";
import {
  parseBenchmarkRecordPage,
  selectValue,
  validateBenchmarkBaseConfig,
} from "./benchmark-base-config.mjs";
import {
  extensionForImageFormat,
  loadImageBytes,
} from "./image-artifact.mjs";
import { runLarkCli } from "./lark-cli.mjs";
import { recordIdFrom } from "./lark-sync.mjs";

export {
  benchmarkBaseConfigFromEnv,
  parseBenchmarkRecordEnvelope,
} from "./benchmark-base-config.mjs";

const EXPERIMENT_VIEW_TARGETS = Object.freeze({
  comparison: {
    fieldName: "横评组",
    tableKey: "comparison",
    viewName: "01 横向对比（展示）",
  },
  report: {
    fieldName: "实验 ID",
    tableKey: "report",
    viewName: "01 模型总表",
  },
  results: {
    fieldName: "实验 ID",
    tableKey: "results",
    viewName: "01 运行明细",
  },
});
const REPORT_TABLE_NAME = "06 结果报告";

function mimeTypeFromName(fileName) {
  const extension = extname(String(fileName || "")).toLowerCase();
  const mimeTypes = {
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
  };
  const mimeType = mimeTypes[extension];
  if (!mimeType) throw new Error(`不支持的白模附件格式：${extension || "未知"}`);
  return mimeType;
}

function safeError(error) {
  return String(error?.message || "未知错误").slice(0, 1000);
}

function displayLabelFromResource(value) {
  return String(value || "").replace(/\s*\[[^\]]+\]\s*$/, "").trim();
}

function extensionForMimeType(mimeType) {
  const extensions = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };
  const extension = extensions[mimeType];
  if (!extension) throw new Error(`不支持的参考图 MIME：${mimeType}`);
  return extension;
}

export function createBenchmarkBaseStore(
  config,
  { run = runLarkCli } = {},
) {
  validateBenchmarkBaseConfig(config);
  const fieldSchemas = new Map();
  let baseUrl = null;
  let reportTableId = String(config.reportTableId || "").trim() || null;

  async function listRecords(tableId, fields) {
    const records = [];
    let offset = 0;
    while (true) {
      const args = [
        "base",
        "+record-list",
        "--as",
        "user",
        "--base-token",
        config.baseToken,
        "--table-id",
        tableId,
      ];
      for (const field of fields) args.push("--field-id", field);
      args.push(
        "--limit",
        "200",
        "--offset",
        String(offset),
        "--format",
        "json",
      );
      const body = await run(config, args);
      records.push(...parseBenchmarkRecordPage(body));
      if (!body.data.has_more) return records;
      offset += 200;
    }
  }

  async function tableFields(tableId) {
    let fields = fieldSchemas.get(tableId);
    if (!fields) {
      const body = await run(config, [
        "base",
        "+field-list",
        "--as",
        "user",
        "--base-token",
        config.baseToken,
        "--table-id",
        tableId,
        "--format",
        "json",
      ]);
      fields = body?.data?.fields || [];
      fieldSchemas.set(tableId, fields);
    }
    return fields;
  }

  async function fieldId(tableId, fieldName) {
    const field = (await tableFields(tableId)).find((item) => item.name === fieldName);
    const resolved = field?.id;
    if (!resolved) throw new Error(`${tableId} 缺少附件字段：${fieldName}`);
    return resolved;
  }

  async function comparisonFieldId(fieldName) {
    return fieldId(config.compareTableId, fieldName);
  }

  async function resultFieldId(fieldName) {
    return fieldId(config.resultTableId, fieldName);
  }

  async function sampleFieldId(fieldName) {
    return fieldId(config.sampleTableId, fieldName);
  }

  async function createRecord(tableId, fields) {
    const entries = Object.entries(fields);
    const body = await run(config, [
      "base",
      "+record-batch-create",
      "--as",
      "user",
      "--base-token",
      config.baseToken,
      "--table-id",
      tableId,
      "--json",
      JSON.stringify({
        fields: entries.map(([field]) => field),
        rows: [entries.map(([, value]) => value)],
      }),
      "--format",
      "json",
    ]);
    const recordId = recordIdFrom(body);
    if (!recordId) throw new Error("飞书已创建记录，但没有返回 record ID");
    return recordId;
  }

  async function upsertRecord(tableId, fields, recordId = null) {
    if (!recordId) return createRecord(tableId, fields);
    const args = [
      "base",
      "+record-upsert",
      "--as",
      "user",
      "--base-token",
      config.baseToken,
      "--table-id",
      tableId,
      "--json",
      JSON.stringify(fields),
    ];
    args.push("--record-id", recordId);
    await run(config, args);
    return recordId;
  }

  async function uploadAttachment({
    fieldId,
    fileName,
    recordId,
    tableId,
    bytes,
  }) {
    const directory = await mkdtemp(join(tmpdir(), "canvas-benchmark-upload-"));
    try {
      await writeFile(join(directory, fileName), bytes);
      await run(
        config,
        [
          "base",
          "+record-upload-attachment",
          "--as",
          "user",
          "--base-token",
          config.baseToken,
          "--table-id",
          tableId,
          "--record-id",
          recordId,
          "--field-id",
          fieldId,
          "--file",
          fileName,
          "--format",
          "json",
        ],
        { cwd: directory },
      );
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  }

  async function downloadAttachment({
    attachment,
    recordId,
    tableId,
  }) {
    const directory = await mkdtemp(join(tmpdir(), "canvas-benchmark-copy-"));
    const extension = extname(attachment.name || "").toLowerCase() || ".png";
    const fileName = `attachment${extension}`;
    try {
      await run(
        config,
        [
          "base",
          "+record-download-attachment",
          "--as",
          "user",
          "--base-token",
          config.baseToken,
          "--table-id",
          tableId,
          "--record-id",
          recordId,
          "--file-token",
          attachment.file_token,
          "--output",
          fileName,
          "--overwrite",
          "--format",
          "json",
        ],
        { cwd: directory },
      );
      return {
        bytes: await readFile(join(directory, fileName)),
        extension: extension.slice(1),
      };
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  }

  return {
    async createGenerationConfig(generationConfig) {
      try {
        const fields = resolveGenerationConfigFields(
          generationConfig,
          await tableFields(config.configTableId),
        );
        return await createRecord(config.configTableId, fields);
      } catch (error) {
        throw new Error(`冻结配置 ${generationConfig.configId} 写入 Benchmark Base 失败：${safeError(error)}`);
      }
    },

    async downloadSampleImage(sample) {
      const attachments = sample.attachments;
      if (!Array.isArray(attachments) || attachments.length !== 1) {
        throw new Error(`${sample.caseId} 必须且只能有 1 张白模参考图`);
      }
      const attachment = attachments[0];
      const mimeType = mimeTypeFromName(attachment.name);
      const directory = await mkdtemp(
        join(tmpdir(), "canvas-benchmark-input-"),
      );
      const extension = extname(attachment.name).toLowerCase();
      const fileName = `input${extension}`;
      try {
        await run(
          config,
          [
            "base",
            "+record-download-attachment",
            "--as",
            "user",
            "--base-token",
            config.baseToken,
            "--table-id",
            config.sampleTableId,
            "--record-id",
            sample.recordId,
            "--file-token",
            attachment.file_token,
            "--output",
            fileName,
            "--overwrite",
            "--format",
            "json",
          ],
          { cwd: directory },
        );
        const bytes = await readFile(join(directory, fileName));
        return {
          dataUrl: `data:${mimeType};base64,${bytes.toString("base64")}`,
          name: attachment.name,
          size: bytes.length,
          type: mimeType,
        };
      } finally {
        await rm(directory, { force: true, recursive: true });
      }
    },

    async loadSnapshot() {
      const [sampleRows, configRows, promptRows, resultRows] =
        await Promise.all([
          listRecords(config.sampleTableId, TABLE_FIELDS.samples),
          listRecords(config.configTableId, TABLE_FIELDS.configs),
          listRecords(config.promptTableId, TABLE_FIELDS.prompts),
          listRecords(config.resultTableId, TABLE_FIELDS.results),
        ]);
      const configs = configRows.map(({ fields, recordId }) => {
        const imageModel = selectValue(fields["出图模型"]);
        return {
          configId: String(fields["配置 ID"] || "").trim(),
          enabled: fields["启用"] === true,
          fusionAgent: selectValue(fields["融合 Agent"]),
          fusionModel: selectValue(fields["融合基座模型"]),
          groupId: String(fields["横评组"] || "").trim(),
          imageModel,
          imageModelLabel: displayLabelFromResource(imageModel),
          outputSpec: selectValue(fields["输出规格"]),
          perBatchImages: Number(fields["每批次每模型出图数"]),
          promptBatches: Number(fields["提示词批次数"]),
          recordId,
          styleDna: selectValue(fields["Style DNA"]),
        };
      });
      const comparisonRows = await listRecords(
        config.compareTableId,
        [
          ...TABLE_FIELDS.comparisons,
          ...new Set(configs.map((entry) => entry.imageModelLabel)),
        ],
      );

      return {
        comparisons: comparisonRows.map(({ fields, recordId }) => ({
          caseLinks: fields["关联 Case"] || [],
          compareId: String(fields["对比 ID"] || "").trim(),
          groupId: String(fields["横评组"] || "").trim(),
          modelAttachments: Object.fromEntries(
            configs.map((entry) => [
              entry.imageModelLabel,
              fields[entry.imageModelLabel] || [],
            ]),
          ),
          promptLinks: fields["提示词批次"] || [],
          referenceAttachments: fields["白模参考图"] || [],
          recordId,
        })),
        configs,
        prompts: promptRows.map(({ fields, recordId }) => ({
          error: fields["错误信息"] || "",
          finalPrompt: String(fields["融合 Prompt"] || ""),
          hash: String(fields["Prompt 哈希"] || ""),
          promptId: String(fields["Prompt ID"] || "").trim(),
          requestId: String(fields["Prompt 请求 ID"] || ""),
          recordId,
          status: selectValue(fields["融合状态"]),
          cost: Number(fields["Prompt 成本（元）"]) || null,
          durationSeconds: Number(fields["Prompt 耗时（秒）"]) || null,
        })),
        results: resultRows.map(({ fields, recordId }) => ({
          attachments: fields["生成结果图"] || [],
          attempt: Number(fields["尝试序号"]) || 1,
          caseLinks: fields["关联 Case"] || [],
          configLinks: fields["生成配置"] || [],
          durationSeconds: Number(fields["Image 耗时（秒）"]) || null,
          error: String(fields["错误信息"] || ""),
          experimentId: String(fields["实验 ID"] || "").trim(),
          imageCost: Number(fields["Image 成本（元）"]) || null,
          model: String(fields["模型与版本"] || "").trim(),
          promptLinks: fields["提示词批次"] || [],
          provider: String(fields["模型提供商"] || "").trim(),
          recordId,
          runId: String(fields["Run ID"] || "").trim(),
          sampleIndex: Number(fields["采样序号"]) || 1,
          status: selectValue(fields["生成状态"]),
        })),
        samples: sampleRows.map(({ fields, recordId }) => ({
          attachments: fields["白模参考图"] || [],
          caseId: String(fields["Case ID"] || "").trim(),
          category: selectValue(fields["空间类型"]),
          datasetVersion: String(fields["数据集版本"] || "").trim(),
          edgeType: selectValue(fields["边缘类型"]),
          inputQuality: selectValue(fields["输入质量"]),
          lensComplexity: selectValue(fields["镜头复杂度"]),
          materialComplexity: selectValue(fields["材质复杂度"]),
          recordId,
          sampleType: selectValue(fields["样本类型"]),
          source: selectValue(fields["样本来源"]),
          spatialComplexity: selectValue(fields["空间结构"]),
          stylingComplexity: selectValue(fields["软装复杂度"]),
          status: selectValue(fields["任务状态"]),
        })),
      };
    },

    async listComparisonImageFields() {
      const fields = await tableFields(config.compareTableId);
      return fields.map((field) => field.name);
    },

    async prepareExperimentView(experimentId, target = "results") {
      const normalizedExperimentId = String(experimentId || "").trim();
      const definition = EXPERIMENT_VIEW_TARGETS[target];
      if (!definition) throw new TypeError(`不支持的飞书实验视图：${target}`);
      if (definition.tableKey === "report" && !reportTableId) {
        const tableBody = await run(config, [
          "base",
          "+table-list",
          "--as",
          "user",
          "--base-token",
          config.baseToken,
          "--limit",
          "100",
          "--format",
          "json",
        ]);
        reportTableId = String((tableBody?.data?.tables || []).find(
          (table) => table.name === REPORT_TABLE_NAME,
        )?.id || "").trim();
        if (!reportTableId) throw new Error(`Benchmark Base 缺少数据表：${REPORT_TABLE_NAME}`);
      }
      const tableId = {
        comparison: config.compareTableId,
        report: reportTableId,
        results: config.resultTableId,
      }[definition.tableKey];
      const viewBody = await run(config, [
        "base",
        "+view-list",
        "--as",
        "user",
        "--base-token",
        config.baseToken,
        "--table-id",
        tableId,
        "--limit",
        "200",
        "--format",
        "json",
      ]);
      const view = (viewBody?.data?.views || []).find(
        (item) => item.name === definition.viewName,
      );
      if (!view?.id) {
        throw new Error(`Benchmark Base 缺少视图：${definition.viewName}`);
      }
      const conditions = normalizedExperimentId
        ? [[await fieldId(tableId, definition.fieldName), "intersects", normalizedExperimentId]]
        : [];
      await run(config, [
        "base",
        "+view-set-filter",
        "--as",
        "user",
        "--base-token",
        config.baseToken,
        "--table-id",
        tableId,
        "--view-id",
        view.id,
        "--json",
        JSON.stringify({
          conditions,
          logic: "and",
        }),
        "--format",
        "json",
      ]);
      if (!baseUrl) {
        const baseBody = await run(config, [
          "base",
          "+base-get",
          "--as",
          "user",
          "--base-token",
          config.baseToken,
          "--format",
          "json",
        ]);
        baseUrl = String(baseBody?.data?.base?.url || "").trim();
        if (!baseUrl) throw new Error("飞书未返回 Benchmark Base 链接");
      }
      const url = new URL(baseUrl);
      url.searchParams.set("table", tableId);
      url.searchParams.set("view", view.id);
      return {
        experimentId: normalizedExperimentId || null,
        target,
        tableId,
        url: url.toString(),
        viewId: view.id,
        viewName: view.name,
      };
    },

    async createSample({
      caseId,
      category,
      datasetVersion,
      image,
      edgeType = null,
      inputQuality = "中",
      lensComplexity = "中",
      materialComplexity = "中",
      sampleType = "有效白模",
      source = "用户输入",
      spatialComplexity = "中",
      stylingComplexity = "中",
    }) {
      const normalizedCaseId = String(caseId || "").trim();
      if (!normalizedCaseId) throw new TypeError("Case ID 不能为空");
      const recordId = await createRecord(config.sampleTableId, {
        "Case ID": normalizedCaseId,
        "数据集版本": String(datasetVersion || "").trim() || null,
        "任务状态": "待生成",
        "样本类型": sampleType,
        "边缘类型": sampleType === "边缘输入" ? edgeType : null,
        "样本来源": source,
        "空间类型": category,
        "镜头复杂度": lensComplexity,
        "软装复杂度": stylingComplexity,
        "材质复杂度": materialComplexity,
        "输入质量": inputQuality,
        "空间结构": spatialComplexity,
      });
      const extension = extensionForMimeType(image.type);
      await uploadAttachment({
        bytes: await loadImageBytes(image.dataUrl),
        fieldId: await sampleFieldId("白模参考图"),
        fileName: `${normalizedCaseId}.${extension}`,
        recordId,
        tableId: config.sampleTableId,
      });
      return recordId;
    },

    async updateSampleDataset(recordIds, datasetName) {
      const normalizedRecordIds = [...new Set(recordIds.filter(Boolean))];
      for (let index = 0; index < normalizedRecordIds.length; index += 200) {
        await run(config, [
          "base",
          "+record-batch-update",
          "--as",
          "user",
          "--base-token",
          config.baseToken,
          "--table-id",
          config.sampleTableId,
          "--json",
          JSON.stringify({
            patch: { "数据集版本": datasetName },
            record_id_list: normalizedRecordIds.slice(index, index + 200),
          }),
          "--format",
          "json",
        ]);
      }
    },

    async downloadResultImage(result) {
      const attachments = result.attachments;
      if (!Array.isArray(attachments) || attachments.length === 0) {
        throw new Error(`${result.runId} 没有生成结果图`);
      }
      const attachment = attachments[0];
      const { bytes } = await downloadAttachment({
        attachment,
        recordId: result.recordId,
        tableId: config.resultTableId,
      });
      return {
        dataUrl: `data:${mimeTypeFromName(attachment.name)};base64,${bytes.toString("base64")}`,
        name: attachment.name,
      };
    },

    async savePromptBatch(prompt, existingRecordId = null) {
      return upsertRecord(
        config.promptTableId,
        {
          "Prompt ID": prompt.promptId,
          "关联 Case": [{ id: prompt.caseRecordId }],
          "横评组": prompt.groupId,
          "提示词批次": prompt.batch,
          "融合 Prompt": prompt.finalPrompt || null,
          "生成配置": prompt.configRecordIds.map((id) => ({ id })),
          "融合状态": prompt.status,
          "错误信息": prompt.error ? safeError(prompt.error) : null,
          "Prompt 耗时（秒）": prompt.durationSeconds ?? null,
          "Prompt 成本（元）": prompt.cost ?? null,
          "Prompt 请求 ID": prompt.requestId || null,
          "Prompt 哈希": prompt.hash || null,
        },
        existingRecordId,
      );
    },

    async saveRunResult(result, existingRecordId = null) {
      return upsertRecord(
        config.resultTableId,
        {
          "Run ID": result.runId,
          "关联 Case": [{ id: result.caseRecordId }],
          "提示词批次": [{ id: result.promptRecordId }],
          "生成配置": [{ id: result.configRecordId }],
          "实验 ID": result.experimentId,
          "实验类型": result.experimentType,
          "模型与版本": result.model,
          "模型提供商": result.provider || null,
          "采样序号": result.sampleIndex,
          "尝试序号": result.attempt,
          "重试来源": result.retrySource || null,
          "输出参数": result.output || null,
          "Prompt 哈希": result.promptHash || null,
          "Prompt 耗时（秒）": result.promptDurationSeconds ?? null,
          "Prompt 成本（元）": result.promptCost ?? null,
          "Image 请求 ID": result.requestId || null,
          "Image 耗时（秒）": result.durationSeconds ?? null,
          "Image 成本（元）": result.imageCost ?? null,
          "生成状态": result.status,
          "错误信息": result.error ? safeError(result.error) : null,
        },
        existingRecordId,
      );
    },

    async saveComparisonRow(comparison, existingRecordId = null) {
      return upsertRecord(
        config.compareTableId,
        {
          "对比 ID": comparison.compareId,
          "关联 Case": [{ id: comparison.caseRecordId }],
          "提示词批次": [{ id: comparison.promptRecordId }],
          "横评组": comparison.groupId,
          "评审备注": comparison.error ? safeError(comparison.error) : null,
        },
        existingRecordId,
      );
    },

    async updateSampleStatus(recordId, status) {
      await upsertRecord(
        config.sampleTableId,
        { "任务状态": status },
        recordId,
      );
    },

    async uploadComparisonImage(recordId, modelLabel, image, outputFormat) {
      const extension = extensionForImageFormat(outputFormat);
      const bytes = await loadImageBytes(image.url);
      await uploadAttachment({
        bytes,
        fieldId: await comparisonFieldId(modelLabel),
        fileName: `result.${extension}`,
        recordId,
        tableId: config.compareTableId,
      });
    },

    async uploadResultImage(recordId, image, outputFormat) {
      const extension = extensionForImageFormat(outputFormat);
      const bytes = await loadImageBytes(image.url);
      await uploadAttachment({
        bytes,
        fieldId: await resultFieldId("生成结果图"),
        fileName: `result.${extension}`,
        recordId,
        tableId: config.resultTableId,
      });
    },

    async copyComparisonImageToResult({
      sourceAttachment,
      sourceRecordId,
      targetRecordId,
    }) {
      const { bytes, extension } = await downloadAttachment({
        attachment: sourceAttachment,
        recordId: sourceRecordId,
        tableId: config.compareTableId,
      });
      await uploadAttachment({
        bytes,
        fieldId: await resultFieldId("生成结果图"),
        fileName: `result.${extension}`,
        recordId: targetRecordId,
        tableId: config.resultTableId,
      });
    },

    async uploadComparisonReference(recordId, reference) {
      const extension = extensionForMimeType(reference.mimeType);
      const bytes = await loadImageBytes(reference.imageUrl);
      await uploadAttachment({
        bytes,
        fieldId: await comparisonFieldId("白模参考图"),
        fileName: `reference.${extension}`,
        recordId,
        tableId: config.compareTableId,
      });
    },
  };
}

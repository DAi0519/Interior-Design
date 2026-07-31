/**
 * [INPUT]: 依赖 node:fs/os/path、image-artifact.mjs、lark-cli.mjs 与 Benchmark Base 五张运行主表
 * [OUTPUT]: 对外提供 Benchmark 配置解析、分页快照、Prompt/Run/横评幂等写入、参考图与结果附件归档及历史宽表回填
 * [POS]: src 的 Benchmark 飞书持久化边界，以模型结果为运行真源、横评宽表为展示派生层
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";

import {
  extensionForImageFormat,
  loadImageBytes,
} from "./image-artifact.mjs";
import { runLarkCli } from "./lark-cli.mjs";
import { recordIdFrom } from "./lark-sync.mjs";

const TABLE_FIELDS = Object.freeze({
  configs: [
    "配置 ID",
    "横评组",
    "Style DNA",
    "融合 Agent",
    "融合基座模型",
    "出图模型",
    "输出规格",
    "提示词批次数",
    "每批次每模型出图数",
    "启用",
  ],
  prompts: [
    "Prompt ID",
    "融合 Prompt",
    "融合状态",
    "错误信息",
    "Prompt 耗时（秒）",
    "Prompt 成本（元）",
    "Prompt 请求 ID",
    "Prompt 哈希",
  ],
  comparisons: [
    "对比 ID",
    "关联 Case",
    "提示词批次",
    "横评组",
    "白模参考图",
  ],
  samples: [
    "Case ID",
    "白模参考图",
    "任务状态",
  ],
  results: [
    "Run ID",
    "关联 Case",
    "提示词批次",
    "生成配置",
    "实验 ID",
    "实验类型",
    "模型与版本",
    "模型提供商",
    "采样序号",
    "尝试序号",
    "重试来源",
    "输出参数",
    "Prompt 哈希",
    "Prompt 耗时（秒）",
    "Prompt 成本（元）",
    "Image 请求 ID",
    "Image 耗时（秒）",
    "Image 成本（元）",
    "生成状态",
    "错误信息",
    "生成结果图",
  ],
});

const REQUIRED_CONFIG = [
  "baseToken",
  "compareTableId",
  "configTableId",
  "promptTableId",
  "resultTableId",
  "sampleTableId",
];

function requiredEnvironment(source, name) {
  const value = String(source[name] || "").trim();
  if (!value) throw new Error(`缺少环境变量 ${name}`);
  return value;
}

export function benchmarkBaseConfigFromEnv(source = process.env) {
  return {
    baseToken: requiredEnvironment(source, "BENCHMARK_BASE_TOKEN"),
    cliPath: source.LARK_CLI_PATH || "lark-cli",
    configTableId: requiredEnvironment(
      source,
      "BENCHMARK_CONFIG_TABLE_ID",
    ),
    compareTableId: requiredEnvironment(
      source,
      "BENCHMARK_COMPARE_TABLE_ID",
    ),
    promptTableId: requiredEnvironment(
      source,
      "BENCHMARK_PROMPT_TABLE_ID",
    ),
    resultTableId: requiredEnvironment(
      source,
      "BENCHMARK_RESULT_TABLE_ID",
    ),
    sampleTableId: requiredEnvironment(
      source,
      "BENCHMARK_SAMPLE_TABLE_ID",
    ),
  };
}

function validateConfig(config) {
  for (const key of REQUIRED_CONFIG) {
    if (!String(config?.[key] || "").trim()) {
      throw new TypeError(`Benchmark Base 配置缺少 ${key}`);
    }
  }
}

function selectValue(value) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function rowObject(fields, row) {
  return Object.fromEntries(fields.map((field, index) => [field, row[index]]));
}

export function parseBenchmarkRecordEnvelope(body) {
  const parsed = parseBenchmarkRecordPage(body);
  if (body.data.has_more) {
    throw new Error("飞书 Benchmark 单表超过 200 条，当前读取结果不完整");
  }
  return parsed;
}

function parseBenchmarkRecordPage(body) {
  if (body?.ok !== true || !Array.isArray(body?.data?.data)) {
    throw new Error("飞书 Benchmark 表返回格式不正确");
  }
  const fields = body.data.fields || [];
  const recordIds = body.data.record_id_list || [];
  return body.data.data.map((row, index) => ({
    fields: rowObject(fields, row),
    recordId: recordIds[index],
  }));
}

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
  validateConfig(config);
  let comparisonFieldIds = null;
  let resultFieldIds = null;

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

  async function fieldId(tableId, fieldName, cacheName) {
    let cache = cacheName === "comparison"
      ? comparisonFieldIds
      : resultFieldIds;
    if (!cache) {
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
      cache = new Map(
        (body?.data?.fields || []).map((field) => [field.name, field.id]),
      );
      if (cacheName === "comparison") comparisonFieldIds = cache;
      if (cacheName === "result") resultFieldIds = cache;
    }
    const resolved = cache.get(fieldName);
    if (!resolved) throw new Error(`${tableId} 缺少附件字段：${fieldName}`);
    return resolved;
  }

  async function comparisonFieldId(fieldName) {
    return fieldId(config.compareTableId, fieldName, "comparison");
  }

  async function resultFieldId(fieldName) {
    return fieldId(config.resultTableId, fieldName, "result");
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
          error: String(fields["错误信息"] || ""),
          recordId,
          runId: String(fields["Run ID"] || "").trim(),
          status: selectValue(fields["生成状态"]),
        })),
        samples: sampleRows.map(({ fields, recordId }) => ({
          attachments: fields["白模参考图"] || [],
          caseId: String(fields["Case ID"] || "").trim(),
          recordId,
          status: selectValue(fields["任务状态"]),
        })),
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

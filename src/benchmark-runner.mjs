/**
 * [INPUT]: 依赖 Benchmark Base 快照、Style DNA/Prompt Agent 发布资源、模型矩阵、参考图校验与 OneAPI 客户端
 * [OUTPUT]: 对外提供确定性横评计划与可断点续跑的串行执行器，逐 Run 留存成功/失败/重试并同步横评展示
 * [POS]: src 的模型横评应用服务，以一图一行的模型结果为真源、Prompt 批次为冻结实验产物
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import {
  agentModelOrThrow,
  publicAgentModelCatalog,
} from "./agent-model-config.mjs";
import {
  baseRunId,
  providerFromModelId,
  runIdForAttempt,
  sha256,
  stablePromptId,
  stableRunId,
} from "./benchmark-identifiers.mjs";
import {
  createGenerationRequest,
  publicModelCatalog,
} from "./model-config.mjs";
import { getPublishedPromptAgent } from "./prompt-agent.mjs";
import { normalizeReferenceImage } from "./reference-image.mjs";
import { getPublishedStyle } from "./style-library.mjs";
import {
  buildPromptAgentInput,
  parsePromptAgentOutput,
} from "./white-model-workflow.mjs";

const COMPLETED_SAMPLE_STATUSES = new Set(["完成"]);

function benchmarkError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function labeledId(value, field) {
  const normalized = String(value || "").trim();
  const match = normalized.match(/\[([^\]]+)\]\s*$/);
  if (!match) throw benchmarkError(`${field} 缺少 [资源 ID]`);
  return match[1].trim();
}

function versionedResource(value, field) {
  const resource = labeledId(value, field);
  const match = resource.match(/^(.+)@v(\d+)$/);
  if (!match) throw benchmarkError(`${field} 必须使用 code@vN`);
  return { code: match[1], version: Number(match[2]) };
}

function positiveInteger(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    throw benchmarkError(`${field} 必须是正整数`);
  }
  return number;
}

function parseOutputSpec(value) {
  const normalized = String(value || "").trim();
  const resolution = normalized.match(/\b(512|[1-4]K)\b/i)?.[1]?.toUpperCase();
  const format = normalized.match(/\b(PNG|JPE?G|WEBP)\b/i)?.[1]?.toLowerCase();
  if (!resolution || !format) {
    throw benchmarkError(`无法解析输出规格：${normalized || "空"}`);
  }
  return {
    outputFormat: format === "jpg" ? "jpeg" : format,
    resolution,
    sourceNearest: normalized.includes("跟随原图比例"),
  };
}

function catalogKeyById(catalog, id, field) {
  const entry = catalog.find((model) => model.id === id);
  if (!entry) throw benchmarkError(`${field} 不在本地模型目录：${id}`);
  return entry;
}

function assertSame(configs, getter, field) {
  const values = new Set(configs.map(getter));
  if (values.size !== 1) {
    throw benchmarkError(`同一横评组的 ${field} 必须完全一致`);
  }
  return getter(configs[0]);
}

function activeSamples(samples, maxCases) {
  const selected = samples
    .filter((sample) => sample.caseId)
    .filter((sample) => !COMPLETED_SAMPLE_STATUSES.has(sample.status))
    .sort((left, right) => left.caseId.localeCompare(right.caseId));
  return maxCases == null ? selected : selected.slice(0, maxCases);
}

export function buildBenchmarkPlan(
  snapshot,
  {
    groupId = null,
    maxCases = null,
    maxPromptBatches = null,
  } = {},
) {
  const enabledConfigs = snapshot.configs
    .filter((config) => config.enabled)
    .filter((config) => !groupId || config.groupId === groupId);
  if (enabledConfigs.length === 0) {
    throw benchmarkError("没有符合条件的已启用生成配置");
  }

  const promptIndex = new Map(
    snapshot.prompts
      .filter((prompt) => prompt.promptId)
      .map((prompt) => [prompt.promptId, prompt]),
  );
  const comparisonIndex = new Map(
    (snapshot.comparisons || [])
      .filter((comparison) => comparison.compareId)
      .map((comparison) => [comparison.compareId, comparison]),
  );
  const resultIndex = new Map();
  for (const result of snapshot.results || []) {
    if (!result.runId) continue;
    const key = baseRunId(result.runId);
    const attempts = resultIndex.get(key) || [];
    attempts.push(result);
    resultIndex.set(key, attempts);
  }
  const modelCatalog = publicModelCatalog();
  const agentCatalog = publicAgentModelCatalog();
  const groups = [];

  for (const currentGroupId of [
    ...new Set(enabledConfigs.map((config) => config.groupId)),
  ].sort()) {
    if (!currentGroupId) throw benchmarkError("已启用配置缺少横评组");
    const configs = enabledConfigs
      .filter((config) => config.groupId === currentGroupId)
      .sort((left, right) => left.configId.localeCompare(right.configId));
    const styleResource = assertSame(
      configs,
      (config) => String(config.styleDna),
      "Style DNA",
    );
    const agentResource = assertSame(
      configs,
      (config) => String(config.fusionAgent),
      "融合 Agent",
    );
    const fusionModelResource = assertSame(
      configs,
      (config) => String(config.fusionModel),
      "融合基座模型",
    );
    const outputResource = assertSame(
      configs,
      (config) => String(config.outputSpec),
      "输出规格",
    );
    const requestedPromptBatches = positiveInteger(
      assertSame(configs, (config) => config.promptBatches, "提示词批次数"),
      "提示词批次数",
    );
    const promptBatches = maxPromptBatches == null
      ? requestedPromptBatches
      : Math.min(
          requestedPromptBatches,
          positiveInteger(maxPromptBatches, "maxPromptBatches"),
        );
    const perBatchImages = positiveInteger(
      assertSame(
        configs,
        (config) => config.perBatchImages,
        "每批次每模型出图数",
      ),
      "每批次每模型出图数",
    );
    const style = versionedResource(styleResource, "Style DNA");
    const agent = versionedResource(agentResource, "融合 Agent");
    const fusionModelId = labeledId(fusionModelResource, "融合基座模型");
    const fusionModel = catalogKeyById(
      agentCatalog,
      fusionModelId,
      "融合基座模型",
    );
    const output = parseOutputSpec(outputResource);
    const seenModels = new Set();
    const plannedConfigs = configs.map((config) => {
      if (!config.configId) throw benchmarkError("已启用配置缺少配置 ID");
      const imageModelId = labeledId(config.imageModel, "出图模型");
      if (seenModels.has(imageModelId)) {
        throw benchmarkError(`横评组存在重复出图模型：${imageModelId}`);
      }
      seenModels.add(imageModelId);
      const imageModel = catalogKeyById(modelCatalog, imageModelId, "出图模型");
      return {
        ...config,
        imageModelId,
        imageModelKey: imageModel.key,
        imageModelLabel: imageModel.label,
      };
    });

    const cases = activeSamples(snapshot.samples, maxCases).map((sample) => {
      const batches = [];
      for (let batch = 1; batch <= promptBatches; batch += 1) {
        const promptId = stablePromptId(sample.caseId, currentGroupId, batch);
        const existingPrompt = promptIndex.get(promptId) || null;
        const existingComparison = comparisonIndex.get(promptId) || null;
        const runs = [];
        for (const config of plannedConfigs) {
          for (
            let sampleIndex = 1;
            sampleIndex <= perBatchImages;
            sampleIndex += 1
          ) {
            const runId = stableRunId(
              promptId,
              config.configId,
              sampleIndex,
            );
            const resultAttempts = (resultIndex.get(runId) || [])
              .sort((left, right) => left.attempt - right.attempt);
            const successfulResult = resultAttempts.findLast(
              (result) =>
                result.status === "成功" && result.attachments.length > 0,
            );
            const comparisonAttachments =
              existingComparison?.modelAttachments?.[config.imageModelLabel] ||
              [];
            const latestAttempt = resultAttempts.at(-1) || null;
            runs.push({
              config,
              existingResult:
                successfulResult ||
                (comparisonAttachments.length >= sampleIndex
                  ? {
                      attachments: comparisonAttachments,
                      recordId: existingComparison.recordId,
                      source: "comparison",
                      status: "成功",
                    }
                  : null),
              nextAttempt: Math.max(
                1,
                ...resultAttempts.map((result) => result.attempt + 1),
              ),
              retrySource:
                latestAttempt?.status === "失败" ? latestAttempt.runId : "",
              runId,
              sampleIndex,
            });
          }
        }
        batches.push({
          batch,
          existingComparison,
          existingPrompt,
          promptId,
          runs,
        });
      }
      return { batches, sample };
    });

    groups.push({
      agent,
      cases,
      configs: plannedConfigs,
      fusionModel,
      groupId: currentGroupId,
      output,
      partialPromptCoverage: promptBatches < requestedPromptBatches,
      style,
    });
  }

  const promptBatches = groups.reduce(
    (total, group) =>
      total + group.cases.reduce((sum, entry) => sum + entry.batches.length, 0),
    0,
  );
  const imageRuns = groups.reduce(
    (total, group) =>
      total +
      group.cases.reduce(
        (sum, entry) =>
          sum +
          entry.batches.reduce(
            (batchSum, batch) => batchSum + batch.runs.length,
            0,
          ),
        0,
      ),
    0,
  );
  const skippedPrompts = groups.reduce(
    (total, group) =>
      total +
      group.cases.reduce(
        (sum, entry) =>
          sum +
          entry.batches.filter(
            (batch) =>
              batch.existingPrompt?.status === "完成" &&
              batch.existingPrompt.finalPrompt,
          ).length,
        0,
      ),
    0,
  );
  const skippedImages = groups.reduce(
    (total, group) =>
      total +
      group.cases.reduce(
        (sum, entry) =>
          sum +
          entry.batches.reduce(
            (batchSum, batch) =>
              batchSum +
              batch.runs.filter(
                (run) =>
                  run.existingResult?.status === "成功" &&
                  run.existingResult.attachments?.length > 0,
              ).length,
            0,
          ),
        0,
      ),
    0,
  );

  return {
    groups,
    summary: {
      activeImageModels: groups.reduce(
        (total, group) => total + group.configs.length,
        0,
      ),
      cases: groups.reduce((total, group) => total + group.cases.length, 0),
      imageRuns,
      promptBatches,
      skippedImages,
      skippedPrompts,
    },
  };
}

function finishedResult(run) {
  return (
    run.existingResult?.status === "成功" &&
    run.existingResult.attachments?.length > 0
  );
}

function allModelIds(plan) {
  return new Set(
    plan.groups.flatMap((group) => [
      group.fusionModel.id,
      ...group.configs.map((config) => config.imageModelId),
    ]),
  );
}

async function assertModelAvailability(client, plan) {
  const available = new Set(
    (await client.listModels())
      .map((model) => model.id || model.name)
      .filter(Boolean),
  );
  const missing = [...allModelIds(plan)].filter((id) => !available.has(id));
  if (missing.length > 0) {
    throw benchmarkError(`当前 API Key 未开放模型：${missing.join("、")}`);
  }
}

async function freezePrompt({
  agent,
  batch,
  client,
  group,
  reference,
  sample,
  store,
  style,
}) {
  const existing = batch.existingPrompt;
  if (existing?.status === "完成" && existing.finalPrompt) {
    return {
      cost: existing.cost,
      durationSeconds: existing.durationSeconds,
      finalPrompt: existing.finalPrompt,
      hash: existing.hash || sha256(existing.finalPrompt),
      recordId: existing.recordId,
      requestId: existing.requestId,
    };
  }
  let recordId = await store.savePromptBatch(
    {
      batch: batch.batch,
      caseRecordId: sample.recordId,
      configRecordIds: group.configs.map((config) => config.recordId),
      error: "",
      finalPrompt: "",
      groupId: group.groupId,
      hash: "",
      promptId: batch.promptId,
      requestId: "",
      status: "生成中",
    },
    existing?.recordId,
  );
  try {
    const startedAt = Date.now();
    const promptResult = await client.generatePrompt({
      imageUrl: reference.imageUrl,
      model: group.fusionModel.id,
      systemPrompt: agent.systemPrompt,
      userPrompt: buildPromptAgentInput({
        styleDna: style.styleDna,
        userRequirements: "",
      }),
    });
    const finalPrompt = JSON.stringify(
      parsePromptAgentOutput(promptResult.text),
      null,
      2,
    );
    const durationSeconds = (Date.now() - startedAt) / 1000;
    const hash = sha256(finalPrompt);
    recordId = await store.savePromptBatch(
      {
        batch: batch.batch,
        caseRecordId: sample.recordId,
        configRecordIds: group.configs.map((config) => config.recordId),
        error: "",
        finalPrompt,
        groupId: group.groupId,
        hash,
        promptId: batch.promptId,
        requestId: promptResult.requestId || "",
        status: "完成",
        durationSeconds,
      },
      recordId,
    );
    return {
      cost: null,
      durationSeconds,
      finalPrompt,
      hash,
      recordId,
      requestId: promptResult.requestId || "",
    };
  } catch (error) {
    const failedRecordId = await store.savePromptBatch(
      {
        batch: batch.batch,
        caseRecordId: sample.recordId,
        configRecordIds: group.configs.map((config) => config.recordId),
        error,
        finalPrompt: "",
        groupId: group.groupId,
        hash: "",
        promptId: batch.promptId,
        requestId: "",
        status: "失败",
      },
      recordId,
    );
    if (error && typeof error === "object") {
      error.benchmarkPromptRecordId = failedRecordId;
    }
    throw error;
  }
}

async function savePromptFailureComparison({
  batch,
  error,
  promptRecordId,
  group,
  reference,
  sample,
  store,
}) {
  if (!promptRecordId) return null;
  const recordId = await store.saveComparisonRow(
    {
      caseRecordId: sample.recordId,
      compareId: batch.promptId,
      error,
      groupId: group.groupId,
      promptRecordId,
    },
    batch.existingComparison?.recordId,
  );
  if (!batch.existingComparison?.referenceAttachments?.length) {
    await store.uploadComparisonReference(recordId, reference);
  }
  return recordId;
}

async function generateRun({
  client,
  comparisonRecordId,
  finalPrompt,
  group,
  reference,
  run,
  store,
}) {
  if (finishedResult(run)) return "skipped";
  const attempt = run.nextAttempt;
  const runId = runIdForAttempt(run.runId, attempt);
  let resultRecordId = await store.saveRunResult({
    attempt,
    caseRecordId: reference.sampleRecordId,
    configRecordId: run.config.recordId,
    experimentId: group.groupId,
    experimentType: "模型横评",
    model: run.config.imageModelLabel,
    output: JSON.stringify({
      format: group.output.outputFormat,
      quality: "medium",
      resolution: group.output.resolution,
      sourceNearest: group.output.sourceNearest,
    }),
    promptCost: reference.promptCost,
    promptDurationSeconds: reference.promptDurationSeconds,
    promptHash: reference.promptHash,
    promptRecordId: reference.promptRecordId,
    provider: providerFromModelId(run.config.imageModelId),
    retrySource: run.retrySource,
    runId,
    sampleIndex: run.sampleIndex,
    status: "生成中",
  });
  const startedAt = Date.now();
  try {
    const generation = createGenerationRequest(
      {
        modelKey: run.config.imageModelKey,
        outputFormat: group.output.outputFormat,
        prompt: finalPrompt,
        quality: "medium",
        referenceImages: [
          {
            dataUrl: reference.imageUrl,
            name: reference.fileName,
            size: reference.size,
            type: reference.mimeType,
          },
        ],
        resolution: group.output.resolution,
      },
      {
        preferSourceAspect: group.output.sourceNearest,
        sourceDimensions: {
          height: reference.height,
          width: reference.width,
        },
      },
    );
    const result = await client.generateImage(generation.request);
    if (!result.images?.[0]) throw new Error("出图模型没有返回图片");
    await store.uploadResultImage(
      resultRecordId,
      result.images[0],
      group.output.outputFormat,
    );
    await store.uploadComparisonImage(
      comparisonRecordId,
      run.config.imageModelLabel,
      result.images[0],
      group.output.outputFormat,
    );
    resultRecordId = await store.saveRunResult(
      {
        attempt,
        caseRecordId: reference.sampleRecordId,
        configRecordId: run.config.recordId,
        durationSeconds: (Date.now() - startedAt) / 1000,
        experimentId: group.groupId,
        experimentType: "模型横评",
        model: run.config.imageModelLabel,
        output: JSON.stringify({
          format: group.output.outputFormat,
          quality: "medium",
          resolution: group.output.resolution,
          sourceNearest: group.output.sourceNearest,
        }),
        promptCost: reference.promptCost,
        promptDurationSeconds: reference.promptDurationSeconds,
        promptHash: reference.promptHash,
        promptRecordId: reference.promptRecordId,
        provider: providerFromModelId(run.config.imageModelId),
        requestId: result.requestId || "",
        imageCost: result.cost ?? null,
        retrySource: run.retrySource,
        runId,
        sampleIndex: run.sampleIndex,
        status: "成功",
      },
      resultRecordId,
    );
    return "generated";
  } catch (error) {
    await store.saveRunResult(
      {
        attempt,
        caseRecordId: reference.sampleRecordId,
        configRecordId: run.config.recordId,
        durationSeconds: (Date.now() - startedAt) / 1000,
        error,
        experimentId: group.groupId,
        experimentType: "模型横评",
        model: run.config.imageModelLabel,
        output: JSON.stringify({
          format: group.output.outputFormat,
          quality: "medium",
          resolution: group.output.resolution,
          sourceNearest: group.output.sourceNearest,
        }),
        promptCost: reference.promptCost,
        promptDurationSeconds: reference.promptDurationSeconds,
        promptHash: reference.promptHash,
        promptRecordId: reference.promptRecordId,
        provider: providerFromModelId(run.config.imageModelId),
        retrySource: run.retrySource,
        runId,
        sampleIndex: run.sampleIndex,
        status: "失败",
      },
      resultRecordId,
    );
    await store.saveComparisonRow(
      {
        caseRecordId: reference.sampleRecordId,
        compareId: reference.compareId,
        error,
        groupId: group.groupId,
        promptRecordId: reference.promptRecordId,
      },
      comparisonRecordId,
    );
    return "failed";
  }
}

export async function runBenchmark(
  plan,
  {
    client,
    execute = false,
    loadAgent = getPublishedPromptAgent,
    loadStyle = getPublishedStyle,
    store,
  } = {},
) {
  if (!execute) return { ...plan.summary, mode: "plan" };
  if (!client || !store) {
    throw new TypeError("Benchmark 执行需要 client 与 store");
  }
  await assertModelAvailability(client, plan);
  const counters = {
    failedImages: 0,
    failedPrompts: 0,
    generatedImages: 0,
    generatedPrompts: 0,
    skippedImages: 0,
    skippedPrompts: 0,
  };

  for (const group of plan.groups) {
    const [style, agent] = await Promise.all([
      loadStyle(group.style.code, { version: group.style.version }),
      loadAgent(group.agent.code, { version: group.agent.version }),
    ]);
    agentModelOrThrow(group.fusionModel.key);
    for (const { batches, sample } of group.cases) {
      await store.updateSampleStatus(sample.recordId, "生成中");
      let sampleFailed = 0;
      let sampleSucceeded = 0;
      const reference = normalizeReferenceImage(
        await store.downloadSampleImage(sample),
      );
      for (const batch of batches) {
        let frozen;
        try {
          frozen = await freezePrompt({
            agent,
            batch,
            client,
            group,
            reference,
            sample,
            store,
            style,
          });
          if (
            batch.existingPrompt?.status === "完成" &&
            batch.existingPrompt.finalPrompt
          ) {
            counters.skippedPrompts += 1;
          } else {
            counters.generatedPrompts += 1;
          }
        } catch (error) {
          counters.failedPrompts += 1;
          const failedRuns = batch.runs.filter((run) => !finishedResult(run));
          const finishedRuns = batch.runs.length - failedRuns.length;
          counters.skippedImages += finishedRuns;
          sampleSucceeded += finishedRuns;
          await savePromptFailureComparison({
            batch,
            error,
            group,
            promptRecordId: error?.benchmarkPromptRecordId,
            reference,
            sample,
            store,
          });
          sampleFailed += failedRuns.length;
          counters.failedImages += failedRuns.length;
          continue;
        }
        const comparisonRecordId = await store.saveComparisonRow(
          {
            caseRecordId: sample.recordId,
            compareId: batch.promptId,
            error: "",
            groupId: group.groupId,
            promptRecordId: frozen.recordId,
          },
          batch.existingComparison?.recordId,
        );
        if (!batch.existingComparison?.referenceAttachments?.length) {
          await store.uploadComparisonReference(comparisonRecordId, reference);
        }
        for (const run of batch.runs) {
          const status = await generateRun({
            client,
            comparisonRecordId,
            finalPrompt: frozen.finalPrompt,
            group,
            reference: {
              ...reference,
              compareId: batch.promptId,
              promptCost: frozen.cost,
              promptDurationSeconds: frozen.durationSeconds,
              promptHash: frozen.hash,
              promptRecordId: frozen.recordId,
              sampleRecordId: sample.recordId,
            },
            run,
            store,
          });
          if (status === "skipped") {
            counters.skippedImages += 1;
            sampleSucceeded += 1;
          }
          if (status === "generated") {
            counters.generatedImages += 1;
            sampleSucceeded += 1;
          }
          if (status === "failed") {
            counters.failedImages += 1;
            sampleFailed += 1;
          }
        }
      }
      const sampleStatus = sampleFailed === 0
        ? group.partialPromptCoverage
          ? "待生成"
          : "完成"
        : sampleSucceeded > 0
          ? "部分失败"
          : "失败";
      await store.updateSampleStatus(sample.recordId, sampleStatus);
    }
  }

  return { ...counters, mode: "execute" };
}

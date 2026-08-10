/**
 * [INPUT]: 依赖带样本类型准入标记的 Benchmark Base 快照、冻结实验输出规格、Style DNA/Prompt Agent 发布资源、模型 Provider 矩阵、参考图校验、OneAPI Prompt 客户端、按模型解析的图像客户端与可选取消信号
 * [OUTPUT]: 对外提供任意质量配置作为唯一实验因子的确定性横评计划、持久化 Run 进度重建、按实验阶段共享或隔离冻结 Prompt、飞书模型横评/Prompt 横评类型映射、OneAPI 真实费用传递、Provider 分辨率路由、可用性预检及可取消/断点续跑执行器
 * [POS]: src 的单变量横评应用服务，以一图一行的结果为真源、Prompt 批次为冻结实验产物，并分离 Prompt 与最终出图 Provider
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { agentModelOrThrow, publicAgentModelCatalog } from "./agent-model-config.mjs";
import { baseRunId, providerFromModelId, runIdForAttempt, sha256, stablePromptId, stableRunId } from "./benchmark-identifiers.mjs";
import {
  benchmarkVariableStage,
  compatibleBenchmarkGroupOutput,
  inferBenchmarkVariable,
  parseBenchmarkOutputSpec,
} from "./benchmark-experiment-config.mjs";
import { assertBenchmarkModelAvailability } from "./benchmark-model-access.mjs";
import { createGenerationRequest, publicModelCatalog } from "./model-config.mjs";
import { getPublishedPromptAgent } from "./prompt-agent.mjs";
import { normalizeReferenceImage } from "./reference-image.mjs";
import { getPublishedStyle } from "./style-library.mjs";
import { buildPromptAgentInput, parsePromptAgentOutput } from "./white-model-workflow.mjs";

const COMPLETED_SAMPLE_STATUSES = new Set(["完成"]);

export { assertBenchmarkModelAvailability } from "./benchmark-model-access.mjs";

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

function catalogKeyById(catalog, id, field) {
  const entry = catalog.find((model) => model.id === id);
  if (!entry) throw benchmarkError(`${field} 不在本地模型目录：${id}`);
  return entry;
}

function assertSame(configs, getter, field) {
  const values = new Set(configs.map(getter));
  if (values.size !== 1) throw benchmarkError(`同一横评组的 ${field} 必须完全一致`);
  return getter(configs[0]);
}

function activeSamples(samples, maxCases, includeCompletedSamples = false) {
  const selected = samples
    .filter((sample) => sample.caseId)
    .filter((sample) => !sample.sampleType || sample.sampleType === "有效白模")
    .filter((sample) =>
      includeCompletedSamples || !COMPLETED_SAMPLE_STATUSES.has(sample.status))
    .sort((left, right) => left.caseId.localeCompare(right.caseId));
  return maxCases == null ? selected : selected.slice(0, maxCases);
}

function selectedIdSet(values, field) {
  if (values == null) return null;
  if (!Array.isArray(values) || values.length === 0) {
    throw benchmarkError(`${field} 必须是非空数组`);
  }
  return new Set(values.map((value) => String(value || "").trim()).filter(Boolean));
}

export function buildBenchmarkPlan(
  snapshot,
  {
    caseIds = null,
    configIds = null,
    groupId = null,
    includeCompletedSamples = false,
    maxCases = null,
    maxPromptBatches = null,
  } = {},
) {
  const selectedCaseIds = selectedIdSet(caseIds, "caseIds");
  const selectedConfigIds = selectedIdSet(configIds, "configIds");
  const enabledConfigs = snapshot.configs
    .filter((config) => config.enabled)
    .filter((config) => !groupId || config.groupId === groupId)
    .filter((config) => !selectedConfigIds || selectedConfigIds.has(config.configId));
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
    const requestedPromptBatches = positiveInteger(
      assertSame(configs, (config) => config.promptBatches, "提示词批次数"),
      "提示词批次数",
    );
    const promptBatches = maxPromptBatches == null
      ? requestedPromptBatches
      : Math.min(requestedPromptBatches, positiveInteger(maxPromptBatches, "maxPromptBatches"));
    const perBatchImages = positiveInteger(
      assertSame(
        configs,
        (config) => config.perBatchImages,
        "每批次每模型出图数",
      ),
      "每批次每模型出图数",
    );
    const plannedConfigs = configs.map((config) => {
      if (!config.configId) throw benchmarkError("已启用配置缺少配置 ID");
      const imageModelId = labeledId(config.imageModel, "出图模型");
      const configAgent = versionedResource(config.fusionAgent, "融合 Agent");
      const configStyle = versionedResource(config.styleDna, "Style DNA");
      const fusionModelId = labeledId(config.fusionModel, "融合基座模型");
      const configFusionModel = catalogKeyById(agentCatalog, fusionModelId, "融合基座模型");
      const imageModel = catalogKeyById(modelCatalog, imageModelId, "出图模型");
      return {
        ...config,
        agent: configAgent,
        fusionModel: configFusionModel,
        imageModelId,
        imageModelKey: imageModel.key,
        imageModelLabel: imageModel.label,
        imageModelProvider: imageModel.provider || "oneapi",
        imageModelSizingMode: imageModel.sizingMode || "preset",
        output: parseBenchmarkOutputSpec(config.outputSpec),
        style: configStyle,
      };
    });
    const variableKey = inferBenchmarkVariable(plannedConfigs);
    const variableStage = benchmarkVariableStage(variableKey);
    const variantValue = (config) => ({
      "style-dna": `${config.style.code}@v${config.style.version}`,
      "prompt-version": `${config.agent.code}@v${config.agent.version}`,
      "fusion-model": config.fusionModel.id,
      "image-model": config.imageModelId,
      ratio: config.output.sourceNearest ? "source" : config.output.ratio,
      resolution: config.output.resolution,
      "output-format": config.output.outputFormat,
      quality: config.output.quality,
    })[variableKey];
    if (new Set(plannedConfigs.map(variantValue)).size !== plannedConfigs.length) {
      throw benchmarkError(`横评组存在重复候选项：${variableKey}`);
    }
    const output = ["ratio", "resolution", "output-format", "quality"].includes(variableKey)
      ? { variableKey, values: plannedConfigs.map((config) => config.output) }
      : compatibleBenchmarkGroupOutput(plannedConfigs);

    const cases = activeSamples(
      snapshot.samples.filter((sample) =>
        !selectedCaseIds || selectedCaseIds.has(sample.caseId)),
      maxCases,
      includeCompletedSamples,
    ).map((sample) => {
      const batches = [];
      for (let batch = 1; batch <= promptBatches; batch += 1) {
        const batchConfigSets = variableKey === "image-model"
          ? [plannedConfigs]
          : plannedConfigs.map((config) => [config]);
        for (const batchConfigs of batchConfigSets) {
          const promptVariant = variableStage === "prompt" ? batchConfigs[0].configId : "";
          const promptId = stablePromptId(sample.caseId, currentGroupId, batch, promptVariant);
          const existingPrompt = promptIndex.get(promptId) || null;
          const comparisonId = variableKey === "image-model"
            ? promptId
            : `${promptId}__${batchConfigs[0].configId}`;
          const existingComparison = comparisonIndex.get(comparisonId) || null;
          const runs = [];
          for (const config of batchConfigs) {
            for (
              let sampleIndex = 1;
              sampleIndex <= perBatchImages;
              sampleIndex += 1
            ) {
              const runId = stableRunId(promptId, config.configId, sampleIndex);
              const resultAttempts = (resultIndex.get(runId) || [])
                .sort((left, right) => left.attempt - right.attempt);
              const successfulResult = resultAttempts.findLast(
                (result) => result.status === "成功" && result.attachments.length > 0,
              );
              const comparisonAttachments =
                existingComparison?.modelAttachments?.[config.imageModelLabel] || [];
              const latestAttempt = resultAttempts.at(-1) || null;
              runs.push({
                attempted: resultAttempts.length > 0,
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
                nextAttempt: Math.max(1, ...resultAttempts.map((result) => result.attempt + 1)),
                retrySource: latestAttempt?.status === "失败" ? latestAttempt.runId : "",
                runId,
                sampleIndex,
              });
            }
          }
          batches.push({
            agent: batchConfigs[0].agent,
            batch,
            comparisonId,
            configs: batchConfigs,
            existingComparison,
            existingPrompt,
            fusionModel: batchConfigs[0].fusionModel,
            promptConfigs: variableStage === "prompt" ? batchConfigs : plannedConfigs,
            promptId,
            runs,
            style: batchConfigs[0].style,
          });
        }
      }
      return { batches, sample };
    });

    groups.push({
      cases,
      configs: plannedConfigs,
      fusionModel: plannedConfigs[0].fusionModel,
      groupId: currentGroupId,
      output,
      partialPromptCoverage: promptBatches < requestedPromptBatches,
      style: plannedConfigs[0].style,
      variableKey,
      variableStage,
      variableType: variableKey,
    });
  }

  const promptBatches = groups.reduce((total, group) => total + group.cases.reduce(
    (sum, entry) => sum + new Set(entry.batches.map((batch) => batch.promptId)).size,
    0,
  ), 0);
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
  const skippedPrompts = groups.reduce((total, group) => total + group.cases.reduce(
    (sum, entry) => sum + new Set(entry.batches
      .filter((batch) => batch.existingPrompt?.status === "完成" && batch.existingPrompt.finalPrompt)
      .map((batch) => batch.promptId)).size,
    0,
  ), 0);
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
  const processedImages = groups.reduce(
    (total, group) =>
      total +
      group.cases.reduce(
        (sum, entry) =>
          sum + entry.batches.reduce(
            (batchSum, batch) =>
              batchSum + batch.runs.filter((run) => run.attempted).length,
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
        (total, group) => total + new Set(group.configs.map((config) => config.imageModelId)).size,
        0,
      ),
      activeVariants: groups.reduce((total, group) => total + group.configs.length, 0),
      cases: groups.reduce((total, group) => total + group.cases.length, 0),
      imageRuns,
      processedImages,
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

async function freezePrompt({
  agent,
  batch,
  client,
  group,
  reference,
  sample,
  signal,
  store,
  style,
}) {
  signal?.throwIfAborted();
  const existing = batch.existingPrompt;
  if (existing?.status === "完成" && existing.finalPrompt) {
    return {
      cost: existing.cost,
      costUsd: existing.costUsd,
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
      configRecordIds: batch.promptConfigs.map((config) => config.recordId),
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
      model: batch.fusionModel.id,
      systemPrompt: agent.systemPrompt,
      userPrompt: buildPromptAgentInput({
        styleDna: style.styleDna,
        userRequirements: "",
      }),
    });
    signal?.throwIfAborted();
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
        configRecordIds: batch.promptConfigs.map((config) => config.recordId),
        error: "",
        finalPrompt,
        groupId: group.groupId,
        hash,
        promptId: batch.promptId,
        requestId: promptResult.requestId || "",
        status: "完成",
        durationSeconds,
        cost: promptResult.cost ?? null,
        costUsd: promptResult.costUsd ?? null,
      },
      recordId,
    );
    return {
      cost: promptResult.cost ?? null,
      costUsd: promptResult.costUsd ?? null,
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
        configRecordIds: batch.promptConfigs.map((config) => config.recordId),
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
      compareId: batch.comparisonId,
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
  comparisonRecordId,
  finalPrompt,
  group,
  imageClientForModel,
  reference,
  run,
  signal,
  store,
}) {
  signal?.throwIfAborted();
  if (finishedResult(run)) return "skipped";
  const imageClient = await imageClientForModel(run.config);
  const attempt = run.nextAttempt;
  const runId = runIdForAttempt(run.runId, attempt);
  let resultRecordId = await store.saveRunResult({
    attempt,
    caseRecordId: reference.sampleRecordId,
    configRecordId: run.config.recordId,
    experimentId: group.groupId,
    experimentType: group.variableStage === "prompt" ? "Prompt 横评" : "模型横评",
    model: run.config.imageModelLabel,
    output: JSON.stringify({
      format: run.config.output.outputFormat,
      quality: run.config.output.quality,
      ratio: run.config.output.ratio,
      resolution: run.config.output.resolution,
      sourceNearest: run.config.output.sourceNearest,
    }),
    promptCost: reference.promptCost,
    promptCostUsd: reference.promptCostUsd,
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
        outputFormat: run.config.output.outputFormat,
        prompt: finalPrompt,
        quality: run.config.output.quality,
        ratio: run.config.output.ratio,
        referenceImages: [
          {
            dataUrl: reference.imageUrl,
            name: reference.fileName,
            size: reference.size,
            type: reference.mimeType,
          },
        ],
        resolution: run.config.output.resolution,
      },
      {
        preferSourceAspect: run.config.output.sourceNearest,
        sourceDimensions: {
          height: reference.height,
          width: reference.width,
        },
      },
    );
    const result = await imageClient.generateImage(generation.request, { signal });
    signal?.throwIfAborted();
    if (!result.images?.[0]) throw new Error("出图模型没有返回图片");
    await store.uploadResultImage(
      resultRecordId,
      result.images[0],
      run.config.output.outputFormat,
    );
    await store.uploadComparisonImage(
      comparisonRecordId,
      run.config.imageModelLabel,
      result.images[0],
      run.config.output.outputFormat,
    );
    resultRecordId = await store.saveRunResult(
      {
        attempt,
        caseRecordId: reference.sampleRecordId,
        configRecordId: run.config.recordId,
        durationSeconds: (Date.now() - startedAt) / 1000,
        experimentId: group.groupId,
        experimentType: group.variableStage === "prompt" ? "Prompt 横评" : "模型横评",
        model: run.config.imageModelLabel,
        output: JSON.stringify({
          format: run.config.output.outputFormat,
          quality: run.config.output.quality,
          ratio: run.config.output.ratio,
          resolution: run.config.output.resolution,
          sourceNearest: run.config.output.sourceNearest,
        }),
        promptCost: reference.promptCost,
        promptCostUsd: reference.promptCostUsd,
        promptDurationSeconds: reference.promptDurationSeconds,
        promptHash: reference.promptHash,
        promptRecordId: reference.promptRecordId,
        provider: providerFromModelId(run.config.imageModelId),
        requestId: result.requestId || "",
        imageCost: result.cost ?? null,
        imageCostUsd: result.costUsd ?? null,
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
        experimentType: group.variableStage === "prompt" ? "Prompt 横评" : "模型横评",
        model: run.config.imageModelLabel,
        output: JSON.stringify({
          format: run.config.output.outputFormat,
          quality: "medium",
          resolution: run.config.output.resolution,
          sourceNearest: run.config.output.sourceNearest,
        }),
        promptCost: reference.promptCost,
        promptCostUsd: reference.promptCostUsd,
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
    signal?.throwIfAborted();
    return "failed";
  }
}

export async function runBenchmark(
  plan,
  {
    client,
    execute = false,
    imageClientForModel = () => client,
    loadAgent = getPublishedPromptAgent,
    loadStyle = getPublishedStyle,
    onProgress = () => {},
    signal = null,
    store,
  } = {},
) {
  if (!execute) return { ...plan.summary, mode: "plan" };
  if (!client || !store) {
    throw new TypeError("Benchmark 执行需要 client 与 store");
  }
  signal?.throwIfAborted();
  await store.validateExecutionContract?.(plan.groups.map((group) => group.variableStage === "prompt" ? "Prompt 横评" : "模型横评"));
  signal?.throwIfAborted();
  await assertBenchmarkModelAvailability(client, plan, { imageClientForModel });
  const imageClients = new Map();
  const resolveImageClient = async (config) => {
    if (!imageClients.has(config.imageModelId)) {
      imageClients.set(config.imageModelId, await imageClientForModel(config));
    }
    return imageClients.get(config.imageModelId);
  };
  const counters = {
    failedImages: 0,
    failedPrompts: 0,
    generatedImages: 0,
    generatedPrompts: 0,
    skippedImages: 0,
    skippedPrompts: 0,
  };
  let completedImages = Number(plan.summary.processedImages || 0);
  const reportProgress = (message) => onProgress({
    completed: completedImages,
    message,
    total: plan.summary.imageRuns,
  });
  reportProgress("正在检查模型与实验资源");

  for (const group of plan.groups) {
    signal?.throwIfAborted();
    const styles = new Map();
    const agents = new Map();
    group.configs.forEach((config) => agentModelOrThrow(config.fusionModel.key));
    for (const { batches, sample } of group.cases) {
      signal?.throwIfAborted();
      await store.updateSampleStatus(sample.recordId, "生成中");
      let sampleFailed = 0;
      let sampleSucceeded = 0;
      const reference = normalizeReferenceImage(
        await store.downloadSampleImage(sample),
      );
      const promptCache = new Map();
      for (const batch of batches) {
        signal?.throwIfAborted();
        let cachedPrompt = promptCache.get(batch.promptId);
        if (!cachedPrompt) {
          const agentKey = `${batch.agent.code}@v${batch.agent.version}`;
          const styleKey = `${batch.style.code}@v${batch.style.version}`;
          try {
            if (!agents.has(agentKey)) {
              agents.set(agentKey, await loadAgent(batch.agent.code, { version: batch.agent.version }));
            }
            if (!styles.has(styleKey)) {
              styles.set(styleKey, await loadStyle(batch.style.code, { version: batch.style.version }));
            }
            const frozen = await freezePrompt({
              agent: agents.get(agentKey),
              batch,
              client,
              group,
              reference,
              sample,
              signal,
              store,
              style: styles.get(styleKey),
            });
            cachedPrompt = { frozen };
            if (batch.existingPrompt?.status === "完成" && batch.existingPrompt.finalPrompt) {
              counters.skippedPrompts += 1;
            } else {
              counters.generatedPrompts += 1;
            }
          } catch (error) {
            signal?.throwIfAborted();
            cachedPrompt = { error };
            counters.failedPrompts += 1;
          }
          promptCache.set(batch.promptId, cachedPrompt);
        }
        if (cachedPrompt.error) {
          const { error } = cachedPrompt;
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
          reportProgress(`${sample.caseId} 的 Prompt 批次 ${batch.batch} 失败`);
          continue;
        }
        const { frozen } = cachedPrompt;
        const comparisonRecordId = await store.saveComparisonRow(
          {
            caseRecordId: sample.recordId,
            compareId: batch.comparisonId,
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
          signal?.throwIfAborted();
          const status = await generateRun({
            comparisonRecordId,
            finalPrompt: frozen.finalPrompt,
            group,
            imageClientForModel: resolveImageClient,
            reference: {
              ...reference,
              compareId: batch.comparisonId,
              promptCost: frozen.cost,
              promptCostUsd: frozen.costUsd,
              promptDurationSeconds: frozen.durationSeconds,
              promptHash: frozen.hash,
              promptRecordId: frozen.recordId,
              sampleRecordId: sample.recordId,
            },
            run,
            signal,
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
          if (status !== "skipped" && !run.attempted) completedImages += 1;
          reportProgress(`${sample.caseId} · ${run.config.imageModelLabel} · ${status}`);
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

  return { ...counters, mode: "execute", processedImages: completedImages };
}

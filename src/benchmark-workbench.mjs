/**
 * [INPUT]: 依赖 Benchmark Base、本地版本化状态、样本 AI 标注、横评计划/执行器、AI 评分领域层、可注入 OneAPI 客户端与可选任务取消信号
 * [OUTPUT]: 对外提供样本集治理、五维 AI 待审标签、八类质量配置单变量实验计划与分阶段冻结配置落库、协议漂移拦截、可取消/失败持久化批量生成、停止实验 Base 进度重建、seven_evaluate_v3.1 同构的单次调用/按 Run 断点继续评分与写回、实验分析及飞书筛选跳转
 * [POS]: src 的评测工作台应用服务，统一浏览器 API 与既有 CLI Runner 的业务边界
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { randomUUID } from "node:crypto";
import { agentModelOrThrow, publicAgentModelCatalog } from "./agent-model-config.mjs";
import { baseRunId } from "./benchmark-identifiers.mjs";
import {
  generationConfigsMatch,
  normalizeExperimentDraft,
} from "./benchmark-experiment-config.mjs";
import {
  BENCHMARK_COMPLEXITY_LEVELS,
  BENCHMARK_EDGE_TYPES,
  BENCHMARK_SAMPLE_CATEGORIES,
  labelBenchmarkSample,
} from "./benchmark-labeling.mjs";
import {
  BENCHMARK_REVIEW_DIMENSIONS,
  BENCHMARK_REVIEW_PROTOCOL_VERSION,
  pendingBenchmarkReviewRuns,
  publicReviewResultList,
  reviewableExperimentList,
  scoreBenchmarkImage,
  summarizeBenchmarkAnalysis,
} from "./benchmark-review.mjs";
import {
  assertBenchmarkModelAvailability,
  buildBenchmarkPlan,
  runBenchmark,
} from "./benchmark-runner.mjs";
import { publicModelCatalog } from "./model-config.mjs";
import { normalizeReferenceImage } from "./reference-image.mjs";
function inputError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function requiredText(value, field) {
  const normalized = String(value || "").trim();
  if (!normalized) throw inputError(`${field} 不能为空`);
  return normalized;
}

function datasetName(value) {
  return String(value || "").trim() || "未命名样本集";
}

function generatedId(prefix, length = 10) {
  return `${prefix}-${randomUUID().replaceAll("-", "").slice(0, length).toUpperCase()}`;
}

function sampleLabels(input) {
  const category = requiredText(input.category, "类别");
  const sampleType = input.sampleType || "有效白模";
  if (!BENCHMARK_SAMPLE_CATEGORIES.includes(category)) throw inputError("类别不在允许列表中");
  if (!["有效白模", "边缘输入"].includes(sampleType)) throw inputError("样本类型不在允许列表中");
  const edgeType = input.edgeType || null;
  if (sampleType === "边缘输入" && !BENCHMARK_EDGE_TYPES.includes(edgeType)) {
    throw inputError("边缘输入必须选择有效的边缘类型");
  }
  const dimensions = {
    inputQuality: input.inputQuality || "中",
    lensComplexity: input.lensComplexity || "中",
    materialComplexity: input.materialComplexity || "中",
    spatialComplexity: input.spatialComplexity || "中",
    stylingComplexity: input.stylingComplexity || "中",
  };
  for (const [field, level] of Object.entries(dimensions)) {
    if (!BENCHMARK_COMPLEXITY_LEVELS.includes(level)) {
      throw inputError(`${field} 不在允许列表中`);
    }
  }
  return {
    category,
    ...dimensions,
    edgeType: sampleType === "边缘输入" ? edgeType : null,
    sampleType,
  };
}

function resultCaseId(result, samplesByRecordId) {
  const recordId = result.caseLinks?.[0]?.id;
  return samplesByRecordId.get(recordId)?.caseId || "";
}

function inferredCategory(caseId) {
  const prefix = String(caseId || "").split("-")[0].toUpperCase();
  return {
    BATHROOM: "卫生间",
    BEDROOM: "卧室",
    DINING: "餐厅",
    KITCHEN: "厨房",
    LIVING: "客厅",
    STUDY: "书房",
  }[prefix] || "未分类";
}

export function publicBenchmarkPlan(plan, snapshot) {
  const plannedIds = new Set(
    plan.groups.flatMap((group) =>
      group.cases.flatMap((entry) =>
        entry.batches.flatMap((batch) => batch.runs.map((run) => run.runId)),
      ),
    ),
  );
  const groupIds = new Set(plan.groups.map((group) => group.groupId));
  const outsideProtocol = snapshot.results.filter(
    (result) =>
      groupIds.has(result.experimentId) &&
      result.runId &&
      !plannedIds.has(baseRunId(result.runId)),
  );
  return {
    drift: outsideProtocol.length
      ? {
          blocked: true,
          message: `检测到 ${outsideProtocol.length} 条历史 Run 不属于当前抽样协议，请新建横评组后执行。`,
        }
      : { blocked: false, message: "当前横评组与计划协议一致" },
    groups: plan.groups.map((group) => ({
      cases: group.cases.map((entry) => ({
        caseId: entry.sample.caseId,
        promptBatches: entry.batches.length,
        runs: entry.batches.reduce((total, batch) => total + batch.runs.length, 0),
      })),
      configs: group.configs.map((config) => ({
        agent: `${config.agent.code}@v${config.agent.version}`,
        configId: config.configId,
        model: config.imageModelLabel,
      })),
      groupId: group.groupId,
      output: group.output,
      variableKey: group.variableKey,
      variableType: group.variableType,
    })),
    summary: plan.summary,
  };
}

function planOptions(input) {
  return {
    caseIds: input.caseIds || null,
    configIds: input.configIds || null,
    draftConfig: input.draftConfig || null,
    groupId: input.groupId || null,
    includeCompletedSamples: true,
    maxCases: input.maxCases == null ? null : Number(input.maxCases),
    maxPromptBatches:
      input.maxPromptBatches == null ? null : Number(input.maxPromptBatches),
  };
}

export function createBenchmarkWorkbenchService({ baseStore, localStore }) {
  if (!baseStore || !localStore) throw new TypeError("评测工作台依赖未配置完整");

  async function snapshotWithCaseIds() {
    const snapshot = await baseStore.loadSnapshot();
    const samplesByRecordId = new Map(
      snapshot.samples.map((sample) => [sample.recordId, sample]),
    );
    return {
      ...snapshot,
      results: snapshot.results.map((result) => ({
        ...result,
        caseId: resultCaseId(result, samplesByRecordId),
      })),
    };
  }

  function preparePlanFromSnapshot(snapshot, input) {
    const draft = normalizeExperimentDraft(input);
    let plannedSnapshot = snapshot;
    let options = planOptions(input);
    if (draft) {
      const existingById = new Map(snapshot.configs.map((config) => [config.configId, config]));
      const draftConfigs = draft.configs.map((config) => {
        const existing = existingById.get(config.configId);
        if (existing && !generationConfigsMatch(existing, config)) {
          throw inputError(`${config.configId} 已存在但冻结参数不同`);
        }
        return { ...config, recordId: existing?.recordId || null };
      });
      const draftIds = new Set(draft.configIds);
      plannedSnapshot = {
        ...snapshot,
        configs: [
          ...snapshot.configs.filter((config) => !draftIds.has(config.configId)),
          ...draftConfigs,
        ],
      };
      options = {
        ...options,
        configIds: draft.configIds,
        groupId: draft.groupId,
      };
    }
    const plan = buildBenchmarkPlan(plannedSnapshot, options);
    return {
      draft,
      plan,
      publicPlan: publicBenchmarkPlan(plan, plannedSnapshot),
      snapshot: plannedSnapshot,
    };
  }

  async function preparePlan(input) {
    return preparePlanFromSnapshot(await snapshotWithCaseIds(), input);
  }

  async function materializeDraft(draft) {
    if (!draft) return;
    const snapshot = await snapshotWithCaseIds();
    const supportedFields = typeof baseStore.listComparisonImageFields === "function"
      ? await baseStore.listComparisonImageFields()
      : null;
    if (supportedFields) {
      const supported = new Set(supportedFields);
      const unsupported = draft.configs
        .filter((config) => !supported.has(config.imageModelLabel))
        .map((config) => config.imageModelLabel);
      if (unsupported.length) {
        throw inputError(`横评对比表缺少模型图片列：${unsupported.join("、")}`);
      }
    }
    const existingById = new Map(snapshot.configs.map((config) => [config.configId, config]));
    for (const config of draft.configs) {
      const existing = existingById.get(config.configId);
      if (existing) {
        if (!generationConfigsMatch(existing, config)) {
          throw inputError(`${config.configId} 已存在但冻结参数不同`);
        }
        if (!existing.enabled) throw inputError(`${config.configId} 已存在但已停用`);
        continue;
      }
      await baseStore.createGenerationConfig(config);
    }
  }

  async function ensureDatasets(snapshot, initialState) {
    const datasets = [...initialState.datasets];
    const names = [...new Set(snapshot.samples.map((sample) => datasetName(sample.datasetVersion)))];
    for (const name of names) {
      if (datasets.some((dataset) => dataset.name === name)) continue;
      const dataset = {
        createdAt: new Date().toISOString(),
        datasetId: generatedId("SET"),
        name,
        source: "benchmark-base",
      };
      await localStore.saveDataset(dataset);
      datasets.push(dataset);
    }
    return { ...initialState, datasets };
  }

  async function datasetContext() {
    const snapshot = await snapshotWithCaseIds();
    const state = await ensureDatasets(snapshot, await localStore.read());
    return { snapshot, state };
  }

  function activeDataset(state, datasetId) {
    const dataset = state.datasets.find((item) => item.datasetId === datasetId);
    if (!dataset || dataset.archivedAt) throw inputError("样本集不存在或已归档");
    return dataset;
  }

  function assertUniqueDatasetName(state, name, currentDatasetId = null) {
    const duplicate = state.datasets.find(
      (dataset) => dataset.datasetId !== currentDatasetId && dataset.name.toLowerCase() === name.toLowerCase(),
    );
    if (duplicate) throw inputError("样本集名称已存在");
  }

  function assertExperimentMatchesGroup(input) {
    const experimentId = requiredText(input.experimentId, "实验 ID");
    const groupId = requiredText(input.groupId || experimentId, "横评组");
    if (experimentId !== groupId) {
      throw inputError("当前版本要求实验 ID 与飞书横评组一致");
    }
    return experimentId;
  }

  return {
    async labelCase(input, { client }) {
      const modelKey = String(input.modelKey || "gemini35flash");
      const model = agentModelOrThrow(modelKey);
      const image = normalizeReferenceImage({
        dataUrl: input.image?.dataUrl,
        name: input.image?.name,
        size: input.image?.size,
        type: input.image?.type,
      });
      if (!image) throw inputError("参考图不能为空");
      return {
        ...(await labelBenchmarkSample({ client, imageUrl: image.imageUrl, model: model.id })),
        modelKey,
        modelLabel: model.label,
      };
    },

    async createDataset(input) {
      const name = requiredText(input.name, "样本集名称");
      if (name.length > 80) throw inputError("样本集名称不能超过 80 个字符");
      const { state } = await datasetContext();
      assertUniqueDatasetName(state, name);
      const dataset = {
        createdAt: new Date().toISOString(),
        datasetId: generatedId("SET"),
        name,
        source: "workbench",
      };
      await localStore.saveDataset(dataset);
      return dataset;
    },

    async createCase(input) {
      const { snapshot, state } = await datasetContext();
      const dataset = activeDataset(state, requiredText(input.datasetId, "样本集"));
      const existingCaseIds = new Set(snapshot.samples.map((sample) => sample.caseId));
      let caseId = generatedId("CASE", 12);
      while (existingCaseIds.has(caseId)) caseId = generatedId("CASE", 12);
      const labels = sampleLabels(input);
      const image = normalizeReferenceImage({
        dataUrl: input.image?.dataUrl,
        name: input.image?.name,
        size: input.image?.size,
        type: input.image?.type,
      });
      const recordId = await baseStore.createSample({
        caseId,
        category: labels.category,
        datasetVersion: dataset.name,
        edgeType: labels.edgeType,
        image: {
          dataUrl: image.imageUrl,
          type: image.mimeType,
        },
        inputQuality: labels.inputQuality,
        lensComplexity: labels.lensComplexity,
        materialComplexity: labels.materialComplexity,
        sampleType: labels.sampleType,
        source: input.source || "用户输入",
        spatialComplexity: labels.spatialComplexity,
        stylingComplexity: labels.stylingComplexity,
      });
      const metadata = {
        caseId,
        category: labels.category,
        datasetId: dataset.datasetId,
        datasetVersion: dataset.name,
        edgeType: labels.edgeType,
        inputQuality: labels.inputQuality,
        labelConfidence: Number.isFinite(input.labelConfidence) ? input.labelConfidence : null,
        labelModel: String(input.labelModel || "").trim() || null,
        labelPromptVersion: String(input.labelPromptVersion || "").trim() || null,
        labelReason: String(input.labelReason || "").trim().slice(0, 80),
        labelSource: input.labelSource === "ai" ? "ai" : "human",
        lensComplexity: labels.lensComplexity,
        materialComplexity: labels.materialComplexity,
        recordId,
        sampleType: labels.sampleType,
        spatialComplexity: labels.spatialComplexity,
        stylingComplexity: labels.stylingComplexity,
        updatedAt: new Date().toISOString(),
      };
      await localStore.saveCaseMetadata(metadata);
      return metadata;
    },

    async renameDataset(input) {
      const name = requiredText(input.name, "样本集名称");
      if (name.length > 80) throw inputError("样本集名称不能超过 80 个字符");
      const { snapshot, state } = await datasetContext();
      const dataset = activeDataset(state, requiredText(input.datasetId, "样本集"));
      assertUniqueDatasetName(state, name, dataset.datasetId);
      if (name === dataset.name) return dataset;
      const metadataByCaseId = new Map(state.caseMetadata.map((item) => [item.caseId, item]));
      const samples = snapshot.samples.filter((sample) => {
        const metadata = metadataByCaseId.get(sample.caseId);
        return metadata?.datasetId === dataset.datasetId ||
          (!metadata?.datasetId && datasetName(sample.datasetVersion) === dataset.name);
      });
      await baseStore.updateSampleDataset(samples.map((sample) => sample.recordId), name);
      const updated = { ...dataset, name, updatedAt: new Date().toISOString() };
      await localStore.saveDataset(updated);
      for (const sample of samples) {
        const metadata = metadataByCaseId.get(sample.caseId);
        if (!metadata) continue;
        await localStore.saveCaseMetadata({ ...metadata, datasetVersion: name });
      }
      return updated;
    },

    async archiveDataset(input) {
      if (input.confirm !== true) throw inputError("归档样本集需要显式确认");
      const { state } = await datasetContext();
      const dataset = activeDataset(state, requiredText(input.datasetId, "样本集"));
      const archived = { ...dataset, archivedAt: new Date().toISOString() };
      await localStore.saveDataset(archived);
      return archived;
    },

    async overview(input = {}) {
      const { snapshot, state } = await datasetContext();
      const metadataByCaseId = new Map(state.caseMetadata.map((item) => [item.caseId, item]));
      const datasetByName = new Map(state.datasets.map((dataset) => [dataset.name, dataset]));
      const datasetIdForSample = (sample) =>
        metadataByCaseId.get(sample.caseId)?.datasetId ||
        datasetByName.get(datasetName(sample.datasetVersion))?.datasetId || "";
      const caseMetadata = snapshot.samples.map((sample) => ({
        caseId: sample.caseId,
        category:
          sample.category ||
          metadataByCaseId.get(sample.caseId)?.category ||
          inferredCategory(sample.caseId),
      }));
      const cases = snapshot.samples.map((sample) => ({
        caseId: sample.caseId,
        category: caseMetadata.find((item) => item.caseId === sample.caseId)?.category || "未分类",
        datasetVersion: sample.datasetVersion || "",
        datasetId: datasetIdForSample(sample),
        edgeType: sample.edgeType || metadataByCaseId.get(sample.caseId)?.edgeType || null,
        hasImage: sample.attachments.length > 0,
        inputQuality: sample.inputQuality || metadataByCaseId.get(sample.caseId)?.inputQuality || "中",
        lensComplexity: sample.lensComplexity || metadataByCaseId.get(sample.caseId)?.lensComplexity || "中",
        materialComplexity: sample.materialComplexity || metadataByCaseId.get(sample.caseId)?.materialComplexity || "中",
        recordId: sample.recordId,
        sampleType: sample.sampleType || "有效白模",
        spatialComplexity: sample.spatialComplexity || metadataByCaseId.get(sample.caseId)?.spatialComplexity || "中",
        status: sample.status || "待生成",
        stylingComplexity: sample.stylingComplexity || metadataByCaseId.get(sample.caseId)?.stylingComplexity || "中",
      }));
      const datasets = state.datasets
        .filter((dataset) => !dataset.archivedAt)
        .map((dataset) => {
          const datasetCases = cases.filter((sample) => sample.datasetId === dataset.datasetId);
          return {
            caseCount: datasetCases.length,
            createdAt: dataset.createdAt,
            datasetId: dataset.datasetId,
            name: dataset.name,
            validCaseCount: datasetCases.filter((sample) => sample.sampleType === "有效白模").length,
          };
        })
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
      const datasetAnalyses = {};
      const datasetExperimentAnalyses = {};
      for (const dataset of datasets) {
        const caseIds = new Set(cases
          .filter((sample) => sample.datasetId === dataset.datasetId)
          .map((sample) => sample.caseId));
        const scopedCaseMetadata = caseMetadata.filter((item) => caseIds.has(item.caseId));
        const scopedResults = snapshot.results.filter((result) => caseIds.has(result.caseId));
        const scopedReviews = state.reviews.filter((review) => caseIds.has(review.caseId));
        datasetAnalyses[dataset.datasetId] = summarizeBenchmarkAnalysis({
          caseMetadata: scopedCaseMetadata,
          results: scopedResults,
          reviews: scopedReviews,
        });
        const experimentIds = [...new Set(scopedResults
          .map((result) => String(result.experimentId || "").trim())
          .filter(Boolean))];
        datasetExperimentAnalyses[dataset.datasetId] = Object.fromEntries(
          experimentIds.map((experimentId) => [experimentId, summarizeBenchmarkAnalysis({
            caseMetadata: scopedCaseMetadata,
            results: scopedResults.filter((result) => result.experimentId === experimentId),
            reviews: scopedReviews.filter((review) => review.experimentId === experimentId),
          })]),
        );
      }
      let planned = null;
      const defaultGroupId = input.groupId || snapshot.configs.find((config) => config.enabled)?.groupId;
      if (defaultGroupId) {
        const plan = buildBenchmarkPlan(snapshot, {
          groupId: defaultGroupId,
          includeCompletedSamples: true,
          maxCases: input.maxCases == null ? null : Number(input.maxCases),
        });
        planned = publicBenchmarkPlan(plan, snapshot);
      }
      const experiments = state.experiments.map((experiment) => {
        if (!["cancelled", "failed", "running"].includes(experiment.status) || !experiment.options) {
          return experiment;
        }
        try {
          const prepared = preparePlanFromSnapshot(snapshot, {
            ...experiment.options,
            experimentId: experiment.experimentId,
            groupId: experiment.groupId || experiment.experimentId,
          });
          return {
            ...experiment,
            summary: {
              ...experiment.summary,
              processedImages: prepared.plan.summary.processedImages,
            },
          };
        } catch {
          return experiment;
        }
      });
      const comparisonFields = typeof baseStore.listComparisonImageFields === "function"
        ? await baseStore.listComparisonImageFields()
        : snapshot.configs.map((config) => config.imageModelLabel);
      return {
        analysis: summarizeBenchmarkAnalysis({
          caseMetadata,
          results: snapshot.results,
          reviews: state.reviews,
        }),
        cases,
        datasetAnalyses,
        datasetExperimentAnalyses,
        datasets,
        configs: snapshot.configs.map((config) => ({
          configId: config.configId,
          enabled: config.enabled,
          fusionAgent: config.fusionAgent,
          fusionModel: config.fusionModel,
          groupId: config.groupId,
          imageModel: config.imageModel,
          model: config.imageModelLabel,
          outputSpec: config.outputSpec,
          perBatchImages: config.perBatchImages,
          promptBatches: config.promptBatches,
          styleDna: config.styleDna,
        })),
        experiments,
        plan: planned,
        reviewBatches: state.reviewBatches,
        reviewProtocol: {
          dimensions: BENCHMARK_REVIEW_DIMENSIONS,
          passThreshold: 3,
          stages: ["单次输入准入与三维评分"],
          version: BENCHMARK_REVIEW_PROTOCOL_VERSION,
        },
        reviewResults: publicReviewResultList(state),
        reviewableExperiments: reviewableExperimentList(snapshot, state),
        reviewModels: publicAgentModelCatalog().filter((model) => model.imageInput),
        supportedImageModelLabels: publicModelCatalog()
          .filter((model) => comparisonFields.includes(model.label))
          .map((model) => model.label),
      };
    },

    async planExperiment(input) {
      const prepared = await preparePlan(input);
      const experimentId = assertExperimentMatchesGroup(input);
      await localStore.saveExperiment({
        createdAt: new Date().toISOString(),
        experimentId,
        groupId: prepared.publicPlan.groups[0]?.groupId || "",
        options: planOptions(input),
        status: "planned",
        summary: prepared.plan.summary,
      });
      return prepared.publicPlan;
    },

    async prepareExperimentView(input) {
      if (typeof baseStore.prepareExperimentView !== "function") {
        throw new Error("当前 Benchmark Base 不支持实验视图跳转");
      }
      return baseStore.prepareExperimentView(
        String(input.experimentId || "").trim(),
        String(input.target || "results").trim(),
      );
    },

    async runExperiment(input, {
      client,
      imageClientForModel = () => client,
      signal = null,
      update = () => {},
    }) {
      if (input.confirm !== true) throw inputError("批量执行需要显式确认");
      const requestedExperimentId = String(input.experimentId || "").trim();
      let experiment = null;
      let phase = "preflight";
      update({ message: "正在检查实验计划与模型权限", persisted: false, phase });
      try {
        signal?.throwIfAborted();
        const experimentId = assertExperimentMatchesGroup(input);
        let prepared = await preparePlan(input);
        experiment = {
          experimentId,
          groupId: prepared.publicPlan.groups[0]?.groupId || "",
          options: planOptions(input),
          summary: prepared.plan.summary,
        };
        await localStore.saveExperiment({
          ...experiment,
          startedAt: new Date().toISOString(),
          status: "running",
        });
        if (prepared.publicPlan.drift.blocked) {
          throw inputError(prepared.publicPlan.drift.message);
        }
        await assertBenchmarkModelAvailability(client, prepared.plan, {
          imageClientForModel,
        });
        signal?.throwIfAborted();

        phase = "config-write";
        update({
          message: "正在将生成配置冻结到 Benchmark Base",
          persisted: false,
          phase,
          total: prepared.plan.summary.imageRuns,
        });
        await materializeDraft(prepared.draft);
        signal?.throwIfAborted();
        if (prepared.draft) prepared = await preparePlan(input);

        phase = "generation";
        update({
          message: "生成配置已写入 Benchmark Base，开始批量出图",
          persisted: true,
          phase,
          total: prepared.plan.summary.imageRuns,
        });
        const result = await runBenchmark(prepared.plan, {
          client,
          execute: true,
          imageClientForModel,
          onProgress: update,
          signal,
          store: baseStore,
        });
        signal?.throwIfAborted();
        await localStore.saveExperiment({
          ...experiment,
          completedAt: new Date().toISOString(),
          result,
          status: "completed",
        });
        return result;
      } catch (error) {
        const cancelled = Boolean(signal?.aborted);
        if (experiment || requestedExperimentId) {
          await localStore.saveExperiment({
            ...(experiment || {
              experimentId: requestedExperimentId,
              groupId: String(input.groupId || requestedExperimentId),
              options: planOptions(input),
            }),
            ...(cancelled
              ? { stoppedAt: new Date().toISOString() }
              : {
                  error: String(error?.message || "评测任务失败").slice(0, 1000),
                  failedAt: new Date().toISOString(),
                }),
            phase,
            status: cancelled ? "cancelled" : "failed",
          }).catch(() => {});
        }
        throw error;
      }
    },
    async runReview(input, { client, update = () => {} }) {
      if (input.confirm !== true) throw inputError("AI 评分需要显式确认");
      update({ message: "正在准备 AI 评分", persisted: false, phase: "review" });
      const scorer = agentModelOrThrow(input.scorerModelKey);
      const snapshot = await snapshotWithCaseIds();
      const samplesByRecordId = new Map(snapshot.samples.map((sample) => [sample.recordId, sample]));
      const selectedCaseIds = Array.isArray(input.caseIds) && input.caseIds.length ? new Set(input.caseIds) : null;
      const experimentId = assertExperimentMatchesGroup(input);
      const reviewBatchId = String(input.reviewBatchId || `REVIEW-${randomUUID()}`);
      const allCandidates = snapshot.results.filter(
        (result) => result.status === "成功" && result.attachments.length &&
          result.experimentId === input.groupId &&
          (!selectedCaseIds || selectedCaseIds.has(resultCaseId(result, samplesByRecordId))),
      );
      if (!allCandidates.length) throw inputError(`${experimentId} 在当前样本集中没有可评分的成功结果图`);
      const reviewState = input.resume === true && localStore.read ? await localStore.read() : { reviews: [] };
      const candidates = pendingBenchmarkReviewRuns(allCandidates, reviewState.reviews, experimentId, input.resume === true);
      if (!candidates.length) throw inputError(`${experimentId} 的成功结果已经全部完成正式评分`);
      const batch = {
        createdAt: new Date().toISOString(),
        experimentId,
        protocolVersion: BENCHMARK_REVIEW_PROTOCOL_VERSION,
        reviewBatchId,
        scorerModelId: scorer.id,
        resumedFrom: allCandidates.length - candidates.length,
        total: allCandidates.length,
      };
      await localStore.saveReviewBatch({ ...batch, status: "running" });
      update({
        completed: batch.resumedFrom,
        message: "评审批次已保存，开始逐图评分",
        persisted: true,
        phase: "review",
        total: batch.total,
      });
      let completed = batch.resumedFrom;
      try {
        for (const result of candidates) {
          const sample = samplesByRecordId.get(result.caseLinks?.[0]?.id);
          if (!sample) continue;
          update({ completed, message: `正在评分 ${result.runId}`, total: batch.total });
          const [reference, generated] = await Promise.all([
            baseStore.downloadSampleImage(sample),
            baseStore.downloadResultImage(result),
          ]);
          const review = await scoreBenchmarkImage({
            client,
            model: scorer.id,
            referenceImageUrl: reference.dataUrl,
            resultImageUrl: generated.dataUrl,
          });
          completed += 1;
          const storedReview = {
            ...review,
            caseId: sample.caseId,
            createdAt: new Date().toISOString(),
            experimentId,
            model: result.model,
            reviewBatchId,
            reviewId: `${reviewBatchId}__${result.runId}`,
            runId: result.runId,
            scorerModelId: scorer.id,
          };
          await localStore.saveReview(storedReview);
          await baseStore.saveRunReview?.(result.recordId, storedReview);
        }
        await localStore.saveReviewBatch({
          ...batch,
          completed,
          completedAt: new Date().toISOString(),
          status: "completed",
        });
        update({ completed, message: "AI 评分完成", total: batch.total });
        return { completed, reviewBatchId, total: batch.total };
      } catch (error) {
        await localStore.saveReviewBatch({
          ...batch,
          completed,
          error: String(error?.message || "AI 评分失败").slice(0, 1000),
          failedAt: new Date().toISOString(),
          status: "failed",
        }).catch(() => {});
        throw error;
      }
    },
  };
}

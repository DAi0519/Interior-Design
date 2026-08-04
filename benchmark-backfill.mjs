/**
 * [INPUT]: 依赖 Benchmark Base 五表配置、历史横评宽表附件与模型结果写入边界
 * [OUTPUT]: 提供只迁移历史附件、不调用模型的模型结果一图一行回填命令
 * [POS]: 项目根目录的 Benchmark 数据迁移入口，为旧宽表补齐运行真源
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import {
  benchmarkBaseConfigFromEnv,
  createBenchmarkBaseStore,
} from "./src/benchmark-base.mjs";
import {
  providerFromModelId,
  stableRunId,
} from "./src/benchmark-identifiers.mjs";

function linkedRecordId(value) {
  return Array.isArray(value) ? value[0]?.id || null : null;
}

function modelId(value) {
  return String(value || "").match(/\[([^\]]+)\]\s*$/)?.[1] || "";
}

async function main() {
  const config = benchmarkBaseConfigFromEnv();
  const store = createBenchmarkBaseStore(config);
  const snapshot = await store.loadSnapshot();
  const samples = new Map(
    snapshot.samples.map((sample) => [sample.recordId, sample]),
  );
  const prompts = new Map(
    snapshot.prompts.map((prompt) => [prompt.recordId, prompt]),
  );
  const resultsByRun = new Map();
  for (const result of snapshot.results) {
    const runId = result.runId.replace(/__A\d+$/, "");
    const entries = resultsByRun.get(runId) || [];
    entries.push(result);
    resultsByRun.set(runId, entries);
  }
  const counters = { created: 0, failed: 0, updated: 0 };

  for (const comparison of snapshot.comparisons) {
    const sample = samples.get(linkedRecordId(comparison.caseLinks));
    const prompt = prompts.get(linkedRecordId(comparison.promptLinks));
    if (!sample || !prompt) {
      throw new Error(`${comparison.compareId} 缺少 Case 或 Prompt 关联`);
    }
    const entries = snapshot.configs.flatMap((entry) =>
      (comparison.modelAttachments[entry.imageModelLabel] || []).map(
        (attachment, index) => ({
          attachment,
          config: entry,
          runId: stableRunId(prompt.promptId, entry.configId, index + 1),
          sampleIndex: index + 1,
        }),
      ),
    );
    for (const entry of entries) {
      const existingResults = resultsByRun.get(entry.runId) || [];
      const existingSuccess = existingResults.find(
        (result) =>
          result.status === "成功" && result.attachments.length > 0,
      );
      const existingPending = existingResults.findLast(
        (result) => result.status === "生成中",
      );
      const existing = existingSuccess || existingPending;
      const common = {
        attempt: existing?.attempt || 1,
        caseRecordId: sample.recordId,
        configRecordId: entry.config.recordId,
        experimentId: comparison.groupId,
        experimentType: "模型横评",
        model: entry.config.imageModelLabel,
        output: entry.config.outputSpec,
        promptCost: prompt.cost,
        promptDurationSeconds: prompt.durationSeconds,
        promptHash: prompt.hash,
        promptRecordId: prompt.recordId,
        provider: providerFromModelId(modelId(entry.config.imageModel)),
        runId: existing?.runId || entry.runId,
        sampleIndex: entry.sampleIndex,
      };
      if (existingSuccess) {
        await store.saveRunResult(
          { ...common, status: "成功" },
          existingSuccess.recordId,
        );
        counters.updated += 1;
        continue;
      }

      let recordId = await store.saveRunResult(
        {
          ...common,
          status: "生成中",
        },
        existingPending?.recordId,
      );
      try {
        await store.copyComparisonImageToResult({
          sourceAttachment: entry.attachment,
          sourceRecordId: comparison.recordId,
          targetRecordId: recordId,
        });
        recordId = await store.saveRunResult(
          { ...common, status: "成功" },
          recordId,
        );
        resultsByRun.set(entry.runId, [{
          attachments: [entry.attachment],
          attempt: 1,
          recordId,
          runId: entry.runId,
          status: "成功",
        }]);
        counters.created += 1;
      } catch (error) {
        await store.saveRunResult(
          { ...common, error, status: "失败" },
          recordId,
        );
        counters.failed += 1;
        console.error(`${entry.runId}: ${error.message}`);
      }
    }
  }

  console.log(JSON.stringify(counters, null, 2));
  if (counters.failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exitCode = 1;
});

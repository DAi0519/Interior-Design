/**
 * [INPUT]: 依赖 node:fs/promises 与 node:path，接收当前 worktree 内的本地评测状态路径
 * [OUTPUT]: 对外提供样本集、实验、样本分类元数据、评审批次与 AI 评分的原子 JSON 持久化
 * [POS]: src 的评测工作台本地版本化存储边界，不改写历史飞书评分字段
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const EMPTY_STATE = Object.freeze({
  caseMetadata: [],
  datasets: [],
  experiments: [],
  reviewBatches: [],
  reviews: [],
  version: 2,
});

function stateShape(value) {
  return {
    caseMetadata: Array.isArray(value?.caseMetadata) ? value.caseMetadata : [],
    datasets: Array.isArray(value?.datasets) ? value.datasets : [],
    experiments: Array.isArray(value?.experiments) ? value.experiments : [],
    reviewBatches: Array.isArray(value?.reviewBatches) ? value.reviewBatches : [],
    reviews: Array.isArray(value?.reviews) ? value.reviews : [],
    version: 2,
  };
}

function upsert(items, key, value) {
  const index = items.findIndex((item) => item[key] === value[key]);
  if (index === -1) return [...items, value];
  return items.map((item, itemIndex) => itemIndex === index ? value : item);
}

export function createBenchmarkWorkbenchStore(filePath) {
  if (!String(filePath || "").trim()) {
    throw new TypeError("评测工作台状态文件路径不能为空");
  }
  let writes = Promise.resolve();

  async function read() {
    try {
      return stateShape(JSON.parse(await readFile(filePath, "utf8")));
    } catch (error) {
      if (error.code === "ENOENT") return structuredClone(EMPTY_STATE);
      throw error;
    }
  }

  async function persist(state) {
    await mkdir(dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(stateShape(state), null, 2)}\n`, {
      mode: 0o600,
    });
    await rename(temporaryPath, filePath);
    return state;
  }

  async function schedule(operation) {
    writes = writes.then(operation, operation);
    return writes;
  }

  async function write(state) {
    return schedule(() => persist(state));
  }

  async function update(mutator) {
    return schedule(async () => persist(await mutator(await read())));
  }

  return {
    read,
    async saveCaseMetadata(metadata) {
      return update((state) => ({
        ...state,
        caseMetadata: upsert(state.caseMetadata, "caseId", metadata),
      }));
    },
    async saveDataset(dataset) {
      return update((state) => ({
        ...state,
        datasets: upsert(state.datasets, "datasetId", dataset),
      }));
    },
    async saveExperiment(experiment) {
      return update((state) => ({
        ...state,
        experiments: upsert(state.experiments, "experimentId", experiment),
      }));
    },
    async saveReview(review) {
      return update((state) => ({
        ...state,
        reviews: upsert(state.reviews, "reviewId", review),
      }));
    },
    async saveReviewBatch(reviewBatch) {
      return update((state) => ({
        ...state,
        reviewBatches: upsert(
          state.reviewBatches,
          "reviewBatchId",
          reviewBatch,
        ),
      }));
    },
  };
}

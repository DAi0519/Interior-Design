/**
 * [INPUT]: 依赖 node:test/assert、临时目录与 benchmark-workbench-store.mjs
 * [OUTPUT]: 对外提供样本集、本地实验、分类元数据与评分版本原子持久化的回归保障
 * [POS]: test 的 Benchmark 本地状态存储测试，不接触用户工作区状态文件
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createBenchmarkWorkbenchStore } from "../src/benchmark-workbench-store.mjs";

test("本地评测状态按稳定 ID 更新而不是追加重复版本", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "benchmark-store-test-"));
  context.after(() => rm(directory, { force: true, recursive: true }));
  const store = createBenchmarkWorkbenchStore(join(directory, "state.json"));

  await store.saveCaseMetadata({ caseId: "CASE-1", category: "客厅" });
  await store.saveCaseMetadata({ caseId: "CASE-1", category: "卧室" });
  await store.saveDataset({ datasetId: "SET-1", name: "初版样本集" });
  await store.saveDataset({ datasetId: "SET-1", name: "回归样本集" });
  await store.saveReview({ reviewId: "REVIEW-1", runId: "RUN-1", imageQuality: 3 });
  await store.saveReview({ reviewId: "REVIEW-1", runId: "RUN-1", imageQuality: 4 });
  await Promise.all([
    store.saveReview({ reviewId: "REVIEW-2", runId: "RUN-2", imageQuality: 3 }),
    store.saveReview({ reviewId: "REVIEW-3", runId: "RUN-3", imageQuality: 5 }),
  ]);

  const state = await store.read();
  assert.equal(state.caseMetadata.length, 1);
  assert.equal(state.caseMetadata[0].category, "卧室");
  assert.equal(state.datasets.length, 1);
  assert.equal(state.datasets[0].name, "回归样本集");
  assert.equal(state.reviews.length, 3);
  assert.equal(state.reviews[0].imageQuality, 4);
});

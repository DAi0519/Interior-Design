/**
 * [INPUT]: 依赖 node:test/assert 与服务端/浏览器批量生成纯规则
 * [OUTPUT]: 对外提供最多四模型、批次标识、逐模型参数适配、保序并发、部分失败与 ComfyUI 分段耗时摘要回归保障
 * [POS]: test 的多模型批量生成单元测试，不发送真实模型请求
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  adaptGenerationInputForModel,
  runGenerationBatch,
} from "../public/generation-batch.js";
import { resultMetadata } from "../public/workbench-utils.js";
import { normalizeGenerationBatch } from "../src/generation-batch.mjs";
import { publicModelCatalog } from "../src/model-config.mjs";

test("服务端只在多模型请求中保留严格批次元数据", () => {
  assert.deepEqual(normalizeGenerationBatch({}), {});
  assert.deepEqual(normalizeGenerationBatch({
    batchCount: 4,
    batchId: "batch_20260806",
    batchIndex: 3,
  }), {
    batchCount: 4,
    batchId: "batch_20260806",
    batchIndex: 3,
  });
  assert.throws(() => normalizeGenerationBatch({ batchCount: 5 }), /最多选择 4 个/);
  assert.throws(
    () => normalizeGenerationBatch({ batchCount: 2, batchIndex: 1 }),
    /批次 ID/,
  );
});

test("不同模型自动收敛到各自合法参数而不篡改共同输入", () => {
  const catalog = publicModelCatalog();
  const input = {
    outputFormat: "jpeg",
    prompt: "共同提示词",
    quality: "high",
    ratio: "8:1",
    ratioMode: "manual",
    resolution: "512",
    workflowProfile: "fast",
  };
  const gpt = adaptGenerationInputForModel(
    input,
    catalog.find((model) => model.key === "gptImage2"),
    { featureMode: "free" },
  );
  const comfy = adaptGenerationInputForModel(
    input,
    catalog.find((model) => model.key === "aiTextureEnhancement"),
    { featureMode: "refinedModel", sourceImage: { height: 900, width: 1600 } },
  );

  assert.equal(gpt.prompt, "共同提示词");
  assert.equal(gpt.ratio, "4:3");
  assert.equal(gpt.resolution, "2K");
  assert.equal(gpt.quality, "high");
  assert.equal(comfy.ratio, "source");
  assert.equal(comfy.resolution, "source");
  assert.equal(comfy.outputFormat, "png");
  assert.equal(comfy.workflowProfile, "fast");
  assert.equal(gpt.workflowProfile, undefined);
});

test("Flux 结果摘要区分 Prompt、排队与 Comfy 执行耗时", () => {
  const metadata = resultMetadata({
    promptAgent: { durationMs: 8_650, version: 3 },
    request: {
      outputFormat: "png",
      referenceImageCount: 1,
      size: "1920x1080",
      workflowProfileLabel: "快速",
    },
    style: { name: "智能默认" },
    upstream: {
      metadata: {
        engine: "comfyui",
        executionDurationMs: 30_476,
        queueDurationMs: 1_250,
      },
    },
  });

  assert.match(metadata, /Prompt 8\.7s/);
  assert.match(metadata, /排队 1\.3s/);
  assert.match(metadata, /Comfy 执行 30\.5s/);
});

test("批量调度最多并发两个并按模型顺序保留部分失败", async () => {
  let active = 0;
  let maximumActive = 0;
  const progress = [];
  const outcomes = await runGenerationBatch({
    concurrency: 2,
    items: ["a", "b", "c", "d"],
    onProgress: ({ completed }) => progress.push(completed),
    async execute(item) {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, item === "a" ? 8 : 2));
      active -= 1;
      if (item === "c") throw new Error("c failed");
      return item.toUpperCase();
    },
  });

  assert.equal(maximumActive, 2);
  assert.deepEqual(outcomes.map((entry) => entry.item), ["a", "b", "c", "d"]);
  assert.deepEqual(outcomes.map((entry) => entry.status), [
    "fulfilled", "fulfilled", "rejected", "fulfilled",
  ]);
  assert.deepEqual(progress.sort(), [1, 2, 3, 4]);
});

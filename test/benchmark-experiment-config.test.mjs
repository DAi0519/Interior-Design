/**
 * [INPUT]: 依赖 node:test/assert 与 benchmark-experiment-config.mjs 的实验草稿领域契约
 * [OUTPUT]: 对外提供固定参数冻结、稳定配置 ID、OneAPI Provider 边界、输出规格解析及跨模型参数合法性的回归保障
 * [POS]: test 的 Benchmark 实验配置护栏，不读写飞书或调用模型
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  generationConfigsMatch,
  normalizeExperimentDraft,
  parseBenchmarkOutputSpec,
} from "../src/benchmark-experiment-config.mjs";

function draft(overrides = {}) {
  return {
    draftConfig: {
      agentCode: "white-model-fusion",
      agentVersion: 7,
      fusionModelKey: "gemini3pro",
      imageModelKeys: ["seedream5", "banana2", "gptImage2"],
      outputFormat: "png",
      perBatchImages: 4,
      promptBatches: 1,
      quality: "medium",
      ratio: "",
      ratioMode: "source",
      resolution: "2K",
      styleCode: "cream-french@v4",
      ...overrides,
    },
    experimentId: "EXP-NEW-001",
  };
}

test("实验草稿冻结共享参数并为每个候选模型生成稳定配置", () => {
  const first = normalizeExperimentDraft(draft());
  const second = normalizeExperimentDraft(draft());

  assert.equal(first.configs.length, 3);
  assert.deepEqual(first.configIds, second.configIds);
  assert.equal(new Set(first.configs.map((config) => config.outputSpec)).size, 1);
  assert.match(first.configs[0].outputSpec, /跟随原图比例 · 2K · PNG · 质量 medium/);
  assert.ok(first.configs.every((config) => config.groupId === "EXP-NEW-001"));
});

test("输出规格保留固定画幅与质量档", () => {
  assert.deepEqual(
    parseBenchmarkOutputSpec("4:3 · 2K · WEBP · 质量 high"),
    {
      outputFormat: "webp",
      quality: "high",
      ratio: "4:3",
      resolution: "2K",
      sourceNearest: false,
    },
  );
});

test("配置一致性忽略展示名称和默认 medium 后缀，只比较稳定编码", () => {
  const desired = normalizeExperimentDraft(draft()).configs.find((config) =>
    config.imageModel.includes("gemini-3.1-flash-image-preview"));
  const stored = {
    ...desired,
    fusionAgent: "白模渲染融合 Agent-即梦 v7 [white-model-fusion@v7]",
    outputSpec: "跟随原图比例 · 2K · PNG",
    styleDna: "奶油法式 v4 [cream-french@v4]",
  };

  assert.equal(generationConfigsMatch(stored, desired), true);
  assert.equal(generationConfigsMatch(
    { ...stored, outputSpec: "跟随原图比例 · 4K · PNG" },
    desired,
  ), false);
});

test("实验草稿在预演前阻止跨模型不兼容参数", () => {
  assert.throws(
    () => normalizeExperimentDraft(draft({ resolution: "1K" })),
    /Seedream 5.0.*不支持 1K/,
  );
});

test("实验草稿拒绝仅供日常生图使用的 ComfyUI 工作流", () => {
  assert.throws(
    () => normalizeExperimentDraft(draft({ imageModelKeys: ["aiTextureEnhancement"] })),
    /Flux2 Klein 当前不支持 Benchmark 批量横评/,
  );
});

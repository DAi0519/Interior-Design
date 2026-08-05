/**
 * [INPUT]: 依赖 node:test/assert 与 benchmark-experiment-config.mjs 的实验草稿领域契约
 * [OUTPUT]: 对外提供八类质量配置单变量冻结、稳定配置 ID、提示/出图阶段归因、双 Provider 智能分辨率及跨模型参数合法性的回归保障
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

test("实验计划生成前阻止跨模型不兼容参数", () => {
  assert.throws(
    () => normalizeExperimentDraft(draft({ resolution: "1K" })),
    /Seedream 5.0.*不支持 1K/,
  );
});

test("实验草稿允许 Flux2 Klein 以原图尺寸进入 Benchmark", () => {
  const experiment = normalizeExperimentDraft(draft({
    imageModelKeys: ["aiTextureEnhancement"],
    resolution: "source",
  }));

  assert.equal(experiment.configs[0].imageModel, "Flux2 Klein [comfyui:ai-texture-enhancement]");
  assert.match(experiment.configs[0].outputSpec, /跟随原图比例 · 原图尺寸 · PNG/);
  assert.deepEqual(
    parseBenchmarkOutputSpec(experiment.configs[0].outputSpec),
    {
      outputFormat: "png",
      quality: "medium",
      ratio: null,
      resolution: "source",
      sourceNearest: true,
    },
  );
});

test("混合候选按 Provider 智能路由分辨率", () => {
  const experiment = normalizeExperimentDraft(draft({
    imageModelKeys: ["banana2", "gptImage2", "aiTextureEnhancement", "seedream5"],
    resolution: "adaptive",
  }));
  const flux = experiment.configs.find((config) => config.imageModel.includes("Flux2 Klein"));
  const presetConfigs = experiment.configs.filter((config) => config !== flux);

  assert.equal(experiment.frozen.resolution, "adaptive");
  assert.match(flux.outputSpec, /跟随原图比例 · 原图尺寸 · PNG/);
  assert.ok(presetConfigs.every((config) => /跟随原图比例 · 2K · PNG/.test(config.outputSpec)));
});

test("Prompt 版本变量为每个版本生成独立配置并固定出图模型", () => {
  const experiment = normalizeExperimentDraft(draft({
    imageModelKeys: ["seedream5"],
    promptAgentKeys: ["white-model-fusion@v6", "white-model-fusion@v7"],
    variableType: "prompt-version",
  }));

  assert.equal(experiment.variableType, "prompt-version");
  assert.equal(experiment.configs.length, 2);
  assert.equal(new Set(experiment.configIds).size, 2);
  assert.equal(new Set(experiment.configs.map((config) => config.imageModel)).size, 1);
  assert.deepEqual(
    experiment.configs.map((config) => config.fusionAgent),
    [
      "白模渲染融合 Agent [white-model-fusion@v6]",
      "白模渲染融合 Agent [white-model-fusion@v7]",
    ],
  );
});

test("Prompt 版本变量拒绝同时改变出图模型或只选一个版本", () => {
  assert.throws(
    () => normalizeExperimentDraft(draft({
      imageModelKeys: ["seedream5", "banana2"],
      promptAgentKeys: ["white-model-fusion@v6", "white-model-fusion@v7"],
      variableType: "prompt-version",
    })),
    /必须固定一个出图模型/,
  );
  assert.throws(
    () => normalizeExperimentDraft(draft({
      imageModelKeys: ["seedream5"],
      promptAgentKeys: ["white-model-fusion@v7"],
      variableType: "prompt-version",
    })),
    /至少选择两个候选值/,
  );
});

test("Style DNA、融合基模和输出参数都能成为唯一实验因子", () => {
  const cases = [
    ["style-dna", ["cream-french@v3", "cream-french@v4"], "prompt"],
    ["fusion-model", ["gemini3pro", "gemini35flash"], "prompt"],
    ["ratio", ["1:1", "4:3"], "image"],
    ["resolution", ["1K", "2K"], "image"],
    ["output-format", ["png", "webp"], "image"],
    ["quality", ["low", "high"], "image"],
  ];

  for (const [variableKey, variantValues, stage] of cases) {
    const experiment = normalizeExperimentDraft(draft({
      imageModelKey: "gptImage2",
      imageModelKeys: ["gptImage2"],
      ratio: "4:3",
      ratioMode: "preset",
      variableKey,
      variantValues,
    }));
    assert.equal(experiment.variableKey, variableKey);
    assert.equal(experiment.variableStage, stage);
    assert.equal(experiment.configs.length, 2);
    assert.equal(new Set(experiment.configIds).size, 2);
  }
});

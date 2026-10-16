/**
 * [INPUT]: 依赖 node:test/assert、模型真源、浏览器尺寸与批任务适配、Beta 模型规则及 Benchmark 实验配置
 * [OUTPUT]: 对外提供 Banana 2.1 独立身份、三工作台尺寸合同、旧模型选择兼容及非法档位/全景前置阻断回归保障
 * [POS]: test 的 Banana 2.1 跨层接入测试，不调用模型、网络或真实飞书
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";

import { betaModelSelectable, betaSizeOptions } from "../public/beta-model-rules.js";
import { adaptGenerationInputForModel } from "../public/generation-batch.js";
import { buildGenerationJobRequest } from "../public/generation-task-request.js";
import { sizeControlState, sizeSummary } from "../public/model-capabilities.js";
import { normalizeExperimentDraft } from "../src/benchmark-experiment-config.mjs";
import { createGenerationRequest, imageProviderForModel, publicModelCatalog } from "../src/model-config.mjs";

function model() {
  return publicModelCatalog().find((entry) => entry.key === "banana21");
}

function input(overrides = {}) {
  return { modelKey: "banana21", outputFormat: "png", prompt: "保留空间结构并改善材质与光照",
    ratio: "4:3", resolution: "2K", ...overrides };
}

function draft(overrides = {}) {
  return { experimentId: "EXP-BANANA21-CONTRACT", draftConfig: {
    agentCode: "white-model-fusion", agentVersion: 7, fusionModelKey: "gemini3pro",
    imageModelKeys: ["banana2", "banana21"], outputFormat: "png", perBatchImages: 1,
    promptBatches: 1, quality: "medium", ratio: "4:3", ratioMode: "preset",
    resolution: "2K", styleCode: "cream-french@v4", ...overrides,
  } };
}

test("Banana 2.1 与旧 Banana 2 保持独立模型和历史配置身份", () => {
  const catalog = publicModelCatalog();
  assert.equal(model().id, "gemini-nano-banana-2.1");
  assert.equal(model().label, "Banana 2.1");
  assert.equal(imageProviderForModel("banana21"), "oneapi");
  assert.equal(catalog.find((entry) => entry.key === "banana2").id, "gemini-3.1-flash-image-preview");
  assert.equal(new Set(catalog.map((entry) => entry.id)).size, catalog.length);
  const experiment = normalizeExperimentDraft(draft());
  assert.equal(new Set(experiment.configIds).size, 2);
  assert.deepEqual(experiment.configs.map((config) => config.imageModel), [
    "Banana 2 [gemini-3.1-flash-image-preview]", "Banana 2.1 [gemini-nano-banana-2.1]",
  ]);
  assert.deepEqual(normalizeExperimentDraft(draft()).configIds, experiment.configIds);
});

test("Banana 2.1 的所有公开尺寸在浏览器、Beta 和 API 请求中保持一致", () => {
  const current = model();
  assert.deepEqual(current.formats, ["png", "jpeg"]);
  assert.deepEqual(current.qualityOptions, []);
  assert.deepEqual(Object.keys(current.sizes).sort(), [
    "1:1", "1:4", "1:8", "2:3", "3:2", "3:4", "4:1", "4:3", "4:5",
    "5:4", "8:1", "9:16", "16:9", "21:9",
  ].sort());
  assert.equal(createGenerationRequest(input({ ratio: "16:9", resolution: "1K" })).request.size, "1376x768");
  assert.equal(createGenerationRequest(input({ ratio: "1:8", resolution: "4K" })).request.size, "1536x12288");
  for (const [ratio, sizes] of Object.entries(current.sizes)) {
    assert.deepEqual(Object.keys(sizes), ["1K", "2K", "4K"], ratio);
    for (const [resolution, size] of Object.entries(sizes)) {
      const controls = sizeControlState({ currentRatio: ratio, currentResolution: resolution,
        model: current, preserveResolution: true, ratioMode: "manual" });
      assert.equal(controls.ratio, ratio);
      assert.equal(controls.resolution, resolution);
      const beta = betaSizeOptions({ models: [current], featureMode: "free",
        currentRatio: ratio, currentResolution: resolution });
      assert.equal(beta.ratio, ratio);
      assert.equal(beta.resolution, resolution);
      assert.equal(sizeSummary({ model: current, ratio, ratioMode: "manual", resolution }).exactSize, size);
      const generation = createGenerationRequest(input({ ratio, resolution, quality: "high" }));
      assert.equal(generation.request.model, current.id);
      assert.equal(generation.request.size, size);
      assert.equal(generation.preview.size, size);
      assert.equal(Object.hasOwn(generation.request, "quality"), false);
      assert.equal(generation.request.n, 1);
    }
  }
});

test("切换 Banana 2 的 512 缓存到 Banana 2.1 时回退合法档位且多模型仍共享原图", () => {
  const current = model();
  const sharedInput = input({ ratioMode: "manual", resolution: "512",
    referenceImages: [{ dataUrl: "data:image/png;base64,AA==" }] });
  const adapted = adaptGenerationInputForModel(sharedInput, current, { featureMode: "free" });
  assert.equal(adapted.resolution, current.defaultResolution);
  const request = buildGenerationJobRequest({ baseInput: sharedInput, featureMode: "free",
    models: publicModelCatalog().filter((entry) => ["banana2", "banana21"].includes(entry.key)) });
  assert.equal(request.sharedInput.referenceImages.length, 1);
  assert.deepEqual(request.items.map((item) => item.input.resolution), ["512", current.defaultResolution]);
  assert.ok(request.items.every((item) => !Object.hasOwn(item.input, "referenceImages")));
});

test("Banana 2.1 不继承旧 Banana 2 的 512 与未验证 2:1 全景合同", () => {
  const current = model();
  assert.equal(current.sizes["2:1"], undefined);
  assert.equal(betaModelSelectable(current, "panoramaEnhancement"), false);
  assert.equal(betaModelSelectable(current, "effectBeautification"), true);
  assert.throws(() => createGenerationRequest(input({ resolution: "512" })), /不支持这个分辨率/);
  assert.throws(() => createGenerationRequest(input({ ratio: "2:1" })), /不支持这个画幅/);
  assert.throws(() => createGenerationRequest(input({ featureMode: "panoramaEnhancement", ratio: "2:1" })), /不支持全景图所需的 2:1/);
  assert.throws(() => normalizeExperimentDraft(draft({ resolution: "512" })), /Banana 2.1.*不支持 512/);
  assert.throws(() => normalizeExperimentDraft(draft({ ratio: "2:1" })), /Banana 2.1.*不支持 2:1/);
});

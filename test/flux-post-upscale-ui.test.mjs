/**
 * [INPUT]: 依赖Node测试、公开模型目录、Main/Beta尺寸规则、逐模型请求适配、尺寸控制器和实际结果摘要
 * [OUTPUT]: 验证各功能KS4K/6K文案与身份冻结、超宽输入前端阻断、自由生图样本库的尺寸投影、旧进程门禁、独立超分/全景/双图隔离和真实结果显示
 * [POS]: test 的功能内后置KS浏览器合同测试，不调用模型、飞书或真实浏览器
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { publicModelCatalog } from "../src/model-config.mjs";
import { publicImageUpscaleConfig } from "../src/image-upscale-workflow.mjs";
import { betaPostUpscaleUnavailableReason, betaSizeOptions } from "../public/beta-model-rules.js";
import { adaptGenerationInputForModel } from "../public/generation-batch.js";
import { bindGenerationSizeControls } from "../public/generation-size-controls.js";
import { fluxPostUpscaleState, sizeControlState, sizeSummary } from "../public/model-capabilities.js";
import { resultMetadata } from "../public/workbench-utils.js";

const model = publicModelCatalog().find(entry => entry.key === "aiTextureEnhancement");
const sourceImage = { width: 1600, height: 900 };
const input = { featureMode: "whiteModel", modelKey: model.key, resolution: "6K", ratio: "source", outputFormat: "png" };
const modes = ["free", "whiteModel", "emptyRoom", "roomRenovation", "styleTransfer", "refinedModel",
  "effectEnhancement", "effectBeautification", "textureEnhancement"];

test("功能内4K/6K由目录显示KS直入并逐模型冻结，独立超分默认继续攸行", () => {
  const controls = sizeControlState({ model, featureMode: "whiteModel", sourceImage,
    currentResolution: "6K", preserveResolution: true });
  for (const resolution of ["4K", "6K"]) {
    assert.match(controls.resolutionOptions.find(option => option.value === resolution).label, /2K→KS直入 · 7B/);
    for (const featureMode of modes) {
      const adapted = adaptGenerationInputForModel({ ...input, featureMode, resolution }, model, { featureMode, sourceImage });
      assert.equal(adapted.postUpscaleWorkflowKey, "ks_seedvr2_2x_direct");
      assert.equal(adapted.postUpscaleWorkflowVersion, "2026-10-27.1");
    }
  }
  assert.equal(publicImageUpscaleConfig().defaultWorkflowKey, "youxing_seedvr2_3b");
  assert.equal(sizeSummary({ model, featureMode: "whiteModel", resolution: "6K", sourceImage }).exactSize, "6144 × 3470");
});

test("超宽画幅按真实2K中间图提前阻断KS，原生2K不降档或替换输出", () => {
  const source = { width: 3000, height: 1000 };
  const state = fluxPostUpscaleState({ model, featureMode: "whiteModel", resolution: "6K", sourceImage: source });
  assert.match(state.reason, /3504×1168/);
  assert.match(state.reason, /384–3200/);
  assert.throws(() => adaptGenerationInputForModel(input, model, { featureMode: "whiteModel", sourceImage: source }), /请选择原生/);
  const native = adaptGenerationInputForModel({ ...input, resolution: "2K" }, model, { featureMode: "whiteModel", sourceImage: source });
  assert.equal(native.resolution, "2K");
  assert.equal("postUpscaleWorkflowKey" in native, false);
  const controls = bindGenerationSizeControls({ elements: { resolutionSelect: { value: "6K" } },
    getContext: () => ({ featureMode: "whiteModel", model, sourceImage: source }) });
  assert.match(controls.unavailableReason(), /384–3200/);
});

test("旧运行目录缺少后置身份时明确要求更新，不把旧攸行菜单写成KS", () => {
  const legacyModel = { ...model, postUpscale: { "6K": { sourceResolution: "2K", longEdge: 6144 } } };
  assert.match(fluxPostUpscaleState({ model: legacyModel, featureMode: "whiteModel", resolution: "6K", sourceImage }).reason, /尚未加载/);
  assert.throws(() => adaptGenerationInputForModel(input, legacyModel, { featureMode: "whiteModel", sourceImage }), /更新工作台/);
  const controls = sizeControlState({ model: legacyModel, currentResolution: "6K", preserveResolution: true });
  assert.match(controls.resolutionOptions.find(option => option.value === "6K").label, /攸行/);
});

test("原生档/全景/双图与其他模型不携带后置身份，切模型清理旧字段", () => {
  for (const resolution of ["1K", "2K"]) {
    assert.deepEqual(fluxPostUpscaleState({ model, featureMode: "whiteModel", resolution, sourceImage }).requestFields, {});
  }
  const panorama = adaptGenerationInputForModel({ ...input, featureMode: "panoramaEnhancement" }, model,
    { featureMode: "panoramaEnhancement", sourceImage: { width: 2000, height: 1000 } });
  assert.equal(panorama.resolution, "original");
  assert.equal("postUpscaleWorkflowKey" in panorama, false);
  const dual = adaptGenerationInputForModel({ ...input, refinedLighting: { mode: "reference" } }, model,
    { featureMode: "refinedModel", sourceImage });
  assert.equal(dual.resolution, "2K");
  assert.equal("postUpscaleWorkflowKey" in dual, false);
  const otherModel = publicModelCatalog().find(entry => entry.key === "seedream5");
  const other = adaptGenerationInputForModel({ ...input, postUpscaleWorkflowKey: "ks_seedvr2_2x_direct",
    postUpscaleWorkflowVersion: "2026-10-27.1" }, otherModel, { featureMode: "whiteModel", sourceImage });
  assert.equal("postUpscaleWorkflowKey" in other, false);
  assert.equal("postUpscaleWorkflowVersion" in other, false);
  assert.equal(fluxPostUpscaleState({ model, featureMode: "imageUpscale", resolution: "6K", sourceImage }).reason, null);
});

test("Beta逐张尺寸预检指出具体样本，菜单支持单Flux与混选模型", () => {
  const settings = { featureMode: "roomRenovation", models: [model], resolution: "6K",
    sources: [sourceImage, { width: 3000, height: 1000 }] };
  assert.match(betaPostUpscaleUnavailableReason(settings), /第 2 张样本.*3504×1168/);
  assert.equal(betaPostUpscaleUnavailableReason({ ...settings, sources: [sourceImage] }), null);
  for (const [models, resolution] of [[[model], "6K"], [[model, publicModelCatalog().find(entry => entry.key === "banana2")], "4K"]]) {
    const options = betaSizeOptions({ models, featureMode: "roomRenovation", currentResolution: resolution }).resolutionOptions;
    assert.match(options.find(option => option.value === resolution).label, /KS直入/);
  }
});

test("Beta自由生图预检向样本库传递可选共用参考图并检查其尺寸投影", async () => {
  const source = await readFile(new URL("../public/beta-app.js", import.meta.url), "utf8");
  const functionSource = source.match(/function postUpscaleIssue\(\) \{[^\n]+\}/)?.[0];
  assert.ok(functionSource);
  const context = {
    state: { featureMode: "free", freeReference: { width: 3000, height: 1000 } },
    selectedModels: () => [model], elements: { resolutionSelect: { value: "6K" } },
    sampleLibrary: { sourceDimensions: (reference) => [reference] }, refinedRenderConfiguration: { snapshot: () => null },
    betaPostUpscaleUnavailableReason,
  };
  const inspect = new Function(...Object.keys(context), `return (${functionSource})();`);
  assert.match(inspect(...Object.values(context)), /3504×1168.*384–3200/);
  context.state.freeReference = sourceImage;
  assert.equal(inspect(...Object.values(context)), null);
});

test("结果摘要按实际KS身份和5K推理显示，历史攸行记录保持原文", () => {
  const result = { request: { outputFormat: "png", referenceImageCount: 1, size: "6144x3470" }, upstream: { metadata: {
    engine: "comfyui", upscaleResolution: "6K", upscaleWorkflowKey: "ks_seedvr2_2x_direct",
    upscaleWorkflowLabel: "KS直入 · 7B", postUpscale: { workflowId: "ks_seedvr2_2x_direct", fixedInferenceLongEdge: 5120 },
  } } };
  const actual = resultMetadata(result, { status: "pending" });
  assert.match(actual, /2K→KS直入 · 7B 6K（5K推理）/);
  assert.doesNotMatch(actual, /攸行/);
  const historical = resultMetadata({ ...result, upstream: { metadata: { engine: "comfyui", upscaleResolution: "4K" } } }, { status: "success" });
  assert.match(historical, /2K→攸行 4K/);
});

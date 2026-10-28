/**
 * [INPUT]: 依赖 node:test/assert、公开模型目录、上传能力/生成输入/批次请求/任务恢复与 Flux 负向输入控制器
 * [OUTPUT]: 对外提供新旧运行进程准入/空负向结果标记、单图必填、飞书版本冻结/功能隔离、模型参数适配、单份图片载荷、负向隐藏及跨功能任务恢复合同测试
 * [POS]: test 的质感增强前端合同测试，使用内存模型与存储替身，不发送网络或生图请求
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";

import { bindFluxNegativePrompt } from "../public/flux-negative-prompt.js";
import { buildGenerationInput } from "../public/generation-input.js";
import { buildGenerationJobRequest, generationItemsForSelection, generationLoadingCopy } from "../public/generation-task-request.js";
import { createGenerationTask, readGenerationTasks, saveGenerationTask } from "../public/generation-task-state.js";
import { generationFeatureUnavailableReason, referenceCapability, referenceSubject } from "../public/model-capabilities.js";
import { publicModelCatalog } from "../src/model-config.mjs";
import { resultMetadata } from "../public/workbench-utils.js";

const source = { dataUrl: "data:image/png;base64,AA==", name: "room.png", size: 1, type: "image/png", width: 1600, height: 900 };

test("质感增强以运行进程功能目录准入，旧服务缺字段阻断且不影响已有功能", () => {
  for (const modes of [undefined, null, {}, [], ["free", "whiteModel"]]) {
    assert.match(generationFeatureUnavailableReason("textureEnhancement", modes), /当前服务尚未加载质感增强/);
    assert.equal(generationFeatureUnavailableReason("whiteModel", modes), null);
  }
  assert.equal(generationFeatureUnavailableReason("textureEnhancement", ["textureEnhancement"]), null);
});

test("质感增强显式空负向的实际结果不误标默认负向", () => {
  const summary = resultMetadata({ request: { outputFormat: "png", size: "1520x2736" },
    upstream: { metadata: { engine: "comfyui", negativePromptMode: "disabled-fixed-prompt" } } }, { status: "success" });
  assert.doesNotMatch(summary, /默认负向|自定义负向/);
  assert.match(summary, /已同步飞书/);
});

function inputFor(model, overrides = {}) {
  return buildGenerationInput({
    featureMode: "textureEnhancement",
    textureEnhancementPromptVersion: 4,
    model,
    prompt: { free: "上个功能保留的要求", refined: "上个精模要求" },
    negativePrompt: "上个功能保留的自定义负向",
    referenceImages: [source],
    styleReferenceImages: [source],
    effectTime: "night",
    effectWeather: "rainy",
    effectBeautification: { strength: "high", tone: "warm" },
    renderMode: { mode: "smart-default" },
    outputFormat: "png",
    ratio: "4:3",
    ratioMode: "auto",
    resolution: "2K",
    ...overrides,
  });
}

test("质感增强对所有出图模型保持单张必填原图合同", () => {
  assert.equal(referenceSubject("textureEnhancement"), "待增强效果图");
  for (const model of publicModelCatalog()) {
    const capability = referenceCapability({ featureMode: "textureEnhancement", model, policy: { maxCount: 4 } });
    assert.equal(capability.limit, 1);
    assert.equal(capability.multiple, false);
    assert.equal(capability.optionalLabel, "必填 · 1张");
    assert.equal(capability.title, "待增强效果图");
    assert.equal(capability.ariaLabel, "添加待增强效果图");
  }
});

test("质感增强输入不携带其他功能的正向、负向、环境或美化选择", () => {
  const input = inputFor(publicModelCatalog()[0]);
  assert.equal(input.featureMode, "textureEnhancement");
  assert.equal(input.prompt, "");
  assert.equal(input.negativePrompt, "");
  assert.equal(input.outputFormat, "png");
  assert.equal(input.textureEnhancementPromptVersion, 4);
  assert.equal(input.referenceImages.length, 1);
  for (const key of ["styleReferenceImages", "effectTime", "effectWeather", "effectBeautification", "refinedLighting"]) {
    assert.equal(Object.hasOwn(input, key), false, key);
  }
});

test("质感增强飞书版本只随本功能请求，不进入其他功能", () => {
  const input = inputFor(publicModelCatalog()[0], { featureMode: "free" });
  assert.equal(Object.hasOwn(input, "textureEnhancementPromptVersion"), false);
});

test("质感增强批次沿用逐模型合法尺寸且共享图片只传一次", () => {
  const models = publicModelCatalog();
  const request = buildGenerationJobRequest({
    baseInput: inputFor(models[0]),
    batchId: "texture-batch",
    featureMode: "textureEnhancement",
    jobId: "generation-texture-123456",
    forcePromptRegeneration: false,
    models,
    sourceImage: source,
  });
  assert.equal(request.featureMode, "textureEnhancement");
  assert.equal(request.sharedInput.referenceImages.length, 1);
  assert.equal(request.items.length, models.length);
  for (const [index, item] of request.items.entries()) {
    const model = models[index];
    assert.equal(item.input.featureMode, "textureEnhancement");
    assert.equal(item.input.modelKey, model.key);
    assert.equal(item.input.prompt, "");
    assert.equal(item.input.negativePrompt, "");
    assert.equal(item.input.textureEnhancementPromptVersion, 4);
    assert.equal(item.input.outputFormat, "png");
    assert.equal(Object.hasOwn(item.input, "referenceImages"), false);
    assert.ok(model.sizes[item.input.ratio]?.[item.input.resolution] || model.postUpscale?.[item.input.resolution]);
  }
  assert.equal(generationItemsForSelection([models[0]], 4).length, 4);
  assert.equal(generationLoadingCopy({ textureEnhancementRequest: true, models }), "正在增强材质质感与光影细节…");
});

test("切入质感增强隐藏负向输入且切回保留原功能草稿", () => {
  const root = { hidden: false, classList: { toggle(_name, value) { root.hidden = value; } } };
  const textarea = { value: "普通功能自定义负向", addEventListener() {} };
  const control = bindFluxNegativePrompt({ count: {}, note: {}, root, textarea });
  control.render(["aiTextureEnhancement"], "free");
  assert.equal(root.hidden, false);
  control.render(["aiTextureEnhancement"], "textureEnhancement");
  assert.equal(root.hidden, true);
  control.render(["aiTextureEnhancement"], "free");
  assert.equal(root.hidden, false);
  assert.equal(control.value(), "普通功能自定义负向");
});

test("质感增强任务按独立功能保存并恢复，不覆盖已有渲染任务", () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const models = [{ key: "aiTextureEnhancement", label: "Flux2 Klein" }];
  for (const featureMode of ["effectBeautification", "textureEnhancement"]) {
    saveGenerationTask(storage, createGenerationTask({ featureMode, models, loadingLabel: "生成中", createId: () => featureMode, now: () => 1 }));
  }
  const tasks = readGenerationTasks(storage);
  assert.deepEqual(Object.keys(tasks), ["effectBeautification", "textureEnhancement"]);
  assert.equal(tasks.textureEnhancement.jobId, "generation-textureEnhancement");
  assert.equal(tasks.textureEnhancement.items[0].key, "aiTextureEnhancement");
});

/**
 * [INPUT]: 依赖 node:test/assert、公开模型目录、单图上传/尺寸适配、统一生成输入/批次请求和任务恢复
 * [OUTPUT]: 验证光影转换的旧进程阻断、单张效果图合同、独立光影身份、跨功能隔离、Flux双图尺寸和独立任务恢复
 * [POS]: test 的光影转换前端领域合同，使用内存模型与存储替身，不调用网络或生图
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from "node:assert/strict";
import test from "node:test";
import { buildGenerationInput } from "../public/generation-input.js";
import { buildGenerationJobRequest } from "../public/generation-task-request.js";
import { createGenerationTask, readGenerationTasks, saveGenerationTask } from "../public/generation-task-state.js";
import { generationFeatureUnavailableReason, referenceCapability, referenceSubject, sizeControlState } from "../public/model-capabilities.js";
import { isRefinedFluxReference, refinedReferenceModel } from "../public/refined-flux-reference.js";
import { publicModelCatalog } from "../src/model-config.mjs";
import { bindLightingTransferControls } from "../public/lighting-transfer-controls.js";

const source = { dataUrl: "data:image/png;base64,AA==", name: "render.png", size: 1,
  type: "image/png", width: 1600, height: 900 };
const selection = { mode: "preset", execution: "prompt-and-reference", presetId: "rec-card",
  version: 3, sha256: "a".repeat(64), ruleVersion: 1, ruleSha256: "b".repeat(64) };
const models = publicModelCatalog();
function inputFor(overrides = {}) {
  return buildGenerationInput({ featureMode: "lightingTransfer", model: models[0],
    prompt: { free: "上个自由生图要求", refined: "上个精模要求", lightingTransfer: "降低窗边高光" },
    referenceImages: [source], styleReferenceImages: [source], lightingReferenceImages: [source],
    refinedLighting: selection, refinedRender: { time: "night" }, effectTime: "night", effectWeather: "rainy",
    effectBeautification: { strength: "high", tone: "warm" }, renderMode: { mode: "smart-default", styleCode: "stale-style" },
    textureEnhancementPromptVersion: 99, refinedAtmospherePromptVersion: 99, promptVersion: 99,
    ratio: "4:3", ratioMode: "auto", resolution: "2K", ...overrides });
}

test("光影转换按运行进程目录准入，旧进程缺能力时阻止提交", () => {
  for (const supportedModes of [undefined, null, {}, [], ["refinedModel", "effectEnhancement"]]) {
    assert.ok(generationFeatureUnavailableReason("lightingTransfer", supportedModes));
    assert.equal(generationFeatureUnavailableReason("refinedModel", supportedModes), null);
  }
  assert.equal(generationFeatureUnavailableReason("lightingTransfer", ["lightingTransfer"]), null);
});

test("光影转换对每个模型固定一张必填效果图，库图不占用户上传数量", () => {
  assert.match(referenceSubject("lightingTransfer"), /效果图/);
  for (const model of models) {
    const capability = referenceCapability({ featureMode: "lightingTransfer", model, policy: { maxCount: 4 } });
    assert.equal(capability.limit, 1);
    assert.equal(capability.multiple, false);
    assert.match(capability.optionalLabel, /必填/);
    assert.match(capability.title, /效果图/);
  }
});

test("光影转换只传本功能补充要求和库身份，丢弃其他功能光影/风格配置", () => {
  const input = inputFor();
  assert.equal(input.featureMode, "lightingTransfer");
  assert.deepEqual(input.refinedLighting, selection);
  assert.equal(input.prompt, "降低窗边高光");
  assert.equal(input.outputFormat, "png");
  assert.equal(input.referenceImages.length, 1);
  for (const key of ["styleReferenceImages", "lightingReferenceImages", "refinedRender", "effectTime", "effectWeather",
    "effectBeautification", "textureEnhancementPromptVersion", "refinedAtmospherePromptVersion"]) {
    assert.equal(Object.hasOwn(input, key), false, key);
  }
  assert.doesNotMatch(input.prompt, /上个自由|上个精模/);
  assert.equal(input.promptVersion, selection.ruleVersion);
  assert.equal(inputFor({ featureMode: "free" }).refinedLighting, undefined);
});

test("光影转换批次共享底图且保留独立规则身份，逐模型适配双图合法档位", () => {
  const request = buildGenerationJobRequest({ baseInput: inputFor(), featureMode: "lightingTransfer",
    batchId: "lighting-transfer-batch", jobId: "generation-lighting-transfer-1234", models, sourceImage: source });
  assert.equal(request.featureMode, "lightingTransfer");
  assert.equal(request.sharedInput.referenceImages.length, 1);
  assert.equal(request.items.length, models.length);
  for (const item of request.items) {
    assert.equal(item.input.featureMode, "lightingTransfer");
    assert.deepEqual(item.input.refinedLighting, selection);
    assert.equal(item.input.promptVersion, selection.ruleVersion);
    assert.equal(item.input.outputFormat, "png");
    assert.equal(Object.hasOwn(item.input, "referenceImages"), false);
    assert.equal(Object.hasOwn(item.input, "lightingReferenceImages"), false);
  }
});

test("Flux光影转换启用已有双图1K/2K合同，普通生图保持原能力", () => {
  const flux = models.find(model => model.key === "aiTextureEnhancement");
  assert.equal(isRefinedFluxReference({ featureMode: "lightingTransfer", modelKey: flux.key, refinedLighting: selection }), true);
  const adapted = refinedReferenceModel(flux, "lightingTransfer", selection);
  assert.deepEqual(Object.keys(adapted.sizes.source), ["1K", "2K"]);
  assert.equal(adapted.postUpscale, null);
  const controls = sizeControlState({ featureMode: "lightingTransfer", refinedLighting: selection, model: flux,
    currentRatio: "source", currentResolution: "4K", preserveResolution: true, ratioMode: "auto", sourceImage: source });
  assert.deepEqual(controls.resolutionOptions.map(item => item.value), ["1K", "2K"]);
  assert.ok(["1K", "2K"].includes(controls.resolution));
  assert.equal(refinedReferenceModel(flux, "free", selection), flux);
  assert.equal(isRefinedFluxReference({ featureMode: "free", modelKey: flux.key, refinedLighting: selection }), false);
});

test("光影转换任务和精模/旧氛围转换分别持久化，刷新后可独立恢复", () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  for (const featureMode of ["refinedModel", "effectEnhancement", "lightingTransfer"]) {
    saveGenerationTask(storage, createGenerationTask({ featureMode, models: [{ key: "banana21", label: "Banana" }],
      loadingLabel: "生成中", createId: () => featureMode, now: () => 1 }));
  }
  const tasks = readGenerationTasks(storage);
  assert.deepEqual(Object.keys(tasks), ["refinedModel", "effectEnhancement", "lightingTransfer"]);
  assert.equal(tasks.lightingTransfer.jobId, "generation-lightingTransfer");
  assert.equal(tasks.refinedModel.jobId, "generation-refinedModel");
});

test("光影转换控制器只使用独立Prompt身份，复用图卡并隔离精模规则和草稿", () => {
  const nodes = new Map(), values = new Map([["canvas-lab:lighting-transfer:prompt", "已有光影要求"]]);
  const node = selector => {
    if (!nodes.has(selector)) nodes.set(selector, { value: "", listeners: new Map(),
      addEventListener(event, fn) { this.listeners.set(event, fn); }, classList: { toggle() {} } });
    return nodes.get(selector);
  };
  const root = { innerHTML: "", querySelector: node, classList: { toggle() {} } };
  let bound, configured;
  const controls = bindLightingTransferControls({ root,
    storage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) },
    bindControls(options) { bound = options; return { setAvailability(value) { configured = value; },
      setModels() {}, setPolicy() {}, validation: () => null, requestFields: () => ({ refinedLighting: selection }) }; },
  });
  assert.equal(bound.allowReferenceUpload, false);
  assert.equal(bound.presetExecution, "prompt-and-reference");
  assert.equal(bound.storageKey, "canvas-lab:lighting-transfer:selection");
  assert.equal(controls.promptValue(), "已有光影要求");
  assert.ok(controls.validation(), "独立Prompt未加载须阻断");
  controls.setLightingConfig({ available: false, referenceAvailable: false,
    ruleVersion: 99, ruleSha256: "c".repeat(64), referenceRuleVersion: 88, referenceRuleSha256: "d".repeat(64),
    presets: [{ id: selection.presetId, version: selection.version, sha256: selection.sha256 }] });
  controls.setPromptConfig({ available: true, code: "lighting-render-transfer", version: 1, sha256: "b".repeat(64) });
  assert.equal(configured.available, true, "有卡片和独立Prompt时不依赖旧精模规则是否上架");
  assert.equal(configured.referenceAvailable, true);
  assert.equal(configured.referenceRuleVersion, 1);
  assert.equal(configured.referenceRuleSha256, "b".repeat(64));
  assert.equal(configured.promptAvailable, false);
  assert.equal(configured.hybridAvailable, false);
  assert.deepEqual(configured.presetExecutions, ["prompt-and-reference"]);
  assert.equal(configured.multiplePresetExecutions, false);
  assert.deepEqual(controls.requestFields().refinedLighting, selection);
  const textarea = node("[data-transfer-prompt]");
  textarea.value = "  新的光影要求  ";
  textarea.listeners.get("input")();
  assert.equal(controls.promptValue(), "新的光影要求");
  assert.equal(values.get("canvas-lab:lighting-transfer:prompt"), textarea.value);
  assert.equal(values.has("canvas-lab.refined-lighting"), false);
});

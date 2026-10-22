/**
 * [INPUT]: 依赖 node:test/assert/fs、扩图服务公开模型目录、Sunburst 画布合同、三引擎控制器与共享 fixture 的可控 RAF
 * [OUTPUT]: 对外提供原比例首项/真实默认与换图重算、双Flux模型/三引擎隔离、固定2K/默认1.5倍构图/拖动、4K源图准入、权限刷新/单份原图请求及旧四边助手兼容回归保障
 * [POS]: test 的 AI扩图前端合同测试，使用内存控件，不调用真实工作流或生图 API
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createAnimationFrames, renderedImageRect } from "./image-outpaint-fixture.mjs";
import { refreshImageOutpaintConfig } from "../public/image-tools.js";
import { publicOneApiOutpaintConfig } from "../src/image-outpaint-oneapi.mjs";
import { publicImageOutpaintConfig } from "../src/image-outpaint-service.mjs";
import { outpaintCanvasPlan } from "../public/image-outpaint-geometry.js";
import { outpaintVisualPlan } from "../public/image-outpaint-transform.js";
import {
  bindImageOutpaint,
  centeredOutpaintExpansion,
  imageOutpaintPreparedDimensions,
  outpaintExpansionValidation,
  outpaintTargetDimensions,
} from "../public/image-outpaint.js";

const source = { width: 1000, height: 751, dataUrl: "data:image/png;base64,AAAA", name: "room.png", type: "image/png", size: 3 };
const zero = { left: 0, top: 0, right: 0, bottom: 0 };
const limits = { maxEdge: 16384, maxPixels: 33554432, maxExpansion: 8192, minInputEdge: 32, maxInputEdge: 4096, inputAlignment: 32, outputAlignment: 8 };
const modelConfig = publicImageOutpaintConfig({ available: true });
const defaultModel = modelConfig.models.find((model) => model.key === modelConfig.defaultModelKey);

function assertPreview(ui, { source: image = source, target, limits: contract }) {
  const expected = outpaintVisualPlan({ source: image, target, scale: 2 / 3, limits: contract });
  const rect = renderedImageRect(ui.nodes.get("#imageOutpaintSourceImage"), target);
  assert.ok(Math.abs(rect.width - expected.prepared.width) < 1e-8);
  assert.ok(Math.abs(rect.height - expected.prepared.height) < 1e-8);
  assert.ok(Math.abs(rect.width / rect.height - image.width / image.height) < 1e-10);
}

test("连接与换Key后刷新扩图权限，断开与读失败不保留旧可用状态", async () => {
  const snapshots = [];
  const controller = { configure: (config) => snapshots.push(config) };
  let granted = false;
  const api = async (path) => {
    assert.equal(path, "/api/image-outpaint/config");
    return { engines: [{ key: "gptImage25Sunburst", available: granted }] };
  };
  await refreshImageOutpaintConfig(api, controller);
  granted = true;
  await refreshImageOutpaintConfig(api, controller);
  granted = false;
  await refreshImageOutpaintConfig(api, controller);
  assert.deepEqual(snapshots.map((config) => config.engines[0].available), [false, true, false]);
  await refreshImageOutpaintConfig(async () => { throw new Error("network"); }, controller);
  assert.equal(snapshots.at(-1).available, false);
  const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  assert.match(app, /onApiConnected:.*imageTools\.refreshOutpaint\(\)/);
  assert.match(app, /onApiDisconnected:.*imageTools\.refreshOutpaint\(\)/);
});
const sunburst = publicOneApiOutpaintConfig({ available: true });
const targetSizes = sunburst.targetSizes;
const qwen = {
  ...limits,
  key: "qwenImageEdit2511",
  label: "Qwen Image Edit 2511",
  provider: "comfyui",
  available: true,
  sourceSizing: "original",
  inputAlignment: 1,
  outputAlignment: 16,
  maxEdge: 4096,
  workflow: { key: "image-outpaint-qwen-2511", label: "Qwen Image Edit 2511" },
};

test("预处理忠实执行 LayerStyle 比例浮点重算、截断与32像素对齐", () => {
  assert.deepEqual(imageOutpaintPreparedDimensions(source), { width: 1024, height: 768 });
  assert.deepEqual(imageOutpaintPreparedDimensions({ width: 97, height: 149 }), { width: 96, height: 160 });
  assert.deepEqual(imageOutpaintPreparedDimensions({ width: 149, height: 97 }), { width: 160, height: 128 });
  assert.deepEqual(imageOutpaintPreparedDimensions({ width: 32, height: 32 }), { width: 32, height: 32 });
  assert.deepEqual(imageOutpaintPreparedDimensions({ width: 2048, height: 2048 }), { width: 2048, height: 2048 });
  assert.deepEqual(imageOutpaintPreparedDimensions({ width: 3840, height: 2160 }), { width: 3840, height: 2176 });
  assert.deepEqual(imageOutpaintPreparedDimensions({ width: 4096, height: 4096 }), { width: 4096, height: 4096 });
  assert.equal(imageOutpaintPreparedDimensions({ width: 31, height: 100 }), null);
  assert.equal(imageOutpaintPreparedDimensions({ width: 100, height: 4097 }), null);
  assert.equal(imageOutpaintPreparedDimensions({ width: 4097, height: 100 }), null);
});

test("快捷比例从预处理尺寸居中扩展，输出比例精确且宽高均为8的倍数", () => {
  for (const dimensions of [{ width: 1000, height: 751 }, { width: 753, height: 1001 }, { width: 32, height: 32 }, { width: 97, height: 149 }, { width: 4096, height: 3072 }]) {
    const prepared = imageOutpaintPreparedDimensions(dimensions);
    for (const ratio of ["1:1", "4:3", "16:9", "3:4", "9:16"]) {
      const expansion = centeredOutpaintExpansion(dimensions, ratio);
      const target = outpaintTargetDimensions(dimensions, expansion);
      const [width, height] = ratio.split(":").map(Number);
      assert.ok(target.width >= prepared.width);
      assert.ok(target.height >= prepared.height);
      assert.ok(target.width > prepared.width || target.height > prepared.height);
      assert.equal(target.width * height, target.height * width);
      assert.equal(target.width % 8, 0);
      assert.equal(target.height % 8, 0);
      assert.ok(Math.abs(expansion.left - expansion.right) <= 1);
      assert.ok(Math.abs(expansion.top - expansion.bottom) <= 1);
    }
  }
  assert.deepEqual(centeredOutpaintExpansion(source, "4:3"), { left: 16, top: 12, right: 16, bottom: 12 });
  assert.deepEqual(centeredOutpaintExpansion(source, "original"), zero);
  assert.equal(centeredOutpaintExpansion(source, "2:1"), null);
  assert.equal(centeredOutpaintExpansion(null, "1:1"), null);
});

test("四边相加以预处理画布为基准，不静默舍入用户扩展值", () => {
  assert.deepEqual(outpaintTargetDimensions(source, { left: 10, top: 20, right: 30, bottom: 40 }), { width: 1064, height: 828 });
  assert.deepEqual(outpaintTargetDimensions(source, { left: "10", top: "0", right: "25", bottom: "0" }), { width: 1059, height: 768 });
  assert.deepEqual(outpaintTargetDimensions({ width: 97, height: 149 }, zero), { width: 96, height: 160 });
  for (const value of [-1, 0.5, "", "1e2", " 5 ", "2.1", null, Number.MAX_SAFE_INTEGER]) {
    assert.equal(outpaintTargetDimensions(source, { ...zero, left: value }), null);
  }
  assert.equal(outpaintTargetDimensions({ width: 0, height: 1 }, zero), null);
});

test("扩图拒绝输入范围、零扩展、非整数、输出不对齐和安全上限，给出手动调整量", () => {
  const validate = (expansion, nextSource = source) => outpaintExpansionValidation({ source: nextSource, expansion, limits });
  assert.equal(validate(zero, null).field, "image");
  assert.equal(validate(zero, { width: 31, height: 100 }).field, "image");
  assert.match(validate(zero, { width: 100, height: 4097 }).message, /32–4096px/);
  assert.match(validate(zero).message, /至少一边/);
  assert.equal(validate({ ...zero, right: "-2" }).field, "right");
  assert.equal(validate({ ...zero, top: "2.5" }).field, "top");
  assert.match(validate({ ...zero, left: 3 }).message, /左右扩展总和，再增加 5px 或减少 3px/);
  assert.match(validate({ ...zero, top: 6 }).message, /上下扩展总和，再增加 2px 或减少 6px/);
  assert.deepEqual(validate({ ...zero, left: 1, right: 7 }), { field: null, message: null });
  assert.match(validate({ ...zero, left: 8193 }).message, /每边最多扩展 8192px/);
  assert.match(validate({ ...zero, left: 8192, right: 8192 }).message, /长边不能超过 16384px/);
  assert.match(validate({ ...zero, left: 8000, bottom: 8000 }).message, /输出像素不能超过/);
  assert.deepEqual(validate({ ...zero, left: 8192 }), { field: null, message: null });
});

function control(values = {}) {
  const attributes = new Map();
  const classes = new Set();
  const listeners = new Map();
  const node = {
    value: "0",
    textContent: "",
    dataset: {},
    style: { setProperty(name, value) { this[name] = value; } },
    classList: { toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); }, contains(name) { return classes.has(name); } },
    addEventListener(name, listener) { listeners.set(name, [...(listeners.get(name) || []), listener]); },
    append(...children) {
      for (const child of children) {
        child.parentElement = this;
        child.ownerDocument ||= this.ownerDocument;
        this.children.push(child);
      }
    },
    children: [],
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
    querySelectorAll(selector) {
      const matches = (child) => selector.startsWith("#") ? child.id === selector.slice(1)
        : selector.startsWith(".") ? child.className?.split(" ").includes(selector.slice(1))
          : selector.startsWith("[data-") ? Object.hasOwn(child.dataset, selector.slice(6, -1).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())) : false;
      return this.children.flatMap((child) => [...(matches(child) ? [child] : []), ...child.querySelectorAll(selector)]);
    },
    replaceChildren(...children) { this.children = children; this.options = children; },
    dispatch(name, event = {}) { for (const listener of listeners.get(name) || []) listener({ preventDefault() {}, stopPropagation() {}, ...event }); },
    getBoundingClientRect() { return { width: 280, height: 160, left: 100, top: 300 }; },
    getAttribute(name) { return name === "src" ? this.src || null : attributes.get(name); },
    setAttribute(name, value) { attributes.set(name, value); },
    removeAttribute(name) { attributes.delete(name); if (name === "src") this.src = undefined; },
    ...values,
  };
  return node;
}

function fixture({ ratio = "16:9" } = {}) {
  const nodes = new Map(["Availability", "Note", "OutputSize", "Error", "Canvas", "CanvasHint", "SourceImage", "PreviewEmpty", "PositionReset", "ModelField", "ModelSelect", "ModelStatus"].map((id) => [`#imageOutpaint${id}`, control()]));
  const ratios = ["original", "1:1", "4:3", "16:9", "3:4", "9:16"].map((ratio) => control({ dataset: { outpaintRatio: ratio } }));
  const engines = ["comfyui", "qwenImageEdit2511", "gptImage25Sunburst"].map((key) => control({ dataset: { outpaintEngine: key } }));
  const document = control({ defaultView: { innerWidth: 1400 }, createElement(tagName) { return control({ tagName: tagName.toUpperCase(), ownerDocument: this }); } });
  const frames = createAnimationFrames(document.defaultView);
  const canvas = nodes.get("#imageOutpaintCanvas");
  canvas.ownerDocument = document;
  nodes.get("#imageOutpaintModelSelect").ownerDocument = document;
  const positionRoot = control({ ownerDocument: document });
  canvas.getBoundingClientRect = () => ({ width: 2048, height: 1152 });
  let changes = 0;
  let image = source;
  const root = {
    querySelector(selector) { return selector === ".image-outpaint-position" ? positionRoot : nodes.get(selector); },
    querySelectorAll(selector) { return ({ "[data-outpaint-engine]": engines, "[data-outpaint-ratio]": ratios })[selector] || []; },
  };
  const emptySize = control();
  const emptyModel = control();
  const exactSize = control();
  const binding = bindImageOutpaint({ root, getSourceImage: () => image, emptyModel, emptySize, exactSize, onChange: () => { changes += 1; } });
  const configure = binding.configure;
  binding.configure = (config) => {
    const withModels = (engine) => engine.key && engine.key !== "comfyui" ? engine : { models: modelConfig.models, defaultModelKey: modelConfig.defaultModelKey, ...engine };
    return configure({ ...withModels(config), ...(config.engines ? { engines: config.engines.map(withModels) } : {}) });
  };
  // -------- 旧用例保留16:9轨迹；显式null可验证真实默认原比例 --------
  if (ratio) ratios.find((button) => button.dataset.outpaintRatio === ratio).dispatch("click");
  changes = 0;
  return { binding, document, frames, emptyModel, emptySize, exactSize, engines, nodes, ratios, changes: () => changes, setSource(next) { image = next; } };
}

test("首次打开默认原比例，上传与换图重算目标，用户显式选预设后换图保留预设", () => {
  const ui = fixture({ ratio: null });
  ui.setSource(null);
  ui.binding.configure({ available: true, ...limits, workflow: { key: "outpaint-643", label: "AI扩图" } });
  assert.equal(ui.ratios[0].dataset.outpaintRatio, "original");
  assert.equal(ui.ratios[0].getAttribute("aria-checked"), "true");
  ui.setSource(source);
  ui.binding.renderSummary();
  assert.equal(ui.exactSize.textContent, "2048 × 1536");
  const original = ui.binding.jobRequest({ image: source, jobId: "first-original" }).items[0].input.outpaintCanvas;
  assert.equal(original.ratio, "original");
  assert.equal(original.resolution, "2K");
  assert.equal(original.scale, 2 / 3);
  const portrait = { ...source, width: 864, height: 1184 };
  ui.setSource(portrait);
  ui.binding.renderSummary();
  assert.equal(ui.exactSize.textContent, "1496 × 2048");
  assert.equal(ui.ratios[0].getAttribute("aria-checked"), "true");
  const next = ui.binding.jobRequest({ image: portrait, jobId: "portrait-original" }).items[0].input.outpaintCanvas;
  assert.equal(next.ratio, "original");
  ui.ratios.find((button) => button.dataset.outpaintRatio === "16:9").dispatch("click");
  ui.setSource({ ...source, width: 800, height: 800 });
  ui.binding.renderSummary();
  assert.equal(ui.exactSize.textContent, "2048 × 1152");
  assert.equal(ui.binding.jobRequest({ image: source, jobId: "preset-retained" }).items[0].input.outpaintCanvas.ratio, "16:9");
});

test("原比例切引擎按模型网格重算，Sunburst仍保留原比例且不套用最近预设", () => {
  const ui = fixture({ ratio: null });
  const comfy = { ...limits, key: "comfyui", provider: "comfyui", available: true, workflow: { key: "outpaint-1082", label: "PLG-AI扩图" } };
  const portrait = { ...source, width: 864, height: 1184 };
  ui.setSource(portrait);
  ui.binding.configure({ engines: [comfy, qwen, sunburst] });
  assert.equal(ui.exactSize.textContent, "1496 × 2048");
  ui.engines.find((button) => button.dataset.outpaintEngine === qwen.key).dispatch("click");
  assert.equal(ui.exactSize.textContent, "1488 × 2048");
  assert.equal(ui.binding.jobRequest({ image: portrait, jobId: "qwen-original" }).items[0].input.outpaintCanvas.ratio, "original");
  ui.engines.find((button) => button.dataset.outpaintEngine === sunburst.key).dispatch("click");
  assert.equal(ui.exactSize.textContent, "1488 × 2048");
  assert.deepEqual(ui.binding.validate(), { field: null, message: null });
  assert.equal(ui.binding.jobRequest({ image: portrait, jobId: "sunburst-original" }).items[0].input.outpaintCanvas.ratio, "original");
  assert.equal(ui.ratios[0].getAttribute("aria-checked"), "true");
  ui.ratios.find((button) => button.dataset.outpaintRatio === "3:4").dispatch("click");
  assert.equal(ui.exactSize.textContent, "1536 × 2048");
  assert.deepEqual(ui.binding.validate(), { field: null, message: null });
});

test("Flux的4K源图按固定2K目标预览，4097源图边界仍阻断", () => {
  const ui = fixture();
  const largeSource = { ...source, width: 4096, height: 3072 };
  ui.setSource(largeSource);
  ui.binding.configure({ available: true, ...limits, workflow: { key: "image-outpaint", label: "Flux Fill" } });
  assert.equal(ui.exactSize.textContent, "2048 × 1152");
  assert.equal(ui.nodes.get("#imageOutpaintCanvas").classList.contains("hidden"), false);
  assert.equal(ui.nodes.get("#imageOutpaintError").textContent, "");
  assert.ok(ui.ratios.every((button) => !button.disabled));
  const request = ui.binding.jobRequest({ image: largeSource, jobId: "4k-source" });
  assert.deepEqual(request.items[0].input, { outpaintCanvas: { ratio: "16:9", resolution: "2K", position: { x: 0.5, y: 0.5 }, scale: 2 / 3 }, outpaintModel: "oneRewardFp8" });
  assert.equal(request.sharedInput.referenceImages[0].dataUrl, largeSource.dataUrl);
  ui.setSource({ ...largeSource, width: 4097 });
  ui.binding.renderSummary();
  assert.match(ui.nodes.get("#imageOutpaintError").textContent, /32–4096px/);
  assert.equal(ui.nodes.get("#imageOutpaintCanvas").classList.contains("hidden"), true);
  assert.throws(() => ui.binding.jobRequest({ image: { ...largeSource, width: 4097 }, jobId: "too-large-source" }), /32–4096px/);
});

test("未配置工作流仍可选择目标并预览，提交保留具体不可用原因", () => {
  const ui = fixture();
  const reason = "尚未配置扩图工作流，需提供策略 643 的工作流 JSON 或可调用接口";
  ui.binding.configure({ available: false, reason, ...limits, workflow: null });
  assert.equal(ui.binding.isAvailable(), false);
  assert.equal(ui.binding.availabilityReason(), reason);
  assert.match(ui.nodes.get("#imageOutpaintNote").textContent, /尚未配置扩图工作流/);
  assert.equal(ui.nodes.get("#imageOutpaintAvailability").classList.contains("ready"), false);
  ui.ratios.find((button) => button.dataset.outpaintRatio === "4:3").dispatch("click");
  assert.equal(ui.exactSize.textContent, "2048 × 1536");
  assert.equal(ui.emptySize.textContent, "2048 × 1536");
  assert.equal(ui.nodes.get("#imageOutpaintSourceImage").src, source.dataUrl);
  const preview = outpaintCanvasPlan({ source, ratio: "4:3", resolution: "2K", scale: 2 / 3, limits });
  assertPreview(ui, { target: preview.target, limits });
  assert.equal(ui.nodes.get("#imageOutpaintCanvas").classList.contains("hidden"), false);
  assert.equal(ui.changes(), 1);
  assert.throws(() => ui.binding.jobRequest({ image: source, jobId: "preview-only" }), /尚未配置扩图工作流/);
  ui.setSource({ ...source, width: 800, height: 800 });
  ui.binding.renderSummary();
  assert.equal(ui.ratios.find((button) => button.dataset.outpaintRatio === "4:3").getAttribute("aria-checked"), "true");
  assert.equal(ui.exactSize.textContent, "2048 × 1536");
  ui.setSource(null);
  ui.binding.renderSummary();
  assert.equal(ui.nodes.get("#imageOutpaintCanvas").classList.contains("hidden"), true);
  assert.equal(ui.nodes.get("#imageOutpaintSourceImage").src, undefined);
});

test("扩图任务只传原图与目标比例/分辨率/位置，由服务端计算内部像素", () => {
  const ui = fixture();
  ui.binding.configure({ available: true, ...limits, workflow: { key: "outpaint-643", label: "AI扩图", version: "1" } });
  assert.equal(ui.binding.isAvailable(), true);
  assert.equal(ui.nodes.get("#imageOutpaintAvailability").textContent, "工作流已接入");
  assert.deepEqual(ui.binding.jobRequest({ image: source, jobId: "single-image" }), {
    batchId: null,
    featureMode: "imageOutpaint",
    forcePromptRegeneration: false,
    items: [{ input: { outpaintCanvas: { ratio: "16:9", resolution: "2K", position: { x: 0.5, y: 0.5 }, scale: 2 / 3 }, outpaintModel: "oneRewardFp8" }, key: "outpaint-643", label: `AI扩图 · ${defaultModel.label}` }],
    jobId: "single-image",
    sharedInput: { referenceImages: [{ dataUrl: source.dataUrl, name: source.name, size: source.size, type: source.type }] },
  });
});

test("模型下拉采用服务端默认值与稳定键，切换只改变模型并保留图片/比例/分辨率/构图", () => {
  const ui = fixture();
  const workflow = { key: "outpaint-1082", label: "PLG-AI扩图" };
  ui.binding.configure({ ...limits, available: true, workflow });
  const select = ui.nodes.get("#imageOutpaintModelSelect");
  assert.equal(select.value, "oneRewardFp8");
  assert.deepEqual(select.options.map((option) => option.value), ["oneRewardFp8", "fluxFillDev"]);
  assert.equal(ui.nodes.get("#imageOutpaintModelField").title, defaultModel.fileName);
  ui.ratios.find((button) => button.dataset.outpaintRatio === "3:4").dispatch("click");
  ui.nodes.get("#imageOutpaintCanvas").dispatch("keydown", { key: "ArrowLeft", shiftKey: true });
  const before = ui.binding.jobRequest({ image: source, jobId: "before-model" });
  const beforeStyle = { ...ui.nodes.get("#imageOutpaintSourceImage").style };
  const beforeChanges = ui.changes();
  select.value = "fluxFillDev";
  select.dispatch("change");
  const selected = modelConfig.models.find((model) => model.key === "fluxFillDev");
  const after = ui.binding.jobRequest({ image: source, jobId: "after-model" });
  assert.equal(ui.changes(), beforeChanges + 1);
  assert.equal(after.items[0].input.outpaintModel, "fluxFillDev");
  assert.deepEqual(after.items[0].input.outpaintCanvas, before.items[0].input.outpaintCanvas);
  assert.deepEqual(after.sharedInput.referenceImages, before.sharedInput.referenceImages);
  assert.deepEqual(ui.nodes.get("#imageOutpaintSourceImage").style, beforeStyle);
  assert.equal(ui.binding.currentItem().label, `${workflow.label} · ${selected.label}`);
  assert.match(ui.binding.loadingCopy(), new RegExp(selected.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(ui.nodes.get("#imageOutpaintModelField").title, selected.fileName);
  const otherDefault = fixture();
  otherDefault.binding.configure({ ...limits, available: true, workflow, defaultModelKey: "fluxFillDev" });
  assert.equal(otherDefault.nodes.get("#imageOutpaintModelSelect").value, "fluxFillDev");
  assert.equal(otherDefault.binding.jobRequest({ image: source, jobId: "actual-default" }).items[0].input.outpaintModel, "fluxFillDev");
});

test("已选模型刷新后失效时保持选择并阻断，Sunburst隐藏下拉且请求不含Flux模型", () => {
  const ui = fixture();
  const comfy = { ...limits, key: "comfyui", provider: "comfyui", available: true, workflow: { key: "outpaint-1082", label: "PLG-AI扩图" } };
  ui.binding.configure({ ...comfy, engines: [comfy, sunburst] });
  const select = ui.nodes.get("#imageOutpaintModelSelect");
  select.value = "fluxFillDev";
  select.dispatch("change");
  const disabled = { ...comfy, models: modelConfig.models.map((model) => ({ ...model, available: model.key !== "fluxFillDev", reason: model.key === "fluxFillDev" ? "原版模型文件已移除" : null })) };
  ui.binding.configure({ ...disabled, engines: [disabled, sunburst] });
  assert.equal(select.value, "fluxFillDev");
  assert.equal(select.options.find((option) => option.value === "fluxFillDev").disabled, true);
  assert.equal(ui.binding.validate().field, "model");
  assert.equal(ui.binding.isAvailable(), false);
  assert.match(ui.nodes.get("#imageOutpaintModelStatus").textContent, /原版模型文件已移除/);
  assert.throws(() => ui.binding.jobRequest({ image: source, jobId: "removed" }), /原版模型文件已移除/);
  ui.engines.find((button) => button.dataset.outpaintEngine === "gptImage25Sunburst").dispatch("click");
  assert.equal(ui.nodes.get("#imageOutpaintModelField").classList.contains("hidden"), true);
  const apiInput = ui.binding.jobRequest({ image: source, jobId: "api" }).items[0].input;
  assert.equal(Object.hasOwn(apiInput, "outpaintModel"), false);
  assert.equal(apiInput.outpaintEngine, "gptImage25Sunburst");
  ui.engines[0].dispatch("click");
  assert.equal(ui.nodes.get("#imageOutpaintModelField").classList.contains("hidden"), false);
  assert.equal(select.value, "fluxFillDev");
  assert.throws(() => ui.binding.jobRequest({ image: source, jobId: "still-removed" }), /原版模型文件已移除/);
  const missing = { ...comfy, models: modelConfig.models.filter((model) => model.key !== "fluxFillDev") };
  ui.binding.configure({ ...missing, engines: [missing, sunburst] });
  assert.equal(select.value, "fluxFillDev");
  assert.equal(ui.binding.validate().field, "model");
  assert.throws(() => ui.binding.jobRequest({ image: source, jobId: "no-longer-listed" }), /已不在目录/);
});

test("模型目录尚未就绪时保留目标预览，禁止用隐式候选提交", () => {
  const ui = fixture();
  ui.binding.configure({ ...limits, available: true, workflow: { key: "outpaint-1082", label: "PLG-AI扩图" }, models: [], defaultModelKey: null });
  assert.equal(ui.exactSize.textContent, "2048 × 1152");
  assert.equal(ui.nodes.get("#imageOutpaintCanvas").classList.contains("hidden"), false);
  assert.equal(ui.nodes.get("#imageOutpaintModelSelect").disabled, true);
  assert.equal(ui.binding.isAvailable(), false);
  assert.equal(ui.binding.validate().field, "model");
  assert.match(ui.nodes.get("#imageOutpaintModelStatus").textContent, /模型列表尚未就绪/);
  assert.throws(() => ui.binding.jobRequest({ image: source, jobId: "empty-models" }), /模型列表尚未就绪/);
});

test("Qwen独立选择不消费Flux模型目录，切换保留画幅/分辨率并使用独立结果身份", () => {
  const ui = fixture();
  const comfy = { ...limits, key: "comfyui", provider: "comfyui", available: true, workflow: { key: "outpaint-1082", label: "PLG-AI扩图" } };
  ui.binding.configure({ ...comfy, engines: [comfy, qwen, sunburst] });
  const select = ui.nodes.get("#imageOutpaintModelSelect");
  select.value = "fluxFillDev";
  select.dispatch("change");
  ui.ratios.find((button) => button.dataset.outpaintRatio === "3:4").dispatch("click");
  ui.nodes.get("#imageOutpaintCanvas").dispatch("keydown", { key: "ArrowRight", shiftKey: true });
  const flux = ui.binding.jobRequest({ image: source, jobId: "flux" });
  const qwenButton = ui.engines.find((button) => button.dataset.outpaintEngine === qwen.key);
  qwenButton.dispatch("click");
  assert.equal(qwenButton.getAttribute("aria-checked"), "true");
  assert.equal(ui.binding.isAvailable(), true);
  assert.deepEqual(ui.binding.validate(), { field: null, message: null });
  assert.equal(ui.nodes.get("#imageOutpaintModelField").classList.contains("hidden"), true);
  assert.equal(ui.nodes.get("#imageOutpaintModelStatus").textContent, "");
  assert.equal(ui.exactSize.textContent, "1536 × 2048");
  const preview = outpaintCanvasPlan({ source, ratio: "3:4", resolution: "2K", scale: 2 / 3, limits: qwen });
  assertPreview(ui, { target: preview.target, limits: qwen });
  assert.deepEqual(ui.binding.currentItem(), { key: qwen.workflow.key, label: qwen.label, provider: "comfyui" });
  assert.equal(ui.emptyModel.textContent, qwen.label);
  assert.equal(ui.emptyModel.title, qwen.label);
  assert.match(ui.binding.loadingCopy(), /Qwen Image Edit 2511/);
  assert.doesNotMatch(ui.binding.loadingCopy(), /Flux/);
  assert.equal(ui.nodes.get("#imageOutpaintAvailability").textContent, "工作流已接入");
  const request = ui.binding.jobRequest({ image: source, jobId: "qwen" });
  assert.deepEqual(request.items, [{
    input: { outpaintCanvas: { ratio: "3:4", resolution: "2K", position: { x: 0.5, y: 0.5 }, scale: 2 / 3 }, outpaintEngine: qwen.key },
    key: qwen.workflow.key,
    label: qwen.label,
  }]);
  assert.deepEqual(request.sharedInput.referenceImages, flux.sharedInput.referenceImages);
  const brokenFlux = { ...comfy, models: [], defaultModelKey: null };
  ui.binding.configure({ ...brokenFlux, engines: [brokenFlux, qwen, sunburst] });
  assert.equal(ui.binding.isAvailable(), true);
  assert.equal(ui.binding.jobRequest({ image: source, jobId: "qwen-without-flux" }).items[0].input.outpaintEngine, qwen.key);
  ui.engines.find((button) => button.dataset.outpaintEngine === "gptImage25Sunburst").dispatch("click");
  assert.equal(ui.emptyModel.textContent, sunburst.label);
  assert.equal(Object.hasOwn(ui.binding.jobRequest({ image: source, jobId: "sunburst" }).items[0].input, "outpaintModel"), false);
  ui.binding.configure({ ...comfy, engines: [comfy, qwen, sunburst] });
  ui.engines[0].dispatch("click");
  assert.equal(select.value, "fluxFillDev");
  assert.equal(ui.binding.jobRequest({ image: source, jobId: "flux-restored" }).items[0].input.outpaintModel, "fluxFillDev");
});

test("Qwen配置刷新保留引擎与构图，独立服务失败阻断且不切回可用Flux", () => {
  const ui = fixture();
  const comfy = { ...limits, key: "comfyui", provider: "comfyui", available: true, workflow: { key: "outpaint-1082", label: "PLG-AI扩图" } };
  ui.binding.configure({ engines: [comfy, qwen, sunburst] });
  ui.engines.find((button) => button.dataset.outpaintEngine === qwen.key).dispatch("click");
  ui.nodes.get("#imageOutpaintCanvas").dispatch("keydown", { key: "ArrowLeft", shiftKey: true });
  const before = ui.binding.jobRequest({ image: source, jobId: "before-refresh" });
  ui.binding.configure({ engines: [comfy, { ...qwen, available: false, reason: "Qwen 模型文件不可用" }, sunburst] });
  assert.equal(ui.binding.currentItem().label, qwen.label);
  assert.equal(ui.binding.isAvailable(), false);
  assert.equal(ui.nodes.get("#imageOutpaintAvailability").textContent, "服务暂不可用");
  assert.match(ui.nodes.get("#imageOutpaintNote").textContent, /Qwen 模型文件不可用/);
  assert.throws(() => ui.binding.jobRequest({ image: source, jobId: "qwen-unavailable" }), /Qwen 模型文件不可用/);
  ui.binding.configure({ engines: [comfy, qwen, sunburst] });
  assert.deepEqual(ui.binding.jobRequest({ image: source, jobId: "after-refresh" }).items[0].input, before.items[0].input);
});

test("真实绑定拖动5px只重分配左右留白，比例和目标分辨率不变且可一键居中", () => {
  const ui = fixture();
  ui.binding.configure({ available: true, ...limits, workflow: { key: "outpaint-643", label: "AI扩图" } });
  const image = ui.nodes.get("#imageOutpaintSourceImage");
  const canvas = ui.nodes.get("#imageOutpaintCanvas");
  const beforeLeft = renderedImageRect(image).left;
  const beforeWidth = image.style.width;
  canvas.dispatch("mousedown", { button: 0, clientX: 100, clientY: 100 });
  ui.document.dispatch("mousemove", { clientX: 105, clientY: 100 });
  ui.document.dispatch("mouseup");
  const afterLeft = renderedImageRect(image).left;
  assert.ok(Math.abs(afterLeft - beforeLeft - 5) < 0.00001);
  assert.equal(ui.exactSize.textContent, "2048 × 1152");
  assert.equal(image.style.width, beforeWidth);
  assert.equal(ui.ratios.find((button) => button.dataset.outpaintRatio === "16:9").getAttribute("aria-checked"), "true");
  assert.equal(canvas.classList.contains("dragging"), false);
  const canvasInput = ui.binding.jobRequest({ image: source, jobId: "dragged" }).items[0].input;
  assert.equal(Object.hasOwn(canvasInput, "expansion"), false);
  assert.ok(canvasInput.outpaintCanvas.position.x > 0.5);
  assert.equal(canvasInput.outpaintCanvas.position.y, 0.5);
  ui.nodes.get("#imageOutpaintPositionReset").dispatch("click");
  assert.equal(renderedImageRect(image).left, beforeLeft);
  assert.deepEqual(ui.binding.jobRequest({ image: source, jobId: "centered" }).items[0].input.outpaintCanvas.position, { x: 0.5, y: 0.5 });
});

test("触摸构图夹紧在画布内，权限刷新保留位置，键盘可选择比例并移动原图", () => {
  const ui = fixture();
  const config = { available: true, ...limits, workflow: { key: "outpaint-643", label: "AI扩图" } };
  ui.binding.configure(config);
  const canvas = ui.nodes.get("#imageOutpaintCanvas");
  canvas.dispatch("touchstart", { touches: [{ clientX: 100, clientY: 100 }] });
  ui.document.dispatch("touchmove", { touches: [{ clientX: -10000, clientY: 10000 }] });
  ui.frames.step();
  ui.document.dispatch("touchcancel");
  assert.equal(canvas.classList.contains("dragging"), false);
  assert.equal(ui.exactSize.textContent, "2048 × 1152");
  assert.deepEqual(ui.binding.jobRequest({ image: source, jobId: "touch" }).items[0].input.outpaintCanvas.position, { x: 0, y: 1 });
  ui.binding.configure({ ...config, available: false, reason: "连接已断开" });
  assert.throws(() => ui.binding.jobRequest({ image: source, jobId: "disconnected" }), /连接已断开/);
  ui.binding.configure(config);
  assert.deepEqual(ui.binding.jobRequest({ image: source, jobId: "reconnected" }).items[0].input.outpaintCanvas.position, { x: 0, y: 1 });
  canvas.dispatch("keydown", { key: "ArrowRight", shiftKey: true });
  assert.deepEqual(ui.binding.jobRequest({ image: source, jobId: "keyboard-position" }).items[0].input.outpaintCanvas.position, { x: 0.1, y: 1 });
  ui.ratios.find((button) => button.dataset.outpaintRatio === "16:9").dispatch("keydown", { key: "ArrowRight" });
  assert.equal(ui.exactSize.textContent, "1536 × 2048");
  assert.equal(ui.ratios.find((button) => button.dataset.outpaintRatio === "3:4").getAttribute("aria-checked"), "true");
  ui.setSource({ ...source });
  ui.binding.renderSummary();
  assert.deepEqual(ui.binding.jobRequest({ image: source, jobId: "replacement" }).items[0].input.outpaintCanvas, { ratio: "3:4", resolution: "2K", position: { x: 0.5, y: 0.5 }, scale: 2 / 3 });
});

test("已接入工作流的服务故障明确显示暂不可用，不退回待接入", () => {
  const ui = fixture();
  const workflow = { key: "outpaint-1082", label: "PLG-AI扩图", version: "1" };
  ui.binding.configure({ available: false, reason: "ComfyUI 服务不可用，请检查连接后重试", ...limits, workflow });
  assert.equal(ui.nodes.get("#imageOutpaintAvailability").textContent, "服务暂不可用");
  assert.equal(ui.binding.isAvailable(), false);
  assert.match(ui.nodes.get("#imageOutpaintNote").textContent, /ComfyUI 服务不可用/);
  assert.equal(ui.binding.currentItem().label, `PLG-AI扩图 · ${defaultModel.label}`);
});

test("AI扩图只呈现比例与位置复位并固定2K，目标控件使用单选语义", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  assert.equal((html.match(/data-feature-mode="imageOutpaint"/g) || []).length, 1);
  assert.match(html, /id="imageOutpaintSection"[^>]*aria-labelledby="imageOutpaintTitle"/);
  assert.doesNotMatch(html, /data-outpaint-expansion=/);
  assert.match(html, /data-outpaint-ratio="original"[^>]*role="radio"[^>]*aria-checked="true"[^>]*>原比例<\/button>/);
  for (const ratio of ["original", "1:1", "4:3", "16:9", "3:4", "9:16"]) {
    assert.match(html, new RegExp(`data-outpaint-ratio="${ratio}"[^>]*role="radio"[^>]*aria-checked="(?:true|false)"`));
  }
  assert.doesNotMatch(html, /data-outpaint-resolution=|扩图分辨率/);
  const controller = await readFile(new URL("../public/image-outpaint.js", import.meta.url), "utf8");
  assert.doesNotMatch(controller, /outpaintResolution|resolutionButtons|state\.resolution/);
  assert.match(controller, /resolution: OUTPAINT_RESOLUTION/);
  assert.match(controller, /let selectedRatio = "original"/);
  assert.match(html, /id="imageOutpaintPositionReset"/);
  assert.match(html, /<label for="imageOutpaintModelSelect">扩图模型<\/label>/);
  assert.match(html, /<select id="imageOutpaintModelSelect"[^>]*aria-label="扩图模型"[^>]*aria-describedby="imageOutpaintModelStatus"/);
  assert.match(html, /id="imageOutpaintModelStatus"[^>]*aria-live="polite"/);
  assert.match(html, /id="imageOutpaintOutputSize" aria-live="polite"/);
  assert.match(html, /href="\/image-outpaint.css\?v=\d+"/);
  for (const key of ["comfyui", "qwenImageEdit2511", "gptImage25Sunburst"]) {
    assert.match(html, new RegExp(`data-outpaint-engine="${key}"[^>]*role="radio"[^>]*aria-checked="(?:true|false)"`));
  }
});

test("Sunburst 沿用原图真实尺寸，不做 LayerStyle 浮点截断或32像素对齐", () => {
  for (const dimensions of [{ width: 97, height: 149 }, { width: 149, height: 97 }, { width: 3001, height: 2001 }, { width: 3840, height: 32 }]) {
    assert.deepEqual(imageOutpaintPreparedDimensions(dimensions, sunburst), dimensions);
    assert.deepEqual(outpaintTargetDimensions(dimensions, { ...zero, left: 3 }, sunburst), { width: dimensions.width + 3, height: dimensions.height });
  }
  assert.equal(imageOutpaintPreparedDimensions({ width: 16385, height: 100 }, sunburst), null);
  assert.equal(imageOutpaintPreparedDimensions({ width: 100, height: 31 }, sunburst), null);
  assert.deepEqual(imageOutpaintPreparedDimensions(source, limits), { width: 1024, height: 768 });
});

test("Sunburst旧比例助手只使用2K画布，不足以包住原图时拒绝", () => {
  assert.equal(targetSizes.length, 9);
  assert.ok(targetSizes.every((entry) => entry.resolution === "2K"));
  assert.deepEqual(centeredOutpaintExpansion(source, "4:3", sunburst), { left: 524, top: 392, right: 524, bottom: 393 });
  const wideExpansion = centeredOutpaintExpansion(source, "16:9", sunburst);
  assert.deepEqual(wideExpansion, { left: 524, top: 200, right: 524, bottom: 201 });
  assert.deepEqual(outpaintTargetDimensions(source, wideExpansion, sunburst), { width: 2048, height: 1152 });
  assert.ok(targetSizes.some((entry) => entry.ratio === "16:9" && entry.resolution === "2K"
    && entry.width === 2048 && entry.height === 1152));
  assert.deepEqual(centeredOutpaintExpansion({ width: 1024, height: 768 }, "4:3", sunburst), { left: 512, top: 384, right: 512, bottom: 384 });
  assert.equal(centeredOutpaintExpansion({ width: 3840, height: 2880 }, "4:3", sunburst), null);
  assert.equal(centeredOutpaintExpansion({ width: 3000, height: 3000 }, "16:9", sunburst), null);
  assert.deepEqual(centeredOutpaintExpansion(source, "original", sunburst), zero);
  for (const ratio of ["1:1", "4:3", "16:9", "3:4", "9:16"]) {
    const expansion = centeredOutpaintExpansion(source, ratio, sunburst);
    const target = outpaintTargetDimensions(source, expansion, sunburst);
    assert.ok(targetSizes.some((entry) => entry.ratio === ratio && entry.width === target.width && entry.height === target.height));
    assert.deepEqual(outpaintExpansionValidation({ source, expansion, limits: sunburst }), { field: null, message: null });
  }
});

test("Sunburst 手输四边不舍入，目标必须命中公开画布档位且不能突破原图范围", () => {
  const validate = (expansion, nextSource = source) => outpaintExpansionValidation({ source: nextSource, expansion, limits: sunburst });
  assert.deepEqual(validate({ left: 524, top: 392, right: 524, bottom: 393 }), { field: null, message: null });
  assert.match(validate({ ...zero, left: 3 }).message, /输出宽度需为 16 的倍数/);
  assert.match(validate({ ...zero, right: 24, bottom: 1 }).message, /模型支持的画布档位.*比例快捷按钮.*2048×1152/);
  assert.equal(validate({ ...zero, left: "3.5" }).field, "left");
  assert.match(validate(zero, { width: 31, height: 100 }).message, /32–16384px/);
  assert.match(validate({ ...zero, right: 3 }, { width: 16385, height: 100 }).message, /32–16384px/);
  assert.match(validate(zero).message, /至少一边/);
});

test("切换引擎保留比例并按固定2K目标重算，Sunburst携带独立引擎键", () => {
  const ui = fixture();
  const comfy = { ...limits, key: "comfyui", provider: "comfyui", available: true, workflow: { key: "outpaint-1082", label: "PLG-AI扩图" } };
  ui.binding.configure({ ...comfy, engines: [comfy, sunburst] });
  ui.ratios.find((button) => button.dataset.outpaintRatio === "4:3").dispatch("click");
  assert.equal(ui.exactSize.textContent, "2048 × 1536");
  assert.deepEqual(ui.binding.currentItem(), { key: "outpaint-1082", label: `PLG-AI扩图 · ${defaultModel.label}`, provider: "comfyui" });
  ui.engines.find((button) => button.dataset.outpaintEngine === "gptImage25Sunburst").dispatch("click");
  assert.equal(ui.ratios.find((button) => button.dataset.outpaintRatio === "4:3").getAttribute("aria-checked"), "true");
  assert.equal(ui.exactSize.textContent, "2048 × 1536");
  assert.equal(ui.engines.find((button) => button.dataset.outpaintEngine === "gptImage25Sunburst").getAttribute("aria-checked"), "true");
  assert.equal(ui.nodes.get("#imageOutpaintAvailability").textContent, "API 已接入");
  assert.match(ui.nodes.get("#imageOutpaintNote").textContent, /可能重绘原图区域/);
  assert.doesNotMatch(ui.nodes.get("#imageOutpaintNote").textContent, /32 像素对齐|8 的倍数|16 的倍数/);
  const preview = outpaintCanvasPlan({ source, ratio: "4:3", resolution: "2K", scale: 2 / 3, limits: sunburst });
  assertPreview(ui, { target: preview.target, limits: sunburst });
  const request = ui.binding.jobRequest({ image: source, jobId: "sunburst-single-image" });
  assert.deepEqual(request.items, [{ input: { outpaintCanvas: { ratio: "4:3", resolution: "2K", position: { x: 0.5, y: 0.5 }, scale: 2 / 3 }, outpaintEngine: "gptImage25Sunburst" }, key: "image-outpaint-sunburst", label: "GPT Image 2.5 Sunburst" }]);
  assert.equal(request.sharedInput.referenceImages.length, 1);
  assert.equal(ui.binding.currentItem().provider, "oneapi");
  assert.match(ui.binding.loadingCopy(), /Sunburst/);
  ui.engines[0].dispatch("click");
  assert.equal(ui.exactSize.textContent, "2048 × 1536");
  assert.equal(ui.binding.jobRequest({ image: source, jobId: "comfy" }).items[0].input.outpaintEngine, undefined);
});

test("Sunburst按固定2K自动适配大源图，Key未开放时仍明确阻断提交", () => {
  const ui = fixture();
  const unavailable = { ...sunburst, available: false, reason: "当前 Key 未开放 gpt-image-2.5-sunburst" };
  ui.binding.configure({ engines: [unavailable] });
  assert.equal(ui.binding.isAvailable(), false);
  assert.equal(ui.nodes.get("#imageOutpaintAvailability").textContent, "服务暂不可用");
  assert.equal(ui.engines[0].disabled, true);
  assert.throws(() => ui.binding.jobRequest({ image: source, jobId: "unavailable" }), /当前 Key 未开放/);
  ui.setSource({ ...source, width: 3000, height: 3000 });
  assert.equal(ui.exactSize.textContent, "2048 × 1152");
  assert.equal(ui.nodes.get("#imageOutpaintError").textContent, "");
  assert.equal(ui.nodes.get("#imageOutpaintCanvas").classList.contains("hidden"), false);
  assert.ok(Number.parseFloat(ui.nodes.get("#imageOutpaintSourceImage").style.height) <= 100);
  assert.throws(() => ui.binding.jobRequest({ image: { ...source, width: 3000, height: 3000 }, jobId: "resized-unavailable" }), /当前 Key 未开放/);
});

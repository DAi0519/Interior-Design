/**
 * [INPUT]: 依赖 node:test/assert/fs、model-config.mjs 的 Sunburst 画布矩阵与 public/image-outpaint.js 的双引擎交互控制器
 * [OUTPUT]: 对外提供 ComfyUI 32/8 像素旧合同、Sunburst 原尺寸/白名单画布/最小居中扩边、引擎切换与输入重置、Key 权限刷新及单图引擎请求回归保障
 * [POS]: test 的 AI扩图前端合同测试，使用内存控件，不调用真实工作流或生图 API
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { refreshImageOutpaintConfig } from "../public/image-tools.js";
import { MODEL_CONFIGS } from "../src/model-config.mjs";
import {
  bindImageOutpaint,
  centeredOutpaintExpansion,
  imageOutpaintPreparedDimensions,
  outpaintExpansionValidation,
  outpaintTargetDimensions,
} from "../public/image-outpaint.js";

const source = { width: 1000, height: 751, dataUrl: "data:image/png;base64,AAAA", name: "room.png", type: "image/png", size: 3 };
const zero = { left: 0, top: 0, right: 0, bottom: 0 };
const limits = { maxEdge: 16384, maxPixels: 33554432, maxExpansion: 8192, minInputEdge: 32, maxInputEdge: 2048, inputAlignment: 32, outputAlignment: 8 };

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
const targetSizes = Object.entries(MODEL_CONFIGS.gptImage25Sunburst.sizes).flatMap(([ratio, sizes]) => Object.values(sizes).map((size) => {
  const [width, height] = size.split("x").map(Number);
  return { ratio, width, height };
}));
const sunburst = {
  key: "gptImage25Sunburst", label: "GPT Image 2.5 Sunburst", provider: "oneapi", available: true,
  minInputEdge: 32, maxInputEdge: 3840, inputAlignment: 1, outputAlignment: 1, sourceSizing: "original",
  maxEdge: 3840, maxPixels: 3840 * 3840, maxExpansion: 3840, targetSizes,
  workflow: { key: "image-outpaint-sunburst", label: "GPT Image 2.5 Sunburst", version: "1" },
};

test("预处理忠实执行 LayerStyle 比例浮点重算、截断与32像素对齐", () => {
  assert.deepEqual(imageOutpaintPreparedDimensions(source), { width: 1024, height: 768 });
  assert.deepEqual(imageOutpaintPreparedDimensions({ width: 97, height: 149 }), { width: 96, height: 160 });
  assert.deepEqual(imageOutpaintPreparedDimensions({ width: 149, height: 97 }), { width: 160, height: 128 });
  assert.deepEqual(imageOutpaintPreparedDimensions({ width: 32, height: 32 }), { width: 32, height: 32 });
  assert.deepEqual(imageOutpaintPreparedDimensions({ width: 2048, height: 2048 }), { width: 2048, height: 2048 });
  assert.equal(imageOutpaintPreparedDimensions({ width: 31, height: 100 }), null);
  assert.equal(imageOutpaintPreparedDimensions({ width: 100, height: 2049 }), null);
});

test("快捷比例从预处理尺寸居中扩展，输出比例精确且宽高均为8的倍数", () => {
  for (const dimensions of [{ width: 1000, height: 751 }, { width: 753, height: 1001 }, { width: 32, height: 32 }, { width: 97, height: 149 }]) {
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
  assert.match(validate(zero, { width: 100, height: 2049 }).message, /32–2048px/);
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
  return {
    value: "0",
    textContent: "",
    dataset: {},
    style: { setProperty(name, value) { this[name] = value; } },
    classList: { toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); }, contains(name) { return classes.has(name); } },
    addEventListener(name, listener) { listeners.set(name, listener); },
    dispatch(name) { listeners.get(name)?.(); },
    getAttribute(name) { return name === "src" ? this.src || null : attributes.get(name); },
    setAttribute(name, value) { attributes.set(name, value); },
    removeAttribute(name) { attributes.delete(name); if (name === "src") this.src = undefined; },
    ...values,
  };
}

function fixture() {
  const nodes = new Map(["Availability", "Note", "OutputSize", "Error", "Canvas", "CanvasHint", "SourceImage", "PreviewEmpty"].map((id) => [`#imageOutpaint${id}`, control()]));
  const sides = Object.fromEntries(["left", "top", "right", "bottom"].map((side) => [side, control()]));
  const ratios = ["original", "1:1", "4:3", "16:9", "3:4", "9:16"].map((ratio) => control({ dataset: { outpaintRatio: ratio } }));
  const engines = ["comfyui", "gptImage25Sunburst"].map((key) => control({ dataset: { outpaintEngine: key } }));
  let changes = 0;
  let image = source;
  const root = {
    querySelector(selector) { return nodes.get(selector) || sides[selector.match(/data-outpaint-expansion="([a-z]+)"/)?.[1]]; },
    querySelectorAll(selector) { return selector === "[data-outpaint-engine]" ? engines : ratios; },
  };
  const emptySize = control();
  const exactSize = control();
  const binding = bindImageOutpaint({ root, getSourceImage: () => image, emptyModel: control(), emptySize, exactSize, onChange: () => { changes += 1; } });
  return { binding, emptySize, exactSize, engines, nodes, ratios, sides, changes: () => changes, setSource(next) { image = next; } };
}

test("未配置工作流仍可预览和改尺寸，提交明确阻断且不伪装就绪", () => {
  const ui = fixture();
  const reason = "尚未配置扩图工作流，需提供策略 643 的工作流 JSON 或可调用接口";
  ui.binding.configure({ available: false, reason, ...limits, workflow: null });
  assert.equal(ui.binding.isAvailable(), false);
  assert.equal(ui.binding.availabilityReason(), reason);
  assert.match(ui.nodes.get("#imageOutpaintNote").textContent, /尚未配置扩图工作流/);
  assert.match(ui.nodes.get("#imageOutpaintNote").textContent, /可能轻微缩放、裁切/);
  assert.doesNotMatch(ui.nodes.get("#imageOutpaintNote").textContent, /原图保持原尺寸/);
  assert.equal(ui.nodes.get("#imageOutpaintAvailability").classList.contains("ready"), false);
  ui.ratios.find((button) => button.dataset.outpaintRatio === "4:3").dispatch("click");
  assert.equal(ui.exactSize.textContent, "1056 × 792");
  assert.equal(ui.emptySize.textContent, "1056 × 792");
  assert.equal(ui.nodes.get("#imageOutpaintSourceImage").src, source.dataUrl);
  assert.equal(ui.nodes.get("#imageOutpaintSourceImage").style.objectFit, "cover");
  assert.equal(ui.nodes.get("#imageOutpaintSourceImage").style.width, `${1024 / 1056 * 100}%`);
  assert.equal(ui.nodes.get("#imageOutpaintSourceImage").style.height, `${768 / 792 * 100}%`);
  assert.equal(ui.nodes.get("#imageOutpaintCanvas").classList.contains("hidden"), false);
  assert.equal(ui.changes(), 1);
  assert.throws(() => ui.binding.jobRequest({ image: source, jobId: "preview-only" }), /尚未配置扩图工作流/);
  ui.sides.left.value = "-1";
  ui.sides.left.dispatch("input");
  assert.equal(ui.nodes.get("#imageOutpaintCanvas").classList.contains("hidden"), true);
  assert.equal(ui.sides.left.getAttribute("aria-invalid"), "true");
  assert.equal(ui.nodes.get("#imageOutpaintOutputSize").textContent, "请输入有效尺寸");
  ui.sides.left.value = "3";
  ui.sides.top.value = "0";
  ui.sides.right.value = "0";
  ui.sides.bottom.value = "0";
  ui.sides.left.dispatch("input");
  assert.equal(ui.sides.left.value, "3");
  assert.equal(ui.nodes.get("#imageOutpaintOutputSize").textContent, "1027 × 768");
  assert.equal(ui.nodes.get("#imageOutpaintCanvas").classList.contains("hidden"), true);
  ui.sides.left.value = "8192";
  ui.sides.right.value = "8192";
  ui.sides.left.dispatch("input");
  assert.equal(ui.nodes.get("#imageOutpaintCanvas").classList.contains("hidden"), true);
  ui.ratios.find((button) => button.dataset.outpaintRatio === "16:9").dispatch("click");
  assert.equal(ui.ratios.find((button) => button.dataset.outpaintRatio === "16:9").classList.contains("selected"), true);
  ui.setSource({ ...source, width: 800, height: 800 });
  ui.binding.renderSummary();
  assert.ok(ui.ratios.every((button) => !button.classList.contains("selected")));
  ui.setSource(null);
  ui.binding.renderSummary();
  assert.ok(ui.ratios.every((button) => button.disabled));
  assert.equal(ui.nodes.get("#imageOutpaintSourceImage").src, undefined);
});

test("扩图任务只传一份原图与整数四边参数，不发送原图尺寸或模型参数", () => {
  const ui = fixture();
  ui.binding.configure({ available: true, ...limits, workflow: { key: "outpaint-643", label: "AI扩图", version: "1" } });
  ui.sides.left.value = "12";
  ui.sides.right.value = "4";
  ui.sides.top.value = "6";
  ui.sides.bottom.value = "34";
  assert.equal(ui.binding.isAvailable(), true);
  assert.equal(ui.nodes.get("#imageOutpaintAvailability").textContent, "工作流已接入");
  assert.deepEqual(ui.binding.jobRequest({ image: source, jobId: "single-image" }), {
    batchId: null,
    featureMode: "imageOutpaint",
    forcePromptRegeneration: false,
    items: [{ input: { expansion: { left: 12, top: 6, right: 4, bottom: 34 } }, key: "outpaint-643", label: "AI扩图" }],
    jobId: "single-image",
    sharedInput: { referenceImages: [{ dataUrl: source.dataUrl, name: source.name, size: source.size, type: source.type }] },
  });
});

test("已接入工作流的服务故障明确显示暂不可用，不退回待接入", () => {
  const ui = fixture();
  const workflow = { key: "outpaint-1082", label: "PLG-AI扩图", version: "1" };
  ui.binding.configure({ available: false, reason: "ComfyUI 服务不可用，请检查连接后重试", ...limits, workflow });
  assert.equal(ui.nodes.get("#imageOutpaintAvailability").textContent, "服务暂不可用");
  assert.equal(ui.binding.isAvailable(), false);
  assert.match(ui.nodes.get("#imageOutpaintNote").textContent, /ComfyUI 服务不可用/);
  assert.equal(ui.binding.currentItem().label, "PLG-AI扩图");
});

test("AI扩图入口与四边参数独立存在，尺寸控件有中文标签和像素单位", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  assert.equal((html.match(/data-feature-mode="imageOutpaint"/g) || []).length, 1);
  assert.match(html, /id="imageOutpaintSection"[^>]*aria-labelledby="imageOutpaintTitle"/);
  for (const side of ["left", "top", "right", "bottom"]) {
    assert.match(html, new RegExp(`data-outpaint-expansion="${side}"[^>]*type="number"[^>]*min="0"[^>]*step="1"[^>]*value="0"`));
  }
  assert.match(html, /id="imageOutpaintOutputSize" aria-live="polite"/);
  assert.match(html, /href="\/image-outpaint.css\?v=\d+"/);
  for (const key of ["comfyui", "gptImage25Sunburst"]) {
    assert.match(html, new RegExp(`data-outpaint-engine="${key}"[^>]*role="radio"[^>]*aria-checked="(?:true|false)"`));
  }
});

test("Sunburst 沿用原图真实尺寸，不做 LayerStyle 浮点截断或32像素对齐", () => {
  for (const dimensions of [{ width: 97, height: 149 }, { width: 149, height: 97 }, { width: 3001, height: 2001 }, { width: 3840, height: 32 }]) {
    assert.deepEqual(imageOutpaintPreparedDimensions(dimensions, sunburst), dimensions);
    assert.deepEqual(outpaintTargetDimensions(dimensions, { ...zero, left: 3 }, sunburst), { width: dimensions.width + 3, height: dimensions.height });
  }
  assert.equal(imageOutpaintPreparedDimensions({ width: 3841, height: 100 }, sunburst), null);
  assert.equal(imageOutpaintPreparedDimensions({ width: 100, height: 31 }, sunburst), null);
  assert.deepEqual(imageOutpaintPreparedDimensions(source, limits), { width: 1024, height: 768 });
});

test("Sunburst 比例选择使用最小可包住原图的画布档位，同档原图需升到下一档", () => {
  assert.equal(targetSizes.length, 27);
  assert.deepEqual(centeredOutpaintExpansion(source, "4:3", sunburst), { left: 12, top: 8, right: 12, bottom: 9 });
  assert.deepEqual(centeredOutpaintExpansion(source, "16:9", sunburst), { left: 524, top: 200, right: 524, bottom: 201 });
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
  assert.deepEqual(validate({ left: 0, top: 0, right: 24, bottom: 17 }), { field: null, message: null });
  assert.match(validate({ ...zero, left: 3 }).message, /模型支持的画布档位.*比例快捷按钮.*1024×768/);
  assert.equal(validate({ ...zero, left: "3.5" }).field, "left");
  assert.match(validate(zero, { width: 31, height: 100 }).message, /32–3840px/);
  assert.match(validate({ ...zero, right: 3 }, { width: 3841, height: 100 }).message, /32–3840px/);
  assert.match(validate(zero).message, /至少一边/);
});

test("引擎切换清空四边和比例，Sunburst 预览保留原图尺寸并发送独立引擎键", () => {
  const ui = fixture();
  const comfy = { ...limits, key: "comfyui", provider: "comfyui", available: true, workflow: { key: "outpaint-1082", label: "PLG-AI扩图" } };
  ui.binding.configure({ ...comfy, engines: [comfy, sunburst] });
  ui.ratios.find((button) => button.dataset.outpaintRatio === "4:3").dispatch("click");
  assert.equal(ui.exactSize.textContent, "1056 × 792");
  assert.deepEqual(ui.binding.currentItem(), { key: "outpaint-1082", label: "PLG-AI扩图", provider: "comfyui" });
  ui.engines[1].dispatch("click");
  assert.ok(Object.values(ui.sides).every((input) => input.value === "0"));
  assert.ok(ui.ratios.every((button) => !button.classList.contains("selected")));
  assert.equal(ui.exactSize.textContent, "1000 × 751");
  assert.equal(ui.engines[1].getAttribute("aria-checked"), "true");
  assert.equal(ui.nodes.get("#imageOutpaintAvailability").textContent, "API 已接入");
  assert.match(ui.nodes.get("#imageOutpaintNote").textContent, /32–3840px.*原图按实际尺寸.*遮罩.*可能重绘原图区域/);
  assert.doesNotMatch(ui.nodes.get("#imageOutpaintNote").textContent, /32 像素对齐/);
  ui.ratios.find((button) => button.dataset.outpaintRatio === "4:3").dispatch("click");
  assert.equal(ui.exactSize.textContent, "1024 × 768");
  assert.equal(ui.nodes.get("#imageOutpaintSourceImage").style.width, `${1000 / 1024 * 100}%`);
  assert.equal(ui.nodes.get("#imageOutpaintSourceImage").style.height, `${751 / 768 * 100}%`);
  const request = ui.binding.jobRequest({ image: source, jobId: "sunburst-single-image" });
  assert.deepEqual(request.items, [{ input: { expansion: { left: 12, top: 8, right: 12, bottom: 9 }, outpaintEngine: "gptImage25Sunburst" }, key: "image-outpaint-sunburst", label: "GPT Image 2.5 Sunburst" }]);
  assert.equal(request.sharedInput.referenceImages.length, 1);
  assert.equal(ui.binding.currentItem().provider, "oneapi");
  assert.match(ui.binding.loadingCopy(), /Sunburst/);
  ui.engines[0].dispatch("click");
  assert.equal(ui.exactSize.textContent, "1024 × 768");
  assert.ok(Object.values(ui.sides).every((input) => input.value === "0"));
  ui.ratios.find((button) => button.dataset.outpaintRatio === "4:3").dispatch("click");
  assert.equal(ui.binding.jobRequest({ image: source, jobId: "legacy-comfy" }).items[0].input.outpaintEngine, undefined);
});

test("Sunburst 没有可用比例档位时清空扩边并提示，当前 Key 未开放时阻断提交", () => {
  const ui = fixture();
  const unavailable = { ...sunburst, available: false, reason: "当前 Key 未开放 gpt-image-2.5-sunburst" };
  ui.binding.configure({ engines: [unavailable] });
  assert.equal(ui.binding.isAvailable(), false);
  assert.equal(ui.nodes.get("#imageOutpaintAvailability").textContent, "服务暂不可用");
  assert.equal(ui.engines[0].disabled, true);
  ui.ratios.find((button) => button.dataset.outpaintRatio === "4:3").dispatch("click");
  assert.throws(() => ui.binding.jobRequest({ image: source, jobId: "unavailable" }), /当前 Key 未开放/);
  ui.setSource({ ...source, width: 3000, height: 3000 });
  ui.ratios.find((button) => button.dataset.outpaintRatio === "16:9").dispatch("click");
  assert.match(ui.nodes.get("#imageOutpaintError").textContent, /没有可包住当前原图的 16:9 扩展画布/);
  assert.ok(Object.values(ui.sides).every((input) => input.value === "0"));
  assert.throws(() => ui.binding.jobRequest({ image: { ...source, width: 3000, height: 3000 }, jobId: "no-size" }), /至少一边/);
  ui.sides.left.value = "3";
  ui.sides.left.dispatch("input");
  assert.match(ui.nodes.get("#imageOutpaintError").textContent, /模型支持的画布档位/);
});

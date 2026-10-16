/**
 * [INPUT]: 依赖 node:test/assert、图片超分浏览器控制器、服务端公开目录与内存 DOM/sessionStorage 替身
 * [OUTPUT]: 对外提供五工作流选择、合法尺寸切换/恢复、KS 倍率与输入范围、前后端尺寸一致及单份图片请求的回归保障
 * [POS]: test 的图片超分交互测试，不提交 ComfyUI 任务或访问网络
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";

import { bindImageUpscale, targetDimensions } from "../public/image-upscale.js";
import { imageUpscaleTargetDimensions, publicImageUpscaleConfig } from "../src/image-upscale-workflow.mjs";

const STORAGE_KEY = "canvas-lab.image-upscale-selection";
const DIRECT_KEY = "seedvr2_7b_direct";
const KS_KEY = "ks_seedvr2_2x";

function element() {
  const attributes = new Map();
  const classes = new Set();
  const listeners = new Map();
  return {
    attributes,
    children: [],
    dataset: {},
    textContent: "",
    value: "",
    classList: { toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); } },
    setAttribute(name, value) { attributes.set(name, value); },
    addEventListener(name, callback) { listeners.set(name, callback); },
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
    click() { listeners.get("click")?.(); },
  };
}

function fixture(t, { remembered, source = { width: 1280, height: 720 }, brokenStorage = false } = {}) {
  const originalDocument = globalThis.document;
  const originalStorage = globalThis.sessionStorage;
  const storage = new Map(remembered === undefined ? [] : [[STORAGE_KEY, remembered]]);
  globalThis.document = { createElement: element };
  globalThis.sessionStorage = {
    getItem(key) { if (brokenStorage) throw new Error("存储不可用"); return storage.get(key) ?? null; },
    setItem(key, value) { if (brokenStorage) throw new Error("存储不可用"); storage.set(key, value); },
  };
  t.after(() => {
    globalThis.document = originalDocument;
    globalThis.sessionStorage = originalStorage;
  });
  const ui = Object.fromEntries(["availability", "emptyModel", "emptySize", "exactSize", "note", "resolutionSelect", "workflowList"]
    .map((name) => [name, element()]));
  let input = source;
  let changes = 0;
  const controller = bindImageUpscale({ ...ui, getSourceImage: () => input, onChange: () => { changes += 1; } });
  const config = { ...publicImageUpscaleConfig(), comfyUi: { available: true, version: "fixture" } };
  controller.configure(config);
  return {
    ...ui,
    config,
    controller,
    changes: () => changes,
    choose: (key) => ui.workflowList.children.find((button) => button.dataset.upscaleWorkflow === key).click(),
    resolution(value) { ui.resolutionSelect.value = value; controller.renderSummary(); },
    remembered: () => JSON.parse(storage.get(STORAGE_KEY)),
    source(value) { input = value; controller.renderSummary(); },
  };
}

test("服务端五项工作流全部可选，按钮使用短名称且悬停及无障碍保留完整名称", (t) => {
  const ui = fixture(t);
  assert.deepEqual(ui.workflowList.children.map((button) => button.dataset.upscaleWorkflow),
    ui.config.workflows.map((workflow) => workflow.key));
  assert.equal(ui.controller.currentItem().key, ui.config.defaultWorkflowKey);
  assert.equal(ui.workflowList.children[0].attributes.get("aria-checked"), "true");
  for (const [index, workflow] of ui.config.workflows.entries()) {
    assert.equal(ui.workflowList.children[index].title, workflow.label);
    assert.equal(ui.workflowList.children[index].attributes.get("aria-label"), workflow.label);
    assert.equal(ui.workflowList.children[index].children[0].textContent, workflow.shortLabel || workflow.label);
  }
  assert.equal(ui.controller.isAvailable(), true);
});

test("普通档位切换保持6K，进入KS回退2倍且返回普通工作流回退合法4K", (t) => {
  const ui = fixture(t);
  ui.resolution("6K");
  ui.choose(DIRECT_KEY);
  assert.equal(ui.resolutionSelect.value, "6K");
  assert.equal(ui.exactSize.textContent, "6144 × 3456");
  ui.choose(KS_KEY);
  assert.deepEqual(ui.resolutionSelect.children.map((option) => option.value), ["2X"]);
  assert.equal(ui.resolutionSelect.children[0].textContent, "2× 原图尺寸");
  assert.equal(ui.resolutionSelect.value, "2X");
  assert.equal(ui.exactSize.textContent, "2560 × 1440");
  assert.equal(ui.emptySize.textContent, "2560 × 1440");
  assert.match(ui.controller.loadingCopy(), /2× 原图尺寸/);
  assert.doesNotMatch(ui.controller.loadingCopy(), /4K/);
  assert.equal(ui.note.textContent, ui.config.workflows.find((workflow) => workflow.key === KS_KEY).helpText);
  ui.choose("seedvr2_075mp");
  assert.equal(ui.resolutionSelect.value, "4K");
  assert.equal(ui.changes(), 3);
});

test("切换其他功能改写共享select后，激活超分仍恢复本功能尺寸且配置刷新保留选择", (t) => {
  const ui = fixture(t);
  ui.choose(DIRECT_KEY);
  ui.resolution("8K");
  ui.resolutionSelect.replaceChildren({ value: "1K" }, { value: "2K" });
  ui.resolutionSelect.value = "2K";
  ui.controller.activate();
  assert.equal(ui.resolutionSelect.value, "8K");
  assert.equal(ui.exactSize.textContent, "8192 × 4608");
  ui.controller.configure(ui.config);
  assert.equal(ui.controller.currentItem().key, DIRECT_KEY);
  assert.equal(ui.resolutionSelect.value, "8K");
  assert.deepEqual(ui.remembered(), { resolution: "8K", workflowKey: DIRECT_KEY });
});

test("旧缓存中KS的非法4K恢复为2倍", (t) => {
  const ks = fixture(t, { remembered: JSON.stringify({ workflowKey: KS_KEY, resolution: "4K" }) });
  assert.equal(ks.controller.currentItem().key, KS_KEY);
  assert.equal(ks.resolutionSelect.value, "2X");
});

test("失效工作流与档位回退到服务端默认", (t) => {
  const stale = fixture(t, { remembered: JSON.stringify({ workflowKey: "removed-workflow", resolution: "10K" }) });
  assert.equal(stale.controller.currentItem().key, stale.config.defaultWorkflowKey);
  assert.equal(stale.resolutionSelect.value, "4K");
  assert.deepEqual(stale.remembered(), { resolution: "4K", workflowKey: stale.config.defaultWorkflowKey });
});

test("KS按照原图两倍提交独立工作流与2X，只传一份图片正文", (t) => {
  const ui = fixture(t);
  ui.choose(KS_KEY);
  const image = { dataUrl: "data:image/png;base64,fixture", name: "photo.png", size: 12,
    type: "image/png", width: 1280, height: 720 };
  const request = ui.controller.jobRequest({ image, jobId: "generation-fixture" });
  assert.equal(request.featureMode, "imageUpscale");
  assert.deepEqual(request.items[0].input, { resolution: "2X", upscaleWorkflowKey: KS_KEY });
  assert.equal(request.items[0].key, KS_KEY);
  assert.match(request.items[0].label, /2×/);
  assert.equal(request.sharedInput.referenceImages[0].dataUrl, image.dataUrl);
  assert.equal(request.items[0].input.referenceImages, undefined);
  assert.equal(request.sharedInput.referenceImages[0].width, undefined);
});

test("KS输入范围由服务端目录驱动，超出后说明原因并在START前阻断，换图后恢复", (t) => {
  const ui = fixture(t);
  ui.choose(KS_KEY);
  for (const source of [{ width: 383, height: 720 }, { width: 1280, height: 3201 }]) {
    ui.source(source);
    assert.equal(ui.controller.isAvailable(), false);
    assert.match(ui.controller.availabilityReason(), /384–3200px/);
    assert.match(ui.note.textContent, /请调整图片后上传/);
    assert.equal(ui.emptySize.textContent, "请调整输入图片尺寸");
    assert.throws(() => ui.controller.jobRequest({ image: source, jobId: "generation-invalid" }), /384–3200px/);
  }
  ui.source({ width: 384, height: 3200 });
  assert.equal(ui.controller.isAvailable(), true);
  assert.equal(ui.exactSize.textContent, "768 × 6400");
});

test("未上传图片时KS摘要显示原图倍率，空目录禁用参数并阻断提交", (t) => {
  const ui = fixture(t, { source: null });
  ui.choose(KS_KEY);
  assert.equal(ui.exactSize.textContent, "2× 原图尺寸 · 保持原图比例");
  assert.equal(ui.emptySize.textContent, "上传图片后计算");
  ui.controller.configure({ ...ui.config, workflows: [], resolutions: [] });
  assert.equal(ui.resolutionSelect.disabled, true);
  assert.equal(ui.controller.isAvailable(), false);
  assert.match(ui.controller.availabilityReason(), /未就绪/);
});

for (const storage of [{ remembered: "not json" }, { remembered: "null" }, { brokenStorage: true }]) {
  test(`非法或不可用存储安全回退：${JSON.stringify(storage)}`, (t) => {
    const ui = fixture(t, storage);
    assert.equal(ui.controller.currentItem().key, ui.config.defaultWorkflowKey);
    assert.equal(ui.resolutionSelect.value, "4K");
    ui.choose(KS_KEY);
    assert.equal(ui.resolutionSelect.value, "2X");
  });
}

test("五工作流各合法档位的浏览器摘要与后端计算一致，含普通横图/竖图/方图", () => {
  const config = publicImageUpscaleConfig();
  for (const source of [{ width: 1280, height: 720 }, { width: 721, height: 1281 }, { width: 1000, height: 1000 }]) {
    for (const workflow of config.workflows) {
      for (const resolution of workflow.resolutions) {
        const { width, height } = imageUpscaleTargetDimensions(source, resolution.key, workflow.key);
        assert.deepEqual(targetDimensions(source, resolution), { width, height });
      }
    }
  }
});

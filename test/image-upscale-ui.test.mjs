/**
 * [INPUT]: 依赖 node:test/assert、图片超分浏览器控制器、服务端公开目录与内存 DOM/sessionStorage 替身
 * [OUTPUT]: 提供六工作流/节点能力、KS最终2X/4K/6K与缓存、目录驱动整图限面积说明、输入范围及单份图片/冻结版本请求保障
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
const KS_KEYS = [KS_KEY, "ks_seedvr2_2x_direct"];

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

test("服务端六项工作流全部可选，按钮使用短名称且悬停及无障碍保留完整名称", (t) => {
  const ui = fixture(t);
  assert.equal(ui.workflowList.children.length, 6);
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

for (const key of KS_KEYS) {
  test(`普通档位与${key}之间保留合法4K/6K，8K回退原图2倍`, (t) => {
    const ui = fixture(t);
    ui.resolution("6K");
    ui.choose(DIRECT_KEY);
    assert.equal(ui.resolutionSelect.value, "6K");
    assert.equal(ui.exactSize.textContent, "6144 × 3456");
    ui.choose(key);
    assert.deepEqual(ui.resolutionSelect.children.map((option) => option.value), ["2X", "4K", "6K"]);
    assert.equal(ui.resolutionSelect.value, "6K");
    assert.equal(ui.exactSize.textContent, "6144 × 3456");
    ui.resolution("4K");
    ui.choose("seedvr2_075mp");
    assert.equal(ui.resolutionSelect.value, "4K");
    ui.resolution("8K");
    ui.choose(key);
    assert.equal(ui.resolutionSelect.value, "2X");
    assert.equal(ui.exactSize.textContent, "2560 × 1440");
    assert.equal(ui.emptySize.textContent, "2560 × 1440");
    assert.match(ui.controller.loadingCopy(), /原图2倍/);
    assert.doesNotMatch(ui.controller.loadingCopy(), /4K/);
    assert.equal(ui.note.textContent, ui.config.workflows.find((workflow) => workflow.key === key).helpText);
    ui.choose("seedvr2_075mp");
    assert.equal(ui.resolutionSelect.value, "4K");
    assert.equal(ui.changes(), 5);
  });
}

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

for (const key of KS_KEYS) for (const [resolution, expected] of [["2X", "2X"], ["4K", "4K"], ["6K", "6K"], ["8K", "2X"]]) {
  test(`${key} 缓存${resolution}恢复为${expected}且不被其他功能共用尺寸控件覆盖`, (t) => {
    const ks = fixture(t, { remembered: JSON.stringify({ workflowKey: key, resolution }) });
    assert.equal(ks.controller.currentItem().key, key);
    assert.equal(ks.resolutionSelect.value, expected);
    ks.resolutionSelect.replaceChildren({ value: "1K" }, { value: "2K" });
    ks.resolutionSelect.value = "2K";
    ks.controller.activate();
    ks.controller.configure(ks.config);
    assert.equal(ks.controller.currentItem().key, key);
    assert.equal(ks.resolutionSelect.value, expected);
    assert.deepEqual(ks.remembered(), { resolution: expected, workflowKey: key });
  });
}

test("失效工作流与档位回退到服务端默认", (t) => {
  const stale = fixture(t, { remembered: JSON.stringify({ workflowKey: "removed-workflow", resolution: "10K" }) });
  assert.equal(stale.controller.currentItem().key, stale.config.defaultWorkflowKey);
  assert.equal(stale.resolutionSelect.value, "4K");
  assert.deepEqual(stale.remembered(), { resolution: "4K", workflowKey: stale.config.defaultWorkflowKey });
});

test("服务缺最终尺寸恢复节点时只阻断对应KS并显示原因，其他工作流保持可用", (t) => {
  const ui = fixture(t);
  ui.controller.configure({ ...ui.config, workflows: ui.config.workflows.map(workflow => ({ ...workflow,
    available: workflow.key !== KS_KEY, reason: workflow.key === KS_KEY ? "缺少超分节点：ImageScale" : null })) });
  ui.choose(KS_KEY);
  assert.equal(ui.controller.isAvailable(), false);
  assert.match(ui.note.textContent, /ImageScale/);
  assert.throws(() => ui.controller.jobRequest({ image: { width: 1280, height: 720 }, jobId: "generation-not-submitted" }), /ImageScale/);
  ui.choose(ui.config.defaultWorkflowKey);
  assert.equal(ui.controller.isAvailable(), true);
});

test("整图推理面积说明跟随目录，6K最终尺寸和请求不被改成推理尺寸", (t) => {
  const ui = fixture(t, { source: { width: 3200, height: 3200 } });
  const helpText = "整图推理面积小于20MP，超限时降低推理尺寸并等比恢复最终6K。";
  ui.controller.configure({ ...ui.config, workflows: ui.config.workflows.map(workflow => ({ ...workflow,
    helpText: workflow.key === KS_KEY ? helpText : workflow.helpText })) });
  ui.choose(KS_KEY);
  ui.resolution("6K");
  assert.equal(ui.note.textContent, helpText);
  assert.equal(ui.exactSize.textContent, "6144 × 6144");
  const request = ui.controller.jobRequest({ image: { width: 3200, height: 3200 }, jobId: "generation-final-6k" });
  assert.equal(request.items[0].input.resolution, "6K");
  assert.equal(request.items[0].input.upscaleWorkflowVersion,
    ui.config.workflows.find(workflow => workflow.key === KS_KEY).version);
});

for (const key of KS_KEYS) {
  for (const resolution of ["2X", "4K", "6K"]) test(`${key}提交显式${resolution}且只传一份图片正文`, (t) => {
    const ui = fixture(t, { remembered: JSON.stringify({ workflowKey: key, resolution }) });
    const image = { dataUrl: "data:image/png;base64,fixture", name: "photo.png", size: 12,
      type: "image/png", width: 1280, height: 720 };
    const request = ui.controller.jobRequest({ image, jobId: "generation-fixture" });
    assert.equal(request.featureMode, "imageUpscale");
    assert.deepEqual(request.items[0].input, { resolution, upscaleWorkflowKey: key,
      upscaleWorkflowVersion: ui.config.workflows.find(workflow => workflow.key === key).version });
    assert.equal(request.items[0].key, key);
    assert.ok(request.items[0].label.includes(resolution === "2X" ? "原图2倍" : resolution));
    assert.equal(request.sharedInput.referenceImages[0].dataUrl, image.dataUrl);
    assert.equal(request.sharedInput.referenceImages.length, 1);
    assert.equal(request.items[0].input.referenceImages, undefined);
    assert.equal(request.sharedInput.referenceImages[0].width, undefined);
  });

  test(`${key} 输入范围由服务端目录驱动，超出后说明原因并在START前阻断，换图后恢复`, (t) => {
    const ui = fixture(t);
    ui.choose(key);
    ui.resolution("2X");
    for (const source of [
      { width: 383, height: 720 }, { width: 3201, height: 720 },
      { width: 1280, height: 383 }, { width: 1280, height: 3201 },
    ]) {
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

  test(`未上传图片时${key}摘要显示原图倍率，空目录禁用参数并阻断提交`, (t) => {
    const ui = fixture(t, { source: null });
    ui.choose(key);
    ui.resolution("2X");
    assert.equal(ui.exactSize.textContent, "原图2倍 · 保持原图比例");
    assert.equal(ui.emptySize.textContent, "上传图片后计算");
    ui.controller.configure({ ...ui.config, workflows: [], resolutions: [] });
    assert.equal(ui.resolutionSelect.disabled, true);
    assert.equal(ui.controller.isAvailable(), false);
    assert.match(ui.controller.availabilityReason(), /未就绪/);
  });
}

for (const storage of [{ remembered: "not json" }, { remembered: "null" }, { brokenStorage: true }]) {
  test(`非法或不可用存储安全回退：${JSON.stringify(storage)}`, (t) => {
    const ui = fixture(t, storage);
    assert.equal(ui.controller.currentItem().key, ui.config.defaultWorkflowKey);
    assert.equal(ui.resolutionSelect.value, "4K");
    ui.choose(KS_KEY);
    assert.equal(ui.resolutionSelect.value, "4K");
  });
}

test("六工作流各合法档位的浏览器摘要与后端计算一致，含普通横图/竖图/方图", () => {
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

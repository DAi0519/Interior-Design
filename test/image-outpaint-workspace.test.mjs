/**
 * [INPUT]: 依赖 node:test/assert 与 image-outpaint-workspace.js，使用可重挂载节点和键盘事件的内存 DOM
 * [OUTPUT]: 对外提供构图节点/事件保留、新图默认预览与旧任务隔离、任务阶段/页签选择、隐藏时关闭设置、键盘访问及跨功能结果/飞书链接隔离回归保障
 * [POS]: test 的 AI扩图主画布交互测试，与几何/请求测试互补，不访问浏览器、网络或 GPU
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";
import { bindImageOutpaintWorkspace } from "../public/image-outpaint-workspace.js";

class Element {
  constructor(document, tagName = "div") {
    this.ownerDocument = document;
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.attributes = new Map();
    this.listeners = new Map();
    this.className = "";
    this.id = "";
    this.textContent = "";
    this.classList = {
      contains: (name) => this.className.split(/\s+/).includes(name),
      toggle: (name, enabled) => {
        const names = new Set(this.className.split(/\s+/).filter(Boolean));
        if (enabled) names.add(name); else names.delete(name);
        this.className = [...names].join(" ");
        return enabled;
      },
    };
  }
  append(...nodes) {
    for (const node of nodes) {
      node.remove();
      node.parentElement = this;
      this.children.push(node);
    }
  }
  before(...nodes) {
    const parent = this.parentElement;
    for (const node of nodes) {
      node.remove();
      node.parentElement = parent;
      parent.children.splice(parent.children.indexOf(this), 0, node);
    }
  }
  remove() {
    if (!this.parentElement) return;
    const parent = this.parentElement;
    parent.children.splice(parent.children.indexOf(this), 1);
    this.parentElement = null;
  }
  querySelector(selector) {
    return this.descendants().find((node) => selector.startsWith("#") ? node.id === selector.slice(1)
      : selector.startsWith(".") ? node.classList.contains(selector.slice(1))
        : node.tagName.toLowerCase() === selector) || null;
  }
  descendants() { return this.children.flatMap((node) => [node, ...node.descendants()]); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
  addEventListener(name, handler) {
    this.listeners.set(name, [...(this.listeners.get(name) || []), handler]);
  }
  dispatch(name, values = {}) {
    const event = { target: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...values };
    for (const handler of this.listeners.get(name) || []) handler(event);
    return event;
  }
  focus() { this.ownerDocument.activeElement = this; }
}

function fixture({ resultRole = null, resultLabel = null, onHide, now } = {}) {
  const document = new Element(null, "document");
  document.createElement = (tag) => new Element(document, tag);
  const create = (className = "", id = "", tag = "div") => {
    const node = document.createElement(tag);
    Object.assign(node, { className, id });
    return node;
  };
  const root = create("", "imageOutpaintSection", "section");
  const figure = create("image-outpaint-preview", "", "figure");
  const canvas = create("image-outpaint-canvas", "imageOutpaintCanvas");
  const image = create("", "imageOutpaintSourceImage", "img");
  image.src = "data:image/png;base64,source";
  canvas.append(image);
  figure.append(canvas);
  const position = create("image-outpaint-position");
  const reset = create("", "imageOutpaintPositionReset", "button");
  position.append(reset);
  const output = create("image-outpaint-output");
  const size = create("", "imageOutpaintOutputSize", "output");
  size.textContent = "2048 × 1152";
  output.append(size);
  root.append(figure, position, output);
  const panel = create("result-panel", "", "section");
  const toolbar = create("result-toolbar");
  const resultStage = create("result-stage", "resultStage");
  if (resultRole !== null) resultStage.setAttribute("role", resultRole);
  if (resultLabel !== null) resultStage.setAttribute("aria-labelledby", resultLabel);
  const gallery = create("result-gallery", "resultGallery");
  const recordLink = create("", "larkRecordLink", "a");
  recordLink.href = "https://example.feishu.cn/base/test?record=completed";
  gallery.append(recordLink);
  resultStage.append(gallery);
  panel.append(toolbar, resultStage);
  document.append(root, panel);
  let moves = 0;
  let resets = 0;
  canvas.addEventListener("keydown", () => { moves += 1; });
  reset.addEventListener("click", () => { resets += 1; });
  const binding = bindImageOutpaintWorkspace({ root, onHide, now });
  return {
    binding, document, root, figure, canvas, image, position, reset, output, size, panel, toolbar, resultStage, gallery, recordLink,
    workspace: document.querySelector("#imageOutpaintWorkspace"),
    tabs: document.querySelector(".outpaint-workspace-tabs"),
    previewTab: document.querySelector("#imageOutpaintPreviewTab"),
    resultTab: document.querySelector("#imageOutpaintResultTab"),
    events: () => ({ moves, resets }),
  };
}

const hidden = (node) => node.classList.contains("hidden");
const selected = (node) => node.getAttribute("aria-selected") === "true";
const source = (id) => ({ id, dataUrl: `data:image/png;base64,${id}`, width: 1080, height: 810 });
const task = (id, createdAt) => ({ jobId: `generation-${id}`, createdAt });

test("大画布重挂原构图节点，已绑定的定位/居中事件和尺寸内容完整保留", () => {
  const ui = fixture();
  assert.equal(ui.root.querySelector(".image-outpaint-preview"), null);
  assert.equal(ui.workspace.querySelector(".image-outpaint-preview"), ui.figure);
  assert.equal(ui.workspace.querySelector("#imageOutpaintCanvas"), ui.canvas);
  assert.equal(ui.workspace.querySelector("#imageOutpaintSourceImage"), ui.image);
  assert.equal(ui.workspace.querySelector(".image-outpaint-position"), ui.position);
  assert.equal(ui.workspace.querySelector(".image-outpaint-output"), ui.output);
  assert.equal(ui.size.textContent, "2048 × 1152");
  assert.equal(ui.image.src, "data:image/png;base64,source");
  ui.canvas.dispatch("keydown", { key: "ArrowRight" });
  ui.reset.dispatch("click");
  assert.deepEqual(ui.events(), { moves: 1, resets: 1 });
});

test("空任务打开构图预览且禁用结果页签，不影响其他功能初始结果面板", () => {
  const ui = fixture();
  assert.equal(hidden(ui.tabs), true);
  assert.equal(hidden(ui.workspace), true);
  assert.equal(hidden(ui.resultStage), false);
  assert.equal(hidden(ui.toolbar), false);
  ui.binding.setActive(true);
  assert.equal(hidden(ui.tabs), false);
  assert.equal(hidden(ui.workspace), false);
  assert.equal(hidden(ui.resultStage), true);
  assert.equal(hidden(ui.toolbar), true);
  assert.equal(selected(ui.previewTab), true);
  assert.equal(ui.resultTab.disabled, true);
  ui.resultTab.dispatch("click");
  assert.equal(hidden(ui.workspace), false);
});

test("任务开始和完成切到状态/结果，重复渲染不抢走用户构图选择或清空飞书结果", () => {
  const ui = fixture();
  ui.binding.setActive(true);
  ui.binding.setStage("loading");
  assert.equal(hidden(ui.workspace), true);
  assert.equal(hidden(ui.resultStage), false);
  assert.equal(ui.resultTab.textContent, "任务状态");
  assert.equal(ui.resultTab.disabled, false);
  ui.binding.setStage("results");
  assert.equal(ui.resultTab.textContent, "生成结果");
  assert.equal(selected(ui.resultTab), true);
  ui.previewTab.dispatch("click");
  ui.binding.setStage("results");
  ui.binding.setActive(true);
  assert.equal(hidden(ui.workspace), false);
  assert.equal(hidden(ui.resultStage), true);
  assert.equal(selected(ui.previewTab), true);
  assert.equal(ui.resultStage.querySelector("#resultGallery"), ui.gallery);
  assert.equal(ui.gallery.querySelector("#larkRecordLink"), ui.recordLink);
  assert.equal(ui.recordLink.href, "https://example.feishu.cn/base/test?record=completed");
  ui.resultTab.dispatch("click");
  assert.equal(hidden(ui.workspace), true);
  assert.equal(hidden(ui.resultStage), false);
  ui.previewTab.dispatch("click");
  ui.binding.setStage("loading");
  assert.equal(selected(ui.resultTab), true);
  assert.equal(hidden(ui.resultStage), false);
});

test("失败默认保留错误状态，用户可返回构图且相同错误重绘保持选择", () => {
  const ui = fixture();
  ui.binding.setActive(true);
  ui.binding.setStage("error");
  assert.equal(selected(ui.resultTab), true);
  assert.equal(ui.resultTab.textContent, "任务状态");
  assert.equal(hidden(ui.resultStage), false);
  ui.previewTab.dispatch("click");
  ui.binding.setStage("error");
  assert.equal(selected(ui.previewTab), true);
  assert.equal(hidden(ui.workspace), false);
  ui.resultTab.dispatch("click");
  assert.equal(hidden(ui.resultStage), false);
  ui.binding.setStage("empty");
  assert.equal(selected(ui.previewTab), true);
  assert.equal(ui.resultTab.disabled, true);
});

test("页签方向键/Home/End切换选择与焦点，空任务不能键盘进入无结果页", () => {
  const ui = fixture();
  ui.binding.setActive(true);
  const emptyKey = ui.previewTab.dispatch("keydown", { key: "ArrowRight" });
  assert.equal(emptyKey.defaultPrevented, true);
  assert.equal(ui.document.activeElement, ui.previewTab);
  ui.binding.setStage("results");
  for (const [start, key, target] of [
    [ui.resultTab, "ArrowRight", ui.previewTab],
    [ui.previewTab, "ArrowLeft", ui.resultTab],
    [ui.resultTab, "Home", ui.previewTab],
    [ui.previewTab, "End", ui.resultTab],
  ]) {
    assert.equal(start.dispatch("keydown", { key }).defaultPrevented, true);
    assert.equal(ui.document.activeElement, target);
    assert.equal(selected(target), true);
    assert.equal(target.getAttribute("tabindex"), "0");
  }
  assert.equal(ui.resultTab.dispatch("keydown", { key: "ArrowDown" }).defaultPrevented, false);
});

test("跨功能隐藏扩图工作区并恢复原面板语义，其他功能阶段不会改写扩图选择", () => {
  for (const original of [{}, { resultRole: "region", resultLabel: "generationTitle" }]) {
    const ui = fixture(original);
    ui.binding.setActive(true);
    ui.binding.setStage("results");
    assert.equal(ui.resultStage.getAttribute("role"), "tabpanel");
    assert.equal(ui.resultStage.getAttribute("aria-labelledby"), ui.resultTab.id);
    ui.previewTab.dispatch("click");
    ui.binding.setActive(false);
    ui.binding.setStage("loading");
    assert.equal(hidden(ui.tabs), true);
    assert.equal(hidden(ui.workspace), true);
    assert.equal(hidden(ui.resultStage), false);
    assert.equal(hidden(ui.toolbar), false);
    assert.equal(ui.panel.classList.contains("outpaint-workspace-active"), false);
    assert.equal(ui.resultStage.getAttribute("role"), original.resultRole ?? null);
    assert.equal(ui.resultStage.getAttribute("aria-labelledby"), original.resultLabel ?? null);
    assert.equal(ui.resultStage.querySelector("#resultGallery"), ui.gallery);
    ui.binding.setActive(true);
    ui.binding.setStage("results");
    assert.equal(selected(ui.previewTab), true);
    assert.equal(hidden(ui.workspace), false);
    assert.equal(ui.resultTab.textContent, "生成结果");
  }
});

test("切功能、切结果和任务状态隐藏构图时关闭顶层设置，保留构图时不打断设置", () => {
  let open = false;
  let closes = 0;
  const ui = fixture({ onHide() { open = false; closes += 1; } });
  ui.binding.setActive(true);
  open = true;
  const initialCloses = closes;
  ui.binding.setActive(true);
  ui.binding.setStage("empty");
  assert.equal(open, true);
  assert.equal(closes, initialCloses);
  ui.binding.setActive(false);
  assert.equal(open, false);
  assert.ok(closes > initialCloses);
  ui.binding.setActive(true);
  for (const stage of ["loading", "error", "results"]) {
    open = true;
    const before = closes;
    ui.binding.setStage(stage);
    assert.equal(open, false, stage);
    assert.ok(closes > before, stage);
    ui.previewTab.dispatch("click");
    open = true;
    const previewCloses = closes;
    ui.binding.setStage(stage);
    ui.binding.setActive(true);
    assert.equal(open, true, `相同 ${stage} 的预览重绘不关闭设置`);
    assert.equal(closes, previewCloses);
    ui.resultTab.dispatch("click");
    assert.equal(open, false, `切换 ${stage} 结果关闭设置`);
    ui.previewTab.dispatch("click");
  }
});

test("已有结果时上传/替换图片默认打开构图，同图刷新不抢页且原下载和飞书节点保留", () => {
  const ui = fixture({ now: () => 200 });
  const completed = task("completed", 100);
  ui.binding.setActive(true);
  ui.binding.setStage("results", completed);
  assert.equal(selected(ui.resultTab), true);
  ui.binding.setSource(source("first"));
  assert.equal(selected(ui.previewTab), true);
  assert.equal(hidden(ui.workspace), false);
  ui.binding.setStage("results", completed);
  assert.equal(selected(ui.previewTab), true);
  ui.resultTab.dispatch("click");
  ui.binding.setSource(source("first"));
  ui.binding.setStage("results", completed);
  assert.equal(selected(ui.resultTab), true, "同图对象重建/配置刷新不抢走结果页");
  ui.binding.setSource(source("replacement"));
  assert.equal(selected(ui.previewTab), true);
  assert.equal(ui.resultStage.querySelector("#resultGallery"), ui.gallery);
  assert.equal(ui.gallery.querySelector("#larkRecordLink"), ui.recordLink);
  assert.equal(ui.recordLink.href, "https://example.feishu.cn/base/test?record=completed");
  assert.equal(ui.resultTab.disabled, false);
});

test("新图上传后恢复较早的任务时，加载/结果/失败不能覆盖当前构图", () => {
  for (const finalStage of ["results", "error"]) {
    const ui = fixture({ now: () => 200 });
    const restored = task("restored", 100);
    ui.binding.setActive(true);
    ui.binding.setSource(source("new-upload"));
    for (const stage of ["loading", "loading", finalStage]) {
      ui.binding.setStage(stage, restored);
      assert.equal(selected(ui.previewTab), true, stage);
      assert.equal(hidden(ui.workspace), false, stage);
    }
    ui.resultTab.dispatch("click");
    assert.equal(hidden(ui.resultStage), false, "用户仍可主动查看恢复任务");
  }
});

test("旧任务进行中换图保持新构图，下一次 START 的新任务正常自动显示状态及结果", () => {
  const ui = fixture({ now: () => 200 });
  const previous = task("previous", 100);
  const next = task("next", 250);
  ui.binding.setActive(true);
  ui.binding.setStage("loading", previous);
  ui.binding.setSource(source("draft"));
  ui.binding.setStage("loading", previous);
  assert.equal(selected(ui.previewTab), true);
  ui.binding.setStage("results", previous);
  assert.equal(selected(ui.previewTab), true, "旧任务完成保留新图的编辑上下文");
  ui.binding.setStage("loading", next);
  assert.equal(selected(ui.resultTab), true);
  assert.equal(ui.resultTab.textContent, "任务状态");
  ui.previewTab.dispatch("click");
  ui.binding.setStage("results", next);
  assert.equal(selected(ui.resultTab), true, "新任务完成正常自动显示生成结果");
});

test("非扩图页面与无效图片不强制切页，进入扩图时的新源打开构图且旧任务不盖回", () => {
  const ui = fixture({ now: () => 200 });
  const completed = task("completed", 100);
  ui.binding.setActive(true);
  ui.binding.setStage("results", completed);
  for (const invalid of [null, {}, { dataUrl: "source", width: 0, height: 500 }]) {
    ui.binding.setSource(invalid);
    assert.equal(selected(ui.resultTab), true);
  }
  ui.binding.setActive(false);
  ui.binding.setSource(source("other-feature-upload"));
  ui.binding.setStage("loading", task("other-feature", 300));
  assert.equal(hidden(ui.workspace), true);
  assert.equal(hidden(ui.resultStage), false);
  ui.binding.setActive(true);
  ui.binding.setSource(source("other-feature-upload"));
  ui.binding.setStage("results", completed);
  assert.equal(selected(ui.previewTab), true);
  ui.binding.setActive(false);
  ui.binding.setActive(true);
  ui.binding.setSource(source("other-feature-upload"));
  ui.resultTab.dispatch("click");
  ui.binding.setActive(false);
  ui.binding.setActive(true);
  ui.binding.setSource(source("other-feature-upload"));
  assert.equal(selected(ui.resultTab), true, "反复切功能和同图恢复尊重用户选择");
});

test("同毫秒开始的旧任务仍属旧图，删除后重新放入图片重新打开构图", () => {
  const ui = fixture({ now: () => 200 });
  const previous = task("previous", 200);
  ui.binding.setActive(true);
  ui.binding.setStage("loading", previous);
  const image = source("image");
  ui.binding.setSource(image);
  ui.binding.setStage("results", previous);
  assert.equal(selected(ui.previewTab), true);
  ui.resultTab.dispatch("click");
  ui.binding.setSource(null);
  assert.equal(selected(ui.resultTab), true);
  ui.binding.setSource(image);
  assert.equal(selected(ui.previewTab), true);
  ui.binding.setStage("loading", task("next", 200));
  assert.equal(selected(ui.resultTab), true, "同毫秒的新任务由不同任务身份区分");
});

test("未传任务身份的旧调用仍支持换图保留构图与下一轮 loading 自动切换", () => {
  const ui = fixture();
  ui.binding.setActive(true);
  ui.binding.setStage("loading");
  ui.binding.setSource(source("draft"));
  ui.binding.setStage("loading");
  ui.binding.setStage("results");
  assert.equal(selected(ui.previewTab), true);
  ui.binding.setStage("loading");
  assert.equal(selected(ui.resultTab), true);
  ui.binding.setStage("results");
  assert.equal(selected(ui.resultTab), true);
});

/**
 * [INPUT]: 依赖 node:test/assert、主工作台入口 HTML、功能目录搜索与事件/DOM 替身
 * [OUTPUT]: 验证多词搜索、原生弹窗共用及首页对话选择分流、键盘与输入法、弹窗轻触关闭、同源画布快捷键和归焦
 * [POS]: test 的功能查找合同，不加载浏览器或发送请求
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { bindFeatureCatalog, bindFeatureCatalogFrame, matchesFeatureQuery } from "../public/feature-catalog.js";

const floorPlanCamera = {
  label: "平面图机位渲染",
  group: "AI渲染",
  keywords: "户型 相机视角 Ｑｗｅｎ",
  id: "floorPlanCamera",
};

test("功能搜索匹配名称、分类、别名与功能 ID", () => {
  assert.equal(matchesFeatureQuery(floorPlanCamera, "机位"), true);
  assert.equal(matchesFeatureQuery(floorPlanCamera, "AI渲染"), true);
  assert.equal(matchesFeatureQuery(floorPlanCamera, "相机视角"), true);
  assert.equal(matchesFeatureQuery(floorPlanCamera, "floorplancamera"), true);
});

test("搜索忽略大小写、全半角及空白，所有搜索词均须匹配", () => {
  assert.equal(matchesFeatureQuery(floorPlanCamera, "　"), true);
  assert.equal(matchesFeatureQuery(floorPlanCamera, "　ＱＷＥＮ  户型\t机位　"), true);
  assert.equal(matchesFeatureQuery(floorPlanCamera, "qwen FLOORPLANCAMERA ＡＩ渲染"), true);
  assert.equal(matchesFeatureQuery(floorPlanCamera, "机位 超分"), false);
  assert.equal(matchesFeatureQuery(floorPlanCamera, "不存在"), false);
});

test("桌面和移动搜索打开同一个原生弹窗，功能入口集中在目录中", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const openers = html.match(/<button\b[^>]*\bdata-feature-catalog-open(?=[\s=>])[^>]*>/g) || [];

  assert.equal(openers.length, 2);
  for (const opener of openers) {
    assert.match(opener, /\baria-haspopup="dialog"/);
    assert.match(opener, /\baria-controls="featureCatalogDialog"/);
  }

  const dialog = html.match(/<dialog\b[^>]*\bid="featureCatalogDialog"[\s\S]*?<\/dialog>/)?.[0] || "";
  assert.ok(dialog);
  assert.doesNotMatch(dialog, /\bdata-feature-mode=/);
});

function mockNode(ownerDocument) {
  const handlers = new Map();
  const attributes = new Map();
  return {
    ownerDocument, attributes, dataset: {}, children: [], isConnected: true, hidden: false, inert: false,
    addEventListener(type, handler) {
      const listeners = handlers.get(type) || [];
      listeners.push(handler);
      handlers.set(type, listeners);
    },
    emit(type, fields = {}) {
      const event = { target: this, defaultPrevented: false, ...fields,
        preventDefault() { this.defaultPrevented = true; } };
      for (const listener of handlers.get(type) || []) listener(event);
      return event;
    },
    append(...nodes) { this.children.push(...nodes); },
    getAttribute(name) { return attributes.get(name) ?? null; },
    setAttribute(name, value) { attributes.set(name, value); },
    removeAttribute(name) { attributes.delete(name); },
    getClientRects() { return this.hidden ? [] : [{}]; },
    closest() { return null; },
    click() { this.emit("click"); },
    focus(options) { this.ownerDocument.activeElement = this; this.focusOptions = options; },
    scrollIntoView(options) { this.scrollOptions = options; },
  };
}

function mockDocument() {
  const document = mockNode();
  document.body = mockNode(document);
  document.activeElement = document.body;
  const timers = new Map();
  let timerId = 0;
  document.defaultView = {
    CustomEvent,
    navigator: { platform: "MacIntel" },
    MutationObserver: class { observe() {} },
    setTimeout(callback, delay) { timers.set(++timerId, { callback, delay }); return timerId; },
    clearTimeout(id) { timers.delete(id); },
  };
  document.runTimers = () => {
    for (const [id, { callback }] of timers) {
      timers.delete(id);
      callback();
    }
  };
  document.timers = timers;
  document.querySelector = () => null;
  document.querySelectorAll = () => [];
  document.createElement = () => mockNode(document);
  return document;
}

function catalogFixture() {
  const root = mockDocument();
  const directory = mockNode(root), dialog = mockNode(root), group = mockNode(root), toggle = mockNode(root);
  const trigger = mockNode(root), close = mockNode(root), input = mockNode(root), results = mockNode(root);
  const status = mockNode(root), empty = mockNode(root);
  const buttons = ["白模渲染", "精模渲染"].map((textContent, index) => Object.assign(mockNode(root), {
    textContent, dataset: { featureMode: `feature${index}` },
  }));
  toggle.textContent = "AI渲染";
  toggle.setAttribute("aria-controls", "renderModes");
  buttons[0].setAttribute("aria-checked", "true");
  directory.querySelectorAll = () => [toggle];
  group.querySelectorAll = () => buttons;
  trigger.closest = (selector) => selector === "[data-feature-catalog-open]" ? trigger : null;
  trigger.click = () => root.emit("click", { target: trigger });
  root.getElementById = (id) => ({ featureModeList: directory, featureCatalogDialog: dialog, renderModes: group })[id];
  root.querySelectorAll = (selector) => selector === "[data-feature-catalog-open]" ? [trigger] : [];
  root.querySelector = (selector) => {
    if (dialog.open && selector.includes("dialog[open]")) return dialog;
    if (root.connectionOpen && selector.includes('#connectionDialog[aria-hidden="false"]')) return root;
    return null;
  };
  dialog.querySelector = (selector) => ({ "#featureCatalogQuery": input, "#featureCatalogResults": results,
    "#featureCatalogStatus": status, "#featureCatalogEmpty": empty, "[data-feature-catalog-close]": close })[selector];
  dialog.showModal = () => { dialog.open = true; input.focus(); };
  dialog.close = () => { dialog.open = false; };
  dialog.getBoundingClientRect = () => ({ left: 100, top: 100, right: 500, bottom: 400 });
  bindFeatureCatalog(root);
  return { root, directory, dialog, input, group, buttons, trigger, results };
}

test("连接中心打开时保留快捷键原行为，关闭后可以搜索", () => {
  const { root, dialog, input, trigger } = catalogFixture();
  const shortcut = { key: "k", metaKey: true };
  root.connectionOpen = true;
  assert.equal(root.emit("keydown", shortcut).defaultPrevented, false);
  trigger.click();
  assert.equal(dialog.open, undefined);
  root.connectionOpen = false;
  trigger.focus();
  assert.equal(root.emit("keydown", shortcut).defaultPrevented, true);
  assert.equal(root.activeElement, input);
  dialog.close();
  dialog.emit("close");
  assert.equal(root.activeElement, trigger);
});

test("移动侧栏方向键只移动焦点，功能仍由明确点击激活", () => {
  const { root, directory, group, buttons } = catalogFixture();
  directory.closest = () => directory;
  let selections = 0;
  buttons[1].addEventListener("click", () => { selections += 1; });
  assert.equal(group.emit("keydown", { target: buttons[0], key: "ArrowDown" }).defaultPrevented, true);
  assert.equal(root.activeElement, buttons[1]);
  assert.equal(buttons[0].getAttribute("aria-checked"), "true");
  assert.equal(buttons[0].tabIndex, -1);
  assert.equal(buttons[1].tabIndex, 0);
  assert.equal(selections, 0);
  buttons[1].click();
  assert.equal(selections, 1);
});

test("功能搜索保留输入法组合，忽略确认键连发并支持按最近距离浏览", () => {
  const { root, dialog, input, buttons, trigger, results } = catalogFixture();
  const [first, last] = results.children.map((row) => row.children[0]);
  let selections = 0;
  buttons[1].addEventListener("click", () => { selections += 1; });
  trigger.click();
  assert.equal(root.emit("keydown", { target: trigger, key: "Enter", repeat: true }).defaultPrevented, true);
  assert.equal(dialog.emit("keydown", { target: input, key: "Enter", repeat: true }).defaultPrevented, true);
  assert.equal(dialog.emit("keydown", { target: input, key: "Home" }).defaultPrevented, false);
  assert.equal(dialog.emit("keydown", { target: input, key: "ArrowDown", ctrlKey: true }).defaultPrevented, false);
  dialog.emit("keydown", { target: input, key: "ArrowDown" });
  assert.equal(root.activeElement, first);
  assert.deepEqual(first.focusOptions, { preventScroll: true });
  assert.deepEqual(first.scrollOptions, { block: "nearest" });
  dialog.emit("keydown", { target: first, key: "End" });
  assert.equal(root.activeElement, last);

  input.value = "精模";
  input.emit("input");
  input.emit("compositionstart");
  assert.equal(dialog.emit("cancel").defaultPrevented, true);
  input.emit("compositionend");
  assert.equal([...root.timers.values()][0].delay, 5);
  dialog.emit("keydown", { target: input, key: "Escape" });
  assert.equal(dialog.open, true);
  root.runTimers();
  dialog.emit("keydown", { target: input, key: "Enter", keyCode: 229 });
  assert.equal(dialog.open, true);
  assert.equal(selections, 0);
  dialog.emit("keydown", { target: input, key: "Enter" });
  assert.equal(dialog.open, false);
  assert.equal(selections, 1);
});

test("首页对话动态入口共用目录，根据当前功能定位并在选择时派发原功能身份", () => {
  const { root, dialog, input, group, buttons, results, trigger } = catalogFixture();
  const composer = mockNode(root);
  composer.dataset = { featureCatalogComposer: "", featureCatalogCurrent: "feature1" };
  composer.closest = (selector) => selector === "[data-feature-catalog-open]" ? composer : null;
  const icon = mockNode(root);
  icon.closest = composer.closest;
  const selections = [];
  composer.dispatchEvent = (event) => selections.push(event);
  let workspaceNavigation = 0;
  buttons[1].addEventListener("click", () => { workspaceNavigation += 1; });
  group.hidden = true;
  const [first, last] = results.children.map((row) => row.children[0]);
  root.emit("click", { target: icon });
  assert.equal(dialog.open, true);
  assert.equal(first.getAttribute("aria-current"), null);
  assert.equal(last.getAttribute("aria-current"), "true");
  assert.equal(root.emit("keydown", { target: composer, key: "Enter", repeat: true }).defaultPrevented, true);
  input.value = "精模";
  input.emit("input");
  dialog.emit("keydown", { target: input, key: "Enter" });
  assert.equal(dialog.open, false);
  assert.equal(workspaceNavigation, 0);
  assert.equal(group.hidden, true);
  assert.equal(selections.length, 1);
  assert.equal(selections[0].type, "canvas-lab:composer-feature");
  assert.equal(selections[0].bubbles, true);
  assert.deepEqual(selections[0].detail, { featureMode: "feature1", label: "精模渲染" });
  dialog.emit("close");
  assert.equal(root.activeElement, composer);

  trigger.click();
  assert.equal(first.getAttribute("aria-current"), "true");
  assert.equal(last.getAttribute("aria-current"), null);
  last.click();
  assert.equal(workspaceNavigation, 1);
  assert.equal(group.hidden, false);
});

test("功能搜索只在遮罩上的完整轻触关闭，选择文字拖出和取消触摸都不会关闭", () => {
  const { dialog, input, trigger } = catalogFixture();
  const outside = { button: 0, clientX: 50, clientY: 150 };
  trigger.click();
  dialog.emit("pointerdown", { target: input, button: 0, clientX: 150, clientY: 150 });
  dialog.emit("click", outside);
  assert.equal(dialog.open, true);
  dialog.emit("pointerdown", outside);
  dialog.emit("pointercancel");
  dialog.emit("click", outside);
  assert.equal(dialog.open, true);
  dialog.emit("pointerdown", outside);
  dialog.emit("click", outside);
  assert.equal(dialog.open, false);
});

test("嵌套同源画布快捷键避开本地弹层，保活恢复原焦点并拒绝旧文档事件", () => {
  const { root, dialog, trigger } = catalogFixture();
  const canvasDocument = mockDocument(), editorDocument = mockDocument();
  const outerFrame = Object.assign(mockNode(root), { contentDocument: canvasDocument });
  const innerFrame = Object.assign(mockNode(canvasDocument), { contentDocument: editorDocument });
  canvasDocument.querySelectorAll = () => [innerFrame];
  const editorControl = mockNode(editorDocument);
  editorControl.focus();
  bindFeatureCatalogFrame(outerFrame);

  const shortcut = { key: "k", ctrlKey: true };
  editorDocument.querySelector = () => ({});
  assert.equal(editorDocument.emit("keydown", shortcut).defaultPrevented, false);
  editorDocument.querySelector = () => null;
  assert.equal(editorDocument.emit("keydown", { ...shortcut, isComposing: true }).defaultPrevented, false);
  assert.equal(editorDocument.emit("keydown", shortcut).defaultPrevented, true);
  assert.equal(dialog.open, true);
  editorDocument.activeElement = editorDocument.body;
  dialog.close();
  dialog.emit("close");
  assert.equal(editorDocument.activeElement, editorControl);

  assert.equal(editorDocument.emit("keydown", shortcut).defaultPrevented, true);
  outerFrame.inert = true;
  dialog.close();
  dialog.emit("close");
  assert.equal(root.activeElement, trigger);
  assert.equal(editorDocument.emit("keydown", shortcut).defaultPrevented, false);

  outerFrame.inert = false;
  const reloadedEditor = mockDocument();
  innerFrame.contentDocument = reloadedEditor;
  innerFrame.emit("load");
  assert.equal(editorDocument.emit("keydown", shortcut).defaultPrevented, false);
  assert.equal(reloadedEditor.emit("keydown", shortcut).defaultPrevented, true);
});

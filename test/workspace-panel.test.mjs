/**
 * [INPUT]: 依赖 node:test/assert、工作台配置面板控制器与内存 DOM/存储/尺寸及媒体查询替身
 * [OUTPUT]: 验证参数分隔线点击、触摸、键盘及拖动，桌面默认展开与宽度记忆、旧偏好兼容、取消保护和移动抽屉
 * [POS]: test 的主工作台配置布局行为测试，不启动浏览器、不读写真实存储或调用模型
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  bindWorkspacePanel, normalizeWorkspacePanelState, snapWorkspacePanelWidth, workspacePanelBounds, workspacePanelGeometry,
} from "../public/workspace-panel.js";

const STORAGE_KEY = "canvas-lab.workspace-panel";

class FixtureNode {
  constructor(tagName, ownerDocument) {
    Object.assign(this, { tagName, ownerDocument, parentNode: null, children: [], attributes: new Map(),
      listeners: new Map(), dataset: {}, className: "", value: "", textContent: "", hidden: false,
      disabled: false, inert: false, clientWidth: 0, clientHeight: 720, captures: new Set() });
    const properties = new Map();
    this.style = { setProperty: (key, value) => properties.set(key, value),
      getPropertyValue: key => properties.get(key) || "", removeProperty: key => properties.delete(key) };
    const classes = () => new Set(this.className.split(/\s+/).filter(Boolean));
    this.classList = {
      add: (...names) => { const list = classes();names.forEach(name => list.add(name));this.className = [...list].join(" "); },
      remove: (...names) => { const list = classes();names.forEach(name => list.delete(name));this.className = [...list].join(" "); },
      contains: name => classes().has(name),
      toggle: (name, force) => { const enabled = force ?? !classes().has(name);this.classList[enabled ? "add" : "remove"](name);return enabled; },
    };
  }
  setAttribute(key, value) {
    const next = String(value), previous = this.attributes.get(key);
    this.attributes.set(key, next);
    if (key === "id") this.id = next;
    if (key === "class") this.className = next;
    if (key.startsWith("data-")) this.dataset[key.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = next;
    if (previous !== next) this.ownerDocument?.mutations?.add(this);
  }
  getAttribute(key) { return this.attributes.get(key) ?? null; }
  hasAttribute(key) { return this.attributes.has(key); }
  removeAttribute(key) { this.attributes.delete(key); }
  addEventListener(type, callback) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(callback);
  }
  removeEventListener(type, callback) { this.listeners.get(type)?.delete(callback); }
  emit(type, properties = {}) {
    const event = { type, target: this, bubbles: true, defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; }, ...properties };
    this.dispatchEvent(event);
    return event;
  }
  dispatchEvent(event) {
    event.target ??= this;
    for (let node = this; node; node = event.bubbles && !event.stopped ? node.parentNode : null) {
      for (const callback of node.listeners.get(event.type) || []) callback(event);
    }
    return !event.defaultPrevented;
  }
  append(...nodes) { nodes.forEach(node => this.insertBefore(node, null)); }
  appendChild(node) { this.append(node);return node; }
  insertBefore(node, reference) {
    node.remove();node.parentNode = this;
    const index = reference ? this.children.indexOf(reference) : -1;
    if (index < 0) this.children.push(node);else this.children.splice(index, 0, node);
    return node;
  }
  replaceChildren(...nodes) { [...this.children].forEach(child => child.remove());this.append(...nodes); }
  remove() {
    if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(child => child !== this);
    this.parentNode = null;
  }
  get nextSibling() { return this.parentNode?.children[this.parentNode.children.indexOf(this) + 1] || null; }
  get isConnected() { return this.ownerDocument?.body?.contains(this) || false; }
  contains(node) { return this === node || this.children.some(child => child.contains(node)); }
  matches(selector) {
    const part = selector.trim().replace(/^:scope\s*>\s*/, "");
    const tag = part.match(/^[a-z][\w-]*/i)?.[0];
    if (tag && this.tagName !== tag) return false;
    const id = part.match(/#([\w-]+)/)?.[1];
    if (id && this.id !== id) return false;
    for (const [, name] of part.matchAll(/\.([\w-]+)/g)) if (!this.classList.contains(name)) return false;
    for (const [, key, value] of part.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)) {
      if (!this.hasAttribute(key) || (value !== undefined && this.getAttribute(key) !== value)) return false;
    }
    return Boolean(tag || id || /[.[]/.test(part));
  }
  querySelectorAll(selector) {
    const results = [];
    const visit = node => node.children.forEach(child => {
      if (selector.split(",").some(part => child.matches(part))) results.push(child);
      visit(child);
    });
    visit(this);return results;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  closest(selector) {
    for (let node = this; node; node = node.parentNode) if (selector.split(",").some(part => node.matches(part))) return node;
    return null;
  }
  getBoundingClientRect() { return { left: 0, top: 0, right: this.clientWidth, bottom: 720, width: this.clientWidth, height: 720 }; }
  focus(options) { this.ownerDocument.activeElement = this;this.focusOptions = options; }
  click() { if (!this.disabled) { this.focus({ preventScroll: true });this.emit("click"); } }
  setPointerCapture(id) { this.captures.add(id); }
  releasePointerCapture(id) { this.captures.delete(id); }
  hasPointerCapture(id) { return this.captures.has(id); }
  showModal() { this.open = true;this.setAttribute("open", ""); }
  close() { this.open = false;this.removeAttribute("open");this.emit("close", { bubbles: false }); }
  cancel() { const event = this.emit("cancel", { bubbles: false });if (!event.defaultPrevented) this.close(); }
}

function fixture(t, { width = 1440, viewport = width, remembered, brokenStorage = false } = {}) {
  const doc = new FixtureNode("document");doc.ownerDocument = doc;doc.mutations = new Set();
  doc.createElement = tag => new FixtureNode(tag, doc);
  doc.getElementById = id => doc.querySelector(`#${id}`);
  doc.createElementNS = (_namespace, tag) => doc.createElement(tag);
  doc.createComment = text => Object.assign(doc.createElement("comment"), { textContent: text });
  doc.body = doc.createElement("body");doc.append(doc.body);doc.documentElement = doc.createElement("html");
  const frames = new Map(), media = [], resizeObservers = [], mutationObservers = [];
  let frameId = 0;
  const win = new FixtureNode("window", doc);
  Object.assign(win, { innerWidth: viewport, innerHeight: 900,
    Event: class {
      constructor(type, properties) { this.type = type;this.defaultPrevented = false;Object.assign(this, properties); }
      preventDefault() { this.defaultPrevented = true; }
      stopPropagation() { this.stopped = true; }
    },
    requestAnimationFrame(callback) { frames.set(++frameId, callback);return frameId; },
    cancelAnimationFrame(id) { frames.delete(id); },
    matchMedia(query) {
      const result = new FixtureNode("media", doc);
      Object.assign(result, { media: query, matches: win.innerWidth <= 900,
        addListener(callback) { this.addEventListener("change", callback); },
        removeListener(callback) { this.removeEventListener("change", callback); } });
      media.push(result);return result;
    },
  });
  doc.defaultView = win;
  class ResizeObserver {
    constructor(callback) { this.callback = callback;this.targets = new Set();resizeObservers.push(this); }
    observe(target) { this.targets.add(target); }
    disconnect() { this.targets.clear(); }
  }
  class MutationObserver {
    constructor(callback) { this.callback = callback;this.targets = new Set();mutationObservers.push(this); }
    observe(target) { this.targets.add(target); }
    disconnect() { this.targets.clear(); }
  }
  Object.assign(win, { ResizeObserver, MutationObserver });
  const writes = [], values = new Map(remembered === undefined ? [] : [[STORAGE_KEY,
    typeof remembered === "string" ? remembered : JSON.stringify(remembered)]]);
  const storage = { getItem(key) { if (brokenStorage) throw new Error("存储不可用");return values.get(key) ?? null; },
    setItem(key, value) { if (brokenStorage) throw new Error("存储不可用");writes.push({ key, value });values.set(key, value); } };
  win.localStorage = storage;
  const node = (tag, id, className = "") => {
    const element = doc.createElement(tag);element.setAttribute("id", id);element.className = className;return element;
  };
  const root = node("main", "workspace", "workspace");
  root.clientWidth = viewport > 900 ? width - 144 : width;
  const panel = node("aside", "configurationPanel", "control-panel workspace-configuration-panel");
  const header = node("header", "panelHeader", "workspace-panel-header");
  const featureField = node("label", "featureField", "workspace-panel-feature-field");
  const select = node("select", "workspaceFeatureSelect");
  const closeButton = node("button", "workspacePanelClose", "workspace-panel-close");
  featureField.append(select);header.append(featureField, closeButton);
  const nav = node("nav", "featureModeList", "feature-directory");
  const buttons = ["whiteModel", "imageOutpaint", "imageMultiAngle"].map((key, index) => {
    const button = doc.createElement("button");button.setAttribute("data-feature-mode", key);
    button.setAttribute("aria-checked", String(index === 0));button.textContent = ["白模渲染", "AI扩图", "多角度"][index];
    nav.append(button);return button;
  });
  const content = node("div", "controls", "control-panel-scroll");
  const input = node("input", "promptInput");input.value = "保留中的提示词";content.append(input);
  const actions = node("section", "actions", "action-section");
  const start = node("button", "generateButton");start.textContent = "START";actions.append(start);
  panel.append(header, content, actions);
  const sidebar = node("aside", "productSidebar", "product-sidebar");
  sidebar.append(nav);doc.body.append(sidebar);
  const resizer = node("div", "workspacePanelResize", "workspace-panel-resize");
  const launcher = node("button", "workspacePanelOpen", "workspace-panel-launcher");
  launcher.textContent = "参数配置";
  const result = node("section", "result", "result-panel");
  root.append(panel, resizer, launcher, result);doc.body.append(root);
  const workspaceTitle = node("span", "workspaceCurrentFeature");doc.body.append(workspaceTitle);
  const dialog = node("dialog", "workspacePanelDialog", "workspace-panel-dialog");dialog.open = false;doc.body.append(dialog);
  const flush = () => {
    const mutations = [...doc.mutations];doc.mutations.clear();
    if (mutations.length) for (const observer of mutationObservers) {
      if (mutations.some(item => [...observer.targets].some(target => target.contains(item)))) observer.callback(mutations.map(target => ({ target })));
    }
    while (frames.size) { const pending = [...frames.values()];frames.clear();pending.forEach(callback => callback()); }
  };
  const controller = bindWorkspacePanel({ root, storage });
  t.after(() => controller.destroy());
  flush();
  return { controller, root, panel, header, nav, select, buttons, content, input, actions, start, resizer, launcher, closeButton, featureField,
    workspaceTitle, sidebar, dialog, result, doc, win, storage, writes, flush,
    remembered: () => JSON.parse(values.get(STORAGE_KEY) || "null"),
    resize(nextWidth, nextViewport = nextWidth) {
      root.clientWidth = nextViewport > 900 ? nextWidth - 144 : nextWidth;
      win.innerWidth = nextViewport;
      for (const query of media) {
        const matches = nextViewport <= 900;
        if (query.matches !== matches) { query.matches = matches;query.emit("change", { matches }); }
      }
      win.emit("resize");
      for (const observer of resizeObservers) if (observer.targets.size) observer.callback([...observer.targets].map(target => ({ target })));
      flush();
    },
  };
}

test("面板偏好校验范围，并将旧紧凑/折叠及不可读中间宽度迁移为固定目录布局", () => {
  for (const value of [null, undefined, "bad json", [], 42]) {
    assert.deepEqual(normalizeWorkspacePanelState(value), { width: null, parameterWidth: null });
  }
  for (const width of [null, undefined, "560", NaN, Infinity, 0, -1]) {
    assert.deepEqual(normalizeWorkspacePanelState({ width, parameterWidth: "360" }), { width: null, parameterWidth: null });
  }
  assert.deepEqual(normalizeWorkspacePanelState({ width: 500, parameterWidth: 360 }), { width: 500, parameterWidth: 360 });
  assert.deepEqual(normalizeWorkspacePanelState({ width: 1, parameterWidth: 100 }), { width: 144, parameterWidth: 304 });
  assert.deepEqual(normalizeWorkspacePanelState({ width: 999, parameterWidth: 999 }), { width: 620, parameterWidth: 476 });
  for (const [width, expected] of [[80, 144], [200, 144], [255, 144], [256, 368], [304, 368], [320, 368], [367, 368], [368, 368]]) {
    assert.deepEqual(normalizeWorkspacePanelState({ width, parameterWidth: 360 }), { width: expected, parameterWidth: 360 });
  }
  assert.deepEqual(normalizeWorkspacePanelState({ expandedWidth: 560, collapsed: false }), { width: 560, parameterWidth: 416 });
  assert.deepEqual(normalizeWorkspacePanelState({ expandedWidth: 560, navigationCollapsed: true }), { width: 560, parameterWidth: 416 });
  assert.deepEqual(normalizeWorkspacePanelState({ expandedWidth: 560, navCollapsed: true }), { width: 560, parameterWidth: 416 });
  assert.deepEqual(normalizeWorkspacePanelState({ expandedWidth: 560, collapsed: true }), { width: 144, parameterWidth: 416 });
  assert.deepEqual(normalizeWorkspacePanelState({ width: 144, parameterWidth: 360, lastExpandedWidth: 411 }), {
    width: 144, parameterWidth: 360, lastExpandedWidth: 411,
  });
});

test("旧宽度以144px为参数收空状态，展开上限为结果区留足空间", () => {
  assert.deepEqual(workspacePanelBounds(1600), { min: 144, max: 620, defaultWidth: 490 });
  assert.deepEqual(workspacePanelBounds(1100), { min: 144, max: 620, defaultWidth: 448 });
  assert.deepEqual(workspacePanelBounds(960, 1440), { min: 144, max: 584, defaultWidth: 475 });
  assert.deepEqual(workspacePanelBounds(600, 600), { min: 144, max: 448, defaultWidth: 448 });
});

test("从旧宽度换算可见参数宽度，展开基准只在向右扩大时增长", () => {
  for (const [width, parameterWidth, expected] of [
    [504, 360, { navigationWidth: 144, parameterBasis: 360, parameterWidth: 360, parameterVisible: 360, parameterProgress: 1, stage: 0 }],
    [480, 360, { navigationWidth: 144, parameterBasis: 360, parameterWidth: 336, parameterVisible: 336, parameterProgress: 1, stage: 0 }],
    [440, 360, { navigationWidth: 144, parameterBasis: 360, parameterWidth: 296, parameterVisible: 296, parameterProgress: 1, stage: 0 }],
    [368, 360, { navigationWidth: 144, parameterBasis: 360, parameterWidth: 224, parameterVisible: 224, parameterProgress: 1, stage: 0 }],
    [320, 360, { navigationWidth: 144, parameterBasis: 360, parameterWidth: 224, parameterVisible: 176, parameterProgress: 176 / 224, stage: 2 }],
    [300, 360, { navigationWidth: 144, parameterBasis: 360, parameterWidth: 224, parameterVisible: 156, parameterProgress: 156 / 224, stage: 2 }],
    [144, 360, { navigationWidth: 144, parameterBasis: 360, parameterWidth: 224, parameterVisible: 0, parameterProgress: 0, stage: 2 }],
    [620, 360, { navigationWidth: 144, parameterBasis: 476, parameterWidth: 476, parameterVisible: 476, parameterProgress: 1, stage: 0 }],
  ]) {
    const actual = workspacePanelGeometry(width, parameterWidth);
    for (const [key, value] of Object.entries(expected)) assert.equal(actual[key], value, `${width}px 的 ${key}`);
    assert.equal(actual.collapsed, width === 144);
    assert.equal(actual.navigationCollapsed, false);
    assert.equal(actual.parametersClipping, expected.parameterVisible < expected.parameterWidth);
  }
  assert.equal(workspacePanelGeometry(488, 360).navigationCollapsed, false);
  assert.equal(workspacePanelGeometry(487, 360).navigationCollapsed, false);
});

test("368px及以上松手保留任意中间宽度，不可读参数尾段按256px门槛吸附", () => {
  for (const [width, expected] of [[620, 620], [443, 443], [411, 411], [368, 368], [367, 368], [320, 368], [260, 368], [256, 368], [255, 144], [144, 144], [80, 144]]) {
    assert.equal(snapWorkspacePanelWidth(width, 360), expected, `${width}px 吸附到 ${expected}px`);
  }
});

function beginDrag(ui, x = ui.controller.state().width, pointerId = 1) {
  ui.resizer.emit("pointerdown", { button: 0, isPrimary: true, pointerId, clientX: x, clientY: 250 });
}
function moveDrag(ui, x, { flush = true, pointerId = 1 } = {}) {
  ui.resizer.emit("pointermove", { pointerId, clientX: x, clientY: 250 });
  if (flush) ui.flush();
}
function endDrag(ui, pointerId = 1) { ui.resizer.emit("pointerup", { pointerId }); }

function tapSeparator(ui, pointerType, jitter) {
  const pointer = { button: 0, isPrimary: true, pointerId: 1, pointerType, clientX: ui.controller.state().width, clientY: 250 };
  ui.resizer.emit("pointerdown", pointer);
  ui.resizer.emit("pointerup", { ...pointer, clientX: pointer.clientX + jitter, clientY: pointer.clientY + jitter });
  ui.resizer.emit("click", { ...pointer, detail: 1 });
}

test("分隔线区分拖动和单击，点击及触摸都只收展一次并保留焦点", t => {
  const ui = fixture(t, { remembered: { width: 504, parameterWidth: 360 } });
  beginDrag(ui);
  moveDrag(ui, 411);
  endDrag(ui);
  ui.resizer.emit("click", { pointerId: 1, pointerType: "mouse", detail: 1 });
  assert.equal(ui.controller.state().width, 411);
  assert.equal(ui.writes.length, 1);
  assert.equal(ui.resizer.getAttribute("aria-valuenow"), "267");

  tapSeparator(ui, "mouse", 1);
  assert.equal(ui.controller.state().width, 144);
  assert.equal(ui.resizer.getAttribute("aria-valuenow"), "0");
  assert.equal(ui.doc.activeElement, ui.resizer);
  assert.equal(ui.content.inert, true);
  assert.equal(ui.writes.length, 2);

  tapSeparator(ui, "touch", 7);
  assert.equal(ui.controller.state().width, 411);
  assert.equal(ui.resizer.getAttribute("aria-valuenow"), "267");
  assert.equal(ui.doc.activeElement, ui.resizer);
  assert.equal(ui.content.inert, false);
  assert.equal(ui.writes.length, 3);

  const swipe = { button: 0, isPrimary: true, pointerId: 1, pointerType: "touch", clientX: 411, clientY: 250 };
  ui.resizer.emit("pointerdown", swipe);
  ui.resizer.emit("pointermove", { ...swipe, clientY: 270 });
  ui.resizer.emit("pointerup", { ...swipe, clientX: 426, clientY: 270 });
  ui.resizer.emit("click", { ...swipe, detail: 1 });
  assert.equal(ui.controller.state().width, 411);
  assert.equal(ui.writes.length, 3);

  beginDrag(ui);
  moveDrag(ui, 413);
  endDrag(ui);
  assert.equal(ui.controller.state().width, 413);
  assert.equal(ui.writes.length, 4);

  ui.resize(900);
  assert.equal(ui.doc.activeElement, ui.launcher);
  assert.equal(ui.resizer.hidden, true);
  assert.equal(ui.resizer.inert, true);
  assert.equal(ui.resizer.emit("keydown", { key: "Enter" }).defaultPrevented, false);
});

test("Enter 收展参数配置，重新加载后默认展开并恢复最后一次可读的窄宽度", t => {
  const ui = fixture(t, { remembered: { width: 411, parameterWidth: 360 } });
  ui.resizer.focus();
  ui.resizer.emit("keydown", { key: "Enter", isComposing: true });
  ui.resizer.emit("keydown", { key: "Enter", keyCode: 229 });
  assert.equal(ui.controller.state().width, 411);
  assert.equal(ui.resizer.emit("keydown", { key: "Enter" }).defaultPrevented, true);
  assert.equal(ui.controller.state().width, 144);
  assert.equal(ui.doc.activeElement, ui.resizer);
  ui.resizer.emit("keydown", { key: "Enter", repeat: true });
  assert.equal(ui.controller.state().width, 144);
  assert.deepEqual(ui.remembered(), { width: 411, parameterWidth: 360 });

  const reloaded = fixture(t, { remembered: ui.remembered() });
  assert.equal(reloaded.controller.state().width, 411);
  assert.equal(reloaded.content.inert, false);
  reloaded.resizer.focus();
  assert.equal(reloaded.resizer.emit("keydown", { key: "Enter" }).defaultPrevented, true);
  assert.equal(reloaded.controller.state().width, 144);
  reloaded.resizer.emit("keydown", { key: "Enter" });
  assert.equal(reloaded.controller.state().width, 411);
  assert.equal(reloaded.resizer.getAttribute("aria-valuenow"), "267");
  assert.equal(reloaded.doc.activeElement, reloaded.resizer);
  reloaded.resizer.emit("click", { detail: 0 });
  assert.equal(reloaded.controller.state().width, 144);
});

for (const options of [{}, { remembered: "not json" }, { remembered: "null" }, { brokenStorage: true }]) {
  test(`损坏或不可用配置安全使用默认布局：${JSON.stringify(options)}`, t => {
    const ui = fixture(t, options);
    assert.equal(ui.controller.state().width, 475);
    assert.equal(ui.controller.state().navigationWidth, 144);
    assert.equal(ui.controller.state().parameterWidth, 331);
    assert.equal(ui.controller.state().stage, 0);
    assert.equal(ui.panel.parentNode, ui.root);
    assert.equal(ui.dialog.open, false);
    assert.equal(ui.input.value, "保留中的提示词");
    assert.doesNotThrow(() => ui.controller.setWidth(560));
  });
}

test("拖动只伸缩参数，可读宽度可交互，收空时独立目录可用", t => {
  const ui = fixture(t, { remembered: { width: 504, parameterWidth: 360 } });
  let starts = 0;ui.start.addEventListener("click", () => { starts += 1; });
  const names = ui.buttons.map(button => button.textContent);
  beginDrag(ui);
  assert.equal(ui.resizer.hasPointerCapture(1), true);
  assert.equal(ui.doc.activeElement, ui.resizer);
  for (const [width, navigationWidth, parameterWidth, parameterVisible, stage] of [
    [480, 144, 336, 336, 0], [440, 144, 296, 296, 0], [368, 144, 224, 224, 0],
    [144, 144, 224, 0, 2], [368, 144, 224, 224, 0], [440, 144, 296, 296, 0], [504, 144, 360, 360, 0],
  ]) {
    moveDrag(ui, width);
    const state = ui.controller.state();
    assert.equal(state.width, width);
    assert.equal(state.navigationWidth, navigationWidth);
    assert.equal(state.parameterBasis, 360, "展开基准不随收窄而丢失");
    assert.equal(state.parameterWidth, parameterWidth, "参数内容采用当前可用宽度重排");
    assert.equal(state.parameterVisible, parameterVisible);
    assert.equal(state.stage, stage);
    assert.equal(state.navigationCollapsed, false);
    assert.equal(ui.content.inert, width < 368);
    assert.equal(ui.nav.inert, false);assert.equal(ui.actions.inert, width < 368);
    assert.equal(ui.resizer.inert, false);assert.equal(ui.resizer.hidden, false);
    assert.equal(ui.resizer.tabIndex, 0, "参数收空后仍可继续拖回");
    assert.deepEqual(ui.buttons.map(button => button.textContent), names);
    assert.equal(ui.panel.querySelector("#promptInput"), ui.input);
    if (width >= 368) ui.start.click();assert.equal(ui.writes.length, 0);
  }
  endDrag(ui);
  assert.equal(starts, 6);
  assert.equal(ui.writes.length, 1);
  assert.deepEqual(ui.remembered(), { width: 504, parameterWidth: 360 });
  assert.equal(ui.resizer.hasPointerCapture(1), false);
  assert.equal(ui.input.value, "保留中的提示词");
});

test("连续拖动先合帧，松手应用最后位置并只保存一次吸附结果", t => {
  const ui = fixture(t, { remembered: { width: 504, parameterWidth: 360 } });
  ui.resizer.emit("pointerdown", { button: 2, pointerId: 9, clientX: 504 });
  assert.equal(ui.resizer.hasPointerCapture(9), false);
  beginDrag(ui);
  moveDrag(ui, 80, { pointerId: 2 });assert.equal(ui.controller.state().width, 504);
  moveDrag(ui, 470, { flush: false });moveDrag(ui, 450, { flush: false });
  assert.equal(ui.controller.state().width, 504);
  ui.flush();assert.equal(ui.controller.state().width, 450);
  ui.resizer.emit("pointerup", { pointerId: 1, clientX: 180 });
  assert.equal(ui.controller.state().width, 144);
  assert.equal(ui.controller.state().collapsed, true);
  assert.equal(ui.writes.length, 1);
  assert.deepEqual(ui.remembered(), { width: 504, parameterWidth: 360 });
});

test("旧收起记录仍以原可读宽度展开，收起后可以从分隔线拖回最小可用宽度", t => {
  const previous = fixture(t, { remembered: { width: 144, parameterWidth: 360, lastExpandedWidth: 411 } });
  assert.equal(previous.controller.state().width, 411);
  const ui = fixture(t, { remembered: { width: 80, parameterWidth: 360 } });
  assert.equal(ui.controller.state().width, 504);
  assert.equal(ui.resizer.hidden, false);assert.equal(ui.resizer.inert, false);
  tapSeparator(ui);
  assert.equal(ui.controller.state().width, 144);assert.equal(ui.controller.state().navigationWidth, 144);
  beginDrag(ui);moveDrag(ui, 260);endDrag(ui);
  assert.equal(ui.controller.state().width, 368);
  assert.equal(ui.controller.state().parameterWidth, 224);
  assert.equal(ui.controller.state().parameterBasis, 360);
  assert.equal(ui.content.inert, false);
  assert.deepEqual(ui.remembered(), { width: 368, parameterWidth: 360 });
});

test("443/411/395/384/368px均能停留和持久保存，完整目录与参数START继续可交互", t => {
  const ui = fixture(t, { remembered: { width: 475, parameterWidth: 331 } });
  let changes = 0, starts = 0;
  ui.input.addEventListener("input", () => { changes += 1; });
  ui.start.addEventListener("click", () => { starts += 1; });
  for (const [index, width] of [443, 411, 395, 384, 368].entries()) {
    beginDrag(ui);moveDrag(ui, width);endDrag(ui);
    const state = ui.controller.state();
    assert.equal(state.width, width, "松手不能强制跳到固定展开或紧凑档");
    assert.equal(state.parameterBasis, 331);
    assert.equal(state.navigationWidth, 144);
    assert.equal(state.parameterWidth, width - 144);
    assert.equal(state.parameterProgress, 1);
    assert.equal(state.parametersClipping, false);
    assert.equal(ui.content.inert, false);assert.equal(ui.actions.inert, false);
    assert.deepEqual(ui.remembered(), { width, parameterWidth: 331 });
    ui.input.value = `中间宽度 ${width}`;ui.input.emit("input");ui.start.click();
    assert.equal(ui.writes.length, index + 1, "每个手势只在松手保存一次");
  }
  assert.equal(changes, 5);assert.equal(starts, 5);
  assert.equal(ui.panel.querySelector("#promptInput"), ui.input);
});

test("向右扩大后的参数基准保持峰值，反向中间宽度让参数重排并保留展开基准", t => {
  const ui = fixture(t, { remembered: { width: 504, parameterWidth: 360 } });
  beginDrag(ui);moveDrag(ui, 620);
  assert.equal(ui.controller.state().parameterBasis, 476);
  moveDrag(ui, 600);
  assert.equal(ui.controller.state().parameterBasis, 476);
  assert.equal(ui.controller.state().navigationWidth, 144);
  moveDrag(ui, 550);
  assert.equal(ui.controller.state().parameterBasis, 476);
  assert.equal(ui.controller.state().parameterWidth, 406);
  assert.equal(ui.controller.state().parameterVisible, 406);
  endDrag(ui);
  assert.equal(ui.controller.state().width, 550);
  assert.deepEqual(ui.remembered(), { width: 550, parameterWidth: 476 });
  assert.equal(ui.writes.length, 1);
});

for (const cancellation of ["pointercancel", "lostpointercapture", "Escape", "blur"]) {
  test(`拖动由${cancellation}取消时恢复原几何与偏好，不保存预览`, t => {
    const ui = fixture(t, { remembered: { width: 504, parameterWidth: 360 } });
    beginDrag(ui);moveDrag(ui, 300);
    assert.equal(ui.controller.state().width, 300);
    if (cancellation === "Escape") ui.resizer.emit("keydown", { key: "Escape" });
    else if (cancellation === "blur") ui.win.emit("blur");
    else ui.resizer.emit(cancellation, { pointerId: 1 });
    assert.equal(ui.controller.state().width, 504);
    assert.equal(ui.controller.state().parameterWidth, 360);
    assert.equal(ui.writes.length, 0);
    assert.equal(ui.resizer.hasPointerCapture(1), false);
  });
}

test("键盘小步只调整参数宽度，离开分隔条保存中间宽度，Escape撤销预览", t => {
  const ui = fixture(t, { remembered: { width: 504, parameterWidth: 360 } });
  ui.resizer.emit("keydown", { key: "ArrowLeft" });
  assert.equal(ui.controller.state().width, 496);
  ui.resizer.emit("keydown", { key: "ArrowLeft", shiftKey: true });
  assert.equal(ui.controller.state().width, 464);
  assert.equal(ui.writes.length, 0);
  ui.resizer.emit("blur");
  assert.equal(ui.controller.state().width, 464);
  assert.deepEqual(ui.remembered(), { width: 464, parameterWidth: 360 });
  ui.resizer.emit("keydown", { key: "ArrowLeft", shiftKey: true });
  assert.equal(ui.controller.state().width, 432);
  ui.resizer.emit("keydown", { key: "Escape" });ui.resizer.emit("blur");
  assert.equal(ui.controller.state().width, 464);
  assert.equal(ui.writes.length, 1);
  ui.resizer.emit("keydown", { key: "Home" });
  assert.equal(ui.controller.state().width, 144);
  assert.equal(ui.controller.state().navigationWidth, 144);
  for (let index = 0; index < 45; index += 1) ui.resizer.emit("keydown", { key: "ArrowRight" });
  assert.equal(ui.controller.state().width, 504, "8px步进不能被每次吸附锁在仅目录状态");
  assert.equal(ui.writes.length, 2);
  ui.resizer.emit("blur");
  assert.equal(ui.writes.length, 3);
  ui.resizer.emit("keydown", { key: "End" });
  assert.equal(ui.controller.state().width, 620);
  assert.equal(ui.resizer.getAttribute("aria-valuemin"), "0");
  assert.equal(ui.resizer.getAttribute("aria-valuemax"), "476");
  assert.equal(ui.resizer.getAttribute("aria-valuenow"), "476");
  assert.deepEqual(ui.remembered(), { width: 620, parameterWidth: 476 });
  assert.equal(ui.writes.length, 4);
  assert.equal(ui.resizer.emit("keydown", { key: "Tab" }).defaultPrevented, false);
  ui.resizer.emit("blur");assert.equal(ui.writes.length, 4);
});

test("窗口临时变窄夹紧整体和参数可用宽度，恢复空间后还原已保存偏好", t => {
  const ui = fixture(t, { remembered: { width: 620, parameterWidth: 476 } });
  ui.resize(800, 1200);
  assert.equal(ui.controller.state().width, 448);
  assert.equal(ui.controller.state().parameterWidth, 304);
  assert.deepEqual(ui.remembered(), { width: 620, parameterWidth: 476 });
  assert.equal(ui.writes.length, 0);
  ui.resize(1440);
  assert.equal(ui.controller.state().width, 620);
  assert.equal(ui.controller.state().parameterWidth, 476);
  assert.equal(ui.writes.length, 0);
});

test("参数收空后目录留在独立侧栏，并保留功能名称与标签", t => {
  const ui = fixture(t, { remembered: { width: 80, parameterWidth: 360 } });
  tapSeparator(ui);
  assert.equal(ui.controller.state().navigationWidth, 144);
  assert.equal(ui.controller.state().parameterVisible, 0);
  assert.equal(ui.root.style.getPropertyValue("--workspace-parameter-visible-width"), "0px");
  assert.equal(ui.nav.parentNode, ui.sidebar);
  for (const [index, button] of ui.buttons.entries()) {
    const label = ["白模渲染", "AI扩图", "多角度"][index];
    assert.equal(button.textContent, label);assert.equal(button.title, label);
    assert.equal(button.getAttribute("aria-label"), label);
  }
});

test("移动抽屉保留同一配置节点，旧功能按钮事件与START可用，Escape归还焦点", t => {
  const ui = fixture(t, { width: 390, remembered: { width: 80, parameterWidth: 360 } });
  let clicks = 0;
  ui.buttons[1].addEventListener("click", () => {
    clicks += 1;ui.buttons.forEach(button => button.setAttribute("aria-checked", String(button === ui.buttons[1])));
  });
  ui.launcher.click();ui.flush();
  assert.equal(ui.controller.state().mobile, true);assert.equal(ui.controller.state().drawerOpen, true);
  assert.equal(ui.root.style.getPropertyValue("--workspace-parameter-visible-width"), "304px");
  assert.equal(ui.root.classList.contains("is-parameters-clipping"), false);assert.equal(ui.content.inert, false);
  assert.equal(ui.dialog.open, true);assert.equal(ui.panel.parentNode, ui.dialog);
  assert.equal(ui.panel.querySelector("#promptInput"), ui.input);
  ui.select.value = "imageOutpaint";ui.select.emit("change");ui.flush();
  assert.equal(clicks, 1);
  assert.equal(ui.launcher.textContent, "参数配置");
  assert.equal(ui.launcher.getAttribute("aria-label"), "打开参数配置 · AI扩图");
  assert.equal(ui.workspaceTitle.textContent, "AI扩图");
  ui.dialog.cancel();ui.flush();
  assert.equal(ui.controller.state().drawerOpen, false);assert.equal(ui.dialog.open, false);
  assert.equal(ui.doc.activeElement, ui.launcher);
  assert.equal(ui.input.value, "保留中的提示词");assert.equal(ui.actions.inert, false);
  assert.equal(ui.writes.length, 0);
  ui.controller.open();ui.closeButton.click();
  assert.equal(ui.dialog.open, false);assert.equal(ui.doc.activeElement, ui.launcher);
});

test("移动参数抽屉只响应遮罩上的完整点击，选中文字拖到边外时保持打开", t => {
  const ui = fixture(t, { width: 390 });
  ui.dialog.getBoundingClientRect = () => ({ left: 12, right: 348, top: 12, bottom: 888 });
  const backdrop = { target: ui.dialog, button: 0, clientX: 4, clientY: 250 };
  ui.launcher.click();
  ui.dialog.emit("pointerdown", { target: ui.input, button: 0 });
  ui.dialog.emit("click", backdrop);
  assert.equal(ui.dialog.open, true);

  ui.dialog.emit("pointerdown", backdrop);
  ui.dialog.emit("pointercancel");
  ui.dialog.emit("click", backdrop);
  assert.equal(ui.dialog.open, true);

  const select = ui.doc.createElement("button");
  select.classList.add("model-picker-trigger");
  select.setAttribute("aria-expanded", "true");
  ui.content.append(select);
  ui.dialog.emit("pointerdown", backdrop);
  select.setAttribute("aria-expanded", "false");
  ui.dialog.emit("click", backdrop);
  assert.equal(ui.dialog.open, true);

  ui.dialog.emit("pointerdown", backdrop);
  ui.dialog.emit("click", backdrop);
  assert.equal(ui.dialog.open, false);
  assert.equal(ui.doc.activeElement, ui.launcher);
});

test("900px抽屉回到901px桌面时保留原节点与独立目录，分隔条仍可拖回", t => {
  const ui = fixture(t, { remembered: { width: 80, parameterWidth: 360 } });
  tapSeparator(ui);
  ui.resize(900);ui.controller.open();ui.flush();
  assert.equal(ui.controller.state().mobile, true);
  assert.equal(ui.root.style.getPropertyValue("--workspace-parameter-visible-width"), "304px");
  assert.equal(ui.nav.parentNode, ui.sidebar);
  assert.equal(ui.panel.parentNode, ui.dialog);assert.equal(ui.content.inert, false);
  ui.resize(901);
  assert.equal(ui.controller.state().mobile, false);assert.equal(ui.controller.state().drawerOpen, false);
  assert.equal(ui.controller.state().width, 144);assert.equal(ui.controller.state().navigationWidth, 144);
  assert.equal(ui.dialog.open, false);
  assert.equal(ui.panel.parentNode, ui.root);
  assert.equal(ui.root.children.indexOf(ui.panel) < ui.root.children.indexOf(ui.resizer), true);
  assert.equal(ui.panel.querySelector("#promptInput"), ui.input);
  ui.resize(1440);beginDrag(ui);moveDrag(ui, 504);endDrag(ui);
  assert.equal(ui.controller.state().width, 504);assert.equal(ui.content.inert, false);
});

test("开始拖动或进入移动布局时关闭本面板外置菜单，焦点归还可见入口", t => {
  const ui = fixture(t);
  const trigger = ui.doc.createElement("button");trigger.setAttribute("aria-controls", "held-menu");ui.content.append(trigger);
  const menu = ui.doc.createElement("div");menu.setAttribute("id", "held-menu");menu.setAttribute("popover", "manual");
  const option = ui.doc.createElement("button");menu.append(option);ui.doc.body.append(menu);
  let closes = 0;menu.hidePopover = () => { closes += 1; };
  option.focus();beginDrag(ui);
  assert.equal(closes, 1);assert.equal(ui.doc.activeElement, ui.resizer);
  ui.resizer.emit("pointercancel", { pointerId: 1 });
  option.focus();ui.resize(390);
  assert.equal(closes, 2);assert.equal(ui.doc.activeElement, ui.launcher);
  assert.equal(ui.dialog.open, false);
});

test("销毁取消监听与观察并归还原面板，后续事件不能重开抽屉或保存", t => {
  const ui = fixture(t, { width: 390 });
  ui.controller.open();ui.flush();ui.controller.destroy();
  assert.equal(ui.panel.parentNode, ui.root);assert.equal(ui.dialog.open, false);
  ui.launcher.click();ui.resizer.emit("keydown", { key: "ArrowRight" });ui.resize(1440);
  assert.equal(ui.root.style.getPropertyValue("--workspace-parameter-visible-width"), "");
  assert.equal(ui.root.classList.contains("workspace-panel-layout"), false);
  assert.equal(ui.dialog.open, false);assert.equal(ui.writes.length, 0);
  assert.ok([...ui.win.listeners.values()].every(listeners => listeners.size === 0));
});

/**
 * [INPUT]: 依赖 node:test/assert、工作台配置面板控制器与内存 DOM/存储/尺寸及媒体查询替身
 * [OUTPUT]: 验证单手势连续缩目录再让参数重排、中间宽度可停留、参数展开基准保留、80px仅目录/正常宽度 START 可用、尾段吸附/持久化/旧偏好迁移/视口夹紧与移动抽屉原节点及焦点保留
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
  const root = node("main", "workspace", "workspace");root.clientWidth = width;
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
  panel.append(header, nav, content, actions);
  const resizer = node("div", "workspacePanelResize", "workspace-panel-resize");
  const launcher = node("button", "workspacePanelOpen", "workspace-panel-launcher");
  const activeFeature = doc.createElement("span");activeFeature.setAttribute("data-active-feature", "");launcher.append(activeFeature);
  const result = node("section", "result", "result-panel");
  root.append(panel, resizer, launcher, result);doc.body.append(root);
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
    activeFeature, dialog, result, doc, win, storage, writes, flush,
    remembered: () => JSON.parse(values.get(STORAGE_KEY) || "null"),
    resize(nextWidth, nextViewport = nextWidth) {
      root.clientWidth = nextWidth;win.innerWidth = nextViewport;
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

test("新面板偏好校验数值与范围，并迁移旧展开/紧凑/折叠状态", () => {
  for (const value of [null, undefined, "bad json", [], 42]) {
    assert.deepEqual(normalizeWorkspacePanelState(value), { width: null, parameterWidth: null });
  }
  for (const width of [null, undefined, "560", NaN, Infinity, 0, -1]) {
    assert.deepEqual(normalizeWorkspacePanelState({ width, parameterWidth: "360" }), { width: null, parameterWidth: null });
  }
  assert.deepEqual(normalizeWorkspacePanelState({ width: 500, parameterWidth: 360 }), { width: 500, parameterWidth: 360 });
  assert.deepEqual(normalizeWorkspacePanelState({ width: 1, parameterWidth: 100 }), { width: 80, parameterWidth: 304 });
  assert.deepEqual(normalizeWorkspacePanelState({ width: 999, parameterWidth: 999 }), { width: 620, parameterWidth: 476 });
  assert.deepEqual(normalizeWorkspacePanelState({ expandedWidth: 560, collapsed: false }), { width: 560, parameterWidth: 416 });
  assert.deepEqual(normalizeWorkspacePanelState({ expandedWidth: 560, navigationCollapsed: true }), { width: 496, parameterWidth: 416 });
  assert.deepEqual(normalizeWorkspacePanelState({ expandedWidth: 560, collapsed: true }), { width: 80, parameterWidth: 416 });
});

test("整体宽度允许拖到80px，展开上限仍为结果区保留360px与16px间隔", () => {
  assert.deepEqual(workspacePanelBounds(1600), { min: 80, max: 620, defaultWidth: 490 });
  assert.deepEqual(workspacePanelBounds(1100), { min: 80, max: 620, defaultWidth: 448 });
  assert.deepEqual(workspacePanelBounds(960, 1440), { min: 80, max: 584, defaultWidth: 475 });
  assert.deepEqual(workspacePanelBounds(600, 600), { min: 80, max: 448, defaultWidth: 448 });
});

test("几何先缩目录再让参数随容器重排，展开基准只在向右扩大时增长", () => {
  for (const [width, parameterWidth, expected] of [
    [504, 360, { navigationWidth: 144, parameterBasis: 360, parameterWidth: 360, parameterVisible: 360, parameterProgress: 1, stage: 0 }],
    [480, 360, { navigationWidth: 120, parameterBasis: 360, parameterWidth: 360, parameterVisible: 360, parameterProgress: 1, stage: 1 }],
    [440, 360, { navigationWidth: 80, parameterBasis: 360, parameterWidth: 360, parameterVisible: 360, parameterProgress: 1, stage: 1 }],
    [320, 360, { navigationWidth: 80, parameterBasis: 360, parameterWidth: 240, parameterVisible: 240, parameterProgress: 1, stage: 2 }],
    [300, 360, { navigationWidth: 80, parameterBasis: 360, parameterWidth: 224, parameterVisible: 220, parameterProgress: 220 / 224, stage: 2 }],
    [80, 360, { navigationWidth: 80, parameterBasis: 360, parameterWidth: 224, parameterVisible: 0, parameterProgress: 0, stage: 2 }],
    [620, 360, { navigationWidth: 144, parameterBasis: 476, parameterWidth: 476, parameterVisible: 476, parameterProgress: 1, stage: 0 }],
  ]) {
    const actual = workspacePanelGeometry(width, parameterWidth);
    for (const [key, value] of Object.entries(expected)) assert.equal(actual[key], value, `${width}px 的 ${key}`);
    assert.equal(actual.collapsed, width === 80);
    assert.equal(actual.parametersClipping, expected.parameterVisible < expected.parameterWidth);
  }
  assert.equal(workspacePanelGeometry(488, 360).navigationCollapsed, false);
  assert.equal(workspacePanelGeometry(487, 360).navigationCollapsed, true);
});

test("304px及以上松手保留任意中间宽度，不可用尾段才按192px门槛吸附", () => {
  for (const [width, expected] of [[620, 620], [443, 443], [411, 411], [320, 320], [304, 304], [260, 304], [192, 304], [191, 80], [80, 80]]) {
    assert.equal(snapWorkspacePanelWidth(width, 360), expected, `${width}px 吸附到 ${expected}px`);
  }
});

function beginDrag(ui, x = ui.controller.state().width, pointerId = 1) {
  ui.resizer.emit("pointerdown", { button: 0, isPrimary: true, pointerId, clientX: x });
}
function moveDrag(ui, x, { flush = true, pointerId = 1 } = {}) {
  ui.resizer.emit("pointermove", { pointerId, clientX: x });
  if (flush) ui.flush();
}
function endDrag(ui, pointerId = 1) { ui.resizer.emit("pointerup", { pointerId }); }

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

test("单次拖动连续经过两阶段并可反向恢复，正常中间宽度可交互而80px仅保留目录", t => {
  const ui = fixture(t, { remembered: { width: 504, parameterWidth: 360 } });
  let starts = 0;ui.start.addEventListener("click", () => { starts += 1; });
  const names = ui.buttons.map(button => button.textContent);
  beginDrag(ui);
  assert.equal(ui.resizer.hasPointerCapture(1), true);
  assert.equal(ui.doc.activeElement, ui.resizer);
  for (const [width, navigationWidth, parameterWidth, parameterVisible, stage] of [
    [480, 120, 360, 360, 1], [440, 80, 360, 360, 1], [320, 80, 240, 240, 2],
    [80, 80, 224, 0, 2], [320, 80, 240, 240, 2], [440, 80, 360, 360, 1], [504, 144, 360, 360, 0],
  ]) {
    moveDrag(ui, width);
    const state = ui.controller.state();
    assert.equal(state.width, width);
    assert.equal(state.navigationWidth, navigationWidth);
    assert.equal(state.parameterBasis, 360, "展开基准不随收窄而丢失");
    assert.equal(state.parameterWidth, parameterWidth, "参数内容采用当前可用宽度重排");
    assert.equal(state.parameterVisible, parameterVisible);
    assert.equal(state.stage, stage);
    assert.equal(ui.content.inert, width < 304);
    assert.equal(ui.nav.inert, false);assert.equal(ui.actions.inert, width < 304);
    assert.equal(ui.resizer.inert, false);assert.equal(ui.resizer.hidden, false);
    assert.equal(ui.resizer.tabIndex, 0, "80px状态仍可继续拖回");
    assert.deepEqual(ui.buttons.map(button => button.textContent), names);
    assert.equal(ui.panel.querySelector("#promptInput"), ui.input);
    if (width >= 304) ui.start.click();assert.equal(ui.writes.length, 0);
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
  assert.equal(ui.controller.state().width, 80);
  assert.equal(ui.controller.state().collapsed, true);
  assert.equal(ui.writes.length, 1);
  assert.deepEqual(ui.remembered(), { width: 80, parameterWidth: 360 });
});

test("从80px继续同一分隔条拖回，越过尾段门槛后恢复最小可用参数区", t => {
  const ui = fixture(t, { remembered: { width: 80, parameterWidth: 360 } });
  assert.equal(ui.resizer.hidden, false);assert.equal(ui.resizer.inert, false);
  beginDrag(ui);moveDrag(ui, 260);endDrag(ui);
  assert.equal(ui.controller.state().width, 304);
  assert.equal(ui.controller.state().parameterWidth, 224);
  assert.equal(ui.controller.state().parameterBasis, 360);
  assert.equal(ui.content.inert, false);
  assert.deepEqual(ui.remembered(), { width: 304, parameterWidth: 360 });
});

test("443/411/395/320/304px均能停留和持久保存，参数与START继续可交互", t => {
  const ui = fixture(t, { remembered: { width: 475, parameterWidth: 331 } });
  let changes = 0, starts = 0;
  ui.input.addEventListener("input", () => { changes += 1; });
  ui.start.addEventListener("click", () => { starts += 1; });
  for (const [index, width] of [443, 411, 395, 320, 304].entries()) {
    beginDrag(ui);moveDrag(ui, width);endDrag(ui);
    const state = ui.controller.state();
    assert.equal(state.width, width, "松手不能强制跳到固定展开或紧凑档");
    assert.equal(state.parameterBasis, 331);
    assert.equal(state.parameterWidth, width >= 411 ? 331 : width - 80);
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
  assert.equal(ui.controller.state().navigationWidth, 124);
  moveDrag(ui, 550);
  assert.equal(ui.controller.state().parameterBasis, 476);
  assert.equal(ui.controller.state().parameterWidth, 470);
  assert.equal(ui.controller.state().parameterVisible, 470);
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

test("键盘多次小步调整能跨两段，离开分隔条保存中间宽度，Escape撤销预览", t => {
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
  assert.equal(ui.controller.state().width, 80);
  for (let index = 0; index < 53; index += 1) ui.resizer.emit("keydown", { key: "ArrowRight" });
  assert.equal(ui.controller.state().width, 504, "8px步进不能被每次吸附锁在80px");
  assert.equal(ui.writes.length, 2);
  ui.resizer.emit("blur");
  assert.equal(ui.writes.length, 3);
  ui.resizer.emit("keydown", { key: "End" });
  assert.equal(ui.controller.state().width, 620);
  assert.equal(ui.resizer.getAttribute("aria-valuemin"), "80");
  assert.equal(ui.resizer.getAttribute("aria-valuemax"), "620");
  assert.equal(ui.resizer.getAttribute("aria-valuenow"), "620");
  ui.resizer.emit("dblclick");
  assert.deepEqual(ui.remembered(), { width: null, parameterWidth: null });
  assert.equal(ui.controller.state().width, 475);
  assert.equal(ui.writes.length, 5);
  assert.equal(ui.resizer.emit("keydown", { key: "Tab" }).defaultPrevented, false);
  ui.resizer.emit("blur");assert.equal(ui.writes.length, 5);
});

test("窗口临时变窄夹紧整体和参数可用宽度，恢复空间后还原已保存偏好", t => {
  const ui = fixture(t, { remembered: { width: 620, parameterWidth: 476 } });
  ui.resize(800, 1200);
  assert.equal(ui.controller.state().width, 448);
  assert.equal(ui.controller.state().parameterWidth, 368);
  assert.deepEqual(ui.remembered(), { width: 620, parameterWidth: 476 });
  assert.equal(ui.writes.length, 0);
  ui.resize(1440);
  assert.equal(ui.controller.state().width, 620);
  assert.equal(ui.controller.state().parameterWidth, 476);
  assert.equal(ui.writes.length, 0);
});

test("紧凑目录保留原名称/标题/无障碍文本；只提供额外短标签而不删信息", t => {
  const ui = fixture(t, { remembered: { width: 80, parameterWidth: 360 } });
  for (const [index, button] of ui.buttons.entries()) {
    const label = ["白模渲染", "AI扩图", "多角度"][index];
    assert.equal(button.textContent, label);assert.equal(button.title, label);
    assert.equal(button.getAttribute("aria-label"), label);
    assert.ok(button.dataset.compactLabel?.length > 0);
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
  assert.equal(ui.root.style.getPropertyValue("--workspace-parameter-progress"), "1");
  assert.equal(ui.root.classList.contains("is-parameters-clipping"), false);assert.equal(ui.content.inert, false);
  assert.equal(ui.dialog.open, true);assert.equal(ui.panel.parentNode, ui.dialog);
  assert.equal(ui.panel.querySelector("#promptInput"), ui.input);
  ui.select.value = "imageOutpaint";ui.select.emit("change");ui.flush();
  assert.equal(clicks, 1);assert.equal(ui.activeFeature.textContent, "AI扩图");
  ui.dialog.cancel();ui.flush();
  assert.equal(ui.controller.state().drawerOpen, false);assert.equal(ui.dialog.open, false);
  assert.equal(ui.doc.activeElement, ui.launcher);
  assert.equal(ui.input.value, "保留中的提示词");assert.equal(ui.actions.inert, false);
  assert.equal(ui.writes.length, 0);
  ui.controller.open();ui.closeButton.click();
  assert.equal(ui.dialog.open, false);assert.equal(ui.doc.activeElement, ui.launcher);
});

test("900px移动抽屉回到901px桌面时保留原面板位置和80px偏好，分隔条仍可拖回", t => {
  const ui = fixture(t, { remembered: { width: 80, parameterWidth: 360 } });
  ui.resize(900);ui.controller.open();ui.flush();
  assert.equal(ui.controller.state().mobile, true);
  assert.equal(ui.root.style.getPropertyValue("--workspace-parameter-progress"), "1");
  assert.equal(ui.root.style.getPropertyValue("--workspace-navigation-width"), "144px");
  assert.equal(ui.panel.parentNode, ui.dialog);assert.equal(ui.content.inert, false);
  ui.resize(901);
  assert.equal(ui.controller.state().mobile, false);assert.equal(ui.controller.state().drawerOpen, false);
  assert.equal(ui.controller.state().width, 80);assert.equal(ui.dialog.open, false);
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
  assert.equal(ui.root.style.getPropertyValue("--workspace-panel-width"), "");
  assert.equal(ui.root.classList.contains("workspace-panel-layout"), false);
  assert.equal(ui.dialog.open, false);assert.equal(ui.writes.length, 0);
  assert.ok([...ui.win.listeners.values()].every(listeners => listeners.size === 0));
});

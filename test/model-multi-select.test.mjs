/**
 * [INPUT]: 依赖 node:test/assert、共享搜索单选/模型多选与全选/取消纯规则及内存 DOM/Popover 替身
 * [OUTPUT]: 对外提供模型至少一项、筛选全选/取消与首选保护、风格单选占位/禁选/点击关闭、普通单选/空值/键盘导航、模态抽屉内浮层迁移及焦点/等宽定位与销毁回归保障
 * [POS]: test 的 Main/Beta 模型与设计风格共享选择测试，不调用网络、真实浏览器或模型
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  bindModelMultiSelect, bindSearchableChoice, filterModelCatalog,
  selectAvailableModels, toggleAvailableModels, toggleModelSelection,
} from "../public/model-multi-select.js";

const catalog = [
  { key: "banana2", label: "Banana 2", id: "gemini-3.1-flash-image-preview" },
  { key: "banana21", label: "Banana 2.1", id: "gemini-nano-banana-2.1" },
  { key: "gptImage2", label: "GPT Image 2", id: "gpt-image-2" },
  { key: "sunburst", label: "GPT Image 2.5 Sunburst", id: "gpt-image-2.5-sunburst" },
  { key: "flare", label: "GPT Image 2.5 Flare", id: "gpt-image-2.5-flare" },
  { key: "flux", label: "Flux2 Klein", id: "flux-2-klein" },
  { key: "seedream", label: "Seedream 5.0", id: "seedream-5" },
  { key: "seedreamPro", label: "Seedream 5.0 Pro", id: "seedream-5-pro" },
];

test("同一模型入口允许超过四项并至少保留一项", () => {
  assert.deepEqual(toggleModelSelection(["a"], "b").values, ["a", "b"]);
  assert.equal(toggleModelSelection(["a"], "a").changed, false);
  let values = ["a", "a", "b", "c", "d"];
  for (const key of ["e", "f", "g", "h"]) {
    const result = toggleModelSelection(values, key);
    assert.equal(result.changed, true);
    assert.equal(result.message, null);
    values = result.values;
  }
  assert.deepEqual(values, ["a", "b", "c", "d", "e", "f", "g", "h"]);
  assert.deepEqual(toggleModelSelection(values, "unavailable", { selectable: false }), {
    changed: false, message: "该模型当前不可选", values,
  });
});

test("再次点击已选模型会取消且保持原有顺序", () => {
  assert.deepEqual(
    toggleModelSelection(["a", "b", "c"], "b"),
    { changed: true, message: null, values: ["a", "c"] },
  );
});

// ---- 纯规则：搜索不改选择，全选保留参数首选 ----
test("模型搜索支持名称、接口 ID、模型键及多个词且不依赖大小写", () => {
  assert.deepEqual(filterModelCatalog(catalog, "  GPT 2.5 ").map((model) => model.key), ["sunburst", "flare"]);
  assert.deepEqual(filterModelCatalog(catalog, "GEMINI-NANO").map((model) => model.key), ["banana21"]);
  assert.deepEqual(filterModelCatalog(catalog, "Flux").map((model) => model.key), ["flux"]);
  assert.equal(filterModelCatalog(catalog, "unknown").length, 0);
});

test("全选超过四项保持原首选及顺序，只追加合法新模型", () => {
  const selected = selectAvailableModels(["flux", "banana21", "flux", "removed"], catalog);
  assert.deepEqual(selected, ["flux", "banana21", "banana2", "gptImage2", "sunburst", "flare", "seedream", "seedreamPro"]);
  assert.equal(selected.length, 8);
  assert.deepEqual(selectAvailableModels(selected, catalog), selected);
});

test("筛选全选只追加匹配可用项，不清除已有且保留禁选项", () => {
  const presentOption = (model) => ({ selectable: model.key !== "flare" });
  assert.deepEqual(selectAvailableModels(["flux", "flare"], catalog, { query: "GPT", presentOption }),
    ["flux", "flare", "gptImage2", "sunburst"]);
  assert.deepEqual(selectAvailableModels(["flux"], catalog, { query: "GPT", presentOption }),
    ["flux", "gptImage2", "sunburst"]);
  assert.deepEqual(selectAvailableModels(["flux"], catalog, { query: "none", presentOption }), ["flux"]);
});

test("取消全选仅移除筛选内可用项，保留筛选外和禁选已有项", () => {
  const options = { query: "GPT", presentOption: (model) => ({ selectable: model.key !== "flare" }) };
  assert.deepEqual(toggleAvailableModels(["flux", "sunburst", "flare", "banana21", "gptImage2"], catalog, options), {
    changed: true, message: null, values: ["flux", "flare", "banana21"],
  });
  assert.deepEqual(toggleAvailableModels(["flux", "sunburst", "flare"], catalog, options), {
    changed: true, message: null, values: ["flux", "sunburst", "flare", "gptImage2"],
  });
});

test("取消全选会清空时保留原首选，单项不产生无效变更，无可用项保持选择", () => {
  const selected = ["sunburst", ...catalog.map((model) => model.key).filter((key) => key !== "sunburst")];
  const result = toggleAvailableModels(selected, catalog);
  assert.equal(result.changed, true);
  assert.deepEqual(result.values, ["sunburst"]);
  assert.match(result.message, /至少保留 1 个出图模型/);
  const protectedSingle = toggleAvailableModels(["flux"], catalog, { query: "flux" });
  assert.equal(protectedSingle.changed, false);
  assert.deepEqual(protectedSingle.values, ["flux"]);
  assert.match(protectedSingle.message, /已保留首选模型/);
  assert.deepEqual(toggleAvailableModels(["flux"], catalog, { query: "none" }), {
    changed: false, message: null, values: ["flux"],
  });
  assert.deepEqual(toggleAvailableModels(["flux"], catalog, { presentOption: () => ({ selectable: false }) }), {
    changed: false, message: null, values: ["flux"],
  });
});

// ---- DOM 替身：只覆盖共享控件消费的事件和定位合同 ----
class FixtureElement {
  constructor(tag, ownerDocument) {
    this.tagName = tag;
    this.ownerDocument = ownerDocument;
    this.attributes = new Map();
    this.children = [];
    this.dataset = {};
    this.style = {};
    this.listeners = new Map();
    this.className = "";
    this.value = "";
    this.textContent = "";
    this.hidden = false;
    this.disabled = false;
    this.rect = { left: 100, top: 340, right: 360, bottom: 378, width: 260, height: 38 };
    const classes = () => new Set(this.className.split(/\s+/).filter(Boolean));
    this.classList = {
      add: (name) => { const values = classes(); values.add(name); this.className = [...values].join(" "); },
      remove: (name) => { const values = classes(); values.delete(name); this.className = [...values].join(" "); },
      toggle: (name, enabled) => { this.classList[enabled ? "add" : "remove"](name); },
      contains: (name) => classes().has(name),
    };
    if (ownerDocument.nativePopover) {
      this.showPopover = () => { this.popoverOpen = true; this.emit("toggle", { newState: "open" }); };
      this.hidePopover = () => { this.popoverOpen = false; this.emit("toggle", { newState: "closed" }); };
    }
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  addEventListener(name, callback) {
    if (!this.listeners.has(name)) this.listeners.set(name, []);
    this.listeners.get(name).push(callback);
  }
  removeEventListener(name, callback) {
    this.listeners.set(name, (this.listeners.get(name) || []).filter(listener => listener !== callback));
  }
  remove() {
    if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(child => child !== this);
    this.parentNode = null;
  }
  emit(name, properties = {}) {
    const event = { target: this, preventDefault() { this.prevented = true; }, ...properties };
    for (const callback of this.listeners.get(name) || []) callback(event);
    return event;
  }
  append(...children) {
    for (const child of children) {
      if (child.parentNode) child.parentNode.children = child.parentNode.children.filter((entry) => entry !== child);
      child.parentNode = this;
      this.children.push(child);
    }
  }
  replaceChildren(...children) {
    for (const child of this.children) child.parentNode = null;
    this.children = [];
    this.append(...children);
  }
  contains(node) { return this === node || this.children.some((child) => child.contains(node)); }
  closest(selector) {
    for (let node = this; node; node = node.parentNode) {
      if (selector.split(",").some((part) => {
        const tag = part.trim().match(/^[a-z][\w-]*/i)?.[0];
        const attributes = [...part.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)];
        return (!tag || tag === node.tagName)
          && attributes.every(([, key, value]) => node.attributes.has(key)
            && (value === undefined || node.attributes.get(key) === value));
      })) return node;
    }
    return null;
  }
  getBoundingClientRect() { return this.rect; }
  focus(options) { this.ownerDocument.activeElement = this; this.focusOptions = options; }
  click() {
    if (this.disabled) return;
    this.focus({ preventScroll: true });
    this.emit("click", { detail: 0 });
  }
}

function fixture({ nativePopover = true, presentOption, onChange, single = false, choiceOptions = {} } = {}) {
  const doc = {
    nativePopover, listeners: new Map(), activeElement: null,
    addEventListener: FixtureElement.prototype.addEventListener,
    removeEventListener: FixtureElement.prototype.removeEventListener,
    emit: FixtureElement.prototype.emit,
    createElement(tag) { return new FixtureElement(tag, this); },
    createElementNS(namespace, tag) { return this.createElement(tag); },
  };
  const frames = [];
  doc.defaultView = {
    innerWidth: 1280, innerHeight: 720, listeners: new Map(),
    addEventListener: FixtureElement.prototype.addEventListener,
    removeEventListener: FixtureElement.prototype.removeEventListener,
    emit: FixtureElement.prototype.emit,
    requestAnimationFrame(callback) { frames.push(callback); return frames.length; },
    cancelAnimationFrame() { frames.length = 0; },
  };
  doc.body = doc.createElement("body");
  const container = doc.createElement("div");
  doc.body.append(container);
  const changes = [];
  const messages = [];
  const bind = single ? bindSearchableChoice : bindModelMultiSelect;
  const controller = bind({
    container, presentOption, ...choiceOptions,
    onChange(keys) { changes.push(keys); onChange?.(keys, controller); },
    onMessage(message) { messages.push(message); },
  });
  controller.render(catalog, ["flux"]);
  const panel = doc.body.children.at(-1);
  const walk = (node) => [node, ...node.children.flatMap(walk)];
  const byClass = (name) => walk(doc.body).find((node) => node.classList.contains(name));
  const row = (key) => walk(panel).find((node) => node.dataset.modelKey === key);
  const actions = walk(panel).filter((node) => node.classList.contains("model-picker-action"));
  return { doc, container, controller, panel, changes, messages, byClass, row,
    trigger: container.children[0], search: byClass("model-picker-search"),
    selectAll: actions[0],
    flushFrames() { while (frames.length) frames.shift()(); },
  };
}

test("共享浮层只保留搜索同行全选和平铺复选，摘要显示首选加其余数量", () => {
  const ui = fixture();
  ui.trigger.click();
  assert.equal(ui.panel.parentNode, ui.doc.body);
  assert.equal(ui.trigger.attributes.get("aria-expanded"), "true");
  assert.equal(ui.doc.activeElement, ui.search);
  assert.deepEqual(ui.search.focusOptions, { preventScroll: true });
  assert.deepEqual(ui.panel.children.map((node) => node.className),
    ["model-picker-search-wrap", "model-picker-list", "model-picker-empty"]);
  assert.deepEqual(ui.panel.children[0].children, [ui.search, ui.selectAll]);
  assert.deepEqual(ui.panel.children[1].children.map((node) => node.dataset.modelKey), catalog.map((model) => model.key));
  assert.equal(ui.trigger.children.length, 3);
  for (const removed of ["group", "toolbar", "availability", "summary", "count"]) {
    assert.equal(ui.byClass(`model-picker-${removed}`), undefined);
  }
  ui.selectAll.click();
  assert.deepEqual(ui.controller.values(), ["flux", "banana2", "banana21", "gptImage2", "sunburst", "flare", "seedream", "seedreamPro"]);
  assert.equal(ui.byClass("model-picker-primary").textContent, "Flux2 Klein");
  assert.equal(ui.byClass("model-picker-extra").textContent, "+7");
  for (const model of catalog.filter((model) => model.key !== "flux")) ui.row(model.key).click();
  assert.deepEqual(ui.controller.values(), ["flux"]);
  assert.equal(ui.byClass("model-picker-extra").hidden, true);
  ui.row("flux").click();
  assert.deepEqual(ui.controller.values(), ["flux"]);
  assert.deepEqual(ui.messages, ["至少保留 1 个出图模型"]);
  assert.equal(ui.changes.length, 8);
});

for (const { tag, attributes, nativePopover } of [
  { tag: "dialog", attributes: { open: "" }, nativePopover: true },
  { tag: "div", attributes: { role: "dialog", "aria-modal": "true" }, nativePopover: false },
]) {
  test(`${tag} 模态抽屉内复用原浮层并可选中，回到桌面时迁回 body`, () => {
    const ui = fixture({ single: true, nativePopover });
    const originalPanel = ui.panel;
    const modal = ui.doc.createElement(tag);
    for (const [key, value] of Object.entries(attributes)) modal.setAttribute(key, value);
    const content = ui.doc.createElement("div");
    modal.append(content);ui.doc.body.append(modal);content.append(ui.container);
    ui.trigger.click();
    assert.equal(ui.panel, originalPanel);
    assert.equal(ui.panel.parentNode, modal, "菜单必须留在可交互的模态子树内");
    ui.row("banana21").click();
    assert.deepEqual(ui.changes, [["banana21"]]);
    assert.equal(ui.trigger.attributes.get("aria-expanded"), "false");
    assert.equal(ui.doc.activeElement, ui.trigger);
    ui.doc.body.append(ui.container);
    ui.trigger.click();
    assert.equal(ui.panel, originalPanel);
    assert.equal(ui.panel.parentNode, ui.doc.body);
    assert.deepEqual(ui.controller.values(), ["banana21"]);
    ui.doc.emit("keydown", { key: "Escape" });
    assert.equal(ui.trigger.attributes.get("aria-expanded"), "false");
    assert.equal(ui.doc.activeElement, ui.trigger);
  });
}

test("搜索全选不会改变其他选择，禁选有说明且不加入选择", () => {
  const ui = fixture({ presentOption: (model) => ({ label: model.label,
    selectable: model.key !== "flare", reason: model.key === "flare" ? "不支持 2:1" : "" }) });
  ui.trigger.click();
  ui.search.value = "GPT";
  ui.search.emit("input");
  assert.equal(ui.row("banana2").hidden, true);
  assert.equal(ui.row("flare").disabled, true);
  assert.equal(ui.row("flare").title, "GPT Image 2.5 Flare · 不支持 2:1");
  assert.equal(ui.selectAll.textContent, "全选");
  assert.match(ui.selectAll.attributes.get("aria-label"), /全选筛选结果中的可用模型/);
  ui.selectAll.click();
  assert.deepEqual(ui.controller.values(), ["flux", "gptImage2", "sunburst"]);
  ui.row("flare").click();
  assert.deepEqual(ui.controller.values(), ["flux", "gptImage2", "sunburst"]);
});

test("同一按钮切换全选与取消全选，操作保留搜索和焦点且浮层保持打开", () => {
  const ui = fixture();
  ui.trigger.click();
  ui.search.value = "GPT";
  ui.search.emit("input");
  const action = ui.selectAll;
  assert.equal(action.textContent, "全选");
  ui.selectAll.click();
  assert.equal(action.disabled, false);
  assert.equal(action.textContent, "取消全选");
  assert.match(action.title, /保留筛选外选择.*至少保留首选/);
  assert.equal(ui.doc.activeElement, action);
  assert.equal(ui.search.value, "GPT");
  assert.equal(ui.panel.popoverOpen, true);
  assert.deepEqual(ui.controller.values(), ["flux", "gptImage2", "sunburst", "flare"]);
  action.click();
  assert.equal(ui.selectAll, action);
  assert.equal(action.textContent, "全选");
  assert.equal(ui.doc.activeElement, action);
  assert.equal(ui.search.value, "GPT");
  assert.equal(ui.panel.popoverOpen, true);
  assert.deepEqual(ui.controller.values(), ["flux"]);
});

test("取消全选只有首选可用时提示并保留一项，无匹配时禁用同一按钮", () => {
  const ui = fixture();
  ui.trigger.click();
  ui.search.value = "flux";
  ui.search.emit("input");
  assert.equal(ui.selectAll.textContent, "取消全选");
  assert.equal(ui.selectAll.disabled, false);
  assert.match(ui.selectAll.title, /至少保留首选/);
  ui.selectAll.click();
  assert.deepEqual(ui.controller.values(), ["flux"]);
  assert.equal(ui.changes.length, 0);
  assert.match(ui.messages[0], /至少保留 1 个出图模型/);
  assert.equal(ui.panel.popoverOpen, true);
  ui.search.focus({ preventScroll: true });
  ui.search.value = "none";
  ui.search.emit("input");
  assert.equal(ui.selectAll.disabled, true);
  assert.equal(ui.doc.activeElement, ui.search);
  assert.equal(ui.panel.popoverOpen, true);
});

test("外部 render 和点击回调重复 render 都保留浮层、搜索和原节点焦点", () => {
  const ui = fixture({ onChange(keys, controller) { controller.render(catalog, keys); } });
  ui.trigger.click();
  ui.search.value = "Banana";
  ui.search.emit("input");
  const originalRow = ui.row("banana21");
  ui.controller.render(catalog.map((model) => ({ ...model })), ["flux"]);
  assert.equal(ui.doc.activeElement, ui.search);
  assert.equal(ui.search.value, "Banana");
  assert.equal(ui.row("banana21"), originalRow);
  originalRow.focus({ preventScroll: true });
  originalRow.click();
  assert.equal(ui.doc.activeElement, originalRow);
  assert.equal(ui.search.value, "Banana");
  assert.equal(ui.panel.popoverOpen, true);
  assert.equal(ui.trigger.attributes.get("aria-expanded"), "true");
});

test("Escape 归还触发器且禁止焦点滚动，Tab 焦点离开关闭而不抢焦点", () => {
  const ui = fixture();
  ui.trigger.click();
  ui.doc.emit("keydown", { key: "Escape" });
  assert.equal(ui.panel.popoverOpen, false);
  assert.equal(ui.doc.activeElement, ui.trigger);
  assert.deepEqual(ui.trigger.focusOptions, { preventScroll: true });
  ui.trigger.click();
  const nextControl = ui.doc.createElement("button");
  nextControl.focus({ preventScroll: true });
  ui.panel.emit("focusout", { relatedTarget: nextControl });
  assert.equal(ui.panel.popoverOpen, false);
  assert.equal(ui.doc.activeElement, nextControl);
});

test("鼠标打开不抢搜索焦点，键盘打开才聚焦搜索且不滚动", () => {
  const ui = fixture();
  ui.trigger.focus({ preventScroll: true });
  ui.trigger.emit("click", { detail: 1 });
  assert.equal(ui.doc.activeElement, ui.trigger);
  assert.equal(ui.panel.popoverOpen, true);
  ui.doc.emit("keydown", { key: "Escape" });
  ui.trigger.click();
  assert.equal(ui.doc.activeElement, ui.search);
  assert.deepEqual(ui.search.focusOptions, { preventScroll: true });
});

test("无原生 Popover 时浮层仍在 body、支持 outside/Escape 并保持视口边界", () => {
  const ui = fixture({ nativePopover: false });
  ui.doc.defaultView.innerWidth = 360;
  ui.doc.defaultView.innerHeight = 420;
  ui.trigger.rect = { left: 200, top: 360, bottom: 398, width: 140, height: 38 };
  ui.trigger.click();
  assert.equal(ui.panel.hidden, false);
  assert.equal(ui.panel.classList.contains("open"), true);
  assert.equal(ui.panel.style.width, "140px");
  assert.equal(ui.panel.style.left, "200px");
  assert.ok(Number.parseFloat(ui.panel.style.top) >= 12);
  assert.ok(Number.parseFloat(ui.panel.style.maxHeight) <= 396);
  ui.doc.emit("pointerdown", { target: ui.doc.body });
  assert.equal(ui.panel.hidden, true);
  ui.trigger.click();
  ui.doc.emit("keydown", { key: "Escape" });
  assert.equal(ui.panel.hidden, true);
  assert.equal(ui.doc.activeElement, ui.trigger);
});

test("滚动或缩放合帧重定位，触发器滚出视口时关闭孤立浮层", () => {
  const ui = fixture();
  ui.trigger.click();
  ui.trigger.rect = { left: 1100, top: 500, bottom: 538, width: 120, height: 38 };
  ui.doc.emit("scroll");
  ui.doc.defaultView.emit("resize");
  ui.flushFrames();
  assert.equal(ui.panel.style.width, "120px");
  assert.equal(ui.panel.style.left, "1100px");
  ui.trigger.rect = { left: 100, top: -100, bottom: -62, width: 260, height: 38 };
  ui.doc.emit("scroll");
  ui.flushFrames();
  assert.equal(ui.panel.popoverOpen, false);
});

test("浮层与触发器等宽且优先下方，空间不足向上，视口窄于触发器时收窄", () => {
  const ui = fixture();
  ui.panel.rect.height = 250;
  ui.trigger.rect = { left: 100, top: 100, bottom: 138, width: 260, height: 38 };
  ui.trigger.click();
  assert.equal(ui.panel.style.width, "260px");
  assert.equal(ui.panel.style.left, "100px");
  assert.equal(ui.panel.style.top, "142px");
  assert.equal(ui.panel.style.maxHeight, "330px");
  ui.trigger.rect.top = 600;
  ui.trigger.rect.bottom = 638;
  ui.doc.emit("scroll");
  ui.flushFrames();
  assert.equal(ui.panel.style.top, "346px");
  ui.doc.defaultView.innerWidth = 240;
  ui.doc.defaultView.emit("resize");
  ui.flushFrames();
  assert.equal(ui.panel.style.width, "216px");
  assert.equal(ui.panel.style.left, "12px");
});

test("共享单选保持空选择占位，不创建全选或数量，使用 radio 语义和自定义文案", () => {
  const ui = fixture({ single: true, choiceOptions: { label: "风格选择", placeholder: "请选择风格", searchPlaceholder: "搜索风格名称" } });
  ui.controller.render(catalog, []);
  assert.deepEqual(ui.controller.values(), []);
  assert.equal(ui.byClass("model-picker-primary").textContent, "请选择风格");
  assert.equal(ui.trigger.attributes.get("aria-label"), "风格选择：请选择风格");
  assert.equal(ui.panel.attributes.get("aria-label"), "风格选择");
  assert.equal(ui.search.placeholder, "搜索风格名称");
  assert.equal(ui.search.attributes.get("aria-label"), "搜索风格名称");
  assert.equal(ui.byClass("model-picker-empty").textContent, "没有找到匹配的风格");
  assert.equal(ui.selectAll, undefined);
  assert.equal(ui.byClass("model-picker-extra"), undefined);
  assert.equal(ui.trigger.children.length, 2);
  const list = ui.byClass("model-picker-list");
  assert.equal(list.attributes.get("role"), "radiogroup");
  assert.equal(list.attributes.get("aria-label"), "风格选择");
  for (const model of catalog) {
    assert.equal(ui.row(model.key).attributes.get("role"), "radio");
    assert.equal(ui.row(model.key).attributes.get("aria-checked"), "false");
  }
});

test("单选合法点击仅提交一个键并关闭归焦，再打开恢复完整风格列表", () => {
  const ui = fixture({ single: true,
    presentOption: (model) => ({ label: `${model.label} · v2`, selectable: true }),
    onChange(keys, controller) { controller.render(catalog, keys); } });
  ui.controller.render(catalog, []);
  ui.trigger.click();
  ui.search.value = "Banana";
  ui.search.emit("input");
  ui.row("banana21").click();
  assert.deepEqual(ui.controller.values(), ["banana21"]);
  assert.deepEqual(ui.changes, [["banana21"]]);
  assert.equal(ui.byClass("model-picker-primary").textContent, "Banana 2.1 · v2");
  assert.equal(ui.row("banana21").attributes.get("aria-checked"), "true");
  assert.equal(ui.row("banana2").attributes.get("aria-checked"), "false");
  assert.equal(ui.panel.popoverOpen, false);
  assert.equal(ui.doc.activeElement, ui.trigger);
  assert.deepEqual(ui.trigger.focusOptions, { preventScroll: true });
  assert.equal(ui.search.value, "");
  ui.trigger.click();
  assert.equal(ui.panel.popoverOpen, true);
  assert.equal(ui.search.value, "");
  assert.equal(catalog.filter((model) => !ui.row(model.key).hidden).length, catalog.length);
  assert.deepEqual(ui.controller.values(), ["banana21"]);
});

test("单选保留已选禁选项，不自动替换；恢复多个键时只保留首个有效项", () => {
  const ui = fixture({ single: true,
    presentOption: (model) => ({ label: model.label, selectable: model.key !== "flux", reason: "暂不可用" }) });
  assert.deepEqual(ui.controller.values(), ["flux"]);
  assert.equal(ui.row("flux").disabled, true);
  assert.equal(ui.row("flux").attributes.get("aria-checked"), "true");
  assert.equal(ui.byClass("model-picker-primary").textContent, "Flux2 Klein");
  ui.trigger.click();
  ui.row("flux").click();
  assert.deepEqual(ui.controller.values(), ["flux"]);
  assert.equal(ui.changes.length, 0);
  assert.equal(ui.panel.popoverOpen, true);
  ui.controller.render(catalog, ["removed", "banana21", "banana2"]);
  assert.deepEqual(ui.controller.values(), ["banana21"]);
  assert.equal(ui.row("banana21").attributes.get("aria-checked"), "true");
  assert.equal(ui.row("banana2").attributes.get("aria-checked"), "false");
});

test("共享选择器显式禁用后关闭浮层并保留值，恢复仍遵守空目录禁用", () => {
  const ui = fixture({ single: true });
  ui.trigger.click();
  assert.equal(ui.panel.popoverOpen, true);
  ui.controller.setDisabled(true);
  assert.equal(ui.trigger.disabled, true);
  assert.equal(ui.panel.popoverOpen, false);
  assert.deepEqual(ui.controller.values(), ["flux"]);
  ui.controller.render(catalog, ["banana21"]);
  assert.equal(ui.trigger.disabled, true);
  assert.deepEqual(ui.controller.values(), ["banana21"]);
  ui.trigger.click();
  assert.equal(ui.panel.popoverOpen, false);
  ui.controller.setDisabled(false);
  assert.equal(ui.trigger.disabled, false);
  ui.trigger.click();
  assert.equal(ui.panel.popoverOpen, true);
  ui.controller.setDisabled(true);
  ui.controller.render([], []);
  ui.controller.setDisabled(false);
  assert.equal(ui.trigger.disabled, true);
  assert.deepEqual(ui.controller.values(), []);
});

// -------- 普通参数与模型搜索复用同一组件 --------
test("普通单选支持空值占位、禁选跳过、首尾导航、确认与归焦", () => {
  const ui = fixture({ single: true, choiceOptions: { searchable: false, label: "生成张数", placement: "top" },
    presentOption: model => ({ label: model.label, selectable: model.key !== "disabled" }) });
  ui.controller.render([{ key: "", label: "请选择" }], [""]);
  assert.equal(ui.row("").attributes.get("aria-selected"), "true");
  assert.equal(ui.byClass("model-picker-search-wrap").hidden, true);
  assert.equal(ui.panel.attributes.get("role"), "listbox");
  ui.controller.render([{ key: "1", label: "1 张" }, { key: "disabled", label: "禁用" }, { key: "3", label: "3 张" }], ["1"]);
  ui.trigger.click();
  assert.equal(ui.doc.activeElement, ui.row("1"));
  ui.panel.emit("keydown", { key: "ArrowDown" });
  assert.equal(ui.doc.activeElement, ui.row("3"));
  ui.panel.emit("keydown", { key: "Home" });
  assert.equal(ui.doc.activeElement, ui.row("1"));
  ui.panel.emit("keydown", { key: "End" });
  ui.panel.emit("keydown", { key: " " });
  assert.deepEqual(ui.changes.at(-1), ["3"]);
  assert.equal(ui.trigger.attributes.get("aria-expanded"), "false");
  assert.equal(ui.doc.activeElement, ui.trigger);
});

test("搜索后键盘只遍历匹配项，Escape不改变选择", () => {
  const ui = fixture();
  ui.trigger.click();
  ui.search.value = "GPT";
  ui.search.emit("input");
  ui.search.focus();
  ui.panel.emit("keydown", { key: "ArrowDown" });
  assert.equal(ui.doc.activeElement, ui.row("gptImage2"));
  ui.panel.emit("keydown", { key: "End" });
  assert.equal(ui.doc.activeElement, ui.row("flare"));
  ui.doc.emit("keydown", { key: "Escape" });
  assert.deepEqual(ui.controller.values(), ["flux"]);
  assert.equal(ui.doc.activeElement, ui.trigger);
});

test("动态控件销毁清除顶层菜单和全局事件，后续滚动不再触发定位", () => {
  const ui = fixture();
  ui.trigger.click();
  ui.controller.render(catalog, ["flux"]);
  assert.ok([...ui.doc.listeners.values()].some(listeners => listeners.length));
  ui.controller.destroy();
  assert.equal(ui.panel.parentNode, null);
  assert.equal(ui.trigger.attributes.get("aria-expanded"), "false");
  assert.ok([...ui.doc.listeners.values()].every(listeners => !listeners.length));
  assert.ok([...ui.doc.defaultView.listeners.values()].every(listeners => !listeners.length));
  ui.doc.emit("scroll");
  ui.flushFrames();
});

/**
 * [INPUT]: 依赖重建光影模板/脱敏Prompt身份/专用刷新/自定义直接编辑/历史参数目录、真实打光控制器/画布和共享原生下拉适配器、模型尺寸真源与内存DOM/指针/显示尺寸/DPR事件替身
 * [OUTPUT]: 验证无标注整体原灯三选/幅度即时冻结与旧服务门禁、整体及标注草稿隔离/换源重置和历史恢复、CSS尺寸/DPR高清坐标命中不漂移、可选新增/单灯精修混用与禁止跨类转换、旧保护只读/删除、Prompt冻结刷新/历史参数、点线面与两灯具模式、编号/触屏/键盘/撤销及中文输入光标保持
 * [POS]: test 的GPT打光前端交互回归，不访问浏览器网络、付费模型或飞书
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from "node:test";
import assert from "node:assert/strict";
import { bindImageRelight } from "../public/image-relight.js";
import { bindRelightCanvas } from "../public/image-relight-canvas.js";
import { enhanceSearchableSelect } from "../public/custom-select.js";
import { MODEL_CONFIGS } from "../src/model-config.mjs";
import { RELIGHT_TEMPLATES, RELIGHT_BLEND_MODES, RELIGHT_LEGACY_TEMPLATES, RELIGHT_DEFAULT_TEMPLATE_KEY, normalizeRelightSettings } from "../public/image-relight-presets.js";

import { RELIGHT_ACTIONS, RELIGHT_ORIGINAL_LIGHT_ACTIONS } from "../public/image-relight-geometry.js";

function fixture({ manual = false, onRefresh = null, canvasOnly = false, pixelRatio = 1 } = {}) {
  const nodes = new Map(), calls = [], groups = new Map(), paintState = {}, resizeObservers = [], mediaQueries = [], viewListeners = new Map();
  let bounds = { left: 100, top: 50, width: 800, height: 400 };
  const view = { devicePixelRatio: pixelRatio, MutationObserver: class { observe() {} disconnect() {} },
    ResizeObserver: class { constructor(callback) { this.callback = callback; resizeObservers.push(this); } observe() {} disconnect() { this.disconnected = true; } },
    addEventListener(name, callback) { viewListeners.set(name, callback); }, removeEventListener(name) { viewListeners.delete(name); },
    matchMedia(media) {
      const listeners = new Set();
      const query = { media, listeners, addEventListener(name, callback) { listeners.add(callback); }, removeEventListener(name, callback) { listeners.delete(callback); }, fire() { [...listeners].forEach(callback => callback()); } };
      mediaQueries.push(query); return query;
    } };
  const document = { activeElement: null, createElement: tag => new Node(tag), defaultView: view };
  class Node {
    constructor(name) {
      this.name = name; this.children = []; this.options = []; this.listeners = new Map(); this.dataset = {};
      this.attributes = new Map(); this._value = ""; this.valueWrites = 0; this.hidden = false; this.disabled = false; this.open = false; this.ownerDocument = document;
      this.style = { setProperty() {} }; const classes = new Set();
      this.classList = { toggle(key, value) { value ? classes.add(key) : classes.delete(key); }, contains: key => classes.has(key) };
    }
    get value() { return this._value; }
    set value(value) { this._value = value; this.valueWrites += 1; this.selectionStart = this.selectionEnd = String(value).length; }
    querySelector(selector) { return node(selector); }
    querySelectorAll(selector) {
      if (selector === "[data-relight-id]") return this.children;
      return groups.get(selector) || [];
    }
    setAttribute(key, value) { this.attributes.set(key, value); }
    getAttribute(key) { return this.attributes.get(key) ?? null; }
    insertAdjacentElement(position, value) { this.adjacent = value; }
    dispatchEvent(event) { this.fire(event.type, event); return true; }
    removeAttribute(key) { this.attributes.delete(key); }
    addEventListener(name, callback) { const list = this.listeners.get(name) || []; list.push(callback); this.listeners.set(name, list); }
    fire(name, value = {}) { let result; for (const callback of this.listeners.get(name) || []) result = callback({ preventDefault() {}, ...value }); return result; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; this.options = children; }
    contains(child) { return this.children.includes(child); }
    focus() { document.activeElement = this; }
    getBoundingClientRect() { return { ...bounds }; }
    getContext() { return new Proxy(paintState, { get: (object, key) => object[key] || ((...args) => calls.push([key, ...args])), set: (object, key, value) => { object[key] = value; return true; } }); }
    setPointerCapture(id) { this.capture = id; }
    hasPointerCapture(id) { return this.capture === id; }
    releasePointerCapture() { this.capture = null; }
  }
  function node(selector) { if (!nodes.has(selector)) nodes.set(selector, new Node(selector)); return nodes.get(selector); }
  const tools = ["select", "point", "line", "area"].map(value => { const button = new Node("button"); button.dataset.relightTool = value; return button; });
  const modes = ["lightOnly", "addFixture"].map(value => { const button = new Node("button"); button.dataset.relightMode = value; return button; });
  const presets = [2700, 3000, 4000, 6500].map(value => { const button = new Node("button"); button.dataset.relightTemperature = String(value); return button; });
  const templates = RELIGHT_TEMPLATES.map(item => { const button = new Node("button"); button.dataset.relightTemplate = item.key; return button; });
  const editModes = ["new", "existing"].map(value => { const button = new Node("button"); button.dataset.relightEditMode = value; return button; });
  const originalLightChoices = RELIGHT_ORIGINAL_LIGHT_ACTIONS.map(item => { const button = new Node("button"); button.dataset.relightOriginalLightsAction = item.key; return button; });
  groups.set("[data-relight-template]", templates);
  groups.set("[data-relight-edit-mode]", editModes);
  groups.set("[data-relight-original-lights-action]", originalLightChoices);
  groups.set("[data-relight-tool]", tools); groups.set("[data-relight-mode]", modes); groups.set("[data-relight-temperature]", presets);
  node("[data-relight-original-action]").options = RELIGHT_ACTIONS.filter(item => ["darken", "turnOff"].includes(item.key)).map(item => { const option = new Node("option"); option.value = item.key; option.textContent = item.label; return option; });
  node("[data-relight-original-action]").value = "darken";
  let source = { id: "original", dataUrl: "data:image/png;base64,AAAA", type: "image/png", name: "room.png", size: 3, width: 1600, height: 800 };
  const config = { available: true, modelKey: "gptImage25Sunburst", sizes: MODEL_CONFIGS.gptImage25Sunburst.sizes,
    qualityOptions: MODEL_CONFIGS.gptImage25Sunburst.qualityOptions, defaultQuality: "medium",
    prompt: { available: true, code: "image-relight", name: "打光Prompt", version: 7, defaultVersion: 7, sha256: "a".repeat(64),
      tableUrl: "https://lq9n5lvfn2i.feishu.cn/base/SALobKnnra17iSsGT2ccC52PnHd?table=tblDCXNib9XeWuza&view=vews5JwdmF" },
    templates: RELIGHT_TEMPLATES, legacyTemplates: RELIGHT_LEGACY_TEMPLATES, actions: RELIGHT_ACTIONS,
    originalLightActions: RELIGHT_ORIGINAL_LIGHT_ACTIONS, defaultOriginalLights: { action: "keep" },
    blendModes: RELIGHT_BLEND_MODES, defaultTemplateKey: "naturalFill", defaultBlendMode: "balanced" };
  const drawing = canvasOnly ? bindRelightCanvas({ preview: node(".relight-preview"), toolbar: node(".relight-toolbar") }) : null;
  const controller = canvasOnly ? null : bindImageRelight({ root: node("root"), getSourceImage: () => source, onRefresh });
  if (controller) controller.configure(config);
  if (drawing) { drawing.setSource(source); drawing.setEditing(true); }
  if (manual && controller) templates.find(button => button.dataset.relightTemplate === "custom").fire("click");
  const canvas = node("[data-relight-canvas]");
  const point = (x, y) => ({ clientX: bounds.left + x * bounds.width, clientY: bounds.top + y * bounds.height });
  const fire = (name, x, y, extra = {}) => canvas.fire(name, { pointerId: 1, pointerType: "touch", button: 0, ...point(x, y), ...extra });
  const draw = (type, x1, y1, x2, y2) => {
    tools.find(button => button.dataset.relightTool === type).fire("click");
    fire("pointerdown", x1, y1); fire("pointermove", x2, y2); fire("pointerup", x2, y2);
  };
  return { node, canvas, controller, drawing, tools, modes, editModes, originalLightChoices, presets, templates, document, draw, fire, config, source: () => source,
    setSource(value) { source = value; controller.renderSummary(); },
    pickTemplate(key) { templates.find(button => button.dataset.relightTemplate === key).fire("click"); },
    setEditMode(key) { editModes.find(button => button.dataset.relightEditMode === key).fire("click"); },
    setOriginalAction(key) { const select = node("[data-relight-original-action]"); assert.ok(select.options.some(option => option.value === key)); select.value = key; select.fire("change"); },
    setOriginalLights(key) { originalLightChoices.find(button => button.dataset.relightOriginalLightsAction === key).fire("click"); },
    resize(width, height) { bounds = { ...bounds, width, height }; resizeObservers.filter(observer => !observer.disconnected).forEach(observer => observer.callback()); },
    setPixelRatio(value) { view.devicePixelRatio = value; [...mediaQueries].forEach(query => query.fire()); },
    paintState, mediaQueries, viewListeners, resizeObservers, calls };
}

test("低像素原图放大时标注按CSS尺寸和Retina密度独立绘制，提交仍保留原图与归一坐标", () => {
  const f = fixture({ manual: true, pixelRatio: 2 });
  f.setSource({ ...f.source(), id: "small-image", width: 200, height: 100 });
  assert.deepEqual([f.canvas.width, f.canvas.height], [1600, 800], "不能把200×100的源像素缓冲区放大显示标注");
  f.draw("point", .2, .3, .4, .6);
  assert.equal(f.paintState.font, "600 24px system-ui", "12CSS像素字体要以24设备像素绘制");
  const before = f.controller.jobRequest({ image: f.source() });
  assert.deepEqual(before.sharedInput.lights[0].points, [{ x: .2, y: .3 }]);
  assert.deepEqual(before.sharedInput.lights[0].target, { x: .4, y: .6 });
  f.setPixelRatio(3);
  assert.deepEqual([f.canvas.width, f.canvas.height], [2400, 1200]);
  assert.equal(f.paintState.font, "600 36px system-ui");
  assert.deepEqual(f.controller.jobRequest({ image: f.source() }), before, "更换屏幕密度不能改变实际请求或创建伪编辑");
  assert.deepEqual([f.source().width, f.source().height], [200, 100]);
  assert.equal(f.mediaQueries.filter(query => query.listeners.size).length, 1, "DPR变化后只保留当前分辨率监听");
});

test("标注随预览伸缩重绘且命中拖动不漂移，隐藏恢复与销毁清理尺寸监听", () => {
  const f = fixture({ canvasOnly: true, pixelRatio: 2 });
  f.drawing.setDrawingAction("darken"); f.draw("point", .3, .2, .3, .2);
  const original = f.drawing.value();
  f.resize(1200, 600);
  assert.deepEqual([f.canvas.width, f.canvas.height], [2400, 1200]);
  assert.deepEqual(f.drawing.value(), original);
  f.tools[0].fire("click"); f.fire("pointerdown", .3, .2); f.fire("pointermove", .4, .3); f.fire("pointerup", .4, .3);
  assert.deepEqual(f.drawing.value()[0].points, [{ x: .4, y: .3 }]);
  assert.equal(f.drawing.value()[0].amount, .5);
  assert.equal(Object.hasOwn(f.drawing.value()[0], "target"), false);
  f.drawing.setDrawingAction("brighten"); f.draw("point", .7, .5, .7, .8);
  f.resize(600, 300); f.tools[0].fire("click");
  f.fire("pointerdown", .7, .8); f.fire("pointermove", .8, .9); f.fire("pointerup", .8, .9);
  assert.deepEqual(f.drawing.value()[1].target, { x: .8, y: .9 }, "缩放后按CSS位置命中箭头，而不是按设备像素命中");
  const state = f.drawing.value();
  f.resize(0, 0); assert.deepEqual([f.canvas.width, f.canvas.height], [1, 1]);
  f.resize(800, 400); assert.deepEqual([f.canvas.width, f.canvas.height], [1600, 800]);
  assert.deepEqual(f.drawing.value(), state);
  f.drawing.destroy();
  assert.ok(f.resizeObservers.every(observer => observer.disconnected));
  assert.equal(f.mediaQueries.filter(query => query.listeners.size).length, 0);
  assert.equal(f.viewListeners.has("resize"), false);
  f.setPixelRatio(3); assert.deepEqual([f.canvas.width, f.canvas.height], [1600, 800]);
});

test("真实绑定支持点线面同图混用、逐灯模式和参数，冻结请求只携带GPT与一份原图", () => {
  const f = fixture({ manual: true });
  f.draw("point", .2, .2, .3, .6);
  assert.deepEqual(f.controller.value().lights[0].points, [{ x: .2, y: .2 }]);
  assert.deepEqual(f.controller.value().lights[0].target, { x: .3, y: .6 });
  f.draw("line", .5, .15, .8, .15); f.modes[1].fire("click"); f.presets[2].fire("click");
  f.node("[data-relight-fixture]").value = "嵌入式灯带"; f.node("[data-relight-fixture]").fire("change");
  f.draw("area", .55, .55, .8, .8);
  const request = f.controller.jobRequest({ image: f.source(), jobId: "generation-relight-ui-123456" });
  assert.deepEqual(request.sharedInput.lights.map(light => [light.type, light.mode, light.kelvin]), [["point", "lightOnly", 3000], ["line", "addFixture", 4000], ["area", "lightOnly", 3000]]);
  assert.equal(request.sharedInput.lights[1].fixture, "嵌入式灯带");
  assert.equal(request.items[0].key, "gptImage25Sunburst"); assert.equal(request.items[0].provider, "oneapi");
  assert.equal(request.sharedInput.referenceImages.length, 1); assert.equal(request.featureMode, "imageRelight");
  assert.equal(Object.hasOwn(request.sharedInput, "maskImage"), false);
  f.presets[3].fire("click");
  assert.equal(request.sharedInput.lights[2].kelvin, 3000, "排队快照不能跟随用户后续修改");
});

test("触屏照射目标和面光四角可独立调整，取消恢复且撤销不复用光源编号", () => {
  const f = fixture({ manual: true }); f.draw("area", .2, .2, .6, .5);
  const before = f.controller.value().lights[0];
  f.fire("pointerdown", .6, .2); f.fire("pointermove", .7, .25); f.fire("pointerup", .7, .25);
  assert.deepEqual(f.controller.value().lights[0].points[1], { x: .7, y: .25 });
  const target = f.controller.value().lights[0].target;
  f.fire("pointerdown", target.x, target.y); f.fire("pointermove", .9, .9); f.fire("pointerup", .9, .9);
  assert.deepEqual(f.controller.value().lights[0].target, { x: .9, y: .9 });
  const committed = f.controller.value();
  f.fire("pointerdown", .7, .25); f.fire("pointermove", .8, .3); f.fire("pointercancel", .8, .3);
  assert.deepEqual(f.controller.value(), committed, "触屏取消必须恢复已提交形状");
  f.node("[data-relight-undo]").fire("click");
  assert.deepEqual(f.controller.value().lights[0].target, before.target);
  f.node("[data-relight-clear]").fire("click"); f.draw("point", .1, .1, .1, .4);
  assert.equal(f.controller.value().lights[0].id, "L2", "删除不使旧编号指向另一个光源");
});

test("键盘添加/移动/调整目标/删除与撤销可达，换原图清除旧光源及历史", () => {
  const f = fixture({ manual: true }); f.tools[2].fire("click"); f.node("[data-relight-add]").fire("click");
  const before = f.controller.value().lights[0];
  f.canvas.fire("keydown", { key: "ArrowRight" });
  assert.equal(f.controller.value().lights[0].points[0].x, before.points[0].x + .005);
  const after = f.controller.value().lights[0];
  f.canvas.fire("keydown", { key: "ArrowDown", shiftKey: true });
  assert.deepEqual(f.controller.value().lights[0].points, after.points);
  assert.equal(f.controller.value().lights[0].target.y, after.target.y + .005);
  f.canvas.fire("keydown", { key: "Delete" }); assert.equal(f.controller.value().lights.length, 0);
  f.canvas.fire("keydown", { key: "z", ctrlKey: true }); assert.equal(f.controller.value().lights.length, 1);
  f.setSource({ ...f.source(), id: "new-image", width: 800, height: 1600 });
  assert.equal(f.canvas.width, 800); assert.equal(f.canvas.height, 400, "标注缓冲区跟随显示尺寸，不跟随原图像素");
  assert.equal(f.controller.value().lights.length, 0); assert.equal(f.node("[data-relight-undo]").disabled, true);
  assert.match(f.controller.availabilityReason(), /整体减弱、全部关闭/);
});

test("读取权限期间保留光源与质量，失效权限和非法色温阻止提交", () => {
  const f = fixture({ manual: true }); f.draw("point", .2, .2, .3, .5);
  f.controller.restore({ ...f.controller.value(), outputResolution: "2K", quality: "high", blendMode: "subtle" });
  const before = f.controller.value();
  f.controller.configure({ available: false, reason: "读取模型权限中" });
  assert.deepEqual(f.controller.value(), before); assert.equal(f.controller.isAvailable(), false);
  assert.throws(() => f.controller.jobRequest({ image: f.source() }), /读取模型权限中/);
  f.controller.configure(f.config); assert.deepEqual(f.controller.value(), before);
  f.node("[data-relight-kelvin]").value = "1500"; f.node("[data-relight-kelvin]").fire("input");
  assert.match(f.controller.availabilityReason(), /2000–10000/);
  assert.throws(() => f.controller.jobRequest({ image: f.source() }), /2000–10000/);
  f.node("[data-relight-kelvin]").value = "3600"; f.node("[data-relight-kelvin]").fire("input"); f.node("[data-relight-kelvin]").fire("change");
  assert.equal(f.controller.jobRequest({ image: f.source() }).sharedInput.lights[0].kelvin, 3600);
  const snapshot = f.controller.value(); f.node("[data-relight-clear]").fire("click"); f.controller.restore(snapshot);
  assert.deepEqual(f.controller.value(), snapshot);
});

test("无面积的面光与取消中的线不进入任务，目标/位置移动保持图内范围", () => {
  const f = fixture({ manual: true }); f.draw("area", .2, .2, .5, .2); assert.equal(f.controller.value().lights.length, 0);
  f.tools[2].fire("click"); f.fire("pointerdown", .2, .2); f.fire("pointermove", .5, .5); f.fire("lostpointercapture", .5, .5);
  assert.equal(f.controller.value().lights.length, 0);
  f.draw("line", .7, .2, .9, .2);
  f.tools[0].fire("click"); f.fire("pointerdown", .8, .2); f.fire("pointermove", 1.5, .5); f.fire("pointerup", 1.5, .5);
  const light = f.controller.value().lights[0];
  assert.ok([...light.points, light.target].every(point => point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1));
});

test("删除中间光源后画布/列表/参数按提交顺序连续编号，内部选择身份保持稳定", () => {
  const f = fixture({ manual: true }); f.draw("point", .1, .1, .1, .4); f.draw("line", .4, .1, .6, .1); f.draw("area", .7, .6, .9, .8);
  const list = f.node("[data-relight-list]");
  list.children[1].fire("click"); f.node("[data-relight-delete]").fire("click");
  assert.deepEqual(f.controller.value().lights.map(light => light.id), ["L1", "L3"]);
  assert.deepEqual(list.children.map(button => button.children[0].textContent), ["1 · 点光源", "2 · 面光源"]);
  assert.equal(f.node("[data-relight-property-title]").textContent, "光源 2 · 新增光源");
  const rendered = f.calls.filter(call => call[0] === "fillText").slice(-2).map(call => call[1]);
  assert.deepEqual(rendered, ["1 +", "2 +"]);
  f.node("[data-relight-undo]").fire("click");
  assert.deepEqual(f.controller.value().lights.map(light => light.id), ["L1", "L2", "L3"]);
  assert.equal(f.node("[data-relight-property-title]").textContent, "光源 2 · 新增光源");
});

test("键盘目标接近光源中心时保留上次有效箭头并保持任务可提交", () => {
  const f = fixture({ manual: true }); f.draw("point", .2, .2, .2, .25);
  for (let index = 0; index < 12; index++) f.canvas.fire("keydown", { key: "ArrowUp", shiftKey: true });
  const light = f.controller.value().lights[0];
  assert.ok(Math.hypot(light.target.x - light.points[0].x, light.target.y - light.points[0].y) >= .005);
  assert.equal(f.controller.isAvailable(), true);
});

test("绘制工具允许在已有面光内部叠加点光，选择工具仍可整体移动面光", () => {
  const f = fixture({ manual: true }); f.draw("area", .1, .1, .8, .8); const area = f.controller.value().lights[0];
  f.draw("point", .3, .3, .3, .5);
  assert.equal(f.controller.value().lights.length, 2);
  assert.deepEqual(f.controller.value().lights[0], area);
  f.tools[0].fire("click"); f.fire("pointerdown", .6, .6); f.fire("pointermove", .7, .65); f.fire("pointerup", .7, .65);
  assert.ok(f.controller.value().lights[0].points[0].x > area.points[0].x);
  assert.equal(f.controller.isAvailable(), true);
});

test("灯具输入后无需change，立即点色温预设或切换光源仍冻结完整描述", () => {
  const f = fixture({ manual: true }); f.draw("point", .15, .15, .15, .45); f.draw("line", .4, .15, .7, .15); f.modes[1].fire("click");
  const fixtureField = f.node("[data-relight-fixture]");
  fixtureField.focus(); fixtureField.value = "隐藏式暖白灯带，沿天花边缘安装"; fixtureField.fire("input");
  f.presets[0].focus(); f.presets[0].fire("click");
  assert.equal(f.controller.value().lights[1].fixture, "隐藏式暖白灯带，沿天花边缘安装");
  f.draw("area", .55, .55, .8, .8);
  const request = f.controller.jobRequest({ image: f.source(), jobId: "generation-relight-input-123456" });
  assert.equal(request.sharedInput.lights[1].fixture, "隐藏式暖白灯带，沿天花边缘安装");
  assert.equal(request.sharedInput.lights[1].kelvin, 2700);
  f.node("[data-relight-list]").children[1].fire("click");
  assert.equal(fixtureField.value, "隐藏式暖白灯带，沿天花边缘安装");
});

test("手填有效色温在input立即生效，直接START或切灯不依赖blur/change", () => {
  const f = fixture({ manual: true }); f.draw("point", .2, .2, .2, .5);
  const kelvin = f.node("[data-relight-kelvin]"); kelvin.focus(); kelvin.value = "3567"; kelvin.fire("input");
  assert.equal(f.controller.jobRequest({ image: f.source() }).sharedInput.lights[0].kelvin, 3567);
  f.draw("line", .5, .2, .8, .2);
  assert.equal(f.controller.jobRequest({ image: f.source() }).sharedInput.lights[0].kelvin, 3567);
  f.node("[data-relight-list]").children[0].fire("click");
  assert.equal(Number(kelvin.value), 3567);
});

test("中文组合输入即时写入状态且同值重绘不覆盖textarea或移动光标", () => {
  const f = fixture({ manual: true }); f.draw("line", .2, .2, .6, .2); f.modes[1].fire("click");
  const field = f.node("[data-relight-fixture]"); field.focus(); field.value = "隐藏式灯带";
  field.selectionStart = field.selectionEnd = 3; const writes = field.valueWrites;
  field.fire("input", { isComposing: true });
  assert.equal(field.valueWrites, writes, "组合输入期间不能重新给textarea.value赋值");
  assert.equal(field.selectionStart, 3); assert.equal(field.selectionEnd, 3);
  assert.equal(f.controller.value().lights[0].fixture, "隐藏式灯带");
  field.value = "隐藏式暖白灯带"; field.selectionStart = field.selectionEnd = 5; const endWrites = field.valueWrites;
  field.fire("compositionend");
  assert.equal(field.valueWrites, endWrites); assert.equal(field.selectionStart, 5);
  assert.equal(f.controller.jobRequest({ image: f.source() }).sharedInput.lights[0].fixture, "隐藏式暖白灯带");
});

test("非法色温草稿保持阻断，预设可修复，切灯与换图不继承旧字段错误", () => {
  const f = fixture({ manual: true }); f.draw("point", .2, .2, .2, .5);
  const kelvin = f.node("[data-relight-kelvin]"); kelvin.focus(); kelvin.value = "3"; kelvin.fire("input");
  f.node("[data-relight-softness]").value = "hard"; f.node("[data-relight-softness]").fire("change");
  assert.equal(kelvin.value, "3", "未完成的当前色温输入不会被其他控件重绘覆盖");
  assert.throws(() => f.controller.jobRequest({ image: f.source() }), /2000–10000/);
  f.presets[0].focus(); f.presets[0].fire("click");
  assert.equal(Number(kelvin.value), 2700);
  assert.equal(f.controller.jobRequest({ image: f.source() }).sharedInput.lights[0].kelvin, 2700);
  kelvin.value = "12000"; kelvin.fire("input"); f.draw("line", .5, .2, .8, .2);
  assert.equal(f.controller.isAvailable(), true, "切换到新光源时丢弃旧字段错误，旧光源保留上次有效色温");
  assert.equal(f.controller.value().lights[0].kelvin, 2700);
  kelvin.value = "1500"; kelvin.fire("input");
  f.setSource({ ...f.source(), id: "replacement-input-reset" });
  assert.match(f.controller.availabilityReason(), /整体减弱、全部关闭/);
  f.draw("point", .1, .1, .1, .4); assert.equal(f.controller.isAvailable(), true);
  assert.equal(f.controller.jobRequest({ image: f.source() }).sharedInput.lights[0].kelvin, 3000);
});


test("自定义整体减弱或关闭无需标注，幅度即时冻结且切单灯精修不会改全局操作", () => {
  const f = fixture({ manual: true });
  assert.deepEqual(f.controller.value().originalLights, { action: "keep" });
  assert.equal(f.node("[data-relight-original-lights]").hidden, false);
  assert.throws(() => f.controller.jobRequest({ image: f.source() }), /整体减弱、全部关闭/);
  f.originalLightChoices[0].fire("keydown", { key: "ArrowRight" });
  assert.equal(f.document.activeElement, f.originalLightChoices[1]);
  assert.equal(f.node("[data-relight-original-lights-amount-field]").hidden, false);
  assert.deepEqual(f.controller.value().originalLights, { action: "darken", amount: .5 });
  f.node("[data-relight-original-lights-amount]").value = "70"; f.node("[data-relight-original-lights-amount]").fire("input");
  const frozen = f.controller.jobRequest({ image: f.source() });
  assert.deepEqual(frozen.sharedInput.lights, []); assert.deepEqual(frozen.sharedInput.originalLights, { action: "darken", amount: .7 });
  assert.equal(frozen.sharedInput.referenceImages.length, 1);
  f.setEditMode("existing"); f.setOriginalAction("turnOff");
  assert.deepEqual(f.controller.value().originalLights, frozen.sharedInput.originalLights);
  f.draw("point", .2, .2, .2, .2);
  assert.equal(f.node("[data-relight-original-lights]").hidden, false);
  f.setOriginalLights("turnOff");
  assert.equal(f.node("[data-relight-original-lights-amount-field]").hidden, true);
  assert.deepEqual(f.controller.jobRequest({ image: f.source() }).sharedInput.originalLights, { action: "turnOff" });
  assert.deepEqual(frozen.sharedInput.originalLights, { action: "darken", amount: .7 });
  f.node("[data-relight-clear]").fire("click");
  assert.equal(f.controller.isAvailable(), true, "全部关闭本身有效，不需要光源标注");
  f.setOriginalLights("keep"); assert.equal(f.controller.isAvailable(), false);
});

test("整体原灯和可选标注同为私有草稿，模板不应用且换图清零，配置刷新保留", () => {
  const f = fixture({ manual: true }); f.setOriginalLights("darken");
  f.node("[data-relight-original-lights-amount]").value = "90"; f.node("[data-relight-original-lights-amount]").fire("input");
  f.draw("line", .2, .2, .6, .2); const draft = f.controller.value();
  f.pickTemplate("warmAmbient");
  assert.equal(f.node("[data-relight-original-lights]").hidden, true);
  assert.deepEqual(f.controller.value().lights, []); assert.equal(f.controller.value().originalLights, null);
  const input = f.controller.jobRequest({ image: f.source() }).sharedInput;
  assert.equal(input.originalLights, null); assert.deepEqual(input.lights, []);
  f.controller.configure({ available: false, reason: "读取中" }); f.controller.configure(f.config);
  f.pickTemplate("custom"); assert.deepEqual(f.controller.value(), draft);
  f.pickTemplate("softStudio"); f.setSource({ ...f.source(), id: "new-source-global" }); f.pickTemplate("custom");
  assert.deepEqual(f.controller.value().originalLights, { action: "keep" }); assert.deepEqual(f.controller.value().lights, []);
  assert.equal(f.controller.isAvailable(), false);
  f.setOriginalLights("turnOff"); f.pickTemplate("naturalFill");
  assert.match(f.node("[data-relight-context]").textContent, /原有灯光设置草稿未应用/);
  f.pickTemplate("custom"); assert.deepEqual(f.controller.jobRequest({ image: f.source() }).sharedInput.originalLights, { action: "turnOff" });
});

test("历史整体参数按值恢复/冻结，省略字段自定义回保留且非默认成本参数不丢", () => {
  const f = fixture(), global = { action: "darken", amount: .1 };
  f.controller.restore({ templateKey: "custom", originalLights: global, lights: [], outputResolution: "2K", quality: "high", blendMode: "subtle" });
  const frozen = f.controller.jobRequest({ image: f.source() }); global.amount = .8;
  const exposed = f.controller.value(); exposed.originalLights.amount = .9;
  assert.deepEqual(f.controller.value().originalLights, { action: "darken", amount: .1 });
  f.setOriginalLights("turnOff"); assert.deepEqual(frozen.sharedInput.originalLights, { action: "darken", amount: .1 });
  assert.equal(frozen.sharedInput.outputResolution, "2K"); assert.equal(frozen.sharedInput.quality, "high"); assert.equal(frozen.sharedInput.blendMode, "subtle");
  f.controller.restore({ lights: [], outputResolution: "2K", quality: "high", blendMode: "subtle" });
  assert.deepEqual(f.controller.value().originalLights, { action: "keep" });
  assert.equal(f.controller.value().templateKey, "custom"); assert.match(f.node("[data-relight-history-parameters]").textContent, /2K.*high.*轻微/);
  assert.equal(f.controller.isAvailable(), false);
  assert.throws(() => f.controller.restore({ templateKey: "naturalFill", lights: [], originalLights: { action: "turnOff" } }), /仅用于自定义/);
});

test("旧服务缺少整体原灯目录时禁用生成，恢复目录不清全局操作或标注", () => {
  const f = fixture({ manual: true }); f.setOriginalLights("turnOff"); const before = f.controller.value();
  for (const originalLightActions of [undefined, RELIGHT_ORIGINAL_LIGHT_ACTIONS.filter(item => item.key !== "turnOff")]) {
    f.controller.configure({ ...f.config, originalLightActions });
    assert.equal(f.controller.isAvailable(), false); assert.throws(() => f.controller.jobRequest({ image: f.source() }), /整体原灯操作.*重新启动/);
    assert.deepEqual(f.controller.value(), before);
  }
  f.controller.configure(f.config); assert.equal(f.controller.isAvailable(), true);
  assert.deepEqual(f.controller.value(), before);
});

test("默认模板直接生成且无两个折叠入口或生成参数控件，新任务固定1K/medium/balanced", () => {
  const f = fixture(), markup = f.node("root").innerHTML;
  assert.doesNotMatch(markup, /<details|<summary|data-relight-generation|data-relight-output|data-relight-quality|data-relight-blend/);
  assert.equal(f.controller.value().templateKey, "naturalFill");
  assert.equal(f.node("[data-relight-editor]").hidden, true);
  assert.equal(f.node(".relight-toolbar").hidden, true);
  assert.equal(f.canvas.attributes.get("aria-disabled"), "true");
  f.draw("point", .2, .2, .2, .5); f.node("[data-relight-add]").fire("click");
  assert.deepEqual(f.controller.value().lights, []);
  for (const button of f.templates.filter(button => button.dataset.relightTemplate !== "custom")) {
    button.fire("click"); const request = f.controller.jobRequest({ image: f.source() });
    assert.equal(request.sharedInput.templateKey, button.dataset.relightTemplate);
    assert.deepEqual(request.sharedInput.lights, []);
    assert.equal(request.sharedInput.originalLights, null);
    assert.equal(request.sharedInput.outputResolution, "1K"); assert.equal(request.sharedInput.quality, "medium"); assert.equal(request.sharedInput.blendMode, "balanced");
    assert.equal(request.items[0].key, "gptImage25Sunburst");
  }
});

test("自定义直接显示光源面板和点线面工具，模板不提交也不绘制草稿，切回恢复完整草稿", () => {
  const f = fixture(); f.pickTemplate("custom");
  assert.equal(f.node("[data-relight-editor]").hidden, false); assert.equal(f.node(".relight-toolbar").hidden, false);
  assert.throws(() => f.controller.jobRequest({ image: f.source() }), /整体减弱、全部关闭/);
  f.setEditMode("existing"); f.draw("area", .2, .2, .6, .5);
  const draft = f.controller.value().lights, frozen = f.controller.jobRequest({ image: f.source() });
  const beforeRender = f.calls.length; f.pickTemplate("warmAmbient");
  assert.equal(f.node("[data-relight-editor]").hidden, true); assert.equal(f.node(".relight-toolbar").hidden, true);
  assert.deepEqual(f.controller.value().lights, []);
  assert.equal(f.calls.slice(beforeRender).some(call => call[0] === "fillText"), false, "模板画布没有草稿标记");
  assert.deepEqual(f.controller.jobRequest({ image: f.source() }).sharedInput.lights, []);
  assert.match(f.node("[data-relight-context]").textContent, /1处自定义草稿未应用/);
  f.draw("point", .8, .8, .8, .9); f.canvas.fire("keydown", { key: "Delete" }); f.node("[data-relight-clear]").fire("click");
  assert.deepEqual(f.controller.value().lights, []);
  f.pickTemplate("windowDaylight"); assert.deepEqual(f.controller.jobRequest({ image: f.source() }).sharedInput.lights, []);
  f.pickTemplate("custom"); assert.deepEqual(f.controller.value().lights, draft);
  assert.deepEqual(f.controller.jobRequest({ image: f.source() }).sharedInput.lights, draft);
  assert.deepEqual(frozen.sharedInput.lights, draft);
  f.node("[data-relight-delete]").fire("click"); assert.equal(f.controller.value().lights.length, 0);
});

test("切换模板保留两灯具模式及光源参数为草稿，返回自定义后原样应用", () => {
  const f = fixture({ manual: true }); f.draw("point", .2, .2, .3, .5); f.modes[1].fire("click");
  f.node("[data-relight-fixture]").value = "黑色射灯"; f.node("[data-relight-fixture]").fire("input");
  const original = f.controller.value().lights;
  f.pickTemplate("warmAmbient"); const request = f.controller.jobRequest({ image: f.source() });
  assert.deepEqual(request.sharedInput.lights, []); assert.equal(request.sharedInput.templateKey, "warmAmbient");
  f.pickTemplate("windowDaylight"); f.pickTemplate("custom");
  assert.deepEqual(f.controller.value().lights, original);
  assert.deepEqual(f.controller.jobRequest({ image: f.source() }).sharedInput.lights, original);
  assert.deepEqual(request.sharedInput.lights, [], "冻结的模板请求不随草稿恢复变化");
});

test("模板保持完整键盘单选，custom直接编辑，旧服务缺少编辑能力时阻断提交", () => {
  const f = fixture(); f.templates[0].fire("keydown", { key: "ArrowRight" });
  assert.equal(f.controller.value().templateKey, "warmAmbient"); assert.equal(f.document.activeElement, f.templates[1]);
  f.templates[1].fire("keydown", { key: "End" }); assert.equal(f.controller.value().templateKey, "custom");
  assert.equal(f.node("[data-relight-editor]").hidden, false);
  f.controller.configure({ ...f.config, templates: RELIGHT_TEMPLATES.filter(item => item.key !== "windowDaylight") });
  f.templates[1].fire("keydown", { key: "ArrowRight" }); assert.equal(f.controller.value().templateKey, "accentWash");
  assert.equal(f.templates[2].disabled, true);
  f.controller.configure({ ...f.config, actions: undefined });
  assert.equal(f.controller.isAvailable(), false); assert.throws(() => f.controller.jobRequest({ image: f.source() }), /重新启动/);
});

test("自定义草稿切到模板再换原图时清空旧坐标，权限刷新不会清理同图草稿", () => {
  const f = fixture({ manual: true }); f.draw("line", .2, .2, .6, .2); const draft = f.controller.value().lights;
  f.pickTemplate("warmAmbient");
  f.controller.configure({ available: false, reason: "读取模型权限中" }); f.controller.configure(f.config);
  f.pickTemplate("custom"); assert.deepEqual(f.controller.value().lights, draft);
  f.pickTemplate("windowDaylight"); f.setSource({ ...f.source(), id: "new-source-after-draft" });
  f.pickTemplate("custom"); assert.deepEqual(f.controller.value().lights, []);
  assert.throws(() => f.controller.jobRequest({ image: f.source() }), /整体减弱、全部关闭/);
});

test("旧模板加光源恢复时直接可见且保留确切设置，历史输出质量幅度用只读摘要提示", () => {
  const f = fixture({ manual: true }); f.draw("point", .2, .2, .3, .5); f.modes[1].fire("click");
  const lights = f.controller.value().lights;
  const historical = { lights, originalLights: null, templateKey: "warmAmbient", outputResolution: "2K", quality: "high", blendMode: "subtle" };
  f.controller.restore(historical);
  assert.deepEqual(f.controller.value(), historical);
  assert.equal(f.node("[data-relight-editor]").hidden, false); assert.equal(f.node(".relight-toolbar").hidden, false);
  assert.match(f.node("[data-relight-context]").textContent, /暖居夜景.*1处光源调整/);
  assert.equal(f.node("[data-relight-history-parameters]").hidden, false);
  assert.match(f.node("[data-relight-history-parameters]").textContent, /2K.*high.*轻微/);
  const frozen = f.controller.jobRequest({ image: f.source() });
  assert.deepEqual(frozen.sharedInput.lights, lights); assert.equal(frozen.sharedInput.templateKey, "warmAmbient");
  assert.equal(frozen.sharedInput.outputResolution, "2K"); assert.equal(frozen.sharedInput.quality, "high"); assert.equal(frozen.sharedInput.blendMode, "subtle");
  f.controller.configure(f.config); assert.deepEqual(f.controller.value(), historical);
  f.pickTemplate("windowDaylight"); assert.deepEqual(f.controller.value().lights, []);
  assert.deepEqual(f.controller.jobRequest({ image: f.source() }).sharedInput.lights, []);
  assert.deepEqual(frozen.sharedInput.lights, lights);
  f.pickTemplate("custom"); assert.deepEqual(f.controller.value().lights, lights);
});

test("旧任务省略模板仍进入自定义，非默认参数完整冻结且不会被目录刷新替换", () => {
  const f = fixture({ manual: true }); f.draw("line", .2, .2, .6, .2); const lights = f.controller.value().lights;
  f.controller.restore({ lights, outputResolution: "4K", quality: "max", blendMode: "pronounced" });
  assert.equal(f.controller.value().templateKey, "custom"); assert.equal(f.node("[data-relight-editor]").hidden, false);
  assert.match(f.node("[data-relight-history-parameters]").textContent, /4K.*max.*明显/);
  f.controller.configure(f.config);
  const input = f.controller.jobRequest({ image: f.source() }).sharedInput;
  assert.equal(input.outputResolution, "4K"); assert.equal(input.quality, "max"); assert.equal(input.blendMode, "pronounced");
  assert.deepEqual(input.lights, lights);
  assert.throws(() => f.controller.restore({ lights, templateKey: "missing" }), /模板/);
});

test("新增和原灯先选方式再标注，同任务混用且原灯没有方向/灯具/色温参数", () => {
  const f = fixture({ manual: true }); f.draw("point", .1, .1, .2, .4);
  const added = f.controller.value().lights[0];
  f.node("[data-relight-intensity]").value = ".3"; f.node("[data-relight-intensity]").fire("input");
  assert.equal(f.controller.value().lights[0].intensity, .3); assert.equal(f.controller.value().lights[0].action, "brighten");
  assert.equal(f.node("[data-relight-original-field]").hidden, true);
  assert.doesNotMatch(f.node("root").innerHTML, /data-relight-action[ >]|光源调整<\/span>/);
  f.setEditMode("existing");
  assert.equal(f.node("[data-relight-properties]").hidden, true);
  assert.equal(f.node("[data-relight-original-field]").hidden, false);
  assert.equal(f.controller.value().lights[0].action, added.action, "切换编辑方式不能转换已有新增光源");
  f.draw("area", .4, .4, .7, .7);
  assert.equal(f.node("[data-relight-brighten-fields]").hidden, true);
  assert.equal(f.node("[data-relight-darken-field]").hidden, false);
  f.node("[data-relight-amount]").value = "70"; f.node("[data-relight-amount]").fire("input");
  const frozen = f.controller.jobRequest({ image: f.source() });
  assert.equal(frozen.sharedInput.lights[1].amount, .7);
  f.node("[data-relight-amount]").value = "30"; f.node("[data-relight-amount]").fire("input");
  assert.equal(frozen.sharedInput.lights[1].amount, .7);
  f.setEditMode("existing"); f.setOriginalAction("turnOff"); f.draw("line", .6, .1, .9, .1);
  const lights = f.controller.jobRequest({ image: f.source() }).sharedInput.lights;
  assert.deepEqual(lights.map(item => item.action), ["brighten", "darken", "turnOff"]);
  for (const light of lights.slice(1)) for (const key of ["target", "mode", "kelvin", "intensity", "softness", "fixture"]) assert.equal(Object.hasOwn(light, key), false);
  assert.deepEqual(f.node("[data-relight-original-action]").options.map(item => item.value), ["darken", "turnOff"]);
  const list = f.node("[data-relight-list]");
  for (const [index, mode] of [[0, "new"], [1, "existing"], [2, "existing"]]) {
    list.children[index].fire("click");
    assert.equal(f.editModes.find(button => button.dataset.relightEditMode === mode).getAttribute("aria-checked"), "true");
    assert.equal(f.node("[data-relight-original-field]").hidden, mode === "new");
  }
  list.children[0].fire("click"); f.setOriginalAction("darken");
  assert.equal(f.controller.value().lights[0].action, "brighten", "隐藏的原灯控件也不能转换新增光源");
  f.draw("point", .9, .8, .9, .9); assert.equal(f.controller.value().lights[3].action, "brighten");
});

test("原灯减弱/关闭可互换与撤销，新增光源/原灯禁止跨类转换", () => {
  const f = fixture({ canvasOnly: true }); f.draw("line", .2, .2, .6, .2);
  const added = f.drawing.value()[0];
  f.drawing.update({ action: "darken" }); assert.deepEqual(f.drawing.value()[0], added);
  f.drawing.setDrawingAction("darken"); f.draw("point", .8, .2, .8, .2);
  assert.equal(f.drawing.value()[1].action, "darken");
  f.drawing.update({ action: "brighten" }); assert.equal(f.drawing.value()[1].action, "darken");
  f.drawing.update({ action: "turnOff" });
  assert.deepEqual(Object.keys(f.drawing.value()[1]).sort(), ["action", "id", "points", "type"]);
  f.node("[data-relight-undo]").fire("click"); assert.equal(f.drawing.value()[1].action, "darken");
  f.drawing.update({ kelvin: 6500, target: { x: .4, y: .4 } });
  assert.equal(Object.hasOwn(f.drawing.value()[1], "kelvin"), false);
  assert.equal(Object.hasOwn(f.drawing.value()[1], "target"), false);
  const preserved = { id: "P3", type: "point", action: "preserve", points: [{ x: .4, y: .8 }] };
  f.drawing.restore([preserved]); f.drawing.update({ action: "darken", points: [{ x: .5, y: .8 }] });
  assert.deepEqual(f.drawing.value(), [preserved], "历史保持标注不能经程序接口转换或改动坐标");
});

test("编辑方式键盘单选和中央添加遵循绘制前动作，切方式不修改旧标注", () => {
  const f = fixture({ manual: true });
  f.editModes[0].fire("keydown", { key: "End" });
  assert.equal(f.document.activeElement, f.editModes[1]);
  f.setOriginalAction("turnOff"); f.node("[data-relight-add]").fire("click");
  const original = f.controller.value().lights[0];
  assert.equal(original.action, "turnOff"); assert.equal(Object.hasOwn(original, "target"), false);
  assert.match(f.node("[data-relight-drawing-status]").textContent, /关闭原灯.*已有灯具/);
  f.editModes[1].fire("keydown", { key: "Home" });
  assert.equal(f.document.activeElement, f.editModes[0]);
  f.tools[2].fire("click"); f.node("[data-relight-add]").fire("click");
  assert.deepEqual(f.controller.value().lights[0], original);
  assert.equal(f.controller.value().lights[1].action, "brighten");
  assert.ok(f.controller.value().lights[1].target);
  f.canvas.fire("keydown", { key: "z", ctrlKey: true });
  assert.deepEqual(f.controller.value().lights, [original]);
  assert.equal(f.node("[data-relight-properties]").hidden, true, "撤销恢复新增前的未选中状态");
  f.node("[data-relight-list]").children[0].fire("click");
  assert.equal(f.editModes[1].getAttribute("aria-checked"), "true", "选择剩余原灯后自动路由");
});

test("历史保持对象只读/可删除，无新建入口且仅保护的自定义仍阻断提交", () => {
  const f = fixture();
  const preserved = { id: "P1", type: "area", action: "preserve", points: [{ x: .2, y: .2 }, { x: .5, y: .2 }, { x: .5, y: .5 }, { x: .2, y: .5 }] };
  f.controller.restore({ templateKey: "custom", lights: [preserved] });
  assert.equal(f.node("[data-relight-editor]").hidden, false);
  assert.equal(f.node("[data-relight-original-field]").hidden, true);
  assert.equal(f.node("[data-relight-properties]").disabled, true);
  assert.match(f.node("[data-relight-action-note]").textContent, /仅可查看或删除/);
  assert.equal(f.node("[data-relight-brighten-fields]").hidden, true);
  assert.equal(f.node("[data-relight-darken-field]").hidden, true);
  assert.throws(() => f.controller.jobRequest({ image: f.source() }), /仅保持不变无需生成/);
  f.tools[0].fire("click"); f.fire("pointerdown", .3, .3); f.fire("pointermove", .8, .8); f.fire("pointerup", .8, .8);
  f.canvas.fire("keydown", { key: "ArrowRight" }); f.canvas.fire("keydown", { key: "ArrowDown", shiftKey: true });
  assert.deepEqual(f.controller.value().lights, [preserved]);
  f.node("[data-relight-delete]").fire("click"); assert.deepEqual(f.controller.value().lights, []);
  f.node("[data-relight-undo]").fire("click"); assert.deepEqual(f.controller.value().lights, [preserved]);
  f.controller.restore({ templateKey: "naturalFill", lights: [preserved] });
  assert.deepEqual(f.controller.jobRequest({ image: f.source() }).sharedInput.lights, [preserved]);
  f.setEditMode("new"); f.draw("point", .7, .7, .7, .9);
  assert.equal(f.controller.value().lights[1].action, "brighten");
  f.node("[data-relight-list]").children[0].fire("click");
  const before = f.controller.value(); f.controller.configure({ ...f.config, actions: RELIGHT_ACTIONS.filter(item => item.key !== "preserve") });
  assert.equal(f.controller.isAvailable(), false); assert.deepEqual(f.controller.value(), before);
});

test("无方向光源仍可缩放移动与取消撤销，Shift方向键不访问照射目标", () => {
  const f = fixture({ manual: true }); f.setEditMode("existing"); f.draw("area", .2, .2, .6, .5);
  f.fire("pointerdown", .6, .2); f.fire("pointermove", .7, .25); f.fire("pointerup", .7, .25);
  assert.deepEqual(f.controller.value().lights[0].points[1], { x: .7, y: .25 });
  const before = f.controller.value(); f.canvas.fire("keydown", { key: "ArrowRight", shiftKey: true }); assert.deepEqual(f.controller.value(), before);
  f.tools[0].fire("click"); f.fire("pointerdown", .4, .4); f.fire("pointermove", .9, .8); f.fire("pointerup", .9, .8);
  assert.ok(f.controller.value().lights[0].points.every(point => point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1));
  const moved = f.controller.value(); f.fire("pointerdown", .9, .8); f.fire("pointermove", .6, .5); f.fire("pointercancel", .6, .5); assert.deepEqual(f.controller.value(), moved);
  f.node("[data-relight-undo]").fire("click"); assert.deepEqual(f.controller.value(), before);
});

test("旧灯与三类旧方案恢复不丢身份，普通编辑仅要求三类动作支持", () => {
  const f = fixture({ manual: true }); f.draw("point", .2, .2, .2, .5);
  const legacyLight = { ...f.controller.value().lights[0] }; delete legacyLight.action;
  for (const key of ["mainLight", "noMainLight", "naturalDaylight"]) {
    f.controller.restore({ lights: [legacyLight], templateKey: key, blendMode: "balanced" });
    assert.equal(f.controller.value().lights[0].action, "brighten"); assert.equal(f.controller.value().templateKey, key);
    assert.equal(f.node("[data-relight-context]").hidden, false);
    assert.match(f.node("[data-relight-context]").textContent, /已恢复.*光源调整/);
    assert.equal(f.controller.jobRequest({ image: f.source() }).sharedInput.templateKey, key);
  }
  f.pickTemplate("warmAmbient"); assert.equal(f.node("[data-relight-legacy-template]").hidden, true);
  f.controller.configure({ ...f.config, actions: RELIGHT_ACTIONS.filter(item => item.key !== "preserve") }); assert.equal(f.controller.isAvailable(), true);
  f.controller.configure({ ...f.config, actions: RELIGHT_ACTIONS.filter(item => item.key !== "darken") });
  assert.equal(f.controller.isAvailable(), false); assert.throws(() => f.controller.jobRequest({ image: f.source() }), /重新启动/);
});

test("真实共享原灯下拉随选择同步，新增和历史保护隐藏操作且回显不增加撤销历史", () => {
  const f = fixture({ manual: true }), select = f.node("[data-relight-original-action]"); let displayedLabel = "";
  enhanceSearchableSelect(select, () => ({ setDisabled() {}, destroy() {}, render(catalog, keys) { displayedLabel = catalog.find(item => item.key === keys[0])?.label || ""; } }), { searchable: false });
  assert.equal(displayedLabel, "减弱原灯");
  f.draw("point", .1, .1, .1, .4);
  f.setEditMode("existing"); f.draw("area", .3, .3, .5, .5); assert.equal(displayedLabel, "减弱原灯");
  f.setEditMode("existing"); f.setOriginalAction("turnOff"); f.draw("line", .6, .1, .9, .1); assert.equal(displayedLabel, "关闭原灯");
  const existing = f.controller.value();
  f.controller.restore({ ...existing, lights: [...existing.lights, { id: "P4", type: "point", action: "preserve", points: [{ x: .8, y: .8 }] }] });
  const items = f.node("[data-relight-list]");
  for (const [index, label] of [[2, "关闭原灯"], [1, "减弱原灯"], [2, "关闭原灯"]]) {
    items.children[index].fire("click"); assert.equal(displayedLabel, label); assert.equal(select.value, f.controller.value().lights[index].action);
  }
  for (const index of [0, 3]) { items.children[index].fire("click"); assert.equal(f.node("[data-relight-original-field]").hidden, true); }
  items.children[1].fire("click"); f.draw("point", .9, .9, .9, .7); f.node("[data-relight-undo]").fire("click");
  assert.equal(f.controller.value().lights.length, 4); assert.equal(displayedLabel, "减弱原灯");
  f.node("[data-relight-undo]").fire("click"); assert.equal(f.controller.value().lights.length, 4, "选中和下拉回显不产生撤销项");
});


test("模板名称与说明体现五种重建光影方向，默认与旧请求身份保持兼容", () => {
  assert.deepEqual(RELIGHT_TEMPLATES.map(item => [item.key, item.label]), [
    ["naturalFill", "明亮漫射"], ["warmAmbient", "暖居夜景"], ["windowDaylight", "窗边斜阳"],
    ["accentWash", "重点洗墙"], ["softStudio", "柔和摄影"], ["custom", "自定义"],
  ]);
  assert.equal(RELIGHT_TEMPLATES.find(item => item.key === "custom").description, "调整原有灯光，可选新增光源或单灯精修");
  const byKey = Object.fromEntries(RELIGHT_TEMPLATES.map(item => [item.key, item]));
  assert.match(byKey.naturalFill.description, /中性.*漫射.*投影/);
  assert.match(byKey.warmAmbient.description, /压低日光.*暖灯.*夜景/);
  assert.match(byKey.windowDaylight.description, /方向光.*长投影/);
  assert.match(byKey.accentWash.description, /压低环境光.*自上而下/);
  assert.match(byKey.softStudio.description, /中性.*侧光.*层次/);
  for (const item of RELIGHT_TEMPLATES.filter(item => item.key !== "custom")) assert.doesNotMatch(item.description, /沿用|补足暗部|协调已有|依据原图亮暗/);
  for (const item of RELIGHT_BLEND_MODES) assert.match(item.description, /新方案/);
  assert.match(RELIGHT_BLEND_MODES.find(item => item.key === "balanced").description, /重建光影/);
  assert.equal(RELIGHT_DEFAULT_TEMPLATE_KEY, "naturalFill");
  assert.deepEqual(normalizeRelightSettings({}), { templateKey: "custom", blendMode: "balanced" });
  assert.deepEqual(RELIGHT_LEGACY_TEMPLATES.map(item => item.key), ["mainLight", "noMainLight", "naturalDaylight"]);
  for (const item of RELIGHT_TEMPLATES.filter(item => item.key !== "custom")) {
    const f = fixture(); f.pickTemplate(item.key);
    assert.equal(f.node("[data-relight-template-note]").textContent, item.description);
    assert.equal(f.controller.jobRequest({ image: f.source() }).sharedInput.templateKey, item.key);
  }
});


test("只回显Prompt当前版本和飞书链接，不增加选择器；缺失或无效身份时阻断新任务", () => {
  const f = fixture({ manual: true }); f.draw("point", .2, .2, .2, .5); const before = f.controller.value();
  assert.equal(f.node("[data-relight-availability]").textContent, "Prompt v7");
  assert.equal(f.node("[data-relight-prompt-link]").href, f.config.prompt.tableUrl);
  assert.equal(f.node("[data-relight-prompt-link]").hidden, false);
  assert.doesNotMatch(f.node("root").innerHTML, /<details|<summary|data-relight-generation|data-relight-output|data-relight-quality/);
  for (const prompt of [undefined, { ...f.config.prompt, available: false, reason: "当前没有上架版本" },
    { ...f.config.prompt, code: "wrong-code" }, { ...f.config.prompt, version: 0 },
    { ...f.config.prompt, version: "7" }, { ...f.config.prompt, sha256: "bad" }]) {
    f.controller.configure({ ...f.config, prompt });
    assert.equal(f.controller.isAvailable(), false);
    assert.throws(() => f.controller.jobRequest({ image: f.source() }));
    assert.deepEqual(f.controller.value(), before, "Prompt失效不清空原图上的编辑状态");
  }
});

test("Prompt身份在请求中按值冻结，配置换版不改已排队版本或图像编辑参数", () => {
  const f = fixture({ manual: true }); f.setEditMode("existing"); f.draw("line", .2, .2, .6, .2);
  const first = f.controller.jobRequest({ image: f.source() }), before = f.controller.value();
  assert.equal(first.sharedInput.relightPromptVersion, 7); assert.equal(first.sharedInput.relightPromptSha256, "a".repeat(64));
  f.controller.configure({ ...f.config, prompt: { ...f.config.prompt, version: 8, sha256: "b".repeat(64) } });
  const second = f.controller.jobRequest({ image: f.source() });
  assert.deepEqual(f.controller.value(), before);
  assert.equal(second.sharedInput.relightPromptVersion, 8); assert.equal(second.sharedInput.relightPromptSha256, "b".repeat(64));
  assert.equal(first.sharedInput.relightPromptVersion, 7); assert.equal(first.sharedInput.relightPromptSha256, "a".repeat(64));
  assert.equal(f.node("[data-relight-availability]").textContent, "Prompt v8");
});

test("专用强制刷新互斥并保留原图/隐藏草稿/历史参数，完成后使用最新Prompt身份", async () => {
  let f, release; const calls = [], gate = new Promise(resolve => { release = resolve; });
  f = fixture({ manual: true, onRefresh: async options => {
    calls.push(options); f.controller.configure({ available: false, loading: true, reason: "读取打光配置中…" });
    await gate;
    f.controller.configure({ ...f.config, prompt: { ...f.config.prompt, version: 8, sha256: "c".repeat(64) } });
  } });
  f.draw("point", .2, .2, .2, .5);
  f.controller.restore({ ...f.controller.value(), outputResolution: "2K", quality: "high", blendMode: "subtle" });
  f.setOriginalLights("darken");
  const draft = f.controller.value().lights; f.pickTemplate("warmAmbient"); const before = f.controller.value(), source = f.source();
  const button = f.node("[data-relight-prompt-refresh]"), pending = button.fire("click");
  assert.equal(button.disabled, true); assert.equal(f.node("[data-relight-refresh-label]").textContent, "刷新中");
  assert.equal(f.controller.isAvailable(), false); assert.deepEqual(f.controller.value(), before);
  assert.equal(f.node("[data-relight-prompt-link]").href, f.config.prompt.tableUrl, "读取期间仍可查看已知飞书表");
  await button.fire("click"); assert.equal(calls.length, 1);
  release(); await pending;
  assert.deepEqual(calls, [{ forceRefresh: true }]); assert.equal(button.disabled, false);
  assert.equal(f.source(), source); assert.deepEqual(f.controller.value(), before);
  f.pickTemplate("custom"); assert.deepEqual(f.controller.value().lights, draft);
  const request = f.controller.jobRequest({ image: f.source() });
  assert.deepEqual(request.sharedInput.originalLights, { action: "darken", amount: .5 });
  assert.equal(request.sharedInput.outputResolution, "2K"); assert.equal(request.sharedInput.quality, "high"); assert.equal(request.sharedInput.blendMode, "subtle");
  assert.equal(request.sharedInput.relightPromptVersion, 8); assert.equal(request.sharedInput.relightPromptSha256, "c".repeat(64));
});

test("刷新失败保留编辑并可重试，飞书管理链接拒绝非HTTPS或非飞书地址", async () => {
  let f; f = fixture({ manual: true, onRefresh: async () => {
    f.controller.configure({ available: false, loading: true, reason: "读取打光配置中…" }); throw new Error("network unavailable");
  } });
  f.draw("area", .2, .2, .6, .5); const before = f.controller.value();
  await f.node("[data-relight-prompt-refresh]").fire("click");
  assert.equal(f.node("[data-relight-prompt-refresh]").disabled, false);
  assert.match(f.controller.availabilityReason(), /刷新失败.*network unavailable/);
  assert.deepEqual(f.controller.value(), before);
  for (const tableUrl of ["javascript:alert(1)", "http://lq9n5lvfn2i.feishu.cn/base/x", "https://example.com/base/x"]) {
    f.controller.configure({ ...f.config, prompt: { ...f.config.prompt, tableUrl } });
    assert.equal(f.node("[data-relight-prompt-link]").hidden, true);
    assert.equal(f.controller.isAvailable(), true, "管理链接无效不篡改已验证的Prompt身份");
  }
});

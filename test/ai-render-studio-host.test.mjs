/**
 * [INPUT]: 依赖正式渲染台宿主、主目录/编排/布局源码和内存DOM/历史记录替身
 * [OUTPUT]: 验证独立入口、设计实验室下架、原控件挂载、保活交接、移动抽屉、浮层切换和旧动作恢复
 * [POS]: test 的主工作台渲染台集成合同，不加载真实iframe、不调用网络或生图模型
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { bindAiRenderStudioHost } from "../public/ai-render-studio-host.js";

function fixture() {
  const created = [], events = [], menus = [], map = new Map(), listeners = new Map();
  const win = { location: { href: "http://127.0.0.1:4192/?other=keep#result", origin: "http://127.0.0.1:4192" },
    history: { state: { saved: true }, replaceState(state, _title, url) {
      assert.deepEqual(state, { saved: true }); win.location.href = String(url);
    } }, Event: class { constructor(type) { this.type = type; } },
    addEventListener(type, listener) { listeners.set(type, listener); },
    dispatchEvent(event) { events.push(event.type); listeners.get(event.type)?.(event); } };
  const doc = { defaultView: win, querySelector: (selector) => map.get(selector) || null,
    querySelectorAll: (selector) => selector === "[popover]" ? menus : [],
    createElement(tagName) {
      const classes = new Set(), attributes = new Map(), children = [];
      const node = { tagName, ownerDocument: doc, children, hidden: false, inert: false, dataset: {},
        classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name), contains: (name) => classes.has(name),
          toggle(name, active) { classes[active ? "add" : "delete"](name); } },
        get isConnected() { return this === doc.body || Boolean(this.parentNode?.isConnected); },
        append(...nodes) {
          for (const child of nodes) {
            const siblings = child.parentNode?.children;
            if (siblings) siblings.splice(siblings.indexOf(child), 1);
            child.parentNode = node;
            children.push(child);
          }
        },
        moveBefore(child, before) {
          assert.equal(before, null);
          assert.ok(this.isConnected && child.isConnected);
          this.append(child);
          child.atomicMoves = (child.atomicMoves || 0) + 1;
        },
        setAttribute: (name, value) => attributes.set(name, String(value)),
        getAttribute: (name) => attributes.get(name) ?? null };
      if (tagName === "iframe") {
        const frameEvents = new Map(), messages = [];
        node.addEventListener = (event, handler) => {
          const handlers = frameEvents.get(event) || [];
          handlers.push(handler);
          frameEvents.set(event, handlers);
        };
        node.fire = (event) => frameEvents.get(event)?.forEach((handler) => handler());
        node.messages = messages;
        node.contentWindow = { postMessage: (...args) => messages.push(args) };
        let source;
        node.sourceWrites = 0;
        Object.defineProperty(node, "src", { get: () => source, set(value) { source = value; node.sourceWrites += 1; } });
      }
      created.push(node); return node;
    } };
  doc.body = doc.createElement("body");
  const root = doc.createElement("main"), panel = doc.createElement("aside"), directory = doc.createElement("nav");
  doc.body.append(root, panel);
  const scroll = doc.createElement("div"), actions = doc.createElement("section"), result = doc.createElement("section");
  scroll.inputValue = "旧功能用户输入"; actions.runningJob = { jobId: "old-job-keep", status: "running" };
  const dialog = { open: false, closeCount: 0, close() { this.open = false; this.closeCount += 1; } };
  const buttons = ["whiteModel", "aiRenderStudio", "refinedModel", "sceneCast", "housePlanLayout"].map((featureMode) => {
    const button = doc.createElement("button"); button.dataset.featureMode = featureMode;
    button.setAttribute("aria-checked", String(featureMode === "whiteModel")); return button;
  });
  directory.querySelectorAll = (selector) => selector === "[data-feature-mode]" ? buttons : [];
  panel.querySelector = (selector) => ({ ".control-panel-scroll": scroll, ".action-section": actions })[selector] || null;
  root.querySelector = (selector) => selector === ".result-panel" ? result : null;
  map.set("#configurationPanel", panel); map.set("#workspacePanelDialog", dialog); map.set("#featureModeList", directory);
  const host = bindAiRenderStudioHost({ root });
  return { host, root, doc, panel, scroll, actions, result, dialog, buttons, events, menus,
    created, frame: () => created.find(({ tagName }) => tagName === "iframe"), container: () => root.children[0] };
}

function conversation(f, onFeatureChange) {
  const { doc } = f;
  const mount = doc.createElement("div"), parameters = doc.createElement("div"), actions = doc.createElement("div");
  doc.body.append(mount, parameters, actions);
  return { embedded: true, mount, parameters, actions, onFeatureChange };
}

test("正式目录项使用同源独立宿主，不保留预览链接或接入普通生成模式", async () => {
  const [html, app, hostSource] = await Promise.all([
    readFile(new URL("../public/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/app.js", import.meta.url), "utf8"),
    readFile(new URL("../public/ai-render-studio-host.js", import.meta.url), "utf8"),
  ]);
  assert.match(html, /<button[^>]*data-feature-mode="aiRenderStudio"[^>]*>AI渲染台<\/button>/);
  assert.doesNotMatch(html, /feature-preview-link/);
  assert.match(app, /from "\.\/ai-render-studio-host\.js\?v=\d+"/);
  assert.match(app, /if \(featureMode === "aiRenderStudio"\) \{ aiRenderStudioHost\.show\(\); return; \}/);
  assert.doesNotMatch(app.match(/const supported = \[[\s\S]*?\];/)?.[0] || "", /aiRenderStudio/);
  assert.doesNotMatch(hostSource, /fetch\(|\/api\/generation-jobs|method:\s*["']POST/);
});

test("进入后隐藏并inert旧参数/START/结果，iframe只在首次选中时加载", () => {
  const f = fixture();
  assert.equal(f.host.isActive(), false);
  assert.equal(f.frame(), undefined);
  assert.equal(f.container().hidden, true);
  f.host.show();
  assert.equal(f.host.isActive(), true);
  for (const node of [f.scroll, f.actions, f.result]) { assert.equal(node.hidden, true); assert.equal(node.inert, true); }
  assert.equal(f.frame().src, "/ai-render-studio.html?embedded=1");
  assert.equal(f.frame().title, "AI渲染台");
  assert.equal(f.frame().sourceWrites, 1);
  assert.equal(f.container().hidden, false);
  assert.equal(f.container().inert, false);
  assert.equal(f.buttons[1].getAttribute("aria-checked"), "true");
  assert.equal(f.buttons[0].getAttribute("aria-checked"), "false");
});

test("切回再进入保留iframe同一文档及两路输入/任务，不重复写src或创建新页面", () => {
  const f = fixture();
  const previousJob = f.actions.runningJob;
  f.host.show();
  const frame = f.frame();
  frame.applicationState = { input: "渲染台用户输入", jobId: "studio-existing-job", status: "running" };
  f.host.show();
  f.host.hide("refinedModel");
  assert.equal(f.host.isActive(), false);
  for (const node of [f.scroll, f.actions, f.result]) { assert.equal(node.hidden, false); assert.equal(node.inert, false); }
  assert.equal(f.scroll.inputValue, "旧功能用户输入");
  assert.equal(f.actions.runningJob, previousJob);
  assert.equal(f.container().children[0], frame);
  assert.equal(f.container().hidden, true);
  assert.ok(f.events.includes("resize"));
  f.host.show();
  assert.equal(f.frame(), frame);
  assert.equal(frame.sourceWrites, 1);
  assert.deepEqual(frame.applicationState, { input: "渲染台用户输入", jobId: "studio-existing-job", status: "running" });
  assert.equal(f.created.filter(({ tagName }) => tagName === "iframe").length, 1);
});

test("重复激活保留浮层，切换时关闭旧浮层，户型布局关闭移动抽屉", () => {
  const f = fixture();
  f.scroll.inert = true; f.result.hidden = true; f.dialog.open = true;
  let closed = 0;
  f.menus.push({ hidePopover() { closed += 1; } }, { hidePopover() { throw new Error("already closed"); } });
  f.host.show();
  assert.equal(closed, 1);
  assert.equal(f.dialog.open, true);
  assert.equal(f.dialog.closeCount, 0);
  f.host.show();
  assert.equal(closed, 1);
  f.host.show("housePlanLayout");
  assert.equal(closed, 2);
  assert.equal(f.dialog.open, false);
  assert.equal(f.dialog.closeCount, 1);
  f.host.hide("whiteModel");
  assert.equal(f.scroll.inert, true);
  assert.equal(f.result.hidden, true);
  assert.equal(f.buttons[0].getAttribute("aria-checked"), "true");
});

test("入口和返回保留其他URL参数及锚点，异步配置刷新不抢占用户所选渲染台", async () => {
  const f = fixture();
  f.host.show();
  assert.equal(f.doc.defaultView.location.href, "http://127.0.0.1:4192/?other=keep&feature=aiRenderStudio#result");
  f.host.hide("refinedModel");
  assert.equal(f.doc.defaultView.location.href, "http://127.0.0.1:4192/?other=keep&feature=refinedModel#result");
  const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  assert.match(app, /if \(aiRenderStudioHost\.isActive\(\) && !navigation\) return/);
  assert.match(app, /selectFeatureMode\(button\.dataset\.featureMode, \{ navigation: true \}\)/);
  assert.match(app, /initialFeature === "aiRenderStudio" \|\| imageTools\.forMode\(initialFeature\)/);
});

test("旧生成函数在渲染台模式直接退出，布局同时隔离旧执行区并适配移动单列", async () => {
  const [app, css] = await Promise.all([
    readFile(new URL("../public/app.js", import.meta.url), "utf8"),
    readFile(new URL("../public/ai-render-studio-host.css", import.meta.url), "utf8"),
  ]);
  assert.match(app, /async function generate\([^\n]*\n\s*if \(aiRenderStudioHost\.isActive\(\)\) return/);
  assert.match(css, /body\.is-ai-render-studio #configurationPanel > :is\(\.control-panel-scroll, \.action-section\)/);
  assert.match(css, /\.workspace\.workspace-panel-layout\.is-ai-render-studio:not\(\.is-docked-workspace\)\s*{\s*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /\.workspace\.is-ai-render-studio:not\(\.is-docked-workspace\) > \.ai-render-studio-host\s*{\s*grid-column: 1/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*?grid-column: 1; grid-row: 2/);
});

test("户型平面布局与渲染台共用保活边界，已下架的实验室不创建画布", () => {
  const f = fixture();
  assert.equal(f.host.supports("floorPlan"), false);
  assert.equal(f.host.show("floorPlan"), false);
  assert.equal(f.frame(), undefined);
  f.host.show("housePlanLayout");
  const floorFrame = f.frame();
  assert.equal(floorFrame.src, "/house-plan.html?embedded=1");
  floorFrame.editedPlan = { furniture: ["用户拖动的沙发"] };
  f.host.show();
  assert.equal(floorFrame.hidden, true);
  assert.equal(floorFrame.inert, true);
  f.host.show("housePlanLayout");
  assert.equal(floorFrame.sourceWrites, 1);
  assert.deepEqual(floorFrame.editedPlan, { furniture: ["用户拖动的沙发"] });
  assert.equal(floorFrame.hidden, false);
  assert.equal(f.actions.hidden, true);
  assert.equal(f.doc.defaultView.location.href, "http://127.0.0.1:4192/?other=keep&feature=housePlanLayout#result");
  f.host.hide("whiteModel");
  assert.equal(f.actions.hidden, false);
  assert.equal(f.scroll.inputValue, "旧功能用户输入");
});

test("平面机位渲染切换保留相机和任务，与旧START隔离", () => {
  const f = fixture();
  f.host.show("floorPlanCamera");
  const frame = f.frame();
  assert.equal(frame.src, "/floor-plan-camera.html?embedded=1");
  assert.equal(frame.title, "平面图机位渲染");
  frame.camera = { x: 0.2, y: 0.6, heading: 45 };
  f.host.show("housePlanLayout");
  assert.equal(frame.hidden, true);
  assert.equal(frame.inert, true);
  f.host.show("floorPlanCamera");
  assert.equal(frame.sourceWrites, 1);
  assert.equal(frame.camera.heading, 45);
  assert.equal(frame.hidden, false);
  assert.equal(f.actions.hidden, true);
  assert.equal(new URL(f.doc.defaultView.location.href).searchParams.get("feature"), "floorPlanCamera");
  f.host.hide("whiteModel");
  assert.equal(f.actions.hidden, false);
});

test("对话内平面机位渲染复用画布、参数与动作，保持 URL 和侧栏原状态", () => {
  const f = fixture(), slots = conversation(f);
  const previousUrl = f.doc.defaultView.location.href;
  const previousSelection = f.buttons.map(button => button.getAttribute("aria-checked"));
  const container = f.container();
  assert.equal(f.host.supports("floorPlanCamera"), true);
  assert.equal(f.host.supports("free"), false);
  assert.equal(f.host.show("floorPlanCamera", slots), true);
  assert.equal(f.host.isEmbedded(), true);
  assert.equal(f.host.currentMode(), "floorPlanCamera");
  assert.equal(slots.mount.children[0], container);
  assert.equal(container.classList.contains("is-conversation-workspace"), true);
  assert.equal(container.atomicMoves, 1);
  assert.equal(slots.parameters.children[0].id, "floorPlanCameraSettingsMount");
  assert.equal(slots.actions.children[0].id, "floorPlanCameraActionsMount");
  assert.equal(f.root.classList.contains("is-ai-render-studio"), false);
  assert.equal(f.doc.body.classList.contains("is-docked-workspace"), false);
  for (const node of [f.scroll, f.actions, f.result]) { assert.equal(node.hidden, false); assert.equal(node.inert, false); }
  assert.equal(f.doc.defaultView.location.href, previousUrl);
  assert.deepEqual(f.buttons.map(button => button.getAttribute("aria-checked")), previousSelection);

  const frame = f.frame(), settings = slots.parameters.children[0], actions = slots.actions.children[0];
  f.host.hide();
  assert.equal(f.host.isEmbedded(), false);
  assert.equal(container.atomicMoves, 1);
  assert.equal(container.parentNode, slots.mount);
  assert.equal(slots.parameters.hidden, true);
  assert.equal(settings.parentNode, f.panel);
  assert.equal(actions.parentNode, f.panel);
  f.host.show("floorPlanCamera", slots);
  assert.equal(container.atomicMoves, 1);
  assert.equal(f.frame(), frame);
  f.host.show("floorPlanCamera");
  assert.equal(f.frame(), frame);
  assert.equal(frame.sourceWrites, 1);
  assert.equal(new URL(f.doc.defaultView.location.href).searchParams.get("feature"), "floorPlanCamera");
});

test("在对话内把机位成图带入人宠，切换同一对话的工具与挂载槽", () => {
  const f = fixture(), changes = [], slots = conversation(f, (mode, title) => changes.push({ mode, title }));
  f.host.show("floorPlanCamera", slots);
  const camera = f.frame();
  const payload = { imageUrl: "data:image/png;base64,AAAA", sourceRender: { featureMode: "floorPlanCamera" } };
  f.host.importSceneCast(payload);
  const cast = f.created.find(node => node.title === "添加人物/宠物");
  assert.equal(f.host.isEmbedded(), true);
  assert.equal(f.host.currentMode(), "sceneCast");
  assert.equal(camera.hidden, true);
  assert.equal(cast.hidden, false);
  assert.deepEqual(changes, [{ mode: "sceneCast", title: "添加人物/宠物" }]);
  assert.equal(slots.parameters.children[0].id, "sceneCastSettingsMount");
  assert.equal(new URL(f.doc.defaultView.location.href).searchParams.get("feature"), null);
  cast.fire("load");
  assert.deepEqual(cast.messages, [[{ type: "canvas-lab:scene-cast:import", payload }, f.doc.defaultView.location.origin]]);
});

test("已切走的保活画布迟到的交接消息不会替换当前对话工具", () => {
  const f = fixture(), changes = [], slots = conversation(f, mode => changes.push(mode));
  const win = f.doc.defaultView;
  f.host.show("floorPlanCamera", slots);
  const camera = f.frame();
  const event = { type: "message", origin: win.location.origin, source: camera.contentWindow,
    data: { type: "canvas-lab:scene-cast:open", payload: {
      imageUrl: "data:image/png;base64,AAAA", sourceRender: { featureMode: "floorPlanCamera" },
    } } };
  f.host.show("housePlanLayout", slots);
  win.dispatchEvent(event);
  assert.equal(f.host.currentMode(), "housePlanLayout");
  assert.deepEqual(changes, []);
  f.host.show("floorPlanCamera", slots);
  win.dispatchEvent(event);
  assert.equal(f.host.currentMode(), "sceneCast");
  assert.deepEqual(changes, ["sceneCast"]);
});

test("场景结果带入人物宠物配置挂接槽，切换时保留会话与移动抽屉", () => {
  const f = fixture();
  const slot = (id) => f.panel.children.find(node => node.id === id);
  const cast = [slot("sceneCastSettingsMount"), slot("sceneCastActionsMount")];
  const studio = [slot("aiRenderStudioSettingsMount"), slot("aiRenderStudioActionsMount")];
  const camera = [slot("floorPlanCameraSettingsMount"), slot("floorPlanCameraActionsMount")];
  const house = [slot("housePlanSettingsMount"), slot("housePlanActionsMount")];
  const checkDock = (nodes, unavailable) => {
    for (const node of nodes) { assert.equal(node.hidden, unavailable); assert.equal(node.inert, unavailable); }
  };
  checkDock([...cast, ...house, ...studio, ...camera], true);
  f.dialog.open = true;
  const payload = { imageUrl: "data:image/png;base64,AAAA", sourceRender: { featureMode: "whiteModel" } };
  f.host.importSceneCast(payload);
  const frame = f.frame();
  assert.equal(frame.src, "/scene-cast.html?embedded=1");
  assert.equal(f.dialog.open, true);
  assert.equal(f.root.classList.contains("is-docked-workspace"), true);
  assert.equal(f.buttons[3].getAttribute("aria-checked"), "true");
  checkDock(cast, false);
  checkDock(house, true);
  checkDock([f.scroll, f.actions, f.result], true);
  assert.match(cast[0].className, /\bcontrol-panel-scroll\b/);
  assert.match(cast[1].className, /\baction-section\b/);
  assert.deepEqual(frame.messages, []);
  frame.fire("load");
  assert.deepEqual(frame.messages, [[{ type: "canvas-lab:scene-cast:import", payload }, f.doc.defaultView.location.origin]]);
  f.host.show();
  assert.equal(f.dialog.open, true);
  checkDock(studio, false);
  checkDock([...cast, ...camera], true);
  f.host.show("floorPlanCamera");
  assert.equal(f.dialog.open, true);
  checkDock(camera, false);
  checkDock([...cast, ...studio], true);
  f.host.show("housePlanLayout");
  assert.equal(f.dialog.open, false);
  checkDock(cast, true);
  checkDock(house, false);
  f.host.show("sceneCast");
  assert.equal(frame.sourceWrites, 1);
  checkDock(cast, false);
  checkDock(house, true);
  f.host.hide("whiteModel");
  checkDock([...cast, ...house, ...studio, ...camera], true);
  checkDock([f.scroll, f.actions, f.result], false);
  assert.equal(f.root.classList.contains("is-docked-workspace"), false);
  assert.equal(f.buttons[0].getAttribute("aria-checked"), "true");
});

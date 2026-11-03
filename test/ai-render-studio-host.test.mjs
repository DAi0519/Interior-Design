/**
 * [INPUT]: 依赖正式渲染台宿主、主目录/编排/布局源码和内存DOM/历史记录替身
 * [OUTPUT]: 验证正式入口、旧START隔离、iframe保活、移动抽屉退出、原功能输入/任务保存及URL直达
 * [POS]: test 的主工作台渲染台集成合同，不加载真实iframe、不调用网络或生图模型
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { bindAiRenderStudioHost } from "../public/ai-render-studio-host.js";

function fixture() {
  const created = [], events = [], menus = [], map = new Map();
  const win = { location: { href: "http://127.0.0.1:4192/?other=keep#result" },
    history: { state: { saved: true }, replaceState(state, _title, url) {
      assert.deepEqual(state, { saved: true }); win.location.href = String(url);
    } }, Event: class { constructor(type) { this.type = type; } }, dispatchEvent(event) { events.push(event.type); } };
  const doc = { defaultView: win, querySelector: (selector) => map.get(selector) || null,
    querySelectorAll: (selector) => selector === "[popover]" ? menus : [],
    createElement(tagName) {
      const classes = new Set(), attributes = new Map(), children = [];
      const node = { tagName, ownerDocument: doc, children, hidden: false, inert: false, dataset: {},
        classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name), contains: (name) => classes.has(name),
          toggle(name, active) { classes[active ? "add" : "delete"](name); } },
        append: (...nodes) => children.push(...nodes),
        setAttribute: (name, value) => attributes.set(name, String(value)),
        getAttribute: (name) => attributes.get(name) ?? null };
      if (tagName === "iframe") {
        let source;
        node.sourceWrites = 0;
        Object.defineProperty(node, "src", { get: () => source, set(value) { source = value; node.sourceWrites += 1; } });
      }
      created.push(node); return node;
    } };
  doc.body = doc.createElement("body");
  const root = doc.createElement("main"), panel = doc.createElement("aside"), directory = doc.createElement("nav");
  const scroll = doc.createElement("div"), actions = doc.createElement("section"), result = doc.createElement("section");
  scroll.inputValue = "旧功能用户输入"; actions.runningJob = { jobId: "old-job-keep", status: "running" };
  const dialog = { open: false, closeCount: 0, close() { this.open = false; this.closeCount += 1; } };
  const buttons = ["whiteModel", "aiRenderStudio", "refinedModel"].map((featureMode) => {
    const button = doc.createElement("button"); button.dataset.featureMode = featureMode;
    button.setAttribute("aria-checked", String(featureMode === "whiteModel")); return button;
  });
  directory.querySelectorAll = (selector) => selector === "[data-feature-mode]" ? buttons : [];
  panel.querySelector = (selector) => ({ "#featureModeList": directory, ".control-panel-scroll": scroll, ".action-section": actions })[selector] || null;
  root.querySelector = (selector) => selector === ".result-panel" ? result : null;
  map.set("#configurationPanel", panel); map.set("#workspacePanelDialog", dialog);
  const host = bindAiRenderStudioHost({ root });
  return { host, root, doc, panel, scroll, actions, result, dialog, buttons, events, menus,
    created, frame: () => created.find(({ tagName }) => tagName === "iframe"), container: () => root.children[0] };
}

test("正式目录项使用同源独立宿主，不保留预览链接或接入普通生成模式", async () => {
  const [html, app, hostSource] = await Promise.all([
    readFile(new URL("../public/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/app.js", import.meta.url), "utf8"),
    readFile(new URL("../public/ai-render-studio-host.js", import.meta.url), "utf8"),
  ]);
  assert.match(html, /<button[^>]*data-feature-mode="aiRenderStudio"[^>]*>AI渲染台<\/button>/);
  assert.doesNotMatch(html, /feature-preview-link/);
  assert.match(app, /from "\.\/ai-render-studio-host\.js\?v=1"/);
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

test("切换时关闭旧popover与移动配置抽屉，返回正常功能恢复原隐藏和inert状态", () => {
  const f = fixture();
  f.scroll.inert = true; f.result.hidden = true; f.dialog.open = true;
  let closed = 0;
  f.menus.push({ hidePopover() { closed += 1; } }, { hidePopover() { throw new Error("already closed"); } });
  f.host.show();
  assert.equal(closed, 1);
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
  assert.match(css, /grid-template-columns: 144px minmax\(0, 1fr\)/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*?grid-column: 1; grid-row: 2/);
});

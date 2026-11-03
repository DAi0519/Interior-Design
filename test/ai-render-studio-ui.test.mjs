/**
 * [INPUT]: 依赖AI渲染台完整页面脚本/HTML、真实图片准入规则、共享光影控件边界及内存DOM/HTTP/存储/时钟替身
 * [OUTPUT]: 验证九卡身份/风格下拉/按需控光与默认结果、单次START/只读恢复、同步pending到success不重生图/重载图片及仅归档重试
 * [POS]: test 的AI渲染台用户交互回归，运行实际页面脚本，不访问浏览器、网络、付费模型或飞书
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { RELIGHT_IMAGE_POLICY, RELIGHT_MODEL_KEY, relightImageIssue } from "../public/image-relight-geometry.js";

const [page, script] = await Promise.all([
  readFile(new URL("../public/ai-render-studio.html", import.meta.url), "utf8"),
  readFile(new URL("../public/ai-render-studio.js", import.meta.url), "utf8"),
]);
const config = { available: true, imagePolicy: { ...RELIGHT_IMAGE_POLICY, maxBytesPerImage: 8 * 1024 * 1024 },
  prompt: { available: true, code: "ai-render-studio", version: 1, sha256: "a".repeat(64) },
  renderStyles: [{ key: "photoreal", label: "写实摄影", description: "保持真实材质" }],
  lightingPresetAvailable: true, lightingPresets: [{ id: "recLighting1", version: 3, sha256: "b".repeat(64), name: "日光暖灯" }] };
const source = { name: "带材质模型.png", type: "image/png", size: 6371448, width: 1900, height: 1100,
  dataUrl: "data:image/png;base64,c291cmNl" };
const output = { images: [{ url: "data:image/png;base64,cmVzdWx0" }], request: { size: "1024x592", renderStyle: "photoreal" } };

// --- DOM仅承接浏览器读写和事件；提交/恢复/轮询均执行整份生产脚本 ---
async function fixture(respond) {
  const ids = new Map(), styles = [], timers = new Map(), calls = [], storage = new Map(), windowEvents = new Map();
  let sequence = 0, timerSequence = 0, uuidSequence = 0, selectLighting;
  let manualLights = [];
  class Node {
    constructor(tag = "div") {
      this.tagName = tag; this.uid = ++sequence; this.children = []; this.listeners = new Map(); this.queries = new Map();
      this.dataset = {}; this.attributes = new Map(); this.hidden = false; this.disabled = false; this.inert = false;
      this.value = ""; this.checked = false; this.srcWrites = 0; this.textContent = "";
      this.style = { setProperty(name, value) { this[name] = value; } };
      const classes = new Set();
      this.classList = { add: key => classes.add(key), remove: key => classes.delete(key), contains: key => classes.has(key),
        toggle(key, active) { classes[active ? "add" : "delete"](key); } };
    }
    set src(value) { this.imageUrl = value; this.srcWrites += 1; }
    get src() { return this.imageUrl; }
    set innerHTML(value) { parse(value); }
    append(...nodes) { this.children.push(...nodes); for (const node of nodes) node.parentElement = this; }
    prepend(...nodes) { this.children.unshift(...nodes); for (const node of nodes) node.parentElement = this; }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    removeAttribute(name) { this.attributes.delete(name); if (name === "src") this.imageUrl = undefined; }
    querySelector(selector) {
      if (selector.startsWith("#")) return ids.get(selector.slice(1));
      if (!this.queries.has(selector)) this.queries.set(selector, new Node());
      return this.queries.get(selector);
    }
    addEventListener(name, callback) { this.listeners.set(name, [...(this.listeners.get(name) || []), callback]); }
    async fire(name, values = {}) {
      for (const callback of this.listeners.get(name) || []) await callback({ target: this, preventDefault() {}, ...values });
    }
    focus() {}
  }
  function parse(html) {
    for (const match of html.matchAll(/<([\w-]+)\b([^>]*)>/g)) {
      const [, tag, attributes] = match, id = attributes.match(/\bid="([^"]+)"/)?.[1];
      const style = attributes.match(/\bdata-render-style="([^"]+)"/)?.[1];
      if (!id && !style) continue;
      const node = new Node(tag); node.hidden = /\bhidden(?:\s|$)/.test(attributes);
      node.value = attributes.match(/\bvalue="([^"]+)"/)?.[1] || "";
      if (id) { node.id = id; ids.set(id, node); }
      if (style) { node.dataset.renderStyle = style; styles.push(node); }
    }
    for (const match of html.matchAll(/<select\b[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)) {
      const select = ids.get(match[1]);
      select.options = [...match[2].matchAll(/<option\b[^>]*value="([^"]+)"[^>]*>([^<]*)/g)].map(([, value, label]) => ({ value, textContent: label }));
      select.value = select.options[0]?.value || "";
    }
  }
  parse(page);
  const document = { body: new Node("body"), hidden: false, createElement: tag => new Node(tag),
    getElementById: id => ids.get(id), querySelectorAll: selector => selector === "[data-render-style]" ? styles : [],
    querySelector: selector => styles.find(node => node.dataset.renderStyle === selector.match(/data-render-style="([^"]+)"/)?.[1]),
    addEventListener() {} };
  const context = vm.createContext({ document, location: { href: "http://localhost/ai-render-studio.html?embedded=1", search: "?embedded=1", origin: "http://localhost" },
    URL, URLSearchParams, RELIGHT_IMAGE_POLICY, RELIGHT_MODEL_KEY, relightImageIssue,
    window: { addEventListener(name, callback) { windowEvents.set(name, callback); } },
    sessionStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    crypto: { randomUUID: () => `00000000-0000-4000-8000-${String(++uuidSequence).padStart(12, "0")}` },
    setTimeout(callback, delay) { const id = ++timerSequence; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    formatBytes: size => `${(size / 1024 / 1024).toFixed(1)}MB`,
    readFileAsInput: async file => ({ ...file }), readImageDimensions: async () => ({ width: source.width, height: source.height }),
    api: async (path, options = {}) => {
      const call = { path, method: options.method || "GET", body: options.body ? JSON.parse(options.body) : undefined };
      calls.push(call);
      if (path === "/api/ai-render-studio/config") return config;
      return respond(call, calls);
    },
    bindRefinedLightingControls({ onChange }) {
      let selection = { mode: "unselected" };
      selectLighting = value => { selection = value; onChange(); };
      return { setAvailability() {}, validation: () => null, value: () => selection };
    },
    bindImageRelight({ getSourceImage, onChange }) {
      return { configure() { onChange(); }, restore() {}, activate() {}, validate() { const message = relightImageIssue(getSourceImage(), config.imagePolicy); return message ? { message } : null; },
        value: () => ({ lights: manualLights, originalLights: { action: "keep" }, templateKey: "custom", blendMode: "balanced", outputResolution: "1K", quality: "medium" }) };
    },
  });
  await vm.runInContext(`(async () => {\n${script.replace(/^import[^\n]*\n/gm, "")}\n})()`, context);
  const node = id => ids.get(id);
  node("studioCompareEnabled").parentElement = new Node("label");
  async function settle() { for (let index = 0; index < 3; index += 1) await new Promise(resolve => setImmediate(resolve)); }
  async function upload() {
    node("studioSourceInput").files = [source]; await node("studioSourceInput").fire("change"); await settle();
    assert.equal(node("studioGenerate").disabled, false, "6.37MB模型应通过Studio 8MiB准入并可START");
  }
  async function nextPoll() {
    const timer = [...timers].find(([, value]) => value.delay === 1800);
    assert.ok(timer, "应继续查询已有任务"); timers.delete(timer[0]); await timer[1].callback(); await settle();
  }
  return { node, calls, storage, upload, nextPoll, settle, timers, windowEvents,
    selectLighting: value => selectLighting(value), setLights: value => { manualLights = value; },
    submit: () => node("studioGenerate").fire("click"),
    posts: () => calls.filter(call => call.method === "POST" && call.path === "/api/ai-render-studio/jobs"),
    reads: () => calls.filter(call => call.method === "GET" && call.path.includes("/jobs/")) };
}

test("POST校验拒绝后只GET核对不存在，解除等待并保留原图，不自动重提", async () => {
  const f = await fixture(async call => { throw new Error(call.method === "POST" ? "渲染配置已变更" : "AI渲染台任务不存在或已过期"); });
  await f.upload(); await f.submit();
  assert.equal(f.posts().length, 1);
  assert.equal(f.posts()[0].body.input.lightingPreset, null, "原光影默认不携带任何库卡");
  assert.equal(f.reads().length, 1);
  assert.equal(f.node("studioGenerate").disabled, false);
  assert.equal(f.node("studioSourceThumbnail").src, source.dataUrl);
  assert.equal(f.node("studioResume").hidden, true);
  assert.match(f.node("studioRequestError").textContent, /解除等待/);
  assert.equal(f.storage.size, 0);
});

test("POST响应未知且首次GET断网时锁住原job，手动检查恢复后始终只有一次生成POST", async () => {
  let jobId, reads = 0;
  const f = await fixture(async call => {
    if (call.method === "POST") { jobId = call.body.jobId; throw new Error("提交响应中断"); }
    if (++reads === 1) throw new Error("查询网络暂不可用");
    return { job: { jobId, status: "running", message: "正在校验渲染配置…" } };
  });
  await f.upload(); await f.submit();
  assert.equal(f.node("studioGenerate").disabled, true);
  assert.equal(f.node("studioResume").hidden, false);
  assert.equal([...f.storage.values()][0], jobId);
  await f.node("studioResume").fire("click"); await f.settle();
  assert.equal(f.node("studioResume").hidden, true);
  assert.equal(f.node("studioGenerate").disabled, true);
  assert.equal(f.posts().length, 1);
  assert.equal(f.reads().length, 2);
  assert.equal(f.reads()[0].path, f.reads()[1].path, "恢复查询必须保持同一jobId");
});

test("图已生成仍继续GET同步pending到success，不重新提交生成或重载对比图片", async () => {
  let jobId, reads = 0;
  const recordUrl = "https://example.feishu.cn/base/base1?table=table1&record=record1";
  const f = await fixture(async call => {
    if (call.method === "POST") { jobId = call.body.jobId; return { job: { jobId, status: "running" } }; }
    reads += 1;
    return { job: { jobId, status: "success", result: { ...output, sync: { status: reads < 3 ? "pending" : "success", recordUrl: reads < 3 ? null : recordUrl } } } };
  });
  await f.upload(); await f.submit(); await f.nextPoll();
  assert.equal(f.node("studioGenerate").disabled, false, "归档期间应允许编辑下一次设置");
  assert.match(f.node("studioSyncStatus").textContent, /正在同步/);
  assert.equal(f.node("studioResultImage").src, output.images[0].url);
  f.node("studioCompareEnabled").checked = true; await f.node("studioCompareEnabled").fire("change");
  f.node("studioCompareRange").value = "73"; await f.node("studioCompareRange").fire("input");
  await f.nextPoll(); await f.nextPoll();
  assert.equal(f.posts().length, 1);
  assert.equal(f.reads().length, 3);
  assert.equal(f.node("studioResultImage").srcWrites, 1);
  assert.equal(f.node("studioCompareOriginal").srcWrites, 1);
  assert.equal(f.node("studioCompareOriginal").src, source.dataUrl);
  assert.equal(f.node("studioCompareEnabled").checked, true);
  assert.equal(f.node("studioCompareRange").value, "73", "同步更新不能重置用户选定的对比位置");
  assert.equal(f.node("studioRecordLink").href, recordUrl);
  assert.equal(f.node("studioRecordLink").hidden, false);
  assert.match(f.node("studioSyncStatus").textContent, /同步成功/);
  assert.equal([...f.timers.values()].filter(timer => timer.delay === 1800).length, 0);
});

test("归档失败的重试只发送sync-retry，页面恢复仍GET同一任务，不触碰图模型", async () => {
  let jobId, syncStatus = "failed", retried = false;
  const f = await fixture(async call => {
    if (call.path.endsWith("/sync-retry")) { retried = true; syncStatus = "pending"; }
    else if (call.method === "POST") jobId = call.body.jobId;
    return { job: { jobId, status: "success", result: { ...output, sync: { status: syncStatus, error: syncStatus === "failed" ? "附件上传失败" : null } } } };
  });
  await f.upload(); await f.submit();
  assert.equal(f.node("studioRetrySync").hidden, false);
  await f.node("studioRetrySync").fire("click");
  assert.equal(retried, true);
  assert.equal(f.posts().length, 1);
  const retry = f.calls.find(call => call.path.endsWith("/sync-retry"));
  assert.equal(retry.method, "POST");
  assert.deepEqual(retry.body, {});
  f.windowEvents.get("pagehide")();
  assert.equal([...f.timers.values()].filter(timer => timer.delay === 1800).length, 0);
  syncStatus = "success"; f.windowEvents.get("pageshow")(); await f.settle();
  assert.equal(f.posts().length, 1);
  assert.match(f.node("studioSyncStatus").textContent, /同步成功/);
  assert.equal(f.node("studioResultImage").srcWrites, 1);
});

test("默认等待结果，精细控光按需展开；选库卡与风格保留手动光源且只提交三字段身份", async () => {
  const f = await fixture(async call => ({ job: { jobId: call.body.jobId, status: "running" } }));
  assert.equal(f.node("studioEmptyState").hidden, false);
  assert.equal(f.node("studioPreviewPanel").hidden, true);
  assert.equal(f.node("studioAdvancedPanel").hidden, true);
  await f.upload();
  assert.equal(f.node("studioPreviewPanel").hidden, true, "上传不强制进入控光编辑");
  await f.node("studioAdvancedToggle").fire("click");
  assert.equal(f.node("studioAdvancedPanel").hidden, false);
  assert.equal(f.node("studioPreviewPanel").hidden, false);
  const lights = [{ id: "light1", type: "point", action: "brighten", kelvin: 3000 }];
  f.setLights(lights);
  const card = config.lightingPresets[0];
  f.selectLighting({ mode: "preset", presetId: card.id, version: card.version, sha256: card.sha256, execution: "prompt-only" });
  await f.node("studioReturnResult").fire("click");
  assert.equal(f.node("studioAdvancedPanel").hidden, true);
  assert.equal(f.node("studioResultPanel").hidden, false);
  f.node("studioRenderStyle").value = "cinematic"; await f.node("studioRenderStyle").fire("change");
  await f.submit();
  assert.equal(f.posts().length, 1);
  const submitted = f.posts()[0].body.input;
  assert.deepEqual(submitted.lightingPreset, { id: card.id, version: card.version, sha256: card.sha256 });
  assert.deepEqual(submitted.lights, lights);
  assert.equal(submitted.templateKey, "custom");
  assert.equal(submitted.renderStyle, "cinematic");
  assert.equal(submitted.referenceImages.length, 1, "库卡不作为第二张生图参考图提交");
});

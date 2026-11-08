/**
 * [INPUT]: 依赖平面布局页面、共享归档状态、内存DOM、HTTP、会话存储和时钟替身
 * [OUTPUT]: 验证模型准入、换源阻断收费、图片来源、原任务恢复及逐图飞书归档状态
 * [POS]: test 的平面布局交互回归，执行真实生产脚本，不访问网络、模型、飞书或运行中服务
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const [page, script, syncScript] = await Promise.all([
  readFile(new URL("../public/floor-plan.html", import.meta.url), "utf8"),
  readFile(new URL("../public/floor-plan.js", import.meta.url), "utf8"),
  readFile(new URL("../public/generation-sync.js", import.meta.url), "utf8"),
]);
const SESSION_KEY = "canvas-lab:floor-plan:images:v2";
const config = { available: true, workflowVersion: "2026-11-04.floor-plan.3", defaultModel: "gptImage25Sunburst",
  archive: { required: true, available: true },
  continuationAvailable: true, continuationReason: null, defaultLayoutModel: "gptImage25Sunburst",
  layoutModels: [
    { key: "gptImage25Sunburst", label: "GPT Image 2.5 Sunburst", id: "gpt-image-2.5-sunburst", available: true, reason: null },
    { key: "banana21", label: "Banana 2.1", id: "gemini-3-pro-image-preview", available: true, reason: null },
  ],
  prompt: { version: 2, sha256: "a".repeat(64) } };
const source = name => ({ name: `${name}.png`, type: "image/png", size: 128, width: 800, height: 600,
  dataUrl: `data:image/png;base64,${Buffer.from(name).toString("base64")}` });
const result = (action, name = action) => ({ action, image: { url: source(name).dataUrl, width: 1024, height: 768 },
  model: { label: "测试图像模型" } });
const success = value => ({ job: { status: "success", result: value } });
const missing = () => Object.assign(new Error("原任务不存在或已过期"), { statusCode: 404 });

// --- 只模拟浏览器边界；所有生成门禁、任务身份与视图状态来自生产脚本 ---
async function fixture({ saved = null, configuration = config, respond = async () => { throw missing(); } } = {}) {
  const ids = new Map(), cameras = [], calls = [], timers = new Map(), storage = new Map(), downloads = [], blobs = [];
  let uuidSequence = 0, timerSequence = 0;
  if (saved) storage.set(SESSION_KEY, JSON.stringify(saved));
  class Element {
    constructor(tag = "div") {
      this.tagName = tag; this.children = []; this.listeners = new Map(); this.attributes = new Map(); this.dataset = {};
      this.hidden = false; this.disabled = false; this._value = ""; this.textContent = ""; this.selected = false;
      const classes = new Set();
      this.classList = { add: value => classes.add(value), remove: value => classes.delete(value), contains: value => classes.has(value) };
    }
    append(...nodes) {
      this.children.push(...nodes); for (const node of nodes) node.parent = this;
      if (this.tagName === "select" && !this.children.some(node => node.selected) && this.children.length) this.children[0].selected = true;
    }
    replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
    get value() { return this.tagName === "select" ? this.children.find(option => option.selected)?.value || "" : this._value; }
    set value(value) {
      this._value = String(value);
      if (this.tagName === "select") for (const option of this.children) option.selected = option.value === this._value;
    }
    get options() { return this.children; }
    get selectedOptions() { return this.children.filter(option => option.selected); }
    get selectedIndex() { return this.children.findIndex(option => option.selected); }
    set selectedIndex(value) { this.children.forEach((option, index) => { option.selected = index === value; }); }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    removeAttribute(name) { this.attributes.delete(name); if (name === "src") delete this.src; }
    addEventListener(name, callback) { this.listeners.set(name, [...(this.listeners.get(name) || []), callback]); }
    async fire(name, values = {}) {
      for (const callback of this.listeners.get(name) || []) await callback({ target: this, preventDefault() {}, ...values });
    }
    click() {
      if (this.disabled) return;
      if (this.tagName === "a") downloads.push({ href: this.href, name: this.download });
      else void this.fire("click");
    }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(node => node !== this); }
    focus() {}
  }
  for (const [, tag, attributes] of page.matchAll(/<([\w-]+)\b([^>]*)>/g)) {
    const id = attributes.match(/\bid="([^"]+)"/)?.[1], camera = attributes.match(/\bdata-camera="([^"]+)"/)?.[1];
    if (!id && !camera) continue;
    const node = new Element(tag);
    node.hidden = /\bhidden(?:\s|$)/.test(attributes); node.disabled = /\bdisabled(?:\s|$)/.test(attributes);
    if (id) ids.set(id, node);
    if (camera) { node.dataset.camera = camera; cameras.push(node); }
  }
  const document = { body: new Element("body"), createElement: tag => new Element(tag),
    getElementById: id => ids.get(id), querySelectorAll: selector => selector === "[data-camera]" ? cameras : [] };
  const context = vm.createContext({ document, Blob, atob,
    URL: class extends URL { static createObjectURL(blob) { blobs.push(blob); return `blob:fixture-${blobs.length}`; } static revokeObjectURL() {} },
    sessionStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    crypto: { randomUUID: () => `00000000-0000-4000-8000-${String(++uuidSequence).padStart(12, "0")}` },
    setTimeout(callback, delay) { const id = ++timerSequence; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    createImageBitmap: async file => ({ width: file.width, height: file.height, close() {} }),
    readFileAsInput: async file => ({ ...file }),
    fillSelect: (select, options, currentValue) => {
      select.replaceChildren(...options.map(entry => {
        const option = new Element("option"), item = typeof entry === "string" ? { value: entry, label: entry } : entry;
        option.value = item.value; option.textContent = item.label; option.selected = item.value === currentValue;
        return option;
      }));
    },
    api: async (path, options = {}) => {
      const call = { path, method: options.method || "GET", body: options.body ? JSON.parse(options.body) : undefined };
      calls.push(call);
      return path === "/api/floor-plan/config?refresh=1" ? structuredClone(typeof configuration === "function" ? configuration() : configuration) : respond(call);
    },
  });
  vm.runInContext(syncScript.replace(/^import[^\n]*\n/gm, "").replace(/^export /gm, ""), context);
  await vm.runInContext(`(async () => {\n${script.replace(/^import[^\n]*\n/gm, "")}\n})()`, context);
  async function settle() { for (let index = 0; index < 3; index += 1) await new Promise(resolve => setImmediate(resolve)); }
  const node = name => ids.get(`floorPlan${name}`);
  async function fire(target, event = "click", values = {}) { await target.fire(event, values); await settle(); }
  await settle();
  return { node, calls, storage, downloads, blobs, settle,
    camera: angle => cameras.find(button => button.dataset.camera === String(angle)),
    posts: () => calls.filter(call => call.method === "POST"),
    reads: () => calls.filter(call => call.method === "GET" && call.path.includes("/jobs/")),
    click: name => fire(node(name)),
    fireCamera: angle => fire(cameras.find(button => button.dataset.camera === String(angle))),
    input: async (name, value) => { node(name).value = value; await fire(node(name), "input"); },
    chooseModel: async value => { node("Model").value = value; await fire(node("Model"), "change"); },
    upload: async file => { node("SourceInput").files = [file]; await fire(node("SourceInput"), "change"); },
    nextPoll: async () => {
      const timer = [...timers].find(([, entry]) => entry.delay === 1400);
      assert.ok(timer, "运行中任务应安排同一ID的GET轮询");
      timers.delete(timer[0]); timer[1].callback(); await settle();
    },
    nextArchivePoll: async () => {
      const timer = [...timers].find(([, entry]) => entry.delay === 1500);
      assert.ok(timer, "等待中的归档应轮询原同步 ID");
      timers.delete(timer[0]); timer[1].callback(); await settle();
    },
  };
}

test("原结果恢复后按当前图显示归档，切图时忽略旧响应，重试仅请求同步", async () => {
  const layout = { ...result("layout"), sync: { generationId: "layout-sync-id", status: "pending" } };
  const interior = { ...result("interior"), sync: { generationId: "interior-sync-id", status: "failed", error: "附件上传失败" } };
  let releaseLayout;
  const url = "https://example.feishu.cn/base/baseToken?record=recInterior";
  const f = await fixture({ saved: { layout: "layout-job-id", interior: "interior-job-id" }, respond: async call => {
    if (call.path === "/api/floor-plan/jobs/layout-job-id") return success(layout);
    if (call.path === "/api/floor-plan/jobs/interior-job-id") return success(interior);
    if (call.path === "/api/sync-jobs/layout-sync-id") return new Promise(resolve => { releaseLayout = resolve; });
    if (call.path === "/api/sync-jobs/interior-sync-id/retry") return { sync: { ...interior.sync, status: "pending" } };
    if (call.path === "/api/sync-jobs/interior-sync-id") return { sync: { ...interior.sync, status: "success", error: null, recordUrl: url } };
    throw missing();
  } });
  assert.match(f.node("ArchiveStatus").textContent, /正在同步/);
  await f.nextArchivePoll();
  await f.click("TabInterior");
  assert.match(f.node("ArchiveStatus").textContent, /同步失败/);
  assert.equal(f.node("ArchiveRetry").hidden, false);
  releaseLayout({ sync: { ...layout.sync, status: "success", recordUrl: "https://example.feishu.cn/base/stale" } });
  await f.settle();
  assert.equal(f.node("ArchiveLink").hidden, true, "上一张图的归档链接不能串到当前图");
  await f.click("ArchiveRetry");
  assert.match(f.node("ArchiveStatus").textContent, /正在同步/);
  await f.nextArchivePoll();
  assert.match(f.node("ArchiveStatus").textContent, /已同步飞书/);
  assert.equal(f.node("ArchiveLink").href, url);
  assert.deepEqual(f.posts().map(({ path }) => path), ["/api/sync-jobs/interior-sync-id/retry"]);
});

test("旧进程缺少归档能力时阻止出图，仍可恢复旧任务", async () => {
  const f = await fixture({ saved: { layout: "layout-job-id" }, configuration: { ...config, archive: undefined },
    respond: async () => success(result("layout")) });
  await f.upload(source("新原图"));
  assert.equal(f.node("Generate").disabled, true);
  assert.equal(f.node("LayoutImage").hidden, false);
  assert.equal(f.node("Archive").hidden, true);
  assert.match(f.node("ConfigNote").textContent, /尚未接入飞书生成记录/);
  assert.equal(f.posts().length, 0);
});

test("换原图阻断旧方案三种收费动作，新布局成功后按当前图逐步生成", async () => {
  const oldLayout = result("layout", "旧布局"), oldInterior = result("interior", "旧室内");
  const jobs = new Map([["old-layout-job", oldLayout], ["old-interior-job", oldInterior]]);
  const f = await fixture({ saved: { layout: "old-layout-job", interior: "old-interior-job", interiorRequirements: "客厅" },
    respond: async call => {
      if (call.method === "POST") {
        jobs.set(call.body.jobId, result(call.body.action, `新${call.body.action}`));
        return { job: { status: "running" } };
      }
      return success(jobs.get(call.path.split("/").at(-1)));
    } });
  await f.input("Adjustment", "餐桌改为圆桌");
  assert.equal(f.node("Adjust").disabled, false);
  assert.equal(f.camera(90).disabled, false);
  await f.chooseModel("banana21");
  const replacement = source("新户型");
  await f.upload(replacement);
  for (const name of ["Adjust", "RenderInterior", "GoInterior", "TabInterior"]) assert.equal(f.node(name).disabled, true, name);
  for (const angle of [90, 180, 270]) assert.equal(f.camera(angle).disabled, true);
  // --- 强制派发事件，验证收费门禁也存在于执行函数而非仅按钮disabled ---
  await f.click("Adjust"); await f.click("RenderInterior"); await f.fireCamera(90);
  assert.equal(f.posts().length, 0, "换源后任何旧方案下游事件均不可POST");
  assert.match(f.node("Error").textContent, /先为新原图生成/);
  await f.click("Generate");
  assert.equal(f.posts().length, 1);
  assert.equal(f.posts()[0].body.referenceImage.dataUrl, replacement.dataUrl);
  assert.equal(f.posts()[0].body.modelKey, "banana21", "布局必须使用用户明确选择的模型");
  assert.equal(f.node("LayoutImage").src, result("layout", "新layout").image.url);
  assert.equal(f.node("CameraPanel").hidden, true, "新布局成功应清除旧室内图与机位");
  await f.input("Adjustment", "改为四人餐桌");
  assert.equal(f.node("Adjust").disabled, false);
  assert.equal(f.node("RenderInterior").disabled, false);
  await f.click("Adjust");
  assert.equal(f.posts()[1].body.referenceImage.dataUrl, result("layout", "新layout").image.url);
  await f.click("RenderInterior");
  assert.equal(f.posts()[2].body.referenceImage.dataUrl, result("adjust", "新adjust").image.url);
  await f.fireCamera(90); await f.fireCamera(180);
  for (const call of f.posts().slice(3)) {
    assert.equal(call.body.referenceImage.dataUrl, result("interior", "新interior").image.url, "换角度始终参考原室内图");
    assert.equal(call.body.sourceAction, "interior");
  }
  assert.deepEqual(f.posts().map(call => call.body.action), ["layout", "adjust", "interior", "camera", "camera"]);
  assert.ok(f.posts().slice(1).every(call => call.body.modelKey === "gptImage25Sunburst"), "布局选模不能改写既有后续动作模型");
});

test("选择模型后实际提交所选模型，生成中锁定选择且会话重载保留选择", async () => {
  let reads = 0;
  const f = await fixture({ respond: async call => {
    if (call.method === "POST") return { job: { status: "running" } };
    reads += 1;
    return reads === 1 ? { job: { status: "running", message: "模型正在生成" } } : success({ ...result("layout", "Banana布局"), model: { key: "banana21", label: "Banana 2.1" } });
  } });
  assert.equal(f.node("Model").value, "gptImage25Sunburst");
  await f.chooseModel("banana21");
  assert.equal(JSON.parse(f.storage.get(SESSION_KEY)).layoutModel, "banana21");
  await f.upload(source("选模户型")); await f.click("Generate");
  assert.equal(f.posts().length, 1);
  assert.equal(f.posts()[0].body.modelKey, "banana21");
  assert.equal(f.node("Model").disabled, true, "原模型任务未完成时不能改变下一次选择");
  assert.equal(f.node("Generate").disabled, true);
  await f.nextPoll();
  assert.equal(f.node("Model").disabled, false);
  assert.equal(f.node("Model").value, "banana21");
  assert.match(f.node("LayoutMeta").textContent, /Banana 2.1/);
  const reloaded = await fixture({ saved: JSON.parse(f.storage.get(SESSION_KEY)) });
  assert.equal(reloaded.node("Model").value, "banana21");
  assert.equal(reloaded.posts().length, 0);
});

test("刷新配置保留显式选择，失权或移出目录后保持禁用原模型而不静默换模", async () => {
  let current = structuredClone(config);
  const f = await fixture({ configuration: () => current });
  await f.upload(source("模型权限变化户型")); await f.chooseModel("banana21");
  await f.click("Refresh");
  assert.equal(f.node("Model").value, "banana21");
  assert.equal(f.node("Generate").disabled, false);
  current = { ...current, layoutModels: current.layoutModels.map(model => model.key === "banana21"
    ? { ...model, available: false, reason: "当前Key已取消Banana权限" } : model) };
  await f.click("Refresh");
  assert.equal(f.node("Model").value, "banana21");
  assert.equal(f.node("Model").options.find(option => option.value === "banana21").disabled, true);
  assert.equal(f.node("Generate").disabled, true);
  assert.match(f.node("ModelNote").textContent, /取消Banana权限/);
  await f.click("Generate");
  assert.equal(f.posts().length, 0, "失权后强制事件也不能收费或改用默认模型");
  current = { ...current, layoutModels: current.layoutModels.filter(model => model.key !== "banana21") };
  await f.click("Refresh");
  assert.equal(f.node("Model").value, "banana21", "移出目录也必须保留原选择而非回退Sunburst");
  assert.equal(f.node("Generate").disabled, true);
  assert.equal(f.node("Model").options.find(option => option.value === "banana21").disabled, true);
  await f.chooseModel("gptImage25Sunburst");
  assert.equal(f.node("Generate").disabled, false, "只有用户明确选了可用模型后才可恢复生成");
});

test("没有Sunburst但其他布局模型可用时，布局能生成且既有后续功能保留并禁用", async () => {
  const onlyBanana = { ...config, defaultLayoutModel: "banana21", continuationAvailable: false,
    continuationReason: "当前Key未开放Sunburst后续预览", layoutModels: config.layoutModels.map(model => model.key === "gptImage25Sunburst"
      ? { ...model, available: false, reason: "当前Key未开放Sunburst" } : model) };
  const oldLayout = result("layout", "已存布局"), oldInterior = result("interior", "已存室内");
  const f = await fixture({ configuration: onlyBanana, saved: { layout: "saved-layout-job", interior: "saved-interior-job", interiorRequirements: "客厅" },
    respond: async call => {
      if (call.method === "POST") return { job: { status: "running" } };
      return success(call.path.endsWith("/saved-layout-job") ? oldLayout : call.path.endsWith("/saved-interior-job") ? oldInterior : result("layout", "新Banana布局"));
    } });
  assert.equal(f.node("Model").value, "banana21");
  assert.equal(f.node("AdjustPanel").hidden, false);
  assert.equal(f.node("CameraPanel").hidden, false);
  await f.input("Adjustment", "改餐桌");
  assert.equal(f.node("Adjust").disabled, true);
  assert.equal(f.node("RenderInterior").disabled, true);
  assert.equal(f.camera(90).disabled, true);
  await f.click("Adjust"); await f.click("RenderInterior"); await f.fireCamera(90);
  assert.equal(f.posts().length, 0);
  assert.match(f.node("Error").textContent, /Sunburst后续预览/);
  await f.upload(source("Banana可用原图")); await f.click("Generate");
  assert.equal(f.posts().length, 1);
  assert.equal(f.posts()[0].body.modelKey, "banana21");
  assert.equal(f.node("LayoutImage").src, result("layout", "新Banana布局").image.url);
});

for (const action of ["interior", "camera"]) {
  test(`父图404但原${action}任务成功时独立显示、下载且再次刷新可恢复`, async () => {
    const output = result(action, `独立恢复${action}`), jobId = `pending-${action}-job`;
    const respond = async call => {
      assert.equal(call.method, "GET", "恢复只能读取原任务");
      if (call.path.endsWith(`/${jobId}`)) return success(output);
      throw missing();
    };
    const f = await fixture({ saved: { layout: "expired-layout-job", interior: "expired-interior-job",
      pending: { jobId, action, ...(action === "camera" ? { name: "右侧" } : {}) } }, respond });
    assert.equal(f.posts().length, 0);
    assert.equal(f.node("Interior").hidden, false);
    assert.equal(f.node("Layout").hidden, true);
    assert.equal(f.node("InteriorImage").hidden, false);
    assert.equal(f.node("InteriorImage").src, output.image.url);
    assert.equal(f.node("Download").disabled, false);
    await f.click("Download");
    assert.equal(f.downloads.length, 1);
    assert.equal(f.blobs[0].type, "image/png");
    assert.equal(Buffer.from(await f.blobs[0].arrayBuffer()).toString(), `独立恢复${action}`);
    const saved = JSON.parse(f.storage.get(SESSION_KEY));
    assert.equal(saved.pending, null);
    const reloaded = await fixture({ saved, respond });
    assert.equal(reloaded.node("Interior").hidden, false, "父任务丢失不能使有效的已付费结果在下次刷新消失");
    assert.equal(reloaded.node("InteriorImage").src, output.image.url);
    assert.equal(reloaded.node("Download").disabled, false);
    assert.equal(reloaded.posts().length, 0);
  });
}

test("无父布局的室内图恢复后再换原图，也阻断旧室内图机位收费", async () => {
  const f = await fixture({ saved: { layout: "expired-layout-job", interior: "saved-interior-job" }, respond: async call => {
    if (call.path.endsWith("/saved-interior-job")) return success(result("interior", "旧室内"));
    throw missing();
  } });
  assert.equal(f.camera(90).disabled, false);
  await f.upload(source("新户型"));
  assert.equal(f.camera(90).disabled, true);
  await f.fireCamera(90);
  assert.equal(f.posts().length, 0);
});

test("结果图作为下一步参考图时，Base64尾部padding不计入文件字节数", async () => {
  for (const [text, expectedBytes, suffix] of [["hello", 5, "="], ["h", 1, "=="]]) {
    const layout = result("layout", text);
    assert.ok(layout.image.url.endsWith(suffix));
    const f = await fixture({ saved: { layout: "padded-layout-job" }, respond: async call => {
      if (call.method === "POST") return { job: { status: "running" } };
      return success(call.path.endsWith("/padded-layout-job") ? layout : result("adjust", "修改结果"));
    } });
    await f.input("Adjustment", "移动沙发"); await f.click("Adjust");
    assert.equal(f.posts().length, 1);
    const reference = f.posts()[0].body.referenceImage;
    assert.equal(reference.dataUrl, layout.image.url, "参考图字节不可因回传而改变");
    assert.equal(reference.size, expectedBytes, "size必须等于实际解码字节，不能把=当成图像数据");
    assert.equal(f.node("LayoutImage").src, result("adjust", "修改结果").image.url);
  }
});

test("POST响应未知后按钮和刷新均不重提，手动检查与重载仅GET同一任务", async () => {
  let jobId, reads = 0;
  const respond = async call => {
    if (call.method === "POST") { jobId = call.body.jobId; throw new Error("提交响应中断"); }
    reads += 1;
    return reads <= 2 ? { job: { status: "running", message: "仍在生成" } } : success(result("layout", "原请求结果"));
  };
  const f = await fixture({ respond });
  await f.chooseModel("banana21");
  await f.upload(source("待生成户型")); await f.click("Generate");
  assert.equal(f.posts().length, 1);
  assert.equal(f.posts()[0].body.modelKey, "banana21");
  assert.equal(f.reads().length, 0);
  assert.equal(f.node("Generate").disabled, true);
  assert.equal(JSON.parse(f.storage.get(SESSION_KEY)).pending.jobId, jobId);
  await f.click("Generate"); await f.click("Refresh");
  assert.equal(f.posts().length, 1);
  assert.equal(f.reads()[0].path, `/api/floor-plan/jobs/${jobId}`);
  await f.nextPoll();
  assert.equal(f.posts().length, 1);
  assert.equal(f.reads()[1].path, f.reads()[0].path);
  const pending = JSON.parse(f.storage.get(SESSION_KEY));
  assert.equal(pending.pending.jobId, jobId, "轮询运行中必须保留原任务身份供页面重载");
  assert.equal(pending.pending.modelKey, "banana21", "未知提交保留原收费模型身份");
  const reloaded = await fixture({ saved: pending, respond,
    configuration: { ...config, layoutModels: config.layoutModels.filter(model => model.key !== "banana21") } });
  assert.equal(reloaded.posts().length, 0);
  assert.equal(reloaded.node("Model").value, "banana21", "原模型失权后恢复仍不静默改用其他模型");
  assert.ok(reloaded.reads().every(call => call.path === `/api/floor-plan/jobs/${jobId}`));
  assert.equal(reloaded.node("LayoutImage").src, result("layout", "原请求结果").image.url);
  assert.equal(JSON.parse(reloaded.storage.get(SESSION_KEY)).pending, null);
});

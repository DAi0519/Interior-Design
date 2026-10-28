/**
 * [INPUT]: 依赖旧房独立设计配置、共享生成输入/任务、配置刷新、按scope记忆的版本选择器及内存DOM/sessionStorage
 * [OUTPUT]: 对外提供旧房独立配置/版本隔离、刷新分派与真实错误显隐恢复、单份图片请求/Prompt复用和任务恢复合同测试
 * [POS]: test 的旧房改造前端合同测试，不调用模型、GPU 或真实飞书
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";
import { designPromptConfiguration, designSourceValidation, platformStyleAvailability, renderPromptAgentContext } from "../public/app-config-controls.js";
import { bindConfigRefresh } from "../public/config-refresh.js";
import { generationActionState } from "../public/generation-actions.js";
import { buildGenerationInput } from "../public/generation-input.js";
import { buildGenerationJobRequest, generationLoadingCopy } from "../public/generation-task-request.js";
import { createGenerationTask, generationTaskView, readGenerationTasks, saveGenerationTask } from "../public/generation-task-state.js";
import { referenceCapability, referenceSubject } from "../public/model-capabilities.js";
import { isEmptyRoomDesign } from "../public/room-renovation.js";
import { bindPromptAgentVersionSelect } from "../public/prompt-agent-version-select.js";
import { publicModelCatalog } from "../src/model-config.mjs";

const mainImage = { id: "old-room", dataUrl: "data:image/jpeg;base64,AA==", name: "旧房.jpg", size: 1, type: "image/jpeg" };
const styleImage = { ...mainImage, id: "style", dataUrl: "data:image/png;base64,Aw==", name: "风格.png", type: "image/png" };
const furniture = { items: ["沙发", "茶几"], other: "钢琴" };

function input(renderMode = "smart-default", featureMode = "roomRenovation", withStyleReference = false) {
  return buildGenerationInput({
    emptyRoomFields: { roomType: "客厅", furnitureSelection: furniture }, featureMode,
    model: publicModelCatalog()[0], negativePrompt: "保留结构",
    prompt: { free: "保留通道", refined: "不应进入旧房请求" },
    promptAgentModelKey: "gemini3pro", promptAgentVersion: featureMode === "roomRenovation" ? 2 : 32,
    ratio: "4:3", ratioMode: "auto", referenceImages: [mainImage],
    renderMode: { mode: renderMode, agentVersion: featureMode === "roomRenovation" ? 1 : 31, styleCode: renderMode === "style-dna" ? "modern@v2" : null },
    resolution: "2K", styleReferenceImages: withStyleReference ? [styleImage] : [],
  });
}

function storage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
}

function withoutPromptIdentity(input) {
  return Object.fromEntries(Object.entries(input).filter(([field]) => ![
    "designScenario", "emptyRoomSmartDefaultVersion", "emptyRoomPromptAgentVersion",
    "roomRenovationSmartDefaultVersion", "roomRenovationPromptAgentVersion",
  ].includes(field)));
}

function ordinaryRequest(request) {
  return { ...request, sharedInput: withoutPromptIdentity(request.sharedInput),
    items: request.items.map(item => ({ ...item, input: withoutPromptIdentity(item.input) })) };
}

test("旧房共用空房设计能力，所有模型均要求一张旧房照片", () => {
  assert.equal(isEmptyRoomDesign("roomRenovation"), true);
  assert.equal(isEmptyRoomDesign("emptyRoom"), true);
  assert.equal(isEmptyRoomDesign("whiteModel"), false);
  assert.match(referenceSubject("roomRenovation"), /旧房/);
  for (const model of publicModelCatalog()) {
    const capability = referenceCapability({ featureMode: "roomRenovation", model, policy: { maxCount: 4 } });
    assert.equal(capability.limit, 1);
    assert.equal(capability.multiple, false);
    assert.equal(capability.optionalLabel, "必填 · 1张");
    assert.match(capability.title, /旧房/);
  }
  assert.ok(designSourceValidation("roomRenovation", 0));
  assert.ok(designSourceValidation("roomRenovation", 2));
  assert.equal(designSourceValidation("roomRenovation", 1), null);
});

test("旧房使用独立双模式配置，不借用空房，风格参考图仍锁定智能默认", () => {
  const state = {
    featureMode: "roomRenovation",
    emptyRoomConfig: { promptAgent: { defaultVersion: 32 }, smartDefault: { available: true, version: 31 } },
    roomRenovationConfig: { promptAgent: { defaultVersion: 2 }, smartDefault: { available: true, version: 1 } },
    fusionPromptConfig: { defaultVersion: 7 }, smartDefaultConfig: { version: 6 },
    styleTransferConfig: { promptAgent: { defaultVersion: 2 } },
  };
  assert.equal(designPromptConfiguration(state), state.roomRenovationConfig);
  assert.equal(designPromptConfiguration({ ...state, featureMode: "emptyRoom" }), state.emptyRoomConfig);
  const unavailable = designPromptConfiguration({ ...state, roomRenovationConfig: undefined });
  assert.equal(unavailable.smartDefault.available, false);
  assert.deepEqual(unavailable.promptAgent.versions, []);
  assert.equal(platformStyleAvailability("roomRenovation", 0).available, true);
  assert.equal(platformStyleAvailability("roomRenovation", 1).available, false);
});

test("旧房Agent标题与说明独立，切回空房保持空房语义", () => {
  const element = () => ({ attributes: {}, classList: { toggle() {} }, replaceChildren() {},
    setAttribute(name, value) { this.attributes[name] = value; } });
  const elements = Object.fromEntries(["promptAgentTitle", "promptAgentVersionAvailability",
    "promptAgentVersionField", "promptAgentVersionLabel", "promptAgentModelLabelCopy",
    "promptAgentModelSelect", "promptAgentNote"].map(key => [key, element()]));
  const state = { featureMode: "roomRenovation", availablePromptAgents: new Map(), promptAgentCatalog: [] };
  renderPromptAgentContext(elements, state, "smart-default");
  assert.equal(elements.promptAgentTitle.textContent, "旧房智能默认 Agent");
  assert.match(elements.promptAgentNote.textContent, /独立旧房提示词/);
  renderPromptAgentContext(elements, state, "style-dna");
  assert.equal(elements.promptAgentTitle.textContent, "旧房风格融合 Agent");
  renderPromptAgentContext(elements, { ...state, featureMode: "emptyRoom" }, "smart-default");
  assert.equal(elements.promptAgentTitle.textContent, "空房智能默认 Agent");
  assert.doesNotMatch(elements.promptAgentNote.textContent, /旧房/);
});

function configRefreshFixture(t) {
  const previous = globalThis.document;
  const listeners = new Map();
  const label = { textContent: "" };
  const element = () => {
    const classes = new Set();
    return { classes, classList: { toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); },
      remove(name) { classes.delete(name); } }, textContent: "" };
  };
  const button = { ...element(), disabled: false, setAttribute() {}, removeAttribute() {},
    addEventListener(name, listener) { listeners.set(name, listener); }, querySelector: () => label };
  const nodes = new Map();
  globalThis.document = { querySelectorAll: () => [button], querySelector(selector) {
    if (!nodes.has(selector)) nodes.set(selector, element());
    return nodes.get(selector);
  } };
  t.after(() => { globalThis.document = previous; });
  const seen = {}, calls = [], toasts = [];
  let body = { emptyRoom: { promptAgent: { defaultVersion: 34, versions: [{ version: 34 }] }, smartDefault: { available: true, version: 34 } },
    roomRenovation: { promptAgent: { defaultVersion: 1, versions: [{ version: 1 }] }, smartDefault: { available: true, version: 1 } },
    smartDefault: { available: true, version: 6 }, promptAgent: { versions: [] }, refinedPrompt: { versions: [] }, styles: [] };
  let failure = null;
  const load = bindConfigRefresh({ api: async (path) => { calls.push(path); if (failure) throw failure; return body; },
    onEmptyRoom(config) { seen.emptyRoom = config; }, onRoomRenovation(config) { seen.roomRenovation = config; },
    onPromptAgentVersions() {}, onRefinedPromptVersions() {}, onSmartDefault() {}, onStyles() {},
    showToast(message) { toasts.push(message); } });
  return { load, seen, calls, toasts, get body() { return body; }, setBody(value) { body = value; },
    node: selector => nodes.get(selector), fail(error) { failure = error; }, refresh: () => listeners.get("click")() };
}

test("初始化和刷新分别分派旧房/空房配置，旧房未配置或读取失败不借用空房", async (t) => {
  const fixture = configRefreshFixture(t);
  const emptyRoom = structuredClone(fixture.body.emptyRoom);
  await fixture.load();
  assert.equal(fixture.seen.emptyRoom.smartDefault.version, 34);
  assert.equal(fixture.seen.roomRenovation.smartDefault.version, 1);
  const next = { promptAgent: { defaultVersion: 2, versions: [{ version: 2 }] }, smartDefault: { available: true, version: 2 } };
  fixture.setBody({ ...fixture.body, roomRenovation: next });
  await fixture.refresh();
  assert.equal(fixture.seen.roomRenovation, next);
  assert.deepEqual(fixture.seen.emptyRoom, emptyRoom);
  assert.deepEqual(fixture.calls, ["/api/styles", "/api/config/refresh"]);
  assert.match(fixture.toasts.at(-1), /旧房智能默认 v2/);
  const { roomRenovation: _removed, ...oldServiceBody } = fixture.body;
  fixture.setBody(oldServiceBody);
  await fixture.load();
  assert.equal(fixture.seen.roomRenovation.smartDefault.available, false);
  assert.deepEqual(fixture.seen.roomRenovation.promptAgent.versions, []);
  assert.deepEqual(fixture.seen.emptyRoom, emptyRoom);
  fixture.fail(new Error("连接失败"));
  await fixture.load();
  assert.equal(fixture.seen.roomRenovation.smartDefault.available, false);
  assert.equal(fixture.seen.roomRenovation.smartDefault.reason, "连接失败");
});

test("统一移除普通说明后，Prompt与配置读取错误仍可见且恢复后清空", async (t) => {
  const f = configRefreshFixture(t);
  const ready = { available: true, version: 2, name: "正式Prompt" };
  f.setBody({ ...f.body, effectEnhancementPrompt: ready, effectBeautificationPrompt: ready });
  await f.load();
  for (const selector of ["#effectPromptNote", "#effectBeautificationPromptNote"]) {
    assert.equal(f.node(selector).textContent, "");
    assert.equal(f.node(selector).hidden, true);
    assert.equal(f.node(selector).classes.has("error"), false);
  }
  f.setBody({ ...f.body, effectEnhancementPrompt: { available: false, reason: "氛围Prompt未上架" },
    effectBeautificationPrompt: { available: false, reason: "美化Prompt读取失败" } });
  await f.load();
  for (const selector of ["#effectPromptNote", "#effectBeautificationPromptNote"]) {
    assert.equal(f.node(selector).hidden, false);
    assert.equal(f.node(selector).classes.has("error"), true);
    assert.match(f.node(selector).textContent, /未上架|读取失败/);
  }
  f.fail(new Error("连接失败")); await f.load();
  assert.equal(f.node("#styleNote").hidden, false);
  assert.equal(f.node("#styleNote").classes.has("error"), true);
  assert.equal(f.node("#styleNote").textContent, "连接失败");
  f.fail(null); f.setBody({ ...f.body, effectEnhancementPrompt: ready, effectBeautificationPrompt: ready });
  await f.load();
  assert.equal(f.node("#styleNote").hidden, true);
  assert.equal(f.node("#styleNote").classes.has("error"), false);
  assert.equal(f.node("#effectPromptNote").hidden, true);
});

test("旧房版本记忆独立于原全局版本，切换及下架回退只影响各自目录", (t) => {
  const previousDocument = globalThis.document, previousStorage = globalThis.sessionStorage;
  const memory = new Map(), listeners = new Map();
  globalThis.document = { createElement: () => ({}) };
  globalThis.sessionStorage = { getItem: key => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value), removeItem: key => memory.delete(key) };
  t.after(() => { globalThis.document = previousDocument; globalThis.sessionStorage = previousStorage; });
  const select = { disabled: false, children: [], replaceChildren(...children) { this.children = children; },
    addEventListener(name, listener) { listeners.set(name, listener); } };
  const controller = bindPromptAgentVersionSelect({ select, availability: { classList: { toggle() {} } } });
  const config = (versions) => ({ defaultVersion: versions[0], versions: versions.map(version => ({ name: "Agent", version })) });
  const oldScope = { scope: "room-renovation" };
  controller.render(config([40, 34]));
  listeners.get("change")({ target: { value: "34" } });
  controller.render(config([2, 1]), oldScope);
  listeners.get("change")({ target: { value: "1" } });
  controller.render(config([40, 34]));
  assert.equal(controller.value(), 34);
  controller.render(config([2, 1]), oldScope);
  assert.equal(controller.value(), 1);
  controller.render(config([2]), oldScope);
  assert.equal(controller.value(), 2);
  assert.equal(memory.get("canvas-lab.prompt-agent-version"), "34");
  controller.render(config([]), oldScope);
  assert.equal(controller.value(), null);
  assert.equal(select.disabled, true);
  assert.equal(memory.has("canvas-lab.prompt-agent-version:room-renovation"), false);
  controller.render(config([40, 34]));
  assert.equal(controller.value(), 34);
  assert.equal(select.disabled, false);
});

for (const [mode, withStyleReference] of [["smart-default", false], ["smart-default", true], ["style-dna", false]]) {
  test(`旧房 ${mode}${withStyleReference ? "带风格参考图" : ""} 只发送旧房版本，其余输入与多模型链路复用空房`, () => {
    const baseInput = input(mode, "roomRenovation", withStyleReference);
    const emptyRoomInput = input(mode, "emptyRoom", withStyleReference);
    assert.equal(baseInput.designScenario, "room-renovation");
    assert.equal(Object.hasOwn(emptyRoomInput, "designScenario"), false);
    assert.deepEqual(withoutPromptIdentity(baseInput), withoutPromptIdentity(emptyRoomInput));
    assert.equal(baseInput.featureMode, "emptyRoom");
    assert.equal(Object.hasOwn(baseInput, "roomRenovation"), false);
    assert.equal(baseInput.roomType, "客厅");
    assert.deepEqual(baseInput.furnitureSelection, furniture);
    assert.equal(baseInput.prompt, "保留通道");
    assert.equal(baseInput.outputFormat, "png");
    assert.equal(baseInput.emptyRoomSmartDefaultVersion, undefined);
    assert.equal(baseInput.emptyRoomPromptAgentVersion, undefined);
    assert.equal(baseInput.roomRenovationSmartDefaultVersion, mode === "smart-default" ? 1 : undefined);
    assert.equal(baseInput.roomRenovationPromptAgentVersion, mode === "style-dna" ? 2 : undefined);
    assert.equal(emptyRoomInput.emptyRoomSmartDefaultVersion, mode === "smart-default" ? 31 : undefined);
    assert.equal(emptyRoomInput.emptyRoomPromptAgentVersion, mode === "style-dna" ? 32 : undefined);
    assert.equal(emptyRoomInput.roomRenovationSmartDefaultVersion, undefined);
    assert.equal(emptyRoomInput.roomRenovationPromptAgentVersion, undefined);
    assert.equal(baseInput.promptAgentVersion, undefined);
    assert.equal(baseInput.styleTransferPromptAgentVersion, undefined);
    assert.equal(baseInput.styleTransferReferenceVersion, undefined);
    assert.equal(baseInput.referenceImages[0].dataUrl, mainImage.dataUrl);
    assert.deepEqual(baseInput.styleReferenceImages.map(({ dataUrl }) => dataUrl), withStyleReference ? [styleImage.dataUrl] : []);

    const models = publicModelCatalog();
    const request = (featureMode) => buildGenerationJobRequest({
      baseInput: input(mode, featureMode, withStyleReference), batchId: "shared-batch", featureMode,
      forcePromptRegeneration: false, jobId: "generation-shared-1", models, sourceImage: { width: 1200, height: 900 },
    });
    const renovation = request("roomRenovation");
    assert.deepEqual(ordinaryRequest(renovation), ordinaryRequest(request("emptyRoom")));
    assert.equal(renovation.featureMode, "emptyRoom");
    assert.equal(renovation.sharedInput.designScenario, "room-renovation");
    assert.equal(renovation.sharedInput.referenceImages.length, 1);
    assert.equal(renovation.sharedInput.styleReferenceImages.length, Number(withStyleReference));
    assert.equal(renovation.items.length, models.length);
    for (const item of renovation.items) {
      assert.equal(item.input.featureMode, "emptyRoom");
      assert.equal(item.input.designScenario, "room-renovation");
      assert.equal(item.input.emptyRoomSmartDefaultVersion, undefined);
      assert.equal(item.input.emptyRoomPromptAgentVersion, undefined);
      assert.equal(item.input.roomRenovationSmartDefaultVersion, baseInput.roomRenovationSmartDefaultVersion);
      assert.equal(item.input.roomRenovationPromptAgentVersion, baseInput.roomRenovationPromptAgentVersion);
      assert.equal(Object.hasOwn(item.input, "roomRenovation"), false);
      assert.equal(Object.hasOwn(item.input, "referenceImages"), false);
      assert.equal(Object.hasOwn(item.input, "styleReferenceImages"), false);
      assert.notEqual(item.input.outputFormat, "webp");
    }
    const serialized = JSON.stringify(renovation);
    assert.equal(serialized.split(mainImage.dataUrl).length - 1, 1);
    assert.equal(serialized.split(styleImage.dataUrl).length - 1, Number(withStyleReference));
  });
}

test("旧房沿用空房提示词复用动作与加载状态", () => {
  for (const reusableIdentity of [null, "same", "changed"]) {
    for (const busy of [false, true]) {
      const state = { busy, currentIdentity: "same", reusableIdentity };
      assert.deepEqual(generationActionState({ ...state, featureMode: "roomRenovation" }),
        generationActionState({ ...state, featureMode: "emptyRoom" }));
    }
  }
  assert.equal(generationActionState({ featureMode: "roomRenovation", currentIdentity: "same", reusableIdentity: "same" }).hasReusablePrompt, true);
  for (const renderMode of ["smart-default", "style-dna"]) {
    for (const forcePromptRegeneration of [false, true]) {
      const state = { emptyRoomRequest: true, designPromptRequest: true, forcePromptRegeneration,
        models: publicModelCatalog().slice(0, 1), renderMode, styleReferenceCount: 0 };
      const copy = generationLoadingCopy({ ...state, roomRenovationRequest: true });
      assert.equal(copy, generationLoadingCopy(state));
      assert.doesNotMatch(copy, /清空|第.*步/);
    }
  }
});

test("旧房和空房独立恢复任务，进度统一按实际出图张数展示", () => {
  const memory = storage();
  const models = publicModelCatalog().slice(0, 2);
  for (const featureMode of ["emptyRoom", "roomRenovation"]) {
    saveGenerationTask(memory, createGenerationTask({ featureMode, createId: () => featureMode,
      loadingLabel: "正在分析空间并生成设计", models, now: () => 1 }));
  }
  const tasks = readGenerationTasks(memory);
  assert.deepEqual(Object.keys(tasks).sort(), ["emptyRoom", "roomRenovation"]);
  assert.notEqual(tasks.emptyRoom.jobId, tasks.roomRenovation.jobId);
  for (const task of Object.values(tasks)) {
    assert.deepEqual(generationTaskView(task, { status: "running", completed: 0, total: 2 }),
      { stage: "loading", message: task.loadingLabel });
    assert.deepEqual(generationTaskView(task, { status: "running", completed: 1, total: 2 }),
      { stage: "loading", message: "已完成 1 / 2 张图…" });
    const outcomes = [{ status: "fulfilled", value: { images: [{ url: "data:image/png;base64,Ag==" }] } }];
    assert.deepEqual(generationTaskView(task, { status: "success", result: { outcomes } }), { stage: "results", outcomes });
  }
});

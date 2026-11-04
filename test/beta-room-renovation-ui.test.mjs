/**
 * [INPUT]: 依赖 node:test/assert/fs、Beta 设计配置与轻量状态、样本库/批次资产、旧房共用判定及 Flux 负向控制器
 * [OUTPUT]: 验证旧房独立 Agent/版本与设计选择恢复、缺失下架阻断、每样本房型补选、样本×模型单流程映射和共享参考图、普通/旧房负向草稿隔离
 * [POS]: test 的 Beta 旧房改造浏览器行为回归，使用内存 DOM/配置/API，不调用真实模型或飞书
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { packBatchAssets } from "../public/beta-assets.js";
import { createBetaDesignConfiguration } from "../public/beta-design-config.js";
import { BETA_FEATURE_COPY } from "../public/beta-model-rules.js";
import { readBetaPageState, saveBetaPageState } from "../public/beta-page-state.js";
import { createBetaSampleLibrary } from "../public/beta-sample-library.js";
import { bindFluxNegativePrompt } from "../public/flux-negative-prompt.js";
import { isEmptyRoomDesign } from "../public/room-renovation.js";

const style = { code: "modern", name: "现代简约", version: 2, published: true, validDna: true };
const reference = { dataUrl: "data:image/png;base64,AA==", name: "style.png", type: "image/png", size: 1 };

class Element {
  constructor() {
    this.value = "";
    this.children = [];
    this.dataset = {};
    this.listeners = new Map();
    const classes = new Set();
    this.classList = {
      add: name => classes.add(name), remove: name => classes.delete(name),
      contains: name => classes.has(name),
      toggle(name, force = !classes.has(name)) { classes[force ? "add" : "delete"](name); },
    };
  }
  get options() { return this.children; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute() {}
  focus() {}
  cloneNode() { return Object.assign(new Element(), { value: this.value, textContent: this.textContent }); }
  addEventListener(name, callback) { this.listeners.set(name, [...this.listeners.get(name) || [], callback]); }
  async dispatch(name) {
    for (const callback of this.listeners.get(name) || []) await callback({ target: this });
  }
}

function fixture(restoredPageState = { featureMode: "roomRenovation", controls: {} }) {
  const elements = Object.fromEntries(["renderModeSelect", "styleSelect", "promptAgentVersionSelect",
    "styleField", "promptAgentVersionField", "styleReferenceField", "configStatus", "promptAgentModelSelect"]
    .map(key => [key, new Element()]));
  elements.promptAgentModelSelect.value = "gemini3pro";
  const state = {
    featureMode: restoredPageState.featureMode, styleReference: null,
    stylesConfig: {
      styles: [structuredClone(style)], smartDefault: { available: true, version: 6 },
      promptAgent: { defaultVersion: 8, versions: [{ name: "白模融合", version: 8 }] },
      emptyRoom: {
        smartDefault: { available: true, version: 34 },
        promptAgent: { defaultVersion: 34, versions: [{ name: "空房融合", version: 34 }] },
      },
      roomRenovation: {
        smartDefault: { available: true, version: 4 },
        promptAgent: { defaultVersion: 4, versions: [{ name: "旧房融合", version: 4 }, { name: "旧房融合", version: 3 }] },
      },
    },
    agentAccess: new Map([["gemini3pro", { selectable: true }]]), agentAccessChecked: true,
  };
  const fillSelect = (select, options, current = "") => {
    select.replaceChildren(...options);
    select.value = String((options.find(option => String(option.value) === String(current) && !option.disabled)
      || options.find(option => !option.disabled))?.value ?? "");
  };
  const controller = createBetaDesignConfiguration({ elements, fillSelect, getState: () => state, restoredPageState });
  return { controller, elements, state };
}

function assertNoOtherDesignVersion(input) {
  for (const key of ["smartDefaultAgentVersion", "promptAgentVersion", "emptyRoomSmartDefaultVersion",
    "emptyRoomPromptAgentVersion", "styleTransferReferenceVersion", "styleTransferPromptAgentVersion"]) {
    assert.equal(key in input, false, `旧房请求不能携带 ${key}`);
  }
}

test("Beta 旧房目录与智能默认使用独立 v4，参考图不改变旧房场景或 Agent 路由", () => {
  assert.deepEqual(BETA_FEATURE_COPY.roomRenovation, {
    label: "旧房改造", prompt: "补充要求（可选）", source: "旧房照片",
  });
  const { controller, state, elements } = fixture();
  controller.render();
  assert.equal(elements.renderModeSelect.value, "smart-default");
  assert.equal(controller.ready(), true);
  assert.equal(controller.unavailableReason(), null);
  for (const image of [null, reference]) {
    state.styleReference = image;
    controller.referenceChanged();
    const input = controller.settings();
    assert.equal(input.designScenario, "room-renovation");
    assert.equal(input.roomRenovationSmartDefaultVersion, 4);
    assert.equal("roomRenovationPromptAgentVersion" in input, false);
    assert.deepEqual(input.styleReferenceImages, image ? [image] : []);
    assertNoOtherDesignVersion(input);
  }
});

test("Beta 旧房平台风格只冻结旧房融合版本，越界版本和已下架风格在提交前阻断", () => {
  const { controller, state, elements } = fixture();
  controller.render();
  elements.renderModeSelect.value = "style-dna";
  controller.render();
  elements.promptAgentVersionSelect.value = "3";
  state.styleReference = reference;
  const input = controller.settings();
  assert.equal(input.renderMode, "style-dna");
  assert.equal(input.styleCode, style.code);
  assert.equal(input.roomRenovationPromptAgentVersion, 3);
  assert.equal("roomRenovationSmartDefaultVersion" in input, false);
  assert.deepEqual(input.styleReferenceImages, []);
  assertNoOtherDesignVersion(input);
  elements.promptAgentVersionSelect.value = "34";
  assert.equal(controller.ready(), false);
  assert.throws(() => controller.settings(), /版本|不可用/);
  elements.promptAgentVersionSelect.value = "3";
  state.stylesConfig.styles[0].published = false;
  assert.equal(controller.ready(), false);
  assert.throws(() => controller.settings(), /风格|不可用/);
});

test("旧房与空房白模切换保留独立选择，轻量快照在刷新后恢复旧房版本和样本集", () => {
  const { controller, state, elements } = fixture();
  controller.render();
  elements.renderModeSelect.value = "style-dna";
  controller.render();
  elements.promptAgentVersionSelect.value = "3";
  state.featureMode = "emptyRoom";
  controller.render();
  assert.equal(controller.settings().emptyRoomSmartDefaultVersion, 34);
  state.featureMode = "whiteModel";
  controller.render();
  assert.equal(controller.settings().smartDefaultAgentVersion, 6);
  state.featureMode = "roomRenovation";
  controller.render();
  assert.equal(elements.renderModeSelect.value, "style-dna");
  assert.equal(elements.promptAgentVersionSelect.value, "3");
  assert.equal(controller.settings().roomRenovationPromptAgentVersion, 3);
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const oldSelection = controller.snapshot();
  assert.equal(oldSelection.roomRenovationRenderMode, "style-dna");
  assert.equal(oldSelection.roomRenovationStyleCode, style.code);
  assert.equal(oldSelection.roomRenovationPromptAgentVersion, "3");
  saveBetaPageState(storage, { featureMode: "roomRenovation", sampleSetIds: { roomRenovation: "SET-OLD" },
    controls: { renderMode: elements.renderModeSelect.value, ...oldSelection } });
  const restored = readBetaPageState(storage);
  assert.equal(restored.featureMode, "roomRenovation");
  assert.equal(restored.sampleSetIds.roomRenovation, "SET-OLD");
  assert.equal(restored.controls.roomRenovationPromptAgentVersion, "3");
  const next = fixture(restored);
  next.controller.render();
  assert.equal(next.controller.settings().roomRenovationPromptAgentVersion, 3);
  next.state.stylesConfig.roomRenovation.promptAgent.versions.push({ name: "旧房融合", version: 5 });
  next.state.stylesConfig.roomRenovation.promptAgent.defaultVersion = 5;
  next.controller.render();
  assert.equal(next.controller.settings().roomRenovationPromptAgentVersion, 3, "刷新仍保留有效的显式旧房版本");
  assert.equal(next.state.stylesConfig.emptyRoom.smartDefault.version, 34);
});

test("旧房配置缺失或下架、非法智能版本及权限失效均阻断，不借用空房配置", () => {
  for (const smartDefault of [undefined, { available: false, version: 4 },
    { available: true, version: null }, { available: true, version: 0 }, { available: true, version: 1.5 }]) {
    const { controller, state } = fixture();
    state.stylesConfig.roomRenovation = smartDefault ? { smartDefault, promptAgent: { versions: [] } } : undefined;
    controller.render();
    assert.equal(controller.ready(), false);
    assert.match(controller.unavailableReason(), /旧房|智能|不可用|版本/);
    assert.throws(() => controller.settings(), /旧房|智能|不可用|版本/);
    assert.equal(state.stylesConfig.emptyRoom.smartDefault.version, 34);
  }
  const { controller, state, elements } = fixture();
  controller.render();
  elements.renderModeSelect.value = "style-dna";
  controller.render();
  state.stylesConfig.roomRenovation.promptAgent.versions = [];
  assert.equal(controller.ready(), false);
  assert.throws(() => controller.settings(), /版本|不可用/);
  state.agentAccess.set("gemini3pro", { selectable: false });
  assert.match(controller.unavailableReason(), /提示词模型/);
});

test("旧房实际构建按样本×模型展开为 emptyRoom 单流程，房型及单份风格图完整保留", async () => {
  const source = await readFile(new URL("../public/beta-app.js", import.meta.url), "utf8");
  const functionSource = source.match(/function buildItems\(startedAt = new Date\(\)\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(functionSource);
  const { controller, state } = fixture();
  state.styleReference = reference;
  controller.render();
  const cases = [
    { caseId: "OLD-1", label: "客厅原图", roomType: "客厅", prompt: "重新设计", referenceImages: [] },
    { caseId: "OLD-2", label: "储藏原图", roomType: "其他", roomTypeDetail: " 储藏室 ", prompt: "重新设计", referenceImages: [] },
  ];
  const models = [{ key: "aiTextureEnhancement", label: "Flux", defaultRatio: "4:3" },
    { key: "banana2", label: "Banana 2.1", defaultRatio: "16:9" }];
  const elements = Object.fromEntries(["ratioSelect", "negativePromptInput", "qualitySelect", "resolutionSelect"]
    .map(key => [key, { value: key === "ratioSelect" ? "auto" : key === "resolutionSelect" ? "2K" : "" }]));
  const context = {
    assertFeatureConfig() {}, currentCases: () => cases, selectedModels: () => models,
    state, elements, FEATURE_COPY: BETA_FEATURE_COPY, isEmptyRoomDesign,
    designSettings: () => controller.settings(),
    adaptGenerationInputForModel: input => input,
    createBetaRunId: ({ sequence }) => `RUN-${sequence}`,
  };
  const build = new Function(...Object.keys(context), `return (${functionSource})();`);
  const items = build(...Object.values(context));
  assert.equal(items.length, 4);
  assert.equal(new Set(items.map(item => item.runId)).size, 4);
  for (const item of items) {
    assert.equal(item.input.featureMode, "emptyRoom");
    assert.equal(item.input.designScenario, "room-renovation");
    assert.equal(item.input.roomRenovationSmartDefaultVersion, 4);
    assert.equal(item.input.roomType, item.sampleId === "OLD-1" ? "客厅" : "其他");
    assert.equal(item.input.roomTypeDetail, item.sampleId === "OLD-1" ? undefined : "储藏室");
    assert.equal(item.input.prompt, "重新设计");
    assert.equal(item.input.ratioMode, "auto");
    assert.equal(item.input.ratio, models.find(model => model.key === item.input.modelKey).defaultRatio);
    assertNoOtherDesignVersion(item.input);
  }
  const packed = packBatchAssets(items, "roomRenovation");
  assert.deepEqual(packed.assets, { "shared-style": [reference] });
  assert.ok(packed.items.every(item => item.styleReferenceAssetKey === "shared-style"
    && !("referenceImages" in item.input) && !("styleReferenceImages" in item.input)));
});

test("旧房复用其他功能样本时逐图补房型，详情只作用本次且无原图重读或写回", async context => {
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: () => new Element() };
  context.after(() => { globalThis.document = previousDocument; });
  const elements = Object.fromEntries(["sampleSetSyncStatus", "sampleSetSelect", "sampleCount", "sampleList", "freePromptList",
    "roomTypeSelect", "sampleSetLibraryPanel", "sampleSetCreatePanel", "sourceFilesField", "freePromptsField",
    "saveSampleSetButton", "cancelSampleSetButton", "newSampleSetButton", "sourceFilesInput", "sourceFilesDropZone",
    "sampleSetNameInput", "freePromptsInput"].map(key => [key, new Element()]));
  elements.roomTypeSelect.append(...["", "客厅", "其他"].map(value => Object.assign(new Element(), { value })));
  const sampleSet = { sampleSetId: "WHITE-SOURCE", featureMode: "whiteModel", name: "共享样本", sampleCount: 1,
    samples: [{ sampleId: "SAMPLE-1", image: {
      name: "source.jpg", type: "image/jpeg", size: 1024, previewUrl: "/api/beta/preview/SAMPLE-1",
    } }] };
  const original = structuredClone(sampleSet);
  const calls = [];
  const library = createBetaSampleLibrary({
    elements, onChange() {}, onError: assert.fail,
    readImage: () => assert.fail("已有样本不能重读或重传原图"),
    api: async (path, options) => {
      assert.equal(options, undefined, "房型补选不写回已有样本");
      calls.push(path);
      return path === "/api/beta/sample-sets" ? { sampleSets: [sampleSet] } : { sampleSet };
    },
  });
  await library.load("roomRenovation", sampleSet.sampleSetId);
  assert.equal(library.isReady(), true);
  assert.throws(() => library.assertRoomTypes(), /房间类型/);
  const field = elements.sampleList.children[0].children.at(-1);
  assert.equal(field.className, "field beta-sample-room");
  const select = field.children[1];
  const detail = field.children[2];
  select.value = "其他";
  await select.dispatch("change");
  assert.throws(() => library.assertRoomTypes(), /具体空间类型/);
  detail.value = "衣帽间";
  await detail.dispatch("input");
  assert.doesNotThrow(() => library.assertRoomTypes());
  assert.equal(library.currentCases()[0].roomType, "其他");
  assert.equal(library.currentCases()[0].roomTypeDetail, "衣帽间");
  assert.deepEqual(sampleSet, original);
  assert.deepEqual(calls, ["/api/beta/sample-sets", "/api/beta/sample-sets/WHITE-SOURCE"]);
});

test("Beta 复用负向控制器时旧房从独立空草稿开始，普通自定义不会串入旧房", async () => {
  const textarea = new Element();
  textarea.value = "保留原材质";
  const note = new Element();
  const control = bindFluxNegativePrompt({ textarea, note, root: new Element(), count: new Element() });
  control.render(["aiTextureEnhancement"], "emptyRoom");
  control.render(["aiTextureEnhancement"], "roomRenovation");
  assert.equal(control.value(), "");
  assert.match(note.textContent, /旧房专属默认/);
  textarea.value = "旧房定制负向";
  await textarea.dispatch("input");
  control.render(["aiTextureEnhancement"], "whiteModel");
  assert.equal(control.value(), "保留原材质");
  control.render(["aiTextureEnhancement"], "roomRenovation");
  assert.equal(control.value(), "旧房定制负向");
  assert.match(note.textContent, /整段覆盖旧房专属默认/);
});

/**
 * [INPUT]: 依赖 node:test/assert、公开模型目录、共享搜索单选下拉的内存 DOM 替身及设计配置/图片能力/生成输入/任务恢复纯函数
 * [OUTPUT]: 对外提供风格转换单主图/单选/独立Agent、真实配置错误与正常无说明、参考互斥/删除恢复、图片共享和任务隔离回归
 * [POS]: test 的风格转换浏览器合同测试，不调用付费模型或真实飞书
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";
import { designPromptConfiguration, designSourceValidation, platformStyleAvailability, renderPromptAgentContext } from "../public/app-config-controls.js";
import { generationActionState } from "../public/generation-actions.js";
import { buildGenerationInput } from "../public/generation-input.js";
import { buildGenerationJobRequest, generationLoadingCopy } from "../public/generation-task-request.js";
import { createGenerationTask, readGenerationTasks, saveGenerationTask } from "../public/generation-task-state.js";
import { referenceCapability } from "../public/model-capabilities.js";
import { bindWhiteModelRenderMode, normalizeStyleTransferSelection, styleTransferRenderModeOptions } from "../public/white-model-render-mode.js";
import { publicModelCatalog } from "../src/model-config.mjs";

const mainImage = { dataUrl: "data:image/png;base64,AA==", name: "room.png", size: 1, type: "image/png" };
const styleImage = { ...mainImage, dataUrl: "data:image/png;base64,AQ==", name: "style.png" };
const style = { code: "minimal-v2", familyCode: "minimal", name: "现代简约", published: true, validDna: true, version: 2 };

test("风格转换对所有模型固定要求一张空间主图", () => {
  for (const model of publicModelCatalog()) {
    const capability = referenceCapability({ featureMode: "styleTransfer", model, policy: { maxCount: 4 } });
    assert.equal(capability.limit, 1);
    assert.equal(capability.multiple, false);
    assert.equal(capability.optionalLabel, "必填 · 1张");
    assert.equal(capability.title, "待转换空间图");
  }
  assert.match(designSourceValidation("styleTransfer", 0), /需要且只允许 1 张空间图/);
  assert.match(designSourceValidation("styleTransfer", 2), /需要且只允许 1 张空间图/);
  assert.equal(designSourceValidation("styleTransfer", 1), null);
});

test("风格转换只读取自己的双模式 Agent 配置", () => {
  const state = {
    emptyRoomConfig: { promptAgent: { defaultVersion: 9 } },
    featureMode: "styleTransfer",
    fusionPromptConfig: { defaultVersion: 5 },
    smartDefaultConfig: { version: 6 },
    styleTransferConfig: { promptAgent: { defaultVersion: 2 }, reference: { version: 3 } },
  };
  assert.equal(designPromptConfiguration(state), state.styleTransferConfig);
  assert.equal(designPromptConfiguration({ ...state, featureMode: "emptyRoom" }), state.emptyRoomConfig);
  assert.deepEqual(designPromptConfiguration({ ...state, featureMode: "whiteModel" }), {
    promptAgent: state.fusionPromptConfig, smartDefault: state.smartDefaultConfig,
  });
});

test("参考图 Agent 标题和基模说明使用独立参考语义，不显示智能默认", () => {
  const element = () => ({ attributes: {}, classList: { toggle() {} }, replaceChildren() {},
    setAttribute(name, value) { this.attributes[name] = value; } });
  const elements = Object.fromEntries(["promptAgentTitle", "promptAgentVersionAvailability",
    "promptAgentVersionField", "promptAgentVersionLabel", "promptAgentModelLabelCopy",
    "promptAgentModelSelect", "promptAgentNote"].map((key) => [key, element()]));
  const state = { featureMode: "styleTransfer", availablePromptAgents: new Map(), promptAgentCatalog: [] };
  for (const renderMode of [null, "style-dna", "style-reference"]) {
    renderPromptAgentContext(elements, state, renderMode);
    assert.doesNotMatch(elements.promptAgentTitle.textContent, /智能默认/);
    assert.doesNotMatch(elements.promptAgentModelSelect.attributes["aria-label"], /智能默认/);
  }
  assert.equal(elements.promptAgentTitle.textContent, "风格转换参考图 Agent");
  assert.equal(elements.promptAgentModelSelect.attributes["aria-label"], "风格转换参考图 Agent 基模");
});

test("无明确目标时阻断且不选首个平台风格，上传参考图切为参考图风格", () => {
  const choices = styleTransferRenderModeOptions([style]);
  assert.deepEqual(choices.map((choice) => choice.mode), ["style-dna"]);
  for (const selection of [null, { mode: "smart-default", styleCode: style.code }]) {
    const empty = normalizeStyleTransferSelection(selection, [style]);
    assert.equal(empty.mode, null);
    assert.equal(empty.available, false);
    assert.match(empty.reason, /请选择平台风格，或上传风格参考图/);
    assert.doesNotMatch(empty.reason, /智能默认/);
  }
  const locked = platformStyleAvailability("styleTransfer", 1);
  assert.equal(locked.available, false);
  assert.match(locked.reason, /当前使用参考图风格/);
  const selection = normalizeStyleTransferSelection(
    { mode: "style-dna", styleCode: style.code }, [style],
    { referenceCount: 1, reference: { available: true, version: 3 } },
  );
  assert.equal(selection.mode, "style-reference");
  assert.equal(selection.styleCode, null);
  assert.deepEqual(platformStyleAvailability("styleTransfer", 0), { available: true, reason: "" });
  assert.equal(platformStyleAvailability("emptyRoom", 1).available, false);
  assert.equal(platformStyleAvailability("whiteModel", 1).available, true);
});

test("搜索单选下拉保留风格隔离、明确目标、参考图互斥与选择回调", () => {
  const doc = { activeElement: null, addEventListener() {} };
  doc.defaultView = { innerWidth: 1280, innerHeight: 720, addEventListener() {},
    requestAnimationFrame() { return 1; } };
  const element = (tag = "div") => {
    const node = {
      tagName: tag, ownerDocument: doc, children: [], attributes: {}, dataset: {},
      listeners: {}, style: {}, className: "", value: "", disabled: false, hidden: false,
      addEventListener(type, listener) { this.listeners[type] = listener; },
      emit(type, properties = {}) {
        this.listeners[type]?.({ target: this, preventDefault() {}, ...properties });
      },
      append(...children) {
        for (const child of children) {
          if (child.parentNode) child.parentNode.children = child.parentNode.children.filter((item) => item !== child);
          child.parentNode = this;
          this.children.push(child);
        }
      },
      contains(child) { return child === this || this.children.some((item) => item.contains(child)); },
      replaceChildren(...children) {
        this.children.forEach((child) => { child.parentNode = null; });
        this.children = [];
        this.append(...children);
      },
      setAttribute(name, value) { this.attributes[name] = String(value); },
      focus(options) { doc.activeElement = this; this.focusOptions = options; },
      click() { if (!this.disabled) { this.focus({ preventScroll: true }); this.emit("click", { detail: 1 }); } },
      getBoundingClientRect() { return { left: 100, top: 340, right: 360, bottom: 378, width: 260, height: 38 }; },
      showPopover() { this.popoverOpen = true; this.emit("toggle", { newState: "open" }); },
      hidePopover() { this.popoverOpen = false; this.emit("toggle", { newState: "closed" }); },
    };
    const classes = () => new Set(node.className.split(/\s+/).filter(Boolean));
    node.classList = {
      add(name) { node.className = [...classes().add(name)].join(" "); },
      remove(name) { const values = classes(); values.delete(name); node.className = [...values].join(" "); },
      toggle(name, enabled) { this[enabled ? "add" : "remove"](name); },
      contains(name) { return classes().has(name); },
    };
    return node;
  };
  doc.createElement = element;
  doc.createElementNS = (_, tag) => element(tag);
  doc.body = element("body");
  const root = element();
  doc.body.append(root);
  const availability = element();
  const note = element();
  const changes = [];
  const controller = bindWhiteModelRenderMode({ root, availability, note,
    onChange(choice) { changes.push(choice); } });
  const trigger = root.children[0];
  const panel = doc.body.children.at(-1);
  const walk = (node) => [node, ...node.children.flatMap(walk)];
  const byClass = (name) => walk(panel).find((node) => node.classList.contains(name));
  const row = (mode, code = "") => walk(panel).find((node) => node.dataset.modelKey === `${mode}:${code}`);
  const rows = () => walk(panel).filter((node) => node.attributes.role === "radio");
  const selectStyle = () => { trigger.click(); row("style-dna", style.code).click(); };

  assert.equal(trigger.children[0].textContent, "智能默认");
  assert.equal(row("smart-default").disabled, true);
  assert.equal(row("smart-default").attributes["aria-checked"], "true");
  controller.setStyles([style]);
  controller.setSmartDefault({ available: true, version: 3 });
  assert.equal(byClass("model-picker-list").attributes.role, "radiogroup");
  assert.equal(byClass("model-picker-search-wrap").children.length, 1);
  assert.equal(trigger.children.length, 2);
  trigger.click();
  const search = byClass("model-picker-search");
  search.value = "现代";
  search.emit("input");
  assert.equal(row("smart-default").hidden, true);
  assert.equal(row("style-dna", style.code).hidden, false);
  assert.equal(controller.current().mode, "smart-default");
  search.value = "";
  search.emit("input");
  row("style-dna", style.code).click();
  assert.equal(controller.current().styleCode, style.code);
  assert.equal(trigger.children[0].textContent, "现代简约 · v2");
  assert.equal(note.textContent, "");
  assert.equal(note.hidden, true);
  assert.equal(note.classList.contains("error"), false);
  assert.equal(panel.popoverOpen, false);
  assert.equal(doc.activeElement, trigger);
  assert.deepEqual(trigger.focusOptions, { preventScroll: true });

  controller.setDesignContext({ featureMode: "styleTransfer" });
  assert.equal(controller.current().mode, null);
  assert.equal(controller.current().available, false);
  assert.equal(note.hidden, true, "未选择用户目标不作为配置错误显示");
  assert.equal(trigger.children[0].textContent, "请选择风格");
  assert.equal(rows().length, 1);
  assert.equal(row("style-dna", style.code).attributes["aria-checked"], "false");
  assert.equal(row("smart-default"), undefined);
  selectStyle();
  assert.equal(controller.current().styleCode, style.code);
  const locked = platformStyleAvailability("styleTransfer", 1);
  controller.setDesignContext({ featureMode: "styleTransfer", platformStyles: locked,
    referenceCount: 1, reference: { available: true, version: 4 } });
  assert.equal(controller.current().mode, "style-reference");
  assert.equal(controller.current().label, "参考图风格");
  assert.equal(controller.current().styleCode, null);
  assert.equal(row("style-dna", style.code).disabled, true);
  assert.equal(row("style-reference").attributes["aria-checked"], "true");
  assert.match(row("style-dna", style.code).title, /当前使用参考图风格/);
  row("style-dna", style.code).click();
  assert.equal(controller.current().mode, "style-reference");
  controller.setDesignContext({ featureMode: "styleTransfer", referenceCount: 1,
    reference: { available: false, reason: "参考图 Agent 未上架" } });
  assert.equal(note.textContent, "参考图 Agent 未上架");
  assert.equal(note.hidden, false);
  assert.equal(note.classList.contains("error"), true);
  controller.setDesignContext({ featureMode: "styleTransfer", referenceCount: 1,
    reference: { available: true, version: 4 } });
  assert.equal(note.hidden, true);
  assert.equal(note.classList.contains("error"), false);
  controller.setDesignContext({ featureMode: "styleTransfer", referenceCount: 0 });
  assert.equal(row("style-dna", style.code).disabled, false);
  assert.equal(row("style-dna", style.code).attributes["aria-checked"], "false");
  assert.equal(controller.current().mode, null);
  controller.setDesignContext({ featureMode: "whiteModel" });
  assert.equal(controller.current().styleCode, style.code);
  controller.setDesignContext({ featureMode: "styleTransfer" });
  assert.equal(controller.current().mode, null);
  assert.equal(changes.length, 2);
  assert.ok(changes.every((choice) => choice.mode === "style-dna" && choice.styleCode === style.code));
});

function inputFor(renderMode) {
  return buildGenerationInput({
    emptyRoomFields: { roomType: "livingRoom", furniture: { items: ["沙发"] } },
    featureMode: "styleTransfer",
    model: publicModelCatalog()[0],
    negativePrompt: " no text ",
    prompt: { free: "保留现有沙发", refined: "旧精模要求" },
    promptAgentModelKey: "gemini3pro",
    promptAgentVersion: 7,
    ratio: "4:3", ratioMode: "auto", referenceImages: [mainImage],
    renderMode, resolution: "2K", styleReferenceImages: renderMode.mode === "style-reference" ? [styleImage] : [],
  });
}

test("两种风格转换只提交独立 Agent 版本，空房字段不泄漏到请求", () => {
  for (const mode of ["style-reference", "style-dna"]) {
    const input = inputFor({ mode, agentVersion: 3, styleCode: mode === "style-dna" ? style.code : null });
    assert.equal(input.featureMode, "styleTransfer");
    assert.equal(input.prompt, "保留现有沙发");
    assert.equal(input.negativePrompt, "no text");
    assert.equal(input.outputFormat, "png");
    assert.equal(input.styleTransferReferenceVersion, mode === "style-reference" ? 3 : undefined);
    assert.equal("styleTransferSmartDefaultVersion" in input, false);
    assert.equal(input.styleTransferPromptAgentVersion, mode === "style-dna" ? 7 : undefined);
    assert.equal(input.smartDefaultAgentVersion, undefined);
    assert.equal(input.promptAgentVersion, undefined);
    assert.equal(input.emptyRoomSmartDefaultVersion, undefined);
    assert.equal(input.emptyRoomPromptAgentVersion, undefined);
    assert.equal("roomType" in input, false);
    assert.equal("furniture" in input, false);
  }
});

test("多模型风格转换共享单份主图和参考图且保留目标版本", () => {
  const baseInput = inputFor({ mode: "style-reference", agentVersion: 3 });
  const request = buildGenerationJobRequest({
    baseInput, featureMode: "styleTransfer", models: publicModelCatalog().slice(0, 2),
    sourceImage: { width: 1200, height: 900 },
  });
  assert.deepEqual(request.sharedInput.referenceImages, [mainImage]);
  assert.deepEqual(request.sharedInput.styleReferenceImages, [styleImage]);
  for (const { input } of request.items) {
    assert.equal(input.styleTransferReferenceVersion, 3);
    assert.equal("referenceImages" in input, false);
    assert.equal("styleReferenceImages" in input, false);
  }
});

test("风格转换复用提示词并使用转换语义，任务恢复与白模隔离", () => {
  assert.deepEqual(generationActionState({
    featureMode: "styleTransfer", currentIdentity: "style-v2", reusableIdentity: "style-v2",
  }), { hasReusablePrompt: true, mainLabel: "START", mainAriaLabel: "再次转换风格" });
  assert.equal(generationActionState({
    featureMode: "styleTransfer", currentIdentity: "style-v3", reusableIdentity: "style-v2",
  }).hasReusablePrompt, false);
  const values = new Map();
  const storage = { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) };
  for (const featureMode of ["styleTransfer", "whiteModel"]) {
    saveGenerationTask(storage, createGenerationTask({
      createId: () => featureMode, featureMode, loadingLabel: featureMode,
      models: [{ key: "banana2", label: "Banana 2" }],
    }));
  }
  assert.deepEqual(Object.keys(readGenerationTasks(storage)).sort(), ["styleTransfer", "whiteModel"]);
});

test("风格转换加载文案区分平台与参考图并说明结构视角保留", () => {
  assert.match(generationLoadingCopy({ styleTransferRequest: true, renderMode: "style-dna" }), /平台风格.*保留空间结构与原视角/);
  assert.match(generationLoadingCopy({ styleTransferRequest: true, renderMode: "style-reference", styleReferenceCount: 1 }), /参考图风格.*保留空间结构与原视角/);
});

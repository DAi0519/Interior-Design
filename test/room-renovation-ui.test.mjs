/**
 * [INPUT]: 依赖旧房改造浏览器包装层、空房配置与统一生成输入/请求/任务状态，以及结果切换按钮的内存 DOM
 * [OUTPUT]: 对外提供旧房单主图、空房 Agent 复用、两阶段标记与单份载荷、独立任务恢复、禁止 Prompt 复用和三图切换/下载目标合同测试
 * [POS]: test 的旧房改造前端合同测试，不调用模型、GPU 或真实飞书
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";
import { designPromptConfiguration, designSourceValidation, platformStyleAvailability } from "../public/app-config-controls.js";
import { generationActionState } from "../public/generation-actions.js";
import { buildGenerationInput } from "../public/generation-input.js";
import { buildGenerationJobRequest, generationLoadingCopy } from "../public/generation-task-request.js";
import { createGenerationTask, generationTaskView, readGenerationTasks, saveGenerationTask } from "../public/generation-task-state.js";
import { referenceCapability, referenceSubject } from "../public/model-capabilities.js";
import { bindRenovationPreview, isEmptyRoomDesign, renovationImageChoices, renderRenovationIntro } from "../public/room-renovation.js";
import { publicModelCatalog } from "../src/model-config.mjs";

const original = { url: "data:image/jpeg;base64,AA==", width: 1200, height: 900 };
const cleared = { url: "data:image/webp;base64,AQ==", width: 1200, height: 900 };
const designed = { url: "data:image/png;base64,Ag==", width: 1200, height: 900 };
const mainImage = { id: "old-room", dataUrl: original.url, name: "旧房.jpg", size: 1, type: "image/jpeg" };
const styleImage = { ...mainImage, id: "style", dataUrl: "data:image/png;base64,Aw==", name: "风格.png", type: "image/png" };
const furniture = { items: ["沙发", "茶几"], other: "钢琴" };
const result = () => ({
  durationMs: 100,
  images: [designed],
  request: { outputFormat: "png", size: "1200x900", referenceImageCount: 1 },
  roomRenovation: { originalImage: original, clearedImage: cleared, clearanceSync: { status: "success" }, pipelineId: "pipeline-1" },
});

function input(renderMode = "smart-default", featureMode = "roomRenovation") {
  return buildGenerationInput({
    emptyRoomFields: { roomType: "客厅", furnitureSelection: furniture },
    featureMode,
    model: publicModelCatalog()[0],
    negativePrompt: "保留结构",
    prompt: { free: "保留通道", refined: "不应进入旧房请求" },
    promptAgentModelKey: "gemini3pro",
    promptAgentVersion: 32,
    ratio: "4:3",
    ratioMode: "auto",
    referenceImages: [mainImage],
    renderMode: { mode: renderMode, agentVersion: 31, styleCode: renderMode === "style-dna" ? "modern@v2" : null },
    resolution: "2K",
    styleReferenceImages: [styleImage],
  });
}

function storage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
}

function withDocument(run) {
  const previous = globalThis.document;
  const document = {
    createElement(tagName) {
      const classes = new Set();
      const node = {
        tagName: tagName.toUpperCase(), ownerDocument: document, children: [], attributes: new Map(), listeners: new Map(),
        append(...children) { this.children.push(...children); },
        setAttribute(name, value) { this.attributes.set(name, String(value)); },
        getAttribute(name) { return this.attributes.get(name) ?? null; },
        addEventListener(name, listener) { this.listeners.set(name, listener); },
        click() { this.listeners.get("click")?.({ target: this }); },
        classList: { contains: (name) => classes.has(name), toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); } },
      };
      Object.defineProperty(node, "childElementCount", { get: () => node.children.length });
      return node;
    },
  };
  globalThis.document = document;
  try { return run(document); } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
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

test("旧房使用空房双模式配置，风格参考图锁定智能默认", () => {
  const state = {
    featureMode: "roomRenovation",
    emptyRoomConfig: { promptAgent: { defaultVersion: 32 }, smartDefault: { available: true, version: 31 } },
    fusionPromptConfig: { defaultVersion: 7 }, smartDefaultConfig: { version: 6 },
    styleTransferConfig: { promptAgent: { defaultVersion: 2 } },
  };
  assert.equal(designPromptConfiguration(state), state.emptyRoomConfig);
  assert.equal(platformStyleAvailability("roomRenovation", 0).available, true);
  assert.equal(platformStyleAvailability("roomRenovation", 1).available, false);
});

for (const mode of ["smart-default", "style-dna"]) test(`旧房 ${mode} 使用空房后端身份并完整传递房型家具与对应 Agent`, () => {
  const baseInput = input(mode);
  assert.equal(baseInput.featureMode, "emptyRoom");
  assert.equal(baseInput.roomRenovation, true);
  assert.equal(baseInput.roomType, "客厅");
  assert.deepEqual(baseInput.furnitureSelection, furniture);
  assert.equal(baseInput.prompt, "保留通道");
  assert.equal(baseInput.outputFormat, "png");
  assert.equal(baseInput.emptyRoomSmartDefaultVersion, mode === "smart-default" ? 31 : undefined);
  assert.equal(baseInput.emptyRoomPromptAgentVersion, mode === "style-dna" ? 32 : undefined);
  assert.equal(baseInput.promptAgentVersion, undefined);
  assert.equal(baseInput.styleTransferPromptAgentVersion, undefined);
  assert.equal(baseInput.styleTransferReferenceVersion, undefined);
  assert.equal(baseInput.referenceImages[0].dataUrl, mainImage.dataUrl);
  assert.equal(baseInput.styleReferenceImages[0].dataUrl, styleImage.dataUrl);
  const ordinary = input(mode, "emptyRoom");
  assert.notEqual(ordinary.roomRenovation, true);
});

test("旧房多模型后台请求只共享一次主图和风格图，任务身份独立于后端空房路由", () => {
  const models = publicModelCatalog().slice(0, 3);
  const request = buildGenerationJobRequest({
    baseInput: input(), batchId: "renovation-batch", featureMode: "roomRenovation", forcePromptRegeneration: false,
    jobId: "generation-renovation-1", models, sourceImage: { width: 1200, height: 900 },
  });
  assert.equal(request.featureMode, "emptyRoom");
  assert.equal(request.sharedInput.featureMode, "emptyRoom");
  assert.equal(request.sharedInput.roomRenovation, true);
  assert.equal(request.sharedInput.referenceImages.length, 1);
  assert.equal(request.sharedInput.styleReferenceImages.length, 1);
  assert.equal(request.items.length, models.length);
  for (const item of request.items) {
    assert.equal(item.input.featureMode, "emptyRoom");
    assert.ok(!Object.hasOwn(item.input, "referenceImages"));
    assert.ok(!Object.hasOwn(item.input, "styleReferenceImages"));
    assert.notEqual(item.input.outputFormat, "webp");
  }
  const memory = storage();
  for (const featureMode of ["emptyRoom", "roomRenovation"]) {
    saveGenerationTask(memory, createGenerationTask({ featureMode, createId: () => featureMode,
      loadingLabel: "正在清空并设计", models, now: () => 1 }));
  }
  const tasks = readGenerationTasks(memory);
  assert.deepEqual(Object.keys(tasks).sort(), ["emptyRoom", "roomRenovation"]);
  assert.notEqual(tasks.emptyRoom.jobId, tasks.roomRenovation.jobId);
  const outcomes = [{ status: "fulfilled", value: result() }];
  assert.deepEqual(generationTaskView(tasks.roomRenovation, { status: "success", result: { outcomes } }), { stage: "results", outcomes });
});

test("旧房每次执行清空和设计，不显示提示词复用按钮", () => {
  const view = generationActionState({ featureMode: "roomRenovation", currentIdentity: "same", reusableIdentity: "same" });
  assert.equal(view.hasReusablePrompt, false);
  const copy = generationLoadingCopy({ roomRenovationRequest: true, emptyRoomRequest: true, designPromptRequest: true,
    forcePromptRegeneration: false, models: publicModelCatalog().slice(0, 1), renderMode: "smart-default", styleReferenceCount: 0 });
  assert.match(copy, /清空/);
  assert.match(copy, /设计/);
});

test("旧房任务进入设计阶段后优先显示服务端阶段消息", () => {
  const task = createGenerationTask({ featureMode: "roomRenovation", createId: () => "renovation-stage",
    loadingLabel: "第 1 / 2 步：正在清空旧房", models: publicModelCatalog().slice(0, 2) });
  const job = { status: "running", completed: 1, total: 2, stages: { roomRenovation: "designing" },
    message: "第 2 / 2 步：清空已完成，正在生成新设计…" };
  assert.deepEqual(generationTaskView(task, job), { stage: "loading", message: job.message });
  assert.equal(generationTaskView({ ...task, featureMode: "emptyRoom" }, job).message, "已完成 1 / 2 张图…");
});

test("两阶段结果保留三图和流程身份，无原图内存也能恢复完整选择", () => {
  const received = result();
  assert.deepEqual(renovationImageChoices(received).map(({ label, image }) => [label, image]), [
    ["原图", original], ["清空图", cleared], ["设计图", designed],
  ]);
  const fallback = { ...received, roomRenovation: { clearedImage: cleared } };
  assert.equal(renovationImageChoices(fallback, mainImage)[0].image.url, mainImage.dataUrl);
  assert.deepEqual(renovationImageChoices({ images: [designed] }, mainImage), []);
  assert.equal(renovationImageChoices({ ...fallback, images: [] }).at(-1).label, "清空图");
});

test("三图真实按钮默认设计图，切换更新图像、无障碍选中态和下载目标", () => withDocument((document) => {
  const image = document.createElement("img");
  const received = result();
  const preview = bindRenovationPreview({ result: received, image, modelLabel: "模型 A" });
  assert.ok(preview);
  assert.equal(preview.root.getAttribute("role"), "group");
  assert.deepEqual(preview.root.children.map((button) => button.textContent), ["原图", "清空图", "设计图"]);
  assert.equal(image.src, designed.url);
  assert.equal(image.alt, "模型 A 设计图");
  assert.deepEqual(preview.root.children.map((button) => button.getAttribute("aria-pressed")), ["false", "false", "true"]);
  for (const [index, expected] of [original, cleared, designed].entries()) {
    preview.root.children[index].click();
    assert.equal(image.src, expected.url);
    assert.equal(preview.selection().result.images[0], expected);
    assert.equal(preview.selection().result.request.outputFormat, ["jpeg", "webp", "png"][index]);
    assert.equal(preview.selection().label, `模型 A-${["原图", "清空图", "设计图"][index]}`);
    assert.deepEqual(preview.root.children.map((button) => button.getAttribute("aria-pressed")),
      [0, 1, 2].map((choice) => String(choice === index)));
  }
  assert.equal(received.images[0], designed);
  assert.equal(received.request.outputFormat, "png");
  assert.equal(bindRenovationPreview({ result: { images: [designed] }, image, modelLabel: "普通功能" }), null);
}));

test("旧房流程说明只创建一次并随功能显隐", () => withDocument((document) => {
  const root = document.createElement("section");
  renderRenovationIntro(root, true);
  assert.equal(root.classList.contains("hidden"), false);
  assert.match(root.children.map((node) => node.textContent).join(" "), /旧房照片.*清空房间.*全新设计/);
  const nodes = [...root.children];
  renderRenovationIntro(root, false);
  assert.equal(root.classList.contains("hidden"), true);
  assert.deepEqual(root.children, nodes);
}));

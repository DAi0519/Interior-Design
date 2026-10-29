/**
 * [INPUT]: 依赖Node测试、sharp真实PNG、二次编辑共享UI夹具、消除操作真源、实际服务/OneAPI适配器及GPT模型目录
 * [OUTPUT]: 验证局部消除独立精简最终Prompt与operation透传归档、区域/模式准入、旧服务门禁、三草稿与工具适配/手写保护；普通填充和参考模板隔离
 * [POS]: test 的局部消除交互与真实服务合同，复用实际控制器/画布/PNG准备和归档，模型与飞书均为内存替身
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { MASK_FILL_REMOVAL_PROMPT_VERSION, normalizeMaskFillOperation, buildMaskFillJobRequest } from "../public/image-mask-fill-geometry.js";
import { executeImageMaskFill, validateMaskFillInput, readImageMaskFillConfig } from "../src/image-mask-fill-service.mjs";
import { sunburstMaskPrompt } from "../src/image-mask-fill-oneapi.mjs";
import { MODEL_CONFIGS } from "../src/model-config.mjs";
import { fixture, image, reference } from "./image-mask-fill-ui-fixture.mjs";

const gptConfig = (overrides = {}) => ({ key: "gptImage25Sunburst", supportsBoxSelection: true,
  supportsLassoSelection: true, modes: [{ key: "prompt", available: true }, { key: "reference", available: true }],
  sizes: MODEL_CONFIGS.gptImage25Sunburst.sizes, outputResolutions: ["1K", "2K", "4K"],
  qualityOptions: MODEL_CONFIGS.gptImage25Sunburst.qualityOptions, defaultQuality: "medium", ...overrides });

function removalFixture() {
  const f = fixture({ prefillInstruction: false });
  f.controller.configure({ version: "current", removalPromptVersion: MASK_FILL_REMOVAL_PROMPT_VERSION, available: true, models: [gptConfig(),
    { key: "flux2Klein", modes: [{ key: "prompt", available: true }, { key: "reference", available: true }] }] });
  f.modes.find(button => button.dataset.maskMode === "remove").fire("click");
  return f;
}

function assertNeedsRegion(f) {
  assert.equal(f.controller.isAvailable(), false);
  assert.match(f.controller.availabilityReason(), /框选|圈选|涂抹|区域/);
  assert.throws(() => f.controller.jobRequest({ image }), /框选|圈选|涂抹|区域/);
}

async function uploadReference(f, context) {
  const originals = Object.fromEntries(["document", "FileReader", "Image"].map(key => [key, globalThis[key]]));
  context.after(() => { for (const [key, value] of Object.entries(originals)) {
    if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
  } });
  let created = 0;
  globalThis.document = { createElement: () => f.node(`__removal-reference-${created++}`) };
  globalThis.FileReader = class {
    addEventListener(name, callback) { this[name] = callback; }
    readAsDataURL(file) { this.result = file.dataUrl; queueMicrotask(() => this.load()); }
  };
  globalThis.Image = class {
    addEventListener(name, callback) { this[name] = callback; }
    set src(value) { this.naturalWidth = reference.width; this.naturalHeight = reference.height; queueMicrotask(() => this.load()); }
  };
  await f.node("[data-mask-reference-input]").fire("change", { target: { files: [reference], value: "ref.png" } });
}

test("局部消除入口默认GPT框选与真实可编辑提示词，无区域禁止提交", () => {
  const f = removalFixture();
  assert.match(f.root.innerHTML, /data-mask-mode="remove"[^>]*>局部消除/);
  assert.equal(f.node("[data-mask-model]").value, "gptImage25Sunburst");
  assert.equal(f.tools.find(button => button.dataset.maskTool === "box").attributes.get("aria-pressed"), "true");
  const instruction = f.node("[data-mask-prompt]").value;
  assert.equal(instruction, "去除框选区域的物品，其余保持不变，最后去掉蓝色框。");
  assert.match(instruction, /其余.*保持不变/);
  assert.match(instruction, /去掉蓝色框/);
  assert.equal(f.node("[data-mask-reference-section]").hidden, true);
  assert.equal(f.node("[data-mask-reference-purpose-section]").hidden, true);
  assertNeedsRegion(f);
  f.paint();
  assert.equal(f.controller.isAvailable(), true);
  const request = f.controller.jobRequest({ image, jobId: "generation-removal" });
  assert.equal(request.featureMode, "imageMaskFill");
  assert.equal(request.items[0].input.maskFillModel, "gptImage25Sunburst");
  assert.equal(request.items[0].input.maskFillMode, "prompt");
  assert.equal(request.items[0].input.maskFillOperation, "remove");
  assert.equal(request.items[0].input.prompt, instruction);
  assert.deepEqual(request.items[0].input.editRegion, { x: 0.5, y: 0.5, width: 0.5, height: 0.5 });
  assert.equal(Object.hasOwn(request.sharedInput, "maskImage"), false);
  assert.equal(Object.hasOwn(request.sharedInput, "fillReferenceImage"), false);
  assert.equal(Object.hasOwn(request.items[0].input, "fillReferencePurpose"), false);
});

test("提示词/参考图/局部消除三份手写指令独立往返，键盘三项循环可达", async context => {
  const f = fixture({ prefillInstruction: false });
  f.controller.configure({ removalPromptVersion: MASK_FILL_REMOVAL_PROMPT_VERSION, available: true, models: [gptConfig()] });
  const prompt = f.node("[data-mask-prompt]");
  prompt.value = "提示词模式：仅修改吊灯。"; prompt.fire("input");
  f.modes[1].fire("click");
  prompt.value = "参考图模式：只替换床。"; prompt.fire("input");
  await uploadReference(f, context);
  f.modes[2].fire("click");
  prompt.value = "消除模式：移除左侧花瓶并补全墙面。"; prompt.fire("input");
  f.paint();
  assert.equal(f.controller.jobRequest({ image }).items[0].input.prompt, prompt.value);
  assert.equal(Object.hasOwn(f.controller.jobRequest({ image }).sharedInput, "fillReferenceImage"), false,
    "参考模式已有附件不能渗入消除请求");
  f.modes[2].fire("keydown", { key: "Home" });
  assert.equal(prompt.value, "提示词模式：仅修改吊灯。");
  assert.equal(f.modes[0].attributes.get("aria-checked"), "true");
  assert.equal(f.modes[0].tabIndex, 0);
  f.modes[0].fire("keydown", { key: "ArrowRight" });
  assert.equal(prompt.value, "参考图模式：只替换床。");
  f.modes[1].fire("keydown", { key: "ArrowRight" });
  assert.equal(prompt.value, "消除模式：移除左侧花瓶并补全墙面。");
  assert.equal(f.modes[2].attributes.get("aria-checked"), "true");
  assert.equal(f.modes[2].tabIndex, 0);
  f.modes[2].fire("keydown", { key: "ArrowRight" });
  assert.equal(prompt.value, "提示词模式：仅修改吊灯。");
  f.modes[0].fire("keydown", { key: "End" });
  assert.equal(prompt.value, "消除模式：移除左侧花瓶并补全墙面。");
});

test("消除默认词随画笔/Flux改为涂抹语义且仍需区域，用户手写不被工具和模型切换覆盖", () => {
  const f = removalFixture();
  const prompt = f.node("[data-mask-prompt]"), model = f.node("[data-mask-model]");
  f.tools[0].fire("click");
  assert.match(prompt.value, /涂抹|遮罩/);
  assert.doesNotMatch(prompt.value, /蓝色框|框选区域/);
  assertNeedsRegion(f);
  f.paint();
  const painted = f.controller.jobRequest({ image });
  assert.ok(painted.sharedInput.maskImage);
  assert.equal(Object.hasOwn(painted.items[0].input, "editRegion"), false);
  f.tools[2].fire("click");
  assert.match(prompt.value, /框选区域/);
  model.value = "flux2Klein"; model.fire("change");
  assert.match(prompt.value, /涂抹|遮罩/);
  assert.doesNotMatch(prompt.value, /蓝色框|框选区域/);
  assert.equal(f.controller.jobRequest({ image }).items[0].input.maskFillMode, "prompt");
  f.node("[data-mask-clear]").fire("click");
  assertNeedsRegion(f);
  const custom = "只消除窗台上的红色花瓶，其余不变。";
  prompt.value = custom; prompt.fire("input");
  model.value = "gptImage25Sunburst"; model.fire("change");
  f.tools[2].fire("click"); f.paint();
  f.tools[3].fire("click");
  assert.equal(prompt.value, custom);
  model.value = "flux2Klein"; model.fire("change");
  assert.equal(prompt.value, custom);
  f.modes[0].fire("click"); f.modes[2].fire("click");
  assert.equal(prompt.value, custom);
});

test("局部消除保留原模型权限错误与旧框选目录门禁，换原图清除旧选区", () => {
  const f = removalFixture(); f.paint();
  f.controller.configure({ removalPromptVersion: MASK_FILL_REMOVAL_PROMPT_VERSION, available: true, models: [gptConfig({
    modes: [{ key: "prompt", available: false, reason: "当前模型权限已失效" }] })] });
  assert.equal(f.node("[data-mask-model]").value, "gptImage25Sunburst");
  assert.equal(f.controller.availabilityReason(), "当前模型权限已失效");
  assert.throws(() => f.controller.jobRequest({ image }), /权限已失效/);
  const oldGpt = gptConfig(); delete oldGpt.supportsBoxSelection;
  f.controller.configure({ removalPromptVersion: MASK_FILL_REMOVAL_PROMPT_VERSION, available: true, models: [oldGpt] });
  assert.match(f.controller.availabilityReason(), /框选配置未更新/);
  assert.throws(() => f.controller.jobRequest({ image }), /框选配置未更新/);
  f.controller.configure({ removalPromptVersion: MASK_FILL_REMOVAL_PROMPT_VERSION, available: true, models: [gptConfig()] });
  assert.equal(f.controller.isAvailable(), true, "目录恢复保留原框选");
  const replacement = { ...image, id: "replacement-removal", width: 1024, height: 2048 };
  f.source(replacement);
  assert.equal(f.canvas.width, 1024); assert.equal(f.canvas.height, 2048);
  assertNeedsRegion(f);
});

test("旧后台未声明独立消除Prompt版本时阻断，回普通填充保留原合同", () => {
  const f = removalFixture(); f.paint();
  for (const removalPromptVersion of [undefined, "2026-10-28.removal.0"]) {
    f.controller.configure({ available: true, models: [gptConfig()], removalPromptVersion });
    assert.equal(f.controller.isAvailable(), false);
    assert.match(f.controller.availabilityReason(), /消除.*重启|重启.*消除/);
    assert.throws(() => f.controller.jobRequest({ image }), /消除.*重启|重启.*消除/);
  }
  f.modes[0].fire("click");
  f.node("[data-mask-prompt]").value = "替换灯具。";
  const request = f.controller.jobRequest({ image });
  assert.equal(Object.hasOwn(request.items[0].input, "maskFillOperation"), false);
  assert.equal(request.items[0].input.maskFillMode, "prompt");
});

const png = (width = 96, height = 64, background = "#204060") => sharp({ create: { width, height, channels: 3, background } }).png().toBuffer();
const descriptor = (bytes, width = 96, height = 64) => ({ dataUrl: `data:image/png;base64,${bytes.toString("base64")}`,
  name: "synthetic.png", type: "image/png", size: bytes.length, width, height });
const catalog = async () => [{ id: MODEL_CONFIGS.gptImage25Sunburst.id }];
function removalClient() {
  const requests = [];
  const edit = async request => {
    requests.push(request);
    const [width, height] = request.size.split("x").map(Number);
    return { images: [{ url: descriptor(await png(width, height, "#ed4422"), width, height).dataUrl }],
      outputFormat: "png", transport: request.mask ? "images-edits-fixture" : "responses-background", requestId: "removal-fixture" };
  };
  return { requests, editImage: edit, editImageAsync: edit };
}

test("局部消除UI至实际送模及归档仅有精简用户词，普通填充和参考模式仍独立拼原模板", async () => {
  const source = { ...descriptor(await png()), id: "real-removal-source" };
  const f = removalFixture(); f.source(source); f.paint();
  const custom = "去除框选区域的花瓶，其余保持不变，最后去掉蓝色框。";
  for (const instruction of [f.node("[data-mask-prompt]").value, `  ${custom}  `]) {
    f.node("[data-mask-prompt]").value = instruction;
    const job = f.controller.jobRequest({ image: source });
    const input = { ...job.sharedInput, ...job.items[0].input };
    const client = removalClient(); let archive;
    const result = await executeImageMaskFill(input, { imageClient: client, getOneApiModels: catalog, verifySyncContract: async () => {},
      scheduleSync(value) { archive = value; return { status: "pending" }; } });
    assert.equal(client.requests.length, 1);
    assert.equal(client.requests[0].prompt, instruction.trim());
    assert.doesNotMatch(client.requests[0].prompt, /Image 1|User instruction:|Return one complete image|Fill|Replace/);
    assert.equal(client.requests[0].images.length, 1);
    assert.equal(Object.hasOwn(client.requests[0], "maskFillOperation"), false, "业务操作通过实际Prompt表达，不传上游私有字段");
    assert.equal(archive.sourcePrompt, instruction.trim());
    assert.equal(archive.finalPrompt, instruction.trim());
    assert.equal(result.upstream.metadata.prompt, instruction.trim());
    for (const record of [result.request, result.upstream.metadata, archive.preview, archive.workflow]) {
      assert.equal(record.maskFillOperation, "remove");
    }
    assert.equal(archive.boxedSourceImage.imageUrl, client.requests[0].images[0].image_url);
    assert.equal(archive.fillReferenceImage, null);
    assert.equal(archive.referenceImages[0].imageUrl, source.dataUrl);
  }
  const defaultInstruction = "去除框选区域的物品，其余保持不变，最后去掉蓝色框。";
  for (const mode of ["prompt", "reference"]) {
    const complete = sunburstMaskPrompt({ prompt: defaultInstruction, mode, editRegion: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 } });
    assert.match(complete, /Image 1 is the image to edit/);
    assert.match(complete, /User instruction:/);
    assert.match(complete, /Return one complete image/);
    if (mode === "reference") assert.match(complete, /Replace.*image 2/);
    assert.notEqual(complete, defaultInstruction);
  }
});

test("涂抹消除实际送模不拼填充模板，目录声明独立版本", async () => {
  const source = descriptor(await png()), maskImage = descriptor(await png(96, 64, "#fff"));
  const instruction = "去除涂抹区域的物品，其余保持不变。";
  const request = buildMaskFillJobRequest({ image: source, maskImage, maskFillModel: "gptImage25Sunburst", mode: "prompt",
    maskFillOperation: "remove", prompt: instruction });
  const client = removalClient(); let archive;
  const result = await executeImageMaskFill({ ...request.sharedInput, ...request.items[0].input }, {
    imageClient: client, getOneApiModels: catalog, verifySyncContract: async () => {},
    scheduleSync(value) { archive = value; return { status: "pending" }; } });
  assert.equal(client.requests[0].prompt, instruction);
  assert.ok(client.requests[0].mask);
  assert.equal(archive.finalPrompt, instruction);
  assert.equal(archive.workflow.maskFillOperation, "remove");
  assert.equal(result.request.maskFillOperation, "remove");
  const config = await readImageMaskFillConfig(null, { getOneApiModels: catalog });
  assert.equal(config.removalPromptVersion, MASK_FILL_REMOVAL_PROMPT_VERSION);
});

test("非法消除操作、参考模式或无区域在前后端拒绝，不能降级为普通填充或付费调用", async () => {
  const source = descriptor(await png());
  const base = { maskFillModel: "gptImage25Sunburst", maskFillMode: "prompt", maskFillOperation: "remove",
    prompt: "去除选区物品，其余不变。", referenceImages: [source], editRegion: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 } };
  assert.equal(normalizeMaskFillOperation(undefined, "prompt"), undefined);
  assert.equal(normalizeMaskFillOperation("remove", "prompt"), "remove");
  const client = removalClient();
  const reject = async input => {
    await assert.rejects(validateMaskFillInput(input), { statusCode: 400 });
    await assert.rejects(executeImageMaskFill(input, { imageClient: client, getOneApiModels: catalog }), { statusCode: 400 });
  };
  for (const maskFillOperation of [null, "", "Remove", "fill", false, 1, {}, []]) {
    assert.throws(() => normalizeMaskFillOperation(maskFillOperation, "prompt"), /操作|消除/);
    assert.throws(() => buildMaskFillJobRequest({ image: source, maskFillModel: "gptImage25Sunburst", mode: "prompt",
      prompt: base.prompt, editRegion: base.editRegion, maskFillOperation }), /操作|消除/);
    await reject({ ...base, maskFillOperation });
  }
  assert.throws(() => normalizeMaskFillOperation("remove", "reference"), /操作|消除|提示词/);
  await reject({ ...base, maskFillMode: "reference", fillReferenceImage: source });
  await reject({ ...base, editRegion: undefined });
  assert.throws(() => buildMaskFillJobRequest({ image: source, maskFillModel: "gptImage25Sunburst", mode: "prompt",
    prompt: base.prompt, maskFillOperation: "remove" }), /区域|框选|涂抹/);
  assert.equal(client.requests.length, 0);
});

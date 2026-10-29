/**
 * [INPUT]: 依赖Node测试、遮罩坐标/请求纯规则、画布与模式控制器、共享任务恢复/START及独立UI夹具
 * [OUTPUT]: GPT参考换物品/换材质默认/非法用途与键盘切换、三定位空指令且真实上传可提交/其它模式仍必填、用途往返与手写保留、非GPT工具禁用提示、三历史/多边形冻结与准入/轨迹简化、旧服务门禁及原功能回归
 * [POS]: test 的二次编辑前端合同验证，不调用GPU或写入飞书
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildMaskFillJobRequest, maskCanvasPoint, maskFillImageIssue, maskLassoRegion, normalizeMaskFillEditRegion, MASK_FILL_IMAGE_POLICY } from "../public/image-mask-fill-geometry.js";
import { createGenerationTask, generationTaskView, readGenerationTasks, saveGenerationTask } from "../public/generation-task-state.js";
import { generationActionState } from "../public/generation-actions.js";
import { MODEL_CONFIGS } from "../src/model-config.mjs";

import { fixture, image, reference, mask } from "./image-mask-fill-ui-fixture.mjs";

test("缩放和偏移后的触屏/鼠标坐标准确落到原图，边界拖动不越界", () => {
  const bounds = { left: 132, top: 80, width: 512, height: 256 };
  assert.deepEqual(maskCanvasPoint({ clientX: 388, clientY: 208 }, bounds, 2048, 1024), { x: 1024, y: 512 });
  assert.deepEqual(maskCanvasPoint({ clientX: 132, clientY: 80 }, bounds, 2048, 1024), { x: 0, y: 0 });
  assert.deepEqual(maskCanvasPoint({ clientX: 800, clientY: -50 }, bounds, 2048, 1024), { x: 2048, y: 0 });
  assert.equal(maskCanvasPoint({ clientX: 0, clientY: 0 }, { ...bounds, width: 0 }, 2048, 1024), null);
});

test("两模式请求只共享传输一次原图和遮罩，参考图仅在参考图模式发送", () => {
  for (const [mode, key, expand] of [["prompt", "flux2MaskPrompt", 10], ["reference", "flux2MaskReference", 80]]) {
    const result = buildMaskFillJobRequest({ image, maskImage: mask, fillReferenceImage: reference, mode, prompt: " Replace the selected object. ", jobId: "generation-fill" });
    assert.equal(result.featureMode, "imageMaskFill");
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].key, key);
    assert.deepEqual(result.items[0].input, { maskFillMode: mode, prompt: "Replace the selected object.", inferenceTier: "2k", maskExpand: expand });
    assert.equal(result.sharedInput.referenceImages.length, 1);
    assert.equal(result.sharedInput.referenceImages[0].dataUrl, image.dataUrl);
    assert.deepEqual(result.sharedInput.maskImage, mask);
    assert.equal(result.sharedInput.fillReferenceImage?.dataUrl, mode === "reference" ? reference.dataUrl : undefined);
    assert.equal(JSON.stringify(result.items).includes("data:image"), false);
    assert.equal(result.sharedInput.referenceImages[0].width, undefined);
  }
});

test("非法输入在提交前拒绝，6MB/4096px边界与遮罩/参考图必填一致", () => {
  assert.equal(maskFillImageIssue({ ...image, width: 4096, height: 4096, size: MASK_FILL_IMAGE_POLICY.maxBytesPerImage }), "");
  assert.match(maskFillImageIssue({ ...image, width: 4097 }), /4096/);
  assert.match(maskFillImageIssue({ ...image, size: MASK_FILL_IMAGE_POLICY.maxBytesPerImage + 1 }), /6MB/);
  const base = { image, maskImage: mask, mode: "prompt", prompt: "remove the object" };
  assert.throws(() => buildMaskFillJobRequest({ ...base, maskImage: null }), /涂抹/);
  assert.throws(() => buildMaskFillJobRequest({ ...base, mode: "reference" }), /编辑参考图/);
  assert.throws(() => buildMaskFillJobRequest({ ...base, prompt: "  " }), /编辑指令/);
  assert.throws(() => buildMaskFillJobRequest({ ...base, inferenceTier: "1k" }), /推理档位/);
  assert.throws(() => buildMaskFillJobRequest({ ...base, maskExpand: 257 }), /0–256/);
  assert.throws(() => buildMaskFillJobRequest({ ...base, maskExpand: 1.5 }), /整数/);
});

test("仅Sunburst两模式可省略遮罩和扩展，仍保留原图/指令/参考图准入", () => {
  const base = { image, maskFillModel: "gptImage25Sunburst", prompt: "Remove the hanging lamp.", maskExpand: "invalid" };
  for (const mode of ["prompt", "reference"]) {
    const request = buildMaskFillJobRequest({ ...base, mode, fillReferenceImage: reference });
    assert.equal(Object.hasOwn(request.sharedInput, "maskImage"), false);
    assert.equal(Object.hasOwn(request.items[0].input, "maskExpand"), false);
    assert.equal(request.items[0].input.prompt, base.prompt);
    assert.equal(request.sharedInput.referenceImages[0].dataUrl, image.dataUrl);
    assert.equal(request.sharedInput.fillReferenceImage?.dataUrl, mode === "reference" ? reference.dataUrl : undefined);
  }
  for (const maskFillModel of ["flux2Klein", "qwenImageEdit2511"]) {
    assert.throws(() => buildMaskFillJobRequest({ ...base, maskFillModel }), /涂抹/);
  }
  assert.throws(() => buildMaskFillJobRequest({ ...base, image: null }), /原图/);
  assert.throws(() => buildMaskFillJobRequest({ ...base, prompt: "  " }), /编辑指令/);
  assert.throws(() => buildMaskFillJobRequest({ ...base, mode: "reference" }), /编辑参考图/);
});

test("只有GPT参考模式三定位允许指令省略/空/空白，仍拒绝坏类型/超长与缺参考", () => {
  const base = { image, fillReferenceImage: reference, mode: "reference", maskFillModel: "gptImage25Sunburst" };
  for (const location of [{}, { maskImage: mask }, { editRegion: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 } }]) {
    for (const prompt of [undefined, "", " \n\t "]) {
      const request = buildMaskFillJobRequest({ ...base, ...location, ...(prompt !== undefined ? { prompt } : {}) });
      assert.equal(request.items[0].input.prompt, "");
      assert.equal(request.items[0].input.fillReferencePurpose, "object");
      assert.equal(request.sharedInput.fillReferenceImage.dataUrl, reference.dataUrl);
    }
  }
  for (const prompt of [null, 1, false, {}, [], "x".repeat(8001)]) assert.throws(() => buildMaskFillJobRequest({ ...base, prompt }), /指令|文本|8000/);
  assert.throws(() => buildMaskFillJobRequest({ ...base, fillReferenceImage: null }), /编辑参考图/);
  assert.throws(() => buildMaskFillJobRequest({ ...base, mode: "prompt", fillReferenceImage: null }), /编辑指令/);
  for (const maskFillModel of ["flux2Klein", "qwenImageEdit2511"]) {
    assert.throws(() => buildMaskFillJobRequest({ ...base, maskFillModel, maskImage: mask }), /编辑指令/);
  }
});

test("参考用途仅GPT参考模式接受，默认换物品且空指令有效；非法或跨模式用途提交前拒绝", () => {
  const base = { image, fillReferenceImage: reference, mode: "reference", maskFillModel: "gptImage25Sunburst" };
  for (const fillReferencePurpose of [undefined, "object", "material"]) {
    const request = buildMaskFillJobRequest({ ...base, ...(fillReferencePurpose !== undefined ? { fillReferencePurpose } : {}) });
    assert.equal(request.items[0].input.fillReferencePurpose, fillReferencePurpose || "object");
    assert.equal(request.items[0].input.prompt, "");
    assert.equal(Object.hasOwn(request.sharedInput, "fillReferencePurpose"), false);
  }
  for (const fillReferencePurpose of [null, "", "Object", "texture", " material ", false, 1, {}, []]) {
    assert.throws(() => buildMaskFillJobRequest({ ...base, fillReferencePurpose }), /参考用途/);
  }
  for (const maskFillModel of ["gptImage25Sunburst", "flux2Klein", "qwenImageEdit2511"]) for (const mode of ["prompt", "reference"]) {
    if (maskFillModel === "gptImage25Sunburst" && mode === "reference") continue;
    const request = { ...base, maskFillModel, mode, maskImage: mask, prompt: "修改目标" };
    assert.equal(Object.hasOwn(buildMaskFillJobRequest(request).items[0].input, "fillReferencePurpose"), false);
    for (const fillReferencePurpose of ["object", "material", null]) assert.throws(() => buildMaskFillJobRequest({ ...request, fillReferencePurpose }), /参考用途/);
  }
});

test("GPT两模式框选以归一化区域提交，主图和参考图仍各传一次且不混入mask", () => {
  const editRegion = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
  for (const mode of ["prompt", "reference"]) {
    const request = buildMaskFillJobRequest({ image, fillReferenceImage: reference, mode, maskFillModel: "gptImage25Sunburst",
      prompt: "Replace the selected object.", editRegion, maskExpand: 80 });
    assert.deepEqual(request.items[0].input.editRegion, editRegion);
    assert.equal(Object.hasOwn(request.sharedInput, "maskImage"), false);
    assert.equal(Object.hasOwn(request.items[0].input, "maskExpand"), false);
    assert.equal(request.sharedInput.referenceImages[0].dataUrl, image.dataUrl);
    assert.equal(request.sharedInput.fillReferenceImage?.dataUrl, mode === "reference" ? reference.dataUrl : undefined);
    assert.equal(JSON.stringify(request.items).includes("data:image"), false);
    editRegion.x = 0.125;
    assert.equal(request.items[0].input.editRegion.x, 0.25, "入队区域不受后续画框状态修改影响");
    editRegion.x = 0.25;
  }
  const base = { image, prompt: "Remove the selected object.", maskFillModel: "gptImage25Sunburst", editRegion };
  assert.throws(() => buildMaskFillJobRequest({ ...base, maskImage: mask }), /框选|区域|遮罩/);
  for (const maskFillModel of ["flux2Klein", "qwenImageEdit2511"]) {
    assert.throws(() => buildMaskFillJobRequest({ ...base, maskFillModel, maskImage: mask }), /框选|GPT|Sunburst/);
  }
  for (const invalid of [{ x: -0.1, y: 0, width: 0.5, height: 0.5 }, { x: 0, y: 0, width: 0, height: 0.5 },
    { x: 0.75, y: 0, width: 0.5, height: 0.5 }, { x: 0, y: 0.75, width: 0.5, height: 0.5 },
    { x: "0", y: 0, width: 0.5, height: 0.5 }, { x: 0, y: 0, width: NaN, height: 0.5 }]) {
    assert.throws(() => buildMaskFillJobRequest({ ...base, editRegion: invalid }), /框选|区域/);
  }
});

test("自由圈选自然像素归一化并冻结点对象，非法点/越界/数量/退化在提交前拒绝", () => {
  const points = [{ x: 512, y: 256 }, { x: 1536, y: 256 }, { x: 1024, y: 768 }];
  const expected = { type: "polygon", points: [{ x: 0.25, y: 0.25 }, { x: 0.75, y: 0.25 }, { x: 0.5, y: 0.75 }] };
  const region = maskLassoRegion(points, 2048, 1024);
  assert.deepEqual(region, expected);
  points[0].x = 1024;
  assert.deepEqual(region, expected);
  const base = { image, maskFillModel: "gptImage25Sunburst", prompt: "Remove the selected object.", editRegion: region };
  const request = buildMaskFillJobRequest(base);
  region.points[0].x = 0.5;
  assert.deepEqual(request.items[0].input.editRegion, expected, "入队后修改点对象不改变已冻结请求");
  const closed = normalizeMaskFillEditRegion({ type: "polygon", points: [...expected.points, expected.points[0]] });
  assert.deepEqual(closed, expected, "尾部重复起点不成为额外顶点");
  assert.equal(maskLassoRegion([{ x: 1, y: 1 }, { x: 2, y: 2 }], 2048, 1024), null);
  const invalid = [[], [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }],
    [{ x: 0, y: 0 }, { x: 0.5, y: 0.5 }, { x: 1, y: 1 }],
    [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }],
    [null, ...expected.points], [{ x: -0.01, y: 0.25 }, ...expected.points],
    [{ x: 0.25, y: 1.01 }, ...expected.points], [{ x: NaN, y: 0.25 }, ...expected.points],
    [{ x: "0.25", y: 0.25 }, ...expected.points], Array.from({ length: 2049 }, (_, i) => expected.points[i % 3])];
  for (const points of invalid) assert.throws(() => buildMaskFillJobRequest({ ...base, editRegion: { type: "polygon", points } }), /圈选|区域|多边形|顶点/);
  assert.throws(() => buildMaskFillJobRequest({ ...base, editRegion: expected, maskImage: mask }), /区域|遮罩/);
  for (const maskFillModel of ["flux2Klein", "qwenImageEdit2511"]) {
    assert.throws(() => buildMaskFillJobRequest({ ...base, editRegion: expected, maskFillModel, maskImage: mask }), /圈选|框选|GPT|Sunburst/);
  }
});


test("两模式推荐仅为输入占位，空指令阻断且手写内容往返保留", () => {
  const f = fixture({ prefillInstruction: false });
  const prompt = f.node("[data-mask-prompt]");
  assert.equal(prompt.value, "");
  assert.match(prompt.placeholder, /推荐写法：.*图1/);
  f.paint();
  assert.equal(f.controller.availabilityReason(), "请填写明确的编辑指令");
  assert.throws(() => f.controller.jobRequest({ image }), /请填写明确的编辑指令/);
  prompt.value = "移除窗边的吊灯，补全窗户。";
  assert.equal(f.controller.jobRequest({ image }).items[0].input.prompt, prompt.value);
  f.modes[1].fire("click");
  assert.equal(prompt.value, "");
  assert.match(prompt.placeholder, /推荐写法：.*图1.*图2.*透视/);
  prompt.value = "将图1的床替换为图2的床，保持其他家具。";
  f.modes[0].fire("click");
  assert.equal(prompt.value, "移除窗边的吊灯，补全窗户。");
  f.modes[1].fire("click");
  assert.equal(prompt.value, "将图1的床替换为图2的床，保持其他家具。");
});

test("GPT参考用途支持键盘且切换定位/模型/模式保留用途与手写原文，Flux/Qwen沿原例", () => {
  const f = fixture({ prefillInstruction: false });
  const prompt = f.node("[data-mask-prompt]"), model = f.node("[data-mask-model]");
  f.modes[1].fire("click");
  assert.match(prompt.placeholder, /将图1中的床替换成图2的床/);
  const instruction = "只将沙发布料换成图2的织物纹理和米白色，沙发造型与尺寸不变。";
  prompt.value = instruction;
  model.value = "gptImage25Sunburst"; model.fire("change");
  f.controller.configure({ models: [{ key: model.value, supportsBoxSelection: true, supportsLassoSelection: true,
    modes: [{ key: "prompt", available: true }, { key: "reference", available: true }], sizes: MODEL_CONFIGS.gptImage25Sunburst.sizes,
    outputResolutions: ["1K", "2K", "4K"], qualityOptions: MODEL_CONFIGS.gptImage25Sunburst.qualityOptions, defaultQuality: "medium" }] });
  assert.equal(prompt.placeholder, "可选：补充替换要求；留空按参考图替换目标物品。");
  assert.equal(f.node("[data-mask-reference-purpose-section]").hidden, false);
  assert.match(f.root.innerHTML, /data-mask-reference-purpose="object" role="radio" aria-checked="true" tabindex="0"/);
  f.purposes[0].fire("keydown", { key: "ArrowRight" });
  assert.equal(f.purposes[1].attributes.get("aria-checked"), "true");
  assert.equal(f.purposes[1].tabIndex, 0);
  assert.equal(prompt.placeholder, "可选：补充材质要求；留空按参考图更换目标表面的材质，保留原有造型。");
  assert.doesNotMatch(prompt.placeholder, /蓝色圈选/);
  assert.equal(prompt.value, instruction);
  for (const tool of [f.tools[2], f.tools[3]]) {
    tool.fire("click");
    assert.equal(prompt.placeholder, "可选：补充材质要求；留空按参考图更换目标表面的材质，保留原有造型。");
    assert.equal(prompt.value, instruction, "推荐变化不能覆盖手写表面编辑要求");
  }
  f.tools[0].fire("click");
  assert.doesNotMatch(prompt.placeholder, /蓝色圈选/);
  for (const key of ["qwenImageEdit2511", "flux2Klein"]) {
    model.value = key; model.fire("change");
    assert.match(prompt.placeholder, /将图1中的床替换成图2的床/);
    assert.equal(f.node("[data-mask-reference-purpose-section]").hidden, true);
    assert.equal(prompt.value, instruction);
  }
  f.modes[0].fire("click");
  assert.equal(prompt.value, "");
  f.modes[1].fire("click");
  assert.equal(prompt.value, instruction);
  model.value = "gptImage25Sunburst"; model.fire("change");
  assert.equal(f.purposes[1].attributes.get("aria-checked"), "true", "切换模式和模型后保留换材质");
  for (const [key, index] of [["Home", 0], ["End", 1], ["ArrowUp", 0], ["ArrowDown", 1], ["ArrowLeft", 0]]) {
    f.purposes[1 - index].fire("keydown", { key });
    assert.equal(f.purposes[index].attributes.get("aria-checked"), "true");
    assert.equal(prompt.value, instruction);
  }
  f.purposes[1].fire("click");
  assert.equal(f.purposes[1].attributes.get("aria-checked"), "true");
});

test("真实参考图上传后GPT空指令在画笔/框选/无区域均可提交，切回提示词或Qwen仍阻断", async context => {
  const originals = Object.fromEntries(["document", "FileReader", "Image"].map(key => [key, globalThis[key]]));
  context.after(() => { for (const [key, value] of Object.entries(originals)) {
    if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
  } });
  const f = fixture({ prefillInstruction: false }); let created = 0;
  globalThis.document = { createElement: () => f.node(`__uploaded-reference-${created++}`) };
  globalThis.FileReader = class {
    addEventListener(name, callback) { this[name] = callback; }
    readAsDataURL(file) { this.result = file.dataUrl; queueMicrotask(() => this.load()); }
  };
  globalThis.Image = class {
    addEventListener(name, callback) { this[name] = callback; }
    set src(value) { this.naturalWidth = reference.width; this.naturalHeight = reference.height; queueMicrotask(() => this.load()); }
  };
  const model = f.node("[data-mask-model]"); model.value = "gptImage25Sunburst"; model.fire("change");
  f.controller.configure({ models: [{ key: model.value, supportsBoxSelection: true, supportsLassoSelection: true,
    modes: [{ key: "prompt", available: true }, { key: "reference", available: true }], sizes: MODEL_CONFIGS.gptImage25Sunburst.sizes,
    outputResolutions: ["1K", "2K", "4K"], qualityOptions: MODEL_CONFIGS.gptImage25Sunburst.qualityOptions, defaultQuality: "medium" }] });
  f.modes[1].fire("click");
  assert.match(f.controller.availabilityReason(), /编辑参考图/);
  await f.node("[data-mask-reference-input]").fire("change", { target: { files: [reference], value: "ref.png" } });
  assert.equal(f.controller.isAvailable(), true);
  for (const tool of ["none", "brush", "box"]) {
    if (tool === "brush") f.paint();
    if (tool === "box") { f.tools[2].fire("click"); f.paint(); }
    for (const purpose of f.purposes) for (const prompt of ["", " \n "]) {
      purpose.fire("click");
      f.node("[data-mask-prompt]").value = prompt;
      assert.equal(f.controller.isAvailable(), true);
      const request = f.controller.jobRequest({ image });
      assert.equal(request.items[0].input.prompt, "");
      assert.equal(request.items[0].input.fillReferencePurpose, purpose.dataset.maskReferencePurpose);
      assert.equal(request.sharedInput.fillReferenceImage.dataUrl, reference.dataUrl);
    }
  }
  f.modes[0].fire("click");
  assert.match(f.controller.availabilityReason(), /编辑指令/);
  f.modes[1].fire("click");
  model.value = "qwenImageEdit2511"; model.fire("change");
  f.controller.configure({ models: [{ key: "qwenImageEdit2511", modes: [{ key: "reference", available: true }] }] });
  assert.match(f.controller.availabilityReason(), /编辑指令/);
});

test("触屏画笔用缩放后原图坐标和笔宽，导出同尺寸黑底白mask；撤销/擦除/换图不会残留", () => {
  const f = fixture();
  assert.match(f.controller.availabilityReason(), /涂抹/);
  f.paint();
  assert.equal(f.controller.isAvailable(), true);
  assert.deepEqual(f.draws[0], ["arc", 1024, 512, 64]);
  assert.deepEqual(f.draws[2], ["line", 2048, 1024]);
  const result = f.controller.jobRequest({ image, jobId: "generation-ui" });
  assert.equal(result.sharedInput.maskImage.type, "image/png");
  assert.equal(f.exports[0].width, 2048); assert.equal(f.exports[0].height, 1024);
  assert.deepEqual(f.exports.slice(1), [["fill", "#000"], ["background", 0, 0, 2048, 1024], ["mask", 2048, 1024]]);
  f.node("[data-mask-undo]").fire("click");
  assert.match(f.controller.availabilityReason(), /涂抹/);
  f.paint("mouse"); f.tools[1].fire("click"); f.paint();
  assert.match(f.controller.availabilityReason(), /涂抹/);
  f.node("[data-mask-undo]").fire("click");
  assert.equal(f.controller.isAvailable(), true);
  f.source({ ...image, id: "replacement", width: 1024, height: 2048 });
  assert.equal(f.canvas.width, 1024); assert.equal(f.canvas.height, 2048);
  assert.match(f.controller.availabilityReason(), /涂抹/);
});

test("推理档位只有2K/4K/原图三档，选择穿透请求且输出摘要按原比例最高2K", () => {
  const f = fixture();
  assert.match(f.root.innerHTML, /推理档位/);
  const tiers = f.root.innerHTML.match(/<select data-mask-inference[^>]*>(.*?)<\/select>/s)[1];
  assert.deepEqual([...tiers.matchAll(/<option value="([^"]+)">([^<]+)<\/option>/g)].map(match => match.slice(1)), [["2k", "2K"], ["4k", "4K"], ["original", "原图"]]);
  f.paint();
  for (const tier of ["2k", "4k", "original"]) {
    f.node("[data-mask-inference]").value = tier;
    assert.equal(f.controller.jobRequest({ image, jobId: "generation-ui" }).items[0].input.inferenceTier, tier);
  }
  f.source({ ...image, width: 4000, height: 3000 });
  assert.equal(f.exactSize.textContent, "输出 2048 × 1536");
  f.source({ ...image, width: 64, height: 96 });
  assert.equal(f.exactSize.textContent, "输出 64 × 96");
});

test("两模式保留各自编辑指令和10/80扩展默认，参考图条件必填且键盘切换正确", () => {
  const f = fixture();
  assert.equal(f.node("[data-mask-status]").textContent, "");
  assert.equal(f.node("[data-mask-status]").hidden, true);
  assert.doesNotMatch(f.root.innerHTML, /data-mask-(?:size-note|prompt-hint)/);
  f.paint();
  f.node("[data-mask-prompt]").value = "My custom instruction";
  f.node("[data-mask-expand]").value = "16";
  f.modes[1].fire("click");
  assert.equal(f.node("[data-mask-expand]").value, 80);
  assert.equal(f.node("[data-mask-prompt]").value, "");
  assert.equal(f.node("[data-mask-reference-section]").hidden, false);
  assert.equal(f.controller.currentItem().key, "flux2MaskReference");
  assert.match(f.controller.availabilityReason(), /编辑参考图/);
  f.node("[data-mask-expand]").value = "96";
  f.modes[1].fire("keydown", { key: "ArrowLeft" });
  assert.equal(f.node("[data-mask-prompt]").value, "My custom instruction");
  assert.equal(f.node("[data-mask-expand]").value, "16");
  assert.equal(f.controller.isAvailable(), true);
  f.modes[1].fire("click");
  assert.equal(f.node("[data-mask-expand]").value, "96");
});

test("Sunburst切换保留遮罩/指令，默认1K/medium且档位质量穿透；换Key失效不换模", () => {
  const f = fixture(); f.paint();
  const model = f.node("[data-mask-model]");
  model.value = "gptImage25Sunburst"; model.fire("change");
  assert.equal(f.controller.currentItem().provider, "oneapi");
  assert.equal(f.node("[data-mask-tier-field]").hidden, true);
  assert.equal(f.controller.isAvailable(), false);
  const gpt = { key: "gptImage25Sunburst", modes: [{ key: "prompt", available: true }],
    sizes: MODEL_CONFIGS.gptImage25Sunburst.sizes, outputResolutions: ["1K", "2K", "4K"],
    qualityOptions: MODEL_CONFIGS.gptImage25Sunburst.qualityOptions, defaultQuality: "medium" };
  f.controller.configure({ models: [gpt] });
  assert.equal(f.controller.isAvailable(), true);
  assert.equal(f.node("[data-mask-status]").hidden, true);
  const request = f.controller.jobRequest({ image, jobId: "generation-sunburst-ui" });
  assert.equal(request.items[0].input.maskFillModel, "gptImage25Sunburst");
  assert.equal(request.items[0].input.outputResolution, "1K");
  assert.equal(request.items[0].input.quality, "medium");
  assert.equal(f.node("[data-mask-api-settings]").hidden, false);
  f.node("[data-mask-output]").value = "4K"; f.node("[data-mask-output]").fire("change");
  f.node("[data-mask-quality]").value = "high"; f.node("[data-mask-quality]").fire("change");
  assert.equal(f.controller.jobRequest({ image }).items[0].input.outputResolution, "4K");
  assert.equal(f.controller.jobRequest({ image }).items[0].input.quality, "high");
  assert.equal(f.exactSize.textContent, "输出 3840 × 1920");
  f.controller.configure({ models: [{ key: "gptImage25Sunburst", modes: [{ key: "prompt", available: false, reason: "Key权限已失效" }] }] });
  assert.match(f.controller.availabilityReason(), /权限已失效/);
  assert.equal(f.node("[data-mask-status]").textContent, "Key权限已失效");
  assert.equal(f.node("[data-mask-status]").hidden, false);
  assert.equal(model.value, "gptImage25Sunburst");
  f.source({ ...image, width: 4096, height: 512 });
  f.controller.configure({ models: [gpt] });
  assert.match(f.controller.availabilityReason(), /1:3至3:1/);
});

test("Sunburst可不涂抹仅用指令提交，画后传mask，清空后恢复无mask；Flux/Qwen仍必画", () => {
  const f = fixture();
  const model = f.node("[data-mask-model]");
  model.value = "gptImage25Sunburst"; model.fire("change");
  const gpt = { key: model.value, modes: [{ key: "prompt", available: true }, { key: "reference", available: true }],
    sizes: MODEL_CONFIGS.gptImage25Sunburst.sizes, outputResolutions: ["1K", "2K", "4K"],
    qualityOptions: MODEL_CONFIGS.gptImage25Sunburst.qualityOptions, defaultQuality: "medium" };
  f.controller.configure({ models: [gpt, { key: "qwenImageEdit2511", modes: [{ key: "prompt", available: true }] }] });
  f.node("[data-mask-prompt]").value = "Remove the hanging lamp.";
  assert.equal(f.controller.isAvailable(), true);
  assert.equal(f.node("[data-mask-expand]").disabled, true);
  assert.match(f.node("[data-mask-drawing-status]").textContent, /可不涂抹/);
  assert.match(f.controller.loadingCopy(), /编辑图片/);
  const unmasked = f.controller.jobRequest({ image });
  assert.equal(Object.hasOwn(unmasked.sharedInput, "maskImage"), false);
  assert.equal(Object.hasOwn(unmasked.items[0].input, "maskExpand"), false);
  assert.equal(f.exports.length, 0);
  f.paint();
  assert.equal(f.node("[data-mask-expand]").disabled, false);
  assert.match(f.controller.loadingCopy(), /遮罩区域/);
  assert.equal(f.controller.jobRequest({ image }).sharedInput.maskImage.dataUrl, mask.dataUrl);
  assert.equal(f.controller.jobRequest({ image }).items[0].input.maskExpand, 10);
  f.node("[data-mask-clear]").fire("click");
  assert.equal(f.node("[data-mask-expand]").disabled, true);
  const previousExports = f.exports.length;
  assert.equal(Object.hasOwn(f.controller.jobRequest({ image }).sharedInput, "maskImage"), false);
  assert.equal(f.exports.length, previousExports);
  f.modes[1].fire("click");
  assert.match(f.controller.availabilityReason(), /编辑参考图/);
  f.modes[0].fire("click");
  for (const key of ["qwenImageEdit2511", "flux2Klein"]) {
    model.value = key; model.fire("change");
    if (key === "flux2Klein") f.controller.configure({ modes: [{ key: "prompt", available: true }] });
    assert.match(f.controller.availabilityReason(), /涂抹/);
    assert.equal(f.node("[data-mask-expand]").disabled, false);
    assert.throws(() => f.controller.jobRequest({ image }), /涂抹/);
  }
});

test("GPT新增框选而保留画笔：按当前工具冻结，框选与笔画各自撤销清空，换图共同清除", () => {
  const f = fixture(); f.paint();
  for (const tool of [f.tools[2], f.tools[3]]) {
    assert.equal(tool.hidden, false, "Flux仍显示GPT专属工具入口");
    assert.equal(tool.disabled, true);
    assert.equal(tool.title, "请先选择 GPT Image 2.5 Sunburst");
    assert.match(tool.attributes.get("aria-label"), /请先选择 GPT Image 2\.5 Sunburst/);
  }
  const model = f.node("[data-mask-model]");
  model.value = "gptImage25Sunburst"; model.fire("change");
  const gpt = { key: model.value, supportsBoxSelection: true, modes: [{ key: "prompt", available: true }],
    sizes: MODEL_CONFIGS.gptImage25Sunburst.sizes, outputResolutions: ["1K", "2K", "4K"],
    qualityOptions: MODEL_CONFIGS.gptImage25Sunburst.qualityOptions, defaultQuality: "medium" };
  f.controller.configure({ models: [gpt, { key: "qwenImageEdit2511", modes: [{ key: "prompt", available: true }] }] });
  assert.equal(f.tools[2].hidden, false);
  assert.equal(f.tools[2].disabled, false);
  assert.doesNotMatch(f.tools[2].title, /请先选择/);
  assert.doesNotMatch(f.tools[2].attributes.get("aria-label"), /请先选择/);
  assert.equal(f.tools[0].attributes.get("aria-pressed"), "true", "新增框选不替换默认画笔");
  assert.equal(f.controller.jobRequest({ image }).sharedInput.maskImage.dataUrl, mask.dataUrl);
  f.tools[2].fire("click");
  const exportsBeforeBox = f.exports.length;
  assert.equal(Object.hasOwn(f.controller.jobRequest({ image }).sharedInput, "maskImage"), false, "空框选不暗中提交保留笔画");
  f.paint();
  const first = f.controller.jobRequest({ image });
  assert.deepEqual(first.items[0].input.editRegion, { x: 0.5, y: 0.5, width: 0.5, height: 0.5 });
  assert.equal(Object.hasOwn(first.sharedInput, "maskImage"), false);
  assert.equal(Object.hasOwn(first.items[0].input, "maskExpand"), false);
  assert.equal(f.exports.length, exportsBeforeBox, "框选不导出遮罩PNG");
  assert.ok(f.draws.some(draw => draw[0] === "box"));
  assert.ok(f.draws.some(draw => draw[0] === "box" && draw.at(-1) === "#3b82f6"), "前端矩形定位线与送模蓝色一致");

  f.canvas.fire("pointerdown", { pointerId: 4, pointerType: "mouse", button: 0, clientX: 356, clientY: 168 });
  f.canvas.fire("pointermove", { pointerId: 4, clientX: 228, clientY: 104 });
  f.canvas.fire("pointerup", { pointerId: 4 });
  assert.deepEqual(f.controller.jobRequest({ image }).items[0].input.editRegion, { x: 0.25, y: 0.25, width: 0.25, height: 0.25 });
  assert.deepEqual(first.items[0].input.editRegion, { x: 0.5, y: 0.5, width: 0.5, height: 0.5 }, "已冻结请求不随重画变化");
  f.node("[data-mask-undo]").fire("click");
  assert.deepEqual(f.controller.jobRequest({ image }).items[0].input.editRegion, first.items[0].input.editRegion);
  f.tools[0].fire("click");
  const brush = f.controller.jobRequest({ image });
  assert.equal(brush.sharedInput.maskImage.dataUrl, mask.dataUrl);
  assert.equal(Object.hasOwn(brush.items[0].input, "editRegion"), false);
  f.tools[2].fire("click");
  assert.deepEqual(f.controller.jobRequest({ image }).items[0].input.editRegion, first.items[0].input.editRegion);
  const legacy = { ...gpt }; delete legacy.supportsBoxSelection;
  f.controller.configure({ models: [legacy] });
  assert.equal(f.controller.isAvailable(), false);
  assert.equal(f.controller.availabilityReason(), "框选配置未更新，请重启当前工作台");
  assert.equal(f.node("[data-mask-status]").hidden, false);
  assert.equal(f.node("[data-mask-status]").textContent, f.controller.availabilityReason());
  assert.throws(() => f.controller.jobRequest({ image }), /框选配置未更新.*重启/);
  assert.equal(f.tools[2].attributes.get("aria-pressed"), "true", "旧服务提示保留当前框选工具");
  f.tools[0].fire("click");
  assert.equal(f.controller.isAvailable(), true, "旧服务的画笔编辑继续可用");
  assert.equal(f.node("[data-mask-status]").hidden, true, "切回画笔时即时清除框选配置提示");
  assert.equal(f.controller.jobRequest({ image }).sharedInput.maskImage.dataUrl, mask.dataUrl);
  f.tools[2].fire("click");
  for (const reason of ["读取模型权限中…", "二次编辑模型读取失败，请检查连接后重试"]) {
    f.controller.configure({ models: [{ ...legacy, modes: [{ key: "prompt", available: false, reason }] }] });
    assert.equal(f.controller.availabilityReason(), reason, "加载和网络错误不能被旧框选配置提示覆盖");
    assert.equal(f.tools[2].attributes.get("aria-pressed"), "true");
  }
  f.controller.configure({ models: [gpt, { key: "qwenImageEdit2511", modes: [{ key: "prompt", available: true }] }] });
  assert.equal(f.controller.isAvailable(), true);
  assert.deepEqual(f.controller.jobRequest({ image }).items[0].input.editRegion, first.items[0].input.editRegion, "能力刷新后保留原框选");
  f.node("[data-mask-clear]").fire("click");
  assert.equal(Object.hasOwn(f.controller.jobRequest({ image }).items[0].input, "editRegion"), false);
  f.tools[0].fire("click");
  assert.equal(f.controller.jobRequest({ image }).sharedInput.maskImage.dataUrl, mask.dataUrl, "清空框选保留已有笔画");

  f.tools[2].fire("click"); f.paint();
  model.value = "qwenImageEdit2511"; model.fire("change");
  for (const tool of [f.tools[2], f.tools[3]]) {
    assert.equal(tool.hidden, false, "切回Qwen工具入口继续可见");
    assert.equal(tool.disabled, true);
    assert.equal(tool.title, "请先选择 GPT Image 2.5 Sunburst");
    assert.match(tool.attributes.get("aria-label"), /请先选择 GPT Image 2\.5 Sunburst/);
  }
  assert.equal(f.tools[0].attributes.get("aria-pressed"), "true");
  assert.equal(f.controller.jobRequest({ image }).sharedInput.maskImage.dataUrl, mask.dataUrl);
  model.value = "gptImage25Sunburst"; model.fire("change");
  f.tools[2].fire("click");
  assert.deepEqual(f.controller.jobRequest({ image }).items[0].input.editRegion, first.items[0].input.editRegion);
  const replacement = { ...image, id: "replacement", width: 1024, height: 2048 };
  f.source(replacement);
  assert.equal(Object.hasOwn(f.controller.jobRequest({ image: replacement }).items[0].input, "editRegion"), false);
  f.tools[0].fire("click");
  assert.equal(Object.hasOwn(f.controller.jobRequest({ image: replacement }).sharedInput, "maskImage"), false);
});

test("自由圈选触屏闭合与取消、三历史独立、旧服务准入及长轨迹简化，换图无区域残留", () => {
  const f = fixture(); f.paint();
  assert.equal(f.tools[3].hidden, false);
  assert.equal(f.tools[3].disabled, true);
  assert.equal(f.tools[3].title, "请先选择 GPT Image 2.5 Sunburst");
  assert.match(f.tools[3].attributes.get("aria-label"), /请先选择 GPT Image 2\.5 Sunburst/);
  const model = f.node("[data-mask-model]"); model.value = "gptImage25Sunburst"; model.fire("change");
  const gpt = { key: model.value, supportsBoxSelection: true, supportsLassoSelection: true,
    modes: [{ key: "prompt", available: true }], sizes: MODEL_CONFIGS.gptImage25Sunburst.sizes,
    outputResolutions: ["1K", "2K", "4K"], qualityOptions: MODEL_CONFIGS.gptImage25Sunburst.qualityOptions, defaultQuality: "medium" };
  f.controller.configure({ models: [gpt] });
  assert.equal(f.tools[3].hidden, false);
  assert.equal(f.tools[3].disabled, false);
  assert.doesNotMatch(f.tools[3].title, /请先选择/);
  assert.doesNotMatch(f.tools[3].attributes.get("aria-label"), /请先选择/);
  f.tools[2].fire("click"); f.paint();
  const box = f.controller.jobRequest({ image }).items[0].input.editRegion;
  f.tools[3].fire("click");
  const original = { type: "polygon", points: [{ x: 0.25, y: 0.25 }, { x: 0.75, y: 0.25 }, { x: 0.5, y: 0.75 }] };
  const start = (pointerId = 8) => f.canvas.fire("pointerdown", { pointerId, pointerType: "touch", button: 0, clientX: 228, clientY: 104 });
  const move = (clientX, clientY, pointerId = 8) => f.canvas.fire("pointermove", { pointerId, clientX, clientY });
  start(); move(484, 104); move(356, 232);
  assert.equal(Object.hasOwn(f.controller.jobRequest({ image }).items[0].input, "editRegion"), false, "未完成轨迹不能被当成已确认圈选发送");
  f.canvas.fire("pointerup", { pointerId: 8 });
  const first = f.controller.jobRequest({ image });
  assert.deepEqual(first.items[0].input.editRegion, original);
  assert.equal(Object.hasOwn(first.sharedInput, "maskImage"), false);
  assert.equal(Object.hasOwn(first.items[0].input, "maskExpand"), false);
  assert.ok(f.draws.some(draw => draw[0] === "close"), "抬手后轮廓自动闭合");
  assert.ok(f.draws.some(draw => draw[0] === "stroke" && draw[1] === "#3b82f6"));
  for (const cancel of ["pointercancel", "lostpointercapture"]) {
    start(9); move(400, 104, 9); move(400, 200, 9);
    f.canvas.fire(cancel, { pointerId: 9 });
    assert.deepEqual(f.controller.jobRequest({ image }).items[0].input.editRegion, original, "取消本次轨迹保留上次已完成圈选");
  }
  start(10); move(356, 104, 10); move(356, 168, 10); f.canvas.fire("pointerup", { pointerId: 10 });
  assert.notDeepEqual(f.controller.jobRequest({ image }).items[0].input.editRegion, original);
  assert.deepEqual(first.items[0].input.editRegion, original, "重画不改变冻结请求的内部点对象");
  f.node("[data-mask-undo]").fire("click");
  assert.deepEqual(f.controller.jobRequest({ image }).items[0].input.editRegion, original);
  f.tools[2].fire("click");
  assert.deepEqual(f.controller.jobRequest({ image }).items[0].input.editRegion, box);
  f.tools[0].fire("click");
  assert.equal(f.controller.jobRequest({ image }).sharedInput.maskImage.dataUrl, mask.dataUrl);
  f.tools[3].fire("click");
  const legacy = { ...gpt }; delete legacy.supportsLassoSelection;
  f.controller.configure({ models: [legacy] });
  assert.equal(f.controller.isAvailable(), false);
  assert.equal(f.controller.availabilityReason(), "圈选配置未更新，请重启当前工作台");
  assert.throws(() => f.controller.jobRequest({ image }), /圈选配置未更新/);
  f.tools[2].fire("click");
  assert.equal(f.controller.isAvailable(), true, "旧服务仍允许已经支持的矩形框选");
  f.tools[3].fire("click");
  f.controller.configure({ models: [{ ...legacy, modes: [{ key: "prompt", available: false, reason: "圈选模型权限失效" }] }] });
  assert.equal(f.controller.availabilityReason(), "圈选模型权限失效");
  f.controller.configure({ models: [gpt] });
  assert.deepEqual(f.controller.jobRequest({ image }).items[0].input.editRegion, original);
  f.node("[data-mask-clear]").fire("click");
  assert.equal(Object.hasOwn(f.controller.jobRequest({ image }).items[0].input, "editRegion"), false);
  f.tools[2].fire("click");
  assert.deepEqual(f.controller.jobRequest({ image }).items[0].input.editRegion, box, "清空自由圈选不清空矩形");
  f.tools[0].fire("click");
  assert.equal(f.controller.jobRequest({ image }).sharedInput.maskImage.dataUrl, mask.dataUrl, "清空自由圈选不清空画笔");

  f.tools[3].fire("click");
  f.canvas.fire("pointerdown", { pointerId: 11, pointerType: "touch", button: 0, clientX: 484, clientY: 168 });
  f.canvas.fire("pointermove", { pointerId: 11, getCoalescedEvents: () => Array.from({ length: 2500 }, (_, i) => ({
    clientX: 356 + Math.cos(i / 2499 * Math.PI * 2) * 128, clientY: 168 + Math.sin(i / 2499 * Math.PI * 2) * 64 })) });
  f.canvas.fire("pointerup", { pointerId: 11 });
  const simplified = f.controller.jobRequest({ image }).items[0].input.editRegion;
  assert.equal(simplified.type, "polygon");
  assert.ok(simplified.points.length >= 3 && simplified.points.length <= 2048, "超长触屏轨迹提交前简化至后端容量");
  const replacement = { ...image, id: "lasso-replacement" };
  f.source(replacement);
  assert.equal(Object.hasOwn(f.controller.jobRequest({ image: replacement }).items[0].input, "editRegion"), false);
  f.tools[2].fire("click");
  assert.equal(Object.hasOwn(f.controller.jobRequest({ image: replacement }).items[0].input, "editRegion"), false);
  f.tools[0].fire("click");
  assert.equal(Object.hasOwn(f.controller.jobRequest({ image: replacement }).sharedInput, "maskImage"), false);
});

test("Qwen选择保留遮罩和指令，只提交1MP档位与Qwen模型；旧目录不能回退Flux能力", () => {
  const f = fixture(); f.paint();
  f.node("[data-mask-prompt]").value = "Replace the lamp with a red pendant.";
  const model = f.node("[data-mask-model]"); model.value = "qwenImageEdit2511"; model.fire("change");
  assert.equal(f.controller.isAvailable(), false);
  assert.equal(f.node("[data-mask-tier-field]").hidden, true);
  f.controller.configure({ models: [{ key: "qwenImageEdit2511", modes: [{ key: "prompt", available: true }] }] });
  assert.equal(f.controller.isAvailable(), true);
  const job = f.controller.jobRequest({ image, jobId: "generation-qwen-ui" });
  assert.equal(job.items[0].provider, "comfyui");
  assert.equal(job.items[0].input.maskFillModel, "qwenImageEdit2511");
  assert.equal(job.items[0].input.inferenceTier, "1mp");
  assert.equal(job.items[0].input.prompt, "Replace the lamp with a red pendant.");
  assert.equal(f.controller.currentItem().key, "qwenImageEdit2511-prompt");
  f.controller.configure({ models: [{ key: "qwenImageEdit2511", modes: [{ key: "prompt", available: false, reason: "Qwen模型下线" }] }] });
  assert.match(f.controller.availabilityReason(), /Qwen模型下线/);
});

test("旧服务仅有Flux目录时GPT/Qwen明确提示重启，补全目录后保留笔画和指令", () => {
  const f = fixture(); f.paint();
  const prompt = f.node("[data-mask-prompt]");
  prompt.value = "Remove the pendant and restore the window behind it.";
  const model = f.node("[data-mask-model]");
  const legacy = { version: "2026-10-21.local.2", available: true, reason: null,
    modes: [{ key: "prompt", available: true }, { key: "reference", available: true }] };
  f.controller.configure(legacy);
  assert.equal(f.controller.isAvailable(), true);
  for (const key of ["gptImage25Sunburst", "qwenImageEdit2511"]) {
    model.value = key; model.fire("change");
    assert.equal(f.controller.isAvailable(), false);
    assert.equal(f.node("[data-mask-availability]").textContent, "不可用");
    assert.equal(f.controller.availabilityReason(), "二次编辑模型配置未更新，请重启当前工作台后刷新页面");
    assert.equal(f.node("[data-mask-status]").textContent, f.controller.availabilityReason());
    assert.throws(() => f.controller.jobRequest({ image }), /重启.*刷新页面/);
    const restored = { key, modes: [{ key: "prompt", available: true }],
      ...(key === "gptImage25Sunburst" ? { sizes: MODEL_CONFIGS[key].sizes,
        outputResolutions: ["1K", "2K", "4K"], qualityOptions: MODEL_CONFIGS[key].qualityOptions, defaultQuality: "medium" } : {}) };
    f.controller.configure({ ...legacy, models: [restored] });
    assert.equal(model.value, key);
    assert.equal(prompt.value, "Remove the pendant and restore the window behind it.");
    assert.equal(f.controller.isAvailable(), true);
    const request = f.controller.jobRequest({ image });
    assert.equal(request.sharedInput.maskImage.dataUrl, mask.dataUrl);
    assert.equal(request.items[0].input.maskFillModel, key);
    assert.equal(request.items[0].input.prompt, prompt.value);
    f.controller.configure(legacy);
  }
  model.value = "flux2Klein"; model.fire("change");
  assert.equal(f.controller.isAvailable(), true);
});

test("读取与失败原因不误报旧服务，逐模型权限原因仍阻断原选择", () => {
  const f = fixture(); f.paint();
  const model = f.node("[data-mask-model]");
  for (const key of ["gptImage25Sunburst", "qwenImageEdit2511"]) {
    model.value = key; model.fire("change");
    for (const reason of ["读取模型权限中…", "二次编辑模型读取失败，请检查连接后重试"]) {
      f.controller.configure({ available: false, reason, modes: [] });
      assert.equal(f.controller.availabilityReason(), reason);
      assert.equal(f.node("[data-mask-status]").textContent, reason);
      assert.equal(model.value, key);
    }
    f.controller.configure({ version: "2026-10-21.local.2", available: false, reason: "旧工作流节点离线", modes: [] });
    assert.equal(f.controller.availabilityReason(), "旧工作流节点离线");
    f.controller.configure({ version: "current", available: true, reason: null,
      models: [{ key, modes: [{ key: "prompt", available: false, reason: "当前模型权限已失效" }] }] });
    assert.equal(f.controller.availabilityReason(), "当前模型权限已失效");
    assert.equal(f.controller.isAvailable(), false);
    assert.equal(model.value, key);
  }
});

test("GPT模式可用但输出目录缺字段时继续明确提示重启并阻断生成", () => {
  const f = fixture(); f.paint();
  const model = f.node("[data-mask-model]");
  model.value = "gptImage25Sunburst"; model.fire("change");
  const complete = { key: model.value, modes: [{ key: "prompt", available: true }],
    sizes: MODEL_CONFIGS.gptImage25Sunburst.sizes, outputResolutions: ["1K", "2K", "4K"],
    qualityOptions: MODEL_CONFIGS.gptImage25Sunburst.qualityOptions, defaultQuality: "medium" };
  for (const field of ["sizes", "outputResolutions", "qualityOptions"]) {
    const incomplete = { ...complete }; delete incomplete[field];
    f.controller.configure({ version: "current", available: true, reason: null, models: [incomplete] });
    assert.equal(f.controller.availabilityReason(), "GPT输出档位配置未更新，请重启当前工作台");
    assert.equal(f.controller.isAvailable(), false);
    assert.throws(() => f.controller.jobRequest({ image }), /GPT输出档位配置未更新/);
  }
  f.controller.configure({ version: "current", available: true, reason: null, models: [complete] });
  assert.equal(f.controller.isAvailable(), true);
});

test("二次编辑任务独立恢复且保留ComfyUI进度和统一START语义", () => {
  const values = new Map(); const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const task = createGenerationTask({ featureMode: "imageMaskFill", models: [{ key: "flux2MaskPrompt", label: "填充" }], loadingLabel: "正在填充", createId: () => "mask-fill" });
  saveGenerationTask(storage, task);
  assert.deepEqual(readGenerationTasks(storage).imageMaskFill, task);
  assert.equal(generationTaskView(task, { status: "running", stages: { comfyUi: "executing" }, message: "MaaS执行中" }).message, "MaaS执行中");
  assert.equal(generationActionState({ featureMode: "imageMaskFill" }).mainAriaLabel, "开始二次编辑");
});

test("AI编辑唯一入口、URL直达、局部配置失败隔离与飞书同步门槛已连接", async () => {
  const [html, app, tools] = await Promise.all(["index.html", "app.js", "image-tools.js"].map(name => readFile(new URL(`../public/${name}`, import.meta.url), "utf8")));
  assert.equal((html.match(/data-feature-mode="imageMaskFill"/g) || []).length, 1);
  assert.match(html, /image-mask-fill\.css/);
  assert.match(app, /new URLSearchParams\(window\.location\.search\)\.get\("feature"\)/);
  assert.match(app, /!state\.larkReady && featureMode !== "imageUpscale"/);
  assert.match(app, /api\("\/api\/image-mask-fill\/config"\)\.catch/);
  assert.match(tools, /prefix: "imageMaskFill"/);
});

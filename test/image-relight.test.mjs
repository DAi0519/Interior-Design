/**
 * [INPUT]: 依赖node:test、sharp真实图片、五模板重建照明/custom旧方案分支与历史四动作准入、GPT服务/适配器与模型目录
 * [OUTPUT]: 验证v10整体原灯无标注单图、严格准入/模板隔离/新光排除与仅原灯减弱关闭/错标不压暗区域、历史字段兼容与typed优先、摄影原文/五目标/材质机位、权限Schema零收费/原生PNG和归档脱敏
 * [POS]: test 的打光离线合同测试，使用docs整体原灯语义v9快照作为显式当期资产，全部模型/飞书读取和归档为内存替身，不访问网络或付费接口
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { RELIGHT_MODEL_KEY, RELIGHT_ACTIONS, RELIGHT_ACTION_GUIDES, RELIGHT_ORIGINAL_LIGHT_ACTIONS, normalizeRelightOriginalLights, normalizeRelightLights, relightPoint, relightImageIssue, relightOutputSize } from "../public/image-relight-geometry.js";
import { validateRelightInput, readImageRelightConfig as readImageRelightConfigImpl, executeImageRelight as executeImageRelightImpl } from "../src/image-relight-service.mjs";
import { RELIGHT_ONEAPI_MODEL, prepareRelightInput as prepareRelightInputImpl, buildRelightPrompt as buildRelightPromptImpl } from "../src/image-relight-oneapi.mjs";
import { RELIGHT_TEMPLATES, RELIGHT_LEGACY_TEMPLATES, RELIGHT_DEFAULT_TEMPLATE_KEY, RELIGHT_BLEND_MODES, relightTemplateDefinition, normalizeRelightSettings } from "../public/image-relight-presets.js";
import { relightRebuildsLighting, relightPhotographicInstructions as relightPhotographicInstructionsImpl } from "../src/image-relight-presets.mjs";

import { parseImageRelightPrompt } from "../src/image-relight-prompt.mjs";
const assetPrompt = (await readFile(new URL("../docs/image-relight-prompt-v9.json", import.meta.url), "utf8")).trim();
const assetSnapshot = { code: "image-relight", name: "打光 Prompt", version: 9, published: true,
  prompt: assetPrompt, bundle: parseImageRelightPrompt(assetPrompt),
  sha256: createHash("sha256").update(assetPrompt).digest("hex"),
  source: "feishu:tblDCXNib9XeWuza:image-relight@v9", tableUrl: "https://example.invalid/relight-test-table" };
const assetConfig = { available: true, code: assetSnapshot.code, name: assetSnapshot.name, version: 9, defaultVersion: 9,
  published: true, sha256: assetSnapshot.sha256, source: assetSnapshot.source, tableUrl: assetSnapshot.tableUrl,
  versions: [{ code: "image-relight", name: "打光 Prompt", published: true, version: 9 }] };
const readImageRelightConfig = (options = {}) => readImageRelightConfigImpl({ readPromptConfig: async () => assetConfig, ...options });
const executeImageRelight = (input, options = {}) => executeImageRelightImpl(input, { getPrompt: async () => structuredClone(assetSnapshot), ...options });
const prepareRelightInput = validated => prepareRelightInputImpl({ ...validated, relightPromptSnapshot: structuredClone(assetSnapshot) });
const buildRelightPrompt = input => buildRelightPromptImpl({ ...input, relightPromptSnapshot: structuredClone(assetSnapshot) });
const relightPhotographicInstructions = input => relightPhotographicInstructionsImpl(input, assetSnapshot.bundle);

const picture = (width, height, color = "#9c9183") => sharp({ create: { width, height, channels: 3, background: color } }).png().toBuffer();
const descriptor = (bytes, type = "image/png") => ({ dataUrl: `data:${type};base64,${bytes.toString("base64")}`, type, size: bytes.length, name: "synthetic-room.png" });
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const light = (overrides = {}) => ({ id: "light-1", type: "point", points: [{ x: 0.2, y: 0.2 }], target: { x: 0.5, y: 0.7 },
  mode: "lightOnly", kelvin: 3000, intensity: 1, softness: "soft", fixture: "", ...overrides });
const catalog = async () => [{ id: RELIGHT_ONEAPI_MODEL.id }];
const fixture = async (overrides = {}) => ({ referenceImages: [descriptor(await picture(96, 64))], lights: [light()], ...overrides });
function clientFixture({ reject = false, widthDelta = 0, outputFormat = "png" } = {}) {
  const requests = [], outputs = [];
  return { requests, outputs, async editImageAsync(request, options) {
    requests.push(request); options.onSubmitted?.({ id: "resp_relight_fixture", status: "in_progress" });
    if (reject) throw Object.assign(new Error("synthetic upstream failure"), { statusCode: 502 });
    const [width, height] = request.size.split("x").map(Number);
    const bytes = await sharp({ create: { width: width + widthDelta, height, channels: 3, background: "#c8a078" } }).toFormat(outputFormat).toBuffer();
    outputs.push(bytes);
    return { images: [{ url: `data:image/${outputFormat};base64,${bytes.toString("base64")}` }], transport: "responses-background", created: 1,
      requestId: "request-relight", usageCost: { amount: 0.03, currency: "USD" } };
  } };
}

test("整体原灯严格归一化，null兼容旧请求且拒绝未知字段和非减弱幅度", () => {
  assert.equal(normalizeRelightOriginalLights(), null); assert.equal(normalizeRelightOriginalLights(null), null);
  assert.deepEqual(RELIGHT_ORIGINAL_LIGHT_ACTIONS.map(item => [item.key, item.label]), [["keep", "保留"], ["darken", "整体减弱"], ["turnOff", "全部关闭"]]);
  assert.deepEqual(normalizeRelightOriginalLights({ action: "keep" }), { action: "keep" });
  assert.deepEqual(normalizeRelightOriginalLights({ action: "turnOff" }), { action: "turnOff" });
  assert.deepEqual(normalizeRelightOriginalLights({ action: "darken" }), { action: "darken", amount: 0.5 });
  for (const amount of [0.1, 0.9]) assert.equal(normalizeRelightOriginalLights({ action: "darken", amount }).amount, amount);
  const source = { action: "darken", amount: 0.4 }, normalized = normalizeRelightOriginalLights(source); source.amount = 0.9;
  assert.equal(normalized.amount, 0.4);
  for (const invalid of [[], false, 1, "darken", {}, { action: "preserve" }, { action: "darken", amount: "0.5" },
    { action: "darken", amount: 0 }, { action: "darken", amount: 1 }, { action: "darken", amount: NaN }, { action: "darken", amount: Infinity },
    { action: "keep", amount: 0.5 }, { action: "turnOff", amount: undefined }, { action: "darken", source: "daylight" }]) {
    assert.throws(() => normalizeRelightOriginalLights(invalid), TypeError);
  }
});

test("自定义整体减弱或关闭无需坐标，仅keep或保护不构成新任务，模板拒绝整体暗参", async () => {
  const client = clientFixture(), base = await fixture({ templateKey: "custom", lights: [] });
  for (const originalLights of [{ action: "darken" }, { action: "turnOff" }]) {
    const input = await validateRelightInput({ ...base, originalLights }); assert.deepEqual(input.lights, []);
    assert.deepEqual(input.originalLights, normalizeRelightOriginalLights(originalLights));
    const omitted = await validateRelightInput({ ...base, lights: undefined, originalLights }); assert.deepEqual(omitted.lights, []);
  }
  assert.equal((await validateRelightInput(await fixture())).originalLights, null);
  for (const originalLights of [null, { action: "keep" }, { action: "keep", amount: 0.5 }, { action: "darken", amount: 2 }, { action: "unknown" }]) {
    await assert.rejects(executeImageRelight({ ...base, originalLights }, { imageClient: client, getOneApiModels: catalog }), { statusCode: 400 });
  }
  const onlyProtection = normalizeRelightLights([light({ action: "preserve" })]);
  await assert.rejects(validateRelightInput({ ...base, originalLights: { action: "keep" }, lights: onlyProtection }), /仅保持不变/);
  for (const { key: templateKey } of [...RELIGHT_TEMPLATES, ...RELIGHT_LEGACY_TEMPLATES].filter(t => t.key !== "custom")) {
    for (const originalLights of [{ action: "keep" }, { action: "darken" }, { action: "turnOff" }]) {
      await assert.rejects(executeImageRelight({ ...base, templateKey, originalLights }, { imageClient: client, getOneApiModels: catalog }), /自定义/);
    }
    assert.equal((await validateRelightInput({ ...base, templateKey, originalLights: null })).originalLights, null);
  }
  assert.equal(client.requests.length, 0);
});

test("整体原灯无标注只发一次原图，不带guide/mask且原生交付和canonical回执冻结", async () => {
  for (const originalLights of [{ action: "darken", amount: 0.7 }, { action: "turnOff" }]) {
    const input = await fixture({ templateKey: "custom", lights: [], originalLights }), client = clientFixture();
    const prepared = await prepareRelightInput(await validateRelightInput(input));
    assert.equal(prepared.guideImage, null); assert.equal(prepared.guideBytes, null); assert.equal(prepared.request.images.length, 1);
    assert.match(prepared.request.prompt, /WHOLE-SCENE ORIGINAL LIGHTS:/); assert.doesNotMatch(prepared.request.prompt, /image 2|Action 1|Light 1:/);
    const result = await executeImageRelight(input, { imageClient: client, getOneApiModels: catalog });
    assert.equal(client.requests.length, 1); assert.equal(client.requests[0].images.length, 1); assert.equal(Object.hasOwn(client.requests[0], "mask"), false);
    assert.deepEqual(result.upstream.metadata.originalLights, originalLights); assert.deepEqual(result.request.originalLights, originalLights);
    assert.equal(result.upstream.metadata.referenceImageCount, 1); assert.equal(result.upstream.metadata.guideSha256, null);
    assert.deepEqual(result.upstream.metadata.lights, []); assert.equal(result.workflow.version, "2026-10-26.gpt-relight.10");
    assert.deepEqual(Buffer.from(result.images[0].url.split(",")[1], "base64"), client.outputs[0]);
    assert.equal(result.upstream.metadata.prompt, undefined);
  }
});

test("整体原灯Prompt区分人工灯和日光，不压曝光、不削弱新补光且保留最高保护优先", () => {
  const lights = normalizeRelightLights([light({ mode: "addFixture" }), light({ id: "dim", action: "darken", amount: 0.3 }),
    light({ id: "off", action: "turnOff" }), light({ id: "preserve", action: "preserve" })]);
  for (const originalLights of [{ action: "keep" }, { action: "darken", amount: 0.6 }, { action: "turnOff" }]) {
    const text = buildRelightPrompt({ templateKey: "custom", originalLights, lights });
    const global = text.split("\n\n").find(part => part.startsWith("WHOLE-SCENE ORIGINAL LIGHTS:"));
    assert.match(global, /without requiring user marks or an extra recognition pass/);
    assert.match(global, /rather than lowering whole-image or regional exposure/);
    assert.match(global, /suppressing window\/exterior daylight/);
    assert.match(global, /If no original artificial source is identifiable, leave the scene unchanged by this action/);
    assert.match(global, /does not dim, turn off or suppress any separately requested new illumination or newly added fixture/);
    assert.match(global, /Marked PRESERVE content has the highest priority/);
    if (originalLights.action === "darken") assert.match(global, /by approximately 60% as a relative visual intent/);
    if (originalLights.action === "turnOff") assert.match(global, /takes precedence over a marked dim or brighten request that would relight an original emitter/);
    if (originalLights.action === "keep") assert.match(global, /This is not a pixel lock/);
    assert.match(text, /a marked off therefore overrides whole-scene dim/);
    assert.match(text, /replaces the whole-scene dim amount rather than compounding/);
    assert.match(text, /ADD FIXTURE AND LIGHT/); assert.match(text, /Whole-scene original-light handling does not suppress this separate new contribution/);
  }
});

test("整体原灯输入在模型等待期间独立冻结，模板canonical为null且无整体Prompt", async () => {
  let submitted, release;
  const entered = new Promise(resolve => { submitted = resolve; }), waiting = new Promise(resolve => { release = resolve; });
  const client = clientFixture(), edit = client.editImageAsync.bind(client);
  client.editImageAsync = async (request, options) => { submitted(); await waiting; return edit(request, options); };
  const input = await fixture({ templateKey: "custom", lights: [], originalLights: { action: "darken", amount: 0.5 } });
  const pending = executeImageRelight(input, { imageClient: client, getOneApiModels: catalog });
  await entered; input.originalLights.amount = 0.9; release();
  const result = await pending; assert.equal(result.upstream.metadata.originalLights.amount, 0.5);
  assert.match(client.requests[0].prompt, /by approximately 50% as a relative visual intent/);
  const templateClient = clientFixture();
  const template = await executeImageRelight(await fixture({ templateKey: "naturalFill", lights: [] }), { imageClient: templateClient, getOneApiModels: catalog });
  assert.equal(template.upstream.metadata.originalLights, null); assert.equal(template.request.originalLights, null);
  assert.doesNotMatch(templateClient.requests[0].prompt, /WHOLE-SCENE ORIGINAL LIGHTS:/);
});

test("光源合同接受混合点线面与两种模式，归一化深拷贝且不改变上游结构", () => {
  const lights = [light(), light({ id: "line-2", type: "line", points: [{ x: 0.1, y: 0.1 }, { x: 0.8, y: 0.1 }], mode: "addFixture", fixture: "  黑色灯带  " }),
    light({ id: "area-3", type: "area", points: [{ x: 0.1, y: 0.1 }, { x: 0.4, y: 0.1 }, { x: 0.5, y: 0.4 }, { x: 0.1, y: 0.4 }] })];
  const normalized = normalizeRelightLights(lights);
  assert.equal(normalized[1].fixture, "黑色灯带");
  lights[0].points[0].x = 1; lights[1].target.x = 0;
  assert.equal(normalized[0].points[0].x, 0.2); assert.equal(normalized[1].target.x, 0.5);
  assert.deepEqual(relightPoint({ clientX: 200, clientY: -5 }, { left: 0, top: 0, width: 100, height: 100 }), { x: 1, y: 0 });
});

test("无效光源几何、身份、枚举、色温和亮度全部在付费前阻断", async () => {
  const base = await fixture(), client = clientFixture();
  const bad = [light({ type: "spot" }), light({ id: "<svg>" }), light({ mode: "replace" }), light({ softness: "auto" }),
    light({ kelvin: 1999 }), light({ kelvin: 10001 }), light({ kelvin: 3000.5 }), light({ kelvin: "3000" }),
    light({ intensity: 0 }), light({ intensity: Infinity }), light({ target: { x: NaN, y: 0 } }), light({ target: { x: 1.01, y: 0 } }),
    light({ target: { x: 0.2, y: 0.2 } }), light({ target: { x: 0.201, y: 0.201 } }),
    light({ points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }] }), light({ type: "line", points: [{ x: 0.1, y: 0.1 }, { x: 0.1, y: 0.1 }] }),
    light({ type: "area", points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }, { x: 0.3, y: 0.3 }] }),
    light({ type: "area", points: [{ x: 0, y: 0 }, { x: 1, y: 0.9 }, { x: 1, y: 0 }, { x: 0.1, y: 1 }] }),
    light({ type: "area", points: [{ x: 0, y: 0 }, { x: 0.002, y: 0.0018 }, { x: 0.002, y: 0 }, { x: 0.0002, y: 0.002 }] }),
    light({ fixture: "灯".repeat(201) })];
  for (const entry of bad) await assert.rejects(executeImageRelight({ ...base, lights: [entry] }, { imageClient: client, getOneApiModels: catalog }), { statusCode: 400 });
  for (const lights of [[], [light(), light()], Array.from({ length: 13 }, (_, index) => light({ id: `light-${index}` }))]) {
    await assert.rejects(validateRelightInput({ ...base, lights }), { statusCode: 400 });
  }
  assert.equal(client.requests.length, 0);
});

test("真实单图解码、模型身份、档位质量及补充文本严格准入", async () => {
  const base = await fixture();
  for (const overrides of [{ modelKey: "gptImage25Flare" }, { relightModel: "flux2Klein" }, { provider: "comfyui" },
    { referenceImages: [] }, { referenceImages: [...base.referenceImages, ...base.referenceImages] }, { quality: "auto" }, { quality: null },
    { outputResolution: "6K" }, { outputResolution: null }, { prompt: 3 }, { prompt: "a".repeat(2001) }, { maskImage: {} }, { editRegion: {} }]) {
    await assert.rejects(validateRelightInput({ ...base, ...overrides }), { statusCode: 400 });
  }
  await assert.rejects(validateRelightInput({ ...base, referenceImages: [descriptor(await picture(4097, 64))] }), { statusCode: 400 });
  await assert.rejects(validateRelightInput({ ...base, referenceImages: [descriptor(await picture(400, 100))] }), /1:3至3:1/);
  const broken = Buffer.from((await picture(96, 64)).subarray(0, 40));
  await assert.rejects(validateRelightInput({ ...base, referenceImages: [descriptor(broken)] }), { statusCode: 400 });
  const validated = await validateRelightInput(base);
  assert.equal(validated.quality, "medium"); assert.equal(validated.outputResolution, "1K");
  assert.equal(validated.modelKey, RELIGHT_MODEL_KEY); assert.deepEqual([validated.source.width, validated.source.height], [96, 64]);
});

test("公开配置仅接GPT并逐次查询当前Key权限，不公开Prompt", async () => {
  assert.equal((await readImageRelightConfig()).available, false);
  assert.equal((await readImageRelightConfig({ getOneApiModels: async () => [] })).available, false);
  const config = await readImageRelightConfig({ getOneApiModels: catalog });
  assert.equal(config.available, true); assert.equal(config.models.length, 1); assert.equal(config.modelKey, RELIGHT_MODEL_KEY);
  assert.deepEqual(config.qualityOptions, RELIGHT_ONEAPI_MODEL.qualityOptions); assert.equal(config.defaultOutputResolution, "1K");
  assert.deepEqual(config.templates, RELIGHT_TEMPLATES); assert.deepEqual(config.legacyTemplates, RELIGHT_LEGACY_TEMPLATES);
  assert.deepEqual(config.actions, RELIGHT_ACTIONS); assert.deepEqual(config.blendModes, RELIGHT_BLEND_MODES);
  assert.deepEqual(config.originalLightActions, RELIGHT_ORIGINAL_LIGHT_ACTIONS); assert.deepEqual(config.defaultOriginalLights, { action: "keep" });
  assert.equal(config.defaultTemplateKey, "naturalFill"); assert.equal(config.defaultBlendMode, "balanced");
  assert.ok(config.templates.every(entry => Object.keys(entry).sort().join(",") === "description,key,label"));
  assert.equal(JSON.stringify(config).includes("Relight image 1"), false);
  assert.equal(JSON.stringify(config).includes("Treat image 1's existing illumination"), false);
  assert.match((await readImageRelightConfig({ getOneApiModels: async () => { throw new Error("unavailable"); } })).reason, /unavailable/);
});

test("模板与融合设置严格准入，旧手动请求默认自然融合且不能用空光源绕过", async () => {
  const base = await fixture();
  assert.deepEqual(normalizeRelightSettings(), { templateKey: "custom", blendMode: "balanced" });
  const original = await validateRelightInput(base);
  assert.equal(original.templateKey, "custom"); assert.equal(original.blendMode, "balanced");
  for (const override of [{ templateKey: null }, { templateKey: "unknown" }, { templateKey: 1 }, { templateKey: [] },
    { blendMode: null }, { blendMode: "replace" }, { blendMode: 0 }, { blendMode: {} }]) {
    await assert.rejects(validateRelightInput({ ...base, ...override }), { statusCode: 400 });
  }
  for (const bad of [null, [], "naturalFill"]) assert.throws(() => normalizeRelightSettings(bad));
  assert.throws(() => normalizeRelightLights([]), /添加/);
  assert.deepEqual(normalizeRelightLights([], { allowEmpty: true }), []);
  await assert.rejects(validateRelightInput({ ...base, lights: [], templateKey: "custom" }), /添加/);
  for (const lights of [null, {}, [light({ kelvin: 10001 })]]) {
    await assert.rejects(validateRelightInput({ ...base, templateKey: "naturalFill", lights }), { statusCode: 400 });
  }
});

test("五种场景光照模板可零标注直接使用原图，不生成空引导图或虚构灯位", async () => {
  for (const template of RELIGHT_TEMPLATES.filter(entry => entry.key !== "custom")) {
    const base = await fixture({ templateKey: template.key, blendMode: "balanced", lights: undefined });
    const validated = await validateRelightInput(base), prepared = await prepareRelightInput(validated);
    assert.deepEqual(validated.lights, []); assert.equal(validated.templateKey, template.key);
    assert.equal(prepared.request.images.length, 1); assert.equal(prepared.guideBytes, null); assert.equal(prepared.guideImage, null);
    assert.equal(Object.hasOwn(prepared.request, "mask"), false);
    assert.equal(prepared.request.images[0].image_url, `data:image/png;base64,${prepared.sourceBytes.toString("base64")}`);
    assert.doesNotMatch(prepared.request.prompt, /image 2|Light 1:|numbered lighting plan/);
    assert.match(prepared.request.prompt, /REBUILD ALL LIGHTING/); assert.match(prepared.request.prompt, /Do not add visible physical lighting hardware/);
    assert.match(prepared.request.prompt, /Manually marked adjustments override the template/);
  }
  const windowPlan = buildRelightPrompt({ lights: [], templateKey: "windowDaylight" });
  assert.match(windowPlan, /do not invent a visible window/);
  const wallPlan = buildRelightPrompt({ lights: [], templateKey: "accentWash" });
  assert.match(wallPlan, /above the wall, hidden or off-camera/);
});

test("三档调整适配原图风格与亮暗，保留线光范围及手动参数优先", () => {
  const lights = [light({ type: "line", points: [{ x: 0.2, y: 0.2 }, { x: 0.6, y: 0.2 }], mode: "addFixture", kelvin: 6500 })];
  const prompts = RELIGHT_BLEND_MODES.map(mode => buildRelightPrompt({ lights, templateKey: "noMainLight", blendMode: mode.key }));
  assert.equal(new Set(prompts).size, 3);
  for (const prompt of prompts) {
    assert.match(prompt, /existing interior design style/);
    assert.match(prompt, /actual window brightness, room depth, surface reflectance, highlights and dark areas/);
    assert.match(prompt, /keep the original white balance/);
    assert.match(prompt, /contradictory duplicate shadows/);
    assert.match(prompt, /Keep original emission states as a baseline only when keep is selected or no original-light operation was requested/);
    assert.match(prompt, /Explicit darken amounts and turn-off requests must still take effect|ACTION PRIORITY/);
    assert.match(prompt, /Stop the emitter at its marked endpoints/);
    assert.match(prompt, /Do not extend it along the wall edge, around corners or into the existing cove network/);
    assert.match(prompt, /Manually marked new lights supply their specified geometry, target, mode, Kelvin intent and brightness/); assert.match(prompt, /6500 K/);
  }
  assert.match(prompts[0], /keep optional new-light contributions and scene rebalancing restrained/);
  assert.match(prompts[1], /naturally coordinate/);
  assert.match(prompts[2], /make the requested treatment and independent new-light contributions apparent/);
});

test("纯模板只提交一次单图并保留场景与融合版本，模板叠加手动光源仍为双图", async () => {
  const client = clientFixture();
  const result = await executeImageRelight(await fixture({ templateKey: "naturalFill", blendMode: "subtle", lights: [] }), {
    imageClient: client, getOneApiModels: catalog,
  });
  assert.equal(client.requests.length, 1); assert.equal(client.requests[0].images.length, 1);
  assert.equal(result.request.referenceImageCount, 1); assert.equal(result.request.lightCount, 0);
  assert.equal(result.request.templateKey, "naturalFill"); assert.equal(result.request.blendMode, "subtle");
  assert.equal(result.upstream.metadata.templateKey, "naturalFill"); assert.equal(result.upstream.metadata.blendMode, "subtle");
  assert.equal(result.upstream.metadata.templateSource, assetSnapshot.source);
  assert.equal(result.upstream.metadata.referenceImageCount, 1); assert.equal(result.upstream.metadata.guideSha256, null);
  assert.equal(result.upstream.metadata.prompt, undefined); assert.equal(result.upstream.metadata.sourcePrompt, undefined);
  assert.equal(result.archiveGuideImage, undefined); assert.deepEqual(Buffer.from(result.images[0].url.split(",")[1], "base64"), client.outputs[0]);
  const mixed = await prepareRelightInput(await validateRelightInput(await fixture({ templateKey: "softStudio", blendMode: "pronounced" })));
  assert.equal(mixed.request.images.length, 2); assert.ok(mixed.guideImage);
  assert.match(mixed.request.prompt, /SOFT PHOTOGRAPHIC SCULPTING/); assert.match(mixed.request.prompt, /PRONOUNCED REBUILT LIGHTING/);
  assert.match(mixed.request.prompt, /Light 1:/);
});

test("干净原图排第一、编号方向图排第二，逐灯模式及K数通过独立Prompt执行", async () => {
  const input = await fixture({ lights: [light(), light({ id: "strip-2", type: "line", points: [{ x: 0.1, y: 0.15 }, { x: 0.85, y: 0.15 }], mode: "addFixture", kelvin: 4000, fixture: "隐藏式暖白灯带" })] });
  const validated = await validateRelightInput(input), prepared = await prepareRelightInput(validated);
  assert.equal(prepared.request.images.length, 2); assert.equal(Object.hasOwn(prepared.request, "mask"), false);
  const clean = await sharp(prepared.sourceBytes).raw().toBuffer(), original = await sharp(Buffer.from(input.referenceImages[0].dataUrl.split(",")[1], "base64")).raw().toBuffer();
  assert.deepEqual(clean, original); assert.notDeepEqual(prepared.sourceBytes, prepared.guideBytes);
  const guide = await sharp(prepared.guideBytes).metadata(); assert.deepEqual([guide.width, guide.height], [96, 64]);
  assert.equal(prepared.guideImage.imageUrl, prepared.request.images[1].image_url);
  for (const phrase of ["LIGHT ONLY", "ADD FIXTURE AND LIGHT", "3000 K", "4000 K", "隐藏式暖白灯带", "Remove all temporary blue marks", "attributable bounce and reflections"]) assert.ok(prepared.request.prompt.includes(phrase));
  assert.doesNotMatch(prepared.request.prompt, /Preserve (?:the (?:scene's )?)?(?:original |existing )?lighting|masked region|transparent area/i);
  assert.match(buildRelightPrompt({ lights: [light()], prompt: "窗边保持明亮" }), /窗边保持明亮/);
});

test("EXIF方向先归一，引导图严格跟随真实方向尺寸且原件指纹保留", async () => {
  const bytes = await sharp(await picture(90, 60)).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const validated = await validateRelightInput(await fixture({ referenceImages: [descriptor(bytes, "image/jpeg")] }));
  assert.deepEqual([validated.source.width, validated.source.height], [60, 90]); assert.equal(validated.source.originalSha256, digest(bytes));
  const prepared = await prepareRelightInput(validated);
  const metadata = await sharp(prepared.guideBytes).metadata(); assert.deepEqual([metadata.width, metadata.height], [60, 90]);
});

test("权限失效或Schema不兼容时零模型调用，成功任务只提交一次并逐字节交付PNG", async () => {
  const input = await fixture(), client = clientFixture(); let archive, schemaChecks = 0;
  await assert.rejects(executeImageRelight(input, { imageClient: client, getOneApiModels: async () => [] }), { statusCode: 409 });
  await assert.rejects(executeImageRelight(input, { imageClient: client, getOneApiModels: catalog, scheduleSync() {}, verifySyncContract() { throw new Error("missing field"); } }), { statusCode: 409 });
  assert.equal(client.requests.length, 0);
  const progress = [];
  const result = await executeImageRelight(input, { imageClient: client, getOneApiModels: catalog, onProgress: value => progress.push(value),
    verifySyncContract() { schemaChecks += 1; }, scheduleSync(value) { archive = value; return { generationId: "relight-sync", status: "pending" }; } });
  assert.equal(client.requests.length, 1); assert.equal(schemaChecks, 1); assert.equal(result.sync.status, "pending");
  assert.equal(result.archiveGuideImage, undefined); assert.equal(result.request.syncMode, "lark");
  assert.equal(result.upstream.metadata.prompt, undefined); assert.equal(result.upstream.metadata.sourcePrompt, undefined);
  assert.equal(JSON.stringify(result).includes("Relight image 1"), false);
  assert.deepEqual(Buffer.from(result.images[0].url.split(",")[1], "base64"), client.outputs[0]);
  assert.equal(archive.finalPrompt, client.requests[0].prompt); assert.deepEqual(archive.workflow.lights, normalizeRelightLights(input.lights));
  assert.equal(archive.referenceImages.length, 2); assert.equal(archive.referenceImages[0].imageUrl, input.referenceImages[0].dataUrl);
  assert.equal(archive.referenceImages[1].imageUrl, client.requests[0].images[1].image_url);
  assert.equal(archive.workflow.guideSha256, digest(Buffer.from(client.requests[0].images[1].image_url.split(",")[1], "base64")));
  assert.equal(archive.workflow.outputSha256, digest(client.outputs[0])); assert.equal(archive.workflow.calibratedLighting, false);
  assert.ok(progress.some(value => value.upstreamResponseId === "resp_relight_fixture"));
});

test("不调度归档的独立执行同样不把固定Prompt暴露给任务消费者", async () => {
  const client = clientFixture();
  const result = await executeImageRelight(await fixture(), { imageClient: client, getOneApiModels: catalog });
  assert.equal(result.upstream.metadata.prompt, undefined); assert.equal(result.upstream.metadata.sourcePrompt, undefined);
  assert.equal(JSON.stringify(result).includes("Relight image 1"), false); assert.equal(result.sync.status, "skipped");
  assert.match(client.requests[0].prompt, /^Relight image 1/);
});

test("小图归一化方向落到像素后退化时零收费，4096方图沿用共享16Mi像素边界", async () => {
  const client = clientFixture();
  const input = await fixture({ lights: [light({ target: { x: 0.206, y: 0.2 } })] });
  await assert.rejects(executeImageRelight(input, { imageClient: client, getOneApiModels: catalog }), /拉开方向箭头/);
  assert.equal(client.requests.length, 0);
  const source = descriptor(await picture(4096, 4096));
  assert.equal((await validateRelightInput({ referenceImages: [source], lights: [light()] })).source.width, 4096);
  assert.equal(relightImageIssue({ ...source, width: 4096, height: 4096 }), "");
});

test("上游错误、错误尺寸或非PNG结果均失败且不自动重提或归档", async () => {
  const input = await fixture();
  for (const behavior of [{ reject: true }, { widthDelta: 16 }, { outputFormat: "jpeg" }]) {
    const client = clientFixture(behavior); let syncCalls = 0;
    await assert.rejects(executeImageRelight(input, { imageClient: client, getOneApiModels: catalog, verifySyncContract() {}, scheduleSync() { syncCalls += 1; } }), { statusCode: 502 });
    assert.equal(client.requests.length, 1); assert.equal(syncCalls, 0);
  }
});

test("全部输出档位沿用GPT尺寸目录，前端图片问题与真实服务边界一致", () => {
  for (const [ratio, sizes] of Object.entries(RELIGHT_ONEAPI_MODEL.sizes)) {
    const [width, height] = ratio.split(":").map(Number);
    for (const resolution of ["1K", "2K", "4K"]) {
      const target = relightOutputSize({ width, height }, resolution, RELIGHT_ONEAPI_MODEL.sizes);
      assert.equal(`${target.width}x${target.height}`, sizes[resolution]);
    }
  }
  const valid = { dataUrl: "data:image/png;base64,fixture", type: "image/png", size: 12, width: 100, height: 100 };
  assert.equal(relightImageIssue(valid), ""); assert.match(relightImageIssue({ ...valid, width: 4097 }), /4096/);
  assert.match(relightImageIssue({ ...valid, type: "image/gif" }), /PNG/);
});


test("四类动作按职责归一化，旧无action仍为新增光源且原灯动作维持历史字段", () => {
  const entries = normalizeRelightLights([
    light(),
    light({ id: "dim", action: "darken", target: null, mode: "not-used", kelvin: -1, amount: 0.7 }),
    light({ id: "off", action: "turnOff", target: null, fixture: "不应进入Prompt" }),
    { id: "keep", action: "preserve", type: "line", points: [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.2 }] },
  ]);
  assert.equal(entries[0].action, "brighten");
  assert.deepEqual(Object.keys(entries[1]).sort(), ["action", "amount", "id", "points", "type"]);
  for (const entry of entries.slice(2)) assert.deepEqual(Object.keys(entry).sort(), ["action", "id", "points", "type"]);
  assert.equal(entries[1].amount, 0.7);
  assert.equal(normalizeRelightLights([light({ action: "darken" })])[0].amount, 0.5);
  for (const amount of [0.1, 0.9]) assert.equal(normalizeRelightLights([light({ action: "darken", amount })])[0].amount, amount);
  entries[1].points[0].x = 1;
  assert.equal(normalizeRelightLights([light({ action: "darken" })])[0].points[0].x, 0.2);
  assert.deepEqual(RELIGHT_ACTIONS.slice(0, 3).map(({ key, label }) => [key, label]), [
    ["brighten", "新增光源"], ["darken", "减弱原灯"], ["turnOff", "关闭原灯"],
  ]);
  assert.match(RELIGHT_ACTIONS.find(entry => entry.key === "darken").description, /已有灯源.*找不到原灯则保持不变/);
});

test("非法动作和压暗幅度、仅保护空操作均在付费前阻断，方案可叠加保护", async () => {
  const base = await fixture(), client = clientFixture();
  for (const action of [null, "", "delete", 0]) {
    await assert.rejects(executeImageRelight({ ...base, lights: [light({ action })] }, { imageClient: client, getOneApiModels: catalog }), { statusCode: 400 });
  }
  for (const amount of [0, 1, NaN, Infinity, "0.5", null]) {
    await assert.rejects(executeImageRelight({ ...base, lights: [light({ action: "darken", amount })] }, { imageClient: client, getOneApiModels: catalog }), { statusCode: 400 });
  }
  await assert.rejects(executeImageRelight({ ...base, lights: [light({ action: "preserve" })] }, { imageClient: client, getOneApiModels: catalog }), /至少一项/);
  assert.equal(client.requests.length, 0);
  const preserved = await validateRelightInput({ ...base, templateKey: "mainLight", lights: [light({ action: "preserve" })] });
  assert.equal(preserved.lights[0].action, "preserve");
  for (const action of ["darken", "turnOff"]) assert.equal((await validateRelightInput({ ...base, lights: [light({ action })] })).lights[0].action, action);
});

test("公开五效果加自定义，三旧方案保持身份和历史指令", () => {
  assert.deepEqual(RELIGHT_TEMPLATES.map(entry => entry.key), ["naturalFill", "warmAmbient", "windowDaylight", "accentWash", "softStudio", "custom"]);
  assert.deepEqual(RELIGHT_LEGACY_TEMPLATES.map(entry => entry.key), ["mainLight", "noMainLight", "naturalDaylight"]);
  for (const legacy of RELIGHT_LEGACY_TEMPLATES) {
    assert.equal(normalizeRelightSettings({ templateKey: legacy.key }).templateKey, legacy.key);
    assert.equal(relightTemplateDefinition(legacy.key), legacy);
  }
  assert.equal(relightTemplateDefinition("missing"), undefined);
  const daylight = buildRelightPrompt({ lights: [], templateKey: "naturalDaylight" });
  assert.match(daylight, /dark night exterior must not become daytime/);
  assert.match(daylight, /do not invent a window/);
  for (const template of RELIGHT_TEMPLATES.filter(entry => entry.key !== "custom")) {
    const prompt = buildRelightPrompt({ templateKey: template.key });
    assert.match(prompt, /a style label does not impose a fixed brightness/);
    assert.match(prompt, /Do not add visible physical lighting hardware/);
  }
});

test("四动作冲突优先级约束实际Prompt，关灯保留实体且轻微档仍执行压暗和关灯", async () => {
  const lights = normalizeRelightLights([
    light({ id: "plus", mode: "addFixture", fixture: "射灯" }),
    light({ id: "minus", action: "darken", amount: 0.7 }),
    light({ id: "off", action: "turnOff" }),
    light({ id: "keep", action: "preserve" }),
  ]);
  const validated = await validateRelightInput(await fixture({ lights, templateKey: "mainLight", blendMode: "subtle", prompt: "打开所有灯" }));
  const prepared = await prepareRelightInput(validated), text = prepared.request.prompt;
  assert.match(text, /PRESERVE > TURN OFF > DARKEN > BRIGHTEN > LIGHTING TEMPLATE/);
  assert.match(text, /fully executing the explicit original-light darken amount, whole-scene or single-light turn-off/);
  assert.match(text, /approximately 70% as a relative visual intent/);
  assert.match(text, /Preserve the physical lamp body/);
  assert.match(text, /Do not remove the fixture/);
  assert.match(text, /not pixel masks or (?:a promise of )?exact compositing/);
  assert.match(text, /Apply it within the typed action priority/);
  assert.match(text, /Action 4 \[green =, PRESERVE\]/);
  for (const line of text.split("\n\n").filter(value => /^Action [234]/.test(value))) {
    assert.doesNotMatch(line, /3000 K|relative brightness:|ADD FIXTURE AND LIGHT/);
  }
});

test("原灯减弱关闭与历史保护的真实四色引导不产生方向箭头，新增光源保留方向", async () => {
  const source = descriptor(await picture(600, 400, "#222222"));
  const nonEmitter = ["darken", "turnOff", "preserve"].map((action, index) => light({
    id: `region-${index}`, action, points: [{ x: 0.15 + index * 0.3, y: 0.2 }], target: { x: 0.15 + index * 0.3, y: 0.8 },
  }));
  const validated = await validateRelightInput(await fixture({ referenceImages: [source], lights: nonEmitter, templateKey: "mainLight" }));
  const prepared = await prepareRelightInput(validated);
  const raw = await sharp(prepared.guideBytes).removeAlpha().raw().toBuffer();
  const colorAt = (x, y) => [...raw.subarray((y * 600 + x) * 3, (y * 600 + x) * 3 + 3)];
  for (const [index, entry] of nonEmitter.entries()) {
    const x = Math.round(entry.points[0].x * 599), y = Math.round(entry.points[0].y * 399);
    const expected = RELIGHT_ACTION_GUIDES[entry.action].color.match(/\w\w/g).map(hex => Number.parseInt(hex, 16));
    assert.deepEqual(colorAt(x + 4, y), expected);
    assert.deepEqual(colorAt(x, Math.round(0.5 * 399)), [34, 34, 34]);
  }
  const bright = await prepareRelightInput(await validateRelightInput(await fixture({ referenceImages: [source], lights: [light({ points: [{ x: 0.15, y: 0.2 }], target: { x: 0.15, y: 0.8 } })] })));
  const brightRaw = await sharp(bright.guideBytes).removeAlpha().raw().toBuffer();
  const arrowOffset = (Math.round(0.5 * 399) * 600 + Math.round(0.15 * 599)) * 3;
  assert.notDeepEqual([...brightRaw.subarray(arrowOffset, arrowOffset + 3)], [34, 34, 34]);
});

test("混合四动作仅提交一次GPT双图，元数据显式冻结规范化动作和减弱幅度", async () => {
  const client = clientFixture(), entries = [light(), light({ id: "dim", action: "darken", amount: 0.6 }),
    light({ id: "off", action: "turnOff" }), light({ id: "keep", action: "preserve" })];
  const result = await executeImageRelight(await fixture({ lights: entries, templateKey: "noMainLight" }), { imageClient: client, getOneApiModels: catalog });
  assert.equal(client.requests.length, 1); assert.equal(client.requests[0].images.length, 2);
  assert.deepEqual(result.upstream.metadata.lights, normalizeRelightLights(entries));
  assert.equal(result.upstream.metadata.lightCount, 4);
  assert.match(result.upstream.metadata.version, /gpt-relight\.10$/);
  assert.equal(result.upstream.metadata.prompt, undefined);
  assert.deepEqual(Buffer.from(result.images[0].url.split(",")[1], "base64"), client.outputs[0]);
});


test("界面显式默认自然补光，旧请求省略模板仍为自定义并拒绝空标注", async () => {
  const config = await readImageRelightConfig({ getOneApiModels: catalog });
  assert.equal(RELIGHT_DEFAULT_TEMPLATE_KEY, "naturalFill");
  assert.equal(config.defaultTemplateKey, RELIGHT_DEFAULT_TEMPLATE_KEY);
  assert.deepEqual(normalizeRelightSettings(), { templateKey: "custom", blendMode: "balanced" });
  const current = await validateRelightInput(await fixture({ templateKey: config.defaultTemplateKey, lights: undefined }));
  assert.equal(current.templateKey, "naturalFill"); assert.deepEqual(current.lights, []);
  assert.equal((await prepareRelightInput(current)).request.images.length, 1);
  const old = await fixture();
  assert.equal((await validateRelightInput(old)).templateKey, "custom");
  for (const lights of [undefined, []]) await assert.rejects(validateRelightInput({ ...old, lights }), { statusCode: 400 });
  const legacyInstructions = { mainLight: "MAIN-LIGHT SCHEME", noMainLight: "NO-MAIN-LIGHT SCHEME", naturalDaylight: "NATURAL DAYLIGHT SCHEME" };
  for (const [templateKey, instruction] of Object.entries(legacyInstructions)) {
    const restored = await validateRelightInput({ ...old, templateKey, lights: [] });
    assert.equal(restored.templateKey, templateKey);
    assert.ok((await prepareRelightInput(restored)).request.prompt.includes(instruction));
  }
});

test("原灯减弱关闭只寻址现有发光体或有限段，错标受光面不得涂暗区域", () => {
  const geometries = { point: [{ x: 0.2, y: 0.2 }], line: [{ x: 0.1, y: 0.1 }, { x: 0.6, y: 0.1 }],
    area: [{ x: 0.1, y: 0.1 }, { x: 0.4, y: 0.1 }, { x: 0.4, y: 0.4 }] };
  for (const [type, points] of Object.entries(geometries)) for (const action of ["darken", "turnOff"]) {
    const lights = normalizeRelightLights([light({ action, type, points, amount: 0.4 })]);
    const text = buildRelightPrompt({ templateKey: "custom", lights });
    assert.doesNotMatch(text, /DARKEN the marked region|reduce a marked existing source or its receiving illumination|reduce the received illumination only on that marked region/);
    const instruction = text.split("\n\n").find(value => value.startsWith("Action 1 "));
    assert.match(instruction, /identify only an existing luminaire or finite emitting segment/);
    assert.match(instruction, /not a new light or a receiving surface/);
    assert.match(instruction, /Preserve the physical lamp body/);
    assert.match(instruction, /If there is no identifiable existing emitter at the mark, leave the scene unchanged by this action/);
    assert.match(instruction, /do not invent a source, darken a receiving surface or dim the marked region as a fallback/);
    assert.doesNotMatch(instruction, /reduce the received illumination only on that marked region|reduce illumination associated with/);
    assert.doesNotMatch(instruction, /ADD NEW LIGHT|relative brightness:| K;/);
    if (action === "darken") {
      assert.match(instruction, /DIM EXISTING LIGHT/);
      assert.match(instruction, /Dim only this identified source and its attributable illumination, bounce and reflections/);
      assert.match(instruction, /approximately 40% as a relative visual intent/);
      assert.match(instruction, /Dimming is not a request to turn this source off/);
      assert.match(instruction, /Do not change unrelated lights or dim the entire image/);
    } else {
      assert.match(instruction, /Stop only this identified source's visible emission/);
      assert.match(instruction, /Do not turn off unrelated lights/);
      assert.match(instruction, /Do not remove the fixture/);
    }
  }
});

test("当期完整Prompt在custom与重建模板混合动作中均不保留受光区减弱兜底", () => {
  const lights = normalizeRelightLights([light(), light({ id: "dim", action: "darken", amount: 0.4 }),
    light({ id: "off", action: "turnOff" }), light({ id: "keep", action: "preserve" })]);
  for (const { key: templateKey } of [...RELIGHT_TEMPLATES, ...RELIGHT_LEGACY_TEMPLATES]) {
    const text = buildRelightPrompt({ templateKey, lights, prompt: "把墙面压黑，没有灯也要生效" });
    assert.doesNotMatch(text, /DARKEN the marked region|reduce a marked existing source or its receiving illumination|If the mark instead identifies a receiving surface|reduce the received illumination only on that marked region/);
    assert.match(text, /ADD NEW LIGHT: add a new illumination contribution/);
    assert.match(text, /DIM EXISTING LIGHT/);
    assert.match(text, /do not invent a source, darken a receiving surface or dim the marked region as a fallback/);
    assert.match(text, /PRESERVE > TURN OFF > DARKEN > BRIGHTEN > LIGHTING TEMPLATE/);
    assert.match(text, /Apply it within the typed action priority/);
  }
});

test("新增光源的低亮度仍为新增补光，两模式色温方向不转换成原灯减弱", () => {
  for (const mode of ["lightOnly", "addFixture"]) {
    const lights = normalizeRelightLights([light({ mode, intensity: 0.1, kelvin: 4200 })]);
    const text = buildRelightPrompt({ templateKey: "custom", lights });
    const instruction = text.split("\n\n").find(value => value.startsWith("Light 1:"));
    assert.match(instruction, /ADD NEW LIGHT: add a new illumination contribution/);
    assert.match(instruction, /4200 K; relative brightness: 0.1/);
    assert.match(instruction, /lower values create a dimmer new light, not a request to dim an existing source/);
    assert.match(instruction, /Aim toward the visible scene surface.*the arrow endpoint/);
    assert.match(instruction, mode === "lightOnly" ? /LIGHT ONLY: create the illumination without adding any visible fixture/ : /ADD FIXTURE AND LIGHT: create one coherent/);
    assert.doesNotMatch(instruction, /DIM EXISTING LIGHT|TURN OFF EXISTING LIGHT/);
  }
});

test("单个原灯减弱或关闭保留一次双图与原生交付，实际Prompt和历史字段均冻结", async () => {
  for (const action of ["darken", "turnOff"]) {
    const client = clientFixture(); let archived;
    const entry = { id: "old-lamp", type: "point", points: [{ x: 0.2, y: 0.3 }], action, ...(action === "darken" ? { amount: 0.4 } : {}) };
    const result = await executeImageRelight(await fixture({ lights: [entry] }), { imageClient: client, getOneApiModels: catalog,
      verifySyncContract() {}, scheduleSync(value) { archived = value; return { generationId: action, status: "pending" }; } });
    assert.equal(client.requests.length, 1); assert.equal(client.requests[0].images.length, 2);
    assert.match(client.requests[0].prompt, /leave the scene unchanged by this action/);
    assert.equal(archived.finalPrompt, client.requests[0].prompt);
    assert.deepEqual(archived.workflow.lights, [entry]);
    assert.deepEqual(result.upstream.metadata.lights, [entry]);
    assert.equal(result.workflow.version, "2026-10-26.gpt-relight.10");
    assert.equal(Object.hasOwn(client.requests[0], "mask"), false);
    assert.deepEqual(Buffer.from(result.images[0].url.split(",")[1], "base64"), client.outputs[0]);
  }
});


test("v5五模板表达五个不同照明目标，并明确替换旧阴影和光照反射", () => {
  const goals = {
    naturalFill: [/BRIGHT DIFFUSE LIGHTING/, /bright, neutral high-key/, /weak, soft cast shadows/, /Remove the former hard sunlight patches/],
    warmAmbient: [/WARM HOME NIGHT LIGHTING/, /Lower exterior\/window daylight strongly/, /remove old daytime sun patches/, /do not create a whole-image amber filter/],
    windowDaylight: [/DIRECTIONAL WINDOW SUNLIGHT/, /clearly defined long projected shadows/, /You may reset time of day/, /If no window is visible, choose a plausible off-camera/],
    accentWash: [/TOP-DOWN ACCENT WALL WASH/, /low-ambient interior/, /washing downward from above/, /Do not degrade the wash into weak bounce/, /bright patch rising from the wall bottom/],
    softStudio: [/SOFT PHOTOGRAPHIC SCULPTING/, /neutral, medium-key/, /one large soft lateral key and a weaker fill/, /do not make this a high-key, evenly illuminated room/],
  };
  const prompts = Object.fromEntries(Object.keys(goals).map(templateKey => [templateKey, buildRelightPrompt({ templateKey, blendMode: "balanced" })]));
  for (const [key, patterns] of Object.entries(goals)) {
    const text = prompts[key];
    assert.equal(relightRebuildsLighting({ templateKey: key }), true);
    for (const pattern of patterns) assert.match(text, pattern);
    assert.match(text, /Remove old light effects and recompute direct light, indirect bounce, occlusion, cast shadows and reflections/);
    assert.match(text, /intrinsic material colors, texture and reflectance character/);
    for (const [other, otherPatterns] of Object.entries(goals)) if (other !== key) assert.doesNotMatch(text, otherPatterns[0]);
  }
  assert.equal(new Set(Object.values(prompts)).size, 5);
});

test("五重建模板在所有幅度均不锁旧光亮度白平衡时段或原灯开关", () => {
  for (const template of RELIGHT_TEMPLATES.filter(value => value.key !== "custom")) for (const mode of RELIGHT_BLEND_MODES) {
    const text = buildRelightPrompt({ templateKey: template.key, blendMode: mode.key });
    assert.match(text, /Do not inherit the old brightness, white balance, time of day or fixture on\/off states/);
    assert.match(text, /emitted brightness, color and on\/off states may change as required by the template/);
    assert.match(text, /physical fixtures stay in place/);
    assert.doesNotMatch(text, /Treat image 1 as the lighting baseline, then execute any explicit original-light handling/);
    assert.doesNotMatch(text, /keep the original white balance/);
    assert.doesNotMatch(text, /Keep original emission states as a baseline only when keep is selected or no original-light operation was requested/);
    assert.doesNotMatch(text, /Preserve the existing interior design style, material colors, time of day and weather/);
    assert.doesNotMatch(text, /apply a restrained source-consistent fallback/);
    assert.match(text, /REBUILT LIGHTING/);
    if (mode.key === "balanced") assert.match(text, /do not compromise back toward the old source lighting/);
  }
});

test("custom和三旧方案继续使用原光局部语义，不被v5模板重建分支覆盖", () => {
  assert.equal(relightRebuildsLighting(), false);
  for (const templateKey of ["custom", ...RELIGHT_LEGACY_TEMPLATES.map(value => value.key)]) {
    const text = buildRelightPrompt({ templateKey, lights: [light()] });
    assert.equal(relightRebuildsLighting({ templateKey }), false);
    assert.match(text, /Treat image 1 as the lighting baseline, then execute any explicit original-light handling/);
    assert.match(text, /keep the original white balance/);
    assert.match(text, /Keep original emission states as a baseline only when keep is selected or no original-light operation was requested/);
    assert.match(text, /matched to the original scene/);
    assert.doesNotMatch(text, /REBUILD ALL LIGHTING|REBUILT LIGHTING/);
  }
});

test("v5重建模板保留干净原图单输入，不制造标注图或删除场景参考", async () => {
  for (const template of RELIGHT_TEMPLATES.filter(value => value.key !== "custom")) {
    const input = await fixture({ templateKey: template.key, lights: [] });
    const prepared = await prepareRelightInput(await validateRelightInput(input));
    const original = await sharp(Buffer.from(input.referenceImages[0].dataUrl.split(",")[1], "base64")).raw().toBuffer();
    assert.equal(prepared.request.images.length, 1);
    assert.deepEqual(await sharp(prepared.sourceBytes).raw().toBuffer(), original);
    assert.equal(prepared.request.images[0].image_url, `data:image/png;base64,${prepared.sourceBytes.toString("base64")}`);
    assert.equal(prepared.guideBytes, null); assert.equal(prepared.guideImage, null);
    assert.equal(Object.hasOwn(prepared.request, "mask"), false);
    assert.match(prepared.request.prompt, /Use the clean original as scene reference while replacing its lighting/);
  }
});

test("v5重建照明服从显式局部编辑和历史保护，增强贡献匹配新方案且硬件例外受限", () => {
  const lights = normalizeRelightLights([light({ mode: "addFixture", fixture: "黑色射灯" }),
    light({ id: "dim", action: "darken", amount: 0.4 }), light({ id: "off", action: "turnOff" }), light({ id: "keep", action: "preserve" })]);
  for (const template of RELIGHT_TEMPLATES.filter(value => value.key !== "custom")) {
    const text = buildRelightPrompt({ templateKey: template.key, lights, blendMode: "subtle", prompt: "把整圈灯带都打开" });
    assert.match(text, /PRESERVE > TURN OFF > DARKEN > BRIGHTEN > LIGHTING TEMPLATE/);
    assert.match(text, /Explicit turn-off entries remain off even when the new template could use that fixture/);
    assert.match(text, /An explicit PRESERVE mark is the local exception to this reset/);
    assert.match(text, /matched to the new lighting setup/);
    assert.match(text, /approximately 40% as a relative visual intent/);
    assert.match(text, /Do not add visible physical lighting hardware/);
    assert.match(text, /except the specific luminaire requested by an explicit ADD FIXTURE AND LIGHT entry/);
    assert.match(text, /Apply it within the typed action priority/);
    assert.doesNotMatch(text, /Keep original emission states as a baseline only when keep is selected or no original-light operation was requested/);
  }
});


test("v6连续受光指令保留主次夜景，不把均匀度解释成全图等亮", () => {
  const templates = [...RELIGHT_TEMPLATES, ...RELIGHT_LEGACY_TEMPLATES];
  for (const { key: templateKey } of templates) {
    const text = buildRelightPrompt({ templateKey, lights: templateKey === "custom" ? [light()] : [] });
    assert.match(text, /PHOTOGRAPHIC LIGHTING QUALITY/);
    assert.match(text, /one coherent motivated key and broad soft supporting fill/);
    assert.match(text, /continuous exposure and physically plausible falloff within each intended lighting zone/);
    assert.match(text, /Even illumination does not mean equal brightness across the whole image/);
    assert.match(text, /intentional dark regions and nighttime ambience/);
    assert.match(text, /accidental bright\/dark blotches, abrupt illumination gaps, locally burned-white patches, circular light blobs/);
    assert.match(text, /Never counteract an explicit darken\/off\/protect edit/);
  }
});

test("v6五目标各有独立主辅光视觉比例，洗墙连续墙宽且纵向渐变无扇贝和底部热点", () => {
  const ratios = { naturalFill: "around 1.5:1", warmAmbient: "around 4:1", windowDaylight: "around 4:1", accentWash: "ratio of 3:1", softStudio: "around 2.5:1" };
  for (const [templateKey, ratio] of Object.entries(ratios)) {
    const text = buildRelightPrompt({ templateKey });
    assert.ok(text.includes(ratio));
    assert.match(text, /Template ratios describe a visual lighting hierarchy, not calibrated photometry/);
  }
  const wall = buildRelightPrompt({ templateKey: "accentWash" });
  assert.match(wall, /continuous extended hidden upper source/);
  assert.match(wall, /laterally continuous and even across the visible wall width/);
  assert.match(wall, /controlled smooth top-to-bottom gradient/);
  assert.match(wall, /Prevent scalloped patches, fan-shaped pools, abrupt exposure gaps, and bottom-edge or floor hotspots/);
  assert.match(buildRelightPrompt({ templateKey: "naturalFill" }), /bright, neutral high-key/);
  assert.match(buildRelightPrompt({ templateKey: "softStudio" }), /Maintain medium-key tonal depth rather than turning this into diffuse high-key illumination/);
  assert.match(buildRelightPrompt({ templateKey: "windowDaylight" }), /without erasing the long-shadow design/);
  assert.match(buildRelightPrompt({ templateKey: "warmAmbient" }), /intentionally darker night ambience/);
});

test("v6材质影调与摄影光学约束具体且保持原机位构图，不靠改镜头或变形造摄影感", () => {
  const text = buildRelightPrompt({ templateKey: "softStudio" });
  for (const phrase of ["MATERIAL AND TONAL RENDERING", "leather grain and creases", "stone mineral texture and polish/roughness", "textile weave and fibers", "metal directional roughness", "roughness-dependent highlight spread", "contact shadows", "smooth roll-off", "useful shadow detail", "natural midtones", "restrained local contrast", "sharpening halos", "grey HDR haze", "CAMERA AND OPTICAL CHARACTER", "user-specified Canon R1 camera profile"]) assert.ok(text.includes(phrase));
  assert.match(text, /preserving the source camera viewpoint, framing, perspective, object scale and spatial proportions/);
  assert.match(text, /Do not pull the camera back, widen the room, tilt verticals or distort architecture/);
  assert.doesNotMatch(text, /masterpiece|award-winning|8K master/i);
});

test("纯模板和带guide编辑共享同一摄影质量层，custom与旧scheme不因质量要求重布全屋", async () => {
  for (const templateKey of ["naturalFill", "warmAmbient", "windowDaylight", "accentWash", "softStudio"]) {
    const plain = await prepareRelightInput(await validateRelightInput(await fixture({ templateKey, lights: [] })));
    const guided = await prepareRelightInput(await validateRelightInput(await fixture({ templateKey, lights: [light()] })));
    const qualityText = relightPhotographicInstructions({ templateKey });
    assert.equal(plain.request.images.length, 1); assert.equal(guided.request.images.length, 2);
    assert.ok(plain.request.prompt.includes(qualityText)); assert.ok(guided.request.prompt.includes(qualityText));
    for (const request of [plain.request, guided.request]) {
      assert.equal(request.quality, "medium"); assert.equal(request.output_format, "png"); assert.equal(request.n, 1);
      assert.equal(request.size, "1536x1024");
    }
  }
  for (const templateKey of ["custom", ...RELIGHT_LEGACY_TEMPLATES.map(value => value.key)]) {
    const text = buildRelightPrompt({ templateKey, lights: [light()] });
    assert.match(text, /apply the following photographic finish within the explicit original-light handling and optional local edits/);
    assert.match(text, /Do not use quality refinement to reset the whole room, undo original-light keep\/dim\/off/);
    assert.match(text, /Preserve its daylight direction, white balance, exposure intent and protection boundaries/);
    assert.doesNotMatch(text, /REBUILD ALL LIGHTING|REBUILT LIGHTING/);
    assert.match(text, /keep the original white balance/);
  }
});


test("摄影增强保留可见小物件身份，不替换摆件或把光学现象实体化", () => {
  for (const { key: templateKey } of [...RELIGHT_TEMPLATES, ...RELIGHT_LEGACY_TEMPLATES]) {
    const text = buildRelightPrompt({ templateKey, lights: templateKey === "custom" ? [light()] : [] });
    assert.match(text, /retain every visible object and small prop's category, construction, identity and distinguishing features/);
    assert.match(text, /Do not replace existing objects or add decorative props merely for photographic styling/);
    assert.match(text, /do not turn steam, reflections or other optical phenomena into new physical objects/);
    assert.doesNotMatch(text, /teapot|vase|茶壶|花瓶/i);
  }
});

test("所有光照效果含用户摄影原文一次，HDR白平衡按方案锁定且仍只生成一张", async () => {
  const camera = "摄影参数：设备：佳能R1，光圈：f/8，ISO：100，焦段：24mm，拍摄技术:高动态范围（HDR）拍摄，包围曝光，白平衡锁定，暗部不失真，亮部不过曝";
  for (const { key: templateKey } of [...RELIGHT_TEMPLATES, ...RELIGHT_LEGACY_TEMPLATES]) {
    const lights = templateKey === "custom" ? [light()] : [];
    const prepared = await prepareRelightInput(await validateRelightInput(await fixture({ templateKey, lights })));
    const text = prepared.request.prompt;
    assert.equal(text.split(camera).length - 1, 1);
    assert.match(text, /requested 24mm lens character/);
    assert.match(text, /Return one final photograph, not separate bracketed exposures/);
    assert.doesNotMatch(text, /medium-format architectural photography|Do not change focal length/);
    if (RELIGHT_TEMPLATES.some(item => item.key === templateKey && item.key !== "custom")) {
      assert.match(text, /Choose a white balance appropriate to the selected new lighting scheme/);
      assert.match(text, /does not mean inheriting the original image's white balance/);
    } else assert.match(text, /Keep the established white balance of the custom or legacy lighting treatment/);
    assert.equal(prepared.request.n, 1);
    assert.equal(prepared.request.quality, "medium");
  }
});

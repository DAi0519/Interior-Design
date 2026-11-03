/**
 * [INPUT]: 依赖独立渲染台服务、内存飞书JSON资产、共享打光几何合同和sharp真实PNG替身
 * [OUTPUT]: 验证四渲染风格与保原材质、单次原生PNG、光源图序、权限复验、私有快照和回执隔离及失败不重试
 * [POS]: test 的独立AI渲染台应用服务合同，不读取旧打光资产，不调用网络或收费模型
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import test from "node:test";
import sharp from "sharp";
import { prepareAiRenderStudioInput, executeAiRenderStudio as executeService, readAiRenderStudioConfig as readConfig,
  buildAiRenderStudioPrompt, AI_RENDER_STUDIO_WORKFLOW_VERSION } from "../src/ai-render-studio-service.mjs";
import { AI_RENDER_STUDIO_PROMPT_CONFIG, AI_RENDER_STUDIO_PROMPT_CODE } from "../src/ai-render-studio-prompt.mjs";
import { validateRelightInput } from "../src/image-relight-service.mjs";
import { RELIGHT_ONEAPI_MODEL } from "../src/image-relight-oneapi.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const bundle = { schemaVersion: 1, renderBoundary: "STUDIO_RENDER_BODY_PRIVATE: keep architecture, material kinds, base colors and texture scale.",
  lightingBoundary: "STUDIO_LIGHTING_BODY_PRIVATE: follow a physically plausible typed lighting plan.",
  materialModes: { faithful: "STUDIO_FAITHFUL_BODY_PRIVATE: retain source materials and improve photographic realism." },
  renderStyles: { photoreal: "STUDIO_PHOTOREAL_BODY_PRIVATE: use a restrained architectural photographic rendering.",
    soft: "STUDIO_SOFT_BODY_PRIVATE: use gentle tonal transitions and soft surface response.",
    cinematic: "STUDIO_CINEMATIC_BODY_PRIVATE: use a composed cinematic photographic response.",
    film: "STUDIO_FILM_BODY_PRIVATE: use restrained analog-film tonal response." },
  output: "STUDIO_OUTPUT_BODY_PRIVATE: return one native PNG." };
const prompt = JSON.stringify(bundle);
const snapshot = { code: AI_RENDER_STUDIO_PROMPT_CODE, name: "AI渲染台 Prompt", version: 1, published: true,
  prompt, bundle, sha256: hash(prompt),
  source: `feishu:${AI_RENDER_STUDIO_PROMPT_CONFIG.tableId}:ai-render-studio@v1`, tableUrl: "https://example.invalid/studio" };
const publicAsset = { code: snapshot.code, name: snapshot.name, available: true, published: true,
  version: 1, defaultVersion: 1, sha256: snapshot.sha256, source: snapshot.source, tableUrl: snapshot.tableUrl,
  versions: [{ code: snapshot.code, name: snapshot.name, version: 1, published: true }] };
const catalog = async () => [{ id: RELIGHT_ONEAPI_MODEL.id }];
const verifySyncContract = async () => ({});
const executeAiRenderStudio = (prepared, options) => executeService(prepared, { verifySyncContract, ...options });
const readAiRenderStudioConfig = (options) => readConfig({ verifySyncContract,
  loadLightingAssets: async () => ({ presets: [] }), ...options });
const picture = (width = 96, height = 64, background = "#a9a092", format = "png") =>
  sharp({ create: { width, height, channels: 3, background } }).toFormat(format).toBuffer();
const descriptor = (bytes, type = "image/png") => ({ name: "source-room.png", type,
  size: bytes.length, dataUrl: `data:${type};base64,${bytes.toString("base64")}` });
const fixture = async (overrides = {}) => ({ referenceImages: [descriptor(await picture())],
  prompt: "USER_REQUIREMENT_PRIVATE: 保留原材质并改善摄影真实感。", ...overrides });
const prepare = (input, options = {}) => prepareAiRenderStudioInput(input, {
  getPrompt: async () => structuredClone(snapshot), getOneApiModels: catalog, verifySyncContract, ...options,
});
const light = (overrides = {}) => ({ id: "new-light", type: "point", action: "brighten",
  points: [{ x: 0.2, y: 0.2 }], target: { x: 0.7, y: 0.7 }, mode: "lightOnly",
  kelvin: 4200, intensity: 1, softness: "soft", fixture: "", ...overrides });

function clientFixture({ reject = false, widthDelta = 0, outputFormat = "png" } = {}) {
  const requests = [], outputs = [];
  return { requests, outputs, async editImageAsync(request, options) {
    requests.push(request);
    options.onSubmitted?.({ id: "resp_studio_fixture", status: "in_progress" });
    if (reject) throw Object.assign(new Error("PRIVATE_UPSTREAM_REQUEST_BODY " + request.prompt), { statusCode: 502 });
    const [width, height] = request.size.split("x").map(Number);
    const bytes = await picture(width + widthDelta, height, "#d0c5b2", outputFormat);
    outputs.push(bytes);
    return { images: [{ url: `data:image/${outputFormat};base64,${bytes.toString("base64")}` }],
      created: 1, transport: "responses-background", requestId: "request-studio", usageCost: { amount: 0.03, currency: "USD" } };
  } };
}

function assertPublicResult(result) {
  const forbidden = new Set(["prompt", "sourcePrompt", "bundle", "snapshot", "relightPromptSnapshot", "archiveGuideImage"]);
  function visit(value) {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      assert.equal(forbidden.has(key), false, `公开结果不能携带${key}`);
      visit(child);
    }
  }
  visit(result);
  assert.equal(JSON.stringify(result).includes("BODY_PRIVATE"), false);
  assert.equal(JSON.stringify(result).includes("USER_REQUIREMENT_PRIVATE"), false);
}

test("配置提供并列的四渲染风格和光照选项，材质固定保原且不暴露Prompt正文", async () => {
  const config = await readAiRenderStudioConfig({ getOneApiModels: catalog, readPromptConfig: async () => publicAsset });
  assert.equal(config.available, true);
  assert.equal(config.feature, "ai-render-studio");
  assert.equal(config.syncMode, "lark");
  assert.equal(config.defaultTemplateKey, "custom");
  assert.equal(config.defaultMaterialMode, "faithful");
  assert.deepEqual(config.materialModes.map(({ key }) => key), ["faithful"]);
  assert.equal(config.defaultRenderStyle, "photoreal");
  assert.deepEqual(config.renderStyles.map(({ key }) => key), ["photoreal", "soft", "cinematic", "film"]);
  assert.equal(config.maxCount, 1);
  assert.equal(config.prompt.sha256, snapshot.sha256);
  assert.equal(Object.hasOwn(config, "legacyTemplates"), false);
  assert.deepEqual(config.templates.map((entry) => entry.key), ["custom"]);
  assert.equal(JSON.stringify(config).includes("BODY_PRIVATE"), false);
  for (const options of [{ getOneApiModels: async () => [] }, { readPromptConfig: async () => ({ available: false, reason: "未上架" }) }]) {
    const unavailable = await readAiRenderStudioConfig({ getOneApiModels: catalog, readPromptConfig: async () => publicAsset, ...options });
    assert.equal(unavailable.available, false);
  }
});

test("默认保原材质无需光源标记，单原图只提交一次并原字节交付PNG", async () => {
  const input = await fixture(), client = clientFixture(), receipts = [], progress = [];
  let accessReads = 0;
  const getOneApiModels = async () => { accessReads += 1; return catalog(); };
  const prepared = await prepare(input, { getOneApiModels });
  assert.equal(prepared.materialMode, "faithful");
  assert.equal(prepared.renderStyle, "photoreal");
  assert.deepEqual(prepared.validated.lights, []);
  assert.deepEqual(prepared.validated.originalLights, { action: "keep" });
  const result = await executeAiRenderStudio(prepared, { imageClient: client, getOneApiModels,
    onProgress: (value) => progress.push(value), onReceipt: (value) => receipts.push(value) });
  assert.equal(accessReads, 2);
  assert.equal(client.requests.length, 1);
  const submitted = client.requests[0];
  assert.equal(submitted.n, 1);
  assert.equal(submitted.output_format, "png");
  assert.equal(submitted.images.length, 1);
  assert.ok(submitted.prompt.startsWith(input.prompt + "\n\n"));
  assert.equal(submitted.prompt.split(input.prompt).length - 1, 1);
  for (const content of [bundle.renderBoundary, bundle.lightingBoundary, bundle.materialModes.faithful, bundle.output]) {
    assert.equal(submitted.prompt.split(content).length - 1, 1);
  }
  assert.equal(submitted.prompt.split(bundle.renderStyles.photoreal).length - 1, 1);
  for (const key of ["soft", "cinematic", "film"]) assert.equal(submitted.prompt.includes(bundle.renderStyles[key]), false);
  assert.doesNotMatch(submitted.prompt, /image-relight@|lighting-reference-transfer|lighting-prompt-reference|refined-lighting-base/);
  assert.deepEqual(Buffer.from(result.images[0].url.split(",")[1], "base64"), client.outputs[0]);
  assert.equal(result.upstream.metadata.outputSha256, hash(client.outputs[0]));
  assert.equal(result.upstream.metadata.outputResized, false);
  assert.equal(result.upstream.metadata.postUpscaled, false);
  assert.equal(result.upstream.metadata.protectedAreaComposited, false);
  assert.equal(result.upstream.metadata.referenceImageCount, 1);
  assert.equal(result.upstream.metadata.guideSha256, null);
  assert.equal(result.workflow.key, "ai-render-studio");
  assert.equal(result.request.renderStyle, "photoreal");
  assert.equal(result.upstream.metadata.renderStyle, "photoreal");
  assert.equal(result.workflow.version, AI_RENDER_STUDIO_WORKFLOW_VERSION);
  assert.equal(result.sync.status, "skipped");
  assert.ok(progress.some(({ upstreamResponseId }) => upstreamResponseId === "resp_studio_fixture"));
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].prompt, submitted.prompt);
  assert.equal(receipts[0].sourcePrompt, input.prompt);
  assert.equal(receipts[0].renderStyle, "photoreal");
  assert.equal(receipts[0].promptAsset.sha256, snapshot.sha256);
  assert.equal(receipts[0].promptAsset.source, snapshot.source);
  assert.equal(receipts[0].outputSha256, hash(client.outputs[0]));
  assert.ok(Object.isFrozen(receipts[0]));
  assertPublicResult(result);
});

for (const renderStyle of ["photoreal", "soft", "cinematic", "film"]) {
  test(`风格 ${renderStyle} 只编译所选正文一次，保原材质与光照方案仍在同次单图请求执行`, async () => {
    const input = await fixture({ renderStyle, templateKey: "custom", originalLights: { action: "keep" } });
    const prepared = await prepare(input), client = clientFixture(), receipts = [];
    const result = await executeAiRenderStudio(prepared, { imageClient: client, getOneApiModels: catalog,
      onReceipt: (value) => receipts.push(value) });
    assert.equal(client.requests.length, 1);
    assert.equal(client.requests[0].images.length, 1);
    const submittedPrompt = client.requests[0].prompt;
    assert.ok(submittedPrompt.startsWith(input.prompt + "\n\n"));
    for (const [key, text] of Object.entries(bundle.renderStyles)) {
      assert.equal(submittedPrompt.split(text).length - 1, key === renderStyle ? 1 : 0);
    }
    assert.equal(submittedPrompt.split(bundle.materialModes.faithful).length - 1, 1);
    assert.match(submittedPrompt, /"templateKey":"custom"/);
    assert.match(submittedPrompt, /"originalLights":\{"action":"keep"\}/);
    assert.match(submittedPrompt, /材质真实感增强不自动重建布光/);
    assert.equal(receipts[0].renderStyle, renderStyle);
    assert.equal(result.request.renderStyle, renderStyle);
    assert.equal(result.upstream.metadata.renderStyle, renderStyle);
    assert.equal(result.upstream.metadata.promptSha256, snapshot.sha256);
    assertPublicResult(result);
  });
}

test("有标注时按原图和guide顺序提交两图，typed新增与关灯各自保持几何及SHA", async () => {
  const source = await picture(), input = await fixture({ referenceImages: [descriptor(source)],
    lights: [light(), light({ id: "off-light", action: "turnOff", points: [{ x: 0.8, y: 0.2 }] })] });
  const prepared = await prepare(input), client = clientFixture(), receipts = [];
  const result = await executeAiRenderStudio(prepared, { imageClient: client, getOneApiModels: catalog,
    onReceipt: (value) => receipts.push(value) });
  assert.equal(client.requests.length, 1);
  const submitted = client.requests[0], metadata = result.upstream.metadata;
  assert.equal(submitted.images.length, 2);
  const submittedSource = Buffer.from(submitted.images[0].image_url.split(",")[1], "base64");
  const submittedGuide = Buffer.from(submitted.images[1].image_url.split(",")[1], "base64");
  const sourcePixels = await sharp(source).raw().toBuffer();
  assert.deepEqual(await sharp(submittedSource).raw().toBuffer(), sourcePixels);
  assert.notEqual(hash(submittedSource), hash(submittedGuide));
  const guideMetadata = await sharp(submittedGuide).metadata();
  assert.equal(guideMetadata.width, 96);
  assert.equal(guideMetadata.height, 64);
  assert.equal(metadata.sourceSha256, hash(source));
  assert.equal(metadata.submittedSourceSha256, hash(submittedSource));
  assert.equal(metadata.guideSha256, hash(submittedGuide));
  assert.equal(receipts[0].guideSha256, hash(submittedGuide));
  assert.match(submitted.prompt, /image 1 is the clean source scene/);
  assert.match(submitted.prompt, /Image 2 repeats that same scene/);
  assert.match(submitted.prompt, /ADD NEW LIGHT/);
  assert.match(submitted.prompt, /TURN OFF EXISTING LIGHT/);
  assert.match(submitted.prompt, /4200 K/);
  assert.equal(metadata.lights.length, 2);
  assert.deepEqual(metadata.lights[0].points, input.lights[0].points);
  assertPublicResult(result);
});

test("仅材质放行只来自可信服务选项，旧打光默认仍拒绝custom保持空灯", async () => {
  const input = await fixture({ templateKey: "custom", originalLights: { action: "keep" }, lights: [] });
  await assert.rejects(validateRelightInput(input), { statusCode: 400 });
  assert.deepEqual((await validateRelightInput(input, { allowMaterialRender: true })).lights, []);
  await assert.rejects(validateRelightInput({ ...input, allowMaterialRender: true }), { statusCode: 400 });
  await assert.rejects(prepare({ ...input, allowMaterialRender: true }), { statusCode: 400 });
});

test("九卡三段词在同次GPT逐卡编译且仅出现一次，卡片不增加参考图或覆盖typed控光", async () => {
  const presets = Array.from({ length: 9 }, (_, index) => ({ id: `recStudioCard${index + 1}`, code: `studio-card-${index + 1}`,
    name: `库卡${index + 1}`, version: 5, sha256: hash(`real-card-${index}`), order: index,
    prompt: `PRESET_THEME_${index}\n\nPRESET_LIGHT_ARRANGEMENT_${index}\n\nPRESET_TEMPERATURE_EXPOSURE_${index}` }));
  for (const preset of presets) {
    let reads = 0;
    const loadLightingAssets = async (options) => { reads += 1; assert.equal(options.forceRefresh, true); return { presets }; };
    const input = await fixture({ lightingPreset: { id: preset.id, version: preset.version, sha256: preset.sha256 },
      originalLights: { action: "turnOff" }, prompt: "纯室内，背光场景" });
    const prepared = await prepare(input, { loadLightingAssets }), client = clientFixture(), receipts = [];
    assert.equal(prepared.validated.templateKey, "custom");
    const result = await executeAiRenderStudio(prepared, { imageClient: client, getOneApiModels: catalog, loadLightingAssets,
      onReceipt: (receipt) => receipts.push(receipt) });
    assert.equal(reads, 2);
    assert.equal(client.requests.length, 1);
    assert.equal(client.requests[0].images.length, 1);
    const prompt = client.requests[0].prompt;
    assert.ok(prompt.startsWith("纯室内，背光场景\n\n"));
    assert.equal(prompt.split(preset.prompt).length - 1, 1);
    assert.ok(prompt.indexOf("TURN OFF ALL ORIGINAL LIGHTS") < prompt.indexOf(preset.prompt));
    assert.match(prompt, /confirmed source-scene facts.*explicit user requirements.*typed original-light.*atmosphere card defaults/);
    assert.equal(result.upstream.metadata.lightingPreset.id, preset.id);
    assert.equal(Object.hasOwn(result.upstream.metadata.lightingPreset, "prompt"), false);
    assert.equal(receipts[0].lightingPreset.prompt, preset.prompt);
    assert.equal(receipts[0].lightingPlan.lightingPreset.prompt, preset.prompt);
    assertPublicResult(result);
    assert.doesNotMatch(JSON.stringify(result), /PRESET_THEME_/);
  }
});

test("排队后卡片下架或同身份换正文在执行前409阻断且零模型调用", async () => {
  const card = { id: "recStudioFrozen", code: "frozen-lighting", name: "光影", version: 5, sha256: hash("identity"), prompt: "FROZEN_LIGHTING" };
  const input = await fixture({ lightingPreset: { id: card.id, version: card.version, sha256: card.sha256 } });
  const prepared = await prepare(input, { loadLightingAssets: async () => ({ presets: [card] }) });
  const client = clientFixture();
  for (const presets of [[], [{ ...card, prompt: "CHANGED_SAME_IDENTITY" }], [{ ...card, sha256: hash("changed") }]]) {
    await assert.rejects(executeAiRenderStudio(prepared, { imageClient: client, getOneApiModels: catalog,
      loadLightingAssets: async () => ({ presets }) }), { statusCode: 409 });
  }
  assert.equal(client.requests.length, 0);
});

test("服务端冻结输入与独立资产，准备后外部变更不能改写实际提交正文或方案", async () => {
  const originalAsset = structuredClone(snapshot), input = await fixture({ lights: [light()] });
  const prepared = await prepare(input, { getPrompt: async () => originalAsset });
  const expectedPrompt = buildAiRenderStudioPrompt(prepared.validated);
  originalAsset.prompt = "CHANGED_PRIVATE";
  originalAsset.bundle.renderBoundary = "CHANGED_PRIVATE";
  originalAsset.bundle.renderStyles.photoreal = "CHANGED_PRIVATE";
  input.prompt = "CHANGED_PRIVATE";
  input.lights[0].kelvin = 9000;
  const client = clientFixture(), result = await executeAiRenderStudio(prepared, { imageClient: client, getOneApiModels: catalog });
  assert.equal(client.requests[0].prompt, expectedPrompt);
  assert.equal(result.upstream.metadata.promptSha256, snapshot.sha256);
  assert.equal(result.upstream.metadata.lights[0].kelvin, 4200);
  assert.ok(Object.isFrozen(prepared.validated.lights[0]));
  assert.ok(Object.isFrozen(prepared.snapshot.bundle));
  await assert.rejects(executeAiRenderStudio(structuredClone(prepared), { imageClient: client, getOneApiModels: catalog }), { statusCode: 409 });
  assert.equal(client.requests.length, 1);
});

test("当前Key权限在准备与实际执行前复验，失去权限时零模型调用", async () => {
  const client = clientFixture(), input = await fixture();
  await assert.rejects(prepare(input, { getOneApiModels: async () => [] }), { statusCode: 409 });
  const prepared = await prepare(input);
  await assert.rejects(executeAiRenderStudio(prepared, { imageClient: client, getOneApiModels: async () => [] }), { statusCode: 409 });
  await assert.rejects(executeAiRenderStudio(prepared, { imageClient: client,
    getOneApiModels: async () => { throw new Error("PRIVATE_KEY_DETAILS"); } }),
  (error) => error.statusCode === 409 && !error.message.includes("PRIVATE_KEY_DETAILS"));
  assert.equal(client.requests.length, 0);
});

test("refined/tactile与非法选项或客户端正文在资产读取和模型调用前拒绝", async () => {
  const input = await fixture(), client = clientFixture();
  let assetReads = 0;
  const getPrompt = async () => { assetReads += 1; return structuredClone(snapshot); };
  for (const patch of [
    { materialMode: "refined" }, { materialMode: "tactile" }, { materialMode: 1 }, { materialMode: null },
    { renderStyle: "warm" }, { renderStyle: "naturalFill" }, { renderStyle: null }, { renderStyle: 1 }, { renderStyle: "" },
    { relightPromptSnapshot: snapshot }, { studioPromptSnapshot: snapshot }, { bundle }, { snapshot },
    { allowMaterialRender: true }, { materialStrength: 0.7 }, { maskImage: {} },
    { modelKey: "seedream5Pro" }, { provider: "comfyui" }, { quality: "unsupported" },
    { outputResolution: "8K" }, { prompt: [] }, { prompt: "x".repeat(2001) },
    { templateKey: "mainLight" }, { templateKey: "naturalFill" }, { templateKey: "warmAmbient" }, { templateKey: "windowDaylight" },
    { templateKey: "accentWash" }, { templateKey: "softStudio" }, { templateKey: null }, { studioPromptVersion: 0 }, { studioPromptSha256: "bad" },
    { lights: [light({ points: [{ x: -1, y: 0.2 }] })] },
  ]) await assert.rejects(prepare({ ...input, ...patch }, { getPrompt }), { statusCode: 400 });
  assert.equal(assetReads, 0);
  assert.equal(client.requests.length, 0);
});

test("源图假格式、坏字节、超过单边或多图在资产和模型调用前阻断", async () => {
  const input = await fixture(), client = clientFixture();
  let reads = 0;
  const getPrompt = async () => { reads += 1; return structuredClone(snapshot); };
  const source = await picture(), wide = await picture(4097, 1);
  for (const referenceImages of [[], [input.referenceImages[0], input.referenceImages[0]],
    [descriptor(source, "image/jpeg")], [descriptor(Buffer.from("invalid image"))], [descriptor(wide)]]) {
    await assert.rejects(prepare({ ...input, referenceImages }, { getPrompt }), { statusCode: 400 });
  }
  assert.equal(reads, 0);
  assert.equal(client.requests.length, 0);
});

test("渲染台真实8MiB图片准入不放宽旧打光6MiB或4096px解码边界", async () => {
  const bytes = await sharp(randomBytes(1500 * 1500 * 3), { raw: { width: 1500, height: 1500, channels: 3 } })
    .png({ compressionLevel: 0 }).toBuffer();
  assert.ok(bytes.length > 6 * 1024 * 1024 && bytes.length < 8 * 1024 * 1024);
  const input = await fixture({ referenceImages: [descriptor(bytes)] });
  const prepared = await prepare(input);
  assert.equal(prepared.validated.source.width, 1500);
  assert.equal(prepared.validated.source.size, bytes.length);
  const config = await readAiRenderStudioConfig({ getOneApiModels: catalog, readPromptConfig: async () => publicAsset });
  assert.equal(config.imagePolicy.maxBytesPerImage, 8 * 1024 * 1024);
  assert.equal(config.imagePolicy.maxTotalBytes, 8 * 1024 * 1024);
  await assert.rejects(validateRelightInput({ ...input, templateKey: "naturalFill", originalLights: null, lights: [] }), { statusCode: 400 });
  const oversized = Buffer.concat([bytes, Buffer.alloc(8 * 1024 * 1024 - bytes.length + 1)]);
  await assert.rejects(prepare({ ...input, referenceImages: [descriptor(oversized)] }), { statusCode: 400 });
});

test("资产下架、错误来源、正文和bundle漂移或冻结SHA失配时零模型调用", async () => {
  const input = await fixture(), client = clientFixture();
  for (const mutate of [
    (value) => { value.published = false; },
    (value) => { value.code = "image-relight"; },
    (value) => { value.source = "feishu:wrong-table:ai-render-studio@v1"; },
    (value) => { value.sha256 = "0".repeat(64); },
    (value) => { value.bundle.renderBoundary = "CHANGED_PRIVATE"; },
    (value) => { value.prompt = "invalid-json-private"; },
  ]) {
    const changed = structuredClone(snapshot); mutate(changed);
    await assert.rejects(prepare(input, { getPrompt: async () => changed }), { statusCode: 409 });
  }
  await assert.rejects(prepare({ ...input, studioPromptVersion: 2 }), { statusCode: 409 });
  await assert.rejects(prepare({ ...input, studioPromptSha256: "0".repeat(64) }), { statusCode: 409 });
  assert.equal(client.requests.length, 0);
});

test("上游失败只调用一次且错误脱敏，不泄露实际Prompt或触发私有回执", async () => {
  const client = clientFixture({ reject: true }), prepared = await prepare(await fixture());
  let receipts = 0;
  await assert.rejects(executeAiRenderStudio(prepared, { imageClient: client, getOneApiModels: catalog,
    onReceipt() { receipts += 1; } }),
  (error) => error.statusCode === 502 && !/PRIVATE|STUDIO_|USER_REQUIREMENT/.test(error.message));
  assert.equal(client.requests.length, 1);
  assert.equal(receipts, 0);
});

test("错误输出尺寸或非PNG不自动再次收费，也不进入成功回执", async () => {
  for (const options of [{ widthDelta: 16 }, { outputFormat: "jpeg" }]) {
    const client = clientFixture(options), prepared = await prepare(await fixture());
    let receipts = 0;
    await assert.rejects(executeAiRenderStudio(prepared, { imageClient: client, getOneApiModels: catalog,
      onReceipt() { receipts += 1; } }), { statusCode: 502 });
    assert.equal(client.requests.length, 1);
    assert.equal(receipts, 0);
  }
});

test("私有回执保存失败仍交付已经完成的原生结果，不重复模型调用", async () => {
  const client = clientFixture(), prepared = await prepare(await fixture());
  const result = await executeAiRenderStudio(prepared, { imageClient: client, getOneApiModels: catalog,
    onReceipt() { throw new Error("PRIVATE_RECEIPT_STORAGE"); } });
  assert.equal(client.requests.length, 1);
  assert.deepEqual(Buffer.from(result.images[0].url.split(",")[1], "base64"), client.outputs[0]);
  assertPublicResult(result);
});

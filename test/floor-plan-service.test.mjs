/**
 * [INPUT]: 依赖平面布局图像服务、真实sharp图片与内存模型/资产/OneAPI替身
 * [OUTPUT]: 含GPT2.6 Sunburst/Flare独立模型身份； 验证布局四模型的真实路由/权限/PNG交付与原生格式，保留后续三动作、原文前置、资产漂移和不自动重跑
 * [POS]: test 的最简平面布局服务合同，不访问真实模型或飞书
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import test from "node:test";
import sharp from "sharp";
import { prepareFloorPlanInput, executeFloorPlan, readFloorPlanConfig, normalizeFloorPlanReferenceImage } from "../src/floor-plan-service.mjs";
import { MODEL_CONFIGS } from "../src/model-config.mjs";
const hash = value => createHash("sha256").update(value).digest("hex");
const body = JSON.stringify({ version: 2, layout: "PRIVATE_LAYOUT_RULE", adjust: "PRIVATE_ADJUST_RULE", interior: "PRIVATE_INTERIOR_RULE" });
const asset = { code: "floor-plan-layout", name: "平面布局 Prompt", prompt: body, sha256: hash(body), version: 2, published: true, source: "feishu:floor-plan@v2" };
const getPrompt = async () => structuredClone(asset);
const getModels = async () => [{ id: "gpt-image-2.5-sunburst" }, { id: "irrelevant-model" }];
const picture = (width = 96, height = 64, format = "png") => sharp({ create: { width, height, channels: 3, background: "white" } }).toFormat(format).toBuffer();
const descriptor = bytes => ({ name: "户型.png", size: bytes.length, type: "image/png", dataUrl: `data:image/png;base64,${bytes.toString("base64")}` });
const input = async (override = {}) => ({ action: "layout", referenceImage: descriptor(await picture()), userRequirements: "保留窗户，增加收纳", promptVersion: 2, promptSha256: asset.sha256, ...override });
const prepare = (source, options = {}) => prepareFloorPlanInput(source, { getModels, getPrompt, ...options });
function imageClient({ invalid = false, reject = false, wrongSize = false } = {}) {
  const calls = [];
  const methods = [];
  const run = async (request, options = {}) => {
    calls.push(request);
    options.onSubmitted?.({ id: "submitted-image-id" });
    if (reject) throw new Error("PRIVATE_LAYOUT_RULE sk-private-key-1234");
    const [width, height] = request.size.split("x").map(Number);
    const bytes = await picture(wrongSize ? width - 1 : width, height, invalid ? "jpeg" : "png");
    return { requestId: "image-response-id", usageCost: { costUsd: 0.01, currency: "USD", privateField: "secret" }, images: [{ url: `data:image/${invalid ? "jpeg" : "png"};base64,${bytes.toString("base64")}` }] };
  };
  return { calls, methods,
    editImageAsync: (...args) => { methods.push("editImageAsync"); return run(...args); },
    editImage: (...args) => { methods.push("editImage"); return run(...args); },
    generateImage: (...args) => { methods.push("generateImage"); return run(...args); } };
}

test("配置仅返回可用图像模型和JSON资产身份，不暴露正文", async () => {
  const config = await readFloorPlanConfig({ getModels, readPromptConfig: async () => ({ ...asset, available: true }) });
  assert.equal(config.available, true);
  assert.equal(config.defaultModel, "gptImage25Sunburst");
  assert.deepEqual(config.models.map(model => model.key), ["gptImage25Sunburst"]);
  assert.equal(config.workflowVersion, "2026-11-04.floor-plan.3");
  assert.equal(config.defaultLayoutModel, "gptImage25Sunburst");
  assert.equal(config.continuationAvailable, true);
  assert.deepEqual(config.layoutModels.map(({ key, available }) => ({ key, available })), [
    { key: "gptImage25Sunburst", available: true }, { key: "gptImage26Sunburst", available: false },
    { key: "gptImage26Flare", available: false }, { key: "banana21", available: false },
    { key: "seedream5", available: false }, { key: "seedream5Pro", available: false }]);
  assert.deepEqual(config.layoutModels.find(model => model.key === "seedream5").defaults, { resolution: "2K", quality: null, outputFormat: "png" });
  assert.equal(config.output.exactCameraGeometry, false);
  assert.doesNotMatch(JSON.stringify(config), /PRIVATE_LAYOUT_RULE|PRIVATE_ADJUST_RULE|PRIVATE_INTERIOR_RULE/);
  const denied = await readFloorPlanConfig({ getModels: async () => [], readPromptConfig: async () => ({ ...asset, available: true }) });
  assert.equal(denied.available, false);
  const missing = await readFloorPlanConfig({ getModels, readPromptConfig: async () => { throw new Error("secret"); } });
  assert.equal(missing.available, false);
  assert.doesNotMatch(JSON.stringify(missing), /secret/);
  const bananaOnly = await readFloorPlanConfig({ getModels: async () => [{ id: MODEL_CONFIGS.banana21.id }], readPromptConfig: async () => ({ ...asset, available: true }) });
  assert.equal(bananaOnly.available, true);
  assert.equal(bananaOnly.defaultLayoutModel, "banana21");
  assert.equal(bananaOnly.continuationAvailable, false);
  assert.deepEqual(bananaOnly.models, []);
  assert.match(bananaOnly.continuationReason, /Sunburst/);
});

test("真实解码拒绝伪图、过大图、错误MIME，EXIF后尺寸真实读取", async () => {
  await assert.rejects(normalizeFloorPlanReferenceImage(descriptor(Buffer.from("not-an-image"))));
  await assert.rejects(normalizeFloorPlanReferenceImage(descriptor(await picture(4097, 2))));
  await assert.rejects(normalizeFloorPlanReferenceImage({ ...descriptor(await picture()), type: "image/gif" }));
  const source = await normalizeFloorPlanReferenceImage(descriptor(await picture()));
  assert.equal(source.source.width, 96);
  assert.equal(source.source.height, 64);
  assert.match(source.imageUrl, /^data:image\/png;base64,/);
});

test("布局、文字修改、室内三动作保持用户原文首段并返回原生PNG实际回执", async () => {
  for (const action of ["layout", "adjust", "interior"]) {
    const source = await prepare(await input({ action, userRequirements: "  用户原文\n第二行  " }));
    const client = imageClient();
    const result = await executeFloorPlan(source, { client, getModels, getPrompt });
    assert.equal(client.calls.length, 1);
    assert.ok(client.calls[0].prompt.startsWith("  用户原文\n第二行  \n\n"));
    assert.ok(client.calls[0].prompt.endsWith(JSON.parse(body)[action]));
    assert.equal(client.calls[0].quality, "medium");
    assert.equal(client.calls[0].n, 1);
    assert.equal(result.action, action);
    assert.equal(result.image.type, "image/png");
    assert.equal(result.actual.outputResized, false);
    assert.equal(`${result.image.width}x${result.image.height}`, client.calls[0].size);
    const bytes = Buffer.from(result.image.url.split(",")[1], "base64");
    assert.equal(result.image.sha256, hash(bytes));
    assert.deepEqual(result.usageCost, { costUsd: 0.01, currency: "USD" });
    assert.equal(result.requestId, "image-response-id");
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE_LAYOUT_RULE|PRIVATE_ADJUST_RULE|PRIVATE_INTERIOR_RULE|privateField/);
  }
});

test("空要求不伪造用户段，camera只复用已存在镜头语义且明确非精确几何", async () => {
  const plain = await prepare(await input({ userRequirements: "" }));
  const client = imageClient();
  await executeFloorPlan(plain, { client, getModels, getPrompt });
  assert.equal(client.calls[0].prompt, "PRIVATE_LAYOUT_RULE");
  const camera = await prepare(await input({ action: "camera", sourceAction: "interior", userRequirements: "", cameraPose: { azimuth: 90, elevation: 0, distance: 50 } }));
  const result = await executeFloorPlan(camera, { client, getModels, getPrompt });
  assert.match(client.calls[1].prompt, /Move the camera 90 degrees/);
  assert.equal(result.actual.exactCameraGeometry, false);
  assert.deepEqual(result.actual.cameraPose, { azimuth: 90, elevation: 0, distance: 50 });
  assert.equal(result.actual.quality, "medium");
});

test("动作、来源、机位、未知字段和修改文本在付费前严格校验", async () => {
  for (const override of [{ action: "unknown" }, { action: "adjust", userRequirements: " " }, { agentModel: "gemini3pro" }, { modelKey: "aiTextureEnhancement" },
    { modelKey: null }, { action: "adjust", modelKey: "banana21" }, { action: "interior", modelKey: "seedream5" },
    { userRequirements: "x".repeat(4001) }, { promptVersion: 0 }, { promptSha256: "bad" }, { cameraPose: { azimuth: 0 } },
    { action: "camera", sourceAction: "layout", userRequirements: "", cameraPose: { azimuth: 0, elevation: 0, distance: 50 } },
    { action: "camera", sourceAction: "interior", userRequirements: "改变布局", cameraPose: { azimuth: 0, elevation: 0, distance: 50 } },
    { action: "camera", sourceAction: "interior", userRequirements: "", cameraPose: { azimuth: 0, elevation: 0, distance: 51 } },
    { action: "camera", sourceAction: "interior", userRequirements: "", cameraPose: { azimuth: 0, elevation: 0, distance: 50, extra: true } }]) {
    await assert.rejects(prepare(await input(override)));
  }
});

test("布局按所选模型真实执行，默认参数来自共享目录，后续动作仍固定Sunburst", async () => {
  const allModels = async () => ["gptImage25Sunburst", "banana21", "seedream5", "seedream5Pro"].map(key => ({ id: MODEL_CONFIGS[key].id }));
  for (const key of ["gptImage25Sunburst", "banana21", "seedream5", "seedream5Pro"]) {
    const source = await prepare(await input({ modelKey: key }), { getModels: allModels });
    const client = imageClient();
    const result = await executeFloorPlan(source, { client, getModels: allModels, getPrompt });
    assert.equal(client.calls.length, 1);
    assert.deepEqual(client.methods, [key === "gptImage25Sunburst" ? "editImageAsync" : "generateImage"]);
    assert.equal(client.calls[0].model, MODEL_CONFIGS[key].id);
    assert.equal(result.model.key, key);
    assert.equal(result.model.id, MODEL_CONFIGS[key].id);
    assert.equal(result.actual.outputResolution, key === "seedream5" ? "2K" : "1K");
    assert.equal(client.calls[0].quality, key === "gptImage25Sunburst" ? "medium" : undefined);
    assert.equal(result.actual.nativeFormat, "png");
    assert.equal(result.actual.outputConverted, false);
    assert.equal(result.actual.sizeMatched, true);
    assert.equal(result.actual.outputResized, false);
    assert.equal(result.actual.quality, key === "gptImage25Sunburst" ? "medium" : null);
  }
});

test("所选布局模型准备与执行均验权，失权或缺方法不改用其他模型", async () => {
  const bananaModels = async () => [{ id: MODEL_CONFIGS.banana21.id }];
  await assert.rejects(prepare(await input({ modelKey: "banana21" })), { statusCode: 409 });
  const source = await prepare(await input({ modelKey: "banana21" }), { getModels: bananaModels });
  const client = imageClient();
  await assert.rejects(executeFloorPlan(source, { client, getModels, getPrompt }), { statusCode: 409 });
  assert.equal(client.calls.length, 0);
  await assert.rejects(executeFloorPlan(source, { client: { editImageAsync: client.editImageAsync }, getModels: bananaModels, getPrompt }), { statusCode: 409 });
  assert.equal(client.calls.length, 0);
});

test("非GPT布局如实记录原生JPEG及偏离尺寸，转换PNG交付但不改像素尺寸", async () => {
  const bananaModels = async () => [{ id: MODEL_CONFIGS.banana21.id }];
  const source = await prepare(await input({ modelKey: "banana21" }), { getModels: bananaModels });
  const client = imageClient({ invalid: true, wrongSize: true });
  const result = await executeFloorPlan(source, { client, getModels: bananaModels, getPrompt });
  const [requestedWidth, requestedHeight] = client.calls[0].size.split("x").map(Number);
  const delivered = await sharp(Buffer.from(result.image.url.split(",")[1], "base64")).metadata();
  assert.equal(delivered.format, "png");
  assert.equal(delivered.width, requestedWidth - 1);
  assert.equal(delivered.height, requestedHeight);
  assert.equal(result.actual.nativeFormat, "jpeg");
  assert.equal(result.actual.outputConverted, true);
  assert.equal(result.actual.sizeMatched, false);
  assert.equal(result.actual.outputResized, false);
  assert.equal(result.image.width, result.actual.nativeOutputWidth);
  assert.notEqual(result.image.sha256, result.actual.nativeSha256);
  assert.equal(client.calls.length, 1);
});

test("通用模型复用请求压缩，送模SHA属于实际压缩字节而非原始PNG", async () => {
  const bytes = await sharp(randomBytes(1500 * 1200 * 3), { raw: { width: 1500, height: 1200, channels: 3 } }).png().toBuffer();
  const bananaModels = async () => [{ id: MODEL_CONFIGS.banana21.id }];
  const source = await prepare(await input({ modelKey: "banana21", referenceImage: descriptor(bytes) }), { getModels: bananaModels });
  assert.equal(source.source.sha256, hash(bytes));
  assert.equal(source.source.submittedFormat, "jpeg");
  assert.notEqual(source.source.submittedSha256, source.source.sha256);
  const client = imageClient();
  const result = await executeFloorPlan(source, { client, getModels: bananaModels, getPrompt });
  assert.equal(result.source.submittedSha256, hash(Buffer.from(client.calls[0].images[0].image_url.split(",")[1], "base64")));
});

test("准备期和执行期均复核资产与模型权限，漂移零收费", async () => {
  await assert.rejects(prepare(await input(), { getModels: async () => [] }), { statusCode: 409 });
  await assert.rejects(prepare(await input(), { getPrompt: async () => ({ ...asset, prompt: body + " " }) }), { statusCode: 409 });
  const source = await prepare(await input()), client = imageClient();
  await assert.rejects(executeFloorPlan(source, { client, getPrompt, getModels: async () => [] }), { statusCode: 409 });
  await assert.rejects(executeFloorPlan(source, { client, getModels, getPrompt: async () => ({ ...asset, source: "another-table" }) }), { statusCode: 409 });
  assert.equal(client.calls.length, 0);
});

test("返回非PNG或错尺寸仍失败并保留同次费用，绝不重跑", async () => {
  const source = await prepare(await input());
  for (const options of [{ invalid: true }, { wrongSize: true }]) {
    const client = imageClient(options);
    await assert.rejects(executeFloorPlan(source, { client, getModels, getPrompt }), error => {
      assert.equal(error.statusCode, 502);
      assert.equal(error.floorPlanDiagnostic.requestId, "image-response-id");
      assert.equal(error.floorPlanDiagnostic.usageCost.costUsd, 0.01);
      assert.doesNotMatch(JSON.stringify(error.floorPlanDiagnostic), /data:image|PRIVATE_LAYOUT_RULE|privateField/);
      return true;
    });
    assert.equal(client.calls.length, 1);
  }
  const rejected = imageClient({ reject: true });
  await assert.rejects(executeFloorPlan(source, { client: rejected, getModels, getPrompt }), error => {
    assert.equal(error.floorPlanDiagnostic.requestId, "submitted-image-id");
    assert.doesNotMatch(error.message, /PRIVATE_LAYOUT_RULE|sk-/);
    return true;
  });
  assert.equal(rejected.calls.length, 1);
});

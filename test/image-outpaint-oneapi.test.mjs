/**
 * [INPUT]: 依赖双引擎扩图边界、Sunburst 画布/遮罩适配、任务 API、统一生成服务、前端几何及 sharp 图片样本
 * [OUTPUT]: 对外提供独立于Flux的Sunburst输入/模型参数边界、超限原图单次等比缩放/狭长目标补边事实、原图像素/遮罩定位、2K预设及任意原比例/16px网格/比例像素边界与普通生图目录隔离、产物/权限/路由回归测试
 * [POS]: test 的 OneAPI 扩图合同测试，使用假客户端，不调用付费模型
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { createImageOutpaintConfigReader, executeImageOutpaint, normalizeImageOutpaintInput } from "../src/image-outpaint-service.mjs";
import { assertOneApiOutpaintTarget, prepareOneApiOutpaintCanvas, publicOneApiOutpaintConfig } from "../src/image-outpaint-oneapi.mjs";
import { createGenerationService } from "../src/generation-service.mjs";
import { createGenerationJobApiHandler } from "../src/generation-job-api.mjs";
import { imageOutpaintPreparedDimensions, outpaintTargetDimensions } from "../public/image-outpaint.js";
import { MODEL_CONFIGS } from "../src/model-config.mjs";

const bytes = await sharp({ create: { width: 403, height: 301, channels: 3, background: "#1593b0" } }).png().toBuffer();
const source = { dataUrl: `data:image/png;base64,${bytes.toString("base64")}`, name: "source.png" };
const input = { outpaintEngine: "gptImage25Sunburst", referenceImages: [source], expansion: { left: 100, top: 80, right: 1545, bottom: 1155 } };
const resultBytes = await sharp({ create: { width: 2048, height: 1536, channels: 3, background: "#bbb" } }).png().toBuffer();
const resultUrl = `data:image/png;base64,${resultBytes.toString("base64")}`;

test("Sunburst 按原尺寸定位，输入边界与 Flux 4K/32px 预处理独立", async () => {
  const normalized = await normalizeImageOutpaintInput(input);
  assert.deepEqual(normalized.prepared, { width: 403, height: 301 });
  assert.equal(normalized.width, 2048);
  assert.equal(normalized.height, 1536);
  const config = publicOneApiOutpaintConfig({ available: true });
  assert.deepEqual(imageOutpaintPreparedDimensions(normalized.source, config), normalized.prepared);
  assert.deepEqual(outpaintTargetDimensions(normalized.source, input.expansion, config), { width: 2048, height: 1536 });
  const large = await sharp({ create: { width: 2500, height: 1000, channels: 3, background: "#aaa" } }).png().toBuffer();
  const largeInput = { ...input, referenceImages: [{ dataUrl: `data:image/png;base64,${large.toString("base64")}` }],
    expansion: undefined, outpaintCanvas: { ratio: "16:9", scale: 2 / 3 } };
  const api = await normalizeImageOutpaintInput(largeInput);
  assert.deepEqual([api.width, api.height], [2048, 1152]);
  assert.deepEqual(api.originalSource, { width: 2500, height: 1000 });
  assert.equal(api.sourceResized, true);
  const comfy = await normalizeImageOutpaintInput({ ...largeInput, outpaintEngine: "comfyui" });
  assert.deepEqual([comfy.width, comfy.height], [2048, 1152]);
  assert.equal(comfy.sourceResized, true);
  const actual = await sharp(Buffer.from(api.source.imageUrl.split(",")[1], "base64")).metadata();
  assert.deepEqual([actual.width, actual.height], [api.source.width, api.source.height]);
  assert.equal(config.maxInputEdge, 3840);
  assert.deepEqual(imageOutpaintPreparedDimensions({ width: 4096, height: 32 }, config), { width: 4096, height: 32 });
});

test("透明画布保持原图字节解码像素，遮罩精确保护原图矩形", async () => {
  const normalized = await normalizeImageOutpaintInput(input);
  const prepared = await prepareOneApiOutpaintCanvas(normalized);
  const protectedPixels = await sharp(prepared.canvas).extract({ left: 100, top: 80, width: 403, height: 301 }).removeAlpha().raw().toBuffer();
  assert.deepEqual(protectedPixels, await sharp(bytes).removeAlpha().raw().toBuffer());
  const { data: mask, info } = await sharp(prepared.mask).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const alpha = (x, y) => mask[(y * info.width + x) * 4 + 3];
  for (const [x, y] of [[100, 80], [502, 380], [300, 200]]) assert.equal(alpha(x, y), 255);
  for (const [x, y] of [[99, 80], [100, 79], [503, 380], [502, 381], [0, 0], [2047, 1535]]) assert.equal(alpha(x, y), 0);
  const canvasMeta = await sharp(prepared.canvas).metadata();
  assert.equal(canvasMeta.hasAlpha, true);
  assert.deepEqual(prepared.placement, { left: 100, top: 80, width: 403, height: 301 });
});

test("Sunburst扩图保留9个2K预设并开放原比例，普通生图仍保留1K/2K/4K目录", async () => {
  const config = publicOneApiOutpaintConfig();
  assert.equal(config.inputAlignment, 1);
  assert.equal(config.outputAlignment, 16);
  assert.equal(config.maxPixels, 8294400);
  assert.equal(config.workflow.version, "2026-10-19.1");
  assert.equal(config.resolution, "2K");
  assert.equal(config.targetSizes.length, 9);
  assert.equal(config.supportsOriginalRatio, true);
  assert.equal(config.maxAspectRatio, 3);
  const ordinarySizes = MODEL_CONFIGS.gptImage25Sunburst.sizes;
  const expected = Object.entries(ordinarySizes).map(([ratio, sizes]) => {
    assert.deepEqual(Object.keys(sizes), ["1K", "2K", "4K"]);
    for (const resolution of ["1K", "4K"]) {
      const [width, height] = sizes[resolution].split("x").map(Number);
      assert.throws(() => assertOneApiOutpaintTarget({ width, height }), (error) => error.statusCode === 400);
    }
    const [width, height] = sizes["2K"].split("x").map(Number);
    return { width, height, ratio, resolution: "2K" };
  });
  assert.deepEqual(config.targetSizes, expected);
  for (const size of config.targetSizes) {
    assertOneApiOutpaintTarget(size);
    const label = `${size.ratio} ${size.resolution}: ${size.width}x${size.height}`;
    assert.equal(size.resolution, "2K");
    assert.equal(size.width % config.outputAlignment, 0, label);
    assert.equal(size.height % config.outputAlignment, 0, label);
    assert.ok(size.width * size.height >= 655360 && size.width * size.height <= config.maxPixels, label);
    assert.ok(Math.max(size.width, size.height) <= config.maxEdge, label);
    assert.ok(Math.max(size.width, size.height) <= Math.min(size.width, size.height) * 3, label);
  }
  for (const [width, height] of [[1488, 2048], [2048, 1488], [2048, 688], [688, 2048]]) {
    assertOneApiOutpaintTarget({ width, height });
    assert.equal(config.targetSizes.some((size) => size.width === width && size.height === height), false);
  }
  for (const [width, height] of [[2048, 672], [672, 2048], [2048, 1489], [2000, 1504], [4096, 2048]]) {
    assert.throws(() => assertOneApiOutpaintTarget({ width, height }), (error) => error.statusCode === 400);
  }
  await assert.rejects(normalizeImageOutpaintInput({ ...input, outpaintEngine: "unknown" }), /不支持的扩图引擎/);
  await assert.rejects(normalizeImageOutpaintInput({ ...input, outpaintModel: "fluxFillDev" }), (error) => error.statusCode === 400);
  await assert.rejects(normalizeImageOutpaintInput({ ...input, expansion: { ...input.expansion, left: 101 } }), (error) => error.statusCode === 400 && /2K.*16px/.test(error.message));
});

test("API 扩图传固定模型和透明遮罩，记录实际尺寸、身份和费用且不归档", async () => {
  const phases = [];
  let calls = 0;
  const client = { async editImage(request) {
    calls += 1;
    assert.equal(request.model, "gpt-image-2.5-sunburst");
    assert.equal(request.size, "2048x1536");
    assert.equal(request.n, 1);
    assert.equal(request.quality, "medium");
    assert.match(request.prompt, /x=100, y=80, width=403, height=301/);
    assert.ok(request.images[0].image_url.startsWith("data:image/png;base64,"));
    assert.ok(request.mask.image_url.startsWith("data:image/png;base64,"));
    return { images: [{ url: resultUrl }], transport: "images-edits", outputFormat: "png", requestId: "req-fixture", usageCost: { currency: "CNY", nativeAmount: 1.2 } };
  } };
  const result = await executeImageOutpaint({ ...input, model: "other-model", quality: "max" }, { imageClient: client, onProgress: (phase) => phases.push(phase) });
  assert.equal(calls, 1);
  assert.equal(phases[0].provider, "oneapi");
  assert.equal(result.sync.status, "skipped");
  assert.equal(result.upstream.metadata.outputWidth, 2048);
  assert.equal(result.upstream.metadata.outputHeight, 1536);
  for (const key of ["canvasSha256", "maskSha256", "outputSha256"]) assert.match(result.upstream.metadata[key], /^[a-f0-9]{64}$/);
  assert.equal(result.upstream.metadata.requestId, "req-fixture");
  assert.equal(result.upstream.usageCost.nativeAmount, 1.2);
});

test("API 返回错尺寸或多张结果时明确失败，不重复调用付费接口", async () => {
  let calls = 0;
  const client = { async editImage() { calls += 1; return { images: [{ url: source.dataUrl }], outputFormat: "png" }; } };
  await assert.rejects(executeImageOutpaint(input, { imageClient: client }), /实际输出 403x301 与目标 2048x1536 不一致/);
  assert.equal(calls, 1);
  await assert.rejects(executeImageOutpaint(input, { imageClient: { async editImage() { return { images: [{ url: resultUrl }, { url: resultUrl }] }; } } }), /唯一图片/);
});

test("独立API配置按当前Key重新检查权限，不受ComfyUI故障阻断", async () => {
  let granted = true;
  const reader = createImageOutpaintConfigReader(null, { getOneApiModels: async () => granted ? [{ id: "gpt-image-2.5-sunburst" }] : [] });
  const config = await reader();
  assert.equal(config.available, false);
  assert.equal(config.engines[1].available, true);
  granted = false;
  assert.equal((await reader()).engines[1].available, false);
  const failed = createImageOutpaintConfigReader(null, { getOneApiModels: async () => { throw new Error("credential-private"); } });
  assert.equal(JSON.stringify(await failed()).includes("credential-private"), false);
});

test("统一应用服务按API引擎取客户端并调度飞书归档", async () => {
  const service = createGenerationService({
    imageOutpaintClient: { generateImage: () => assert.fail("不能调用 ComfyUI") },
    imageClientForModel(key) { assert.equal(key, "gptImage25Sunburst"); return { async editImage() { return { images: [{ url: resultUrl }], outputFormat: "png" }; } }; },
    scheduleGenerationSync: (archive) => {
      assert.equal(archive.workflow.feature, "image-outpaint");
      assert.equal(archive.modelLabel, "GPT Image 2.5 Sunburst");
      return { generationId: "sunburst-sync", status: "pending" };
    },
  });
  const result = await service.executeForMode("imageOutpaint", input);
  assert.equal(result.workflow.key, "image-outpaint-sunburst");
  assert.equal(result.sync.status, "pending");
});

test("HTTP 按所选API引擎准入且使用imageEdit阶段，缺权限不入队", async () => {
  let available = true;
  let syncChecks = 0;
  let response, queued;
  const handler = createGenerationJobApiHandler({
    generationJobs: { enqueue(_id, metadata) { queued = metadata; return { id: "fixture" }; } },
    getImageOutpaintConfig: async () => ({ available: false, engines: [publicOneApiOutpaintConfig({ available })] }),
    generationService: {},
    readJson: async () => ({ featureMode: "imageOutpaint", jobId: "generation-123456789012", items: [{ input }] }),
    sendJson(_response, status, body) { response = { status, body }; },
    verifySyncContract: async () => { syncChecks += 1; },
  });
  await handler({ method: "POST" }, {}, "/api/generation-jobs");
  assert.equal(response.status, 202);
  assert.deepEqual(queued.stages, { imageEdit: "submitting" });
  assert.equal(syncChecks, 1);
  available = false;
  queued = null;
  await handler({ method: "POST" }, {}, "/api/generation-jobs");
  assert.equal(response.status, 409);
  assert.equal(queued, null);
});

test("Sunburst超限4000px原图按最终计划只等比适配一次，原图内容完整且API适配图不超3840", async () => {
  const original = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: "#246bb1" } }).png().toBuffer();
  const request = { outpaintEngine: "gptImage25Sunburst", referenceImages: [{ dataUrl: `data:image/png;base64,${original.toString("base64")}`, name: "large.png" }],
    outpaintCanvas: { ratio: "original", resolution: "2K", scale: 2 / 3, position: { x: 0.5, y: 0.5 } } };
  const normalized = await normalizeImageOutpaintInput(request);
  assert.deepEqual(normalized.originalSource, { width: 4000, height: 3000 });
  assert.deepEqual(normalized.prepared, { width: 1365, height: 1024 });
  assert.deepEqual([normalized.width, normalized.height], [2048, 1536]);
  assert.deepEqual(normalized.expansion, { left: 342, top: 256, right: 341, bottom: 256 });
  assert.equal(normalized.sourceResized, true);
  const actual = await sharp(Buffer.from(normalized.source.imageUrl.split(",")[1], "base64")).raw().toBuffer();
  const expected = await sharp(original).resize({ width: 1365 }).raw().toBuffer();
  assert.deepEqual(actual, expected);
  const limits = publicOneApiOutpaintConfig();
  assert.equal(limits.maxSourceEdge, 16384);
  assert.equal(limits.maxInputEdge, 3840);
  assert.equal(limits.adaptOriginalRatio, true);
  assert.equal(normalized.prepared.width <= limits.maxInputEdge, true);
});

test("Sunburst超3:1原图只扩大目标短边，真实source完整受保护且适配事实进入归档", async () => {
  const original = await sharp({ create: { width: 3736, height: 1132, channels: 3, background: "#b13b24" } }).png().toBuffer();
  const request = { outpaintEngine: "gptImage25Sunburst", referenceImages: [{ dataUrl: `data:image/png;base64,${original.toString("base64")}`, name: "wide.png" }],
    outpaintCanvas: { ratio: "original", resolution: "2K", scale: 2 / 3, position: { x: 0.5, y: 0.5 } } };
  const normalized = await normalizeImageOutpaintInput(request);
  assert.deepEqual(normalized.originalSource, { width: 3736, height: 1132 });
  assert.deepEqual(normalized.prepared, { width: 1365, height: 414 });
  assert.deepEqual([normalized.width, normalized.height], [2048, 688]);
  assert.deepEqual(normalized.expansion, { left: 342, top: 137, right: 341, bottom: 137 });
  assert.deepEqual(normalized.targetAdaptation, { policy: "contain-source-pad-target", requestedRatio: "original",
    requestedTargetWidth: 2048, requestedTargetHeight: 624, effectiveTargetWidth: 2048, effectiveTargetHeight: 688 });
  const prepared = await prepareOneApiOutpaintCanvas(normalized);
  const protectedBytes = await sharp(prepared.canvas).extract({ left: 342, top: 137, width: 1365, height: 414 }).removeAlpha().raw().toBuffer();
  assert.deepEqual(protectedBytes, await sharp(original).resize({ width: 1365 }).raw().toBuffer());
  const mask = await sharp(prepared.mask).extract({ left: 342, top: 136, width: 1, height: 2 }).ensureAlpha().raw().toBuffer();
  assert.equal(mask[3], 0);
  assert.equal(mask[7], 255);
  let archive, calls = 0;
  const result = await executeImageOutpaint(request, { imageClient: { async editImage(payload) {
    calls += 1;
    assert.equal(payload.size, "2048x688");
    const output = await sharp({ create: { width: 2048, height: 688, channels: 3, background: "#aaa" } }).png().toBuffer();
    return { images: [{ url: `data:image/png;base64,${output.toString("base64")}` }], outputFormat: "png" };
  } }, scheduleSync(payload) { archive = payload; return { status: "pending", generationId: "adapted-result" }; } });
  assert.equal(calls, 1);
  assert.equal(result.sync.generationId, "adapted-result");
  assert.deepEqual(archive.workflow.targetAdaptation, normalized.targetAdaptation);
  assert.deepEqual([archive.workflow.originalSourceWidth, archive.workflow.originalSourceHeight], [3736, 1132]);
  assert.deepEqual([archive.workflow.preparedWidth, archive.workflow.preparedHeight], [1365, 414]);
  assert.deepEqual([archive.workflow.outputWidth, archive.workflow.outputHeight], [2048, 688]);
  assert.deepEqual(archive.workflow.outpaintCanvas, request.outpaintCanvas);
});

test("Sunburst新增源图适配仍拒绝小于32或大于16384源图，旧四边请求保留3840API边界", async () => {
  for (const [width, height] of [[31, 100], [16385, 64]]) {
    const original = await sharp({ create: { width, height, channels: 3, background: "#aaa" } }).png().toBuffer();
    await assert.rejects(normalizeImageOutpaintInput({ outpaintEngine: "gptImage25Sunburst",
      referenceImages: [{ dataUrl: `data:image/png;base64,${original.toString("base64")}`, name: "invalid.png" }],
      outpaintCanvas: { ratio: "original", scale: 2 / 3 } }), (error) => error.statusCode === 400);
  }
  const original = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: "#aaa" } }).png().toBuffer();
  await assert.rejects(normalizeImageOutpaintInput({ ...input,
    referenceImages: [{ dataUrl: `data:image/png;base64,${original.toString("base64")}`, name: "legacy.png" }] }), /32–3840px/);
});

/**
 * [INPUT]: 依赖双引擎扩图边界、Sunburst 画布/遮罩适配、任务 API、统一生成服务、前端几何及 sharp 图片样本
 * [OUTPUT]: 对外提供独立于Flux的Sunburst输入/模型参数边界、原图像素/遮罩定位、27个合法目标档位/16px网格/像素边界、API尺寸/真实产物/权限与独立路由回归测试
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

const bytes = await sharp({ create: { width: 403, height: 301, channels: 3, background: "#1593b0" } }).png().toBuffer();
const source = { dataUrl: `data:image/png;base64,${bytes.toString("base64")}`, name: "source.png" };
const input = { outpaintEngine: "gptImage25Sunburst", referenceImages: [source], expansion: { left: 100, top: 80, right: 521, bottom: 387 } };
const resultBytes = await sharp({ create: { width: 1024, height: 768, channels: 3, background: "#bbb" } }).png().toBuffer();
const resultUrl = `data:image/png;base64,${resultBytes.toString("base64")}`;

test("Sunburst 按原尺寸定位，输入边界与 Flux 4K/32px 预处理独立", async () => {
  const normalized = await normalizeImageOutpaintInput(input);
  assert.deepEqual(normalized.prepared, { width: 403, height: 301 });
  assert.equal(normalized.width, 1024);
  assert.equal(normalized.height, 768);
  const config = publicOneApiOutpaintConfig({ available: true });
  assert.deepEqual(imageOutpaintPreparedDimensions(normalized.source, config), normalized.prepared);
  assert.deepEqual(outpaintTargetDimensions(normalized.source, input.expansion, config), { width: 1024, height: 768 });
  const large = await sharp({ create: { width: 2500, height: 1000, channels: 3, background: "#aaa" } }).png().toBuffer();
  const largeInput = { ...input, referenceImages: [{ dataUrl: `data:image/png;base64,${large.toString("base64")}` }], expansion: { left: 670, right: 670, top: 580, bottom: 580 } };
  assert.equal((await normalizeImageOutpaintInput(largeInput)).width, 3840);
  const comfy = await normalizeImageOutpaintInput({ ...largeInput, outpaintEngine: "comfyui", expansion: { left: 8, right: 0, top: 0, bottom: 0 } });
  assert.deepEqual(comfy.prepared, { width: 2528, height: 1024 });
  assert.deepEqual([comfy.width, comfy.height], [2536, 1024]);
  assert.equal(config.maxInputEdge, 3840);
  assert.equal(imageOutpaintPreparedDimensions({ width: 4096, height: 32 }, config), null);
});

test("透明画布保持原图字节解码像素，遮罩精确保护原图矩形", async () => {
  const normalized = await normalizeImageOutpaintInput(input);
  const prepared = await prepareOneApiOutpaintCanvas(normalized);
  const protectedPixels = await sharp(prepared.canvas).extract({ left: 100, top: 80, width: 403, height: 301 }).removeAlpha().raw().toBuffer();
  assert.deepEqual(protectedPixels, await sharp(bytes).removeAlpha().raw().toBuffer());
  const { data: mask, info } = await sharp(prepared.mask).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const alpha = (x, y) => mask[(y * info.width + x) * 4 + 3];
  for (const [x, y] of [[100, 80], [502, 380], [300, 200]]) assert.equal(alpha(x, y), 255);
  for (const [x, y] of [[99, 80], [100, 79], [503, 380], [502, 381], [0, 0], [1023, 767]]) assert.equal(alpha(x, y), 0);
  const canvasMeta = await sharp(prepared.canvas).metadata();
  assert.equal(canvasMeta.hasAlpha, true);
  assert.deepEqual(prepared.placement, { left: 100, top: 80, width: 403, height: 301 });
});

test("Sunburst 目标只准入27个官方合法档位，拒绝未知引擎和未匹配尺寸", async () => {
  const config = publicOneApiOutpaintConfig();
  assert.equal(config.inputAlignment, 1);
  assert.equal(config.outputAlignment, 16);
  assert.equal(config.maxPixels, 8294400);
  assert.equal(config.workflow.version, "2026-10-15.2");
  assert.equal(config.targetSizes.length, 27);
  for (const size of config.targetSizes) {
    assertOneApiOutpaintTarget(size);
    const label = `${size.ratio} ${size.resolution}: ${size.width}x${size.height}`;
    assert.equal(size.width % config.outputAlignment, 0, label);
    assert.equal(size.height % config.outputAlignment, 0, label);
    assert.ok(size.width * size.height >= 655360 && size.width * size.height <= config.maxPixels, label);
    assert.ok(Math.max(size.width, size.height) <= config.maxEdge, label);
    assert.ok(Math.max(size.width, size.height) <= Math.min(size.width, size.height) * 3, label);
  }
  await assert.rejects(normalizeImageOutpaintInput({ ...input, outpaintEngine: "unknown" }), /不支持的扩图引擎/);
  await assert.rejects(normalizeImageOutpaintInput({ ...input, outpaintModel: "fluxFillDev" }), (error) => error.statusCode === 400);
  await assert.rejects(normalizeImageOutpaintInput({ ...input, expansion: { ...input.expansion, left: 101 } }), /目标尺寸需匹配/);
});

test("API 扩图传固定模型和透明遮罩，记录实际尺寸、身份和费用且不归档", async () => {
  const phases = [];
  let calls = 0;
  const client = { async editImage(request) {
    calls += 1;
    assert.equal(request.model, "gpt-image-2.5-sunburst");
    assert.equal(request.size, "1024x768");
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
  assert.equal(result.upstream.metadata.outputWidth, 1024);
  assert.equal(result.upstream.metadata.outputHeight, 768);
  for (const key of ["canvasSha256", "maskSha256", "outputSha256"]) assert.match(result.upstream.metadata[key], /^[a-f0-9]{64}$/);
  assert.equal(result.upstream.metadata.requestId, "req-fixture");
  assert.equal(result.upstream.usageCost.nativeAmount, 1.2);
});

test("API 返回错尺寸或多张结果时明确失败，不重复调用付费接口", async () => {
  let calls = 0;
  const client = { async editImage() { calls += 1; return { images: [{ url: source.dataUrl }], outputFormat: "png" }; } };
  await assert.rejects(executeImageOutpaint(input, { imageClient: client }), /实际输出 403x301 与目标 1024x768 不一致/);
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

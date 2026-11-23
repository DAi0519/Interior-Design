/**
 * [INPUT]: 依赖共享模型目录、OneAPI 客户端、sharp 与 node:test 的 HTTP 替身。
 * [OUTPUT]: 验证 Seedream 5.5 独立尺寸、文生图/多参考图实际请求、格式与未开放能力阻断。
 * [POS]: test 的 Seedream 5.5 跨目录与传输合同回归，不调用真实网关或消耗额度。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { MODEL_CONFIGS, createGenerationRequest, publicModelCatalog } from "../src/model-config.mjs";
import { createOneApiClient } from "../src/oneapi-client.mjs";

const input = {
  modelKey: "seedream55", prompt: "保留空间与材质，生成真实室内照片",
  ratio: "4:3", resolution: "2K", outputFormat: "png",
};
const image = () => sharp({ create: { width: 32, height: 24, channels: 3, background: "#8a8a8a" } }).png().toBuffer();

test("5.5 使用独立的官方 2K 尺寸，旧 Pro 与 Lite 矩阵保持不变", () => {
  const model = publicModelCatalog().find(({ key }) => key === input.modelKey);
  assert.equal(model.id, "doubao-seedream-5.5");
  assert.equal(model.label, "Seedream 5.5");
  assert.equal(model.maxReferenceImages, 4);
  assert.equal(Object.keys(model.sizes).length, 9);
  for (const [ratio, size] of [["4:3", "2368x1776"], ["3:4", "1776x2368"], ["16:9", "2816x1584"], ["9:16", "1584x2816"]]) {
    assert.equal(createGenerationRequest({ ...input, ratio }).request.size, size);
    assert.notEqual(MODEL_CONFIGS.seedream5Pro.sizes[ratio]["2K"], size);
    assert.notEqual(MODEL_CONFIGS.seedream5.sizes[ratio]["2K"], size);
  }
  assert.equal(MODEL_CONFIGS.seedream5Pro.sizes["4:3"]["2K"], "2304x1728");
  for (const tiers of Object.values(model.sizes)) {
    assert.deepEqual(Object.keys(tiers), ["1K", "2K"]);
    for (const size of Object.values(tiers)) {
      const [w, h] = size.split("x").map(Number);
      assert.equal(w % 16, 0); assert.equal(h % 16, 0);
      assert.ok(w * h >= 921_600 && w * h <= 4_624_220);
    }
  }
});

test("5.5 支持独立 2:1 全景档，拒绝未开放的分辨率和格式", () => {
  for (const resolution of ["1.5K", "3K", "4K"]) {
    assert.throws(() => createGenerationRequest({ ...input, resolution }), /不支持这个分辨率/);
  }
  assert.throws(() => createGenerationRequest({ ...input, outputFormat: "webp" }), /不支持这个输出格式/);
  for (const [resolution, size] of [["1K", "1440x720"], ["2K", "2880x1440"]]) {
    const generation = createGenerationRequest({ ...input, ratio: "2:1", resolution, featureMode: "panoramaEnhancement" });
    assert.equal(generation.request.model, "doubao-seedream-5.5");
    assert.equal(generation.request.size, size);
  }
  assert.throws(() => createGenerationRequest({ ...input, ratio: "2:1", resolution: "4K", featureMode: "panoramaEnhancement" }), /不支持这个分辨率/);
});

test("5.5 文生图用独立 ID 单次请求 Images，保留返回图与传输身份", async context => {
  const bytes = await image(), calls = [];
  context.mock.method(globalThis, "fetch", async (url, options) => {
    const body = JSON.parse(options.body); calls.push({ url, body });
    return Response.json({ id: "seedream55-text", data: [{ b64_json: bytes.toString("base64") }] });
  });
  const { request } = createGenerationRequest({ ...input, ratio: "16:9", resolution: "1K" });
  const result = await createOneApiClient("test-key", { diagnosticSink: () => {} }).generateImage(request);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.endsWith("/images/generations"));
  assert.equal(calls[0].body.model, "doubao-seedream-5.5");
  assert.equal(calls[0].body.size, "1424x800");
  assert.equal(calls[0].body.n, 1);
  assert.equal(Object.hasOwn(calls[0].body, "quality"), false);
  assert.equal(result.requestId, "seedream55-text");
  assert.equal(result.transport, "images-generations");
  assert.equal(result.images[0].url, `data:image/png;base64,${bytes.toString("base64")}`);
});

test("5.5 图生图保持多参考图顺序并以 Responses 的原生 JPEG 格式提交一次", async context => {
  const bytes = await image(), dataUrl = `data:image/png;base64,${bytes.toString("base64")}`, calls = [];
  context.mock.method(globalThis, "fetch", async (url, options) => {
    const body = JSON.parse(options.body); calls.push({ url, body });
    return Response.json({ id: "seedream55-edit", output: [{ type: "image_generation_call", result: "https://example.com/result.jpg" }] });
  });
  const { request } = createGenerationRequest({ ...input, outputFormat: "jpeg",
    referenceImages: [{ dataUrl, fileName: "source.png" }, { dataUrl, fileName: "reference.png" }],
  });
  const result = await createOneApiClient("test-key", { diagnosticSink: () => {} }).generateImage(request);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.endsWith("/responses"));
  const body = calls[0].body;
  assert.equal(body.model, "doubao-seedream-5.5");
  assert.deepEqual(body.input[0].content.map(item => item.type), ["input_text", "input_image", "input_image"]);
  assert.deepEqual(body.input[0].content.slice(1).map(item => item.image_url), [dataUrl, dataUrl]);
  assert.deepEqual(body.tools, [{ image_format: "jpg", n: 1, response_format: "url", size: "2368x1776", type: "image_generation" }]);
  assert.equal(result.transport, "responses");
  assert.equal(result.images[0].url, "https://example.com/result.jpg");
});

/**
 * [INPUT]: 依赖Node测试/断言、模型请求真源、Flux/美化执行图及正式KS直入工厂与元数据
 * [OUTPUT]: 覆盖普通Flux跨功能4K/6K的KS27.1冻结、实际图序/5K推理和6K交付/元数据、输入边界与版本漂移、历史3B重试及全景/双图/低分辨率隔离
 * [POS]: test 的Flux后置KS超分跨层纯合同测试，所有图片和执行图均为内存对象，不提交GPU或访问飞书
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from "node:assert/strict";
import test from "node:test";
import { MODEL_CONFIGS, createGenerationRequest, normalizeFluxPostUpscaleInput, publicModelCatalog } from "../src/model-config.mjs";
import { createAiTextureWorkflow, aiTextureWorkflowMetadata } from "../src/ai-texture-workflow.mjs";
import { FLUX_POST_UPSCALE_WORKFLOW_KEY, IMAGE_UPSCALE_DEFAULT_WORKFLOW_KEY, publicImageUpscaleConfig } from "../src/image-upscale-workflow.mjs";

const KEY = "ks_seedvr2_2x_direct";
const VERSION = "2026-10-27.1";
const LEGACY_KEY = "youxing_seedvr2_3b";
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z7JkAAAAASUVORK5CYII=";
const image = { dataUrl: PNG, name: "space.png", type: "image/png" };
const input = (resolution = "6K", featureMode = "free") => ({ featureMode, modelKey: "aiTextureEnhancement", resolution,
  outputFormat: "png", prompt: "保持空间结构", referenceImages: [image] });
function generation(resolution = "6K", featureMode = "free", sourceDimensions = { width: 1600, height: 900 }) {
  return createGenerationRequest(input(resolution, featureMode), { sourceDimensions });
}
function graph(request) {
  return createAiTextureWorkflow({ artifactKey: "flux-ks-contract", generationRequest: request,
    width: request.width, height: request.height, imageBase64: PNG.split(",")[1], prompt: request.prompt, seed: 42 });
}
function metadata(request, extra = {}) {
  return aiTextureWorkflowMetadata({ artifactKey: "flux-ks-contract", generationRequest: request,
    width: request.width, height: request.height, actualOutputWidth: request.upscale_width, actualOutputHeight: request.upscale_height,
    resolution: request.resolution, seed: 42, outputSha256: "a".repeat(64), promptId: "prompt-ks-contract", ...extra });
}

// -- 目录与队列冻结 -----------------------------------------------------------
test("普通Flux后置默认KS直入27.1，独立AI超分默认继续攸行3B", () => {
  assert.equal(FLUX_POST_UPSCALE_WORKFLOW_KEY, KEY);
  assert.equal(IMAGE_UPSCALE_DEFAULT_WORKFLOW_KEY, LEGACY_KEY);
  assert.equal(publicImageUpscaleConfig().defaultWorkflowKey, LEGACY_KEY);
  const model = publicModelCatalog().find(model => model.key === "aiTextureEnhancement");
  for (const resolution of ["4K", "6K"]) {
    const capability = model.postUpscale[resolution];
    assert.equal(capability.workflowKey, KEY); assert.equal(capability.workflowVersion, VERSION);
    assert.equal(capability.workflowLabel, "KS直入 · 7B");
    assert.deepEqual(capability.inputSize, { minWidth: 384, maxWidth: 3200, minHeight: 384, maxHeight: 3200 });
  }
});

test("所有普通Flux功能4K/6K冻结同一KS身份，历史缺字段可显式冻结旧3B", () => {
  for (const feature of ["free", "whiteModel", "emptyRoom", "styleTransfer", "effectEnhancement", "effectBeautification", "textureEnhancement", "refinedModel"]) {
    for (const resolution of ["4K", "6K"]) {
      const original = input(resolution, feature);
      if (feature === "emptyRoom") original.designScenario = "room-renovation";
      const frozen = normalizeFluxPostUpscaleInput(original);
      assert.equal(frozen.postUpscaleWorkflowKey, KEY); assert.equal(frozen.postUpscaleWorkflowVersion, VERSION);
      assert.equal(original.postUpscaleWorkflowKey, undefined);
      const result = createGenerationRequest(frozen, { sourceDimensions: { width: 1600, height: 900 } });
      assert.equal(result.request.upscale_workflow_key, KEY); assert.equal(result.request.upscale_workflow_version, VERSION);
      assert.equal(result.preview.upscaleWorkflowKey, KEY); assert.equal(result.workflowMetadata.upscaleWorkflowVersion, VERSION);
    }
  }
  const legacy = normalizeFluxPostUpscaleInput(input(), { legacy: true });
  assert.equal(legacy.postUpscaleWorkflowKey, LEGACY_KEY); assert.equal(legacy.postUpscaleWorkflowVersion, "2026-09-07.1");
  assert.deepEqual(normalizeFluxPostUpscaleInput(legacy), legacy);
  assert.equal(createGenerationRequest(legacy, { sourceDimensions: { width: 1600, height: 900 } }).request.upscale_workflow_key, LEGACY_KEY);
});

test("版本不成对/漂移、未知后置身份或跨链路字段均阻断，不回退旧模型", () => {
  for (const identity of [{ postUpscaleWorkflowKey: KEY }, { postUpscaleWorkflowVersion: VERSION },
    { postUpscaleWorkflowKey: KEY, postUpscaleWorkflowVersion: "2026-10-26.3" }]) {
    assert.throws(() => normalizeFluxPostUpscaleInput({ ...input(), ...identity }), error => error.statusCode === 409 && error.retryable === false);
  }
  assert.throws(() => normalizeFluxPostUpscaleInput({ ...input(), postUpscaleWorkflowKey: "seedvr2_1mp", postUpscaleWorkflowVersion: VERSION }), /不受支持/);
  for (const other of [{ ...input("2K") }, { ...input(), modelKey: "gptImage2" },
    ...["imageUpscale", "imageOutpaint", "imageMaskFill", "imageMultiAngle", "imageRelight", "aiRenderStudio"].map(mode => input("4K", mode)),
    input("6K", "panoramaEnhancement"), { ...input("6K", "refinedModel"), refinedLighting: { mode: "reference" } }]) {
    assert.equal(normalizeFluxPostUpscaleInput(other), other);
    assert.throws(() => normalizeFluxPostUpscaleInput({ ...other, postUpscaleWorkflowKey: KEY, postUpscaleWorkflowVersion: VERSION }), /仅支持普通Flux/);
  }
});

// -- 正式KS阶段的实际图序与尺寸 -----------------------------------------------
test("4K同图接正式KS7B，6K先5120推理再由同图节点交付6144，均只保存唯一成品", () => {
  for (const resolution of ["4K", "6K"]) {
    const { request } = generation(resolution);
    const nodes = graph(request);
    assert.equal(request.width, 2720); assert.equal(request.height, 1536);
    assert.equal(request.upscale_source_width, 2720); assert.equal(request.upscale_source_height, 1536);
    assert.equal(nodes["SeedVR2-DiT"].inputs.model, "seedvr2_ema_7b_fp8_e4m3fn_mixed_block35_fp16.safetensors");
    assert.equal(nodes["SeedVR2-DiT"].inputs.blocks_to_swap, 36);
    assert.equal(nodes["SeedVR2-DiT"].inputs.cache_model, false);
    assert.equal(nodes["SeedVR2-DiT"].inputs.offload_device, "cpu");
    assert.equal(nodes["SeedVR2-Preprocess"], undefined);
    assert.deepEqual(nodes["SeedVR2-Upscaler-Canvas"].inputs.image, ["ImageResize+-6348ae83bed7de73d2de60a62eb38a93", 0]);
    assert.deepEqual(nodes["SeedVR2-Upscaler"].inputs.image, ["SeedVR2-Upscaler-Canvas", 0]);
    assert.deepEqual(Object.entries(nodes).filter(([, node]) => node.class_type === "SaveImage").map(([id]) => id), ["72"]);
    if (resolution === "4K") {
      assert.equal(nodes["SeedVR2-Upscaler"].inputs.max_resolution, 4096);
      assert.equal(nodes["SeedVR2-Upscaler-Canvas"].inputs.width, 4096);
      assert.equal(nodes["SeedVR2-Upscaler-Canvas"].inputs.height, 2314);
      assert.equal(nodes["SeedVR2-Upscaler-Restore"], undefined);
      assert.deepEqual(nodes["72"].inputs.images, ["SeedVR2-Upscaler", 0]);
    } else {
      assert.equal(nodes["SeedVR2-Upscaler"].inputs.max_resolution, 5120);
      assert.equal(nodes["SeedVR2-Upscaler-Size"].class_type, "GetImageSize");
      assert.match(nodes["SeedVR2-Upscaler-InferenceSize"].inputs.value_1, /5120/);
      assert.match(nodes["SeedVR2-Upscaler-DeliverySize"].inputs.value_1, /6144/);
      assert.deepEqual(nodes["SeedVR2-Upscaler-Canvas"].inputs.width, ["SeedVR2-Upscaler-InferenceSize", 0]);
      assert.deepEqual(nodes["SeedVR2-Upscaler-Restore"].inputs.width, ["SeedVR2-Upscaler-DeliverySize", 0]);
      assert.deepEqual(nodes["SeedVR2-Upscaler-Restore"].inputs.image, ["SeedVR2-Upscaler", 0]);
      assert.deepEqual(nodes["72"].inputs.images, ["SeedVR2-Upscaler-Restore", 0]);
    }
    for (const [id, node] of Object.entries(nodes)) for (const value of Object.values(node.inputs)) {
      if (Array.isArray(value) && value.length === 2 && Number.isInteger(value[1])) assert.ok(nodes[value[0]], `${id} references missing ${value[0]}`);
    }
  }
});

test("归档分开记录Flux2K与KS实际推理/交付，6K方图不伪造20MP上限", () => {
  for (const resolution of ["4K", "6K"]) {
    const { request } = generation(resolution);
    const result = metadata(request);
    assert.equal(result.inferenceWidth, 2720); assert.equal(result.inferenceHeight, 1536);
    assert.equal(result.upscaleWorkflowKey, KEY); assert.equal(result.upscaleWorkflowVersion, VERSION);
    assert.equal(result.postUpscale.workflowId, KEY); assert.equal(result.postUpscale.workflowVersion, VERSION);
    assert.equal(result.postUpscale.sourceWidth, 2720); assert.equal(result.postUpscale.sourceHeight, 1536);
    assert.equal(result.postUpscale.outputWidth, request.upscale_width);
    assert.equal(result.postUpscale.outputHeight, request.upscale_height);
    assert.equal(result.postUpscale.outputSha256, "a".repeat(64));
    assert.equal(result.postUpscale.inferenceWidth, resolution === "4K" ? 4096 : 5120);
    assert.equal(result.postUpscale.deliveryPostResize, resolution === "6K");
  }
  const square = metadata(generation("6K", "free", { width: 1200, height: 1200 }).request).postUpscale;
  assert.equal(square.inferenceWidth, 5120); assert.equal(square.inferenceHeight, 5120);
  assert.equal(square.paddedInferencePixels, 26_214_400); assert.equal(square.inferencePixelLimit, undefined);
  assert.equal(square.fixedInferenceLongEdge, 5120); assert.equal(square.outputWidth, 6144);
});

test("美化核心1920推理、工作台2K中间图与KS输入/交付在执行图和元数据中保持分离", () => {
  const { request } = generation("6K", "effectBeautification");
  request.effect_beautification = { intensity: "high", tone: "warm" };
  request.effect_beautification_source = { width: 4000, height: 2250 };
  const nodes = graph(request);
  const middle = nodes[nodes["SeedVR2-Upscaler-Canvas"].inputs.image[0]];
  assert.equal(middle.class_type, "ImageResize+");
  assert.equal(middle.inputs.width, 2720); assert.equal(middle.inputs.height, 1536);
  const result = metadata(request);
  assert.equal(result.inferenceWidth, 1920); assert.equal(result.inferenceHeight, 1088);
  assert.equal(result.postUpscale.sourceWidth, 2720); assert.equal(result.postUpscale.sourceHeight, 1536);
  assert.equal(result.postUpscale.inferenceWidth, 5120); assert.equal(result.postUpscale.outputWidth, 6144);
});

test("KS按2K中间成图384–3200每轴准入，冻结源图/版本或实际交付漂移立即失败", () => {
  for (const sourceDimensions of [{ width: 3000, height: 1000 }, { width: 1000, height: 3000 }]) {
    assert.throws(() => generation("6K", "free", sourceDimensions), error => error.statusCode === 400 && /384–3200/.test(error.message));
  }
  const { request } = generation();
  assert.throws(() => graph({ ...request, upscale_source_width: request.width + 16 }), /冻结源尺寸/);
  assert.throws(() => graph({ ...request, upscale_workflow_version: "2026-10-26.3" }), error => error.statusCode === 409);
  assert.throws(() => graph({ ...request, upscale_height: request.upscale_height + 2 }), /交付尺寸/);
  assert.throws(() => metadata(request, { actualOutputWidth: request.upscale_width - 16 }), error => error.statusCode === 502 && error.retryable === false);
});

test("1K/2K、全景及双图不引入后置超分，明确冻结历史3B仍可重跑原图", () => {
  for (const resolution of ["1K", "2K"]) {
    const { request } = generation(resolution);
    assert.equal(request.upscale_workflow_key, undefined); assert.equal(graph(request)["SeedVR2-Upscaler"], undefined);
  }
  assert.equal(MODEL_CONFIGS.aiTextureEnhancement.panoramaWorkflow.sourceSize, true);
  const legacy = createGenerationRequest(normalizeFluxPostUpscaleInput(input(), { legacy: true }), { sourceDimensions: { width: 3000, height: 1000 } });
  assert.equal(legacy.request.upscale_workflow_key, LEGACY_KEY);
  assert.equal(graph(legacy.request)["SeedVR2-DiT"].inputs.model, "seedvr2_ema_3b_fp8_e4m3fn.safetensors");
  assert.equal(metadata(legacy.request).postUpscale.workflowVersion, "2026-09-07.1");
});

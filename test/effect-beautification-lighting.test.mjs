/**
 * [INPUT]: 依赖美化光影编译器、共享效果图服务、任务HTTP准入及Beta快照，模型/飞书使用内存替身
 * [OUTPUT]: 对外提供原六档保留、新卡片低自然执行、Prompt无冲突、入队/执行版本漂移阻断及跨功能隔离验证
 * [POS]: test 的效果图美化新增氛围合同测试，不调用GPU或真实飞书
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  assertEffectBeautificationLightingFeature,
  EFFECT_BEAUTIFICATION_LIGHTING_IDENTITY,
  normalizeEffectBeautificationLighting,
  prepareEffectBeautificationLightingInput,
  resolveEffectBeautificationLightingInput,
} from "../src/effect-beautification-lighting.mjs";
import { executeEffectRenderEnhancementWorkflow } from "../src/effect-render-enhancement-workflow.mjs";
import { createGenerationJobApiHandler, supportedGenerationFeatureCapabilities } from "../src/generation-job-api.mjs";
import { betaConfigSnapshot, betaResultVersion, betaSceneParameters } from "../src/beta-base.mjs";
import { createGenerationService } from "../src/generation-service.mjs";
import { createAiTextureWorkflow } from "../src/ai-texture-workflow.mjs";
import { createBetaRunnerService } from "../src/beta-runner.mjs";

const preset = { id: "recBeautifyLight", code: "blue-hour", name: "蓝调夜景", version: 5,
  sha256: "a".repeat(64), prompt: "BLUE HOUR TARGET: cool ambient dusk with warm existing lamps and deep shadows." };
const selection = { presetId: preset.id, version: preset.version, sha256: preset.sha256 };
const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z7JkAAAAASUVORK5CYII=";
const image = { dataUrl: png, name: "render.png", type: "image/png", size: Buffer.from(png.split(",")[1], "base64").length };
const input = { featureMode: "effectBeautification", modelKey: "aiTextureEnhancement", resolution: "1K",
  ratio: "4:3", ratioMode: "auto", outputFormat: "png", referenceImages: [image] };
const library = async () => ({ presets: [preset] });
const digest = value => createHash("sha256").update(value).digest("hex");

test("原六档无光影选择时不读取卡片库，独立Prompt与原工作流参数保留", async () => {
  const originalPrompt = JSON.stringify({ LOW: { NATURAL: "LOW NATURAL", WARM: "LOW WARM", COOL: "LOW COOL" },
    HIGH: { NATURAL: "HIGH NATURAL", WARM: "HIGH WARM", COOL: "HIGH COOL" } });
  for (const intensity of ["low", "high"]) for (const tone of ["natural", "warm", "cool"]) {
    let request;
    const result = await executeEffectRenderEnhancementWorkflow({ ...input, effectBeautification: { intensity, tone } }, {
      loadBeautificationPrompt: async () => ({ code: "effect-render-beautification", prompt: originalPrompt, version: 3, published: true }),
      loadBeautificationLightingAssets: () => { throw new Error("旧六档不可读库"); },
      imageClient: { async generateImage(value) { request = value; return { images: [{ url: png }] }; } },
    });
    assert.equal(request.prompt, `zhiganEnhance, ${intensity.toUpperCase()} ${tone.toUpperCase()}`);
    assert.deepEqual(request.effect_beautification, { intensity, tone });
    assert.deepEqual(result.request.effectBeautification, { intensity, tone });
    assert.equal("effectBeautificationLighting" in result.request, false);
  }
  assert.deepEqual(await resolveEffectBeautificationLightingInput(input, { loadAssets: library }),
    { selection: null, prompt: null, metadata: null });
});

for (const modelKey of ["aiTextureEnhancement", "gptImage2"]) test(`新增光影${modelKey}使用纯词目标，Flux仅低自然，归档实际正文与卡片SHA`, async () => {
  let request, archived;
  const result = await executeEffectRenderEnhancementWorkflow({ ...input, modelKey, effectBeautificationLighting: selection,
    effectBeautification: { intensity: "high", tone: "warm" }, prompt: "保留暗部层次" }, {
    loadBeautificationLightingAssets: library,
    loadBeautificationPrompt: () => { throw new Error("新增卡片不可读取六档固定光照词"); },
    imageClient: { async generateImage(value) { request = value; return { images: [{ url: png }] }; } },
    scheduleSync(value) { archived = value; return { status: "pending" }; },
  });
  const prefix = modelKey === "aiTextureEnhancement" ? "zhiganEnhance, " : "";
  assert.ok(request.prompt.startsWith(`${prefix}[USER REFINEMENTS]\n保留暗部层次`));
  assert.ok(request.prompt.endsWith(preset.prompt));
  assert.match(request.prompt, /Preserve the original design/);
  assert.match(request.prompt, /Suppress existing illumination that conflicts/);
  assert.doesNotMatch(request.prompt, /uniform diffuse light|keep original scene brightness|LOW NATURAL/);
  assert.equal(request.images.length, 1);
  assert.equal(archived.finalPrompt, request.prompt);
  assert.equal(archived.sourcePrompt, "保留暗部层次");
  assert.deepEqual(archived.workflow.effectBeautification, { intensity: "low", tone: "natural" });
  assert.equal(archived.workflow.effectBeautificationLighting.preset.sha256, selection.sha256);
  assert.equal(archived.workflow.effectBeautificationLighting.promptSha256, digest(request.prompt));
  assert.equal(result.prompt.code, EFFECT_BEAUTIFICATION_LIGHTING_IDENTITY.code);
  assert.equal(result.request.effectBeautificationLighting.preset.name, preset.name);
  assert.doesNotMatch(JSON.stringify(result), /BLUE HOUR TARGET|保留暗部层次/);
  if (modelKey === "aiTextureEnhancement") {
    assert.deepEqual(request.effect_beautification, { intensity: "low", tone: "natural" });
    assert.equal(archived.workflow.steps, 2);
    assert.equal(archived.workflow.loraStrength, 0.45);
    assert.equal(archived.workflow.colorMatchStrength, 1);
    assert.equal(archived.workflow.brightnessContrast, null);
    assert.equal(archived.workflow.temperature, null);
    const nodes = createAiTextureWorkflow({ generationRequest: request, artifactKey: "lighting-new", imageBase64: "AAAA",
      prompt: request.prompt, negativePrompt: request.negative_prompt, seed: 42 });
    assert.equal(nodes["EffectBeautification-Schedule"].inputs.steps, 2);
    assert.equal(nodes["EffectBeautification-Lora"].inputs.strength_model, 0.45);
    assert.equal(nodes["EffectBeautification-Positive"].inputs.text, request.prompt);
    assert.equal("EffectBeautification-Temperature" in nodes, false);
    assert.equal("EffectBeautification-BrightnessContrast" in nodes, false);
  } else assert.equal("effect_beautification" in request, false);
});

test("卡片身份严格规范化、拒绝客户端正文/参考图注入及错误功能", async () => {
  assert.equal(normalizeEffectBeautificationLighting(null), null);
  assert.deepEqual(normalizeEffectBeautificationLighting({ ...selection, sha256: "A".repeat(64) }), selection);
  for (const value of [{}, [], "recBeautifyLight", { ...selection, version: 0 }, { ...selection, sha256: "bad" },
    { ...selection, prompt: "INJECTED" }, { ...selection, execution: "prompt-and-reference" }]) {
    assert.throws(() => normalizeEffectBeautificationLighting(value), error => error.statusCode === 400);
  }
  for (const featureMode of ["whiteModel", "free", "effectEnhancement", "panoramaEnhancement", "textureEnhancement"]) {
    assert.throws(() => assertEffectBeautificationLightingFeature({ effectBeautificationLighting: selection }, featureMode), /仅支持效果图美化/);
  }
  for (const extra of [{ prompt: 12 }, { prompt: "x".repeat(8001) }, { lightingReferenceImages: [image] }, { styleReferenceImages: [image] }]) {
    await assert.rejects(() => resolveEffectBeautificationLightingInput({ ...input, ...extra, effectBeautificationLighting: selection },
      { loadAssets: library }), error => error.statusCode === 400);
  }
});

for (const presets of [[], [{ ...preset, version: 6 }], [{ ...preset, sha256: "b".repeat(64) }]])
  test("卡片下架或版本/SHA漂移在执行前阻断且不收费提交", async () => {
    let submitted = false;
    await assert.rejects(() => executeEffectRenderEnhancementWorkflow({ ...input, effectBeautificationLighting: selection }, {
      loadBeautificationLightingAssets: async () => ({ presets }),
      imageClient: { async generateImage() { submitted = true; } },
    }), error => error.statusCode === 409 && error.retryable === false);
    assert.equal(submitted, false);
  });

function admission(body) {
  let response, operation, reads = 0, enqueued = 0;
  const received = [];
  const handler = createGenerationJobApiHandler({
    generationJobs: { enqueue(_id, _meta, run) { operation = run; enqueued += 1; return { id: body.jobId }; } },
    generationService: { async executeForMode(mode, value) { received.push({ mode, input: value }); return {}; } },
    prepareEffectBeautificationLighting: value => prepareEffectBeautificationLightingInput(value, {
      loadAssets: async () => { reads += 1; return { presets: [preset] }; },
    }),
    readJson: async () => body,
    sendJson(_res, status, value) { response = { status, value }; },
  });
  return { received, get response() { return response; }, get reads() { return reads; }, get enqueued() { return enqueued; },
    submit: () => handler({ method: "POST" }, {}, "/api/generation-jobs"), run: () => operation(() => {}) };
}
const body = (sharedInput = {}, items = [{ input: {} }], featureMode = "effectBeautification") => ({
  jobId: "generation-beautify-lighting123456", featureMode, sharedInput: { modelKey: "gptImage2", ...sharedInput }, items,
});

test("实际运行目录声明美化光影能力，新增卡片跨模型入队去重冻结并强制低自然", async () => {
  const capabilities = supportedGenerationFeatureCapabilities();
  assert.equal(capabilities.effectBeautification.promptLighting, true);
  assert.ok(Object.isFrozen(capabilities.effectBeautification));
  const source = body({ effectBeautificationLighting: { ...selection }, effectBeautification: { intensity: "high", tone: "cool" } },
    [{ input: { modelKey: "gptImage2" } }, { input: { modelKey: "seedream5" } }]);
  const h = admission(source);
  await h.submit();
  assert.equal(h.response.status, 202);
  assert.equal(h.reads, 1);
  source.sharedInput.effectBeautificationLighting.version = 999;
  await h.run();
  for (const { input: value } of h.received) {
    assert.deepEqual(value.effectBeautificationLighting, selection);
    assert.deepEqual(value.effectBeautification, { intensity: "low", tone: "natural" });
  }
});

test("旧六档与显式空覆盖不读库，新卡片失效/跨功能/夹带图片零入队", async () => {
  for (const source of [body({ effectBeautification: { intensity: "high", tone: "cool" } }),
    body({ effectBeautificationLighting: selection }, [{ input: { effectBeautificationLighting: null } }])]) {
    const h = admission(source);
    await h.submit();
    assert.equal(h.response.status, 202);
    assert.equal(h.reads, 0);
  }
  for (const source of [body({ effectBeautificationLighting: { ...selection, version: 4 } }),
    body({ effectBeautificationLighting: selection }, [{ input: { lightingReferenceImages: [image] } }]),
    body({ effectBeautificationLighting: selection }, [{ input: {} }], "free")]) {
    const h = admission(source);
    await h.submit();
    assert.ok([400, 409].includes(h.response.status));
    assert.equal(h.enqueued, 0);
  }
});

test("直接生成入口也隔离美化光影，Beta原有JSON快照与版本摘要包含卡片身份", () => {
  const service = createGenerationService({});
  assert.throws(() => service.executeForMode("free", { effectBeautificationLighting: selection }), /仅支持效果图美化/);
  const value = { ...input, effectBeautificationLighting: selection };
  assert.deepEqual(betaSceneParameters(value).effectBeautificationLighting, selection);
  assert.deepEqual(betaConfigSnapshot(value).effectBeautificationLighting, selection);
  assert.equal(betaResultVersion({ prompt: { code: EFFECT_BEAUTIFICATION_LIGHTING_IDENTITY.code, version: 1 },
    request: { effectBeautificationLighting: { preset } } }), "effect-beautification-lighting@v1 · blue-hour@v5");
});

test("Beta新增光影跨样本模型只准备一次且入队冻结，失效光影零建档零生成", async () => {
  let operation, reads = 0, enqueued = 0;
  const generated = [], archived = [];
  const service = createBetaRunnerService({
    baseStore: {
      async beginRun({ item }) { archived.push(structuredClone(item.input)); return { recordId: item.runId }; },
      async completeRun(recordId) { return { recordId }; }, async failRun() {},
    },
    generationService: { async executeForMode(mode, value) { generated.push({ mode, input: value }); return { images: [] }; } },
    prepareEffectBeautificationLighting: value => prepareEffectBeautificationLightingInput(value, {
      loadAssets: async () => { reads += 1; return { presets: [preset] }; },
    }),
    jobs: { get() { return null; }, enqueue(_id, _input, run) { operation = run; enqueued += 1; return {}; } },
  });
  const batch = { batchId: "BETA-beautify-lighting", jobId: "beta-beautify-lighting123456", featureMode: "effectBeautification",
    testTime: "2026-11-03 14:03:21", items: ["gptImage2", "seedream5"].map((modelKey, index) => ({
      caseId: `CASE-${index}`, runId: `RUN-beautify-lighting-${index}`, input: { ...input, modelKey,
        effectBeautificationLighting: { ...selection }, effectBeautification: { intensity: "high", tone: "cool" } },
    })) };
  await service.start(batch);
  assert.equal(reads, 1);
  assert.equal(enqueued, 1);
  batch.items[0].input.effectBeautificationLighting.version = 999;
  await operation(() => {});
  assert.equal(generated.length, 2);
  for (const { mode, input: value } of generated) {
    assert.equal(mode, "effectBeautification");
    assert.deepEqual(value.effectBeautificationLighting, selection);
    assert.deepEqual(value.effectBeautification, { intensity: "low", tone: "natural" });
  }
  assert.deepEqual(archived.map(value => value.effectBeautificationLighting), [selection, selection]);
  await assert.rejects(() => service.start({ ...batch, jobId: "beta-beautify-lighting999999" }), error => error.statusCode === 409);
  assert.equal(enqueued, 1);
  assert.equal(archived.length, 2);
  assert.throws(() => service.start({ ...batch, featureMode: "free", jobId: "beta-beautify-lighting000000" }), /仅支持效果图美化/);
});

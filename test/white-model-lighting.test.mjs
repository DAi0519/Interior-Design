/**
 * [INPUT]: 依赖白模光影领域层、设计工作流、真实图片校验及内存Agent/出图/光影库/缓存替身
 * [OUTPUT]: 对外提供自动兼容、两种风格路径的纯词整合、单图出图、缓存隔离与失效卡片零调用保障
 * [POS]: test 的白模光影集成回归，不调用飞书、收费模型或GPU
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";
import { normalizeWhiteModelLighting, prepareWhiteModelLightingInput, resolveWhiteModelLightingInput } from "../src/white-model-lighting.mjs";
import { buildSmartDefaultPromptAgentInput, executeWhiteModelWorkflow } from "../src/white-model-workflow.mjs";
import { createAsyncTtlCache } from "../src/runtime-cache.mjs";

const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z7JkAAAAASUVORK5CYII=";
const image = { dataUrl: png, name: "white.png", type: "image/png", size: Buffer.from(png.split(",")[1], "base64").length };
const selection = { presetId: "recGolden", version: 3, sha256: "a".repeat(64) };
const card = { id: selection.presetId, code: "golden-window-sun", name: "金色夕照", version: 3,
  sha256: selection.sha256, prompt: "[Atmosphere and tonal baseline]\nGolden late afternoon.\n[Lighting arrangement]\nLow directional sun.\n[Color temperature and exposure]\nWarm highlights, readable shadows." };
const generated = { generation_requirement: "按白模材质化", scene_preservation: "保留白模空间与家具", visual_application: {
  materials: "哑光木材", colors: "米白与原木", photography: "Golden late afternoon, low directional sun." } };
const systemPrompt = "ORIGINAL_SYSTEM_PROMPT 支持 white_model_lighting_target";

function harness() {
  const calls = { agent: [], images: [], assets: [], sync: [] };
  const dependencies = {
    availableModels: [{ id: "doubao-seed-1.8" }],
    client: { async generatePrompt(request) { calls.agent.push(request); return { text: JSON.stringify(generated) }; } },
    imageClient: { async generateImage(request) { calls.images.push(request); return {
      images: [{ url: png }], transport: "responses", outputFormat: "png" }; } },
    loadAgent: async code => ({ code, name: "白模Agent", version: 1, systemPrompt }),
    loadStyle: async () => ({ code: "cream@v1", name: "奶油风", version: 1, styleDna: { lighting: "cool diffuse daylight" } }),
    loadLightingAssets: async options => { calls.assets.push(options); return { presets: [card] }; },
    promptResultCache: createAsyncTtlCache(),
    scheduleSync: input => { calls.sync.push(input); return { status: "pending" }; },
  };
  const input = { featureMode: "whiteModel", modelKey: "gptImage2", outputFormat: "png",
    promptAgentModelKey: "doubaoVision", smartDefaultAgentVersion: 1, promptAgentVersion: 1,
    renderMode: "smart-default", styleCode: "cream@v1", prompt: "控制高光", resolution: "1K",
    ratio: "4:3", ratioMode: "manual", referenceImages: [image] };
  return { calls, dependencies, input };
}

test("自动模式不读取光影库，Agent输入及提示词复用与省略字段相同", async () => {
  const h = harness();
  h.dependencies.loadLightingAssets = () => { throw new Error("自动不应读库"); };
  const first = await executeWhiteModelWorkflow(h.input, h.dependencies);
  const second = await executeWhiteModelWorkflow({ ...h.input, whiteModelLighting: null }, h.dependencies);
  assert.equal(h.calls.agent.length, 1);
  assert.equal(h.calls.agent[0].userPrompt, buildSmartDefaultPromptAgentInput({ userRequirements: h.input.prompt }));
  assert.equal(first.whiteModelLighting, null);
  assert.equal(second.promptAgent.reused, true);
  assert.deepEqual(h.calls.sync[0].workflow.whiteModelLighting, { mode: "auto", execution: "prompt-only" });
});

for (const renderMode of ["smart-default", "style-dna"]) {
  test(`${renderMode}将所选卡片三段词交给Agent，仍按原JSON单图生成并归档身份`, async () => {
    const h = harness();
    const result = await executeWhiteModelWorkflow({ ...h.input, renderMode, whiteModelLighting: selection,
      ...(renderMode === "smart-default" ? { styleReferenceImages: [image] } : {}) }, h.dependencies);
    assert.equal(h.calls.agent.length, 1);
    const request = h.calls.agent[0];
    assert.equal(request.systemPrompt, systemPrompt);
    assert.ok(request.userPrompt.includes(card.prompt));
    assert.match(request.userPrompt, /本段照明优先于风格参考图、Style DNA/);
    assert.match(request.userPrompt, /用户明确补充的光影要求优先于本预设/);
    assert.match(request.userPrompt, /不新增门窗、灯具或家具/);
    assert.match(request.userPrompt, /既有 visual_application.photography/);
    if (renderMode === "smart-default") assert.equal(request.imageUrls.length, 2);
    else assert.match(request.userPrompt, /cool diffuse daylight/);
    assert.deepEqual(h.calls.assets, [{ forceRefresh: true }]);
    assert.equal(h.calls.images.length, 1);
    assert.equal(h.calls.images[0].images.length, 1);
    assert.equal(h.calls.images[0].images[0].image_url, png);
    assert.equal(h.calls.images[0].prompt, JSON.stringify(generated, null, 2));
    assert.deepEqual(result.whiteModelLighting, selection);
    assert.equal(JSON.stringify(result).includes(card.prompt), false);
    const metadata = h.calls.sync[0].workflow.whiteModelLighting;
    assert.equal(metadata.execution, "prompt-only");
    assert.equal(metadata.preset.name, "金色夕照");
    assert.equal(metadata.preset.sha256, selection.sha256);
    assert.match(metadata.promptSha256, /^[a-f0-9]{64}$/);
    assert.equal(h.calls.sync[0].referenceImages.length, 1);
  });
}

test("切换光影与返回自动使用不同缓存，同卡重复才复用", async () => {
  const h = harness();
  const run = lighting => executeWhiteModelWorkflow({ ...h.input, whiteModelLighting: lighting }, h.dependencies);
  await run(null);
  await run(selection);
  assert.equal((await run(selection)).promptAgent.reused, true);
  assert.equal((await run(null)).promptAgent.reused, true);
  assert.equal(h.calls.agent.length, 2);
  assert.equal(h.calls.images.length, 4);
  const next = { ...selection, presetId: "recCool", sha256: "b".repeat(64) };
  h.dependencies.loadLightingAssets = async () => ({ presets: [{ ...card, id: next.presetId, sha256: next.sha256 }] });
  await run(next);
  assert.equal(h.calls.agent.length, 3);
});

test("卡片下架或版本正文SHA变化时，缓存命中也必须在Agent和出图前阻断", async () => {
  const h = harness();
  await executeWhiteModelWorkflow({ ...h.input, whiteModelLighting: selection }, h.dependencies);
  for (const presets of [[], [{ ...card, version: 4 }], [{ ...card, sha256: "b".repeat(64) }]]) {
    h.dependencies.loadLightingAssets = async () => ({ presets });
    await assert.rejects(executeWhiteModelWorkflow({ ...h.input, whiteModelLighting: selection }, h.dependencies),
      error => error.statusCode === 409 && /更新或下架/.test(error.message));
  }
  assert.equal(h.calls.agent.length, 1);
  assert.equal(h.calls.images.length, 1);
});

test("未声明光影输入协议的历史Agent只能自动，选卡在收费调用前409阻断", async () => {
  const h = harness();
  h.dependencies.loadAgent = async code => ({ code, name: "历史Agent", version: 1, systemPrompt: "always bright, neutral white balance" });
  await assert.rejects(executeWhiteModelWorkflow({ ...h.input, whiteModelLighting: selection }, h.dependencies),
    error => error.statusCode === 409 && /Agent 版本不支持光影/.test(error.message));
  assert.equal(h.calls.agent.length + h.calls.images.length, 0);
  await executeWhiteModelWorkflow(h.input, h.dependencies);
  assert.equal(h.calls.agent.length, 1);
});

test("严格卡片身份、跨功能与专用参考图错误输入不触发Agent或出图", async () => {
  assert.deepEqual(normalizeWhiteModelLighting({ ...selection, sha256: "A".repeat(64) }), selection);
  for (const value of [{ ...selection, prompt: "client prompt" }, { ...selection, version: "3" },
    { ...selection, sha256: "invalid" }, { mode: "auto" }, [], "auto"]) {
    assert.throws(() => normalizeWhiteModelLighting(value), error => error.statusCode === 400);
  }
  const h = harness();
  for (const extra of [{ featureMode: "emptyRoom", roomType: "客厅", whiteModelLighting: selection },
    { whiteModelLighting: selection, lightingReferenceImages: [image] },
    { refinedLighting: { mode: "preset" } }]) {
    await assert.rejects(executeWhiteModelWorkflow({ ...h.input, ...extra }, h.dependencies), error => error.statusCode === 400);
  }
  assert.equal(h.calls.agent.length + h.calls.images.length + h.calls.assets.length, 0);
});

test("入队准备只规范化和验证卡片身份，不信任客户端提示词或下载参考图", async () => {
  const source = { featureMode: "whiteModel", whiteModelLighting: { ...selection } };
  const prepared = await prepareWhiteModelLightingInput(source, { loadAssets: async () => ({ presets: [card] }) });
  assert.deepEqual(prepared.whiteModelLighting, selection);
  assert.notEqual(prepared.whiteModelLighting, source.whiteModelLighting);
  assert.equal(Object.hasOwn(prepared, "prompt"), false);
  const automatic = await resolveWhiteModelLightingInput({}, { loadAssets: () => assert.fail("auto reads library") });
  assert.equal(automatic.prompt, null);
});

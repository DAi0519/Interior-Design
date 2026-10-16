/**
 * [INPUT]: 依赖 node:test/assert、风格转换共享设计工作流、独立 Prompt 配置、任务 API 与运行时缓存的可注入边界
 * [OUTPUT]: 对外提供平台风格/参考图显式两路、缺失来源及旧智能默认阻断、独立 Agent 与版本、空间保护、单图出图、缓存隔离、严格输出、入队及 Schema 阻断回归保障
 * [POS]: test 的风格转换服务端集成测试，模型、飞书与后台任务均使用内存替身
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";

import { createGenerationJobApiHandler } from "../src/generation-job-api.mjs";
import { createGenerationJobRegistry } from "../src/generation-jobs.mjs";
import { createGenerationService } from "../src/generation-service.mjs";
import { STYLE_TRANSFER_PROMPT_CONFIG } from "../src/prompt-agent.mjs";
import { createAsyncTtlCache } from "../src/runtime-cache.mjs";
import { executeWhiteModelWorkflow } from "../src/white-model-workflow.mjs";

const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z7JkAAAAASUVORK5CYII=";
const agentOutput = {
  scene_preservation: "Preserve the original room structure, camera, layout and major furniture positions.",
  visual_application: { colors: "Muted warm neutrals.", materials: "Natural oak and matte plaster.", photography: "Keep the source camera and perspective." },
  generation_requirement: "Restyle furniture silhouettes and soft furnishings without changing the layout.",
};
const image = (dataUrl = png, name = "space.png") => ({
  dataUrl, name, size: Buffer.from(dataUrl.split(",")[1], "base64").length, type: "image/png",
});
const input = (overrides = {}) => ({
  featureMode: "styleTransfer", modelKey: "gptImage2", outputFormat: "png", prompt: "采用温暖木色",
  promptAgentModelKey: "gemini3pro", ratio: "4:3", ratioMode: "auto", referenceImages: [image()],
  renderMode: "style-dna", resolution: "1K", styleCode: "modern@v2", styleTransferPromptAgentVersion: 2,
  ...overrides,
});

function harness({ output = agentOutput, promptResultCache = null } = {}) {
  const calls = { agents: [], images: [], prompts: [], styles: [], sync: [] };
  return { calls, dependencies: {
    availableModels: [{ id: "gemini-3.1-pro-preview" }],
    client: { generatePrompt: async (request) => { calls.prompts.push(request); return { text: JSON.stringify(output) }; } },
    imageClient: { generateImage: async (request) => { calls.images.push(request); return { created: 1, images: [{ url: png }], outputFormat: "png", transport: "responses" }; } },
    loadAgent: async (code, options) => { calls.agents.push({ code, options }); return { code, name: code, systemPrompt: "server-only", version: options.version || 1 }; },
    loadStyle: async (code) => { calls.styles.push(code); return { code, name: "现代简约", styleDna: { materials: "oak" }, version: 2 }; },
    promptResultCache,
    scheduleSync: (value) => { calls.sync.push(value); return { generationId: "style-transfer-1", status: "pending" }; },
  } };
}

test("平台风格通过独立风格转换 Agent 与指定版本融合，复用原比例出图和批次归档", async () => {
  const { calls, dependencies } = harness();
  const result = await executeWhiteModelWorkflow(input({ batchCount: 2, batchId: "style-transfer-batch", batchIndex: 1 }), dependencies);
  assert.deepEqual(calls.agents, [{ code: "style-transfer-fusion", options: { config: STYLE_TRANSFER_PROMPT_CONFIG, version: 2 } }]);
  assert.deepEqual(calls.styles, ["modern@v2"]);
  assert.match(calls.prompts[0].userPrompt, /空间图风格转换任务/);
  assert.match(calls.prompts[0].userPrompt, /严格保留图片 1 的空间结构、视角和布局/);
  assert.match(calls.prompts[0].userPrompt, /style_dna:\n\{"materials":"oak"\}/);
  assert.match(calls.prompts[0].userPrompt, /采用温暖木色/);
  assert.equal(calls.prompts[0].imageUrl, png);
  assert.equal(calls.images[0].images.length, 1);
  assert.equal(result.request.ratio, "1:1");
  assert.equal(result.featureMode, "styleTransfer");
  assert.equal(result.style.code, "modern@v2");
  assert.equal(calls.sync[0].workflow.feature, "style-transfer");
  assert.equal(calls.sync[0].workflow.agentCode, "style-transfer-fusion");
  assert.equal(calls.sync[0].workflow.styleVersion, 2);
  assert.equal(calls.sync[0].workflow.batchCount, 2);
  assert.equal(calls.sync[0].sourcePrompt, "采用温暖木色");
  assert.equal(JSON.stringify(result).includes("server-only"), false);
  assert.equal(JSON.stringify(result).includes(agentOutput.generation_requirement), false);
});

test("参考图只进入风格转换参考图 Agent，不读取风格库且最终出图只接收空间主图", async () => {
  const reference = "data:image/png;base64,c3R5bGU=";
  const { calls, dependencies } = harness();
  const result = await executeWhiteModelWorkflow(input({
    renderMode: "style-reference", styleReferenceImages: [image(reference, "style.png")],
    styleTransferReferenceVersion: 3, roomType: "其他", roomTypeDetail: "旧表单值", furnitureSelection: { items: ["沙发"] },
  }), dependencies);
  assert.deepEqual(calls.agents, [{ code: "style-transfer-reference", options: { config: STYLE_TRANSFER_PROMPT_CONFIG, version: 3 } }]);
  assert.equal(calls.styles.length, 0);
  assert.deepEqual(calls.prompts[0].imageUrls, [png, reference]);
  assert.match(calls.prompts[0].userPrompt, /图片 2 是风格参考图/);
  assert.match(calls.prompts[0].userPrompt, /所有字符串值使用英文/);
  assert.equal(calls.prompts[0].userPrompt.includes("旧表单值"), false);
  assert.equal(calls.prompts[0].userPrompt.includes("style_dna:"), false);
  assert.deepEqual(calls.images[0].images.map((entry) => entry.image_url), [png]);
  assert.equal(result.promptAgent.inputImageCount, 2);
  assert.equal(result.style, null);
  assert.equal(calls.sync[0].referenceImages.length, 1);
  assert.equal(calls.sync[0].styleReferenceImages[0].imageUrl, reference);
  assert.equal(calls.sync[0].workflow.styleReferenceUsed, true);
  assert.equal(calls.sync[0].workflow.renderMode, "style-reference");
  assert.equal(calls.sync[0].workflow.selectionName, "参考图风格");
  assert.equal("roomType" in calls.sync[0].workflow, false);
  assert.equal("furnitureSelection" in calls.sync[0].workflow, false);
});

test("风格转换沿用 Flux 最终出图矩阵与负向 Prompt，融合阶段继续走独立客户端", async () => {
  const { calls, dependencies } = harness();
  const result = await executeWhiteModelWorkflow(input({ modelKey: "aiTextureEnhancement", resolution: "2K", negativePrompt: "oversaturated colors" }), dependencies);
  assert.equal(calls.prompts[0].model, "gemini-3.1-pro-preview");
  assert.equal(calls.images[0].model, "comfyui:ai-texture-enhancement");
  assert.equal(calls.images[0].negative_prompt, "oversaturated colors");
  assert.equal(calls.images[0].images.length, 1);
  assert.equal(result.request.provider, "comfyui");
  assert.equal(calls.sync[0].workflow.provider, "comfyui");
});

test("风格转换在任何模型调用前拒绝缺失/多主图与混合风格来源", async () => {
  const { calls, dependencies } = harness();
  await assert.rejects(executeWhiteModelWorkflow(input({ referenceImages: [] }), dependencies), /需要且只允许 1 张空间图/);
  await assert.rejects(executeWhiteModelWorkflow(input({ referenceImages: [image(), image()] }), dependencies), /需要且只允许 1 张空间图/);
  await assert.rejects(executeWhiteModelWorkflow(input({ styleReferenceImages: [image()] }), dependencies), /风格转换平台风格模式不接收风格参考图/);
  await assert.rejects(executeWhiteModelWorkflow(input({ renderMode: "style-reference", styleReferenceImages: [image(), image()] }), dependencies), /最多上传 1 张/);
  assert.equal(calls.agents.length + calls.prompts.length + calls.images.length, 0);
});

test("风格转换缺少明确风格来源或沿用旧智能默认时在读取 Agent 和调用模型前阻断", async () => {
  const { calls, dependencies } = harness();
  for (const renderMode of [undefined, null, "", "auto", "smart-default"]) {
    await assert.rejects(executeWhiteModelWorkflow(input({ renderMode, styleCode: null }), dependencies), /风格转换.*(?:必须选择平台风格|不支持智能默认)/);
  }
  await assert.rejects(executeWhiteModelWorkflow(input({ styleCode: "  " }), dependencies), /必须选择一个平台风格/);
  await assert.rejects(executeWhiteModelWorkflow(input({ renderMode: "style-reference", styleReferenceImages: [] }), dependencies), /必须上传 1 张风格参考图/);
  await assert.rejects(executeWhiteModelWorkflow(input({ renderMode: "smart-default", styleReferenceImages: [image()] }), dependencies), /不支持智能默认/);
  assert.equal(calls.agents.length + calls.styles.length + calls.prompts.length + calls.images.length, 0);
});

test("风格转换 Prompt 缓存按功能、参考图和主动重算隔离", async () => {
  const { calls, dependencies } = harness({ promptResultCache: createAsyncTtlCache() });
  const sameAgent = async () => ({ code: "same-test-agent", systemPrompt: "same", version: 1 });
  dependencies.loadAgent = sameAgent;
  const request = input({ renderMode: "style-reference", styleReferenceImages: [image()] });
  await executeWhiteModelWorkflow(request, dependencies);
  const reused = await executeWhiteModelWorkflow(request, dependencies);
  await executeWhiteModelWorkflow({ ...request, featureMode: "whiteModel", renderMode: "smart-default" }, dependencies);
  await executeWhiteModelWorkflow({ ...request, styleReferenceImages: [image("data:image/png;base64,b3RoZXI=")] }, dependencies);
  await executeWhiteModelWorkflow({ ...request, forcePromptRegeneration: true }, dependencies);
  assert.equal(reused.promptAgent.reused, true);
  assert.equal(calls.prompts.length, 4);
  assert.equal(calls.images.length, 5);
});

test("风格转换两种模式均阻止不符合空间保护 JSON 合同的 Prompt 进入出图", async () => {
  for (const renderMode of ["style-dna", "style-reference"]) {
    const output = { ...agentOutput };
    delete output.scene_preservation;
    const { calls, dependencies } = harness({ output });
    await assert.rejects(executeWhiteModelWorkflow(input({ renderMode, ...(renderMode === "style-reference" ? { styleReferenceImages: [image()] } : {}) }), dependencies), /缺少必需字段/);
    assert.equal(calls.images.length, 0);
  }
});

test("显式功能路由不接受旧空房表单覆盖，后台风格转换先校验飞书合同再入队", async () => {
  const service = createGenerationService({ requireApiKey: () => "test", getSessionModelCatalog: async () => [], imageClientForModel: () => ({}) });
  await assert.rejects(service.executeForMode("styleTransfer", { featureMode: "emptyRoom" }), /风格转换需要且只允许 1 张空间图/);
  const registry = createGenerationJobRegistry();
  let routed;
  let verified = false;
  let response;
  const handler = createGenerationJobApiHandler({
    generationJobs: registry,
    generationService: { executeForMode: async (mode, value) => { assert.equal(verified, true); routed = { mode, value }; return { images: [] }; } },
    readJson: async () => ({ featureMode: "styleTransfer", jobId: "generation-styletransfer1", sharedInput: { styleTransferReferenceVersion: 3, styleReferenceImages: [image()] }, items: [{ input: input({ renderMode: "style-reference" }) }] }),
    sendJson: (_response, status) => { response = status; },
    verifySyncContract: async () => { verified = true; },
  });
  await handler({ method: "POST" }, {}, "/api/generation-jobs");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(response, 202);
  assert.equal(routed.mode, "styleTransfer");
  assert.equal(routed.value.styleTransferReferenceVersion, 3);
  assert.equal(routed.value.styleReferenceImages.length, 1);
  assert.equal(registry.get("generation-styletransfer1").status, "success");
});

test("风格转换飞书字段不兼容时 409 阻止入队与模型执行", async () => {
  let called = false;
  let response;
  const handler = createGenerationJobApiHandler({
    generationJobs: { enqueue() { called = true; } }, generationService: {},
    readJson: async () => ({ featureMode: "styleTransfer", jobId: "generation-styletransfer2", items: [{ input: input() }] }),
    sendJson: (_response, statusCode, body) => { response = { statusCode, body }; },
    verifySyncContract: async () => { throw new Error("功能缺少风格转换"); },
  });
  await handler({ method: "POST" }, {}, "/api/generation-jobs");
  assert.equal(response.statusCode, 409);
  assert.match(response.body.error, /已阻止生成.*风格转换/);
  assert.equal(called, false);
});

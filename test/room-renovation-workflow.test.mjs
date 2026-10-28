/**
 * [INPUT]: 依赖node:test/assert、sharp真实PNG、旧房独立Prompt配置与共享设计流程、任务API/注册表、提示词缓存和飞书字段投影
 * [OUTPUT]: 覆盖旧房独立Agent/指定版本、不跨表回退、正文及输出不被代码覆盖、三种风格输入/单次出图归档、独立负向与归档投影、跨路由身份冒用阻断、空房白模不变及缓存隔离/版本失效
 * [POS]: test 的旧房与空房共享链路集成测试，模型与飞书均使用内存替身，不调用收费服务或写真实 Base
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

import { AI_TEXTURE_DEFAULT_NEGATIVE_PROMPT, AI_TEXTURE_ROOM_RENOVATION_NEGATIVE_PROMPT } from "../src/ai-texture-workflow.mjs";
import { createGenerationJobApiHandler } from "../src/generation-job-api.mjs";
import { createGenerationJobRegistry, runGenerationJobBatch } from "../src/generation-jobs.mjs";
import { createGenerationService } from "../src/generation-service.mjs";
import { buildRecordFields } from "../src/lark-sync.mjs";
import { EMPTY_ROOM_PROMPT_CONFIG, ROOM_RENOVATION_PROMPT_CONFIG } from "../src/prompt-agent.mjs";
import { createAsyncTtlCache } from "../src/runtime-cache.mjs";
import { executeWhiteModelWorkflow } from "../src/white-model-workflow.mjs";

const ORIGINAL_SCENE = "Keep the original sofa, rug and furniture positions.";
const RENOVATION_SCENE = "Preserve architectural structure and camera only; redesign furniture, layout and soft furnishings.";
const RENOVATION_SYSTEM_PROMPT = "Independent renovation System Prompt from Feishu";

async function image(color) {
  const bytes = await sharp({ create: { width: 64, height: 48, channels: 3, background: color } }).png().toBuffer();
  return { dataUrl: `data:image/png;base64,${bytes.toString("base64")}`, name: `${color}.png` };
}

async function fixture() {
  const [original, designed, styleReference] = await Promise.all([image("red"), image("blue"), image("green")]);
  const requests = [], prompts = [], archives = [], agents = [];
  const input = { featureMode: "emptyRoom", designScenario: "room-renovation", roomType: "客厅", furnitureSelection: { items: ["沙发", "茶几"], other: "" },
    renderMode: "smart-default", promptAgentModelKey: "gemini3pro", modelKey: "gptImage2",
    referenceImages: [original], resolution: "1K", outputFormat: "png", prompt: "暖色调" };
  const options = {
    availableModels: [{ id: "gemini-3.1-pro-preview" }],
    client: { async generatePrompt(request) {
      prompts.push(request);
      return { text: JSON.stringify({ scene_preservation: request.systemPrompt === RENOVATION_SYSTEM_PROMPT ? RENOVATION_SCENE : ORIGINAL_SCENE,
        visual_application: { materials: "Oak", colors: "Warm white", photography: "Daylight" },
        generation_requirement: "Photorealistic" }) };
    } },
    imageClient: { async generateImage(request) {
      requests.push(request);
      return { images: [{ url: designed.dataUrl }], outputFormat: "png", transport: "responses" };
    } },
    loadAgent: async (code, lookup) => {
      agents.push({ code, lookup });
      const renovation = code.startsWith("room-renovation-");
      return { code, version: renovation ? 1 : 34, name: renovation ? "旧房 Agent" : "空房 Agent",
        systemPrompt: renovation ? RENOVATION_SYSTEM_PROMPT : "empty room" };
    },
    loadStyle: async code => ({ code, name: "奶油法式", version: 1, styleDna: { palette: "warm neutral" } }),
    scheduleSync(archive) { archives.push(archive); return { generationId: `generation-${archives.length}`, status: "pending" }; },
  };
  return { original, designed, styleReference, input, options, requests, prompts, archives, agents };
}

test("旧房独立Agent沿用单次设计，原图直入并归档实际Agent版本且无清空元数据", async () => {
  const f = await fixture();
  const result = await executeWhiteModelWorkflow(f.input, f.options);
  assert.equal(f.prompts.length, 1);
  assert.equal(f.requests.length, 1);
  assert.equal(f.archives.length, 1);
  assert.equal(f.prompts[0].imageUrl, f.original.dataUrl);
  assert.equal(f.requests[0].images[0].image_url, f.original.dataUrl);
  assert.equal(f.archives[0].referenceImages[0].imageUrl, f.original.dataUrl);
  assert.equal(f.archives[0].resultImage.url, f.designed.dataUrl);
  assert.equal(result.images[0].url, f.designed.dataUrl);
  assert.equal(result.featureMode, "emptyRoom");
  assert.equal(result.designScenario, "room-renovation");
  assert.equal(result.roomRenovation, undefined);
  assert.equal(f.archives[0].workflow.roomRenovation, undefined);
  assert.equal(f.agents[0].code, "room-renovation-smart-default");
  assert.equal(f.agents[0].lookup.config, ROOM_RENOVATION_PROMPT_CONFIG);
  assert.equal(f.archives[0].sourcePrompt, f.input.prompt);
  assert.equal(f.archives[0].workflow.designScenario, "room-renovation");
  assert.equal(f.archives[0].workflow.agentCode, "room-renovation-smart-default");
  assert.equal(f.archives[0].workflow.agentVersion, 1);
  assert.equal(f.archives[0].workflow.renovationPromptVersion, undefined);
  for (const value of ["客厅", "沙发", "暖色调"]) assert.ok(f.prompts[0].userPrompt.includes(value));
  const fields = buildRecordFields({ ...f.archives[0], actualSize: "64x48" });
  assert.equal(fields["功能"], "空房设计");
  assert.equal(fields["尺寸"], "64x48");
  assert.equal(fields["最终 Prompt"], f.requests[0].prompt);
  assert.doesNotMatch(fields["标题"], /旧房改造.*(?:清空|设计)/);
  assert.equal(JSON.parse(fields["生成参数"]).workflow.roomRenovation, undefined);
  assert.equal(JSON.parse(fields["生成参数"]).workflow.designScenario, "room-renovation");
  assert.equal(JSON.parse(fields["生成参数"]).workflow.agentVersion, 1);
});

test("旧房Flux请求和飞书投影使用独立负向，普通空房默认及自定义覆盖保持原合同", async () => {
  for (const scenario of ["renovation", "empty", "custom"]) {
    const f = await fixture();
    Object.assign(f.input, { modelKey: "aiTextureEnhancement" });
    if (scenario === "empty") delete f.input.designScenario;
    if (scenario === "custom") f.input.negativePrompt = "  blur, artifacts  ";
    const expected = scenario === "empty" ? AI_TEXTURE_DEFAULT_NEGATIVE_PROMPT
      : scenario === "custom" ? "blur, artifacts" : AI_TEXTURE_ROOM_RENOVATION_NEGATIVE_PROMPT;
    const mode = scenario === "custom" ? "custom" : "default";
    const result = await executeWhiteModelWorkflow(f.input, f.options);
    assert.equal(f.requests.length, 1);
    assert.equal(f.archives.length, 1);
    assert.equal(f.requests[0].negative_prompt, expected);
    assert.equal(f.requests[0].negative_prompt_mode, mode);
    assert.equal(f.archives[0].workflow.negativePrompt, expected);
    assert.equal(f.archives[0].workflow.negativePromptMode, mode);
    assert.equal(result.request.negativePromptMode, mode);
    const fields = buildRecordFields({ ...f.archives[0], actualSize: "64x48" });
    const archived = JSON.parse(fields["生成参数"]).workflow;
    assert.equal(archived.negativePrompt, expected);
    assert.equal(archived.negativePromptMode, mode);
    assert.equal(archived.designScenario, scenario === "empty" ? undefined : "room-renovation");
  }
});

test("智能默认/参考图/平台风格均读取旧房独立表，系统词和Agent最终JSON不拼接或覆盖", async () => {
  for (const mode of ["smart-default", "reference", "style-dna"]) {
    const f = await fixture();
    if (mode === "reference") f.input.styleReferenceImages = [f.styleReference];
    if (mode === "style-dna") Object.assign(f.input, {
      renderMode: "style-dna", styleCode: "cream-french@v1", roomRenovationPromptAgentVersion: 1,
      emptyRoomPromptAgentVersion: 34,
    });
    else Object.assign(f.input, { roomRenovationSmartDefaultVersion: 1, emptyRoomSmartDefaultVersion: 34 });
    const result = await executeWhiteModelWorkflow(f.input, f.options);
    assert.equal(f.agents[0].code, mode === "style-dna" ? "room-renovation-fusion" : "room-renovation-smart-default");
    assert.equal(f.agents[0].lookup.config, ROOM_RENOVATION_PROMPT_CONFIG);
    assert.equal(f.agents[0].lookup.version, 1);
    assert.match(f.prompts[0].userPrompt, /请执行旧房改造/);
    assert.doesNotMatch(f.prompts[0].userPrompt, /请执行空房|design_scenario/);
    assert.equal(f.prompts[0].systemPrompt, RENOVATION_SYSTEM_PROMPT);
    assert.equal(JSON.parse(f.requests[0].prompt).scene_preservation, RENOVATION_SCENE);
    assert.equal(f.archives[0].finalPrompt, f.requests[0].prompt);
    assert.equal(f.archives[0].sourcePrompt, "暖色调");
    assert.equal(f.archives[0].workflow.designScenario, "room-renovation");
    assert.equal(f.archives[0].workflow.agentVersion, 1);
    if (mode === "reference") assert.deepEqual(f.prompts[0].imageUrls, [f.original.dataUrl, f.styleReference.dataUrl]);
    else assert.equal(f.prompts[0].imageUrl, f.original.dataUrl);
    if (mode === "style-dna") assert.match(f.prompts[0].userPrompt, /warm neutral/);
    assert.equal(f.requests.length, 1);
    assert.equal(f.requests[0].images.length, 1);
    assert.equal(f.requests[0].images[0].image_url, f.original.dataUrl);
    assert.deepEqual(result.furnitureSelection.items, ["沙发", "茶几"]);
    assert.equal(f.archives.length, 1);
  }
});

test("旧两阶段标记仅作为未知字段忽略，单次出图归档并共享空房提示词缓存", async () => {
  const f = await fixture();
  delete f.input.designScenario;
  f.input.prompt = "";
  f.options.promptResultCache = createAsyncTtlCache();
  const ordinary = await executeWhiteModelWorkflow(f.input, f.options);
  for (const marker of [true, false, "true"]) {
    const result = await executeWhiteModelWorkflow({ ...f.input, roomRenovation: marker }, f.options);
    assert.equal(result.promptAgent.reused, true);
    assert.equal(result.roomRenovation, undefined);
  }
  assert.equal(ordinary.promptAgent.reused, false);
  assert.equal(f.prompts.length, 1);
  assert.equal(f.requests.length, 4);
  assert.equal(f.archives.length, 4);
  assert.ok(f.requests.every(request => request.images[0].image_url === f.original.dataUrl));
});

test("旧房与普通空房的同图提示词缓存隔离，旧房自身可复用且不重复调用Agent", async () => {
  const f = await fixture();
  f.options.promptResultCache = createAsyncTtlCache();
  const ordinaryInput = { ...f.input };
  delete ordinaryInput.designScenario;
  const ordinary = await executeWhiteModelWorkflow(ordinaryInput, f.options);
  const renovation = await executeWhiteModelWorkflow(f.input, f.options);
  const reused = await executeWhiteModelWorkflow(f.input, f.options);
  const ordinaryAgain = await executeWhiteModelWorkflow(ordinaryInput, f.options);
  assert.equal(ordinary.promptAgent.reused, false);
  assert.equal(renovation.promptAgent.reused, false);
  assert.equal(reused.promptAgent.reused, true);
  assert.equal(ordinaryAgain.promptAgent.reused, true);
  assert.equal(f.prompts.length, 2);
  assert.equal(f.requests.length, 4);
  assert.equal(f.archives.length, 4);
  assert.equal(f.prompts[0].systemPrompt, "empty room");
  assert.equal(f.agents[0].code, "empty-room-smart-default");
  assert.equal(f.agents[0].lookup.config, EMPTY_ROOM_PROMPT_CONFIG);
  assert.doesNotMatch(f.prompts[0].userPrompt, /design_scenario/);
  assert.equal(JSON.parse(f.requests[0].prompt).scene_preservation, ORIGINAL_SCENE);
  assert.equal(f.requests[1].prompt, f.requests[2].prompt);
  assert.notEqual(f.requests[0].prompt, f.requests[1].prompt);
  assert.equal(f.archives[0].workflow.designScenario, undefined);
  assert.equal(f.archives[0].workflow.renovationPromptVersion, undefined);
});

test("独立表正文或版本修改后重新生成提示词，最终JSON仍保留Agent原文", async () => {
  const f = await fixture();
  f.options.promptResultCache = createAsyncTtlCache();
  let version = 1;
  let systemPrompt = "Editable renovation prompt A";
  let scene = "Editable architectural contract A";
  f.options.loadAgent = async code => ({ code, version, name: "旧房 Agent", systemPrompt });
  f.options.client.generatePrompt = async request => {
    f.prompts.push(request);
    return { text: JSON.stringify({ scene_preservation: scene,
      visual_application: { materials: "Custom oak", colors: "Custom blue", photography: "Evening" },
      generation_requirement: "Custom renovation target" }) };
  };
  await executeWhiteModelWorkflow(f.input, f.options);
  const reused = await executeWhiteModelWorkflow(f.input, f.options);
  assert.equal(reused.promptAgent.reused, true);
  systemPrompt = "Editable renovation prompt B";
  scene = "Editable architectural contract B";
  await executeWhiteModelWorkflow(f.input, f.options);
  version = 2;
  scene = "Editable architectural contract v2";
  await executeWhiteModelWorkflow(f.input, f.options);
  assert.equal(f.prompts.length, 3);
  assert.deepEqual(f.prompts.map(request => request.systemPrompt), [
    "Editable renovation prompt A", "Editable renovation prompt B", "Editable renovation prompt B",
  ]);
  assert.deepEqual(f.requests.map(request => JSON.parse(request.prompt).scene_preservation), [
    "Editable architectural contract A", "Editable architectural contract A",
    "Editable architectural contract B", "Editable architectural contract v2",
  ]);
  assert.ok(f.archives.every((archive, index) => archive.finalPrompt === f.requests[index].prompt));
  assert.equal(f.archives.at(-1).workflow.agentVersion, 2);
});

test("旧房独立Agent下架或缺失时前置失败，不回退空房或白模", async () => {
  for (const renderMode of ["smart-default", "style-dna"]) {
    const f = await fixture();
    Object.assign(f.input, { renderMode, styleCode: "cream-french@v1" });
    f.options.loadAgent = async (code, options) => {
      f.agents.push({ code, options });
      const error = new Error("旧房独立 Prompt 未上架");
      error.statusCode = 409;
      throw error;
    };
    await assert.rejects(executeWhiteModelWorkflow(f.input, f.options), error => error.statusCode === 409);
    assert.deepEqual(f.agents.map(agent => agent.code), [renderMode === "smart-default"
      ? "room-renovation-smart-default" : "room-renovation-fusion"]);
    assert.equal(f.agents[0].options.config, ROOM_RENOVATION_PROMPT_CONFIG);
    assert.equal(f.prompts.length, 0);
    assert.equal(f.requests.length, 0);
    assert.equal(f.archives.length, 0);
  }
});

test("普通白模不携带旧房约束，保留原Agent及最终Prompt", async () => {
  const f = await fixture();
  delete f.input.designScenario;
  f.input.featureMode = "whiteModel";
  await executeWhiteModelWorkflow(f.input, f.options);
  assert.equal(f.agents[0].code, "white-model-smart-default");
  assert.equal(f.prompts[0].systemPrompt, "empty room");
  assert.doesNotMatch(f.prompts[0].userPrompt, /design_scenario/);
  assert.equal(JSON.parse(f.requests[0].prompt).scene_preservation, ORIGINAL_SCENE);
  assert.equal(f.archives[0].workflow.designScenario, undefined);
});

test("未知设计意图或非空房携带旧房意图在Agent和出图前以400拒绝", async () => {
  for (const extra of [{ designScenario: "unsupported" }, { featureMode: "whiteModel" }, { featureMode: "styleTransfer" }]) {
    const f = await fixture();
    await assert.rejects(executeWhiteModelWorkflow({ ...f.input, ...extra }, f.options), error => error.statusCode === 400);
    assert.equal(f.agents.length, 0);
    assert.equal(f.prompts.length, 0);
    assert.equal(f.requests.length, 0);
    assert.equal(f.archives.length, 0);
  }
});

test("房型/主图/Agent权限/版本/出图参数不合法时不提交图像请求", async () => {
  for (const kind of ["room", "source", "access", "agent", "resolution"]) {
    const f = await fixture();
    if (kind === "room") f.input.roomType = "";
    if (kind === "source") f.input.referenceImages = [];
    if (kind === "access") f.options.availableModels = [];
    if (kind === "agent") f.options.loadAgent = async () => { throw new Error("所选版本已下架"); };
    if (kind === "resolution") f.input.resolution = "invalid";
    await assert.rejects(executeWhiteModelWorkflow(f.input, f.options));
    assert.equal(f.requests.length, 0);
    assert.equal(f.archives.length, 0);
    if (kind !== "resolution") assert.equal(f.prompts.length, 0);
  }
});

test("Agent或单次设计失败保留原错误，不重试或暴露清空中间产物", async () => {
  for (const phase of ["prompt", "image"]) {
    const f = await fixture();
    let calls = 0;
    const failure = async () => { calls += 1; throw new Error(`${phase} timeout`); };
    if (phase === "prompt") f.options.client.generatePrompt = failure;
    else f.options.imageClient.generateImage = failure;
    const outcomes = await runGenerationJobBatch({ items: [{ key: "gptImage2" }],
      execute: () => executeWhiteModelWorkflow(f.input, f.options) });
    assert.equal(calls, 1);
    assert.equal(f.archives.length, 0);
    assert.equal(outcomes[0].status, "rejected");
    assert.deepEqual(outcomes[0].reason, { message: `${phase} timeout` });
  }
});

test("统一服务的空房路由忽略旧标记并使用空房自身准入", async () => {
  let imageRequests = 0;
  const service = createGenerationService({ requireApiKey: () => "test-key",
    getSessionModelCatalog: async () => [{ id: "gemini-3.1-pro-preview" }],
    imageClientForModel: () => ({ generateImage() { imageRequests += 1; } }),
  });
  await assert.rejects(service.executeForMode("emptyRoom", { roomRenovation: true, roomType: "" }), /空房设计必须选择房间类型/);
  assert.equal(imageRequests, 0);
});

test("自由直调和显式其他功能路由不能借输入空房身份冒用旧房负向", async () => {
  const f = await fixture();
  let imageRequests = 0;
  let syncRequests = 0;
  const service = createGenerationService({ requireApiKey: () => "test-key",
    getSessionModelCatalog: async () => [{ id: "gemini-3.1-pro-preview" }],
    imageClientForModel: () => ({ async generateImage(request) {
      imageRequests += 1;
      assert.equal(request.negative_prompt, AI_TEXTURE_DEFAULT_NEGATIVE_PROMPT);
      return { images: [{ url: f.designed.dataUrl }], transport: "comfyui-workflow" };
    } }),
    scheduleGenerationSync() { syncRequests += 1; return { status: "pending" }; },
  });
  const forged = { ...f.input, modelKey: "aiTextureEnhancement" };
  await assert.rejects(service.executeFree(forged), error => error.statusCode === 400);
  for (const mode of ["free", "whiteModel", "styleTransfer"]) {
    await assert.rejects(service.executeForMode(mode, forged), error => error.statusCode === 400);
  }
  assert.equal(imageRequests, 0);
  assert.equal(syncRequests, 0);
  const ordinary = { ...forged };
  delete ordinary.designScenario;
  await service.executeFree(ordinary);
  await service.executeForMode("free", ordinary);
  assert.equal(imageRequests, 2);
  assert.equal(syncRequests, 2);
  assert.equal(forged.featureMode, "emptyRoom");
});

async function settledJob(jobs, jobId) {
  for (let attempts = 0; attempts < 100; attempts += 1) {
    const job = jobs.get(jobId);
    if (job.status !== "running") return job;
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.fail("内存生成任务未结算");
}

test("旧房请求作为普通空房任务执行，每项只生图归档一次且无清空阶段", async () => {
  const f = await fixture();
  const jobs = createGenerationJobRegistry();
  const body = { jobId: "generation-renovation-12345678", featureMode: "emptyRoom", batchId: "renovation-batch",
    sharedInput: f.input, items: [1, 2].map(index => ({ key: `gptImage2-${index}`, input: {} })) };
  let response, checked = 0;
  const handler = createGenerationJobApiHandler({ generationJobs: jobs,
    generationService: { async executeForMode(mode, input, options) {
      assert.equal(checked, 1);
      assert.equal(mode, "emptyRoom");
      assert.equal(input.designScenario, "room-renovation");
      // -------- 普通空房任务不采纳历史两阶段回调 --------
      options.onProgress({ phase: "clearing", message: "不应出现的旧清空阶段" });
      return executeWhiteModelWorkflow(input, f.options);
    } }, readJson: async () => body,
    sendJson(_, statusCode, value) { response = { statusCode, ...value }; },
    verifySyncContract: async () => { checked += 1; },
  });
  await handler({ method: "POST" }, {}, "/api/generation-jobs");
  assert.equal(response.statusCode, 202);
  assert.equal(response.job.featureMode, "emptyRoom");
  assert.equal(response.job.stages, null);
  const job = await settledJob(jobs, body.jobId);
  assert.equal(job.status, "success");
  assert.equal(job.stages, null);
  assert.equal(job.completed, 2);
  assert.equal(f.requests.length, 2);
  assert.equal(f.archives.length, 2);
  assert.ok(job.result.outcomes.every(outcome => outcome.status === "fulfilled"
    && outcome.value.designScenario === "room-renovation" && !outcome.value.roomRenovation));
  assert.deepEqual(f.archives.map(archive => archive.workflow.batchIndex).sort(), [1, 2]);
});

test("旧标记请求不启用两阶段，Schema失败仍在任务入队前阻断", async () => {
  const f = await fixture();
  const jobs = createGenerationJobRegistry();
  const body = { jobId: "generation-renovation-87654321", featureMode: "emptyRoom",
    sharedInput: { ...f.input, roomRenovation: true }, items: [{ key: "gptImage2", input: {} }] };
  let response, schemaFailure = true;
  const handler = createGenerationJobApiHandler({ generationJobs: jobs,
    generationService: { executeForMode: (_, input) => executeWhiteModelWorkflow(input, f.options) },
    readJson: async () => body, sendJson(_, statusCode, value) { response = { statusCode, ...value }; },
    verifySyncContract: async () => { if (schemaFailure) throw new Error("Schema 漂移"); },
  });
  await handler({ method: "POST" }, {}, "/api/generation-jobs");
  assert.equal(response.statusCode, 409);
  assert.equal(jobs.get(body.jobId), null);
  assert.equal(f.requests.length, 0);
  schemaFailure = false;
  await handler({ method: "POST" }, {}, "/api/generation-jobs");
  assert.equal(response.statusCode, 202);
  const job = await settledJob(jobs, body.jobId);
  assert.equal(job.stages, null);
  assert.equal(f.requests.length, 1);
  assert.equal(f.archives.length, 1);
});

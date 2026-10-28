/**
 * [INPUT]: 依赖 node:test/assert、共享精模模板目录、双Prompt身份准备/编译器、正式精模工作流与日常任务API
 * [OUTPUT]: 对外提供新模块资产单SHA/默认MAIN/选项正文/模块归档、旧双资产兼容与身份漂移零出图测试
 * [POS]: test 的精模渲染模板跨层合同测试，飞书与图像客户端均为内存替身
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  REFINED_RENDER_PRESETS,
  REFINED_RENDER_TIMES,
  REFINED_RENDER_TONES,
  REFINED_RENDER_WEATHERS,
  normalizeRefinedRender,
  requiresRefinedAtmosphere,
} from "../public/refined-render-presets.js";
import {
  composeRefinedRenderAppearance,
  getRefinedRenderAtmosphere,
  prepareRefinedRenderInput,
} from "../src/refined-render-prompt.mjs";
import { executeRefinedModelWorkflow } from "../src/refined-model-workflow.mjs";
import { createGenerationJobApiHandler } from "../src/generation-job-api.mjs";
import { parseRefinedRenderPromptAsset } from "../src/refined-render-prompt-asset.mjs";
import { createBetaRunnerService } from "../src/beta-runner.mjs";
import { betaConfigSnapshot, betaResultVersion, captureBetaGenerationArchive } from "../src/beta-base.mjs";

const hash = value => createHash("sha256").update(value).digest("hex");
const onePixelPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z7JkAAAAASUVORK5CYII=";
// -- 线上v10/v13的结构与冲突条款：完整资产仍只从飞书读取 -------------
const core = "保留原有材质、底色、色相、纹理尺度与配色面积比例。全部家具保持原有类别、数量、造型、位置。采用自然日光与室内暖光共同照明的日景。全部原有室内灯具保持开启，发光部件统一采用3500K暖光。";
const atmosphere = JSON.stringify({
  BASE: {
    "Main Objective": "Turn the input into a magazine-cover-quality photoreal interior.",
    "Source Lock": "Lock camera and composition; every material’s identity, base color, and texture.",
    "Global Lighting Optimization": "Use physical GI, bounce, and contact AO to ground objects.",
  },
  DEFAULT: "This is same-condition restoration, never time conversion or relighting.",
  CONTRACT: "Lock exterior objects and lamp states and output, except the night allowance.",
  TIME: {
    DAYTIME: "Set unmistakable daytime. Weather controls daylight strength, softness, and color temperature.",
    DUSK: "Set unmistakable dusk: restrained warm low-angle exterior light, cool shadows. Warm only lit surfaces; keep materials neutral.",
    NIGHT: "Set true night: deep cool sky, restrained ambient light. Lit interior lamps may rise only 15–25% with local 2700–3200K falloff; unlit fixtures stay off.",
  },
  WEATHER: {
    CLEAR: "Create dry, crystal-clear air: no fog, haze, rain, or milky diffusion. Sun enters only verified windows.",
    OVERCAST: "Create full overcast within original sky pixels only. Remove direct sun, beams, sun patches, and sharp shadows.",
    RAINY: "Create a dry interior on a rainy day. Show rain only as subtle droplets on the exterior of real window glass.",
    FOGGY: "Keep light-to-moderate fog beyond windows and openings; never whiteout. Indoor air and glass stay clear, sharp, and dry.",
  },
});
const modularBundle = {
  MAIN: "将图像渲染为真实室内照片，保留原设计、材质本色、家具和机位。未选条件保持原图。",
  TIME: { DAYTIME: "白天自然光。", DUSK: "黄昏光线。", NIGHT: "夜晚室内照明。" },
  WEATHER: { CLEAR: "晴朗。", OVERCAST: "阴天漫射光。", RAINY: "室外雨天，室内清晰干燥。", FOGGY: "薄雾只在室外。" },
  TONE: { WARM: "只让照明和摄影色调略暖，保留材质本色。", COOL: "只让照明和摄影色调略冷，保留材质本色。" },
};
const modularSource = JSON.stringify(modularBundle);
function modularDependencies(overrides = {}) {
  return dependencies({
    loadPrompt: async code => ({ code, name: "精模简洁渲染", version: 11, published: true,
      prompt: modularBundle.MAIN, renderPrompt: modularSource }),
    loadAtmospherePrompt() { assert.fail("模块化精模不应读取旧氛围表"); },
    ...overrides,
  });
}

function dependencies(overrides = {}) {
  return {
    loadPrompt: async (code, options) => ({ code, name: "精模忠实渲染", version: Number(options.version || 10), published: true, prompt: core }),
    loadAtmospherePrompt: async options => ({ code: "effect-render-enhancement", name: "氛围", version: Number(options.version || 13), published: true, prompt: atmosphere }),
    ...overrides,
  };
}

test("精模模板参数同源且只含受控目录，固定模板与自定义分别规范化", () => {
  assert.deepEqual(normalizeRefinedRender(), { preset: "preserve", time: "preserve", weather: "preserve", tone: "preserve" });
  assert.deepEqual(normalizeRefinedRender({ preset: "sunset", time: "night", tone: "cool" }), { preset: "sunset", time: "dusk", weather: "clear", tone: "cool" });
  assert.deepEqual(normalizeRefinedRender({ preset: "custom", time: "night", weather: "rainy", tone: "warm" }), { preset: "custom", time: "night", weather: "rainy", tone: "warm" });
  for (const preset of REFINED_RENDER_PRESETS) {
    assert.ok(REFINED_RENDER_TIMES.some(entry => entry.key === preset.time));
    assert.ok(REFINED_RENDER_WEATHERS.some(entry => entry.key === preset.weather));
  }
  assert.equal(REFINED_RENDER_TONES.length, 3);
  assert.equal(requiresRefinedAtmosphere(), false);
  assert.equal(requiresRefinedAtmosphere({ preset: "custom" }), false);
  assert.equal(requiresRefinedAtmosphere({ tone: "warm" }), true);
  for (const value of ["night", [], { preset: "modern" }, { time: "morning" }, { weather: "snow" }, { tone: "red" }, { prompt: "inject" }]) {
    assert.throws(() => normalizeRefinedRender(value), error => error.statusCode === 400);
  }
});

test("默认精模与无覆盖自定义逐字兼容，且完全不依赖氛围表", async () => {
  const deps = dependencies({ loadAtmospherePrompt() { assert.fail("默认精模不能读氛围表"); } });
  for (const refinedRender of [undefined, { preset: "preserve" }, { preset: "custom" }]) {
    const prepared = await prepareRefinedRenderInput({ refinedRender }, deps);
    assert.equal(prepared.promptVersion, 10);
    assert.equal(prepared.refinedPromptSha256, hash(core));
    assert.equal("refinedAtmospherePromptVersion" in prepared, false);
    assert.equal(composeRefinedRenderAppearance(core, prepared.refinedRender), core);
  }
});

test("指定氛围覆盖线上精模固定日景，且不叠加氛围BASE/DEFAULT/锁灯合同", async () => {
  const asset = await getRefinedRenderAtmosphere(dependencies());
  const prompt = composeRefinedRenderAppearance(core, { preset: "night", tone: "cool" }, asset);
  assert.ok(prompt.startsWith(core));
  assert.match(prompt, /override conflicting default illumination, lamp output/);
  assert.match(prompt, /Selected time takes priority over weather/);
  assert.match(prompt, /\[TIME:NIGHT\]\nSet true night/);
  assert.match(prompt, /\[WEATHER:CLEAR\]/);
  assert.match(prompt, /\[PHOTOGRAPHIC TONE:COOL\]/);
  assert.match(prompt, /never dye surfaces or apply a uniform color wash/);
  assert.match(prompt, /\[FINAL DESIGN LOCK\][\s\S]*material identity or base color/);
  assert.doesNotMatch(prompt, /magazine-cover|same-condition restoration|Lock exterior objects and lamp states/);
  assert.doesNotMatch(prompt, /\[TIME:DAYTIME\]|\[TIME:DUSK\]/);
  const toneOnly = composeRefinedRenderAppearance(core, { tone: "warm" }, asset);
  assert.match(toneOnly, /Unselected dimensions retain the core rendering defaults/);
  assert.doesNotMatch(toneOnly, /\[TIME:|\[WEATHER:/);
});

test("入队身份准备冻结两个资产的精确版本与SHA，不向输入带入正文", async () => {
  const prepared = await prepareRefinedRenderInput({ refinedRender: { preset: "soft" } }, dependencies());
  assert.equal(prepared.promptVersion, 10);
  assert.equal(prepared.refinedPromptSha256, hash(core));
  assert.equal(prepared.refinedAtmospherePromptVersion, 13);
  assert.equal(prepared.refinedAtmospherePromptSha256, hash(atmosphere));
  assert.equal(JSON.stringify(prepared).includes(core), false);
  assert.equal(JSON.stringify(prepared).includes("magazine-cover"), false);
  await assert.rejects(prepareRefinedRenderInput(prepared, dependencies({
    loadAtmospherePrompt: async () => ({ code: "effect-render-enhancement", version: 13, prompt: atmosphere.replace("magazine-cover", "edited") }),
  })), error => error.statusCode === 409 && /正文已变更/.test(error.message));
  await assert.rejects(prepareRefinedRenderInput({ ...prepared, refinedPromptSha256: "invalid" }, dependencies()), error => error.statusCode === 409);
});

test("精模正式出图及归档使用相同组合正文、双资产身份与脱敏模板摘要", async () => {
  let request, archive;
  const input = await prepareRefinedRenderInput({
    featureMode: "refinedModel", modelKey: "gptImage2", prompt: "保留沙发本色",
    refinedRender: { preset: "custom", time: "dusk", weather: "rainy", tone: "warm" },
    referenceImages: [{ dataUrl: onePixelPng, name: "model.png", type: "image/png" }],
    resolution: "1K", ratioMode: "auto", outputFormat: "png",
  }, dependencies());
  const result = await executeRefinedModelWorkflow(input, {
    ...dependencies(),
    imageClient: { async generateImage(value) { request = value; return { images: [{ url: onePixelPng }] }; } },
    scheduleSync(value) { archive = value; return { status: "pending" }; },
  });
  assert.match(request.prompt, /^保留沙发本色\n\n/);
  assert.match(request.prompt, /\[TIME:DUSK\]/);
  assert.match(request.prompt, /\[WEATHER:RAINY\]/);
  assert.equal(request.images.length, 1);
  assert.equal(archive.finalPrompt, request.prompt);
  assert.equal(archive.sourcePrompt, "保留沙发本色");
  assert.equal(archive.workflow.promptSha256, hash(core));
  assert.equal(archive.workflow.atmospherePrompt.sha256, hash(atmosphere));
  assert.match(archive.workflow.atmospherePrompt.source, /^feishu:.*effect-render-enhancement@v13$/);
  assert.deepEqual(result.refinedRender, input.refinedRender);
  assert.equal(result.atmospherePrompt.version, 13);
  assert.equal(JSON.stringify(result).includes("Set unmistakable dusk"), false);
  assert.equal(JSON.stringify(result).includes(core), false);

  let generated = false;
  await assert.rejects(executeRefinedModelWorkflow({ ...input, refinedAtmospherePromptSha256: "0".repeat(64) }, {
    ...dependencies(), imageClient: { generateImage() { generated = true; } },
  }), error => error.statusCode === 409);
  assert.equal(generated, false);
});

test("日常多模型精模批次在入队前共用一次身份冻结，身份失败零入队", async () => {
  let preparations = 0, enqueueTask, response, executed = [];
  const body = {
    featureMode: "refinedModel", jobId: "generation-refined-freeze-test",
    sharedInput: { refinedRender: { preset: "night" } },
    items: ["gptImage2", "banana21"].map(modelKey => ({ key: modelKey, input: { modelKey } })),
  };
  const handler = createGenerationJobApiHandler({
    generationJobs: { enqueue(_id, _meta, execute) { enqueueTask = execute; return { status: "running" }; } },
    generationService: { executeForMode(_feature, input) { executed.push(input); return {}; } },
    prepareRefinedInput: async input => { preparations += 1; return prepareRefinedRenderInput(input, dependencies()); },
    readJson: async () => body,
    sendJson(_response, status, value) { response = { status, value }; },
  });
  await handler({ method: "POST" }, {}, "/api/generation-jobs");
  assert.equal(response.status, 202);
  assert.equal(preparations, 1);
  await enqueueTask(() => {});
  assert.equal(executed.length, 2);
  for (const input of executed) {
    assert.equal(input.promptVersion, 10);
    assert.equal(input.refinedPromptSha256, hash(core));
    assert.equal(input.refinedAtmospherePromptVersion, 13);
    assert.equal(input.refinedAtmospherePromptSha256, hash(atmosphere));
  }
  let enqueued = false;
  const rejecting = createGenerationJobApiHandler({
    generationJobs: { enqueue() { enqueued = true; } }, generationService: {},
    prepareRefinedInput: async () => { throw Object.assign(new Error("氛围 Prompt 正文已变更"), { statusCode: 409 }); },
    readJson: async () => body, sendJson(_response, status) { response = { status }; },
  });
  await rejecting({ method: "POST" }, {}, "/api/generation-jobs");
  assert.equal(response.status, 409);
  assert.equal(enqueued, false);
});

test("模块化精模严格校验四组正文，非法JSON不能当普通提示词继续执行", () => {
  const parsed = parseRefinedRenderPromptAsset(modularSource);
  assert.equal(parsed.format, "modular");
  assert.equal(parsed.main, modularBundle.MAIN);
  for (const source of ["{bad", JSON.stringify({...modularBundle,TONE:{WARM:"暖调"}}),
    JSON.stringify({...modularBundle,TIME:{...modularBundle.TIME,NIGHT:" "}}),
    JSON.stringify({...modularBundle,EXTRA:"unknown"})]) {
    assert.throws(() => parseRefinedRenderPromptAsset(source), error => error.statusCode === 409);
  }
});

test("新精模默认只送MAIN，同一SHA涵盖全部氛围且清除旧双资产字段", async () => {
  const prepared = await prepareRefinedRenderInput({
    refinedAtmospherePromptVersion: 13, refinedAtmospherePromptSha256: "invalid",
  }, modularDependencies());
  assert.equal(prepared.promptVersion, 11);
  assert.equal(prepared.refinedPromptSha256, hash(modularSource));
  assert.equal("refinedAtmospherePromptVersion" in prepared, false);
  assert.equal("refinedAtmospherePromptSha256" in prepared, false);
  const definition = parseRefinedRenderPromptAsset(modularSource);
  assert.equal(composeRefinedRenderAppearance(definition.main, prepared.refinedRender, null, definition), modularBundle.MAIN);
  assert.equal(JSON.stringify(prepared).includes(modularBundle.MAIN), false);
});

test("新精模按选项只拼当前资产模块，真实送模正文和实际模块身份统一归档", async () => {
  for (const refinedRender of [{preset:"custom"}, {preset:"custom",time:"night",weather:"rainy",tone:"cool"}]) {
    let request, archive;
    const input = await prepareRefinedRenderInput({
      featureMode:"refinedModel", modelKey:"gptImage2", prompt:"保持挂画内容",
      refinedRender, resolution:"1K", ratioMode:"auto",outputFormat:"png",
      referenceImages:[{dataUrl:onePixelPng,name:"model.png",type:"image/png"}],
      refinedAtmospherePromptVersion:13,
    }, modularDependencies());
    const result = await executeRefinedModelWorkflow(input, {
      ...modularDependencies(),
      imageClient:{async generateImage(value){request=value;return {images:[{url:onePixelPng}]};}},
      scheduleSync(value){archive=value;return {status:"pending"};},
    });
    const selected = refinedRender.time === "night";
    assert.equal(request.prompt.startsWith(`保持挂画内容\n\n${modularBundle.MAIN}`), true);
    assert.equal(request.prompt.includes('"MAIN"'), false);
    assert.equal(archive.finalPrompt, request.prompt);
    assert.equal(archive.workflow.promptSha256, hash(modularSource));
    assert.deepEqual(result.renderPrompt.moduleKeys, selected ? ["MAIN","TIME.NIGHT","WEATHER.RAINY","TONE.COOL"] : ["MAIN"]);
    assert.equal(result.renderPrompt.source, "refined-prompt");
    assert.equal(result.renderPrompt.version, 11);
    assert.equal(result.renderPrompt.sha256, hash(modularSource));
    assert.deepEqual(archive.workflow.renderPrompt, result.renderPrompt);
    const betaArchive = captureBetaGenerationArchive(archive).archiveFields;
    assert.equal(betaArchive["最终 Prompt"], request.prompt);
    assert.deepEqual(JSON.parse(betaArchive["生成参数"]).workflow.renderPrompt, result.renderPrompt);
    assert.equal(betaResultVersion(result), "refined-model-render@v11");
    assert.equal("atmospherePrompt" in result, false);
    assert.equal("atmospherePrompt" in archive.workflow, false);
    assert.equal(JSON.stringify(result).includes(modularBundle.MAIN), false);
    if(selected){
      assert.match(request.prompt,/TIME.NIGHT/);
      assert.equal(request.prompt.includes(modularBundle.TONE.COOL),true);
      assert.equal(request.prompt.includes("Apply a restrained cool cast"),false);
      assert.equal(request.prompt.includes(modularBundle.TIME.DAYTIME),false);
    } else assert.equal(request.prompt, `保持挂画内容\n\n${modularBundle.MAIN}`);
  }
});

test("模块正文在同版本变更时按整体SHA阻断，非法新资产在出图前失败", async () => {
  const input = await prepareRefinedRenderInput({refinedRender:{preset:"night"}}, modularDependencies());
  await assert.rejects(prepareRefinedRenderInput(input,modularDependencies({
    loadPrompt:async code=>({code,version:11,prompt:modularBundle.MAIN,renderPrompt:JSON.stringify({...modularBundle,TONE:{...modularBundle.TONE,WARM:"已变更"}})}),
  })),error=>error.statusCode===409&&/正文已变更/.test(error.message));
  await assert.rejects(prepareRefinedRenderInput({},modularDependencies({
    loadPrompt:async code=>({code,version:11,prompt:'{"MAIN":"only"}'}),
  })),error=>error.statusCode===409);
});

test("新精模经日常及Beta入队冻结同一四块资产，旧氛围字段不会穿透或误归档", async () => {
  const sharedInput = {refinedRender:{preset:"night"},refinedAtmospherePromptVersion:13,
    refinedAtmospherePromptSha256:"0".repeat(64)};
  let enqueueTask;
  const ordinaryInputs = [];
  const handler = createGenerationJobApiHandler({
    generationJobs:{enqueue(_id,_meta,execute){enqueueTask=execute;return {status:"running"};}},
    generationService:{executeForMode(_mode,input){ordinaryInputs.push(input);return {}; }},
    prepareRefinedInput:input=>prepareRefinedRenderInput(input,modularDependencies()),
    readJson:async()=>({featureMode:"refinedModel",jobId:"generation-refined-columns",sharedInput,
      items:["gptImage2","banana21"].map(modelKey=>({key:modelKey,input:{modelKey}}))}),
    sendJson(_response,status){assert.equal(status,202);},
  });
  await handler({method:"POST"},{},"/api/generation-jobs");
  await enqueueTask(()=>{});
  const betaInputs=[];
  const beta = createBetaRunnerService({
    baseStore:{async beginRun({item}){return {recordId:item.runId};},async completeRun(recordId){return {recordId};},async failRun(){}},
    generationService:{async executeForMode(_mode,input){betaInputs.push(input);return {images:[]};}},
    prepareRefinedInput:input=>prepareRefinedRenderInput(input,modularDependencies()),
  });
  const jobId="beta-refined-columns";
  await beta.start({featureMode:"refinedModel",batchId:"BETA-refined-columns",jobId,testTime:"2026-10-26 17:00:00",
    items:[1,2].map(index=>({caseId:`CASE-${index}`,runId:`RUN-refined-columns-${index}`,input:{...sharedInput,modelKey:"gptImage2"}}))});
  for(let attempt=0;attempt<20&&beta.getJob(jobId).status==="running";attempt++) await new Promise(resolve=>setImmediate(resolve));
  assert.equal(beta.getJob(jobId).status,"success");
  assert.equal(betaInputs.length,2);
  for(const input of [...ordinaryInputs,...betaInputs]){
    assert.equal(input.promptVersion,11);
    assert.equal(input.refinedPromptSha256,hash(modularSource));
    assert.equal(input.refinedAtmospherePromptVersion,undefined);
    assert.equal(input.refinedAtmospherePromptSha256,undefined);
    const snapshot=betaConfigSnapshot({...input,featureMode:"refinedModel"});
    assert.equal("refinedAtmospherePromptVersion" in snapshot,false);
    assert.equal("refinedAtmospherePromptSha256" in snapshot,false);
  }
});

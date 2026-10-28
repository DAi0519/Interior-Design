/**
 * [INPUT]: 依赖真实生成任务 API/注册表/应用服务/GPT打光链路、sharp图片及可注入模型和同步替身
 * [OUTPUT]: 验证v10整体原灯/新增补光/可选单灯精修及飞书资产入队冻结/失败零收费、摄影原文与实际Prompt归档、固定成本/单双图及历史局部语义和正文脱敏
 * [POS]: test 的打光跨层离线验收，不调用真实模型、OneAPI、CLI 或飞书
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { RELIGHT_ONEAPI_MODEL } from "../src/image-relight-oneapi.mjs";
import { readImageRelightConfig } from "../src/image-relight-service.mjs";
import { getImageRelightPrompt } from "../src/image-relight-prompt.mjs";
import { createImageToolsApiHandler } from "../src/image-tools-api.mjs";
import { normalizeRelightSettings, RELIGHT_LEGACY_TEMPLATES } from "../public/image-relight-presets.js";
import { RELIGHT_MODEL_KEY, normalizeRelightLights } from "../public/image-relight-geometry.js";
import { createGenerationTask, saveGenerationTask, readGenerationTasks, generationTaskView } from "../public/generation-task-state.js";

import { sourceBytes, sourceUrl, digest, decoded, assetPrompt, promptSnapshot, promptConfig,
  PHOTOGRAPHY_PARAMETERS, assertPhotographicQuality, inputLights, requestBody, waitUntil, harness } from "./image-relight-integration-fixture.mjs";

test("真实任务API经应用服务只向GPT提交原图/引导两图，逐灯冻结且完整Prompt仅入归档", async () => {
  const run = harness({ holdGeneration: true });
  const frozenLights = structuredClone(run.body.sharedInput.lights);
  const queued = await run.post();
  assert.equal(queued.statusCode, 202);
  assert.equal(queued.payload.job.featureMode, "imageRelight");
  assert.deepEqual(queued.payload.job.stages, { imageEdit: "submitting" });
  run.body.sharedInput.lights[0].kelvin = 9000;
  run.body.sharedInput.lights[1].points[0].x = 0.9;
  await waitUntil(() => run.calls.paid.length === 1, "唯一GPT提交");
  const running = await run.get();
  assert.equal(running.payload.job.status, "running");
  assert.equal(running.payload.job.stages.imageEdit, "executing");
  assert.equal(running.payload.job.stages.upstreamResponseId, "response-relight-offline");
  assert.equal(running.payload.job.stages.upstreamStatus, "in_progress");
  assert.match(running.payload.job.message, /GPT打光已提交/);
  run.release();
  const completed = await run.settled();
  assert.equal(completed.status, "success");
  assert.equal(completed.result.outcomes[0].status, "fulfilled");
  assert.equal(run.calls.paid.length, 1);
  assert.deepEqual(run.calls.routes, [RELIGHT_MODEL_KEY]);
  assert.deepEqual(run.calls.schema, [{ stage: "enqueue", scope: "imageRelight" }, { stage: "execute", scope: "imageRelight" }]);
  assert.ok(run.calls.catalogs.every(options => options.force === true));
  const request = run.calls.paid[0], archive = run.calls.archived[0];
  assert.equal(request.model, RELIGHT_ONEAPI_MODEL.id);
  assert.equal(request.n, 1);
  assert.equal(request.output_format, "png");
  assert.equal(request.images.length, 2);
  assert.deepEqual(await sharp(decoded(request.images[0].image_url)).raw().toBuffer(), await sharp(sourceBytes).raw().toBuffer());
  assert.notDeepEqual(decoded(request.images[1].image_url), decoded(request.images[0].image_url));
  assert.equal(Object.hasOwn(request, "mask"), false);
  assertPhotographicQuality(request.prompt, { scope: "local" });
  assert.match(request.prompt, /CUSTOM LIGHTING/);
  assert.match(request.prompt, /CUSTOM LIGHTING: execute the explicit originalLights handling/);
  assert.match(request.prompt, /Keep original emission states as a baseline only when keep is selected or no original-light operation was requested/);
  assert.doesNotMatch(request.prompt, /REBUILD ALL LIGHTING/);
  assert.match(request.prompt, /Light 1:.*3000 K/);
  assert.match(request.prompt, /LIGHT ONLY/);
  assert.match(request.prompt, /ADD FIXTURE AND LIGHT/);
  assert.match(request.prompt, /area emitter/);
  assert.equal(run.calls.archived.length, 1);
  assert.deepEqual(archive.workflow.lights, normalizeRelightLights(frozenLights));
  assert.equal(archive.finalPrompt, request.prompt);
  assert.equal(archive.workflow.guideSha256, digest(decoded(request.images[1].image_url)));
  assert.equal(archive.referenceImages[0].imageUrl, sourceUrl);
  assert.equal(archive.referenceImages[1].imageUrl, request.images[1].image_url);
  assert.equal(archive.workflow.feature, "image-relight");
  assert.equal(archive.workflow.workflowVersion, "2026-10-26.gpt-relight.10");
  assert.equal(archive.workflow.templateSource, promptSnapshot().source);
  assert.equal(archive.workflow.relightPromptCode, "image-relight");
  assert.equal(archive.workflow.relightPromptVersion, 9);
  assert.equal(archive.workflow.relightPromptSha256, digest(assetPrompt));
  assert.equal(archive.workflow.relightPromptSource, promptSnapshot().source);
  assert.equal(Object.hasOwn(archive.workflow, "batchCount"), false, "单张归档沿用既有无批次字段合同");
  assert.deepEqual(archive.workflow.usageCost, { totalCost: 0.123 });
  const restored = await run.get();
  const value = restored.payload.job.result.outcomes[0].value;
  assert.equal(value.sync.status, "pending");
  assert.equal(value.upstream.metadata.outputSha256, archive.workflow.outputSha256);
  assert.equal(Object.hasOwn(value.upstream.metadata, "prompt"), false);
  assert.equal(Object.hasOwn(value.upstream.metadata, "sourcePrompt"), false);
  assert.equal(JSON.stringify(restored.payload).includes(request.prompt), false);
  assert.equal(JSON.stringify(restored.payload).includes("submitted-relight-guide.png"), false);
});

test("非法光源、非GPT模型/通道及多生成项在入队前拒绝且零付费", async () => {
  for (const change of [
    body => { body.sharedInput.lights = []; },
    body => { body.sharedInput.lights[0].kelvin = 1999; },
    body => { body.sharedInput.lights[0].points[0].x = Number.NaN; },
    body => { body.sharedInput.lights[2].points = [{ x: 0.2, y: 0.2 }, { x: 0.4, y: 0.4 }, { x: 0.6, y: 0.6 }]; },
    body => { body.sharedInput.modelKey = "gptImage25Flare"; },
    body => { body.items[0].input.relightModel = "flux2Klein"; },
    body => { body.items[0].input.provider = "comfyui"; },
    body => { body.items.push(structuredClone(body.items[0])); },
  ]) {
    const body = requestBody(); change(body);
    const run = harness({ body });
    const response = await run.post();
    assert.equal(response.statusCode, 400);
    assert.equal(run.registry.get(body.jobId), null);
    assert.equal(run.calls.paid.length, 0);
    assert.equal(run.calls.archived.length, 0);
  }
});

test("Key权限与Schema入队门禁失败均零付费且不创建任务", async () => {
  for (const options of [{ denyConfig: true }, { rejectSchema: "enqueue" }]) {
    const run = harness(options);
    const response = await run.post();
    assert.equal(response.statusCode, 409);
    assert.equal(run.registry.get(run.body.jobId), null);
    assert.equal(run.calls.paid.length, 0);
    assert.equal(run.calls.archived.length, 0);
  }
});

test("执行前再次检查Key和Schema，排队后权限或Schema失效不会收费", async () => {
  for (const options of [{ revokeAfterConfig: true }, { rejectSchema: "execute" }]) {
    const run = harness(options);
    assert.equal((await run.post()).statusCode, 202);
    const completed = await run.settled();
    assert.equal(completed.result.outcomes[0].status, "rejected");
    assert.match(completed.result.outcomes[0].reason.message, /权限|合同/);
    assert.equal(run.calls.paid.length, 0);
    assert.equal(run.calls.archived.length, 0);
  }
});

test("同任务ID重复入队与上游失败均不重复提交付费请求", async () => {
  const run = harness({ holdGeneration: true, rejectPaid: true });
  assert.equal((await run.post()).statusCode, 202);
  await waitUntil(() => run.calls.paid.length === 1);
  assert.equal((await run.post()).statusCode, 202);
  run.release();
  const completed = await run.settled();
  assert.equal(completed.result.outcomes[0].status, "rejected");
  assert.match(completed.result.outcomes[0].reason.message, /offline upstream failed/);
  assert.equal(run.calls.paid.length, 1);
  assert.equal(run.calls.archived.length, 0);
});

test("打光任务按功能独立保存和恢复，持续显示API编辑进度且只存任务引用", async () => {
  const data = new Map();
  const storage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) };
  const relight = createGenerationTask({ featureMode: "imageRelight", loadingLabel: "GPT正在打光", models: [{ key: RELIGHT_MODEL_KEY, label: "GPT 打光" }], createId: () => "relight-restored-00001", now: () => 100 });
  const mask = createGenerationTask({ featureMode: "imageMaskFill", loadingLabel: "GPT正在编辑", models: [{ key: RELIGHT_MODEL_KEY, label: "GPT 编辑" }], createId: () => "mask-restored-0000001", now: () => 100 });
  saveGenerationTask(storage, relight); saveGenerationTask(storage, mask);
  const restored = readGenerationTasks(storage);
  assert.equal(restored.imageRelight.jobId, relight.jobId);
  assert.equal(restored.imageMaskFill.jobId, mask.jobId);
  assert.notEqual(restored.imageRelight.jobId, restored.imageMaskFill.jobId);
  assert.deepEqual(generationTaskView(restored.imageRelight, { status: "running", stages: { imageEdit: "executing" }, message: "GPT打光已提交，正在后台生成" }),
    { stage: "loading", message: "GPT打光已提交，正在后台生成" });
  const outcomes = [{ status: "fulfilled", value: { sync: { status: "pending" } } }];
  assert.deepEqual(generationTaskView(restored.imageRelight, { status: "success", result: { outcomes } }), { stage: "results", outcomes });
  assert.equal([...data.values()].join("").includes("data:image"), false);
  assert.equal([...data.values()].join("").includes("lights"), false);
});


test("纯模板无标注从任务入口只提交原图，模板/融合/用户要求在入队后冻结且实际Prompt仅归档", async () => {
  const body = requestBody();
  Object.assign(body.sharedInput, { templateKey: "windowDaylight", blendMode: "subtle", prompt: "保留原有暖色灯具的亮度" });
  delete body.sharedInput.lights;
  const run = harness({ body, holdGeneration: true });
  assert.equal((await run.post()).statusCode, 202);
  Object.assign(body.sharedInput, { templateKey: "warmAmbient", blendMode: "pronounced", prompt: "篡改后的请求" });
  body.sharedInput.lights = inputLights();
  await waitUntil(() => run.calls.paid.length === 1);
  const request = run.calls.paid[0];
  assert.equal(request.images.length, 1);
  assert.equal(Object.hasOwn(request, "mask"), false);
  assert.deepEqual(await sharp(decoded(request.images[0].image_url)).raw().toBuffer(), await sharp(sourceBytes).raw().toBuffer());
  assert.match(request.prompt, /no manual lighting guide/i);
  assert.match(request.prompt, /DIRECTIONAL WINDOW SUNLIGHT/);
  assert.match(request.prompt, /SUBTLE REBUILT LIGHTING/);
  assert.match(request.prompt, /保留原有暖色灯具的亮度/);
  assert.doesNotMatch(request.prompt, /篡改后的请求|WARM HOME NIGHT LIGHTING|PRONOUNCED REBUILT LIGHTING|Light 1:/);
  run.release();
  const job = await run.settled();
  assert.equal(job.result.outcomes[0].status, "fulfilled");
  assert.equal(run.calls.paid.length, 1);
  assert.equal(run.calls.archived.length, 1);
  const archive = run.calls.archived[0];
  assert.equal(archive.workflow.templateKey, "windowDaylight");
  assert.equal(archive.workflow.blendMode, "subtle");
  assert.equal(archive.workflow.lightCount, 0);
  assert.deepEqual(archive.workflow.lights, []);
  assert.deepEqual(archive.workflow.referenceRoles, ["original-source"]);
  assert.equal(archive.referenceImages.length, 1);
  assert.equal(archive.preview.referenceImageCount, 1);
  assert.equal(archive.finalPrompt, request.prompt);
  assert.equal(archive.sourcePrompt, "保留原有暖色灯具的亮度");
  const restored = await run.get();
  const value = restored.payload.job.result.outcomes[0].value;
  assert.equal(value.request.referenceImageCount, 1);
  assert.equal(value.request.templateKey, "windowDaylight");
  assert.equal(value.upstream.metadata.templateKey, "windowDaylight");
  assert.equal(value.upstream.metadata.blendMode, "subtle");
  assert.equal(JSON.stringify(restored.payload).includes(request.prompt), false);
  assert.equal(Object.hasOwn(value.upstream.metadata, "prompt"), false);
  assert.equal(Object.hasOwn(value.upstream.metadata, "sourcePrompt"), false);
});

test("模板叠加手工光源保持双图与逐灯两模式，融合字段不会被后续共享配置覆盖", async () => {
  const body = requestBody();
  Object.assign(body.sharedInput, { templateKey: "warmAmbient", blendMode: "pronounced" });
  const run = harness({ body, holdGeneration: true });
  const frozenLights = structuredClone(body.sharedInput.lights);
  assert.equal((await run.post()).statusCode, 202);
  Object.assign(body.sharedInput, { templateKey: "naturalFill", blendMode: "subtle" });
  body.sharedInput.lights[0].kelvin = 9000;
  await waitUntil(() => run.calls.paid.length === 1);
  assert.equal(run.calls.paid[0].images.length, 2);
  assertPhotographicQuality(run.calls.paid[0].prompt);
  assert.match(run.calls.paid[0].prompt, /WARM HOME NIGHT LIGHTING/);
  assert.match(run.calls.paid[0].prompt, /PRONOUNCED REBUILT LIGHTING/);
  assert.match(run.calls.paid[0].prompt, /PRESERVE > TURN OFF > DARKEN > BRIGHTEN > LIGHTING TEMPLATE/);
  assert.match(run.calls.paid[0].prompt, /Stop the emitter at its marked endpoints/);
  run.release();
  const job = await run.settled();
  assert.equal(job.result.outcomes[0].status, "fulfilled");
  const archive = run.calls.archived[0];
  assert.equal(archive.workflow.templateKey, "warmAmbient");
  assert.equal(archive.workflow.blendMode, "pronounced");
  assert.deepEqual(archive.workflow.lights, normalizeRelightLights(frozenLights));
  assert.equal(archive.referenceImages.length, 2);
  assert.equal(archive.preview.referenceImageCount, 2);
  assert.equal(archive.finalPrompt, run.calls.paid[0].prompt);
  assert.deepEqual(archive.workflow.referenceRoles, ["original-source", "submitted-light-guide"]);
});

test("非法模板/融合枚举和自定义零光源在创建任务前拒绝，模板无灯仍服从权限与Schema双门禁", async () => {
  for (const changes of [
    { templateKey: "unknown" }, { templateKey: null }, { blendMode: "unknown" }, { blendMode: false },
    { templateKey: "custom", lights: [] }, { templateKey: "naturalFill", lights: null },
  ]) {
    const body = requestBody(); Object.assign(body.sharedInput, changes);
    const run = harness({ body });
    assert.equal((await run.post()).statusCode, 400);
    assert.equal(run.calls.paid.length, 0);
    assert.equal(run.registry.get(body.jobId), null);
  }
  for (const options of [{ denyConfig: true }, { rejectSchema: "enqueue" }, { revokeAfterConfig: true }, { rejectSchema: "execute" }]) {
    const body = requestBody(); Object.assign(body.sharedInput, { templateKey: "softStudio", blendMode: "balanced", lights: [] });
    const run = harness({ body, ...options });
    const queued = await run.post();
    if (queued.statusCode === 202) assert.equal((await run.settled()).result.outcomes[0].status, "rejected");
    else assert.equal(queued.statusCode, 409);
    assert.equal(run.calls.paid.length, 0);
    assert.equal(run.calls.archived.length, 0);
  }
});

function inputActions() {
  return [
    ...inputLights().slice(0, 2).map(light => ({ ...light, action: "brighten" })),
    { id: "dim-existing-panel", action: "darken", type: "area", amount: 0.6,
      points: [{ x: 0.1, y: 0.2 }, { x: 0.4, y: 0.2 }, { x: 0.4, y: 0.6 }, { x: 0.1, y: 0.6 }] },
    { id: "off-strip", action: "turnOff", type: "line", points: [{ x: 0.2, y: 0.1 }, { x: 0.8, y: 0.1 }] },
    { id: "keep-chair", action: "preserve", type: "point", points: [{ x: 0.8, y: 0.7 }] },
  ];
}

test("v10同任务新增补光/减弱原灯/关闭原灯并保留旧方案语义，原生双图与计划归档", async () => {
  const body = requestBody();
  Object.assign(body.sharedInput, { templateKey: "noMainLight", blendMode: "subtle", lights: inputActions(), prompt: "柜体外观与布局保持原样" });
  const expected = normalizeRelightLights(structuredClone(body.sharedInput.lights));
  const run = harness({ body, holdGeneration: true });
  assert.equal((await run.post()).statusCode, 202);
  body.sharedInput.lights[2].amount = 0.2;
  body.sharedInput.lights[3].action = "preserve";
  body.sharedInput.lights[4].points[0].x = 0.1;
  body.sharedInput.templateKey = "mainLight";
  await waitUntil(() => run.calls.paid.length === 1);
  const request = run.calls.paid[0];
  assert.equal(request.images.length, 2);
  assert.equal(request.n, 1);
  assert.equal(Object.hasOwn(request, "mask"), false);
  assert.match(request.prompt, /NO-MAIN-LIGHT SCHEME/);
  assertPhotographicQuality(request.prompt, { scope: "local" });
  assert.doesNotMatch(request.prompt, /REBUILD ALL LIGHTING/);
  assert.match(request.prompt, /SUBTLE ADJUSTMENT/);
  assert.match(request.prompt, /PRESERVE > TURN OFF > DARKEN > BRIGHTEN > LIGHTING TEMPLATE/);
  assert.match(request.prompt, /LIGHT ONLY/);
  assert.match(request.prompt, /ADD FIXTURE AND LIGHT/);
  assert.match(request.prompt, /ADD NEW LIGHT/);
  assert.match(request.prompt, /lower values create a dimmer new light, not a request to dim an existing source/);
  assert.match(request.prompt, /DIM EXISTING LIGHT/);
  assert.match(request.prompt, /approximately 60%/);
  assert.match(request.prompt, /identify only an existing luminaire or finite emitting segment/);
  assert.match(request.prompt, /Dim only this identified source and its attributable illumination, bounce and reflections/);
  assert.match(request.prompt, /If there is no identifiable existing emitter at the mark, leave the scene unchanged by this action/);
  assert.match(request.prompt, /do not invent a source, darken a receiving surface or dim the marked region as a fallback/);
  assert.doesNotMatch(request.prompt, /receiving surface with no clear emitter|dim that actual source and its attributable local illumination/);
  assert.match(request.prompt, /TURN OFF EXISTING LIGHT/);
  assert.match(request.prompt, /green =, PRESERVE/);
  assert.match(request.prompt, /Only new-light marks have direction arrows/);
  assert.match(request.prompt, /interior design style|actual design style/);
  assert.doesNotMatch(request.prompt, /approximately 20%|MAIN-LIGHT SCHEME: identify the actual existing main luminaire/);
  run.release();
  const completed = await run.settled();
  assert.equal(completed.result.outcomes[0].status, "fulfilled");
  assert.equal(run.calls.paid.length, 1);
  const archive = run.calls.archived[0];
  assert.deepEqual(archive.workflow.lights, expected);
  assert.equal(archive.workflow.templateKey, "noMainLight");
  assert.equal(archive.workflow.workflowVersion, "2026-10-26.gpt-relight.10");
  assert.equal(archive.workflow.templateSource, promptSnapshot().source);
  assert.equal(archive.workflow.relightPromptVersion, 9);
  assert.equal(archive.workflow.relightPromptSha256, digest(assetPrompt));
  assert.equal(archive.workflow.lightingPlanSha256, digest(JSON.stringify({ templateKey: "noMainLight", blendMode: "subtle", originalLights: null, lights: expected })));
  assert.ok(archive.workflow.lights.every(light => !Object.hasOwn(light, "sourceKind")));
  assert.equal(archive.workflow.guideSha256, digest(decoded(request.images[1].image_url)));
  assert.equal(archive.finalPrompt, request.prompt);
  assert.equal(digest(archive.finalPrompt), digest(request.prompt));
  assert.equal(digest(archive.workflow.prompt), digest(request.prompt));
  assert.notEqual(digest(request.prompt), archive.workflow.relightPromptSha256, "编译后Prompt摘要与资产原JSON摘要须区分");
  assert.equal(archive.referenceImages[1].imageUrl, request.images[1].image_url);
  const restored = await run.get();
  const value = restored.payload.job.result.outcomes[0].value;
  assert.deepEqual(value.upstream.metadata.lights, expected);
  assert.equal(Object.hasOwn(value.upstream.metadata, "prompt"), false);
  assert.equal(Object.hasOwn(value.upstream.metadata, "sourcePrompt"), false);
  assert.equal(JSON.stringify(restored.payload).includes(request.prompt), false);
});

test("单独减弱或关闭只以原灯为目标，无可识别灯源时指令不改受光区或新增灯具", async () => {
  for (const action of [
    { id: "dim", action: "darken", type: "point", points: [{ x: 0.5, y: 0.5 }] },
    { id: "off", action: "turnOff", type: "line", points: [{ x: 0.2, y: 0.2 }, { x: 0.7, y: 0.2 }] },
  ]) {
    const body = requestBody(); body.sharedInput.lights = [action];
    const run = harness({ body });
    assert.equal((await run.post()).statusCode, 202);
    const outcome = (await run.settled()).result.outcomes[0];
    assert.equal(outcome.status, "fulfilled", outcome.reason?.message);
    assert.equal(run.calls.paid.length, 1);
    assert.equal(run.calls.paid[0].images.length, 2);
    assert.doesNotMatch(run.calls.paid[0].prompt, /Aim toward the visible scene surface/);
    assert.match(run.calls.paid[0].prompt, /If there is no identifiable existing emitter at the mark, leave the scene unchanged by this action/);
    assert.match(run.calls.paid[0].prompt, /do not invent a source/);
    assert.doesNotMatch(run.calls.paid[0].prompt, /receiving surface with no clear emitter/);
    const saved = run.calls.archived[0].workflow.lights[0];
    assert.equal(saved.action, action.action);
    assert.equal(Object.hasOwn(saved, "target"), false);
    assert.equal(Object.hasOwn(saved, "mode"), false);
    if (action.action === "darken") {
      assert.equal(saved.amount, 0.5);
      assert.match(run.calls.paid[0].prompt, /DIM EXISTING LIGHT/);
      assert.match(run.calls.paid[0].prompt, /darken a receiving surface or dim the marked region as a fallback/);
    } else assert.match(run.calls.paid[0].prompt, /Preserve the physical lamp body/);
  }
  const body = requestBody();
  body.sharedInput.lights = [{ id: "keep", action: "preserve", type: "point", points: [{ x: 0.5, y: 0.5 }] }];
  const blocked = harness({ body });
  assert.equal((await blocked.post()).statusCode, 400);
  assert.equal(blocked.calls.paid.length, 0);
  assert.equal(blocked.registry.get(body.jobId), null);
});

test("照明方案可保护指定对象，非法动作和压暗幅度在入队前零付费阻断", async () => {
  const body = requestBody();
  Object.assign(body.sharedInput, { templateKey: "naturalDaylight", lights: [{ id: "keep", action: "preserve", type: "point", points: [{ x: 0.5, y: 0.5 }] }] });
  const run = harness({ body });
  assert.equal((await run.post()).statusCode, 202);
  assert.equal((await run.settled()).result.outcomes[0].status, "fulfilled");
  assert.match(run.calls.paid[0].prompt, /NATURAL DAYLIGHT SCHEME/);
  assert.match(run.calls.paid[0].prompt, /original time of day, weather, exterior view and room design style/);
  assert.equal(run.calls.archived[0].workflow.lights[0].action, "preserve");
  for (const change of [
    light => { light.action = "unknown"; },
    light => { light.action = null; },
    light => { light.amount = 0; },
    light => { light.amount = 1; },
    light => { light.amount = Number.NaN; },
  ]) {
    const invalid = requestBody();
    invalid.sharedInput.lights = [{ id: "dim", action: "darken", type: "point", points: [{ x: 0.5, y: 0.5 }], amount: 0.5 }];
    change(invalid.sharedInput.lights[0]);
    const blocked = harness({ body: invalid });
    assert.equal((await blocked.post()).statusCode, 400);
    assert.equal(blocked.calls.paid.length, 0);
    assert.equal(blocked.calls.archived.length, 0);
    assert.equal(blocked.registry.get(invalid.jobId), null);
  }
});

test("v3历史三方案均可零标注执行并保留原key及风格亮暗适配语义", async () => {
  const fingerprints = new Set();
  for (const [templateKey, marker] of [
    ["mainLight", /MAIN-LIGHT SCHEME/],
    ["noMainLight", /NO-MAIN-LIGHT SCHEME/],
    ["naturalDaylight", /NATURAL DAYLIGHT SCHEME/],
  ]) {
    const body = requestBody();
    Object.assign(body.sharedInput, { templateKey, lights: [] });
    const run = harness({ body });
    assert.equal((await run.post()).statusCode, 202);
    assert.equal((await run.settled()).result.outcomes[0].status, "fulfilled");
    assert.equal(run.calls.paid.length, 1);
    const request = run.calls.paid[0], archive = run.calls.archived[0];
    assert.equal(request.images.length, 1);
    assertPhotographicQuality(request.prompt, { scope: "local" });
    assert.match(request.prompt, marker);
    assert.match(request.prompt, /Treat image 1 as the lighting baseline/);
    assert.doesNotMatch(request.prompt, /REBUILD ALL LIGHTING/);
    assert.match(request.prompt, /actual window brightness, room depth, surface reflectance, highlights and dark areas/);
    assert.match(request.prompt, /Different design styles do not imply a mandatory bright or dark exposure/);
    assert.equal(archive.workflow.templateKey, templateKey);
    assert.equal(archive.finalPrompt, request.prompt);
    assert.equal(archive.workflow.prompt, request.prompt);
    assert.deepEqual(archive.workflow.lights, []);
    assert.equal(archive.workflow.lightCount, 0);
    assert.equal(archive.referenceImages.length, 1);
    assert.deepEqual(archive.workflow.referenceRoles, ["original-source"]);
    fingerprints.add(archive.workflow.lightingPlanSha256);
  }
  assert.equal(fingerprints.size, 3);
});

test("五个重打光效果目录默认naturalFill，服务端省略模板仍按自定义兼容旧请求", async () => {
  const config = await readImageRelightConfig({ getOneApiModels: async () => [{ id: RELIGHT_ONEAPI_MODEL.id }], readPromptConfig: async () => promptConfig() });
  assert.equal(config.available, true);
  assert.equal(config.defaultTemplateKey, "naturalFill");
  assert.deepEqual(config.templates.map(entry => entry.key), ["naturalFill", "warmAmbient", "windowDaylight", "accentWash", "softStudio", "custom"]);
  assert.deepEqual(RELIGHT_LEGACY_TEMPLATES.map(entry => entry.key), ["mainLight", "noMainLight", "naturalDaylight"]);
  assert.deepEqual(normalizeRelightSettings({}), { templateKey: "custom", blendMode: "balanced" });

  const body = requestBody();
  const run = harness({ body });
  assert.equal((await run.post()).statusCode, 202);
  assert.equal((await run.settled()).result.outcomes[0].status, "fulfilled");
  assert.match(run.calls.paid[0].prompt, /CUSTOM LIGHTING/);
  assertPhotographicQuality(run.calls.paid[0].prompt, { scope: "local" });
  assert.doesNotMatch(run.calls.paid[0].prompt, /BRIGHT DIFFUSE LIGHTING|REBUILD ALL LIGHTING/);
  assert.equal(run.calls.archived[0].workflow.templateKey, "custom");
  assert.equal(run.calls.archived[0].referenceImages.length, 2);

  const missing = requestBody(); delete missing.sharedInput.lights;
  const blocked = harness({ body: missing });
  assert.equal((await blocked.post()).statusCode, 400);
  assert.equal(blocked.calls.paid.length, 0);
  assert.equal(blocked.registry.get(missing.jobId), null);
});

test("飞书打光资产缺失、非法、下架、摘要漂移及同版本重复在入队前零付费阻断", async () => {
  const fields = ["Prompt 名称", "Prompt 编码", "版本", "上架状态", "Prompt 正文", "变更说明"];
  const row = ["GPT打光", "image-relight", 9, ["上架"], assetPrompt, "offline"];
  for (const rows of [[], [[...row.slice(0, 4), "{}", "offline"]], [[...row.slice(0, 3), ["下架"], ...row.slice(4)]], [row, row]]) {
    const getPrompt = options => getImageRelightPrompt({ ...options,
      run: async () => ({ ok: true, data: { fields, data: rows, has_more: false } }) });
    const run = harness({ getPrompt });
    const response = await run.post();
    assert.equal(response.statusCode, 409);
    assert.match(response.payload.error, /打光\s*Prompt/);
    assert.equal(run.registry.get(run.body.jobId), null);
    assert.equal(run.calls.paid.length, 0);
    assert.equal(run.calls.archived.length, 0);
  }
  const unavailable = harness({ readPromptConfig: async () => ({ available: false, reason: "打光Prompt未上架" }) });
  assert.equal((await unavailable.post()).statusCode, 409);
  assert.equal(unavailable.calls.prompts.length, 0);
  assert.equal(unavailable.calls.paid.length, 0);
  for (const patch of [{ relightPromptVersion: 0 }, { relightPromptSha256: "wrong" }, { relightPromptSnapshot: promptSnapshot() }, { relightPromptBundle: {} }]) {
    const body = requestBody(); Object.assign(body.sharedInput, patch);
    const run = harness({ body });
    assert.equal((await run.post()).statusCode, 400);
    assert.equal(run.calls.prompts.length, 0);
    assert.equal(run.calls.paid.length, 0);
  }
  for (const patch of [{ relightPromptVersion: 6 }, { relightPromptSha256: "0".repeat(64) }]) {
    const body = requestBody(); Object.assign(body.sharedInput, patch);
    const run = harness({ body });
    assert.equal((await run.post()).statusCode, 409);
    assert.equal(run.calls.paid.length, 0);
    assert.equal(run.registry.get(body.jobId), null);
  }
});

test("打光配置GET普通读取与主动刷新只透传forceRefresh且不公开正文", async () => {
  const reads = [], responses = [], promptReads = [];
  const handler = createImageToolsApiHandler({
    async getImageRelightConfig(options) {
      reads.push(options);
      return readImageRelightConfig({ ...options, getOneApiModels: async () => [{ id: RELIGHT_ONEAPI_MODEL.id }],
        readPromptConfig: async options => { promptReads.push(options); return promptConfig(); } });
    },
    sendJson(_response, status, body) { responses.push({ status, body }); },
  });
  for (const url of ["/api/image-relight/config", "/api/image-relight/config?forceRefresh=1"]) {
    assert.equal(await handler({ method: "GET", url }, {}, "/api/image-relight/config"), true);
  }
  assert.deepEqual(reads, [{ forceRefresh: false }, { forceRefresh: true }]);
  assert.deepEqual(promptReads, reads);
  for (const { status, body } of responses) {
    assert.equal(status, 200); assert.equal(body.available, true); assert.equal(body.prompt.version, 9);
    assert.equal(Object.hasOwn(body.prompt, "prompt"), false); assert.equal(Object.hasOwn(body.prompt, "bundle"), false);
  }
});

test("入队前冻结飞书正文，排队编辑线上同版本不换资产且实际送模与归档一致", async () => {
  const online = promptSnapshot();
  online.bundle.TEMPLATES.naturalFill += " FROZEN_FEISHU_ASSET_TARGET";
  online.prompt = JSON.stringify(online.bundle); online.sha256 = digest(online.prompt);
  const original = structuredClone(online);
  const body = requestBody(); Object.assign(body.sharedInput, { templateKey: "naturalFill", lights: [], prompt: "", relightPromptVersion: 9, relightPromptSha256: original.sha256 });
  const run = harness({ body, getPrompt: async () => online, holdBeforeExecution: true });
  const response = await run.post();
  assert.equal(response.statusCode, 202);
  assert.equal(run.calls.prompts.length, 1);
  assert.deepEqual(run.calls.prompts[0], { version: 9, expectedSha256: original.sha256, forceRefresh: true });
  assert.equal(run.calls.paid.length, 0);
  online.bundle.TEMPLATES.naturalFill += " ONLINE_EDIT_AFTER_ENQUEUE";
  online.prompt = JSON.stringify(online.bundle); online.sha256 = digest(online.prompt); online.published = false;
  run.release();
  const outcome = (await run.settled()).result.outcomes[0];
  assert.equal(outcome.status, "fulfilled", outcome.reason?.message);
  assert.equal(run.calls.prompts.length, 1, "执行前不得重查并替换已接单资产");
  assert.equal(run.calls.paid.length, 1);
  const request = run.calls.paid[0], archive = run.calls.archived[0];
  assert.doesNotMatch(request.prompt, /ONLINE_EDIT_AFTER_ENQUEUE/);
  assert.match(request.prompt, /FROZEN_FEISHU_ASSET_TARGET/, "实际Prompt必须采用已接单飞书正文，不能回退本地种子");
  assert.match(request.prompt, /BRIGHT DIFFUSE LIGHTING/);
  assert.equal(archive.finalPrompt, request.prompt);
  assert.equal(archive.workflow.prompt, request.prompt);
  assert.equal(archive.workflow.relightPromptSha256, original.sha256);
  assert.equal(archive.workflow.relightPromptVersion, original.version);
  assert.equal(archive.workflow.relightPromptSource, original.source);
  assert.equal(archive.preview.relightPromptSha256, original.sha256);
  const publicJob = (await run.get()).payload;
  assert.equal(JSON.stringify(publicJob).includes("SCHEMA_VERSION"), false);
  assert.equal(JSON.stringify(publicJob).includes(request.prompt), false);
  assert.equal(Object.hasOwn(body.sharedInput, "relightPromptSnapshot"), false);
});

test("v10五模板送同一干净原图重建独立光影，摄影原文及版本/来源/零标注计划和实际Prompt冻结", async () => {
  const fingerprints = new Set(), cleanInputs = new Set(), actualPrompts = new Set();
  for (const [templateKey, marker] of [
    ["naturalFill", /BRIGHT DIFFUSE LIGHTING/],
    ["warmAmbient", /WARM HOME NIGHT LIGHTING/],
    ["windowDaylight", /DIRECTIONAL WINDOW SUNLIGHT/],
    ["accentWash", /TOP-DOWN ACCENT WALL WASH/],
    ["softStudio", /SOFT PHOTOGRAPHIC SCULPTING/],
  ]) {
    const body = requestBody(); Object.assign(body.sharedInput, { templateKey, prompt: "" }); delete body.sharedInput.lights;
    const run = harness({ body, holdGeneration: true });
    assert.equal((await run.post()).statusCode, 202);
    Object.assign(body.sharedInput, { templateKey: "custom", blendMode: "pronounced", lights: inputLights(), prompt: "篡改后的补光要求", quality: "high", outputResolution: "2K" });
    body.sharedInput.referenceImages = [{ ...body.sharedInput.referenceImages[0], dataUrl: "data:image/png;base64,invalid-after-enqueue" }];
    await waitUntil(() => run.calls.paid.length === 1);
    run.release();
    const outcome = (await run.settled()).result.outcomes[0];
    assert.equal(outcome.status, "fulfilled", outcome.reason?.message);
    assert.equal(run.calls.paid.length, 1);
    const request = run.calls.paid[0], archive = run.calls.archived[0];
    assert.equal(request.images.length, 1);
    assert.equal(request.n, 1);
    assert.equal(request.quality, "medium");
    assert.equal(request.output_format, "png");
    assert.match(request.prompt, marker);
    assertPhotographicQuality(request.prompt);
    assert.match(request.prompt, /REBUILD ALL LIGHTING/);
    assert.match(request.prompt, /BALANCED REBUILT LIGHTING/);
    assert.match(request.prompt, /Do not inherit the old brightness, white balance, time of day or fixture on\/off states/);
    assert.doesNotMatch(request.prompt, /Treat image 1's existing illumination as the lighting baseline|using the selected local lighting treatment and the existing scene as the lighting baseline|preserve the original key-light direction|preserve the original white balance|preserve the original time of day|Preserve unrelated fixtures and their on\/off state/i);
    assert.doesNotMatch(request.prompt, /篡改后的补光要求|Light 1:/);
    assert.match(request.prompt, /no manual lighting guide/i);
    assert.equal(Object.hasOwn(request, "mask"), false);
    assert.deepEqual(await sharp(decoded(request.images[0].image_url)).raw().toBuffer(), await sharp(sourceBytes).raw().toBuffer());
    cleanInputs.add(request.images[0].image_url); actualPrompts.add(request.prompt);
    assert.equal(archive.workflow.workflowVersion, "2026-10-26.gpt-relight.10");
    assert.equal(archive.workflow.version, "2026-10-26.gpt-relight.10");
    assert.equal(archive.workflow.templateSource, promptSnapshot().source);
    assert.equal(archive.workflow.templateKey, templateKey);
    assert.equal(archive.workflow.blendMode, "balanced");
    assert.equal(archive.workflow.quality, "medium");
    assert.equal(archive.workflow.outputResolution, "1K");
    assert.equal(archive.preview.templateKey, templateKey);
    assert.equal(archive.preview.blendMode, "balanced");
    assert.equal(archive.preview.referenceImageCount, 1);
    assert.deepEqual(archive.workflow.lights, []);
    assert.equal(archive.workflow.lightCount, 0);
    assert.equal(archive.referenceImages.length, 1);
    assert.equal(archive.referenceImages[0].imageUrl, sourceUrl);
    assert.deepEqual(archive.workflow.referenceRoles, ["original-source"]);
    assert.equal(archive.finalPrompt, request.prompt);
    assert.equal(archive.workflow.prompt, request.prompt);
    assert.equal(archive.sourcePrompt, "");
    assert.equal(archive.workflow.sourceSha256, digest(sourceBytes));
    assert.equal(archive.workflow.submittedSourceSha256, digest(decoded(request.images[0].image_url)));
    assert.equal(archive.workflow.guideSha256, null);
    assert.equal(archive.workflow.lightingPlanSha256, digest(JSON.stringify({ templateKey, blendMode: "balanced", originalLights: null, lights: [] })));
    fingerprints.add(archive.workflow.lightingPlanSha256);
    const restored = await run.get(), value = restored.payload.job.result.outcomes[0].value;
    assert.equal(value.upstream.metadata.workflowVersion, archive.workflow.workflowVersion);
    assert.equal(value.upstream.metadata.templateSource, archive.workflow.templateSource);
    assert.equal(value.upstream.metadata.templateKey, templateKey);
    assert.equal(JSON.stringify(restored.payload).includes(request.prompt), false);
    assert.equal(Object.hasOwn(value.upstream.metadata, "prompt"), false);
  }
  assert.equal(fingerprints.size, 5);
  assert.equal(actualPrompts.size, 5, "每个模板须提交自己的独立照明目标");
  assert.equal(cleanInputs.size, 1, "五模板须使用同一张干净原图，不以其他模板结果递推");
});


test("整体减弱/全部关闭自定义零标注单次GPT单原图，队列冻结原灯对象且实际Prompt完整归档", async () => {
  for (const originalLights of [{ action: "darken", amount: 0.7 }, { action: "turnOff" }]) {
    const body = requestBody(); Object.assign(body.sharedInput, { templateKey: "custom", originalLights: structuredClone(originalLights), lights: [], prompt: "" });
    const run = harness({ body, holdBeforeExecution: true });
    assert.equal((await run.post()).statusCode, 202); assert.equal(run.calls.paid.length, 0);
    Object.assign(body.sharedInput.originalLights, { action: "keep", amount: 0.1 }); body.sharedInput.lights = inputLights();
    run.release(); const outcome = (await run.settled()).result.outcomes[0]; assert.equal(outcome.status, "fulfilled", outcome.reason?.message);
    assert.equal(run.calls.paid.length, 1); assert.equal(run.calls.archived.length, 1);
    const request = run.calls.paid[0], archive = run.calls.archived[0];
    assert.equal(request.images.length, 1); assert.match(request.prompt, /WHOLE-SCENE ORIGINAL LIGHTS:/);
    assert.match(request.prompt, originalLights.action === "darken" ? /DIM ORIGINAL LIGHTS:.*by approximately 70%/s : /TURN OFF ALL ORIGINAL LIGHTS:/);
    assert.match(request.prompt, /without requiring user marks or an extra recognition pass/);
    assert.match(request.prompt, /rather than lowering whole-image or regional exposure/);
    assert.match(request.prompt, /does not dim, turn off or suppress any separately requested new illumination or newly added fixture/);
    assert.match(request.prompt, /If no original artificial source is identifiable, leave the scene unchanged by this action/);
    assert.doesNotMatch(request.prompt, /KEEP ORIGINAL LIGHTS:|Light 1:/);
    assert.deepEqual(archive.workflow.originalLights, originalLights); assert.deepEqual(archive.preview.originalLights, originalLights);
    assert.equal(archive.finalPrompt, request.prompt); assert.equal(archive.workflow.prompt, request.prompt); assertPhotographicQuality(request.prompt, { scope: "local" });
    assert.equal(archive.workflow.lightingPlanSha256, digest(JSON.stringify({ templateKey: "custom", blendMode: "balanced", originalLights, lights: [] })));
    assert.deepEqual(archive.workflow.referenceRoles, ["original-source"]); assert.equal(archive.referenceImages.length, 1);
    const restored = (await run.get()).payload.job.result.outcomes[0].value;
    assert.deepEqual(restored.upstream.metadata.originalLights, originalLights); assert.equal(Object.hasOwn(restored.upstream.metadata, "prompt"), false);
  }
});

test("整体关闭原灯与新增两灯具模式/点线面及可选原灯精修共存，新增补光不被整体关闭", async () => {
  const body = requestBody(); Object.assign(body.sharedInput, { templateKey: "custom", originalLights: { action: "turnOff" }, lights: [...inputLights(), ...inputActions().slice(2)], prompt: "" });
  const expected = normalizeRelightLights(body.sharedInput.lights), run = harness({ body });
  assert.equal((await run.post()).statusCode, 202); assert.equal((await run.settled()).result.outcomes[0].status, "fulfilled");
  const request = run.calls.paid[0], archive = run.calls.archived[0];
  assert.equal(run.calls.paid.length, 1); assert.equal(request.images.length, 2);
  assert.match(request.prompt, /TURN OFF ALL ORIGINAL LIGHTS:/); assert.match(request.prompt, /LIGHT ONLY:/); assert.match(request.prompt, /ADD FIXTURE AND LIGHT:/);
  assert.match(request.prompt, /DIM EXISTING LIGHT/); assert.match(request.prompt, /TURN OFF EXISTING LIGHT/); assert.match(request.prompt, /PRESERVE/);
  assert.match(request.prompt, /takes precedence over a marked dim or brighten request that would relight an original emitter/);
  assert.deepEqual(archive.workflow.lights, expected); assert.deepEqual(archive.workflow.originalLights, { action: "turnOff" });
  assert.deepEqual(archive.workflow.referenceRoles, ["original-source", "submitted-light-guide"]);
  assert.equal(digest(request.prompt), digest(archive.finalPrompt));
});

test("整体原灯错参或暗藏模板全局操作在入队前零付费，保留无编辑仍阻断", async () => {
  for (const patch of [
    { originalLights: { action: "wrong" } }, { originalLights: { action: "darken", amount: 0 } },
    { originalLights: { action: "darken", amount: "0.5" } }, { originalLights: { action: "keep", amount: 0.5 } },
    { originalLights: { action: "turnOff", extra: true } }, { originalLights: { action: "keep" }, lights: [] },
    { templateKey: "naturalFill", originalLights: { action: "turnOff" }, lights: [] },
  ]) {
    const body = requestBody(); Object.assign(body.sharedInput, { templateKey: "custom" }, patch);
    const run = harness({ body }); assert.equal((await run.post()).statusCode, 400);
    assert.equal(run.registry.get(body.jobId), null); assert.equal(run.calls.paid.length, 0); assert.equal(run.calls.archived.length, 0);
  }
});

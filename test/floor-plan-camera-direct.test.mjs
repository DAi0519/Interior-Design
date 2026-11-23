/**
 * [INPUT]: 依赖主工作台机位任务 API、机位标注服务与 OneAPI 客户端，通过替身模拟模型目录、图片请求与归档。
 * [OUTPUT]: 验证提示词直出的模式准入、原文和机位图实际送模、Qwen独立准入和归档、取景距离与矩形外框的冻结和回读、多模型批次恢复及同文归档。
 * [POS]: test 的平面图机位直出路径回归，只运行本地替身。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { createFloorPlanApiHandler } from '../src/floor-plan-api.mjs';
import { FLOOR_PLAN_CAMERA_WORKFLOW, executeFloorPlanCamera, floorPlanCameraTaskTotal,
  prepareFloorPlanCameraInput, readFloorPlanCameraConfig } from '../src/floor-plan-camera-service.mjs';
import { MODEL_CONFIGS } from '../src/model-config.mjs';
import { createOneApiClient } from '../src/oneapi-client.mjs';
import { FLOOR_PLAN_CAMERA_QWEN } from '../src/floor-plan-camera-qwen.mjs';

const prefix = '/api/floor-plan-camera';
const imageModelKeys = ['gptImage26Flare', 'banana21'];
const getModels = async () => imageModelKeys.map(key => ({ id: MODEL_CONFIGS[key].id }));
const image = (width, height) => sharp({ create: { width, height, channels: 3, background: '#fff' } }).png().toBuffer();
const hash = value => createHash('sha256').update(value).digest('hex');
const userRequirements = '  保留图纸右侧的门洞。\n\n自然天光，暖色橡木。\t  ';

async function directInput() {
  const bytes = await image(320, 160);
  return { action: 'render', workflowVersion: FLOOR_PLAN_CAMERA_WORKFLOW, generationMode: 'direct',
    camera: { x: .4, y: .6, heading: 90, fov: 60, height: 1.5 },
    referenceImage: { name: 'plan.png', type: 'image/png', size: bytes.length,
      dataUrl: `data:image/png;base64,${bytes.toString('base64')}` },
    resolution: '1K', aspectRatio: '16:9', userRequirements };
}

test('直出配置在无视觉模型或推理资产时仍公布；拒绝空提示词和非法模式', async () => {
  const config = await readFloorPlanCameraConfig({ getModels, getPrompt: async () => { throw Error('资产未配置'); } });
  assert.deepEqual(config.generationModes, ['agent', 'direct']);
  assert.equal(config.available, false);
  assert.equal(config.models.find(model => model.key === 'banana21').available, true);

  const value = { ...await directInput(), modelSelections: [{ key: 'banana21' }], imageCount: 1 };
  const unexpected = () => assert.fail('非法直出输入不能读取模型或推理资产');
  for (const patch of [{ userRequirements: '' }, { userRequirements: ' \n\t ' },
    { userRequirements: 'x'.repeat(4001) }, { userRequirements: '正文\u0000' }, { generationMode: 'unknown' },
    { agentModelKey: 'gemini3pro' }, { promptVersion: 11 }, { promptSha256: 'a'.repeat(64) }]) {
    await assert.rejects(prepareFloorPlanCameraInput({ ...value, ...patch }, { getModels: unexpected, getPrompt: unexpected }),
      { statusCode: 400 });
  }
  await assert.rejects(prepareFloorPlanCameraInput({ ...value, workflowVersion: '2026-11-07.floor-plan-camera.8' },
    { getModels: unexpected, getPrompt: unexpected }), { statusCode: 409 });
});

test('主工作台 Qwen 直出只走 ComfyUI，归档与成图共享裁剪标注图和任务 ID', async () => {
  const { key, id, label, width, height, resolution, aspectRatio, workflowVersion } = FLOOR_PLAN_CAMERA_QWEN;
  const output = await image(width, height);
  const requests = [];
  const qwenClient = {
    checkAvailability: async () => ({ available: true }),
    async generateImage(request) {
      requests.push(request);
      return {
        images: [{ url: `data:image/png;base64,${output.toString('base64')}` }],
        transport: 'comfyui-workflow',
        metadata: { promptId: 'camera-comfy-fixture', workflowVersion, outputSha256: hash(output) },
      };
    },
  };
  const noOneApi = async () => { throw Error('OneAPI 不可用'); };
  const config = await readFloorPlanCameraConfig({ getModels: noOneApi, includeAgentPrompt: false, qwenClient });
  assert.deepEqual(config.models.map(model => [model.key, model.id, model.available, model.sizes[aspectRatio][resolution]]),
    [[key, id, true, '1280x720']]);
  const withoutQwen = await readFloorPlanCameraConfig({ getModels, includeAgentPrompt: false });
  assert.ok(!withoutQwen.models.some(model => model.key === key));

  const body = { ...await directInput(), modelSelections: [{ key }], imageCount: 1 };
  body.camera.cropToView = true;
  const dependencies = { getModels: noOneApi, getPrompt: () => assert.fail('Qwen 直出不读取推理资产'), qwenClient };
  await assert.rejects(prepareFloorPlanCameraInput({ ...body, resolution: '2K' }, dependencies), /不支持 16:9 \/ 2K/);
  await assert.rejects(prepareFloorPlanCameraInput(body, { ...dependencies,
    qwenClient: { checkAvailability: async () => ({ available: false }) } }), { statusCode: 409 });

  const archived = [];
  const handler = createFloorPlanApiHandler({ prefix, featureMode: 'floorPlanCamera', geometryEnabled: false,
    getClient: () => null, getModels: noOneApi, getPrompt: dependencies.getPrompt,
    prepareInput: (value, options) => prepareFloorPlanCameraInput(value, { ...options, qwenClient }),
    execute: (value, options) => executeFloorPlanCamera(value, { ...options, qwenClient }),
    verifyArchive: async ({ agentLabels, modelLabels }) => {
      assert.deepEqual(agentLabels, []);
      assert.deepEqual(modelLabels, [label]);
    },
    scheduleArchive: input => { archived.push(input); return { generationId: input.archiveId, status: 'pending' }; },
    readJson: async request => request.body,
    sendJson(response, status, data) { Object.assign(response, { status, data }); },
  });
  async function request(method, path, value) {
    const response = {};
    await handler({ method, url: path, body: value }, response, path);
    return response;
  }
  const jobId = 'camera-qwen-preview-test';
  const jobs = `${prefix}/jobs`;
  assert.equal((await request('POST', jobs, { ...body, jobId })).status, 202);
  let recovered;
  const deadline = Date.now() + 3000;
  do {
    recovered = (await request('GET', `${jobs}/${jobId}`)).data.job;
    if (Date.now() > deadline) assert.fail('Qwen 直出未完成');
    if (recovered.status === 'running') await new Promise(resolve => setTimeout(resolve, 5));
  } while (recovered.status === 'running');
  assert.equal(recovered.status, 'success', JSON.stringify(recovered.error));
  const result = recovered.result.items[0].result;
  assert.equal(requests.length, 1);
  const [sent] = requests;
  assert.deepEqual({ ...sent, images: sent.images.length }, { prompt: userRequirements, width, height, resolution, images: 1 });
  const [reference] = sent.images;
  assert.notEqual(reference.image_url, body.referenceImage.dataUrl);
  assert.equal(result.actual.referenceImageCrop.mode, 'view-rays-bounds');
  assert.equal(result.actual.comfyui.workflowVersion, workflowVersion);
  assert.equal(result.image.sha256, hash(output));
  assert.equal(archived.length, 1);
  assert.equal(archived[0].referenceImages[1].imageUrl, reference.image_url);
  assert.equal(archived[0].preview.transport, 'comfyui-workflow');
  assert.equal(archived[0].workflow.receipts.image.requestId, 'camera-comfy-fixture');
});

test('直出批次的原文和无框机位图随每张图送模、恢复和归档', { timeout: 5000 }, async context => {
  const body = { ...await directInput(), jobId: 'camera-direct-batch-0001', imageCount: 2,
    modelSelections: [{ key: 'gptImage26Flare', complexity: 'high' }, { key: 'banana21' }] };
  body.camera.guideDepth = .65;
  body.camera.showFrame = false;
  const payloads = [], archived = [];
  const outputImages = new Map(await Promise.all(imageModelKeys.map(async key => {
    const size = MODEL_CONFIGS[key].sizes['16:9']['1K'];
    const [width, height] = size.split('x').map(Number);
    return [MODEL_CONFIGS[key].id, (await image(width, height)).toString('base64')];
  })));
  context.mock.method(globalThis, 'fetch', async (target, options) => {
    assert.ok(target.endsWith('/responses'));
    assert.equal(options.method, 'POST');
    const payload = JSON.parse(options.body);
    payloads.push(payload);
    assert.ok(outputImages.has(payload.model), '仅准许所选生图模型');
    assert.equal(payload.instructions, undefined);
    assert.deepEqual(payload.tools.map(tool => [tool.type, tool.n]), [['image_generation', 1]]);
    assert.deepEqual(payload.input[0].content.map(part => part.type), ['input_text', 'input_image']);
    assert.equal(payload.input[0].content[0].text, userRequirements);
    assert.equal(payload.background, payload.model === MODEL_CONFIGS.gptImage26Flare.id);
    if (payload.background) assert.equal(payload.tools[0].complexity, 'high');
    return Response.json({ id: `resp_camera_direct_${payloads.length}`, status: 'completed',
      output: [{ type: 'image_generation_call', result: outputImages.get(payload.model) }],
      usage: { price: { currency: 'USD', payable_amount: .001 } } });
  });

  const handler = createFloorPlanApiHandler({ prefix, featureMode: 'floorPlanCamera', geometryEnabled: false,
    getClient: () => createOneApiClient('test-key', { diagnosticSink: () => {} }), getModels,
    getPrompt: () => assert.fail('直出不能读取飞书推理资产'), prepareInput: prepareFloorPlanCameraInput,
    execute: executeFloorPlanCamera, getTaskTotal: floorPlanCameraTaskTotal,
    verifyArchive: async ({ agentLabels, modelLabels }) => {
      assert.deepEqual(agentLabels, []);
      assert.equal(modelLabels.length, 2);
    },
    scheduleArchive: input => { archived.push(input); return { generationId: input.archiveId, status: 'pending' }; },
    readJson: async request => request.body,
    sendJson(response, status, data) { Object.assign(response, { status, data }); },
  });
  async function request(method, path, value) {
    const response = {};
    await handler({ method, url: path, body: value }, response, path);
    return response;
  }
  const jobsPath = `${prefix}/jobs`;
  const submissions = await Promise.all([request('POST', jobsPath, body), request('POST', jobsPath, body)]);
  assert.ok(submissions.every(response => response.status === 202 && response.data.job.total === 4));
  const jobPath = `${jobsPath}/${body.jobId}`, deadline = Date.now() + 3000;
  let recovered;
  do {
    recovered = (await request('GET', jobPath)).data.job;
    if (Date.now() > deadline) throw Error('直出任务未完成');
    if (recovered.status === 'running') await new Promise(resolve => setTimeout(resolve, 1));
  } while (recovered.status === 'running');
  assert.equal(recovered.status, 'success', JSON.stringify(recovered.error));
  const result = recovered.result;
  assert.equal(result.generationMode, 'direct');
  assert.deepEqual(result.camera, body.camera);
  assert.equal(result.compiledPrompt, userRequirements);
  assert.equal(result.compiledPromptSha256, hash(userRequirements));
  assert.equal(result.agent, undefined);
  assert.equal(result.prompt, undefined);
  assert.equal(result.receipts?.agent, undefined);

  assert.equal(payloads.length, 4);
  const referenceImages = new Set(payloads.map(payload => payload.input[0].content[1].image_url));
  assert.equal(referenceImages.size, 1);
  const [submitted] = referenceImages;
  assert.notEqual(submitted, body.referenceImage.dataUrl, '提交的是标注图而不是原件');
  const defaultGuide = await prepareFloorPlanCameraInput({ ...await directInput(), modelKey: 'banana21' }, { getModels });
  assert.notEqual(submitted, defaultGuide.guide.imageUrl, '冻结的取景距离须改变实际送模标注图');
  const framedGuide = await prepareFloorPlanCameraInput({ ...await directInput(), modelKey: 'banana21',
    camera: { ...body.camera, showFrame: true } }, { getModels });
  const guidePixel = async url => [...await sharp(Buffer.from(url.split(',')[1], 'base64'))
    .extract({ left: 123, top: 60, width: 1, height: 1 }).removeAlpha().raw().toBuffer()];
  assert.deepEqual(await guidePixel(submitted), [255, 255, 255], '取消取景框须擦除实际送模图的矩形边线');
  assert.notDeepEqual(await guidePixel(framedGuide.guide.imageUrl), [255, 255, 255]);
  const submittedSha256 = hash(Buffer.from(submitted.split(',')[1], 'base64'));
  assert.equal(archived.length, 4);
  assert.equal(new Set(archived.map(input => input.archiveId)).size, 4);
  for (const slot of result.items) {
    assert.equal(slot.status, 'success');
    assert.equal(slot.result.actual.generationMode, 'image-to-image');
    assert.equal(slot.result.actual.agentInputImageSha256, undefined);
    assert.equal(slot.result.actual.referenceImageSha256, submittedSha256);
    assert.deepEqual(slot.result.actual.camera, body.camera);
    assert.equal(slot.result.receipts.image.usageCost.costUsd, .001);
    assert.equal(slot.result.sync.status, 'pending');
  }
  for (const input of archived) {
    assert.equal(input.finalPrompt, userRequirements);
    assert.equal(input.sourcePrompt, userRequirements);
    assert.equal(input.workflow.generationMode, 'direct');
    assert.deepEqual(input.workflow.camera, body.camera);
    assert.equal(input.workflow.compiledPromptSha256, hash(userRequirements));
    assert.equal(input.workflow.agentModelKey, undefined);
    assert.equal(input.workflow.prompt, undefined);
    assert.equal(input.workflow.receipts.agent, undefined);
    assert.deepEqual(input.referenceImages.map(reference => reference.imageUrl), [body.referenceImage.dataUrl, submitted]);
  }
  assert.equal((await request('POST', jobsPath, body)).data.job.status, 'success');
  assert.equal((await request('GET', jobPath)).data.job.status, 'success');
  await assert.rejects(request('POST', jobsPath, { ...body, userRequirements: `${userRequirements}\n再加一扇窗` }), { statusCode: 409 });
  await assert.rejects(request('POST', jobsPath, { ...body, camera: { ...body.camera, guideDepth: .66 } }), { statusCode: 409 });
  await assert.rejects(request('POST', jobsPath, { ...body, camera: { ...body.camera, showFrame: true } }), { statusCode: 409 });
  assert.equal(payloads.length, 4);
  assert.equal(archived.length, 4);
});

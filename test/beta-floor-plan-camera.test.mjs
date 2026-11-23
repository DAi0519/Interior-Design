/**
 * [INPUT]: 依赖Beta跑图、机位主服务、真实PNG样本和OneAPI/飞书替身
 * [OUTPUT]: 验证高清编辑底图与墙线回读、GPT 6.1 Sol 同机位推理复用与提示词直出、取景距离和取景框开关、实际送模词和标注、逐图费用与归档回读、失败恢复
 * [POS]: test 的Beta平面图机位跨层回归
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { betaResultCostUsd, betaResultVersion, buildBetaRunFields } from '../src/beta-base.mjs';
import { createBetaApiHandler, createBetaRunnerService } from '../src/beta-runner.mjs';
import { createBetaFloorPlanCameraService, normalizeBetaFloorPlanCameraInput } from '../src/beta-floor-plan-camera.mjs';
import { restoreFloorPlanCameraArchiveSnapshot, verifyFloorPlanCameraArchive } from '../src/beta-floor-plan-camera-archive.mjs';
import { FLOOR_PLAN_CAMERA_WORKFLOW } from '../src/floor-plan-camera-service.mjs';
import { decodeImageDataUrl } from '../src/image-artifact.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const asset = { code: 'floor-plan-camera-frame-agent', name: '机位', prompt: '固定机位规则',
  sha256: hash('固定机位规则'), source: 'feishu:test:floor-plan-camera@v9', version: 9, published: true };
const pose = { x: .5, y: .5, heading: 270, fov: 60, height: 1.5 };
const modelKeys = ['gptImage26Sunburst', 'banana21', 'bananaPro'];
const bananaProId = 'gemini-3-pro-image-preview';
const gpt61Sol = { key: 'gpt61Sol', id: 'gpt-6.1-sol', label: 'GPT 6.1 Sol' };
const models = [{ id: 'gpt-image-2.6-sunburst' }, { id: 'gemini-nano-banana-2.1' }, { id: bananaProId }, { id: 'gemini-3.5-flash' }];
const agentResponse = JSON.stringify({
  frame: { composition: { zh: '正对墙面', en: 'Facing the wall.' }, foreground: null,
    midground: null, background: { zh: '空白墙', en: 'An empty wall.' }, crop: null, excluded: null },
  image_prompt: 'Natural architectural photography.',
});

async function image(width = 96, height = 64) {
  const bytes = await sharp({ create: { width, height, channels: 3, background: '#eee' } }).png().toBuffer();
  return { name: 'plan.png', type: 'image/png', size: bytes.length, dataUrl: `data:image/png;base64,${bytes.toString('base64')}` };
}

function batch(keys = modelKeys, directPrompt) {
  return { jobId: 'beta-camera-same-input', batchId: 'BETA-camera-same-input', sampleSetId: 'SET-camera',
    testTime: '2026-11-10 16:00:00', featureMode: 'floorPlanCamera',
    items: keys.map((modelKey, index) => ({ caseId: 'SAMPLE-plan', sampleId: 'SAMPLE-plan', runId: `RUN-camera-example-${index}`,
      input: { featureMode: 'floorPlanCamera', modelKey, camera: { ...pose },
        ...(directPrompt === undefined ? { prompt: '保留平面图所示空间',
          promptAgentModelKey: 'gemini35flash', promptVersion: asset.version, floorPlanCameraPromptSha256: asset.sha256 }
          : { floorPlanCameraGenerationMode: 'direct', prompt: directPrompt }),
        floorPlanCameraWorkflowVersion: FLOOR_PLAN_CAMERA_WORKFLOW, resolution: '1K', aspectRatio: '16:9' } })),
  };
}

async function setup({ agent = () => agentResponse, getModels = () => models, getPrompt = () => asset,
  beforeImage = () => {}, beforeSync = () => {}, sourceImage } = {}) {
  const source = sourceImage ?? await image();
  const preparedImage = await image(1536, 864);
  const bananaProImage = await image(1376, 768);
  const events = { agents: [], images: [], starts: [], synced: [], failed: [], schemas: [], promptReads: 0 };
  const render = async request => {
    events.images.push(request);
    beforeImage(request);
    const output = request.model === bananaProId ? bananaProImage : preparedImage;
    return { requestId: `image-${events.images.length}`, images: [{ url: output.dataUrl }], usageCost: { costUsd: .02 } };
  };
  const cameraService = createBetaFloorPlanCameraService({
    getModels: async () => getModels(), getPrompt: async () => {
      events.promptReads += 1;
      return getPrompt();
    }, requireKey: () => 'fixed-test-key',
    getClient: () => ({ generatePrompt: async request => {
      events.agents.push(request);
      return { text: agent(), requestId: `agent-${events.agents.length}`, usageCost: { costUsd: .01 } };
    }, generateImage: render, editImageAsync: render }),
  });
  const service = createBetaRunnerService({ floorPlanCameraService: cameraService, generationService: {},
    baseStore: {
      config: {},
      async verifySchema(options) { events.schemas.push(options); },
      async getSampleSet() { return { status: '可用', recordId: 'rec-set', samples: [{ sampleId: 'SAMPLE-plan', recordId: 'rec-sample', image: source }] }; },
      async resolveSample(setId, sampleId, options) {
        assert.equal(setId, 'SET-camera'); assert.equal(sampleId, 'SAMPLE-plan');
        assert.equal(options.targetFeatureMode, 'floorPlanCamera');
        return { image: source };
      },
      async beginRun({ item }) {
        events.starts.push(item);
        return { recordId: item.runId, recordUrl: `https://example.test/${item.runId}` };
      },
      async completeRun(recordId, result) {
        beforeSync(recordId, result);
        events.synced.push({ recordId, result });
        return { recordId, recordUrl: `https://example.test/${recordId}` };
      },
      async failRun(recordId, error, options) { events.failed.push({ recordId, error, options }); },
    },
  });
  return { service, source, events };
}

async function done(service, id) {
  for (let i = 0; i < 200; i++) {
    const job = service.getJob(id);
    if (job?.status !== 'running') return job;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('Beta job timeout');
}

test('同一样本机位的三次出图只用 GPT 6.1 Sol 分析一次，每张以同一真实标注图和同文归档', async () => {
  const { service, source, events } = await setup({ getModels: () => [...models, { id: gpt61Sol.id }] });
  assert.ok((await service.config()).features.includes('floorPlanCamera'));
  const config = await service.getFloorPlanCameraConfig();
  assert.equal(config.defaultAgentModel, 'gemini35flash');
  assert.equal(config.agentModels.find(({ key }) => key === gpt61Sol.key)?.selectable, true);
  const body = batch();
  for (const { input } of body.items) {
    input.camera.guideDepth = .35;
    input.promptAgentModelKey = gpt61Sol.key;
  }
  await service.start(body);
  const job = await done(service, body.jobId);
  assert.equal(job.status, 'success');
  assert.equal(job.result.results.length, 3);
  assert.deepEqual(events.schemas, [{ featureMode: 'floorPlanCamera' }]);
  assert.equal(events.agents.length, 1);
  assert.equal(events.agents[0].model, gpt61Sol.id);
  const { camera } = JSON.parse(events.agents[0].userPrompt);
  assert.equal(camera.guide_depth_short_side_ratio, .35);
  assert.equal(camera.horizontal_fov_degrees, pose.fov);
  assert.equal(events.images.length, 3);
  const guide = events.agents[0].imageUrl;
  assert.notEqual(guide, source.dataUrl);
  assert.deepEqual(events.starts.map(item => item.input.referenceImages[0].dataUrl), [guide, guide, guide]);
  assert.ok(events.images.every(request => request.images.length === 1 && request.images[0].image_url === guide));
  assert.equal(new Set(events.images.map(request => request.prompt)).size, 1);
  assert.equal(events.images.find(request => request.model === bananaProId)?.size, '1376x768');
  assert.equal(events.starts.find(item => item.input.modelKey === 'bananaPro')?.modelLabel, 'Banana Pro');
  const workflows = events.synced.map(({ result }) => JSON.parse(result.sync.archiveFields['生成参数']).workflow);
  assert.deepEqual(workflows.map(({ agent }) => agent), body.items.map(() => gpt61Sol));
  assert.deepEqual(events.synced.map(({ result }) => result.sync.archiveFields['Prompt融合']), body.items.map(() => gpt61Sol.label));
  const bananaPro = workflows.find(workflow => workflow.model.key === 'bananaPro');
  assert.equal(bananaPro.model.id, bananaProId);
  assert.equal(bananaPro.receipts.image.usageCost.costUsd, .02);
  assert.ok(workflows.every(workflow => workflow.receipts.agent.requestId === 'agent-1'));
  assert.ok(workflows.every(workflow => workflow.actual.referenceImageSha256 === events.starts[0].input.floorPlanCameraSubmittedSha256));
  assert.ok(workflows.every(workflow => workflow.camera.guideDepth === .35 && workflow.actual.camera.guideDepth === .35));
  assert.deepEqual(workflows.map(workflow => workflow.betaCostUsd).sort(), [.02, .02, .03]);
  assert.equal(workflows.filter(workflow => workflow.agentCostAttributed).length, 1);
});

test('Beta 机位直出保留原词、只向生图模型发送同一标注图并按单图费用归档', async () => {
  const { service, source, events } = await setup({
    getModels: () => models.filter(model => model.id !== 'gemini-3.5-flash'),
    getPrompt: () => { throw new Error('空间推理资产离线'); },
  });
  const prompt = '  蓝点为机位，按箭头出图。\n保持窗边日光。  ';
  const body = batch(['gptImage26Sunburst', 'banana21'], prompt);
  for (const { input } of body.items) Object.assign(input.camera, { guideDepth: .4, showFrame: false });
  await service.start(body);
  const job = await done(service, body.jobId);
  assert.equal(job.status, 'success');
  assert.deepEqual(job.stages, { generated: 2, synced: 2 });
  assert.equal(events.promptReads, 0);
  assert.deepEqual(events.agents, []);
  assert.equal(events.images.length, 2);
  const guide = events.images[0].images[0].image_url;
  const guideBytes = decodeImageDataUrl(guide);
  assert.notEqual(guide, source.dataUrl);
  for (const request of events.images) {
    assert.equal(request.prompt, prompt);
    assert.deepEqual(request.images, [{ image_url: guide }]);
    assert.equal(request.n, 1);
  }
  for (const { recordId, result } of events.synced) {
    const item = events.starts.find(start => start.runId === recordId);
    assert.equal(item.input.referenceImages[0].dataUrl, guide);
    const frozen = buildBetaRunFields({ ...body, item });
    assert.equal(frozen['输入文本'], prompt);
    const storedSnapshot = JSON.parse(frozen['配置快照']);
    assert.equal(storedSnapshot.floorPlanCameraGenerationMode, 'direct');
    assert.deepEqual(storedSnapshot.camera, { ...pose, guideDepth: .4, showFrame: false });
    assert.equal(storedSnapshot.floorPlanCameraDirectPromptSha256, hash(prompt));
    assert.equal(storedSnapshot.floorPlanCameraSubmittedSha256, hash(guideBytes));
    const sourceItem = body.items.find(start => start.runId === recordId);
    const sourceFields = buildBetaRunFields({ ...body, item: { ...sourceItem, input: normalizeBetaFloorPlanCameraInput(sourceItem.input) } });
    assert.deepEqual(restoreFloorPlanCameraArchiveSnapshot(JSON.parse(sourceFields['配置快照']), frozen['配置快照']), storedSnapshot);
    const fields = { ...result.sync.archiveFields, 尺寸: '1536x864' };
    assert.equal(fields['最终 Prompt'], prompt);
    for (const key of ['Prompt融合', 'Agent 编码', 'Agent 版本']) assert.ok(fields[key] == null || fields[key] === '');
    const { workflow } = JSON.parse(fields['生成参数']);
    assert.equal(workflow.generationMode, 'direct');
    assert.equal(workflow.compiledPromptSha256, hash(prompt));
    assert.equal(workflow.agent, undefined);
    assert.equal(workflow.prompt, undefined);
    assert.equal(workflow.receipts.agent, undefined);
    assert.equal(workflow.receipts.image.usageCost.costUsd, .02);
    assert.equal(betaResultCostUsd(result), .02);
    assert.equal(betaResultVersion(result), `floor-plan-camera@${FLOOR_PLAN_CAMERA_WORKFLOW}`);
    const completion = { 'Prompt / 工作流版本': betaResultVersion(result), '费用（USD）': betaResultCostUsd(result) };
    const options = { imageBytes: decodeImageDataUrl(result.images[0].url), submittedBytes: guideBytes, completion };
    assert.doesNotThrow(() => verifyFloorPlanCameraArchive(fields, storedSnapshot, options));
    assert.throws(() => verifyFloorPlanCameraArchive(fields,
      { ...storedSnapshot, camera: { ...storedSnapshot.camera, guideDepth: .5 } }, options), /实际机位/);
    assert.throws(() => verifyFloorPlanCameraArchive(fields,
      { ...storedSnapshot, camera: { ...storedSnapshot.camera, showFrame: true } }, options), /实际机位/);
    const changedPrompt = prompt.trim();
    const changedWorkflow = { ...workflow, compiledPrompt: changedPrompt, compiledPromptSha256: hash(changedPrompt), userRequirements: changedPrompt };
    const changedFields = { ...fields, '最终 Prompt': changedPrompt, 生成参数: JSON.stringify({ workflow: changedWorkflow, referenceImageCount: 1 }) };
    assert.throws(() => verifyFloorPlanCameraArchive(changedFields, storedSnapshot, options), /Prompt|提示词|配置/);
    assert.throws(() => verifyFloorPlanCameraArchive(fields, storedSnapshot,
      { ...options, submittedBytes: decodeImageDataUrl(source.dataUrl) }), /实际送模|附件/);
  }
  assert.equal(events.synced.length, 2);
});

test('Beta 机位直出拒绝空词、批内不同词和混入的推理配置', async () => {
  const { service, events } = await setup();
  assert.throws(() => service.start(batch(['banana21'], ' \n\t ')), /提示词|Prompt/);
  const invalid = batch(['banana21'], '直接出图');
  invalid.items[0].input.promptAgentModelKey = 'gemini35flash';
  invalid.items[0].input.promptVersion = asset.version;
  invalid.items[0].input.floorPlanCameraPromptSha256 = asset.sha256;
  assert.throws(() => service.start(invalid), /推理|配置|Prompt/);
  const inconsistent = batch(['banana21', 'bananaPro'], '同一批次的词');
  inconsistent.items[1].input.prompt += ' ';
  await assert.rejects(service.start(inconsistent), /同一.*提示词/);
  assert.deepEqual(events.starts, []);
  assert.deepEqual(events.agents, []);
  assert.deepEqual(events.images, []);
});

test('Agent格式失败只调用一次并阻断所有出图，手动重试重新分析', async () => {
  let malformed = true;
  const { service, events } = await setup({ agent: () => malformed ? 'not JSON' : agentResponse });
  const body = batch(['banana21', 'banana21']);
  await service.start(body);
  assert.equal((await done(service, body.jobId)).status, 'failed');
  assert.equal(events.agents.length, 1);
  assert.equal(events.images.length, 0);
  assert.equal(events.failed.length, 2);
  assert.ok(events.failed.every(event => event.error.floorPlanDiagnostic.code === 'camera_agent_output_invalid'));
  malformed = false;
  const jobId = 'beta-camera-manual-agent-retry';
  await service.retry(body.jobId, { jobId });
  assert.equal((await done(service, jobId)).status, 'success');
  assert.equal(events.agents.length, 2);
  assert.equal(events.images.length, 2);
});

test('生成失败手动重试复用已成功的推理，归档失败仅重试原结果', async () => {
  let imageFailed = false;
  let syncFailed = false;
  const { service, events } = await setup({
    beforeImage(request) {
      if (request.model === models[0].id && !imageFailed) {
        imageFailed = true;
        throw new Error('image upstream failure');
      }
    },
    beforeSync(recordId) {
      if (recordId.endsWith('-1') && !syncFailed) {
        syncFailed = true;
        throw new Error('sync unavailable');
      }
    },
  });
  const body = batch(['gptImage26Sunburst', 'banana21']);
  await service.start(body);
  assert.equal((await done(service, body.jobId)).status, 'failed');
  assert.equal(events.agents.length, 1);
  assert.equal(events.images.length, 2);
  assert.equal(events.synced.length, 0);
  const jobId = 'beta-camera-manual-image-retry';
  await service.retry(body.jobId, { jobId });
  assert.equal((await done(service, jobId)).status, 'success');
  assert.equal(events.agents.length, 1);
  assert.equal(events.images.length, 3);
  assert.equal(events.starts.length, 3);
  assert.equal(events.synced.length, 2);
  assert.deepEqual(events.synced.map(event => event.result.upstream.metadata.costUsd).sort(), [.02, .03]);
});

test('机位配置错误时拒绝入队，编辑接口回传原尺寸正向底图及墙线且不创建任务', async () => {
  const sourceImage = await image(736, 1008);
  const { service, events } = await setup({ sourceImage });
  await assert.rejects(service.start(batch(Array(5).fill('banana21'))), /每个机位最多生成/);
  const invalid = batch();
  invalid.items[0].input.floorPlanCameraPromptSha256 = 'a'.repeat(64);
  await assert.rejects(service.start(invalid), /机位Prompt版本/);
  let result;
  const handler = createBetaApiHandler({ service, sendJson: (_response, status, body) => { result = { status, body }; } });
  assert.equal(await handler({ method: 'GET' }, {}, '/api/beta/sample-sets/SET-camera/samples/SAMPLE-plan/camera-annotation'), true);
  assert.equal(result.status, 200);
  const { imageDataUrl, ...annotation } = result.body;
  assert.deepEqual(annotation, { width: 736, height: 1008, walls: null });
  const [editorPixels, sourcePixels] = await Promise.all([imageDataUrl, sourceImage.dataUrl]
    .map(url => sharp(decodeImageDataUrl(url)).raw().toBuffer({ resolveWithObject: true })));
  assert.deepEqual(editorPixels.info, sourcePixels.info);
  assert.deepEqual(editorPixels.data, sourcePixels.data);
  assert.equal(events.starts.length, 0);
  assert.equal(events.agents.length, 0);
  assert.equal(events.images.length, 0);
});

test('Beta机位配置复用模型和Prompt目录，归档表校验留到任务准入', async () => {
  const { service, events } = await setup();
  let result;
  const handler = createBetaApiHandler({ service, sendJson: (_response, status, body) => { result = { status, body }; } });
  assert.equal(await handler({ method: 'GET' }, {}, '/api/beta/floor-plan-camera/config'), true);
  assert.equal(result.status, 200);
  assert.equal(result.body.available, true);
  assert.deepEqual(result.body.betaGenerationModes, ['agent', 'direct']);
  assert.equal(result.body.prompt.sha256, asset.sha256);
  assert.ok(result.body.models.some(model => model.key === 'banana21' && model.available));
  assert.ok(result.body.models.some(model => model.key === 'bananaPro' && model.id === bananaProId && model.available));
  assert.equal(Object.hasOwn(result.body, 'archive'), false);
  assert.deepEqual(events.schemas, []);
});

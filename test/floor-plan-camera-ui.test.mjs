/**
 * [INPUT]: 依赖平面图机位 UI 夹具运行页面控制器与归档状态
 * [OUTPUT]: 验证参数挂载与 START、任务反馈与结果、推理和直出选模、失败恢复与逐图归档
 * [POS]: test 的平面图机位前端回归，不访问模型、飞书或网络
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { SESSION, config, fixture, modelOption, planReference, rendered, source } from './floor-plan-camera-ui-fixture.mjs';

test('嵌入时参数及START挂入原容器，生成状态与画布任务共用', async () => {
  const submission = Promise.withResolvers();
  const f = await fixture({ embedded: true, respond: call => call.method === 'POST' ? submission.promise
    : Promise.resolve({ job: { status: 'failed', error: '模拟失败' } }) });
  assert.deepEqual(f.mounting, [['floorPlanCamera', 'camera-settings', 'camera-actions']]);
  assert.equal(f.body.classList.contains('plan-camera-integrated'), true);
  assert.equal(f.node('sidebar').removed, true);
  assert.equal(f.node('status').hidden, true);
  assert.equal(f.node('sourceCount').textContent, '0 / 1');
  const settings = f.node('settings');
  assert.equal(settings.getAttribute('data-camera-source'), 'empty');
  assert.equal(settings.getAttribute('data-camera-canvas'), 'empty');
  assert.equal(settings.getAttribute('data-camera-blocked'), '请上传平面图');
  await f.upload(source('户型'));
  assert.equal(settings.getAttribute('data-camera-source'), 'ready');
  assert.equal(settings.getAttribute('data-camera-canvas'), 'ready');
  assert.equal(settings.getAttribute('data-camera-blocked'), '请在平面图上放置相机');
  await f.click('placeCenter');
  assert.equal(settings.getAttribute('data-camera-blocked'), '');
  assert.equal(f.node('sourceCount').textContent, '1 / 1');
  assert.equal(f.node('sourceInput').attributes.get('aria-label'), '替换平面图');
  assert.equal(f.node('sourceHint').textContent, '点击或拖入新图替换');
  assert.equal(f.node('generateLabel').textContent, 'START');
  await f.click('generate');
  assert.equal(f.posts().length, 1);
  assert.equal(settings.getAttribute('data-camera-busy'), 'true');
  assert.equal(settings.getAttribute('data-camera-pending'), 'true');
  assert.equal(f.node('generateLabel').textContent, 'RUNNING…');
  assert.equal(f.node('generate').attributes.get('aria-busy'), 'true');
  assert.equal(f.node('generationActions').classList.contains('is-busy'), true);
  assert.equal(f.node('generationFeedback').hidden, false);
  assert.equal(f.node('generationFeedbackText').textContent, '正在提交图片任务…');
  assert.equal(f.node('status').hidden, true);
  submission.resolve({ job: { status: 'running' } });
  await f.click('showSource');
  assert.equal(settings.getAttribute('data-camera-busy'), 'false');
  assert.equal(settings.getAttribute('data-camera-pending'), 'false');
  assert.equal(f.node('generateLabel').textContent, 'START');
  assert.equal(f.node('generate').attributes.get('aria-busy'), 'false');
  assert.equal(f.node('generationActions').classList.contains('is-busy'), false);
  assert.equal(f.node('generationFeedback').hidden, true);
  assert.equal(f.node('sourceView').hidden, false);
});

test('提交响应未知保留原任务，检查及会话恢复只GET不再POST', async () => {
  const camera = { x: .5, y: .5, heading: 0, fov: 60, height: 1.5 };
  const f = await fixture({ respond: async call => {
    if (call.method === 'POST') throw new Error('网络响应中断');
    return { job: { status: 'success', result: rendered(camera) } };
  } });
  await f.upload(source('原户型')); await f.click('placeCenter'); await f.click('generate');
  assert.equal(f.posts().length, 1); assert.equal(f.node('generate').disabled, true); assert.equal(f.node('sourceInput').disabled, true);
  assert.equal(f.node('settings').getAttribute('data-camera-pending'), 'true');
  assert.equal(f.node('settings').getAttribute('data-camera-busy'), 'false');
  assert.equal(f.node('settings').getAttribute('data-camera-blocked'), '任务状态待确认');
  const saved = JSON.parse(f.storage.get(SESSION)); assert.ok(saved.pending);
  await f.click('generate'); assert.equal(f.posts().length, 1);
  await f.click('refresh'); assert.equal(f.posts().length, 1); assert.equal(f.reads().length, 1);
  const restored = await fixture({ saved, respond: async () => ({ job: { status: 'success', result: rendered(camera) } }) });
  assert.equal(restored.posts().length, 0); assert.equal(restored.reads().length, 1);
  assert.equal(restored.node('result').src, rendered(camera).image.url);
  assert.equal(restored.node('generate').disabled, true, '恢复结果不伪造原平面图或新机位');
  assert.equal(restored.node('settings').getAttribute('data-camera-source'), 'empty');
  assert.equal(restored.node('settings').getAttribute('data-camera-canvas'), 'ready');
  await restored.click('download'); assert.equal(restored.downloads[0].href, rendered(camera).image.url);
});

test('取景格式失败结束进度提示，保留原设置并允许手动重试', async () => {
  let failed = false;
  const f = await fixture({ respond: async ({ method }) => ({ job: method === 'POST' || !failed
    ? { status: 'running', message: '空间推理模型正在分析机位、可见空间与画面质感…' }
    : { status: 'failed', error: '空间推理输出不是有效 JSON', result: { diagnostic: { code: 'camera_agent_output_invalid' } } } }) });
  await f.upload(source('原户型')); await f.click('placeCenter');
  await f.input('heading', 90); await f.input('imageCount', 2, 'change');
  await f.input('agentModel', 'gpt', 'change'); await f.click('generate');
  assert.match(f.node('status').textContent, /正在分析/);
  assert.match(f.node('generationFeedbackText').textContent, /正在分析/);
  failed = true; await f.nextPoll();
  assert.equal(f.node('status').textContent, '取景说明不完整');
  assert.match(f.node('error').textContent, /未开始生图.*重试.*更换推理模型/);
  assert.doesNotMatch(f.node('error').textContent, /JSON/);
  assert.equal(f.node('generate').disabled, false);
  assert.equal(f.node('refreshLabel').textContent, '刷新配置');
  assert.equal(JSON.parse(f.storage.get(SESSION)).pending, null);
  assert.equal(f.posts().length, 1);
  await f.click('refresh');
  assert.equal(f.node('status').textContent, '机位已设置，可以生成');
  assert.equal(f.node('error').hidden, true);
  assert.equal(f.posts().length, 1);
  assert.equal(f.reads().length, 2, '刷新失败终态不继续轮询原任务');
  await f.click('generate');
  assert.deepEqual(f.posts().map(call => [call.body.camera.heading, call.body.imageCount, call.body.agentModelKey]), [[90, 2, 'gpt'], [90, 2, 'gpt']]);
  assert.notEqual(f.posts()[0].body.jobId, f.posts()[1].body.jobId);
});

test('不可确认的机位和普通任务失败各显示对应终态', async () => {
  for (const [diagnostic, expected, detail] of [
    [{ code: 'camera_view_unresolved' }, '该机位的可见范围未确认', '请调整机位或补充空间说明后再生成。'],
    [{ phase: 'image' }, '生成任务未完成', '图片服务超时'],
  ]) {
    const f = await fixture({ saved: { pending: 'original-task' }, respond: async () => ({ job: {
      status: 'failed', error: '图片服务超时', result: { diagnostic },
    } }) });
    assert.equal(f.node('status').textContent, expected);
    assert.equal(f.node('error').textContent, detail);
    assert.equal(f.posts().length, 0);
  }
});

test('运行时锁定输入、失权不切换模型、非法参数不能提交', async () => {
  let current = structuredClone(config);
  const f = await fixture({ configuration: () => current, respond: async call => call.method === 'POST' ? { job: { status: 'running' } } : { job: { status: 'running', message: '生成中' } } });
  await f.upload(source('原户型')); await f.click('placeCenter');
  await f.input('fov', 101); assert.equal(f.node('generate').disabled, true);
  await f.input('fov', 60); await f.input('heading', ''); assert.equal(f.node('generate').disabled, true);
  await f.input('heading', 0); await f.useModel('gptImage26Sunburst');
  current.models[1].available = false; await f.click('refresh');
  assert.deepEqual(f.models(), ['gptImage26Sunburst']); assert.equal(f.node('generate').disabled, true);
  await f.useModel('gptImage25Sunburst'); assert.equal(f.node('generate').disabled, false);
  await f.click('generate');
  for (const id of ['sourceInput','placeCenter','heading','fov','model','agentModel','imageCount','requirements','generate']) assert.equal(f.node(id).disabled, true, id);
});

test('多模型取实际支持的共同分辨率，保留机位与全部选中的模型', async () => {
  const configuration = { ...config, models: ['gptImage25Sunburst', 'banana21', 'seedream5', 'seedream5Pro'].map(modelOption) };
  const f = await fixture({ configuration });
  await f.upload(source('户型')); await f.click('placeCenter'); await f.input('heading', 90);
  await f.input('resolution', '4K', 'change');
  await f.useModel('banana21');
  assert.equal(f.node('resolution').value, '4K', '有效分辨率不被切换模型重置');
  assert.equal(f.node('heading').value, '90'); assert.equal(f.posts().length, 0);
  await f.toggleModel('seedream5Pro');
  assert.equal(f.node('resolution').value, '2K');
  assert.match(f.node('status').textContent, /4K → 2K/);
  assert.deepEqual(f.node('resolution').options.map(option => option.value), ['1K', '2K']);
  await f.input('resolution', '1K', 'change');
  await f.toggleModel('seedream5');
  assert.equal(f.node('resolution').value, '2K');
  assert.deepEqual(f.node('resolution').options.map(option => option.value), ['2K']);
  assert.match(f.node('status').textContent, /1K → 2K/);
  await f.click('generate');
  assert.equal(f.posts().length, 1);
  assert.deepEqual(f.posts()[0].body.modelSelections, [{ key: 'banana21' }, { key: 'seedream5Pro' }, { key: 'seedream5' }]);
  assert.equal(f.posts()[0].body.resolution, '2K'); assert.equal(f.posts()[0].body.camera.heading, 90);
});

test('张数乘模型数预告本批总数，超过上限不提交，合法批次仅提交一份平面图与机位', async () => {
  const configuration = { ...config, models: ['gptImage25Sunburst', 'gptImage26Sunburst', 'gptImage26Flare', 'banana21'].map(modelOption) };
  const f = await fixture({ configuration });
  await f.upload(source('户型')); await f.click('placeCenter');
  assert.deepEqual(f.node('imageCount').options.map(option => option.value), ['1', '2', '3', '4']);
  assert.equal(f.node('imageCount').value, '1');
  assert.equal(f.node('batchTotal').textContent, '');
  for (const key of ['gptImage26Sunburst', 'gptImage26Flare', 'banana21']) await f.toggleModel(key);
  await f.input('complexity-gptImage26Sunburst', 'high', 'change');
  await f.input('complexity-gptImage26Flare', 'low', 'change');
  await f.input('imageCount', '4', 'change');
  assert.match(f.node('batchTotal').textContent, /4 个模型 × 4 张，共 16 张.*每批最多 12 张/);
  assert.equal(f.node('generate').disabled, true);
  await f.click('generate'); assert.equal(f.posts().length, 0);
  await f.input('imageCount', '3', 'change');
  assert.match(f.node('batchTotal').textContent, /4 个模型 × 3 张，共 12 张/);
  assert.equal(f.node('generateLabel').textContent, 'START');
  assert.equal(f.node('generate').attributes.get('aria-label'), '生成 12 张室内效果图');
  await f.click('generate'); assert.equal(f.posts().length, 1);
  const [request] = f.posts();
  assert.equal(request.body.imageCount, 3);
  assert.deepEqual(request.body.modelSelections, [{ key: 'gptImage25Sunburst' }, { key: 'gptImage26Sunburst', complexity: 'high' },
    { key: 'gptImage26Flare', complexity: 'low' }, { key: 'banana21' }]);
  assert.equal(Object.hasOwn(request.body, 'modelKey'), false);
  assert.equal(Object.hasOwn(request.body, 'complexity'), false);
  assert.equal(request.body.referenceImage.dataUrl, source('户型').dataUrl);
  assert.deepEqual(request.body.camera, { x: .5, y: .5, heading: 0, fov: 60, height: 1.5 });
  assert.equal(request.body.agentModelKey, 'gemini3pro');
  assert.equal(request.body.resolution, '2K'); assert.equal(request.body.aspectRatio, '16:9');
  assert.deepEqual(f.reads().map(({ path }) => path), [`/api/floor-plan-camera/jobs/${request.body.jobId}`]);
  const saved = JSON.parse(f.storage.get(SESSION));
  assert.deepEqual(saved.models, request.body.modelSelections.map(({ key }) => key));
  assert.equal(saved.imageCount, 3);
});

test('混合结果按模型和张次展示，可切换下载，刷新只读取原批次', async () => {
  const camera = { x: .5, y: .5, heading: 90, fov: 60, height: 1.5 };
  const banana = { key: 'banana21', id: 'gemini-nano-banana-2.1', label: 'Banana 2.1' };
  const gpt = { key: 'gptImage25Sunburst', id: 'gpt-image-2.5-sunburst', label: 'GPT Image 2.5 Sunburst' };
  const success = (model, index, name) => {
    const base = rendered(camera);
    return { model, index, status: 'success', error: null, result: { ...base, model, image: { ...base.image, url: source(name).dataUrl } } };
  };
  const failure = { model: gpt, index: 1, status: 'failed', result: null, error: '<b>该张生成失败</b>' };
  const result = { action: 'render', viewSummary: '前方一扇窗，近处右墙。', scenePrompt: 'A window in the far wall.',
    items: [failure, success(gpt, 2, 'GPT 第二张'), success(banana, 1, 'Banana 第一张'), success(banana, 2, 'Banana 第二张')] };
  let completed = false;
  const configuration = { ...config, models: ['gptImage25Sunburst', 'banana21'].map(modelOption) };
  const f = await fixture({ configuration, respond: async call => call.method === 'POST' || !completed
    ? { job: { status: 'running', completed: 2, total: 4 } } : { job: { status: 'success', result } } });
  await f.upload(source('户型')); await f.click('placeCenter'); await f.input('heading', 90);
  await f.toggleModel(banana.key); await f.input('imageCount', '2', 'change'); await f.click('generate');
  assert.equal(f.posts().length, 1); assert.match(f.node('status').textContent, /2\/4 张/);
  const saved = JSON.parse(f.storage.get(SESSION)); assert.equal(saved.pending, f.posts()[0].body.jobId);
  const restored = await fixture({ saved, configuration, respond: async () => ({ job: { status: 'success', result } }) });
  assert.equal(restored.posts().length, 0);
  assert.deepEqual(restored.reads().map(({ path }) => path), [`/api/floor-plan-camera/jobs/${saved.pending}`]);
  assert.equal(restored.node('generate').disabled, true, '只恢复批次结果，原图仍需重新上传');
  assert.equal(restored.node('imageCount').value, '2');
  assert.deepEqual(restored.models(), [gpt.key, banana.key]);
  assert.deepEqual(restored.reveals, []);
  completed = true; await f.nextPoll();
  assert.match(f.node('status').textContent, /成功 3\/4 张，失败 1 张/);
  assert.equal(f.node('resultGroups').hidden, false);
  const [gptGroup, bananaGroup] = f.node('resultGroups').children;
  assert.deepEqual([gptGroup, bananaGroup].map(group => group.children[0].textContent), [gpt.label, banana.label]);
  const [failed, gptSecond] = gptGroup.children[1].children;
  assert.equal(failed.tagName, 'div'); assert.equal(failed.children[1].textContent, failure.error);
  assert.equal(gptSecond.attributes.get('aria-pressed'), 'true');
  assert.equal(f.node('result').src, source('GPT 第二张').dataUrl);
  assert.equal(f.node('generationFeedback').hidden, true);
  assert.deepEqual(f.reveals, [f.node('result').src]);
  const bananaSecond = bananaGroup.children[1].children[1];
  await bananaSecond.fire('click');
  assert.equal(gptSecond.attributes.get('aria-pressed'), 'false');
  assert.equal(bananaSecond.attributes.get('aria-pressed'), 'true');
  assert.equal(f.node('result').src, source('Banana 第二张').dataUrl);
  assert.deepEqual(f.reveals, [source('GPT 第二张').dataUrl]);
  assert.match(f.node('resultMeta').textContent, /Banana 2\.1.*朝向 90°/);
  assert.equal(f.node('viewSummary').textContent, result.viewSummary);
  assert.equal(f.node('scenePrompt').textContent, result.scenePrompt);
  await f.click('download');
  assert.equal(f.downloads[0].href, source('Banana 第二张').dataUrl);
  assert.match(f.downloads[0].download, /Banana 2\.1-2\.png$/);
  assert.equal(f.posts().length, 1);
});

test('整批出图失败保留失败卡片与推理内容，隐藏下载入口', async () => {
  const model = { key: 'banana21', label: 'Banana 2.1' };
  const result = { action: 'render', viewSummary: '右侧是近墙。', items: [
    { model, index: 1, status: 'failed', result: null, error: '图片服务超时' },
  ] };
  const f = await fixture({ saved: { pending: 'batch-failure-1' }, respond: async () => ({ job: { status: 'success', result } }) });
  assert.match(f.node('status').textContent, /成功 0\/1 张，失败 1 张/);
  assert.equal(f.node('resultView').hidden, false); assert.equal(f.node('resultGroups').hidden, false);
  assert.equal(f.node('resultImageDetails').hidden, true); assert.equal(f.node('download').hidden, true);
  assert.equal(f.node('resultSync').hidden, true);
  assert.equal(f.node('viewSummary').textContent, result.viewSummary);
  await f.click('download'); assert.equal(f.downloads.length, 0);
  assert.equal(f.posts().length, 0); assert.equal(f.reads().length, 1);
});

test('恢复批次按当前图片查飞书记录，切图取消旧轮询，失败仅重试该张归档', async () => {
  const model = { key: 'banana21', label: 'Banana 2.1' };
  const first = { generationId: 'camera-first', status: 'pending' };
  const second = { generationId: 'camera-second', status: 'failed', error: '归档暂时失败' };
  const success = { ...second, status: 'success', recordUrl: 'https://example.feishu.cn/base/camera?record=second' };
  const result = { action: 'render', items: [first, second].map((sync, index) => {
    const picture = rendered({ x: .5, y: .5, heading: 0, fov: 60 });
    return { model, index: index + 1, status: 'success', result: { ...picture, sync,
      image: { ...picture.image, url: source(sync.generationId).dataUrl } } };
  }) };
  const f = await fixture({ saved: { jobId: 'camera-archive-batch' }, respond: async ({ path, method }) => {
    if (path === '/api/floor-plan-camera/jobs/camera-archive-batch') return { job: { status: 'success', result } };
    if (method === 'POST' && path === '/api/sync-jobs/camera-second/retry') return { sync: { ...second, status: 'pending', error: null } };
    if (path === '/api/sync-jobs/camera-second') return { sync: success };
    assert.fail(`意外请求 ${method} ${path}`);
  } });
  assert.equal(f.node('resultSync').hidden, false);
  assert.match(f.node('resultSyncStatus').textContent, /正在同步/);
  const [, secondImage] = f.node('resultGroups').children[0].children[1].children;
  await secondImage.fire('click');
  assert.match(f.node('resultSyncStatus').textContent, /同步失败/);
  assert.equal(f.node('resultSyncRetry').hidden, false);
  await f.click('resultSyncRetry'); await f.nextPoll();
  assert.match(f.node('resultSyncStatus').textContent, /已同步/);
  assert.equal(f.node('resultSyncLink').href, success.recordUrl);
  assert.equal(f.node('result').src, source('camera-second').dataUrl);
  assert.deepEqual(f.calls.filter(call => call.path.includes('/sync-jobs/')).map(({ path, method }) => [method, path]), [
    ['POST', '/api/sync-jobs/camera-second/retry'], ['GET', '/api/sync-jobs/camera-second'],
  ]);
  assert.equal(f.posts().length, 1);
});

test('飞书归档能力未加载或合同未就绪时阻止相机生成，刷新恢复后可提交', async () => {
  let configuration = { ...config, archive: undefined };
  const f = await fixture({ configuration: () => configuration });
  await f.upload(source('户型')); await f.click('placeCenter');
  assert.equal(f.node('generate').disabled, true);
  await f.click('generate'); assert.equal(f.posts().length, 0);
  configuration = { ...config, archive: { required: true, available: false, reason: '缺少飞书归档字段' } };
  await f.click('refresh');
  assert.equal(f.node('generate').disabled, true);
  assert.match(f.node('error').textContent, /缺少飞书归档字段/);
  configuration = config;
  await f.click('refresh');
  assert.equal(f.node('generate').disabled, false);
});

test('模型能力刷新不静默降档，旧工作流不能提交新增模型', async () => {
  let current = { ...config, models: [modelOption('banana21')] };
  const f = await fixture({ saved: { model: 'banana21', resolution: '4K', aspectRatio: '16:9' }, configuration: () => current });
  await f.upload(source('户型')); await f.click('placeCenter'); assert.equal(f.node('generate').disabled, false);
  current = structuredClone(current); delete current.models[0].sizes['16:9']['4K'];
  await f.click('refresh'); assert.deepEqual(f.models(), ['banana21']);
  assert.equal(f.node('resolution').value, '4K'); assert.equal(f.node('resolution').options.find(option => option.value === '4K').disabled, true);
  assert.equal(f.node('generate').disabled, true);
  assert.match(f.node('status').textContent, /请选择.*分辨率/);
  const old = await fixture({ configuration: { ...config, workflowVersion: '2026-11-07.floor-plan-camera.1' } });
  await old.upload(source('户型')); await old.click('placeCenter');
  assert.equal(old.node('generate').disabled, true); await old.click('generate'); assert.equal(old.posts().length, 0);
});

test('思考强度按模型显示和记忆，默认及无能力模型不传字段', async () => {
  const configuration = { ...config, models: ['gptImage25Sunburst', 'gptImage26Sunburst', 'gptImage26Flare', 'banana21'].map(modelOption) };
  const f = await fixture({ configuration });
  await f.upload(source('户型')); await f.click('placeCenter');
  assert.equal(f.node('complexityField').hidden, true);
  await f.click('generate'); assert.equal(Object.hasOwn(f.posts()[0].body.modelSelections[0], 'complexity'), false);
  await f.useModel('gptImage26Sunburst');
  assert.equal(f.node('complexityField').hidden, false);
  assert.deepEqual(f.node('complexity-gptImage26Sunburst').options.map(option => option.value), ['', 'low', 'medium', 'high']);
  assert.equal(f.node('complexity-gptImage26Sunburst').value, '');
  await f.click('generate'); assert.equal(Object.hasOwn(f.posts()[1].body.modelSelections[0], 'complexity'), false);
  await f.input('complexity-gptImage26Sunburst', 'high', 'change');
  await f.useModel('gptImage26Flare');
  assert.equal(f.node('complexity-gptImage26Flare').value, '', '不同模型独立记忆');
  await f.input('complexity-gptImage26Flare', 'low', 'change');
  await f.useModel('banana21');
  assert.equal(f.node('complexityField').hidden, true);
  await f.click('generate'); assert.equal(Object.hasOwn(f.posts()[2].body.modelSelections[0], 'complexity'), false);
  await f.useModel('gptImage26Sunburst'); assert.equal(f.node('complexity-gptImage26Sunburst').value, 'high');
  const saved = JSON.parse(f.storage.get(SESSION));
  const restored = await fixture({ saved, configuration });
  assert.equal(restored.node('complexity-gptImage26Sunburst').value, 'high');
  await restored.useModel('gptImage26Flare'); assert.equal(restored.node('complexity-gptImage26Flare').value, 'low');
});

test('三档思考强度原样提交且锁定，结果记录生成时选择', async () => {
  for (const complexity of ['low', 'medium', 'high']) {
    let request, completed = false;
    const f = await fixture({ respond: async call => {
      if (call.method === 'POST') { request = call.body; return { job: { status: 'running' } }; }
      return completed ? { job: { status: 'success', result: { ...rendered(request.camera), requestedComplexity: request.modelSelections[0].complexity } } }
        : { job: { status: 'running', message: '生成中' } };
    } });
    await f.upload(source('户型')); await f.click('placeCenter');
    await f.useModel('gptImage26Sunburst'); await f.input('complexity-gptImage26Sunburst', complexity, 'change');
    await f.click('generate'); assert.equal(request.modelSelections[0].complexity, complexity); assert.equal(Object.hasOwn(request, 'quality'), false);
    assert.equal(f.node('complexity-gptImage26Sunburst').disabled, true);
    await f.input('complexity-gptImage26Sunburst', '', 'change');
    assert.equal(JSON.parse(f.storage.get(SESSION)).complexities.gptImage26Sunburst, complexity, '锁定时不改保存参数');
    completed = true; await f.nextPoll();
    assert.match(f.node('resultMeta').textContent, new RegExp(`思考强度：${{ low: '低', medium: '中', high: '高' }[complexity]}（已请求）`));
    await f.input('complexity-gptImage26Sunburst', '', 'change');
    assert.match(f.node('resultMeta').textContent, /思考强度：.*（已请求）/); assert.equal(f.posts().length, 1);
  }
});

test('思考能力刷新失效不静默降档，明确重选后恢复生成', async () => {
  let current = structuredClone(config);
  const f = await fixture({ configuration: () => current });
  await f.upload(source('户型')); await f.click('placeCenter');
  await f.useModel('gptImage26Sunburst'); await f.input('complexity-gptImage26Sunburst', 'high', 'change');
  current.models[1].complexityOptions = ['low', 'medium']; await f.click('refresh');
  assert.equal(f.node('complexity-gptImage26Sunburst').value, 'high'); assert.equal(f.node('generate').disabled, true);
  assert.equal(f.node('complexity-gptImage26Sunburst').attributes.get('aria-invalid'), 'true');
  assert.match(f.node('status').textContent, /思考强度已不可用.*重新选择/);
  await f.click('generate'); assert.equal(f.posts().length, 0);
  await f.input('complexity-gptImage26Sunburst', 'medium', 'change'); assert.equal(f.node('generate').disabled, false);
  current.models[1].complexityOptions = []; await f.click('refresh');
  assert.equal(f.node('generate').disabled, true); assert.equal(f.node('complexityField').hidden, false, '保留失效选择供用户明确清除');
  await f.input('complexity-gptImage26Sunburst', '', 'change');
  assert.equal(f.node('generate').disabled, false); assert.equal(f.node('complexityField').hidden, true);
  await f.click('generate'); assert.equal(Object.hasOwn(f.posts()[0].body.modelSelections[0], 'complexity'), false);
});

test('空间推理模型按默认选择并记忆，刷新失权或移除不静默换模', async () => {
  let current = structuredClone(config);
  const f = await fixture({ configuration: () => current });
  await f.upload(source('户型')); await f.click('placeCenter');
  assert.equal(f.node('agentModel').value, 'gemini3pro');
  await f.input('agentModel', 'gpt', 'change');
  assert.equal(f.node('generate').disabled, false);
  const saved = JSON.parse(f.storage.get(SESSION)); assert.equal(saved.agentModel, 'gpt');
  const restored = await fixture({ saved, configuration: current });
  assert.equal(restored.node('agentModel').value, 'gpt');
  current.agentModels[1].selectable = false; await f.click('refresh');
  assert.equal(f.node('agentModel').value, 'gpt'); assert.equal(f.node('generate').disabled, true);
  assert.match(f.node('error').textContent, /空间推理模型不可用/);
  await f.click('generate'); assert.equal(f.posts().length, 0);
  current.agentModels.pop(); await f.click('refresh');
  assert.equal(f.node('agentModel').value, 'gpt'); assert.equal(f.node('agentModel').options.find(option => option.value === 'gpt').disabled, true);
  await f.input('agentModel', 'gemini3pro', 'change');
  assert.equal(f.node('generate').disabled, false); assert.equal(f.node('error').hidden, true);
  assert.equal(f.node('status').textContent, '机位已设置，可以生成');
  await f.click('generate'); assert.equal(f.posts()[0].body.agentModelKey, 'gemini3pro');
});

test('GPT 6.1 Sol 以独立空间推理选项提交', async () => {
  const gpt61Sol = { key: 'gpt61Sol', id: 'gpt-6.1-sol', label: 'GPT 6.1 Sol', selectable: true };
  const f = await fixture({ configuration: { ...config, agentModels: [...config.agentModels, gpt61Sol] } });
  await f.upload(source('户型')); await f.click('placeCenter');
  assert.equal(f.node('agentModel').value, 'gemini3pro');
  assert.ok(f.node('agentModel').options.some(option => option.value === 'gpt' && !option.disabled));
  await f.input('agentModel', gpt61Sol.key, 'change');
  await f.click('generate');
  assert.equal(f.posts()[0].body.agentModelKey, gpt61Sol.key);
  assert.equal(f.posts()[0].body.modelSelections[0].key, 'gptImage25Sunburst');
});

test('提示词直出脱离推理配置，保留提示词原文、机位、批次参数和结果模式', async () => {
  const configuration = { ...config, available: false, reason: '空间推理提示词不可用',
    prompt: null, agentModels: [], defaultAgentModel: '', generationModes: ['agent', 'direct'] };
  const prompt = '  从相机位置看向窗边。\n\n浅色橡木与自然光。  ';
  let result;
  const respond = async ({ method, body }) => {
    if (method === 'POST') {
      result = { ...rendered(body.camera), generationMode: 'direct', compiledPrompt: body.userRequirements,
        viewSummary: '旧推理摘要', agent: { label: '旧推理模型' }, actual: { generationMode: 'image-to-image', ...planReference } };
      return { job: { status: 'running' } };
    }
    return { job: { status: 'success', result } };
  };
  const f = await fixture({ configuration, respond });
  await f.upload(source('户型')); await f.click('placeCenter');
  assert.equal(f.node('generationMode').value, 'agent');
  assert.equal(f.node('generate').disabled, true);
  assert.equal(f.node('directPromptField').hidden, true);
  await f.input('requirements', '空间推理专用的原木风格要求');
  await f.input('generationMode', 'direct', 'change');
  assert.equal(f.node('agentModelField').hidden, true);
  assert.equal(f.node('directPromptField').hidden, false);
  assert.equal(f.node('requirementsField').hidden, true);
  assert.equal(f.node('generate').disabled, true);
  assert.equal(f.node('settings').getAttribute('data-camera-blocked'), '请填写直出提示词');
  await f.input('directPrompt', '   \n');
  await f.click('generate'); assert.equal(f.posts().length, 0);
  await f.input('directPrompt', prompt);
  assert.equal(f.node('settings').getAttribute('data-camera-blocked'), '');
  await f.input('generationMode', 'agent', 'change');
  assert.equal(f.node('requirements').value, '空间推理专用的原木风格要求');
  await f.input('generationMode', 'direct', 'change');
  assert.equal(f.node('directPrompt').value, prompt);
  await f.input('imageCount', '2', 'change');
  await f.click('generate'); assert.equal(f.posts().length, 1);
  const request = f.posts()[0].body;
  assert.equal(request.generationMode, 'direct');
  assert.equal(request.userRequirements, prompt);
  for (const key of ['agentModelKey', 'promptVersion', 'promptSha256']) assert.ok(!Object.hasOwn(request, key), key);
  assert.deepEqual(request.camera, { x: .5, y: .5, heading: 0, fov: 60, height: 1.5 });
  assert.equal(request.referenceImage.name, '户型.png');
  assert.deepEqual(request.modelSelections, [{ key: 'gptImage25Sunburst' }]);
  assert.equal(request.imageCount, 2);
  const saved = JSON.parse(f.storage.get(SESSION));
  const restored = await fixture({ saved, configuration, respond });
  assert.equal(restored.posts().length, 0);
  assert.equal(restored.node('generationMode').value, 'direct');
  assert.equal(restored.node('directPrompt').value, prompt);
  assert.equal(restored.node('requirements').value, '空间推理专用的原木风格要求');
  assert.equal(restored.node('scenePromptTitle').textContent, '最终提示词');
  assert.equal(restored.node('scenePrompt').textContent, prompt);
  assert.equal(restored.node('viewSummarySection').hidden, true);
  assert.match(restored.node('resultMeta').textContent, /提示词直出/);
  assert.doesNotMatch(restored.node('resultMeta').textContent, /旧推理模型/);
});

test('旧进程阻断已保存的直出模式，明确切回空间推理后才能提交', async () => {
  const f = await fixture({ saved: { generationMode: 'direct', requirements: '之前输入的提示词' } });
  await f.upload(source('户型')); await f.click('placeCenter');
  assert.equal(f.node('generationMode').options.find(option => option.value === 'direct').disabled, true);
  assert.equal(f.node('directPrompt').value, '之前输入的提示词');
  assert.equal(f.node('generate').disabled, true);
  await f.click('generate'); assert.equal(f.posts().length, 0);
  await f.input('generationMode', 'agent', 'change');
  assert.equal(f.node('agentModelField').hidden, false);
  assert.equal(f.node('requirementsField').hidden, false);
  await f.click('generate'); assert.equal(f.posts().length, 1);
  assert.equal(f.posts()[0].body.agentModelKey, 'gemini3pro');
  assert.equal(f.posts()[0].body.userRequirements, '');
});

test('单张机位图参考门禁阻断不匹配的服务配置，旧结果不补摘要或模式标签', async () => {
  for (const incompatible of [
    ...[3, 4, 5, 6, 7, 8].map(version => ({ ...config, workflowVersion: `2026-11-07.floor-plan-camera.${version}` })),
    { ...config, batch: undefined }, { ...config, batch: { ...config.batch, imageCounts: [1] } },
    { ...config, pipeline: undefined }, { ...config, prompt: { ...config.prompt, code: 'floor-plan-camera' } },
    { ...config, prompt: { ...config.prompt, version: 9 } },
    { ...config, prompt: { ...config.prompt, code: 'floor-plan-camera-frame-agent' } },
    { ...config, pipeline: 'scene-agent-to-image' }, { ...config, imageGeneration: undefined },
    { ...config, imageGeneration: { ...config.imageGeneration, referenceImageCount: 0 } },
    { ...config, imageGeneration: { ...config.imageGeneration, referenceImageCount: 2 } },
    { ...config, imageGeneration: { ...config.imageGeneration, mode: 'text-to-image' } },
    { ...config, imageGeneration: { ...config.imageGeneration, referenceImageRole: undefined } },
    { ...config, imageGeneration: { ...config.imageGeneration, referenceImageRole: 'unannotated-plan' } },
  ]) {
    const f = await fixture({ configuration: incompatible });
    await f.upload(source('户型')); await f.click('placeCenter'); await f.click('generate');
    assert.equal(f.node('generate').disabled, true); assert.equal(f.posts().length, 0);
  }
  const f = await fixture({ configuration: { ...config, prompt: { ...config.prompt, version: 9, code: 'floor-plan-camera-frame-agent' },
    agentModels: config.agentModels.map(({key,id,label}) => ({key,id,label})) },
    respond: async () => ({ job: { status: 'success', result: { ...rendered({x:.5,y:.5,heading:0,fov:60,height:1.5}),
      actual: { generationMode: 'image-to-image', referenceImageCount: 1 } } } }) });
  await f.upload(source('户型')); await f.click('placeCenter'); await f.click('generate');
  assert.equal(f.posts().length, 1); assert.equal(f.node('scenePromptDetails').hidden, true);
  assert.equal(f.posts()[0].body.promptVersion, 9);
  assert.equal(f.node('scenePrompt').textContent, '');
  assert.equal(f.node('viewSummarySection').hidden, true); assert.equal(f.node('viewSummary').textContent, '');
  assert.doesNotMatch(f.node('resultMeta').textContent, /文生图|机位图参考|墙体遮挡估算|仅示镜头开角/);
});

test('旧文生图结果替换新结果时清除摘要，恢复时保留文生图标识', async () => {
  const camera = { x: .5, y: .5, heading: 90, fov: 60, height: 1.5 };
  let submissions = 0;
  const oldResult = { ...rendered(camera), actual: { generationMode: 'text-to-image', referenceImageCount: 0 } };
  const f = await fixture({ respond: async call => {
    if (call.method === 'POST') { submissions++; return { job: { status: 'running' } }; }
    return { job: { status: 'success', result: submissions === 1
      ? { ...rendered(camera), viewSummary: '右侧近处为实墙。', actual: { generationMode: 'image-to-image', ...planReference } }
      : oldResult } };
  } });
  await f.upload(source('户型')); await f.click('placeCenter'); await f.click('generate');
  assert.equal(f.node('viewSummarySection').hidden, false); assert.match(f.node('resultMeta').textContent, /机位图参考/);
  await f.click('generate');
  assert.equal(f.node('viewSummarySection').hidden, true); assert.equal(f.node('viewSummary').textContent, '');
  assert.match(f.node('resultMeta').textContent, /文生图/); assert.doesNotMatch(f.node('resultMeta').textContent, /机位图参考/);
  const restored = await fixture({ saved: JSON.parse(f.storage.get(SESSION)), respond: async () => ({ job: { status: 'success', result: oldResult } }) });
  assert.equal(restored.posts().length, 0); assert.equal(restored.reads().length, 1);
  assert.equal(restored.node('viewSummarySection').hidden, true);
  assert.match(restored.node('resultMeta').textContent, /文生图/); assert.doesNotMatch(restored.node('resultMeta').textContent, /机位图参考/);
});

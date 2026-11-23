/**
 * [INPUT]: 依赖共享相机几何和平面图机位 UI 夹具运行页面控制器与归档状态
 * [OUTPUT]: 验证参数挂载与START、墙线及取景冻结、推理/直出选模、失败恢复和逐图归档
 * [POS]: test 的平面图机位前端回归，不访问模型、飞书或网络
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import * as geometry from '../public/floor-plan-camera-geometry.js';
import { SESSION, canvasBounds, config, fixture, modelOption, planReference, rendered, source } from './floor-plan-camera-ui-fixture.mjs';

async function drag(f, from, to, pointerType) {
  const pointer = (type, { x, y }) => f.pointer(type, x + canvasBounds.left, y + canvasBounds.top, pointerType);
  await pointer('pointerdown', from);
  await pointer('pointermove', to);
  await pointer('pointerup', to);
}

function canvasGuide(camera) {
  const { width, height } = canvasBounds;
  return geometry.cameraGuide(camera, width, height, 76);
}

test('嵌入时参数及START挂入原容器，生成状态与画布任务共用', async () => {
  const submission = Promise.withResolvers();
  const f = await fixture({ embedded: true, respond: call => call.method === 'POST' ? submission.promise
    : Promise.resolve({ job: { status: 'failed', error: '模拟失败' } }) });
  assert.deepEqual(f.mounting, [['floorPlanCamera', 'camera-settings', 'camera-actions']]);
  assert.equal(f.body.classList.contains('plan-camera-integrated'), true);
  assert.equal(f.node('sidebar').removed, true);
  assert.equal(f.node('status').hidden, true);
  assert.equal(f.node('sourceCount').textContent, '0 / 1');
  await f.upload(source('户型')); await f.click('placeCenter');
  assert.equal(f.node('sourceCount').textContent, '1 / 1');
  assert.equal(f.node('sourceInput').attributes.get('aria-label'), '替换平面图');
  assert.equal(f.node('sourceHint').textContent, '点击或拖入新图替换');
  assert.equal(f.node('generateLabel').textContent, 'START');
  await f.click('generate');
  assert.equal(f.posts().length, 1);
  assert.equal(f.node('generateLabel').textContent, 'RUNNING…');
  assert.equal(f.node('generate').attributes.get('aria-busy'), 'true');
  assert.equal(f.node('generationActions').classList.contains('is-busy'), true);
  submission.resolve({ job: { status: 'running' } });
  await f.click('showSource');
  assert.equal(f.node('generateLabel').textContent, 'START');
  assert.equal(f.node('generate').attributes.get('aria-busy'), 'false');
  assert.equal(f.node('generationActions').classList.contains('is-busy'), false);
});

test('长宽图朝向使用图像像素比例，正交视角与归一化指针正确', () => {
  const camera = { x: .5, y: .5, heading: 0, fov: 60 };
  assert.equal(geometry.headingToPoint(camera, { x: .75, y: 0 }, 1200, 600), 45);
  assert.equal(geometry.headingToPoint(camera, { x: 1, y: .25 }, 600, 1200), 45);
  assert.equal(geometry.headingToPoint(camera, { x: 1, y: .5 }, 1200, 600), 90);
  assert.equal(geometry.headingToPoint(camera, { x: .5, y: 1 }, 1200, 600), 180);
  assert.equal(geometry.headingToPoint(camera, { x: 0, y: .5 }, 1200, 600), 270);
  assert.deepEqual(geometry.imagePoint(310, 170, { left: 10, top: 20, width: 600, height: 300 }), { x: .5, y: .5 });
  assert.deepEqual(geometry.imagePoint(-20, 900, { left: 10, top: 20, width: 600, height: 300 }), { x: 0, y: 1 });
});

test('图上按拖摆放并转向，拖机身保持按下偏移，手柄调整后只提交一次', async () => {
  let camera;
  const f = await fixture({ respond: async call => {
    if (call.method === 'POST') { camera = call.body.camera; return { job: { status: 'running' } }; }
    return { job: { status: 'success', result: { ...rendered(camera), actual: { fullFrameEquivalentFocalLengthMm: 23.5, visibilityMode: 'estimated-wall-occlusion' } } } };
  } });
  await f.upload(source('原户型'));
  assert.equal(f.node('generate').disabled, true); await f.click('generate'); assert.equal(f.posts().length, 0);
  assert.ok(f.node('cameraTools'));
  assert.equal(f.node('height'), undefined);
  assert.equal(f.node('fovValue'), undefined);
  await drag(f, { x: 150, y: 225 }, { x: 210, y: 225 });
  assert.equal(f.node('heading').value, '90');
  await drag(f, { x: 153, y: 228 }, { x: 228, y: 153 });
  const moved = { x: .375, y: .5, heading: 90, fov: 60 };
  const { target } = canvasGuide(moved);
  await drag(f, target, canvasGuide({ ...moved, heading: 0 }).target);
  assert.equal(f.node('heading').value, '0');
  assert.equal(f.node('fov').value, '60');
  const { left } = canvasGuide({ ...moved, heading: 0 });
  const desired = canvasGuide({ ...moved, heading: 0, fov: 75 });
  await drag(f, left, desired.left);
  assert.equal(f.node('fov').value, '75');
  assert.equal(f.posts().length, 0, '画布操作只修改草稿');
  await f.useModel('gptImage26Sunburst'); await f.input('resolution', '4K', 'change');
  await f.click('generate'); assert.equal(f.posts().length, 1);
  assert.deepEqual(f.posts()[0].body.camera, { x: .375, y: .5, heading: 0, fov: 75, height: 1.5 });
  assert.deepEqual(f.posts()[0].body.modelSelections, [{ key: 'gptImage26Sunburst' }]); assert.equal(f.posts()[0].body.resolution, '4K');
  assert.match(f.node('resultMeta').textContent, /朝向 0°.*视野 75°/);
  assert.match(f.node('resultMeta').textContent, /等效 23\.5 mm/);
  assert.match(f.node('resultMeta').textContent, /机位图含墙体遮挡估算/);
  assert.doesNotMatch(f.node('resultMeta').textContent, /高度/);
  await f.input('heading', 180); assert.match(f.node('resultMeta').textContent, /朝向 0°/);
  assert.equal(f.posts().length, 1, '调整机位不得触发生图');
});

test('每次上传只读取一份共用墙线，用原图尺寸绘制标注并冻结当前机位', async () => {
  const input = { ...source('双房间'), width: 2400, height: 1200 };
  const wireWalls = { width: 2, height: 2, left: 0, right: 2, top: 0, bottom: 2, mask: 'AAEBAA==' };
  const f = await fixture({ configuration: { ...config, prompt: { ...config.prompt, version: 9, code: 'floor-plan-camera-frame-agent' },
    annotation: { sharedWallAnalysis: true, protectOcclusion: true, emphasizeFrame: true } }, wallAnalysis: {
    respond: async () => ({ width: input.width, height: input.height, walls: wireWalls }),
    visible: (camera, walls) => {
      assert.deepEqual({ ...walls, mask: Array.from(walls.mask) }, { ...wireWalls, mask: [0, 1, 1, 0] });
      return camera.heading === 0 ? [camera, { x: .4, y: .2 }, { x: .6, y: .2 }] : null;
    },
  } });
  await f.upload(input);
  assert.equal(f.node('showPreview'), undefined);
  assert.equal(f.node('visibilityLegend').hidden, true); assert.equal(f.node('canvas').attributes.get('aria-describedby'), 'drawingHint');
  const drawCalls = () => f.drawing.slice(f.drawing.findLastIndex(call => call.name === 'clearRect'));
  await f.click('placeCenter');
  const clipped = drawCalls(), operations = clipped.map(call => call.name);
  assert.equal(f.node('visibilityLegend').hidden, false);
  assert.equal(f.node('canvas').attributes.get('aria-describedby'), 'drawingHint visibilityLegend');
  assert.equal(f.node('visibilityKey').hidden, false);
  assert.equal(f.node('visibilityNote').textContent, '三角内按墙线估算，请核对门窗');
  assert.deepEqual(clipped.find(call => call.name === 'scale').args, [.75, .75]);
  assert.deepEqual(clipped.find(call => call.name === 'annotation').args.slice(1), [2400, 1200, [
    { x: .5, y: .5, heading: 0, fov: 60 }, { x: .4, y: .2 }, { x: .6, y: .2 },
  ]]);
  assert.ok(operations.indexOf('annotation') < operations.indexOf('arc'));
  await f.input('heading', 90);
  assert.equal(f.node('visibilityKey').hidden, true);
  assert.equal(f.node('visibilityNote').textContent, '暂无法估算墙体遮挡');
  assert.equal(drawCalls().find(call => call.name === 'annotation').args[3], null);
  assert.deepEqual(f.annotations().map(call => call.body), [{ referenceImage: input }]);
  assert.equal(f.posts().length, 0);
  assert.equal(f.node('showFrame').checked, true);
  f.node('showFrame').checked = false;
  await f.input('showFrame', '', 'change');
  assert.equal(f.node('frameKey').hidden, true);
  assert.equal(JSON.parse(f.storage.get(SESSION)).showFrame, false);
  const [camera] = drawCalls().find(call => call.name === 'annotation').args;
  assert.equal(camera.showFrame, false);
  await f.click('generate');
  const [job] = f.posts();
  assert.deepEqual(job.body.camera, { ...camera, height: 1.5 });
  assert.deepEqual(job.body.referenceImage, input);
  assert.equal(f.annotations().length, 1);
});

test('拖外框远边可独立伸缩，触屏拉回后仍冻结相同的机位与开角', async () => {
  const f = await fixture();
  await f.upload(source('视野深度')); await f.click('placeCenter');
  await f.input('heading', 90);
  const original = { x: .5, y: .5, heading: 90, fov: 60 };
  const first = canvasGuide(original);
  const farEdge = { x: first.viewFrame.right, y: first.origin.y + 15 };
  const currentCamera = () => f.drawing.findLast(call => call.name === 'annotation').args[0];
  assert.deepEqual(currentCamera(), original);
  const pointer = (type, x) => f.pointer(type, x + canvasBounds.left, farEdge.y + canvasBounds.top);
  await pointer('pointerdown', farEdge.x);
  await pointer('pointermove', farEdge.x + 40);
  assert.ok(currentCamera().guideDepth > first.depth);
  await pointer('pointermove', farEdge.x);
  await pointer('pointerup', farEdge.x);
  assert.deepEqual(currentCamera(), original);
  await drag(f, farEdge, { x: farEdge.x + 84, y: farEdge.y + 30 });
  const expanded = currentCamera();
  assert.ok(Math.abs(expanded.guideDepth - first.depth - .28) < .0001);
  assert.deepEqual({ ...original, guideDepth: expanded.guideDepth }, expanded);
  assert.ok(canvasGuide(expanded).viewFrame.right > first.viewFrame.right + 83);
  const { depthHandle } = canvasGuide(expanded);
  await drag(f, depthHandle, { x: depthHandle.x - 42, y: depthHandle.y }, 'touch');
  assert.ok(Math.abs(currentCamera().guideDepth - expanded.guideDepth + .14) < .0001);
  await f.key('PageUp');
  assert.ok(Math.abs(currentCamera().guideDepth - expanded.guideDepth + .09) < .0001);
  const finalPose = currentCamera();
  assert.equal(f.posts().length, 0);
  await f.click('generate');
  assert.deepEqual(f.posts()[0].body.camera, { ...finalPose, height: 1.5 });
});

test('服务端没有可靠墙线时不显示可见区填色，仍可摆放和生成', async () => {
  const f = await fixture();
  await f.upload(source('无墙线')); await f.click('placeCenter');
  assert.equal(f.node('error').hidden, true);
  assert.equal(f.node('visibilityLegend').hidden, false);
  assert.equal(f.node('visibilityKey').hidden, true);
  assert.match(f.node('visibilityNote').textContent, /暂无法估算墙体遮挡/);
  assert.equal(f.node('generate').disabled, false);
});

test('替换图的墙线请求失败时保留原图和机位', async () => {
  const original = source('原户型'), replacement = source('新户型');
  const f = await fixture({ wallAnalysis: { respond: async ({ body: { referenceImage } }) => {
    if (referenceImage.name === replacement.name) throw new Error('墙线识别未完成');
    return { width: original.width, height: original.height, walls: null };
  } } });
  await f.upload(original); await f.click('placeCenter'); await f.input('heading', 125);
  await f.upload(replacement);
  assert.equal(f.node('sourceName').textContent, original.name);
  assert.equal(f.node('sourceCount').textContent, '1 / 1');
  assert.equal(f.node('sourceThumbnail').src, original.dataUrl);
  assert.equal(f.node('heading').value, '125');
  assert.match(f.node('error').textContent, /墙线识别未完成/);
  await f.click('generate');
  assert.deepEqual(f.posts()[0].body.referenceImage, original);
});

test('中心圆点沿视线伸缩同步视野与焦距，斜拖可同时转向，机身位置不变', async () => {
  const f = await fixture();
  await f.upload(source('户型')); await f.click('placeCenter');
  const { width, height } = canvasBounds;
  const { origin, target } = canvasGuide({ x: .5, y: .5, heading: 0, fov: 60 });
  const centerDrawn = () => {
    const [x, y] = f.drawing.findLast(call => call.name === 'arc').args;
    return { x: x * width / f.node('canvas').width, y: y * height / f.node('canvas').height };
  };
  assert.equal(f.node('focalLength').textContent, '≈31.2 mm');
  await drag(f, target, { x: origin.x, y: target.y - 100 });
  assert.equal(f.node('fov').value, '35');
  assert.equal(f.node('heading').value, '0');
  assert.equal(f.node('focalLength').textContent, '≈57.1 mm');
  const extended = centerDrawn();
  assert.ok(extended.y < target.y, '画出的圆点确实远离机身');
  await drag(f, extended, { x: origin.x, y: origin.y - 10 });
  assert.equal(f.node('fov').value, '100');
  assert.equal(f.node('heading').value, '0');
  assert.equal(f.node('focalLength').textContent, '≈15.1 mm');
  const retracted = centerDrawn();
  assert.ok(retracted.y > target.y, '画出的圆点确实靠近机身');
  await drag(f, retracted, { x: origin.x + (origin.y - target.y), y: origin.y });
  assert.equal(f.node('heading').value, '90');
  assert.equal(f.node('fov').value, '60');
  assert.equal(f.node('focalLength').textContent, '≈31.2 mm');
  assert.equal(f.posts().length, 0);
  await f.click('generate');
  assert.deepEqual(f.posts()[0].body.camera, { x: .5, y: .5, heading: 90, fov: 60, height: 1.5 });
});

test('短焦圆点的弦线转向不会误变焦，径向拖动不受轻微横移影响', async () => {
  const f = await fixture();
  await f.upload(source('户型')); await f.click('placeCenter'); await f.input('fov', 100);
  const camera = { x: .5, y: .5, heading: 0, fov: 100 };
  const pointer = (type, x, y) => f.pointer(type, x + canvasBounds.left, y + canvasBounds.top);
  const { target } = canvasGuide(camera);
  await pointer('pointerdown', target.x, target.y);
  await pointer('pointermove', target.x + 2, target.y);
  assert.equal(f.node('heading').value, '0');
  await pointer('pointermove', target.x + 12, target.y);
  await pointer('pointermove', target.x + 40, target.y);
  await pointer('pointerup', target.x + 40, target.y);
  const turned = Number(f.node('heading').value);
  assert.ok(turned > 45);
  assert.equal(f.node('fov').value, '100');
  const guide = canvasGuide({ ...camera, heading: turned });
  const along = scale => ({
    x: guide.origin.x + (guide.target.x - guide.origin.x) * scale + 1,
    y: guide.origin.y + (guide.target.y - guide.origin.y) * scale + 1,
  });
  const start = along(1.4), end = along(2.5);
  await pointer('pointerdown', guide.target.x, guide.target.y);
  await pointer('pointermove', start.x, start.y);
  await pointer('pointermove', end.x, end.y);
  await pointer('pointerup', end.x, end.y);
  assert.ok(Number(f.node('fov').value) < 100);
  assert.equal(Number(f.node('heading').value), turned);
});

test('空白点按重定位，视野手柄限制开角并可用键盘调整', async () => {
  const f = await fixture({ configuration: { ...config, cameraDefaults: { ...config.cameraDefaults, height: 1.6 } } });
  await f.upload(source('户型')); await f.click('placeCenter');
  await f.pointer('pointerdown', 460, 245); await f.pointer('pointerup', 460, 245);
  const camera = { x: .75, y: .75, heading: 0, fov: 60 };
  const { origin, right } = canvasGuide(camera);
  await drag(f, right, { x: origin.x + 90, y: origin.y });
  assert.equal(f.node('fov').value, '100');
  await drag(f, canvasGuide({ ...camera, fov: 100 }).right, { x: origin.x, y: origin.y - 100 });
  assert.equal(f.node('fov').value, '35');
  await f.key('+');
  assert.ok(Number(f.node('fov').value) > 35);
  await f.key('-');
  assert.equal(f.node('fov').value, '35');
  await f.key('ArrowRight'); await f.key('ArrowLeft', true);
  await f.click('generate');
  const submitted = f.posts()[0].body.camera;
  assert.ok(submitted.x > camera.x, '右方向键在原机位上向右移动');
  assert.equal(submitted.y, camera.y);
  assert.equal(submitted.heading, 355);
  assert.equal(submitted.fov, 35);
  assert.equal(submitted.height, 1.6, '摄影高度取自服务端默认配置');
});

test('读取失败保留旧图和机位，成功换图必须重新放机位', async () => {
  const f = await fixture(); await f.upload(source('原户型')); await f.click('placeCenter');
  await f.upload({ ...source('坏文件'), fail: true });
  assert.equal(f.node('sourceThumbnail').src, source('原户型').dataUrl); assert.equal(f.node('generate').disabled, false);
  assert.match(f.node('error').textContent, /文件读取失败/);
  await f.upload(source('新户型')); assert.equal(f.node('generate').disabled, true);
  await f.click('generate'); assert.equal(f.posts().length, 0);
});

test('提交响应未知保留原任务，检查及会话恢复只GET不再POST', async () => {
  const camera = { x: .5, y: .5, heading: 0, fov: 60, height: 1.5 };
  const f = await fixture({ respond: async call => {
    if (call.method === 'POST') throw new Error('网络响应中断');
    return { job: { status: 'success', result: rendered(camera) } };
  } });
  await f.upload(source('原户型')); await f.click('placeCenter'); await f.click('generate');
  assert.equal(f.posts().length, 1); assert.equal(f.node('generate').disabled, true); assert.equal(f.node('sourceInput').disabled, true);
  const saved = JSON.parse(f.storage.get(SESSION)); assert.ok(saved.pending);
  await f.click('generate'); assert.equal(f.posts().length, 1);
  await f.click('refresh'); assert.equal(f.posts().length, 1); assert.equal(f.reads().length, 1);
  const restored = await fixture({ saved, respond: async () => ({ job: { status: 'success', result: rendered(camera) } }) });
  assert.equal(restored.posts().length, 0); assert.equal(restored.reads().length, 1);
  assert.equal(restored.node('result').src, rendered(camera).image.url);
  assert.equal(restored.node('generate').disabled, true, '恢复结果不伪造原平面图或新机位');
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
  failed = true; await f.nextPoll();
  assert.equal(f.node('status').textContent, '取景说明不完整');
  assert.match(f.node('error').textContent, /未开始生图.*重试.*更换推理模型/);
  assert.doesNotMatch(f.node('error').textContent, /JSON/);
  assert.equal(f.node('generate').disabled, false);
  assert.equal(f.node('refreshLabel').textContent, '刷新');
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

test('非法机位参数显示范围、清除旧视锥，合法恢复仅清除参数错误', async () => {
  const f = await fixture(); await f.upload(source('原户型')); await f.click('placeCenter');
  for (const [id, invalid, valid, message] of [
    ['heading', 360, 0, /朝向请输入 0–359°/], ['heading', -1, 90, /朝向请输入 0–359°/],
    ['fov', 101, 60, /水平视野请输入 35–100°/], ['fov', '', 60, /水平视野请输入 35–100°/],
    ['fov', 34, 60, /水平视野请输入 35–100°/],
  ]) {
    f.drawing.length = 0; await f.input(id, invalid);
    assert.equal(f.node('generate').disabled, true); assert.equal(f.node('error').hidden, false);
    assert.match(f.node('error').textContent, message); assert.equal(f.node('status').textContent, '请修正相机参数');
    assert.equal(f.node(id).attributes.get('aria-invalid'), 'true');
    assert.deepEqual(f.drawing.map(call => call.name), ['clearRect', 'drawImage'], '非法参数必须重绘原图并清除旧机位');
    await f.input(id, valid); assert.equal(f.node('generate').disabled, false); assert.equal(f.node('error').hidden, true);
    assert.equal(f.node('status').textContent, '机位已设置，可以生成');
    assert.equal(f.node(id).attributes.get('aria-invalid'), 'false');
  }
  await f.upload({ ...source('损坏文件'), fail: true }); assert.match(f.node('error').textContent, /文件读取失败/);
  await f.input('fov', 101); assert.match(f.node('error').textContent, /水平视野请输入.*文件读取失败/);
  await f.input('fov', 60); assert.equal(f.node('error').hidden, false);
  assert.equal(f.node('error').textContent, '文件读取失败', '相机恢复不能吞掉独立操作错误');
  assert.equal(f.node('status').textContent, '相机参数已更新，请处理错误提示');
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
  completed = true; await f.nextPoll();
  assert.match(f.node('status').textContent, /成功 3\/4 张，失败 1 张/);
  assert.equal(f.node('resultGroups').hidden, false);
  const [gptGroup, bananaGroup] = f.node('resultGroups').children;
  assert.deepEqual([gptGroup, bananaGroup].map(group => group.children[0].textContent), [gpt.label, banana.label]);
  const [failed, gptSecond] = gptGroup.children[1].children;
  assert.equal(failed.tagName, 'div'); assert.equal(failed.children[1].textContent, failure.error);
  assert.equal(gptSecond.attributes.get('aria-pressed'), 'true');
  assert.equal(f.node('result').src, source('GPT 第二张').dataUrl);
  const bananaSecond = bananaGroup.children[1].children[1];
  await bananaSecond.fire('click');
  assert.equal(gptSecond.attributes.get('aria-pressed'), 'false');
  assert.equal(bananaSecond.attributes.get('aria-pressed'), 'true');
  assert.equal(f.node('result').src, source('Banana 第二张').dataUrl);
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
  await f.input('directPrompt', '   \n');
  await f.click('generate'); assert.equal(f.posts().length, 0);
  await f.input('directPrompt', prompt);
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

test('新任务忽略旧裁切配置，空间推理选择冻结，旧结果仍只读恢复', async () => {
  let request, completed = false;
  const scenePrompt = 'Camera-level view, warm oak. <img src=x onerror=alert(1)>\nSoft daylight.';
  const viewSummary = '机位朝向90°，左侧门洞，正前方实墙。\n<b>墙后卧室不可见。</b>';
  const result = () => ({ ...rendered(request.camera), agent: { key: 'gpt', label: 'GPT 5.5' }, viewSummary, scenePrompt,
    actual: { generationMode: 'image-to-image', ...planReference } });
  const configuration = { ...config, foregroundCrop: { min: 4, max: 30, default: 10 },
    prompt: { ...config.prompt, version: 9, code: 'floor-plan-camera-frame-agent' } };
  const f = await fixture({ saved: { foregroundCrop: 13 }, configuration, respond: async call => {
    if (call.method === 'POST') { request = call.body; return { job: { status: 'running' } }; }
    return completed ? { job: { status: 'success', result: result() } }
      : { job: { status: 'running', message: '正在分析该机位的可见空间…' } };
  } });
  await f.upload(source('户型')); await f.click('placeCenter'); await f.input('heading', 90);
  for (const id of ['foregroundCropEnabled', 'foregroundCropDistance', 'foregroundCropKey']) assert.equal(f.node(id), undefined);
  await f.input('agentModel', 'gpt', 'change'); await f.click('generate');
  assert.equal(Object.hasOwn(request, 'foregroundCrop'), false);
  assert.equal(request.agentModelKey, 'gpt'); assert.equal(f.node('agentModel').disabled, true);
  assert.equal(request.workflowVersion, '2026-11-07.floor-plan-camera.9');
  assert.match(f.node('status').textContent, /分析.*可见空间/);
  await f.input('agentModel', 'gemini3pro', 'change');
  assert.equal(JSON.parse(f.storage.get(SESSION)).agentModel, 'gpt'); assert.equal(request.agentModelKey, 'gpt');
  completed = true; await f.nextPoll();
  assert.equal(f.posts().length, 1); assert.equal(f.node('scenePrompt').textContent, scenePrompt);
  assert.equal(f.node('viewSummarySection').hidden, false); assert.equal(f.node('viewSummary').textContent, viewSummary);
  assert.equal(f.node('scenePromptDetails').hidden, false); assert.equal(f.node('scenePromptDetails').open, false);
  assert.match(f.node('resultMeta').textContent, /空间推理：GPT 5.5.*机位图参考/);
  assert.doesNotMatch(f.node('resultMeta').textContent, /前景裁切/);
  await f.input('agentModel', 'gemini3pro', 'change'); await f.input('heading', 180);
  assert.match(f.node('resultMeta').textContent, /空间推理：GPT 5.5/);
  assert.match(f.node('resultMeta').textContent, /朝向 90°/); assert.equal(f.node('viewSummary').textContent, viewSummary);
  const restored = await fixture({ saved: JSON.parse(f.storage.get(SESSION)), respond: async () => ({ job: { status: 'success', result: { ...result(), foregroundCrop: 13 } } }) });
  assert.equal(restored.posts().length, 0); assert.equal(restored.node('scenePrompt').textContent, scenePrompt);
  assert.equal(restored.node('viewSummarySection').hidden, false); assert.equal(restored.node('viewSummary').textContent, viewSummary);
  assert.equal(restored.node('scenePromptDetails').open, false);
  assert.match(restored.node('resultMeta').textContent, /机位图参考.*前景裁切 13%/);
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

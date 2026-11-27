/**
 * [INPUT]: 依赖共享相机几何和平面图机位 UI 夹具模拟指针、键盘、墙线与上传
 * [OUTPUT]: 验证机位画布几何、拖拽与取景操作、墙线标注、原图替换和相机参数准入
 * [POS]: test 的平面图机位画布前端回归，与任务流程测试共用内存 DOM 夹具
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import * as geometry from '../public/floor-plan-camera-geometry.js';
import { SESSION, canvasBounds, config, fixture, rendered, source } from './floor-plan-camera-ui-fixture.mjs';

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

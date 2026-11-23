/**
 * [INPUT]: 依赖共享机位几何的视角射线裁剪，无远程模型或收费请求
 * [OUTPUT]: 验证无限射线与图像矩形交集、像素外接框、边缘空视野及独立参考深度
 * [POS]: test 的平面图机位裁剪专项回归，供图像送模合同复用
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { cameraViewCrop } from '../public/floor-plan-camera-geometry.js';

const camera = { x: .5, y: .5, heading: 0, fov: 90 };
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} 应接近 ${expected}`);

function assertWithinView(crop, pose, width, height) {
  const origin = { x: pose.x * (width - 1), y: pose.y * (height - 1) };
  for (const point of crop.polygon) {
    assert.ok(point.x >= 0 && point.x <= width - 1 && point.y >= 0 && point.y <= height - 1);
    const dx = point.x - origin.x, dy = point.y - origin.y;
    if (Math.hypot(dx, dy) < 1e-8) continue;
    const heading = Math.atan2(dx, -dy) * 180 / Math.PI;
    const difference = ((heading - pose.heading + 540) % 360) - 180;
    assert.ok(Math.abs(difference) <= pose.fov / 2 + 1e-8);
  }
  const { left, top, width: cropWidth, height: cropHeight } = crop.bounds;
  for (const point of crop.polygon) {
    assert.ok(point.x >= left - 1e-8 && point.x <= left + cropWidth - 1 + 1e-8);
    assert.ok(point.y >= top - 1e-8 && point.y <= top + cropHeight - 1 + 1e-8);
  }
}

test('四方位射线延伸到图片边界，外接框包含全部交集像素', () => {
  const cases = [
    [0, { left: 0, top: 0, width: 101, height: 51 }],
    [90, { left: 50, top: 0, width: 51, height: 101 }],
    [180, { left: 0, top: 50, width: 101, height: 51 }],
    [270, { left: 0, top: 0, width: 51, height: 101 }],
  ];
  for (const [heading, bounds] of cases) {
    const pose = { ...camera, heading };
    const crop = cameraViewCrop(pose, 101, 101);
    assert.deepEqual(crop.bounds, bounds);
    assert.equal(crop.polygon.length, 3);
    assertWithinView(crop, pose, 101, 101);
  }
});

test('非正方形图按像素计算开角，归一坐标不拉伸射线', () => {
  const crop = cameraViewCrop(camera, 201, 101);
  assert.deepEqual(crop.bounds, { left: 50, top: 0, width: 101, height: 51 });
  const top = crop.polygon.filter(point => point.y === 0).sort((a, b) => a.x - b.x);
  near(top[0].x, 50);
  near(top[1].x, 150);
  assertWithinView(crop, camera, 201, 101);
});

test('斜向宽视野保留图片边角，交集是多边形而非固定三角', () => {
  const pose = { ...camera, heading: 45, fov: 100 };
  const crop = cameraViewCrop(pose, 201, 101);
  assert.equal(crop.polygon.length, 4);
  assert.ok(crop.polygon.some(point => point.x === 200 && point.y === 0));
  assertWithinView(crop, pose, 201, 101);
});

test('边缘朝外和角点朝外没有正面积交集，边缘朝内正常裁剪', () => {
  for (const pose of [
    { ...camera, x: 0, heading: 270 }, { ...camera, x: 1, heading: 90 },
    { ...camera, y: 0, heading: 0 }, { ...camera, y: 1, heading: 180 },
    { ...camera, x: 0, y: 0, heading: 315 },
  ]) assert.equal(cameraViewCrop(pose, 101, 101), null);
  const pose = { ...camera, x: 0, heading: 0 };
  const crop = cameraViewCrop(pose, 101, 101);
  assert.deepEqual(crop.bounds, { left: 0, top: 0, width: 51, height: 51 });
  assertWithinView(crop, pose, 101, 101);
});

test('角点朝内的直角视野保留完整图片，重复角点被合并', () => {
  const pose = { ...camera, x: 0, y: 0, heading: 135 };
  const crop = cameraViewCrop(pose, 201, 101);
  assert.deepEqual(crop.bounds, { left: 0, top: 0, width: 201, height: 101 });
  assert.equal(crop.polygon.length, 4);
  assertWithinView(crop, pose, 201, 101);
});

test('参考三角深度和外框开关不改变无限射线裁剪', () => {
  const expected = cameraViewCrop(camera, 801, 601);
  for (const guideDepth of [.05, .27, 1.5]) {
    for (const showFrame of [true, false]) {
      assert.deepEqual(cameraViewCrop({ ...camera, guideDepth, showFrame }, 801, 601), expected);
    }
  }
});

test('非整数机位外接框向外取整，零宽高和无效参数不产生裁剪框', () => {
  const pose = { x: .423, y: .637, heading: 323, fov: 35 };
  const crop = cameraViewCrop(pose, 800, 600);
  assert.ok(Object.values(crop.bounds).every(Number.isInteger));
  assertWithinView(crop, pose, 800, 600);
  for (const [width, height] of [[0, 100], [100, 0], [1, 100], [100, 1]]) {
    assert.equal(cameraViewCrop(camera, width, height), null);
  }
  for (const pose of [null, { ...camera, x: -1 }, { ...camera, y: NaN }, { ...camera, fov: 180 }]) {
    assert.equal(cameraViewCrop(pose, 100, 100), null);
  }
});

/**
 * [INPUT]: 依赖共享墙线检测、水平射线估算与机位标注，以及合成平面图的近墙与远墙像素
 * [OUTPUT]: 验证双侧近墙的画幅与平面边界、三角内可见区、可选矩形外框、墙线和画外原色
 * [POS]: test 的平面图机位可见区几何回归，使用本地像素，不访问模型
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { cameraAnnotationSvg } from '../public/floor-plan-camera-annotation.js';
import { cameraGuide, cameraToolAt } from '../public/floor-plan-camera-geometry.js';
import { cameraVisibility, cameraVisibilityAnalysis, detectFloorPlanWalls } from '../public/floor-plan-camera-visibility.js';

const camera = { x: 0.5, y: 0.75, heading: 0, fov: 90 };

function corridorPlan({ bothSides = true, farWallGap = false } = {}) {
  const width = 240, height = 200;
  const data = new Uint8Array(width * height * 4).fill(255);
  const walls = [[20, 20, 24, 190], [216, 20, 220, 190], [20, 186, 220, 190], [20, 108, 102, 113]];
  if (bothSides) walls.push([137, 108, 220, 113]);
  if (farWallGap) walls.push([20, 20, 109, 24], [131, 20, 220, 24]);
  else walls.push([20, 20, 220, 24]);
  for (const [left, top, right, bottom] of walls) {
    for (let y = top; y < bottom; y++) {
      for (let x = left; x < right; x++) {
        const offset = (y * width + x) * 4;
        data.fill(0, offset, offset + 3);
      }
    }
  }
  return { data, width, height };
}
const corridorWalls = options => detectFloorPlanWalls(corridorPlan(options));

test('左右近墙夹住较远墙面时估算透视画幅中的边界', () => {
  const walls = corridorWalls();
  const { polygon, bilateralOpening } = cameraVisibilityAnalysis(camera, walls);
  assert.deepEqual(polygon, cameraVisibility(camera, walls));
  assert.ok(bilateralOpening.left >= 0.27 && bilateralOpening.left <= 0.30);
  assert.ok(bilateralOpening.right >= 0.69 && bilateralOpening.right <= 0.73);
  const { fartherBoundary } = bilateralOpening;
  assert.equal(fartherBoundary.length, 5);
  assert.ok(fartherBoundary.every(({ y }) => y >= 0.11 && y <= 0.13), '边界应落在后墙附近');
  assert.ok(fartherBoundary[0].x < 0.3 && fartherBoundary.at(-1).x > 0.7);
  assert.ok(fartherBoundary.slice(1).every(({ x }, index) => x > fartherBoundary[index].x));
});

test('单侧近墙或中间缺少直接命中时只保留可见区填色', () => {
  for (const walls of [corridorWalls({ bothSides: false }), corridorWalls({ farWallGap: true })]) {
    const { polygon, bilateralOpening } = cameraVisibilityAnalysis(camera, walls);
    assert.ok(polygon.length > 1);
    assert.equal(bilateralOpening, null);
  }
});

test('双侧近墙保留近墙、远墙与外框之外的原图像素', async () => {
  const plan = corridorPlan();
  const { data, width, height } = plan;
  const { polygon, bilateralOpening } = cameraVisibilityAnalysis(camera, detectFloorPlanWalls(plan));
  assert.ok(bilateralOpening);
  const svg = cameraAnnotationSvg(camera, width, height, polygon);
  const marked = await sharp(data, { raw: { width, height, channels: 4 } })
    .composite([{ input: Buffer.from(svg) }]).raw().toBuffer();
  const pixel = (x, y) => [...marked.subarray(4 * (y * width + x), 4 * (y * width + x) + 3)];
  assert.deepEqual(pixel(120, 22), [0, 0, 0], '保留可见的远墙墨线');
  assert.deepEqual(pixel(65, 110), [0, 0, 0], '保留框线外的近墙墨线');
  assert.deepEqual(pixel(40, 22), [0, 0, 0], '保留画外墙线');
  const [red, green, blue] = pixel(135, 121);
  assert.ok(red < green && green < blue && blue < 255, '蓝色填色仍提示可见区域');
  assert.deepEqual(pixel(135, 100), [255, 255, 255], '三角远边外即使在无遮挡射线上也不着色');
});

test('只有镜头角域时保留镜头后方、开角外及三角远边外的原色', async () => {
  const width = 360, height = 180;
  const camera = { x: .1, y: .5, heading: 90, fov: 100 };
  const svg = cameraAnnotationSvg(camera, width, height, null);
  const data = await sharp({ create: { width, height, channels: 3, background: '#22644a' } })
    .composite([{ input: Buffer.from(svg) }]).removeAlpha().raw().toBuffer();
  for (const [x, y] of [[5, 90], [70, 8], [355, 20]]) {
    const offset = 3 * (y * width + x);
    assert.deepEqual([...data.subarray(offset, offset + 3)], [34, 100, 74]);
  }
});

test('正向和斜向取景框沿图纸横竖对齐并包住三角，旧 C 标记保留扇形', () => {
  const width = 360, height = 180;
  const framePath = /<path d="M([^ ]+) L([^ ]+) L([^ ]+) L([^ ]+) Z" fill="none"/;
  for (const heading of [0, 67, 270]) {
    for (const fov of [35, 100]) {
      const pose = { x: .38, y: .53, heading, fov };
      const svg = cameraAnnotationSvg(pose, width, height, null);
      const frame = svg.match(framePath);
      assert.ok(frame, `朝向 ${heading}°、视野 ${fov}° 应有矩形外框`);
      const corners = frame.slice(1).map(point => point.split(',').map(Number));
      const { origin, left, right } = cameraGuide(pose, width - 1, height - 1);
      const radius = Math.max(5, Math.min(width, height) / 65);
      const minX = Math.min(origin.x, left.x, right.x) - radius;
      const minY = Math.min(origin.y, left.y, right.y) - radius;
      const maxX = Math.max(origin.x, left.x, right.x) + radius;
      const maxY = Math.max(origin.y, left.y, right.y) + radius;
      assert.deepEqual(corners, [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]]);
      const legacy = cameraAnnotationSvg(pose, width, height, null, { markCameraWithLetter: true });
      assert.match(legacy, />C<\/text>/);
      assert.doesNotMatch(legacy, framePath);
    }
  }
});

test('取消取景框只移除矩形，三角远边的深度握把可继续拖动', () => {
  const { width, height } = corridorPlan();
  const pose = { ...camera, guideDepth: .32 };
  const polygon = cameraVisibility(pose, corridorWalls());
  const withFrame = cameraAnnotationSvg(pose, width, height, polygon);
  const withoutFrame = cameraAnnotationSvg({ ...pose, showFrame: false }, width, height, polygon);
  const frameStroke = 'stroke-opacity="0.56"';
  assert.ok(withFrame.includes(frameStroke));
  const lines = svg => svg.split('\n').filter(line => line.trim());
  assert.deepEqual(lines(withoutFrame), lines(withFrame).filter(line => !line.includes(frameStroke)));
  assert.equal(cameraAnnotationSvg({ ...pose, showFrame: true }, width, height, polygon), withFrame);
  const guide = cameraGuide({ ...pose, showFrame: false }, width, height);
  assert.equal(guide.depthHandle.y, guide.origin.y - .32 * height);
  assert.equal(cameraToolAt(guide, guide.depthHandle, 14, { showFrame: false }), 'depth');
  assert.notEqual(cameraToolAt(guide, { x: guide.viewFrame.left, y: guide.viewFrame.top }, 14, { showFrame: false }), 'depth');
});

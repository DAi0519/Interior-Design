/**
 * [INPUT]: 依赖共享墙线检测和水平射线估算，以及合成平面图的近墙与远墙像素
 * [OUTPUT]: 验证双侧近墙估算的画幅和平面边界、单侧遮挡与缺失命中的回退
 * [POS]: test 的平面图机位可见区几何回归，使用本地像素，不访问模型
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { cameraVisibility, cameraVisibilityAnalysis, detectFloorPlanWalls } from '../public/floor-plan-camera-visibility.js';

const camera = { x: 0.5, y: 0.75, heading: 0, fov: 90 };

function corridorWalls({ bothSides = true, farWallGap = false } = {}) {
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
  return detectFloorPlanWalls({ data, width, height });
}

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

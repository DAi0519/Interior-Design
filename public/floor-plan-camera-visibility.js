/**
 * [INPUT]: 依赖缩放后的正向 RGBA 平面图，以及左上原点的归一化机位和水平视野
 * [OUTPUT]: 提取深色墙线，计算水平可见区域，并提供两侧近遮挡与中间远景的可选画幅估算
 * [POS]: public 的平面图相机共享遮挡估算，画布预览与服务端单张标注图共用
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export const FLOOR_PLAN_WALL_ANALYSIS_MAX_SIDE = 640;
const MAX_WALL_CHANNEL = 106;
const MAX_WALL_CHROMA = 42;
const MAX_WALL_GAP_PIXELS = 3;
const MAX_WALL_RAIL_GAP_PIXELS = 6;
const RAY_STEP_DEGREES = 0.5;
const RAY_STEP_PIXELS = 0.65;
const BILATERAL_EDGE_RAYS = 5;
const MIN_BILATERAL_SIDE_WIDTH = 0.12;
const MIN_BILATERAL_CENTER_WIDTH = 0.15;
const MIN_BILATERAL_DEPTH_DROP = 0.35;
const MIN_BILATERAL_NEAR_COVERAGE = 0.85;
const BILATERAL_BOUNDARY_SAMPLES = [0, 0.25, 0.5, 0.75, 1];

// --- 将长而连续的深色线与文字、门扇弧线分开 ---
function longRuns(dark, length, count, step, rowStep, minRun) {
  const mask = new Uint8Array(dark.length);
  for (let row = 0; row < count; row++) {
    const offset = row * rowStep;
    let start = 0;
    for (let pos = 0; pos <= length; pos++) {
      if (pos < length && dark[offset + pos * step]) continue;
      if (pos - start >= minRun) {
        for (let k = start; k < pos; k++) mask[offset + k * step] = 1;
      }
      start = pos + 1;
    }
  }
  return mask;
}

// --- 合并间距很小的平行线或断点，较宽的门洞保持贯通 ---
function closeWallGaps(mask, length, count, step, rowStep, maxGap = MAX_WALL_GAP_PIXELS) {
  for (let row = 0; row < count; row++) {
    const offset = row * rowStep;
    let lastWall = -1;
    for (let pos = 0; pos < length; pos++) {
      if (!mask[offset + pos * step]) continue;
      if (lastWall >= 0 && pos - lastWall <= maxGap + 1) {
        for (let k = lastWall + 1; k < pos; k++) mask[offset + k * step] = 1;
      }
      lastWall = pos;
    }
  }
}

export function detectFloorPlanWalls({ data, width, height }) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || Math.min(width, height) < 32
    || Math.max(width, height) > FLOOR_PLAN_WALL_ANALYSIS_MAX_SIDE || data?.length !== width * height * 4) return null;
  const dark = new Uint8Array(width * height);
  for (let i = 0; i < dark.length; i++) {
    const [r, g, b, alpha] = [data[4 * i], data[4 * i + 1], data[4 * i + 2], data[4 * i + 3]];
    const brightest = Math.max(r, g, b);
    if (alpha >= 200 && brightest <= MAX_WALL_CHANNEL && brightest - Math.min(r, g, b) <= MAX_WALL_CHROMA) dark[i] = 1;
  }
  const minRun = Math.max(9, Math.round(Math.min(width, height) * 0.034));
  const horizontal = longRuns(dark, width, height, 1, width, minRun);
  const vertical = longRuns(dark, height, width, width, 1, minRun);
  // --- 双线画法的两条长边也能确定墙厚 ---
  closeWallGaps(horizontal, height, width, width, 1, MAX_WALL_RAIL_GAP_PIXELS);
  closeWallGaps(vertical, width, height, 1, width, MAX_WALL_RAIL_GAP_PIXELS);
  const mask = new Uint8Array(dark.length);
  let left = width, top = height, right = -1, bottom = -1, area = 0, across = 0, down = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const wallAcross = horizontal[i - width] && horizontal[i] && horizontal[i + width];
      const wallDown = vertical[i - 1] && vertical[i] && vertical[i + 1];
      if (wallAcross) {
        mask[i - width] = mask[i] = mask[i + width] = 1;
        across++;
      }
      if (wallDown) {
        mask[i - 1] = mask[i] = mask[i + 1] = 1;
        down++;
      }
      if (!wallAcross && !wallDown) continue;
      left = Math.min(left, x - 1); right = Math.max(right, x + 1);
      top = Math.min(top, y - 1); bottom = Math.max(bottom, y + 1);
      area++;
    }
  }
  if (across < 2 * minRun || down < 2 * minRun || area > dark.length * 0.3
    || right - left < 3 * minRun || bottom - top < 3 * minRun) return null;
  closeWallGaps(mask, width, height, 1, width);
  closeWallGaps(mask, height, width, width, 1);
  return { width, height, mask, left, right: right + 1, top, bottom: bottom + 1 };
}

// --- 每条射线在遇到第一道墙时停止，穿过开口后继续到下一道墙 ---
function traceCameraVisibility(camera, walls) {
  if (!walls || !camera || ![camera.x, camera.y, camera.heading, camera.fov].every(Number.isFinite)
    || camera.fov <= 0 || camera.fov > 180) return null;
  const { width, height, mask, left, right, top, bottom } = walls;
  const ox = camera.x * width, oy = camera.y * height;
  if (ox < left || ox >= right || oy < top || oy >= bottom || mask[Math.floor(oy) * width + Math.floor(ox)]) return null;
  const steps = Math.ceil(camera.fov / RAY_STEP_DEGREES);
  const rays = [];
  let hits = 0;
  for (let i = 0; i <= steps; i++) {
    const radians = (camera.heading - camera.fov / 2 + i * camera.fov / steps) * Math.PI / 180;
    const dx = Math.sin(radians), dy = -Math.cos(radians);
    const limitX = dx > 0 ? (right - ox) / dx : dx < 0 ? (left - ox) / dx : Infinity;
    const limitY = dy > 0 ? (bottom - oy) / dy : dy < 0 ? (top - oy) / dy : Infinity;
    const limit = Math.min(limitX, limitY);
    let distance = null;
    for (let t = RAY_STEP_PIXELS; t < limit; t += RAY_STEP_PIXELS) {
      const x = Math.floor(ox + dx * t), y = Math.floor(oy + dy * t);
      if (!mask[y * width + x]) continue;
      distance = t - RAY_STEP_PIXELS / 2;
      hits++;
      break;
    }
    rays.push({ dx, dy, distance, limit });
  }
  if (hits * 3 < 2 * (steps + 1)) return null;
  return { width, height, ox, oy, rays };
}

// --- 填色可沿用相邻射线的边界，画幅估算仅采信直接命中 ---
function projectVisibilityPolygon(camera, { width, height, ox, oy, rays }) {
  let previous = 0;
  let next = 0;
  return [{ x: camera.x, y: camera.y }, ...rays.map((ray, i) => {
    if (ray.distance !== null) previous = i;
    if (next <= i) {
      next = i;
      while (next < rays.length && rays[next].distance === null) next++;
    }
    const distance = ray.distance ?? Math.min(ray.limit, rays[previous].distance ?? Infinity, rays[next]?.distance ?? Infinity);
    return { x: (ox + ray.dx * distance) / width, y: (oy + ray.dy * distance) / height };
  })];
}

// --- 只在中间持续较远、左右两侧均有强深度变化时报告边界 ---
function estimateBilateralOpening(rays, fov, polygon) {
  if (fov >= 180) return null;
  const span = fov * Math.PI / 180;
  const rayOffset = index => (index / (rays.length - 1) - 0.5) * span;
  const depth = rays.map(({ distance }, index) => distance === null ? null : distance * Math.cos(rayOffset(index)));
  let start = -1, end = -1, rise = 0, fall = 0;
  for (let i = BILATERAL_EDGE_RAYS; i <= depth.length - BILATERAL_EDGE_RAYS; i++) {
    if (depth[i - 1] === null || depth[i] === null) continue;
    const step = depth[i] - depth[i - 1];
    if (rayOffset(i) < 0 && step > rise) { start = i; rise = step; }
    if (rayOffset(i) > 0 && -step > fall) { end = i; fall = -step; }
  }
  if (start < 0 || end < 0) return null;
  const screenX = index => (1 + Math.tan(rayOffset(index)) / Math.tan(span / 2)) / 2;
  const left = screenX(start), right = screenX(end);
  if (left < MIN_BILATERAL_SIDE_WIDTH || right > 1 - MIN_BILATERAL_SIDE_WIDTH
    || right - left < MIN_BILATERAL_CENTER_WIDTH || end - start < BILATERAL_EDGE_RAYS) return null;

  const middle = depth.slice(start, end);
  if (middle.includes(null)) return null;
  const maxNearDepth = Math.min(...middle) * (1 - MIN_BILATERAL_DEPTH_DROP);
  const isNear = value => value !== null && value <= maxNearDepth;
  const sides = [depth.slice(0, start), depth.slice(end)];
  const edge = [...sides[0].slice(-BILATERAL_EDGE_RAYS), ...sides[1].slice(0, BILATERAL_EDGE_RAYS)];
  if (!edge.every(isNear) || sides.some(side => side.filter(isNear).length < side.length * MIN_BILATERAL_NEAR_COVERAGE)) return null;
  const roundPosition = value => Math.round(value * 1000) / 1000;
  const fartherBoundary = BILATERAL_BOUNDARY_SAMPLES.map(fraction => {
    const index = start + Math.round(fraction * (end - start - 1));
    const { x, y } = polygon[index + 1];
    return { x: roundPosition(x), y: roundPosition(y) };
  });
  return { left: roundPosition(left), right: roundPosition(right), fartherBoundary };
}

export function cameraVisibility(camera, walls) {
  const trace = traceCameraVisibility(camera, walls);
  return trace ? projectVisibilityPolygon(camera, trace) : null;
}

export function cameraVisibilityAnalysis(camera, walls) {
  const trace = traceCameraVisibility(camera, walls);
  if (!trace) return null;
  const polygon = projectVisibilityPolygon(camera, trace);
  return { polygon, bilateralOpening: estimateBilateralOpening(trace.rays, camera.fov, polygon) };
}

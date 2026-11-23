/**
 * [INPUT]: 依赖归一化相机位置、顺时针朝向与原图宽高
 * [OUTPUT]: 提供图像坐标、等效焦距、视角射线与原图求交裁剪、可伸缩的视野三角及可选外框、手柄命中和拖动深度
 * [POS]: public 的无状态相机几何计算，供画布交互与离线合同测试复用
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const normalizeHeading = value => ((value % 360) + 360) % 360;
export const CAMERA_FOV_LIMITS = Object.freeze({ min: 35, max: 100 });
export const CAMERA_GUIDE_DEPTH_LIMITS = Object.freeze({ min: .05, max: 1.5 });
export const CAMERA_DEFAULT_FOV = 50;
export const CAMERA_GUIDE_SECTOR_RATIO = 0.27;
export function equivalentFocalLengthMm(horizontalFovDegrees) {
  const halfSensorWidthMm = 18;
  return Math.round(10 * halfSensorWidthMm / Math.tan(horizontalFovDegrees * Math.PI / 360)) / 10;
}
export function imagePoint(clientX, clientY, bounds, bounded = true) {
  const x = (clientX - bounds.left) / bounds.width, y = (clientY - bounds.top) / bounds.height;
  return bounded ? { x: clamp(x, 0, 1), y: clamp(y, 0, 1) } : { x, y };
}
export function headingToPoint(camera, point, width, height) {
  const dx = (point.x - camera.x) * width, dy = (point.y - camera.y) * height;
  return Math.hypot(dx, dy) < 1 ? camera.heading : normalizeHeading(Math.atan2(dx, -dy) * 180 / Math.PI);
}
export function directionPoint(camera, heading, length, width, height) {
  const radians = (heading - 90) * Math.PI / 180;
  return { x: camera.x * width + Math.cos(radians) * length, y: camera.y * height + Math.sin(radians) * length };
}

export const cameraMarkerRadius = (width, height) => Math.max(5, Math.min(width, height) / 65);

// --- 两条视角射线构成半平面，依次截取图像矩形；参考远边不限制射线 ---
export function cameraViewCrop(camera, width, height) {
  if (![width, height, camera?.x, camera?.y, camera?.heading, camera?.fov].every(Number.isFinite)
    || width <= 1 || height <= 1 || camera.x < 0 || camera.x > 1 || camera.y < 0 || camera.y > 1
    || camera.fov <= 0 || camera.fov >= 180) return null;
  const maxX = width - 1, maxY = height - 1;
  const origin = { x: camera.x * maxX, y: camera.y * maxY };
  const epsilon = Number.EPSILON * Math.max(width, height) * 32;
  let polygon = [{ x: 0, y: 0 }, { x: maxX, y: 0 }, { x: maxX, y: maxY }, { x: 0, y: maxY }];
  for (const [heading, side] of [[camera.heading - camera.fov / 2, 1], [camera.heading + camera.fov / 2, -1]]) {
    const radians = heading * Math.PI / 180;
    const direction = { x: Math.sin(radians), y: -Math.cos(radians) };
    const distance = point => {
      const value = side * (direction.x * (point.y - origin.y) - direction.y * (point.x - origin.x));
      return Math.abs(value) <= epsilon ? 0 : value;
    };
    const clipped = [];
    for (let index = 0; index < polygon.length; index++) {
      const start = polygon[index], end = polygon[(index + 1) % polygon.length];
      const startDistance = distance(start), endDistance = distance(end);
      const startInside = startDistance >= 0, endInside = endDistance >= 0;
      if (startInside !== endInside) {
        const ratio = startDistance / (startDistance - endDistance);
        clipped.push({ x: clamp(start.x + (end.x - start.x) * ratio, 0, maxX),
          y: clamp(start.y + (end.y - start.y) * ratio, 0, maxY) });
      }
      if (endInside) clipped.push(end);
    }
    polygon = clipped;
  }
  polygon = polygon.filter((point, index) => {
    const previous = polygon[(index + polygon.length - 1) % polygon.length];
    return Math.hypot(point.x - previous.x, point.y - previous.y) > epsilon;
  });
  const doubleArea = polygon.reduce((area, point, index) => {
    const next = polygon[(index + 1) % polygon.length];
    return area + point.x * next.y - next.x * point.y;
  }, 0);
  if (polygon.length < 3 || Math.abs(doubleArea) <= epsilon * Math.max(width, height)) return null;
  const snap = value => Math.abs(value - Math.round(value)) <= epsilon ? Math.round(value) : value;
  const left = Math.floor(snap(Math.min(...polygon.map(point => point.x))));
  const top = Math.floor(snap(Math.min(...polygon.map(point => point.y))));
  const right = Math.ceil(snap(Math.max(...polygon.map(point => point.x))));
  const bottom = Math.ceil(snap(Math.max(...polygon.map(point => point.y))));
  return { polygon, bounds: { left, top, width: right - left + 1, height: bottom - top + 1 } };
}

export function cameraViewFrame({ origin, left, right }, padding) {
  return {
    left: Math.min(origin.x, left.x, right.x) - padding,
    top: Math.min(origin.y, left.y, right.y) - padding,
    right: Math.max(origin.x, left.x, right.x) + padding,
    bottom: Math.max(origin.y, left.y, right.y) + padding,
  };
}

export function cameraGuide(camera, width, height, handleLength = Math.min(width, height) * .17) {
  const shortSide = Math.min(width, height);
  const halfAngle = camera.fov * Math.PI / 360;
  const oldLength = shortSide * CAMERA_GUIDE_SECTOR_RATIO;
  const depth = camera.guideDepth ?? CAMERA_GUIDE_SECTOR_RATIO * Math.cos(halfAngle);
  const edgeLength = camera.guideDepth == null ? oldLength : depth * shortSide / Math.cos(halfAngle);
  const zoomSpan = Math.min(handleLength, oldLength * .66, camera.guideDepth == null ? Infinity : depth * shortSide * .56);
  const fovSpan = CAMERA_FOV_LIMITS.max - CAMERA_FOV_LIMITS.min;
  const targetRadius = zoomSpan * (1 + (60 - camera.fov) / fovSpan);
  const origin = { x: camera.x * width, y: camera.y * height };
  const left = directionPoint(camera, camera.heading - camera.fov / 2, edgeLength, width, height);
  const right = directionPoint(camera, camera.heading + camera.fov / 2, edgeLength, width, height);
  const viewFrame = cameraViewFrame({ origin, left, right }, cameraMarkerRadius(width, height));
  const radians = camera.heading * Math.PI / 180;
  const direction = { x: Math.sin(radians), y: -Math.cos(radians) };
  const edgeX = direction.x > 0 ? viewFrame.right : viewFrame.left;
  const edgeY = direction.y > 0 ? viewFrame.bottom : viewFrame.top;
  const depthGripDistance = camera.showFrame === false ? depth * shortSide
    : Math.min(direction.x ? (edgeX - origin.x) / direction.x : Infinity,
      direction.y ? (edgeY - origin.y) / direction.y : Infinity);
  // --- 远边超出画布时，握把仍停在图内以便拉回 ---
  const margin = Math.min(8, shortSide / 2);
  const depthHandle = {
    x: clamp(origin.x + direction.x * depthGripDistance, margin, width - margin),
    y: clamp(origin.y + direction.y * depthGripDistance, margin, height - margin),
  };
  return { origin, left, right, edgeLength, depth, direction, viewFrame, depthHandle,
    target: directionPoint(camera, camera.heading, targetRadius, width, height), zoomSpan };
}

// --- 沿镜头中轴计算相对拖动量，握住外框边角时不跳动 ---
export function cameraGuideDepthAt(guide, start, point, width, height) {
  const { direction } = guide;
  const offset = ((point.x - start.x) * direction.x + (point.y - start.y) * direction.y) / Math.min(width, height);
  const { min, max } = CAMERA_GUIDE_DEPTH_LIMITS;
  return clamp(Math.round((guide.depth + offset) * 10000) / 10000, min, max);
}

function cameraFrameEdgeDistance(guide, point) {
  const { left, top, right, bottom } = guide.viewFrame;
  const { x, y } = guide.direction;
  const dx = Math.abs(x) >= .25 && point.y >= top && point.y <= bottom ? Math.abs(point.x - (x > 0 ? right : left)) : Infinity;
  const dy = Math.abs(y) >= .25 && point.x >= left && point.x <= right ? Math.abs(point.y - (y > 0 ? bottom : top)) : Infinity;
  return Math.min(dx, dy);
}

// --- 用屏幕像素命中最近的控件，绘制和交互共用手柄位置 ---
export function cameraToolAt(guide, point, radius, { resizeDepth = true, showFrame = true } = {}) {
  let tool = 'place', closest = radius;
  const handles = [['move', guide.origin], ['heading', guide.target], ['left', guide.left], ['right', guide.right]];
  if (resizeDepth) handles.push(['depth', guide.depthHandle]);
  for (const [name, handle] of handles) {
    const distance = Math.hypot(point.x - handle.x, point.y - handle.y);
    if (distance < closest) { tool = name; closest = distance; }
  }
  return resizeDepth && showFrame && cameraFrameEdgeDistance(guide, point) < Math.min(closest, radius * .6) ? 'depth' : tool;
}

/**
 * [INPUT]: 依赖归一化相机位置、顺时针朝向与原图宽高
 * [OUTPUT]: 提供图像坐标、等效焦距、视锥及可伸缩的中心手柄几何
 * [POS]: public 的无状态相机几何计算，供画布交互与离线合同测试复用
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const normalizeHeading = value => ((value % 360) + 360) % 360;
export const CAMERA_FOV_LIMITS = Object.freeze({ min: 35, max: 100 });
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
  const radians = heading * Math.PI / 180;
  return { x: camera.x * width + Math.sin(radians) * length, y: camera.y * height - Math.cos(radians) * length };
}
export function cameraGuide(camera, width, height, handleLength = Math.min(width, height) * .17) {
  const length = Math.min(width, height) * 0.38;
  const zoomSpan = Math.min(handleLength, length * .66);
  const fovSpan = CAMERA_FOV_LIMITS.max - CAMERA_FOV_LIMITS.min;
  const targetRadius = zoomSpan * (1 + (60 - camera.fov) / fovSpan);
  return { origin: { x: camera.x * width, y: camera.y * height },
    target: directionPoint(camera, camera.heading, targetRadius, width, height), zoomSpan,
    left: directionPoint(camera, camera.heading - camera.fov / 2, length, width, height),
    right: directionPoint(camera, camera.heading + camera.fov / 2, length, width, height) };
}

// --- 用屏幕像素命中最近的控件，绘制和交互共用手柄位置 ---
export function cameraToolAt(guide, point, radius) {
  let tool = 'place', closest = radius;
  for (const [name, handle] of [['move', guide.origin], ['heading', guide.target], ['left', guide.left], ['right', guide.right]]) {
    const distance = Math.hypot(point.x - handle.x, point.y - handle.y);
    if (distance < closest) { tool = name; closest = distance; }
  }
  return tool;
}

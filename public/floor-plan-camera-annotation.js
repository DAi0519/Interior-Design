/**
 * [INPUT]: 依赖相机投影几何、正向平面图尺寸和可选的墙线可见区多边形
 * [OUTPUT]: 提供共享的可伸缩视野三角、可选矩形外框和首墙填色，以及只在编辑画布上的深度握把，兼容旧Prompt的C字母机位
 * [POS]: public 的机位标注渲染，编辑手柄由画布控制器单独绘制
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { cameraGuide, cameraMarkerRadius, cameraViewFrame, directionPoint } from './floor-plan-camera-geometry.js?v=12';

const BLUE = '#2563eb';
const ANGLE_OPACITY = 0.7;
const FRAME_OPACITY = 0.56;
const FRAME_STROKE_SCALE = 1.5;
const VISIBLE_OPACITY = 0.14;
const LEGACY_SECTOR_RATIO = 0.25;
const xy = ({ x, y }) => `${x},${y}`;

// --- 统一图纸坐标、路径和视觉样式；开角边线只表示角度 ---
function cameraAnnotation(camera, width, height, visiblePolygon, { markCameraWithLetter = false } = {}) {
  const shortSide = Math.min(width, height);
  const origin = { x: camera.x * (width - 1), y: camera.y * (height - 1) };
  const guide = cameraGuide(camera, width - 1, height - 1);
  const defaultLength = Math.max(16, shortSide * LEGACY_SECTOR_RATIO);
  const legacyLength = camera.guideDepth == null ? defaultLength : guide.edgeLength;
  const point = (heading, distance) => directionPoint(camera, heading, distance, width - 1, height - 1);
  const halfFov = camera.fov / 2;
  const { left, right } = markCameraWithLetter ? {
    left: point(camera.heading - halfFov, legacyLength), right: point(camera.heading + halfFov, legacyLength),
  } : guide;
  const arrowLength = camera.guideDepth == null ? defaultLength : Math.min(defaultLength, guide.depth * (shortSide - 1) * .8 / .48);
  const target = point(camera.heading, arrowLength * .48);
  const headSize = arrowLength * (markCameraWithLetter ? 0.10 : 0.13);
  const arrowLeft = point(camera.heading - 155, headSize);
  const arrowRight = point(camera.heading + 155, headSize);
  const translate = (point, center) => `${center.x + point.x - origin.x},${center.y + point.y - origin.y}`;
  const stroke = Math.max(1, shortSide / 300);
  const radius = cameraMarkerRadius(width, height);
  let framePath = '';
  if (!markCameraWithLetter && camera.showFrame !== false) {
    // --- 外框沿图纸横竖对齐，按三角顶点计算边界，为机位圆点留边 ---
    const { left: minX, top: minY, right: maxX, bottom: maxY } = cameraViewFrame({ origin, left, right }, radius);
    framePath = `M${minX},${minY} L${maxX},${minY} L${maxX},${maxY} L${minX},${maxY} Z`;
  }
  const arrowStroke = stroke * (markCameraWithLetter ? 2 : 2.6);
  const planPoint = ({ x, y }) => `${x * (width - 1)},${y * (height - 1)}`;
  const visibilityPoints = visiblePolygon?.map(planPoint);
  const farEdge = markCameraWithLetter ? `A${legacyLength},${legacyLength} 0 0 1` : 'L';
  return { origin, radius, stroke, dash: [stroke * 5, stroke * 3], visibilityPoints, framePath, arrowStroke,
    sectorPath: `M${xy(origin)} L${xy(left)} ${farEdge} ${xy(right)} Z`,
    arrowPath: `M${xy(origin)} L${xy(target)} M${translate(arrowLeft, target)} L${xy(target)} L${translate(arrowRight, target)}` };
}

export function cameraAnnotationSvg(camera, width, height, visiblePolygon, { markCameraWithLetter = false } = {}) {
  const { origin, radius, stroke, dash, visibilityPoints, framePath, sectorPath, arrowPath, arrowStroke } =
    cameraAnnotation(camera, width, height, visiblePolygon, { markCameraWithLetter });
  const { x, y } = origin;
  const letter = markCameraWithLetter
    ? `<text x="${x}" y="${y}" font-family="sans-serif" font-size="${radius * 1.3}" text-anchor="middle" dominant-baseline="central" fill="white">C</text>`
    : '';
  const clipId = visibilityPoints && !markCameraWithLetter ? 'camera-view-triangle' : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    ${clipId ? `<defs><clipPath id="${clipId}"><path d="${sectorPath}"/></clipPath></defs>` : ''}
    ${visibilityPoints ? `<polygon points="${visibilityPoints.join(' ')}" fill="${BLUE}" fill-opacity="${VISIBLE_OPACITY}"${clipId ? ` clip-path="url(#${clipId})"` : ''}/>` : ''}
    ${framePath ? `<path d="${framePath}" fill="none" stroke="${BLUE}" stroke-opacity="${FRAME_OPACITY}" stroke-width="${stroke * FRAME_STROKE_SCALE}"/>` : ''}
    <path d="${sectorPath}" fill="none" stroke="${BLUE}" stroke-opacity="${ANGLE_OPACITY}" stroke-width="${stroke}" stroke-dasharray="${dash.join(' ')}"/>
    <path d="${arrowPath}" stroke="${BLUE}" stroke-width="${arrowStroke}" fill="none"${markCameraWithLetter ? '' : ' stroke-linecap="round" stroke-linejoin="round"'}/>
    <circle cx="${x}" cy="${y}" r="${radius}" fill="${BLUE}" stroke="white" stroke-width="${stroke}"/>
    ${letter}
  </svg>`;
}

export function drawCameraAnnotation(context, camera, width, height, visiblePolygon) {
  const { origin, radius, stroke, dash, visibilityPoints, framePath, sectorPath, arrowPath, arrowStroke } =
    cameraAnnotation(camera, width, height, visiblePolygon);
  const sector = new Path2D(sectorPath);
  context.save();
  context.fillStyle = BLUE;
  if (visibilityPoints) {
    context.save();
    context.clip(sector);
    context.globalAlpha = VISIBLE_OPACITY;
    context.fill(new Path2D(`M${visibilityPoints.join(' L')} Z`));
    context.restore();
  }
  context.strokeStyle = BLUE;
  if (framePath) {
    context.globalAlpha = FRAME_OPACITY;
    context.lineWidth = stroke * FRAME_STROKE_SCALE;
    context.setLineDash([]);
    context.stroke(new Path2D(framePath));
  }
  context.globalAlpha = ANGLE_OPACITY;
  context.lineWidth = stroke;
  context.setLineDash(dash);
  context.stroke(sector);
  context.globalAlpha = 1;
  context.lineWidth = arrowStroke;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.setLineDash([]);
  context.stroke(new Path2D(arrowPath));
  const dot = new Path2D();
  dot.arc(origin.x, origin.y, radius, 0, Math.PI * 2);
  context.fill(dot);
  context.strokeStyle = 'white';
  context.lineWidth = stroke;
  context.stroke(dot);
  context.restore();
}

export function drawCameraDepthHandle(context, guide, scale = 1) {
  const { x, y } = guide.depthHandle;
  context.save();
  context.translate(x, y);
  context.rotate(Math.atan2(guide.direction.y, guide.direction.x));
  context.fillStyle = 'white';
  context.strokeStyle = BLUE;
  context.lineWidth = 1.5 * scale;
  context.beginPath();
  context.roundRect(-4 * scale, -7 * scale, 8 * scale, 14 * scale, 2 * scale);
  context.fill();
  context.stroke();
  context.restore();
}

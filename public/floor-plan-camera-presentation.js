/**
 * [INPUT]: 依赖机位渲染状态与原生成资格校验
 * [OUTPUT]: 发布上传预览与会话状态，更新机位读数，并提供共用生成阻断原因
 * [POS]: public 的平面图机位呈现桥接，共用工作台和首页输入区的生成门槛
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { CAMERA_DEFAULT_FOV, CAMERA_FOV_LIMITS, equivalentFocalLengthMm } from './floor-plan-camera-geometry.js?v=12';

export function bindCameraInputs(get, state) {
  const updateFocalLength = () => {
    const fov = Number(get('fov').value);
    const { min, max } = CAMERA_FOV_LIMITS;
    get('focalLength').textContent = fov >= min && fov <= max
      ? `≈${equivalentFocalLengthMm(fov).toFixed(1)} mm` : '— mm';
  };
  const cameraAt = point => ({
    ...point,
    heading: state.config?.cameraDefaults?.heading ?? 0,
    fov: state.config?.cameraDefaults?.fov ?? CAMERA_DEFAULT_FOV,
  });
  return {
    updateFocalLength, cameraAt,
    cameraInputs() {
      const defaults = cameraAt({});
      get('heading').value = state.camera?.heading ?? defaults.heading;
      get('fov').value = state.camera?.fov ?? defaults.fov;
      updateFocalLength();
    },
  };
}

export function presentCameraSource(get, source) {
  const thumbnail = get('sourceThumbnail');
  if (source) thumbnail.src = source.dataUrl;
  else thumbnail.removeAttribute('src');
  thumbnail.hidden = get('removeSource').hidden = !source;
  if (source) get('uploadIcon').setAttribute('hidden', '');
  else get('uploadIcon').removeAttribute('hidden');
  get('sourceName').textContent = source?.name ?? '添加或拖入平面图';
  get('sourceHint').textContent = source ? '点击或拖入新图替换' : 'PNG / JPEG / WebP · 单张 8MB';
  get('sourceInput').setAttribute('aria-label', source ? '替换平面图' : '添加平面图');
}

export function showCameraVisibility(get, visible) {
  get('visibilityKey').hidden = !visible;
  const note = visible ? '三角内按墙线估算，请核对门窗' : '暂无法估算墙体遮挡';
  if (get('visibilityNote').textContent !== note) get('visibilityNote').textContent = note;
}

export function updateCameraPresentation(settings, state, {
  cameraValid, modeIssue, selectionIssue, directPromptMissing,
}) {
  let blocked = '';
  if (state.restoring) blocked = '正在恢复图片任务…';
  else if (state.uploading) blocked = '正在读取平面图…';
  else if (state.busy) blocked = '正在处理图片任务…';
  else if (state.pending) blocked = '任务状态待确认';
  else if (!state.source) blocked = '请上传平面图';
  else if (state.drag) blocked = '请完成当前机位调整';
  else if (state.cameraError) blocked = state.cameraError;
  else if (!cameraValid) blocked = '请在平面图上放置相机';
  else blocked = modeIssue || selectionIssue() || (directPromptMissing ? '请填写直出提示词' : '');

  const attributes = {
    'data-camera-source': state.source ? 'ready' : 'empty',
    'data-camera-canvas': state.source || state.pending || state.resultStatus ? 'ready' : 'empty',
    'data-camera-busy': String(state.busy),
    'data-camera-pending': String(Boolean(state.pending)),
    'data-camera-blocked': blocked,
  };
  for (const [name, value] of Object.entries(attributes)) {
    if (settings.getAttribute(name) !== value) settings.setAttribute(name, value);
  }
  return blocked;
}

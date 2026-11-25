/**
 * [INPUT]: 依赖机位渲染状态与原生成资格校验
 * [OUTPUT]: 向原参数节点发布会话状态，并提供同一份生成阻断原因
 * [POS]: public 的平面图机位呈现桥接，共用工作台和首页输入区的生成门槛
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

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

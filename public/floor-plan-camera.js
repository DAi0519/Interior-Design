/**
 * [INPUT]: 依赖共享api/文件/下拉与模型多选、相机几何与墙体可见区估算、单张机位图和批次任务合同、生成记录同步控制器
 * [OUTPUT]: 提供机位交互、模型多选与张数、冻结任务、逐模型分组结果及原任务GET恢复，按当前图片查看和重试飞书同步
 * [POS]: public 的平面图相机工作区控制器；编辑草稿与已生成机位独立，不自动重新收费
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { api, readFileAsInput, fillSelect } from './workbench-utils.js';
import { clamp, normalizeHeading, imagePoint, headingToPoint, cameraGuide, cameraToolAt,
  CAMERA_FOV_LIMITS, equivalentFocalLengthMm } from './floor-plan-camera-geometry.js?v=7';
import { FLOOR_PLAN_WALL_ANALYSIS_MAX_SIDE, detectFloorPlanWalls, cameraVisibility } from './floor-plan-camera-visibility.js?v=1';
import './custom-select.js?v=9';
import { bindModelMultiSelect } from './model-multi-select.js';
import { bindGenerationSync } from './generation-sync.js?v=1';

const $ = id => document.getElementById(id);
const SESSION = 'canvas-lab:floor-plan-camera:v1';
const API = '/api/floor-plan-camera';
const CAMERA_REFERENCE_ROLE = 'camera-annotated-plan';
const COMPLEXITY_LABELS = { low: '低', medium: '中', high: '高' };
const { min: FOV_MIN, max: FOV_MAX } = CAMERA_FOV_LIMITS;
const AIM_HANDLE_PX = 76;
const HANDLE_INTENT_THRESHOLD_PX = 5;
const complexityControls = new Map();
const state = { config: null, source: null, bitmap: null, walls: null, camera: null, drag: null, uploading: false,
  busy: false, restoring: false, cameraError: '', operationError: '', pending: null, result: null, resultIndex: null, resultStatus: '', jobId: null,
  models: null, imageCount: 1, agentModel: '', resolution: '2K', aspectRatio: '16:9', complexities: {}, view: 'source' };
const status = text => { $('status').textContent = text; };
const locked = () => state.busy || state.uploading || state.restoring || Boolean(state.pending);
const resultSync = bindGenerationSync({ api, container: $('resultSync'),
  status: $('resultSyncStatus'), link: $('resultSyncLink'), retry: $('resultSyncRetry') });
const modelPicker = bindModelMultiSelect({ container: $('model'),
  presentOption: model => ({ label: model.label, reason: model.available ? '' : '不可用',
    selectable: model.available || Boolean(state.models?.includes(model.key)) }),
  onChange: keys => {
    if (locked()) return;
    state.models = keys;
    const notice = renderModels({ resetUnsupported: true });
    remember(); update(); cameraStatus();
    if (notice && !selectionIssue()) status(notice);
  },
  onMessage: status });
function renderError() {
  $('error').textContent = [state.cameraError, state.operationError].filter(Boolean).join('；');
  $('error').hidden = !$('error').textContent;
}
function showError(error) { state.operationError = error.message || '操作未完成，请重试'; renderError(); }
function action(task) { return (...args) => { state.operationError = ''; renderError(); Promise.resolve().then(() => task(...args)).catch(showError); }; }
// --- 参数错误单独维护，修正参数不清除网络/任务错误 ---
function validateCameraInputs() {
  const errors = [];
  for (const [id, min, max, message] of [
    ['heading', 0, 359, '朝向请输入 0–359°'], ['fov', FOV_MIN, FOV_MAX, '水平视野请输入 35–100°'],
  ]) {
    const raw = $(id).value, value = Number(raw);
    const invalid = Boolean(state.source) && (raw === '' || !Number.isFinite(value) || value < min || value > max);
    $(id).setAttribute('aria-invalid', String(invalid));
    if (invalid) errors.push(message);
  }
  state.cameraError = errors.join('；'); renderError();
}
function cameraStatus() {
  status(state.cameraError ? '请修正相机参数' : state.operationError ? '相机参数已更新，请处理错误提示'
    : !state.config ? '正在读取生成配置'
    : !state.config.available ? '请检查生成配置'
    : !agentAvailable(selectedAgent()) ? '所选空间推理模型不可用，请重新选择'
    : selectionIssue() || (!state.source ? '上传平面图开始' : !state.camera ? '请在房间内点击放置相机' : '机位已设置，可以生成'));
}
function remember() {
  // --- 图片留在原任务中，只保存任务身份与普通设置 ---
  try { sessionStorage.setItem(SESSION, JSON.stringify({ pending: state.pending, jobId: state.jobId, models: state.models, imageCount: state.imageCount,
    agentModel: state.agentModel, resolution: state.resolution, aspectRatio: state.aspectRatio, complexities: state.complexities, requirements: $('requirements').value })); }
  catch { status('会话存储不可用，请及时下载图片'); }
}
function selectedModels() {
  return (state.models || []).map(key => state.config?.models?.find(model => model.key === key) || { key, label: key, available: false });
}
function selectedAgent() { return state.config?.agentModels?.find(model => model.key === state.agentModel); }
function agentAvailable(model) { return Boolean(model) && model.available !== false && model.selectable !== false; }
function supportsOutput(model, ratio, resolution) {
  return Boolean(model.sizes?.[ratio]?.[resolution]);
}
function supportsComplexity(model) {
  const value = complexityOf(model.key);
  return !value || Boolean(model.complexityOptions?.includes(value));
}
function complexityOf(key) { return Object.hasOwn(state.complexities, key) ? state.complexities[key] : ''; }
function batchTotal() { return (state.models?.length || 0) * state.imageCount; }
function selectionIssue() {
  const models = selectedModels();
  if (!models.length) return '请至少选择一个生图模型';
  if (models.some(model => !model.available)) return '有生图模型不可用，请调整选择';
  if (models.some(model => !supportsComplexity(model))) return '所选思考强度已不可用，请重新选择';
  if (models.some(model => !supportsOutput(model, state.aspectRatio, state.resolution))) return '请选择所有模型共同支持的画幅和分辨率';
  if (!state.config?.batch?.imageCounts?.includes(state.imageCount)) return '请选择每个模型的出图张数';
  if (batchTotal() > state.config.batch.maxImages) return `每批最多生成 ${state.config.batch.maxImages} 张`;
  return '';
}
function validCamera() {
  return state.camera && Number.isFinite(state.camera.heading) && state.camera.heading >= 0 && state.camera.heading < 360
    && Number.isFinite(state.camera.fov) && state.camera.fov >= FOV_MIN && state.camera.fov <= FOV_MAX;
}
function update() {
  validateCameraInputs();
  for (const id of ['upload','emptyUpload','sourceInput','agentModel','resolution','aspectRatio','requirements','imageCount']) $(id).disabled = locked();
  const editing = Boolean(state.drag);
  $('canvas').setAttribute('data-dragging', String(editing));
  $('cameraTools').hidden = !state.source || state.view !== 'source';
  $('placeCenter').disabled = locked() || editing || !state.source;
  for (const id of ['heading','fov']) $(id).disabled = locked() || editing || !state.camera;
  modelPicker.setDisabled(locked() || !state.config);
  $('agentModel').disabled ||= !state.config;
  $('imageCount').disabled ||= !state.config?.available;
  const total = batchTotal();
  const limit = state.config?.batch?.maxImages;
  $('batchTotal').textContent = total ? `${state.models.length} 个模型 × ${state.imageCount} 张，共 ${total} 张${total > limit ? `（每批最多 ${limit} 张）` : ''}` : '';
  $('generate').disabled = locked() || editing || !state.source || !validCamera() || Boolean(state.cameraError) || !state.config?.available || !agentAvailable(selectedAgent()) || Boolean(selectionIssue());
  $('generateLabel').textContent = state.busy ? '正在生成…' : state.pending ? '等待任务确认' : total > 1 ? `生成 ${total} 张室内效果图` : '生成室内效果图';
  for (const control of complexityControls.values()) control.disabled = locked();
  $('refresh').disabled = state.busy || state.uploading || state.restoring;
  $('refresh').textContent = state.pending ? '检查现有任务' : '刷新配置';
  $('showResult').disabled = !state.resultStatus; $('download').hidden = !state.result || state.view !== 'result';
  $('sourceView').hidden = !state.source || state.view !== 'source';
  $('empty').hidden = Boolean(state.source) || state.view === 'result';
  $('resultView').hidden = !state.resultStatus || state.view !== 'result';
  resultSync.show(state.view === 'result' ? state.result?.sync : null);
  const showVisibilityLegend = state.view === 'source' && validCamera();
  $('visibilityLegend').hidden = !showVisibilityLegend;
  $('canvas').setAttribute('aria-describedby', showVisibilityLegend ? 'drawingHint visibilityLegend' : 'drawingHint');
  $('showSource').setAttribute('aria-selected', String(state.view === 'source'));
  $('showResult').setAttribute('aria-selected', String(state.view === 'result'));
  $('drawingHint').textContent = state.view === 'result' ? '结果对应生成时的平面图和机位' : locked() ? '正在处理当前任务，机位已锁定'
    : !state.source ? '上传后，点击房间内放置相机' : !state.camera ? '点一下放置相机，按住拖动可同时定朝向'
    : '拖机身移动 · 圆点伸缩变焦，绕机身拖动转向';
}
function updateFocalLength() {
  const fov = Number($('fov').value);
  $('focalLength').textContent = fov >= FOV_MIN && fov <= FOV_MAX ? `≈${equivalentFocalLengthMm(fov).toFixed(1)} mm` : '— mm';
}
function cameraInputs() {
  $('heading').value = state.camera?.heading ?? state.config?.cameraDefaults?.heading ?? 0;
  $('fov').value = state.camera?.fov ?? state.config?.cameraDefaults?.fov ?? 60;
  updateFocalLength();
}
function cameraAt(point) {
  return { ...point, heading: state.config?.cameraDefaults?.heading ?? 0, fov: state.config?.cameraDefaults?.fov ?? 60 };
}
function analyzeWalls(bitmap) {
  const raster = document.createElement('canvas');
  const ratio = Math.min(1, FLOOR_PLAN_WALL_ANALYSIS_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  raster.width = Math.max(1, Math.round(bitmap.width * ratio));
  raster.height = Math.max(1, Math.round(bitmap.height * ratio));
  try {
    const context = raster.getContext('2d', { willReadFrequently: true });
    context.drawImage(bitmap, 0, 0, raster.width, raster.height);
    return detectFloorPlanWalls(context.getImageData(0, 0, raster.width, raster.height));
  } catch { return null; }
}
// --- 以实际图像比例计算朝向，保持宽图/长图相同角度语义 ---
function draw() {
  if (!state.bitmap) return;
  const canvas = $('canvas'), context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(state.bitmap, 0, 0, canvas.width, canvas.height);
  if (!validCamera()) return;
  const scale = canvas.width / Math.max(1, canvas.getBoundingClientRect().width);
  const guide = cameraGuide(state.camera, canvas.width, canvas.height, AIM_HANDLE_PX * scale);
  const visibility = state.walls && cameraVisibility(state.camera, state.walls);
  const visibilityNote = visibility ? '按识别到的墙线估算，请核对门窗处' : '暂无法估算可见区，仅显示镜头开角';
  $('visibilityKey').hidden = !visibility;
  if ($('visibilityNote').textContent !== visibilityNote) $('visibilityNote').textContent = visibilityNote;
  context.save(); context.strokeStyle = '#126d9a'; context.lineWidth = 2 * scale;
  if (visibility) {
    const [origin, ...boundary] = visibility;
    context.fillStyle = 'rgba(18, 109, 154, 0.23)';
    context.beginPath(); context.moveTo(origin.x * canvas.width, origin.y * canvas.height);
    for (const point of boundary) context.lineTo(point.x * canvas.width, point.y * canvas.height);
    context.closePath(); context.fill();
  }
  context.setLineDash([4 * scale, 4 * scale]);
  context.beginPath(); context.moveTo(guide.origin.x, guide.origin.y); context.lineTo(guide.left.x, guide.left.y); context.lineTo(guide.right.x, guide.right.y); context.closePath();
  context.stroke();
  context.beginPath(); context.moveTo(guide.origin.x, guide.origin.y); context.lineTo(guide.target.x, guide.target.y); context.stroke(); context.setLineDash([]);
  context.fillStyle = '#fff';
  context.beginPath(); context.arc(guide.target.x, guide.target.y, 6 * scale, 0, Math.PI * 2); context.fill(); context.stroke();
  for (const side of [guide.left, guide.right]) {
    context.save(); context.translate(side.x, side.y); context.rotate(Math.PI / 4);
    context.beginPath(); context.rect(-4 * scale, -4 * scale, 8 * scale, 8 * scale); context.fill(); context.stroke(); context.restore();
  }
  context.translate(guide.origin.x, guide.origin.y); context.rotate(state.camera.heading * Math.PI / 180);
  context.fillStyle = '#126d9a'; context.strokeStyle = '#fff'; context.lineWidth = 2 * scale;
  context.beginPath(); context.roundRect(-10 * scale, -7 * scale, 20 * scale, 16 * scale, 3 * scale); context.fill(); context.stroke();
  context.beginPath(); context.moveTo(-5 * scale, -7 * scale); context.lineTo(-5 * scale, -12 * scale); context.lineTo(5 * scale, -12 * scale); context.lineTo(5 * scale, -7 * scale); context.fill(); context.stroke(); context.restore();
}
async function selectSource(file) {
  if (!file || locked()) return;
  if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) throw new Error('请上传 8MB 以内的 PNG、JPEG 或 WebP 图片');
  state.uploading = true; update(); let bitmap;
  try {
    bitmap = await createImageBitmap(file);
    if (Math.max(bitmap.width, bitmap.height) > 4096 || bitmap.width * bitmap.height > 16777216) throw new Error('图片单边不超过 4096px，总像素不超过 16MP');
    const source = await readFileAsInput(file);
    const walls = analyzeWalls(bitmap);
    // --- 两项读取都成功后才切换来源，失败保留原图及原机位 ---
    state.bitmap?.close(); state.bitmap = bitmap; bitmap = null; state.source = source; state.walls = walls;
    state.camera = null; state.drag = null; state.view = 'source';
    $('sourceThumbnail').src = source.dataUrl; $('sourceThumbnail').hidden = false; $('uploadIcon').setAttribute('hidden', ''); $('sourceName').textContent = file.name;
    const ratio = Math.min(1, 1800 / Math.max(state.bitmap.width, state.bitmap.height));
    $('canvas').width = Math.round(state.bitmap.width * ratio); $('canvas').height = Math.round(state.bitmap.height * ratio);
    cameraInputs(); status('请在房间内点击放置相机');
  } finally { bitmap?.close(); state.uploading = false; update(); draw(); }
}
function renderModels({ resetUnsupported = false } = {}) {
  const models = [...(state.config?.models || [])];
  if (state.models === null) state.models = state.config?.defaultModel ? [state.config.defaultModel] : [];
  for (const model of selectedModels()) if (!models.some(option => option.key === model.key)) models.push(model);
  modelPicker.render(models, state.models);
  const notice = renderOutputOptions({ resetUnsupported });
  renderComplexityOptions();
  return notice;
}
// --- 推理模型单独选择；失权后保留选择并阻断，不隐式切换到其他Agent ---
function renderAgentModels() {
  const models = [...(state.config?.agentModels || [])];
  const selected = state.agentModel || state.config?.defaultAgentModel || '';
  if (selected && !models.some(model => model.key === selected)) models.push({ key: selected, label: selected, available: false });
  fillSelect($('agentModel'), models.map(model => ({ value: model.key, label: `${model.label}${agentAvailable(model) ? '' : '（不可用）'}` })), selected);
  for (const option of $('agentModel').options) option.disabled = !agentAvailable(models.find(model => model.key === option.value));
  state.agentModel = selected; $('agentModel').value = selected;
}
// --- 按模型记忆显式选择；能力刷新失效时保留并阻断，不悄悄改用默认 ---
function renderComplexityOptions() {
  const models = selectedModels().filter(model => model.complexityOptions?.length || complexityOf(model.key));
  complexityControls.clear();
  $('complexityField').replaceChildren(...models.map(model => {
    const label = document.createElement('label');
    label.className = 'plan-camera-field';
    const title = document.createElement('span');
    title.textContent = `${model.label} 思考强度`;
    const select = document.createElement('select');
    select.id = `complexity-${model.key}`;
    const values = model.complexityOptions || [], selected = complexityOf(model.key);
    const options = [{ value: '', label: '模型默认' }, ...values.map(value => ({ value, label: COMPLEXITY_LABELS[value] || value }))];
    if (selected && !values.includes(selected)) options.push({ value: selected, label: `${COMPLEXITY_LABELS[selected]}（不可用）` });
    fillSelect(select, options, selected);
    for (const option of select.options) option.disabled = Boolean(option.value) && !values.includes(option.value);
    select.value = selected;
    select.setAttribute('aria-invalid', String(!supportsComplexity(model)));
    select.addEventListener('change', () => {
      if (locked() || (select.value && !values.includes(select.value))) return;
      state.complexities[model.key] = select.value;
      select.setAttribute('aria-invalid', 'false');
      if (!select.value && !values.length) renderComplexityOptions();
      remember(); update(); cameraStatus();
    });
    complexityControls.set(model.key, select);
    label.append(title, select);
    return label;
  }));
  $('complexityField').hidden = !models.length;
}
// --- 只在用户切换模型/画幅时采用兼容默认档；配置刷新不静默改写历史选择 ---
function renderOutputOptions({ resetUnsupported = false } = {}) {
  const models = selectedModels(), changes = [];
  const commonResolutions = ratio => state.config.resolutions.filter(resolution => models.every(model => supportsOutput(model, ratio, resolution)));
  const ratios = state.config.aspectRatios.filter(ratio => commonResolutions(ratio).length);
  function render(id, values, preferred) {
    const previous = state[id];
    if (resetUnsupported && !values.includes(previous)) {
      state[id] = values.includes(preferred) ? preferred : values[0] || '';
      if (previous && state[id]) changes.push(`${previous} → ${state[id]}`);
    }
    const stale = state[id] && !values.includes(state[id]);
    const options = stale ? [...values, { value: state[id], label: `${state[id]}（不可用）` }] : values;
    fillSelect($(id), options, state[id]); $(id).value = state[id];
    for (const option of $(id).options) option.disabled = !values.includes(option.value);
  }
  render('aspectRatio', ratios, models[0]?.defaults?.aspectRatio || state.config.defaultAspectRatio || '16:9');
  render('resolution', commonResolutions(state.aspectRatio), models[0]?.defaults?.resolution || state.config.defaultResolution || '2K');
  return changes.length ? `已适配所选模型：${changes.join('，')}` : '';
}
function renderImageCounts() {
  const counts = Array.isArray(state.config.batch?.imageCounts) ? state.config.batch.imageCounts : [];
  const options = counts.map(value => ({ value: String(value), label: `${value} 张` }));
  if (counts.length && !counts.includes(state.imageCount)) options.push({ value: String(state.imageCount), label: `${state.imageCount} 张（不可用）` });
  fillSelect($('imageCount'), options, String(state.imageCount));
  for (const option of $('imageCount').options) option.disabled = !counts.includes(Number(option.value));
}
async function loadConfig() {
  let loaded = false;
  try {
    state.config = await api(`${API}/config?refresh=1`); loaded = true;
    if (state.config.featureMode !== 'floorPlanCamera' || state.config.workflowVersion !== '2026-11-07.floor-plan-camera.9'
      || state.config.pipeline !== 'camera-view-agent-to-image-reference' || state.config.prompt?.code !== 'floor-plan-camera-agent'
      || state.config.imageGeneration?.mode !== 'image-to-image' || state.config.imageGeneration?.referenceImageCount !== 1
      || state.config.imageGeneration?.referenceImageRole !== CAMERA_REFERENCE_ROLE
      || state.config.input?.referenceImageCount !== 1 || state.config.input?.referenceImageRole !== CAMERA_REFERENCE_ROLE || !state.config.prompt?.sha256
      || !Array.isArray(state.config.batch?.imageCounts) || state.config.batch.imageCounts.join(',') !== '1,2,3,4'
      || !Number.isSafeInteger(state.config.batch.maxImages) || state.config.batch.maxImages < 4) {
      state.config.available = false; state.config.reason = '本机服务尚未加载平面图相机，请重载服务后刷新配置';
    } else if (state.config.archive?.required !== true || state.config.archive.available !== true) {
      state.config.available = false;
      state.config.reason = state.config.archive?.reason || state.config.reason || '飞书生成记录归档未就绪，请刷新配置';
    }
    renderModels(); renderAgentModels(); renderImageCounts();
    if (!state.config.available) throw new Error(state.config.reason || '平面图相机当前不可用');
    if (!agentAvailable(selectedAgent())) throw new Error(selectedAgent()?.reason || '所选空间推理模型不可用，请重新选择');
    if (!state.pending) cameraStatus();
  } catch (error) { if (!loaded && state.config) state.config.available = false; throw error; } finally { update(); }
}
function hasResultImage(result) {
  return Boolean(result?.image?.url && result.image.width && result.image.height);
}
function showResultImage(result, index = null, batch = result) {
  state.result = result; state.resultIndex = index;
  $('resultImageDetails').hidden = !result;
  if (result) $('result').src = result.image.url;
  else $('result').removeAttribute('src');
  $('viewSummary').textContent = typeof batch?.viewSummary === 'string' ? batch.viewSummary : '';
  $('viewSummarySection').hidden = !$('viewSummary').textContent.trim();
  $('scenePrompt').textContent = typeof batch?.scenePrompt === 'string' ? batch.scenePrompt : '';
  $('scenePromptDetails').hidden = !$('scenePrompt').textContent.trim();
  $('scenePromptDetails').open = false;
  if (!result) { $('resultMeta').textContent = ''; return; }
  const camera = result.camera;
  const focalLength = result.actual?.fullFrameEquivalentFocalLengthMm;
  const visibility = result.actual?.visibilityMode;
  let generationLabel = null;
  if (result.actual?.generationMode === 'text-to-image') generationLabel = '文生图';
  else if (result.actual?.generationMode === 'image-to-image' && result.actual.referenceImageRole === CAMERA_REFERENCE_ROLE) generationLabel = '机位图参考';
  $('resultMeta').textContent = [result.source?.fileName || '平面图', `${result.image.width} × ${result.image.height}`, result.model?.label, result.agent?.label ? `空间推理：${result.agent.label}` : null,
    generationLabel,
    COMPLEXITY_LABELS[result.requestedComplexity] ? `生图思考强度：${COMPLEXITY_LABELS[result.requestedComplexity]}（已请求）` : null,
    camera ? `机位 ${Math.round(camera.x * 100)}%, ${Math.round(camera.y * 100)}% · 朝向 ${Math.round(camera.heading)}° · 视野 ${camera.fov}°` : '已生成机位',
    Number.isFinite(focalLength) && focalLength > 0 ? `等效 ${focalLength} mm` : null,
    visibility === 'estimated-wall-occlusion' ? '机位图含墙体遮挡估算' : visibility === 'angle-only' ? '机位图仅示镜头开角' : null].filter(Boolean).join(' · ');
}
function renderResultGroups(items, first, batch) {
  const groupNodes = new Map();
  let activeButton;
  for (const item of items) {
    const label = item.model?.label || '生图模型';
    const key = item.model?.key || label;
    if (!groupNodes.has(key)) {
      const group = document.createElement('section'), heading = document.createElement('h3'), slots = document.createElement('div');
      group.className = 'plan-camera-result-group';
      heading.textContent = label;
      slots.className = 'plan-camera-result-slots';
      group.append(heading, slots);
      groupNodes.set(key, { group, slots });
    }
    const success = item.status === 'success' && hasResultImage(item.result);
    const slot = document.createElement(success ? 'button' : 'div');
    const caption = document.createElement('span');
    slot.className = 'plan-camera-result-slot';
    caption.textContent = `第 ${item.index} 张${success ? '' : ' · 失败'}`;
    if (success) {
      const thumbnail = document.createElement('img');
      thumbnail.alt = ''; thumbnail.loading = 'lazy'; thumbnail.decoding = 'async'; thumbnail.src = item.result.image.url;
      slot.type = 'button'; slot.setAttribute('aria-label', `${label} 第 ${item.index} 张`);
      slot.setAttribute('aria-pressed', String(item === first));
      if (item === first) activeButton = slot;
      slot.append(thumbnail, caption);
      slot.addEventListener('click', () => {
        activeButton?.setAttribute('aria-pressed', 'false');
        slot.setAttribute('aria-pressed', 'true'); activeButton = slot;
        showResultImage(item.result, item.index, batch); update();
      });
    } else {
      const reason = document.createElement('small');
      reason.textContent = item.error || '未返回完整图片';
      slot.append(caption, reason);
    }
    groupNodes.get(key).slots.append(slot);
  }
  $('resultGroups').replaceChildren(...[...groupNodes.values()].map(({ group }) => group));
  $('resultGroups').hidden = !items.length;
}
function acceptResult(result, jobId) {
  const items = Array.isArray(result?.items) ? result.items : null;
  if (result?.action !== 'render' || (items ? !items.length : !hasResultImage(result))) throw new Error('原任务未返回完整结果，请保留任务编号检查');
  const successful = items?.filter(item => item.status === 'success' && hasResultImage(item.result));
  const first = successful?.[0];
  const failures = items ? items.length - successful.length : 0;
  renderResultGroups(items && (items.length > 1 || failures) ? items : [], first, result);
  showResultImage(items ? first?.result || null : result, first?.index, result);
  state.jobId = jobId; state.view = 'result';
  state.resultStatus = items
    ? `批次完成，成功 ${successful.length}/${items.length} 张${failures ? `，失败 ${failures} 张` : ''}`
    : '效果图已生成，请下载保存';
  status(state.resultStatus);
}
async function poll() {
  if (!state.pending || state.busy) return;
  state.busy = true; update();
  try {
    for (;;) {
      const { job } = await api(`${API}/jobs/${encodeURIComponent(state.pending)}`);
      if (job.status === 'success') { acceptResult(job.result, state.pending); state.pending = null; remember(); return; }
      if (job.status === 'failed') { state.pending = null; remember(); throw new Error(job.error || '生成失败，未自动重试'); }
      status(job.completed > 0 && job.total > 1 ? `已处理 ${job.completed}/${job.total} 张` : job.message || '正在生成室内效果图…');
      await new Promise(resolve => setTimeout(resolve, 1400));
    }
  } catch (error) {
    if (error.statusCode === 404) { state.pending = null; remember(); status('原任务已过期或服务已重启，未重新提交'); }
    else if (state.pending) status('任务状态尚未确认，请点击“检查现有任务”');
    throw error;
  } finally { state.busy = false; update(); }
}
async function generate() {
  if ($('generate').disabled) return;
  if (!state.resolution || !state.aspectRatio) throw new Error('请选择分辨率和画幅');
  state.pending = crypto.randomUUID(); state.busy = true; remember(); update(); status('正在提交图片任务…');
  try {
    await api(`${API}/jobs`, { method: 'POST', body: JSON.stringify({ jobId: state.pending, action: 'render', workflowVersion: state.config.workflowVersion, referenceImage: state.source,
      camera: { ...state.camera, height: state.config.cameraDefaults?.height ?? 1.5 }, agentModelKey: state.agentModel, resolution: state.resolution, aspectRatio: state.aspectRatio,
      modelSelections: state.models.map(key => {
        const complexity = complexityOf(key);
        return complexity ? { key, complexity } : { key };
      }),
      imageCount: state.imageCount,
      userRequirements: $('requirements').value, promptVersion: state.config.prompt.version, promptSha256: state.config.prompt.sha256 }) });
  } catch (error) {
    if ([400,401,403,404,409,413,415,422,429].includes(error.statusCode)) { state.pending = null; remember(); }
    status(state.pending ? '提交状态未知，请检查现有任务；不会重复提交' : '请求未接受，请检查输入或刷新配置'); throw error;
  } finally { state.busy = false; update(); }
  await poll();
}
// --- 图像交互只改本地草稿，不触发模型请求 ---
const canvas = $('canvas');
function toolAt(event, bounds) {
  if (!validCamera()) return 'place';
  const guide = cameraGuide(state.camera, bounds.width, bounds.height, AIM_HANDLE_PX);
  const point = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  return cameraToolAt(guide, point, event.pointerType === 'touch' ? 22 : 15);
}
function showTool(tool) {
  canvas.setAttribute('data-tool', tool === 'left' || tool === 'right' ? 'fov' : tool);
}
function cameraPointerRadius(camera, point, bounds) {
  return Math.hypot((point.x - camera.x) * bounds.width, (point.y - camera.y) * bounds.height);
}
canvas.addEventListener('pointerdown', event => {
  if (locked() || state.drag || !state.source || event.button !== 0) return;
  event.preventDefault(); canvas.focus({ preventScroll: true });
  const bounds = canvas.getBoundingClientRect(), point = imagePoint(event.clientX, event.clientY, bounds);
  const tool = toolAt(event, bounds);
  if (tool === 'place') state.camera = validCamera() ? { ...state.camera, ...point } : cameraAt(point);
  state.drag = { pointerId: event.pointerId, tool, start: point, camera: { ...state.camera },
    angle: headingToPoint(state.camera, point, bounds.width, bounds.height) };
  if (tool === 'heading') {
    const { zoomSpan } = cameraGuide(state.camera, bounds.width, bounds.height, AIM_HANDLE_PX);
    state.drag.zoomRadius = cameraPointerRadius(state.camera, point, bounds) / zoomSpan;
  }
  showTool(tool);
  canvas.setPointerCapture(event.pointerId); cameraInputs(); update(); draw(); cameraStatus();
});
canvas.addEventListener('pointermove', event => {
  if (locked() || !state.source) return;
  const bounds = canvas.getBoundingClientRect(), drag = state.drag;
  if (!drag) { showTool(toolAt(event, bounds)); return; }
  if (drag.pointerId !== event.pointerId) return;
  const point = imagePoint(event.clientX, event.clientY, bounds, false), camera = state.camera;
  if (drag.tool === 'move') {
    camera.x = clamp(drag.camera.x + point.x - drag.start.x, 0, 1);
    camera.y = clamp(drag.camera.y + point.y - drag.start.y, 0, 1);
  } else {
    const radius = cameraPointerRadius(camera, point, bounds);
    if (radius < 7) return;
    const angle = headingToPoint(camera, point, bounds.width, bounds.height);
    const change = normalizeHeading(angle - drag.angle + 180) - 180;
    if (drag.tool === 'place') camera.heading = normalizeHeading(Math.round(angle));
    else if (drag.tool === 'heading') {
      const { zoomSpan } = cameraGuide(camera, bounds.width, bounds.height, AIM_HANDLE_PX);
      const startRadius = drag.zoomRadius * zoomSpan;
      const radialDelta = radius - startRadius;
      // --- 先判断起手方向，避免短半径下横向转动顺带改变焦距 ---
      if (!drag.intent) {
        const radial = Math.abs(radialDelta);
        const tangent = Math.abs(change) * Math.PI / 180 * startRadius;
        if (Math.hypot(radial, tangent) < HANDLE_INTENT_THRESHOLD_PX) return;
        drag.intent = radial > 1.5 * tangent ? 'zoom' : tangent > 1.5 * radial ? 'rotate' : 'both';
      }
      if (drag.intent !== 'zoom') camera.heading = normalizeHeading(Math.round(drag.camera.heading + change));
      if (drag.intent !== 'rotate') {
        camera.fov = clamp(Math.round(drag.camera.fov - radialDelta / zoomSpan * (FOV_MAX - FOV_MIN)), FOV_MIN, FOV_MAX);
      }
    } else {
      const side = drag.tool === 'left' ? -1 : 1;
      camera.fov = clamp(Math.round(drag.camera.fov + side * change * 2), FOV_MIN, FOV_MAX);
    }
  }
  cameraInputs(); draw();
});
function endDrag(event) {
  if (state.drag?.pointerId !== event.pointerId) return;
  state.drag = null;
  showTool(toolAt(event, canvas.getBoundingClientRect()));
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  update();
}
for (const event of ['pointerup','pointercancel','lostpointercapture']) canvas.addEventListener(event, endDrag);
canvas.addEventListener('pointerleave', () => { if (!state.drag) showTool('place'); });
canvas.addEventListener('keydown', event => {
  if (locked() || state.drag || !validCamera()) return;
  const arrows = ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'];
  const fovKey = ['+','=','-'].includes(event.key);
  if (!fovKey && !arrows.includes(event.key)) return;
  event.preventDefault();
  if (fovKey) {
    state.camera.fov = clamp(state.camera.fov + (event.key === '-' ? -5 : 5), FOV_MIN, FOV_MAX);
  } else if (event.shiftKey) {
    state.camera.heading = normalizeHeading(state.camera.heading + (['ArrowLeft','ArrowUp'].includes(event.key) ? -5 : 5));
  } else {
    const distance = Math.min(canvas.width, canvas.height) * .01;
    if (event.key === 'ArrowLeft') state.camera.x = clamp(state.camera.x - distance / canvas.width, 0, 1);
    if (event.key === 'ArrowRight') state.camera.x = clamp(state.camera.x + distance / canvas.width, 0, 1);
    if (event.key === 'ArrowUp') state.camera.y = clamp(state.camera.y - distance / canvas.height, 0, 1);
    if (event.key === 'ArrowDown') state.camera.y = clamp(state.camera.y + distance / canvas.height, 0, 1);
  }
  cameraInputs(); draw();
});
$('placeCenter').addEventListener('click', () => {
  if (locked() || state.drag || !state.source) return;
  const point = { x: .5, y: .5 };
  state.camera = validCamera() ? { ...state.camera, ...point } : cameraAt(point);
  cameraInputs(); update(); draw(); canvas.focus({ preventScroll: true }); cameraStatus();
});
for (const id of ['heading','fov']) $(id).addEventListener('input', () => {
  if (locked() || state.drag || !state.camera) return;
  const value = $(id).value === '' ? NaN : Number($(id).value);
  state.camera[id] = value;
  if (id === 'fov') updateFocalLength();
  update(); draw(); cameraStatus();
});
for (const id of ['resolution','aspectRatio','imageCount']) $(id).addEventListener('change', () => {
  if (locked()) return;
  state[id] = id === 'imageCount' ? Number($(id).value) : $(id).value;
  const notice = id === 'aspectRatio' ? renderOutputOptions({ resetUnsupported: true }) : '';
  remember(); update(); cameraStatus(); if (notice && !selectionIssue()) status(notice);
});
$('agentModel').addEventListener('change', () => {
  if (locked()) return;
  const previousError = selectedAgent()?.reason || '所选空间推理模型不可用，请重新选择';
  state.agentModel = $('agentModel').value;
  if (agentAvailable(selectedAgent()) && state.operationError === previousError) { state.operationError = ''; renderError(); }
  remember(); update(); cameraStatus();
});
$('requirements').addEventListener('input', remember);
$('upload').addEventListener('click', () => $('sourceInput').click()); $('emptyUpload').addEventListener('click', () => $('sourceInput').click());
$('sourceInput').addEventListener('change', action(async () => { const file = $('sourceInput').files[0]; $('sourceInput').value = ''; await selectSource(file); }));
for (const target of [$('upload'), $('empty'), $('sourceView')]) {
  for (const type of ['dragenter','dragover']) target.addEventListener(type, event => { event.preventDefault(); if (!locked()) $('upload').classList.add('is-dragging'); });
  target.addEventListener('dragleave', () => $('upload').classList.remove('is-dragging'));
  target.addEventListener('drop', event => { event.preventDefault(); $('upload').classList.remove('is-dragging'); action(() => selectSource(event.dataTransfer.files[0]))(); });
}
$('showSource').addEventListener('click', () => { state.view = 'source'; update(); draw(); });
$('showResult').addEventListener('click', () => { if (!state.resultStatus) return; state.view = 'result'; update(); });
$('generate').addEventListener('click', action(generate));
$('refresh').addEventListener('click', action(() => state.pending ? poll() : loadConfig()));
$('download').addEventListener('click', () => {
  if (!state.result) return;
  const a = document.createElement('a');
  const model = (state.result.model?.label || '室内效果').replace(/[\\/:*?"<>|]/g, '-');
  a.href = state.result.image.url;
  a.download = state.resultIndex ? `平面图相机-${model}-${state.resultIndex}.png` : '平面图相机-室内效果.png';
  document.body.append(a); a.click(); a.remove();
});
$('result').addEventListener('error', () => { if (state.result) showError(new Error('结果图片读取失败，请检查现有任务；不会自动重新生成')); });
new ResizeObserver(draw).observe(canvas);
async function start() {
  let saved; try { saved = JSON.parse(sessionStorage.getItem(SESSION) || 'null'); } catch { /* 损坏草稿不恢复。 */ }
  if (saved && typeof saved === 'object') {
    for (const id of ['agentModel','resolution','aspectRatio']) if (typeof saved[id] === 'string') state[id] = saved[id];
    if (Array.isArray(saved.models)) state.models = [...new Set(saved.models.filter(key => typeof key === 'string' && key))];
    else if (typeof saved.model === 'string' && saved.model) state.models = [saved.model];
    if (Number.isSafeInteger(saved.imageCount) && saved.imageCount >= 1 && saved.imageCount <= 4) state.imageCount = saved.imageCount;
    if (saved.complexities && typeof saved.complexities === 'object' && !Array.isArray(saved.complexities)) {
      state.complexities = Object.fromEntries(Object.entries(saved.complexities).filter(([, value]) => typeof value === 'string' && (!value || Object.hasOwn(COMPLEXITY_LABELS, value))));
    }
    if (typeof saved.requirements === 'string') $('requirements').value = saved.requirements.slice(0, 4000);
    if (typeof saved.pending === 'string') state.pending = saved.pending;
    if (typeof saved.jobId === 'string') state.jobId = saved.jobId;
  }
  state.restoring = Boolean(state.pending || state.jobId); update();
  try { await loadConfig(); } catch (error) { showError(error); }
  if (state.jobId && state.jobId !== state.pending) {
    try { const { job } = await api(`${API}/jobs/${encodeURIComponent(state.jobId)}`); if (job.status === 'success') acceptResult(job.result, state.jobId); }
    catch (error) { status('历史图片未能恢复，请使用此前下载的图片'); showError(error); }
  }
  state.restoring = false; update();
  if (state.pending) await poll();
}
void action(start)();

/**
 * [INPUT]: 依赖共享api/文件读取/下拉、独立平面布局模型目录/API和浏览器会话任务身份
 * [OUTPUT]: 含GPT2.6 Sunburst/Flare独立模型身份； 提供上传→选择模型→布局结果，保留文字修改/室内/多角度，冻结实际选择与任务恢复
 * [POS]: public 的平面布局图片工作区，按需挂载独立家具编辑与几何3D；轮询只读，收费任务逐次明确点击
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { api, readFileAsInput, fillSelect } from './workbench-utils.js';
import './custom-select.js?v=9';

const $ = id => document.getElementById(`floorPlan${id}`);
const SESSION_KEY = 'canvas-lab:floor-plan:images:v2';
const CAMERA_NAMES = { 270: '左侧', 180: '反向', 90: '右侧' };
const state = { config: null, source: null, layout: null, interior: null, shots: [], selected: 0,
  view: 'layout', pending: null, busy: false, restoring: false, sourceChanged: false, modelKey: '', modelLabel: '' };
const status = text => { $('Status').textContent = text; };
function showError(error) { $('Error').textContent = error.message || '操作未完成，请重试'; $('Error').hidden = false; }
function clearError() { $('Error').hidden = true; $('Error').textContent = ''; }
function action(task) { return (...args) => { clearError(); Promise.resolve().then(() => task(...args)).catch(showError); }; }
function remember() {
  // --- 会话只保存任务身份；图片仍由原任务读取，不塞入localStorage ---
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ layout: state.layout?.jobId, interior: state.interior?.jobId,
      shots: state.shots.filter(shot => shot.action === 'camera').map(shot => ({ jobId: shot.jobId, name: shot.name })), pending: state.pending,
      requirements: $('Requirements').value, interiorRequirements: $('InteriorRequirements').value, layoutModel: state.modelKey }));
  } catch { status('会话存储不可用，请下载需要保留的图片'); }
}
function currentImage() { return state.view === 'layout' ? state.layout : state.shots[state.selected]; }
function selectedLayoutModel() { return state.config?.layoutModels?.find(model => model.key === state.modelKey); }
function continuationReady() { return state.config?.continuationAvailable === true; }
function renderModelNote() {
  const model = selectedLayoutModel();
  const defaults = model?.defaults;
  $('ModelNote').hidden = false;
  $('ModelNote').textContent = model?.available
    ? [defaults?.resolution ? `默认 ${defaults.resolution}` : '', defaults?.quality === 'medium' ? '标准质量' : ''].filter(Boolean).join(' · ')
    : model?.reason || (state.modelKey ? '当前模型已不可用，请重新选择' : state.config?.reason || '没有可用的布局模型');
  if (!$('ModelNote').textContent) $('ModelNote').hidden = true;
}
function renderModels() {
  const models = state.config?.layoutModels || [];
  const selected = state.modelKey || state.config?.defaultLayoutModel || '';
  const options = [...models];
  // --- 明确选择失权时保留禁用项，不偷偷换成另一收费模型 ---
  if (selected && !models.some(model => model.key === selected)) {
    options.push({ key: selected, label: state.modelLabel || selected, available: false });
  }
  fillSelect($('Model'), [{ value: '', label: '请选择生成模型' }, ...options.map(model => ({ value: model.key,
    label: `${model.label}${model.available ? '' : '（不可用）'}` }))], selected);
  for (const option of $('Model').options) option.disabled = !option.value || options.find(model => model.key === option.value)?.available !== true;
  state.modelKey = $('Model').value;
  state.modelLabel = options.find(model => model.key === state.modelKey)?.label || state.modelLabel;
  renderModelNote();
}
function updateActions() {
  const locked = state.busy || Boolean(state.pending) || state.restoring;
  $('Generate').disabled = locked || !state.source || !state.config?.available || selectedLayoutModel()?.available !== true;
  $('Adjust').disabled = locked || state.sourceChanged || !state.layout || !$('Adjustment').value.trim() || !continuationReady();
  $('RenderInterior').disabled = locked || state.sourceChanged || !state.layout || !$('InteriorRequirements').value.trim() || !continuationReady();
  $('Model').disabled = locked || !state.config;
  $('Upload').disabled = locked; $('SourceInput').disabled = locked;
  for (const id of ['Requirements', 'Adjustment', 'InteriorRequirements']) $(id).disabled = locked;
  $('TabInterior').disabled = !(state.layout || state.shots.length) || locked || state.sourceChanged;
  $('GoInterior').disabled = locked || state.sourceChanged;
  $('Download').disabled = !currentImage();
  for (const button of document.querySelectorAll('[data-camera]')) button.disabled = locked || state.sourceChanged || !state.interior || !continuationReady();
  $('Generate').textContent = state.busy && state.pending?.action === 'layout' ? '正在生成…' : '生成平面布局';
  $('Adjust').textContent = state.busy && state.pending?.action === 'adjust' ? '正在修改…' : '修改当前方案';
  $('RenderInterior').textContent = state.busy && state.pending?.action === 'interior' ? '正在生成…' : '生成室内预览';
  $('Refresh').textContent = state.pending ? '检查现有任务' : '刷新配置';
}
function setView(view) {
  if (view === 'interior' && !(state.layout || state.shots.length)) return;
  state.view = view;
  $('Layout').hidden = view !== 'layout'; $('Interior').hidden = view !== 'interior';
  $('TabLayout').setAttribute('aria-selected', String(view === 'layout'));
  $('TabInterior').setAttribute('aria-selected', String(view === 'interior'));
  updateActions();
}
function imageMeta(result) { return `${result.image.width} × ${result.image.height} · ${result.model?.label || 'AI生成'} · 下载保存图片`; }
function renderLayout() {
  const result = state.layout;
  $('LayoutImage').hidden = !result; $('Empty').hidden = Boolean(result);
  $('AdjustPanel').hidden = !result; $('GoInterior').hidden = !result; $('LayoutMeta').hidden = !result;
  if (result) { $('LayoutImage').src = result.image.url; $('LayoutMeta').textContent = imageMeta(result); }
  else $('LayoutImage').removeAttribute('src');
}
function renderShots() {
  $('CameraPanel').hidden = !state.shots.length;
  $('Shots').replaceChildren(...state.shots.map((shot, index) => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'floor-plan-shot';
    button.setAttribute('aria-pressed', String(index === state.selected));
    const img = document.createElement('img'); img.src = shot.image.url; img.alt = `${shot.name}室内预览`; const label = document.createElement('span'); label.textContent = shot.name;
    button.append(img, label); button.addEventListener('click', () => { state.selected = index; renderShots(); updateActions(); }); return button;
  }));
  const selected = state.shots[state.selected];
  $('InteriorImage').hidden = !selected; $('InteriorEmpty').hidden = Boolean(selected); $('InteriorMeta').hidden = !selected;
  if (selected) { $('InteriorImage').src = selected.image.url; $('InteriorMeta').textContent = `${selected.name} · ${imageMeta(selected)}`; }
  else $('InteriorImage').removeAttribute('src');
}
function inputImage(result) {
  const url = result.image.url;
  if (!/^data:image\/png;base64,/.test(url)) throw new Error('原任务图片无法继续使用，请重新生成或上传');
  return { dataUrl: url, name: `${result.action}.png`, type: 'image/png', size: atob(url.slice(url.indexOf(',') + 1)).length };
}
function acceptResult(result, pending) {
  if (!result?.image?.url || !result.image.width || !result.image.height || result.action !== pending.action) throw new Error('任务未返回完整图片，请保留任务编号检查结果');
  const entry = { ...result, jobId: pending.jobId };
  if (['layout', 'adjust'].includes(pending.action)) {
    state.layout = entry; state.interior = null; state.shots = []; state.selected = 0; state.sourceChanged = false;
    $('Adjustment').value = ''; renderLayout(); renderShots(); setView('layout');
    status(pending.action === 'adjust' ? '方案已修改，请对照原图核对结构与通行空间' : '平面方案已生成，可继续用文字调整');
  } else if (pending.action === 'interior') {
    state.interior = entry; state.shots = [{ ...entry, name: '原视角' }]; state.selected = 0; renderShots(); setView('interior');
    status('室内预览已生成，可选择其他角度逐张预览');
  } else {
    // --- 相同方向再次生成时替换缩略图，始终以首张室内图为参考 ---
    const old = state.shots.findIndex(shot => shot.name === pending.name);
    if (old >= 0) { state.shots[old] = { ...entry, name: pending.name }; state.selected = old; }
    else { state.shots.push({ ...entry, name: pending.name }); state.selected = state.shots.length - 1; }
    renderShots(); setView('interior'); status(`${pending.name}预览已生成，空间细节请与平面方案对照`);
  }
}
async function pollTask(pending) {
  state.busy = true; updateActions();
  try {
    for (;;) {
      const { job } = await api(`/api/floor-plan/jobs/${encodeURIComponent(pending.jobId)}`);
      if (job.status === 'success') {
        acceptResult(job.result, pending); state.pending = null; remember(); return;
      }
      if (job.status === 'failed') {
        state.pending = null; remember();
        throw new Error(`${job.error || '生成未完成'}。当前图片已保留，可修改要求后手动重试。`);
      }
      status(job.message || '图片生成中，请稍候…');
      await new Promise(resolve => setTimeout(resolve, 1400));
    }
  } catch (error) {
    if (error.statusCode === 404) {
      state.pending = null; remember(); status('原任务已过期或服务重启，未重新提交');
    } else if (state.pending) status('任务状态尚未确认，点击“检查现有任务”继续读取');
    throw error;
  } finally { state.busy = false; updateActions(); }
}
async function generate(kind, cameraAzimuth) {
  if (state.busy || state.pending) return;
  if (kind !== 'layout' && state.sourceChanged) throw new Error('原图已更换，请先为新原图生成平面方案');
  if (!state.config?.available) throw new Error('图片生成配置未就绪，请刷新配置');
  const layoutModel = selectedLayoutModel();
  if (kind === 'layout' && !layoutModel?.available) throw new Error(layoutModel?.reason || '请选择当前可用的生成模型');
  if (kind !== 'layout' && !continuationReady()) throw new Error(state.config.continuationReason || '后续预览模型当前不可用，请刷新配置');
  const source = kind === 'layout' ? state.source : inputImage(kind === 'camera' ? state.interior : state.layout);
  if (!source) throw new Error('请先上传户型图');
  const requirements = kind === 'layout' ? $('Requirements').value : kind === 'adjust' ? $('Adjustment').value
    : kind === 'interior' ? $('InteriorRequirements').value : '';
  if (kind !== 'layout' && kind !== 'camera' && !requirements.trim()) throw new Error('请填写本次要求');
  const modelKey = kind === 'layout' || state.config.models?.some(model => model.key === state.modelKey)
    ? state.modelKey : state.config.defaultModel || state.config.defaultModelKey;
  const pending = { jobId: crypto.randomUUID(), action: kind, modelKey, ...(kind === 'camera' ? { name: CAMERA_NAMES[cameraAzimuth] } : {}) };
  state.pending = pending; state.busy = true; remember(); updateActions();
  status('正在提交图片任务…');
  try {
    await api('/api/floor-plan/jobs', { method: 'POST', body: JSON.stringify({ jobId: pending.jobId, action: kind,
      referenceImage: source, userRequirements: requirements, modelKey,
      promptVersion: state.config.prompt.version, promptSha256: state.config.prompt.sha256,
      ...(kind === 'camera' ? { sourceAction: 'interior', cameraPose: { azimuth: cameraAzimuth, elevation: 0, distance: 50 } } : {}) }) });
  } catch (error) {
    if ([400, 401, 403, 404, 409, 413, 415, 422, 429].includes(error.statusCode)) { state.pending = null; remember(); }
    state.busy = false; updateActions();
    status(state.pending ? '提交状态尚未确认，请检查现有任务，不会重复提交' : '请求未被接受，请修正要求或刷新配置');
    throw error;
  }
  return pollTask(pending);
}
async function refreshConfig() {
  try {
    state.config = await api('/api/floor-plan/config?refresh=1');
    if (state.config.workflowVersion !== '2026-11-04.floor-plan.3') {
      state.config.available = false;
      state.config.reason = '本机服务尚未加载布局模型选择，请重载工作台后刷新';
      state.config.layoutModels = [];
      state.config.continuationAvailable = false;
    }
    renderModels();
    $('ConfigNote').textContent = state.config.available ? '每次生成一张图片' : state.config.reason || '连接未就绪';
  } catch (error) { state.config = null; renderModels(); $('ConfigNote').textContent = '配置读取失败'; throw error; }
  finally { updateActions(); }
}
async function selectSource(file) {
  if (!file || state.busy || state.pending) return;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) throw new Error('请上传8MB以内的PNG、JPEG或WebP户型图');
  const bitmap = await createImageBitmap(file); const { width, height } = bitmap; bitmap.close();
  if (width > 4096 || height > 4096 || width * height > 16777216) throw new Error('户型图需在4096px单边、16MP以内');
  state.source = await readFileAsInput(file);
  state.sourceChanged = Boolean(state.layout || state.interior || state.shots.length);
  $('SourcePreview').src = state.source.dataUrl; $('SourcePreview').hidden = false; $('UploadIcon').hidden = true;
  $('Upload').classList.add('has-source');
  $('SourceName').textContent = file.name; updateActions();
  if (state.sourceChanged) $('LayoutMeta').textContent = '当前为上一方案 · 请先为新原图生成布局';
  status(state.layout ? '新原图待生成；已暂停上一方案的调整与预览生成' : '已添加户型图，写下布局需求即可生成');
}
$('Upload').addEventListener('click', () => $('SourceInput').click());
$('SourceInput').addEventListener('change', action(async () => { const file = $('SourceInput').files[0]; $('SourceInput').value = ''; await selectSource(file); }));
for (const name of ['dragenter', 'dragover']) $('Upload').addEventListener(name, event => { event.preventDefault(); $('Upload').classList.add('is-dragging'); });
$('Upload').addEventListener('dragleave', () => $('Upload').classList.remove('is-dragging'));
$('Upload').addEventListener('drop', event => {
  event.preventDefault(); $('Upload').classList.remove('is-dragging');
  action(() => selectSource(event.dataTransfer.files[0]))();
});
$('Generate').addEventListener('click', action(() => generate('layout')));
$('Model').addEventListener('change', () => {
  state.modelKey = $('Model').value;
  state.modelLabel = selectedLayoutModel()?.label || state.modelLabel;
  renderModelNote(); remember(); updateActions();
});
$('Adjust').addEventListener('click', action(() => generate('adjust')));
$('RenderInterior').addEventListener('click', action(() => generate('interior')));
for (const button of document.querySelectorAll('[data-camera]')) button.addEventListener('click', action(() => generate('camera', Number(button.dataset.camera))));
for (const id of ['Adjustment', 'InteriorRequirements']) $(id).addEventListener('input', updateActions);
$('TabLayout').addEventListener('click', () => setView('layout'));
$('TabInterior').addEventListener('click', () => setView('interior'));
$('GoInterior').addEventListener('click', () => { setView('interior'); $('InteriorRequirements').focus(); });
for (const id of ['TabLayout', 'TabInterior']) $(id).addEventListener('keydown', event => {
  if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  const other = $(id === 'TabLayout' ? 'TabInterior' : 'TabLayout');
  if (!other.disabled) { event.preventDefault(); other.click(); other.focus(); }
});
$('Refresh').addEventListener('click', action(async () => { if (state.pending && !state.busy) await pollTask(state.pending); else if (!state.busy) await refreshConfig(); }));
$('Download').addEventListener('click', action(async () => {
  const current = currentImage(); if (!current) return;
  const raw = atob(current.image.url.split(',')[1]); const blob = new Blob([Uint8Array.from(raw, char => char.charCodeAt(0))], { type: 'image/png' });
  const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url;
  link.download = `平面布局-${current.name || (current.action === 'interior' ? '室内预览' : '平面方案')}.png`;
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  status('图片已下载，请保留原图核对布局');
}));
async function restore() {
  let saved;
  try { saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch { return; }
  if (!saved || typeof saved !== 'object') return;
  if (typeof saved.layoutModel === 'string') state.modelKey = saved.layoutModel;
  state.restoring = true; updateActions();
  const read = async id => {
    if (typeof id !== 'string' || !/^[\w-]{8,160}$/.test(id)) return null;
    try { const { job } = await api(`/api/floor-plan/jobs/${encodeURIComponent(id)}`); return job.status === 'success' && job.result?.image ? { ...job.result, jobId: id } : null; } catch { return null; }
  };
  try {
    $('Requirements').value = typeof saved.requirements === 'string' ? saved.requirements.slice(0, 4000) : '';
    $('InteriorRequirements').value = typeof saved.interiorRequirements === 'string' ? saved.interiorRequirements.slice(0, 4000) : '';
    state.layout = await read(saved.layout);
    state.interior = await read(saved.interior);
    state.shots = state.interior ? [{ ...state.interior, name: '原视角' }] : [];
    for (const shot of Array.isArray(saved.shots) ? saved.shots.slice(0, 3) : []) {
      const restored = await read(shot.jobId); if (restored && Object.values(CAMERA_NAMES).includes(shot.name)) state.shots.push({ ...restored, name: shot.name });
    }
    renderLayout(); renderShots();
    if (!state.layout && state.shots.length) setView('interior');
    if (state.layout || state.shots.length) status('已恢复本次会话图片，下载后可长期保留');
    if (saved.pending?.jobId && ['layout', 'adjust', 'interior', 'camera'].includes(saved.pending.action)) state.pending = saved.pending;
  } finally { state.restoring = false; updateActions(); }
  if (state.pending) await pollTask(state.pending);
}
updateActions();
void Promise.allSettled([refreshConfig(), restore()]).then(results => { for (const result of results) if (result.status === 'rejected') showError(result.reason); });

// --- 仅在用户进入家具编辑时加载几何引擎 ---
$('EditFurniture').addEventListener('click', action(async () => {
  const { openFurnitureEditor } = await import('./floor-plan-editor.js');
  const useLayout = state.layout && !state.sourceChanged;
  await openFurnitureEditor(useLayout ? inputImage(state.layout) : state.source,
    useLayout ? '当前平面方案' : '上传的户型图', $('Requirements').value);
}));

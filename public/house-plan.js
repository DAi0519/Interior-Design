/**
 * [INPUT]: 依赖共享API、文件与下拉、独立户型布局和归档状态接口、归一化标注画布
 * [OUTPUT]: 提供空间选择/标注、飞书版本选择、Agent到生图、原任务恢复、下载和飞书归档准入及状态
 * [POS]: public 的户型平面布局控制器，与实验室会话和收费任务隔离
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { api, readFileAsInput, fillSelect } from './workbench-utils.js';
import { bindGenerationSync } from './generation-sync.js?v=1';

// --- 缓存节点引用，嵌入时将参数和START交给主工作台原容器管理 ---
const nodes = new Map([...document.querySelectorAll('[id]')].map(node => [node.id, node]));
const $ = id => nodes.get(id);
const resultArchive = bindGenerationSync({ api, container: $('resultSync'), status: $('resultSyncStatus'),
  link: $('resultSyncLink'), retry: $('resultSyncRetry') });
let integrated = false;
if (window.parent !== window) {
  try {
    const parentDoc = window.parent.document;
    const settings = parentDoc.getElementById('housePlanSettingsMount');
    const actions = parentDoc.getElementById('housePlanActionsMount');
    if (settings && actions) {
      for (const path of ['/house-plan.css?v=4']) {
        if (!parentDoc.querySelector(`link[href="${path}"]`)) { const link = parentDoc.createElement('link'); link.rel = 'stylesheet'; link.href = path; parentDoc.head.append(link); }
      }
      settings.replaceChildren(document.querySelector('.house-plan-settings-scroll'));
      actions.replaceChildren(document.querySelector('.house-plan-actions'));
      document.querySelector('.house-plan-settings').remove();
      document.body.classList.add('house-plan-integrated');
      integrated = true;
    }
  } catch { /* 独立打开或不同源时保持完整页面。 */ }
}
void import('./custom-select.js?v=9');
const SESSION = 'canvas-lab:house-plan:v1';
const state = { config: null, source: null, bitmap: null, annotations: [], history: [], mode: '主卧', drag: null,
  busy: false, pending: null, result: null, jobId: null, model: 'gptImage25Sunburst', agent: '', promptVersion: null, view: 'source' };
const status = text => { $('status').textContent = text; };
function error(value) { $('error').textContent = value.message || '操作未完成'; $('error').hidden = false; }
function action(task) { return (...args) => { $('error').hidden = true; Promise.resolve().then(() => task(...args)).catch(error); }; }
function remember() {
  try { sessionStorage.setItem(SESSION, JSON.stringify({ pending: state.pending, jobId: state.jobId, model: state.model, agent: state.agent, promptVersion: state.promptVersion })); }
  catch { status('会话存储不可用，请及时下载图片'); }
}
function update() {
  const locked = state.busy || Boolean(state.pending);
  const archiveReady = state.config?.archive?.required === true && state.config.archive.available === true;
  for (const id of ['upload','sourceInput','spaceType','spaceName','requirements','model','agentModel','promptVersion']) $(id).disabled = locked;
  $('generate').disabled = locked || !state.source || !state.annotations.some(item => item.label === '主卧') || !state.config?.available || !archiveReady || !selectedPrompt()
    || !state.config.layoutModels.some(model => model.key === state.model && model.available)
    || !state.config.agentModels.some(model => model.key === state.agent);
  $('model').disabled ||= !state.config; $('agentModel').disabled ||= !state.config;
  $('showResult').disabled = !state.result; $('download').disabled = !state.result;
  $('refresh').disabled = state.busy; $('refreshLabel').textContent = state.pending ? '检查任务' : '刷新';
  $('generateLabel').textContent = state.busy ? '生成中…' : 'START';
  $('sourceView').hidden = state.view !== 'source' || !state.source;
  $('empty').hidden = Boolean(state.source) || state.view === 'result';
  $('resultView').hidden = state.view !== 'result' || !state.result;
  $('showSource').setAttribute('aria-pressed', String(state.view === 'source'));
  $('showResult').setAttribute('aria-pressed', String(state.view === 'result'));
  $('showSource').setAttribute('aria-selected', String(state.view === 'source'));
  $('showResult').setAttribute('aria-selected', String(state.view === 'result'));
  $('download').hidden = !state.result;
  $('drawingTools').hidden = state.view !== 'source';
  $('undo').disabled = locked || !state.history.length;
  $('clear').disabled = locked || !state.annotations.length;
  $('spaceType').disabled = locked || !state.source;
  $('spaceName').disabled = locked || !state.source;
  $('sourceCount').textContent = state.source ? '1 / 1' : '0 / 1';
  $('drawingHint').textContent = locked ? '正在处理当前户型，标注已锁定' : !state.source ? '上传原图后，拖动框选主卧' : state.mode ? `拖动框选${state.mode} · Esc 取消` : '先填写空间名称，再拖动框选';
  if (!locked && state.config?.available && !state.result) status(!state.source ? '上传户型图开始' : state.annotations.some(item => item.label === '主卧') ? `已标注 ${state.annotations.length} 个空间，可以开始生成` : '请先在画布上框选主卧');
  $('status').hidden = !locked;
  renderAnnotations();
}
function renderAnnotations() {
  $('annotations').replaceChildren(...state.annotations.map((item, index) => {
    const li = document.createElement('li'), label = document.createElement('span'), remove = document.createElement('button');
    label.textContent = item.label; remove.textContent = '×'; remove.type = 'button'; remove.disabled = state.busy || Boolean(state.pending);
    remove.setAttribute('aria-label', `删除${item.label}标注`);
    remove.addEventListener('click', () => { saveAnnotations(); state.annotations.splice(index, 1); update(); draw(); });
    li.append(label, remove); return li;
  }));
}
// --- 标注操作保留有限撤销历史，不改变已提交任务 ---
function saveAnnotations() { state.history.push(structuredClone(state.annotations)); if (state.history.length > 30) state.history.shift(); }
function rect(from, to) { return { x: Math.min(from.x, to.x), y: Math.min(from.y, to.y), width: Math.abs(to.x-from.x), height: Math.abs(to.y-from.y) }; }
function draw() {
  if (!state.bitmap) return;
  const canvas = $('canvas'), ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(state.bitmap, 0, 0, canvas.width, canvas.height);
  const boxes = [...state.annotations, ...(state.drag ? [{ label: state.mode, ...rect(state.drag.start, state.drag.end) }] : [])];
  const scale = canvas.width / Math.max(canvas.getBoundingClientRect().width, 1);
  for (const item of boxes) {
    const x = item.x * canvas.width, y = item.y * canvas.height, width = item.width * canvas.width, height = item.height * canvas.height;
    ctx.fillStyle = item.label === '主卧' ? '#ef7e2330' : '#3a769a25'; ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = item.label === '主卧' ? '#b94a00' : '#29607f'; ctx.lineWidth = 2 * scale; ctx.strokeRect(x, y, width, height);
    ctx.font = `${12 * scale}px sans-serif`; ctx.fillStyle = ctx.strokeStyle;
    const textWidth = ctx.measureText(item.label).width + 8 * scale;
    ctx.fillRect(x, y, textWidth, 20 * scale); ctx.fillStyle = '#fff'; ctx.fillText(item.label, x + 4 * scale, y + 14 * scale);
  }
}
function point(event) { const box = $('canvas').getBoundingClientRect(); return { x: Math.max(0,Math.min(1,(event.clientX-box.left)/box.width)), y: Math.max(0,Math.min(1,(event.clientY-box.top)/box.height)) }; }
$('canvas').addEventListener('pointerdown', event => {
  if (!state.bitmap || state.busy || state.pending || state.drag || event.button !== 0) return;
  if (!state.mode) { error(new Error('请填写空间名称')); return; }
  if (state.mode !== '主卧' && !state.annotations.some(item => item.label === '主卧')) { error(new Error('请先框选主卧')); return; }
  $('canvas').setPointerCapture(event.pointerId); state.drag = { id: event.pointerId, start: point(event), end: point(event) }; draw();
});
$('canvas').addEventListener('pointermove', event => { if (state.drag?.id === event.pointerId) { state.drag.end = point(event); draw(); } });
$('canvas').addEventListener('pointerup', event => {
  if (state.drag?.id !== event.pointerId) return;
  const box = rect(state.drag.start, point(event)); state.drag = null;
  if (box.width >= .005 && box.height >= .005) {
    saveAnnotations();
    if (state.mode === '主卧') state.annotations = [{ label: '主卧', ...box }, ...state.annotations.filter(item => item.label !== '主卧')];
    else if (state.annotations.length < 20) state.annotations.push({ label: state.mode, ...box });
    else error(new Error('最多标注20个空间'));
  }
  update(); draw();
});
for (const name of ['pointercancel', 'lostpointercapture']) $('canvas').addEventListener(name, () => { state.drag = null; draw(); });
$('canvas').addEventListener('keydown', event => { if (event.key === 'Escape') { state.drag = null; draw(); } });
window.addEventListener('resize', draw);
function selectedPrompt() { return state.config?.promptVersions?.find(item => item.version === state.promptVersion); }
async function loadConfig() {
  state.config = await api('/api/house-plan/config?refresh=1');
  if (state.config.workflowVersion !== '2026-11-06.house-plan.1') throw new Error('当前服务尚未加载户型平面布局，请打开新版工作台');
  if (!state.config.promptVersionSelection) throw new Error('当前服务未加载Prompt版本选择，请重载服务');
  if (state.config.archive?.required !== true) throw new Error('当前服务尚未接入飞书生成记录，请重载工作台');
  const models = state.config.layoutModels || [], agents = state.config.agentModels || [];
  if (!state.agent) state.agent = state.config.defaultAgentModel || '';
  const populate = (id, items, selected) => {
    const list = [...items]; if (selected && !list.some(item => item.key === selected)) list.push({ key: selected, label: `${selected}（不可用）`, available: false });
    fillSelect($(id), list.map(item => ({ value: item.key, label: `${item.label}${item.available === false ? '（不可用）' : ''}` })), selected);
    for (const option of $(id).options) option.disabled = list.find(item => item.key === option.value)?.available === false;
  };
  populate('model', models, state.model); populate('agentModel', agents, state.agent);
  const versions = state.config.promptVersions || [];
  if (state.promptVersion === null) state.promptVersion = state.config.prompt?.version ?? null;
  const versionOptions = versions.map(item => ({ value: String(item.version), label: `v${item.version} · ${item.name}` }));
  if (state.promptVersion !== null && !selectedPrompt()) versionOptions.push({ value: String(state.promptVersion), label: `v${state.promptVersion}（已下架或不可用）` });
  fillSelect($('promptVersion'), versionOptions, String(state.promptVersion ?? ''));
  for (const option of $('promptVersion').options) option.disabled = !versions.some(item => String(item.version) === option.value);
  $('promptAvailability').textContent = selectedPrompt() ? '已上架' : '不可用';
  $('promptLink').hidden = !state.config.prompt?.tableUrl;
  if (state.config.prompt?.tableUrl) $('promptLink').href = state.config.prompt.tableUrl;
  status(state.config.available ? '上传户型图并框选主卧，即可生成' : state.config.reason); update();
}
function showResult(result, id) {
  if (result?.featureMode !== 'housePlanLayout' || !result.image?.url) throw new Error('任务结果不完整，请检查原任务');
  state.result = result; state.jobId = id; state.view = 'result'; $('result').src = result.image.url;
  resultArchive.show(result.sync);
  $('resultMeta').textContent = `${result.image.width} × ${result.image.height} · ${result.model.label} · 请核对结构、家具比例与通行`;
  const lines = [result.plan.summary, ...result.plan.spaces.map(item => `${item.name}：${item.layout}`), ...result.plan.warnings.map(item => `待核实：${item}`)];
  $('plan').replaceChildren(...lines.map(text => { const p = document.createElement('p'); p.textContent = text; return p; }));
}
async function poll() {
  if (!state.pending || state.busy) return;
  state.busy = true; update();
  try {
    for (;;) {
      const { job } = await api(`/api/house-plan/jobs/${encodeURIComponent(state.pending)}`);
      if (job.status === 'success') { showResult(job.result, state.pending); state.pending = null; remember(); status('布局图已生成，请下载保存'); return; }
      if (job.status === 'failed') { state.pending = null; remember(); throw new Error(job.error || '生成失败，未自动重试'); }
      status(job.message || '正在生成…'); await new Promise(resolve => setTimeout(resolve, 1400));
    }
  } catch (error) {
    if (error.statusCode === 404) { state.pending = null; remember(); status('原任务已过期或服务已重启，未重新提交'); }
    else if (state.pending) status('任务状态尚未确认，请点击“检查现有任务”');
    throw error;
  } finally { state.busy = false; update(); }
}
async function generate() {
  if ($('generate').disabled) return;
  state.pending = crypto.randomUUID(); state.busy = true; remember(); update();
  try {
    await api('/api/house-plan/jobs', { method: 'POST', body: JSON.stringify({ jobId: state.pending, action: 'layout', referenceImage: state.source,
      annotations: state.annotations, userRequirements: $('requirements').value,
      modelKey: state.model, agentModelKey: state.agent, promptVersion: selectedPrompt().version, promptSha256: selectedPrompt().sha256 }) });
  } catch (error) {
    if ([400,401,403,404,409,413,415,422,429].includes(error.statusCode)) { state.pending = null; remember(); }
    status(state.pending ? '提交状态未知，请检查现有任务；不会重复提交' : '请求未接受，请检查输入或刷新配置'); throw error;
  } finally { state.busy = false; update(); }
  await poll();
}
$('upload').addEventListener('click', () => $('sourceInput').click());
async function selectSource(file) {
  if (!file || state.busy || state.pending) return;
  if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) throw new Error('请上传8MB以内PNG、JPEG或WebP');
  const bitmap = await createImageBitmap(file);
  if (Math.max(bitmap.width,bitmap.height) > 4096 || bitmap.width * bitmap.height > 16777216) { bitmap.close(); throw new Error('图片单边不超过4096px，总像素不超过16MP'); }
  const source = await readFileAsInput(file); state.bitmap?.close(); state.bitmap = bitmap; state.source = source;
  state.annotations = []; state.history = []; state.drag = null; state.mode = '主卧'; state.result = null; state.jobId = null; state.view = 'source';
  resultArchive.show(null);
  $('spaceType').value = '主卧'; $('spaceType').dispatchEvent(new Event('change'));
  $('sourceThumbnail').src = source.dataUrl; $('sourceThumbnail').hidden = false; $('uploadIcon').setAttribute('hidden', '');
  $('result').removeAttribute('src'); $('plan').replaceChildren(); $('sourceName').textContent = file.name;
  const ratio = Math.min(1, 1600 / Math.max(bitmap.width,bitmap.height)); $('canvas').width = Math.round(bitmap.width * ratio); $('canvas').height = Math.round(bitmap.height * ratio);
  remember(); update(); draw(); status('请在原图框选主卧');
}
$('sourceInput').addEventListener('change', action(async () => { const file = $('sourceInput').files[0]; $('sourceInput').value = ''; await selectSource(file); }));
// --- 上传与画布均接受拖入图片，复用同一准入和换图清理 ---
for (const target of [$('upload'), $('empty')]) {
  for (const type of ['dragenter','dragover']) target.addEventListener(type, event => { event.preventDefault(); $('upload').classList.add('is-dragging'); });
  target.addEventListener('dragleave', () => $('upload').classList.remove('is-dragging'));
  target.addEventListener('drop', event => { event.preventDefault(); $('upload').classList.remove('is-dragging'); action(() => selectSource(event.dataTransfer.files[0]))(); });
}
$('spaceType').addEventListener('change', () => {
  state.drag = null; const custom = $('spaceType').value === 'custom'; $('spaceName').hidden = !custom;
  state.mode = custom ? $('spaceName').value.trim() : $('spaceType').value;
  update(); draw(); if (custom) $('spaceName').focus();
});
$('spaceName').addEventListener('input', () => { state.mode = $('spaceName').value.trim(); update(); });
$('undo').addEventListener('click', () => { if (state.busy || state.pending || !state.history.length) return; state.annotations = state.history.pop(); state.drag = null; update(); draw(); });
$('clear').addEventListener('click', () => { if (state.busy || state.pending || !state.annotations.length) return; saveAnnotations(); state.annotations = []; state.drag = null; update(); draw(); });
$('requirements').addEventListener('input', update);
$('promptVersion').addEventListener('change', () => { state.promptVersion = Number($('promptVersion').value); $('promptAvailability').textContent = selectedPrompt() ? '已上架' : '不可用'; remember(); update(); });
for (const [id, key] of [['model','model'],['agentModel','agent']]) $(id).addEventListener('change', () => { state[key] = $(id).value; remember(); update(); });
$('showSource').addEventListener('click', () => { state.view = 'source'; update(); draw(); });
$('showResult').addEventListener('click', () => { state.view = 'result'; update(); });
$('generate').addEventListener('click', action(generate));
$('refresh').addEventListener('click', action(() => state.pending ? poll() : loadConfig()));
$('download').addEventListener('click', () => { if (!state.result) return; const a = document.createElement('a'); a.href = state.result.image.url; a.download = '户型平面布局.png'; document.body.append(a); a.click(); a.remove(); });
async function start() {
  let saved; try { saved = JSON.parse(sessionStorage.getItem(SESSION) || 'null'); } catch { /* 损坏草稿不恢复。 */ }
  if (saved && typeof saved === 'object') {
    if (Number.isSafeInteger(saved.promptVersion) && saved.promptVersion > 0) state.promptVersion = saved.promptVersion;
    if (typeof saved.model === 'string') state.model = saved.model;
    if (typeof saved.agent === 'string') state.agent = saved.agent;
    if (typeof saved.pending === 'string' && /^[\w-]{8,160}$/.test(saved.pending)) state.pending = saved.pending;
    if (typeof saved.jobId === 'string' && /^[\w-]{8,160}$/.test(saved.jobId)) {
      try { const { job } = await api(`/api/house-plan/jobs/${encodeURIComponent(saved.jobId)}`); if (job.status === 'success') showResult(job.result, saved.jobId); } catch { /* 原任务过期不创建新任务。 */ }
    }
  }
  update(); try { await loadConfig(); } catch (value) { error(value); }
  if (state.pending) await poll();
}
update(); action(start)();

/**
 * [INPUT]: 依赖图像工作区选择的底图、几何识别任务、原生编辑引擎与v1几何草稿
 * [OUTPUT]: 提供按需家具编辑、可选择模型的图像建模、同方案3D与本地保存导入导出
 * [POS]: 平面布局的可选几何工作区，独立于AI效果图会话
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { api, fillSelect } from './workbench-utils.js';
import { createFloorPlanEngine } from './floor-plan-engine.js';
import { createFloorPlanDraftStore, demoFloorPlanSpec, parseFloorPlanDraft, serializeFloorPlanDraft, FLOOR_PLAN_MAX_JSON_BYTES } from './floor-plan-state.js';

const el = name => document.getElementById('geometry' + name);
const store = createFloorPlanDraftStore(localStorage);
const jobKey = 'canvas-lab:geometry:pending:v1';
let engine, configuration, input, sourceLabel, requirements, working = false;
let pending = sessionStorage.getItem(jobKey), initialized = false, draft = null;
const status = text => { el('Status').textContent = text; };
function controls() {
  const locked = working || Boolean(pending);
  for (const id of ['2d', '3d', 'Save', 'Export', 'Import', 'Demo']) el(id).disabled = locked || !initialized;
  el('Model').disabled = locked || !configuration?.models.length;
  el('Recognize').disabled = working || (!pending && (!initialized || !input || !configuration?.models.some(m => m.key === el('Model').value)));
  el('Recognize').textContent = pending ? '查询原识图任务' : '识别当前图并建模';
}
function viewButtons(view) {
  el('2d').setAttribute('aria-pressed', String(view === '2d'));
  el('3d').setAttribute('aria-pressed', String(view === '3d'));
}
async function snapshot() {
  return { kind: 'canvas-lab-floor-plan', version: 1, cameras: [], ...draft,
    plan: await engine.getPlan(), savedAt: new Date().toISOString() };
}
async function save() {
  store.write(await snapshot());
  status('家具与户型已保存在本机');
}
async function run(task) {
  if (working) return;
  working = true; controls();
  try { await task(); } catch (error) { status(error.message); }
  finally { working = false; controls(); }
}
function remember(id) {
  pending = id;
  if (id) sessionStorage.setItem(jobKey, id); else sessionStorage.removeItem(jobKey);
}
async function poll() {
  for (;;) {
    let job;
    try { ({ job } = await api('/api/floor-plan/jobs/' + encodeURIComponent(pending))); }
    catch (error) { if (error.statusCode === 404) remember(null); throw error; }
    if (job.status === 'failed') { remember(null); throw new Error(job.error); }
    if (job.status === 'success') {
      const { spec, model, warnings, source } = job.result;
      if (!spec) throw new Error('原任务没有可编辑方案');
      await engine.loadSpec(spec);
      draft = { source, recognition: { model, jobId: pending }, warnings, isDemo: false, cameras: [] };
      await save(); remember(null); viewButtons('2d');
      status(model.label + ' 已生成可编辑户型。' + warnings.join(' '));
      return;
    }
    status(job.message || '正在识图建模…');
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
}
async function recognize() {
  if (pending) return poll();
  if (!input || !configuration) return;
  if (draft && !window.confirm('将用当前图片重新建模。请先保存需要保留的方案。继续？')) return;
  const id = crypto.randomUUID();
  remember(id);
  try {
    await api('/api/floor-plan/jobs', { method: 'POST', body: JSON.stringify({ jobId: id, action: 'geometry',
      referenceImage: input, userRequirements: requirements, modelKey: el('Model').value,
      promptVersion: configuration.prompt.version, promptSha256: configuration.prompt.sha256 }) });
  } catch (error) {
    if ([400,401,403,404,409,413,415,422,429].includes(error.statusCode)) remember(null);
    throw error;
  }
  return poll();
}
function bind() {
  el('Close').onclick = () => el('Dialog').close();
  el('Recognize').onclick = () => run(recognize);
  el('Model').onchange = controls;
  for (const view of ['2d', '3d']) el(view).onclick = () => run(async () => {
    await engine.setView(view); viewButtons(view);
  });
  el('Save').onclick = () => run(save);
  el('Demo').onclick = () => run(async () => {
    if (draft && !window.confirm('载入示例将替换当前编辑内容。继续？')) return;
    await engine.loadSpec(demoFloorPlanSpec()); draft = { isDemo: true, cameras: [] }; viewButtons('2d');
    status('演示方案 · 选中家具可拖动或调整尺寸，点击“查看 3D”预览');
  });
  el('Import').onclick = () => el('File').click();
  el('File').onchange = () => run(async () => {
    const file = el('File').files[0]; el('File').value = ''; if (!file) return;
    if (file.size > FLOOR_PLAN_MAX_JSON_BYTES) throw new Error('方案文件超过4MB');
    const next = parseFloorPlanDraft(await file.text());
    if (draft && !window.confirm('用导入的方案替换当前编辑内容？')) return;
    await engine.loadPlan(next.plan); draft = next; await engine.setView('2d'); viewButtons('2d'); status('已导入方案');
  });
  el('Export').onclick = () => run(async () => {
    const blob = new Blob([serializeFloorPlanDraft(await snapshot())], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = '家具布局.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  });
}
export async function openFurnitureEditor(image, label, text) {
  input = image; sourceLabel = label; requirements = text || '';
  el('Dialog').showModal();
  if (working) return;
  await run(async () => {
    if (!engine) {
      bind();
      engine = createFloorPlanEngine(el('Frame'), { onSave: () => run(save), onError: error => status(error.message),
        onChange: () => { if (!working) { draft ||= { cameras: [] }; status('家具布局已修改，点击保存方案'); } } });
    }
    if (!initialized) {
      await engine.ready(); initialized = true;
      draft = store.read();
      if (draft) await engine.loadPlan(draft.plan);
    }
    if (pending) return poll();
    status((draft?.isDemo ? '演示方案。' : '') + (input ? '已选用' + sourceLabel + '，识图建模会调用所选模型。' : '可打开旧方案或体验示例；上传户型图后可识图建模。'));
    const previous = el('Model').value;
    configuration = null;
    configuration = await api('/api/floor-plan/geometry-config');
    fillSelect(el('Model'), configuration.models.map(m => ({ value: m.key, label: m.label })),
      previous || configuration.defaultModel);
    if (previous && !configuration.models.some(m => m.key === previous)) el('Model').value = '';
    if (!configuration.models.length) status('当前 OneAPI Key 没有可用识图模型，可继续使用本地方案');
  });
}

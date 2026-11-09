/**
 * [INPUT]: 依赖house-plan-annotation共享标注绘制、共享api/下拉、主布局配置、Beta样本ID/轻量预览及Run ID工具
 * [OUTPUT]: 提供共享下拉空间类型/自定义名称与紧凑分组工具栏；提供逐样本主卧/空间框选、独立草稿、Prompt版本/Agent选择及样本×模型批次
 * [POS]: public 的Beta户型布局配置控制器，复用原Beta面板与样本库，不持有图片正文
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { drawHousePlanAnnotation } from './house-plan-annotation.js?v=1';
import { api } from './workbench-utils.js';
import { createBetaRunId } from './beta-run-id.js?v=2';
const STORAGE = 'canvas-lab:beta-house-plan:v1';
export function createBetaHousePlanConfiguration({ getState, sampleLibrary, fillSelect, onChange, onError }) {
  const $ = id => document.getElementById(id);
  let config = null, draft = {}, loading = false;
  try { draft = JSON.parse(localStorage.getItem(STORAGE) || '{}') || {}; } catch { /* 不可读草稿按空处理。 */ }
  draft.annotations ||= {};
  const active = () => getState().featureMode === 'housePlanLayout';
  const save = () => { try { localStorage.setItem(STORAGE, JSON.stringify(draft)); } catch { onError(new Error('布局标注无法保存到本机，请保持当前页面')); } };
  const selectedPrompt = () => config?.promptVersions?.find(item => item.version === draft.version);
  function render() {
    $('housePlanFields').classList.toggle('hidden', !active());
    if (!active()) return;
    $('housePlanStatus').textContent = loading ? '读取中' : selectedPrompt() ? '已上架' : '不可用';
    $('housePlanRefresh').disabled = loading;
    const versions = (config?.promptVersions || []).map(item => ({ value: item.version, label: `v${item.version} · ${item.name}` }));
    if (draft.version && !selectedPrompt()) versions.push({ value: draft.version, label: `v${draft.version}（已下架或不可用）` });
    fillSelect($('housePlanVersion'), versions, draft.version);
    for (const option of $('housePlanVersion').options) option.disabled = !config?.promptVersions?.some(item => String(item.version) === option.value);
    const agents = (config?.agentModels || []).map(item => ({ value: item.key, label: item.label }));
    if (draft.agent && !agents.some(item => item.value === draft.agent)) agents.push({ value: draft.agent, label: `${draft.agent}（不可用）` });
    fillSelect($('housePlanAgent'), agents, draft.agent);
    $('housePlanPromptLink').hidden = !config?.prompt?.tableUrl;
    if (config?.prompt?.tableUrl) $('housePlanPromptLink').href = config.prompt.tableUrl;
    decorateSamples();
  }
  async function refresh() {
    loading = true; render(); onChange();
    try {
      config = await api('/api/house-plan/config?refresh=1');
      draft.version ??= config.prompt?.version;
      draft.agent ||= config.defaultAgentModel;
      save();
    } catch (error) { config = null; onError(error); }
    finally { loading = false; render(); onChange(); }
  }
  function reason() {
    if (!active()) return null;
    if (!config?.available) return config?.reason || '请刷新户型布局配置';
    if (!selectedPrompt()) return '所选布局Prompt已下架或不可用，请重新选择';
    if (!config.agentModels.some(model => model.key === draft.agent)) return '请选择可用布局分析模型';
    if (sampleLibrary.sourceImages().some(image => !draft.annotations[image.sampleId]?.some(item => item.label === '主卧'))) return '请为每张户型框选主卧';
    return null;
  }
  function decorateSamples() {
    if (!active()) return;
    [...$('sampleList').children].forEach((item, index) => {
      const source = sampleLibrary.sourceImages()[index]; if (!source) return;
      let button = item.querySelector('[data-house-plan-annotation]');
      if (!button) { button = document.createElement('button'); button.type = 'button'; button.className = 'quiet-button'; button.dataset.housePlanAnnotation = source.sampleId; item.append(button);
        button.addEventListener('click', () => openAnnotations(source).catch(onError)); }
      button.textContent = draft.annotations[source.sampleId]?.length ? `编辑空间标注 · ${draft.annotations[source.sampleId].length} 个` : '框选主卧';
      button.disabled = sampleLibrary.isBusy() || getState().submitting || getState().job?.status === 'running';
    });
  }
  // --- 标注始终绑定样本ID，图片仅按需读取预览，不改变样本原件。 ---
  async function openAnnotations(source) {
    const dialog = $('housePlanAnnotationDialog'), canvas = $('housePlanAnnotationCanvas'), context = canvas.getContext('2d');
    const bitmap = new Image(); bitmap.src = source.previewUrl || source.dataUrl;
    await bitmap.decode();
    let annotations = structuredClone(draft.annotations[source.sampleId] || []), drag = null;
    const history = [];
    canvas.width = bitmap.naturalWidth; canvas.height = bitmap.naturalHeight;
    $('housePlanAnnotationTitle').textContent = source.name || '空间标注';
    $('housePlanSpace').value = annotations.length ? '次卧' : '主卧';
    $('housePlanCustomSpace').value = '';
    const syncSpace = () => {
      const custom = $('housePlanSpace').value === 'custom';
      $('housePlanCustomSpace').hidden = !custom;
      if (custom) $('housePlanCustomSpace').focus();
    };
    $('housePlanSpace').onchange = syncSpace;
    $('housePlanSpace').dispatchEvent(new Event('change', { bubbles: true }));
    const point = event => { const b = canvas.getBoundingClientRect(); return { x: Math.max(0, Math.min(1, (event.clientX-b.left)/b.width)), y: Math.max(0, Math.min(1, (event.clientY-b.top)/b.height)) }; };
    const rect = (a,b) => ({ x: Math.min(a.x,b.x), y: Math.min(a.y,b.y), width: Math.abs(a.x-b.x), height: Math.abs(a.y-b.y) });
    function draw() {
      context.clearRect(0,0,canvas.width,canvas.height); context.drawImage(bitmap,0,0);
      const scale = canvas.width / Math.max(1,canvas.getBoundingClientRect().width);
      for (const box of [...annotations,...(drag ? [{ ...rect(drag.start,drag.end), label: drag.label }] : [])]) {
        drawHousePlanAnnotation(context, box, canvas, scale);
      }
      $('housePlanAnnotationUndo').disabled = !history.length;
      $('housePlanAnnotationClear').disabled = !annotations.length;
      $('housePlanAnnotationSave').disabled = !annotations.some(box => box.label === '主卧');
      $('housePlanAnnotationHint').textContent = annotations.length ? `已标注 ${annotations.map(box => box.label).join('、')}` : '先拖动框选主卧，可继续标注其他空间';
    }
    canvas.onpointerdown = event => { if (event.button !== 0 || drag) return; const label = !annotations.length ? '主卧' : ($('housePlanSpace').value === 'custom' ? $('housePlanCustomSpace').value.trim() : $('housePlanSpace').value);
      if (!label) return; canvas.setPointerCapture(event.pointerId); drag = { id: event.pointerId, start: point(event), end: point(event), label }; draw(); };
    canvas.onpointermove = event => { if (drag?.id === event.pointerId) { drag.end = point(event); draw(); } };
    canvas.onpointerup = event => {
      if (drag?.id !== event.pointerId) return;
      const box = { ...rect(drag.start,point(event)), label: drag.label }; drag = null;
      if (box.width >= .005 && box.height >= .005 && (annotations.length < 20 || box.label === '主卧')) {
        history.push(structuredClone(annotations)); if (history.length > 30) history.shift();
        annotations = box.label === '主卧' ? [box,...annotations.filter(item => item.label !== '主卧')] : [...annotations,box];
      }
      draw();
    };
    canvas.onpointercancel = canvas.onlostpointercapture = () => { drag = null; draw(); };
    $('housePlanAnnotationUndo').onclick = () => { if (history.length) annotations = history.pop(); draw(); };
    $('housePlanAnnotationClear').onclick = () => { history.push(structuredClone(annotations)); annotations = []; draw(); };
    $('housePlanAnnotationSave').onclick = () => { draft.annotations[source.sampleId] = annotations; save(); dialog.close(); decorateSamples(); onChange(); };
    $('housePlanAnnotationCancel').onclick = () => dialog.close();
    dialog.showModal(); draw();
  }
  $('housePlanRefresh').addEventListener('click', refresh);
  $('housePlanVersion').addEventListener('change', event => { draft.version = Number(event.target.value); save(); render(); onChange(); });
  $('housePlanAgent').addEventListener('change', event => { draft.agent = event.target.value; save(); onChange(); });
  return {
    render, refresh, decorateSamples, reason, configured: () => Boolean(config),
    selectable: model => !active() || Boolean(config?.layoutModels?.some(item => item.key === model.key && item.available)),
    buildItems(cases, models, startedAt) {
      const issue = reason(); if (issue) throw new Error(issue);
      if (!cases.length || !models.length) throw new Error('请选择户型样本和出图模型');
      return cases.flatMap((sample, i) => models.map((model,j) => ({ attempt: 1, caseId: sample.caseId, sampleId: sample.caseId,
        label: `${sample.label} · ${model.label}`, modelLabel: model.label,
        runId: createBetaRunId({ modelKey: model.key, sequence: i*models.length+j+1, startedAt }),
        input: { featureMode: 'housePlanLayout', modelKey: model.key, prompt: sample.prompt, referenceImages: [],
          promptAgentModelKey: draft.agent, promptVersion: draft.version, housePlanPromptSha256: selectedPrompt().sha256,
          housePlanWorkflowVersion: config.workflowVersion, annotations: structuredClone(draft.annotations[sample.caseId]), outputFormat: 'png' } })));
    },
  };
}

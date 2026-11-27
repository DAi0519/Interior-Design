/**
 * [INPUT]: 依赖 Beta 样本 ID、工作台机位配置与正向底图/墙线分析、共享画布几何/标注及本机存储
 * [OUTPUT]: 提供同位刷新、忙碌和配置错误反馈；提供高清底图上的逐样本机位标注、可选取景框与视野深度拖动、空间推理或整批原词直出、输出档位和样本×模型×张数 Run
 * [POS]: public 的 Beta 平面图机位适配器，标注共用主工作台，运行交给 Beta 批次与飞书同步
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createBetaRunId } from './beta-run-id.js?v=2';
import { CAMERA_FOV_LIMITS, CAMERA_GUIDE_DEPTH_LIMITS, cameraGuide, cameraGuideDepthAt,
  cameraToolAt, clamp, headingToPoint, imagePoint } from './floor-plan-camera-geometry.js?v=12';
import { drawCameraAnnotation, drawCameraDepthHandle } from './floor-plan-camera-annotation.js?v=14';
import { cameraVisibility } from './floor-plan-camera-visibility.js?v=3';
import { api, readFileAsInput } from './workbench-utils.js';

const FEATURE = 'floorPlanCamera';
const STORAGE_KEY = 'canvas-lab:beta-floor-plan-camera:v1';
const DIRECT_PROMPT_LIMIT = 4000;
const $ = id => document.getElementById(id);
const options = values => values.map(value => ({ value, label: String(value) }));

function readDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (draft && typeof draft === 'object') return draft;
  } catch { /* 恢复失败时使用空草稿。 */ }
  return {};
}

function validPose(camera, { min, max } = CAMERA_FOV_LIMITS) {
  const depth = camera?.guideDepth;
  return Boolean(camera && [camera.x, camera.y, camera.heading, camera.fov].every(Number.isFinite)
    && camera.x >= 0 && camera.x <= 1 && camera.y >= 0 && camera.y <= 1
    && camera.heading >= 0 && camera.heading < 360 && camera.fov >= min && camera.fov <= max
    && (camera.showFrame === undefined || typeof camera.showFrame === 'boolean')
    && (depth === undefined || (Number.isFinite(depth) && depth >= CAMERA_GUIDE_DEPTH_LIMITS.min && depth <= CAMERA_GUIDE_DEPTH_LIMITS.max)));
}

async function sampleAnnotation(source, sampleSetId) {
  const endpoint = '/api/floor-plan-camera/annotation';
  let referenceImage;
  if (source.file) referenceImage = await readFileAsInput(source.file);
  else if (source.dataUrl) referenceImage = { name: source.name, size: source.size, type: source.type, dataUrl: source.dataUrl };
  const payload = referenceImage
    ? await api(endpoint, { method: 'POST', body: JSON.stringify({ referenceImage }) })
    : await api(`/api/beta/sample-sets/${encodeURIComponent(sampleSetId)}/samples/${encodeURIComponent(source.sampleId)}/camera-annotation`);
  const { width, height, walls } = payload;
  const imageDataUrl = referenceImage?.dataUrl ?? payload.imageDataUrl;
  if (!Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1) throw new Error('平面图尺寸识别失败');
  if (typeof imageDataUrl !== 'string' || !/^data:image\/(?:png|jpeg|webp);base64,/.test(imageDataUrl)) {
    throw new Error('未读取到平面图原尺寸底图，请刷新页面后重试');
  }
  if (walls === null) return { width, height, walls, imageDataUrl };
  const mask = Uint8Array.from(atob(walls.mask), byte => byte.charCodeAt(0));
  if (mask.length !== walls.width * walls.height) throw new Error('平面图墙线数据不完整');
  return { width, height, walls: { ...walls, mask }, imageDataUrl };
}

export function createBetaFloorPlanCameraConfiguration({ getState, getModels, sampleLibrary, fillSelect, output, onChange, onPromptChange = onChange, onError }) {
  const stored = readDraft();
  const draft = { agent: typeof stored.agent === 'string' ? stored.agent : '', imageCount: Number(stored.imageCount) || 1,
    complexity: typeof stored.complexity === 'string' ? stored.complexity : '', cameras: { ...stored.cameras },
    mode: stored.mode === 'direct' ? 'direct' : 'agent',
    directPrompt: typeof stored.directPrompt === 'string' ? stored.directPrompt.slice(0, DIRECT_PROMPT_LIMIT) : '' };
  let config, loading = false, opening = false;
  const active = () => getState().featureMode === FEATURE;
  const running = () => getState().submitting || getState().job?.status === 'running';
  const limits = () => config?.cameraLimits?.fov ? { min: config.cameraLimits.fov[0], max: config.cameraLimits.fov[1] } : CAMERA_FOV_LIMITS;
  const selectedPose = sampleId => validPose(draft.cameras[sampleId], limits()) ? draft.cameras[sampleId] : null;
  const availableModels = () => (config?.models || []).filter(model => model.available);
  const direct = () => draft.mode === 'direct';
  const supportsDirect = () => Array.isArray(config?.betaGenerationModes) && config.betaGenerationModes.includes('direct');
  const supportsGuideDepth = () => Array.isArray(config?.cameraLimits?.guideDepth);
  const supportsShowFrame = () => config?.cameraLimits?.showFrame === true;
  const modeReady = () => direct() ? supportsDirect() && availableModels().length > 0 : Boolean(config?.available);
  const modelConfig = key => availableModels().find(model => model.key === key);
  const selectableAgents = () => (config?.agentModels || []).filter(agent => agent.selectable);
  const imageCount = () => config?.batch?.imageCounts?.includes(draft.imageCount) ? draft.imageCount : 1;
  const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));

  function decorateSamples() {
    if (!active()) return;
    const samples = sampleLibrary.sourceImages();
    [...$('sampleList').children].forEach((row, index) => {
      const sample = samples[index];
      if (!sample) return;
      let button = row.querySelector('[data-beta-camera-sample]');
      if (!button) {
        button = document.createElement('button');
        button.type = 'button';
        button.className = 'quiet-button';
        button.dataset.betaCameraSample = sample.sampleId;
        row.append(button);
        button.addEventListener('click', () => openCamera(sample).catch(onError));
      }
      const camera = selectedPose(sample.sampleId);
      button.textContent = camera ? `编辑机位 · ${camera.heading}° / ${camera.fov}°` : '设置机位';
      button.disabled = !config || loading || sampleLibrary.isBusy() || running() || opening;
    });
    $('betaCameraMode').disabled = !config || loading || running();
    $('betaCameraAgent').disabled = direct() || loading || running();
    $('betaCameraDirectPrompt').disabled = !direct() || running();
    $('betaCameraCount').disabled = loading || running();
    $('betaCameraComplexity').disabled = running();
    $('betaCameraRefresh').disabled = loading || running();
  }

  function render() {
    $('betaCameraFields').classList.toggle('hidden', !active());
    $('betaCameraOutputFields').classList.toggle('hidden', !active());
    if (!active()) return;
    const status = $('betaCameraStatus');
    const ready = direct() ? modeReady() : Boolean(config?.available && config.prompt);
    status.textContent = loading ? '刷新中…' : !ready ? '配置不可用'
      : direct() ? '' : `Prompt v${config.prompt.version}`;
    status.classList.toggle('error', !loading && !ready);
    $('betaCameraRefresh').ariaBusy = String(loading);
    fillSelect($('betaCameraMode'), [
      { value: 'agent', label: '空间推理' },
      { value: 'direct', label: '提示词直出', disabled: !supportsDirect() },
    ], draft.mode);
    $('betaCameraMode').value = draft.mode;
    $('betaCameraAgentField').classList.toggle('hidden', direct());
    $('betaCameraDirectPromptField').classList.toggle('hidden', !direct());
    $('betaCameraDirectPrompt').value = draft.directPrompt;
    output.commonPromptField.classList.toggle('hidden', direct());
    output.outputSettingsHint.textContent = direct() ? '整批共用提示词 · 每张图使用自己的机位' : '同机位共用空间推理和标注图';
    const agents = (config?.agentModels || []).map(model => ({ value: model.key,
      label: `${model.label}${model.selectable ? '' : '（不可用）'}`, disabled: !model.selectable }));
    if (draft.agent && !agents.some(agent => agent.value === draft.agent)) agents.push({ value: draft.agent, label: `${draft.agent}（不可用）`, disabled: true });
    fillSelect($('betaCameraAgent'), agents, draft.agent);
    if (draft.agent) $('betaCameraAgent').value = draft.agent;
    fillSelect($('betaCameraCount'), (config?.batch?.imageCounts || []).map(value => ({ value, label: `${value} 张` })), imageCount());
    decorateSamples();
  }

  function renderOutput() {
    output.qualityField.classList.add('hidden');
    output.negativePromptField.classList.add('hidden');
    output.ratioSelect.disabled = false;
    if (!config) return;
    const models = getModels().map(model => modelConfig(model.key)).filter(Boolean);
    const ratios = config.aspectRatios.filter(ratio => models.length && models.every(model => model.sizes[ratio]));
    const ratio = ratios.includes(output.ratioSelect.value) ? output.ratioSelect.value : config.defaultAspectRatio;
    fillSelect(output.ratioSelect, options(ratios), ratio);
    const resolutions = config.resolutions.filter(resolution => models.length && models.every(model => model.sizes[output.ratioSelect.value]?.[resolution]));
    const resolution = resolutions.includes(output.resolutionSelect.value) ? output.resolutionSelect.value : config.defaultResolution;
    fillSelect(output.resolutionSelect, options(resolutions), resolution);
    const candidates = models.filter(model => model.complexityOptions?.length);
    const complexityOptions = (candidates[0]?.complexityOptions || []).filter(value => candidates.every(model => model.complexityOptions.includes(value)));
    const selected = complexityOptions.includes(draft.complexity) ? draft.complexity : '';
    $('betaCameraComplexityField').classList.toggle('hidden', !complexityOptions.length);
    fillSelect($('betaCameraComplexity'), [{ value: '', label: '模型默认' }, ...complexityOptions.map(value => ({
      value, label: { low: '低', medium: '中', high: '高' }[value] || value,
    }))], selected);
  }

  async function refresh() {
    if (loading) return;
    loading = true;
    render();
    onChange();
    try {
      config = await api('/api/beta/floor-plan-camera/config');
      if (!draft.agent) draft.agent = selectableAgents().find(agent => agent.key === 'gemini35flash')?.key || config.defaultAgentModel || '';
      save();
    } catch (error) { config = null; onError(error); }
    finally { loading = false; render(); onChange(); }
  }

  function reason() {
    if (!active()) return null;
    if (loading) return '正在读取平面图机位配置';
    if (direct()) {
      if (!supportsDirect()) return '当前 Beta 服务不支持提示词直出，请刷新配置';
      if (!availableModels().length) return '请选择当前可用的生图模型';
      if (!draft.directPrompt.trim()) return '请填写整批直出提示词';
      if (draft.directPrompt.length > DIRECT_PROMPT_LIMIT) return '直出提示词最多 4000 字符';
    } else {
      if (!config?.available || !config.prompt?.sha256) return config?.reason || '请刷新平面图机位配置';
      if (!selectableAgents().some(agent => agent.key === draft.agent)) return '请选择当前可用的空间推理模型';
    }
    const poses = sampleLibrary.sourceImages().map(image => selectedPose(image.sampleId));
    if (poses.some(pose => !pose)) return '请为每张平面图设置机位';
    if (!supportsShowFrame() && poses.some(pose => pose.showFrame === false)) return '请更新服务后提交不带取景框的机位';
    if (!supportsGuideDepth() && poses.some(pose => pose.guideDepth !== undefined)) return '请刷新配置以使用已调整的视野范围';
    const models = getModels();
    if (models.length * imageCount() > config.batch.maxImages) return `同一机位最多 ${config.batch.maxImages} 张结果，请减少模型或张数`;
    if (models.length && (!output.ratioSelect.value || !output.resolutionSelect.value)) return '所选模型没有共同支持的画幅和分辨率';
    return null;
  }

  async function openCamera(source) {
    if (opening || running()) return;
    opening = true;
    decorateSamples();
    try {
      const annotation = await sampleAnnotation(source, sampleLibrary.activeSampleSetId());
      if (!active() || running() || !sampleLibrary.sourceImages().includes(source)) return;
      const bitmap = new Image();
      bitmap.src = annotation.imageDataUrl;
      await bitmap.decode();
      if (active() && !running() && sampleLibrary.sourceImages().includes(source)) showCameraDialog(source, bitmap, annotation);
    } finally { opening = false; decorateSamples(); }
  }

  function showCameraDialog(source, bitmap, { width, height, walls }) {
    const dialog = $('betaCameraDialog'), canvas = $('betaCameraCanvas'), context = canvas.getContext('2d');
    const heading = $('betaCameraHeading'), fov = $('betaCameraFov'), confirm = $('betaCameraSave');
    const frame = $('betaCameraShowFrame'), help = $('betaCameraHelp');
    const scale = Math.min(1, 1800 / Math.max(width, height));
    const { min, max } = limits();
    const initial = { heading: config.cameraDefaults.heading, fov: config.cameraDefaults.fov };
    const previous = selectedPose(source.sampleId);
    let pose = previous && { ...previous }, drag = null;
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    $('betaCameraTitle').textContent = source.name || '设置机位';
    frame.checked = previous?.showFrame !== false;
    frame.disabled = !supportsShowFrame();
    frame.title = frame.disabled ? '更新服务后可选择是否显示取景框' : '';
    delete canvas.dataset.depthDrag;
    fov.min = min; fov.max = max;
    const syncInputs = () => { heading.value = pose?.heading ?? initial.heading; fov.value = pose?.fov ?? initial.fov; };
    function draw() {
      const depthHint = !supportsGuideDepth() ? '' : frame.checked
        ? '拖动取景框远侧边或白色握把调远近。' : '拖动虚线三角远边的白色握把调远近。';
      help.textContent = `点放相机，按住拖动设定朝向。${depthHint}方向键移动机位。`;
      context.save();
      context.scale(canvas.width / width, canvas.height / height);
      context.drawImage(bitmap, 0, 0, width, height);
      if (pose && validPose(pose, limits())) {
        drawCameraAnnotation(context, pose, width, height, cameraVisibility(pose, walls));
      }
      context.restore();
      if (supportsGuideDepth() && validPose(pose, limits())) {
        const gripScale = canvas.width / canvas.getBoundingClientRect().width;
        drawCameraDepthHandle(context, cameraGuide(pose, canvas.width, canvas.height), gripScale);
      }
      confirm.disabled = !validPose(pose, limits());
      $('betaCameraPosition').textContent = pose ? `机位 ${Math.round(pose.x * 100)}%, ${Math.round(pose.y * 100)}%` : '请在图上点放相机';
    }
    const point = (event, bounded = true) => imagePoint(event.clientX, event.clientY, canvas.getBoundingClientRect(), bounded);
    const pixel = event => {
      const { x, y } = point(event, false);
      return { x: x * canvas.width, y: y * canvas.height };
    };
    const depthGuideAt = event => {
      if (!supportsGuideDepth() || !validPose(pose, limits())) return null;
      const guide = cameraGuide(pose, canvas.width, canvas.height);
      const hitRadius = (event.pointerType === 'touch' ? 24 : 14) * canvas.width / canvas.getBoundingClientRect().width;
      return cameraToolAt(guide, pixel(event), hitRadius, { showFrame: pose.showFrame !== false }) === 'depth' ? guide : null;
    };
    canvas.onpointerdown = event => {
      if (event.button !== 0 || drag !== null) return;
      const guide = depthGuideAt(event);
      if (!guide) pose = { ...(pose || initial), ...point(event) };
      canvas.setPointerCapture(event.pointerId);
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, guide, start: pixel(event), guideDepth: pose.guideDepth };
      if (guide) canvas.dataset.depthDrag = 'active';
      syncInputs(); draw();
    };
    canvas.onpointermove = event => {
      if (!drag) {
        if (depthGuideAt(event)) canvas.dataset.depthDrag = 'hover';
        else delete canvas.dataset.depthDrag;
        return;
      }
      if (drag.id !== event.pointerId) return;
      if (drag.guide) {
        const depth = cameraGuideDepthAt(drag.guide, drag.start, pixel(event), canvas.width, canvas.height);
        if (drag.guideDepth === undefined && Math.abs(depth - drag.guide.depth) < .0001) delete pose.guideDepth;
        else pose.guideDepth = depth;
      } else {
        if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 4) return;
        pose.heading = Math.round(headingToPoint(pose, point(event), width, height)) % 360;
      }
      syncInputs(); draw();
    };
    canvas.onpointerup = canvas.onpointercancel = canvas.onlostpointercapture = event => {
      if (drag?.id !== event.pointerId) return;
      drag = null;
      delete canvas.dataset.depthDrag;
    };
    canvas.onpointerleave = () => { if (!drag) delete canvas.dataset.depthDrag; };
    canvas.onkeydown = event => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter'].includes(event.key)) return;
      event.preventDefault();
      pose ||= { x: .5, y: .5, ...initial };
      pose.x = clamp(pose.x + .01 * ((event.key === 'ArrowRight') - (event.key === 'ArrowLeft')), 0, 1);
      pose.y = clamp(pose.y + .01 * ((event.key === 'ArrowDown') - (event.key === 'ArrowUp')), 0, 1);
      syncInputs(); draw();
    };
    heading.oninput = fov.oninput = () => {
      const orientation = { heading: heading.valueAsNumber, fov: fov.valueAsNumber };
      if (pose) Object.assign(pose, orientation);
      else Object.assign(initial, orientation);
      draw();
    };
    frame.onchange = () => {
      if (!supportsShowFrame()) return;
      const camera = pose || initial;
      if (frame.checked) delete camera.showFrame;
      else camera.showFrame = false;
      draw();
    };
    confirm.onclick = () => {
      if (!validPose(pose, limits())) return;
      draft.cameras[source.sampleId] = { ...pose };
      try { save(); } catch (error) { onError(error); return; }
      dialog.close(); decorateSamples(); onChange();
    };
    $('betaCameraCancel').onclick = () => dialog.close();
    dialog.addEventListener('close', () => bitmap.removeAttribute('src'), { once: true });
    syncInputs(); dialog.showModal(); draw();
  }

  $('betaCameraRefresh').addEventListener('click', refresh);
  $('betaCameraMode').addEventListener('change', event => {
    if (event.target.value === 'direct' && !supportsDirect()) { render(); return; }
    draft.mode = event.target.value === 'direct' ? 'direct' : 'agent';
    save(); render(); onChange();
  });
  $('betaCameraDirectPrompt').addEventListener('input', event => {
    draft.directPrompt = event.target.value;
    save(); onPromptChange();
  });
  for (const [id, key, read] of [['betaCameraAgent', 'agent', String], ['betaCameraCount', 'imageCount', Number], ['betaCameraComplexity', 'complexity', String]]) {
    $(id).addEventListener('change', event => { draft[key] = read(event.target.value); save(); onChange(); });
  }
  return { render, renderOutput, refresh, reason, decorateSamples, imageCount,
    configured: () => Boolean(config), selectable: model => !active() || Boolean(modelConfig(model.key)),
    buildItems(cases, models, startedAt) {
      const issue = reason(); if (issue) throw new Error(issue);
      if (!cases.length || !models.length) throw new Error('请选择平面图样本和出图模型');
      const count = imageCount();
      const generation = direct() ? { floorPlanCameraGenerationMode: 'direct', prompt: draft.directPrompt }
        : { promptAgentModelKey: draft.agent, promptVersion: config.prompt.version, floorPlanCameraPromptSha256: config.prompt.sha256 };
      return cases.flatMap((sample, i) => models.flatMap((model, j) => Array.from({ length: count }, (_, k) => {
        const { x, y, heading, fov, guideDepth, showFrame } = selectedPose(sample.caseId);
        const camera = { x, y, heading, fov, height: config.cameraDefaults.height };
        if (guideDepth !== undefined) camera.guideDepth = guideDepth;
        if (showFrame === false) camera.showFrame = false;
        const complexity = $('betaCameraComplexity').value;
        return { attempt: 1, caseId: sample.caseId, sampleId: sample.caseId, modelLabel: model.label,
          label: `${sample.label} · ${model.label}${count > 1 ? ` · 第 ${k + 1} 张` : ''}`,
          runId: createBetaRunId({ modelKey: model.key, sequence: (i * models.length + j) * count + k + 1, startedAt }),
          input: { featureMode: FEATURE, modelKey: model.key, camera,
            prompt: sample.prompt || '', ...generation, floorPlanCameraWorkflowVersion: config.workflowVersion,
            resolution: output.resolutionSelect.value, aspectRatio: output.ratioSelect.value, outputFormat: 'png',
            ...(complexity && modelConfig(model.key)?.complexityOptions?.includes(complexity) ? { complexity } : {}),
          } };
      })));
    },
  };
}

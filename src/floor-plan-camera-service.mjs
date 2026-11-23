/**
 * [INPUT]: 依赖独立飞书空间推理Agent、视觉模型目录/版本化输出、平面图解码、OneAPI与主工作台专用Qwen 2511适配器、共享批任务及机位射线求交、遮挡和标注绘制
 * [OUTPUT]: 提供墙线分析、矩形裁剪与送模预览、裁图坐标换算、空间推理与原文直出、按模型路由的同图同词批量生图、Beta复用、逐图回执和历史兼容
 * [POS]: src 的平面图摄影独立服务，复用floor-plan-api任务隔离，不执行几何重建或自动重试
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { normalizeFloorPlanReferenceImage, generateFloorPlanImage,
  FLOOR_PLAN_MODEL_KEY, FLOOR_PLAN_GPT_MODEL_KEYS, FLOOR_PLAN_IMAGE_POLICY } from './floor-plan-service.mjs';
import { publicModelCatalog, normalizeImageComplexity } from './model-config.mjs';
import { FLOOR_PLAN_CAMERA_QWEN } from './floor-plan-camera-qwen.mjs';
import { decodeImageDataUrl, fitImageDataUrlForRequest } from './image-artifact.mjs';
import { getFloorPlanCameraPrompt, floorPlanCameraPromptCode, FLOOR_PLAN_CAMERA_PROMPT_MIN_VERSION } from './floor-plan-camera-prompt.mjs';
import { agentModelOrThrow, checkAgentModelAvailability } from './agent-model-config.mjs';
import { prependDesignUserRequirements } from './design-prompt-output.mjs';
import { FREEFORM_FRAME_PROMPT_MIN_VERSION, parseFloorPlanCameraOutput, STRUCTURED_FRAME_PROMPT_MIN_VERSION } from './floor-plan-camera-output.mjs';
import { runGenerationJobBatch } from './generation-jobs.mjs';
import { CAMERA_DEFAULT_FOV, CAMERA_FOV_LIMITS, CAMERA_GUIDE_DEPTH_LIMITS, equivalentFocalLengthMm,
  cameraViewCrop, cameraMarkerRadius } from '../public/floor-plan-camera-geometry.js';
import { FLOOR_PLAN_WALL_ANALYSIS_MAX_SIDE, detectFloorPlanWalls, cameraVisibilityAnalysis } from '../public/floor-plan-camera-visibility.js';
import { cameraAnnotationSvg } from '../public/floor-plan-camera-annotation.js';

export const FLOOR_PLAN_CAMERA_WORKFLOW = '2026-11-07.floor-plan-camera.9';
export const FLOOR_PLAN_CAMERA_PIPELINE = 'camera-view-agent-to-image-reference';
const DIRECT_PIPELINE = 'camera-prompt-to-image-reference';
const GENERATION_MODES = Object.freeze(['agent', 'direct']);
export const FLOOR_PLAN_CAMERA_DEFAULTS = Object.freeze({ x: .5, y: .5, heading: 0, fov: CAMERA_DEFAULT_FOV, height: 1.5 });
export const FLOOR_PLAN_CAMERA_LIMITS = Object.freeze({ fov: [CAMERA_FOV_LIMITS.min, CAMERA_FOV_LIMITS.max], height: [.8, 2.2],
  guideDepth: [CAMERA_GUIDE_DEPTH_LIMITS.min, CAMERA_GUIDE_DEPTH_LIMITS.max], showFrame: true, cropToView: true });
const EYE_LEVEL_PROMPT_MIN_VERSION = 6;
const BILATERAL_OCCLUSION_PROMPT_MIN_VERSION = 7;
const BLUE_DOT_PROMPT_MIN_VERSION = 8;
const AGENT_USER_REQUIREMENTS_MIN_VERSION = 11;
const LEGACY_WORKFLOW = '2026-11-07.floor-plan-camera.8';
const BATCH_LIMITS = Object.freeze({ imageCounts: Object.freeze([1, 2, 3, 4]), maxImages: 12 });
const CAMERA_REFERENCE = Object.freeze({ referenceImageCount: 1, referenceImageRole: 'camera-annotated-plan' });
const IMAGE_GENERATION_MODE = 'image-to-image';
const ESTIMATED_VISIBILITY = 'estimated-wall-occlusion';
const ANGLE_ONLY = 'angle-only';
const REFERENCE_INSTRUCTIONS = 'Use the attached floor plan to fix the view. The blue C marks the camera, the arrow its direction, and the dashed sector its horizontal angle. The sector radius does not limit distance.';
const OCCLUSION_INSTRUCTIONS = 'An opaque wall ends each sightline at the first hit. Show spaces beyond walls only along sightlines through confirmed openings. Treat unspecified door states as uncertain. Respect furniture orientation. Where the description conflicts with the plan geometry, follow the plan. Keep plan graphics, labels and camera marks out of the photograph.';
const CAMERA_PHOTOGRAPHY_PROFILE = 'Canon EOS R1 full-frame look at f/8 and ISO 100';
const CAMERA_EXPOSURE_PROFILE = 'bracketed HDR with locked white balance';
const RESOLUTIONS = Object.freeze(['1K', '2K', '4K']);
const ASPECT_RATIOS = Object.freeze(['16:9', '4:3', '1:1']);
const { key: QWEN_KEY, id: QWEN_ID, label: QWEN_LABEL, resolution: QWEN_RESOLUTION,
  aspectRatio: QWEN_RATIO, width: QWEN_WIDTH, height: QWEN_HEIGHT } = FLOOR_PLAN_CAMERA_QWEN;
const QWEN_SIZE = `${QWEN_WIDTH}x${QWEN_HEIGHT}`;
const QWEN_MODEL = Object.freeze({ key: QWEN_KEY, id: QWEN_ID, label: QWEN_LABEL, provider: 'comfyui',
  maxReferenceImages: 1, sizes: { [QWEN_RATIO]: { [QWEN_RESOLUTION]: QWEN_SIZE } },
  resolutions: [QWEN_RESOLUTION], aspectRatios: [QWEN_RATIO], complexityOptions: [],
  defaults: { resolution: QWEN_RESOLUTION, aspectRatio: QWEN_RATIO, quality: null, outputFormat: 'png' } });
const hash = value => createHash('sha256').update(value).digest('hex');
const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode, floorPlanSafe: true });
const identity = ({ code, name, version, sha256, source, tableUrl }) => ({ code, name, version, sha256, source, tableUrl });
const pngUrl = bytes => `data:image/png;base64,${bytes.toString('base64')}`;
const agentIdentity = ({ key, id, label }) => ({ key, id, label });
function receipt(response) {
  const rawId = response?.requestId || response?.responseId || response?.metadata?.promptId || response?.details?.promptId;
  const requestId = typeof rawId === 'string' ? rawId.replace(/\bsk-[a-zA-Z0-9_-]{8,}\b/g, '[已移除凭据]').replace(/[\u0000-\u001f]/g, '').slice(0, 160) : null;
  const usageCost = Object.fromEntries(Object.entries(response?.usageCost || {}).filter(([key, value]) =>
    ['cost', 'costUsd', 'nativeAmount', 'exchangeRate'].includes(key) && typeof value === 'number' && Number.isFinite(value) && value >= 0));
  if (/^[A-Z]{3}$/.test(response?.usageCost?.currency || '')) usageCost.currency = response.usageCost.currency;
  return { requestId, usageCost };
}

export function validateFloorPlanCamera(value) {
  const keys = ['x', 'y', 'heading', 'fov', 'height'];
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(key => !['guideDepth', 'showFrame', 'cropToView'].includes(key) && !keys.includes(key))
    || keys.some(key => !Object.hasOwn(value, key) || !Number.isFinite(value[key]))) throw fail('相机参数不完整或不是有效数字');
  if (value.x < 0 || value.x > 1 || value.y < 0 || value.y > 1) throw fail('请把相机放在平面图范围内');
  if (value.heading < 0 || value.heading >= 360) throw fail('相机朝向须在0度至360度之间（不含360度）');
  if (value.fov < CAMERA_FOV_LIMITS.min || value.fov > CAMERA_FOV_LIMITS.max) throw fail('相机视野须在35至100度之间');
  if (value.height < .8 || value.height > 2.2) throw fail('相机高度须在0.8至2.2米之间');
  if (Object.hasOwn(value, 'guideDepth')) {
    const { min, max } = CAMERA_GUIDE_DEPTH_LIMITS;
    if (!Number.isFinite(value.guideDepth) || value.guideDepth < min || value.guideDepth > max) {
      throw fail(`取景距离须在原图短边的 ${min} 至 ${max} 倍之间`);
    }
    keys.push('guideDepth');
  }
  if (Object.hasOwn(value, 'showFrame')) {
    if (typeof value.showFrame !== 'boolean') throw fail('是否显示取景框须为布尔值');
    keys.push('showFrame');
  }
  if (Object.hasOwn(value, 'cropToView')) {
    if (typeof value.cropToView !== 'boolean') throw fail('是否裁剪视野须为布尔值');
    keys.push('cropToView');
  }
  return Object.fromEntries(keys.map(key => [key, value[key]]));
}

// --- 从模型真源选择能接收单张参考图的 OneAPI 生图模型 ---
function supportedModels() {
  return publicModelCatalog().filter(model => model.provider === 'oneapi'
    && model.maxReferenceImages >= CAMERA_REFERENCE.referenceImageCount
    && model.sizingMode === 'preset' && model.formats.includes('png')).flatMap(model => {
    const sizes = Object.fromEntries(ASPECT_RATIOS.filter(ratio => model.sizes[ratio]).map(ratio => [ratio,
      Object.fromEntries(RESOLUTIONS.filter(resolution => model.sizes[ratio][resolution])
        .map(resolution => [resolution, model.sizes[ratio][resolution]]))]).filter(([, row]) => Object.keys(row).length));
    const aspectRatios = Object.keys(sizes);
    if (!aspectRatios.length) return [];
    const resolutions = RESOLUTIONS.filter(resolution => Object.values(sizes).some(row => row[resolution]));
    const aspectRatio = aspectRatios.includes('16:9') ? '16:9' : aspectRatios[0];
    const resolution = sizes[aspectRatio]['2K'] ? '2K' : Object.keys(sizes[aspectRatio])[0];
    return [{ key: model.key, id: model.id, label: model.label, provider: model.provider,
      maxReferenceImages: model.maxReferenceImages, sizes, resolutions, aspectRatios,
      complexityOptions: [...model.complexityOptions],
      defaults: { resolution, aspectRatio, quality: model.defaultQuality, outputFormat: 'png' } }];
  });
}
async function modelOptions(getModels) {
  let catalog;
  try { catalog = await getModels({ forceRefresh: true }); }
  catch { throw fail('OneAPI未连接或模型权限读取失败，请检查连接后重试', 409); }
  if (!Array.isArray(catalog)) throw fail('OneAPI模型目录格式不正确', 409);
  const models = supportedModels().map(model => {
    const available = catalog.some(entry => (entry.id || entry.name) === model.id);
    return { ...model, available, reason: available ? null : `当前OneAPI Key未开放 ${model.label}` };
  });
  return { models, agentModels: checkAgentModelAvailability(catalog, 'floorPlanCamera') };
}
async function qwenModelOption(client) {
  let available = false;
  try { available = (await client.checkAvailability())?.available === true; }
  catch { /* --- 目录不暴露网关地址或返回体 --- */ }
  return { ...QWEN_MODEL, available, reason: available ? null : '楚雄 Qwen Image Edit 2511 当前不可用，请稍后刷新模型配置' };
}
function assertModelSettings(model, resolution, aspectRatio) {
  if (!model?.sizes[aspectRatio]?.[resolution]) throw fail(`${model?.label || '所选模型'}不支持 ${aspectRatio} / ${resolution}，请重新选择出图尺寸`);
}
function modelComplexity(model, value) {
  try { return normalizeImageComplexity(model.id, value); }
  catch (error) { throw fail(error.message); }
}
async function assertModels(modelKeys, agentModelKey, getModels, qwenClient) {
  const needsOneApi = agentModelKey !== null || modelKeys.some(key => key !== QWEN_KEY);
  const [{ models, agentModels }, qwenModel] = await Promise.all([
    needsOneApi ? modelOptions(getModels) : { models: [], agentModels: [] },
    qwenClient && modelKeys.includes(QWEN_KEY) ? qwenModelOption(qwenClient) : null,
  ]);
  const selected = modelKeys.map(key => {
    const model = key === QWEN_KEY ? qwenModel : models.find(item => item.key === key);
    if (!model?.available) throw fail(model?.reason || '所选生图模型不可用，请刷新模型配置', 409);
    return model;
  });
  if (agentModelKey === null) return { models: selected };
  const agent = agentModels.find(item => item.key === agentModelKey);
  if (!agent?.selectable) throw fail('所选空间推理模型不可用或不支持图片，请刷新后重新选择', 409);
  return { models: selected, agent: agentIdentity(agent) };
}
function checkAsset(asset, version, sha256) {
  if (!asset?.published || !Number.isSafeInteger(asset.version) || asset.version < FLOOR_PLAN_CAMERA_PROMPT_MIN_VERSION
    || asset.code !== floorPlanCameraPromptCode(asset.version) || typeof asset.prompt !== 'string' || !asset.prompt.trim() || asset.prompt.length > 16000
    || hash(asset.prompt) !== asset.sha256 || (version !== undefined && asset.version !== version)
    || (sha256 !== undefined && asset.sha256 !== sha256)) throw fail('平面图摄影Prompt身份已变化，请刷新配置', 409);
  return asset;
}
function assertPromptIdentity({ promptVersion, promptSha256 }) {
  if (!Number.isSafeInteger(promptVersion) || promptVersion < FLOOR_PLAN_CAMERA_PROMPT_MIN_VERSION
    || !/^[a-f0-9]{64}$/.test(promptSha256 || '')) throw fail('请刷新平面图摄影Prompt配置');
}

export async function readFloorPlanCameraConfig({ getModels, getPrompt = getFloorPlanCameraPrompt,
  includeAgentPrompt = true, qwenClient } = {}) {
  const [modelResult, assetResult, qwenResult] = await Promise.allSettled([
    modelOptions(getModels), includeAgentPrompt ? getPrompt({ forceRefresh: true }) : null,
    qwenClient ? qwenModelOption(qwenClient) : null,
  ]);
  const { models: oneApiModels, agentModels } = modelResult.status === 'fulfilled' ? modelResult.value : { models: [], agentModels: [] };
  const models = qwenResult.value ? [...oneApiModels, qwenResult.value] : oneApiModels;
  let prompt = null, reason = null;
  if (includeAgentPrompt && assetResult.status === 'fulfilled') {
    try { prompt = identity(checkAsset(assetResult.value)); }
    catch (error) { reason = error.message; }
  } else if (includeAgentPrompt) reason = '平面图摄影Prompt未就绪，请刷新配置';
  if (!reason && !models.some(model => model.available)) reason = '当前没有可用的生图模型';
  if (!reason && includeAgentPrompt && !agentModels.some(model => model.selectable)) reason = '当前OneAPI Key没有可用的空间推理模型';
  return { featureMode: 'floorPlanCamera', workflowVersion: FLOOR_PLAN_CAMERA_WORKFLOW, pipeline: FLOOR_PLAN_CAMERA_PIPELINE, available: !reason, reason,
    generationModes: GENERATION_MODES, models, defaultModel: FLOOR_PLAN_MODEL_KEY, agentModels,
    defaultAgentModel: (agentModels.find(model => model.key === 'gemini3pro' && model.selectable) || agentModels.find(model => model.selectable))?.key || null,
    imagePolicy: FLOOR_PLAN_IMAGE_POLICY, prompt,
    cameraDefaults: FLOOR_PLAN_CAMERA_DEFAULTS, cameraLimits: FLOOR_PLAN_CAMERA_LIMITS,
    resolutions: RESOLUTIONS, aspectRatios: ASPECT_RATIOS, defaultResolution: '2K', defaultAspectRatio: '16:9',
    input: { ...CAMERA_REFERENCE },
    imageGeneration: { mode: IMAGE_GENERATION_MODE, ...CAMERA_REFERENCE },
    batch: BATCH_LIMITS,
    output: { quality: 'medium', format: 'png', count: 1, exactCameraGeometry: false } };
}

export function floorPlanCameraTaskTotal(input) {
  const { imageCount, modelSelections } = input;
  if (!BATCH_LIMITS.imageCounts.includes(imageCount) || !Array.isArray(modelSelections)) return 1;
  const total = modelSelections.length * imageCount;
  return total > 0 && total <= BATCH_LIMITS.maxImages ? total : 1;
}

function readSelections(input, batch) {
  if (!batch) return [{ key: input.modelKey ?? FLOOR_PLAN_MODEL_KEY, complexity: input.complexity }];
  const { modelSelections, imageCount } = input;
  if (Object.hasOwn(input, 'modelKey') || Object.hasOwn(input, 'complexity')) throw fail('批量任务请按模型单独设置生图思考强度');
  if (!Array.isArray(modelSelections) || !modelSelections.length
    || modelSelections.some(selection => !selection || typeof selection !== 'object' || Array.isArray(selection)
      || typeof selection.key !== 'string' || Object.keys(selection).some(key => !['key', 'complexity'].includes(key)))) throw fail('请选择有效的生图模型');
  if (new Set(modelSelections.map(({ key }) => key)).size !== modelSelections.length) throw fail('同一生图模型不能重复选择');
  if (!BATCH_LIMITS.imageCounts.includes(imageCount)) throw fail('每个模型可生成1至4张效果图');
  if (imageCount * modelSelections.length > BATCH_LIMITS.maxImages) throw fail(`一次最多生成${BATCH_LIMITS.maxImages}张效果图`);
  return modelSelections;
}

// --- 画布上传与送模合成使用同一缩放和墙线识别 ---
async function readCameraWalls(source) {
  const { data, info } = await source.clone().resize(FLOOR_PLAN_WALL_ANALYSIS_MAX_SIDE, FLOOR_PLAN_WALL_ANALYSIS_MAX_SIDE,
    { fit: 'inside', withoutEnlargement: true }).toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return detectFloorPlanWalls({ data, width: info.width, height: info.height });
}

export async function analyzeFloorPlanCameraAnnotation(input, { includeImage = false } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).length !== 1 || !Object.hasOwn(input, 'referenceImage')) throw fail('机位标注请求字段无效');
  const reference = await normalizeFloorPlanReferenceImage(input.referenceImage);
  const { width, height } = reference.source;
  const walls = await readCameraWalls(sharp(decodeImageDataUrl(reference.imageUrl)));
  return { width, height, walls: walls && { ...walls, mask: Buffer.from(walls.mask).toString('base64') },
    ...(includeImage ? { imageDataUrl: reference.imageUrl } : {}) };
}

export async function createFloorPlanCameraGuide(reference, camera, { includeBilateralOpening = false, markCameraWithLetter = false } = {}) {
  const { width, height } = reference.source;
  const source = sharp(decodeImageDataUrl(reference.imageUrl));
  const walls = await readCameraWalls(source);
  const visibility = cameraVisibilityAnalysis(camera, walls);
  const visible = visibility?.polygon;
  const bilateralOpening = includeBilateralOpening ? visibility?.bilateralOpening : null;
  let svg = cameraAnnotationSvg(camera, width, height, visible, { markCameraWithLetter });
  let image = source, crop = null, outputWidth = width, outputHeight = height;
  if (camera.cropToView === true) {
    const intersection = cameraViewCrop(camera, width, height);
    if (!intersection) throw fail('当前视野未覆盖平面图，请将机位向图内移动或调整朝向');
    const { bounds, polygon } = intersection;
    const padding = Math.ceil(cameraMarkerRadius(width, height) * 2);
    outputWidth = bounds.width + padding * 2;
    outputHeight = bounds.height + padding * 2;
    // --- 射线交集只决定裁剪矩形；矩形内两侧图纸保留为空间上下文 ---
    const cropped = await source.extract(bounds).png().toBuffer();
    // --- 留白让裁边处的蓝点和箭头完整；所有标注仍按原图坐标绘制 ---
    const padded = await sharp(cropped).extend({ top: padding, bottom: padding, left: padding, right: padding, background: 'white' }).png().toBuffer();
    image = sharp(padded);
    svg = svg.replace(/<svg\b[^>]*>/, `<svg xmlns="http://www.w3.org/2000/svg" width="${outputWidth}" height="${outputHeight}" viewBox="${bounds.left - padding} ${bounds.top - padding} ${outputWidth} ${outputHeight}">`);
    crop = { mode: 'view-rays-bounds', preservesContext: true, sourceSize: { width, height }, bounds, polygon, padding,
      cameraPosition: { x: (camera.x * (width - 1) - bounds.left + padding) / (outputWidth - 1),
        y: (camera.y * (height - 1) - bounds.top + padding) / (outputHeight - 1) } };
  }
  const bytes = await image.composite([{ input: Buffer.from(svg) }]).png().toBuffer();
  const imageUrl = pngUrl(bytes);
  if (imageUrl.length > 20_971_520) throw fail('相机标注图转换后过大，请降低平面图分辨率');
  return { imageUrl, sha256: hash(bytes), width: outputWidth, height: outputHeight, type: 'image/png', ...(crop ? { crop } : {}),
    visibilityMode: visible ? ESTIMATED_VISIBILITY : ANGLE_ONLY, bilateralOpening: bilateralOpening ?? null };
}

// --- 出图与归档复用冻结机位图，推理模式也使用同一张图 ---
async function prepareSubmittedGuide(reference, camera, options) {
  const guide = await createFloorPlanCameraGuide(reference, camera, options);
  let imageUrl;
  try { imageUrl = await fitImageDataUrlForRequest(guide.imageUrl); }
  catch { throw fail('相机标注图超过请求限制，请降低图片分辨率'); }
  const guideBytes = decodeImageDataUrl(imageUrl), metadata = await sharp(guideBytes).metadata();
  return { ...guide, imageUrl, originalSha256: guide.sha256, sha256: hash(guideBytes), width: metadata.width,
    height: metadata.height, type: `image/${metadata.format}`, format: metadata.format };
}

// --- 预览复用实际送模合成和压缩，不查模型/资产、不创建任务 ---
export async function previewFloorPlanCameraInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).some(key => !['referenceImage', 'camera', 'promptVersion'].includes(key))) throw fail('机位预览请求字段无效');
  const camera = validateFloorPlanCamera(input.camera);
  if (Object.hasOwn(input, 'promptVersion') && (!Number.isSafeInteger(input.promptVersion)
    || input.promptVersion < FLOOR_PLAN_CAMERA_PROMPT_MIN_VERSION)) throw fail('机位预览Prompt版本无效');
  const reference = await normalizeFloorPlanReferenceImage(input.referenceImage);
  return prepareSubmittedGuide(reference, camera, { markCameraWithLetter: input.promptVersion < BLUE_DOT_PROMPT_MIN_VERSION });
}

export async function prepareFloorPlanCameraInput(input, { getModels, getPrompt = getFloorPlanCameraPrompt, qwenClient } = {}) {
  const allowed = ['action', 'workflowVersion', 'generationMode', 'referenceImage', 'modelKey', 'agentModelKey', 'camera', 'resolution', 'aspectRatio', 'complexity', 'userRequirements', 'promptVersion', 'promptSha256', 'modelSelections', 'imageCount'];
  if (!input || typeof input !== 'object' || Array.isArray(input) || input.action !== 'render'
    || Object.keys(input).some(key => !allowed.includes(key))) throw fail('平面图摄影请求字段无效');
  const batch = Object.hasOwn(input, 'modelSelections') || Object.hasOwn(input, 'imageCount');
  const generationMode = input.generationMode === undefined ? 'agent' : input.generationMode;
  if (!GENERATION_MODES.includes(generationMode)) throw fail('请选择有效的机位生成模式');
  const direct = generationMode === 'direct';
  if (input.workflowVersion !== FLOOR_PLAN_CAMERA_WORKFLOW && (direct || batch || input.workflowVersion !== LEGACY_WORKFLOW)) {
    throw fail('机位图生成流程已更新，请整页刷新后再提交', 409);
  }
  const selections = readSelections(input, batch);
  const camera = validateFloorPlanCamera(input.camera);
  if (direct) {
    if (['agentModelKey', 'promptVersion', 'promptSha256'].some(key => Object.hasOwn(input, key))) throw fail('提示词直出不需要空间推理配置');
  } else {
    try { agentModelOrThrow(input.agentModelKey, 'floorPlanCamera'); }
    catch { throw fail('请选择支持图片的空间推理模型'); }
  }
  const knownModels = supportedModels();
  const complexities = selections.map(selection => {
    const model = qwenClient && selection.key === QWEN_KEY ? QWEN_MODEL : knownModels.find(item => item.key === selection.key);
    if (!model) throw fail('请选择支持的生图模型');
    return modelComplexity(model, selection.complexity);
  });
  const resolution = input.resolution ?? '2K', aspectRatio = input.aspectRatio ?? '16:9';
  if (!RESOLUTIONS.includes(resolution) || !ASPECT_RATIOS.includes(aspectRatio)) throw fail('请选择支持的出图尺寸和画幅');
  const userRequirements = input.userRequirements ?? '';
  if (typeof userRequirements !== 'string' || userRequirements.length > 4000
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(userRequirements)) throw fail(`${direct ? '提示词' : '摄影要求'}最多4000字且不能包含控制字符`);
  if (direct && !userRequirements.trim()) throw fail('请输入直出提示词');
  if (!direct) assertPromptIdentity(input);
  const { models, agent } = await assertModels(selections.map(({ key }) => key), direct ? null : input.agentModelKey, getModels, qwenClient);
  const preparedModels = models.map((model, index) => {
    assertModelSettings(model, resolution, aspectRatio);
    const complexity = complexities[index];
    return { modelKey: model.key, model, complexity, defaults: { resolution, quality: model.defaults.quality, outputFormat: model.defaults.outputFormat, complexity } };
  });
  const reference = await normalizeFloorPlanReferenceImage(input.referenceImage);
  const prompt = direct ? null : checkAsset(await getPrompt({ version: input.promptVersion, expectedSha256: input.promptSha256, forceRefresh: true }), input.promptVersion, input.promptSha256);
  const guide = await prepareSubmittedGuide(reference, camera, prompt ? {
    includeBilateralOpening: prompt.version >= BILATERAL_OCCLUSION_PROMPT_MIN_VERSION,
    markCameraWithLetter: prompt.version < BLUE_DOT_PROMPT_MIN_VERSION,
  } : {});
  const { submittedSha256: normalizedSha256, ...originalSource } = reference.source;
  const source = { ...originalSource, normalizedSha256 };
  return { action: 'render', workflowVersion: input.workflowVersion, camera,
    resolution, aspectRatio, userRequirements, source, guide,
    ...(direct ? { generationMode } : { agentModelKey: input.agentModelKey, agent, prompt }),
    ...(batch ? { batch: { models: preparedModels, imageCount: input.imageCount } } : preparedModels[0]) };
}

const PLAN_DIRECTIONS = ['图上', '图右上', '图右', '图右下', '图下', '图左下', '图左', '图左上'];
const planDirection = degrees => PLAN_DIRECTIONS[Math.round(degrees / 45) % PLAN_DIRECTIONS.length];
const FRAME_DIRECTIONS_ONLY = '图纸方位只用于内部换算。最终取景正文中的位置一律以成片为基准，用画面左侧、右侧、左前方、右前方、正前方、近景、中景或远景。只写“床头靠画面左前方的墙”，不要写“图右侧（画面左前方）”，也不要附图纸方位、东南西北、坐标或机位朝向。';
const USER_REQUIREMENTS_RULE = '按图核实用户补充的空间信息，将已确认可见的内容换算成成片方位。图纸和冻结机位优先，保持墙体、开口、家具布置和取景。把适用的材质、风格和光线要求融入已确认可见的场景，保留明确的颜色、材质和光线细节。';

function submittedPlanPoint(point, crop) {
  if (!crop) return point;
  const { sourceSize, bounds, padding } = crop;
  return { x: (point.x * (sourceSize.width - 1) - bounds.left + padding) / (bounds.width + padding * 2 - 1),
    y: (point.y * (sourceSize.height - 1) - bounds.top + padding) / (bounds.height + padding * 2 - 1) };
}

export function buildFloorPlanCameraAgentInput(input) {
  const crop = input.guide.crop;
  const estimated = input.guide.visibilityMode === ESTIMATED_VISIBILITY;
  const bilateralOpening = input.prompt?.version >= BILATERAL_OCCLUSION_PROMPT_MIN_VERSION && input.guide.bilateralOpening;
  const freeform = input.prompt?.version >= FREEFORM_FRAME_PROMPT_MIN_VERSION;
  const compactGuide = input.prompt?.version >= BLUE_DOT_PROMPT_MIN_VERSION;
  const frameGuide = input.camera.showFrame === false ? '' : '浅蓝矩形围住视野标记，';
  const angleGuide = compactGuide ? `虚线三角的两侧表示水平开角，${frameGuide}末端横线仅示意。` : '虚线扇形表示水平角域，绘制半径不是最远可见距离。';
  const visibilityGuide = !estimated ? '本图无可靠的可见范围填色，请沿镜头方向直接读图。'
    : compactGuide ? '淡蓝填色仅示意三角内的首墙遮挡；三角末端以外仍按同一开角和首墙判断。'
      : '淡蓝填色是识别墙线后的平面可见范围估算，请回看原图的墙和开口核对。';
  const visibleContentRule = freeform
    ? '先查每件物品的占地和朝向，只描述蓝点前方、水平开角内、实墙之前可直视的表面。贴着机位或边线不足以证明入镜，只有确认可见的表面跨过画面边缘才描述露出的局部。整件位于侧后方、画外或实墙后就排除。没有可见家具就保留空墙和空地，未被图纸证实的门窗、家具和装饰不要补入。材质和光照只用于已确认的可见场景。'
    : '先查每件物品的占地和朝向：只取蓝点前方、位于两条开角边线之间、首墙之前可直视的表面。整件在机位侧后方或画外时只写入 frame.excluded。贴着蓝点、接触边线或被蓝点盖住不能证明入镜；找不到有面积的可见表面就不写进画面。只有已确认的可见表面跨过画幅边缘，才在 frame.crop 写实际露出的局部。没有可见家具时保留空地与空墙，不按房间用途补家具、柜子、装饰或绿植。无图纸线型支持的墙面保持连续，不为采光添门窗。未知内容留在 uncertainty，image_prompt 只写已确认表面的材质与光影。';
  const { heading, guideDepth } = input.camera;
  const depthGuide = guideDepth === undefined ? ''
    : '取景标记远边表示用户希望覆盖的参考范围。guide_depth_short_side_ratio 是沿镜头中轴从机位到该标记的距离与原图短边之比。仍根据实际开角和首墙判断入镜范围。';
  const cropGuide = !crop ? '图纸保留画外原色，' : crop.mode === 'view-rays-bounds'
    ? '本图将两侧视角射线延伸到原图边界，用角域与原图交集的外接矩形裁边，矩形内全部图纸保持原色，包括角域外的两侧区域，不做三角形蒙白。矩形内角域外的内容只作为空间上下文，不代表全部入镜；实际画面仍按蓝点、朝向、开角和首墙遮挡判断。裁边、白色边距和蓝色标注不是墙体、门窗或实际房间边界。机位position和远端命中点已换算为提交图坐标，source_position仅用于追溯原图。'
    : '本图已将两侧视角射线延伸到原图边界，仅保留角域与原图的交集，角域外蒙白并裁去多余边缘。白色遮罩、裁边和蓝色标注不是墙体、门窗或实际房间边界，不补全被移除的图纸。裁剪只限制水平开角，不消除角域内的墙体遮挡。机位position和远端命中点已换算为提交图坐标，source_position仅用于追溯原图。';
  const camera = { coordinate_system: crop ? 'normalized_0_1_submitted_image_top_left_origin' : 'normalized_0_1_top_left_origin', heading_convention: 'degrees_clockwise_0_up_90_right',
    position: crop?.cameraPosition ?? { x: input.camera.x, y: input.camera.y }, heading_degrees: heading,
    ...(crop ? { source_position: { x: input.camera.x, y: input.camera.y }, source_coordinate_system: 'normalized_0_1_original_plan_top_left_origin',
      reference_crop: crop } : {}),
    horizontal_fov_degrees: input.camera.fov, camera_height_meters: input.camera.height,
    full_frame_equivalent_focal_length_mm: equivalentFocalLengthMm(input.camera.fov),
    visibility_mode: estimated ? ESTIMATED_VISIBILITY : ANGLE_ONLY,
    field_of_view_interpretation: `${angleGuide}${depthGuide}${visibilityGuide}${cropGuide}按开角与首墙遮挡判断实际入镜范围。每条视线遇到第一面实墙即停止。只通过确认的开口看见后方空间，门的开合状态未给出时保持不确定。`,
    ...(guideDepth !== undefined ? { guide_depth_short_side_ratio: guideDepth } : {}),
    ...(input.prompt?.version >= STRUCTURED_FRAME_PROMPT_MIN_VERSION ? { frame_directions_on_plan: {
      forward: planDirection(heading), image_left: planDirection(heading + 270), image_right: planDirection(heading + 90),
      note: freeform ? FRAME_DIRECTIONS_ONLY
        : '这是从机位朝向换算的相对方位。先面向 forward，再按 image_left 和 image_right 判断画面两侧。图纸左右与照片左右可能不同。',
    }, visible_content_rule: visibleContentRule } : {}),
    ...(bilateralOpening ? { estimated_bilateral_occlusion: {
      farther_interval: [bilateralOpening.left, bilateralOpening.right], coordinate_system: 'normalized_frame_left_0_right_1',
      farther_plan_boundary: crop ? bilateralOpening.fartherBoundary.map(point => submittedPlanPoint(point, crop)) : bilateralOpening.fartherBoundary,
      ...(crop ? { farther_plan_coordinate_system: 'normalized_0_1_submitted_image_top_left_origin' } : {}),
      ...(input.prompt?.version >= STRUCTURED_FRAME_PROMPT_MIN_VERSION ? {
        interpretation: '中间区间两侧为首墙遮挡，不显示墙后远景。按五处边界坐标逐一核对实墙线型；只有确切的门窗图例与直视范围重合才写入画面。不要把蓝色估算边界和墙角识别成门窗。',
      } : {}),
    } } : {}),
    canonical_plan_pixels: { width: input.source.width, height: input.source.height },
    submitted_image_pixels: [{ image: 1, role: 'camera-annotated-plan', width: input.guide.width, height: input.guide.height }],
    output_aspect_ratio: input.aspectRatio };
  const requirements = input.userRequirements.trim() ? {
    user_requirements: input.userRequirements,
    ...(input.prompt?.version >= AGENT_USER_REQUIREMENTS_MIN_VERSION ? { user_requirements_rule: USER_REQUIREMENTS_RULE } : {}),
  } : {};
  return JSON.stringify({ ...requirements, camera });
}

// --- 两阶段共用冻结复核；Agent收费结束后再次验证再进入图片调用 ---
async function validatePrepared(input, getModels, getPrompt, qwenClient) {
  const direct = input.generationMode === 'direct';
  let asset;
  if (!direct) {
    const { version, sha256, source } = input.prompt;
    asset = checkAsset(await getPrompt({ version, expectedSha256: sha256, forceRefresh: true }), version, sha256);
    if (asset.source !== source) throw fail('摄影Prompt资产来源已变化，请刷新配置', 409);
  }
  const { aspectRatio, resolution } = input;
  const frozen = input.batch?.models ?? [input];
  const { models, agent } = await assertModels(frozen.map(item => item.modelKey), direct ? null : input.agentModelKey, getModels, qwenClient);
  if (!direct && agent.id !== input.agent.id) throw fail('生图或空间推理模型身份已变更，请刷新配置', 409);
  models.forEach((model, index) => {
    const snapshot = frozen[index];
    if (model.id !== snapshot.model.id || model.provider !== snapshot.model.provider) {
      throw fail('生图或空间推理模型身份已变更，请刷新配置', 409);
    }
    assertModelSettings(model, resolution, aspectRatio);
    if (snapshot.complexity !== snapshot.defaults.complexity
      || (snapshot.complexity !== null && !model.complexityOptions.includes(snapshot.complexity))) {
      throw fail('所选思考强度或模型能力已变更，请刷新配置', 409);
    }
    if (model.sizes[aspectRatio][resolution] !== snapshot.model.sizes[aspectRatio][resolution]
      || model.defaults.quality !== snapshot.model.defaults.quality || model.defaults.outputFormat !== snapshot.model.defaults.outputFormat) {
      throw fail('所选模型出图能力已变更，请刷新配置', 409);
    }
  });
  return { asset, models, agent };
}
export function compileFloorPlanCameraPrompt(input, agentText) {
  const { viewSummary, scenePrompt } = parseFloorPlanCameraOutput(agentText, { version: input.prompt?.version });
  if (scenePrompt.length < 3) throw fail('画面提示词长度需要在 3–32000 字符之间', 502);
  if (input.prompt?.version >= EYE_LEVEL_PROMPT_MIN_VERSION) {
    const photography = input.prompt.version >= FREEFORM_FRAME_PROMPT_MIN_VERSION
      ? `Architectural photograph, ${CAMERA_PHOTOGRAPHY_PROFILE}. Match the marked view with a rectilinear ${equivalentFocalLengthMm(input.camera.fov)} mm equivalent lens and straight architectural verticals. Render natural ${CAMERA_EXPOSURE_PROFILE}, smooth highlight roll-off, readable shadows and fine material texture.`
      : '';
    const compiledPrompt = [
      'Create a realistic, eye-level interior photograph from the camera marked on the floor plan, showing only what is visible from that position and direction.',
      scenePrompt,
      input.prompt.version < AGENT_USER_REQUIREMENTS_MIN_VERSION && input.userRequirements.trim() ? input.userRequirements : '',
      photography,
      input.guide?.bilateralOpening ? 'Keep both near wall edges and the clear view between them. Exclude objects and openings hidden by either near wall.' : '',
      input.prompt.version < STRUCTURED_FRAME_PROMPT_MIN_VERSION ? 'Follow the plan walls and openings and omit all floor plan graphics and markings.' : '',
    ].filter(Boolean).join('\n\n');
    return { viewSummary, scenePrompt, compiledPrompt };
  }
  const { fov, height } = input.camera;
  const focalLength = equivalentFocalLengthMm(fov);
  const visibility = input.guide?.visibilityMode === ESTIMATED_VISIBILITY
    ? 'Use the pale blue fill as an estimate of horizontal visibility and check it against the plan walls and openings.'
    : 'Trace the visible interior from the dashed angle using the plan walls and openings.';
  const photography = [
    `Architectural photograph, ${CAMERA_PHOTOGRAPHY_PROFILE}. Use the frozen camera at ${height} m, with a rectilinear ${focalLength} mm equivalent lens matching the ${fov}° horizontal field of view. Keep this camera position, viewing direction, framing and perspective if the scene description suggests different optics. Preserve straight architectural lines and readable depth.`,
    `Render the natural result of ${CAMERA_EXPOSURE_PROFILE}. Balance interior and any visible exterior exposure, with smooth highlight roll-off and shadow detail. Keep believable contact shadows, soft tonal transitions, fine material texture and restrained reflections. Avoid artificial HDR halos, fake blur and plastic gloss.`,
  ].join(' ');
  const compiledPrompt = prependDesignUserRequirements(`${REFERENCE_INSTRUCTIONS} ${visibility} ${OCCLUSION_INSTRUCTIONS}\n\n${photography}\n\n${scenePrompt}`,
    input.userRequirements.trim() ? input.userRequirements : '');
  return { viewSummary, scenePrompt, compiledPrompt };
}
function safeExecutionError(error, phase) {
  return error?.floorPlanSafe ? error : fail(phase === 'agent'
    ? '空间推理未完成，未调用生图模型；请检查原任务，不会自动重试'
    : '室内效果图任务未完成，请检查原任务，不会自动重试', 502);
}

async function generateCameraQwenImage(client, prompt, images, onProgress) {
  const response = await client.generateImage({ prompt, images, width: QWEN_WIDTH, height: QWEN_HEIGHT,
    resolution: QWEN_RESOLUTION }, { onProgress });
  return { url: response.images[0].url, response, actual: { requestedSize: QWEN_SIZE,
    nativeOutputWidth: QWEN_WIDTH, nativeOutputHeight: QWEN_HEIGHT, nativeFormat: 'png',
    nativeSha256: response.metadata.outputSha256, outputFormat: 'png', outputConverted: false,
    outputResolution: QWEN_RESOLUTION, quality: null, sizeMatched: true, outputResized: false,
    provider: 'comfyui', transport: response.transport, comfyui: response.metadata } };
}

async function renderFloorPlanCameraImage(input, { client, qwenClient, common, onProgress, startedAt, assertConnection, agentReceipt }) {
  assertConnection();
  let imageResponse;
  try {
    const prompt = common.compiledPrompt, images = [{ image_url: input.guide.imageUrl }];
    const result = input.model.key === QWEN_KEY
      ? await generateCameraQwenImage(qwenClient, prompt, images, onProgress)
      : await generateFloorPlanImage(input, { client, prompt, images, onProgress, ratio: input.aspectRatio, generationMode: IMAGE_GENERATION_MODE });
    imageResponse = result.response;
    const bytes = decodeImageDataUrl(result.url), metadata = await sharp(bytes).metadata();
    const image = { url: result.url, width: metadata.width, height: metadata.height, type: 'image/png', sha256: hash(bytes) };
    const imageReceipt = receipt(imageResponse);
    return { ...common, image, model: agentIdentity(input.model), requestedComplexity: input.complexity, ...imageReceipt,
      receipts: { ...(agentReceipt ? { agent: agentReceipt } : {}), image: imageReceipt }, durationMs: Date.now() - startedAt,
      actual: { ...result.actual, ...CAMERA_REFERENCE, generationMode: IMAGE_GENERATION_MODE, referenceImageSha256: input.guide.sha256,
        ...(input.guide.crop ? { referenceImageCrop: input.guide.crop } : {}),
        ...(input.generationMode === 'direct' ? { referenceImageFormat: input.guide.format, referenceImageWidth: input.guide.width,
          referenceImageHeight: input.guide.height } : { agentInputImageSha256: input.guide.sha256, agentInputImageFormat: input.guide.format,
          agentInputImageWidth: input.guide.width, agentInputImageHeight: input.guide.height }),
        visibilityMode: input.guide.visibilityMode, fullFrameEquivalentFocalLengthMm: equivalentFocalLengthMm(input.camera.fov),
        camera: input.camera, aspectRatio: input.aspectRatio, outputSha256: image.sha256,
        actualOutputWidth: image.width, actualOutputHeight: image.height, exactCameraGeometry: false } };
  } catch (error) {
    const safe = safeExecutionError(error, 'image');
    safe.floorPlanDiagnostic = receipt(imageResponse || error.floorPlanDiagnostic || error);
    throw safe;
  }
}

async function renderFloorPlanCameraBatch(input, common, options) {
  const items = input.batch.models.flatMap(model => Array.from({ length: input.batch.imageCount }, (_, index) => ({
    ...model, key: model.modelKey, label: model.model.label, index: index + 1,
  })));
  const outcomes = await runGenerationJobBatch({ items, concurrency: 2, onProgress: options.onProgress,
    execute: async item => {
      const model = agentIdentity(item.model);
      try {
        const result = await renderFloorPlanCameraImage({ ...input, ...item }, { ...options, common, agentReceipt: null, onProgress: undefined });
        return { model, index: item.index, status: 'success', result, error: null };
      } catch (error) {
        return { model, index: item.index, status: 'failed', result: null, error: safeExecutionError(error, 'image').message,
          receipt: receipt(error.floorPlanDiagnostic || error) };
      }
    },
  });
  return { ...common, imageCount: input.batch.imageCount, items: outcomes.map(outcome => outcome.value),
    receipts: options.agentReceipt ? { agent: options.agentReceipt } : {}, durationMs: Date.now() - options.startedAt };
}

function executionFailure(input, error, phase, agentResponse) {
  const missingAgentOutput = phase === 'agent' && input.prompt.version >= STRUCTURED_FRAME_PROMPT_MIN_VERSION
    && ['incomplete_prompt', 'empty_prompt'].includes(error?.code);
  const diagnosticPhase = missingAgentOutput ? 'agent_output' : phase;
  const safe = missingAgentOutput
    ? Object.assign(fail('空间推理未能返回完整的画面说明，未调用生图模型', 502), { code: 'camera_agent_output_invalid' })
    : safeExecutionError(error, phase);
  safe.floorPlanDiagnostic = { phase: diagnosticPhase,
    ...(diagnosticPhase === 'agent_output' && safe.code ? { code: safe.code } : {}),
    ...(input.generationMode === 'direct' ? {} : { agent: receipt(agentResponse || (phase === 'agent' ? error : null)) }),
    image: receipt(phase === 'image' ? error.floorPlanDiagnostic || error : null) };
  return safe;
}

async function analyzeFloorPlanCameraView(input, { client, asset, agent, onProgress, assertConnection }) {
  let phase = 'validation', agentResponse;
  try {
    assertConnection();
    phase = 'agent';
    onProgress({ message: '空间推理模型正在分析机位、可见空间与画面质感…' });
    agentResponse = await client.generatePrompt({ model: agent.id, imageUrl: input.guide.imageUrl,
      ...(asset.version >= STRUCTURED_FRAME_PROMPT_MIN_VERSION ? { maxOutputTokens: 8192, requireCompleteOutput: true } : {}),
      systemPrompt: asset.prompt, userPrompt: buildFloorPlanCameraAgentInput(input) });
    phase = input.prompt.version >= STRUCTURED_FRAME_PROMPT_MIN_VERSION ? 'agent_output' : 'validation';
    return { ...compileFloorPlanCameraPrompt(input, agentResponse.text), agentReceipt: receipt(agentResponse) };
  } catch (error) { throw executionFailure(input, error, phase, agentResponse); }
}

export async function executeFloorPlanCamera(input, { client, qwenClient, getModels, getPrompt = getFloorPlanCameraPrompt,
  onProgress = () => {}, assertConnection = () => {}, reuseAnalysis = run => run() } = {}) {
  const startedAt = Date.now();
  const direct = input.generationMode === 'direct';
  let phase = 'validation', agentReceipt;
  try {
    const { asset, models, agent } = await validatePrepared(input, getModels, getPrompt, qwenClient);
    const imageMethodsReady = models.every(model => model.key === QWEN_KEY
      ? typeof qwenClient?.generateImage === 'function'
      : typeof client?.[FLOOR_PLAN_GPT_MODEL_KEYS.includes(model.key) ? 'editImageAsync' : 'generateImage'] === 'function');
    if (!imageMethodsReady || (!direct && typeof client?.generatePrompt !== 'function')) {
      throw fail(direct ? '生图模型连接未就绪' : '空间推理或生图模型连接未就绪', 409);
    }
    let promptOutput;
    if (direct) {
      promptOutput = { generationMode: 'direct', compiledPrompt: input.userRequirements };
    } else {
      const { viewSummary, scenePrompt, compiledPrompt, agentReceipt: analysisReceipt } = await reuseAnalysis(
        () => analyzeFloorPlanCameraView(input, { client, asset, agent, onProgress, assertConnection }));
      agentReceipt = analysisReceipt;
      promptOutput = { agent, viewSummary, scenePrompt, compiledPrompt, prompt: identity(asset) };
      await validatePrepared(input, getModels, getPrompt, qwenClient);
    }
    phase = 'image';
    onProgress({ message: '正在参考机位标注图生成室内效果图…' });
    const common = { action: 'render', featureMode: 'floorPlanCamera', workflowVersion: input.workflowVersion,
      pipeline: direct ? DIRECT_PIPELINE : FLOOR_PLAN_CAMERA_PIPELINE, source: input.source, camera: input.camera,
      userRequirements: input.userRequirements, resolution: input.resolution, aspectRatio: input.aspectRatio,
      ...promptOutput, compiledPromptSha256: hash(promptOutput.compiledPrompt) };
    const options = { client, qwenClient, onProgress, startedAt, assertConnection, agentReceipt };
    return input.batch
      ? await renderFloorPlanCameraBatch(input, common, options)
      : await renderFloorPlanCameraImage({ ...input, model: models[0] }, { ...options, common });
  } catch (error) {
    if (error?.floorPlanDiagnostic?.phase) throw error;
    throw executionFailure(input, error, phase, agentReceipt);
  }
}

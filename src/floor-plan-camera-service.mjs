/**
 * [INPUT]: 依赖独立飞书空间推理Agent、共享视觉模型目录/相机JSON输出合同、平面图解码与图生图执行、共享有界批任务与机位遮挡计算、sharp标注绘制
 * [OUTPUT]: 提供带双侧近墙估算的单次推理与同图同词批量生图、逐图回执、批次边界、等效焦距与人眼平视成图词、历史单图合同和冻结配置复核
 * [POS]: src 的平面图摄影独立服务，复用floor-plan-api任务隔离，不执行几何重建或自动重试
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { normalizeFloorPlanReferenceImage, generateFloorPlanImage,
  FLOOR_PLAN_MODEL_KEY, FLOOR_PLAN_GPT_MODEL_KEYS, FLOOR_PLAN_IMAGE_POLICY } from './floor-plan-service.mjs';
import { publicModelCatalog, normalizeImageComplexity } from './model-config.mjs';
import { decodeImageDataUrl, fitImageDataUrlForRequest } from './image-artifact.mjs';
import { getFloorPlanCameraPrompt, FLOOR_PLAN_CAMERA_PROMPT_CODE, FLOOR_PLAN_CAMERA_PROMPT_MIN_VERSION } from './floor-plan-camera-prompt.mjs';
import { agentModelOrThrow, checkAgentModelAvailability } from './agent-model-config.mjs';
import { prependDesignUserRequirements } from './design-prompt-output.mjs';
import { parseFloorPlanCameraOutput } from './floor-plan-camera-output.mjs';
import { runGenerationJobBatch } from './generation-jobs.mjs';
import { CAMERA_FOV_LIMITS, equivalentFocalLengthMm } from '../public/floor-plan-camera-geometry.js';
import { FLOOR_PLAN_WALL_ANALYSIS_MAX_SIDE, detectFloorPlanWalls, cameraVisibilityAnalysis } from '../public/floor-plan-camera-visibility.js';

export const FLOOR_PLAN_CAMERA_WORKFLOW = '2026-11-07.floor-plan-camera.9';
export const FLOOR_PLAN_CAMERA_PIPELINE = 'camera-view-agent-to-image-reference';
export const FLOOR_PLAN_CAMERA_DEFAULTS = Object.freeze({ x: .5, y: .5, heading: 0, fov: 60, height: 1.5 });
export const FLOOR_PLAN_CAMERA_LIMITS = Object.freeze({ fov: [CAMERA_FOV_LIMITS.min, CAMERA_FOV_LIMITS.max], height: [.8, 2.2] });
const EYE_LEVEL_PROMPT_MIN_VERSION = 6;
const BILATERAL_OCCLUSION_PROMPT_MIN_VERSION = 7;
const LEGACY_WORKFLOW = '2026-11-07.floor-plan-camera.8';
const BATCH_LIMITS = Object.freeze({ imageCounts: Object.freeze([1, 2, 3, 4]), maxImages: 12 });
const CAMERA_REFERENCE = Object.freeze({ referenceImageCount: 1, referenceImageRole: 'camera-annotated-plan' });
const IMAGE_GENERATION_MODE = 'image-to-image';
const ESTIMATED_VISIBILITY = 'estimated-wall-occlusion';
const ANGLE_ONLY = 'angle-only';
const OCCLUDED_PLAN_WASH_OPACITY = 0.94;
const REFERENCE_INSTRUCTIONS = 'Use the attached floor plan to fix the view. The blue C marks the camera, the arrow its direction, and the dashed sector its horizontal angle. The sector radius does not limit distance.';
const OCCLUSION_INSTRUCTIONS = 'An opaque wall ends each sightline at the first hit. Show spaces beyond walls only along sightlines through confirmed openings. Treat unspecified door states as uncertain. Respect furniture orientation. Where the description conflicts with the plan geometry, follow the plan. Keep plan graphics, labels and camera marks out of the photograph.';
const RESOLUTIONS = Object.freeze(['1K', '2K', '4K']);
const ASPECT_RATIOS = Object.freeze(['16:9', '4:3', '1:1']);
const hash = value => createHash('sha256').update(value).digest('hex');
const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode, floorPlanSafe: true });
const identity = ({ code, name, version, sha256, source, tableUrl }) => ({ code, name, version, sha256, source, tableUrl });
const pngUrl = bytes => `data:image/png;base64,${bytes.toString('base64')}`;
const agentIdentity = ({ key, id, label }) => ({ key, id, label });
function receipt(response) {
  const rawId = response?.requestId || response?.responseId;
  const requestId = typeof rawId === 'string' ? rawId.replace(/\bsk-[a-zA-Z0-9_-]{8,}\b/g, '[已移除凭据]').replace(/[\u0000-\u001f]/g, '').slice(0, 160) : null;
  const usageCost = Object.fromEntries(Object.entries(response?.usageCost || {}).filter(([key, value]) =>
    ['cost', 'costUsd', 'nativeAmount', 'exchangeRate'].includes(key) && typeof value === 'number' && Number.isFinite(value) && value >= 0));
  if (/^[A-Z]{3}$/.test(response?.usageCost?.currency || '')) usageCost.currency = response.usageCost.currency;
  return { requestId, usageCost };
}

export function validateFloorPlanCamera(value) {
  const keys = ['x', 'y', 'heading', 'fov', 'height'];
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length
    || keys.some(key => typeof value[key] !== 'number' || !Number.isFinite(value[key]))) throw fail('相机参数不完整或不是有效数字');
  if (value.x < 0 || value.x > 1 || value.y < 0 || value.y > 1) throw fail('请把相机放在平面图范围内');
  if (value.heading < 0 || value.heading >= 360) throw fail('相机朝向须在0度至360度之间（不含360度）');
  if (value.fov < CAMERA_FOV_LIMITS.min || value.fov > CAMERA_FOV_LIMITS.max) throw fail('相机视野须在35至100度之间');
  if (value.height < .8 || value.height > 2.2) throw fail('相机高度须在0.8至2.2米之间');
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
  return { models, agentModels: checkAgentModelAvailability(catalog) };
}
function assertModelSettings(model, resolution, aspectRatio) {
  if (!model?.sizes[aspectRatio]?.[resolution]) throw fail(`${model?.label || '所选模型'}不支持 ${aspectRatio} / ${resolution}，请重新选择出图尺寸`);
}
function modelComplexity(model, value) {
  try { return normalizeImageComplexity(model.id, value); }
  catch (error) { throw fail(error.message); }
}
async function assertModels(modelKeys, agentModelKey, getModels) {
  const { models, agentModels } = await modelOptions(getModels);
  const selected = modelKeys.map(key => {
    const model = models.find(item => item.key === key);
    if (!model?.available) throw fail(model?.reason || '所选摄影模型不可用，请刷新模型配置', 409);
    return model;
  });
  const agent = agentModels.find(item => item.key === agentModelKey);
  if (!agent?.selectable) throw fail('所选空间推理模型不可用或不支持图片，请刷新后重新选择', 409);
  return { models: selected, agent: agentIdentity(agent) };
}
function checkAsset(asset, version, sha256) {
  if (!asset?.published || asset.code !== FLOOR_PLAN_CAMERA_PROMPT_CODE || typeof asset.prompt !== 'string' || !asset.prompt.trim()
    || asset.prompt.length > 16000 || !Number.isSafeInteger(asset.version) || asset.version < FLOOR_PLAN_CAMERA_PROMPT_MIN_VERSION
    || hash(asset.prompt) !== asset.sha256 || (version !== undefined && asset.version !== version)
    || (sha256 !== undefined && asset.sha256 !== sha256)) throw fail('平面图摄影Prompt身份已变化，请刷新配置', 409);
  return asset;
}

export async function readFloorPlanCameraConfig({ getModels, getPrompt = getFloorPlanCameraPrompt } = {}) {
  const [modelResult, assetResult] = await Promise.allSettled([modelOptions(getModels), getPrompt({ forceRefresh: true })]);
  const { models, agentModels } = modelResult.status === 'fulfilled' ? modelResult.value : { models: [], agentModels: [] };
  let prompt = null, reason = null;
  if (assetResult.status === 'fulfilled') {
    try { prompt = identity(checkAsset(assetResult.value)); }
    catch (error) { reason = error.message; }
  } else reason = '平面图摄影Prompt未就绪，请刷新配置';
  if (!reason && !models.some(model => model.available)) reason = '当前OneAPI Key没有可用的生图模型';
  if (!reason && !agentModels.some(model => model.selectable)) reason = '当前OneAPI Key没有可用的空间推理模型';
  return { featureMode: 'floorPlanCamera', workflowVersion: FLOOR_PLAN_CAMERA_WORKFLOW, pipeline: FLOOR_PLAN_CAMERA_PIPELINE, available: !reason, reason,
    models, defaultModel: FLOOR_PLAN_MODEL_KEY, agentModels,
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

// --- 先识别原图的墙体，叠加可见估算与镜头角度两层标记 ---
export async function createFloorPlanCameraGuide(reference, camera, { emphasizeVisibleArea = false } = {}) {
  const { width, height } = reference.source;
  const source = sharp(decodeImageDataUrl(reference.imageUrl));
  const { data, info } = await source.clone().resize(FLOOR_PLAN_WALL_ANALYSIS_MAX_SIDE, FLOOR_PLAN_WALL_ANALYSIS_MAX_SIDE,
    { fit: 'inside', withoutEnlargement: true }).toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const walls = detectFloorPlanWalls({ data, width: info.width, height: info.height });
  const visibility = cameraVisibilityAnalysis(camera, walls);
  const visible = visibility?.polygon;
  const bilateralOpening = emphasizeVisibleArea ? visibility?.bilateralOpening : null;
  const center = { x: camera.x * (width - 1), y: camera.y * (height - 1) };
  const length = Math.max(16, Math.min(width, height) * .25);
  const point = (heading, distance = length) => {
    const radians = (heading - 90) * Math.PI / 180;
    return { x: center.x + Math.cos(radians) * distance, y: center.y + Math.sin(radians) * distance };
  };
  const left = point(camera.heading - camera.fov / 2), right = point(camera.heading + camera.fov / 2);
  const target = point(camera.heading, length * .48), leftHead = point(camera.heading - 155, length * .10), rightHead = point(camera.heading + 155, length * .10);
  const stroke = Math.max(1, Math.min(width, height) / 300), radius = Math.max(5, Math.min(width, height) / 65);
  const visibilityPoints = visible?.map(({ x, y }) => `${x * (width - 1)},${y * (height - 1)}`);
  const shade = visibilityPoints ? `<polygon points="${visibilityPoints.join(' ')}" fill="#2563eb" fill-opacity=".14"/>` : '';
  const wash = bilateralOpening
    ? `<path d="M0,0 H${width} V${height} H0 Z M${visibilityPoints.join(' L')} Z" fill="white" fill-opacity="${OCCLUDED_PLAN_WASH_OPACITY}" fill-rule="evenodd"/>`
    : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    ${wash}
    ${shade}
    <path d="M${center.x},${center.y} L${left.x},${left.y} A${length},${length} 0 0 1 ${right.x},${right.y} Z" fill="none" stroke="#2563eb" stroke-opacity=".7" stroke-width="${stroke}" stroke-dasharray="${stroke * 5} ${stroke * 3}"/>
    <path d="M${center.x},${center.y} L${target.x},${target.y} M${target.x + leftHead.x - center.x},${target.y + leftHead.y - center.y} L${target.x},${target.y} L${target.x + rightHead.x - center.x},${target.y + rightHead.y - center.y}" stroke="#2563eb" stroke-width="${stroke * 2}" fill="none"/>
    <circle cx="${center.x}" cy="${center.y}" r="${radius}" fill="#2563eb" stroke="white" stroke-width="${stroke}"/>
    <text x="${center.x}" y="${center.y}" font-family="sans-serif" font-size="${radius * 1.3}" text-anchor="middle" dominant-baseline="central" fill="white">C</text>
  </svg>`;
  const bytes = await source.composite([{ input: Buffer.from(svg) }]).png().toBuffer();
  const imageUrl = pngUrl(bytes);
  if (imageUrl.length > 20_971_520) throw fail('相机标注图转换后过大，请降低平面图分辨率');
  return { imageUrl, sha256: hash(bytes), width, height, type: 'image/png',
    visibilityMode: visible ? ESTIMATED_VISIBILITY : ANGLE_ONLY, bilateralOpening: bilateralOpening ?? null };
}

export async function prepareFloorPlanCameraInput(input, { getModels, getPrompt = getFloorPlanCameraPrompt } = {}) {
  const allowed = ['action', 'workflowVersion', 'referenceImage', 'modelKey', 'agentModelKey', 'camera', 'resolution', 'aspectRatio', 'complexity', 'userRequirements', 'promptVersion', 'promptSha256', 'modelSelections', 'imageCount'];
  if (!input || typeof input !== 'object' || Array.isArray(input) || input.action !== 'render'
    || Object.keys(input).some(key => !allowed.includes(key))) throw fail('平面图摄影请求字段无效');
  const batch = Object.hasOwn(input, 'modelSelections') || Object.hasOwn(input, 'imageCount');
  if (input.workflowVersion !== FLOOR_PLAN_CAMERA_WORKFLOW && (batch || input.workflowVersion !== LEGACY_WORKFLOW)) {
    throw fail('机位图生成流程已更新，请整页刷新后再提交', 409);
  }
  const selections = readSelections(input, batch);
  const camera = validateFloorPlanCamera(input.camera);
  try { agentModelOrThrow(input.agentModelKey); }
  catch { throw fail('请选择支持图片的空间推理模型'); }
  const knownModels = supportedModels();
  const complexities = selections.map(selection => {
    const model = knownModels.find(item => item.key === selection.key);
    if (!model) throw fail('请选择支持的OneAPI生图模型');
    return modelComplexity(model, selection.complexity);
  });
  const resolution = input.resolution ?? '2K', aspectRatio = input.aspectRatio ?? '16:9';
  if (!RESOLUTIONS.includes(resolution) || !ASPECT_RATIOS.includes(aspectRatio)) throw fail('请选择支持的出图尺寸和画幅');
  const userRequirements = input.userRequirements ?? '';
  if (typeof userRequirements !== 'string' || userRequirements.length > 4000
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(userRequirements)) throw fail('摄影要求最多4000字且不能包含控制字符');
  if (!Number.isSafeInteger(input.promptVersion) || input.promptVersion < FLOOR_PLAN_CAMERA_PROMPT_MIN_VERSION || !/^[a-f0-9]{64}$/.test(input.promptSha256 || '')) throw fail('请刷新平面图摄影Prompt配置');
  const { models, agent } = await assertModels(selections.map(({ key }) => key), input.agentModelKey, getModels);
  const preparedModels = models.map((model, index) => {
    assertModelSettings(model, resolution, aspectRatio);
    const complexity = complexities[index];
    return { modelKey: model.key, model, complexity, defaults: { resolution, quality: model.defaults.quality, outputFormat: model.defaults.outputFormat, complexity } };
  });
  const reference = await normalizeFloorPlanReferenceImage(input.referenceImage);
  const prompt = checkAsset(await getPrompt({ version: input.promptVersion, expectedSha256: input.promptSha256, forceRefresh: true }), input.promptVersion, input.promptSha256);
  const guide = await createFloorPlanCameraGuide(reference, camera, { emphasizeVisibleArea: prompt.version >= BILATERAL_OCCLUSION_PROMPT_MIN_VERSION });
  // --- 一次冻结相机标注图，两阶段都只使用这份图 ---
  const { submittedSha256: normalizedSha256, ...originalSource } = reference.source;
  const source = { ...originalSource, normalizedSha256 };
  const originalGuideSha256 = guide.sha256;
  try { guide.imageUrl = await fitImageDataUrlForRequest(guide.imageUrl); }
  catch { throw fail('相机标注图超过请求限制，请降低图片分辨率'); }
  const guideBytes = decodeImageDataUrl(guide.imageUrl), guideMetadata = await sharp(guideBytes).metadata();
  Object.assign(guide, { originalSha256: originalGuideSha256, sha256: hash(guideBytes), width: guideMetadata.width,
    height: guideMetadata.height, type: `image/${guideMetadata.format}`, format: guideMetadata.format });
  return { action: 'render', workflowVersion: input.workflowVersion, agentModelKey: input.agentModelKey, agent, camera,
    resolution, aspectRatio, userRequirements, source, guide, prompt,
    ...(batch ? { batch: { models: preparedModels, imageCount: input.imageCount } } : preparedModels[0]) };
}

export function buildFloorPlanCameraAgentInput(input) {
  const estimated = input.guide.visibilityMode === ESTIMATED_VISIBILITY;
  const bilateralOpening = input.prompt?.version >= BILATERAL_OCCLUSION_PROMPT_MIN_VERSION && input.guide.bilateralOpening;
  const camera = { coordinate_system: 'normalized_0_1_top_left_origin', heading_convention: 'degrees_clockwise_0_up_90_right',
    position: { x: input.camera.x, y: input.camera.y }, heading_degrees: input.camera.heading,
    horizontal_fov_degrees: input.camera.fov, camera_height_meters: input.camera.height,
    full_frame_equivalent_focal_length_mm: equivalentFocalLengthMm(input.camera.fov),
    visibility_mode: estimated ? ESTIMATED_VISIBILITY : ANGLE_ONLY,
    field_of_view_interpretation: `虚线扇形表示水平角域，绘制半径不是最远可见距离。${estimated ? '淡蓝填色是识别墙线后的平面可见范围估算，请回看原图的墙和开口核对。' : '本图无可靠的可见范围填色，请沿镜头方向直接读图。'}每条视线遇到第一面实墙即停止。只通过确认的开口看见后方空间，门的开合状态未给出时保持不确定。`,
    ...(bilateralOpening ? { estimated_bilateral_occlusion: {
      farther_interval: [bilateralOpening.left, bilateralOpening.right], coordinate_system: 'normalized_frame_left_0_right_1',
      farther_plan_boundary: bilateralOpening.fartherBoundary,
    } } : {}),
    canonical_plan_pixels: { width: input.source.width, height: input.source.height },
    submitted_image_pixels: [{ image: 1, role: 'camera-annotated-plan', width: input.guide.width, height: input.guide.height }],
    output_aspect_ratio: input.aspectRatio };
  return JSON.stringify({ ...(input.userRequirements.trim() ? { user_requirements: input.userRequirements } : {}), camera });
}

// --- 两阶段共用冻结复核；Agent收费结束后再次验证再进入图片调用 ---
async function validatePrepared(input, getModels, getPrompt) {
  const asset = checkAsset(await getPrompt({ version: input.prompt.version, expectedSha256: input.prompt.sha256, forceRefresh: true }), input.prompt.version, input.prompt.sha256);
  if (asset.source !== input.prompt.source) throw fail('摄影Prompt资产来源已变化，请刷新配置', 409);
  const { aspectRatio, resolution } = input;
  const frozen = input.batch?.models ?? [input];
  const { models, agent } = await assertModels(frozen.map(item => item.modelKey), input.agentModelKey, getModels);
  if (agent.id !== input.agent.id) throw fail('生图或空间推理模型身份已变更，请刷新配置', 409);
  models.forEach((model, index) => {
    const snapshot = frozen[index];
    if (model.id !== snapshot.model.id) throw fail('生图或空间推理模型身份已变更，请刷新配置', 409);
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
  const { viewSummary, scenePrompt } = parseFloorPlanCameraOutput(agentText);
  if (scenePrompt.length < 3) throw fail('画面提示词长度需要在 3–32000 字符之间', 502);
  if (input.prompt?.version >= EYE_LEVEL_PROMPT_MIN_VERSION) {
    const compiledPrompt = [
      'Create a realistic, eye-level interior photograph from the camera marked on the floor plan, showing only what is visible from that position and direction.',
      scenePrompt,
      input.userRequirements.trim() ? input.userRequirements : '',
      input.guide?.bilateralOpening ? 'Keep both near wall edges and the clear view between them. Exclude objects and openings shown only in the faded area of the plan.' : '',
      'Follow the plan walls and openings and omit all floor plan graphics and markings.',
    ].filter(Boolean).join('\n\n');
    return { viewSummary, scenePrompt, compiledPrompt };
  }
  const { fov, height } = input.camera;
  const focalLength = equivalentFocalLengthMm(fov);
  const visibility = input.guide?.visibilityMode === ESTIMATED_VISIBILITY
    ? 'Use the pale blue fill as an estimate of horizontal visibility and check it against the plan walls and openings.'
    : 'Trace the visible interior from the dashed angle using the plan walls and openings.';
  const photography = [
    `Architectural photograph, Canon EOS R1 full-frame look at f/8 and ISO 100. Use the frozen camera at ${height} m, with a rectilinear ${focalLength} mm equivalent lens matching the ${fov}° horizontal field of view. Keep this camera position, viewing direction, framing and perspective if the scene description suggests different optics. Preserve straight architectural lines and readable depth.`,
    'Render the natural result of bracketed HDR with locked white balance. Balance interior and any visible exterior exposure, with smooth highlight roll-off and shadow detail. Keep believable contact shadows, soft tonal transitions, fine material texture and restrained reflections. Avoid artificial HDR halos, fake blur and plastic gloss.',
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

async function renderFloorPlanCameraImage(input, { client, common, onProgress, startedAt, assertConnection, agentReceipt }) {
  assertConnection();
  let imageResponse;
  try {
    const result = await generateFloorPlanImage(input, { client, prompt: common.compiledPrompt, onProgress, ratio: input.aspectRatio,
      generationMode: IMAGE_GENERATION_MODE, images: [{ image_url: input.guide.imageUrl }] });
    imageResponse = result.response;
    const bytes = decodeImageDataUrl(result.url), metadata = await sharp(bytes).metadata();
    const image = { url: result.url, width: metadata.width, height: metadata.height, type: 'image/png', sha256: hash(bytes) };
    const imageReceipt = receipt(imageResponse);
    return { ...common, image, model: agentIdentity(input.model), requestedComplexity: input.complexity, ...imageReceipt,
      receipts: { ...(agentReceipt ? { agent: agentReceipt } : {}), image: imageReceipt }, durationMs: Date.now() - startedAt,
      actual: { ...result.actual, ...CAMERA_REFERENCE, generationMode: IMAGE_GENERATION_MODE, referenceImageSha256: input.guide.sha256,
        agentInputImageSha256: input.guide.sha256, agentInputImageFormat: input.guide.format,
        agentInputImageWidth: input.guide.width, agentInputImageHeight: input.guide.height,
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
    receipts: { agent: options.agentReceipt }, durationMs: Date.now() - options.startedAt };
}

export async function executeFloorPlanCamera(input, { client, getModels, getPrompt = getFloorPlanCameraPrompt,
  onProgress = () => {}, assertConnection = () => {} } = {}) {
  const startedAt = Date.now();
  let phase = 'validation', agentResponse;
  try {
    const { asset, models, agent } = await validatePrepared(input, getModels, getPrompt);
    const imageMethodsReady = models.every(model => typeof client?.[FLOOR_PLAN_GPT_MODEL_KEYS.includes(model.key) ? 'editImageAsync' : 'generateImage'] === 'function');
    if (typeof client?.generatePrompt !== 'function' || !imageMethodsReady) throw fail('空间推理或生图模型连接未就绪', 409);
    phase = 'agent';
    onProgress({ message: '空间推理模型正在分析机位、可见空间与画面质感…' });
    agentResponse = await client.generatePrompt({ model: agent.id, imageUrl: input.guide.imageUrl,
      systemPrompt: asset.prompt, userPrompt: buildFloorPlanCameraAgentInput(input) });
    phase = 'validation';
    const { viewSummary, scenePrompt, compiledPrompt } = compileFloorPlanCameraPrompt(input, agentResponse.text);
    await validatePrepared(input, getModels, getPrompt);
    phase = 'image';
    onProgress({ message: '正在参考机位标注图生成室内效果图…' });
    const common = { action: 'render', featureMode: 'floorPlanCamera', workflowVersion: input.workflowVersion,
      pipeline: FLOOR_PLAN_CAMERA_PIPELINE, source: input.source, camera: input.camera, agent,
      userRequirements: input.userRequirements, resolution: input.resolution, aspectRatio: input.aspectRatio,
      viewSummary, scenePrompt, compiledPrompt, prompt: identity(asset), compiledPromptSha256: hash(compiledPrompt) };
    const options = { client, onProgress, startedAt, assertConnection, agentReceipt: receipt(agentResponse) };
    return input.batch
      ? await renderFloorPlanCameraBatch(input, common, options)
      : await renderFloorPlanCameraImage({ ...input, model: models[0] }, { ...options, common });
  } catch (error) {
    const safe = safeExecutionError(error, phase);
    safe.floorPlanDiagnostic = { phase,
      agent: receipt(agentResponse || (phase === 'agent' ? error : null)),
      image: receipt(phase === 'image' ? error.floorPlanDiagnostic || error : null) };
    throw safe;
  }
}

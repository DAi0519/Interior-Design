/**
 * [INPUT]: 依赖机位裁剪服务、实际 PNG 像素与机位归档投影，模型和资产均用本地替身
 * [OUTPUT]: 验证机位参数与外框准入、射线交集外接矩形裁剪、两侧上下文原色与留边、旧输入兼容、坐标换算、双阶段同图、直出原文和实际输入归档
 * [POS]: test 的机位视野裁剪合同回归，不把离线输入检查视为生成画质验收
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { buildFloorPlanCameraAgentInput, executeFloorPlanCamera, FLOOR_PLAN_CAMERA_WORKFLOW,
  prepareFloorPlanCameraInput, previewFloorPlanCameraInput, readFloorPlanCameraConfig,
  validateFloorPlanCamera } from '../src/floor-plan-camera-service.mjs';
import { floorPlanArchiveInput } from '../src/floor-plan-archive-input.mjs';
import { createFloorPlanApiHandler } from '../src/floor-plan-api.mjs';
import { normalizeBetaFloorPlanCameraInput } from '../src/beta-floor-plan-camera.mjs';
import { floorPlanCameraArchiveSnapshot } from '../src/beta-floor-plan-camera-archive.mjs';
import { MODEL_CONFIGS } from '../src/model-config.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const decode = url => Buffer.from(url.split(',')[1], 'base64');
const pngUrl = bytes => `data:image/png;base64,${bytes.toString('base64')}`;
const pose = { x: .5, y: .75, heading: 0, fov: 60, height: 1.5, showFrame: false };
const asset = { code: 'floor-plan-camera-frame-agent', name: '机位测试资产', version: 11, published: true,
  source: 'feishu:test:floor-plan-camera-frame-agent@v11', prompt: 'Describe only the visible scene.' };
asset.sha256 = hash(asset.prompt);
const getPrompt = async () => structuredClone(asset);
const getModels = async () => [{ id: 'gemini-3.1-pro-preview' }, { id: MODEL_CONFIGS.banana21.id }];
const deps = { getPrompt, getModels };
const unexpected = () => assert.fail('机位输入预览不应读取模型或运营资产');

async function sourceImage() {
  const bytes = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#faf0dc"/><rect x="190" y="30" width="20" height="30" fill="#00ffff"/><rect x="100" y="160" width="20" height="20" fill="#ff4040"/><rect x="280" y="160" width="20" height="20" fill="#40a0ff"/><rect x="10" y="160" width="20" height="20" fill="#ff00ff"/></svg>')).png().toBuffer();
  return { name: 'ray-crop-plan.png', type: 'image/png', size: bytes.length, dataUrl: pngUrl(bytes) };
}

async function request(camera = {}) {
  return { action: 'render', workflowVersion: FLOOR_PLAN_CAMERA_WORKFLOW,
    agentModelKey: 'gemini3pro', modelKey: 'banana21', promptVersion: asset.version, promptSha256: asset.sha256,
    camera: { ...pose, ...camera }, referenceImage: await sourceImage(), resolution: '1K', aspectRatio: '16:9',
    userRequirements: '  自然天光，保留可见家具。\n  ' };
}

async function pixel(imageUrl, x, y) {
  return [...await sharp(decode(imageUrl)).extract({ left: Math.round(x), top: Math.round(y), width: 1, height: 1 })
    .removeAlpha().raw().toBuffer()];
}

function submittedPixel(crop, x, y) {
  return { x: x - crop.bounds.left + crop.padding, y: y - crop.bounds.top + crop.padding };
}

test('相机使用数字原值、上零顺时针、坐标边界明确；拒绝隐式转换/未知字段/越界', () => {
  const camera = { x: .4, y: .6, heading: 90, fov: 60, height: 1.5 };
  assert.deepEqual(validateFloorPlanCamera(camera), camera);
  for (const guideDepth of [.05, .4333333333, 1.5]) {
    const pose = { ...camera, x: 0, y: 1, fov: 100, height: .8, guideDepth };
    assert.deepEqual(validateFloorPlanCamera(pose), pose);
  }
  for (const showFrame of [true, false]) {
    const pose = { ...camera, showFrame };
    assert.deepEqual(validateFloorPlanCamera(pose), pose);
  }
  for (const invalid of [{ x: '0.4' }, { x: -.01 }, { y: 1.01 }, { heading: 360 }, { heading: -1 }, { fov: 34 },
    { fov: 101 }, { height: .7 }, { height: 2.3 }, { fov: NaN }, { yaw: 0 }, { height: Infinity },
    ...[.049, 1.501, '.3', null, Infinity].map(guideDepth => ({ guideDepth })),
    ...['false', 0, null, undefined].map(showFrame => ({ showFrame }))]) {
    assert.throws(() => validateFloorPlanCamera({ ...camera, ...invalid }));
  }
  assert.throws(() => validateFloorPlanCamera({ x: 0, y: 0 }));
});

test('裁剪开关只接受布尔值，省略与关闭保留原图尺寸和相同标注字节', async () => {
  for (const cropToView of [true, false]) {
    const camera = { ...pose, cropToView };
    assert.deepEqual(validateFloorPlanCamera(camera), camera);
  }
  for (const cropToView of ['true', 1, null, undefined]) {
    assert.throws(() => validateFloorPlanCamera({ ...pose, cropToView }), { statusCode: 400 });
  }
  const config = await readFloorPlanCameraConfig(deps);
  assert.equal(config.cameraLimits.cropToView, true);
  const input = await request();
  const previous = await prepareFloorPlanCameraInput(input, deps);
  const disabled = await prepareFloorPlanCameraInput({ ...input, camera: { ...input.camera, cropToView: false } }, deps);
  assert.equal(previous.guide.imageUrl, disabled.guide.imageUrl);
  assert.equal(previous.guide.width, 400);
  assert.equal(previous.guide.height, 300);
  assert.equal(previous.guide.crop, undefined);
  assert.equal(disabled.guide.crop, undefined);
});

test('按无限射线交集的外接矩形裁边，保留左右角域外的原图内容并为机位标记留边', async () => {
  const input = await request({ cropToView: true });
  const prepared = await prepareFloorPlanCameraInput(input, deps);
  const { guide } = prepared;
  const crop = guide.crop;
  assert.equal(crop.mode, 'view-rays-bounds');
  assert.equal(crop.preservesContext, true);
  assert.deepEqual(crop.sourceSize, { width: 400, height: 300 });
  assert.ok(crop.polygon.length >= 3);
  assert.ok(crop.polygon.every(point => point.x >= 0 && point.x <= 399 && point.y >= 0 && point.y <= 299));
  assert.ok(crop.polygon.some(point => Math.abs(point.y) < 1e-6), '角域应延伸到原图顶边');
  assert.ok(guide.width < 400 && guide.height < 300, '实际送模图须裁去交集外的矩形边缘');
  assert.equal(guide.width, crop.bounds.width + 2 * crop.padding);
  assert.equal(guide.height, crop.bounds.height + 2 * crop.padding);
  assert.ok(Number.isSafeInteger(crop.padding) && crop.padding > 0);
  const inside = submittedPixel(crop, 200, 40);
  assert.deepEqual(await pixel(guide.imageUrl, inside.x, inside.y), [0, 255, 255], '超出显示三角远边的原图像素仍在角域内');
  // --- 两侧检查点在角域外、矩形内，用户要求保留为空间上下文 ---
  for (const [x, y, expected] of [[110, 170, [255, 64, 64]], [290, 170, [64, 160, 255]]]) {
    assert.ok(x >= crop.bounds.left && x < crop.bounds.left + crop.bounds.width);
    assert.ok(y >= crop.bounds.top && y < crop.bounds.top + crop.bounds.height);
    assert.ok(Math.abs(x - pose.x * 399) > (pose.y * 299 - y) * Math.tan(pose.fov * Math.PI / 360), '检查点确实在两侧射线角域外');
    const point = submittedPixel(crop, x, y);
    assert.deepEqual(await pixel(input.referenceImage.dataUrl, x, y), expected);
    assert.deepEqual(await pixel(guide.imageUrl, point.x, point.y), expected, '矩形内角域外的左右图纸须逐像素保留原色');
  }
  assert.ok(30 < crop.bounds.left, '外接矩形之外的品红检查块应被裁掉');
  const submitted = await sharp(decode(guide.imageUrl)).removeAlpha().raw().toBuffer();
  let outsideMarkerPixels = 0;
  for (let offset = 0; offset < submitted.length; offset += 3) {
    if (submitted[offset] === 255 && submitted[offset + 1] === 0 && submitted[offset + 2] === 255) outsideMarkerPixels++;
  }
  assert.equal(outsideMarkerPixels, 0, '恢复两侧上下文时不能退回整张原图');
  assert.deepEqual(await pixel(guide.imageUrl, 0, 0), [255, 255, 255]);
  const cameraPoint = { x: crop.cameraPosition.x * (guide.width - 1), y: crop.cameraPosition.y * (guide.height - 1) };
  assert.deepEqual(await pixel(guide.imageUrl, cameraPoint.x, cameraPoint.y), [37, 99, 235], '机位蓝点在裁剪后仍可辨识');
  assert.equal(guide.sha256, hash(decode(guide.imageUrl)));
  assert.notEqual(guide.sha256, prepared.source.sha256);
});

test('视野裁剪不受取景三角远边长度影响，边界朝外的空交集在模型调用前阻断', async () => {
  const input = await request({ cropToView: true });
  const near = await prepareFloorPlanCameraInput({ ...input, camera: { ...input.camera, guideDepth: .05 } }, deps);
  const far = await prepareFloorPlanCameraInput({ ...input, camera: { ...input.camera, guideDepth: 1.5 } }, deps);
  assert.deepEqual(near.guide.crop, far.guide.crop);
  assert.notEqual(near.guide.imageUrl, far.guide.imageUrl, '标注三角仍保留其独立交互含义');
  await assert.rejects(previewFloorPlanCameraInput({ referenceImage: input.referenceImage,
    camera: { ...pose, x: .5, y: 0, heading: 0, cropToView: true } }), { statusCode: 400 });
});

test('输入预览复用真实送模预处理，不读取模型或推理资产', async () => {
  const input = await request({ cropToView: true });
  const prepared = await prepareFloorPlanCameraInput(input, deps);
  const preview = await previewFloorPlanCameraInput({ referenceImage: input.referenceImage,
    camera: input.camera, promptVersion: asset.version }, { getModels: unexpected, getPrompt: unexpected });
  assert.equal(preview.imageUrl, prepared.guide.imageUrl);
  assert.equal(preview.sha256, prepared.guide.sha256);
  assert.deepEqual(preview.crop, prepared.guide.crop);
});

test('预览 API 只合成图像，不检查连接、创建任务或触发归档和收费调用', async () => {
  const input = await request({ cropToView: true });
  const body = { referenceImage: input.referenceImage, camera: input.camera, promptVersion: input.promptVersion };
  const responses = [];
  const handler = createFloorPlanApiHandler({ prefix: '/api/floor-plan-camera', featureMode: 'floorPlanCamera',
    geometryEnabled: false, previewInput: previewFloorPlanCameraInput,
    getClient: unexpected, getModels: unexpected, getPrompt: unexpected, requireKey: unexpected,
    prepareInput: unexpected, execute: unexpected, readConfig: unexpected,
    verifyArchive: unexpected, scheduleArchive: unexpected, getTaskTotal: unexpected,
    generationJobs: { get: unexpected, enqueue: unexpected, hasActiveJobs: () => false },
    readJson: async () => body, sendJson: (_response, status, value) => responses.push({ status, value }),
  });
  assert.equal(await handler({ method: 'POST' }, {}, '/api/floor-plan-camera/preview'), true);
  assert.equal(responses.length, 1);
  assert.equal(responses[0].status, 200);
  assert.equal(responses[0].value.crop.mode, 'view-rays-bounds');
  assert.equal(responses[0].value.crop.preservesContext, true);
  assert.equal(responses[0].value.sha256, hash(decode(responses[0].value.imageUrl)));
  assert.equal(handler.hasActiveJobs(), false);
});

test('Beta 仅在显式启用时保留裁剪配置，并冻结在归档机位快照中', async () => {
  const camera = { ...pose, cropToView: true };
  const input = { featureMode: 'floorPlanCamera', floorPlanCameraWorkflowVersion: FLOOR_PLAN_CAMERA_WORKFLOW,
    floorPlanCameraGenerationMode: 'direct', camera, modelKey: 'banana21', prompt: 'Look from the blue dot.',
    referenceImages: [await sourceImage()] };
  const normalized = normalizeBetaFloorPlanCameraInput(input);
  assert.deepEqual(normalized.camera, camera);
  assert.equal(floorPlanCameraArchiveSnapshot(normalized).camera.cropToView, true);
  const previous = normalizeBetaFloorPlanCameraInput({ ...input, camera: pose });
  assert.equal(Object.hasOwn(previous.camera, 'cropToView'), false);
});

test('Agent 主机位坐标对应裁后图片，原图坐标与裁切语义独立说明', async () => {
  const prepared = await prepareFloorPlanCameraInput(await request({ cropToView: true }), deps);
  const { camera } = JSON.parse(buildFloorPlanCameraAgentInput(prepared));
  assert.deepEqual(camera.position, prepared.guide.crop.cameraPosition);
  assert.deepEqual(camera.source_position, { x: pose.x, y: pose.y });
  assert.notDeepEqual(camera.position, camera.source_position);
  assert.equal(camera.heading_degrees, pose.heading);
  assert.equal(camera.horizontal_fov_degrees, pose.fov);
  assert.match(camera.field_of_view_interpretation, /矩形/);
  assert.match(camera.field_of_view_interpretation, /空间上下文/);
  assert.match(camera.field_of_view_interpretation, /不代表.*入镜|不.*全部入镜/);
  assert.match(camera.field_of_view_interpretation, /不是.*墙|不代表.*墙|不.*视为.*墙/);
  assert.doesNotMatch(camera.field_of_view_interpretation, /角域外蒙白|仅保留角域与原图的交集/);
  const mapped = submittedPixel(prepared.guide.crop, pose.x * 399, pose.y * 299);
  assert.ok(Math.abs(camera.position.x - mapped.x / (prepared.guide.width - 1)) < 1e-12);
  assert.ok(Math.abs(camera.position.y - mapped.y / (prepared.guide.height - 1)) < 1e-12);
  const legacy = JSON.parse(buildFloorPlanCameraAgentInput({ ...prepared,
    guide: { ...prepared.guide, crop: { ...prepared.guide.crop, mode: 'view-rays' } } })).camera;
  assert.match(legacy.field_of_view_interpretation, /角域外蒙白/, '旧任务冻结的角域裁图继续使用其原始说明');
  assert.doesNotMatch(legacy.field_of_view_interpretation, /空间上下文/);
});

test('空间推理与生图复用同一裁剪字节，实际裁剪和输入附件进入归档', async () => {
  const input = await request({ cropToView: true });
  const prepared = await prepareFloorPlanCameraInput(input, deps);
  const submissions = [];
  const [width, height] = MODEL_CONFIGS.banana21.sizes['16:9']['1K'].split('x').map(Number);
  const outputUrl = pngUrl(await sharp({ create: { width, height, channels: 3, background: 'white' } }).png().toBuffer());
  const result = await executeFloorPlanCamera(prepared, { ...deps, client: {
    async generatePrompt({ imageUrl }) {
      submissions.push(imageUrl);
      return { text: 'An empty wall directly ahead with warm oak flooring and soft natural daylight.' };
    },
    async generateImage({ images }) {
      assert.equal(images.length, 1);
      submissions.push(images[0].image_url);
      return { images: [{ url: outputUrl }] };
    },
  } });
  assert.deepEqual(submissions, [prepared.guide.imageUrl, prepared.guide.imageUrl]);
  assert.equal(result.actual.referenceImageSha256, prepared.guide.sha256);
  assert.equal(result.actual.agentInputImageSha256, prepared.guide.sha256);
  assert.deepEqual(result.actual.referenceImageCrop, prepared.guide.crop);
  const archive = floorPlanArchiveInput({ featureMode: 'floorPlanCamera', jobId: 'view-ray-crop-agent', result,
    sourceImage: input.referenceImage, submittedImageUrl: prepared.guide.imageUrl });
  assert.equal(archive.referenceImages.length, 2);
  assert.equal(archive.referenceImages[0].sha256, hash(decode(input.referenceImage.dataUrl)));
  assert.equal(archive.referenceImages[1].sha256, prepared.guide.sha256);
  assert.deepEqual(archive.workflow.actual.referenceImageCrop, prepared.guide.crop);
  assert.equal(archive.workflow.camera.cropToView, true);
});

test('裁剪直出仅改变图像输入，逐字保留用户提示词并保持零 Agent 调用', async () => {
  const original = await request({ cropToView: true });
  const { agentModelKey, promptVersion, promptSha256, ...direct } = original;
  const input = { ...direct, generationMode: 'direct', userRequirements: '  Imagine standing at the blue dot.\n\nKeep the visible furniture.\t  ' };
  const prepared = await prepareFloorPlanCameraInput(input, { getModels, getPrompt: unexpected });
  let imageCalls = 0;
  const [width, height] = MODEL_CONFIGS.banana21.sizes['16:9']['1K'].split('x').map(Number);
  const outputUrl = pngUrl(await sharp({ create: { width, height, channels: 3, background: 'white' } }).png().toBuffer());
  const result = await executeFloorPlanCamera(prepared, { getModels, getPrompt: unexpected, client: {
    generatePrompt: unexpected,
    async generateImage({ prompt, images }) {
      imageCalls++;
      assert.equal(prompt, input.userRequirements);
      assert.deepEqual(images, [{ image_url: prepared.guide.imageUrl }]);
      return { images: [{ url: outputUrl }] };
    },
  } });
  assert.equal(imageCalls, 1);
  assert.equal(result.compiledPrompt, input.userRequirements);
  assert.equal(result.compiledPromptSha256, hash(input.userRequirements));
  assert.equal(result.agent, undefined);
  assert.deepEqual(result.actual.referenceImageCrop, prepared.guide.crop);
});

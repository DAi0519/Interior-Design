/**
 * [INPUT]: 依赖平面图摄影服务、共享任务边界、真实PNG解码、OneAPI客户端及无网络HTTP/模型替身
 * [OUTPUT]: 验证机位图复用、双侧遮挡估算与旧资产隔离、人眼平视合同、九款模型HTTP与回执、批次准入与部分失败、幂等恢复
 * [POS]: test 的平面图摄影合同回归，不将离线通过当作真实视角画质验收
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { readFloorPlanCameraConfig, prepareFloorPlanCameraInput, executeFloorPlanCamera,
  validateFloorPlanCamera, buildFloorPlanCameraAgentInput, compileFloorPlanCameraPrompt,
  floorPlanCameraTaskTotal, FLOOR_PLAN_CAMERA_WORKFLOW } from '../src/floor-plan-camera-service.mjs';
import { createFloorPlanApiHandler } from '../src/floor-plan-api.mjs';
import { fitImageDataUrlForRequest } from '../src/image-artifact.mjs';
import { MODEL_CONFIGS, publicModelCatalog } from '../src/model-config.mjs';
import { createOneApiClient } from '../src/oneapi-client.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const asset = { code: 'floor-plan-camera-agent', name: '平面图摄影 Prompt', version: 2, published: true,
  source: 'feishu:test:floor-plan-camera-agent@v2', prompt: 'PRIVATE_PHOTOGRAPHY_RULE: image 1 is the camera-annotated floor plan.' };
asset.sha256 = hash(asset.prompt);
const getPrompt = async () => structuredClone(asset);
const getModels = async () => [{ id: 'gemini-3.1-pro-preview' }, { id: 'gpt-image-2.5-sunburst' }, { id: 'gpt-image-2.6-sunburst' }, { id: 'gpt-image-2.6-flare' }];
const getAllModels = async () => [{ id: 'gemini-3.1-pro-preview' }, ...publicModelCatalog().filter(model => model.provider === 'oneapi').map(({ id }) => ({ id }))];
const scenePrompt = 'A human-eye-level interior with the near wall on the left, a doorway ahead and natural oak materials with soft daylight.';
const viewSummary = '相机朝右，左侧近景墙面，正前方门洞；墙后与相机后方内容不入画。';
const agentOutput = JSON.stringify({ view_summary: viewSummary, image_prompt: scenePrompt });
const generatePrompt = async () => ({ text: agentOutput, requestId: 'agent-task', usageCost: { costUsd: .001 } });
const imageGeneration = { mode: 'image-to-image', referenceImageCount: 1, referenceImageRole: 'camera-annotated-plan' };
const backgroundModels = new Set(['gptImage25Sunburst', 'gptImage26Sunburst', 'gptImage26Flare']);
const camera = { x: .4, y: .6, heading: 90, fov: 60, height: 1.5 };
const image = (width = 320, height = 160) => sharp({ create: { width, height, channels: 3, background: '#eeeeee' } }).png().toBuffer();
const url = bytes => `data:image/png;base64,${bytes.toString('base64')}`;
async function input() {
  const bytes = await image();
  return { action: 'render', workflowVersion: FLOOR_PLAN_CAMERA_WORKFLOW, agentModelKey: 'gemini3pro', camera: { ...camera },
    referenceImage: { name: 'plan.png', type: 'image/png', size: bytes.length, dataUrl: url(bytes) },
    userRequirements: '  温暖自然的橡木客厅  ', promptVersion: asset.version, promptSha256: asset.sha256 };
}
const prepare = value => prepareFloorPlanCameraInput(value, { getModels, getPrompt });

function assertReferencePrompt(prompt, userRequirements) {
  const prefix = `user_requirements:\n${userRequirements}\n\n`;
  assert.ok(prompt.startsWith(prefix));
  assert.ok(prompt.endsWith(`\n\n${scenePrompt}`));
  const referenceInstruction = prompt.slice(prefix.length, -scenePrompt.length).trim();
  assert.match(referenceInstruction, /floor[ -]plan/i);
  assert.match(referenceInstruction, /C marks the camera.*arrow.*horizontal angle/i);
  assert.match(referenceInstruction, /conflicts with the plan geometry, follow the plan/i);
  assert.match(referenceInstruction, /plan graphics.*out of the photograph/i);
  assert.match(referenceInstruction, /Canon EOS R1 full-frame look at f\/8 and ISO 100/);
  assert.match(referenceInstruction, /bracketed HDR with locked white balance/);
  assert.ok(!prompt.includes(viewSummary));
  assert.ok(!prompt.includes(asset.prompt));
}

function assertImageReference(actual, guide) {
  assert.equal(actual.generationMode, imageGeneration.mode);
  assert.equal(actual.referenceImageCount, imageGeneration.referenceImageCount);
  assert.equal(actual.referenceImageRole, imageGeneration.referenceImageRole);
  assert.equal(actual.referenceImageSha256, guide.sha256);
  assert.equal(actual.agentInputImageSha256, guide.sha256);
}

function assertResponsesImage(body, prepared, background) {
  assert.equal(body.background, background);
  assert.equal(body.model, prepared.model.id);
  assert.equal(body.input.length, 1);
  assert.deepEqual(body.input[0].content.map(part => part.type), ['input_text', 'input_image']);
  assert.equal(body.input[0].content[1].image_url, prepared.guide.imageUrl);
  assertReferencePrompt(body.input[0].content[0].text, prepared.userRequirements);
  assert.equal(body.tools.length, 1);
  assert.equal(body.tools[0].type, 'image_generation');
  assert.equal(body.tools[0].n, 1);
  for (const key of ['images', 'input_image', 'guide', 'prompt', 'complexity', 'reasoning']) assert.equal(Object.hasOwn(body, key), false);
}

test('相机使用数字原值、上零顺时针、坐标边界明确；拒绝隐式转换/未知字段/越界', () => {
  assert.deepEqual(validateFloorPlanCamera(camera), camera);
  assert.deepEqual(validateFloorPlanCamera({ ...camera, x: 0, y: 1, fov: 100, height: .8 }), { ...camera, x: 0, y: 1, fov: 100, height: .8 });
  for (const invalid of [{ x: '0.4' }, { x: -.01 }, { y: 1.01 }, { heading: 360 }, { heading: -1 }, { fov: 34 },
    { fov: 101 }, { height: .7 }, { height: 2.3 }, { fov: NaN }, { yaw: 0 }, { height: Infinity }]) {
    assert.throws(() => validateFloorPlanCamera({ ...camera, ...invalid }));
  }
  assert.throws(() => validateFloorPlanCamera({ x: 0, y: 0 }));
});
test('配置仅含资产身份、默认2K/medium，全部生图模型独立按实际Key准入', async () => {
  const config = await readFloorPlanCameraConfig({ getModels: async () => [{ id: 'gpt-image-2.6-flare' }, { id: 'gemini-3.1-pro-preview' }], getPrompt });
  assert.equal(config.available, true); assert.equal(config.workflowVersion, FLOOR_PLAN_CAMERA_WORKFLOW);
  assert.equal(config.workflowVersion, '2026-11-07.floor-plan-camera.9');
  assert.deepEqual(config.batch, { imageCounts: [1, 2, 3, 4], maxImages: 12 });
  assert.equal(config.defaultResolution, '2K'); assert.equal(config.output.quality, 'medium');
  assert.equal(config.models.length, 9);
  assert.deepEqual(config.input, { referenceImageCount: 1, referenceImageRole: 'camera-annotated-plan' });
  assert.deepEqual(config.imageGeneration, imageGeneration);
  assert.deepEqual(config.models.find(model => model.key === 'seedream5').resolutions, ['2K', '4K']);
  assert.deepEqual(config.models.find(model => model.key === 'seedream5Pro').resolutions, ['1K', '2K']);
  assert.equal(config.models.find(model => model.key === 'banana21').maxReferenceImages, 4);
  assert.equal(config.models.some(model => model.key === 'aiTextureEnhancement'), false);
  assert.equal(config.models.find(model => model.key === 'gptImage26Flare').available, true);
  assert.equal(config.models.find(model => model.key === 'gptImage25Sunburst').available, false);
  for (const model of config.models) {
    assert.deepEqual(model.complexityOptions, model.key.startsWith('gptImage26') ? ['low', 'medium', 'high'] : []);
  }
  assert.ok(!JSON.stringify(config).includes('PRIVATE_'));
  const missing = await readFloorPlanCameraConfig({ getModels, getPrompt: async () => { throw Error('private credential'); } });
  assert.equal(missing.available, false); assert.equal(missing.prompt, null); assert.ok(!JSON.stringify(missing).includes('credential'));
});
test('真实解码保留原图身份，服务端同尺寸标注与机位变化一致', async () => {
  const original = await input(), prepared = await prepare(original);
  assert.equal(prepared.modelKey, 'gptImage25Sunburst'); assert.equal(prepared.source.sha256, hash(Buffer.from(original.referenceImage.dataUrl.split(',')[1], 'base64')));
  assert.equal(prepared.guide.width, 320); assert.equal(prepared.guide.height, 160);
  assert.notEqual(prepared.guide.sha256, prepared.source.normalizedSha256);
  assert.equal(prepared.imageUrl, undefined);
  assert.equal(prepared.source.submittedSha256, undefined);
  const shifted = await prepare({ ...original, camera: { ...camera, heading: 270 } });
  assert.notEqual(shifted.guide.sha256, prepared.guide.sha256);
  assert.equal(shifted.source.sha256, prepared.source.sha256);
  assert.equal(prepared.guide.visibilityMode, 'angle-only');
  const context = JSON.parse(buildFloorPlanCameraAgentInput(prepared));
  assert.equal(context.camera.visibility_mode, 'angle-only');
  assert.match(context.camera.field_of_view_interpretation, /无可靠的可见范围填色/);
  assert.match(compileFloorPlanCameraPrompt(prepared, agentOutput).compiledPrompt, /Trace the visible interior from the dashed angle/);
});
test('v7仅在双侧近墙可靠时淡化画外标注图，并向Agent提供画幅与平面边界', async () => {
  const walls = Buffer.from('<svg width="240" height="200"><rect width="240" height="200" fill="white"/><path d="M22 188V22H218V188H22 M22 110H102 M137 110H218" fill="none" stroke="black" stroke-width="4"/><rect x="47" y="71" width="20" height="14" fill="red"/></svg>');
  const bytes = await sharp(walls).png().toBuffer();
  const base = { ...await input(), camera: { x: .5, y: .75, heading: 0, fov: 90, height: 1.5 },
    referenceImage: { name: 'plan.png', type: 'image/png', size: bytes.length, dataUrl: url(bytes) } };
  const prepareVersion = version => prepareFloorPlanCameraInput({ ...base, promptVersion: version },
    { getModels, getPrompt: async () => ({ ...asset, version }) });
  const [legacy, detailed] = await Promise.all([prepareVersion(6), prepareVersion(7)]);
  assert.equal(JSON.parse(buildFloorPlanCameraAgentInput(legacy)).camera.estimated_bilateral_occlusion, undefined);
  const hint = JSON.parse(buildFloorPlanCameraAgentInput(detailed)).camera.estimated_bilateral_occlusion;
  assert.equal(hint.farther_plan_boundary.length, 5);
  assert.ok(hint.farther_interval[0] < .5 && hint.farther_interval[1] > .5);
  const pixel = async ({ guide }) => Array.from(await sharp(Buffer.from(guide.imageUrl.split(',')[1], 'base64'))
    .extract({ left: 57, top: 77, width: 1, height: 1 }).removeAlpha().raw().toBuffer());
  assert.deepEqual(await pixel(legacy), [255, 0, 0]);
  assert.ok((await pixel(detailed))[1] > 220);
  assert.notEqual(detailed.guide.sha256, legacy.guide.sha256);
  assert.match(compileFloorPlanCameraPrompt(detailed, agentOutput).compiledPrompt, /shown only in the faded area/);
});
test('同一张送模机位图只在首面实墙之前及开口视线内填色，两阶段核对墙体与门洞', async () => {
  const bytes = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="420" height="340">
    <rect width="420" height="340" fill="white"/>
    <rect x="28" y="26" width="364" height="289" fill="#f6f6f6" stroke="#181818" stroke-width="10"/>
    <path d="M207 26V137 M213 26V137 M207 162V315 M213 162V315" fill="none" stroke="#181818" stroke-width="2"/>
  </svg>`)).png().toBuffer();
  const value = { ...await input(), resolution: '1K', camera: { ...camera, x: .24, y: .5, fov: 80 },
    referenceImage: { name: 'walls-and-opening.png', type: 'image/png', size: bytes.length, dataUrl: url(bytes) } };
  const prepared = await prepare(value);
  assert.equal(prepared.guide.visibilityMode, 'estimated-wall-occlusion');
  const { data, info } = await sharp(Buffer.from(prepared.guide.imageUrl.split(',')[1], 'base64')).raw().toBuffer({ resolveWithObject: true });
  const hasBlueFill = (x, y) => {
    const index = (y * info.width + x) * info.channels;
    return data[index + 2] - data[index] > 12;
  };
  assert.equal(hasBlueFill(170, 137), true, '同侧墙前填色');
  assert.equal(hasBlueFill(235, 199), false, '实墙后没有填色');
  assert.equal(hasBlueFill(245, 140), true, '门洞仍保留视线');
  const result = await executeFloorPlanCamera(prepared, { getModels, getPrompt, client: {
    async generatePrompt(request) {
      assert.equal(request.imageUrl, prepared.guide.imageUrl);
      const context = JSON.parse(request.userPrompt);
      assert.equal(context.camera.visibility_mode, 'estimated-wall-occlusion');
      assert.match(context.camera.field_of_view_interpretation, /第一面实墙即停止/);
      return generatePrompt();
    },
    async editImageAsync(request) {
      assert.deepEqual(request.images, [{ image_url: prepared.guide.imageUrl }]);
      assert.match(request.prompt, /pale blue fill as an estimate/);
      assert.match(request.prompt, /first hit.*confirmed openings.*door states as uncertain/);
      return { images: [{ url: url(await image(1536, 864)) }] };
    },
  } });
  assertImageReference(result.actual, prepared.guide);
  assert.equal(result.actual.visibilityMode, 'estimated-wall-occlusion');
});
test('仅标注大图走共享压缩，原件SHA只作证据且实际送模摘要只对应标注图', async () => {
  const width = 1400, height = 1000, noise = Buffer.alloc(width * height * 3);
  let state = 13;
  for (let index = 0; index < noise.length; index++) { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; noise[index] = state & 255; }
  const bytes = await sharp(noise, { raw: { width, height, channels: 3 } }).png().toBuffer();
  const value = await input(); value.referenceImage = { name: 'large.png', type: 'image/png', size: bytes.length, dataUrl: url(bytes) };
  const prepared = await prepare(value);
  assert.equal(prepared.source.sha256, hash(bytes)); assert.equal(typeof prepared.source.normalizedSha256, 'string');
  assert.equal(prepared.source.submittedFormat, undefined); assert.equal(prepared.guide.format, 'jpeg');
  assert.notEqual(prepared.guide.sha256, prepared.guide.originalSha256);
  assert.equal(prepared.imageUrl, undefined);
  assert.equal(hash(Buffer.from(prepared.guide.imageUrl.split(',')[1], 'base64')), prepared.guide.sha256);
  assert.equal(await fitImageDataUrlForRequest(prepared.guide.imageUrl), prepared.guide.imageUrl);
});
test('Agent与生图共用唯一相机标注图，用户原文前置，独立横版画幅不跟随平面图比例，一次请求交付原生PNG', async () => {
  const prepared = await prepare(await input()); let calls = 0;
  const result = await executeFloorPlanCamera(prepared, { getModels, getPrompt, client: { generatePrompt,
    editImageAsync: async request => {
      calls++; assert.equal(request.n, 1); assert.equal(request.quality, 'medium'); assert.equal(request.model, 'gpt-image-2.5-sunburst');
      assert.equal(request.size, '2048x1152'); assert.deepEqual(request.images, [{ image_url: prepared.guide.imageUrl }]);
      assert.equal(Object.hasOwn(request, 'input_image'), false); assert.equal(Object.hasOwn(request, 'guide'), false);
      assert.ok(!Object.hasOwn(prepared, 'imageUrl'));
      assertReferencePrompt(request.prompt, prepared.userRequirements);
      const compiled = JSON.parse(buildFloorPlanCameraAgentInput(prepared));
      assert.equal(Object.keys(compiled)[0], 'user_requirements');
      assert.equal(compiled.camera.heading_convention, 'degrees_clockwise_0_up_90_right'); assert.equal(compiled.camera.heading_degrees, 90);
      assert.equal(compiled.camera.horizontal_fov_degrees, 60); assert.equal(compiled.camera.camera_height_meters, 1.5);
      assert.equal(compiled.camera.full_frame_equivalent_focal_length_mm, 31.2);
      assert.match(request.prompt, /31\.2 mm equivalent lens matching the 60° horizontal field of view/);
      assert.deepEqual(compiled.camera.submitted_image_pixels, [{ image: 1, role: 'camera-annotated-plan', width: prepared.guide.width, height: prepared.guide.height }]);
      const [width, height] = request.size.split('x').map(Number);
      return { images: [{ url: url(await image(width, height)) }], requestId: 'image-task', usageCost: { costUsd: .02, private: 'ignored' } };
    }
  } });
  assert.equal(calls, 1); assert.equal(result.image.width, 2048); assert.equal(result.image.height, 1152);
  assert.equal(result.actual.exactCameraGeometry, false); assertImageReference(result.actual, prepared.guide);
  assert.equal(result.actual.fullFrameEquivalentFocalLengthMm, 31.2);
  assert.deepEqual(result.camera, camera);
  assert.equal(result.actual.submittedImageSha256, undefined);
  assert.equal(result.actual.submittedSourceSha256, undefined);
  assert.deepEqual(result.usageCost, { costUsd: .02 }); assert.ok(!JSON.stringify(result).includes('PRIVATE_'));
});
test('显式GPT2.6/4K与画幅按模型真源传参；失权不切换默认模型', async () => {
  const value = { ...await input(), modelKey: 'gptImage26Flare', resolution: '4K', aspectRatio: '4:3' };
  const prepared = await prepare(value); let calls = 0;
  await assert.rejects(executeFloorPlanCamera(prepared, { getPrompt, getModels: async () => [{ id: 'gpt-image-2.5-sunburst' }],
    client: { generatePrompt, editImageAsync: async () => { calls++; } } }), /未开放|不可用/);
  assert.equal(calls, 0);
  const result = await executeFloorPlanCamera(prepared, { getModels, getPrompt, client: { generatePrompt, editImageAsync: async request => {
    assert.equal(request.model, 'gpt-image-2.6-flare'); assert.equal(request.size, '3264x2448');
    assert.deepEqual(request.images, [{ image_url: prepared.guide.imageUrl }]);
    return { images: [{ url: url(await image(3264, 2448)) }] };
  } } });
  assert.equal(result.resolution, '4K'); assert.equal(result.actual.outputResized, false);
});
test('同一机位的广角和窄视野使用各自焦距，摄影曝光约束保持一致', () => {
  const frames = [[38, 52.3], [86, 19.3]];
  for (const [fov, focalLength] of frames) {
    const { compiledPrompt } = compileFloorPlanCameraPrompt({ prompt: { version: 5 }, camera: { ...camera, fov }, userRequirements: '' }, agentOutput);
    assert.ok(compiledPrompt.includes(`${focalLength} mm equivalent lens matching the ${fov}° horizontal field of view`));
    assert.match(compiledPrompt, /f\/8 and ISO 100/);
    assert.match(compiledPrompt, /Keep this camera position, viewing direction, framing and perspective/);
  }
});
test('v6从人眼平视成图开场，随后保留家具可见面、画面尺度及用户原文', () => {
  const visibleScene = 'The sofa shows its near arm and a little of the seat. The 1.8 m opening ahead catches soft light.';
  const requirements = '用哑光橡木。\n保留墙面肌理。';
  const output = JSON.stringify({ view_summary: '摘要只用于核对', image_prompt: visibleScene });
  const compile = userRequirements => compileFloorPlanCameraPrompt({ prompt: { version: 6 }, camera, userRequirements }, output);
  const actual = compile(requirements);
  const opening = 'Create a realistic, eye-level interior photograph from the camera marked on the floor plan, showing only what is visible from that position and direction.';
  const guard = 'Follow the plan walls and openings and omit all floor plan graphics and markings.';
  assert.equal(actual.viewSummary, '摘要只用于核对');
  assert.equal(actual.scenePrompt, visibleScene);
  assert.deepEqual(actual.compiledPrompt.split('\n\n'), [opening, visibleScene, requirements, guard]);
  assert.deepEqual(compile(' \n ').compiledPrompt.split('\n\n'), [opening, visibleScene, guard]);
});
test('非法尺寸、字段、伪装图片与资产SHA均在收费前拒绝', async () => {
  const value = await input();
  for (const patch of [{ resolution: '8K' }, { aspectRatio: '2:1' }, { action: 'camera' }, { guideImage: 'client forged' },
    { promptSha256: 'b'.repeat(64) }, { modelKey: 'aiTextureEnhancement' }, { userRequirements: 'x'.repeat(4001) }]) {
    await assert.rejects(prepare({ ...value, ...patch }));
  }
  const corrupt = Buffer.from('not a valid png');
  await assert.rejects(prepare({ ...value, referenceImage: { name: 'broken.png', type: 'image/png', size: corrupt.length, dataUrl: url(corrupt) } }));
});
test('旧工作流页面和缺失版本的提交均要求刷新', async () => {
  const value = await input();
  for (const workflowVersion of [undefined, '2026-11-07.floor-plan-camera.5', '2026-11-07.floor-plan-camera.6', '2026-11-07.floor-plan-camera.7']) {
    await assert.rejects(prepare({ ...value, workflowVersion }), error => error.statusCode === 409 && /刷新/.test(error.message));
  }
});
test('执行前资产内容/SHA/来源变化均阻断，不暴露正文', async () => {
  const prepared = await prepare(await input()); let calls = 0;
  for (const changed of [{ ...asset, prompt: 'changed' }, { ...asset, source: 'feishu:other' }, { ...asset, published: false }]) {
    await assert.rejects(executeFloorPlanCamera(prepared, { getModels, getPrompt: async () => changed,
      client: { generatePrompt, editImageAsync: async () => { calls++; } } }), /变化|刷新/);
  }
  assert.equal(calls, 0);
});
test('图像异常只保留安全费用回执，不重试，不把错误尺寸当作成功', async () => {
  const prepared = await prepare(await input()); let calls = 0;
  await assert.rejects(executeFloorPlanCamera(prepared, { getModels, getPrompt, client: { generatePrompt, editImageAsync: async () => {
    calls++; throw Object.assign(Error('private body'), { requestId: 'failed-id', usageCost: { costUsd: .01 } });
  } } }), error => { assert.equal(error.floorPlanDiagnostic.image.requestId, 'failed-id'); assert.equal(error.floorPlanDiagnostic.image.usageCost.costUsd, .01); return !error.message.includes('private'); });
  assert.equal(calls, 1);
  await assert.rejects(executeFloorPlanCamera(prepared, { getModels, getPrompt, client: { generatePrompt,
    editImageAsync: async () => ({ images: [{ url: url(await image(512, 512)) }] })
  } }), /实际图片尺寸/);
});
test('独立命名空间复用同ID幂等；不同相机不能复用任务ID', async () => {
  let calls = 0;
  const api = createFloorPlanApiHandler({ prefix: '/api/floor-plan-camera', featureMode: 'floorPlanCamera', geometryEnabled: false,
    getClient: async () => ({}), getModels, prepareInput: async value => value,
    execute: async () => { calls++; return { featureMode: 'floorPlanCamera' }; }, readConfig: async () => ({}),
    readJson: async request => request.body, sendJson: (response, status, body) => Object.assign(response, { status, body }) });
  const call = async (method, path, body) => { const response = {}; const handled = await api({ method, url: path, body }, response, path); return { handled, ...response }; };
  assert.equal((await call('GET', '/api/floor-plan/config')).handled, false);
  assert.equal((await call('GET', '/api/floor-plan-camera/geometry-config')).handled, false);
  const body = { jobId: 'photography-test-123', action: 'render', camera };
  await call('POST', '/api/floor-plan-camera/jobs', body); await new Promise(resolve => setTimeout(resolve, 0));
  await call('POST', '/api/floor-plan-camera/jobs', body); assert.equal(calls, 1);
  const found = await call('GET', '/api/floor-plan-camera/jobs/photography-test-123'); assert.equal(found.body.job.featureMode, 'floorPlanCamera');
  await assert.rejects(call('POST', '/api/floor-plan-camera/jobs', { ...body, camera: { ...camera, heading: 0 } }), /不同输入/);
});

// --- 实际调用合同覆盖新增模型，不用可选项数量代替唯一标注图送模 ---
for (const modelKey of ['banana2', 'banana21', 'gptImage2', 'gptImage25Flare', 'seedream5', 'seedream5Pro']) {
  test(`${modelKey}共享单张机位图参考并记录JPEG转PNG的真实尺寸`, async () => {
    const prepared = await prepareFloorPlanCameraInput({ ...await input(), modelKey }, { getModels: getAllModels, getPrompt });
    let calls = 0;
    const result = await executeFloorPlanCamera(prepared, { getModels: getAllModels, getPrompt, client: { generatePrompt,
      generateImage: async request => {
        calls++;
        assert.equal(request.model, MODEL_CONFIGS[modelKey].id);
        assert.deepEqual(request.images, [{ image_url: prepared.guide.imageUrl }]); assert.equal(request.n, 1);
        assert.ok(!Object.hasOwn(prepared, 'imageUrl'));
        assert.equal(request.size, MODEL_CONFIGS[modelKey].sizes['16:9']['2K']);
        assert.equal(request.quality, MODEL_CONFIGS[modelKey].defaultQuality);
        assertReferencePrompt(request.prompt, prepared.userRequirements);
        const [width, height] = request.size.split('x').map(Number);
        const jpeg = await sharp(await image(width, height)).jpeg().toBuffer();
        return { images: [{ url: `data:image/jpeg;base64,${jpeg.toString('base64')}` }] };
      },
      editImageAsync: async () => { assert.fail('所选模型不能误走后台图像请求'); },
    } });
    assert.equal(calls, 1); assert.equal(result.model.key, modelKey);
    assert.equal(result.actual.nativeFormat, 'jpeg'); assert.equal(result.actual.outputConverted, true);
    assertImageReference(result.actual, prepared.guide); assert.equal(result.image.type, 'image/png');
    assert.equal(result.actual.outputResized, false); assert.equal(result.actual.sizeMatched, true);
  });
}
test('Lite的1K与Pro的4K在准备阶段拒绝，不暗改模型或尺寸', async () => {
  for (const [modelKey, resolution] of [['seedream5', '1K'], ['seedream5Pro', '4K']]) {
    await assert.rejects(prepareFloorPlanCameraInput({ ...await input(), modelKey, resolution },
      { getModels: getAllModels, getPrompt }), /不支持/);
  }
});
test('生图模型失权与执行前尺寸/质量能力漂移均零调用，不回退GPT', async () => {
  const prepared = await prepareFloorPlanCameraInput({ ...await input(), modelKey: 'banana21' }, { getModels: getAllModels, getPrompt });
  let calls = 0;
  const client = { generatePrompt, generateImage: async () => { calls++; } };
  await assert.rejects(executeFloorPlanCamera(prepared, { getModels, getPrompt, client }), /未开放/);
  const sizes = MODEL_CONFIGS.banana21.sizes['16:9'], originalSize = sizes['2K'];
  try {
    sizes['2K'] = '2048x1152';
    await assert.rejects(executeFloorPlanCamera(prepared, { getModels: getAllModels, getPrompt, client }), /能力已变更/);
  } finally { sizes['2K'] = originalSize; }
  const quality = MODEL_CONFIGS.banana21.defaultQuality;
  try {
    MODEL_CONFIGS.banana21.defaultQuality = 'high';
    await assert.rejects(executeFloorPlanCamera(prepared, { getModels: getAllModels, getPrompt, client }), /能力已变更/);
  } finally {
    if (quality === undefined) delete MODEL_CONFIGS.banana21.defaultQuality;
    else MODEL_CONFIGS.banana21.defaultQuality = quality;
  }
  assert.equal(calls, 0);
});
test('Banana真实4K横图允许超输入16MP，输出仍受模型请求像素上限保护', async () => {
  const prepared = await prepareFloorPlanCameraInput({ ...await input(), modelKey: 'banana21', resolution: '4K' },
    { getModels: getAllModels, getPrompt });
  const result = await executeFloorPlanCamera(prepared, { getModels: getAllModels, getPrompt, client: { generatePrompt, generateImage: async request => {
    assert.equal(request.size, '5504x3072');
    return { images: [{ url: url(await image(5504, 3072)) }] };
  } } });
  assert.equal(result.image.width, 5504); assert.equal(result.image.height, 3072);
  assert.equal(result.actual.outputResized, false); assert.equal(result.actual.sizeMatched, true);
  await assert.rejects(executeFloorPlanCamera(prepared, { getModels: getAllModels, getPrompt, client: { generatePrompt,
    generateImage: async () => ({ images: [{ url: url(await image(5505, 3072)) }] })
  } }), /生成未完成/);
});

test('GPT2.6 Sunburst使用异步单图参考，标注图与Agent输入同源', async () => {
  const prepared = await prepare({ ...await input(), modelKey: 'gptImage26Sunburst', resolution: '1K' });
  const result = await executeFloorPlanCamera(prepared, { getModels, getPrompt, client: { generatePrompt, editImageAsync: async request => {
    assert.equal(request.model, 'gpt-image-2.6-sunburst');
    assert.deepEqual(request.images, [{ image_url: prepared.guide.imageUrl }]);
    const [width, height] = request.size.split('x').map(Number);
    return { images: [{ url: url(await image(width, height)) }] };
  } } });
  assertImageReference(result.actual, prepared.guide);
  assert.equal(result.actual.submittedImageSha256, undefined);
});

test('GPT2.6两款默认及三档思考强度冻结到异步图生图工具字段，quality仍medium', async context => {
  const original = await input(), bytes = await image(1536, 864), calls = [];
  context.mock.method(globalThis, 'fetch', async (target, options) => {
    assert.equal(options.method, 'POST'); assert.ok(target.endsWith('/responses'));
    const body = JSON.parse(options.body); calls.push({ target, body });
    if (body.instructions) return Response.json({ id: 'agent-http', output: [{ type: 'message', content: [{ type: 'output_text', text: agentOutput }] }] });
    return Response.json({ id: 'resp_camera_complexity_test', status: 'completed',
      output: [{ type: 'image_generation_call', result: bytes.toString('base64') }] });
  });
  const client = createOneApiClient('test-key', { diagnosticSink: () => {} });
  for (const modelKey of ['gptImage26Sunburst', 'gptImage26Flare']) {
    for (const complexity of [undefined, 'low', 'medium', 'high']) {
      const draft = { ...original, modelKey, resolution: '1K', ...(complexity ? { complexity } : {}) };
      const prepared = await prepare(draft);
      draft.complexity = 'changed';
      assert.equal(prepared.complexity, complexity ?? null);
      assert.equal(prepared.defaults.complexity, complexity ?? null);
      const result = await executeFloorPlanCamera(prepared, { getModels, getPrompt, client });
      const { body } = calls.at(-1), agentBody = calls.at(-2).body;
      assert.equal(agentBody.model, 'gemini-3.1-pro-preview'); assert.equal(agentBody.instructions, asset.prompt);
      assert.deepEqual(agentBody.input[0].content.filter(item => item.type === 'input_image').map(item => item.image_url), [prepared.guide.imageUrl]);
      assertResponsesImage(body, prepared, true);
      assert.equal(body.input[0].content[0].text, result.compiledPrompt);
      assert.equal(body.tools[0].complexity, complexity);
      assert.equal(Object.hasOwn(body.tools[0], 'complexity'), complexity !== undefined);
      assert.equal(body.tools[0].quality, 'medium');
      assert.ok(!result.compiledPrompt.includes('view_summary'));
      assert.equal(result.requestedComplexity, complexity ?? null);
      assert.equal(Object.hasOwn(result.actual, 'complexity'), false);
    }
  }
  assert.equal(calls.length, 16);
  assert.equal(calls.filter(call => call.body.instructions).length, 8);
});

test('思考强度非法值/不支持模型在准备期400；执行前丢失选择或能力撤回均零调用', async () => {
  const original = await input(); let calls = 0, lookups = 0;
  const checkedModels = async () => { lookups++; return getAllModels(); };
  for (const complexity of ['', 'auto', 'xhigh', true, 0, [], {}]) {
    await assert.rejects(prepareFloorPlanCameraInput({ ...original, modelKey: 'gptImage26Sunburst', complexity },
      { getModels: checkedModels, getPrompt }), error => error.statusCode === 400 && /思考强度/.test(error.message));
  }
  for (const modelKey of publicModelCatalog().filter(model => model.provider === 'oneapi' && !model.complexityOptions.length).map(model => model.key)) {
    await assert.rejects(prepareFloorPlanCameraInput({ ...original, modelKey, complexity: 'high' },
      { getModels: checkedModels, getPrompt }), error => error.statusCode === 400 && /不支持独立思考强度/.test(error.message));
  }
  assert.equal(lookups, 0);
  const prepared = await prepare({ ...original, modelKey: 'gptImage26Flare', complexity: 'high' });
  const client = { generatePrompt, editImageAsync: async () => { calls++; } };
  await assert.rejects(executeFloorPlanCamera({ ...prepared, complexity: null }, { getModels, getPrompt, client }), /思考强度.*变更/);
  const originalOptions = MODEL_CONFIGS.gptImage26Flare.complexityOptions;
  try {
    MODEL_CONFIGS.gptImage26Flare.complexityOptions = ['low', 'medium'];
    await assert.rejects(executeFloorPlanCamera(prepared, { getModels, getPrompt, client }), /思考强度.*变更/);
  } finally { MODEL_CONFIGS.gptImage26Flare.complexityOptions = originalOptions; }
  assert.equal(calls, 0);
});

// --- 前置空间推理不是可选装饰：失败或中途漂移均不得继续收费出图 ---
test('空间推理目录与必选输入遵循视觉能力和Key权限，不静默换模型', async () => {
  const imageModels = [{ id: 'gpt-image-2.5-sunburst' }];
  const noAgent = await readFloorPlanCameraConfig({ getModels: async () => imageModels, getPrompt });
  assert.equal(noAgent.available, false); assert.equal(noAgent.defaultAgentModel, null);
  assert.equal(noAgent.pipeline, 'camera-view-agent-to-image-reference');
  const fallback = await readFloorPlanCameraConfig({ getModels: async () => [...imageModels, { id: 'deepseek-v4-pro' }, { id: 'gpt-5.5' }], getPrompt });
  assert.equal(fallback.available, true); assert.equal(fallback.defaultAgentModel, 'gpt');
  assert.equal(fallback.agentModels.find(model => model.key === 'deepseek4pro').selectable, false);
  const draft = await input();
  for (const agentModelKey of [undefined, '', 'missing', 'deepseek4pro']) {
    await assert.rejects(prepare({ ...draft, agentModelKey }), error => error.statusCode === 400);
  }
  await assert.rejects(prepare({ ...draft, agentModelKey: 'gpt' }), error => error.statusCode === 409);
  await assert.rejects(prepareFloorPlanCameraInput(draft, { getModels, getPrompt: async () => ({ ...asset, code: 'floor-plan-camera' }) }), /身份已变化/);
  await assert.rejects(prepareFloorPlanCameraInput(draft, { getModels, getPrompt: async () => ({ ...asset, version: 1 }) }), /身份已变化/);
  await assert.rejects(prepare({ ...draft, promptVersion: 1 }), /刷新/);
  const oldAsset = await readFloorPlanCameraConfig({ getModels, getPrompt: async () => ({ ...asset, version: 1 }) });
  assert.equal(oldAsset.available, false); assert.equal(oldAsset.prompt, null);
});

test('Agent只收单张标注图，JSON围栏仅取image_prompt生图，中文摘要及额外字段不送图并保留两阶段回执', async () => {
  const prepared = await prepare({ ...await input(), resolution: '1K' }), calls = [];
  const finalScene = { view_summary: viewSummary, image_prompt: scenePrompt,
    internal_note: 'EXTRA_FIELD_MUST_NOT_REACH_IMAGE', user_requirements: 'Agent改写不可覆盖用户' };
  const result = await executeFloorPlanCamera(prepared, { getModels, getPrompt, client: {
    async generatePrompt(request) {
      calls.push('agent'); assert.equal(request.model, 'gemini-3.1-pro-preview');
      assert.equal(request.imageUrl, prepared.guide.imageUrl); assert.equal(request.imageUrls, undefined);
      assert.equal(request.systemPrompt, asset.prompt);
      const context = JSON.parse(request.userPrompt);
      assert.equal(Object.keys(context)[0], 'user_requirements'); assert.equal(context.user_requirements, prepared.userRequirements);
      assert.deepEqual(context.camera.position, { x: camera.x, y: camera.y });
      assert.equal(context.camera.heading_degrees, camera.heading);
      assert.match(context.camera.field_of_view_interpretation, /不是最远可见距离/);
      return { text: `\`\`\`json\n${JSON.stringify(finalScene)}\n\`\`\``, requestId: 'agent-paid', usageCost: { costUsd: .003, currency: 'USD', secret: 'sk-private1234' } };
    },
    async editImageAsync(request) {
      calls.push('image'); assert.deepEqual(request.images, [{ image_url: prepared.guide.imageUrl }]);
      assertReferencePrompt(request.prompt, prepared.userRequirements);
      assert.ok(!request.prompt.includes(viewSummary)); assert.ok(!request.prompt.includes(finalScene.internal_note));
      assert.ok(!request.prompt.includes(asset.prompt)); assert.ok(!request.prompt.includes('heading_degrees'));
      return { images: [{ url: url(await image(1536, 864)) }], requestId: 'image-paid', usageCost: { costUsd: .02 } };
    },
  } });
  assert.deepEqual(calls, ['agent', 'image']); assert.equal(result.pipeline, 'camera-view-agent-to-image-reference');
  assert.deepEqual(result.agent, { key: 'gemini3pro', id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro' });
  assert.equal(result.scenePrompt, scenePrompt); assert.equal(result.viewSummary, viewSummary);
  assert.equal(result.compiledPromptSha256, hash(result.compiledPrompt));
  assertImageReference(result.actual, prepared.guide);
  assert.equal(result.actual.agentInputImageFormat, prepared.guide.format);
  assert.equal(result.actual.agentInputImageWidth, prepared.guide.width); assert.equal(result.actual.agentInputImageHeight, prepared.guide.height);
  for (const key of ['submittedImageSha256', 'submittedImageFormat', 'submittedImageWidth', 'submittedImageHeight', 'guideSha256', 'guideFormat', 'guideWidth', 'guideHeight']) assert.equal(Object.hasOwn(result.actual, key), false);
  assert.deepEqual(result.receipts, { agent: { requestId: 'agent-paid', usageCost: { costUsd: .003, currency: 'USD' } }, image: { requestId: 'image-paid', usageCost: { costUsd: .02 } } });
  assert.ok(!JSON.stringify(result).includes('PRIVATE_')); assert.ok(!JSON.stringify(result).includes('sk-private'));
});

test('Agent空回复、损坏JSON、不可定位哨兵或超长最终正文均阻断图片调用', async () => {
  const prepared = await prepare(await input());
  const invalidObjects = [{ image_prompt: scenePrompt }, { view_summary: viewSummary }, { view_summary: [], image_prompt: scenePrompt },
    { view_summary: viewSummary, image_prompt: {} }, { view_summary: '', image_prompt: scenePrompt }, { view_summary: viewSummary, image_prompt: ' ' },
    { view_summary: viewSummary, image_prompt: 'UNRESOLVABLE_VIEW: cannot locate camera' },
    { view_summary: 'UNRESOLVABLE_VIEW', image_prompt: scenePrompt },
    { view_summary: 'x'.repeat(4001), image_prompt: scenePrompt }, { view_summary: viewSummary, image_prompt: 'x'.repeat(32001) },
    { view_summary: viewSummary, image_prompt: 'x'.repeat(32000) }];
  for (const text of ['', ' ', null, '{}', '{"scene":', '["scene",', scenePrompt, 'UNRESOLVABLE_VIEW: camera is outside',
    '```text\nUNRESOLVABLE_VIEW\n```', JSON.stringify('UNRESOLVABLE_VIEW'), ...invalidObjects.map(value => JSON.stringify(value))]) {
    let agents = 0, images = 0;
    await assert.rejects(executeFloorPlanCamera(prepared, { getModels, getPrompt, client: {
      async generatePrompt() { agents++; return { text, requestId: 'agent-empty', usageCost: { costUsd: .001 } }; },
      async editImageAsync() { images++; },
    } }), error => {
      assert.equal(error.floorPlanDiagnostic.agent.requestId, 'agent-empty');
      assert.equal(error.floorPlanDiagnostic.agent.usageCost.costUsd, .001);
      if (String(text).includes('UNRESOLVABLE_VIEW')) assert.match(error.message, /无法确认/);
      return error.floorPlanSafe;
    });
    assert.equal(agents, 1); assert.equal(images, 0);
  }
});

test('Agent后资产、模型权限或出图能力漂移保留推理费用且零生图', async () => {
  for (const kind of ['assetSha', 'assetSource', 'imageAccess', 'agentAccess', 'size', 'complexity']) {
    const prepared = await prepare({ ...await input(), modelKey: 'gptImage26Flare', complexity: 'high' });
    let afterAgent = false, images = 0, agents = 0;
    const priorSize = MODEL_CONFIGS.gptImage26Flare.sizes['16:9']['2K'];
    const priorComplexity = MODEL_CONFIGS.gptImage26Flare.complexityOptions;
    try {
      await assert.rejects(executeFloorPlanCamera(prepared, {
        getModels: async () => (await getModels()).filter(model => !afterAgent || !(kind === 'imageAccess' && model.id === 'gpt-image-2.6-flare') && !(kind === 'agentAccess' && model.id === 'gemini-3.1-pro-preview')),
        getPrompt: async () => afterAgent && kind === 'assetSha' ? { ...asset, prompt: 'changed' }
          : afterAgent && kind === 'assetSource' ? { ...asset, source: 'other' } : structuredClone(asset),
        client: { async generatePrompt() {
          agents++; afterAgent = true;
          if (kind === 'size') MODEL_CONFIGS.gptImage26Flare.sizes['16:9']['2K'] = '1536x864';
          if (kind === 'complexity') MODEL_CONFIGS.gptImage26Flare.complexityOptions = ['low'];
          return { text: agentOutput, requestId: 'agent-completed', usageCost: { costUsd: .001 } };
        }, async editImageAsync() { images++; } },
      }), error => error.statusCode === 409 && error.floorPlanDiagnostic.phase === 'validation'
        && error.floorPlanDiagnostic.agent.requestId === 'agent-completed');
      assert.equal(agents, 1); assert.equal(images, 0);
    } finally {
      MODEL_CONFIGS.gptImage26Flare.sizes['16:9']['2K'] = priorSize;
      MODEL_CONFIGS.gptImage26Flare.complexityOptions = priorComplexity;
    }
  }
});

test('Agent或图片失败的两阶段回执脱敏且均不自动重试', async () => {
  const prepared = await prepare(await input());
  for (const failure of ['agent', 'image']) {
    let agents = 0, images = 0;
    const paidError = () => Object.assign(Error('PRIVATE_BODY sk-private1234'), { requestId: 'receipt sk-private1234', usageCost: { costUsd: .001, secret: 'PRIVATE_BODY' } });
    await assert.rejects(executeFloorPlanCamera(prepared, { getModels, getPrompt, client: {
      async generatePrompt() { agents++; if (failure === 'agent') throw paidError(); return { text: agentOutput, requestId: 'agent-ok', usageCost: { costUsd: .002 } }; },
      async editImageAsync() { images++; throw paidError(); },
    } }), error => {
      assert.equal(error.floorPlanDiagnostic.phase, failure);
      assert.equal(error.floorPlanDiagnostic[failure].usageCost.costUsd, .001);
      assert.ok(!JSON.stringify(error).includes('PRIVATE_BODY')); assert.ok(!JSON.stringify(error).includes('sk-private'));
      if (failure === 'image') assert.equal(error.floorPlanDiagnostic.agent.usageCost.costUsd, .002);
      return true;
    });
    assert.equal(agents, 1); assert.equal(images, failure === 'image' ? 1 : 0);
  }
});

test('实际两阶段API同ID并发及失败GET恢复不重复Agent或图片', async () => {
  const draft = { ...await input(), resolution: '1K' }, gate = Promise.withResolvers();
  let agents = 0, images = 0;
  const handler = createFloorPlanApiHandler({ prefix: '/api/floor-plan-camera', featureMode: 'floorPlanCamera', geometryEnabled: false,
    getClient: async () => ({
      async generatePrompt() { agents++; await gate.promise; return { text: agentOutput, requestId: 'agent-once', usageCost: { costUsd: .001 } }; },
      async editImageAsync() { images++; throw Object.assign(Error('failed'), { requestId: 'image-once', usageCost: { costUsd: .01 } }); },
    }), getModels, getPrompt, prepareInput: prepareFloorPlanCameraInput, execute: executeFloorPlanCamera,
    readConfig: readFloorPlanCameraConfig, readJson: async request => request.body,
    sendJson(response, status, body) { Object.assign(response, { status, body }); },
  });
  const body = { ...draft, jobId: 'camera-two-stages-0001' };
  async function request(method, body, suffix = '') {
    const response = {}, path = `/api/floor-plan-camera/jobs${suffix}`;
    await handler({ method, body, url: path }, response, path); return response;
  }
  const initial = await Promise.all([request('POST', body), request('POST', body)]);
  assert.ok(initial.every(response => response.status === 202));
  const deadline = Date.now() + 2000;
  while (!agents) { if (Date.now() > deadline) throw Error('Agent未启动'); await new Promise(resolve => setTimeout(resolve, 1)); }
  assert.equal(handler.hasActiveJobs(), true);
  gate.resolve();
  let final;
  do { final = await request('GET', null, '/camera-two-stages-0001');
    if (Date.now() > deadline) throw Error('任务未完成'); await new Promise(resolve => setTimeout(resolve, 1));
  } while (final.body.job.status === 'running');
  assert.equal(final.body.job.status, 'failed'); assert.equal(final.body.job.result.diagnostic.phase, 'image');
  assert.equal(final.body.job.result.diagnostic.agent.requestId, 'agent-once');
  await request('POST', body); await request('GET', null, '/camera-two-stages-0001');
  assert.equal(agents, 1); assert.equal(images, 1); assert.equal(handler.hasActiveJobs(), false);
});

test('批量准入拒绝冲突字段、重复模型、非法张数、越限与不兼容共用尺寸，旧版只支持单图', async () => {
  const legacyVersion = '2026-11-07.floor-plan-camera.8';
  const original = { ...await input(), resolution: '1K' };
  const models = [{ key: 'gptImage26Flare', complexity: 'high' }, { key: 'banana21' }];
  const valid = { ...original, modelSelections: models, imageCount: 2 };
  const prepareBatch = value => prepareFloorPlanCameraInput(value, { getModels: getAllModels, getPrompt });
  assert.equal(floorPlanCameraTaskTotal(valid), 4);
  assert.equal(floorPlanCameraTaskTotal(original), 1);
  assert.deepEqual((await prepareBatch(valid)).batch.models.map(item => [item.model.key, item.complexity]),
    [['gptImage26Flare', 'high'], ['banana21', null]]);
  for (const [patch, message] of [
    [{ modelKey: 'banana21' }, /单独设置/],
    [{ modelSelections: [models[0], models[0]] }, /重复选择/],
    [{ modelSelections: [{ key: 'banana21', resolution: '4K' }] }, /有效的生图模型/],
    [{ modelSelections: [{ key: 'banana21', complexity: 'high' }] }, /不支持独立思考强度/],
    [{ imageCount: '2' }, /1至4张/],
    [{ imageCount: 5 }, /1至4张/],
    [{ imageCount: 4, modelSelections: [...models, { key: 'gptImage2' }, { key: 'banana2' }] }, /最多生成12张/],
    [{ modelSelections: [...models, { key: 'seedream5' }] }, /不支持 16:9 \/ 1K/],
    [{ workflowVersion: legacyVersion }, /刷新/],
  ]) {
    await assert.rejects(prepareBatch({ ...valid, ...patch }), message);
  }
  await assert.rejects(prepare(valid), /未开放/);
  const legacy = await prepare({ ...original, workflowVersion: legacyVersion });
  const result = await executeFloorPlanCamera(legacy, { getModels, getPrompt, client: { generatePrompt,
    async editImageAsync() { return { images: [{ url: url(await image(1536, 864)) }] }; },
  } });
  assert.equal(result.workflowVersion, legacyVersion);
  assert.equal(result.items, undefined);
  assert.equal(result.image.width, 1536);
});

test('批量任务一次推理，逐图并发同图同词，部分失败及费用可只读恢复', { timeout: 3000 }, async () => {
  const preparingGate = Promise.withResolvers(), imagesGate = Promise.withResolvers();
  const firstTwoImages = Promise.withResolvers();
  let promptReads = 0, agents = 0, inFlight = 0, maxInFlight = 0, annotatedImage;
  const imageRequests = [];
  async function render(request) {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    imageRequests.push(request);
    const slot = imageRequests.length;
    if (slot === 2) firstTwoImages.resolve();
    try {
      await imagesGate.promise;
      if (slot === 2) throw Object.assign(Error('PRIVATE_BODY sk-private1234'), {
        requestId: 'paid-but-failed', usageCost: { costUsd: .02, secret: 'PRIVATE_BODY' },
      });
      const [width, height] = request.size.split('x').map(Number);
      return { images: [{ url: url(await image(width, height)) }], requestId: `image-${slot}` };
    } finally { inFlight--; }
  }
  const handler = createFloorPlanApiHandler({ prefix: '/api/floor-plan-camera', featureMode: 'floorPlanCamera', geometryEnabled: false,
    getClient: async () => ({ generateImage: render, editImageAsync: render,
      async generatePrompt(request) { agents++; annotatedImage = request.imageUrl; return generatePrompt(); },
    }), getModels: getAllModels,
    getPrompt: async () => { if (++promptReads === 1) await preparingGate.promise; return getPrompt(); },
    prepareInput: prepareFloorPlanCameraInput, execute: executeFloorPlanCamera, getTaskTotal: floorPlanCameraTaskTotal,
    readJson: async request => request.body,
    sendJson(response, status, body) { Object.assign(response, { status, body }); },
  });
  const body = { ...await input(), resolution: '1K', jobId: 'camera-batch-0001',
    modelSelections: [{ key: 'gptImage26Flare', complexity: 'high' }, { key: 'banana21' }], imageCount: 2 };
  async function request(method, value) {
    const response = {}, path = `/api/floor-plan-camera/jobs${method === 'GET' ? '/' + body.jobId : ''}`;
    await handler({ method, body: value, url: path }, response, path);
    return response;
  }
  const pending = [request('POST', body), request('POST', body)];
  await Promise.resolve();
  try {
    const preparing = await request('GET');
    assert.equal(preparing.body.job.total, 4);
    assert.equal(preparing.body.job.completed, 0);
    assert.equal(preparing.body.job.status, 'running');
  } finally { preparingGate.resolve(); }
  const initial = await Promise.all(pending);
  assert.ok(initial.every(response => response.status === 202 && response.body.job.total === 4));
  await firstTwoImages.promise;
  try {
    assert.equal(imageRequests.length, 2);
    assert.equal(handler.hasActiveJobs(), true);
    await assert.rejects(request('POST', { ...body, imageCount: 1 }), { statusCode: 409 });
  } finally { imagesGate.resolve(); }
  const deadline = Date.now() + 2000;
  let final;
  do {
    final = (await request('GET')).body.job;
    if (Date.now() > deadline) throw Error('批量任务未完成');
    if (final.status === 'running') await new Promise(resolve => setTimeout(resolve, 1));
  } while (final.status === 'running');
  assert.equal(final.status, 'success');
  assert.equal(final.completed, 4);
  assert.equal(final.total, 4);
  assert.equal(final.result.receipts.agent.requestId, 'agent-task');
  assert.deepEqual(final.result.items.map(item => [item.model.key, item.index, item.status]), [
    ['gptImage26Flare', 1, 'success'], ['gptImage26Flare', 2, 'failed'],
    ['banana21', 1, 'success'], ['banana21', 2, 'success'],
  ]);
  assert.equal(final.result.items[0].result.requestedComplexity, 'high');
  assert.deepEqual(final.result.items[1].receipt, { requestId: 'paid-but-failed', usageCost: { costUsd: .02 } });
  for (const item of final.result.items.filter(item => item.status === 'success')) {
    assert.equal(item.result.actual.referenceImageSha256, item.result.actual.agentInputImageSha256);
    assert.equal(item.result.receipts.agent, undefined);
  }
  assert.ok(imageRequests.every(request => request.n === 1 && request.prompt === final.result.compiledPrompt
    && request.images.length === 1 && request.images[0].image_url === annotatedImage));
  assert.equal(maxInFlight, 2);
  assert.doesNotMatch(JSON.stringify(final), /PRIVATE_BODY|sk-private/);
  assert.equal((await request('POST', body)).body.job.status, 'success');
  assert.equal(agents, 1);
  assert.equal(imageRequests.length, 4);
  assert.equal(handler.hasActiveJobs(), false);
});

test('真实Agent HTTP空正文保留已发生请求及费用，零图片HTTP请求', async context => {
  const prepared = await prepare(await input()), calls = [];
  context.mock.method(globalThis, 'fetch', async (target, options) => {
    const body = JSON.parse(options.body); calls.push({ target, body });
    assert.equal(body.model, 'gemini-3.1-pro-preview'); assert.equal(body.tools, undefined);
    return Response.json({ id: 'agent-empty-paid', output: [{ type: 'message', content: [{ type: 'output_text', text: ' ' }] }],
      private: 'PRIVATE_BODY', usage: { price: { currency: 'USD', payable_amount: .001 } } });
  });
  const client = createOneApiClient('test-key', { diagnosticSink: () => {} });
  await assert.rejects(executeFloorPlanCamera(prepared, { getModels, getPrompt, client }), error => {
    assert.equal(error.floorPlanDiagnostic.phase, 'agent');
    assert.equal(error.floorPlanDiagnostic.agent.requestId, 'agent-empty-paid');
    assert.equal(error.floorPlanDiagnostic.agent.usageCost.costUsd, .001);
    assert.equal(error.floorPlanDiagnostic.image.requestId, null);
    assert.ok(!JSON.stringify(error).includes('PRIVATE_BODY')); return true;
  });
  assert.equal(calls.length, 1);
});

// --- 最终HTTP合同：Agent与生图共用同一张标注图，三款GPT走后台，其他模型走同步 ---
test('九款模型最终HTTP均只携带与Agent一致的标注图，按模型走同步或后台Responses', async context => {
  const calls = [], original = await input();
  context.mock.method(globalThis, 'fetch', async (target, options) => {
    assert.equal(options.method, 'POST'); assert.ok(target.endsWith('/responses'));
    const body = JSON.parse(options.body); calls.push({ target, body });
    if (body.instructions) {
      return Response.json({ id: 'agent-nine', output: [{ type: 'message', content: [{ type: 'output_text', text: agentOutput }] }] });
    }
    const [width, height] = body.tools[0].size.split('x').map(Number);
    return Response.json({ id: 'resp_camera_reference', status: 'completed',
      output: [{ type: 'image_generation_call', result: (await image(width, height)).toString('base64') }] });
  });
  const client = createOneApiClient('test-key', { diagnosticSink: () => {} });
  const config = await readFloorPlanCameraConfig({ getModels: getAllModels, getPrompt });
  assert.equal(config.models.length, 9);
  for (const model of config.models) {
    const resolution = model.resolutions.includes('1K') ? '1K' : '2K';
    const prepared = await prepareFloorPlanCameraInput({ ...original, modelKey: model.key, resolution }, { getModels: getAllModels, getPrompt });
    const result = await executeFloorPlanCamera(prepared, { getModels: getAllModels, getPrompt, client });
    const agentBody = calls.at(-2).body, imageBody = calls.at(-1).body;
    assert.equal(agentBody.input.length, 1);
    assert.deepEqual(agentBody.input[0].content.filter(item => item.type === 'input_image').map(item => item.image_url), [prepared.guide.imageUrl]);
    assertResponsesImage(imageBody, prepared, backgroundModels.has(model.key));
    assert.equal(imageBody.tools[0].size, model.sizes['16:9'][resolution]);
    assert.equal(imageBody.tools[0].quality, MODEL_CONFIGS[model.key].defaultQuality || undefined);
    assert.equal(Object.hasOwn(imageBody.tools[0], 'complexity'), false);
    assertImageReference(result.actual, prepared.guide); assert.equal(result.viewSummary, viewSummary);
  }
  assert.equal(calls.length, 18);
});

test('真实Agent HTTP缺字段、摘要过长或最终提示词越界均保留Agent回执且零图片HTTP', async context => {
  const original = await input(), calls = [];
  let text;
  context.mock.method(globalThis, 'fetch', async (target, options) => {
    const body = JSON.parse(options.body); calls.push({ target, body });
    assert.ok(target.endsWith('/responses')); assert.equal(body.model, 'gemini-3.1-pro-preview');
    return Response.json({ id: 'agent-invalid-paid', output: [{ type: 'message', content: [{ type: 'output_text', text }] }],
      usage: { price: { currency: 'USD', payable_amount: .001 } } });
  });
  const client = createOneApiClient('test-key', { diagnosticSink: () => {} });
  const cases = [
    { output: { image_prompt: scenePrompt }, pattern: /view_summary/ },
    { output: { view_summary: viewSummary }, pattern: /image_prompt/ },
    { output: { view_summary: 'x'.repeat(4001), image_prompt: scenePrompt }, pattern: /4000/ },
    { output: { view_summary: viewSummary, image_prompt: 'x'.repeat(32000) }, pattern: /32000/ },
    { output: { view_summary: viewSummary, image_prompt: 'aa' }, userRequirements: '', pattern: /3–32000/ },
  ];
  for (const entry of cases) {
    text = JSON.stringify(entry.output);
    const prepared = await prepare({ ...original, userRequirements: entry.userRequirements ?? original.userRequirements });
    await assert.rejects(executeFloorPlanCamera(prepared, { getModels, getPrompt, client }), error => {
      assert.match(error.message, entry.pattern); assert.equal(error.floorPlanDiagnostic.agent.requestId, 'agent-invalid-paid');
      assert.equal(error.floorPlanDiagnostic.agent.usageCost.costUsd, .001); assert.equal(error.floorPlanDiagnostic.image.requestId, null);
      return true;
    });
  }
  assert.equal(calls.length, cases.length);
});

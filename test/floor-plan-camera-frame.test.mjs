/**
 * [INPUT]: 依赖机位 Agent 输出解析与成图任务，使用本地 JSON、PNG 与模型替身
 * [OUTPUT]: 验证 v11 用户要求由 Agent 转成成图正文、v10 原文兼容与摄影段同文归档、v9 起移除固定收尾段、空场与首墙、取景参考距离及外框说明、无裁切送模及旧归档
 * [POS]: test 的机位取景合同回归，不访问远程 Agent 或生图模型
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { floorPlanArchiveInput } from '../src/floor-plan-archive-input.mjs';
import { parseFloorPlanCameraOutput } from '../src/floor-plan-camera-output.mjs';
import { buildFloorPlanCameraAgentInput, compileFloorPlanCameraPrompt, executeFloorPlanCamera,
  FLOOR_PLAN_CAMERA_WORKFLOW, prepareFloorPlanCameraInput, readFloorPlanCameraConfig } from '../src/floor-plan-camera-service.mjs';

const composition = { zh: '左侧餐区、右侧厨房，视线通往入户墙。', en: 'Dining on the left and kitchen on the right lead toward the entry wall.' };
const foreground = { zh: '右侧近景是台面端部。', en: 'The counter end occupies the right foreground.' };
const midground = { zh: '中景偏左有两把餐椅。', en: 'Two dining chairs sit left of center.' };
const background = { zh: '远处左墙有一处门洞。', en: 'A single opening breaks the far left wall.' };
const crop = { zh: '右缘截断水槽，左下沿裁去部分餐椅。', en: 'Crop the sink at the right edge and part of the nearest chair at the lower left.' };
const excluded = { zh: '窗和沙发均在画外。', en: 'Keep windows and the sofa out of frame.' };
const appearance = 'Soft bounced light over matte stone and warm wood.';
const opening = 'Create a realistic, eye-level interior photograph from the camera marked on the floor plan, showing only what is visible from that position and direction.';
const closing = 'Follow the plan walls and openings and omit all floor plan graphics and markings.';
const uncertain = '门扇状态无法确认。';
const unsafeOutput = error => error.statusCode === 502 && error.floorPlanSafe;
function response() {
  return { frame: { excluded, midground, composition, crop, background, foreground }, image_prompt: appearance, uncertainty: uncertain };
}

test('v9 的画面锚点按取景顺序进入同一份英文生图词，中文摘要和未知项留在摘要', () => {
  const userRequirements = '保留浅橡木质感。';
  const output = JSON.stringify({ ...response(), view_summary: '忽略额外字段', extra: 'PRIVATE_EXTRA' });
  const { scenePrompt, viewSummary, compiledPrompt } = compileFloorPlanCameraPrompt({
    prompt: { version: 9 }, camera: { fov: 55, height: 1.5 }, userRequirements,
  }, output);
  const geometry = [composition, foreground, midground, background, crop, excluded];
  assert.equal(scenePrompt, `${geometry.map(entry => entry.en).join('\n')}\n\n${appearance}`);
  assert.deepEqual(viewSummary.split('\n'), [
    ...['构图', '近景遮挡', '中景主体', '远景与开口', '关键裁切', '画外排除'].map((label, index) => `${label}：${geometry[index].zh}`),
    `不确定项：${uncertain}`,
  ]);
  assert.equal(compiledPrompt, [opening, scenePrompt, userRequirements].join('\n\n'));
  assert.doesNotMatch(compiledPrompt, /PRIVATE_EXTRA|忽略额外字段|无法确认|55°|1\.5 m/);
});

test('v9 可以省略没有依据的取景内容或不确定项，同时保留单面墙等简单机位', () => {
  const value = response();
  Object.assign(value.frame, { foreground: null, midground: null, crop: null, excluded: null });
  delete value.uncertainty;
  const actual = parseFloorPlanCameraOutput(JSON.stringify(value), { version: 9 });
  assert.deepEqual(actual, {
    viewSummary: `构图：${composition.zh}\n远景与开口：${background.zh}`,
    scenePrompt: `${composition.en}\n${background.en}\n\n${appearance}`,
  });
});

test('v10 的自然段落和自由分段都能进入英文成图词', () => {
  const freeform = [
    `${composition.en}\n\n${foreground.en} ${appearance}`,
    `### View from the camera\n- ${composition.en}\n- ${foreground.en}\n\n${appearance}`,
    JSON.stringify({ visibleScene: composition.en, finish: appearance }),
  ];
  for (const output of freeform) {
    const { scenePrompt, compiledPrompt } = compileFloorPlanCameraPrompt({
      prompt: { version: 10 }, camera: { fov: 50 }, userRequirements: '',
    }, output);
    assert.ok(scenePrompt.includes(composition.en));
    assert.ok(scenePrompt.includes(appearance));
    assert.ok(compiledPrompt.startsWith(opening));
    assert.match(compiledPrompt, /rectilinear 38\.6 mm equivalent lens/);
    assert.match(compiledPrompt, /readable shadows and fine material texture\.$/);
    assert.doesNotMatch(compiledPrompt, /Keep bare walls and empty floor areas empty/);
  }
});

test('v10 继续接收旧双语取景，空回复和无法确认机位仍阻断生图', () => {
  const structured = JSON.stringify(response());
  assert.deepEqual(parseFloorPlanCameraOutput(structured, { version: 10 }), parseFloorPlanCameraOutput(structured, { version: 9 }));
  assert.throws(() => parseFloorPlanCameraOutput('  \n ', { version: 10 }), { code: 'camera_agent_output_invalid' });
  assert.throws(() => parseFloorPlanCameraOutput('UNRESOLVABLE_VIEW', { version: 10 }), { code: 'camera_view_unresolved' });
});

test('v10 只向生图交付成片方位，含图纸坐标的旧式双重标注不透传', () => {
  const scenes = [
    ['床头靠着图右侧（画面左前方）的墙面，床尾朝向图左侧（画面右侧）。',
      '床头靠着画面左前方的墙面，床尾朝向画面右侧。'],
    ['画面右侧（图纸上方）有扶手椅，画面中央是双人床（图纸区域⑥）。',
      '画面右侧有扶手椅，画面中央是双人床。'],
    ["The window is on the floor plan's right (frame left), above the chair (left of the plan).",
      'The window is on frame left, above the chair.'],
  ];
  for (const [input, expected] of scenes) {
    assert.deepEqual(parseFloorPlanCameraOutput(input, { version: 10 }), {
      scenePrompt: expected, viewSummary: expected,
    });
  }
  for (const unresolved of ['床头靠图右侧的墙面。', '照片站在卧室西侧。', 'The sofa faces east.']) {
    assert.throws(() => parseFloorPlanCameraOutput(unresolved, { version: 10 }),
      { code: 'camera_agent_output_invalid', retryable: false });
  }
});

test('v9 阻断缺少裁切键、缺少英文、缺少构图及所有空间层均为空的输出', () => {
  const malformed = [
    value => { delete value.frame.crop; },
    value => { value.frame.crop = { zh: crop.zh, en: ' ' }; },
    value => { value.frame.composition = null; },
    value => { Object.assign(value.frame, { foreground: null, midground: null, background: null }); },
    value => { value.image_prompt = ''; },
    value => { value.uncertainty = ['未知']; },
    value => { value.frame.background = { zh: '近墙', en: 'UNRESOLVABLE_VIEW' }; },
  ];
  for (const modify of malformed) {
    const value = response();
    modify(value);
    assert.throws(() => parseFloorPlanCameraOutput(JSON.stringify(value), { version: 9 }), unsafeOutput);
  }
  assert.throws(() => parseFloorPlanCameraOutput('{"view_summary":"旧摘要","image_prompt":"Old prompt."}', { version: 9 }), unsafeOutput);
});

test('v9 仅恢复说明文字或 Markdown 围栏内的完整单对象，保留字符串原文', () => {
  const json = JSON.stringify({ ...response(), image_prompt: 'A sign reads "{ENTRY}" near a warm matte wall.' });
  const expected = parseFloorPlanCameraOutput(json, { version: 9 });
  for (const text of [`以下是画面分析。\n\`\`\`JSON\n${json}\n\`\`\`\n分析结束。`, `下面是结构化输出。\n${json}\n已核对空间层次。`]) {
    assert.deepEqual(parseFloorPlanCameraOutput(text, { version: 9 }), expected);
  }
  const oldJson = JSON.stringify({ view_summary: '历史摘要', image_prompt: 'Historical scene.' });
  assert.throws(() => parseFloorPlanCameraOutput(`前置说明\n${oldJson}`, { version: 8 }), unsafeOutput);
});

test('v9 恢复顶层完整的六项取景，仍要求裁切等必需字段存在', () => {
  const { frame, ...rest } = response();
  const nested = parseFloorPlanCameraOutput(JSON.stringify(response()), { version: 9 });
  const flat = { ...frame, ...rest };
  assert.deepEqual(parseFloorPlanCameraOutput(JSON.stringify(flat), { version: 9 }), nested);
  delete flat.crop;
  assert.throws(() => parseFloorPlanCameraOutput(JSON.stringify(flat), { version: 9 }), { code: 'camera_agent_output_invalid' });
});

test('v9 拒绝多对象、数组包装、缺损 JSON，并保留输出外的无法判定标记', () => {
  const json = JSON.stringify(response());
  for (const text of [`${json}\n${json}`, `${json}\n{"frame":`, `以下为输出\n[${json}]\n结束`, `说明\n${json.slice(0, -1)}`]) {
    assert.throws(() => parseFloorPlanCameraOutput(text, { version: 9 }), { code: 'camera_agent_output_invalid' });
  }
  for (const text of ['说明如下\n\`\`\`text\nUNRESOLVABLE_VIEW\n\`\`\`', `\`\`json\n${json}\n\`\`\`\nUNRESOLVABLE_VIEW`]) {
    assert.throws(() => parseFloorPlanCameraOutput(text, { version: 9 }), { code: 'camera_view_unresolved' });
  }
});

test('v9 不完整或无效推理保留脱敏回执并阻断全部生图请求', async () => {
  const bytes = await sharp({ create: { width: 64, height: 32, channels: 3, background: '#fff' } }).png().toBuffer();
  const asset = { code: 'floor-plan-camera-frame-agent', name: '平面图摄影 v9', version: 9, published: true,
    source: 'feishu:test:floor-plan-camera-frame-agent@v9', prompt: 'Analyze the floor plan.' };
  asset.sha256 = createHash('sha256').update(asset.prompt).digest('hex');
  const getPrompt = async () => asset;
  const getModels = async () => [{ id: 'gemini-3.1-pro-preview' }, { id: 'gpt-image-2.5-sunburst' }];
  const prepared = await prepareFloorPlanCameraInput({
    action: 'render', workflowVersion: FLOOR_PLAN_CAMERA_WORKFLOW, agentModelKey: 'gemini3pro',
    camera: { x: .5, y: .5, heading: 90, fov: 55, height: 1.5 },
    referenceImage: { name: 'plan.png', type: 'image/png', size: bytes.length, dataUrl: `data:image/png;base64,${bytes.toString('base64')}` },
    promptVersion: asset.version, promptSha256: asset.sha256,
  }, { getModels, getPrompt });
  const agentReceipt = { requestId: 'agent-once', usageCost: { costUsd: .001 } };
  for (const code of ['incomplete_prompt', 'empty_prompt', null]) {
    let agentCalls = 0;
    const client = {
      async generatePrompt({ maxOutputTokens, requireCompleteOutput }) {
        agentCalls++;
        assert.equal(maxOutputTokens, 8192);
        assert.equal(requireCompleteOutput, true);
        if (code) throw Object.assign(new Error('PRIVATE_BAD_AGENT_RESPONSE'), { code, ...agentReceipt });
        return { ...agentReceipt, text: '{"frame": PRIVATE_BAD_AGENT_RESPONSE' };
      },
      async editImageAsync() { assert.fail('invalid Agent output must not dispatch image generation'); },
    };
    await assert.rejects(executeFloorPlanCamera(prepared, { client, getModels, getPrompt }), error => {
      assert.doesNotMatch(error.message, /PRIVATE_BAD_AGENT_RESPONSE/);
      assert.deepEqual(error.floorPlanDiagnostic, {
        phase: 'agent_output', code: 'camera_agent_output_invalid', agent: agentReceipt,
        image: { requestId: null, usageCost: {} },
      });
      return unsafeOutput(error);
    });
    assert.equal(agentCalls, 1);
  }
});

test('v8 保留旧摘要、旧画面词与旧编译正文，不读取额外取景字段', () => {
  const agentOutput = JSON.stringify({ ...response(), view_summary: '历史摘要', image_prompt: 'Historical scene.' });
  assert.deepEqual(compileFloorPlanCameraPrompt({ prompt: { version: 8 }, userRequirements: '' }, agentOutput), {
    viewSummary: '历史摘要',
    scenePrompt: 'Historical scene.',
    compiledPrompt: [opening, 'Historical scene.', closing].join('\n\n'),
  });
});

test('v9 将向左拍摄的图上侧映射到画面右侧，历史 Agent 输入不变', () => {
  const input = {
    camera: { x: 0.57, y: 0.35, heading: 271, fov: 55, height: 1.5 },
    source: { width: 1185, height: 894 }, guide: { width: 1185, height: 894 },
    aspectRatio: '16:9', userRequirements: '',
  };
  const current = JSON.parse(buildFloorPlanCameraAgentInput({ ...input, prompt: { version: 9 } }));
  const { forward, image_left, image_right } = current.camera.frame_directions_on_plan;
  assert.deepEqual({ forward, image_left, image_right }, { forward: '图左', image_left: '图下', image_right: '图上' });
  const freeform = JSON.parse(buildFloorPlanCameraAgentInput({ ...input, prompt: { version: 10 } }));
  assert.match(freeform.camera.frame_directions_on_plan.note, /图纸方位只用于内部换算.*最终取景正文中的位置一律以成片为基准/);
  assert.equal(Object.hasOwn(freeform.camera, 'guide_depth_short_side_ratio'), false);
  const extended = JSON.parse(buildFloorPlanCameraAgentInput({ ...input, camera: { ...input.camera, guideDepth: .62 }, prompt: { version: 10 } }));
  assert.equal(extended.camera.guide_depth_short_side_ratio, .62);
  assert.equal(extended.camera.full_frame_equivalent_focal_length_mm, freeform.camera.full_frame_equivalent_focal_length_mm);
  assert.match(extended.camera.field_of_view_interpretation, /取景标记远边表示用户希望覆盖的参考范围。.*实际开角和首墙/);
  assert.match(extended.camera.field_of_view_interpretation, /浅蓝矩形/);
  const unframed = JSON.parse(buildFloorPlanCameraAgentInput({ ...input, camera: { ...input.camera, guideDepth: .62, showFrame: false },
    guide: { ...input.guide, visibilityMode: 'estimated-wall-occlusion' }, prompt: { version: 10 } }));
  assert.equal(unframed.camera.guide_depth_short_side_ratio, .62);
  assert.match(unframed.camera.field_of_view_interpretation, /虚线三角的两侧表示水平开角.*淡蓝填色仅示意三角内的首墙遮挡/);
  assert.doesNotMatch(unframed.camera.field_of_view_interpretation, /浅蓝矩形/);
  const legacy = JSON.parse(buildFloorPlanCameraAgentInput({ ...input, prompt: { version: 8 } }));
  assert.equal(legacy.camera.frame_directions_on_plan, undefined);
  assert.equal(legacy.camera.visible_content_rule, undefined);
});

test('空走廊按首墙和远景保留空地，确实可见的开口仍进入成图词', () => {
  const base = { prompt: { version: 9 }, camera: { x: .48, y: .436, heading: 272, fov: 95, height: 1.5 },
    source: { width: 964, height: 1078 }, guide: { width: 964, height: 1078, visibilityMode: 'estimated-wall-occlusion',
      bilateralOpening: { left: .291, right: .623, fartherBoundary: [{ x: .138, y: .45 }] } },
    aspectRatio: '16:9', userRequirements: '' };
  const { camera } = JSON.parse(buildFloorPlanCameraAgentInput(base));
  assert.match(camera.field_of_view_interpretation, /保留画外原色，按开角与首墙遮挡判断/);
  assert.match(camera.visible_content_rule, /蓝点前方、位于两条开角边线之间.*贴着蓝点.*只有已确认的可见表面跨过画幅边缘/);
  assert.match(camera.visible_content_rule, /没有可见家具时保留空地与空墙/);
  assert.match(camera.estimated_bilateral_occlusion.interpretation, /只有确切的门窗图例与直视范围重合才写入画面/);
  const output = response();
  output.frame = { composition: { zh: '两侧近墙夹住空过道。', en: 'Two near walls frame an empty passage.' },
    foreground: null, midground: null, background: { zh: '正前方是无窗实墙。', en: 'A solid windowless wall directly ahead.' }, crop: null, excluded: null };
  const emptyPassage = compileFloorPlanCameraPrompt(base, JSON.stringify(output)).compiledPrompt;
  assert.match(emptyPassage, /Two near walls frame an empty passage\.\nA solid windowless wall directly ahead\./);
  assert.match(emptyPassage, /Keep both near wall edges and the clear view between them\./);
  assert.doesNotMatch(emptyPassage, /Keep bare walls and empty floor areas empty/);
  output.frame.background = { zh: '正前方有一扇可直视的窗。', en: 'A single visible window directly ahead.' };
  assert.match(compileFloorPlanCameraPrompt(base, JSON.stringify(output)).compiledPrompt, /A single visible window directly ahead/);
});

test('v9 拒绝新裁切请求并共用正常机位标注，历史裁切记录仍可归档', async () => {
  const bytes = await sharp({ create: { width: 320, height: 160, channels: 3, background: '#fff' } }).png().toBuffer();
  const imageUrl = `data:image/png;base64,${bytes.toString('base64')}`;
  const referenceImage = { name: 'plan.png', type: 'image/png', size: bytes.length, dataUrl: imageUrl };
  const prompt = 'Analyze the floor plan.';
  const promptSha256 = createHash('sha256').update(prompt).digest('hex');
  const getPrompt = async ({ version = 9 } = {}) => {
    const code = version >= 9 ? 'floor-plan-camera-frame-agent' : 'floor-plan-camera-agent';
    return { code, name: '平面图摄影', version, published: true, source: `feishu:test:${code}@v${version}`, prompt, sha256: promptSha256 };
  };
  const getModels = async () => [{ id: 'gemini-3.1-pro-preview' }, { id: 'gemini-nano-banana-2.1' }];
  const dependencies = { getModels, getPrompt };
  const request = { action: 'render', workflowVersion: FLOOR_PLAN_CAMERA_WORKFLOW, agentModelKey: 'gemini3pro',
    camera: { x: .5, y: .5, heading: 90, fov: 60, height: 1.5 }, referenceImage, promptVersion: 9, promptSha256,
    modelSelections: [{ key: 'banana21' }], imageCount: 2, resolution: '1K' };
  const config = await readFloorPlanCameraConfig(dependencies);
  assert.equal(Object.hasOwn(config, 'foregroundCrop'), false);
  assert.equal(Object.hasOwn(config, 'annotation'), false);
  await assert.rejects(prepareFloorPlanCameraInput({ ...request, foregroundCrop: 8 }, dependencies), { statusCode: 400 });

  const prepared = await prepareFloorPlanCameraInput(request, dependencies);
  const client = {
    async generatePrompt({ imageUrl, userPrompt }) {
      assert.equal(imageUrl, prepared.guide.imageUrl);
      assert.equal(JSON.parse(userPrompt).camera.foreground_crop, undefined);
      return { text: JSON.stringify({ ...response(), uncertainty: { zh: uncertain } }) };
    },
    async generateImage({ images, prompt }) {
      assert.deepEqual(images, [{ image_url: prepared.guide.imageUrl }]);
      assert.doesNotMatch(prompt, /amber line|foreground cutoff/);
      return { images: [{ url: imageUrl }] };
    },
  };
  const batch = await executeFloorPlanCamera(prepared, { ...dependencies, client });
  assert.equal(Object.hasOwn(batch, 'foregroundCrop'), false);
  assert.match(batch.viewSummary, new RegExp(uncertain));
  assert.ok(!batch.compiledPrompt.includes(uncertain));
  assert.equal(batch.items.length, 2);
  for (const item of batch.items) {
    assert.equal(item.status, 'success');
    assert.equal(Object.hasOwn(item.result, 'foregroundCrop'), false);
    assert.equal(item.result.actual.referenceImageSha256, prepared.guide.sha256);
  }
  const historical = { ...batch.items[0].result, foregroundCrop: 8 };
  const archive = floorPlanArchiveInput({ featureMode: 'floorPlanCamera', jobId: 'camera-crop-test', result: historical,
    sourceImage: referenceImage, submittedImageUrl: prepared.guide.imageUrl, slot: batch.items[0].index });
  assert.equal(archive.workflow.foregroundCrop, 8);
});

for (const version of [10, 11]) {
  const useAgentRequirements = version >= 11;
  test(`v${version} 清理取景方位，按版本处理用户要求并同文归档`, async () => {
    const bytes = await sharp({ create: { width: 64, height: 32, channels: 3, background: '#fff' } }).png().toBuffer();
    const imageUrl = `data:image/png;base64,${bytes.toString('base64')}`;
    const prompt = 'Describe the visible room and photographic finish in your own words.';
    const promptSha256 = createHash('sha256').update(prompt).digest('hex');
    const asset = { code: 'floor-plan-camera-frame-agent', name: `平面图摄影 v${version}`, version, published: true,
      source: `feishu:test:floor-plan-camera-frame-agent@v${version}`, prompt, sha256: promptSha256 };
    const getPrompt = async () => asset;
    const getModels = async () => [{ id: 'gemini-3.1-pro-preview' }, { id: 'gemini-nano-banana-2.1' }];
    const dependencies = { getModels, getPrompt };
    const userRequirements = '图纸右侧墙改成落地窗。用浅橡木和柔和暖光。';
    const prepared = await prepareFloorPlanCameraInput({ action: 'render', workflowVersion: FLOOR_PLAN_CAMERA_WORKFLOW,
      agentModelKey: 'gemini3pro', camera: { x: .5, y: .5, heading: 90, fov: 60, height: 1.5 },
      referenceImage: { name: 'plan.png', type: 'image/png', size: bytes.length, dataUrl: imageUrl },
      promptVersion: version, promptSha256, modelSelections: [{ key: 'banana21' }], imageCount: 1, resolution: '1K',
      userRequirements,
    }, dependencies);
    if (useAgentRequirements) {
      const emptyRequirements = JSON.parse(buildFloorPlanCameraAgentInput({ ...prepared, userRequirements: '' }));
      assert.equal(emptyRequirements.user_requirements, undefined);
      assert.equal(emptyRequirements.user_requirements_rule, undefined);
    }
    const finishes = '浅橡木地面承接柔和暖光。';
    const text = `床头靠着图右侧（画面左前方）的连续实墙。${finishes}`;
    const scene = `床头靠着画面左前方的连续实墙。${finishes}`;
    let submittedPrompt;
    const client = {
      async generatePrompt(request) {
        assert.equal(request.systemPrompt, prompt);
        assert.equal(request.imageUrl, prepared.guide.imageUrl);
        const agentInput = JSON.parse(request.userPrompt);
        assert.equal(agentInput.user_requirements, userRequirements);
        assert.equal(request.userPrompt.split(userRequirements).length, 2);
        if (useAgentRequirements) {
          for (const term of ['成片方位', '材质', '风格', '光线', '已确认可见']) {
            assert.ok(agentInput.user_requirements_rule.includes(term));
          }
        } else {
          assert.equal(agentInput.user_requirements_rule, undefined);
        }
        return { text, requestId: 'freeform-agent' };
      },
      async generateImage({ images, prompt }) {
        assert.deepEqual(images, [{ image_url: prepared.guide.imageUrl }]);
        submittedPrompt = prompt;
        return { images: [{ url: imageUrl }] };
      },
    };
    const batch = await executeFloorPlanCamera(prepared, { ...dependencies, client });
    assert.equal(batch.items[0].status, 'success');
    assert.equal(batch.receipts.agent.requestId, 'freeform-agent');
    const result = batch.items[0].result;
    assert.equal(result.scenePrompt, scene);
    assert.equal(result.userRequirements, userRequirements);
    assert.match(submittedPrompt, /Canon EOS R1 full-frame look at f\/8 and ISO 100/);
    assert.match(submittedPrompt, /rectilinear 31\.2 mm equivalent lens/);
    assert.match(submittedPrompt, /bracketed HDR with locked white balance/);
    assert.ok(submittedPrompt.includes(scene));
    assert.doesNotMatch(submittedPrompt, /图右侧（/);
    assert.doesNotMatch(submittedPrompt, /Keep bare walls and empty floor areas empty/);
    if (useAgentRequirements) {
      assert.doesNotMatch(submittedPrompt, /图纸右侧|改成落地窗/);
      assert.equal(submittedPrompt.split(finishes).length, 2);
    } else {
      assert.ok(submittedPrompt.includes(userRequirements));
    }
    assert.ok(submittedPrompt.indexOf(scene) < submittedPrompt.indexOf('Canon EOS R1'));
    const archive = floorPlanArchiveInput({ featureMode: 'floorPlanCamera', jobId: `camera-v${version}-photography`, result,
      sourceImage: { name: 'plan.png', dataUrl: imageUrl }, submittedImageUrl: prepared.guide.imageUrl });
    assert.equal(archive.finalPrompt, submittedPrompt);
    assert.equal(archive.sourcePrompt, userRequirements);
    assert.equal(archive.workflow.compiledPromptSha256, createHash('sha256').update(submittedPrompt).digest('hex'));
  });
}

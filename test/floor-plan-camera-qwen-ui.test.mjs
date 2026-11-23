/**
 * [INPUT]: 依赖平面图机位界面夹具和 Qwen 单档生图配置
 * [OUTPUT]: 验证机位下拉选模、固定尺寸及两种生成模式的请求
 * [POS]: test 中的主工作台前端回归，提交留在内存
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { config, fixture, source } from './floor-plan-camera-ui-fixture.mjs';

const qwenModel = {
  key: 'qwenImageEdit2511',
  label: 'Qwen Image Edit 2511',
  provider: 'comfyui',
  available: true,
  sizes: { '16:9': { '1K': '1280x720' } },
  defaults: { resolution: '1K', aspectRatio: '16:9' },
};

for (const mode of ['agent', 'direct']) {
  test(`主工作台从机位配置选择 Qwen 2511，经 ${mode} 请求以唯一参考图和原生档出图`, async () => {
    const configuration = {
      ...config,
      generationModes: ['agent', 'direct'],
      models: [...config.models, qwenModel],
      cameraLimits: { ...config.cameraLimits, cropToView: true },
    };
    const f = await fixture({ configuration, embedded: true });
    assert.deepEqual(f.models(), [config.defaultModel]);
    assert.equal(f.node('resolution').value, '2K');

    const plan = source('户型');
    await f.upload(plan);
    await f.click('placeCenter');
    await f.input('aspectRatio', '4:3', 'change');
    await f.useModel(qwenModel.key);
    assert.deepEqual(f.models(), [qwenModel.key]);
    assert.deepEqual(f.node('resolution').options.map(option => option.value), ['1K']);
    assert.deepEqual(f.node('aspectRatio').options.map(option => option.value), ['16:9']);
    assert.equal(f.node('complexityField').hidden, true);
    assert.equal(f.posts().length, 0);
    f.node('cropToView').checked = true;
    await f.node('cropToView').fire('change');

    if (mode === 'direct') {
      await f.input('generationMode', 'direct', 'change');
      await f.input('directPrompt', '从蓝色机位朝箭头看，保持原图布局。');
    }
    assert.equal(f.node('generate').disabled, false);
    await f.click('generate');
    assert.equal(f.posts().length, 1);
    const [{ path, body }] = f.posts();
    assert.equal(path, '/api/floor-plan-camera/jobs');
    assert.deepEqual(body.modelSelections, [{ key: qwenModel.key }]);
    assert.equal(body.resolution, '1K');
    assert.equal(body.aspectRatio, '16:9');
    assert.equal(body.referenceImage.dataUrl, plan.dataUrl);
    assert.equal(body.camera.cropToView, true);
    if (mode === 'direct') {
      assert.equal(body.generationMode, 'direct');
      assert.equal(body.userRequirements, '从蓝色机位朝箭头看，保持原图布局。');
      assert.equal(Object.hasOwn(body, 'agentModelKey'), false);
    } else {
      assert.equal(body.agentModelKey, config.defaultAgentModel);
      assert.equal(body.promptSha256, config.prompt.sha256);
    }
  });
}

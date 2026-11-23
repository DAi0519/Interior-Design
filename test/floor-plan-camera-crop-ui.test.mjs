/**
 * [INPUT]: 依赖平面图机位 UI 夹具与可控的送模预览响应
 * [OUTPUT]: 验证射线外接矩形裁剪开关的能力门禁、持久化和提交，以及只读预览、模式冻结和过时响应隔离
 * [POS]: test 的机位裁剪界面专项回归，不访问模型、飞书或网络
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { config, fixture, SESSION, source } from './floor-plan-camera-ui-fixture.mjs';

const cropConfig = { ...config, cameraLimits: { ...config.cameraLimits, cropToView: true }, generationModes: ['agent', 'direct'] };
const preview = name => ({ imageUrl: source(name).dataUrl, width: 600, height: 300, sha256: 'b'.repeat(64),
  crop: { mode: 'view-rays-bounds', preservesContext: true } });
const callsAt = (f, suffix) => f.calls.filter(call => call.path.endsWith(suffix));
async function place(f) { await f.upload(source('原始户型')); await f.click('placeCenter'); }
async function crop(f, value) {
  f.node('cropToView').checked = value;
  await f.input('cropToView', '', 'change');
}

test('裁剪开关默认关闭，显式选择持久化并仅在生成时提交，编辑底图保持完整', async () => {
  const f = await fixture({ configuration: cropConfig });
  assert.equal(f.node('cropToView').checked, false);
  assert.equal(f.node('cropToView').disabled, false);
  await place(f);
  await crop(f, true);
  assert.equal(JSON.parse(f.storage.get(SESSION)).cropToView, true);
  assert.equal(f.posts().length, 0, '勾选裁剪不触发预览或模型请求');
  assert.equal(f.node('sourceView').hidden, false);
  const annotation = f.drawing.findLast(call => call.name === 'annotation');
  assert.deepEqual(annotation.args.slice(1, 3), [1200, 600]);
  assert.equal(Object.hasOwn(annotation.args[0], 'cropToView'), false, '原图编辑坐标不变');
  await f.click('generate');
  assert.equal(callsAt(f, '/jobs')[0].body.camera.cropToView, true);
  const restored = await fixture({ configuration: cropConfig, saved: { cropToView: true } });
  assert.equal(restored.node('cropToView').checked, true);
  await place(restored); await crop(restored, false); await restored.click('generate');
  assert.equal(Object.hasOwn(callsAt(restored, '/jobs')[0].body.camera, 'cropToView'), false);
});

test('旧服务禁用裁剪与预览，已保存的裁剪意图阻断生成，不静默改成全图', async () => {
  const f = await fixture({ saved: { cropToView: true } });
  await place(f);
  assert.equal(f.node('cropToView').disabled, true);
  assert.equal(f.node('showInputPreview').disabled, true);
  assert.equal(f.node('generate').disabled, true);
  assert.match(f.node('status').textContent, /尚未加载视野裁剪/);
  await f.click('generate'); await f.click('showInputPreview');
  assert.equal(f.posts().length, 0);
});

test('送模预览仅按点击读取，共用生成机位并携带旧版标记版本，不创建任务', async () => {
  const f = await fixture({ configuration: cropConfig, respond: async call => {
    assert.ok(call.path.endsWith('/preview'));
    return preview('裁剪图');
  } });
  assert.equal(f.node('showInputPreview').disabled, true);
  await place(f); await crop(f, true); await f.input('heading', 90);
  assert.equal(f.posts().length, 0);
  await f.click('showInputPreview');
  const [request] = callsAt(f, '/preview');
  assert.equal(request.body.promptVersion, config.prompt.version);
  assert.deepEqual(request.body.camera, { x: .5, y: .5, heading: 90, fov: 60, height: 1.5, cropToView: true });
  assert.equal(request.body.referenceImage.name, '原始户型.png');
  assert.equal(f.node('sourceView').hidden, true);
  assert.equal(f.node('inputPreviewView').hidden, false);
  assert.equal(f.node('showInputPreview').attributes.get('aria-selected'), 'true');
  assert.equal(f.node('inputPreview').src, preview('裁剪图').imageUrl);
  assert.match(f.node('previewMeta').textContent, /600 × 300.*矩形/);
  assert.equal(f.node('inputPreviewView').attributes.get('aria-busy'), 'false');
  assert.equal(callsAt(f, '/jobs').length, 0);
  await f.click('showSource'); await f.input('heading', 180); await crop(f, false); await f.click('showInputPreview');
  assert.equal(callsAt(f, '/preview').length, 2);
  assert.equal(callsAt(f, '/preview')[1].body.camera.heading, 180);
  assert.match(f.node('previewMeta').textContent, /完整平面图/);
});

test('直出预览省略推理版本，预览失败保留机位且可以重试', async () => {
  let attempts = 0;
  const f = await fixture({ configuration: cropConfig, saved: { generationMode: 'direct', directPrompt: '原样生图' },
    respond: async () => { if (!attempts++) throw new Error('预览读取失败'); return preview('完整图'); } });
  await place(f); await f.click('showInputPreview');
  assert.equal(Object.hasOwn(callsAt(f, '/preview')[0].body, 'promptVersion'), false);
  assert.equal(f.node('inputPreview').hidden, true);
  assert.match(f.node('error').textContent, /预览读取失败/);
  assert.equal(f.node('showInputPreview').disabled, false);
  await f.click('showInputPreview');
  assert.equal(f.node('inputPreview').hidden, false);
  assert.equal(f.node('error').hidden, true);
  assert.equal(callsAt(f, '/jobs').length, 0);
});

test('返回改机位再预览时，较晚完成的旧请求不能覆盖新图或改变当前页签', async () => {
  const first = Promise.withResolvers(), second = Promise.withResolvers();
  let attempts = 0;
  const f = await fixture({ configuration: cropConfig, respond: () => attempts++ ? second.promise : first.promise });
  await place(f); await f.click('showInputPreview');
  assert.equal(f.node('inputPreviewView').attributes.get('aria-busy'), 'true');
  await f.click('showSource'); await f.input('heading', 90); await f.click('showInputPreview');
  second.resolve(preview('新机位'));
  await f.click('showInputPreview');
  assert.equal(f.node('inputPreview').src, preview('新机位').imageUrl);
  first.resolve(preview('旧机位'));
  await f.input('requirements', '自然日光');
  assert.equal(f.node('inputPreview').src, preview('新机位').imageUrl);
  assert.equal(callsAt(f, '/preview').length, 2);
  assert.equal(callsAt(f, '/jobs').length, 0);
});

/**
 * [INPUT]: 依赖平面图机位渲染页面、控制脚本、共享归档状态控制器、相机几何与内存DOM/HTTP替身
 * [OUTPUT]: 验证墙体估算叠层和回退、参考图门禁、机位与多模型张数冻结、分组结果及仅GET恢复、逐图飞书记录和仅归档重试
 * [POS]: test 的平面图机位前端回归，不访问模型、飞书或网络
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import * as geometry from '../public/floor-plan-camera-geometry.js';
import { FLOOR_PLAN_WALL_ANALYSIS_MAX_SIDE } from '../public/floor-plan-camera-visibility.js';
import { toggleModelSelection } from '../public/model-multi-select.js';
import { publicModelCatalog } from '../src/model-config.mjs';
const [page, script] = await Promise.all(['html', 'js'].map(extension => readFile(new URL(`../public/floor-plan-camera.${extension}`, import.meta.url), 'utf8')));
const generationSyncScript = await readFile(new URL('../public/generation-sync.js', import.meta.url), 'utf8');
const SESSION = 'canvas-lab:floor-plan-camera:v1';
const canvasBounds = { left: 10, top: 20, width: 600, height: 300 };
const modelOption = key => {
  const model = publicModelCatalog().find(model => model.key === key);
  return { ...model, available: true, resolutions: ['1K', '2K', '4K'], aspectRatios: ['16:9', '4:3', '1:1'],
    defaults: { resolution: '2K', aspectRatio: '16:9' } };
};
const planReference = { referenceImageCount: 1, referenceImageRole: 'camera-annotated-plan' };
const config = { available: true, featureMode: 'floorPlanCamera', workflowVersion: '2026-11-07.floor-plan-camera.9', pipeline: 'camera-view-agent-to-image-reference',
  input: planReference,
  imageGeneration: { mode: 'image-to-image', ...planReference },
  batch: { imageCounts: [1, 2, 3, 4], maxImages: 12 },
  archive: { required: true, available: true },
  cameraDefaults: { x: .5, y: .5, heading: 0, fov: 60, height: 1.5 },
  defaultAgentModel: 'gemini3pro', agentModels: [
    { key: 'gemini3pro', id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro', available: true, selectable: true },
    { key: 'gpt', id: 'gpt-5.5', label: 'GPT 5.5', available: true, selectable: true }],
  defaultModel: 'gptImage25Sunburst', models: ['gptImage25Sunburst', 'gptImage26Sunburst'].map(modelOption),
  resolutions: ['1K', '2K', '4K'], aspectRatios: ['16:9', '4:3', '1:1'], prompt: { code: 'floor-plan-camera-agent', version: 2, sha256: 'a'.repeat(64) } };
const source = name => ({ name: `${name}.png`, type: 'image/png', width: 1200, height: 600, size: 128, dataUrl: `data:image/png;base64,${Buffer.from(name).toString('base64')}` });
const rendered = camera => ({ action: 'render', source: { fileName: '原户型.png' }, camera, model: { label: 'GPT 2.5' }, image: { url: source('效果图').dataUrl, width: 2048, height: 1152 } });
async function fixture({ saved, respond = async () => ({ job: { status: 'failed', error: '模拟失败' } }), configuration = config, wallAnalysis = {} } = {}) {
  const ids = new Map(), calls = [], timers = [], storage = new Map(), downloads = [], drawing = [];
  if (saved) storage.set(SESSION, JSON.stringify(saved));
  class Element {
    constructor(tag) { this.tagName = tag; this.listeners = new Map(); this.children = []; this.attributes = new Map(); this._value = ''; this.disabled = false; this.hidden = false; this.open = false; this.textContent = ''; this.classList = { add() {}, remove() {} }; }
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.children = nodes; }
    get value() { return this.tagName === 'select' ? this.children.find(item => item.selected)?.value || '' : this._value; }
    set value(value) { this._value = String(value); if (this.tagName === 'select') this.children.forEach(item => { item.selected = item.value === this._value; }); }
    get options() { return this.children; }
    set innerHTML(value) { throw new Error('结果不得作为HTML插入'); }
    setAttribute(key, value) { this.attributes.set(key, String(value)); }
    removeAttribute(key) { this.attributes.delete(key); delete this[key]; }
    addEventListener(name, callback) { this.listeners.set(name, [...(this.listeners.get(name) || []), callback]); }
    async fire(name, values = {}) { for (const callback of this.listeners.get(name) || []) await callback({ preventDefault() {}, target: this, ...values }); }
    click() { if (this.tagName === 'a') downloads.push({ href: this.href, download: this.download }); else if (!this.disabled) void this.fire('click'); }
    focus() {} remove() {} setPointerCapture() {} releasePointerCapture() {} hasPointerCapture() { return true; }
    getBoundingClientRect() { return canvasBounds; }
    getContext() {
      return new Proxy({}, { get: (_, name) => (...args) => {
        drawing.push({ name, args });
        if (name !== 'getImageData') return;
        if (wallAnalysis.readFails) throw new Error('像素不可读取');
        const [, , width, height] = args;
        return { width, height, data: new Uint8ClampedArray(width * height * 4) };
      } });
    }
  }
  for (const [, tag, attributes] of page.matchAll(/<([\w-]+)\b([^>]*)>/g)) {
    const id = attributes.match(/\bid="([^"]+)"/)?.[1]; if (!id) continue;
    const node = new Element(tag); node.hidden = /\bhidden(?:\s|$)/.test(attributes); node.disabled = /\bdisabled(?:\s|$)/.test(attributes);
    node.value = attributes.match(/\bvalue="([^"]+)"/)?.[1] || ''; ids.set(id, node);
  }
  const picker = { keys: [], models: [] };
  const node = id => ids.get(id) || ids.get('complexityField').children.flatMap(label => label.children).find(child => child.id === id);
  const context = vm.createContext({ ...geometry, FLOOR_PLAN_WALL_ANALYSIS_MAX_SIDE,
    detectFloorPlanWalls: wallAnalysis.detect ?? (() => null), cameraVisibility: wallAnalysis.visible ?? (() => null),
    document: { getElementById: id => ids.get(id), createElement: tag => new Element(tag), body: new Element('body') },
    sessionStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    crypto: { randomUUID: () => '00000000-0000-4000-8000-000000000001' },
    ResizeObserver: class { observe() {} }, URL,
    setTimeout: callback => { timers.push(callback); return callback; },
    clearTimeout: callback => { const index = timers.indexOf(callback); if (index !== -1) timers.splice(index, 1); },
    createImageBitmap: async file => ({ width: file.width, height: file.height, close() {} }),
    readFileAsInput: async file => { if (file.fail) throw new Error('文件读取失败'); return { ...file }; },
    fillSelect: (select, options, current) => select.replaceChildren(...options.map(entry => {
      const node = new Element('option'), item = typeof entry === 'string' ? { value: entry, label: entry } : entry;
      node.value = item.value; node.textContent = item.label; node.selected = item.value === current; return node;
    })),
    bindModelMultiSelect({ container, presentOption, onChange, onMessage }) {
      picker.toggle = key => {
        if (container.disabled) return;
        const model = picker.models.find(item => item.key === key);
        assert.ok(model, key);
        const { changed, message, values } = toggleModelSelection(picker.keys, key, presentOption(model));
        if (changed) onChange(values);
        if (message) onMessage(message);
      };
      return {
        render(models, keys) { picker.models = [...models]; picker.keys = [...keys]; },
        setDisabled(value) { container.disabled = value; },
      };
    },
    api: async (path, options = {}) => {
      const call = { path, method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : undefined }; calls.push(call);
      return path.includes('/config?') ? structuredClone(typeof configuration === 'function' ? configuration() : configuration) : respond(call);
    },
  });
  await vm.runInContext(`(async () => {${generationSyncScript.replace('export function', 'function')}
    ${script.replace(/^import\s+[^;]+;\n/gm, '')}})()`, context);
  async function settle() { for (let i = 0; i < 3; i++) await new Promise(resolve => setImmediate(resolve)); }
  const fire = async (id, event = 'click', values = {}) => { await node(id).fire(event, values); await settle(); };
  await settle();
  return { node, calls, storage, downloads, drawing, models: () => picker.keys,
    posts: () => calls.filter(call => call.method === 'POST'), reads: () => calls.filter(call => call.path.includes('/jobs/')),
    click: id => fire(id),
    toggleModel: async key => { picker.toggle(key); await settle(); },
    useModel: async key => {
      if (!picker.keys.includes(key)) picker.toggle(key);
      for (const other of picker.keys.filter(value => value !== key)) picker.toggle(other);
      await settle();
    },
    input: async (id, value, event = 'input') => { node(id).value = value; await fire(id, event); },
    upload: async file => { ids.get('sourceInput').files = [file]; await fire('sourceInput', 'change'); },
    pointer: (type, x, y) => fire('canvas', type, { pointerId: 1, button: 0, clientX: x, clientY: y }),
    key: (key, shiftKey = false) => fire('canvas', 'keydown', { key, shiftKey }),
    nextPoll: async () => { assert.ok(timers.length); timers.shift()(); await settle(); },
  };
}

async function drag(f, from, to) {
  const pointer = (type, { x, y }) => f.pointer(type, x + canvasBounds.left, y + canvasBounds.top);
  await pointer('pointerdown', from);
  await pointer('pointermove', to);
  await pointer('pointerup', to);
}

function canvasGuide(camera) {
  const { width, height } = canvasBounds;
  const handleLength = Math.min(76, Math.min(width, height) * .38 * .66);
  return geometry.cameraGuide(camera, width, height, handleLength);
}

test('长宽图朝向使用图像像素比例，正交视角与归一化指针正确', () => {
  const camera = { x: .5, y: .5, heading: 0, fov: 60 };
  assert.equal(geometry.headingToPoint(camera, { x: .75, y: 0 }, 1200, 600), 45);
  assert.equal(geometry.headingToPoint(camera, { x: 1, y: .25 }, 600, 1200), 45);
  assert.equal(geometry.headingToPoint(camera, { x: 1, y: .5 }, 1200, 600), 90);
  assert.equal(geometry.headingToPoint(camera, { x: .5, y: 1 }, 1200, 600), 180);
  assert.equal(geometry.headingToPoint(camera, { x: 0, y: .5 }, 1200, 600), 270);
  assert.deepEqual(geometry.imagePoint(310, 170, { left: 10, top: 20, width: 600, height: 300 }), { x: .5, y: .5 });
  assert.deepEqual(geometry.imagePoint(-20, 900, { left: 10, top: 20, width: 600, height: 300 }), { x: 0, y: 1 });
});

test('图上按拖摆放并转向，拖机身保持按下偏移，手柄调整后只提交一次', async () => {
  let camera;
  const f = await fixture({ respond: async call => {
    if (call.method === 'POST') { camera = call.body.camera; return { job: { status: 'running' } }; }
    return { job: { status: 'success', result: { ...rendered(camera), actual: { fullFrameEquivalentFocalLengthMm: 23.5, visibilityMode: 'estimated-wall-occlusion' } } } };
  } });
  await f.upload(source('原户型'));
  assert.equal(f.node('generate').disabled, true); await f.click('generate'); assert.equal(f.posts().length, 0);
  assert.ok(f.node('cameraTools'));
  assert.equal(f.node('height'), undefined);
  assert.equal(f.node('fovValue'), undefined);
  await drag(f, { x: 150, y: 225 }, { x: 210, y: 225 });
  assert.equal(f.node('heading').value, '90');
  await drag(f, { x: 153, y: 228 }, { x: 228, y: 153 });
  const moved = { x: .375, y: .5, heading: 90, fov: 60 };
  const { target } = canvasGuide(moved);
  await drag(f, target, canvasGuide({ ...moved, heading: 0 }).target);
  assert.equal(f.node('heading').value, '0');
  assert.equal(f.node('fov').value, '60');
  const { left } = canvasGuide({ ...moved, heading: 0 });
  const desired = canvasGuide({ ...moved, heading: 0, fov: 75 });
  await drag(f, left, desired.left);
  assert.equal(f.node('fov').value, '75');
  assert.equal(f.posts().length, 0, '画布操作只修改草稿');
  await f.useModel('gptImage26Sunburst'); await f.input('resolution', '4K', 'change');
  await f.click('generate'); assert.equal(f.posts().length, 1);
  assert.deepEqual(f.posts()[0].body.camera, { x: .375, y: .5, heading: 0, fov: 75, height: 1.5 });
  assert.deepEqual(f.posts()[0].body.modelSelections, [{ key: 'gptImage26Sunburst' }]); assert.equal(f.posts()[0].body.resolution, '4K');
  assert.match(f.node('resultMeta').textContent, /朝向 0°.*视野 75°/);
  assert.match(f.node('resultMeta').textContent, /等效 23\.5 mm/);
  assert.match(f.node('resultMeta').textContent, /机位图含墙体遮挡估算/);
  assert.doesNotMatch(f.node('resultMeta').textContent, /高度/);
  await f.input('heading', 180); assert.match(f.node('resultMeta').textContent, /朝向 0°/);
  assert.equal(f.posts().length, 1, '调整机位不得触发生图');
});

test('只分析一次原图比例像素，可见区与虚线开角分层，机位无法估算时隐藏填充', async () => {
  const rasterReads = [];
  const mask = {};
  const f = await fixture({ wallAnalysis: {
    detect: ({ width, height, data }) => { rasterReads.push([width, height, data.length]); return mask; },
    visible: (camera, walls) => {
      assert.equal(walls, mask);
      return camera.heading === 0 ? [camera, { x: .4, y: .2 }, { x: .6, y: .2 }] : null;
    },
  } });
  await f.upload(source('双房间')); assert.equal(f.node('visibilityLegend').hidden, true);
  assert.equal(f.node('canvas').attributes.get('aria-describedby'), 'drawingHint');
  const drawCalls = () => f.drawing.slice(f.drawing.findLastIndex(call => call.name === 'clearRect'));
  await f.click('placeCenter');
  const clipped = drawCalls(), operations = clipped.map(call => call.name);
  assert.equal(f.node('visibilityLegend').hidden, false);
  assert.equal(f.node('canvas').attributes.get('aria-describedby'), 'drawingHint visibilityLegend');
  assert.equal(f.node('visibilityKey').hidden, false);
  assert.match(f.node('visibilityNote').textContent, /估算.*核对门窗/);
  assert.deepEqual(clipped.find(call => call.name === 'lineTo').args, [480, 120]);
  assert.ok(operations.indexOf('fill') < operations.indexOf('setLineDash'));
  await f.input('heading', 90);
  assert.equal(f.node('visibilityLegend').hidden, false);
  assert.equal(f.node('visibilityKey').hidden, true);
  assert.match(f.node('visibilityNote').textContent, /仅显示镜头开角/);
  const fallback = drawCalls().map(call => call.name);
  assert.ok(fallback.indexOf('stroke') < fallback.indexOf('fill'), '回退只画开角虚线和手柄');
  assert.deepEqual(rasterReads, [[640, 320, 640 * 320 * 4]]);
});

test('墙体像素读取失败仍可摆放并生成，只显示开角图例', async () => {
  const f = await fixture({ wallAnalysis: { readFails: true } });
  await f.upload(source('像素读取失败')); await f.click('placeCenter');
  assert.equal(f.node('error').hidden, true);
  assert.equal(f.node('visibilityLegend').hidden, false);
  assert.equal(f.node('visibilityKey').hidden, true);
  assert.match(f.node('visibilityNote').textContent, /仅显示镜头开角/);
  assert.equal(f.node('generate').disabled, false);
});

test('中心圆点沿视线伸缩同步视野与焦距，斜拖可同时转向，机身位置不变', async () => {
  const f = await fixture();
  await f.upload(source('户型')); await f.click('placeCenter');
  const { width, height } = canvasBounds;
  const { origin, target } = canvasGuide({ x: .5, y: .5, heading: 0, fov: 60 });
  const centerDrawn = () => {
    const [x, y] = f.drawing.findLast(call => call.name === 'arc').args;
    return { x: x * width / f.node('canvas').width, y: y * height / f.node('canvas').height };
  };
  assert.equal(f.node('focalLength').textContent, '≈31.2 mm');
  await drag(f, target, { x: origin.x, y: target.y - 100 });
  assert.equal(f.node('fov').value, '35');
  assert.equal(f.node('heading').value, '0');
  assert.equal(f.node('focalLength').textContent, '≈57.1 mm');
  const extended = centerDrawn();
  assert.ok(extended.y < target.y, '画出的圆点确实远离机身');
  await drag(f, extended, { x: origin.x, y: origin.y - 10 });
  assert.equal(f.node('fov').value, '100');
  assert.equal(f.node('heading').value, '0');
  assert.equal(f.node('focalLength').textContent, '≈15.1 mm');
  const retracted = centerDrawn();
  assert.ok(retracted.y > target.y, '画出的圆点确实靠近机身');
  await drag(f, retracted, { x: origin.x + (origin.y - target.y), y: origin.y });
  assert.equal(f.node('heading').value, '90');
  assert.equal(f.node('fov').value, '60');
  assert.equal(f.node('focalLength').textContent, '≈31.2 mm');
  assert.equal(f.posts().length, 0);
  await f.click('generate');
  assert.deepEqual(f.posts()[0].body.camera, { x: .5, y: .5, heading: 90, fov: 60, height: 1.5 });
});

test('短焦圆点的弦线转向不会误变焦，径向拖动不受轻微横移影响', async () => {
  const f = await fixture();
  await f.upload(source('户型')); await f.click('placeCenter'); await f.input('fov', 100);
  const camera = { x: .5, y: .5, heading: 0, fov: 100 };
  const pointer = (type, x, y) => f.pointer(type, x + canvasBounds.left, y + canvasBounds.top);
  const { target } = canvasGuide(camera);
  await pointer('pointerdown', target.x, target.y);
  await pointer('pointermove', target.x + 2, target.y);
  assert.equal(f.node('heading').value, '0');
  await pointer('pointermove', target.x + 12, target.y);
  await pointer('pointermove', target.x + 40, target.y);
  await pointer('pointerup', target.x + 40, target.y);
  const turned = Number(f.node('heading').value);
  assert.ok(turned > 45);
  assert.equal(f.node('fov').value, '100');
  const guide = canvasGuide({ ...camera, heading: turned });
  const along = scale => ({
    x: guide.origin.x + (guide.target.x - guide.origin.x) * scale + 1,
    y: guide.origin.y + (guide.target.y - guide.origin.y) * scale + 1,
  });
  const start = along(1.4), end = along(2.5);
  await pointer('pointerdown', guide.target.x, guide.target.y);
  await pointer('pointermove', start.x, start.y);
  await pointer('pointermove', end.x, end.y);
  await pointer('pointerup', end.x, end.y);
  assert.ok(Number(f.node('fov').value) < 100);
  assert.equal(Number(f.node('heading').value), turned);
});

test('空白点按重定位，视野手柄限制开角并可用键盘调整', async () => {
  const f = await fixture({ configuration: { ...config, cameraDefaults: { ...config.cameraDefaults, height: 1.6 } } });
  await f.upload(source('户型')); await f.click('placeCenter');
  await f.pointer('pointerdown', 460, 245); await f.pointer('pointerup', 460, 245);
  const camera = { x: .75, y: .75, heading: 0, fov: 60 };
  const { origin, right } = canvasGuide(camera);
  await drag(f, right, { x: origin.x + 90, y: origin.y });
  assert.equal(f.node('fov').value, '100');
  await drag(f, canvasGuide({ ...camera, fov: 100 }).right, { x: origin.x, y: origin.y - 100 });
  assert.equal(f.node('fov').value, '35');
  await f.key('+');
  assert.ok(Number(f.node('fov').value) > 35);
  await f.key('-');
  assert.equal(f.node('fov').value, '35');
  await f.key('ArrowRight'); await f.key('ArrowLeft', true);
  await f.click('generate');
  const submitted = f.posts()[0].body.camera;
  assert.ok(submitted.x > camera.x, '右方向键在原机位上向右移动');
  assert.equal(submitted.y, camera.y);
  assert.equal(submitted.heading, 355);
  assert.equal(submitted.fov, 35);
  assert.equal(submitted.height, 1.6, '摄影高度取自服务端默认配置');
});

test('读取失败保留旧图和机位，成功换图必须重新放机位', async () => {
  const f = await fixture(); await f.upload(source('原户型')); await f.click('placeCenter');
  await f.upload({ ...source('坏文件'), fail: true });
  assert.equal(f.node('sourceThumbnail').src, source('原户型').dataUrl); assert.equal(f.node('generate').disabled, false);
  assert.match(f.node('error').textContent, /文件读取失败/);
  await f.upload(source('新户型')); assert.equal(f.node('generate').disabled, true);
  await f.click('generate'); assert.equal(f.posts().length, 0);
});

test('提交响应未知保留原任务，检查及会话恢复只GET不再POST', async () => {
  const camera = { x: .5, y: .5, heading: 0, fov: 60, height: 1.5 };
  const f = await fixture({ respond: async call => {
    if (call.method === 'POST') throw new Error('网络响应中断');
    return { job: { status: 'success', result: rendered(camera) } };
  } });
  await f.upload(source('原户型')); await f.click('placeCenter'); await f.click('generate');
  assert.equal(f.posts().length, 1); assert.equal(f.node('generate').disabled, true); assert.equal(f.node('upload').disabled, true);
  const saved = JSON.parse(f.storage.get(SESSION)); assert.ok(saved.pending);
  await f.click('generate'); assert.equal(f.posts().length, 1);
  await f.click('refresh'); assert.equal(f.posts().length, 1); assert.equal(f.reads().length, 1);
  const restored = await fixture({ saved, respond: async () => ({ job: { status: 'success', result: rendered(camera) } }) });
  assert.equal(restored.posts().length, 0); assert.equal(restored.reads().length, 1);
  assert.equal(restored.node('result').src, rendered(camera).image.url);
  assert.equal(restored.node('generate').disabled, true, '恢复结果不伪造原平面图或新机位');
  await restored.click('download'); assert.equal(restored.downloads[0].href, rendered(camera).image.url);
});

test('运行时锁定输入、失权不切换模型、非法参数不能提交', async () => {
  let current = structuredClone(config);
  const f = await fixture({ configuration: () => current, respond: async call => call.method === 'POST' ? { job: { status: 'running' } } : { job: { status: 'running', message: '生成中' } } });
  await f.upload(source('原户型')); await f.click('placeCenter');
  await f.input('fov', 101); assert.equal(f.node('generate').disabled, true);
  await f.input('fov', 60); await f.input('heading', ''); assert.equal(f.node('generate').disabled, true);
  await f.input('heading', 0); await f.useModel('gptImage26Sunburst');
  current.models[1].available = false; await f.click('refresh');
  assert.deepEqual(f.models(), ['gptImage26Sunburst']); assert.equal(f.node('generate').disabled, true);
  await f.useModel('gptImage25Sunburst'); assert.equal(f.node('generate').disabled, false);
  await f.click('generate');
  for (const id of ['upload','placeCenter','heading','fov','model','agentModel','imageCount','requirements','generate']) assert.equal(f.node(id).disabled, true, id);
});


test('非法机位参数显示范围、清除旧视锥，合法恢复仅清除参数错误', async () => {
  const f = await fixture(); await f.upload(source('原户型')); await f.click('placeCenter');
  for (const [id, invalid, valid, message] of [
    ['heading', 360, 0, /朝向请输入 0–359°/], ['heading', -1, 90, /朝向请输入 0–359°/],
    ['fov', 101, 60, /水平视野请输入 35–100°/], ['fov', '', 60, /水平视野请输入 35–100°/],
    ['fov', 34, 60, /水平视野请输入 35–100°/],
  ]) {
    f.drawing.length = 0; await f.input(id, invalid);
    assert.equal(f.node('generate').disabled, true); assert.equal(f.node('error').hidden, false);
    assert.match(f.node('error').textContent, message); assert.equal(f.node('status').textContent, '请修正相机参数');
    assert.equal(f.node(id).attributes.get('aria-invalid'), 'true');
    assert.deepEqual(f.drawing.map(call => call.name), ['clearRect', 'drawImage'], '非法参数必须重绘原图并清除旧机位');
    await f.input(id, valid); assert.equal(f.node('generate').disabled, false); assert.equal(f.node('error').hidden, true);
    assert.equal(f.node('status').textContent, '机位已设置，可以生成');
    assert.equal(f.node(id).attributes.get('aria-invalid'), 'false');
  }
  await f.upload({ ...source('损坏文件'), fail: true }); assert.match(f.node('error').textContent, /文件读取失败/);
  await f.input('fov', 101); assert.match(f.node('error').textContent, /水平视野请输入.*文件读取失败/);
  await f.input('fov', 60); assert.equal(f.node('error').hidden, false);
  assert.equal(f.node('error').textContent, '文件读取失败', '相机恢复不能吞掉独立操作错误');
  assert.equal(f.node('status').textContent, '相机参数已更新，请处理错误提示');
});

test('多模型取实际支持的共同分辨率，保留机位与全部选中的模型', async () => {
  const configuration = { ...config, models: ['gptImage25Sunburst', 'banana21', 'seedream5', 'seedream5Pro'].map(modelOption) };
  const f = await fixture({ configuration });
  await f.upload(source('户型')); await f.click('placeCenter'); await f.input('heading', 90);
  await f.input('resolution', '4K', 'change');
  await f.useModel('banana21');
  assert.equal(f.node('resolution').value, '4K', '有效分辨率不被切换模型重置');
  assert.equal(f.node('heading').value, '90'); assert.equal(f.posts().length, 0);
  await f.toggleModel('seedream5Pro');
  assert.equal(f.node('resolution').value, '2K');
  assert.match(f.node('status').textContent, /4K → 2K/);
  assert.deepEqual(f.node('resolution').options.map(option => option.value), ['1K', '2K']);
  await f.input('resolution', '1K', 'change');
  await f.toggleModel('seedream5');
  assert.equal(f.node('resolution').value, '2K');
  assert.deepEqual(f.node('resolution').options.map(option => option.value), ['2K']);
  assert.match(f.node('status').textContent, /1K → 2K/);
  await f.click('generate');
  assert.equal(f.posts().length, 1);
  assert.deepEqual(f.posts()[0].body.modelSelections, [{ key: 'banana21' }, { key: 'seedream5Pro' }, { key: 'seedream5' }]);
  assert.equal(f.posts()[0].body.resolution, '2K'); assert.equal(f.posts()[0].body.camera.heading, 90);
});

test('张数乘模型数预告本批总数，超过上限不提交，合法批次仅提交一份平面图与机位', async () => {
  const configuration = { ...config, models: ['gptImage25Sunburst', 'gptImage26Sunburst', 'gptImage26Flare', 'banana21'].map(modelOption) };
  const f = await fixture({ configuration });
  await f.upload(source('户型')); await f.click('placeCenter');
  assert.deepEqual(f.node('imageCount').options.map(option => option.value), ['1', '2', '3', '4']);
  assert.equal(f.node('imageCount').value, '1');
  for (const key of ['gptImage26Sunburst', 'gptImage26Flare', 'banana21']) await f.toggleModel(key);
  await f.input('complexity-gptImage26Sunburst', 'high', 'change');
  await f.input('complexity-gptImage26Flare', 'low', 'change');
  await f.input('imageCount', '4', 'change');
  assert.match(f.node('batchTotal').textContent, /4 个模型 × 4 张，共 16 张.*每批最多 12 张/);
  assert.equal(f.node('generate').disabled, true);
  await f.click('generate'); assert.equal(f.posts().length, 0);
  await f.input('imageCount', '3', 'change');
  assert.match(f.node('batchTotal').textContent, /4 个模型 × 3 张，共 12 张/);
  assert.equal(f.node('generateLabel').textContent, '生成 12 张室内效果图');
  await f.click('generate'); assert.equal(f.posts().length, 1);
  const [request] = f.posts();
  assert.equal(request.body.imageCount, 3);
  assert.deepEqual(request.body.modelSelections, [{ key: 'gptImage25Sunburst' }, { key: 'gptImage26Sunburst', complexity: 'high' },
    { key: 'gptImage26Flare', complexity: 'low' }, { key: 'banana21' }]);
  assert.equal(Object.hasOwn(request.body, 'modelKey'), false);
  assert.equal(Object.hasOwn(request.body, 'complexity'), false);
  assert.equal(request.body.referenceImage.dataUrl, source('户型').dataUrl);
  assert.deepEqual(request.body.camera, { x: .5, y: .5, heading: 0, fov: 60, height: 1.5 });
  assert.equal(request.body.agentModelKey, 'gemini3pro');
  assert.equal(request.body.resolution, '2K'); assert.equal(request.body.aspectRatio, '16:9');
  assert.deepEqual(f.reads().map(({ path }) => path), [`/api/floor-plan-camera/jobs/${request.body.jobId}`]);
  const saved = JSON.parse(f.storage.get(SESSION));
  assert.deepEqual(saved.models, request.body.modelSelections.map(({ key }) => key));
  assert.equal(saved.imageCount, 3);
});

test('混合结果按模型和张次展示，可切换下载，刷新只读取原批次', async () => {
  const camera = { x: .5, y: .5, heading: 90, fov: 60, height: 1.5 };
  const banana = { key: 'banana21', id: 'gemini-nano-banana-2.1', label: 'Banana 2.1' };
  const gpt = { key: 'gptImage25Sunburst', id: 'gpt-image-2.5-sunburst', label: 'GPT Image 2.5 Sunburst' };
  const success = (model, index, name) => {
    const base = rendered(camera);
    return { model, index, status: 'success', error: null, result: { ...base, model, image: { ...base.image, url: source(name).dataUrl } } };
  };
  const failure = { model: gpt, index: 1, status: 'failed', result: null, error: '<b>该张生成失败</b>' };
  const result = { action: 'render', viewSummary: '前方一扇窗，近处右墙。', scenePrompt: 'A window in the far wall.',
    items: [failure, success(gpt, 2, 'GPT 第二张'), success(banana, 1, 'Banana 第一张'), success(banana, 2, 'Banana 第二张')] };
  let completed = false;
  const configuration = { ...config, models: ['gptImage25Sunburst', 'banana21'].map(modelOption) };
  const f = await fixture({ configuration, respond: async call => call.method === 'POST' || !completed
    ? { job: { status: 'running', completed: 2, total: 4 } } : { job: { status: 'success', result } } });
  await f.upload(source('户型')); await f.click('placeCenter'); await f.input('heading', 90);
  await f.toggleModel(banana.key); await f.input('imageCount', '2', 'change'); await f.click('generate');
  assert.equal(f.posts().length, 1); assert.match(f.node('status').textContent, /2\/4 张/);
  const saved = JSON.parse(f.storage.get(SESSION)); assert.equal(saved.pending, f.posts()[0].body.jobId);
  const restored = await fixture({ saved, configuration, respond: async () => ({ job: { status: 'success', result } }) });
  assert.equal(restored.posts().length, 0);
  assert.deepEqual(restored.reads().map(({ path }) => path), [`/api/floor-plan-camera/jobs/${saved.pending}`]);
  assert.equal(restored.node('generate').disabled, true, '只恢复批次结果，原图仍需重新上传');
  assert.equal(restored.node('imageCount').value, '2');
  assert.deepEqual(restored.models(), [gpt.key, banana.key]);
  completed = true; await f.nextPoll();
  assert.match(f.node('status').textContent, /成功 3\/4 张，失败 1 张/);
  assert.equal(f.node('resultGroups').hidden, false);
  const [gptGroup, bananaGroup] = f.node('resultGroups').children;
  assert.deepEqual([gptGroup, bananaGroup].map(group => group.children[0].textContent), [gpt.label, banana.label]);
  const [failed, gptSecond] = gptGroup.children[1].children;
  assert.equal(failed.tagName, 'div'); assert.equal(failed.children[1].textContent, failure.error);
  assert.equal(gptSecond.attributes.get('aria-pressed'), 'true');
  assert.equal(f.node('result').src, source('GPT 第二张').dataUrl);
  const bananaSecond = bananaGroup.children[1].children[1];
  await bananaSecond.fire('click');
  assert.equal(gptSecond.attributes.get('aria-pressed'), 'false');
  assert.equal(bananaSecond.attributes.get('aria-pressed'), 'true');
  assert.equal(f.node('result').src, source('Banana 第二张').dataUrl);
  assert.match(f.node('resultMeta').textContent, /Banana 2\.1.*朝向 90°/);
  assert.equal(f.node('viewSummary').textContent, result.viewSummary);
  assert.equal(f.node('scenePrompt').textContent, result.scenePrompt);
  await f.click('download');
  assert.equal(f.downloads[0].href, source('Banana 第二张').dataUrl);
  assert.match(f.downloads[0].download, /Banana 2\.1-2\.png$/);
  assert.equal(f.posts().length, 1);
});

test('整批出图失败保留失败卡片与推理内容，隐藏下载入口', async () => {
  const model = { key: 'banana21', label: 'Banana 2.1' };
  const result = { action: 'render', viewSummary: '右侧是近墙。', items: [
    { model, index: 1, status: 'failed', result: null, error: '图片服务超时' },
  ] };
  const f = await fixture({ saved: { pending: 'batch-failure-1' }, respond: async () => ({ job: { status: 'success', result } }) });
  assert.match(f.node('status').textContent, /成功 0\/1 张，失败 1 张/);
  assert.equal(f.node('resultView').hidden, false); assert.equal(f.node('resultGroups').hidden, false);
  assert.equal(f.node('resultImageDetails').hidden, true); assert.equal(f.node('download').hidden, true);
  assert.equal(f.node('resultSync').hidden, true);
  assert.equal(f.node('viewSummary').textContent, result.viewSummary);
  await f.click('download'); assert.equal(f.downloads.length, 0);
  assert.equal(f.posts().length, 0); assert.equal(f.reads().length, 1);
});

test('恢复批次按当前图片查飞书记录，切图取消旧轮询，失败仅重试该张归档', async () => {
  const model = { key: 'banana21', label: 'Banana 2.1' };
  const first = { generationId: 'camera-first', status: 'pending' };
  const second = { generationId: 'camera-second', status: 'failed', error: '归档暂时失败' };
  const success = { ...second, status: 'success', recordUrl: 'https://example.feishu.cn/base/camera?record=second' };
  const result = { action: 'render', items: [first, second].map((sync, index) => {
    const picture = rendered({ x: .5, y: .5, heading: 0, fov: 60 });
    return { model, index: index + 1, status: 'success', result: { ...picture, sync,
      image: { ...picture.image, url: source(sync.generationId).dataUrl } } };
  }) };
  const f = await fixture({ saved: { jobId: 'camera-archive-batch' }, respond: async ({ path, method }) => {
    if (path === '/api/floor-plan-camera/jobs/camera-archive-batch') return { job: { status: 'success', result } };
    if (method === 'POST' && path === '/api/sync-jobs/camera-second/retry') return { sync: { ...second, status: 'pending', error: null } };
    if (path === '/api/sync-jobs/camera-second') return { sync: success };
    assert.fail(`意外请求 ${method} ${path}`);
  } });
  assert.equal(f.node('resultSync').hidden, false);
  assert.match(f.node('resultSyncStatus').textContent, /正在同步/);
  const [, secondImage] = f.node('resultGroups').children[0].children[1].children;
  await secondImage.fire('click');
  assert.match(f.node('resultSyncStatus').textContent, /同步失败/);
  assert.equal(f.node('resultSyncRetry').hidden, false);
  await f.click('resultSyncRetry'); await f.nextPoll();
  assert.match(f.node('resultSyncStatus').textContent, /已同步/);
  assert.equal(f.node('resultSyncLink').href, success.recordUrl);
  assert.equal(f.node('result').src, source('camera-second').dataUrl);
  assert.deepEqual(f.calls.filter(call => call.path.includes('/sync-jobs/')).map(({ path, method }) => [method, path]), [
    ['POST', '/api/sync-jobs/camera-second/retry'], ['GET', '/api/sync-jobs/camera-second'],
  ]);
  assert.equal(f.posts().length, 1);
});

test('飞书归档能力未加载或合同未就绪时阻止相机生成，刷新恢复后可提交', async () => {
  let configuration = { ...config, archive: undefined };
  const f = await fixture({ configuration: () => configuration });
  await f.upload(source('户型')); await f.click('placeCenter');
  assert.equal(f.node('generate').disabled, true);
  await f.click('generate'); assert.equal(f.posts().length, 0);
  configuration = { ...config, archive: { required: true, available: false, reason: '缺少飞书归档字段' } };
  await f.click('refresh');
  assert.equal(f.node('generate').disabled, true);
  assert.match(f.node('error').textContent, /缺少飞书归档字段/);
  configuration = config;
  await f.click('refresh');
  assert.equal(f.node('generate').disabled, false);
});

test('模型能力刷新不静默降档，旧工作流不能提交新增模型', async () => {
  let current = { ...config, models: [modelOption('banana21')] };
  const f = await fixture({ saved: { model: 'banana21', resolution: '4K', aspectRatio: '16:9' }, configuration: () => current });
  await f.upload(source('户型')); await f.click('placeCenter'); assert.equal(f.node('generate').disabled, false);
  current = structuredClone(current); delete current.models[0].sizes['16:9']['4K'];
  await f.click('refresh'); assert.deepEqual(f.models(), ['banana21']);
  assert.equal(f.node('resolution').value, '4K'); assert.equal(f.node('resolution').options.find(option => option.value === '4K').disabled, true);
  assert.equal(f.node('generate').disabled, true);
  assert.match(f.node('status').textContent, /请选择.*分辨率/);
  const old = await fixture({ configuration: { ...config, workflowVersion: '2026-11-07.floor-plan-camera.1' } });
  await old.upload(source('户型')); await old.click('placeCenter');
  assert.equal(old.node('generate').disabled, true); await old.click('generate'); assert.equal(old.posts().length, 0);
});

test('思考强度按模型显示和记忆，默认及无能力模型不传字段', async () => {
  const configuration = { ...config, models: ['gptImage25Sunburst', 'gptImage26Sunburst', 'gptImage26Flare', 'banana21'].map(modelOption) };
  const f = await fixture({ configuration });
  await f.upload(source('户型')); await f.click('placeCenter');
  assert.equal(f.node('complexityField').hidden, true);
  await f.click('generate'); assert.equal(Object.hasOwn(f.posts()[0].body.modelSelections[0], 'complexity'), false);
  await f.useModel('gptImage26Sunburst');
  assert.equal(f.node('complexityField').hidden, false);
  assert.deepEqual(f.node('complexity-gptImage26Sunburst').options.map(option => option.value), ['', 'low', 'medium', 'high']);
  assert.equal(f.node('complexity-gptImage26Sunburst').value, '');
  await f.click('generate'); assert.equal(Object.hasOwn(f.posts()[1].body.modelSelections[0], 'complexity'), false);
  await f.input('complexity-gptImage26Sunburst', 'high', 'change');
  await f.useModel('gptImage26Flare');
  assert.equal(f.node('complexity-gptImage26Flare').value, '', '不同模型独立记忆');
  await f.input('complexity-gptImage26Flare', 'low', 'change');
  await f.useModel('banana21');
  assert.equal(f.node('complexityField').hidden, true);
  await f.click('generate'); assert.equal(Object.hasOwn(f.posts()[2].body.modelSelections[0], 'complexity'), false);
  await f.useModel('gptImage26Sunburst'); assert.equal(f.node('complexity-gptImage26Sunburst').value, 'high');
  const saved = JSON.parse(f.storage.get(SESSION));
  const restored = await fixture({ saved, configuration });
  assert.equal(restored.node('complexity-gptImage26Sunburst').value, 'high');
  await restored.useModel('gptImage26Flare'); assert.equal(restored.node('complexity-gptImage26Flare').value, 'low');
});

test('三档思考强度原样提交且锁定，结果记录生成时选择', async () => {
  for (const complexity of ['low', 'medium', 'high']) {
    let request, completed = false;
    const f = await fixture({ respond: async call => {
      if (call.method === 'POST') { request = call.body; return { job: { status: 'running' } }; }
      return completed ? { job: { status: 'success', result: { ...rendered(request.camera), requestedComplexity: request.modelSelections[0].complexity } } }
        : { job: { status: 'running', message: '生成中' } };
    } });
    await f.upload(source('户型')); await f.click('placeCenter');
    await f.useModel('gptImage26Sunburst'); await f.input('complexity-gptImage26Sunburst', complexity, 'change');
    await f.click('generate'); assert.equal(request.modelSelections[0].complexity, complexity); assert.equal(Object.hasOwn(request, 'quality'), false);
    assert.equal(f.node('complexity-gptImage26Sunburst').disabled, true);
    await f.input('complexity-gptImage26Sunburst', '', 'change');
    assert.equal(JSON.parse(f.storage.get(SESSION)).complexities.gptImage26Sunburst, complexity, '锁定时不改保存参数');
    completed = true; await f.nextPoll();
    assert.match(f.node('resultMeta').textContent, new RegExp(`思考强度：${{ low: '低', medium: '中', high: '高' }[complexity]}（已请求）`));
    await f.input('complexity-gptImage26Sunburst', '', 'change');
    assert.match(f.node('resultMeta').textContent, /思考强度：.*（已请求）/); assert.equal(f.posts().length, 1);
  }
});

test('思考能力刷新失效不静默降档，明确重选后恢复生成', async () => {
  let current = structuredClone(config);
  const f = await fixture({ configuration: () => current });
  await f.upload(source('户型')); await f.click('placeCenter');
  await f.useModel('gptImage26Sunburst'); await f.input('complexity-gptImage26Sunburst', 'high', 'change');
  current.models[1].complexityOptions = ['low', 'medium']; await f.click('refresh');
  assert.equal(f.node('complexity-gptImage26Sunburst').value, 'high'); assert.equal(f.node('generate').disabled, true);
  assert.equal(f.node('complexity-gptImage26Sunburst').attributes.get('aria-invalid'), 'true');
  assert.match(f.node('status').textContent, /思考强度已不可用.*重新选择/);
  await f.click('generate'); assert.equal(f.posts().length, 0);
  await f.input('complexity-gptImage26Sunburst', 'medium', 'change'); assert.equal(f.node('generate').disabled, false);
  current.models[1].complexityOptions = []; await f.click('refresh');
  assert.equal(f.node('generate').disabled, true); assert.equal(f.node('complexityField').hidden, false, '保留失效选择供用户明确清除');
  await f.input('complexity-gptImage26Sunburst', '', 'change');
  assert.equal(f.node('generate').disabled, false); assert.equal(f.node('complexityField').hidden, true);
  await f.click('generate'); assert.equal(Object.hasOwn(f.posts()[0].body.modelSelections[0], 'complexity'), false);
});


test('空间推理模型按默认选择并记忆，刷新失权或移除不静默换模', async () => {
  let current = structuredClone(config);
  const f = await fixture({ configuration: () => current });
  await f.upload(source('户型')); await f.click('placeCenter');
  assert.equal(f.node('agentModel').value, 'gemini3pro');
  await f.input('agentModel', 'gpt', 'change');
  assert.equal(f.node('generate').disabled, false);
  const saved = JSON.parse(f.storage.get(SESSION)); assert.equal(saved.agentModel, 'gpt');
  const restored = await fixture({ saved, configuration: current });
  assert.equal(restored.node('agentModel').value, 'gpt');
  current.agentModels[1].selectable = false; await f.click('refresh');
  assert.equal(f.node('agentModel').value, 'gpt'); assert.equal(f.node('generate').disabled, true);
  assert.match(f.node('error').textContent, /空间推理模型不可用/);
  await f.click('generate'); assert.equal(f.posts().length, 0);
  current.agentModels.pop(); await f.click('refresh');
  assert.equal(f.node('agentModel').value, 'gpt'); assert.equal(f.node('agentModel').options.find(option => option.value === 'gpt').disabled, true);
  await f.input('agentModel', 'gemini3pro', 'change');
  assert.equal(f.node('generate').disabled, false); assert.equal(f.node('error').hidden, true);
  assert.equal(f.node('status').textContent, '机位已设置，可以生成');
  await f.click('generate'); assert.equal(f.posts()[0].body.agentModelKey, 'gemini3pro');
});

test('空间推理选择冻结到一次提交，可见内容与画面提示词按纯文本展示并归属于原结果', async () => {
  let request, completed = false;
  const scenePrompt = 'Camera-level view, warm oak. <img src=x onerror=alert(1)>\nSoft daylight.';
  const viewSummary = '机位朝向90°，左侧门洞，正前方实墙。\n<b>墙后卧室不可见。</b>';
  const result = () => ({ ...rendered(request.camera), agent: { key: 'gpt', label: 'GPT 5.5' }, viewSummary, scenePrompt,
    actual: { generationMode: 'image-to-image', ...planReference } });
  const f = await fixture({ respond: async call => {
    if (call.method === 'POST') { request = call.body; return { job: { status: 'running' } }; }
    return completed ? { job: { status: 'success', result: result() } }
      : { job: { status: 'running', message: '正在分析该机位的可见空间…' } };
  } });
  await f.upload(source('户型')); await f.click('placeCenter'); await f.input('heading', 90);
  await f.input('agentModel', 'gpt', 'change'); await f.click('generate');
  assert.equal(request.agentModelKey, 'gpt'); assert.equal(f.node('agentModel').disabled, true);
  assert.equal(request.workflowVersion, '2026-11-07.floor-plan-camera.9');
  assert.match(f.node('status').textContent, /分析.*可见空间/);
  await f.input('agentModel', 'gemini3pro', 'change');
  assert.equal(JSON.parse(f.storage.get(SESSION)).agentModel, 'gpt'); assert.equal(request.agentModelKey, 'gpt');
  completed = true; await f.nextPoll();
  assert.equal(f.posts().length, 1); assert.equal(f.node('scenePrompt').textContent, scenePrompt);
  assert.equal(f.node('viewSummarySection').hidden, false); assert.equal(f.node('viewSummary').textContent, viewSummary);
  assert.equal(f.node('scenePromptDetails').hidden, false); assert.equal(f.node('scenePromptDetails').open, false);
  assert.match(f.node('resultMeta').textContent, /空间推理：GPT 5.5/);
  assert.match(f.node('resultMeta').textContent, /机位图参考/);
  await f.input('agentModel', 'gemini3pro', 'change'); await f.input('heading', 180);
  assert.match(f.node('resultMeta').textContent, /空间推理：GPT 5.5/);
  assert.match(f.node('resultMeta').textContent, /朝向 90°/); assert.equal(f.node('viewSummary').textContent, viewSummary);
  const restored = await fixture({ saved: JSON.parse(f.storage.get(SESSION)), respond: async () => ({ job: { status: 'success', result: result() } }) });
  assert.equal(restored.posts().length, 0); assert.equal(restored.node('scenePrompt').textContent, scenePrompt);
  assert.equal(restored.node('viewSummarySection').hidden, false); assert.equal(restored.node('viewSummary').textContent, viewSummary);
  assert.equal(restored.node('scenePromptDetails').open, false);
  assert.match(restored.node('resultMeta').textContent, /机位图参考/);
});

test('单张机位图参考门禁阻断不匹配的服务配置，旧结果不补摘要或模式标签', async () => {
  for (const incompatible of [
    { ...config, workflowVersion: '2026-11-07.floor-plan-camera.3' },
    { ...config, workflowVersion: '2026-11-07.floor-plan-camera.4' },
    { ...config, workflowVersion: '2026-11-07.floor-plan-camera.5' },
    { ...config, workflowVersion: '2026-11-07.floor-plan-camera.6' },
    { ...config, workflowVersion: '2026-11-07.floor-plan-camera.7' },
    { ...config, workflowVersion: '2026-11-07.floor-plan-camera.8' },
    { ...config, batch: undefined }, { ...config, batch: { ...config.batch, imageCounts: [1] } },
    { ...config, pipeline: undefined }, { ...config, prompt: { ...config.prompt, code: 'floor-plan-camera' } },
    { ...config, pipeline: 'scene-agent-to-image' }, { ...config, imageGeneration: undefined },
    { ...config, imageGeneration: { ...config.imageGeneration, referenceImageCount: 0 } },
    { ...config, imageGeneration: { ...config.imageGeneration, referenceImageCount: 2 } },
    { ...config, imageGeneration: { ...config.imageGeneration, mode: 'text-to-image' } },
    { ...config, imageGeneration: { ...config.imageGeneration, referenceImageRole: undefined } },
    { ...config, imageGeneration: { ...config.imageGeneration, referenceImageRole: 'unannotated-plan' } },
  ]) {
    const f = await fixture({ configuration: incompatible });
    await f.upload(source('户型')); await f.click('placeCenter'); await f.click('generate');
    assert.equal(f.node('generate').disabled, true); assert.equal(f.posts().length, 0);
  }
  const f = await fixture({ configuration: { ...config, agentModels: config.agentModels.map(({key,id,label}) => ({key,id,label})) },
    respond: async () => ({ job: { status: 'success', result: { ...rendered({x:.5,y:.5,heading:0,fov:60,height:1.5}),
      actual: { generationMode: 'image-to-image', referenceImageCount: 1 } } } }) });
  await f.upload(source('户型')); await f.click('placeCenter'); await f.click('generate');
  assert.equal(f.posts().length, 1); assert.equal(f.node('scenePromptDetails').hidden, true);
  assert.equal(f.node('scenePrompt').textContent, '');
  assert.equal(f.node('viewSummarySection').hidden, true); assert.equal(f.node('viewSummary').textContent, '');
  assert.doesNotMatch(f.node('resultMeta').textContent, /文生图|机位图参考|墙体遮挡估算|仅示镜头开角/);
});

test('旧文生图结果替换新结果时清除摘要，恢复时保留文生图标识', async () => {
  const camera = { x: .5, y: .5, heading: 90, fov: 60, height: 1.5 };
  let submissions = 0;
  const oldResult = { ...rendered(camera), actual: { generationMode: 'text-to-image', referenceImageCount: 0 } };
  const f = await fixture({ respond: async call => {
    if (call.method === 'POST') { submissions++; return { job: { status: 'running' } }; }
    return { job: { status: 'success', result: submissions === 1
      ? { ...rendered(camera), viewSummary: '右侧近处为实墙。', actual: { generationMode: 'image-to-image', ...planReference } }
      : oldResult } };
  } });
  await f.upload(source('户型')); await f.click('placeCenter'); await f.click('generate');
  assert.equal(f.node('viewSummarySection').hidden, false); assert.match(f.node('resultMeta').textContent, /机位图参考/);
  await f.click('generate');
  assert.equal(f.node('viewSummarySection').hidden, true); assert.equal(f.node('viewSummary').textContent, '');
  assert.match(f.node('resultMeta').textContent, /文生图/); assert.doesNotMatch(f.node('resultMeta').textContent, /机位图参考/);
  const restored = await fixture({ saved: JSON.parse(f.storage.get(SESSION)), respond: async () => ({ job: { status: 'success', result: oldResult } }) });
  assert.equal(restored.posts().length, 0); assert.equal(restored.reads().length, 1);
  assert.equal(restored.node('viewSummarySection').hidden, true);
  assert.match(restored.node('resultMeta').textContent, /文生图/); assert.doesNotMatch(restored.node('resultMeta').textContent, /机位图参考/);
});

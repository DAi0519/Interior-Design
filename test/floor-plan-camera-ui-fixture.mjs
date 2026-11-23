/**
 * [INPUT]: 依赖平面图机位 HTML、浏览器控制器、共享归档状态和模型目录
 * [OUTPUT]: 提供运行机位控制器的独立及参数挂载 DOM、同源 API 替身、机位和模型数据
 * [POS]: test 的平面图机位 UI 试验夹具，所有请求留在内存
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as geometry from '../public/floor-plan-camera-geometry.js';
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
  cameraLimits: { guideDepth: [.05, 1.5], showFrame: true },
  defaultAgentModel: 'gemini3pro', agentModels: [
    { key: 'gemini3pro', id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro', available: true, selectable: true },
    { key: 'gpt', id: 'gpt-5.5', label: 'GPT 5.5', available: true, selectable: true }],
  defaultModel: 'gptImage25Sunburst', models: ['gptImage25Sunburst', 'gptImage26Sunburst'].map(modelOption),
  resolutions: ['1K', '2K', '4K'], aspectRatios: ['16:9', '4:3', '1:1'], prompt: { code: 'floor-plan-camera-agent', version: 8, sha256: 'a'.repeat(64) } };
const source = name => ({ name: `${name}.png`, type: 'image/png', width: 1200, height: 600, size: 128, dataUrl: `data:image/png;base64,${Buffer.from(name).toString('base64')}` });
const rendered = camera => ({ action: 'render', source: { fileName: '原户型.png' }, camera, model: { label: 'GPT 2.5' }, image: { url: source('效果图').dataUrl, width: 2048, height: 1152 } });
async function fixture({ saved, respond = async () => ({ job: { status: 'failed', error: '模拟失败' } }), configuration = config,
  wallAnalysis = {}, bounds = canvasBounds, embedded = false } = {}) {
  const ids = new Map(), calls = [], timers = [], storage = new Map(), downloads = [], drawing = [];
  if (saved) storage.set(SESSION, JSON.stringify(saved));
  class Element {
    constructor(tag) {
      this.tagName = tag; this.listeners = new Map(); this.children = []; this.attributes = new Map(); this._value = '';
      this.disabled = false; this.hidden = false; this.open = false; this.textContent = '';
      const classes = new Set();
      this.classList = { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name),
        toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name) };
    }
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
    focus() {} remove() { this.removed = true; } setPointerCapture() {} releasePointerCapture() {} hasPointerCapture() { return true; }
    getBoundingClientRect() { return bounds; }
    getContext() {
      return new Proxy({}, { get: (_, name) => (...args) => drawing.push({ name, args }) });
    }
  }
  for (const [, tag, attributes] of page.matchAll(/<([\w-]+)\b([^>]*)>/g)) {
    const id = attributes.match(/\bid="([^"]+)"/)?.[1]; if (!id) continue;
    const node = new Element(tag); node.id = id; node.hidden = /\bhidden(?:\s|$)/.test(attributes); node.disabled = /\bdisabled(?:\s|$)/.test(attributes);
    node.value = attributes.match(/\bvalue="([^"]+)"/)?.[1] || ''; ids.set(id, node);
  }
  const picker = { keys: [], models: [] };
  const byId = id => ids.get(`camera-${id}`) || ids.get(id);
  const node = id => byId(id) || byId('complexityField').children.flatMap(label => label.children).find(child => child.id === `camera-${id}`);
  const body = new Element('body');
  const mounting = [];
  const parent = { createElement: tag => new Element(tag) };
  const context = vm.createContext({ ...geometry, atob, cameraVisibility: wallAnalysis.visible ?? (() => null),
    drawCameraAnnotation: (_context, camera, width, height, visiblePolygon) => {
      drawing.push({ name: 'annotation', args: structuredClone([camera, width, height, visiblePolygon]) });
    },
    drawCameraDepthHandle: (_context, guide) => {
      drawing.push({ name: 'depthHandle', args: structuredClone([guide.depthHandle]) });
    },
    document: { querySelectorAll: () => [...ids.values()], createElement: tag => new Element(tag), body },
    sessionStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    crypto: globalThis.crypto,
    ResizeObserver: class { observe() {} }, URL,
    setTimeout: callback => { timers.push(callback); return callback; },
    clearTimeout: callback => { const index = timers.indexOf(callback); if (index !== -1) timers.splice(index, 1); },
    createImageBitmap: async file => ({ width: file.width, height: file.height, close() {} }),
    readFileAsInput: async file => { if (file.fail) throw new Error('文件读取失败'); return { ...file }; },
    fillSelect: (select, options, current) => select.replaceChildren(...options.map(entry => {
      const node = new Element('option'), item = typeof entry === 'string' ? { value: entry, label: entry } : entry;
      node.value = item.value; node.textContent = item.label; node.selected = item.value === current; return node;
    })),
    mountWorkspaceControls(dock, settings, actions) {
      if (!embedded) return false;
      mounting.push([dock, settings.id, actions.id]);
      byId('model').ownerDocument = parent;
      byId('complexityField').ownerDocument = parent;
      return true;
    },
    bindModelMultiSelect({ container, presentOption, onChange, onMessage }) {
      if (embedded) assert.equal(container.ownerDocument, parent, '先挂载参数再绑定模型多选');
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
      if (path.includes('/config?')) return structuredClone(typeof configuration === 'function' ? configuration() : configuration);
      if (path.endsWith('/annotation')) {
        if (wallAnalysis.respond) return wallAnalysis.respond(call);
        const { width, height } = call.body.referenceImage;
        return { width, height, walls: null };
      }
      return respond(call);
    },
  });
  await vm.runInContext(`(async () => {${generationSyncScript.replace('export function', 'function')}
    ${script.replace(/^import\s+[^;]+;\n/gm, '').replace(/void import\([^;]+\);/g, '')}})()`, context);
  async function settle() { for (let i = 0; i < 3; i++) await new Promise(resolve => setImmediate(resolve)); }
  const fire = async (id, event = 'click', values = {}) => { await node(id).fire(event, values); await settle(); };
  await settle();
  return { node, calls, storage, downloads, drawing, mounting, body, models: () => picker.keys,
    annotations: () => calls.filter(call => call.path.endsWith('/annotation')),
    posts: () => calls.filter(call => call.method === 'POST' && !call.path.endsWith('/annotation')), reads: () => calls.filter(call => call.path.includes('/jobs/')),
    click: id => fire(id),
    toggleModel: async key => { picker.toggle(key); await settle(); },
    useModel: async key => {
      if (!picker.keys.includes(key)) picker.toggle(key);
      for (const other of picker.keys.filter(value => value !== key)) picker.toggle(other);
      await settle();
    },
    input: async (id, value, event = 'input') => { node(id).value = value; await fire(id, event); },
    upload: async file => { byId('sourceInput').files = [file]; await fire('sourceInput', 'change'); },
    pointer: (type, x, y, pointerType) => fire('canvas', type, { pointerId: 1, button: 0, clientX: x, clientY: y, pointerType }),
    key: (key, shiftKey = false) => fire('canvas', 'keydown', { key, shiftKey }),
    nextPoll: async () => { assert.ok(timers.length); timers.shift()(); await settle(); },
  };
}

export { SESSION, canvasBounds, config, fixture, modelOption, planReference, rendered, source };

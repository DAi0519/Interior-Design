/**
 * [INPUT]: 依赖平面编辑器桥接、共享容量合同、bootstrap 和同源 iframe/机位替身
 * [OUTPUT]: 验证空启动、危险数据拒绝、原生方案恢复、机位单位、统一保存与销毁
 * [POS]: test 的固定第三方引擎宿主合同，不加载真实 WebGL、不调用网络或生图模型
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { createFloorPlanEngine } from '../public/floor-plan-engine.js';

const emptyPlan = () => ({ version: 2, name: '未命名方案', phase: 'original', height: 2800, nodes: [], walls: [], openings: [], rooms: [], furniture: [] });

class Vector {
  constructor(x = 0, y = 0, z = 0) { Object.assign(this, { x, y, z }); }
  clone() { return new Vector(this.x, this.y, this.z); }
  toArray() { return [this.x, this.y, this.z]; }
  fromArray([x, y, z]) { Object.assign(this, { x, y, z }); return this; }
}

function fixture(options = {}) {
  const storage = new Map(), windows = [], shots = [], resizeEvents = [], errors = [];
  let tick, writes = 0;
  const sessionStorage = { setItem(k, value) { storage.set(k, value); }, getItem: k => storage.get(k) ?? null, removeItem(k) { storage.delete(k); } };
  const host = { location: { href: 'http://127.0.0.1:4192/' }, crypto: { randomUUID }, sessionStorage,
    setInterval(fn) { tick = fn; return 1; }, clearInterval() { tick = null; } };
  const frame = { tagName: 'IFRAME', ownerDocument: { defaultView: host } };
  Object.defineProperty(frame, 'src', { set(value) {
    writes += 1;
    if (value === 'about:blank') return;
    const location = new URL(value), doc = new EventTarget(), win = new EventTarget();
    const preset = JSON.parse(sessionStorage.getItem(`canvas-lab:floor-plan:load:${location.searchParams.get('seed')}`));
    const camera = { position: new Vector(4, 5, 6), lookAt() {}, getWorldDirection(out) { return out.fromArray([1, 0, 0]); } };
    const controls = { target: new Vector(3, 0, 2), enableDamping: true, update() {} };
    const fp = { active: false, x: 0, y: 0, yaw: 0, pitch: 0 };
    const designer = { app: { plan: emptyPlan(), view: '2d', sel: { kind: null, id: null }, rooms: { grid: Int32Array.from([1]), c: 10000, x0: 0, y0: 0, cols: 1, rows: 1 } },
      commit() {}, emit() {}, fit2D() {}, requestDraw() {}, replacePlan(plan) { this.app.plan = plan; }, setView(view) { this.app.view = view; },
      S3: { isAnimating: () => false, renderNow() {}, collide: (x, y) => ({ x, y }), lighting: { time: 15 }, walkCam: { eyeH: 1600 }, fp,
        setWalkCam(value) { Object.assign(this.walkCam, value); }, three: () => ({ camera, controls }), exitFP() { fp.active = false; } } };
    Object.assign(win, { location, document: doc, __PRESET__: preset, __designer: designer, Event, crypto: { randomUUID }, pump: async () => {},
      requestAnimationFrame(fn) { queueMicrotask(fn); },
      shot: async (...values) => { shots.push(values); const [x, y, yaw, pitch] = values; Object.assign(fp, { active: true, x, y, yaw, pitch }); return 'ok'; } });
    win.addEventListener('resize', () => resizeEvents.push(designer.app.view));
    frame.contentWindow = win;
    windows.push(win);
  } });
  const api = createFloorPlanEngine(frame, { onError: error => errors.push(error), ...options });
  return { api, frame, windows, shots, storage, errors, resizeEvents, tick: () => tick?.(), writes: () => writes,
    doc: () => frame.contentWindow.document, designer: () => frame.contentWindow.__designer };
}

test('平面引擎空启动且原生方案恢复不重载、不共享可变快照', async t => {
  const f = fixture(); t.after(() => f.api.destroy());
  await f.api.ready();
  assert.deepEqual((await f.api.getPlan()).furniture, []);
  assert.deepEqual(f.frame.contentWindow.__PRESET__.spec.walls, []);
  const restored = { ...emptyPlan(), name: '用户已调整的方案', furniture: [{ id: 'chair-1', key: 'chair', type: 'chair', x: 1000, y: 1000, rot: 90 }] };
  const before = f.writes();
  await f.api.loadPlan(restored);
  assert.equal(f.writes(), before);
  restored.furniture[0].x = 5000;
  const snapshot = await f.api.getPlan();
  assert.equal(snapshot.furniture[0].x, 1000);
  snapshot.furniture[0].x = 7000;
  assert.equal(f.designer().app.plan.furniture[0].x, 1000);
});

test('平面引擎拒绝非有限坐标、过大网格、未知家具和危险资源数据', async t => {
  const f = fixture(); t.after(() => f.api.destroy());
  await f.api.ready();
  const spec = { walls: [], rooms: [], furniture: [] };
  assert.throws(() => f.api.loadSpec({ ...spec, walls: [{ a: [0, 0], b: [NaN, 0] }] }), /无效数字/);
  assert.throws(() => f.api.loadSpec({ ...spec, walls: [{ a: [0, 0], b: [50000, 0] }] }), /40 米/);
  assert.throws(() => f.api.loadSpec({ ...spec, furniture: [{ key: 'unknown', at: [0, 0] }] }), /未支持的家具/);
  assert.throws(() => f.api.loadSpec(JSON.parse('{"walls":[],"rooms":[],"furniture":[],"__proto__":{}}')), /不支持的资源字段/);
  assert.throws(() => f.api.loadSpec({ ...spec, name: 'https://remote.example/asset' }), /外部资源/);
  await assert.rejects(f.api.loadPlan({ ...emptyPlan(), nodes: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 50000, y: 0 }] }), /40 米/);
  await assert.rejects(f.api.setView('split'), /只支持/);
});

test('新 HouseSpec 使用独立预设 ID 并移除旧文档保存监听', async t => {
  let saves = 0;
  const f = fixture({ onSave: () => { saves += 1; } }); t.after(() => f.api.destroy());
  await f.api.ready();
  const oldDoc = f.doc(), oldId = f.frame.contentWindow.__PRESET__.id;
  await f.api.loadSpec({ name: '新户型', walls: [], rooms: [], furniture: [] });
  assert.notEqual(f.frame.contentWindow.__PRESET__.id, oldId);
  assert.equal(f.frame.contentWindow.__PRESET__.spec.autoElec, false);
  oldDoc.dispatchEvent(new Event('canvas-floor-plan-save'));
  assert.equal(saves, 0);
  f.doc().dispatchEvent(new Event('canvas-floor-plan-save'));
  assert.equal(saves, 1);
});

test('机位使用毫米与北向角度，保存恢复漫游和鸟瞰且切换后重算尺寸', async t => {
  const f = fixture(); t.after(() => f.api.destroy());
  await f.api.ready();
  await f.api.setCamera({ x: 1200, y: 2400, yaw: 180, pitch: -15, eyeHeight: 1750 });
  assert.deepEqual(f.shots[0].slice(0, 2), [1200, 2400]);
  assert.ok(Math.abs(f.shots[0][2] - Math.PI / 2) < 1e-10);
  assert.ok(Math.abs(f.shots[0][3] + Math.PI / 12) < 1e-10);
  const walk = await f.api.getPose();
  assert.equal(walk.kind, 'walk');
  assert.equal(walk.camera.yaw, 180);
  const orbit = { version: 1, kind: 'orbit', position: [6, 7, 8], target: [3, 0, 4] };
  await f.api.setPose(orbit);
  assert.deepEqual(await f.api.getPose(), orbit);
  await f.api.setPose(walk);
  assert.equal((await f.api.getPose()).kind, 'walk');
  await f.api.setView('2d');
  assert.ok(f.resizeEvents.includes('3d'));
  assert.equal(f.resizeEvents.at(-1), '2d');
  await assert.rejects(f.api.setCamera({ x: -100, y: -100, yaw: 0 }), /闭合房间/);
});

test('Ctrl/Cmd+S 在原生处理前提交输入并保存宿主草稿，含输入框焦点', async t => {
  const order = [];
  const f = fixture({ onSave: () => { order.push('host-save'); } }); t.after(() => f.api.destroy());
  await f.api.ready();
  const win = f.frame.contentWindow, doc = f.doc();
  doc.activeElement = { blur: () => order.push('input-commit') };
  const source = await readFile(new URL('../public/vendor/house-plan-designer/bootstrap.js', import.meta.url), 'utf8');
  vm.runInNewContext(source, { window: win, document: doc, location: win.location, sessionStorage: { getItem: k => f.storage.get(k), removeItem: k => f.storage.delete(k) },
    crypto: { randomUUID }, URLSearchParams, CustomEvent, Event, Promise, Error });
  doc.addEventListener('keydown', () => order.push('native-save'));
  for (const modifier of ['ctrlKey', 'metaKey']) {
    const event = new Event('keydown', { cancelable: true });
    Object.defineProperties(event, { key: { value: 's' }, [modifier]: { value: true }, target: { value: { matches: () => true } } });
    doc.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
  }
  assert.deepEqual(order, ['input-commit', 'host-save', 'input-commit', 'host-save']);
});

test('变更回调去重，销毁解绑保存且阻断后续使用', async () => {
  let changes = 0, saves = 0;
  const f = fixture({ onChange: () => { changes += 1; }, onSave: () => { saves += 1; } });
  await f.api.ready();
  f.designer().app.plan.name = '修改后';
  f.tick(); f.tick();
  assert.equal(changes, 1);
  const doc = f.doc();
  f.api.destroy(); f.api.destroy();
  doc.dispatchEvent(new Event('canvas-floor-plan-save'));
  assert.equal(saves, 0);
  assert.throws(() => f.api.ready(), /已关闭/);
});

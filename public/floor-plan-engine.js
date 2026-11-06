/**
 * [INPUT]: 依赖固定版同源编辑器的 __designer 调试合同与共享平面布局容量常量
 * [OUTPUT]: 提供 createFloorPlanEngine，封装单层编辑/统一保存回调/视图机位/原生 PNG 与点选
 * [POS]: AI设计平面布局与第三方引擎间的唯一桥接，不调用模型、不接收密钥或任意消息
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { FLOOR_PLAN_FURNITURE_KEYS, FLOOR_PLAN_LIMITS } from './floor-plan-contract.js';

const EDITOR_PATH = '/vendor/house-plan-designer/editor.html';
const STORAGE_PREFIX = 'canvas-lab:floor-plan:load:';
const SAVE_EVENT = 'canvas-floor-plan-save';
const DEG = Math.PI / 180;
const MAX_JSON_BYTES = 2000000;
const forbiddenKeys = new Set(['__proto__', 'prototype', 'constructor', 'src', 'url', 'href', 'modelId']);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const abortError = message => Object.assign(new Error(message), { name: 'AbortError' });

function cloneData(value) {
  const inspect = (item, depth = 0) => {
    if (depth > 24) throw new Error('平面方案层级过深');
    if (typeof item === 'function' || typeof item === 'bigint' || typeof item === 'symbol') throw new Error('平面方案含有不支持的数据类型');
    if (typeof item === 'number' && !Number.isFinite(item)) throw new Error('平面方案含有无效数字');
    if (typeof item === 'string' && (item.length > 8000 || /(?:https?:|javascript:|data:|file:|blob:|<\/?(?:script|iframe|img|svg)\b)/i.test(item))) {
      throw new Error('平面方案不支持外部资源或可执行内容');
    }
    if (!item || typeof item !== 'object') return;
    for (const [key, child] of Object.entries(item)) {
      if (forbiddenKeys.has(key)) throw new Error('平面方案含有不支持的资源字段');
      inspect(child, depth + 1);
    }
  };
  inspect(value);
  const json = JSON.stringify(value);
  if (!json || json.length > MAX_JSON_BYTES) throw new Error('平面方案数据缺失或超过容量限制');
  return JSON.parse(json);
}

function checkExtent(points) {
  if (!points.length) return;
  for (const axis of ['x', 'y']) {
    const values = points.map(point => point[axis]);
    if (Math.max(...values) - Math.min(...values) > FLOOR_PLAN_LIMITS.maxExtent) throw new Error('首版平面布局支持长宽各不超过 40 米的单层空间');
  }
}

function checkPoint(point) {
  if (!Array.isArray(point) || point.length !== 2 || !point.every(n => Number.isFinite(n) && Math.abs(n) <= FLOOR_PLAN_LIMITS.maxCoordinate)) throw new Error('户型描述含有无效的毫米坐标');
  return { x: point[0], y: point[1] };
}

function checkSpec(spec) {
  if (!spec || spec.floors || !Array.isArray(spec.walls) || !Array.isArray(spec.rooms) || !Array.isArray(spec.furniture)) throw new Error('请选择有效的单层户型描述');
  if (spec.walls.length > FLOOR_PLAN_LIMITS.maxWalls || spec.rooms.length > FLOOR_PLAN_LIMITS.maxRooms || spec.furniture.length > FLOOR_PLAN_LIMITS.maxFurniture) throw new Error('户型描述对象数量超过容量');
  if (spec.height !== undefined) finite(spec.height, '层高', 2000, FLOOR_PLAN_LIMITS.maxHeight);
  const points = [];
  for (const wall of spec.walls) {
    points.push(checkPoint(wall.a), checkPoint(wall.b));
    if (wall.t !== undefined) finite(wall.t, '墙厚', 40, 1000);
    if (wall.openings !== undefined && (!Array.isArray(wall.openings) || wall.openings.length > 24)) throw new Error('墙体门窗数量无效');
    for (const opening of wall.openings || []) {
      finite(opening.from, '门窗起点', -FLOOR_PLAN_LIMITS.maxCoordinate, FLOOR_PLAN_LIMITS.maxCoordinate);
      finite(opening.to, '门窗终点', -FLOOR_PLAN_LIMITS.maxCoordinate, FLOOR_PLAN_LIMITS.maxCoordinate);
    }
  }
  for (const room of spec.rooms) checkPoint(room.at);
  for (const item of spec.furniture) {
    checkPoint(item.at);
    if (!FLOOR_PLAN_FURNITURE_KEYS.includes(item.key)) throw new Error('户型描述含有未支持的家具');
    for (const axis of ['w', 'd', 'h']) if (item[axis] !== undefined) finite(item[axis], '家具尺寸', 10, 10000);
  }
  checkExtent(points);
  return spec;
}

function checkNativePlan(plan) {
  if (!plan || plan.version !== 2 || plan.kind === 'building' || plan.floors) throw new Error('请选择有效的单层平面方案');
  for (const key of ['nodes', 'walls', 'openings', 'rooms', 'furniture']) {
    if (!Array.isArray(plan[key])) throw new Error(`平面方案缺少 ${key}`);
  }
  if (plan.nodes.length > 600 || plan.walls.length > 500 || plan.furniture.length > 500) throw new Error('平面方案对象数量超过编辑器容量');
  for (const node of plan.nodes) {
    if (![node.x, node.y].every(Number.isFinite) || Math.max(Math.abs(node.x), Math.abs(node.y)) > FLOOR_PLAN_LIMITS.maxCoordinate) throw new Error('平面方案节点坐标超出范围');
  }
  checkExtent(plan.nodes);
  finite(plan.height, '层高', 2000, FLOOR_PLAN_LIMITS.maxHeight);
  if (plan.furniture.some(item => item.type === 'model')) throw new Error('平面布局暂不支持导入外部模型');
  return plan;
}

function finite(value, name, min, max) {
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${name}超出可用范围`);
  return value;
}

function insideRoom(designer, point) {
  const rooms = designer.app.rooms;
  if (!rooms?.grid || !rooms.c) return false;
  const x = Math.floor((point.x - rooms.x0) / rooms.c);
  const y = Math.floor((point.y - rooms.y0) / rooms.c);
  return x >= 0 && y >= 0 && x < rooms.cols && y < rooms.rows && rooms.grid[y * rooms.cols + x] > 0;
}

export function createFloorPlanEngine(frame, { onChange = () => {}, onSave = () => {}, onError = () => {} } = {}) {
  if (!frame || frame.tagName !== 'IFRAME') throw new TypeError('平面编辑器需要 iframe 容器');
  let destroyed = false;
  let epoch = 0;
  let loading = null;
  let serialized = '';
  let cancelPoint = null;
  let pendingStorage = '';
  let requestedId = '';
  let loadedId = '';
  let saveDocument = null;
  const hostWindow = frame.ownerDocument.defaultView;
  const editorURL = new URL(EDITOR_PATH, hostWindow.location.href);

  const requestSave = () => {
    try { Promise.resolve(onSave()).catch(onError); } catch (error) { onError(error); }
  };

  function bindSave(doc) {
    saveDocument?.removeEventListener(SAVE_EVENT, requestSave);
    saveDocument = doc;
    saveDocument?.addEventListener(SAVE_EVENT, requestSave);
  }

  function assertLive() {
    if (destroyed) throw abortError('平面编辑器已关闭');
  }

  function context() {
    assertLive();
    const win = frame.contentWindow;
    if (!win || win.location.origin !== editorURL.origin || win.location.pathname !== EDITOR_PATH) throw new Error('平面编辑器来源不匹配');
    const designer = win.__designer;
    if (!designer) throw new Error('平面编辑器尚未准备完成');
    return { win, designer, doc: win.document };
  }

  async function waitUntilReady(id, token) {
    const deadline = Date.now() + 45000;
    for (;;) {
      assertLive();
      if (token !== epoch) throw abortError('平面编辑器正在加载新方案');
      let current;
      try { current = context(); } catch { current = null; }
      if (current?.win.__PRESET__?.id === id) {
        if (current.win.__FLOOR_PLAN_LOAD_ERROR__) throw new Error(current.win.__FLOOR_PLAN_LOAD_ERROR__);
        // -- 单层布局编辑 -----------------------------------------------------
        // 使用原始结构编辑阶段，墙体保持可调整；施工拆改状态不进入产品流程。
        current.designer.app.plan.phase = 'original';
        current.designer.commit();
        current.designer.emit('phase');
        serialized = JSON.stringify(current.designer.app.plan);
        bindSave(current.doc);
        loadedId = id;
        return;
      }
      const runtimeError = frame.contentWindow?.__FLOOR_PLAN_RUNTIME_ERROR__;
      if (runtimeError) throw new Error(`平面编辑器启动失败：${runtimeError}`);
      if (Date.now() > deadline) throw new Error('平面编辑器加载超时，请确认浏览器支持 WebGL 后重试');
      await pause(50);
    }
  }

  function navigate(payload) {
    assertLive();
    cancelPoint?.();
    bindSave(null);
    const seed = hostWindow.crypto.randomUUID();
    if (pendingStorage) hostWindow.sessionStorage.removeItem(pendingStorage);
    pendingStorage = STORAGE_PREFIX + seed;
    hostWindow.sessionStorage.setItem(pendingStorage, JSON.stringify({ id: seed, ...payload }));
    const url = new URL(editorURL);
    url.searchParams.set('debug', '1');
    url.searchParams.set('seed', seed);
    const token = ++epoch;
    requestedId = seed;
    frame.src = url.href;
    loading = waitUntilReady(seed, token);
    loading.catch(() => {});
    return loading;
  }

  const ready = () => { assertLive(); return loading; };
  const getContext = async () => { await ready(); return context(); };

  async function settle(designer, win) {
    const deadline = Date.now() + 6000;
    while (designer.app.transitioning || designer.S3.isAnimating()) {
      if (Date.now() > deadline) throw new Error('空间视图切换超时，请重试');
      await win.pump(50);
    }
  }

  async function setView(view) {
    if (view !== '2d' && view !== '3d') throw new Error('平面编辑器只支持平面布局和空间预览');
    cancelPoint?.();
    const { designer, win } = await getContext();
    await settle(designer, win);
    await designer.setView(view);
    await settle(designer, win);
    win.dispatchEvent(new win.Event('resize'));
    await new Promise(resolve => win.requestAnimationFrame(resolve));
    designer.requestDraw();
    if (view === '3d') designer.S3.renderNow();
  }

  async function setCamera({ x, y, yaw, pitch = 0, eyeHeight = 1600 }) {
    finite(x, '机位横坐标', -FLOOR_PLAN_LIMITS.maxCoordinate, FLOOR_PLAN_LIMITS.maxCoordinate);
    finite(y, '机位纵坐标', -FLOOR_PLAN_LIMITS.maxCoordinate, FLOOR_PLAN_LIMITS.maxCoordinate);
    finite(yaw, '机位朝向', -3600, 3600);
    finite(pitch, '机位俯仰', -75, 75);
    finite(eyeHeight, '机位视高', 600, 3000);
    await setView('3d');
    const { designer, win } = await getContext();
    if (!insideRoom(designer, { x, y })) throw new Error('请把机位放在闭合房间内，避开墙体');
    const clearPoint = designer.S3.collide(x, y);
    if (Math.hypot(clearPoint.x - x, clearPoint.y - y) > 50) throw new Error('机位距离墙体或障碍过近，请选择房间内的空位');
    designer.S3.setWalkCam({ eyeH: eyeHeight, dist: 0 });
    const status = await win.shot(x, y, (yaw - 90) * DEG, pitch * DEG, designer.S3.lighting.time ?? 15);
    if (status !== 'ok') throw new Error('无法进入该机位，请重新选择房间内的位置');
  }

  async function getCamera() {
    const { designer } = await getContext();
    const fp = designer.S3.fp;
    if (fp.active) return { x: fp.x, y: fp.y, yaw: ((fp.yaw / DEG + 90) % 360 + 360) % 360, pitch: fp.pitch / DEG, eyeHeight: designer.S3.walkCam.eyeH };
    const { camera } = designer.S3.three();
    const direction = camera.position.clone();
    camera.getWorldDirection(direction);
    return { x: camera.position.x * 1000, y: camera.position.z * 1000, yaw: ((Math.atan2(direction.z, direction.x) / DEG + 90) % 360 + 360) % 360, pitch: Math.asin(direction.y) / DEG, eyeHeight: camera.position.y * 1000 };
  }

  async function getPose() {
    await setView('3d');
    const { designer } = await getContext();
    if (designer.S3.fp.active) return { version: 1, kind: 'walk', camera: await getCamera() };
    const { camera, controls } = designer.S3.three();
    return { version: 1, kind: 'orbit', position: camera.position.toArray(), target: controls.target.toArray() };
  }

  async function setPose(input) {
    const pose = cloneData(input);
    if (pose.version !== 1 || !['orbit', 'walk'].includes(pose.kind)) throw new Error('保存的机位格式无效');
    if (pose.kind === 'walk') return setCamera(pose.camera);
    for (const value of [pose.position, pose.target]) {
      if (!Array.isArray(value) || value.length !== 3 || value.some(n => !Number.isFinite(n) || Math.abs(n) > 300)) throw new Error('保存的机位坐标无效');
    }
    await setView('3d');
    const { designer, win } = await getContext();
    designer.S3.exitFP(true);
    await settle(designer, win);
    const { camera, controls } = designer.S3.three();
    const damping = controls.enableDamping;
    controls.enableDamping = false;
    camera.position.fromArray(pose.position);
    controls.target.fromArray(pose.target);
    camera.lookAt(controls.target);
    controls.update();
    controls.enableDamping = damping;
    designer.S3.renderNow();
  }

  async function capture() {
    const { designer, doc, win } = await getContext();
    await settle(designer, win);
    const selection = { ...designer.app.sel };
    designer.select(null);
    designer.requestDraw();
    try {
      await new Promise(resolve => win.requestAnimationFrame(() => win.requestAnimationFrame(resolve)));
      const is3d = designer.app.view === '3d';
      if (is3d) designer.S3.renderNow();
      const source = doc.querySelector(is3d ? '#c3d' : '#c2d');
      if (!source?.width || !source.height) throw new Error('当前视图尚未就绪');
      const output = doc.createElement('canvas');
      const scale = Math.min(1, 2048 / Math.max(source.width, source.height));
      output.width = Math.max(1, Math.round(source.width * scale));
      output.height = Math.max(1, Math.round(source.height * scale));
      output.getContext('2d').drawImage(source, 0, 0, output.width, output.height);
      return output.toDataURL('image/png');
    } finally {
      designer.select(selection.kind, selection.id);
    }
  }

  async function pickCameraPoint() {
    await setView('2d');
    const { designer, doc } = await getContext();
    const canvas = doc.querySelector('#c2d');
    return new Promise((resolve, reject) => {
      const previous = canvas.style.cursor;
      canvas.style.cursor = 'crosshair';
      const clean = () => {
        canvas.removeEventListener('pointerdown', pick, true);
        doc.removeEventListener('keydown', escape, true);
        canvas.style.cursor = previous;
        cancelPoint = null;
      };
      const escape = event => {
        if (event.key === 'Escape') { event.preventDefault(); clean(); reject(abortError('已取消选择机位')); }
      };
      const pick = event => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const rect = canvas.getBoundingClientRect();
        const point = { x: Math.round((event.clientX - rect.left - designer.view.ox) / designer.view.s), y: Math.round((event.clientY - rect.top - designer.view.oy) / designer.view.s) };
        if (!insideRoom(designer, point)) return;
        clean();
        resolve(point);
      };
      cancelPoint = () => { clean(); reject(abortError('已取消选择机位')); };
      canvas.addEventListener('pointerdown', pick, true);
      doc.addEventListener('keydown', escape, true);
    });
  }

  const watch = hostWindow.setInterval(() => {
    if (destroyed || loadedId !== requestedId) return;
    try {
      const { designer } = context();
      const next = JSON.stringify(designer.app.plan);
      if (next === serialized) return;
      serialized = next;
      onChange(JSON.parse(next));
    } catch (error) {
      if (error.name !== 'SecurityError' && frame.contentWindow?.__designer) onError(error);
    }
  }, 1000);

  navigate({ spec: { name: '未命名方案', height: 2800, phase: 'original', walls: [], rooms: [], furniture: [], autoElec: false } });
  return {
    ready,
    loadSpec(spec) {
      const copy = checkSpec(cloneData(spec));
      return navigate({ spec: { ...copy, phase: 'original', autoElec: false } });
    },
    async getPlan() { const { designer } = await getContext(); return cloneData(designer.app.plan); },
    async loadPlan(plan) {
      const copy = checkNativePlan(cloneData(plan));
      copy.phase = 'original';
      const { designer } = await getContext();
      designer.replacePlan(copy);
      designer.fit2D();
      serialized = JSON.stringify(designer.app.plan);
    },
    setView,
    setCamera,
    getCamera,
    getPose,
    setPose,
    capture,
    pickCameraPoint,
    cancelPick() { cancelPoint?.(); },
    async fit() {
      const { designer, win } = await getContext();
      if (designer.app.view === '3d') {
        await settle(designer, win);
        designer.S3.exitFP(true);
        designer.S3.setPose(designer.S3.birdPose());
        designer.S3.renderNow();
      } else designer.fit2D();
    },
    destroy() {
      if (destroyed) return;
      cancelPoint?.();
      destroyed = true;
      epoch += 1;
      hostWindow.clearInterval(watch);
      bindSave(null);
      if (pendingStorage) hostWindow.sessionStorage.removeItem(pendingStorage);
      frame.src = 'about:blank';
    },
  };
}

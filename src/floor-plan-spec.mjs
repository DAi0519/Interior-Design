/**
 * [INPUT]: 依赖 public/floor-plan-contract 的单层户型、家具和材质白名单，接收模型或本地导入的原生 HouseSpec 数据
 * [OUTPUT]: 对外提供严格 HouseSpec 规范化、模型 JSON 解析与几何/洞口关联校验；未知字段、危险对象和无效尺寸直接拒绝
 * [POS]: src 的平面布局纯数据边界，识图服务输出与浏览器编辑器使用同一份毫米坐标合同
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { FLOOR_PLAN_FURNITURE_KEYS, FLOOR_PLAN_MATERIALS, FLOOR_PLAN_WALL_MATERIALS,
  FLOOR_PLAN_OPENING_TYPES, FLOOR_PLAN_LIMITS } from "../public/floor-plan-contract.js";

const BAD_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const fail = (message) => Object.assign(new Error(`平面布局数据无效：${message}`), { statusCode: 502, floorPlanSafe: true });
const own = (value, key) => Object.hasOwn(value, key);

// --- 只接受 JSON 数据树，禁止原型、访问器和无界嵌套进入模板 ---
function assertDataTree(value, depth = 0, budget = { count: 0 }) {
  if (++budget.count > 12_000 || depth > 12) throw fail("数据层级或规模超过首版上限");
  if (!value || typeof value !== "object") return;
  const expected = Array.isArray(value) ? Array.prototype : Object.prototype;
  if (Object.getPrototypeOf(value) !== expected && Object.getPrototypeOf(value) !== null) throw fail("对象原型不受支持");
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || BAD_KEYS.has(key)) throw fail("包含危险字段");
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!own(descriptor, "value")) throw fail("不允许访问器字段");
    assertDataTree(descriptor.value, depth + 1, budget);
  }
}

function object(value, required, optional, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw fail(`${path} 必须是对象`);
  if (required.some((key) => !own(value, key)) || Object.keys(value).some((key) => !required.includes(key) && !optional.includes(key))) {
    throw fail(`${path} 字段缺失或包含未知字段`);
  }
}

function number(value, min, max, path) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw fail(`${path} 数值超出范围`);
  return Object.is(value, -0) ? 0 : Math.round(value * 1000) / 1000;
}

function text(value, max, path) {
  if (typeof value !== "string" || !value.trim() || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f<>]/.test(value)) {
    throw fail(`${path} 必须是长度适当的纯文本`);
  }
  return value.trim();
}

function point(value, path) {
  if (!Array.isArray(value) || value.length !== 2) throw fail(`${path} 必须是二维坐标`);
  return value.map((coordinate, index) => number(coordinate, -FLOOR_PLAN_LIMITS.maxCoordinate, FLOOR_PLAN_LIMITS.maxCoordinate, `${path}[${index}]`));
}

function list(value, min, max, path) {
  if (!Array.isArray(value) || value.length < min || value.length > max) throw fail(`${path} 数量超出范围`);
  return value;
}

function member(value, allowed, path) {
  if (!allowed.includes(value)) throw fail(`${path} 不在允许目录中`);
  return value;
}

function boolean(value, path) {
  if (typeof value !== "boolean") throw fail(`${path} 必须是布尔值`);
  return value;
}

function openingOf(value, wall, index, path, height) {
  object(value, ["type", "from", "to"], ["sill", "head", "hinge", "into", "unsure"], path);
  const result = { type: member(value.type, FLOOR_PLAN_OPENING_TYPES, `${path}.type`),
    from: number(value.from, -FLOOR_PLAN_LIMITS.maxCoordinate, FLOOR_PLAN_LIMITS.maxCoordinate, `${path}.from`),
    to: number(value.to, -FLOOR_PLAN_LIMITS.maxCoordinate, FLOOR_PLAN_LIMITS.maxCoordinate, `${path}.to`) };
  const horizontal = Math.abs(wall.a[1] - wall.b[1]) < 0.001;
  const vertical = Math.abs(wall.a[0] - wall.b[0]) < 0.001;
  const axis = horizontal ? 0 : 1;
  const range = horizontal || vertical ? [Math.min(wall.a[axis], wall.b[axis]), Math.max(wall.a[axis], wall.b[axis])]
    : [0, Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1])];
  if (result.to - result.from < 100 || result.from < range[0] - 0.001 || result.to > range[1] + 0.001) throw fail(`${path} 洞口未落在所属墙段内`);
  if (own(value, "sill")) result.sill = number(value.sill, 0, height - 100, `${path}.sill`);
  if (own(value, "head")) result.head = number(value.head, 100, height, `${path}.head`);
  if (result.head !== undefined && result.head <= (result.sill || 0)) throw fail(`${path} 洞顶必须高于窗台`);
  if (own(value, "hinge")) result.hinge = member(value.hinge, ["from", "to"], `${path}.hinge`);
  if (own(value, "into")) result.into = point(value.into, `${path}.into`);
  if (own(value, "unsure")) result.unsure = text(value.unsure, 500, `${path}.unsure`);
  return { ...result, _index: index };
}

function wallOf(value, index, height) {
  const path = `walls[${index}]`;
  object(value, ["a", "b", "t"], ["bearing", "bearingFrom", "openings"], path);
  const result = { a: point(value.a, `${path}.a`), b: point(value.b, `${path}.b`), t: number(value.t, 60, 600, `${path}.t`) };
  if (Math.hypot(result.b[0] - result.a[0], result.b[1] - result.a[1]) < 100) throw fail(`${path} 墙段太短或起终点重合`);
  if (own(value, "bearing")) result.bearing = boolean(value.bearing, `${path}.bearing`);
  if (own(value, "bearingFrom")) result.bearingFrom = member(value.bearingFrom, ["inferred", "drawing"], `${path}.bearingFrom`);
  if (own(value, "openings")) {
    const openings = list(value.openings, 0, 12, `${path}.openings`).map((entry, openingIndex) => openingOf(entry, result, openingIndex, `${path}.openings[${openingIndex}]`, height));
    const sorted = [...openings].sort((left, right) => left.from - right.from);
    if (sorted.some((entry, openingIndex) => openingIndex > 0 && entry.from < sorted[openingIndex - 1].to - 0.001)) throw fail(`${path} 洞口相互重叠`);
    result.openings = openings.map(({ _index, ...entry }) => entry);
  }
  return result;
}

export function normalizeFloorPlanSpec(value) {
  assertDataTree(value);
  object(value, ["name", "height", "walls", "rooms", "furniture"], ["phase", "autoElec"], "spec");
  if (own(value, "phase") && value.phase !== "renovate") throw fail("首版仅支持装修布置方案");
  if (own(value, "autoElec") && value.autoElec !== false) throw fail("首版不自动创建水电方案");
  const height = number(value.height, 1800, FLOOR_PLAN_LIMITS.maxHeight, "height");
  const walls = list(value.walls, 3, FLOOR_PLAN_LIMITS.maxWalls, "walls").map((wall, index) => wallOf(wall, index, height));
  const wallKeys = walls.map(({ a, b }) => [a.join(","), b.join(",")].sort().join("|"));
  if (new Set(wallKeys).size !== wallKeys.length) throw fail("存在重复墙段");
  const allPoints = walls.flatMap(({ a, b }) => [a, b]);
  const bounds = [0, 1].map((axis) => [Math.min(...allPoints.map((at) => at[axis])), Math.max(...allPoints.map((at) => at[axis]))]);
  if (bounds.some(([min, max]) => max - min < 300)) throw fail("墙体没有形成有效的二维范围");
  if (bounds.some(([min, max]) => max - min > FLOOR_PLAN_LIMITS.maxExtent)) throw fail("单层户型的宽度与进深均不能超过40m");
  const within = (at, path, tolerance = 0) => {
    if (bounds.some(([min, max], axis) => at[axis] < min - tolerance || at[axis] > max + tolerance)) throw fail(`${path} 位于户型范围以外`);
    return at;
  };
  const rooms = list(value.rooms, 1, FLOOR_PLAN_LIMITS.maxRooms, "rooms").map((room, index) => {
    const path = `rooms[${index}]`;
    object(room, ["at", "name"], ["mat", "wallMat"], path);
    const result = { at: within(point(room.at, `${path}.at`), path), name: text(room.name, 60, `${path}.name`) };
    if (own(room, "mat")) result.mat = member(room.mat, FLOOR_PLAN_MATERIALS, `${path}.mat`);
    if (own(room, "wallMat")) result.wallMat = member(room.wallMat, FLOOR_PLAN_WALL_MATERIALS, `${path}.wallMat`);
    return result;
  });
  const furniture = list(value.furniture, 0, FLOOR_PLAN_LIMITS.maxFurniture, "furniture").map((item, index) => {
    const path = `furniture[${index}]`;
    object(item, ["key", "at", "rot"], ["w", "d", "h"], path);
    const result = { key: member(item.key, FLOOR_PLAN_FURNITURE_KEYS, `${path}.key`),
      at: within(point(item.at, `${path}.at`), path, 600), rot: member(item.rot, [0, 90, 180, 270], `${path}.rot`) };
    for (const dimension of ["w", "d", "h"]) if (own(item, dimension)) result[dimension] = number(item[dimension], 100, 12_000, `${path}.${dimension}`);
    return result;
  });
  return { name: text(value.name, 100, "name"), height, phase: "renovate", walls, rooms, furniture, autoElec: false };
}

export function parseFloorPlanOutput(source) {
  if (typeof source !== "string" || !source.trim() || source.length > 160_000) throw fail("模型输出为空或超过规模上限");
  const json = source.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let value;
  try { value = JSON.parse(json); }
  catch { throw fail("模型未返回完整合法 JSON，可能已截断；请简化图纸后新建任务"); }
  assertDataTree(value);
  object(value, ["spec", "warnings"], ["user_requirements"], "root");
  if (own(value, "user_requirements") && Object.keys(value)[0] !== "user_requirements") throw fail("用户原文必须是首字段");
  if (own(value, "user_requirements") && (typeof value.user_requirements !== "string" || !value.user_requirements.trim()
    || value.user_requirements.length > 4000)) throw fail("用户原文格式无效");
  const warnings = list(value.warnings, 0, 30, "warnings").map((warning, index) => text(warning, 500, `warnings[${index}]`));
  if (value.spec === null) throw fail(warnings[0] || "无法从图片识别可用的户型围合，请补充清晰户型图");
  return { spec: normalizeFloorPlanSpec(value.spec),
    ...(own(value, "user_requirements") ? { userRequirements: value.user_requirements } : {}), warnings };
}

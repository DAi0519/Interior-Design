/**
 * [INPUT]: 依赖严格平面布局解析器与原生毫米坐标 HouseSpec 替身
 * [OUTPUT]: 验证有效单层方案、洞口关联、几何范围、目录白名单、原型注入与截断响应被正确处理
 * [POS]: test 的平面布局数据合同测试，不调用模型或浏览器
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from "node:assert/strict";
import test from "node:test";
import { normalizeFloorPlanSpec, parseFloorPlanOutput } from "../src/floor-plan-spec.mjs";

const spec = () => ({ name: "客厅布局", height: 2800, phase: "renovate", autoElec: false,
  walls: [{ a: [0, 0], b: [6000, 0], t: 200, bearing: true, bearingFrom: "inferred",
    openings: [{ type: "window", from: 2000, to: 4000, sill: 900, head: 2200, unsure: "窗台高待确认" }] },
  { a: [6000, 0], b: [6000, 4000], t: 200 }, { a: [6000, 4000], b: [0, 4000], t: 200,
    openings: [{ type: "door", from: 4600, to: 5500, hinge: "to", into: [5000, 3000] }] },
  { a: [0, 4000], b: [0, 0], t: 200 }],
  rooms: [{ at: [3000, 2000], name: "客厅", mat: "oak", wallMat: "latexWhite" }],
  furniture: [{ key: "sofa", at: [3000, 650], rot: 0, w: 2200, d: 950, h: 820 }] });
const envelope = () => ({ spec: spec(), warnings: ["层高按2800mm估算。"] });

test("原生 HouseSpec 按共享目录规范化，保留原生承重来源与窗疑问字符串", () => {
  const input = spec(), output = normalizeFloorPlanSpec(input);
  assert.deepEqual(output, input);
  output.walls[0].a[0] = 200;
  assert.equal(input.walls[0].a[0], 0);
  assert.equal(parseFloorPlanOutput("```json\n" + JSON.stringify(envelope()) + "\n```").warnings.length, 1);
});

test("非空用户原文须是首字段，并逐字保留空格换行和普通符号", () => {
  const original = "  保留窗户\n通道 < 1m 时少放家具  ";
  const output = parseFloorPlanOutput(JSON.stringify({ user_requirements: original, ...envelope() }));
  assert.equal(output.userRequirements, original);
  assert.throws(() => parseFloorPlanOutput(JSON.stringify({ ...envelope(), user_requirements: original })), /首字段/);
});

test("无法识图与截断输出明确失败，不补造默认户型", () => {
  assert.throws(() => parseFloorPlanOutput('{"spec":'), /完整合法 JSON.*截断/);
  assert.throws(() => parseFloorPlanOutput(JSON.stringify({ spec: null, warnings: ["图片模糊，无法判断围合墙体。"] })), /图片模糊/);
  assert.throws(() => parseFloorPlanOutput(JSON.stringify({ spec: spec(), warnings: [], floors: [] })), /未知字段/);
});

test("模型和导入数据中的原型注入、访问器、嵌套未知对象全部阻断", () => {
  for (const key of ["__proto__", "constructor", "prototype"]) {
    const data = JSON.parse(JSON.stringify(envelope()));
    Object.defineProperty(data.spec.walls[0], key, { enumerable: true, value: { polluted: true } });
    assert.throws(() => parseFloorPlanOutput(JSON.stringify(data)), /危险字段/);
  }
  const inherited = spec(); Object.setPrototypeOf(inherited, { unsafe: true });
  assert.throws(() => normalizeFloorPlanSpec(inherited), /对象原型/);
  const getter = spec(); Object.defineProperty(getter, "height", { enumerable: true, get() { throw new Error("must not run"); } });
  assert.throws(() => normalizeFloorPlanSpec(getter), /访问器/);
  assert.equal({}.polluted, undefined);
});

test("墙体零长度、重复、无限数、越界坐标和无二维范围不能进入编辑器", () => {
  for (const mutate of [
    (data) => { data.walls[0].b = [0, 0]; },
    (data) => { data.walls.push({ ...data.walls[1], a: [6000, 4000], b: [6000, 0] }); },
    (data) => { data.walls[0].a[0] = Infinity; },
    (data) => { data.walls[0].a[0] = 100001; },
    (data) => { data.height = "2800"; },
    (data) => { data.height = 20_000; },
    (data) => { data.walls[1].a = [50_000, 0]; data.walls[1].b = [50_000, 4000]; },
  ]) {
    const data = spec(); mutate(data);
    assert.throws(() => normalizeFloorPlanSpec(data), { statusCode: 502 });
  }
});

test("横墙、竖墙及斜墙洞口必须落在各自墙上且不能重叠", () => {
  for (const opening of [
    { type: "door", from: 5900, to: 6800 },
    { type: "window", from: 2000, to: 2000 },
    { type: "window", from: 500, to: 1500, sill: 2200, head: 2100 },
    { type: "script", from: 1000, to: 2000 },
  ]) {
    const data = spec(); data.walls[0].openings = [opening];
    assert.throws(() => normalizeFloorPlanSpec(data), { statusCode: 502 });
  }
  const overlap = spec(); overlap.walls[0].openings.push({ type: "door", from: 3000, to: 4500 });
  assert.throws(() => normalizeFloorPlanSpec(overlap), /重叠/);
  const vertical = spec(); vertical.walls[1].openings = [{ type: "door", from: 3200, to: 4100 }];
  assert.throws(() => normalizeFloorPlanSpec(vertical), /所属墙段/);
  const diagonal = spec(); diagonal.walls[1] = { a: [6000, 0], b: [8000, 4000], t: 200,
    openings: [{ type: "door", from: 1000, to: 2000 }] };
  assert.equal(normalizeFloorPlanSpec(diagonal).walls[1].openings.length, 1);
  diagonal.walls[1].openings[0].to = 5000;
  assert.throws(() => normalizeFloorPlanSpec(diagonal), /所属墙段/);
});

test("房间/家具位置、家具目录、材质和单层字段严格校验", () => {
  for (const mutate of [
    (data) => { data.rooms[0].at = [9000, 8000]; },
    (data) => { data.rooms[0].name = "<img onerror=evil>"; },
    (data) => { data.rooms[0].mat = "remote-texture"; },
    (data) => { data.furniture[0].key = "externalModel"; },
    (data) => { data.furniture[0].rot = 45; },
    (data) => { data.furniture[0].w = -1; },
    (data) => { data.autoElec = true; },
    (data) => { data.floors = []; },
    (data) => { data.furniture[0].url = "https://example.invalid/a.glb"; },
  ]) {
    const data = spec(); mutate(data);
    assert.throws(() => normalizeFloorPlanSpec(data), { statusCode: 502 });
  }
});

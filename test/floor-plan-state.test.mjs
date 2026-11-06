/**
 * [INPUT]: 依赖平面布局导入/存储纯函数、单层方案与机位样本
 * [OUTPUT]: 验证编辑方案和机位完整往返、原型污染/畸形机位/超大文件拒绝及本机存储失败可恢复
 * [POS]: test 的平面布局持久化合同，不启动浏览器或调用付费模型
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createFloorPlanDraftStore, demoFloorPlanSpec, parseFloorPlanDraft, serializeFloorPlanDraft } from "../public/floor-plan-state.js";
import { normalizeFloorPlanSpec } from "../src/floor-plan-spec.mjs";

function draft() {
  return { kind: "canvas-lab-floor-plan", version: 1,
    plan: { version: 2, name: "两室", walls: [], furniture: [] },
    cameras: [{ id: "living", name: "客厅反打", pose: { version: 1, kind: "orbit", position: [3, 2, 4], target: [1, 0, 2] } }],
    warnings: ["窗台高待核对"], isDemo: true, source: { fileName: "户型.png" }, savedAt: "2026-11-04T08:00:00Z" };
}

test("方案及机位本机保存/导出/导入完整往返，不丢失家具属性或待确认", () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
  const store = createFloorPlanDraftStore(storage), value = draft();
  store.write(value);
  assert.deepEqual(store.read(), value);
  assert.deepEqual(parseFloorPlanDraft(serializeFloorPlanDraft(value)), value);
  store.clear(); assert.equal(store.read(), null);
});

test("JSON导入拒绝原型字段和畸形机位，解析不修改全局原型", () => {
  assert.throws(() => parseFloorPlanDraft('{"__proto__":{"polluted":true}}'), /不支持的字段/);
  assert.equal({}.polluted, undefined);
  const value = draft(); value.cameras[0].pose.position = [1, 2];
  assert.throws(() => serializeFloorPlanDraft(value), /机位坐标不完整/);
  const duplicate = draft(); duplicate.cameras.push({ ...duplicate.cameras[0] });
  assert.throws(() => serializeFloorPlanDraft(duplicate), /无法恢复的机位/);
});

test("损坏文件、非有限坐标、过长或超限内容均在引擎运行前拒绝", () => {
  assert.throws(() => parseFloorPlanDraft("<html>"), /JSON无法读取|JSON 无法读取/);
  const value = draft(); value.cameras[0].pose.position[0] = Infinity;
  assert.throws(() => serializeFloorPlanDraft(value), /无效坐标/);
  assert.throws(() => parseFloorPlanDraft(" ".repeat(4 * 1024 * 1024 + 1)), /不能超过4MB/);
});

test("本机容量不足明确提示导出，不伪装为保存成功", () => {
  const store = createFloorPlanDraftStore({ setItem() { throw new Error("QuotaExceededError"); } });
  assert.throws(() => store.write(draft()), /存储空间不足.*导出/);
});

test("演示户型标识明确且满足真实识图输出的几何合同", () => {
  const spec = demoFloorPlanSpec();
  assert.match(spec.name, /演示/);
  assert.equal(spec.autoElec, false);
  assert.equal(normalizeFloorPlanSpec(spec).rooms.length, 3);
});

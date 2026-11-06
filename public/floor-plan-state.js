/**
 * [INPUT]: 依赖浏览器本地存储、单层原生方案和同场景机位数据
 * [OUTPUT]: 提供平面布局草稿校验、方案导入导出、尺寸边界和明确标识的演示户型
 * [POS]: public 的平面布局纯数据边界，不调用模型或读取业务Prompt
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export const FLOOR_PLAN_DRAFT_KEY = "canvas-lab:floor-plan:draft:v1";
export const FLOOR_PLAN_JOB_KEY = "canvas-lab:floor-plan:job:v1";
export const FLOOR_PLAN_MAX_JSON_BYTES = 4 * 1024 * 1024;
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);

function safeTree(value, depth = 0, counter = { size: 0 }) {
  if (++counter.size > 120000 || depth > 30) throw new Error("方案内容过大或嵌套过深");
  if (typeof value === "number" && (!Number.isFinite(value) || Math.abs(value) > 1e9)) throw new Error("方案包含无效坐标或尺寸");
  if (typeof value === "string" && value.length > 20000) throw new Error("方案字段过长");
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) throw new Error("方案包含不支持的字段");
    safeTree(child, depth + 1, counter);
  }
}

export function validateFloorPlanDraft(value) {
  safeTree(value);
  if (!value || value.kind !== "canvas-lab-floor-plan" || value.version !== 1
      || !value.plan || value.plan.version !== 2 || !Array.isArray(value.plan.walls)
      || !Array.isArray(value.plan.furniture) || !Array.isArray(value.cameras) || value.cameras.length > 24) {
    throw new Error("请选择从平面布局导出的方案 JSON 文件");
  }
  if (value.plan.walls.length > 1000 || value.plan.furniture.length > 1500) throw new Error("首版仅支持单层住宅方案");
  if (value.isDemo !== undefined && typeof value.isDemo !== "boolean") throw new Error("方案来源标记格式不正确");
  const ids = new Set();
  for (const camera of value.cameras) {
    if (!camera || typeof camera.id !== "string" || ids.has(camera.id)
        || typeof camera.name !== "string" || camera.name.length > 80
        || !camera.pose || camera.pose.version !== 1 || !["orbit", "walk"].includes(camera.pose.kind)) {
      throw new Error("方案中有无法恢复的机位");
    }
    ids.add(camera.id);
    if (camera.pose.kind === "orbit") {
      for (const key of ["position", "target"]) {
        if (!Array.isArray(camera.pose[key]) || camera.pose[key].length !== 3 || camera.pose[key].some((n) => !Number.isFinite(n))) {
          throw new Error("机位坐标不完整");
        }
      }
    } else if (!["x", "y", "yaw", "pitch", "eyeHeight"].every((key) => Number.isFinite(camera.pose.camera?.[key]))) {
      throw new Error("漫游机位坐标不完整");
    }
  }
  return value;
}

export function serializeFloorPlanDraft(value) {
  const text = JSON.stringify(validateFloorPlanDraft(value));
  if (new TextEncoder().encode(text).byteLength > FLOOR_PLAN_MAX_JSON_BYTES) throw new Error("方案超过4MB，请减少对象后导出");
  return text;
}

export function parseFloorPlanDraft(text) {
  if (typeof text !== "string" || new TextEncoder().encode(text).byteLength > FLOOR_PLAN_MAX_JSON_BYTES) throw new Error("方案文件不能超过4MB");
  let value;
  try { value = JSON.parse(text); } catch { throw new Error("方案 JSON 无法读取，请重新选择导出的文件"); }
  return validateFloorPlanDraft(value);
}

export function createFloorPlanDraftStore(storage) {
  return {
    read() {
      const text = storage.getItem(FLOOR_PLAN_DRAFT_KEY);
      return text ? parseFloorPlanDraft(text) : null;
    },
    write(draft) {
      const text = serializeFloorPlanDraft(draft);
      try { storage.setItem(FLOOR_PLAN_DRAFT_KEY, text); }
      catch { throw new Error("本机存储空间不足，请导出方案文件保存"); }
    },
    clear() { storage.removeItem(FLOOR_PLAN_DRAFT_KEY); },
  };
}

// --- 演示只在用户选择“体验示例”后载入，不能当作识图结果 ---
export function demoFloorPlanSpec() {
  return {
    name: "两室一厅 · 演示方案", height: 2800, phase: "renovate", autoElec: false,
    walls: [
      { a: [0, 0], b: [9600, 0], t: 200, openings: [{ type: "window", from: 1100, to: 3700, sill: 900, head: 2300 }, { type: "window", from: 6900, to: 8700, sill: 900, head: 2300 }] },
      { a: [9600, 0], b: [9600, 6800], t: 200, openings: [{ type: "window", from: 4400, to: 6000, sill: 900, head: 2300 }] },
      { a: [9600, 6800], b: [0, 6800], t: 200 },
      { a: [0, 6800], b: [0, 0], t: 200, openings: [{ type: "door", from: 4800, to: 5800, sill: 0, head: 2100 }] },
      { a: [6000, 0], b: [6000, 6800], t: 120, openings: [{ type: "door", from: 1700, to: 2600, sill: 0, head: 2100 }, { type: "door", from: 4200, to: 5100, sill: 0, head: 2100 }] },
      { a: [6000, 3400], b: [9600, 3400], t: 120 },
    ],
    rooms: [{ at: [3000, 3400], name: "客餐厅", mat: "tile", wallMat: "latexWarm" },
      { at: [7800, 1700], name: "主卧", mat: "oak" }, { at: [7800, 5100], name: "次卧", mat: "oak" }],
    furniture: [
      { key: "sofa", at: [3000, 750], rot: 0, w: 2800, d: 1000 },
      { key: "coffeeTable", at: [3000, 2050], rot: 0 },
      { key: "tvCabinet", at: [3000, 3300], rot: 180 },
      { key: "diningTable", at: [3000, 5100], rot: 0 },
      { key: "chair", at: [2200, 5100], rot: 90 }, { key: "chair", at: [3800, 5100], rot: 270 },
      { key: "bed18", at: [7900, 1400], rot: 0 }, { key: "wardrobe", at: [7950, 2950], rot: 180, w: 2400 },
      { key: "bed15", at: [8000, 5400], rot: 180 }, { key: "desk", at: [8000, 3900], rot: 0 },
      { key: "plant", at: [5300, 700], rot: 0 },
    ],
  };
}

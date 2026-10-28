/**
 * [INPUT]: 依赖原图尺寸、整体原灯处理与归一化新增光源/原灯减弱关闭/历史保护标注、新光源照射目标与动作专属参数，复用 GPT 尺寸真源的纯几何规划
 * [OUTPUT]: 对外提供RELIGHT_ORIGINAL_LIGHT_ACTIONS目录与normalizeRelightOriginalLights严格整体原灯合同、新增光源/减弱原灯/关闭原灯/保护动作及颜色符号、兼容历史字段的归一化合同与打光模型/容量/参数目录、可选无标注模板的光源深拷贝及非退化方向准入、画布坐标、输入问题及输出尺寸规划
 * [POS]: public 的打光纯规则层，由浏览器光源编辑器与服务端共同消费，不访问 DOM 或网络
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { maskFillGptOutputSize } from "./image-mask-fill-geometry.js";

export const RELIGHT_MODEL_KEY = "gptImage25Sunburst";
export const RELIGHT_IMAGE_POLICY = Object.freeze({ accept: ["image/png", "image/jpeg", "image/webp"],
  maxBytesPerImage: 6 * 1024 * 1024, maxTotalBytes: 6 * 1024 * 1024, maxInputEdge: 4096, maxEdge: 4096, maxPixels: 16 * 1024 * 1024 });
export const RELIGHT_LIMITS = Object.freeze({ maxLights: 12, maxPoints: 64, minTargetDistance: 0.005, minTargetPixels: 2, minKelvin: 2000, maxKelvin: 10000,
  minIntensity: 0.1, maxIntensity: 3, minDarkenAmount: 0.1, maxDarkenAmount: 0.9, maxFixtureLength: 200, maxPromptLength: 2000 });
export const RELIGHT_TYPES = Object.freeze([{ key: "point", label: "点光源" }, { key: "line", label: "线光源" }, { key: "area", label: "面光源" }]);
export const RELIGHT_ACTIONS = Object.freeze([
  { key: "brighten", label: "新增光源", description: "新增补光并指定位置与照射目标，可选择是否添加可见灯具" },
  { key: "darken", label: "减弱原灯", description: "标记已有灯源或有限发光段，减弱该灯及关联照明；找不到原灯则保持不变" },
  { key: "turnOff", label: "关闭原灯", description: "标记已有灯源并关闭其发光，保留灯具实体；找不到原灯则保持不变" },
  { key: "preserve", label: "保持不变", description: "保护标记对象与区域的外观、光照和明暗" },
].map(Object.freeze));
export const RELIGHT_ORIGINAL_LIGHT_ACTIONS = Object.freeze([
  { key: "keep", label: "保留", description: "沿用原图灯具的发光状态，可继续新增补光或单独调整某盏灯" },
  { key: "darken", label: "整体减弱", description: "无需标注，减弱可识别的原有人工灯光，不降低日光或全图曝光" },
  { key: "turnOff", label: "全部关闭", description: "无需标注，关闭可识别的原有人工灯光并保留灯体，不关闭本次新增光源" },
].map(Object.freeze));
export const RELIGHT_ACTION_GUIDES = Object.freeze({
  brighten: Object.freeze({ color: "#3b82f6", symbol: "+" }),
  darken: Object.freeze({ color: "#7c3aed", symbol: "-" }),
  turnOff: Object.freeze({ color: "#dc2626", symbol: "x" }),
  preserve: Object.freeze({ color: "#15803d", symbol: "=" }),
});
export const RELIGHT_MODES = Object.freeze([{ key: "lightOnly", label: "只调整光照" }, { key: "addFixture", label: "添加灯具并点亮" }]);
export const RELIGHT_RESOLUTIONS = Object.freeze(["1K", "2K", "4K"]);
export const RELIGHT_GUIDE_COLOR = RELIGHT_ACTION_GUIDES.brighten.color;

const finiteRange = (value, min, max) => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function validPoint(point) {
  if (!point || !finiteRange(point.x, 0, 1) || !finiteRange(point.y, 0, 1)) throw new TypeError("光源和照射目标须为图内0–1的有效坐标");
  return { x: point.x, y: point.y };
}

function intersects(a, b, c, d) {
  const epsilon = 1e-10;
  const on = (p, q, r) => Math.abs(cross(p, q, r)) <= epsilon
    && r.x >= Math.min(p.x, q.x) - epsilon && r.x <= Math.max(p.x, q.x) + epsilon
    && r.y >= Math.min(p.y, q.y) - epsilon && r.y <= Math.max(p.y, q.y) + epsilon;
  const opposite = (left, right) => left > epsilon && right < -epsilon || left < -epsilon && right > epsilon;
  return opposite(cross(a, b, c), cross(a, b, d)) && opposite(cross(c, d, a), cross(c, d, b))
    || on(a, b, c) || on(a, b, d) || on(c, d, a) || on(c, d, b);
}

function validateShape(type, points) {
  if (type === "point" && points.length !== 1) throw new TypeError("点光源需要且只允许1个位置点");
  if (type === "line" && points.length < 2) throw new TypeError("线光源至少需要2个端点");
  if (type === "area" && points.length < 3) throw new TypeError("面光源至少需要3个轮廓点");
  for (let index = 1; index < points.length; index += 1) {
    if (distance(points[index - 1], points[index]) < 1e-6) throw new TypeError("光源轮廓包含重复或过近的端点，请重新绘制");
  }
  if (type !== "area") return;
  const area = Math.abs(points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length]; return sum + point.x * next.y - next.x * point.y;
  }, 0)) / 2;
  if (area < 1e-7) throw new TypeError("面光源需要形成有效面积，请重新绘制");
  for (let index = 0; index < points.length; index += 1) for (let other = index + 1; other < points.length; other += 1) {
    if (other === index + 1 || index === 0 && other === points.length - 1) continue;
    if (intersects(points[index], points[(index + 1) % points.length], points[other], points[(other + 1) % points.length])) {
      throw new TypeError("面光源轮廓不能交叉，请重新绘制");
    }
  }
}

// -------- 整体原灯处理不制造坐标；仅减弱动作持有幅度，禁止暗参流入模板 --------
export function normalizeRelightOriginalLights(value) {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value) || !["keep", "darken", "turnOff"].includes(value.action)) {
    throw new TypeError("原有灯光请选择保留、减弱或关闭");
  }
  const keys = value.action === "darken" ? ["action", "amount"] : ["action"];
  if (Object.keys(value).some(key => !keys.includes(key))) throw new TypeError("原有灯光包含未知字段或非减弱动作的幅度");
  if (value.action !== "darken") return { action: value.action };
  const amount = value.amount === undefined ? 0.5 : value.amount;
  if (!finiteRange(amount, RELIGHT_LIMITS.minDarkenAmount, RELIGHT_LIMITS.maxDarkenAmount)) throw new TypeError("原有灯光减弱幅度需要在0.1–0.9之间");
  return { action: "darken", amount };
}

export function normalizeRelightLights(value, { allowEmpty = false } = {}) {
  if (!Array.isArray(value) || value.length < (allowEmpty ? 0 : 1) || value.length > RELIGHT_LIMITS.maxLights) throw new TypeError(allowEmpty ? `光源数量不能超过${RELIGHT_LIMITS.maxLights}个` : `请添加1–${RELIGHT_LIMITS.maxLights}个光源`);
  const ids = new Set();
  return value.map((light, index) => {
    if (!light || typeof light !== "object" || Array.isArray(light)) throw new TypeError(`光源${index + 1}参数无效`);
    if (typeof light.id !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(light.id) || ids.has(light.id)) throw new TypeError("光源编号需要唯一且有效");
    ids.add(light.id);
    if (!RELIGHT_TYPES.some(entry => entry.key === light.type)) throw new TypeError("光源类型请选择点、线或面");
    if (!Array.isArray(light.points) || !light.points.length || light.points.length > RELIGHT_LIMITS.maxPoints) throw new TypeError(`每个光源最多${RELIGHT_LIMITS.maxPoints}个轮廓点`);
    const points = light.points.map(validPoint); validateShape(light.type, points);
    const action = light.action === undefined ? "brighten" : light.action;
    if (!RELIGHT_ACTIONS.some(entry => entry.key === action)) throw new TypeError("请选择新增光源、减弱原灯、关闭原灯或保持不变");
    const normalized = { id: light.id, type: light.type, points, action };
    // -------- 原灯与保护动作不携带新光源参数，保留历史字段合同 --------
    if (action === "darken") {
      const amount = light.amount === undefined ? 0.5 : light.amount;
      if (!finiteRange(amount, RELIGHT_LIMITS.minDarkenAmount, RELIGHT_LIMITS.maxDarkenAmount)) throw new TypeError("减弱幅度需要在0.1–0.9之间");
      return { ...normalized, amount };
    }
    if (action !== "brighten") return normalized;
    const target = validPoint(light.target);
    if (distance(target, relightCenter({ points })) < RELIGHT_LIMITS.minTargetDistance) throw new TypeError("照射目标与光源过近，请拉开方向箭头");
    if (!RELIGHT_MODES.some(entry => entry.key === light.mode)) throw new TypeError("光源模式请选择仅打光或新增灯具＋打光");
    if (!Number.isInteger(light.kelvin) || !finiteRange(light.kelvin, RELIGHT_LIMITS.minKelvin, RELIGHT_LIMITS.maxKelvin)) throw new TypeError("色温需要为2000–10000K的整数");
    if (!finiteRange(light.intensity, RELIGHT_LIMITS.minIntensity, RELIGHT_LIMITS.maxIntensity)) throw new TypeError("相对亮度需要在0.1–3之间");
    if (!["soft", "hard"].includes(light.softness)) throw new TypeError("光照软硬请选择柔和或硬朗");
    if (light.fixture !== undefined && typeof light.fixture !== "string") throw new TypeError("灯具描述必须是文本");
    const fixture = (light.fixture ?? "").trim();
    if (fixture.length > RELIGHT_LIMITS.maxFixtureLength) throw new TypeError("灯具描述不能超过200字符");
    return { ...normalized, target, mode: light.mode, kelvin: light.kelvin,
      intensity: light.intensity, softness: light.softness, fixture };
  });
}

export function relightCenter(light) {
  return light.points.reduce((sum, point) => ({ x: sum.x + point.x / light.points.length, y: sum.y + point.y / light.points.length }), { x: 0, y: 0 });
}

export function relightPoint(event, bounds) {
  if (!(bounds?.width > 0 && bounds?.height > 0)) return null;
  const clamp = value => Math.max(0, Math.min(1, value));
  return { x: clamp((event.clientX - bounds.left) / bounds.width), y: clamp((event.clientY - bounds.top) / bounds.height) };
}

export function relightImageIssue(image) {
  if (!image?.dataUrl) return "请先上传1张原图";
  if (!RELIGHT_IMAGE_POLICY.accept.includes(image.type)) return "原图仅支持PNG、JPEG或WebP";
  if (image.size > RELIGHT_IMAGE_POLICY.maxBytesPerImage) return "原图不能超过6MB";
  if (!Number.isSafeInteger(image.width) || !Number.isSafeInteger(image.height) || image.width < 1 || image.height < 1) return "原图尺寸读取失败，请重新上传";
  if (Math.max(image.width, image.height) > RELIGHT_IMAGE_POLICY.maxInputEdge || image.width * image.height > RELIGHT_IMAGE_POLICY.maxPixels) return "原图单边不能超过4096px";
  if (Math.max(image.width / image.height, image.height / image.width) > 3) return "GPT打光支持1:3至3:1的原图比例";
  return "";
}

export function relightOutputSize(source, resolution = "1K", sizes) {
  if (!RELIGHT_RESOLUTIONS.includes(resolution)) throw new TypeError("GPT输出档位请选择1K、2K或4K");
  try { return maskFillGptOutputSize(source, resolution, sizes); }
  catch (error) { throw new TypeError(error.message.replace("Sunburst局部重绘", "GPT打光")); }
}

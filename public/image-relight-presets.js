/**
 * [INPUT]: 依赖用户选择的重打光效果、新方案呈现强度及历史模板身份
 * [OUTPUT]: 对外提供五种重建光影效果/无需标注的整体原灯及可选精修说明、新方案强度说明、三类旧方案兼容目录、UI默认值、标签查询与旧请求语义严格准入
 * [POS]: public 的打光场景设置真源，由浏览器和服务端共用；不包含模型Prompt正文
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
export const RELIGHT_DEFAULT_TEMPLATE_KEY = "naturalFill";
export const RELIGHT_DEFAULT_BLEND_MODE = "balanced";
export const RELIGHT_TEMPLATES = Object.freeze([
  { key: "naturalFill", label: "明亮漫射", description: "重建中性明亮的漫射光，减弱硬投影" },
  { key: "warmAmbient", label: "暖居夜景", description: "压低日光，重建暖灯分层与夜景明暗" },
  { key: "windowDaylight", label: "窗边斜阳", description: "重建窗边方向光与长投影，形成斜阳光影" },
  { key: "accentWash", label: "重点洗墙", description: "压低环境光，让墙面形成自上而下的洗光" },
  { key: "softStudio", label: "柔和摄影", description: "重建中性柔软侧光，以明暗塑造空间层次" },
  { key: "custom", label: "自定义", description: "调整原有灯光，可选新增光源或单灯精修" },
].map(Object.freeze));
export const RELIGHT_LEGACY_TEMPLATES = Object.freeze([
  { key: "mainLight", label: "主灯照明", description: "旧版方案：沿用已有主灯并协调亮暗层次" },
  { key: "noMainLight", label: "无主灯", description: "旧版方案：协调已有分区光源与暗部层次" },
  { key: "naturalDaylight", label: "自然采光", description: "旧版方案：沿实际窗洞平衡室内明暗" },
].map(Object.freeze));
export const RELIGHT_BLEND_MODES = Object.freeze([
  { key: "subtle", label: "轻微", description: "轻柔呈现新方案，保持所选光影特征" },
  { key: "balanced", label: "适中", description: "清楚呈现新方案，重建光影与明暗层次" },
  { key: "pronounced", label: "明显", description: "强化新方案光效，保留高光与暗部细节" },
].map(Object.freeze));

export function relightTemplateDefinition(key) {
  return RELIGHT_TEMPLATES.find(entry => entry.key === key) || RELIGHT_LEGACY_TEMPLATES.find(entry => entry.key === key);
}

export function normalizeRelightSettings(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("打光场景设置必须是有效对象");
  // -------- 新界面显式提交默认明亮漫射；旧API和旧归档省略模板仍表示自定义，不能静默变更历史意图 --------
  const templateKey = input.templateKey === undefined ? "custom" : input.templateKey;
  const blendMode = input.blendMode === undefined ? RELIGHT_DEFAULT_BLEND_MODE : input.blendMode;
  if (typeof templateKey !== "string" || !relightTemplateDefinition(templateKey)) throw new TypeError("请选择有效的光照模板");
  if (typeof blendMode !== "string" || !RELIGHT_BLEND_MODES.some(entry => entry.key === blendMode)) throw new TypeError("请选择有效的调整幅度");
  return { templateKey, blendMode };
}

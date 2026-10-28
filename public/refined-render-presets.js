/**
 * [INPUT]: 依赖精模渲染仅改变光照、天气与摄影色调的受控参数合同
 * [OUTPUT]: 对外提供无 Prompt 正文的模板/色调目录、严格归一化、结果摘要与氛围资产需求判定
 * [POS]: public 与 src 共用的精模渲染参数真源，不包含室内设计风格或材质替换规则
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export const REFINED_RENDER_PRESETS = Object.freeze([
  { key: "preserve", label: "默认精模", time: "preserve", weather: "preserve" },
  { key: "daylight", label: "明亮日光", time: "daytime", weather: "clear" },
  { key: "soft", label: "柔和阴天", time: "daytime", weather: "overcast" },
  { key: "sunset", label: "暖调黄昏", time: "dusk", weather: "clear" },
  { key: "night", label: "静谧夜景", time: "night", weather: "clear" },
  { key: "custom", label: "自定义", time: "preserve", weather: "preserve" },
].map(Object.freeze));

export const REFINED_RENDER_TIMES = Object.freeze([
  { key: "preserve", label: "精模默认" },
  { key: "daytime", label: "白天" },
  { key: "dusk", label: "黄昏" },
  { key: "night", label: "夜晚" },
].map(Object.freeze));

export const REFINED_RENDER_WEATHERS = Object.freeze([
  { key: "preserve", label: "精模默认" },
  { key: "clear", label: "晴朗" },
  { key: "overcast", label: "阴天" },
  { key: "rainy", label: "雨天" },
  { key: "foggy", label: "薄雾" },
].map(Object.freeze));

export const REFINED_RENDER_TONES = Object.freeze([
  { key: "preserve", label: "精模默认" },
  { key: "warm", label: "暖调" },
  { key: "cool", label: "冷调" },
].map(Object.freeze));

function selectionError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function option(value, catalog, label, fallback = "preserve") {
  const normalized = value == null ? fallback : String(value).trim();
  if (!catalog.some(entry => entry.key === normalized)) {
    throw selectionError(`精模渲染${label}选项不合法`);
  }
  return normalized;
}

export function normalizeRefinedRender(value) {
  if (value == null) value = {};
  if (typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).some(key => !["preset", "time", "weather", "tone"].includes(key))) {
    throw selectionError("精模渲染模板参数不合法");
  }
  const preset = option(value.preset, REFINED_RENDER_PRESETS, "模板");
  const time = option(value.time, REFINED_RENDER_TIMES, "时段");
  const weather = option(value.weather, REFINED_RENDER_WEATHERS, "天气");
  const tone = option(value.tone, REFINED_RENDER_TONES, "色调");
  const selected = REFINED_RENDER_PRESETS.find(entry => entry.key === preset);
  return {
    preset,
    time: preset === "custom" ? time : selected.time,
    weather: preset === "custom" ? weather : selected.weather,
    tone,
  };
}

export function requiresRefinedAtmosphere(value) {
  const selection = normalizeRefinedRender(value);
  return [selection.time, selection.weather, selection.tone].some(value => value !== "preserve");
}

export function describeRefinedRender(value) {
  const selection = normalizeRefinedRender(value);
  const label = (catalog, key) => catalog.find(entry => entry.key === key)?.label;
  const parts = selection.preset === "custom"
    ? ["自定义", selection.time !== "preserve" ? label(REFINED_RENDER_TIMES, selection.time) : null,
      selection.weather !== "preserve" ? label(REFINED_RENDER_WEATHERS, selection.weather) : null]
    : [label(REFINED_RENDER_PRESETS, selection.preset)];
  if (selection.tone !== "preserve") parts.push(label(REFINED_RENDER_TONES, selection.tone));
  return parts.filter(Boolean).join(" · ");
}

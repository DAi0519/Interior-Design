/**
 * [INPUT]: 依赖飞书精模主正文与三列模块JSON、历史纯文本或服务端内部MAIN/TIME/WEATHER/TONE资产
 * [OUTPUT]: 对外提供四块正文的规范化组合、格式识别、模块完整性校验与服务端解析结果
 * [POS]: src 的精模 Prompt 纯解析边界，被版本目录与正式编译器共用，无飞书或图像调用
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export const REFINED_RENDER_PROMPT_SCHEMA_VERSION = 1;

function assetError(message) {
  return Object.assign(new Error(message), { statusCode: 409 });
}

function exactObject(value, keys, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) {
    throw assetError(`精模 Prompt JSON 字段不完整或包含未知字段：${path}`);
  }
}

function requireText(value, path) {
  if (typeof value !== "string" || !value.trim()) {
    throw assetError(`精模 Prompt JSON 需要非空文本：${path}`);
  }
  return value.trim();
}

export function parseRefinedRenderPromptAsset(source) {
  const text = String(source || "").trim();
  if (!text) throw assetError("精模 Prompt 正文为空");
  if (!text.startsWith("{")) return { format: "plain", main: text };
  let bundle;
  try { bundle = JSON.parse(text); }
  catch { throw assetError("精模 Prompt JSON 语法错误"); }
  exactObject(bundle, ["MAIN", "TIME", "WEATHER", "TONE"], "root");
  const modules = {};
  for (const [group, keys] of Object.entries({
    TIME: ["DAYTIME", "DUSK", "NIGHT"],
    WEATHER: ["CLEAR", "OVERCAST", "RAINY", "FOGGY"],
    TONE: ["WARM", "COOL"],
  })) {
    exactObject(bundle[group], keys, group);
    modules[group] = Object.fromEntries(keys.map(key => [key, requireText(bundle[group][key], `${group}.${key}`)]));
  }
  return {
    format: "modular",
    schemaVersion: REFINED_RENDER_PROMPT_SCHEMA_VERSION,
    main: requireText(bundle.MAIN, "MAIN"),
    modules,
  };
}

export function combineRefinedRenderPromptColumns(main, columns) {
  const groups = ["TIME", "WEATHER", "TONE"];
  const values = groups.map(group => String(columns[group] || "").trim());
  if (values.every(value => !value)) return null;
  if (values.some(value => !value)) throw assetError("精模 Prompt 的时段、天气、色调提示词必须同时完整配置");
  const bundle = { MAIN: main };
  for (let index = 0; index < groups.length; index += 1) {
    try { bundle[groups[index]] = JSON.parse(values[index]); }
    catch { throw assetError(`精模 Prompt ${groups[index]} 模块 JSON 语法错误`); }
  }
  const parsed = parseRefinedRenderPromptAsset(JSON.stringify(bundle));
  return JSON.stringify({ MAIN: parsed.main, ...parsed.modules });
}

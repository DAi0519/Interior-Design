/**
 * [INPUT]: 依赖 lark-cli.mjs 的只读 Base 查询、runtime-cache.mjs 与“AI 生图 / 风格库”字段结构
 * [OUTPUT]: 对外提供风格库解析、版本化唯一编码目录、默认最新版与指定版本 Style DNA 精确读取
 * [POS]: src 的 Style DNA 风格目录边界，前端只见摘要，执行链复用服务端配置缓存
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { runLarkCli } from "./lark-cli.mjs";
import { createAsyncTtlCache } from "./runtime-cache.mjs";

const styleCatalogCache = createAsyncTtlCache();

const STYLE_FIELDS = [
  "风格名称",
  "风格编码",
  "版本",
  "上架状态",
  "风格大类",
  "氛围标签",
  "适用空间",
  "Style DNA",
];

export const STYLE_LIBRARY_CONFIG = Object.freeze({
  baseToken:
    process.env.LARK_STYLE_BASE_TOKEN || "SALobKnnra17iSsGT2ccC52PnHd",
  cliPath: process.env.LARK_CLI_PATH || "lark-cli",
  tableId: process.env.LARK_STYLE_TABLE_ID || "tbl9Qol1WmnsyE6i",
});

function arrayValue(value) {
  return Array.isArray(value) ? value.map(String) : [];
}

function parseDna(value) {
  try {
    const parsed = JSON.parse(String(value || ""));
    if (!parsed?.style_dna || typeof parsed.style_dna !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function styleCodeForVersion(familyCode, version) {
  const code = String(familyCode || "").trim();
  const number = Number(version);
  return code && Number.isInteger(number) && number > 0
    ? `${code}@v${number}`
    : "";
}

function parseStyleCode(value, fallbackVersion) {
  const normalized = String(value || "").trim();
  const match = normalized.match(/^(.*)@v(\d+)$/);
  return {
    familyCode: match ? match[1] : normalized,
    version: match ? Number(match[2]) : fallbackVersion,
  };
}

export function parseStyleLibraryEnvelope(body) {
  if (body?.ok !== true || !Array.isArray(body?.data?.data)) {
    throw new Error("飞书风格库返回格式不正确");
  }
  if (body.data.has_more) {
    throw new Error("飞书风格库超过 200 条，请增加服务端分页读取");
  }

  const fields = body.data.fields || [];
  const missingFields = STYLE_FIELDS.filter((field) => !fields.includes(field));
  if (missingFields.length > 0) {
    throw new Error(`飞书风格库缺少字段：${missingFields.join("、")}`);
  }
  const indexOf = (name) => fields.indexOf(name);
  const valueAt = (row, name) => row[indexOf(name)];

  return body.data.data.map((row) => {
    const styleDna = parseDna(valueAt(row, "Style DNA"));
    const status = arrayValue(valueAt(row, "上架状态"));
    const published = status.includes("上架");
    const validDna = Boolean(styleDna);
    const familyCode = String(valueAt(row, "风格编码") || "").trim();
    const version = Number(valueAt(row, "版本") || 1);
    return {
      categories: arrayValue(valueAt(row, "风格大类")),
      code: styleCodeForVersion(familyCode, version),
      description: styleDna?.style_dna?.overall_style || "",
      familyCode,
      moods: arrayValue(valueAt(row, "氛围标签")),
      name: String(valueAt(row, "风格名称") || "").trim(),
      published,
      reason: !published ? "已在飞书下架" : !validDna ? "Style DNA 无效" : null,
      spaces: arrayValue(valueAt(row, "适用空间")),
      styleDna,
      validDna,
      version,
    };
  });
}

export async function listStyles({
  config = STYLE_LIBRARY_CONFIG,
  forceRefresh = false,
  run = runLarkCli,
} = {}) {
  const load = async () => {
    const fieldArgs = STYLE_FIELDS.flatMap((field) => ["--field-id", field]);
    const body = await run(
      { cliPath: config.cliPath },
      [
        "base",
        "+record-list",
        "--base-token",
        config.baseToken,
        "--table-id",
        config.tableId,
        ...fieldArgs,
        "--limit",
        "200",
        "--json",
        "--as",
        "user",
      ],
    );
    return parseStyleLibraryEnvelope(body);
  };

  if (run !== runLarkCli) return load();
  return styleCatalogCache.get(config.tableId, load, { force: forceRefresh });
}

export async function listPublicStyles(options = {}) {
  const styles = [...await listStyles(options)].sort(
    (left, right) =>
      left.familyCode.localeCompare(right.familyCode) || right.version - left.version,
  );
  return styles.map(({ styleDna, ...style }) => style);
}

export async function getPublishedStyle(code, options = {}) {
  const fallbackVersion = options.version == null ? null : Number(options.version);
  const selector = parseStyleCode(code, fallbackVersion);
  if (!selector.familyCode) {
    const error = new Error("请选择 Style DNA 风格");
    error.statusCode = 400;
    throw error;
  }

  const matchingStyles = (await listStyles(options))
    .filter((entry) => entry.familyCode === selector.familyCode)
    .sort((left, right) => right.version - left.version);
  if (matchingStyles.length === 0) {
    const error = new Error("飞书风格库中没有这个风格");
    error.statusCode = 404;
    throw error;
  }
  const style = selector.version == null
    ? matchingStyles.find((entry) => entry.published && entry.validDna)
      || matchingStyles[0]
    : matchingStyles.find((entry) => entry.version === selector.version);
  if (!style) {
    const error = new Error(`${matchingStyles[0].name} 没有 v${selector.version} 版本`);
    error.statusCode = 404;
    throw error;
  }
  if (!style.published) {
    const error = new Error(`${style.name} 已在飞书下架，请先上架后再渲染`);
    error.statusCode = 409;
    throw error;
  }
  if (!style.validDna) {
    const error = new Error(`${style.name} 的 Style DNA 无效`);
    error.statusCode = 409;
    throw error;
  }
  return style;
}

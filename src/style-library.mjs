/**
 * [INPUT]: 依赖 lark-cli.mjs 的只读 Base 查询与“AI 生图 / 风格库”的真实字段结构
 * [OUTPUT]: 对外提供风格库解析、公开目录与服务端已上架 Style DNA 精确读取
 * [POS]: src 的 Style DNA 风格目录边界，前端只见摘要，执行链在服务端读取完整 DNA
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { runLarkCli } from "./lark-cli.mjs";

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
    return {
      categories: arrayValue(valueAt(row, "风格大类")),
      code: String(valueAt(row, "风格编码") || "").trim(),
      description: styleDna?.style_dna?.overall_style || "",
      moods: arrayValue(valueAt(row, "氛围标签")),
      name: String(valueAt(row, "风格名称") || "").trim(),
      published,
      reason: !published ? "已在飞书下架" : !validDna ? "Style DNA 无效" : null,
      spaces: arrayValue(valueAt(row, "适用空间")),
      styleDna,
      validDna,
      version: Number(valueAt(row, "版本") || 1),
    };
  });
}

export async function listStyles({
  config = STYLE_LIBRARY_CONFIG,
  run = runLarkCli,
} = {}) {
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
}

export async function listPublicStyles(options = {}) {
  const styles = await listStyles(options);
  return styles.map(({ styleDna, ...style }) => style);
}

export async function getPublishedStyle(code, options = {}) {
  const normalizedCode = String(code || "").trim();
  if (!normalizedCode) {
    const error = new Error("请选择 Style DNA 风格");
    error.statusCode = 400;
    throw error;
  }

  const style = (await listStyles(options)).find(
    (entry) => entry.code === normalizedCode,
  );
  if (!style) {
    const error = new Error("飞书风格库中没有这个风格");
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

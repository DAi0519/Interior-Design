/**
 * [INPUT]: 依赖进程环境与 lark-cli Base record-list 的 JSON envelope
 * [OUTPUT]: 对外提供 Benchmark Base 环境配置解析、必填校验、分页记录解析与单选值归一化
 * [POS]: src 的 Benchmark Base 连接/响应协议层，被持久化适配器与命令行/服务入口消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

const REQUIRED_CONFIG = [
  "baseToken",
  "compareTableId",
  "configTableId",
  "promptTableId",
  "resultTableId",
  "sampleTableId",
];

function requiredEnvironment(source, name) {
  const value = String(source[name] || "").trim();
  if (!value) throw new Error(`缺少环境变量 ${name}`);
  return value;
}

export function benchmarkBaseConfigFromEnv(source = process.env) {
  return {
    baseToken: requiredEnvironment(source, "BENCHMARK_BASE_TOKEN"),
    cliPath: source.LARK_CLI_PATH || "lark-cli",
    configTableId: requiredEnvironment(source, "BENCHMARK_CONFIG_TABLE_ID"),
    compareTableId: requiredEnvironment(source, "BENCHMARK_COMPARE_TABLE_ID"),
    promptTableId: requiredEnvironment(source, "BENCHMARK_PROMPT_TABLE_ID"),
    resultTableId: requiredEnvironment(source, "BENCHMARK_RESULT_TABLE_ID"),
    sampleTableId: requiredEnvironment(source, "BENCHMARK_SAMPLE_TABLE_ID"),
  };
}

export function validateBenchmarkBaseConfig(config) {
  for (const key of REQUIRED_CONFIG) {
    if (!String(config?.[key] || "").trim()) {
      throw new TypeError(`Benchmark Base 配置缺少 ${key}`);
    }
  }
}

export function selectValue(value) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function rowObject(fields, row) {
  return Object.fromEntries(fields.map((field, index) => [field, row[index]]));
}

export function parseBenchmarkRecordPage(body) {
  if (body?.ok !== true || !Array.isArray(body?.data?.data)) {
    throw new Error("飞书 Benchmark 表返回格式不正确");
  }
  const fields = body.data.fields || [];
  const recordIds = body.data.record_id_list || [];
  return body.data.data.map((row, index) => ({
    fields: rowObject(fields, row),
    recordId: recordIds[index],
  }));
}

export function parseBenchmarkRecordEnvelope(body) {
  const parsed = parseBenchmarkRecordPage(body);
  if (body.data.has_more) {
    throw new Error("飞书 Benchmark 单表超过 200 条，当前读取结果不完整");
  }
  return parsed;
}

/**
 * [INPUT]: 依赖 Benchmark Base 实时字段 Schema 与带稳定编码的冻结生成配置
 * [OUTPUT]: 对外提供五张运行表必需/可选投影字段（含评分细则），以及按实时字段类型校验全部普通回填、把冻结配置解析为真实单选项名称的纯函数
 * [POS]: src 的 Benchmark Base Schema 适配层，隔离飞书展示名变化与领域配置稳定编码
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export const TABLE_FIELDS = Object.freeze({
  configs: [
    "配置 ID", "横评组", "Style DNA", "融合 Agent", "融合基座模型",
    "出图模型", "输出规格", "提示词批次数", "每批次每模型出图数", "启用",
  ],
  prompts: [
    "Prompt ID", "融合 Prompt", "融合状态", "错误信息", "Prompt 耗时（秒）",
    "Prompt 成本（元）", "Prompt 请求 ID", "Prompt 哈希",
  ],
  comparisons: ["对比 ID", "关联 Case", "提示词批次", "横评组", "白模参考图"],
  samples: [
    "Case ID", "白模参考图", "任务状态", "样本类型", "边缘类型", "样本来源",
    "空间类型", "数据集版本", "镜头复杂度", "软装复杂度", "材质复杂度",
    "输入质量", "空间结构",
  ],
  results: [
    "Run ID", "关联 Case", "提示词批次", "生成配置", "实验 ID", "实验类型",
    "模型与版本", "模型提供商", "采样序号", "尝试序号", "重试来源", "输出参数",
    "Prompt 哈希", "Prompt 耗时（秒）", "Prompt 成本（元）", "Image 请求 ID",
    "Image 耗时（秒）", "Image 成本（元）", "生成状态", "错误信息", "生成结果图",
  ],
});

export const OPTIONAL_TABLE_FIELDS = Object.freeze({
  prompts: ["Prompt 成本（USD）"],
  results: ["Prompt 成本（USD）", "Image 成本（USD）", "评分细则", "评审时间"],
});

function optionNames(fields, fieldName) {
  const field = fields.find((item) => item.name === fieldName);
  if (field?.type !== "select" || !Array.isArray(field.options)) {
    throw new Error(`Benchmark Base 缺少单选字段：${fieldName}`);
  }
  return field.options.map((option) => String(option.name || "").trim()).filter(Boolean);
}

function fieldValueMatchesType(field, value) {
  if (value == null) return true;
  if (["text", "datetime"].includes(field.type)) return typeof value === "string";
  if (field.type === "number") return typeof value === "number" && Number.isFinite(value);
  if (field.type === "checkbox") return typeof value === "boolean";
  if (field.type === "link") {
    return Array.isArray(value) && value.every((item) =>
      item && typeof item === "object" && typeof item.id === "string" && item.id.trim());
  }
  return true;
}

export function resolveBaseWriteFields(fields, values, tableId = "未知表") {
  return Object.fromEntries(Object.entries(values).map(([fieldName, value]) => {
    const field = fields.find((item) => item.name === fieldName);
    if (!field) throw new Error(`Benchmark Base ${tableId} 缺少回填字段：${fieldName}`);
    if (["attachment", "created_at", "formula", "lookup", "updated_at"].includes(field.type)) {
      throw new Error(`Benchmark Base ${tableId} 字段不可普通回填：${fieldName} (${field.type})`);
    }
    if (field.type === "select" && value != null) {
      const options = optionNames(fields, fieldName);
      if (!options.includes(value)) {
        throw new Error(`Benchmark Base ${tableId} 单选字段 ${fieldName} 没有选项：${value}`);
      }
    } else if (!fieldValueMatchesType(field, value)) {
      throw new Error(`Benchmark Base ${tableId} 字段类型不匹配：${fieldName} (${field.type})`);
    }
    return [fieldName, value];
  }));
}

function stableCode(value) {
  return String(value || "").match(/\[([^\]]+)\]\s*$/)?.[1]?.trim() || "";
}

function resolveStableOption(fields, fieldName, value) {
  const options = optionNames(fields, fieldName);
  const exact = String(value || "").trim();
  if (options.includes(exact)) return exact;
  const code = stableCode(value);
  const matches = code ? options.filter((option) => stableCode(option) === code) : [];
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) throw new Error(`${fieldName} 稳定编码 ${code} 匹配到多个飞书选项`);
  throw new Error(`${fieldName} 在 Benchmark Base 中没有匹配选项：${code || exact}`);
}

function resolveOutputSpec(fields, value) {
  const options = optionNames(fields, "输出规格");
  const exact = String(value || "").trim();
  if (options.includes(exact)) return exact;
  const quality = exact.match(/\s*·\s*质量\s+(auto|low|medium|high)\s*$/i)?.[1]?.toLowerCase();
  const baseSpec = exact.replace(/\s*·\s*质量\s+(auto|low|medium|high)\s*$/i, "").trim();
  if (quality && quality !== "medium") {
    throw new Error(`质量档 ${quality} 尚未在 Benchmark Base 配置表中独立建模`);
  }
  if (options.includes(baseSpec)) return baseSpec;
  throw new Error(`输出规格在 Benchmark Base 中没有匹配选项：${baseSpec || exact}`);
}

export function resolveGenerationConfigFields(generationConfig, fields) {
  return {
    "配置 ID": generationConfig.configId,
    "横评组": generationConfig.groupId,
    "Style DNA": resolveStableOption(fields, "Style DNA", generationConfig.styleDna),
    "融合 Agent": resolveStableOption(fields, "融合 Agent", generationConfig.fusionAgent),
    "融合基座模型": resolveStableOption(fields, "融合基座模型", generationConfig.fusionModel),
    "出图模型": resolveStableOption(fields, "出图模型", generationConfig.imageModel),
    "输出规格": resolveOutputSpec(fields, generationConfig.outputSpec),
    "提示词批次数": generationConfig.promptBatches,
    "每批次每模型出图数": generationConfig.perBatchImages,
    "启用": true,
  };
}

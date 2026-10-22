/**
 * [INPUT]: 依赖出图/独立扩图模型/六套超分工作流/图片输入 Agent/空房房型真源、Beta 三表实时字段响应、含 AI超分的十功能标签与配置中的表/附件 ID
 * [OUTPUT]: 对外提供三表字段类型/扩图模型及真实超分工作流单选标签/附件/关联目标准入，超分/扩图/风格转换复用配置、版本、生成参数和附件字段，实时 Schema 读取与不可重试合同错误归一化
 * [POS]: src 的 Beta 独立归档合同边界，被 beta-base Store 和批量入队前检查消费，不访问旧生成记录或 Benchmark 表
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { EMPTY_ROOM_TYPES } from "./empty-room-type.mjs";
import { publicAgentModelCatalog } from "./agent-model-config.mjs";
import { publicModelCatalog } from "./model-config.mjs";
import { IMAGE_OUTPAINT_ARCHIVE_MODEL_LABELS } from "./image-outpaint-archive.mjs";
import { IMAGE_UPSCALE_WORKFLOWS } from "./image-upscale-workflow.mjs";

const RUN_FIELD_TYPES = Object.freeze({
  "Run ID": "text", "批次 ID": "text", "测试时间": "text", "功能": "select",
  "样本 ID": "text", "状态": "select", "输入文本": "text", "场景参数": "text",
  "配置快照": "text", "出图模型": "select", "Prompt / 工作流版本": "text",
  "Attempt": "number", "错误信息": "text", "场景标签": "select", "最终 Prompt": "text",
  "设计方式": "text", "风格选择": "text", "家具选择": "text", "Prompt融合": "select",
  "Agent 编码": "text", "Agent 版本": "number", "生成参数": "text", "尺寸": "text",
  "时延（ms）": "number", "费用（USD）": "number",
});
const SAMPLE_SET_FIELD_TYPES = Object.freeze({
  "样本集 ID": "text", "名称": "text", "功能": "select", "状态": "select",
  "样本数量": "number", "说明": "text", "样本": "link",
});
const SAMPLE_FIELD_TYPES = Object.freeze({
  "样本 ID": "text", "样本集": "link", "提示词": "text", "文件名": "text",
  "状态": "select", "空间类型": "select", "其他空间类型": "text",
});

export function betaBaseContractError(message, cause) {
  return Object.assign(new Error(message, cause ? { cause } : undefined), {
    code: "beta_base_schema", retryable: false, statusCode: 409,
  });
}

export function normalizeBetaBaseError(error) {
  const message = String(error?.message || "飞书 Beta 操作失败");
  if (/schema|1254045|1254015|字段.*(?:不存在|缺少|类型|不匹配|无效|未找到)|(?:field|column).*(?:not.?found|does not exist|unknown|invalid|type|mismatch|convfail)|(?:select|option).*(?:invalid|not.?found|convfail)|read.?only/i.test(message)) {
    return betaBaseContractError(message, error);
  }
  return error;
}

function tableContracts(config, featureLabels) {
  return [
    { name: "跑图明细", tableId: config.tableId, types: RUN_FIELD_TYPES,
      options: { "功能": featureLabels, "状态": ["运行中", "成功", "失败"], "场景标签": EMPTY_ROOM_TYPES,
        "出图模型": [...publicModelCatalog().map((model) => model.label), ...IMAGE_OUTPAINT_ARCHIVE_MODEL_LABELS,
          ...Object.values(IMAGE_UPSCALE_WORKFLOWS).map((workflow) => workflow.label)],
        "Prompt融合": publicAgentModelCatalog().filter((model) => model.imageInput).map((model) => model.label) },
      attachments: { "输入图": config.inputFieldId, "风格参考图": config.styleReferenceFieldId, "结果图": config.resultFieldId },
      fieldIds: { "测试时间": config.testTimeFieldId } },
    { name: "样本集", tableId: config.sampleSetTableId, types: SAMPLE_SET_FIELD_TYPES,
      options: { "功能": featureLabels, "状态": ["可用"] }, links: { "样本": config.sampleTableId } },
    { name: "样本", tableId: config.sampleTableId, types: SAMPLE_FIELD_TYPES,
      options: { "状态": ["可用"], "空间类型": EMPTY_ROOM_TYPES },
      attachments: { "样本图": config.sampleImageFieldId }, links: { "样本集": config.sampleSetTableId } },
  ];
}

export function assertBetaBaseSchemas(bodies, { config, featureLabels }) {
  const issues = [];
  for (const contract of tableContracts(config, featureLabels)) {
    const fields = bodies[contract.tableId]?.data?.fields;
    if (!Array.isArray(fields)) {
      issues.push(`${contract.name}字段响应无效`);
      continue;
    }
    const byName = new Map(fields.map((field) => [field.name, field]));
    for (const [name, type] of Object.entries(contract.types)) {
      const field = byName.get(name);
      if (!field) issues.push(`${contract.name}缺少“${name}”字段`);
      else if (field.type !== type) issues.push(`${contract.name}“${name}”应为 ${type}，当前为 ${field.type || "未知"}`);
    }
    for (const [name, values] of Object.entries(contract.options)) {
      const field = byName.get(name);
      if (field?.type !== "select") continue;
      if (Boolean(field.multiple) !== (name === "场景标签")) issues.push(`${contract.name}“${name}”单选/多选不匹配`);
      const options = new Set((field.options || []).map((option) => option.name));
      const missing = values.filter((value) => !options.has(value));
      if (missing.length) issues.push(`${contract.name}“${name}”缺少选项：${missing.join("、")}`);
    }
    for (const [name, fieldId] of Object.entries(contract.attachments || {})) {
      const field = fields.find((entry) => entry.id === fieldId);
      if (!field || field.type !== "attachment" || field.name !== name) issues.push(`${contract.name}“${name}”附件 ID、名称或类型不匹配`);
    }
    for (const [name, fieldId] of Object.entries(contract.fieldIds || {})) {
      if (byName.get(name)?.id !== fieldId) issues.push(`${contract.name}“${name}”字段 ID 不匹配`);
    }
    for (const [name, tableId] of Object.entries(contract.links || {})) {
      if (byName.get(name)?.link_table !== tableId) issues.push(`${contract.name}“${name}”关联表不匹配`);
    }
  }
  if (issues.length) throw betaBaseContractError(`飞书 Beta Schema 不兼容：${issues.join("；")}`);
  return { tableIds: tableContracts(config, featureLabels).map((entry) => entry.tableId) };
}

export async function verifyBetaBaseSchema({ config, featureLabels, run }) {
  const contracts = tableContracts(config, featureLabels);
  const entries = await Promise.all(contracts.map(async ({ tableId }) => {
    const fields = [];
    let offset = 0;
    while (true) {
      const body = await run(config, ["base", "+field-list", "--as", "user", "--base-token", config.baseToken,
        "--table-id", tableId, "--limit", "200", "--offset", String(offset), "--format", "json"]);
      const page = body?.data?.fields;
      if (body?.ok !== true || !Array.isArray(page)) throw betaBaseContractError("飞书 Beta 字段响应无效");
      fields.push(...page);
      offset += page.length;
      if (!body.data.has_more && offset >= Number(body.data.total || offset)) break;
      if (!page.length) throw betaBaseContractError("飞书 Beta 字段分页响应不完整");
    }
    return [tableId, { data: { fields } }];
  }));
  return assertBetaBaseSchemas(Object.fromEntries(entries), { config, featureLabels });
}

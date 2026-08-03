/**
 * [INPUT]: 依赖飞书 Setup 返回的最小用户 Scope 编码列表
 * [OUTPUT]: 对外提供面向使用者的中文授权能力名称，未知 Scope 保留原值用于诊断
 * [POS]: public 的飞书授权文案解释器，隔离连接中心与底层 OpenAPI Scope 命名
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

const LARK_PERMISSION_LABELS = Object.freeze({
  "base:field:read": "读取多维表格字段",
  "base:record:create": "新增多维表格记录",
  "base:record:read": "读取多维表格记录",
  "base:record:update": "更新多维表格记录",
  "docs:document.media:upload": "上传生成图片附件",
});

export function describeMissingLarkScopes(scopes) {
  return scopes.map((scope) => LARK_PERMISSION_LABELS[scope] || scope);
}

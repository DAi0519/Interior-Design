/**
 * [INPUT]: 依赖空房设计已确认的客户可选房间类型集合与“其他”具体类型长度合同
 * [OUTPUT]: 对外提供 EMPTY_ROOM_TYPES、详情最大长度及房间类型/详情归一化
 * [POS]: src 的空房房间类型领域真源，被公开目录、设计工作流与飞书同步共同消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export const EMPTY_ROOM_TYPES = Object.freeze([
  "客厅",
  "厨房",
  "卧室",
  "书房",
  "餐厅",
  "儿童房",
  "卫生间",
  "阳台",
  "玄关",
  "其他",
]);
export const EMPTY_ROOM_TYPE_DETAIL_MAX_LENGTH = 40;

export function normalizeEmptyRoomType(value) {
  const normalized = String(value || "").trim();
  return EMPTY_ROOM_TYPES.includes(normalized) ? normalized : null;
}

export function normalizeEmptyRoomTypeDetail(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

/**
 * [INPUT]: 依赖线上 AI 设计十房型家具目录（2026-09-09 实机核对）、客户最终选择与未传选择的兼容合同
 * [OUTPUT]: 对外提供与线上同名同序的家具目录及独立多选推荐、其他输入标记/长度上限、选择校验与仅含非空已选需求的 Prompt 片段
 * [POS]: src 的空房家具领域真源，被公开目录、工作流缓存与生成归档共同消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export const OTHER_FURNITURE_MAX_LENGTH = 200;
const rooms = {
  客厅: { defaults: ["沙发", "茶几", "电视柜", "电视"], options: ["沙发", "茶几", "电视柜", "电视", "落地灯", "地毯", "绿植", "挂画"] },
  厨房: { defaults: ["橱柜", "灶台", "水槽"], options: ["橱柜", "冰箱", "灶台", "水槽"] },
  卧室: { defaults: ["床", "床头柜", "衣柜", "窗帘"], options: ["床", "床头柜", "衣柜", "台灯", "梳妆台", "窗帘", "地毯"] },
  书房: { defaults: ["书桌", "办公椅", "书架", "台灯"], options: ["书桌", "办公椅", "书架", "落地灯", "台灯"] },
  餐厅: { defaults: ["餐桌", "餐椅", "餐边柜"], options: ["餐桌", "餐椅", "吊灯", "餐边柜"] },
  儿童房: { defaults: ["儿童床", "书桌", "衣柜", "玩具收纳"], options: ["儿童床", "书桌", "衣柜", "地毯", "玩具收纳"] },
  卫生间: { defaults: ["洗手台", "马桶", "淋浴区", "镜柜"], options: ["洗手台", "马桶", "淋浴区", "镜柜", "毛巾架"] },
  阳台: { defaults: ["休闲椅", "小茶几", "绿植架"], options: ["休闲椅", "小茶几", "绿植架"] },
  玄关: { defaults: ["鞋柜", "换鞋凳"], options: ["鞋柜", "换鞋凳", "全身镜", "收纳筐"] },
  其他: { defaults: [], options: ["沙发", "床", "桌椅", "柜子", "灯具", "窗帘", "地毯", "绿植"] },
};
// --- 来源：https://www.kujiale.com/pub/saas/workbench/pwork/ai/ai-decoration?scene=ai-decoration ---
const customOption = "其他";
export const EMPTY_ROOM_FURNITURE = Object.freeze(Object.fromEntries(
  Object.entries(rooms).map(([room, { defaults, options }]) => [room, Object.freeze({
    defaults: Object.freeze(defaults), options: Object.freeze([...options, customOption]), customOption,
  })]),
));

function invalid(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

export function normalizeFurnitureSelection(value, roomType) {
  const catalog = EMPTY_ROOM_FURNITURE[roomType];
  if (!catalog) throw invalid("空房房间类型不受支持");
  // --- 推荐只在前端预选；未提交或全部取消都不推断家具需求或排除项 ---
  if (value === undefined) return { source: "room-default", items: [], other: "" };
  if (!value || typeof value !== "object" || Array.isArray(value)
    || !Array.isArray(value.items) || value.items.length > catalog.options.length
    || value.items.some((item) => typeof item !== "string" || !catalog.options.includes(item))) {
    throw invalid("家具选择无效，请从当前房型的家具选项中选择");
  }
  if (value.other !== undefined && typeof value.other !== "string") throw invalid("其他家具必须为文本");
  const other = (value.other || "").replace(/\s+/g, " ").trim();
  if (other.length > OTHER_FURNITURE_MAX_LENGTH) throw invalid(`其他家具不能超过 ${OTHER_FURNITURE_MAX_LENGTH} 个字符`);
  return { source: "user", items: catalog.options.filter((item) => item !== customOption && value.items.includes(item)), other };
}

export function furniturePromptInput(selection) {
  if (selection?.source !== "user") return [];
  const requirements = {
    ...(selection.items.length ? { items: selection.items } : {}),
    ...(selection.other ? { other: selection.other } : {}),
  };
  return Object.keys(requirements).length
    ? ["", "furniture_selection:", JSON.stringify(requirements)] : [];
}

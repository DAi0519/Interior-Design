/**
 * [INPUT]: 依赖固定版 house-plan-designer 的真实家具目录与 HouseSpec 毫米坐标约定
 * [OUTPUT]: 提供平面布局前后端共用的家具、门窗、材质与容量常量
 * [POS]: public 的平面布局领域合同，被识图服务和编辑器桥接共同消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

const furniture = [
  ['sofa', '三人沙发', 2200, 950, 820],
  ['bed18', '双人床 1.8m', 1800, 2100, 1050],
  ['bed15', '双人床 1.5m', 1500, 2050, 1000],
  ['bed12', '单人床 1.2m', 1200, 2000, 950],
  ['wardrobe', '衣柜', 2000, 600, 2400],
  ['diningTable', '餐桌', 1600, 900, 750],
  ['chair', '餐椅', 460, 520, 880],
  ['coffeeTable', '茶几', 1200, 600, 400],
  ['tvCabinet', '电视柜', 2000, 400, 450],
  ['desk', '书桌', 1200, 600, 750],
  ['officeChair', '办公椅', 600, 600, 1050],
  ['sideboard', '餐边柜', 1600, 400, 2200],
  ['fridge', '冰箱', 700, 700, 1850],
  ['toilet', '马桶', 400, 700, 780],
  ['vanity', '浴室柜', 800, 500, 850],
  ['shower', '淋浴房', 900, 900, 2000],
  ['counter', '一字橱柜', 2100, 600, 900],
  ['kitchenIsland', '中岛台', 1800, 900, 900],
  ['washer', '洗衣机', 600, 600, 850],
  ['plant', '绿植', 500, 500, 1400],
];

export const FLOOR_PLAN_FURNITURE = Object.freeze(furniture.map(([key, name, w, d, h]) => Object.freeze({ key, name, w, d, h })));
export const FLOOR_PLAN_FURNITURE_KEYS = Object.freeze(FLOOR_PLAN_FURNITURE.map(({ key }) => key));
export const FLOOR_PLAN_MATERIALS = Object.freeze(['oak', 'walnut', 'tile', 'bath', 'cement']);
export const FLOOR_PLAN_WALL_MATERIALS = Object.freeze(['latexWhite', 'latexGrey', 'latexWarm']);
export const FLOOR_PLAN_OPENING_TYPES = Object.freeze(['door', 'double', 'sliding', 'hole', 'window', 'floorWindow', 'glassWall']);
export const FLOOR_PLAN_LIMITS = Object.freeze({ maxWalls: 120, maxRooms: 30, maxFurniture: 160, maxCoordinate: 100000, maxExtent: 40000, maxHeight: 6000 });

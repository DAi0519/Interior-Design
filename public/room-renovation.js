/**
 * [INPUT]: 接收主工作台当前功能编码
 * [OUTPUT]: 对外提供旧房改造与空房设计共用设计能力的模式判定
 * [POS]: public 的旧房/空房共享判定，统一两入口的配置、参数与生成能力
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export function isEmptyRoomDesign(featureMode) {
  return featureMode === "emptyRoom" || featureMode === "roomRenovation";
}

/**
 * [INPUT]: 依赖服务端返回的固定出图模型展示名与模型列表
 * [OUTPUT]: 对外提供统一可选且不暴露内部目录状态的出图模型选项描述与状态文案
 * [POS]: public 的最终出图模型可用性解释器，与 Prompt Agent 的严格多模态门槛分离
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export function describeFinalModelOption(model) {
  return {
    label: model.label,
    selectable: true,
  };
}

export function finalModelCatalogStatus(models) {
  return `${models.length} 个模型可选`;
}

/**
 * [INPUT]: 依赖服务端返回的固定出图模型目录可见性与模型展示名
 * [OUTPUT]: 对外提供不会被目录漏报锁死的出图模型选项描述与目录状态文案
 * [POS]: public 的最终出图模型可用性解释器，与 Prompt Agent 的严格多模态门槛分离
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export function describeFinalModelOption(model, catalogVisible) {
  return {
    label: `${model.label}${catalogVisible === false ? " · 目录未返回，可尝试" : ""}`,
    selectable: true,
  };
}

export function finalModelCatalogStatus(models) {
  const visible = models.filter((model) => model.available).length;
  return `${models.length} 个可选 · ${visible} 个目录可见`;
}

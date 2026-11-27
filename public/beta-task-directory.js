/**
 * [INPUT]: 依赖批量任务分组容器和 BETA_FEATURE_COPY 的任务名称及能力
 * [OUTPUT]: 渲染共享目录的原生按钮并反映当前任务和加载禁用状态
 * [POS]: public 的批量侧栏，任务切换仍由 beta-app.js 处理
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export function mountBetaTaskDirectory(directory, features) {
  const doc = directory.ownerDocument;
  const entries = [];
  for (const group of directory.querySelectorAll("[data-beta-task-modes]")) {
    for (const mode of group.dataset.betaTaskModes.split(" ")) {
      if (!Object.hasOwn(features, mode)) continue;
      const button = doc.createElement("button");
      button.type = "button";
      button.className = "feature-mode-option";
      button.dataset.featureMode = mode;
      button.setAttribute("role", "radio");
      button.textContent = features[mode].label;
      group.append(button);
      entries.push({ mode, button });
    }
  }
  return (selectedMode, disabled) => {
    for (const { mode, button } of entries) {
      const checked = String(mode === selectedMode);
      if (button.getAttribute("aria-checked") !== checked) button.setAttribute("aria-checked", checked);
      if (button.disabled !== disabled) button.disabled = disabled;
    }
  };
}

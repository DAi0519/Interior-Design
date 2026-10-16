/**
 * [INPUT]: 依赖服务端脱敏精模 Prompt 目录、原生 select 与 sessionStorage
 * [OUTPUT]: 对外提供仅展示已上架版本的精模 Prompt 选择器，恢复有效选择并说明用户要求前置规则
 * [POS]: public 的精模固定 Prompt 配置控制器，绝不接收或展示 Prompt 正文
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

const STORAGE_KEY = "canvas-lab.refined-prompt-version";

export function bindRefinedPromptVersionSelect({ availability, note, select }) {
  let selectedVersion = Number(sessionStorage.getItem(STORAGE_KEY)) || null;
  let currentConfig = { defaultVersion: null, versions: [] };

  function remember(version) {
    selectedVersion = Number(version) || null;
    if (selectedVersion) sessionStorage.setItem(STORAGE_KEY, String(selectedVersion));
    else sessionStorage.removeItem(STORAGE_KEY);
  }

  function render(config = currentConfig) {
    currentConfig = config;
    const versions = [...(config.versions || [])]
      .filter((entry) => entry.published === true)
      .sort((left, right) => right.version - left.version);
    if (!versions.some((entry) => entry.version === selectedVersion)) {
      const defaultVersion = versions.find(
        (entry) => entry.version === config.defaultVersion,
      );
      remember(defaultVersion?.version || versions[0]?.version || null);
    }
    select.replaceChildren(
      ...versions.map((entry) => {
        const option = document.createElement("option");
        option.value = String(entry.version);
        option.selected = entry.version === selectedVersion;
        option.textContent = `${entry.name} · v${entry.version}`;
        return option;
      }),
    );
    select.disabled = versions.length === 0;
    const selected = versions.find((entry) => entry.version === selectedVersion);
    availability.textContent = selected ? "已上架" : "未配置";
    availability.classList.toggle("ready", Boolean(selected));
    note.textContent = selected
      ? `正文由飞书管理；当前使用 v${selected.version}，自定义要求会放在预设前面。`
      : "飞书中暂无可用的精模 Prompt。";
  }

  select.addEventListener("change", (event) => {
    remember(event.target.value);
    render();
  });

  return { render, value: () => selectedVersion };
}

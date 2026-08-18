/**
 * [INPUT]: 依赖服务端脱敏精模 Prompt 目录、原生 select 与 sessionStorage
 * [OUTPUT]: 对外提供精模 Prompt 版本选择器，显式标记内部测试版本并说明用户要求前置规则
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
    const versions = [...(config.versions || [])].sort(
      (left, right) => right.version - left.version,
    );
    if (!versions.some((entry) => entry.version === selectedVersion)) {
      remember(config.defaultVersion || versions[0]?.version || null);
    }
    select.replaceChildren(
      ...versions.map((entry) => {
        const option = document.createElement("option");
        option.value = String(entry.version);
        option.selected = entry.version === selectedVersion;
        option.textContent = `${entry.name} · v${entry.version}${entry.published ? "" : " · 测试中"}`;
        return option;
      }),
    );
    select.disabled = versions.length === 0;
    const selected = versions.find((entry) => entry.version === selectedVersion);
    availability.textContent = selected?.published ? "已上架" : versions.length ? "测试中" : "未配置";
    availability.classList.toggle("ready", Boolean(selected));
    note.textContent = selected
      ? `正文由飞书管理；当前使用 v${selected.version}${selected.published ? "" : "（尚未上架，仅供内部测试）"}，自定义要求会放在预设前面。`
      : "飞书中暂无可用的精模 Prompt。";
  }

  select.addEventListener("change", (event) => {
    remember(event.target.value);
    render();
  });

  return { render, value: () => selectedVersion };
}

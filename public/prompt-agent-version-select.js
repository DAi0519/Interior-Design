/**
 * [INPUT]: 依赖场景融合 Agent 脱敏版本目录、原生 select 与 sessionStorage
 * [OUTPUT]: 对外提供 bindPromptAgentVersionSelect，负责已上架版本的默认选择、记忆与下拉渲染
 * [POS]: public 的场景融合 Agent 版本选择控制器，与融合基模和出图模型状态分离
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

const STORAGE_KEY = "canvas-lab.prompt-agent-version";

export function bindPromptAgentVersionSelect({ availability, select }) {
  let selectedVersion = Number(sessionStorage.getItem(STORAGE_KEY)) || null;
  let versions = [];

  function setSelectedVersion(version) {
    selectedVersion = Number(version) || null;
    if (selectedVersion) {
      sessionStorage.setItem(STORAGE_KEY, String(selectedVersion));
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  }

  function render(config = {}) {
    versions = [...(config.versions || [])].sort(
      (left, right) => right.version - left.version,
    );
    if (!versions.some((entry) => entry.version === selectedVersion)) {
      const defaultVersion = versions.find(
        (entry) => entry.version === config.defaultVersion,
      );
      setSelectedVersion(
        defaultVersion?.version || versions[0]?.version || null,
      );
    }

    const options = versions.map((entry) => {
      const option = document.createElement("option");
      option.value = String(entry.version);
      option.selected = entry.version === selectedVersion;
      option.textContent = `${entry.name} · v${entry.version}`;
      return option;
    });
    select.replaceChildren(...options);
    select.disabled = versions.length === 0;
    availability.textContent = `${versions.length} 个版本`;
    availability.classList.toggle("ready", versions.length > 0);
  }

  select.addEventListener("change", (event) => {
    setSelectedVersion(event.target.value);
    render({ versions });
  });

  return {
    render,
    value() {
      return selectedVersion;
    },
  };
}

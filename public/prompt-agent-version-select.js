/**
 * [INPUT]: 依赖场景融合Agent脱敏版本目录、原生select、sessionStorage及可选记忆scope
 * [OUTPUT]: 对外提供上架版本选择/记忆/渲染，旧房以独立scope隔离版本，其余调用保持原全局存储键
 * [POS]: public 的场景融合 Agent 版本选择控制器，与融合基模和出图模型状态分离
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

const STORAGE_KEY = "canvas-lab.prompt-agent-version";

export function bindPromptAgentVersionSelect({ availability, select }) {
  let activeScope = "";
  let selectedVersion = Number(sessionStorage.getItem(STORAGE_KEY)) || null;
  let versions = [];
  const storageKey = () => activeScope ? `${STORAGE_KEY}:${activeScope}` : STORAGE_KEY;

  function setSelectedVersion(version) {
    selectedVersion = Number(version) || null;
    if (selectedVersion) {
      sessionStorage.setItem(storageKey(), String(selectedVersion));
    } else {
      sessionStorage.removeItem(storageKey());
    }
  }

  function render(config = {}, { scope = "" } = {}) {
    if (scope !== activeScope) {
      activeScope = scope;
      selectedVersion = Number(sessionStorage.getItem(storageKey())) || null;
    }
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
    render({ versions }, { scope: activeScope });
  });

  return {
    render,
    value() {
      return selectedVersion;
    },
  };
}

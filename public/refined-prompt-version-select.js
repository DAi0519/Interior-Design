/**
 * [INPUT]: 依赖服务端脱敏精模基础目录/迁移和氛围词双图各自规则身份、原生 select 与独立 sessionStorage
 * [OUTPUT]: 对外提供基础版本独立记忆、迁移/氛围词前置只读目录和真实错误；迁移版本不覆盖基础记忆，无说明小字
 * [POS]: public 的精模固定 Prompt 配置控制器，绝不接收或展示 Prompt 正文
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

const STORAGE_KEY = "canvas-lab.refined-lighting-base-version";

export function referenceLightingPromptCatalog(config = {}, kind = "reference") {
  if (kind === "hybrid") {
    const ready = config?.hybridAvailable === true && Number.isInteger(config.hybridRuleVersion)
      && config.hybridRuleVersion > 0 && Boolean(config.hybridRuleSha256);
    return { defaultVersion: ready ? config.hybridRuleVersion : null,
      reason: "氛围词参考前置 Prompt 不可用，请刷新配置",
      versions: ready ? [{ name: "氛围词参考前置", version: config.hybridRuleVersion, published: true }] : [] };
  }
  const ready = config?.referenceAvailable === true && Number.isInteger(config.referenceRuleVersion)
    && config.referenceRuleVersion > 0 && Boolean(config.referenceRuleSha256);
  return { defaultVersion: ready ? config.referenceRuleVersion : null,
    reason: config?.referenceReason || "参考图光影迁移 Prompt 不可用，请刷新配置",
    versions: ready ? [{ name: "参考图光影迁移", version: config.referenceRuleVersion, published: true }] : [] };
}

export function bindRefinedPromptVersionSelect({ availability, note, select }) {
  let selectedVersion = Number(sessionStorage.getItem(STORAGE_KEY)) || null;
  let currentConfig = { defaultVersion: null, versions: [] };
  let referenceConfig = null;
  let referenceKind = "reference";

  function remember(version) {
    selectedVersion = Number(version) || null;
    if (selectedVersion) sessionStorage.setItem(STORAGE_KEY, String(selectedVersion));
    else sessionStorage.removeItem(STORAGE_KEY);
  }

  function render(config = currentConfig) {
    currentConfig = config;
    const activeConfig = referenceConfig ? referenceLightingPromptCatalog(referenceConfig, referenceKind) : config;
    const versions = [...(activeConfig.versions || [])]
      .filter((entry) => entry.published === true)
      .sort((left, right) => right.version - left.version);
    if (!referenceConfig && !versions.some((entry) => entry.version === selectedVersion)) {
      const defaultVersion = versions.find(
        (entry) => entry.version === config.defaultVersion,
      );
      remember(defaultVersion?.version || versions[0]?.version || null);
    }
    const activeVersion = referenceConfig ? activeConfig.defaultVersion : selectedVersion;
    select.replaceChildren(
      ...versions.map((entry) => {
        const option = document.createElement("option");
        option.value = String(entry.version);
        option.selected = entry.version === activeVersion;
        option.textContent = `${entry.name} · v${entry.version}`;
        return option;
      }),
    );
    select.disabled = Boolean(referenceConfig) || versions.length === 0;
    const selected = versions.find((entry) => entry.version === activeVersion);
    availability.textContent = selected ? "已上架" : "未配置";
    availability.classList.toggle("ready", Boolean(selected));
    note.textContent = selected ? "" : activeConfig.reason || "飞书中暂无可用的精模 Prompt。";
    note.classList.toggle("error", !selected);
    note.hidden = Boolean(selected);
  }

  select.addEventListener("change", (event) => {
    if (referenceConfig) { render(); return; }
    remember(event.target.value);
    render();
  });

  return { render,
    setReferenceConfig(config, kind = "reference") {
      if (referenceConfig === null && config == null) return;
      referenceConfig = config ?? null; referenceKind = kind; render();
    },
    value: () => referenceConfig ? referenceLightingPromptCatalog(referenceConfig, referenceKind).defaultVersion : selectedVersion,
    selected: () => referenceConfig ? referenceLightingPromptCatalog(referenceConfig, referenceKind).versions[0]
      : currentConfig.versions?.find((entry) => entry.version === selectedVersion && entry.published === true) };
}

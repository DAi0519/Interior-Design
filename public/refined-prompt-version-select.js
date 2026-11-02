/**
 * [INPUT]: 依赖服务端同表三类精模完整Prompt目录/双图身份与维护地址、原生 select 和兼容 sessionStorage
 * [OUTPUT]: 对外提供三方式统一名称、纯词版本独立记忆/下架回退、双图只读目录和真实错误，不接收Prompt正文
 * [POS]: public 的精模固定 Prompt 配置控制器，绝不接收或展示 Prompt 正文
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

const STORAGE_KEY = "canvas-lab.refined-lighting-base-version";
export const REFINED_RENDER_PROMPT_NAMES = Object.freeze({
  base: "精模渲染 · 仅提示词",
  reference: "精模渲染 · 参考图迁移",
  hybrid: "精模渲染 · 氛围词＋参考图",
});

export function referenceLightingPromptCatalog(config = {}, kind = "reference") {
  if (kind === "hybrid") {
    const ready = config?.hybridAvailable === true && Number.isInteger(config.hybridRuleVersion)
      && config.hybridRuleVersion > 0 && Boolean(config.hybridRuleSha256);
    return { defaultVersion: ready ? config.hybridRuleVersion : null, tableUrl: config.promptTableUrl,
      reason: `${REFINED_RENDER_PROMPT_NAMES.hybrid} Prompt 不可用，请刷新配置`,
      versions: ready ? [{ name: REFINED_RENDER_PROMPT_NAMES.hybrid, version: config.hybridRuleVersion, published: true }] : [] };
  }
  const ready = config?.referenceAvailable === true && Number.isInteger(config.referenceRuleVersion)
    && config.referenceRuleVersion > 0 && Boolean(config.referenceRuleSha256);
  return { defaultVersion: ready ? config.referenceRuleVersion : null, tableUrl: config.promptTableUrl,
    reason: config?.referenceReason || `${REFINED_RENDER_PROMPT_NAMES.reference} Prompt 不可用，请刷新配置`,
    versions: ready ? [{ name: REFINED_RENDER_PROMPT_NAMES.reference, version: config.referenceRuleVersion, published: true }] : [] };
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
        option.textContent = `${referenceConfig ? entry.name : REFINED_RENDER_PROMPT_NAMES.base} · v${entry.version}`;
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

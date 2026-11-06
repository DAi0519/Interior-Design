/**
 * [INPUT]: 依赖主/Beta美化容器或旧强度/色调单选组、共享纯词光影控制器与变更回调
 * [OUTPUT]: 对外提供六档强度/色调直白名称、十五项同网格主/Beta混合多选或宿主单选、逐项工作流/身份投影及草稿恢复，支持键盘与多选持续展开
 * [POS]: public 的效果图美化组合输入层，六档保持原映射，新增模板使用low/natural，不持有Prompt正文
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { bindEffectBeautificationLighting, normalizeEffectBeautificationLighting } from "./effect-beautification-lighting.js";

// --- 六档按强度与色调命名，工作流身份保持不变 ---
export const EFFECT_BEAUTIFICATION_ATMOSPHERES = Object.freeze([
  { key: "low-natural", intensity: "low", tone: "natural", name: "低强度自然调" },
  { key: "low-warm", intensity: "low", tone: "warm", name: "低强度暖调" },
  { key: "low-cool", intensity: "low", tone: "cool", name: "低强度冷调" },
  { key: "high-warm", intensity: "high", tone: "warm", name: "高强度暖调" },
  { key: "high-natural", intensity: "high", tone: "natural", name: "高强度自然调" },
  { key: "high-cool", intensity: "high", tone: "cool", name: "高强度冷调" },
].map(Object.freeze));

// --- 主/Beta配置区：固定语义骨架，不插入远端内容 ---
const BEAUTIFICATION_SECTION_HTML = `
            <div hidden>
              <div class="section-heading-actions">
                <span id="effectBeautificationPromptAvailability" class="micro-status" aria-live="polite">读取中</span>
                <button id="refreshEffectBeautificationPromptButton" class="config-refresh-button" data-config-refresh type="button" aria-label="刷新效果图美化 Prompt 版本" title="立即读取飞书中当前上架的效果图美化 Prompt 版本">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5" /><path d="M4 17v-5h5" /><path d="M6.1 9A7 7 0 0 1 18 6.5L20 9" /><path d="M17.9 15A7 7 0 0 1 6 17.5L4 15" /></svg>
                  <span data-refresh-label>刷新</span>
                </button>
              </div>
            </div>
            <div id="effectAtmosphereGroup" class="effect-beautification-atmospheres" role="group" aria-label="光影模板"></div>
            <div id="effectBeautificationLightingSection" class="effect-beautification-lighting"></div>
            <p id="effectBeautificationPromptNote" class="compact-config-note" hidden></p>
`;

export function normalizeEffectBeautification(input = {}) {
  return {
    intensity: ["low", "high"].includes(input?.intensity) ? input.intensity : "low",
    tone: ["natural", "warm", "cool"].includes(input?.tone) ? input.tone : "natural",
  };
}

export function normalizeEffectBeautificationSelections(values) {
  if (!Array.isArray(values)) throw new TypeError("请选择有效的美化氛围");
  const selected = new Map();
  for (const value of values) {
    const lighting = normalizeEffectBeautificationLighting(value?.effectBeautificationLighting);
    const choice = lighting ? { intensity: "low", tone: "natural" } : value?.effectBeautification;
    if (!choice || !["low", "high"].includes(choice.intensity) || !["natural", "warm", "cool"].includes(choice.tone)) {
      throw new TypeError("请选择有效的美化氛围");
    }
    const key = lighting ? `lighting:${lighting.presetId}` : `atmosphere:${choice.intensity}-${choice.tone}`;
    const next = { effectBeautification: normalizeEffectBeautification(choice), effectBeautificationLighting: lighting };
    if (selected.has(key) && JSON.stringify(selected.get(key)) !== JSON.stringify(next)) throw new TypeError("同一美化氛围的版本不一致，请重新选择");
    selected.set(key, next);
  }
  return [...selected.values()];
}

export function bindEffectBeautificationControls({ root, intensityGroup, toneGroup, onChange = () => {},
  withPromptStatus = true, multiple = false, lightingStorageKey = null, reload = null, bindLighting = bindEffectBeautificationLighting }) {
  if (root) { root.setAttribute("data-effect-beautification-controls", ""); root.innerHTML = BEAUTIFICATION_SECTION_HTML; }
  let selection = normalizeEffectBeautification();
  let selectedAtmospheres = new Set(["low-natural"]);
  let active = true, lighting;
  const atmosphereGroup = root?.querySelector("#effectAtmosphereGroup");
  if (atmosphereGroup) {
    atmosphereGroup.innerHTML = EFFECT_BEAUTIFICATION_ATMOSPHERES.map(item => `
      <button class="refined-lighting-card effect-beautification-atmosphere" type="button" role="${multiple ? "checkbox" : "radio"}" aria-checked="false" data-effect-atmosphere="${item.key}"><span class="refined-lighting-card-label">${item.name}</span><span class="refined-lighting-check" aria-hidden="true"></span></button>`).join("");
  }
  const groups = atmosphereGroup ? [[atmosphereGroup, "atmosphere"]]
    : [[intensityGroup, "intensity"], [toneGroup, "tone"]];
  function value() { return lighting?.value() ? { intensity: "low", tone: "natural" } : { ...selection }; }

  function render() {
    const atmosphere = EFFECT_BEAUTIFICATION_ATMOSPHERES.find(item => multiple && selectedAtmospheres.size
      ? selectedAtmospheres.has(item.key) : item.intensity === selection.intensity && item.tone === selection.tone);
    const label = multiple ? EFFECT_BEAUTIFICATION_ATMOSPHERES.filter(item => selectedAtmospheres.has(item.key))
      .map(item => item.name).join("、") : atmosphere.name;
    lighting?.setAtmosphereSelection({ count: multiple ? selectedAtmospheres.size : active ? 1 : 0, label });
    for (const [group, key] of groups) {
      for (const button of group.querySelectorAll(`[data-effect-${key}]`)) {
        const selected = (multiple || active) && (key === "atmosphere"
          ? multiple ? selectedAtmospheres.has(button.dataset.effectAtmosphere) : button.dataset.effectAtmosphere === `${selection.intensity}-${selection.tone}`
          : button.dataset[key === "intensity" ? "effectIntensity" : "effectTone"] === selection[key]);
        if (key !== "atmosphere") button.classList.toggle("selected", selected);
        button.setAttribute("aria-checked", String(selected));
        if (key === "atmosphere") button.setAttribute("aria-pressed", String(selected));
        button.tabIndex = multiple || selected || !active && button === group.querySelectorAll(`[data-effect-${key}]`)[0] ? 0 : -1;
      }
    }
  }

  for (const [group, key] of groups) {
    const selector = `[data-effect-${key}]`;
    const dataKey = key === "atmosphere" ? "effectAtmosphere" : key === "intensity" ? "effectIntensity" : "effectTone";
    const select = (button) => {
      if (button.disabled) return;
      if (key === "atmosphere") {
        const atmosphere = EFFECT_BEAUTIFICATION_ATMOSPHERES.find(item => item.key === button.dataset[dataKey]);
        if (!atmosphere) return;
        selection = normalizeEffectBeautification(atmosphere);
        if (multiple && selectedAtmospheres.has(atmosphere.key)) selectedAtmospheres.delete(atmosphere.key);
        else if (multiple) selectedAtmospheres.add(atmosphere.key);
      } else selection = normalizeEffectBeautification({ ...selection, [key]: button.dataset[dataKey] });
      active = true;
      if (!multiple) lighting?.setValue(null);
      render();
      (multiple ? button : root?.querySelector("[data-lighting-toggle]") || button).focus();
      onChange(value());
    };
    group.addEventListener("click", (event) => {
      const button = event.target.closest(selector);
      if (button && group.contains(button)) select(button);
    });
    group.addEventListener("keydown", (event) => {
      const buttons = [...group.querySelectorAll(selector)].filter(button => !button.disabled);
      const index = buttons.indexOf(event.target.closest(selector));
      if (index < 0 || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
        : (index + (["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 1) + buttons.length) % buttons.length;
      if (multiple) buttons[next].focus(); else select(buttons[next]);
    });
  }
  if (root) {
    lighting = bindLighting({ root: root.querySelector("#effectBeautificationLightingSection"), storageKey: lightingStorageKey, reload,
      leadingOptions: atmosphereGroup, multiple,
      onChange() { if (!multiple) active = !lighting.value(); render(); onChange(value()); } });
    active = !lighting.value();
  }
  function selectAll() {
    selectedAtmospheres = new Set(EFFECT_BEAUTIFICATION_ATMOSPHERES.map(item => item.key));
    lighting?.setSelections(lighting.availableSelections()); render(); onChange(value());
  }
  function clearSelection() { selectedAtmospheres.clear(); lighting?.setSelections([]); render(); onChange(value()); }
  if (root && multiple) {
    const actions = root.querySelector("[data-lighting-preset-section] .section-heading-actions");
    for (const [label, select] of [["全选", selectAll], ["清空", clearSelection]]) {
      const button = root.ownerDocument.createElement("button");
      button.type = "button"; button.className = "config-refresh-button"; button.textContent = label;
      button.setAttribute("aria-label", `${label}美化光影模板`); button.addEventListener("click", select); actions.append(button);
    }
  }
  render();
  function selections() {
    const originals = EFFECT_BEAUTIFICATION_ATMOSPHERES.filter(item => multiple ? selectedAtmospheres.has(item.key)
      : active && item.intensity === selection.intensity && item.tone === selection.tone).map(item => ({
      key: `atmosphere:${item.key}`, name: item.name,
      effectBeautification: { intensity: item.intensity, tone: item.tone }, effectBeautificationLighting: null,
    }));
    return [...originals, ...(lighting?.selections() || []).map(({ name, ...identity }) => ({
      key: `lighting:${identity.presetId}`, name, effectBeautification: { intensity: "low", tone: "natural" },
      effectBeautificationLighting: identity,
    }))];
  }
  return {
    value, selections, selectAll, clearSelection,
    requiresOriginalPrompt: () => selections().some(item => !item.effectBeautificationLighting),
    restore(input) { selection = normalizeEffectBeautification(input); selectedAtmospheres = new Set([`${selection.intensity}-${selection.tone}`]); active = true; lighting?.setValue(null); render(); },
    restoreSelections(values) {
      const restored = normalizeEffectBeautificationSelections(values);
      selectedAtmospheres = new Set(restored.filter(item => !item.effectBeautificationLighting)
        .map(item => `${item.effectBeautification.intensity}-${item.effectBeautification.tone}`));
      if (selectedAtmospheres.size) selection = normalizeEffectBeautification(restored.find(item => !item.effectBeautificationLighting).effectBeautification);
      lighting?.setSelections(restored.flatMap(item => item.effectBeautificationLighting ? [item.effectBeautificationLighting] : []));
      active = !lighting?.value(); render();
    },
    setActive(value) { active = Boolean(value); render(); },
    lightingValue: () => lighting?.value() || null,
    setLightingValue(value) { lighting?.setValue(value); if (multiple && value) selectedAtmospheres.clear(); active = !lighting?.value(); render(); },
    requestFields: featureMode => lighting?.requestFields(featureMode) || {},
    setLightingConfig: config => lighting?.setLightingConfig(config),
    setCapabilities: config => lighting?.setCapabilities(config),
    validation: () => multiple && !selections().length ? "请至少选择一种光影模板" : lighting?.validation() || null,
  };
}

/**
 * [INPUT]: 依赖主/Beta美化容器或旧强度/色调单选组、共享纯词光影控制器与变更回调
 * [OUTPUT]: 对外提供六种原工作流氛围与新增模板互斥选择、旧value/restore兼容及模板身份/版本/能力准入，支持方向键/Home/End和禁用守卫
 * [POS]: public 的效果图美化组合输入层，六档保持原映射，新增模板使用low/natural，不持有Prompt正文
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { bindEffectBeautificationLighting } from "./effect-beautification-lighting.js";

// --- 既有六氛围只改展示名称，原工作流身份保持不变 ---
export const EFFECT_BEAUTIFICATION_ATMOSPHERES = Object.freeze([
  { key: "low-natural", intensity: "low", tone: "natural", name: "明亮自然" },
  { key: "low-warm", intensity: "low", tone: "warm", name: "暖阳通透" },
  { key: "low-cool", intensity: "low", tone: "cool", name: "清透冷调" },
  { key: "high-warm", intensity: "high", tone: "warm", name: "温润柔光" },
  { key: "high-natural", intensity: "high", tone: "natural", name: "自然柔光" },
  { key: "high-cool", intensity: "high", tone: "cool", name: "静谧柔光" },
].map(Object.freeze));

// --- 主/Beta配置区：固定语义骨架，不插入远端内容 ---
const BEAUTIFICATION_SECTION_HTML = `
            <div class="section-heading">
              <h2 id="effectBeautificationTitle">光影氛围</h2>
              <div class="section-heading-actions">
                <span id="effectBeautificationPromptAvailability" class="micro-status" aria-live="polite">读取中</span>
                <button id="refreshEffectBeautificationPromptButton" class="config-refresh-button" data-config-refresh type="button" aria-label="刷新效果图美化 Prompt 版本" title="立即读取飞书中当前上架的效果图美化 Prompt 版本">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5" /><path d="M4 17v-5h5" /><path d="M6.1 9A7 7 0 0 1 18 6.5L20 9" /><path d="M17.9 15A7 7 0 0 1 6 17.5L4 15" /></svg>
                  <span data-refresh-label>刷新</span>
                </button>
              </div>
            </div>
            <div class="effect-beautification-field">
              <div id="effectAtmosphereGroup" class="effect-beautification-options effect-beautification-atmospheres" role="radiogroup" aria-labelledby="effectBeautificationTitle"></div>
            </div>
            <div id="effectBeautificationLightingSection" class="effect-beautification-lighting"></div>
            <p id="effectBeautificationPromptNote" class="compact-config-note" hidden></p>
`;

export function normalizeEffectBeautification(input = {}) {
  return {
    intensity: ["low", "high"].includes(input?.intensity) ? input.intensity : "low",
    tone: ["natural", "warm", "cool"].includes(input?.tone) ? input.tone : "natural",
  };
}

export function bindEffectBeautificationControls({ root, intensityGroup, toneGroup, onChange = () => {},
  withPromptStatus = true, lightingStorageKey = null, reload = null, bindLighting = bindEffectBeautificationLighting }) {
  if (root) { root.setAttribute("data-effect-beautification-controls", ""); root.innerHTML = BEAUTIFICATION_SECTION_HTML; }
  let selection = normalizeEffectBeautification();
  let active = true, lighting;
  const atmosphereGroup = root?.querySelector("#effectAtmosphereGroup");
  if (atmosphereGroup) {
    atmosphereGroup.innerHTML = EFFECT_BEAUTIFICATION_ATMOSPHERES.map(item => `
      <button class="feature-choice-option refined-lighting-execution-choice effect-beautification-atmosphere" type="button" role="radio" aria-checked="false" data-effect-atmosphere="${item.key}">${item.name}<span class="refined-lighting-execution-check" aria-hidden="true"></span></button>`).join("");
    root.querySelector(".section-heading-actions").hidden = !withPromptStatus;
  }
  const groups = atmosphereGroup ? [[atmosphereGroup, "atmosphere"]]
    : [[intensityGroup, "intensity"], [toneGroup, "tone"]];
  function value() { return lighting?.value() ? { intensity: "low", tone: "natural" } : { ...selection }; }

  function render() {
    for (const [group, key] of groups) {
      for (const button of group.querySelectorAll(`[data-effect-${key}]`)) {
        const selected = active && (key === "atmosphere"
          ? button.dataset.effectAtmosphere === `${selection.intensity}-${selection.tone}`
          : button.dataset[key === "intensity" ? "effectIntensity" : "effectTone"] === selection[key]);
        if (key !== "atmosphere") button.classList.toggle("selected", selected);
        button.setAttribute("aria-checked", String(selected));
        button.tabIndex = selected || !active && button === group.querySelectorAll(`[data-effect-${key}]`)[0] ? 0 : -1;
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
      } else selection = normalizeEffectBeautification({ ...selection, [key]: button.dataset[dataKey] });
      active = true;
      lighting?.setValue(null);
      render();
      button.focus();
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
      select(buttons[next]);
    });
  }
  if (root) {
    lighting = bindLighting({ root: root.querySelector("#effectBeautificationLightingSection"), storageKey: lightingStorageKey, reload,
      onChange() { active = !lighting.value(); render(); onChange(value()); } });
    active = !lighting.value();
  }
  render();
  return {
    value,
    restore(input) { selection = normalizeEffectBeautification(input); active = true; lighting?.setValue(null); render(); },
    setActive(value) { active = Boolean(value); render(); },
    lightingValue: () => lighting?.value() || null,
    setLightingValue(value) { lighting?.setValue(value); active = !lighting?.value(); render(); },
    requestFields: featureMode => lighting?.requestFields(featureMode) || {},
    setLightingConfig: config => lighting?.setLightingConfig(config),
    setCapabilities: config => lighting?.setCapabilities(config),
    validation: () => lighting?.validation() || null,
  };
}

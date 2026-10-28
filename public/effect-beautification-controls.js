/**
 * [INPUT]: 依赖主工作台美化容器或 Beta 已有强度/色调单选组、受控选择值与变更回调
 * [OUTPUT]: 对外提供无常驻说明的主工作台美化骨架、异常提示位、低强度/自然调归一化及value/restore单选控制器，支持方向键/Home/End/焦点跟随，禁用按钮不接受选择
 * [POS]: public 的效果图美化输入层，由生图工作台与 Beta 共用，不持有 Prompt 正文
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

// --- 主工作台配置区：固定语义骨架，不插入远端内容 ---
const BEAUTIFICATION_SECTION_HTML = `
            <div class="section-heading">
              <h2 id="effectBeautificationTitle">美化效果</h2>
              <div class="section-heading-actions">
                <span id="effectBeautificationPromptAvailability" class="micro-status" aria-live="polite">读取中</span>
                <button id="refreshEffectBeautificationPromptButton" class="config-refresh-button" data-config-refresh type="button" aria-label="刷新效果图美化 Prompt 版本" title="立即读取飞书中当前上架的效果图美化 Prompt 版本">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5" /><path d="M4 17v-5h5" /><path d="M6.1 9A7 7 0 0 1 18 6.5L20 9" /><path d="M17.9 15A7 7 0 0 1 6 17.5L4 15" /></svg>
                  <span data-refresh-label>刷新</span>
                </button>
              </div>
            </div>
            <div class="effect-beautification-field">
              <p id="effectIntensityLabel" class="effect-beautification-label">美化强度</p>
              <div id="effectIntensityGroup" class="effect-beautification-options" role="radiogroup" aria-labelledby="effectIntensityLabel">
                <button class="feature-choice-option selected" type="button" role="radio" aria-checked="true" data-effect-intensity="low">低强度</button>
                <button class="feature-choice-option" type="button" role="radio" aria-checked="false" data-effect-intensity="high">高强度</button>
              </div>
            </div>
            <div class="effect-beautification-field">
              <p id="effectToneLabel" class="effect-beautification-label">画面色调</p>
              <div id="effectToneGroup" class="effect-beautification-options" data-effect-tones role="radiogroup" aria-labelledby="effectToneLabel">
                <button class="feature-choice-option selected" type="button" role="radio" aria-checked="true" data-effect-tone="natural">自然调</button>
                <button class="feature-choice-option" type="button" role="radio" aria-checked="false" data-effect-tone="warm">暖调</button>
                <button class="feature-choice-option" type="button" role="radio" aria-checked="false" data-effect-tone="cool">冷调</button>
              </div>
            </div>
            <p id="effectBeautificationPromptNote" class="compact-config-note" hidden></p>
`;

export function normalizeEffectBeautification(input = {}) {
  return {
    intensity: ["low", "high"].includes(input?.intensity) ? input.intensity : "low",
    tone: ["natural", "warm", "cool"].includes(input?.tone) ? input.tone : "natural",
  };
}

export function bindEffectBeautificationControls({ root, intensityGroup, toneGroup, onChange = () => {} }) {
  if (root) root.innerHTML = BEAUTIFICATION_SECTION_HTML;
  intensityGroup ||= root.querySelector("#effectIntensityGroup");
  toneGroup ||= root.querySelector("#effectToneGroup");
  let selection = normalizeEffectBeautification();
  const groups = [[intensityGroup, "intensity"], [toneGroup, "tone"]];

  function render() {
    for (const [group, key] of groups) {
      for (const button of group.querySelectorAll(`[data-effect-${key}]`)) {
        const selected = button.dataset[key === "intensity" ? "effectIntensity" : "effectTone"] === selection[key];
        button.classList.toggle("selected", selected);
        button.setAttribute("aria-checked", String(selected));
        button.tabIndex = selected ? 0 : -1;
      }
    }
  }

  for (const [group, key] of groups) {
    const selector = `[data-effect-${key}]`;
    const dataKey = key === "intensity" ? "effectIntensity" : "effectTone";
    const select = (button) => {
      if (button.disabled) return;
      selection = normalizeEffectBeautification({ ...selection, [key]: button.dataset[dataKey] });
      render();
      button.focus();
      onChange({ ...selection });
    };
    group.addEventListener("click", (event) => {
      const button = event.target.closest(selector);
      if (button && group.contains(button)) select(button);
    });
    group.addEventListener("keydown", (event) => {
      const buttons = [...group.querySelectorAll(selector)];
      const index = buttons.indexOf(event.target.closest(selector));
      if (index < 0 || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
        : (index + (["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 1) + buttons.length) % buttons.length;
      select(buttons[next]);
    });
  }
  render();
  return {
    value: () => ({ ...selection }),
    restore(input) { selection = normalizeEffectBeautification(input); render(); },
  };
}

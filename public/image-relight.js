/**
 * [INPUT]: 依赖脱敏GPT光照模板/飞书Prompt版本身份/历史参数/光源编辑目录、共享整体原灯/标注/图片/输出规则、主图上传、画布交互与统一任务/摘要回调
 * [OUTPUT]: 对外提供bindImageRelight，支持模板直接生成、自定义无标注整体调灯及可选新增/单灯精修、整体/标注草稿隔离与换图清除、历史参数/保护只读恢复、两灯具模式即时保存、下拉回显同步和光标保持、整体操作/Prompt身份冻结及只读刷新
 * [POS]: public 的AI编辑打光控制器，复用既有主图与后台任务，不持有服务地址、模型密钥或Prompt正文
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { bindRelightCanvas } from "./image-relight-canvas.js";
import { RELIGHT_MODEL_KEY, RELIGHT_IMAGE_POLICY, RELIGHT_TYPES, RELIGHT_MODES, RELIGHT_LIMITS, RELIGHT_ACTIONS, RELIGHT_ORIGINAL_LIGHT_ACTIONS,
  RELIGHT_RESOLUTIONS, normalizeRelightLights, normalizeRelightOriginalLights, relightImageIssue, relightOutputSize } from "./image-relight-geometry.js";
import { RELIGHT_TEMPLATES, RELIGHT_BLEND_MODES, RELIGHT_LEGACY_TEMPLATES, RELIGHT_DEFAULT_TEMPLATE_KEY, relightTemplateDefinition, normalizeRelightSettings } from "./image-relight-presets.js";

const TYPE_LABEL = Object.fromEntries(RELIGHT_TYPES.map(type => [type.key, type.label]));
const ACTION_LABEL = { brighten: "新增光源", darken: "减弱原灯", turnOff: "关闭原灯", preserve: "保持不变" };
const EDIT_ACTIONS = RELIGHT_ACTIONS.filter(item => item.key !== "preserve");
const ORIGINAL_ACTIONS = EDIT_ACTIONS.filter(item => item.key !== "brighten");
const actionKey = light => light.action || "brighten";
const template = `
  <div class="relight-settings">
    <div class="section-heading"><h2 id="imageRelightTitle">打光设置</h2><div class="section-heading-actions relight-prompt-actions">
      <span data-relight-availability class="micro-status" aria-live="polite">读取中</span>
      <a data-relight-prompt-link class="config-refresh-button" target="_blank" rel="noopener noreferrer" aria-label="打开飞书打光Prompt表" hidden>飞书</a>
      <button type="button" data-relight-prompt-refresh class="config-refresh-button" aria-label="刷新打光Prompt当前版本" title="读取飞书中当前上架的打光Prompt">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5"/><path d="M4 17v-5h5"/><path d="M6.1 9A7 7 0 0 1 18 6.5L20 9"/><path d="M17.9 15A7 7 0 0 1 6 17.5L4 15"/></svg>
        <span data-relight-refresh-label>刷新</span>
      </button>
    </div></div>
    <div class="relight-plan-section">
      <div class="relight-template-field"><span class="relight-field-label" id="relightTemplateLabel">光照模板</span>
        <div class="relight-template-grid" role="radiogroup" aria-labelledby="relightTemplateLabel">${RELIGHT_TEMPLATES.map((item, index) => `<button type="button" data-relight-template="${item.key}" role="radio" aria-checked="${index === 0}" tabindex="${index === 0 ? 0 : -1}">${item.label}</button>`).join("")}</div>
        <p data-relight-legacy-template class="compact-config-note" hidden></p>
        <p data-relight-template-note class="compact-config-note" aria-live="polite"></p>
      </div>
    </div>
    <p data-relight-context class="compact-config-note" hidden></p>
    <p data-relight-history-parameters class="compact-config-note" hidden></p>
    <div data-relight-editor class="relight-editor" hidden>
    <div data-relight-original-lights class="relight-mode-field"><span class="relight-field-label" id="relightOriginalLightsLabel">原有灯光</span>
      <div class="relight-modes" role="radiogroup" aria-labelledby="relightOriginalLightsLabel">
        ${RELIGHT_ORIGINAL_LIGHT_ACTIONS.map(item => `<button type="button" data-relight-original-lights-action="${item.key}" role="radio" aria-checked="${item.key === "keep"}" tabindex="${item.key === "keep" ? 0 : -1}">${item.label}</button>`).join("")}
      </div>
      <label data-relight-original-lights-amount-field class="relight-intensity" hidden><span>整体减弱幅度 <output data-relight-original-lights-amount-value>50%</output></span><input data-relight-original-lights-amount type="range" aria-label="原有灯光整体减弱幅度" min="${RELIGHT_LIMITS.minDarkenAmount * 100}" max="${RELIGHT_LIMITS.maxDarkenAmount * 100}" step="10" value="50" /></label>
    </div>
    <div class="relight-mode-field"><span class="relight-field-label">可选编辑</span><div class="relight-modes" role="radiogroup" aria-label="光源编辑方式">
      <button type="button" data-relight-edit-mode="new" role="radio" aria-checked="true" tabindex="0">新增光源</button>
      <button type="button" data-relight-edit-mode="existing" role="radio" aria-checked="false" tabindex="-1">单灯精修</button>
    </div><p data-relight-edit-note class="compact-config-note"></p></div>
    <label class="field" data-relight-original-field hidden><span>原灯操作</span><select data-relight-original-action aria-label="原灯操作">${ORIGINAL_ACTIONS.map(item => `<option value="${item.key}">${ACTION_LABEL[item.key]}</option>`).join("")}</select></label>
    <div class="relight-lights-section"><div class="section-heading"><h3>光源标注</h3><span data-relight-count class="reference-count">0 / ${RELIGHT_LIMITS.maxLights}</span></div>
      <p data-relight-list-empty class="compact-config-note">可选用点、线或面标注新增光源或单灯精修。</p>
      <div data-relight-list class="relight-light-list" role="group" aria-label="已标注的光照调整"></div>
    </div>
    <fieldset data-relight-properties class="relight-properties" disabled>
      <legend data-relight-property-title>选择标注后调整参数</legend>
      <p data-relight-action-note class="compact-config-note"></p>
      <label class="relight-intensity" data-relight-darken-field hidden><span>原灯减弱幅度 <output data-relight-amount-value>50%</output></span><input data-relight-amount type="range" aria-label="当前原灯减弱幅度" min="10" max="90" step="10" value="50" /></label>
      <div data-relight-brighten-fields class="relight-brighten-fields">
      <div class="relight-mode-field"><span class="relight-field-label">灯具是否出现</span><div class="relight-modes" role="radiogroup" aria-label="当前光源生成方式">${RELIGHT_MODES.map((mode, index) => `<button type="button" data-relight-mode="${mode.key}" role="radio" aria-checked="${index === 0}" tabindex="${index === 0 ? 0 : -1}">${mode.label}</button>`).join("")}</div></div>
      <div class="relight-temperature"><label class="field"><span>色温 K</span><input data-relight-kelvin aria-label="当前光源色温K" type="number" min="${RELIGHT_LIMITS.minKelvin}" max="${RELIGHT_LIMITS.maxKelvin}" step="1" value="3000" /></label>
        <div class="relight-presets" role="group" aria-label="常用色温">${[2700, 3000, 4000, 6500].map(k => `<button type="button" data-relight-temperature="${k}">${k}K</button>`).join("")}</div>
      </div>
      <label class="relight-intensity"><span>相对亮度 <output data-relight-intensity-value>1.0×</output></span><input data-relight-intensity type="range" aria-label="当前光源相对亮度" min="${RELIGHT_LIMITS.minIntensity}" max="${RELIGHT_LIMITS.maxIntensity}" step="0.1" value="1" /></label>
      <label class="field"><span>光照软硬</span><select data-relight-softness aria-label="当前光源光照软硬"><option value="soft">柔和</option><option value="hard">硬朗</option></select></label>
      <label class="field relight-fixture" data-relight-fixture-field hidden><span>灯具描述（可选）</span><textarea data-relight-fixture rows="2" maxlength="${RELIGHT_LIMITS.maxFixtureLength}" aria-label="当前光源新增灯具描述" placeholder="例如：嵌入式黑色射灯、隐藏式灯带"></textarea></label>
      <p class="compact-config-note">拖动箭头末端指定受光目标；可单独选择是否添加灯具。</p>
      </div>
    </fieldset>
    </div>
    <p data-relight-status class="compact-config-note" role="status" hidden></p>
  </div>
  <div class="relight-preview" aria-label="光照标注区">
    <p class="relight-empty" data-relight-empty>上传原图，选择光照模板，或选择“自定义”编辑光源。</p>
    <!-- impeccable-disable-next-line broken-image: 原图上传后设置src，无图时整个frame隐藏 -->
    <div class="relight-frame" data-relight-frame hidden><img data-relight-source alt="打光原图" draggable="false" /><canvas data-relight-canvas tabindex="0" aria-describedby="relightKeyboardHint" aria-label="光照标注画布"></canvas></div>
  </div>
  <div class="relight-toolbar" aria-label="光照标注工具">
    <div class="relight-drawing-actions" role="group" aria-label="标注形状工具">
      <button type="button" data-relight-tool="select" aria-pressed="false">选择</button>
      ${RELIGHT_TYPES.map(type => `<button type="button" data-relight-tool="${type.key}" aria-pressed="${type.key === "point"}">${type.label}</button>`).join("")}
      <button type="button" data-relight-add title="在画面中央添加当前类型的标注，再用方向键移至光源位置">添加</button>
      <button type="button" data-relight-delete title="仅移除此处标注；关闭单个原灯请使用单灯精修" disabled>删除标注</button><button type="button" data-relight-undo disabled>撤销</button><button type="button" data-relight-clear disabled>清空</button>
    </div>
    <p data-relight-drawing-status class="compact-config-note" aria-live="polite"></p>
    <p id="relightKeyboardHint" class="relight-keyboard-hint">方向键移动标注 · 新增光源可用Shift＋方向键调整目标 · Delete删除标注 · 实际光效以生成结果为准</p>
  </div>
`;

export function bindImageRelight({ root, getSourceImage, onChange = () => {}, onSourceChange = () => {},
  showToast = () => {}, onRefresh = null, emptyModel, emptySize, exactSize }) {
  root.innerHTML = template;
  const by = selector => root.querySelector(selector);
  const list = by("[data-relight-list]"), properties = by("[data-relight-properties]");
  const kelvin = by("[data-relight-kelvin]"), intensity = by("[data-relight-intensity]");
  const softness = by("[data-relight-softness]"), fixture = by("[data-relight-fixture]");
  const originalAction = by("[data-relight-original-action]"), amount = by("[data-relight-amount]");
  const editor = by("[data-relight-editor]"), toolbar = by(".relight-toolbar");
  let config = { available: false, reason: "读取打光模型中…" }, fieldIssue = "", selectedLightId = null;
  let templateKey = RELIGHT_DEFAULT_TEMPLATE_KEY, blendMode = "balanced", outputResolution = "1K", quality = "medium";
  let drawing, manualDraft = [], restoredTemplateEdits = false, draftSourceKey = null, refreshPending = false;
  let editMode = "new", originalActionKey = "darken";
  let originalLights = { action: "keep" };
  const editingVisible = () => templateKey === "custom" || restoredTemplateEdits;
  const appliedOriginalLights = () => templateKey === "custom" ? normalizeRelightOriginalLights(originalLights) : null;

  const templates = [...root.querySelectorAll("[data-relight-template]")];
  const supported = (entries, key) => Array.isArray(entries) && entries.some(item => item.key === key);
  const planIssue = () => !supported([...(config.templates || []), ...(config.legacyTemplates || [])], templateKey) || !supported(config.blendModes, blendMode)
    || EDIT_ACTIONS.some(item => !supported(config.actions, item.key))
    || drawing?.value().some(item => actionKey(item) === "preserve") && !supported(config.actions, "preserve")
    ? "当前服务尚不支持所选照明方案或调光动作，请重新启动工作台" : "";
  const normalizedLights = () => {
    const lights = normalizeRelightLights(drawing.value(), { allowEmpty: true });
    if (templateKey === "custom" && originalLights.action === "keep" && lights.every(light => light.action === "preserve")) {
      throw new TypeError(`请选择整体减弱、全部关闭，或添加可选光源编辑${lights.length ? "；仅保持不变无需生成" : ""}`);
    }
    return lights;
  };

  function renderPlan() {
    const fallback = templates.some(item => item.dataset.relightTemplate === templateKey) ? null
      : templates.find(item => supported(config.templates, item.dataset.relightTemplate));
    templates.forEach(button => {
      const active = button.dataset.relightTemplate === templateKey;
      button.disabled = !supported(config.templates, button.dataset.relightTemplate);
      button.classList.toggle("selected", active); button.setAttribute("aria-checked", String(active));
      button.tabIndex = active || button === fallback ? 0 : -1;
      button.title = button.disabled ? "当前服务未开放，请重新启动工作台" : "";
    });
    const selectedTemplate = relightTemplateDefinition(templateKey);
    const legacy = by("[data-relight-legacy-template]"); legacy.hidden = restoredTemplateEdits || !RELIGHT_LEGACY_TEMPLATES.some(item => item.key === templateKey);
    legacy.textContent = legacy.hidden ? "" : `已恢复旧版「${selectedTemplate.label}」，可选择上方光照模板替换。`;
    by("[data-relight-template-note]").textContent = selectedTemplate.description;
    by("[data-relight-list-empty]").textContent = "可选用点、线或面标注新增光源或单灯精修。";
    renderOriginalLights();
  }

  function bindPlanChoices(buttons, attribute, update) {
    buttons.forEach(button => {
      button.addEventListener("click", () => { if (!button.disabled) update(button.dataset[attribute]); });
      button.addEventListener("keydown", event => {
        if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
        event.preventDefault(); const enabled = buttons.filter(item => !item.disabled); if (!enabled.length) return;
        const index = enabled.indexOf(button), step = ["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 1;
        const next = event.key === "Home" ? enabled[0] : event.key === "End" ? enabled.at(-1) : enabled[(index + step + enabled.length) % enabled.length];
        update(next.dataset[attribute]); next.focus();
      });
    });
  }
  const originalLightChoices = [...root.querySelectorAll("[data-relight-original-lights-action]")];
  function renderOriginalLights() {
    by("[data-relight-original-lights]").hidden = templateKey !== "custom";
    originalLightChoices.forEach(button => {
      const active = button.dataset.relightOriginalLightsAction === originalLights.action;
      button.disabled = !supported(config.originalLightActions, button.dataset.relightOriginalLightsAction);
      button.classList.toggle("selected", active); button.setAttribute("aria-checked", String(active)); button.tabIndex = active ? 0 : -1;
    });
    by("[data-relight-original-lights-amount-field]").hidden = originalLights.action !== "darken";
    const percentage = Math.round((originalLights.amount ?? .5) * 100);
    by("[data-relight-original-lights-amount]").value = percentage;
    by("[data-relight-original-lights-amount-value]").textContent = `${percentage}%`;
  }
  bindPlanChoices(originalLightChoices, "relightOriginalLightsAction", value => {
    if (templateKey !== "custom") return;
    originalLights = normalizeRelightOriginalLights(value === "darken" ? { action: value, amount: originalLights.amount ?? .5 } : { action: value });
    renderOriginalLights(); renderContext(); renderStatus(); onChange();
  });
  by("[data-relight-original-lights-amount]").addEventListener("input", () => {
    if (templateKey !== "custom" || originalLights.action !== "darken") return;
    originalLights = normalizeRelightOriginalLights({ action: "darken", amount: Number(by("[data-relight-original-lights-amount]").value) / 100 });
    renderOriginalLights(); renderStatus(); onChange();
  });
  bindPlanChoices(templates, "relightTemplate", value => {
    drawing.cancel();
    if (editingVisible()) manualDraft = drawing.value();
    templateKey = value; restoredTemplateEdits = false; fieldIssue = "";
    drawing.restore(value === "custom" ? manualDraft : []);
    renderPlan(); renderEditing(); renderContext(); renderStatus(); onChange();
  });

  // -------- 原生值变更同步共享下拉；业务监听按当前状态去重，避免重入与多余撤销 --------
  function syncSelectValue(control, value, force = false) {
    if (control.value === value && !force) return;
    control.value = value;
    control.dispatchEvent(new Event("change", { bubbles: true }));
  }

  const editModes = [...root.querySelectorAll("[data-relight-edit-mode]")];
  bindPlanChoices(editModes, "relightEditMode", value => {
    drawing.cancel(); editMode = value; fieldIssue = "";
    drawing.select(null);
  });

  function renderEditMode(selected) {
    const selectedAction = selected && actionKey(selected);
    if (selectedAction === "brighten") editMode = "new";
    else if (selectedAction) {
      editMode = "existing";
      if (selectedAction !== "preserve") originalActionKey = selectedAction;
    }
    editModes.forEach(button => {
      const active = button.dataset.relightEditMode === editMode;
      button.classList.toggle("selected", active); button.setAttribute("aria-checked", String(active)); button.tabIndex = active ? 0 : -1;
    });
    by("[data-relight-original-field]").hidden = editMode !== "existing" || selectedAction === "preserve";
    syncSelectValue(originalAction, originalActionKey);
    by("[data-relight-edit-note]").textContent = selectedAction === "preserve" ? "历史保持标注仅可查看或删除。"
      : editMode === "new" ? "在图上新增补光；可调整亮度，并选择是否出现灯具。"
      : "标记图中已有灯具或灯带，进行减弱或关闭；不标受光墙面。";
    drawing.setDrawingAction(editMode === "new" ? "brighten" : originalActionKey);
  }

  function renderProperties() {
    const lights = drawing.value(), selected = drawing.selected();
    const selectionChanged = selectedLightId !== (selected?.id || null);
    if (selectionChanged) fieldIssue = "";
    selectedLightId = selected?.id || null;
    const focused = list.contains(root.ownerDocument.activeElement) ? root.ownerDocument.activeElement.dataset.relightId : null;
    list.replaceChildren(...lights.map((light, index) => {
      const button = root.ownerDocument.createElement("button");
      button.type = "button"; button.dataset.relightId = light.id;
      button.className = `relight-light-item${light.id === selected?.id ? " selected" : ""}`;
      button.setAttribute("aria-pressed", String(light.id === selected?.id));
      const label = root.ownerDocument.createElement("span"), detail = root.ownerDocument.createElement("small");
      const key = actionKey(light);
      label.textContent = `${index + 1} · ${key === "brighten" ? TYPE_LABEL[light.type] : ACTION_LABEL[key]}`;
      detail.textContent = key === "brighten" ? `${light.kelvin}K · ${light.mode === "addFixture" ? "新增灯具" : "仅打光"}`
        : key === "darken" ? `减弱 ${Math.round((light.amount ?? .5) * 100)}%` : key === "turnOff" ? "保留灯具实体" : "光照与外观不变";
      button.append(label, detail); button.addEventListener("click", () => drawing.select(light.id)); return button;
    }));
    if (focused) [...list.querySelectorAll("[data-relight-id]")].find(button => button.dataset.relightId === focused)?.focus({ preventScroll: true });
    by("[data-relight-count]").textContent = `${lights.length} / ${RELIGHT_LIMITS.maxLights}`;
    by("[data-relight-list-empty]").hidden = Boolean(lights.length);
    renderEditMode(selected);
    properties.disabled = !selected || actionKey(selected) === "preserve";
    properties.hidden = !selected;
    by("[data-relight-property-title]").textContent = selected ? `光源 ${lights.findIndex(light => light.id === selected.id) + 1} · ${ACTION_LABEL[actionKey(selected)]}` : "选择标注后调整参数";
    if (!selected) { fieldIssue = ""; return; }
    const selectedAction = actionKey(selected);
    by("[data-relight-action-note]").textContent = selectedAction === "preserve" ? "光照与外观保持不变；历史标注仅可查看或删除。"
      : RELIGHT_ACTIONS.find(item => item.key === selectedAction).description;
    by("[data-relight-darken-field]").hidden = selectedAction !== "darken";
    by("[data-relight-brighten-fields]").hidden = selectedAction !== "brighten";
    if (selectedAction !== "brighten") {
      fieldIssue = "";
      amount.value = Math.round((selected.amount ?? .5) * 100);
      by("[data-relight-amount-value]").textContent = `${amount.value}%`;
      return;
    }
    // -------- 输入事件已提交状态，同值不回写DOM，保留光标与中文输入法组合 --------
    const editingKelvin = root.ownerDocument.activeElement === kelvin && Number(kelvin.value) === selected.kelvin;
    const incompleteKelvin = !selectionChanged && Boolean(fieldIssue);
    if (!editingKelvin && !incompleteKelvin && String(kelvin.value) !== String(selected.kelvin)) kelvin.value = selected.kelvin;
    intensity.value = selected.intensity; syncSelectValue(softness, selected.softness);
    if (fixture.value !== (selected.fixture || "")) fixture.value = selected.fixture || "";
    by("[data-relight-intensity-value]").textContent = `${selected.intensity.toFixed(1)}×`;
    by("[data-relight-fixture-field]").hidden = selected.mode !== "addFixture";
    root.querySelectorAll("[data-relight-mode]").forEach(button => {
      const active = button.dataset.relightMode === selected.mode;
      button.classList.toggle("selected", active); button.setAttribute("aria-checked", String(active)); button.tabIndex = active ? 0 : -1;
    });
    root.querySelectorAll("[data-relight-temperature]").forEach(button => {
      const active = Number(button.dataset.relightTemperature) === selected.kelvin;
      button.classList.toggle("selected", active); button.setAttribute("aria-pressed", String(active));
    });
  }

  function renderEditing() {
    const visible = editingVisible();
    editor.hidden = !visible; toolbar.hidden = !visible;
    drawing?.setEditing(visible);
    renderOriginalLights();
  }

  function renderContext() {
    const context = by("[data-relight-context]"), history = by("[data-relight-history-parameters]");
    context.textContent = restoredTemplateEdits
      ? `已恢复「${relightTemplateDefinition(templateKey).label}」和${drawing.value().length}处光源调整。`
      : templateKey !== "custom" && (manualDraft.length || originalLights.action !== "keep")
        ? `${manualDraft.length ? `${manualDraft.length}处自定义草稿` : "原有灯光设置草稿"}未应用，选择“自定义”可继续编辑。` : "";
    context.hidden = !context.textContent;
    history.hidden = outputResolution === "1K" && quality === "medium" && blendMode === "balanced";
    history.textContent = history.hidden ? "" : `历史任务：${outputResolution} · ${quality} · ${RELIGHT_BLEND_MODES.find(item => item.key === blendMode).label}`;
  }

  const promptIdentity = () => {
    const prompt = config.prompt;
    return prompt?.available === true && prompt.code === "image-relight" && Number.isSafeInteger(prompt.version) && prompt.version > 0
      && typeof prompt.sha256 === "string" && /^[a-f0-9]{64}$/i.test(prompt.sha256)
      ? { relightPromptVersion: prompt.version, relightPromptSha256: prompt.sha256 } : null;
  };
  const promptTableUrl = () => {
    try {
      const value = config.prompt?.tableUrl, url = new URL(value);
      return url.protocol === "https:" && /(^|\.)(feishu\.cn|larksuite\.com)$/.test(url.hostname) ? value : "";
    } catch { return ""; }
  };

  const modelConfig = () => config.model || config.models?.find(model => model.key === RELIGHT_MODEL_KEY) || config;
  const supportsOriginalLights = () => RELIGHT_ORIGINAL_LIGHT_ACTIONS.every(item => supported(config.originalLightActions, item.key));
  const available = () => config.available === true && supportsOriginalLights() && Boolean(config.sizes || modelConfig().sizes)
    && Array.isArray(config.qualityOptions || modelConfig().qualityOptions) && Boolean(promptIdentity());
  const unavailableReason = () => config.reason || (!promptIdentity() ? config.prompt?.reason
    || "未读取到可用的打光Prompt版本，请刷新飞书配置" : !supportsOriginalLights() ? "当前服务尚不支持整体原灯操作，请重新启动工作台" : modelConfig().reason || "打光模型配置未更新，请重启工作台");

  function validate() {
    const sourceIssue = relightImageIssue(getSourceImage());
    if (!available()) return { message: unavailableReason() };
    if (sourceIssue || fieldIssue || planIssue()) return { message: sourceIssue || fieldIssue || planIssue() };
    try {
      normalizeRelightSettings({ templateKey, blendMode }); appliedOriginalLights(); normalizedLights();
      relightOutputSize(getSourceImage(), outputResolution, config.sizes || modelConfig().sizes);
      if (!(config.qualityOptions || modelConfig().qualityOptions).includes(quality)) throw new Error("请选择可用的生成质量");
      return null;
    } catch (error) { return { message: error.message }; }
  }

  function renderStatus() {
    const status = by("[data-relight-status]"), availability = by("[data-relight-availability]");
    availability.textContent = config.loading ? "读取中" : promptIdentity() ? `Prompt v${config.prompt.version}` : "Prompt 未配置";
    availability.classList.toggle("ready", available());
    const link = by("[data-relight-prompt-link]"), tableUrl = promptTableUrl();
    link.hidden = !tableUrl;
    if (tableUrl) link.href = tableUrl; else link.removeAttribute("href");
    const refresh = by("[data-relight-prompt-refresh]"), pending = refreshPending || config.loading === true;
    refresh.disabled = pending || !onRefresh; refresh.setAttribute("aria-busy", String(pending));
    by("[data-relight-refresh-label]").textContent = pending ? "刷新中" : "刷新";
    const source = getSourceImage();
    const issue = !available() ? unavailableReason() : source && relightImageIssue(source) || fieldIssue || planIssue() || "";
    status.textContent = issue; status.hidden = !issue; status.classList.toggle("error", Boolean(issue));
  }

  by("[data-relight-prompt-refresh]").addEventListener("click", async () => {
    if (refreshPending || config.loading || !onRefresh) return;
    refreshPending = true; renderStatus();
    try {
      await onRefresh({ forceRefresh: true });
      showToast(promptIdentity() ? `打光Prompt已刷新至v${config.prompt.version}` : unavailableReason());
    } catch (error) {
      config = { ...config, available: false, loading: false, reason: `打光配置刷新失败：${error.message}` };
      onChange(); showToast(config.reason);
    } finally { refreshPending = false; renderStatus(); }
  });

  drawing = bindRelightCanvas({ preview: by(".relight-preview"), toolbar: by(".relight-toolbar"), showToast,
    onChange() {
      if (editingVisible()) manualDraft = drawing.value();
      renderProperties(); renderContext(); renderStatus(); onChange();
    } });
  originalAction.addEventListener("change", () => {
    if (editMode !== "existing" || !ORIGINAL_ACTIONS.some(item => item.key === originalAction.value)) return;
    originalActionKey = originalAction.value;
    const selected = drawing.selected(), selectedAction = selected && actionKey(selected);
    if (ORIGINAL_ACTIONS.some(item => item.key === selectedAction) && selectedAction !== originalActionKey) {
      fieldIssue = ""; drawing.update({ action: originalActionKey });
    } else drawing.setDrawingAction(originalActionKey);
  });
  amount.addEventListener("input", () => drawing.update({ amount: Number(amount.value) / 100 }));
  const selectMode = mode => { drawing.update({ mode }); };
  const modeButtons = [...root.querySelectorAll("[data-relight-mode]")];
  modeButtons.forEach((button, index) => {
    button.addEventListener("click", () => selectMode(button.dataset.relightMode));
    button.addEventListener("keydown", event => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? modeButtons.length - 1 : (index + 1) % modeButtons.length;
      selectMode(modeButtons[next].dataset.relightMode); modeButtons[next].focus();
    });
  });
  root.querySelectorAll("[data-relight-temperature]").forEach(button => button.addEventListener("click", () => {
    fieldIssue = ""; drawing.update({ kelvin: Number(button.dataset.relightTemperature) });
  }));
  const commitKelvin = () => {
    const value = Number(kelvin.value);
    fieldIssue = !kelvin.value || !Number.isInteger(value) || value < RELIGHT_LIMITS.minKelvin || value > RELIGHT_LIMITS.maxKelvin ? "色温需要为2000–10000K的整数" : "";
    if (!fieldIssue && drawing.selected() && drawing.selected().kelvin !== value) { drawing.update({ kelvin: value }); return; }
    renderStatus(); onChange();
  };
  kelvin.addEventListener("input", commitKelvin);
  kelvin.addEventListener("change", commitKelvin);
  intensity.addEventListener("input", () => drawing.update({ intensity: Number(intensity.value) }));
  softness.addEventListener("change", () => {
    if (drawing.selected()?.softness !== softness.value) drawing.update({ softness: softness.value });
  });
  const commitFixture = () => { if (drawing.selected() && drawing.selected().fixture !== fixture.value) drawing.update({ fixture: fixture.value }); };
  ["input", "change", "compositionend"].forEach(name => fixture.addEventListener(name, commitFixture));

  function renderSummary() {
    const source = getSourceImage(), issue = source && relightImageIssue(source);
    const nextSourceKey = source?.id || source?.dataUrl || null;
    if (draftSourceKey !== nextSourceKey) { manualDraft = []; originalLights = { action: "keep" }; restoredTemplateEdits = false; draftSourceKey = nextSourceKey; }
    drawing.setSource(issue ? null : source); onSourceChange(source);
    renderEditing(); renderContext();
    if (source && issue) by("[data-relight-empty]").textContent = issue;
    let size = null;
    if (source && !issue) try { size = relightOutputSize(source, outputResolution, config.sizes || modelConfig().sizes); } catch {}
    if (emptyModel) emptyModel.textContent = "GPT Image 2.5 Sunburst";
    const summary = size ? `输出 ${size.width} × ${size.height}` : `原图比例 · ${outputResolution}输出`;
    if (emptySize) emptySize.textContent = summary;
    if (exactSize) exactSize.textContent = summary;
    renderStatus(); drawing.repaint();
  }

  renderPlan(); renderProperties(); renderStatus(); renderEditing(); renderContext();
  return {
    configure(value) {
      config = value?.loading ? { ...config, ...value } : value || { available: false, reason: "打光模型读取失败" };
      renderPlan(); renderSummary();
    },
    activate: renderSummary, renderSummary, validate,
    currentItem: () => ({ key: RELIGHT_MODEL_KEY, label: "GPT Image 2.5 Sunburst", provider: "oneapi" }),
    inputPolicy: () => ({ ...RELIGHT_IMAGE_POLICY, maxCount: 1 }),
    isAvailable: () => !validate(), availabilityReason: () => validate()?.message || "",
    loadingCopy: () => templateKey === "custom" ? "正在调整原有灯光与自定义光源…" : "正在根据当前场景生成所选光照效果…",
    value: () => ({ lights: drawing.value(), originalLights: appliedOriginalLights(), templateKey, blendMode, outputResolution, quality }),
    restore(value) {
      ({ templateKey, blendMode } = normalizeRelightSettings({ ...value, templateKey: value?.templateKey ?? "custom" }));
      outputResolution = value?.outputResolution ?? "1K"; quality = value?.quality ?? "medium";
      if (!RELIGHT_RESOLUTIONS.includes(outputResolution)) throw new TypeError("历史任务输出档位无效");
      if (typeof quality !== "string" || !quality) throw new TypeError("历史任务生成质量无效");
      renderPlan(); renderSummary();
      const restoredOriginalLights = normalizeRelightOriginalLights(value?.originalLights);
      if (templateKey !== "custom" && restoredOriginalLights) throw new TypeError("整体原灯操作仅用于自定义方案");
      originalLights = restoredOriginalLights || { action: "keep" };
      const lights = normalizeRelightLights(value?.lights || [], { allowEmpty: true });
      restoredTemplateEdits = templateKey !== "custom" && lights.length > 0;
      manualDraft = lights;
      drawing.restore(lights); renderPlan(); renderEditing(); renderContext(); renderSummary();
    },
    jobRequest({ image, jobId }) {
      const issue = validate(); if (issue) throw new Error(issue.message);
      const { dataUrl, name, size, type } = image, frozenPrompt = promptIdentity();
      return { jobId, featureMode: "imageRelight", batchId: null,
        sharedInput: { referenceImages: [{ dataUrl, name, size, type }], lights: normalizedLights(), originalLights: appliedOriginalLights(), templateKey, blendMode,
          outputResolution, quality, modelKey: RELIGHT_MODEL_KEY, ...frozenPrompt },
        items: [{ key: RELIGHT_MODEL_KEY, label: "GPT Image 2.5 Sunburst", provider: "oneapi", input: {} }] };
    },
  };
}

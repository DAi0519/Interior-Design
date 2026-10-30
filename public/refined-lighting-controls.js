/**
 * [INPUT]: 依赖飞书三规则脱敏目录/多光影及预设执行能力/版本化预览、精模Flux独立双图能力及共享参考图上传与图片策略
 * [OUTPUT]: 对外提供共享小勾图卡/单行光影摘要和无计数小勾渲染方式、统一Prompt分流、稳定预览/有限重试、光影×方式投影/轻量草稿、失效身份阻断与上传互斥/单双图准入
 * [POS]: public 的精模光影选择层，卡图由服务端读取、上传图直接参考，无选中高亮框或说明段，不持有Prompt正文或密钥
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { isLightingReference, REFINED_LIGHTING_PRESET_EXECUTIONS, refinedLightingPromptKind, supportsLightingReference } from "./refined-flux-reference.js";
import { bindReferenceUpload } from "./reference-upload.js";

export function usesRefinedLightingReferencePrompt(value) {
  return value?.mode === "reference" || value?.mode === "preset" && value.execution === "prompt-and-reference"
    && (!value.executions || value.executions.every(execution => execution === "prompt-and-reference"));
}

function ruleIdentityFor(config, value) {
  const kind = refinedLightingPromptKind(value);
  const version = kind === "reference" ? config.referenceRuleVersion : kind === "hybrid" ? config.hybridRuleVersion : config.ruleVersion;
  const sha256 = kind === "reference" ? config.referenceRuleSha256 : kind === "hybrid" ? config.hybridRuleSha256 : config.ruleSha256;
  return { ...(version ? { ruleVersion: version } : {}), ...(sha256 ? { ruleSha256: sha256 } : {}) };
}

export function refinedLightingSelections(value, config = {}) {
  if (value?.mode !== "preset") return value && value.mode !== "unselected" ? [{ ...value }] : [];
  const { executions, presets, ...selection } = normalizeRefinedLighting(value);
  return (presets || [{}]).flatMap(identity => (executions || [selection.execution || "prompt-only"]).map(execution => ({
    ...selection, ...identity, execution,
    ...(presets ? { presetName: (config.presets || []).find(item => item.id === identity.presetId)?.name || identity.presetId } : {}),
    ...(executions ? ruleIdentityFor(config, { mode: "preset", execution }) : {}),
  })));
}

export function normalizeRefinedLighting(value = { mode: "unselected" }) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || !["unselected", "original", "preset", "reference"].includes(value.mode)) throw new TypeError("请选择有效的光影来源");
  if (["unselected", "original"].includes(value.mode)) return { mode: "unselected" };
  const result = { mode: value.mode };
  if (value.mode === "preset") {
    if (value.execution === undefined && Object.hasOwn(value, "referenceSha256")) throw new TypeError("旧版光影参考配置已失效，请重新选择预设与渲染方式");
    const execution = value.execution === undefined ? "prompt-only" : value.execution;
    if (!REFINED_LIGHTING_PRESET_EXECUTIONS.includes(execution)) throw new TypeError("请选择有效的预设渲染方式");
    result.execution = execution;
    if (value.executions !== undefined) {
      if (!Array.isArray(value.executions) || value.executions.some(item => !REFINED_LIGHTING_PRESET_EXECUTIONS.includes(item))) {
        throw new TypeError("请选择有效的预设渲染方式");
      }
      const executions = REFINED_LIGHTING_PRESET_EXECUTIONS.filter(item => value.executions.includes(item));
      result.execution = executions.find(item => item !== "prompt-and-reference") || executions[0] || "prompt-only";
      if (executions.length !== 1) result.executions = executions;
    }
  }
  for (const key of value.mode === "preset" ? ["presetId", "version", "sha256", "ruleVersion", "ruleSha256"] : ["ruleVersion", "ruleSha256"]) {
    if (value[key] === undefined) continue;
    if (key === "version" || key === "ruleVersion") {
      if (!Number.isInteger(value[key]) || value[key] < 1) throw new TypeError("光影版本无效，请重新选择");
    } else if (typeof value[key] !== "string" || !value[key].trim()) throw new TypeError("光影身份无效，请重新选择");
    result[key] = value[key];
  }
  if (value.mode === "preset" && value.presets !== undefined) {
    if (!Array.isArray(value.presets) || !value.presets.length) throw new TypeError("请选择至少一种光影预设");
    const identities = new Map();
    for (const identity of value.presets) {
      if (!identity || typeof identity !== "object" || Array.isArray(identity)) throw new TypeError("光影身份无效，请重新选择");
      const { presetId, version, sha256 } = normalizeRefinedLighting({ mode: "preset",
        presetId: identity.presetId, version: identity.version, sha256: identity.sha256 });
      if (!presetId || !version || !sha256) throw new TypeError("光影身份不完整，请重新选择");
      const existing = identities.get(presetId);
      if (existing && (existing.version !== version || existing.sha256 !== sha256)) throw new TypeError("同一光影的版本不一致，请重新选择");
      identities.set(presetId, { presetId, version, sha256 });
    }
    const presets = [...identities.values()];
    Object.assign(result, presets[0]);
    if (presets.length > 1) result.presets = presets;
  }
  return result;
}
export const normalizeRefinedLightingSelection = normalizeRefinedLighting;

function bindPreviewImage(image, onChange) {
  let url = null, retries = 0, failed = false;
  const autoRetryLimit = 1;
  function markFailed(value) {
    image.setAttribute("data-preview-failed", String(value));
    if (failed === value) return;
    failed = value; onChange();
  }
  function request() { image.src = retries ? `${url}&previewRetry=${retries}` : url; }
  image.addEventListener("error", () => {
    if (!url) return;
    if (retries < autoRetryLimit) { retries++; request(); }
    else markFailed(true);
  });
  image.addEventListener("load", () => markFailed(false));
  return {
    failed: () => failed,
    setUrl(next) {
      if (url === next) return;
      url = next; retries = 0; markFailed(false); request();
    },
    retry() { if (failed && url) { retries++; markFailed(false); request(); } },
  };
}

export function refinedLightingValidation(selection, config = {}, models = [], referenceCount = 0) {
  if (!["preset", "reference"].includes(selection?.mode)) return "请选择光影预设或上传氛围参考图";
  if (selection.mode === "preset" && selection.presets) {
    if (!Array.isArray(selection.presets) || !selection.presets.length) return "请选择至少一种光影预设";
    if (config.multiplePresetSelections !== true) return "当前服务不支持多光影对比，请刷新配置";
    const { presets, ...primary } = selection;
    return refinedLightingValidation(primary, config, models, referenceCount)
      || presets.map(identity => refinedLightingValidation({ ...primary, ...identity }, config, models, referenceCount)).find(Boolean) || null;
  }
  if (selection.mode === "preset" && selection.executions) {
    if (!selection.executions.length) return "请选择至少一种渲染方式";
    if (config.multiplePresetExecutions !== true) return "当前服务不支持多模式对比，请刷新配置";
    const { executions, ...primary } = selection;
    const issue = refinedLightingValidation(primary, config, models, referenceCount);
    return issue || refinedLightingSelections(selection, config).map(value =>
      refinedLightingValidation(value, config, models, referenceCount)).find(Boolean) || null;
  }
  const execution = selection.execution === undefined ? "prompt-only" : selection.execution;
  if (selection.mode === "preset" && !REFINED_LIGHTING_PRESET_EXECUTIONS.includes(execution)) return "请选择有效的预设渲染方式";
  const referencePrompt = usesRefinedLightingReferencePrompt(selection);
  const hybridPrompt = selection.mode === "preset" && selection.execution === "prompt-with-reference";
  if (isLightingReference(selection)) {
    const unsupported = models.filter(model => !supportsLightingReference(model));
    if (unsupported.length) return `${unsupported.map(model => model.label || model.key).join("、")}不支持双图光影参考；请选择支持至少2张参考图的模型`;
  }
  if (selection.mode === "reference" && referenceCount !== 1) return "请上传1张氛围参考图；恢复配置后需要重新上传";
  if (hybridPrompt) {
    if (config.hybridAvailable !== true || !config.hybridRuleVersion || !config.hybridRuleSha256) return "氛围词参考前置规则不可用，请刷新飞书配置";
    if (selection.ruleVersion !== config.hybridRuleVersion || selection.ruleSha256 !== config.hybridRuleSha256) return "氛围词参考前置规则已更新，请重新选择预设";
  }
  if (referencePrompt) {
    if (config.referenceAvailable !== true || !config.referenceRuleVersion || !config.referenceRuleSha256) return config.referenceReason || "光影参考规则不可用，请刷新飞书配置";
    if (selection.ruleVersion !== config.referenceRuleVersion || selection.ruleSha256 !== config.referenceRuleSha256) return selection.mode === "reference"
      ? "光影参考规则已更新，请重新上传参考图" : "光影参考规则已更新，请重新选择预设";
  }
  if (selection.mode === "preset") {
    if (!(config.presetExecutions || ["prompt-only"]).includes(execution)) return "当前服务不支持所选渲染方式，请刷新配置或改用仅提示词";
    if (!referencePrompt && !hybridPrompt) {
      if (config.promptAvailable !== true) return config.reason || "光影提示词规则不可用，请刷新飞书配置";
      if (selection.ruleVersion !== config.ruleVersion || selection.ruleSha256 !== config.ruleSha256) return "光影提示词规则已更新，请重新选择预设";
    }
    const preset = (config.presets || []).find(item => item.id === selection.presetId
      && item.version === selection.version && item.sha256 === selection.sha256);
    if (config.available !== true || !preset) return "所选光影预设已更新或下架，请打开光影库重新选择";
  }
  return null;
}

export function bindRefinedLightingControls({ root, onChange = () => {}, storageKey = null,
  getPolicy = () => null, showToast = () => {}, bindUpload = bindReferenceUpload,
  withConfigRefresh = false, allowReferenceUpload = true, presetExecution = null, allowMultiplePresets = false }) {
  root.setAttribute("data-refined-lighting", "");
  let selection = { mode: "unselected" }, config = { loading: true, presets: [] }, models = [], policy, expanded = false;
  if (storageKey) { try { const saved = sessionStorage.getItem(storageKey);
    if (saved) selection = normalizeRefinedLighting(JSON.parse(saved));
  } catch { /* --- 损坏草稿恢复为未选，不自动套用预设 --- */ } }
  if (!allowReferenceUpload && selection.mode === "reference") selection = { mode: "unselected" };
  if (presetExecution && selection.mode === "preset" && (selection.execution !== presetExecution || selection.executions)) selection = { mode: "unselected" };
  root.innerHTML = `
    <section class="refined-lighting-section" data-lighting-reference aria-label="光影参考图">
      <div class="section-heading"><h2>光影参考图 <span class="optional">可选 · 最多1张</span></h2><span data-lighting-count class="micro-status">0 / 1</span></div>
      <div data-lighting-list class="reference-list"></div>
      <div data-lighting-drop class="reference-drop-zone">
        <input data-lighting-input class="reference-input" type="file" accept="image/png,image/jpeg,image/webp" aria-label="添加氛围参考图" />
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" /><path d="M5 14v4.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V14" /></svg>
        <span>添加或拖入光影参考图</span><small data-lighting-upload-hint>PNG / JPEG / WebP</small>
      </div>
    </section>
    <section class="refined-lighting-section" data-lighting-preset-section aria-label="光影选择">
      <div class="section-heading"><h2>光影选择</h2><div class="section-heading-actions">
        <span data-lighting-availability class="micro-status">读取中</span>
        ${withConfigRefresh ? `<button type="button" class="config-refresh-button" data-config-refresh aria-label="刷新光影预设" title="立即读取飞书光影预设"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5" /><path d="M4 17v-5h5" /><path d="M6.1 9A7 7 0 0 1 18 6.5L20 9" /><path d="M17.9 15A7 7 0 0 1 6 17.5L4 15" /></svg><span data-refresh-label>刷新</span></button>` : ""}
      </div></div>
      <button type="button" data-lighting-toggle class="refined-lighting-picker-trigger" aria-expanded="false">
        <img data-lighting-selected-preview alt="" hidden /><span data-lighting-selected-name aria-live="polite">选择光影模板</span>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>
      </button>
      <div data-lighting-grid class="refined-lighting-grid" role="group" aria-label="光影预设" hidden></div>
      <div data-lighting-execution-field class="refined-lighting-execution-field" hidden>
        <h3>渲染方式</h3>
        <div class="refined-lighting-executions" role="group" aria-label="渲染方式">
          <button type="button" class="feature-choice-option refined-lighting-execution-choice" role="radio" data-lighting-execution="prompt-only" aria-checked="true">仅提示词<span class="refined-lighting-execution-check" aria-hidden="true"></span></button>
          <button type="button" class="feature-choice-option refined-lighting-execution-choice" role="radio" data-lighting-execution="prompt-and-reference" aria-checked="false">参考图迁移<span class="refined-lighting-execution-check" aria-hidden="true"></span></button>
          <button type="button" class="feature-choice-option refined-lighting-execution-choice" role="radio" data-lighting-execution="prompt-with-reference" aria-checked="false">氛围词＋参考图<span class="refined-lighting-execution-check" aria-hidden="true"></span></button>
        </div>
      </div>
      <p data-lighting-error class="refined-render-error" role="status" hidden></p>
    </section>`;
  const by = selector => root.querySelector(selector);
  const grid = by("[data-lighting-grid]");
  let renderedPresets = null, cardViews = [];
  const selectedPreview = bindPreviewImage(by("[data-lighting-selected-preview]"), renderSelectedLabel);
  const upload = bindUpload({ count: by("[data-lighting-count]"), dropZone: by("[data-lighting-drop]"),
    isEnabled: () => allowReferenceUpload,
    getLimit: () => 1, getPolicy: () => policy || getPolicy(), getSubject: () => "氛围参考图",
    input: by("[data-lighting-input]"), list: by("[data-lighting-list]"), showToast,
    onChange({ images }) {
      if (!images.length && selection.mode === "preset") return;
      expanded = false;
      update(images.length ? { mode: "reference", ...ruleIdentity({ mode: "reference" }) } : { mode: "unselected" });
    } });
  function ruleIdentity(value) {
    return ruleIdentityFor(config, value);
  }
  function hasPresetRule() { return config.promptAvailable === true
    || config.hybridAvailable === true || config.referenceAvailable === true && (config.presetExecutions || []).includes("prompt-and-reference"); }
  function previewUrl(item) { return `/api/refined-lighting/preview?id=${encodeURIComponent(item.id)}&version=${encodeURIComponent(item.version)}&sha256=${encodeURIComponent(item.sha256)}`; }
  function referenceImages() { return selection.mode === "reference" ? upload.images() : []; }
  function selectedPresets() { return selection.mode === "preset" ? selection.presets || [{ presetId: selection.presetId,
    version: selection.version, sha256: selection.sha256 }] : []; }
  function multiplePresets() { return allowMultiplePresets && config.multiplePresetSelections === true; }
  function currentPreset() { return selection.mode === "preset" && (config.presets || []).find(item => item.id === selection.presetId
    && item.version === selection.version && item.sha256 === selection.sha256); }
  function validation(candidateModels = models) {
    if (selection.presets && !allowMultiplePresets) return "此功能仅支持单个光影预设";
    return refinedLightingValidation(selection, config, candidateModels, referenceImages().length);
  }
  function renderCard({ item, button, name, check, preview }) {
    const selected = selectedPresets().some(identity => identity.presetId === item.id
      && identity.version === item.version && identity.sha256 === item.sha256);
    button.disabled = referenceImages().length > 0 || !hasPresetRule();
    button.setAttribute("aria-pressed", String(selected));
    check.hidden = !selected;
    const error = preview.failed() ? " · 预览失败，点击重试" : "";
    button.title = `${item.name}${error}`;
    name.textContent = `${item.name}${error}`;
  }
  function renderCards() {
    if (renderedPresets !== config.presets) {
      renderedPresets = config.presets;
      cardViews = (config.presets || []).map(item => {
        const button = root.ownerDocument.createElement("button");
        button.type = "button"; button.className = "refined-lighting-card";
        const image = root.ownerDocument.createElement("img");
        image.alt = ""; image.loading = "lazy";
        const name = root.ownerDocument.createElement("span");
        name.className = "refined-lighting-card-label";
        const check = root.ownerDocument.createElement("span");
        check.className = "refined-lighting-check"; check.setAttribute("aria-hidden", "true");
        const preview = bindPreviewImage(image, () => renderCard(view));
        const view = { item, button, name, check, preview };
        preview.setUrl(previewUrl(item));
        button.append(image, name, check);
        button.addEventListener("click", () => {
          if (!expanded || referenceImages().length || !hasPresetRule()) return;
          const live = (config.presets || []).find(entry => entry.id === item.id && entry.version === item.version && entry.sha256 === item.sha256);
          if (!live) return;
          if (preview.failed()) { preview.retry(); return; }
          const selected = selectedPresets().some(identity => identity.presetId === item.id
            && identity.version === item.version && identity.sha256 === item.sha256);
          const execution = presetExecution || (selection.mode === "preset" ? selection.execution : "prompt-only");
          const executions = selection.executions;
          const identity = { presetId: item.id, version: item.version, sha256: item.sha256 };
          const identities = multiplePresets() ? selectedPresets().filter(entry => entry.presetId !== item.id
            && (config.presets || []).some(current => current.id === entry.presetId)) : [];
          if (!multiplePresets() || !selected) identities.push(identity);
          expanded = multiplePresets();
          update(identities.length ? { mode: "preset", ...identities[0],
            ...(identities.length > 1 ? { presets: identities } : {}), execution,
            ...(executions ? { executions } : {}), ...ruleIdentity({ mode: "preset", execution }) } : { mode: "unselected" });
          if (expanded) grid.children[(config.presets || []).findIndex(entry => entry.id === item.id)]?.focus({ preventScroll: true });
          else by("[data-lighting-toggle]").focus({ preventScroll: true });
        });
        return view;
      });
      grid.replaceChildren(...cardViews.map(view => view.button));
    }
    cardViews.forEach(renderCard);
  }
  function renderSelectedLabel() {
    const selected = currentPreset(), identities = selectedPresets();
    const error = selected && selectedPreview.failed() ? " · 预览失败，点击重试" : "";
    const label = identities.length > 1 ? `${identities.length} 种光影` : selected ? selected.name
      : selection.mode === "preset" ? "重新选择光影模板" : "选择光影模板";
    by("[data-lighting-selected-name]").textContent = `${label}${error}`;
    by("[data-lighting-toggle]").title = identities.map(identity => (config.presets || []).find(item => item.id === identity.presetId)?.name || identity.presetId).join("、") + error;
  }
  function render() {
    by("[data-lighting-reference]").hidden = !allowReferenceUpload;
    const presetSelected = selection.mode === "preset";
    const locked = referenceImages().length > 0;
    if (locked) expanded = false;
    by("[data-lighting-input]").disabled = !allowReferenceUpload;
    const toggle = by("[data-lighting-toggle]");
    toggle.disabled = locked;
    toggle.setAttribute("aria-expanded", String(expanded));
    grid.hidden = !expanded;
    const selectedPreset = currentPreset();
    const preview = by("[data-lighting-selected-preview]");
    preview.hidden = !selectedPreset;
    if (selectedPreset) selectedPreview.setUrl(previewUrl(selectedPreset));
    renderSelectedLabel();
    by("[data-lighting-availability]").textContent = config.loading ? "读取中" : `${(config.presets || []).length} 个预设`;
    const executions = config.presetExecutions || ["prompt-only"];
    const checked = selection.executions || [selection.execution];
    const multiple = config.multiplePresetExecutions === true;
    const focusExecution = executions.includes(selection.execution) ? selection.execution : executions[0];
    by("[data-lighting-execution-field]").hidden = Boolean(presetExecution) || !presetSelected
      || !(executions.some(execution => execution !== "prompt-only") || selection.execution !== "prompt-only");
    for (const execution of REFINED_LIGHTING_PRESET_EXECUTIONS) {
      const button = by(`[data-lighting-execution="${execution}"]`);
      button.disabled = !presetSelected || !executions.includes(execution);
      button.setAttribute("role", multiple ? "checkbox" : "radio");
      button.setAttribute("aria-checked", String(presetSelected && checked.includes(execution)));
      button.tabIndex = presetSelected && (multiple || focusExecution === execution) ? 0 : -1;
    }
    const error = validation();
    by("[data-lighting-error]").hidden = !error || selection.mode === "unselected";
    by("[data-lighting-error]").textContent = error || "";
    const activePolicy = policy || getPolicy();
    by("[data-lighting-upload-hint]").textContent = `PNG / JPEG / WebP${activePolicy?.maxBytesPerImage ? ` · 单张${Math.floor(activePolicy.maxBytesPerImage / 1024 / 1024)}MB` : ""}`;
    renderCards();
  }
  function update(value, notify = true) {
    selection = normalizeRefinedLighting(value);
    if (selection.mode !== "reference") upload.clear({ notify: false });
    if (storageKey) { try { sessionStorage.setItem(storageKey, JSON.stringify(selection)); } catch { /* --- 存储不可用时保留当前内存选择 --- */ } }
    render(); if (notify) onChange(selection);
  }
  for (const execution of REFINED_LIGHTING_PRESET_EXECUTIONS) {
    const button = by(`[data-lighting-execution="${execution}"]`);
    button.addEventListener("click", () => {
      if (selection.mode !== "preset" || !(config.presetExecutions || ["prompt-only"]).includes(execution)) return;
      if (config.multiplePresetExecutions === true) {
        const checked = selection.executions || [selection.execution];
        const executions = checked.includes(execution) ? checked.filter(value => value !== execution) : [...checked, execution];
        const next = normalizeRefinedLighting({ ...selection, executions });
        update({ ...next, ...ruleIdentity(next) });
        return;
      }
      update({ ...selection,
        execution, ...ruleIdentity({ mode: "preset", execution }) });
    });
    button.addEventListener("keydown", event => {
      if (!["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown", "Home", "End"].includes(event.key) || button.disabled) return;
      event.preventDefault();
      const available = REFINED_LIGHTING_PRESET_EXECUTIONS.filter(value => (config.presetExecutions || ["prompt-only"]).includes(value));
      if (!available.length) return;
      const direction = ["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 1;
      const next = event.key === "Home" ? available[0] : event.key === "End" ? available.at(-1)
        : available[(available.indexOf(execution) + direction + available.length) % available.length];
      const target = by(`[data-lighting-execution="${next}"]`);
      if (target.disabled) return;
      if (config.multiplePresetExecutions !== true) target.click();
      target.focus({ preventScroll: true });
    });
  }
  by("[data-lighting-toggle]").addEventListener("click", () => {
    if (referenceImages().length) return;
    if (currentPreset() && selectedPreview.failed()) selectedPreview.retry();
    expanded = !expanded; render();
  });
  grid.addEventListener("keydown", event => {
    if (event.key !== "Escape" || !expanded) return;
    event.preventDefault(); expanded = false; render();
    by("[data-lighting-toggle]").focus({ preventScroll: true });
  });
  render();
  return {
    value: () => structuredClone(selection), referenceImages, validation,
    selections: () => refinedLightingSelections(selection, config),
    isAvailable: candidateModels => !validation(candidateModels),
    setValue(value) {
      const legacy = value && !value.mode && ["preset", "time", "weather", "tone"].some(key => Object.hasOwn(value, key));
      expanded = false;
      update(legacy ? { mode: "unselected" } : normalizeRefinedLighting(value ?? { mode: "unselected" }), false);
    },
    setAvailability(value) { config = value || { available: false, referenceAvailable: false, presets: [] }; render(); },
    setModels(value) { models = value || []; render(); },
    setPolicy(value) { policy = value; upload.render(); render(); },
    requestFields: () => ({ refinedLighting: selection.mode === "unselected" ? null : { ...selection },
      ...(selection.mode === "reference" ? { lightingReferenceImages: referenceImages() } : {}) }),
  };
}

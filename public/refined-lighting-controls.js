/**
 * [INPUT]: 依赖飞书双规则脱敏目录/预设执行能力/版本化预览、模型能力及共享参考图上传与图片策略
 * [OUTPUT]: 对外提供统一Prompt分流、栏内折叠三列图卡/缩略图入口、预设两方式切换规则身份、成功上传替换预设并锁模板/删图解锁、轻量恢复与单双图准入
 * [POS]: public 的精模光影选择层，卡图由服务端读取、上传图直接参考，无选中高亮框或说明段，不持有Prompt正文或密钥
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { bindReferenceUpload } from "./reference-upload.js";

export function usesRefinedLightingReferencePrompt(value) {
  return value?.mode === "reference" || value?.mode === "preset" && value.execution === "prompt-and-reference";
}

export function normalizeRefinedLighting(value = { mode: "unselected" }) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || !["unselected", "original", "preset", "reference"].includes(value.mode)) throw new TypeError("请选择有效的光影来源");
  if (["unselected", "original"].includes(value.mode)) return { mode: "unselected" };
  const result = { mode: value.mode };
  if (value.mode === "preset") {
    if (value.execution === undefined && Object.hasOwn(value, "referenceSha256")) throw new TypeError("旧版光影参考配置已失效，请重新选择预设与渲染方式");
    const execution = value.execution === undefined ? "prompt-only" : value.execution;
    if (!["prompt-only", "prompt-and-reference"].includes(execution)) throw new TypeError("请选择有效的预设渲染方式");
    result.execution = execution;
  }
  for (const key of value.mode === "preset" ? ["presetId", "version", "sha256", "ruleVersion", "ruleSha256"] : ["ruleVersion", "ruleSha256"]) {
    if (value[key] === undefined) continue;
    if (key === "version" || key === "ruleVersion") {
      if (!Number.isInteger(value[key]) || value[key] < 1) throw new TypeError("光影版本无效，请重新选择");
    } else if (typeof value[key] !== "string" || !value[key].trim()) throw new TypeError("光影身份无效，请重新选择");
    result[key] = value[key];
  }
  return result;
}
export const normalizeRefinedLightingSelection = normalizeRefinedLighting;

export function refinedLightingValidation(selection, config = {}, models = [], referenceCount = 0) {
  if (!["preset", "reference"].includes(selection?.mode)) return "请选择光影预设或上传氛围参考图";
  const execution = selection.execution === undefined ? "prompt-only" : selection.execution;
  if (selection.mode === "preset" && !["prompt-only", "prompt-and-reference"].includes(execution)) return "请选择有效的预设渲染方式";
  const referencePrompt = usesRefinedLightingReferencePrompt(selection);
  if (referencePrompt) {
    const unsupported = models.filter(model => !(Number(model.maxReferenceImages) >= 2));
    if (unsupported.length) return `${unsupported.map(model => model.label || model.key).join("、")}不支持双图光影参考；请选择支持至少2张参考图的模型`;
  }
  if (selection.mode === "reference" && referenceCount !== 1) return "请上传1张氛围参考图；恢复配置后需要重新上传";
  if (referencePrompt) {
    if (config.referenceAvailable !== true || !config.referenceRuleVersion || !config.referenceRuleSha256) return config.referenceReason || "光影参考规则不可用，请刷新飞书配置";
    if (selection.ruleVersion !== config.referenceRuleVersion || selection.ruleSha256 !== config.referenceRuleSha256) return selection.mode === "reference"
      ? "光影参考规则已更新，请重新上传参考图" : "光影参考规则已更新，请重新选择预设";
  }
  if (selection.mode === "preset") {
    if (!(config.presetExecutions || ["prompt-only"]).includes(execution)) return "当前服务不支持所选渲染方式，请刷新配置或改用仅提示词";
    if (!referencePrompt) {
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
  withConfigRefresh = false }) {
  root.setAttribute("data-refined-lighting", "");
  let selection = { mode: "unselected" }, config = { loading: true, presets: [] }, models = [], policy, expanded = false;
  if (storageKey) { try { const saved = sessionStorage.getItem(storageKey);
    if (saved) selection = normalizeRefinedLighting(JSON.parse(saved));
  } catch { /* --- 损坏草稿恢复为未选，不自动套用预设 --- */ } }
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
        <img data-lighting-selected-preview alt="" hidden /><span data-lighting-selected-name>选择光影模板</span>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>
      </button>
      <div data-lighting-grid class="refined-lighting-grid" role="group" aria-label="光影预设" hidden></div>
      <div data-lighting-execution-field class="refined-lighting-execution-field" hidden>
        <h3>渲染方式</h3>
        <div class="refined-lighting-executions" role="radiogroup" aria-label="渲染方式">
          <button type="button" class="feature-choice-option refined-lighting-execution-choice" role="radio" data-lighting-execution="prompt-only" aria-checked="true">仅提示词</button>
          <button type="button" class="feature-choice-option refined-lighting-execution-choice" role="radio" data-lighting-execution="prompt-and-reference" aria-checked="false">提示词＋参考图</button>
        </div>
      </div>
      <p data-lighting-error class="refined-render-error" role="status" hidden></p>
    </section>`;
  const by = selector => root.querySelector(selector);
  const grid = by("[data-lighting-grid]");
  const upload = bindUpload({ count: by("[data-lighting-count]"), dropZone: by("[data-lighting-drop]"),
    isEnabled: () => true,
    getLimit: () => 1, getPolicy: () => policy || getPolicy(), getSubject: () => "氛围参考图",
    input: by("[data-lighting-input]"), list: by("[data-lighting-list]"), showToast,
    onChange({ images }) {
      if (!images.length && selection.mode === "preset") return;
      expanded = false;
      update(images.length ? { mode: "reference", ...ruleIdentity({ mode: "reference" }) } : { mode: "unselected" });
    } });
  function ruleIdentity(value) {
    const reference = usesRefinedLightingReferencePrompt(value);
    const version = reference ? config.referenceRuleVersion : config.ruleVersion;
    const sha256 = reference ? config.referenceRuleSha256 : config.ruleSha256;
    return { ...(version ? { ruleVersion: version } : {}), ...(sha256 ? { ruleSha256: sha256 } : {}) };
  }
  function hasPresetRule() { return config.promptAvailable === true
    || config.referenceAvailable === true && (config.presetExecutions || []).includes("prompt-and-reference"); }
  function previewUrl(item) { return `/api/refined-lighting/preview?id=${encodeURIComponent(item.id)}&version=${encodeURIComponent(item.version)}&sha256=${encodeURIComponent(item.sha256)}`; }
  function referenceImages() { return selection.mode === "reference" ? upload.images() : []; }
  function validation(candidateModels = models) { return refinedLightingValidation(selection, config, candidateModels, referenceImages().length); }
  function renderCards() {
    grid.replaceChildren(...(config.presets || []).map(item => {
      const button = root.ownerDocument.createElement("button");
      button.type = "button"; button.className = "refined-lighting-card";
      button.disabled = referenceImages().length > 0 || !hasPresetRule();
      const selected = selection.mode === "preset" && selection.presetId === item.id
        && selection.version === item.version && selection.sha256 === item.sha256;
      button.setAttribute("aria-pressed", String(selected)); button.title = item.name;
      const image = root.ownerDocument.createElement("img");
      image.src = previewUrl(item);
      image.alt = ""; image.loading = "lazy";
      const name = root.ownerDocument.createElement("span");
      name.textContent = selected ? `${item.name} · 已选` : item.name;
      button.append(image, name);
      button.addEventListener("click", () => {
        if (!expanded || referenceImages().length || !hasPresetRule()) return;
        const live = (config.presets || []).find(entry => entry.id === item.id && entry.version === item.version && entry.sha256 === item.sha256);
        if (!live) return;
        const execution = selection.mode === "preset" ? selection.execution : "prompt-only";
        expanded = false;
        update({ mode: "preset", presetId: item.id, version: item.version, sha256: item.sha256,
          execution, ...ruleIdentity({ mode: "preset", execution }) });
        by("[data-lighting-toggle]").focus({ preventScroll: true });
      });
      return button;
    }));
  }
  function render() {
    const presetSelected = selection.mode === "preset";
    const locked = referenceImages().length > 0;
    if (locked) expanded = false;
    by("[data-lighting-input]").disabled = false;
    const toggle = by("[data-lighting-toggle]");
    toggle.disabled = locked;
    toggle.setAttribute("aria-expanded", String(expanded));
    grid.hidden = !expanded;
    const selectedPreset = presetSelected && (config.presets || []).find(item => item.id === selection.presetId
      && item.version === selection.version && item.sha256 === selection.sha256);
    const preview = by("[data-lighting-selected-preview]");
    preview.hidden = !selectedPreset;
    if (selectedPreset) preview.src = previewUrl(selectedPreset);
    by("[data-lighting-selected-name]").textContent = selectedPreset ? selectedPreset.name
      : presetSelected ? "重新选择光影模板" : "选择光影模板";
    by("[data-lighting-availability]").textContent = config.loading ? "读取中" : `${(config.presets || []).length} 个预设`;
    const executions = config.presetExecutions || ["prompt-only"];
    const focusExecution = executions.includes(selection.execution) ? selection.execution : executions[0];
    by("[data-lighting-execution-field]").hidden = !presetSelected
      || !(executions.includes("prompt-and-reference") || selection.execution === "prompt-and-reference");
    for (const execution of ["prompt-only", "prompt-and-reference"]) {
      const button = by(`[data-lighting-execution="${execution}"]`);
      button.disabled = !presetSelected || !executions.includes(execution);
      button.setAttribute("aria-checked", String(presetSelected && selection.execution === execution));
      button.tabIndex = presetSelected && focusExecution === execution ? 0 : -1;
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
  for (const execution of ["prompt-only", "prompt-and-reference"]) {
    const button = by(`[data-lighting-execution="${execution}"]`);
    button.addEventListener("click", () => {
      if (selection.mode !== "preset" || !(config.presetExecutions || ["prompt-only"]).includes(execution)) return;
      update({ mode: "preset", presetId: selection.presetId, version: selection.version, sha256: selection.sha256,
        execution, ...ruleIdentity({ mode: "preset", execution }) });
    });
    button.addEventListener("keydown", event => {
      if (!["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown", "Home", "End"].includes(event.key) || button.disabled) return;
      event.preventDefault();
      const next = event.key === "Home" ? "prompt-only" : event.key === "End" ? "prompt-and-reference"
        : execution === "prompt-only" ? "prompt-and-reference" : "prompt-only";
      const target = by(`[data-lighting-execution="${next}"]`);
      if (target.disabled) return;
      target.click(); target.focus({ preventScroll: true });
    });
  }
  by("[data-lighting-toggle]").addEventListener("click", () => {
    if (referenceImages().length) return;
    expanded = !expanded; render();
  });
  grid.addEventListener("keydown", event => {
    if (event.key !== "Escape" || !expanded) return;
    event.preventDefault(); expanded = false; render();
    by("[data-lighting-toggle]").focus({ preventScroll: true });
  });
  render();
  return {
    value: () => ({ ...selection }), referenceImages, validation,
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

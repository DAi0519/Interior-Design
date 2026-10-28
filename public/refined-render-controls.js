/**
 * [INPUT]: 依赖同源精模时段/天气/色调目录、历史模板参数归一化、所选精模版本/旧氛围资产状态与可选 sessionStorage
 * [OUTPUT]: 对外提供来源感知的氛围状态投影、主工作台/Beta三下拉、飞书正文入口、可用性校验与轻量恢复
 * [POS]: public 的精模渲染表现控制器，不接触 Prompt 正文或室内设计风格
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import {
  REFINED_RENDER_TIMES, REFINED_RENDER_WEATHERS,
  REFINED_RENDER_TONES, normalizeRefinedRender, requiresRefinedAtmosphere,
} from "./refined-render-presets.js";

function restoreSelection(value) {
  try { return normalizeRefinedRender(value); }
  catch { return normalizeRefinedRender(); }
}

export function refinedAtmosphereAvailability(promptVersion, legacyAsset) {
  if (promptVersion?.atmosphereSource === "refined-prompt") return {
    source: "refined-prompt",
    available: promptVersion.atmosphereAvailable === true,
    version: promptVersion.version,
    tableUrl: promptVersion.tableUrl,
    reason: promptVersion.reason,
  };
  return { ...legacyAsset, source: "effect-enhancement-prompt" };
}

function promptTableUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ["feishu.cn", "larksuite.com"].some(
      (domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`),
    ) && url.pathname.startsWith("/base/") ? url.href : null;
  } catch { return null; }
}

export function bindRefinedRenderControls({ root, onChange = () => {}, storageKey = null }) {
  let selection = normalizeRefinedRender();
  let asset = { available: false, version: null, loading: true };
  if (storageKey) {
    try { selection = restoreSelection(JSON.parse(sessionStorage.getItem(storageKey))); }
    catch { /* --- 存储不可用时继续使用默认模板 --- */ }
  }
  if (root) {
    const options = (catalog) => catalog.map(({ key, label }) => `<option value="${key}">${label}</option>`).join("");
    root.innerHTML = `
      <div class="section-heading"><h2>渲染氛围</h2></div>
      <div class="refined-render-fields">
          <label class="field"><span>时段</span><select data-refined-time aria-label="精模渲染时段">${options(REFINED_RENDER_TIMES)}</select></label>
          <label class="field"><span>天气</span><select data-refined-weather aria-label="精模渲染天气">${options(REFINED_RENDER_WEATHERS)}</select></label>
          <label class="field"><span>色调</span><select data-refined-tone aria-label="精模渲染色调">${options(REFINED_RENDER_TONES)}</select></label>
      </div>
      <p class="compact-config-note" data-refined-asset></p>
      <p class="compact-config-note" data-refined-source hidden><a data-refined-prompt-link class="refined-prompt-source-link" target="_blank" rel="noopener noreferrer">查看氛围提示词</a></p>
      <p class="refined-render-error" data-refined-error role="status" hidden></p>`;
  }
  const fields = Object.fromEntries(["time", "weather", "tone"].map((key) => [key, root?.querySelector(`[data-refined-${key}]`)]));
  const available = () => asset.available === true && Number.isInteger(asset.version);
  const isAvailable = () => !requiresRefinedAtmosphere(selection) || available();

  function render() {
    for (const [key, field] of Object.entries(fields)) {
      if (!field) continue;
      field.value = selection[key];
      // --- 氛围失效时保留默认项入口，避免历史参数无法归零 ---
      field.disabled = asset.loading === true;
      for (const option of field.options || []) option.disabled = option.value !== "preserve" && !available();
      field.setAttribute("data-refined-value", selection[key]);
    }
    if (!root) return;
    root.querySelector("[data-refined-asset]").textContent = asset.loading ? "正在读取氛围模板…" : available()
      ? asset.source === "refined-prompt"
        ? `精模 Prompt v${asset.version} · 基础/时段/天气/色调统一管理。`
        : `氛围模板 · v${asset.version}；色调仅调整光色与摄影表现。`
      : "氛围配置暂不可用，可将三项设为精模默认；请刷新 Prompt 配置后重试。";
    const source = root.querySelector("[data-refined-source]");
    const link = root.querySelector("[data-refined-prompt-link]");
    const tableUrl = promptTableUrl(asset.tableUrl);
    if (source && link) {
      source.hidden = !tableUrl;
      if (tableUrl) link.href = tableUrl;
      else link.removeAttribute("href");
    }
    const error = root.querySelector("[data-refined-error]");
    error.hidden = asset.loading || isAvailable();
    error.textContent = error.hidden ? "" : "当前氛围配置不可用，请刷新 Prompt 配置或将三项设为精模默认。";
  }

  function update(value, notify = true) {
    selection = normalizeRefinedRender(value);
    if (storageKey) {
      try { sessionStorage.setItem(storageKey, JSON.stringify(selection)); }
      catch { /* --- 不因存储写入失败阻断渲染 --- */ }
    }
    render();
    if (notify) onChange(selection);
  }

  for (const [key, field] of Object.entries(fields)) field?.addEventListener("change", () => {
    update({ ...selection, [key]: field.value, preset: "custom" });
  });
  render();
  return {
    value: () => ({ ...selection }), isAvailable,
    setValue: (value) => update(restoreSelection(value), false),
    setAvailability(config) { asset = config || { available: false, version: null }; render(); },
    atmosphereVersion: () => requiresRefinedAtmosphere(selection) && asset.source !== "refined-prompt"
      ? asset.version : undefined,
  };
}

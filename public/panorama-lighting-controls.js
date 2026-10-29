/**
 * [INPUT]: 依赖飞书光影库脱敏预设/版本化预览、共享光影卡片样式、DOM与可选轻量草稿存储
 * [OUTPUT]: 对外提供共享小勾图卡/单行数量摘要与标题行清空、全景连续多选/取消、稳定预览和键盘焦点、独立草稿/要求、逐卡版本/运行能力准入及单项请求投影
 * [POS]: public 的Main/Beta共用全景光影输入层，与精模光影状态和双图执行方式隔离
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export function normalizePanoramaLighting(value) {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).some(key => !["presetId", "version", "sha256"].includes(key))
    || !/^rec[a-zA-Z0-9]+$/.test(value.presetId || "")
    || !Number.isInteger(value.version) || value.version < 1
    || !/^[a-f0-9]{64}$/i.test(value.sha256 || "")) throw new TypeError("光影模板身份无效，请重新选择");
  return { presetId: value.presetId, version: value.version, sha256: value.sha256.toLowerCase() };
}

export function panoramaLightingValidation(selection, config = {}) {
  if (!selection) return null;
  return (config.presets || []).some(preset => preset.id === selection.presetId
    && preset.version === selection.version && preset.sha256 === selection.sha256)
    ? null : "全景光影模板已更新或下架，请刷新后重新选择";
}

export function bindPanoramaLightingControls({ root, onChange = () => {}, storage = null, storageKey = null,
  reload = null, showToast = () => {} }) {
  let config = { loading: true, presets: [] }, selections = [], capabilities = {}, expanded = false, busy = false;
  let restored = {};
  if (storage && storageKey) { try { restored = JSON.parse(storage.getItem(storageKey) || "{}");
    const values = restored.selections ?? (restored.selection ? [restored.selection] : []);
    selections = [...new Map(values.map(value => { const entry = normalizePanoramaLighting(value);
      return [entry.presetId, entry]; })).values()]; } catch { selections = []; } }
  root.setAttribute("data-panorama-lighting", "");
  root.innerHTML = `<div class="section-heading"><h2>光影选择 <span class="optional">可选</span></h2>
    <div class="section-heading-actions"><span data-panorama-availability class="micro-status" aria-live="polite">读取中</span>
      <button data-panorama-clear class="config-refresh-button panorama-lighting-clear" type="button" hidden>清空</button>
      <button data-panorama-refresh class="config-refresh-button" type="button" aria-label="刷新全景光影库"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5M6.1 9A7 7 0 0 1 18 6.5L20 9M17.9 15A7 7 0 0 1 6 17.5L4 15" /></svg><span data-refresh-label>刷新</span></button>
    </div></div>
    <button data-panorama-toggle class="refined-lighting-picker-trigger" type="button" aria-expanded="false"><img data-panorama-preview alt="" hidden /><span data-panorama-name aria-live="polite">保留原光影</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg></button>
    <div data-panorama-grid class="refined-lighting-grid" role="group" aria-label="全景光影模板" hidden></div>
    <label class="field panorama-lighting-prompt"><span>光影要求 <span class="optional">可选</span></span><textarea data-panorama-prompt maxlength="8000" rows="3" placeholder="例如：改成傍晚暖灯氛围，减弱窗外日光，保留空间与材质颜色。"></textarea></label>
    <p data-panorama-error class="compact-config-note error" role="status" hidden></p>`;
  const dom = root.ownerDocument || document;
  const at = name => root.querySelector(`[data-panorama-${name}]`);
  const toggle = at("toggle"), grid = at("grid"), prompt = at("prompt"), refresh = at("refresh");
  let renderedPresets = null, cardViews = [];
  prompt.value = typeof restored.prompt === "string" ? restored.prompt.slice(0, 8000) : "";
  const persist = () => { if (storage && storageKey) { try {
    storage.setItem(storageKey, JSON.stringify({ selections, prompt: prompt.value }));
  } catch { /* --- 草稿不可写不阻断生成 --- */ } } };
  function changed() { persist(); render(); onChange(); }
  function validation() {
    const stale = selections.map(selection => panoramaLightingValidation(selection, config)).find(Boolean);
    return stale || (selections.length > 1 && capabilities.panoramaEnhancement?.multipleLightingSelections !== true
      ? "当前服务尚未支持多光影对比，请重新启动本机工作台后刷新页面" : null);
  }
  function render() {
    const selectedPresets = selections.map(selection => config.presets.find(entry => entry.id === selection.presetId
      && entry.version === selection.version && entry.sha256 === selection.sha256));
    const preset = selectedPresets.find(Boolean), names = selectedPresets.filter(Boolean).map(entry => entry.name);
    const error = validation();
    at("name").textContent = selections.length > 1 ? `${selections.length} 种光影`
      : preset?.name || (selections.length ? "重新选择光影模板" : prompt.value.trim() ? "自定义光影" : "保留原光影");
    toggle.title = [...names, ...(selectedPresets.some(entry => !entry) ? ["含失效模板，请重新选择"] : [])].join("、");
    at("preview").hidden = !preset?.previewUrl;
    if (preset?.previewUrl) at("preview").src = preset.previewUrl; else at("preview").removeAttribute("src");
    at("availability").textContent = busy ? "刷新中" : config.loading ? "读取中" : `${config.presets.length} 个预设`;
    at("clear").hidden = !selections.length;
    at("clear").disabled = busy;
    at("error").textContent = error || (!config.loading && !config.presets.length ? config.reason || "光影库暂不可用，可填写光影要求" : "");
    at("error").hidden = !at("error").textContent;
    grid.hidden = !expanded;
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.disabled = busy;
    refresh.disabled = busy || !reload;
    const focusedIndex = [...grid.children].indexOf(dom.activeElement);
    if (renderedPresets !== config.presets) {
      renderedPresets = config.presets; cardViews = []; grid.replaceChildren();
      for (const preset of config.presets) {
        const button = dom.createElement("button");
        button.type = "button"; button.disabled = busy; button.className = "refined-lighting-card";
        button.title = preset.description || preset.name;
        const image = dom.createElement("img"); image.src = preset.previewUrl; image.alt = ""; image.loading = "lazy";
        const name = dom.createElement("span"); name.className = "refined-lighting-card-label"; name.textContent = preset.name;
        button.append(image, name);
        const check = dom.createElement("span"); check.className = "refined-lighting-check";
        check.setAttribute("aria-hidden", "true"); button.append(check);
        button.addEventListener("click", () => {
          if (busy) return;
          const index = selections.findIndex(selection => selection.presetId === preset.id);
          if (index >= 0) selections.splice(index, 1);
          else selections.push(normalizePanoramaLighting({ presetId: preset.id, version: preset.version, sha256: preset.sha256 }));
          changed(); grid.children[config.presets.indexOf(preset)]?.focus();
        });
        grid.append(button);
        cardViews.push({ button, check, preset });
      }
    }
    for (const { button, check, preset } of cardViews) {
      const selected = selections.some(selection => selection.presetId === preset.id
        && selection.version === preset.version && selection.sha256 === preset.sha256);
      button.disabled = busy; button.setAttribute("aria-pressed", String(selected)); check.hidden = !selected;
    }
    if (focusedIndex >= 0 && expanded) grid.children[focusedIndex]?.focus();
  }
  toggle.addEventListener("click", () => { expanded = !expanded; render(); });
  grid.addEventListener("keydown", event => {
    const cards = [...grid.querySelectorAll("button")], index = cards.indexOf(dom.activeElement);
    const columns = dom.defaultView?.getComputedStyle(grid).gridTemplateColumns.split(" ").length || 3;
    const offsets = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns };
    if (!(event.key in offsets) && !["Home", "End", "Escape"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Escape") { expanded = false; render(); toggle.focus(); return; }
    const next = event.key === "Home" ? 0 : event.key === "End" ? cards.length - 1
      : Math.max(0, Math.min(cards.length - 1, index + offsets[event.key]));
    cards[next]?.focus();
  });
  at("clear").addEventListener("click", () => { if (busy) return; selections = []; changed(); toggle.focus(); });
  prompt.addEventListener("input", () => { persist(); render(); onChange(); });
  refresh.addEventListener("click", async () => {
    if (!reload || busy) return;
    busy = true; render();
    try { const body = await reload(); config = { ...body.refinedLighting, loading: false, presets: body.refinedLighting?.presets || [] }; onChange(); }
    catch (error) { showToast(`光影库刷新失败：${error.message}`); }
    finally { busy = false; render(); }
  });
  render();
  return {
    configure(value = {}) { config = { ...value, loading: false, presets: value.presets || [] }; render(); },
    setCapabilities(value = {}) { capabilities = value || {}; render(); },
    getSelections() { return selections.map(selection => ({ ...selection,
      presetName: config.presets.find(preset => preset.id === selection.presetId)?.name })); },
    requestFields() { return { panoramaLighting: selections[0] ? { ...selections[0] } : null, prompt: prompt.value.trim() }; },
    requiresOriginalPrompt() { return !selections.length && !prompt.value.trim(); },
    validation,
    setVisible(visible) { root.classList.toggle("hidden", !visible); },
  };
}

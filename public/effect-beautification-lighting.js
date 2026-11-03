/**
 * [INPUT]: 依赖共享折叠光影图卡、飞书卡片脱敏身份与效果图美化运行能力
 * [OUTPUT]: 对外提供美化新增氛围的单卡纯词选择、严格三字段身份和能力/版本准入及跨功能请求隔离
 * [POS]: public 的效果图美化模板适配器，由六氛围组合控制器消费，不读取Prompt、参考原图或精模规则
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { bindRefinedLightingControls } from "./refined-lighting-controls.js";

export function normalizeEffectBeautificationLighting(value) {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).some(key => !["presetId", "version", "sha256"].includes(key))
    || !/^rec[a-zA-Z0-9]+$/.test(value.presetId || "")
    || !Number.isSafeInteger(value.version) || value.version < 1
    || !/^[a-f0-9]{64}$/i.test(value.sha256 || "")) throw new TypeError("美化光影身份无效，请重新选择氛围");
  return { presetId: value.presetId, version: value.version, sha256: value.sha256.toLowerCase() };
}

export function effectBeautificationLightingRequestFields(featureMode, value) {
  return featureMode === "effectBeautification"
    ? { effectBeautificationLighting: normalizeEffectBeautificationLighting(value) } : {};
}

export function bindEffectBeautificationLighting({ root, onChange = () => {}, storageKey = null, reload = null,
  bindControls = bindRefinedLightingControls }) {
  root.setAttribute("data-effect-beautification-lighting", "");
  let library = {}, capabilities = {};
  const controls = bindControls({ root, onChange, optionalPreset: true, optionalPresetLabel: "选择光影模板",
    allowReferenceUpload: false, presetExecution: "prompt-only", allowMultiplePresets: false,
    withConfigRefresh: true, storageKey });
  root.querySelector("[data-lighting-preset-section] h2").textContent = "光影模板";
  function configure() {
    const supported = capabilities.effectBeautification?.promptLighting === true;
    controls.setAvailability({ ...library, available: supported && (library.presets || []).length > 0,
      reason: supported ? library.reason : "当前服务尚未支持美化光影模板，请重新启动工作台后刷新页面",
      presetExecutions: ["prompt-only"], multiplePresetExecutions: false, multiplePresetSelections: false });
  }
  function value() {
    const selection = controls.value();
    if (selection.mode === "unselected") return null;
    return { presetId: selection.presetId, version: selection.version, sha256: selection.sha256 };
  }
  if (reload) {
    const button = root.querySelector("[data-config-refresh]");
    button.addEventListener("click", async () => {
      if (button.disabled) return;
      button.disabled = true; button.setAttribute("aria-busy", "true");
      button.querySelector("[data-refresh-label]").textContent = "刷新中";
      try {
        const result = await reload();
        library = result?.refinedLighting || library;
        configure(); onChange();
      } catch (error) {
        const note = root.querySelector("[data-lighting-error]");
        note.textContent = error.message; note.hidden = false;
      } finally {
        button.disabled = false; button.setAttribute("aria-busy", "false");
        button.querySelector("[data-refresh-label]").textContent = "刷新";
      }
    });
  }
  return {
    value,
    validation() {
      const identity = value();
      if (!identity) return null;
      try { normalizeEffectBeautificationLighting(identity); }
      catch (error) { return error.message; }
      if (capabilities.effectBeautification?.promptLighting !== true) return "当前服务尚未支持美化光影模板，请重新启动工作台后刷新页面";
      if (!(library.presets || []).length) return library.reason || "美化光影库暂不可用，请刷新配置或选择原有氛围";
      return controls.validation();
    },
    requestFields: featureMode => effectBeautificationLightingRequestFields(featureMode, value()),
    setLightingConfig(config) { library = config || {}; configure(); },
    setCapabilities(config) { capabilities = config || {}; configure(); },
    setValue(next) {
      const identity = normalizeEffectBeautificationLighting(next);
      controls.setValue(identity ? { mode: "preset", execution: "prompt-only", ...identity } : { mode: "unselected" });
    },
  };
}

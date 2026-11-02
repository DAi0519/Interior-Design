/**
 * [INPUT]: 依赖共享折叠光影图卡、飞书脱敏卡片身份、白模运行能力和独立sessionStorage草稿
 * [OUTPUT]: 对外提供白模自动/单卡纯词选择、身份归一化、能力/版本准入和按功能隔离的请求字段
 * [POS]: public 的主工作台白模光影适配层，不读取或传输Prompt正文、参考图或精模执行规则
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { bindRefinedLightingControls } from "./refined-lighting-controls.js";

export function normalizeWhiteModelLighting(value) {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).some(key => !["presetId", "version", "sha256"].includes(key))
    || !/^rec[a-zA-Z0-9]+$/.test(value.presetId || "")
    || !Number.isSafeInteger(value.version) || value.version < 1
    || !/^[a-f0-9]{64}$/i.test(value.sha256 || "")) throw new TypeError("白模光影身份无效，请重新选择或设为自动");
  return { presetId: value.presetId, version: value.version, sha256: value.sha256.toLowerCase() };
}

export function whiteModelLightingRequestFields(featureMode, value) {
  return featureMode === "whiteModel" ? { whiteModelLighting: normalizeWhiteModelLighting(value) } : {};
}

export function bindWhiteModelLighting({ root, onChange = () => {}, showToast,
  bindControls = bindRefinedLightingControls }) {
  let library = {}, capabilities = {};
  const controls = bindControls({ root, onChange, showToast, optionalPreset: true,
    allowReferenceUpload: false, presetExecution: "prompt-only", allowMultiplePresets: false,
    withConfigRefresh: true, storageKey: "canvas-lab:white-model:lighting:selection" });
  function configure() {
    const supported = capabilities.whiteModel?.promptLighting === true;
    controls.setAvailability({ ...library, available: supported && (library.presets || []).length > 0,
      reason: supported ? library.reason : "当前服务尚未支持白模光影选择，请重新启动工作台后刷新页面",
      presetExecutions: ["prompt-only"], multiplePresetExecutions: false, multiplePresetSelections: false });
  }
  function value() {
    const selection = controls.value();
    if (selection.mode === "unselected") return null;
    return { presetId: selection.presetId, version: selection.version, sha256: selection.sha256 };
  }
  return {
    value,
    validation() {
      try { normalizeWhiteModelLighting(value()); }
      catch (error) { return error.message; }
      return controls.validation();
    },
    requestFields: featureMode => featureMode === "whiteModel" ? whiteModelLightingRequestFields(featureMode, value()) : {},
    setVisible: visible => root.classList.toggle("hidden", !visible),
    setLightingConfig(config) { library = config || {}; configure(); },
    setCapabilities(config) { capabilities = config || {}; configure(); },
    setValue(next) {
      const identity = normalizeWhiteModelLighting(next);
      controls.setValue(identity ? { mode: "preset", execution: "prompt-only", ...identity } : { mode: "unselected" });
    },
  };
}

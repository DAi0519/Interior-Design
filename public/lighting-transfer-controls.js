/**
 * [INPUT]: 依赖共享光影库图卡控制器、独立光影转换Prompt脱敏身份、公开模型能力及sessionStorage
 * [OUTPUT]: 对外提供bindLightingTransferControls，固定卡片双图迁移、独立补充要求/草稿、版本准入和请求投影
 * [POS]: public 的效果图光影转换组合层，复用图卡交互并与精模选择和Prompt隔离
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { bindRefinedLightingControls } from "./refined-lighting-controls.js";

export function bindLightingTransferControls({ root, onChange = () => {}, getPolicy, showToast,
  storage = sessionStorage, bindControls = bindRefinedLightingControls }) {
  root.innerHTML = `<div data-transfer-library></div>
    <section class="refined-lighting-section lighting-transfer-supplement" aria-label="光影补充要求">
      <div class="section-heading"><h2>补充要求 <span class="optional">可选</span></h2><span data-transfer-count class="character-count">0 / 8000</span></div>
      <textarea data-transfer-prompt maxlength="8000" aria-label="光影转换补充要求" placeholder="例如：保留暖光氛围，适当提亮暗部…"></textarea>
      <div class="section-heading lighting-transfer-version"><h2>迁移提示词</h2><span data-transfer-version class="micro-status" aria-live="polite">读取中</span></div>
    </section>`;
  const textarea = root.querySelector("[data-transfer-prompt]");
  const version = root.querySelector("[data-transfer-version]");
  let library = {}, prompt = {};
  try { textarea.value = String(storage.getItem("canvas-lab:lighting-transfer:prompt") || "").slice(0, 8000); }
  catch { /* --- 存储不可用时使用内存草稿 --- */ }
  const controls = bindControls({ root: root.querySelector("[data-transfer-library]"),
    storageKey: "canvas-lab:lighting-transfer:selection", allowReferenceUpload: false,
    presetExecution: "prompt-and-reference", withConfigRefresh: true, getPolicy, showToast, onChange });
  function configure() {
    controls.setAvailability({ ...library, available: (library.presets || []).length > 0,
      promptAvailable: false, hybridAvailable: false,
      referenceAvailable: prompt.available === true, referenceReason: prompt.reason,
      referenceRuleVersion: prompt.version, referenceRuleSha256: prompt.sha256,
      presetExecutions: ["prompt-and-reference"], multiplePresetExecutions: false });
    version.textContent = prompt.available ? `Prompt v${prompt.version} · 已上架` : "Prompt 未配置";
    version.classList.toggle("ready", prompt.available === true);
    onChange();
  }
  function updateCount() { root.querySelector("[data-transfer-count]").textContent = `${textarea.value.length} / 8000`; }
  updateCount();
  textarea.addEventListener("input", () => {
    updateCount();
    try { storage.setItem("canvas-lab:lighting-transfer:prompt", textarea.value); }
    catch { /* --- 存储不可用时保留当前内存草稿 --- */ }
    onChange();
  });
  return {
    setLightingConfig(config) { library = config || {}; configure(); },
    setPromptConfig(config) { prompt = config || {}; configure(); },
    setModels: controls.setModels,
    setPolicy: controls.setPolicy,
    setVisible: visible => root.classList.toggle("hidden", !visible),
    validation: () => !prompt.available || !prompt.version || !prompt.sha256
      ? prompt.reason || "光影转换 Prompt 不可用，请刷新飞书配置"
      : controls.requestFields().refinedLighting?.mode !== "preset" ? "请选择一个光影模板" : controls.validation(),
    promptValue: () => textarea.value.trim(),
    requestFields: controls.requestFields,
  };
}

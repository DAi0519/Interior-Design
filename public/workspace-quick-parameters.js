/**
 * [INPUT]: 依赖原专用工作区表单、功能导航当前态、共享下拉组件与光影区定位控制器
 * [OUTPUT]: 将常用设置投影为带来源字段的就地选择器，原表单继续负责校验和执行
 * [POS]: public 的原生及同源嵌入工作区参数快捷条
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { bindChoiceSelect } from "./choice-select.js?v=2";
import { toggleAvailableModels, toggleModelSelection } from "./model-multi-select.js";
import { bindParameterPopover } from "./parameter-popover.js";

const parametersByMode = {
  aiRenderStudio: ["#aiRenderStudioSettingsMount", [
    ["#studioRenderStyle", "渲染风格"], ["#studioLightingPresets", "光影", { lighting: true }],
  ]],
  housePlanLayout: ["#housePlanSettingsMount", [
    ["#model", "生图模型"],
  ]],
  floorPlanCamera: ["#floorPlanCameraSettingsMount", [
    ["#camera-generationMode", "生成模式"], ["#camera-model", "生图模型", { picker: true }],
    ["#camera-aspectRatio", "画幅"], ["#camera-resolution", "分辨率"], ["#camera-imageCount", "出图张数"],
  ]],
  sceneCast: ["#sceneCastSettingsMount", [
    ["#castPeopleCount", "人物数量", { suffix: " 人" }], ["#castPetCount", "宠物数量", { suffix: " 只" }],
    ["#castModel", "合成模型"], ["#castRatio", "画幅"], ["#castResolution", "分辨率"],
  ]],
  imageOutpaint: ["#imageOutpaintSection", [
    [".image-outpaint-engines", "扩图引擎"], ["#imageOutpaintModelSelect", "扩图模型"],
    [".image-outpaint-ratios", "画幅"],
  ]],
  imageMultiAngle: ["#imageMultiAngleSection", [
    ["[data-angle-models]", "生成模型"], [".cs-presets", "方位"], [".cs-framing", "景别"],
  ]],
  imageMaskFill: ["#imageMaskFillSection", [
    ["[data-mask-model]", "编辑模型"], [".mask-fill-modes", "编辑方式"],
    ["[data-mask-output]", "输出档位"], ["[data-mask-quality]", "质量"],
  ]],
  imageRelight: ["#imageRelightSection", [
    ["[data-relight-model]", "生成模型"], [".relight-template-grid", "光照模板"],
  ]],
  styleDna: ["#styleDnaControls", [
    ["#styleDnaModelSelect", "反推模型"],
  ]],
};

function optionLabel(node) {
  return (node.tagName === "OPTION" ? node.label
    : node.querySelector(".model-picker-option-label")?.textContent ||
      node.getAttribute("aria-label") || node.textContent).trim();
}

function isSelected(node) {
  return node.tagName === "OPTION" ? node.selected
    : ["aria-checked", "aria-pressed", "aria-selected"].some(name => node.getAttribute(name) === "true");
}

export function bindWorkspaceQuickChoice(container, source, label, { suffix = "", picker = false } = {}) {
  const doc = source.ownerDocument;
  const win = doc.defaultView;
  const trigger = picker ? source.querySelector(".model-picker-trigger") : null;
  const originalMenu = trigger ? doc.getElementById(trigger.getAttribute("aria-controls")) : null;
  if (picker && !originalMenu) return null;
  const list = originalMenu || source;
  const isSelect = source.tagName === "SELECT";
  const multiple = Boolean(trigger?.querySelector(".model-picker-extra"));
  const options = () => isSelect ? [...source.options].filter(option => !option.hidden)
    : [...list.querySelectorAll(originalMenu ? ".model-picker-option" : "button")];
  const choice = bindChoiceSelect({
    container, label, placeholder: label, searchable: multiple || source.dataset.searchable === "true", multiple,
    presentOption: row => ({ label: row.label, selectable: !row.disabled }),
    toggleSelection: toggleModelSelection,
    toggleAll: toggleAvailableModels,
    onChange(keys) {
      const rows = options();
      if (isSelect) {
        const option = rows[Number(keys[0])];
        if (!option || source.disabled || option.disabled) return;
        source.value = option.value;
        source.dispatchEvent(new win.Event("change", { bubbles: true }));
      } else if (multiple) {
        const add = rows.filter((row, index) => keys.includes(String(index)) && !isSelected(row));
        const remove = rows.filter((row, index) => !keys.includes(String(index)) && isSelected(row));
        for (const row of [...add, ...remove]) row.click();
      } else rows[Number(keys[0])]?.click();
      sync();
    },
  });
  if (multiple) container.classList.add("workspace-quick-multiple");

  function sync() {
    const rows = options();
    const entries = rows.map((node, index) => ({
      key: String(index),
      label: `${optionLabel(node)}${suffix}`,
      disabled: node.disabled || node.parentElement?.disabled,
    }));
    container.hidden = Boolean(source.closest("[hidden], .hidden"));
    choice.setDisabled(container.hidden || Boolean(source.disabled || trigger?.disabled));
    choice.render(entries, entries.filter(({ key }) => isSelected(rows[Number(key)])).map(({ key }) => key));
  }

  const observer = new win.MutationObserver(sync);
  const changeOptions = { subtree: true, childList: true, characterData: true, attributes: true,
    attributeFilter: ["aria-checked", "aria-pressed", "aria-selected", "disabled", "hidden", "selected"] };
  observer.observe(list, changeOptions);
  if (trigger) observer.observe(trigger, { attributes: true, attributeFilter: ["disabled"] });
  for (let node = source.parentElement; node && node !== doc.body; node = node.parentElement) {
    observer.observe(node, { attributes: true, attributeFilter: ["hidden", "class"] });
  }
  source.addEventListener("change", sync);
  sync();
  return () => { observer.disconnect(); source.removeEventListener("change", sync); choice.destroy(); };
}

function bindWorkspaceLighting(container, section, label) {
  const doc = section.ownerDocument;
  const anchor = doc.createComment("画布光影快捷参数原位置");
  const trigger = doc.createElement("button");
  trigger.className = "workspace-quick-trigger";
  trigger.type = "button";
  trigger.innerHTML = `<span></span><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 8 4 4 4-4"/></svg>`;
  section.before(anchor);
  container.append(trigger, section);
  const optionSelector = ".refined-lighting-card, [data-lighting-automatic]";
  const popover = bindParameterPopover({
    trigger, content: section, closeOnClick: target => Boolean(target.closest(optionSelector)),
    onOpen() {
      const toggle = section.querySelector('[data-lighting-toggle][aria-expanded="false"]');
      if (toggle && !toggle.disabled) toggle.click();
    },
  });
  function sync() {
    const value = section.querySelector("[data-lighting-selected-name]")?.textContent.trim() || label;
    trigger.firstElementChild.textContent = value;
    trigger.setAttribute("aria-label", value === label ? label : `${label}：${value}`);
    trigger.disabled = section.inert;
  }
  const observer = new doc.defaultView.MutationObserver(sync);
  observer.observe(section, { childList: true, subtree: true, attributes: true, attributeFilter: ["inert"] });
  sync();
  return () => {
    observer.disconnect();
    popover.destroy();
    anchor.replaceWith(section);
  };
}

function createStrip(doc, host, settings, fields, { prepend = true } = {}) {
  const strip = doc.createElement("div");
  strip.className = "workspace-quick-parameters";
  strip.setAttribute("role", "group");
  strip.setAttribute("aria-label", "常用参数");
  const cleanup = [];
  for (const [selector, label, config] of fields) {
    const control = settings.querySelector(selector);
    if (!control) continue;
    const container = doc.createElement("div");
    if (control.id) container.dataset.sourceField = control.id;
    strip.append(container);
    const destroy = config?.lighting ? bindWorkspaceLighting(container, control, label)
      : bindWorkspaceQuickChoice(container, control, label, config);
    if (destroy) cleanup.push(destroy);
    else container.remove();
  }
  if (cleanup.length) {
    if (prepend) host.prepend(strip);
    else host.append(strip);
  }
  return () => { cleanup.forEach(destroy => destroy()); strip.remove(); };
}

export function bindEmbeddedWorkspaceQuickParameters({ mode, quickHost, settings }) {
  const config = parametersByMode[mode];
  if (!config || !quickHost || !settings) return () => {};
  const doc = settings.ownerDocument;
  const [selector, fields] = config;
  let settingsContent;
  let currentStrip;
  function sync() {
    const source = settings.matches(selector) ? settings : settings.querySelector(selector);
    const content = source?.firstElementChild;
    if (content === settingsContent) return;
    currentStrip?.();
    settingsContent = content;
    currentStrip = content ? createStrip(doc, quickHost, source, fields) : null;
  }
  const observer = new doc.defaultView.MutationObserver(sync);
  observer.observe(settings, { childList: true, subtree: true });
  sync();
  return () => { observer.disconnect(); currentStrip?.(); };
}

export function bindWorkspaceQuickParameters(doc = document) {
  const workspace = doc.querySelector(".workspace");
  const panel = doc.getElementById("configurationPanel");
  const directory = doc.getElementById("featureModeList");
  if (!workspace || !panel || !directory) {
    const toolbar = doc.querySelector(".floor-plan-toolbar");
    return toolbar ? createStrip(doc, toolbar, doc.body, [["#floorPlanModel", "生成模型"]], { prepend: false }) : undefined;
  }
  let active;
  let activeSettings;
  let currentStrip;
  const dockMounts = new WeakSet();
  const observer = new doc.defaultView.MutationObserver(sync);
  function sync() {
    for (const dock of panel.querySelectorAll(".isolated-workspace-settings")) {
      if (dockMounts.has(dock)) continue;
      dockMounts.add(dock);
      observer.observe(dock, { childList: true });
    }
    const mode = directory.querySelector('[data-feature-mode][aria-checked="true"]')?.dataset.featureMode;
    const config = parametersByMode[mode];
    const settings = config && doc.querySelector(config[0]);
    const content = settings?.firstElementChild;
    const host = settings?.classList.contains("isolated-workspace-settings")
      ? workspace.querySelector(".ai-render-studio-host")
      : mode === "styleDna" ? doc.querySelector(".style-dna-composer") : workspace.querySelector(".result-panel");
    if (mode === active && content === activeSettings) return;
    currentStrip?.();
    currentStrip = null;
    active = mode;
    activeSettings = content;
    if (content && host) currentStrip = createStrip(doc, host, settings, config[1]);
  }
  observer.observe(directory, { subtree: true, attributes: true, attributeFilter: ["aria-checked"] });
  observer.observe(panel, { childList: true });
  sync();
  return () => { observer.disconnect(); currentStrip?.(); };
}

if (typeof document !== "undefined") bindWorkspaceQuickParameters();

/**
 * [INPUT]: 依赖工作台原参数、画布工具参数、共用选择器及右侧工作区
 * [OUTPUT]: 底栏快捷项和规格摘要、共用弹窗的出图规格分组、参数和附件原节点挂接及关闭归位
 * [POS]: public 的首页生图参数宿主，复用各功能控制器和表单
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { bindParameterPopover } from "./parameter-popover.js";
import { restoreWorkspacePopoverFields } from "./workspace-quick-parameters.js?v=6";
import { hasOutputChoice } from "./home-image-chat-toolbar.js?v=3";

const designPrompt = "#promptInput";
const style = "#whiteModelRenderModeList";
const room = { prompt: designPrompt, quick: [
  ["#emptyRoomTypeSection", "房型", { single: "[data-room-type]:not([data-room-type='其他'])" }],
  ["#emptyRoomFurnitureSection", "家具"],
  [style],
] };
const tools = {
  free: {},
  emptyRoom: room,
  roomRenovation: room,
  styleTransfer: { prompt: designPrompt, quick: [[style], ["#styleReferenceSection", "风格参考图"]] },
  whiteModel: { prompt: designPrompt, quick: [[style], ["#whiteModelLightingSection", "光影", { expand: true }]] },
  refinedModel: { prompt: "#refinedPromptInput", quick: [["#refinedRenderSection", "光影与参考图", { expand: true }]] },
  effectBeautification: { quick: [["#effectBeautificationSection", "美化方案", { expand: true }]] },
  effectEnhancement: { quick: [["#effectTimeSelect", null, { field: true }], ["#effectWeatherSelect", null, { field: true }]] },
  panoramaEnhancement: { prompt: "[data-panorama-prompt]", quick: [["#panoramaLightingSection", "光影", { expand: true }]] },
  textureEnhancement: {},
  lightingTransfer: { prompt: "[data-transfer-prompt]", quick: [["#lightingTransferSection", "光影与参考图", { expand: true }]] },
  imageUpscale: { quick: [["#imageUpscaleWorkflowList", "超分工作流", { single: "[role='radio']", hideFixed: true }]] },
};
const workspaceSpecifications = {
  floorPlanCamera: ["camera-aspectRatio", "camera-resolution", "camera-imageCount"],
  sceneCast: ["castRatio", "castResolution"],
};
const imageSpecifications = ["ratioSelect", "resolutionSelect", "generationCountSelect"];

function parameterLabel(section, fallback) {
  if (section?.id === "emptyRoomFurnitureSection") {
    const total = section.querySelectorAll('button[aria-checked="true"]').length;
    return total ? `${total} 项家具` : fallback;
  }
  if (section?.id === "emptyRoomTypeSection") {
    return section.querySelector('button[aria-checked="true"]')?.textContent.trim() || fallback;
  }
  const current = section?.querySelector("[data-lighting-selected-name], [data-panorama-name], [data-lighting-toggle] span");
  const selected = current || section?.querySelector("[role='radio'][aria-checked='true']");
  if (selected?.textContent.trim()) return selected.textContent.trim();
  return fallback;
}

export function bindHomeChatParameters(root) {
  const doc = root.ownerDocument;
  const view = doc.defaultView;
  const pane = root.parentElement;
  const scroll = doc.querySelector("#configurationPanel .control-panel-scroll");
  const position = doc.createComment("首页参数挂载点");
  scroll.before(position);
  const dialog = root.querySelector("#homeImageChatParameterDialog");
  const host = root.querySelector(".home-image-chat-feature-parameters");
  const parking = root.querySelector(".home-image-chat-parameter-source");
  const toolSettings = root.querySelector(".home-image-chat-tool-settings");
  const shortcuts = root.querySelector(".home-image-chat-inline-parameters");
  const settings = root.querySelector(".home-image-chat-settings");
  const quickHost = root.querySelector(".home-image-chat-tool-quick");
  const promptHost = root.querySelector(".home-image-chat-feature-prompt");
  const allSettings = root.querySelector(".home-image-chat-parameter-trigger.home-image-chat-advanced-trigger");
  const allToolSettings = root.querySelector(".home-image-chat-tool-parameter-trigger");
  const sizeTrigger = root.querySelector(".home-image-chat-size-trigger");
  const sizeOptions = root.querySelector(".home-image-chat-size-options");
  const title = dialog.querySelector("h2");
  let originalPrompt;
  let feature;
  let shortcutButtons = [];
  let directFields = [];
  let backdropPress = false;
  let advanced;
  const primaryRegions = [doc.querySelector("#referenceInput").closest("section"), doc.querySelector("#promptSection")];

  function positionAdvanced() {
    if (!advanced) return;
    const rect = pane.getBoundingClientRect();
    const viewport = view.visualViewport;
    const x = viewport?.offsetLeft ?? 0;
    const y = viewport?.offsetTop ?? 0;
    const left = Math.max(rect.left, x);
    const top = Math.max(rect.top, y);
    const right = Math.min(rect.right, x + (viewport?.width ?? view.innerWidth));
    const bottom = Math.min(rect.bottom, y + (viewport?.height ?? view.innerHeight));
    dialog.style.setProperty("--home-chat-parameter-inset", `${top}px ${view.innerWidth - right}px ${view.innerHeight - bottom}px ${left}px`);
    dialog.style.setProperty("--home-chat-parameter-pane-width", `${right - left}px`);
    dialog.style.setProperty("--home-chat-parameter-pane-height", `${bottom - top}px`);
  }
  const paneObserver = new view.ResizeObserver(positionAdvanced);

  function advancedContent() {
    if (!feature) return null;
    if (!root.dataset.tool) return tools[feature] ? scroll : null;
    return !toolSettings.hidden && [...toolSettings.children].some(child => child.childElementCount || child.matches("section"))
      ? toolSettings : null;
  }

  function outputSelects() {
    const ids = root.dataset.tool ? workspaceSpecifications[feature] || [] : imageSpecifications;
    return ids.map(id => root.querySelector(`#${id}`)).filter(Boolean);
  }

  function specificationSelects() {
    return outputSelects().filter(select => {
      const adjustable = hasOutputChoice(select);
      select.closest("label")?.toggleAttribute("data-parameter-fixed", !adjustable);
      return adjustable && !select.disabled && !select.closest("[hidden], .hidden");
    });
  }

  function moveToDialog(field, place) {
    const marker = doc.createComment("参数原位置");
    const overflow = field.hasAttribute("data-toolbar-overflow");
    field.before(marker);
    field.removeAttribute("data-toolbar-overflow");
    place(field);
    return () => {
      field.toggleAttribute("data-toolbar-overflow", overflow);
      marker.replaceWith(field);
    };
  }

  function placeSpecifications(content) {
    const restore = [];
    const currentFields = content === toolSettings && feature !== "floorPlanCamera" ? [] : outputSelects()
      .map(select => select.closest("label")).filter(Boolean);
    const freeModel = feature === "free" && settings.querySelector(".home-image-chat-free-model");
    if (freeModel && !freeModel.querySelector("select")?.hidden) {
      restore.push(moveToDialog(freeModel, field => sizeOptions.prepend(field)));
    }
    for (const field of currentFields) {
      if (field.parentElement !== sizeOptions) restore.push(moveToDialog(field, node => sizeOptions.append(node)));
    }
    if (sizeOptions.querySelector("label")) host.append(sizeOptions);
    return restore;
  }

  function restoreAdvanced() {
    if (!advanced) return;
    const { content, opener, fields } = advanced;
    advanced = null;
    backdropPress = false;
    paneObserver.disconnect();
    view.removeEventListener("resize", positionAdvanced);
    view.visualViewport?.removeEventListener("resize", positionAdvanced);
    view.visualViewport?.removeEventListener("scroll", positionAdvanced);
    for (const restore of fields) restore();
    parking.append(sizeOptions, content);
    opener.setAttribute("aria-expanded", "false");
    if (opener.getClientRects().length) opener.focus({ preventScroll: true });
  }

  function closeAdvanced() {
    if (dialog.open) dialog.close();
    restoreAdvanced();
  }

  function updateShortcuts() {
    for (const { button, section, fallback, hideFixed } of shortcutButtons) {
      const label = parameterLabel(section, fallback);
      if (button.firstElementChild.textContent !== label) button.firstElementChild.textContent = label;
      button.setAttribute("aria-label", label === fallback ? fallback : `${fallback}：${label}`);
      const fixed = hideFixed && section.querySelector(':scope > [role="radio"][aria-checked="true"]')
        && !section.querySelector(':scope > [role="radio"]:not(:disabled, [hidden], .hidden, [aria-disabled="true"], [aria-checked="true"])');
      button.hidden = section.classList.contains("hidden") || section.hidden || Boolean(fixed);
    }
  }
  const observer = new MutationObserver(updateShortcuts);

  function restorePrompt() {
    if (!originalPrompt) return;
    const { field, marker, hiddenRegion, label } = originalPrompt;
    field.classList.remove("home-image-chat-input");
    field.style.removeProperty("height");
    if (label === null) field.removeAttribute("aria-label");
    else field.setAttribute("aria-label", label);
    hiddenRegion?.removeAttribute("data-home-chat-moved");
    marker.replaceWith(field);
    originalPrompt = null;
  }

  function mountPrompt(selector) {
    const field = selector && doc.querySelector(selector);
    if (!field) return;
    const marker = doc.createComment("首页提示词挂载点");
    const hiddenRegion = field.closest("label") || field.closest("#promptSection");
    const label = field.getAttribute("aria-label");
    field.before(marker);
    hiddenRegion?.setAttribute("data-home-chat-moved", "");
    originalPrompt = { field, marker, hiddenRegion, label };
    field.setAttribute("aria-label", label || "补充要求");
    field.classList.add("home-image-chat-input");
    promptHost.append(field);
  }

  function showAdvanced(opener) {
    const content = advancedContent();
    if (!content || opener.hidden || dialog.open || content.hidden) return;
    restoreAdvanced();
    const fields = placeSpecifications(content);
    for (const { popover } of shortcutButtons) fields.push(popover.showInline());
    for (const { field, marker } of directFields) {
      fields.push(moveToDialog(field, node => marker.after(node)));
    }
    if (content === toolSettings) {
      fields.push(restoreWorkspacePopoverFields(quickHost));
      const maskReference = root.querySelector(".home-image-chat-tools > [data-mask-reference-section]");
      const maskPurpose = toolSettings.querySelector("[data-mask-reference-purpose-section]");
      if (maskReference && maskPurpose) {
        const list = root.querySelector(".home-image-chat-attachment-images > [data-mask-reference-list]");
        if (list) fields.push(moveToDialog(list, node => maskReference.append(node)));
        fields.push(moveToDialog(maskReference, node => maskPurpose.after(node)));
      }
    }
    host.append(content);
    advanced = { content, opener, fields };
    positionAdvanced();
    dialog.showModal();
    opener.setAttribute("aria-expanded", "true");
    host.scrollTop = 0;
    paneObserver.observe(pane);
    view.addEventListener("resize", positionAdvanced);
    view.visualViewport?.addEventListener("resize", positionAdvanced);
    view.visualViewport?.addEventListener("scroll", positionAdvanced);
  }

  function openAdvanced(event) {
    showAdvanced(event.currentTarget);
  }

  function moveField(field, destination, before = null) {
    const marker = doc.createComment("快捷参数原位置");
    field.before(marker);
    field.classList.add("home-image-chat-quick-field");
    destination.insertBefore(field, before);
    directFields.push({ field, marker });
  }

  function addQuickField(selector, label, { field, single, expand, hideFixed } = {}) {
    const section = doc.querySelector(selector);
    if (!section) return;
    if (!label) {
      moveField(field ? section.closest("label") : section, shortcuts);
      return;
    }
    const button = doc.createElement("button");
    button.className = "home-image-chat-parameter-trigger";
    button.type = "button";
    button.append(doc.createElement("span"), sizeTrigger.querySelector("svg").cloneNode(true));
    button.dataset.homeSettingsSection = section.id;
    shortcuts.append(button);
    const popover = bindParameterPopover({
      trigger: button,
      content: section,
      beforeOpen() {
        if (!dialog.open && scroll.parentElement !== parking) parking.append(scroll);
      },
      closeOnClick: target => Boolean(single && target.closest(single)),
      onOpen() {
        if (expand) {
          for (const toggle of section.querySelectorAll('[data-lighting-toggle][aria-expanded="false"], [data-panorama-toggle][aria-expanded="false"]')) {
            if (!toggle.disabled) toggle.click();
          }
        }
      },
    });
    shortcutButtons.push({ button, section, fallback: label, popover, hideFixed });
  }
  allSettings.addEventListener("click", openAdvanced);
  allToolSettings.addEventListener("click", openAdvanced);
  sizeTrigger.addEventListener("click", openAdvanced);
  dialog.querySelector(".home-image-chat-parameter-close").addEventListener("click", closeAdvanced);
  function onBackdrop(event) {
    if (event.target !== dialog) return false;
    const bounds = dialog.getBoundingClientRect();
    return event.clientX < bounds.left || event.clientX > bounds.right ||
      event.clientY < bounds.top || event.clientY > bounds.bottom;
  }
  dialog.addEventListener("pointerdown", event => { backdropPress = onBackdrop(event); });
  dialog.addEventListener("pointercancel", () => { backdropPress = false; });
  dialog.addEventListener("click", event => {
    if (backdropPress && onBackdrop(event)) closeAdvanced();
    backdropPress = false;
  });
  dialog.addEventListener("close", () => {
    if (dialog.open) return;
    restoreAdvanced();
  });

  return {
    closeAdvanced,
    hasAdvanced: () => Boolean(advancedContent()),
    specificationSelects,
    textField: () => originalPrompt?.field,
    reveal(sectionId) {
      const entry = shortcutButtons.find(({ section }) => section.id === sectionId);
      if (!entry) return;
      if (entry.button.getClientRects().length) {
        entry.popover.open({ focus: false });
        return;
      }
      const opener = [sizeTrigger, allSettings, allToolSettings].find(button => button.getClientRects().length);
      if (!opener) return;
      showAdvanced(opener);
      entry.section.scrollIntoView({ block: "nearest" });
    },
    setFeature(mode, name) {
      if (feature === mode) return;
      closeAdvanced();
      feature = mode;
      restorePrompt();
      const config = tools[mode];
      observer.disconnect();
      for (const { button, popover } of shortcutButtons) { popover.destroy(); button.remove(); }
      shortcutButtons = [];
      for (const { field, marker } of directFields) {
        field.classList.remove("home-image-chat-quick-field");
        marker.replaceWith(field);
      }
      directFields = [];
      title.textContent = name || "自由生图";
      for (const region of primaryRegions) region.toggleAttribute("data-home-chat-primary-only", Boolean(config));
      doc.getElementById("modelSection").toggleAttribute("data-home-chat-primary-only", mode === "free");
      if (!config) {
        position.after(scroll);
        return;
      }
      parking.append(scroll);
      scroll.inert = false;
      mountPrompt(config.prompt);
      for (const [selector, label, options] of config.quick || []) addQuickField(selector, label, options);
      if (mode !== "free" && mode !== "imageUpscale") moveField(doc.querySelector("#modelSelect"), settings, settings.querySelector(".field"));
      updateShortcuts();
      observer.observe(scroll, { subtree: true, characterData: true, childList: true,
        attributes: true, attributeFilter: ["aria-checked", "aria-disabled", "class", "disabled", "hidden"] });
    },
  };
}

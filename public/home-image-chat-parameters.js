/**
 * [INPUT]: 依赖工作台原参数、共用选择器、按钮定位下拉及首页高级参数弹层
 * [OUTPUT]: 将功能常用项挂到底栏并就近展开，顶部入口打开完整参数，复用原控件和事件
 * [POS]: public 的首页生图参数宿主，复用各功能控制器和表单
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { bindParameterPopover } from "./parameter-popover.js";

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
  imageUpscale: { quick: [["#imageUpscaleWorkflowList", "超分工作流", { single: "[role='radio']" }]] },
};

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
  const scroll = doc.querySelector("#configurationPanel .control-panel-scroll");
  const position = doc.createComment("首页参数挂载点");
  scroll.before(position);
  const dialog = root.querySelector("#homeImageChatParameterDialog");
  const host = root.querySelector(".home-image-chat-feature-parameters");
  const parking = root.querySelector(".home-image-chat-parameter-source");
  const shortcuts = root.querySelector(".home-image-chat-inline-parameters");
  const settings = root.querySelector(".home-image-chat-settings");
  const promptHost = root.querySelector(".home-image-chat-feature-prompt");
  const featurePicker = root.querySelector(".home-image-chat-feature-picker");
  const allSettings = root.querySelector(".home-image-chat-feature-row .home-image-chat-parameter-trigger");
  const title = dialog.querySelector("h2");
  let originalPrompt;
  let feature;
  let shortcutButtons = [];
  let directFields = [];
  let backdropPress = false;
  const primaryRegions = [doc.querySelector("#referenceInput").closest("section"), doc.querySelector("#promptSection")];

  function updateShortcuts() {
    for (const { button, section, fallback } of shortcutButtons) {
      const label = parameterLabel(section, fallback);
      if (button.firstElementChild.textContent !== label) button.firstElementChild.textContent = label;
      button.setAttribute("aria-label", label === fallback ? fallback : `${fallback}：${label}`);
      button.hidden = section.classList.contains("hidden") || section.hidden;
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

  function openAdvanced() {
    if (!feature || dialog.open) return;
    for (const { popover } of shortcutButtons) popover.close();
    host.append(scroll);
    dialog.showModal();
    host.scrollTop = 0;
  }

  function moveField(field, destination, before = null) {
    const marker = doc.createComment("快捷参数原位置");
    field.before(marker);
    field.classList.add("home-image-chat-quick-field");
    destination.insertBefore(field, before);
    directFields.push({ field, marker });
  }

  function addQuickField(selector, label, { field, single, expand } = {}) {
    const section = doc.querySelector(selector);
    if (!section) return;
    if (!label) {
      moveField(field ? section.closest("label") : section, shortcuts);
      return;
    }
    const button = doc.createElement("button");
    button.className = "home-image-chat-parameter-trigger";
    button.type = "button";
    button.append(doc.createElement("span"), featurePicker.querySelector("svg").cloneNode(true));
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
    shortcutButtons.push({ button, section, fallback: label, popover });
  }
  allSettings.addEventListener("click", openAdvanced);
  dialog.querySelector(".home-image-chat-parameter-close").addEventListener("click", () => dialog.close());
  function onBackdrop(event) {
    if (event.target !== dialog) return false;
    const bounds = dialog.getBoundingClientRect();
    return event.clientX < bounds.left || event.clientX > bounds.right ||
      event.clientY < bounds.top || event.clientY > bounds.bottom;
  }
  dialog.addEventListener("pointerdown", event => { backdropPress = onBackdrop(event); });
  dialog.addEventListener("pointercancel", () => { backdropPress = false; });
  dialog.addEventListener("click", event => {
    if (backdropPress && onBackdrop(event)) dialog.close();
    backdropPress = false;
  });
  dialog.addEventListener("close", () => {
    if (dialog.open) return;
    backdropPress = false;
    if (feature && scroll.parentElement !== parking) {
      parking.append(scroll);
      if (allSettings.getClientRects().length) allSettings.focus({ preventScroll: true });
    }
  });

  return {
    textField: () => originalPrompt?.field,
    reveal(sectionId) {
      shortcutButtons.find(({ section }) => section.id === sectionId)?.popover.open({ focus: false });
    },
    setFeature(mode, name) {
      if (feature === mode) return;
      feature = mode;
      if (dialog.open) dialog.close();
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
      allSettings.hidden = !config;
      for (const region of primaryRegions) region.toggleAttribute("data-home-chat-primary-only", Boolean(config));
      if (!config) {
        position.after(scroll);
        return;
      }
      title.textContent = name || "自由生图";
      parking.append(scroll);
      scroll.inert = false;
      mountPrompt(config.prompt);
      for (const [selector, label, options] of config.quick || []) addQuickField(selector, label, options);
      if (mode !== "free" && mode !== "imageUpscale") moveField(doc.querySelector("#modelSelect"), settings, settings.querySelector(".field"));
      updateShortcuts();
      observer.observe(scroll, { subtree: true, characterData: true, childList: true,
        attributes: true, attributeFilter: ["aria-checked", "class", "hidden"] });
    },
  };
}

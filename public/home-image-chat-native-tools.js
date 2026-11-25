/**
 * [INPUT]: 依赖首页对话工具槽、原生画布预览、共用结果区与原功能参数
 * [OUTPUT]: 原生编辑挂入共享画布面板，风格反推挂入消息区，复用原表单和底栏模型
 * [POS]: public 的同页面对话工具挂载层，业务执行继续由原工作区控制器管理
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { bindEmbeddedWorkspaceQuickParameters } from "./workspace-quick-parameters.js?v=3";

const tools = {
  imageOutpaint: "imageOutpaintSection",
  imageMultiAngle: "imageMultiAngleSection",
  imageMaskFill: "imageMaskFillSection",
  imageRelight: "imageRelightSection",
  styleDna: "styleDnaControls",
};

export function bindHomeNativeTools(homeRoot, { canvas, transcript }) {
  const doc = homeRoot.ownerDocument;
  const settings = homeRoot.querySelector(".home-image-chat-tool-settings");
  const actions = homeRoot.querySelector(".home-image-chat-tool-actions");
  const promptHost = homeRoot.querySelector(".home-image-chat-feature-prompt");
  const quickHost = homeRoot.querySelector(".home-image-chat-tool-quick") || canvas;
  const moves = [];
  let activeMode = null;
  let clearQuickSettings;
  let settingsObserver;
  let promptField;
  let promptRows;
  let restoreReferenceLabel;

  function move(node, target, before = null) {
    const marker = doc.createComment("对话工具原位置");
    node.before(marker);
    target.insertBefore(node, before);
    moves.push({ node, marker });
  }

  function unmount() {
    clearQuickSettings?.();
    clearQuickSettings = null;
    settingsObserver?.disconnect();
    settingsObserver = null;
    if (promptField) {
      promptField.classList.remove("home-image-chat-input");
      promptField.style.removeProperty("height");
      promptField.rows = promptRows;
      promptField.placeholder = promptField.dataset.workspacePlaceholder || promptField.placeholder;
      promptField = null;
    }
    restoreReferenceLabel?.();
    restoreReferenceLabel = null;
    if (activeMode === "styleDna") {
      actions.querySelector(".style-dna-send-button").classList.remove("home-image-chat-send");
      actions.hidden = true;
    }
    while (moves.length) {
      const { node, marker } = moves.pop();
      marker.replaceWith(node);
    }
    activeMode = null;
  }

  function mount(mode) {
    if (mode === activeMode) return true;
    const mount = mode === "styleDna" ? transcript : canvas;
    const featureSettings = doc.getElementById(tools[mode]);
    const toolNodes = mode === "styleDna"
      ? [doc.getElementById("styleDnaChat")]
      : [doc.getElementById(`${mode}PreviewTab`)?.parentElement,
        doc.getElementById(`${mode}Workspace`), doc.getElementById("resultStage")];
    const originalComposer = mode === "styleDna" && toolNodes[0]?.querySelector(".style-dna-composer");
    if (!mount || !settings || !featureSettings || toolNodes.some(node => !node) ||
      (mode === "styleDna" && (!actions || !originalComposer))) return false;
    unmount();
    for (const node of toolNodes) move(node, mount);
    const originalSettings = featureSettings.parentElement;
    move(featureSettings, settings);
    if (mode === "imageMaskFill") {
      const promptBlock = featureSettings.querySelector(".mask-fill-prompt-block");
      promptField = promptBlock.querySelector("textarea");
      promptRows = promptField.rows;
      promptField.rows = 2;
      promptField.placeholder = promptField.dataset.homePlaceholder || "描述要编辑的内容…";
      promptField.classList.add("home-image-chat-input");
      move(promptBlock, promptHost);
      const reference = featureSettings.querySelector("[data-mask-reference-section]");
      const label = reference.querySelector("[data-mask-reference-drop] > span");
      const originalLabel = label.textContent;
      label.textContent = "编辑参考图";
      restoreReferenceLabel = () => { label.textContent = originalLabel; };
      move(reference, quickHost.parentElement, quickHost);
    }
    if (originalComposer) {
      move(originalComposer, actions);
      move(quickHost, originalComposer.querySelector(".composer-attachment-tools"));
      originalComposer.querySelector(".style-dna-send-button").classList.add("home-image-chat-send");
      actions.hidden = false;
    }
    activeMode = mode;
    settingsObserver = new doc.defaultView.MutationObserver(() => {
      // --- 初始化和原表单的重排可能暂时取回设置，继续保留当前对话的原控件 ---
      if (activeMode === mode && featureSettings.parentElement !== settings) settings.append(featureSettings);
    });
    settingsObserver.observe(originalSettings, { childList: true });
    clearQuickSettings = bindEmbeddedWorkspaceQuickParameters({ mode, quickHost, settings: featureSettings });
    return true;
  }

  return { supports: mode => Object.hasOwn(tools, mode), mount, unmount, active: () => activeMode, textField: () => promptField };
}

/**
 * [INPUT]: 依赖模型参考图能力合同、页面配置元素与当前 Agent/功能状态
 * [OUTPUT]: 对外提供 renderPromptAgentModels 与 updateReferenceRequirements 两个配置控件渲染函数
 * [POS]: public 的生图配置展示层，由 app.js 在状态变化后调用
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { referenceCapability } from "./model-capabilities.js";

export function renderPromptAgentModels(elements, state) {
  const options = state.promptAgentCatalog.map((model) => {
    const live = state.availablePromptAgents.get(model.id);
    const selectable = live ? live.selectable : model.imageInput;
    const reason = live?.reason || (!model.imageInput ? "不支持图片输入" : null);
    const option = document.createElement("option");
    option.value = model.key;
    option.disabled = !selectable;
    option.selected = model.key === state.promptAgentModelKey;
    option.textContent = `${model.shortLabel}${reason ? ` · ${reason}` : ""}`;
    return option;
  });
  elements.promptAgentModelSelect.replaceChildren(...options);
  const selected = state.promptAgentCatalog.find(
    (model) => model.key === state.promptAgentModelKey);
  elements.promptAgentNote.textContent = state.featureMode === "emptyRoom"
    ? selected?.note
      ? `${selected.note}；用于理解空房并生成完整设计提示词。`
      : "用于理解空房并生成完整设计提示词。"
    : selected?.note || "用于理解白模并整合最终提示词。";
}

export function updateReferenceRequirements(elements, { featureMode, model, policy }) {
  if (featureMode === "imageUpscale") {
    elements.referenceTitleCopy.textContent = "待超分图片";
    elements.referenceOptional.textContent = "必填 · 1张";
    elements.referenceDropLabel.textContent = "添加或拖入待超分图片";
    elements.referenceInput.multiple = false;
    elements.referenceInput.ariaLabel = "添加待超分图片";
    return;
  }
  const capability = referenceCapability({ featureMode, model, policy });
  elements.referenceTitleCopy.textContent = capability.title;
  elements.referenceOptional.textContent = capability.optionalLabel;
  elements.referenceDropLabel.textContent = capability.dropLabel;
  elements.referenceInput.multiple = capability.multiple;
  elements.referenceInput.ariaLabel = capability.ariaLabel;
}

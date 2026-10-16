/**
 * [INPUT]: 依赖模型参考图能力合同、页面配置元素、独立图片工具上传要求与白模/空房/风格转换独立 Agent 状态
 * [OUTPUT]: 对外提供设计模式配置、主图必填校验与参考风格锁定推导、Agent 标题/基模说明及主图上传控件渲染
 * [POS]: public 的生图配置展示层，由 app.js 在状态变化后调用
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { referenceCapability } from "./model-capabilities.js";

export function designPromptConfiguration(state) {
  return ({ emptyRoom: state.emptyRoomConfig, styleTransfer: state.styleTransferConfig })[state.featureMode]
    || { promptAgent: state.fusionPromptConfig, smartDefault: state.smartDefaultConfig };
}

export function platformStyleAvailability(featureMode, referenceCount) {
  const label = ({ emptyRoom: "空房设计", styleTransfer: "风格转换" })[featureMode];
  const available = !label || referenceCount === 0;
  return { available, reason: available ? "" : featureMode === "styleTransfer"
    ? "已上传风格参考图，当前使用参考图风格" : `已上传风格参考图，${label}固定使用智能默认` };
}

export function designSourceValidation(featureMode, referenceCount) {
  const subject = ({ emptyRoom: ["空房设计", "空房图"], styleTransfer: ["风格转换", "空间图"],
    whiteModel: ["白模渲染", "白模图"] })[featureMode];
  return subject && referenceCount !== 1 ? `${subject[0]}需要且只允许 1 张${subject[1]}` : null;
}

export function renderPromptAgentContext(elements, state, renderMode) {
  const prefix = ({ emptyRoom: "空房", styleTransfer: "风格转换" })[state.featureMode] || "";
  const smartDefault = renderMode === "smart-default";
  const reference = renderMode === "style-reference";
  const implicitVersion = smartDefault || reference;
  elements.promptAgentTitle.textContent = reference ? "风格转换参考图 Agent" : smartDefault
    ? `${prefix}智能默认 Agent` : prefix ? `${prefix}风格融合 Agent` : "场景融合 Agent";
  for (const field of [elements.promptAgentVersionAvailability, elements.promptAgentVersionField,
    elements.promptAgentVersionLabel]) field.classList.toggle("hidden", implicitVersion);
  elements.promptAgentModelLabelCopy.textContent = implicitVersion ? "Agent 基模" : "融合基模";
  elements.promptAgentModelSelect.setAttribute("aria-label", reference ? "风格转换参考图 Agent 基模" : smartDefault
    ? `${prefix}智能默认 Agent 基模` : prefix ? `${prefix}风格融合基模` : "融合基模");
  renderPromptAgentModels(elements, state);
}

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
  elements.promptAgentNote.textContent = state.featureMode === "styleTransfer"
    ? [selected?.note, "保留空间结构、家具布局与原视角，按目标风格转换材质、色彩与软装。"].filter(Boolean).join("；")
    : state.featureMode === "emptyRoom"
    ? selected?.note
      ? `${selected.note}；用于理解空房并生成完整设计提示词。`
      : "用于理解空房并生成完整设计提示词。"
    : selected?.note || "用于理解白模并整合最终提示词。";
}

export function updateReferenceRequirements(elements, { featureMode, model, policy }) {
  if (["imageUpscale", "imageOutpaint"].includes(featureMode)) {
    const subject = featureMode === "imageOutpaint" ? "待扩图图片" : "待超分图片";
    elements.referenceTitleCopy.textContent = subject;
    elements.referenceOptional.textContent = "必填 · 1张";
    elements.referenceDropLabel.textContent = `添加或拖入${subject}`;
    elements.referenceInput.multiple = false;
    elements.referenceInput.ariaLabel = `添加${subject}`;
    return;
  }
  const capability = referenceCapability({ featureMode, model, policy });
  elements.referenceTitleCopy.textContent = capability.title;
  elements.referenceOptional.textContent = capability.optionalLabel;
  elements.referenceDropLabel.textContent = capability.dropLabel;
  elements.referenceInput.multiple = capability.multiple;
  elements.referenceInput.ariaLabel = capability.ariaLabel;
}

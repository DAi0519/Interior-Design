/**
 * [INPUT]: 依赖白模风格控制器的明确平台/参考图选择纯规则、Beta DOM/状态、脱敏 Agent 配置、下拉渲染与已恢复表单状态
 * [OUTPUT]: 对外提供风格转换两路请求合同及 Beta 设计配置控制器，保留白模/空房原合同，隔离风格转换选择、无目标阻断和参考图上传/删除状态
 * [POS]: public 的 Beta 设计配置组合层，从 beta-app 分离设计方式、版本、共享参考图和请求投影
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { normalizeStyleTransferSelection, styleTransferRenderModeOptions } from "./white-model-render-mode.js";

export function betaStyleTransferSettings({ config = {}, renderMode, promptAgentModelKey,
  promptAgentVersion, reference, styleCode }) {
  if (renderMode === "style-reference" && !reference) throw new Error("请上传风格参考图，或选择平台风格");
  const choice = normalizeStyleTransferSelection({ mode: renderMode, styleCode }, config.styles || [], {
    reference: config.styleTransfer?.reference, referenceCount: reference ? 1 : 0,
  });
  if (!choice.available) throw new Error(choice.reason || "风格转换参考图 Agent 不可用");
  if (choice.mode === "style-reference" && (!Number.isInteger(choice.agentVersion) || choice.agentVersion < 1)) {
    throw new Error("风格转换参考图 Agent 版本不可用");
  }
  const version = Number(promptAgentVersion);
  if (choice.mode === "style-dna"
    && !config.styleTransfer?.promptAgent?.versions?.some((entry) => entry.version === version)) {
    throw new Error("风格转换融合 Agent 版本不可用");
  }
  return {
    renderMode: choice.mode, promptAgentModelKey,
    styleCode: choice.styleCode || undefined,
    styleReferenceImages: choice.mode === "style-reference" ? [reference] : [],
    ...(choice.mode === "style-reference"
      ? { styleTransferReferenceVersion: choice.agentVersion }
      : { styleTransferPromptAgentVersion: version }),
  };
}

export function createBetaDesignConfiguration({ elements, fillSelect, getState, restoredPageState }) {
  const restored = restoredPageState.controls || {};
  const transferControls = {
    renderMode: restored.styleTransferRenderMode || (restoredPageState.featureMode === "styleTransfer" ? restored.renderMode : ""),
    styleCode: restored.styleTransferStyleCode || (restoredPageState.featureMode === "styleTransfer" ? restored.styleCode : ""),
    promptAgentVersion: restored.styleTransferPromptAgentVersion || "",
  };
  const selections = new Map([[true, transferControls], [false, {
    renderMode: restoredPageState.featureMode === "styleTransfer" ? "smart-default" : restored.renderMode || "smart-default",
    styleCode: restoredPageState.featureMode === "styleTransfer" ? "" : restored.styleCode,
    promptAgentVersion: restoredPageState.featureMode === "styleTransfer" ? "" : restored.promptAgentVersion,
  }]]);
  let active = null;

  function readSelection() {
    return { renderMode: elements.renderModeSelect.value, styleCode: elements.styleSelect.value,
      promptAgentVersion: elements.promptAgentVersionSelect.value };
  }

  function render() {
    const state = getState();
    const config = state.stylesConfig || {};
    const transfer = state.featureMode === "styleTransfer";
    if (active !== null && active !== transfer) selections.set(active, readSelection());
    const values = active === transfer ? readSelection() : selections.get(transfer);
    active = transfer;
    const emptyRoom = state.featureMode === "emptyRoom";
    const smartConfig = emptyRoom ? config.emptyRoom?.smartDefault : config.smartDefault;
    const promptConfig = transfer ? config.styleTransfer?.promptAgent
      : emptyRoom ? config.emptyRoom?.promptAgent : config.promptAgent;
    const reference = transfer && Boolean(state.styleReference);
    const choices = transfer ? styleTransferRenderModeOptions(config.styles || [], {
      reference: config.styleTransfer?.reference, referenceCount: reference ? 1 : 0,
    }).filter((choice) => choice.mode === "style-dna") : (config.styles || []).filter((style) => style.published && style.validDna);
    fillSelect(elements.renderModeSelect, transfer ? [
      { label: "请选择风格来源", value: "", disabled: reference },
      { label: "平台风格", value: "style-dna", disabled: reference },
      { label: "参考图风格", value: "style-reference" },
    ] : [{ label: "智能默认", value: "smart-default" }, { label: "平台风格", value: "style-dna" }],
    reference ? "style-reference" : values.renderMode);
    const renderMode = elements.renderModeSelect.value;
    fillSelect(elements.styleSelect, [
      ...(transfer ? [{ label: "请选择平台风格", value: "" }] : []),
      ...choices.map((choice) => ({ label: `${choice.label || choice.name} · v${choice.style?.version || choice.version}`,
        value: choice.styleCode || choice.code, disabled: choice.available === false })),
    ], reference ? "" : values.styleCode);
    elements.styleSelect.disabled = reference;
    fillSelect(elements.promptAgentVersionSelect, (promptConfig?.versions || []).map((entry) => ({
      label: `${entry.name} · v${entry.version}`, value: entry.version,
    })), values.promptAgentVersion || promptConfig?.defaultVersion);
    const styleMode = renderMode === "style-dna";
    elements.styleField.classList.toggle("hidden", transfer ? !styleMode && !reference : !styleMode);
    elements.promptAgentVersionField.classList.toggle("hidden", !styleMode);
    elements.styleReferenceField.classList.toggle("hidden", !transfer && styleMode);
    elements.configStatus.textContent = transfer
      ? reference ? config.styleTransfer?.reference?.available
        ? `参考图风格 v${config.styleTransfer.reference.version}` : "风格转换参考图 Agent 不可用"
        : styleMode && elements.styleSelect.value ? "风格转换平台风格已就绪" : "请选择平台风格，或上传风格参考图"
      : styleMode ? choices.length && promptConfig?.versions?.length ? "平台风格已就绪" : "平台风格配置不可用"
        : smartConfig?.available ? `智能默认 v${smartConfig.version}` : "智能默认配置不可用";
    selections.set(transfer, readSelection());
  }

  function settings() {
    const state = getState();
    const selectedAgent = state.agentAccess.get(elements.promptAgentModelSelect.value);
    if (!state.agentAccessChecked || !selectedAgent?.selectable) {
      throw new Error("提示词模型当前未向这个 API Key 开放，请选择可用模型");
    }
    const config = state.stylesConfig || {};
    if (state.featureMode === "styleTransfer") return betaStyleTransferSettings({ config,
      ...readSelection(), reference: state.styleReference, promptAgentModelKey: elements.promptAgentModelSelect.value });
    const emptyRoom = state.featureMode === "emptyRoom";
    const smartDefault = elements.renderModeSelect.value === "smart-default";
    const smartConfig = emptyRoom ? config.emptyRoom?.smartDefault : config.smartDefault;
    const promptConfig = emptyRoom ? config.emptyRoom?.promptAgent : config.promptAgent;
    if (smartDefault && !smartConfig?.available) throw new Error("当前智能默认 Agent 不可用");
    if (!smartDefault && (!elements.styleSelect.value || !elements.promptAgentVersionSelect.value)) {
      throw new Error("平台风格或融合 Agent 版本不可用");
    }
    return {
      renderMode: elements.renderModeSelect.value,
      promptAgentModelKey: elements.promptAgentModelSelect.value,
      styleCode: smartDefault ? undefined : elements.styleSelect.value,
      styleReferenceImages: smartDefault && state.styleReference ? [state.styleReference] : [],
      ...(emptyRoom ? smartDefault ? { emptyRoomSmartDefaultVersion: smartConfig.version }
        : { emptyRoomPromptAgentVersion: Number(elements.promptAgentVersionSelect.value || promptConfig?.defaultVersion) }
        : smartDefault ? { smartDefaultAgentVersion: smartConfig.version }
          : { promptAgentVersion: Number(elements.promptAgentVersionSelect.value || promptConfig?.defaultVersion) }),
    };
  }

  return {
    render, settings,
    ready() { try { settings(); return true; } catch { return false; } },
    referenceChanged() {
      if (!getState().styleReference) {
        if (getState().featureMode === "styleTransfer") {
          elements.renderModeSelect.value = ""; elements.styleSelect.value = "";
        }
        selections.set(true, { renderMode: "", styleCode: "", promptAgentVersion: elements.promptAgentVersionSelect.value });
      }
      render();
    },
    snapshot() {
      const state = getState();
      const values = active === true ? readSelection() : selections.get(true);
      return {
        styleTransferRenderMode: values.renderMode || "", styleTransferStyleCode: values.styleCode || "",
        styleTransferReferenceVersion: String(state.stylesConfig?.styleTransfer?.reference?.version || restored.styleTransferReferenceVersion || ""),
        styleTransferPromptAgentVersion: String(values.promptAgentVersion || restored.styleTransferPromptAgentVersion || ""),
      };
    },
  };
}

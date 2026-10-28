/**
 * [INPUT]: 依赖共享 bindSearchableChoice 单选下拉、白模/空房/风格转换设计方式容器、飞书 Style DNA 脱敏目录、独立 Agent 可用性、平台风格临时锁定状态与模式变更回调
 * [OUTPUT]: 对外提供白模/空房/风格转换搜索单选、互斥和无目标阻断；说明位仅显示真实配置错误
 * [POS]: public 的设计风格选择层，复用模型选择器的同宽搜索浮层；风格转换独立保留选择且不提供自动风格，空房遵循原智能默认合同
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { bindSearchableChoice } from "./model-multi-select.js?v=5";

export const SMART_DEFAULT_RENDER_MODE = "smart-default";
export const STYLE_DNA_RENDER_MODE = "style-dna";
export const STYLE_REFERENCE_RENDER_MODE = "style-reference";

function selectableStyles(styles) {
  const seenFamilies = new Set();
  return [...(styles || [])]
    .filter((style) => style.published && style.validDna)
    .sort((left, right) =>
      left.name.localeCompare(right.name) || right.version - left.version)
    .filter((style) => {
      const family = style.familyCode || style.name;
      if (seenFamilies.has(family)) return false;
      seenFamilies.add(family);
      return true;
    });
}

export function whiteModelRenderModeOptions(
  styles,
  {
    smartDefaultAvailable = false,
    smartDefaultDescription = "AI 根据当前空间自动匹配材质、色彩与光线",
    smartDefaultReason = "",
    smartDefaultVersion = null,
    platformStylesAvailable = true,
    platformStylesReason = "",
  } = {},
) {
  return [
    {
      agentVersion: smartDefaultVersion,
      available: smartDefaultAvailable,
      description: smartDefaultDescription,
      label: "智能默认",
      mode: SMART_DEFAULT_RENDER_MODE,
      reason: smartDefaultReason,
      style: null,
      styleCode: null,
    },
    ...selectableStyles(styles).map((style) => ({
      available: platformStylesAvailable,
      description: style.description || `${style.name} Style DNA 已就绪`,
      label: style.name,
      mode: STYLE_DNA_RENDER_MODE,
      reason: platformStylesReason,
      style,
      styleCode: style.code,
    })),
  ];
}

export function normalizeWhiteModelRenderModeSelection(
  selection,
  styles,
  options,
) {
  const choices = whiteModelRenderModeOptions(styles, options);
  const requested = choices.find((choice) =>
    choice.available && choice.mode === selection?.mode
      && (choice.mode === SMART_DEFAULT_RENDER_MODE
        || choice.styleCode === selection?.styleCode));
  return requested || choices[0];
}

export function styleTransferRenderModeOptions(styles, { reference = {}, referenceCount = 0 } = {}) {
  return [
    ...(referenceCount > 0 ? [{
      agentVersion: reference.version,
      available: reference.available === true,
      description: reference.description || "提取参考图的材质、色彩与软装风格，保留空间结构与原视角。",
      label: "参考图风格", mode: STYLE_REFERENCE_RENDER_MODE,
      reason: reference.reason || (reference.available ? "" : "风格转换参考图 Agent 暂不可用"), style: null, styleCode: null,
    }] : []),
    ...selectableStyles(styles).map((style) => ({
      available: referenceCount === 0,
      description: style.description || `${style.name} Style DNA 已就绪`,
      label: style.name, mode: STYLE_DNA_RENDER_MODE,
      reason: referenceCount ? "已上传风格参考图，当前使用参考图风格" : "",
      style, styleCode: style.code,
    })),
  ];
}

export function normalizeStyleTransferSelection(selection, styles, options = {}) {
  const choices = styleTransferRenderModeOptions(styles, options);
  const reference = choices.find((choice) => choice.mode === STYLE_REFERENCE_RENDER_MODE);
  return reference || choices.find((choice) => choice.available && selection?.mode === STYLE_DNA_RENDER_MODE
    && choice.styleCode === selection?.styleCode) || {
    available: false, description: "请选择一个平台风格，或上传风格参考图。",
    mode: null, reason: "请选择平台风格，或上传风格参考图", style: null, styleCode: null,
  };
}

function choiceKey(choice) {
  return `${choice.mode}:${choice.styleCode || ""}`;
}

export function bindWhiteModelRenderMode({
  availability,
  note,
  onChange,
  root,
  smartDefaultAvailable = false,
}) {
  let styles = [];
  let smartDefault = {
    available: smartDefaultAvailable,
    description: "AI 根据当前空间自动匹配材质、色彩与光线",
    reason: "",
    version: null,
  };
  let selection = {
    mode: SMART_DEFAULT_RENDER_MODE,
    styleCode: null,
  };
  let platformStyles = { available: true, reason: "" };
  let transfer = { enabled: false, reference: {}, referenceCount: 0 };
  let choices = [];
  const selections = new Map();
  const picker = bindSearchableChoice({
    container: root,
    multiple: false,
    label: "设计风格",
    placeholder: "请选择风格",
    searchPlaceholder: "搜索风格名称",
    presentOption: (choice) => ({
      label: choice.label,
      reason: choice.reason,
      selectable: choice.available,
    }),
    onChange(keys) {
      const choice = choices.find((option) => choiceKey(option) === keys[0]);
      if (!choice?.available) return;
      selection = { mode: choice.mode, styleCode: choice.styleCode };
      render();
      onChange(current());
    },
  });

  function options() {
    return {
      smartDefaultAvailable: smartDefault.available,
      smartDefaultDescription: smartDefault.description,
      smartDefaultReason: smartDefault.reason,
      smartDefaultVersion: smartDefault.version,
      platformStylesAvailable: platformStyles.available,
      platformStylesReason: platformStyles.reason,
    };
  }

  function current() {
    return transfer.enabled ? normalizeStyleTransferSelection(selection, styles, transfer)
      : normalizeWhiteModelRenderModeSelection(selection, styles, options());
  }

  function render() {
    choices = transfer.enabled ? styleTransferRenderModeOptions(styles, transfer)
      : whiteModelRenderModeOptions(styles, options());
    const active = current();
    picker.render(choices.map((choice) => ({
      ...choice,
      key: choiceKey(choice),
      label: choice.style ? `${choice.label} · v${choice.style.version}` : choice.label,
    })), active.mode ? [choiceKey(active)] : []);
    availability.textContent = `${choices.length} 个风格`;
    availability.classList.toggle(
      "ready",
      choices.some((choice) => choice.available),
    );
    const issue = active.mode && !active.available ? active.reason || "Agent 暂不可用" : "";
    note.textContent = issue;
    note.classList.toggle("error", Boolean(issue));
    note.hidden = !issue;
  }

  render();
  return {
    current,
    setDesignContext({ featureMode, platformStyles: nextPlatform, reference = {}, referenceCount = 0 }) {
      const enabled = featureMode === "styleTransfer";
      if (enabled !== transfer.enabled) {
        selections.set(transfer.enabled, selection);
        selection = selections.get(enabled) || { mode: enabled ? null : SMART_DEFAULT_RENDER_MODE, styleCode: null };
      }
      transfer = { enabled, reference, referenceCount };
      platformStyles = nextPlatform || { available: true, reason: "" };
      selection = current();
      render();
    },
    setStyles(nextStyles) {
      styles = nextStyles || [];
      selection = current();
      render();
    },
    setSmartDefault(config) {
      smartDefault = {
        available: config?.available === true,
        description: String(config?.description || "").trim()
          || "AI 根据当前空间自动匹配材质、色彩与光线",
        reason: String(config?.reason || "").trim(),
        version: Number.isInteger(config?.version) ? config.version : null,
      };
      render();
    },
    setPlatformStylesEnabled(available, reason = "") {
      platformStyles = {
        available: available === true,
        reason: available ? "" : String(reason || "").trim(),
      };
      selection = current();
      render();
    },
  };
}

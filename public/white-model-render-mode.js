/**
 * [INPUT]: 依赖白模渲染方式容器、飞书 Style DNA 脱敏目录与调用方的模式变更回调
 * [OUTPUT]: 对外提供智能默认/平台风格选项推导、选择归一化及紧凑风格按钮组控制器
 * [POS]: public 的白模风格选择层，对外统一表达风格选择并在内部保留 Prompt 路由差异
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export const SMART_DEFAULT_RENDER_MODE = "smart-default";
export const STYLE_DNA_RENDER_MODE = "style-dna";

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
    smartDefaultReason = "",
    smartDefaultVersion = null,
  } = {},
) {
  return [
    {
      agentVersion: smartDefaultVersion,
      available: smartDefaultAvailable,
      description: "AI 根据当前空间自动匹配材质、色彩与光线",
      label: "智能默认",
      mode: SMART_DEFAULT_RENDER_MODE,
      reason: smartDefaultReason,
      style: null,
      styleCode: null,
    },
    ...selectableStyles(styles).map((style) => ({
      available: true,
      description: style.description || `${style.name} Style DNA 已就绪`,
      label: style.name,
      mode: STYLE_DNA_RENDER_MODE,
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
    choice.mode === selection?.mode
      && (choice.mode === SMART_DEFAULT_RENDER_MODE
        || choice.styleCode === selection?.styleCode));
  return requested || choices[0];
}

function buttonFor(choice, selected) {
  const button = document.createElement("button");
  const label = document.createElement("strong");
  const badge = document.createElement("small");

  button.className = "style-choice-option";
  button.type = "button";
  button.dataset.renderMode = choice.mode;
  if (choice.styleCode) button.dataset.styleCode = choice.styleCode;
  button.classList.toggle("selected", selected);
  button.setAttribute("aria-checked", String(selected));
  button.setAttribute("role", "radio");

  label.textContent = choice.label;
  badge.textContent = choice.mode === SMART_DEFAULT_RENDER_MODE
    ? "默认"
    : `v${choice.style.version}`;
  button.append(label, badge);
  return button;
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
    reason: "",
    version: null,
  };
  let selection = {
    mode: SMART_DEFAULT_RENDER_MODE,
    styleCode: null,
  };

  function current() {
    return normalizeWhiteModelRenderModeSelection(selection, styles, {
      smartDefaultAvailable: smartDefault.available,
      smartDefaultReason: smartDefault.reason,
      smartDefaultVersion: smartDefault.version,
    });
  }

  function render() {
    const choices = whiteModelRenderModeOptions(styles, {
      smartDefaultAvailable: smartDefault.available,
      smartDefaultReason: smartDefault.reason,
      smartDefaultVersion: smartDefault.version,
    });
    const active = current();
    root.replaceChildren(
      ...choices.map((choice) => buttonFor(
        choice,
        choice.mode === active.mode && choice.styleCode === active.styleCode,
      )),
    );
    availability.textContent = `${choices.length} 个风格`;
    availability.classList.toggle(
      "ready",
      choices.some((choice) => choice.available),
    );
    note.textContent = active.mode === SMART_DEFAULT_RENDER_MODE
      ? active.available
        ? active.description
        : `${active.description}；${active.reason || "Agent 暂不可用"}。`
      : active.description;
  }

  root.addEventListener("click", (event) => {
    const button = event.target.closest("[data-render-mode]");
    if (!button || !root.contains(button)) return;
    selection = {
      mode: button.dataset.renderMode,
      styleCode: button.dataset.styleCode || null,
    };
    render();
    onChange(current());
  });

  render();
  return {
    current,
    setStyles(nextStyles) {
      styles = nextStyles || [];
      selection = normalizeWhiteModelRenderModeSelection(selection, styles, {
        smartDefaultAvailable: smartDefault.available,
        smartDefaultReason: smartDefault.reason,
        smartDefaultVersion: smartDefault.version,
      });
      render();
    },
    setSmartDefault(config) {
      smartDefault = {
        available: config?.available === true,
        reason: String(config?.reason || "").trim(),
        version: Number.isInteger(config?.version) ? config.version : null,
      };
      render();
    },
  };
}

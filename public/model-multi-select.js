/**
 * [INPUT]: 依赖公开出图模型目录、模型展示解释器与用户点击事件
 * [OUTPUT]: 对外提供最多四项且至少保留一项的模型选择纯规则与按钮组控制器
 * [POS]: public 的出图模型多选交互层，让单模型和多模型共享同一个配置入口
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export function toggleModelSelection(
  currentKeys,
  modelKey,
  { max = 4, selectable = true } = {},
) {
  const values = [...new Set(currentKeys.map(String))];
  const selected = values.includes(modelKey);
  if (!selectable) return { changed: false, message: "该模型当前不可选", values };
  if (selected && values.length === 1) {
    return { changed: false, message: "至少保留 1 个出图模型", values };
  }
  if (!selected && values.length >= max) {
    return { changed: false, message: `最多选择 ${max} 个出图模型`, values };
  }
  return {
    changed: true,
    message: null,
    values: selected
      ? values.filter((value) => value !== modelKey)
      : [...values, modelKey],
  };
}

export function bindModelMultiSelect({
  container,
  max = 4,
  onChange,
  onMessage,
  presentOption,
}) {
  let catalog = [];
  let selectedKeys = [];

  function render(nextCatalog = catalog, nextKeys = selectedKeys) {
    catalog = nextCatalog;
    selectedKeys = nextKeys.filter((key) =>
      catalog.some((model) => model.key === key));
    container.replaceChildren(
      ...catalog.map((model) => {
        const presentation = presentOption(model);
        const selected = selectedKeys.includes(model.key);
        const button = document.createElement("button");
        button.type = "button";
        button.className = "model-option-toggle";
        button.dataset.modelKey = model.key;
        button.disabled = !presentation.selectable;
        button.setAttribute("role", "checkbox");
        button.setAttribute("aria-checked", String(selected));
        button.classList.toggle("selected", selected);

        const label = document.createElement("span");
        label.textContent = presentation.label;
        const check = document.createElement("i");
        check.setAttribute("aria-hidden", "true");
        check.textContent = selected ? "✓" : "+";
        button.append(label, check);
        button.addEventListener("click", () => {
          const result = toggleModelSelection(selectedKeys, model.key, {
            max,
            selectable: presentation.selectable,
          });
          if (!result.changed) {
            onMessage(result.message);
            return;
          }
          selectedKeys = result.values;
          render();
          onChange([...selectedKeys]);
        });
        return button;
      }),
    );
    container.setAttribute("aria-label", `出图模型，已选择 ${selectedKeys.length} 个`);
  }

  return {
    render,
    values: () => [...selectedKeys],
  };
}

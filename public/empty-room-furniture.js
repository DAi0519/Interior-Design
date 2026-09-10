/**
 * [INPUT]: 依赖服务端家具目录、房型选择、家具容器与输入变更回调
 * [OUTPUT]: 对外提供线上同名同序选项、房型默认多选与记忆、“其他”条件输入、目录更新清理、已选需求及配饰搭配说明与请求字段
 * [POS]: public 的空房家具选择控制器，复用房型按钮视觉，不自行维护推荐目录
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export function bindEmptyRoomFurniture({ root, onChange }) {
  let catalog = {};
  let roomType = "";
  const selections = new Map();
  const list = root.querySelector("[data-furniture-list]");
  const other = root.querySelector("[data-furniture-other]");
  const otherField = other.closest("label");
  const note = root.querySelector("[data-furniture-note]");
  function current() {
    if (!selections.has(roomType)) selections.set(roomType, {
      items: [...(catalog[roomType]?.defaults || [])], other: "", custom: false,
    });
    return selections.get(roomType);
  }
  function updateNote() {
    const value = current();
    const hasOther = value.custom && value.other.trim();
    note.textContent = value.items.length || hasOther
      ? `已选 ${value.items.length} 项${hasOther ? "，另有其他家具" : ""}作为需求，必要配饰按风格搭配；不要的内容请写补充要求。`
      : "未指定家具，AI 按房型与风格搭配；不要的内容请写补充要求。";
  }
  function render() {
    root.classList.toggle("hidden", !roomType);
    const value = current();
    other.value = value.other;
    otherField.classList.toggle("hidden", !value.custom);
    list.replaceChildren(...(catalog[roomType]?.options || []).map((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "room-type-option";
      button.dataset.furniture = item;
      button.textContent = item;
      button.setAttribute("role", "checkbox");
      const selected = item === catalog[roomType].customOption ? value.custom : value.items.includes(item);
      button.setAttribute("aria-checked", String(selected));
      button.classList.toggle("selected", selected);
      return button;
    }));
    updateNote();
  }
  list.addEventListener("click", (event) => {
    const button = event.target.closest("[data-furniture]");
    if (!button || !list.contains(button)) return;
    const item = button.dataset.furniture;
    const value = current();
    if (item === catalog[roomType].customOption) value.custom = !value.custom;
    else value.items = value.items.includes(item)
      ? value.items.filter((entry) => entry !== item) : [...value.items, item];
    render();
    [...list.children].find((entry) => entry.dataset.furniture === item)?.focus();
    if (item === catalog[roomType].customOption && value.custom) other.focus();
    onChange();
  });
  other.addEventListener("input", () => {
    current().other = other.value;
    updateNote();
    onChange();
  });
  return {
    configure(nextCatalog, maxLength) {
      catalog = nextCatalog || {};
      for (const [room, value] of selections) {
        value.items = value.items.filter((item) => catalog[room]?.options.includes(item) && item !== catalog[room].customOption);
      }
      other.maxLength = maxLength || 200;
      render();
    },
    setRoomType(value) { roomType = value; render(); },
    requestFields() {
      const value = current();
      return { furnitureSelection: { items: [...value.items], other: value.custom ? value.other.trim() : "" } };
    },
  };
}

/**
 * [INPUT]: 依赖空房房间类型容器、服务端公开的允许值/其他类型长度策略与选择变更回调
 * [OUTPUT]: 对外提供房间类型选择归一化、其他类型条件必填校验与无默认值的单选控制器
 * [POS]: public 的空房专属输入层，管理客户显式选择及“其他”具体类型，不推断或默认房间功能
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export function normalizeRoomTypeSelection(value, roomTypes) {
  const normalized = String(value || "").trim();
  return (roomTypes || []).includes(normalized) ? normalized : "";
}

export function normalizeOtherRoomTypeDetail(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function roomTypeSelectionValidation({
  detail,
  detailMaxLength,
  roomTypes,
  selection,
}) {
  const roomType = normalizeRoomTypeSelection(selection, roomTypes);
  if (!roomType) return { field: "roomType", message: "请选择房间类型" };
  if (roomType !== "其他") return { field: null, message: null };
  const normalizedDetail = normalizeOtherRoomTypeDetail(detail);
  if (!normalizedDetail) {
    return { field: "roomTypeDetail", message: "请填写具体空间类型" };
  }
  if (normalizedDetail.length > detailMaxLength) {
    return {
      field: "roomTypeDetail",
      message: `具体空间类型不能超过 ${detailMaxLength} 个字符`,
    };
  }
  return { field: null, message: null };
}

export function bindEmptyRoomType({ onChange, root }) {
  let roomTypes = [];
  let selection = "";
  let detailMaxLength = 40;
  const detailField = document.createElement("div");
  const detailLabel = document.createElement("label");
  const detailInput = document.createElement("input");
  detailField.className = "room-type-detail hidden";
  detailLabel.className = "room-type-detail-label";
  detailLabel.textContent = "具体空间类型";
  detailInput.className = "room-type-detail-input";
  detailInput.type = "text";
  detailInput.placeholder = "例如：衣帽间、影音室";
  detailInput.autocomplete = "off";
  detailLabel.append(detailInput);
  detailField.append(detailLabel);
  root.insertAdjacentElement("afterend", detailField);

  function render() {
    root.replaceChildren(...roomTypes.map((roomType) => {
      const button = document.createElement("button");
      const selected = roomType === selection;
      button.type = "button";
      button.className = "room-type-option";
      button.dataset.roomType = roomType;
      button.textContent = roomType;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-checked", String(selected));
      button.setAttribute("role", "radio");
      return button;
    }));
    const needsDetail = selection === "其他";
    detailField.classList.toggle("hidden", !needsDetail);
    detailInput.required = needsDetail;
    detailInput.maxLength = detailMaxLength;
  }

  root.addEventListener("click", (event) => {
    const button = event.target.closest("[data-room-type]");
    if (!button || !root.contains(button)) return;
    selection = normalizeRoomTypeSelection(button.dataset.roomType, roomTypes);
    render();
    Array.from(root.children)
      .find((choice) => choice.dataset.roomType === selection)
      ?.focus();
    onChange(selection);
  });
  detailInput.addEventListener("input", () => onChange(selection));

  return {
    focusInvalid() {
      const validation = roomTypeSelectionValidation({
        detail: detailInput.value,
        detailMaxLength,
        roomTypes,
        selection,
      });
      (validation.field === "roomTypeDetail"
        ? detailInput
        : root.querySelector("[data-room-type]"))?.focus();
    },
    requestFields() {
      return {
        roomType: selection,
        ...(selection === "其他"
          ? { roomTypeDetail: normalizeOtherRoomTypeDetail(detailInput.value) }
          : {}),
      };
    },
    setOptions(nextRoomTypes, nextDetailMaxLength) {
      roomTypes = [...new Set(nextRoomTypes || [])];
      detailMaxLength = Number.isInteger(nextDetailMaxLength)
        ? nextDetailMaxLength
        : detailMaxLength;
      selection = normalizeRoomTypeSelection(selection, roomTypes);
      render();
    },
    validation() {
      return roomTypeSelectionValidation({
        detail: detailInput.value,
        detailMaxLength,
        roomTypes,
        selection,
      });
    },
    value() {
      return selection;
    },
  };
}

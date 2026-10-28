/**
 * [INPUT]: 依赖room-renovation 的旧房/空房模式判定、房型/家具输入控制器、生图页面区块与当前功能
 * [OUTPUT]: 对外提供所有生成功能的图片上传置顶顺序、风格转换补充要求与主图/风格图输入，以及旧房和空房共用的房型、家具、布局、必填校验和 Agent 配置
 * [POS]: public 的生成输入布局与空房输入组合层，保持主 app 编排器精简
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { isEmptyRoomDesign } from "./room-renovation.js";
import { bindEmptyRoomType } from "./empty-room-type.js";
import { bindEmptyRoomFurniture } from "./empty-room-furniture.js";

export function bindDesignInputs({ root, onChange }) {
  const byId = (id) => document.getElementById(id);
  const furniture = bindEmptyRoomFurniture({ root: byId("emptyRoomFurnitureSection"), onChange });
  const type = bindEmptyRoomType({ root, onChange: (value) => { furniture.setRoomType(value); onChange(); } });
  const parent = root.closest(".control-panel-scroll");
  const originalOrder = [...parent.children];
  const agent = byId("promptAgentSection");
  const prompt = byId("promptInput");
  const label = document.querySelector('label[for="promptInput"]');
  const reference = byId("referenceInput").closest("section");
  const styleReference = byId("styleReferenceSection");
  const emptyOrder = [reference, styleReference, byId("emptyRoomTypeSection"),
    byId("emptyRoomFurnitureSection"), byId("styleSection"),
    byId("promptSection"), byId("modelSection")];
  return {
    ...type,
    requestFields: () => ({ ...type.requestFields(), ...furniture.requestFields() }),
    setOptions(types, maxLength, catalog, otherMaxLength) {
      type.setOptions(types, maxLength);
      furniture.configure(catalog, otherMaxLength);
    },
    setFeatureMode(featureMode) {
      const empty = isEmptyRoomDesign(featureMode);
      const renovation = featureMode === "roomRenovation";
      const transfer = featureMode === "styleTransfer";
      // --- 每次先恢复稳定顺序，再统一把图片输入放到当前配置最前 ---
      parent.append(...originalOrder);
      if (empty) {
        let previous = originalOrder[0];
        for (const section of emptyOrder) { previous.after(section); previous = section; }
        previous.after(agent);
      } else {
        parent.prepend(reference);
        reference.after(styleReference);
        if (transfer) {
          let previous = styleReference;
          for (const section of [byId("styleSection"), byId("promptSection"), byId("modelSection"),
            byId("negativePromptSection"), byId("parameterSection"), agent]) {
            previous.after(section); previous = section;
          }
        }
      }
      if (empty) furniture.setRoomType(type.value());
      else byId("emptyRoomFurnitureSection").classList.add("hidden");
      byId("emptyRoomFurnitureTitle").textContent = "确认家具";
      byId("promptTitle").textContent = empty || transfer ? "补充要求（可选）" : "提示词";
      label.textContent = renovation ? "旧房改造补充要求" : transfer ? "风格转换补充要求" : empty ? "空房补充要求" : "图像提示词";
      prompt.placeholder = transfer ? "例如：保留沙发与家具布局，使用深色木材和暖色灯光。"
        : empty ? "例如：保留宽走道、需要双人办公、喜欢深色木材；家具增减请在上方选择。" : "";
    },
  };
}

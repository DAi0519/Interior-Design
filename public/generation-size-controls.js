/**
 * [INPUT]: 依赖model-capabilities的功能/模型尺寸规则、共享fillSelect、尺寸控件与当前原图/光影选择
 * [OUTPUT]: 对外提供bindGenerationSizeControls，刷新比例/分辨率及结果区真实尺寸摘要
 * [POS]: public 的生成尺寸界面适配层，复用纯规则并从app.js分离DOM投影
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { sizeControlState, sizeSummary } from "./model-capabilities.js";
import { fillSelect } from "./workbench-utils.js";

export function bindGenerationSizeControls({ elements, getContext }) {
  return {
    configure({ preserveResolution = false, ratioMode } = {}) {
      const context = getContext();
      const controls = sizeControlState({ ...context,
        currentRatio: elements.ratioSelect.value, currentResolution: elements.resolutionSelect.value,
        preserveResolution, ratioMode: ratioMode ?? context.ratioMode });
      fillSelect(elements.ratioSelect, controls.ratioOptions, controls.ratio);
      fillSelect(elements.resolutionSelect, controls.resolutionOptions, controls.resolution);
      elements.ratioSelect.disabled = controls.ratioDisabled;
      elements.resolutionSelect.disabled = controls.resolutionDisabled;
    },
    renderSummary() {
      const context = getContext();
      const ratio = elements.ratioSelect.value;
      const summary = sizeSummary({ ...context, ratio, resolution: elements.resolutionSelect.value });
      if (summary.resolution !== elements.resolutionSelect.value) {
        fillSelect(elements.resolutionSelect, Object.keys(context.model.sizes[ratio]), summary.resolution);
      }
      elements.exactSize.textContent = summary.exactSize;
      elements.emptyModel.textContent = context.model.label;
      elements.emptySize.textContent = summary.emptySize;
    },
  };
}

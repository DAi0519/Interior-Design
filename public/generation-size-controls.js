/**
 * [INPUT]: 依赖model-capabilities的功能/模型尺寸规则、共享fillSelect、尺寸控件与当前原图/光影选择
 * [OUTPUT]: 提供手动画幅与跟随原图、恢复功能规格草稿、分辨率和真实尺寸摘要，以及后置KS生成门禁
 * [POS]: public 的生成尺寸界面适配层，复用纯规则并从app.js分离DOM投影
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { fluxPostUpscaleState, sizeControlState, sizeSummary } from "./model-capabilities.js";
import { fillSelect } from "./workbench-utils.js";

export const SOURCE_ASPECT_OPTION = "source-aspect";

export function bindGenerationSizeControls({ elements, getContext }) {
  const readControls = (context, options) => sizeControlState({ ...context, ...options,
    currentRatio: options.draft?.ratio ?? elements.ratioSelect.value,
    currentResolution: options.draft?.resolution ?? elements.resolutionSelect.value });
  function selectedRatio(context = getContext()) {
    const value = elements.ratioSelect.value;
    return value === SOURCE_ASPECT_OPTION ? readControls(context, { ratioMode: "auto" }).ratio : value;
  }
  return {
    selectedRatio,
    unavailableReason(models = [getContext().model]) {
      const context = getContext();
      return models.map(model => fluxPostUpscaleState({ ...context, model,
        resolution: elements.resolutionSelect.value }).reason).find(Boolean) || null;
    },
    configure({ preserveResolution = false, draft = null } = {}) {
      const context = getContext();
      const controls = readControls(context, { preserveResolution: preserveResolution || Boolean(draft), draft });
      const canFollowSource = context.sourceImage && !controls.ratioDisabled;
      const ratios = canFollowSource
        ? [{ label: "跟随原图", value: SOURCE_ASPECT_OPTION }, ...controls.ratioOptions]
        : controls.ratioOptions;
      const selection = canFollowSource && context.ratioMode === "auto" ? SOURCE_ASPECT_OPTION : controls.ratio;
      fillSelect(elements.ratioSelect, ratios, selection);
      fillSelect(elements.resolutionSelect, controls.resolutionOptions, controls.resolution);
      elements.ratioSelect.disabled = controls.ratioDisabled;
      elements.resolutionSelect.disabled = controls.resolutionDisabled;
    },
    renderSummary() {
      const context = getContext();
      const ratio = selectedRatio(context);
      const summary = sizeSummary({ ...context, ratio, resolution: elements.resolutionSelect.value });
      if (summary.resolution !== elements.resolutionSelect.value) {
        fillSelect(elements.resolutionSelect, Object.keys(context.model.sizes[ratio]), summary.resolution);
      }
      elements.exactSize.textContent = fluxPostUpscaleState({ ...context,
        resolution: elements.resolutionSelect.value }).reason || summary.exactSize;
      elements.emptyModel.textContent = context.model.label;
      elements.emptySize.textContent = summary.emptySize;
    },
  };
}

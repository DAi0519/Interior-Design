/**
 * [INPUT]: 依赖 GPT 光照模板/可选光源编辑与遮罩画布控制器、共享摄影机球、多角度/超分/扩图控制器、共享大画布、同源 API、单图和任务状态回调
 * [OUTPUT]: 对外提供图片工具组合、二次编辑工作区文案、独立打光任务与原图预览/可选编辑工作区、Prompt强制读取与连接/换Key后的版本隔离能力刷新
 * [POS]: public 的图片工具组合层，从主 app 编排器隔离控制器初始化细节
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { bindImageMultiAngle } from "./image-multi-angle.js";
import { bindImageMaskFill } from "./image-mask-fill.js";
import { bindImageRelight } from "./image-relight.js";
import { bindImageUpscale } from "./image-upscale.js?v=3";
import { bindImageOutpaint } from "./image-outpaint.js?v=2";
import { bindImageOutpaintWorkspace, bindImageToolWorkspace } from "./image-outpaint-workspace.js";

export async function refreshImageOutpaintConfig(api, controller) {
  try {
    controller.configure(await api("/api/image-outpaint/config"));
  } catch {
    controller.configure({ available: false, reason: "扩图配置读取失败，请检查连接后重试", workflow: null });
  }
}

export function bindImageTools({ api, elements, getSourceImage, onChange, showToast }) {
  const shared = {
    emptyModel: elements.emptyModel,
    emptySize: elements.emptySize,
    exactSize: elements.exactSize,
    getSourceImage,
    onChange,
  };
  let angleConfigVersion = 0;
  let maskConfigVersion = 0;
  let relightConfigVersion = 0;
  let angleWorkspace = null;
  const multiAngle = bindImageMultiAngle({ ...shared, root: elements.imageMultiAngleSection, uploadInput: elements.referenceInput, onSourceChange: source => angleWorkspace?.setSource(source) });
  angleWorkspace = bindImageToolWorkspace({ root: elements.imageMultiAngleSection, prefix: "imageMultiAngle", label: "多角度工作区", previewLabel: "机位预览", previewSelector: ".cs-stage", footerSelectors: [".multi-angle-output"] });
  const upscale = bindImageUpscale({
    ...shared,
    availability: elements.imageUpscaleAvailability,
    note: elements.imageUpscaleNote,
    resolutionSelect: elements.resolutionSelect,
    workflowList: elements.imageUpscaleWorkflowList,
  });
  let workspace = null;
  const outpaint = bindImageOutpaint({ ...shared, root: elements.imageOutpaintSection,
    onSourceChange: (source) => workspace?.setSource(source) });
  workspace = bindImageOutpaintWorkspace({ root: elements.imageOutpaintSection, onHide: outpaint.closeSettings });
  let maskWorkspace = null;
  const maskFill = bindImageMaskFill({ ...shared, root: elements.imageMaskFillSection, showToast,
    onSourceChange: source => maskWorkspace?.setSource(source) });
  maskWorkspace = bindImageToolWorkspace({ root: elements.imageMaskFillSection, prefix: "imageMaskFill",
    label: "二次编辑工作区", previewLabel: "绘制遮罩", previewSelector: ".mask-fill-preview", footerSelectors: [".mask-fill-toolbar"] });
  let relightWorkspace = null;
  const relight = bindImageRelight({ ...shared, root: elements.imageRelightSection, showToast,
    onRefresh: options => refreshRelight(options),
    onSourceChange: source => relightWorkspace?.setSource(source) });
  relightWorkspace = bindImageToolWorkspace({ root: elements.imageRelightSection, prefix: "imageRelight",
    label: "打光工作区", previewLabel: "原图", previewSelector: ".relight-preview", footerSelectors: [".relight-toolbar"] });
  async function refreshRelight({ forceRefresh = false } = {}) {
    const version = ++relightConfigVersion;
    relight.configure({ available: false, loading: true, reason: "读取打光配置中…" }); onChange();
    let config;
    try { config = await api(`/api/image-relight/config${forceRefresh ? "?forceRefresh=1" : ""}`); }
    catch { config = { available: false, reason: "打光配置读取失败，请检查连接后重试" }; }
    if (version !== relightConfigVersion) return;
    relight.configure(config); onChange();
    return config;
  }
  const forMode = (mode) => mode === "imageRelight" ? relight : mode === "imageMaskFill" ? maskFill : mode === "imageMultiAngle" ? multiAngle : mode === "imageUpscale" ? upscale : mode === "imageOutpaint" ? outpaint : null;
  return {
    forMode,
    outpaint, multiAngle, maskFill, relight,
    refreshOutpaint: () => refreshImageOutpaintConfig(api, outpaint),
    refreshRelight,
    async refreshMaskFill() {
      const version = ++maskConfigVersion;
      maskFill.configure({ available: false, reason: "读取模型权限中…", modes: [] }); onChange();
      let config;
      try { config = await api("/api/image-mask-fill/config"); }
      catch { config = { available: false, reason: "二次编辑模型读取失败，请检查连接后重试", modes: [] }; }
      if (version !== maskConfigVersion) return;
      maskFill.configure(config); onChange();
    },
    async refreshMultiAngle() {
      const version = ++angleConfigVersion;
      multiAngle.configure({ available: false, reason: "读取模型权限中…", models: [] });
      onChange();
      let config;
      try { config = await api("/api/image-multi-angle/config"); }
      catch { config = { available: false, reason: "多角度模型读取失败，请检查连接后重试", models: [] }; }
      if (version !== angleConfigVersion) return;
      multiAngle.configure(config); onChange();
    },
    setFeatureMode(mode) {
      if (mode !== "imageOutpaint") workspace.setActive(false);
      if (mode !== "imageMultiAngle") angleWorkspace.setActive(false);
      if (mode !== "imageMaskFill") maskWorkspace.setActive(false);
      if (mode !== "imageRelight") relightWorkspace.setActive(false);
      if (mode === "imageOutpaint") workspace.setActive(true);
      if (mode === "imageMultiAngle") { angleWorkspace.setActive(true); angleWorkspace.setSource(getSourceImage()); }
      if (mode === "imageOutpaint") workspace.setSource(getSourceImage());
      if (mode === "imageMaskFill") { maskWorkspace.setActive(true); maskWorkspace.setSource(getSourceImage()); }
      if (mode === "imageRelight") { relightWorkspace.setActive(true); relightWorkspace.setSource(getSourceImage()); }
      return forMode(mode);
    },
    setStage: (stage, task) => { workspace.setStage(stage, task); angleWorkspace.setStage(stage, task); maskWorkspace.setStage(stage, task); relightWorkspace.setStage(stage, task); },
    upscale,
  };
}

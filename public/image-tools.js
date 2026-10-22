/**
 * [INPUT]: 依赖遮罩填充两模式/画布控制器、共享摄影机球多角度控制器及含工作流说明/尺寸选择记忆的图片超分与三引擎扩图控制器、扩图大画布组合层、同源 API、主页面元素、单张上传图、任务身份和状态刷新回调
 * [OUTPUT]: 对外提供图片工具组合、任务身份和工作区，以及连接/换Key后的扩图/多角度/遮罩模型能力刷新
 * [POS]: public 的图片工具组合层，从主 app 编排器隔离控制器初始化细节
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { bindImageMultiAngle } from "./image-multi-angle.js";
import { bindImageMaskFill } from "./image-mask-fill.js";
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
    label: "遮罩填充工作区", previewLabel: "绘制遮罩", previewSelector: ".mask-fill-preview", footerSelectors: [".mask-fill-toolbar"] });
  const forMode = (mode) => mode === "imageMaskFill" ? maskFill : mode === "imageMultiAngle" ? multiAngle : mode === "imageUpscale" ? upscale : mode === "imageOutpaint" ? outpaint : null;
  return {
    forMode,
    outpaint, multiAngle, maskFill,
    refreshOutpaint: () => refreshImageOutpaintConfig(api, outpaint),
    async refreshMaskFill() {
      const version = ++maskConfigVersion;
      maskFill.configure({ available: false, reason: "读取模型权限中…", modes: [] }); onChange();
      let config;
      try { config = await api("/api/image-mask-fill/config"); }
      catch { config = { available: false, reason: "遮罩填充模型读取失败，请检查连接后重试", modes: [] }; }
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
      if (mode === "imageOutpaint") workspace.setActive(true);
      if (mode === "imageMultiAngle") { angleWorkspace.setActive(true); angleWorkspace.setSource(getSourceImage()); }
      if (mode === "imageOutpaint") workspace.setSource(getSourceImage());
      if (mode === "imageMaskFill") { maskWorkspace.setActive(true); maskWorkspace.setSource(getSourceImage()); }
      return forMode(mode);
    },
    setStage: (stage, task) => { workspace.setStage(stage, task); angleWorkspace.setStage(stage, task); maskWorkspace.setStage(stage, task); },
    upscale,
  };
}

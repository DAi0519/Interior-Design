/**
 * [INPUT]: 依赖图片超分/双引擎扩图控制器、同源 API、主页面元素、单张上传图和状态刷新回调
 * [OUTPUT]: 对外提供图片工具绑定/按功能选择，以及连接或换 Key 后的扩图能力刷新
 * [POS]: public 的图片工具组合层，从主 app 编排器隔离控制器初始化细节
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { bindImageUpscale } from "./image-upscale.js";
import { bindImageOutpaint } from "./image-outpaint.js";

export async function refreshImageOutpaintConfig(api, controller) {
  try {
    controller.configure(await api("/api/image-outpaint/config"));
  } catch {
    controller.configure({ available: false, reason: "扩图配置读取失败，请检查连接后重试", workflow: null });
  }
}

export function bindImageTools({ api, elements, getSourceImage, onChange }) {
  const shared = {
    emptyModel: elements.emptyModel,
    emptySize: elements.emptySize,
    exactSize: elements.exactSize,
    getSourceImage,
    onChange,
  };
  const upscale = bindImageUpscale({
    ...shared,
    availability: elements.imageUpscaleAvailability,
    resolutionSelect: elements.resolutionSelect,
    workflowList: elements.imageUpscaleWorkflowList,
  });
  const outpaint = bindImageOutpaint({ ...shared, root: elements.imageOutpaintSection });
  return {
    outpaint,
    refreshOutpaint: () => refreshImageOutpaintConfig(api, outpaint),
    upscale,
    forMode: (mode) => mode === "imageUpscale" ? upscale : mode === "imageOutpaint" ? outpaint : null,
  };
}

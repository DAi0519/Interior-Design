/**
 * [INPUT]: 依赖共享超分执行能力门禁、注入的 Flux/Qwen/Sunburst 三引擎及本机遮罩填充能力读取器、ComfyUI 客户端和 JSON 响应函数
 * [OUTPUT]: 对外提供多角度逐项权限准入、图片超分、AI 扩图与本机遮罩填充分模式合同/可用性/原因的只读 HTTP 处理器
 * [POS]: src 的独立图片工具配置入口，保持根 HTTP 组合文件精简
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { readMultiAngleConfig } from "./image-multi-angle-service.mjs";
import { publicImageOutpaintConfig } from "./image-outpaint-service.mjs";
import { readImageUpscaleConfig } from "./image-upscale-service.mjs";
import { readImageMaskFillConfig } from "./image-mask-fill-service.mjs";

export function createImageToolsApiHandler({ imageMultiAngleClient, getImageMultiAngleConfig = () => readMultiAngleConfig(imageMultiAngleClient), imageMaskFillClient, getImageMaskFillConfig = () => readImageMaskFillConfig(imageMaskFillClient), imageUpscaleClient, getImageOutpaintConfig = async () => publicImageOutpaintConfig(), sendJson }) {
  return async function handleImageToolsApi(request, response, pathname) {
    if (request.method !== "GET") return false;
    if (pathname === "/api/image-mask-fill/config") {
      sendJson(response, 200, await getImageMaskFillConfig());
      return true;
    }
    if (pathname === "/api/image-multi-angle/config") {
      sendJson(response, 200, await getImageMultiAngleConfig());
      return true;
    }
    if (pathname === "/api/image-outpaint/config") {
      sendJson(response, 200, await getImageOutpaintConfig());
      return true;
    }
    if (pathname !== "/api/image-upscale/config") return false;
    sendJson(response, 200, await readImageUpscaleConfig(imageUpscaleClient));
    return true;
  };
}

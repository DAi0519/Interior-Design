/**
 * [INPUT]: 依赖超分公开目录、注入的 ComfyUI/Sunburst 双引擎合同与能力读取器、ComfyUI 超分客户端和 JSON 响应函数
 * [OUTPUT]: 对外提供图片超分与 AI 扩图两引擎合同/动态可用性/准入原因的只读 HTTP 处理器
 * [POS]: src 的独立图片工具配置入口，保持根 HTTP 组合文件精简
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { publicImageOutpaintConfig } from "./image-outpaint-service.mjs";
import { publicImageUpscaleConfig } from "./image-upscale-workflow.mjs";

export function createImageToolsApiHandler({ imageUpscaleClient, getImageOutpaintConfig = async () => publicImageOutpaintConfig(), sendJson }) {
  return async function handleImageToolsApi(request, response, pathname) {
    if (request.method !== "GET") return false;
    if (pathname === "/api/image-outpaint/config") {
      sendJson(response, 200, await getImageOutpaintConfig());
      return true;
    }
    if (pathname !== "/api/image-upscale/config") return false;
    const comfyUi = await imageUpscaleClient.checkHealth().catch((error) => ({
      available: false, error: error.message, version: null,
    }));
    sendJson(response, 200, { ...publicImageUpscaleConfig(), comfyUi });
    return true;
  };
}

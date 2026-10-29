/**
 * [INPUT]: 依赖GPT打光公开配置/飞书Prompt主动刷新、主/Beta同源超分能力读取、注入的Flux/Qwen/Sunburst及本机二次编辑读取器、ComfyUI客户端和JSON响应
 * [OUTPUT]: 对外提供仅GPT打光及forceRefresh查询透传、多角度逐项权限准入、超分/扩图/二次编辑分模式可用性与原因的只读HTTP处理器
 * [POS]: src 的独立图片工具配置入口，保持根 HTTP 组合文件精简
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { readMultiAngleConfig } from "./image-multi-angle-service.mjs";
import { publicImageOutpaintConfig } from "./image-outpaint-service.mjs";
import { readImageUpscaleConfig } from "./image-upscale-service.mjs";
import { readImageMaskFillConfig } from "./image-mask-fill-service.mjs";

export function createImageToolsApiHandler({ imageMultiAngleClient, getImageMultiAngleConfig = () => readMultiAngleConfig(imageMultiAngleClient), imageMaskFillClient, getImageMaskFillConfig = () => readImageMaskFillConfig(imageMaskFillClient), getImageRelightConfig, imageUpscaleClient, getImageOutpaintConfig = async () => publicImageOutpaintConfig(), sendJson }) {
  return async function handleImageToolsApi(request, response, pathname) {
    if (request.method !== "GET") return false;
    if (pathname === "/api/image-relight/config" && getImageRelightConfig) {
      const forceRefresh = new URL(request.url || pathname, "http://localhost").searchParams.get("forceRefresh") === "1";
      sendJson(response, 200, await getImageRelightConfig({ forceRefresh }));
      return true;
    }
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

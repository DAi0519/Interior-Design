/**
 * [INPUT]: 依赖共享打光原图格式、4096px/16MP真实解码边界
 * [OUTPUT]: 对外提供AI渲染台工作流版本、固定材质策略、四摄影风格及独立8MiB上传合同
 * [POS]: src 的渲染台静态定义真源，供服务、配置和归档共用，不持有Prompt正文
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { RELIGHT_IMAGE_POLICY } from "../public/image-relight-geometry.js";

export const AI_RENDER_STUDIO_WORKFLOW_VERSION = "2026-11-03.ai-render-studio.2";
export const AI_RENDER_STUDIO_IMAGE_POLICY = Object.freeze({ ...RELIGHT_IMAGE_POLICY,
  maxBytesPerImage: 8 * 1024 * 1024, maxTotalBytes: 8 * 1024 * 1024 });
export const AI_RENDER_STUDIO_MATERIAL_MODES = Object.freeze([
  { key: "faithful", label: "保留原材质", description: "AI增强真实感，保留材质种类、本色和纹理尺度" },
].map(Object.freeze));
export const AI_RENDER_STUDIO_RENDER_STYLES = Object.freeze([
  { key: "photoreal", label: "写实摄影", description: "自然的摄影细节、微反差与真实材质响应" },
  { key: "soft", label: "柔和表现", description: "柔和高光与细腻层次，保持照明方案和材质本色" },
  { key: "cinematic", label: "电影质感", description: "克制的电影影调与高光过渡，保留原定光向和灯光状态" },
  { key: "film", label: "胶片质感", description: "细微胶片颗粒与影调响应，保留设计和材质本色" },
].map(Object.freeze));

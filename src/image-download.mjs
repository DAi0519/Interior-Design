/**
 * [INPUT]: 依赖 image-artifact.mjs 的受限图片读取与格式扩展名，接收生成结果 URL、输出格式和模型名称
 * [OUTPUT]: 对外提供浏览器下载所需的图片字节、MIME、文件名与 Content-Disposition
 * [POS]: src 的生成结果下载边界，隔离浏览器跨域限制与服务端图片读取细节
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import {
  extensionForImageFormat,
  loadImageBytes,
} from "./image-artifact.mjs";

const CONTENT_TYPES = Object.freeze({
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
});

function downloadError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

export function generatedImageFileName(modelLabel, outputFormat, now = new Date()) {
  const format = String(outputFormat || "").toLowerCase();
  if (!CONTENT_TYPES[format]) throw downloadError("不支持下载这个图片格式");
  const model = String(modelLabel || "生成结果")
    .trim()
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "生成结果";
  const timestamp = now.toISOString().replace(/\.\d{3}Z$/, "Z").replace(/[:]/g, "-");
  return `${model}-${timestamp}.${extensionForImageFormat(format)}`;
}

export async function prepareGeneratedImageDownload(
  input,
  { load = loadImageBytes, now = new Date() } = {},
) {
  const imageUrl = String(input?.imageUrl || "").trim();
  if (!imageUrl) throw downloadError("下载图片地址不能为空");
  const outputFormat = String(input?.outputFormat || "").toLowerCase();
  const fileName = generatedImageFileName(input?.modelLabel, outputFormat, now);
  const bytes = await load(imageUrl);
  return {
    bytes,
    contentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    contentType: CONTENT_TYPES[outputFormat],
    fileName,
  };
}

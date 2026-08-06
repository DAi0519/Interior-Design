/**
 * [INPUT]: 依赖 sharp 与全局 fetch/AbortController，接收生成结果的 data URL 或远程 URL
 * [OUTPUT]: 对外提供图片格式扩展名、data URL 解码、受限图片字节下载与模型请求侧体积收敛
 * [POS]: src 的图片产物基础设施，被普通飞书同步、Benchmark 结果归档与 OneAPI 图片请求共同复用
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import sharp from "sharp";

const DEFAULT_MAX_BYTES = 60 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 60_000;
export const DEFAULT_MAX_IMAGE_BASE64_BYTES = 4_900_000;
const REQUEST_IMAGE_QUALITIES = Object.freeze([90, 80, 70, 60, 50]);
const REQUEST_IMAGE_SCALE = 0.85;
const REQUEST_IMAGE_SCALE_ATTEMPTS = 10;

export function extensionForImageFormat(format) {
  return format === "jpeg" ? "jpg" : String(format || "").toLowerCase();
}

export function decodeImageDataUrl(dataUrl) {
  const match = String(dataUrl).match(
    /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\r\n]+)$/,
  );
  if (!match) throw new Error("图片数据格式不正确");
  return Buffer.from(match[2].replace(/\s/g, ""), "base64");
}

export async function fitImageDataUrlForRequest(
  imageUrl,
  { maxBase64Bytes = DEFAULT_MAX_IMAGE_BASE64_BYTES } = {},
) {
  const normalizedUrl = String(imageUrl || "");
  if (!normalizedUrl.startsWith("data:")) return normalizedUrl;
  if (!Number.isInteger(maxBase64Bytes) || maxBase64Bytes < 1) {
    throw new TypeError("图片请求上限必须是正整数");
  }

  const match = normalizedUrl.match(
    /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\r\n]+)$/,
  );
  if (!match) throw new Error("图片数据格式不正确");
  const encoded = match[2].replace(/\s/g, "");
  if (Buffer.byteLength(encoded, "ascii") <= maxBase64Bytes) {
    return normalizedUrl;
  }

  const bytes = Buffer.from(encoded, "base64");
  const metadata = await sharp(bytes, { failOn: "error" }).metadata();
  if (!metadata.width || !metadata.height) throw new Error("无法读取评分图片尺寸");

  let scale = 1;
  for (let attempt = 0; attempt < REQUEST_IMAGE_SCALE_ATTEMPTS; attempt += 1) {
    const width = Math.max(1, Math.floor(metadata.width * scale));
    for (const quality of REQUEST_IMAGE_QUALITIES) {
      const output = await sharp(bytes, { failOn: "error" })
        .rotate()
        .resize({ fit: "inside", width, withoutEnlargement: true })
        .flatten({ background: "#ffffff" })
        .jpeg({ progressive: true, quality })
        .toBuffer();
      const outputBase64 = output.toString("base64");
      if (Buffer.byteLength(outputBase64, "ascii") <= maxBase64Bytes) {
        return `data:image/jpeg;base64,${outputBase64}`;
      }
    }
    scale *= REQUEST_IMAGE_SCALE;
  }

  throw new Error(`评分图片压缩后仍超过 ${maxBase64Bytes} 字节，请降低图片分辨率`);
}

export async function loadImageBytes(
  imageUrl,
  {
    fetchImpl = fetch,
    maxBytes = DEFAULT_MAX_BYTES,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = {},
) {
  if (String(imageUrl).startsWith("data:")) {
    const bytes = decodeImageDataUrl(imageUrl);
    if (bytes.length > maxBytes) throw new Error("生成结果超过 60MB");
    return bytes;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(imageUrl, {
      redirect: "follow",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`读取生成结果失败（${response.status}）`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0) throw new Error("生成结果为空");
    if (bytes.length > maxBytes) throw new Error("生成结果超过 60MB");
    return bytes;
  } catch (error) {
    if (error.name === "AbortError") throw new Error("读取生成结果超时");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

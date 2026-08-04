/**
 * [INPUT]: 依赖全局 fetch/AbortController，接收生成结果的 data URL 或远程 URL
 * [OUTPUT]: 对外提供图片格式扩展名、data URL 解码与受限图片字节下载
 * [POS]: src 的图片产物基础设施，被普通飞书同步与 Benchmark 结果归档共同复用
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

const DEFAULT_MAX_BYTES = 60 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 60_000;

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

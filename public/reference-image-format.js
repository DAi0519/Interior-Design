/**
 * [INPUT]: 接收浏览器或服务端的图片起始字节
 * [OUTPUT]: 识别可以原样送模的 PNG、JPEG 和 WebP
 * [POS]: public 的参考图格式识别原语，由上传和服务端归一化共用
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function referenceImageMime(bytes) {
  if (PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if ([0x52, 0x49, 0x46, 0x46].every((byte, index) => bytes[index] === byte)
    && [0x57, 0x45, 0x42, 0x50].every((byte, index) => bytes[index + 8] === byte)) {
    return "image/webp";
  }
  return null;
}

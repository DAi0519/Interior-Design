/**
 * [INPUT]: 接收已通过容量校验的 PNG/JPEG/WebP 图片字节与 MIME 类型
 * [OUTPUT]: 对外提供 readImageDimensions，从真实图片头读取宽高或返回 null
 * [POS]: src 的无解码尺寸探测器，被参考图安全边界消费，避免信任浏览器声明的画幅
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

function pngDimensions(bytes) {
  if (
    bytes.length < 24 ||
    !bytes.subarray(0, 8).equals(PNG_SIGNATURE) ||
    bytes.toString("ascii", 12, 16) !== "IHDR"
  ) {
    return null;
  }
  return {
    height: bytes.readUInt32BE(20),
    width: bytes.readUInt32BE(16),
  };
}

const JPEG_SIZE_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
  0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

function jpegDimensions(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;

  let offset = 2;
  while (offset + 3 < bytes.length) {
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) return null;
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (offset + 2 > bytes.length) return null;
    const segmentLength = bytes.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) return null;
    if (JPEG_SIZE_MARKERS.has(marker) && segmentLength >= 7) {
      return {
        height: bytes.readUInt16BE(offset + 3),
        width: bytes.readUInt16BE(offset + 5),
      };
    }
    offset += segmentLength;
  }
  return null;
}

function webpDimensions(bytes) {
  if (
    bytes.length < 20 ||
    bytes.toString("ascii", 0, 4) !== "RIFF" ||
    bytes.toString("ascii", 8, 12) !== "WEBP"
  ) {
    return null;
  }

  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const chunkType = bytes.toString("ascii", offset, offset + 4);
    const chunkLength = bytes.readUInt32LE(offset + 4);
    const dataOffset = offset + 8;
    if (dataOffset + chunkLength > bytes.length) return null;

    if (chunkType === "VP8X" && chunkLength >= 10) {
      return {
        height: 1 + bytes.readUIntLE(dataOffset + 7, 3),
        width: 1 + bytes.readUIntLE(dataOffset + 4, 3),
      };
    }
    if (
      chunkType === "VP8L" &&
      chunkLength >= 5 &&
      bytes[dataOffset] === 0x2f
    ) {
      const first = bytes[dataOffset + 1];
      const second = bytes[dataOffset + 2];
      const third = bytes[dataOffset + 3];
      const fourth = bytes[dataOffset + 4];
      return {
        height: 1 + (((fourth & 0x0f) << 10) | (third << 2) | ((second & 0xc0) >> 6)),
        width: 1 + (((second & 0x3f) << 8) | first),
      };
    }
    if (
      chunkType === "VP8 " &&
      chunkLength >= 10 &&
      bytes[dataOffset + 3] === 0x9d &&
      bytes[dataOffset + 4] === 0x01 &&
      bytes[dataOffset + 5] === 0x2a
    ) {
      return {
        height: bytes.readUInt16LE(dataOffset + 8) & 0x3fff,
        width: bytes.readUInt16LE(dataOffset + 6) & 0x3fff,
      };
    }

    offset = dataOffset + chunkLength + (chunkLength % 2);
  }
  return null;
}

export function readImageDimensions(bytes, mimeType) {
  const dimensions =
    mimeType === "image/png"
      ? pngDimensions(bytes)
      : mimeType === "image/jpeg"
        ? jpegDimensions(bytes)
        : mimeType === "image/webp"
          ? webpDimensions(bytes)
          : null;
  if (
    !dimensions ||
    !Number.isInteger(dimensions.width) ||
    !Number.isInteger(dimensions.height) ||
    dimensions.width < 1 ||
    dimensions.height < 1
  ) {
    return null;
  }
  return dimensions;
}

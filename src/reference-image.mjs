/**
 * [INPUT]: 接收浏览器上传的多张图片 data URL、文件名、MIME 与声明字节数
 * [OUTPUT]: 对外提供 REFERENCE_IMAGE_POLICY、normalizeReferenceImage 与支持独立数量上限的 normalizeReferenceImages
 * [POS]: src 的参考图安全边界，被模型请求构造器消费，隔离文件校验与模型参数逻辑
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

const MIME_TYPES = Object.freeze(["image/png", "image/jpeg", "image/webp"]);
const MAX_BYTES_PER_IMAGE = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;

export const REFERENCE_IMAGE_POLICY = Object.freeze({
  accept: MIME_TYPES,
  maxBytesPerImage: MAX_BYTES_PER_IMAGE,
  maxCount: 4,
  maxTotalBytes: MAX_TOTAL_BYTES,
});

function validationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function safeFileName(value) {
  return String(value || "reference-image")
    .replace(/[^\p{L}\p{N}._ -]/gu, "")
    .trim()
    .slice(0, 120);
}

export function normalizeReferenceImage(input) {
  if (input == null) return null;
  if (typeof input !== "object") {
    throw validationError("参考图格式不正确");
  }

  const dataUrl = String(input.dataUrl || "");
  const match = dataUrl.match(
    /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\r\n]+)$/,
  );

  if (!match || !MIME_TYPES.includes(match[1])) {
    throw validationError("参考图仅支持 PNG、JPEG 或 WebP");
  }

  const mimeType = match[1];
  const normalizedBase64 = match[2].replace(/\s/g, "");
  const bytes = Buffer.from(normalizedBase64, "base64");

  if (bytes.length === 0) {
    throw validationError("参考图内容为空");
  }
  if (bytes.length > MAX_BYTES_PER_IMAGE) {
    throw validationError("参考图不能超过 8MB");
  }
  if (input.type && input.type !== mimeType) {
    throw validationError("参考图 MIME 类型不一致");
  }
  if (
    Number.isFinite(input.size) &&
    Number(input.size) > 0 &&
    Number(input.size) !== bytes.length
  ) {
    throw validationError("参考图字节数校验失败");
  }

  return {
    fileName: safeFileName(input.name),
    imageUrl: `data:${mimeType};base64,${normalizedBase64}`,
    mimeType,
    size: bytes.length,
  };
}

export function normalizeReferenceImages(
  input,
  { maxCount = REFERENCE_IMAGE_POLICY.maxCount } = {},
) {
  if (input == null) return [];
  if (!Array.isArray(input)) {
    throw validationError("参考图列表格式不正确");
  }
  if (!Number.isInteger(maxCount) || maxCount < 1) {
    throw new TypeError("参考图数量上限必须是正整数");
  }
  if (input.length > maxCount) {
    throw validationError(`参考图最多上传 ${maxCount} 张`);
  }

  const images = input.map(normalizeReferenceImage);
  const totalBytes = images.reduce((total, image) => total + image.size, 0);
  if (totalBytes > MAX_TOTAL_BYTES) {
    throw validationError("参考图合计不能超过 20MB");
  }
  return images;
}

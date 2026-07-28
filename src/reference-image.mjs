/**
 * [INPUT]: 接收浏览器上传的多张图片 data URL、文件名、MIME、声明字节数与调用方能力策略，依赖 image-dimensions.mjs 读取真实宽高
 * [OUTPUT]: 对外提供 REFERENCE_IMAGE_POLICY、携带可信图片宽高的 normalizeReferenceImage 与支持自定义格式/容量/可选数量上限的 normalizeReferenceImages
 * [POS]: src 的参考图安全边界，被生成与反推服务消费，隔离文件与可信画幅校验
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { readImageDimensions } from "./image-dimensions.mjs";

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

function normalizeAcceptedTypes(accept) {
  if (
    !Array.isArray(accept) ||
    accept.length === 0 ||
    accept.some((mimeType) => !/^image\/[a-z0-9.+-]+$/.test(mimeType))
  ) {
    throw new TypeError("参考图格式策略必须是非空图片 MIME 列表");
  }
  return new Set(accept);
}

function formatAcceptedTypes(accept) {
  const labels = {
    "image/gif": "GIF",
    "image/jpeg": "JPEG",
    "image/png": "PNG",
    "image/webp": "WebP",
  };
  return accept.map((mimeType) => labels[mimeType] || mimeType).join("、");
}

export function normalizeReferenceImage(
  input,
  {
    accept = REFERENCE_IMAGE_POLICY.accept,
    maxBytesPerImage = REFERENCE_IMAGE_POLICY.maxBytesPerImage,
  } = {},
) {
  if (input == null) return null;
  if (typeof input !== "object") {
    throw validationError("参考图格式不正确");
  }
  const acceptedTypes = normalizeAcceptedTypes(accept);
  if (!Number.isInteger(maxBytesPerImage) || maxBytesPerImage < 1) {
    throw new TypeError("参考图单文件上限必须是正整数");
  }

  const dataUrl = String(input.dataUrl || "");
  const match = dataUrl.match(
    /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\r\n]+)$/,
  );

  if (!match || !acceptedTypes.has(match[1])) {
    throw validationError(
      `参考图仅支持 ${formatAcceptedTypes([...acceptedTypes])}`,
    );
  }

  const mimeType = match[1];
  const normalizedBase64 = match[2].replace(/\s/g, "");
  const bytes = Buffer.from(normalizedBase64, "base64");

  if (bytes.length === 0) {
    throw validationError("参考图内容为空");
  }
  if (bytes.length > maxBytesPerImage) {
    throw validationError(
      `参考图不能超过 ${Math.floor(maxBytesPerImage / 1024 / 1024)}MB`,
    );
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
    ...readImageDimensions(bytes, mimeType),
    fileName: safeFileName(input.name),
    imageUrl: `data:${mimeType};base64,${normalizedBase64}`,
    mimeType,
    size: bytes.length,
  };
}

export function normalizeReferenceImages(
  input,
  {
    accept = REFERENCE_IMAGE_POLICY.accept,
    maxBytesPerImage = REFERENCE_IMAGE_POLICY.maxBytesPerImage,
    maxCount = REFERENCE_IMAGE_POLICY.maxCount,
    maxTotalBytes = REFERENCE_IMAGE_POLICY.maxTotalBytes,
  } = {},
) {
  if (input == null) return [];
  if (!Array.isArray(input)) {
    throw validationError("参考图列表格式不正确");
  }
  if (maxCount !== null && (!Number.isInteger(maxCount) || maxCount < 1)) {
    throw new TypeError("参考图数量上限必须是正整数");
  }
  if (!Number.isInteger(maxTotalBytes) || maxTotalBytes < 1) {
    throw new TypeError("参考图合计上限必须是正整数");
  }
  if (maxCount !== null && input.length > maxCount) {
    throw validationError(`参考图最多上传 ${maxCount} 张`);
  }

  const images = input.map((image) =>
    normalizeReferenceImage(image, { accept, maxBytesPerImage }),
  );
  const totalBytes = images.reduce((total, image) => total + image.size, 0);
  if (totalBytes > maxTotalBytes) {
    throw validationError(
      `参考图合计不能超过 ${Math.floor(maxTotalBytes / 1024 / 1024)}MB`,
    );
  }
  return images;
}

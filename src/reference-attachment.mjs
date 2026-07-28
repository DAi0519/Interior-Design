/**
 * [INPUT]: 依赖 reference-image.mjs 的图片归一化能力，接收图片/PDF Data URL 与反推附件能力策略
 * [OUTPUT]: 对外提供 normalizeReferenceAttachment 与 normalizeReferenceAttachments，输出 input_image/input_file 所需的安全附件
 * [POS]: src 的多模态参考附件边界，在通用图片校验之上增加 PDF 文件通道，专供 Style DNA 反推消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { normalizeReferenceImage } from "./reference-image.mjs";

function validationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function safeFileName(value) {
  return String(value || "reference-attachment")
    .replace(/[^\p{L}\p{N}._ -]/gu, "")
    .trim()
    .slice(0, 120);
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)}KB`;
  return `${Math.floor(bytes / 1024 / 1024)}MB`;
}

function formatAcceptedTypes(accept) {
  const labels = {
    "application/pdf": "PDF",
    "image/gif": "GIF",
    "image/jpeg": "JPEG",
    "image/png": "PNG",
    "image/webp": "WebP",
  };
  return accept.map((mimeType) => labels[mimeType] || mimeType).join("、");
}

function normalizedPolicy(policy) {
  const accept = policy?.accept;
  const maxBytesPerAttachment = policy?.maxBytesPerAttachment;
  const maxCount = policy?.maxCount;
  const maxTotalBytes = policy?.maxTotalBytes;
  if (
    !Array.isArray(accept) ||
    accept.length === 0 ||
    accept.some(
      (mimeType) =>
        !/^(?:image\/[a-z0-9.+-]+|application\/pdf)$/.test(mimeType),
    )
  ) {
    throw new TypeError("参考附件格式策略不正确");
  }
  if (
    !Number.isInteger(maxBytesPerAttachment) ||
    maxBytesPerAttachment < 1
  ) {
    throw new TypeError("参考附件单文件上限必须是正整数");
  }
  if (maxCount !== null && (!Number.isInteger(maxCount) || maxCount < 1)) {
    throw new TypeError("参考附件数量上限必须是正整数或 null");
  }
  if (!Number.isInteger(maxTotalBytes) || maxTotalBytes < 1) {
    throw new TypeError("参考附件合计上限必须是正整数");
  }
  return {
    accept,
    maxBytesPerAttachment,
    maxCount,
    maxTotalBytes,
  };
}

export function normalizeReferenceAttachment(input, policy) {
  if (!input || typeof input !== "object") {
    throw validationError("参考附件格式不正确");
  }
  const normalized = normalizedPolicy(policy);
  const dataUrl = String(input.dataUrl || "");
  const match = dataUrl.match(
    /^data:((?:image\/[a-z0-9.+-]+)|application\/pdf);base64,([A-Za-z0-9+/=\r\n]+)$/,
  );
  const mimeType = match?.[1] || "";
  if (!match || !normalized.accept.includes(mimeType)) {
    throw validationError(
      `参考附件仅支持 ${formatAcceptedTypes(normalized.accept)}`,
    );
  }

  if (mimeType.startsWith("image/")) {
    return {
      ...normalizeReferenceImage(input, {
        accept: normalized.accept.filter((type) => type.startsWith("image/")),
        maxBytesPerImage: normalized.maxBytesPerAttachment,
      }),
      kind: "image",
    };
  }

  const normalizedBase64 = match[2].replace(/\s/g, "");
  const bytes = Buffer.from(normalizedBase64, "base64");
  if (bytes.length === 0) {
    throw validationError("参考附件内容为空");
  }
  if (bytes.length > normalized.maxBytesPerAttachment) {
    throw validationError(
      `参考附件不能超过 ${formatBytes(normalized.maxBytesPerAttachment)}`,
    );
  }
  if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
    throw validationError("PDF 文件内容不正确");
  }
  if (input.type && input.type !== mimeType) {
    throw validationError("参考附件 MIME 类型不一致");
  }
  if (
    Number.isFinite(input.size) &&
    Number(input.size) > 0 &&
    Number(input.size) !== bytes.length
  ) {
    throw validationError("参考附件字节数校验失败");
  }

  return {
    fileData: normalizedBase64,
    fileName: safeFileName(input.name || "reference.pdf"),
    kind: "file",
    mimeType,
    size: bytes.length,
  };
}

export function normalizeReferenceAttachments(input, policy) {
  if (input == null) return [];
  if (!Array.isArray(input)) {
    throw validationError("参考附件列表格式不正确");
  }
  const normalized = normalizedPolicy(policy);
  if (normalized.maxCount !== null && input.length > normalized.maxCount) {
    throw validationError(`参考附件最多上传 ${normalized.maxCount} 个`);
  }

  const attachments = input.map((attachment) =>
    normalizeReferenceAttachment(attachment, normalized),
  );
  const totalBytes = attachments.reduce(
    (total, attachment) => total + attachment.size,
    0,
  );
  if (totalBytes > normalized.maxTotalBytes) {
    throw validationError(
      `参考附件合计不能超过 ${formatBytes(normalized.maxTotalBytes)}`,
    );
  }
  return attachments;
}

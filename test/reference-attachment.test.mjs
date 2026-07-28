/**
 * [INPUT]: 依赖 node:test/assert 与 src/reference-attachment.mjs 的图片/PDF 多模态附件安全边界
 * [OUTPUT]: 对外提供无数量上限、图片/PDF 分流、PDF 文件签名、MIME 与字节数校验回归保障
 * [POS]: test 的 Style DNA 参考附件契约测试，不读取真实用户文件或调用公司 API
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeReferenceAttachment,
  normalizeReferenceAttachments,
} from "../src/reference-attachment.mjs";

const POLICY = Object.freeze({
  accept: [
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
    "application/pdf",
  ],
  maxBytesPerAttachment: 8 * 1024 * 1024,
  maxCount: null,
  maxTotalBytes: 20 * 1024 * 1024,
});
const PDF_BYTES = Buffer.from("%PDF-1.4\n%%EOF");
const PDF = {
  dataUrl: `data:application/pdf;base64,${PDF_BYTES.toString("base64")}`,
  name: "../moodboard<>.pdf",
  size: PDF_BYTES.length,
  type: "application/pdf",
};
const IMAGE = {
  dataUrl: "data:image/png;base64,aA==",
  name: "reference.png",
  size: 1,
  type: "image/png",
};

test("图片和 PDF 被分流为 Responses 对应附件类型", () => {
  const attachments = normalizeReferenceAttachments([IMAGE, PDF], POLICY);

  assert.equal(attachments[0].kind, "image");
  assert.equal(attachments[0].imageUrl, IMAGE.dataUrl);
  assert.equal(attachments[1].kind, "file");
  assert.equal(attachments[1].fileData, PDF_BYTES.toString("base64"));
  assert.equal(attachments[1].fileName, "..moodboard.pdf");
});

test("无数量上限策略允许一次归一化八个附件", () => {
  assert.equal(
    normalizeReferenceAttachments(Array.from({ length: 8 }, () => IMAGE), POLICY)
      .length,
    8,
  );
});

test("PDF 必须具备真实文件签名并保持 MIME 与字节一致", () => {
  assert.throws(
    () =>
      normalizeReferenceAttachment(
        {
          dataUrl: "data:application/pdf;base64,aA==",
          name: "fake.pdf",
          size: 1,
          type: "application/pdf",
        },
        POLICY,
      ),
    /PDF 文件内容不正确/,
  );
  assert.throws(
    () => normalizeReferenceAttachment({ ...PDF, type: "image/png" }, POLICY),
    /MIME 类型不一致/,
  );
  assert.throws(
    () => normalizeReferenceAttachment({ ...PDF, size: PDF_BYTES.length + 1 }, POLICY),
    /字节数校验失败/,
  );
});

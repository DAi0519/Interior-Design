/**
 * [INPUT]: 依赖 node:test/assert 与 src/reference-image.mjs 的参考图安全边界
 * [OUTPUT]: 对外提供合法 data URL、伪造 MIME 与非法格式的回归保障
 * [POS]: test 的参考图校验契约测试，不上传文件或调用公司 API
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  REFERENCE_IMAGE_POLICY,
  normalizeReferenceImage,
  normalizeReferenceImages,
} from "../src/reference-image.mjs";

const PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z7JkAAAAASUVORK5CYII=";
const PNG_BYTES = Buffer.from(PNG_DATA_URL.split(",")[1], "base64").length;

test("参考图策略限制为最多四张、单张 8MB、合计 20MB", () => {
  assert.deepEqual(REFERENCE_IMAGE_POLICY.accept, [
    "image/png",
    "image/jpeg",
    "image/webp",
  ]);
  assert.equal(
    REFERENCE_IMAGE_POLICY.maxBytesPerImage,
    8 * 1024 * 1024,
  );
  assert.equal(REFERENCE_IMAGE_POLICY.maxCount, 4);
  assert.equal(REFERENCE_IMAGE_POLICY.maxTotalBytes, 20 * 1024 * 1024);
});

test("多张图片保留顺序并拒绝超过四张", () => {
  const image = {
    dataUrl: PNG_DATA_URL,
    name: "reference.png",
    size: PNG_BYTES,
    type: "image/png",
  };
  assert.deepEqual(
    normalizeReferenceImages([
      { ...image, name: "a.png" },
      { ...image, name: "b.png" },
    ]).map((entry) => entry.fileName),
    ["a.png", "b.png"],
  );
  assert.throws(
    () => normalizeReferenceImages([image, image, image, image, image]),
    /最多上传 4 张/,
  );
});

test("合法 PNG 被归一化并清理文件名", () => {
  const image = normalizeReferenceImage({
    dataUrl: PNG_DATA_URL,
    name: "../客厅<>.png",
    size: PNG_BYTES,
    type: "image/png",
  });
  assert.equal(image.fileName, "..客厅.png");
  assert.equal(image.mimeType, "image/png");
  assert.equal(image.size, PNG_BYTES);
  assert.equal(image.imageUrl, PNG_DATA_URL);
});

test("拒绝 SVG、伪造 MIME 和错误字节数", () => {
  assert.throws(
    () =>
      normalizeReferenceImage({
        dataUrl: "data:image/svg+xml;base64,PHN2Zy8+",
        type: "image/svg+xml",
      }),
    /仅支持 PNG、JPEG 或 WebP/,
  );
  assert.throws(
    () =>
      normalizeReferenceImage({
        dataUrl: PNG_DATA_URL,
        type: "image/jpeg",
      }),
    /MIME 类型不一致/,
  );
  assert.throws(
    () =>
      normalizeReferenceImage({
        dataUrl: PNG_DATA_URL,
        size: PNG_BYTES + 1,
        type: "image/png",
      }),
    /字节数校验失败/,
  );
});

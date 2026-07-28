/**
 * [INPUT]: 依赖 node:test/assert 与 image-dimensions.mjs 的图片头解析器
 * [OUTPUT]: 对外提供 PNG/JPEG/WebP 真实宽高及无效字节降级回归保障
 * [POS]: test 的图片尺寸探测单元测试，不进行完整图片解码
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";

import { readImageDimensions } from "../src/image-dimensions.mjs";

test("读取 PNG IHDR 宽高", () => {
  const bytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z7JkAAAAASUVORK5CYII=",
    "base64",
  );
  assert.deepEqual(readImageDimensions(bytes, "image/png"), {
    height: 1,
    width: 1,
  });
});

test("读取 JPEG SOF 宽高", () => {
  const bytes = Buffer.from([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x02,
    0xff, 0xc0, 0x00, 0x0b, 0x08,
    0x04, 0x38,
    0x07, 0x80,
    0x01, 0x01, 0x11, 0x00,
    0xff, 0xd9,
  ]);
  assert.deepEqual(readImageDimensions(bytes, "image/jpeg"), {
    height: 1080,
    width: 1920,
  });
});

test("读取 WebP VP8X 宽高并拒绝无效图片头", () => {
  const bytes = Buffer.alloc(30);
  bytes.write("RIFF", 0, "ascii");
  bytes.writeUInt32LE(22, 4);
  bytes.write("WEBP", 8, "ascii");
  bytes.write("VP8X", 12, "ascii");
  bytes.writeUInt32LE(10, 16);
  bytes.writeUIntLE(1919, 24, 3);
  bytes.writeUIntLE(1079, 27, 3);

  assert.deepEqual(readImageDimensions(bytes, "image/webp"), {
    height: 1080,
    width: 1920,
  });
  assert.equal(readImageDimensions(Buffer.from("invalid"), "image/png"), null);
});

/**
 * [INPUT]: 依赖 node:test/assert 与 image-artifact.mjs 的 data URL 解码、远程下载限制
 * [OUTPUT]: 对外提供图片产物格式、空响应、体积上限与 data URL 回归保障
 * [POS]: test 的共享图片产物基础设施测试，不访问真实网络
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  decodeImageDataUrl,
  extensionForImageFormat,
  loadImageBytes,
} from "../src/image-artifact.mjs";

test("图片格式与 data URL 解码保持确定", async () => {
  assert.equal(extensionForImageFormat("jpeg"), "jpg");
  assert.equal(extensionForImageFormat("PNG"), "png");
  assert.deepEqual(
    decodeImageDataUrl("data:image/png;base64,aGVsbG8="),
    Buffer.from("hello"),
  );
  assert.deepEqual(
    await loadImageBytes("data:image/webp;base64,aGk="),
    Buffer.from("hi"),
  );
});

test("远程图片为空或超过限制时拒绝归档", async () => {
  await assert.rejects(
    () => loadImageBytes("https://example.test/empty", {
      fetchImpl: async () => new Response(Buffer.alloc(0)),
    }),
    /生成结果为空/,
  );
  await assert.rejects(
    () => loadImageBytes("https://example.test/large", {
      fetchImpl: async () => new Response(Buffer.alloc(5)),
      maxBytes: 4,
    }),
    /超过 60MB/,
  );
});

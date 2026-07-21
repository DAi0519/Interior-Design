/**
 * [INPUT]: 依赖 node:test/assert 与 src/oneapi-client.mjs 的图片响应归一化函数
 * [OUTPUT]: 对外提供 Responses 裸 Base64、Images Base64 和 URL 三种返回格式的回归保障
 * [POS]: test 的 OneAPI 响应契约测试，不发送真实 API 请求
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";

import { normalizeImages } from "../src/oneapi-client.mjs";

test("Responses image_generation_call 的 result 裸 Base64 转为 data URL", () => {
  const images = normalizeImages(
    {
      output: [
        {
          result: "aGVsbG8=",
          type: "image_generation_call",
        },
      ],
    },
    "png",
  );

  assert.equal(images[0].url, "data:image/png;base64,aGVsbG8=");
});

test("Images API 的 b64_json 转为 data URL", () => {
  const images = normalizeImages({ data: [{ b64_json: "d29ybGQ=" }] }, "webp");
  assert.equal(images[0].url, "data:image/webp;base64,d29ybGQ=");
});

test("远程 URL 和已成形 data URL 保持不变", () => {
  const remote = "https://example.com/result.png";
  const dataUrl = "data:image/jpeg;base64,aW1hZ2U=";

  assert.equal(normalizeImages({ data: [{ url: remote }] }, "png")[0].url, remote);
  assert.equal(
    normalizeImages(
      { output: [{ result: dataUrl, type: "image_generation_call" }] },
      "jpeg",
    )[0].url,
    dataUrl,
  );
});

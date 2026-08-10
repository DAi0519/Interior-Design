/**
 * [INPUT]: 依赖 node:test/assert 与生成结果下载边界的可注入图片读取器
 * [OUTPUT]: 对外提供跨域代理下载文件名、MIME、字节透传、非法格式和空地址回归保障
 * [POS]: test 的生成结果下载单元测试，不访问网络或写入磁盘
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  generatedImageFileName,
  prepareGeneratedImageDownload,
} from "../src/image-download.mjs";
import { downloadFileNameFromHeader } from "../public/generation-results.js";

test("生成结果下载使用模型名、UTC 时间和真实扩展名", () => {
  assert.equal(
    generatedImageFileName(
      "GPT Image 2 / 精模",
      "jpeg",
      new Date("2026-08-06T12:34:56.000Z"),
    ),
    "GPT-Image-2-精模-2026-08-06T12-34-56Z.jpg",
  );
});

test("下载边界透传受限读取的字节并生成浏览器附件响应", async () => {
  const bytes = Buffer.from("image");
  let loadedUrl;
  const result = await prepareGeneratedImageDownload({
    imageUrl: "https://example.com/result.png",
    modelLabel: "Seedream 5.0",
    outputFormat: "png",
  }, {
    load: async (url) => {
      loadedUrl = url;
      return bytes;
    },
    now: new Date("2026-08-06T12:34:56.000Z"),
  });

  assert.equal(loadedUrl, "https://example.com/result.png");
  assert.equal(result.bytes, bytes);
  assert.equal(result.contentType, "image/png");
  assert.match(result.contentDisposition, /^attachment; filename\*=UTF-8''/);
});

test("拒绝空地址和非图片输出格式", async () => {
  await assert.rejects(prepareGeneratedImageDownload({ outputFormat: "png" }), /不能为空/);
  assert.throws(() => generatedImageFileName("model", "gif"), /不支持下载/);
});

test("浏览器从附件响应头恢复含中文的下载文件名", () => {
  assert.equal(
    downloadFileNameFromHeader(
      "attachment; filename*=UTF-8''Seedream-5.0-%E7%B2%BE%E6%A8%A1.png",
    ),
    "Seedream-5.0-精模.png",
  );
  assert.equal(downloadFileNameFromHeader(""), "生成结果.png");
});

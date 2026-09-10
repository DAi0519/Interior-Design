/**
 * [INPUT]: 依赖 node:test/assert、服务端生成结果下载边界与浏览器端可注入下载传输
 * [OUTPUT]: 对外提供内嵌图片本地 Blob、跨域代理下载、文件名、MIME、字节透传、非法格式和空地址回归保障
 * [POS]: test 的生成结果下载单元测试，用内存替身验证大图不回传服务端，不访问网络或写入磁盘
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  generatedImageFileName,
  prepareGeneratedImageDownload,
} from "../src/image-download.mjs";
import {
  downloadFileNameFromHeader,
  generatedClientImageFileName,
  inlineImageBlob,
  prepareBrowserImageDownload,
} from "../public/generation-results.js";

test("生成结果下载使用模型名、UTC 时间和真实扩展名", () => {
  const now = new Date("2026-08-06T12:34:56.000Z");
  assert.equal(
    generatedImageFileName("GPT Image 2 / 精模", "jpeg", now),
    "GPT-Image-2-精模-2026-08-06T12-34-56Z.jpg",
  );
  assert.equal(
    generatedClientImageFileName("GPT Image 2 / 精模", "jpeg", now),
    generatedImageFileName("GPT Image 2 / 精模", "jpeg", now),
  );
});

test("内嵌大图在浏览器本地转为 Blob，不回传图片下载接口", async () => {
  const imageUrl = `data:image/png;base64,${"A".repeat(31 * 1024 * 1024)}`;
  const blob = { size: 23 * 1024 * 1024, type: "image/png" };
  const result = await prepareBrowserImageDownload({
    imageUrl,
    modelLabel: "SeedVR2 6K",
    outputFormat: "png",
  }, {
    createObjectUrl: (value) => {
      assert.equal(value, blob);
      return "blob:local-upscale";
    },
    createInlineBlob: (value) => {
      assert.equal(value, imageUrl);
      return blob;
    },
    fetchImpl: async () => assert.fail("内嵌图片不应发起 fetch"),
    now: new Date("2026-09-04T10:20:30.000Z"),
  });

  assert.deepEqual(result, {
    fileName: "SeedVR2-6K-2026-09-04T10-20-30Z.png",
    objectUrl: "blob:local-upscale",
    transport: "inline",
  });
});

test("内嵌图片按块解码为正确 MIME 和字节", async () => {
  const chunks = [];
  class BlobStub {
    constructor(parts, options) {
      chunks.push(...parts);
      this.type = options.type;
      this.size = parts.reduce((total, part) => total + part.byteLength, 0);
    }
  }
  const blob = inlineImageBlob("data:image/png;base64,aW1hZ2U=", {
    BlobType: BlobStub,
    decodeBase64: (value) => Buffer.from(value, "base64").toString("binary"),
  });

  assert.equal(blob.type, "image/png");
  assert.equal(blob.size, 5);
  assert.equal(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString(), "image");
});

test("远程图片仍由同源接口代理下载", async () => {
  const calls = [];
  const result = await prepareBrowserImageDownload({
    imageUrl: "https://example.com/result.webp",
    modelLabel: "Flux",
    outputFormat: "webp",
  }, {
    createObjectUrl: () => "blob:proxy-result",
    fetchImpl: async (...args) => {
      calls.push(args);
      return {
        blob: async () => ({ type: "image/webp" }),
        headers: new Headers({
          "Content-Disposition": "attachment; filename*=UTF-8''Flux.webp",
        }),
        ok: true,
      };
    },
  });

  assert.equal(calls[0][0], "/api/image-download");
  assert.equal(JSON.parse(calls[0][1].body).imageUrl, "https://example.com/result.webp");
  assert.deepEqual(result, {
    fileName: "Flux.webp",
    objectUrl: "blob:proxy-result",
    transport: "proxy",
  });
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

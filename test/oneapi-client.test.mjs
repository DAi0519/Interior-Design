/**
 * [INPUT]: 依赖 node:test/assert 与 OneAPI 请求构造、响应归一化、文本提取和错误脱敏函数
 * [OUTPUT]: 对外提供图生图、Style DNA 多轮图片/PDF 与纯文字续改协议、图片/文本响应及敏感错误处理的回归保障
 * [POS]: test 的 OneAPI 响应契约测试，不发送真实 API 请求
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  buildResponseImageRequest,
  buildStyleDnaResponseRequest,
  extractResponseText,
  normalizeImages,
  redactUpstreamMessage,
} from "../src/oneapi-client.mjs";

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

test("Responses 顶层或嵌套 output_text 都能提取", () => {
  assert.equal(extractResponseText({ output_text: "  first  " }), "first");
  assert.equal(
    extractResponseText({
      output: [{ content: [{ text: "one" }, { text: "two" }] }],
    }),
    "one\ntwo",
  );
});

test("参考图生成构造 Responses input_image 与 image_generation 工具", () => {
  const request = buildResponseImageRequest({
    images: [{ image_url: "data:image/jpeg;base64,aA==" }],
    model: "gpt-image-2",
    n: 1,
    output_format: "jpeg",
    prompt: "保持结构并完成材质化",
    quality: "medium",
    response_format: "url",
    size: "1024x1024",
  });

  assert.equal(request.input[0].type, "message");
  assert.equal(request.input[0].content[1].type, "input_image");
  assert.equal(request.tools[0].type, "image_generation");
  assert.equal(request.tools[0].image_format, "jpg");
  assert.equal(request.tools[0].quality, "medium");
  assert.equal("images" in request, false);
  assert.throws(
    () => buildResponseImageRequest({ ...request, images: [{ image_url: "x" }], output_format: "webp" }),
    /仅支持 PNG 或 JPEG/,
  );
});

test("Style DNA 反推仅在最后一条用户消息附加图片与 PDF", () => {
  const request = buildStyleDnaResponseRequest({
    attachments: [
      {
        imageUrl: "data:image/png;base64,aA==",
        kind: "image",
      },
      {
        fileData: "JVBERi0xLjQKJSVFT0Y=",
        fileName: "moodboard.pdf",
        kind: "file",
      },
    ],
    messages: [
      { content: "提取风格", role: "user" },
      { content: '{"style_dna":{}}', role: "assistant" },
      { content: "收敛色彩比例", role: "user" },
    ],
    model: "gpt-5.5",
    systemPrompt: "system",
  });

  assert.equal(request.instructions, "system");
  assert.equal(request.input[0].content.length, 1);
  assert.equal(request.input[1].content[0].type, "output_text");
  assert.equal(request.input[2].content.length, 3);
  assert.equal(request.input[2].content[1].type, "input_image");
  assert.deepEqual(request.input[2].content[2], {
    file_data: "JVBERi0xLjQKJSVFT0Y=",
    filename: "moodboard.pdf",
    type: "input_file",
  });
  assert.equal("tools" in request, false);
});

test("Style DNA 多轮修正允许不重复附加参考图", () => {
  const request = buildStyleDnaResponseRequest({
    attachments: [],
    messages: [
      { content: "已上传 1 张风格参考图", role: "user" },
      { content: '{"style_dna":{}}', role: "assistant" },
      { content: "我希望更法式一些", role: "user" },
    ],
    model: "gpt-5.5",
    systemPrompt: "system",
  });

  assert.equal(request.input[2].content.length, 1);
  assert.equal(request.input[2].content[0].type, "input_text");
  assert.equal(
    request.input.flatMap((message) => message.content).some(
      (content) => content.type === "input_image",
    ),
    false,
  );
});

test("上游错误中的图片和超长二进制内容被脱敏", () => {
  const message = `FileId data:image/jpeg;base64,${"A".repeat(1024)} Not Found`;
  const redacted = redactUpstreamMessage(message);

  assert.equal(redacted, "FileId [IMAGE_DATA_REDACTED] Not Found");
  assert.equal(redacted.includes("AAAA"), false);
});

/**
 * [INPUT]: 依赖 node:test/assert、node:crypto、sharp 与 OneAPI 单图分析/多图评审/生成请求构造、响应归一化、文本提取和错误脱敏函数
 * [OUTPUT]: 对外提供 AI 单图分析、请求侧大图压缩、Claude Chat Completions/其他 Responses 双图评审、图生图、Style DNA 多轮图片/PDF 与纯文字续改协议、图片/文本/真实费用响应及敏感错误处理的回归保障
 * [POS]: test 的 OneAPI 响应契约测试，不发送真实 API 请求
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import sharp from "sharp";

import { DEFAULT_MAX_IMAGE_BASE64_BYTES } from "../src/image-artifact.mjs";

import {
  buildChatCompletionsReviewRequest,
  buildMultiImageReviewRequest,
  buildResponseImageRequest,
  buildSingleImageAnalysisRequest,
  buildStyleDnaResponseRequest,
  createOneApiClient,
  extractResponseText,
  extractUsageCost,
  normalizeImages,
  redactUpstreamMessage,
} from "../src/oneapi-client.mjs";

test("OneAPI 费用保留原币并统一折算 USD", () => {
  assert.deepEqual(extractUsageCost({ usage: { price: {
    currency: "CNY", exchange_rate: 7, payable_amount: 0.333,
  } } }), {
    cost: 0.333,
    costUsd: 0.333 / 7,
    currency: "CNY",
    exchangeRate: 7,
    nativeAmount: 0.333,
  });
  assert.equal(extractUsageCost({ usage: { price: {
    currency: "USD", exchange_rate: 1, payable_amount: 0.0757,
  } } }).costUsd, 0.0757);
  assert.equal(extractUsageCost({ usage: {} }), null);
});

test("单图分析请求只发送当前图片", () => {
  const request = buildSingleImageAnalysisRequest({
    imageUrl: "data:image/png;base64,c2FtcGxl",
    model: "gemini-3.5-flash",
    systemPrompt: "只返回 JSON",
    userPrompt: "识别样本",
  });

  assert.equal(request.input[0].content.length, 2);
  assert.equal(request.input[0].content[1].image_url, "data:image/png;base64,c2FtcGxl");
  assert.equal(request.input[0].content[1].type, "input_image");
  assert.throws(() => buildSingleImageAnalysisRequest({ imageUrl: "" }), /一张图片/);
});

test("OneAPI 单图分析客户端不经过多图数量限制", async (context) => {
  const originalFetch = globalThis.fetch;
  let requestBody;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return new Response(JSON.stringify({
      id: "resp-single-image",
      output_text: '{"category":"客厅"}',
    }), {
      headers: { "content-type": "application/json" },
      status: 200,
    });
  };

  const result = await createOneApiClient("test-key").analyzeImage({
    imageUrl: "data:image/png;base64,c2FtcGxl",
    model: "gemini-3.5-flash",
    systemPrompt: "只返回 JSON",
    userPrompt: "识别样本",
  });

  assert.equal(requestBody.input[0].content[1].type, "input_image");
  assert.equal(requestBody.input[0].content.length, 2);
  assert.equal(result.requestId, "resp-single-image");
});

test("AI 评审请求固定按参考图、结果图顺序发送", () => {
  const request = buildMultiImageReviewRequest({
    imageUrls: ["data:image/png;base64,cmVm", "data:image/png;base64,b3V0"],
    model: "gpt-5.5",
    systemPrompt: "只返回 JSON",
    userPrompt: "开始评分",
  });

  assert.equal(request.input[0].content[1].image_url.endsWith("cmVm"), true);
  assert.equal(request.input[0].content[2].image_url.endsWith("b3V0"), true);
  assert.equal(request.instructions, "只返回 JSON");
  assert.throws(() => buildMultiImageReviewRequest({ imageUrls: ["one"] }), /两张/);
});

test("Claude 双图评审使用 Chat Completions 且省略 OpenAI 专属参数", () => {
  const request = buildChatCompletionsReviewRequest({
    imageUrls: ["data:image/png;base64,cmVm", "data:image/png;base64,b3V0"],
    model: "claude-sonnet-5",
    systemPrompt: "评分规则",
    userPrompt: "开始评分",
  });

  assert.deepEqual(request.messages.map((message) => message.role), ["system", "user"]);
  assert.equal(request.messages[1].content[1].text, "source image:");
  assert.equal(request.messages[1].content[2].image_url.url.endsWith("cmVm"), true);
  assert.equal(request.messages[1].content[3].text, "generated image:");
  assert.equal(request.messages[1].content[4].image_url.url.endsWith("b3V0"), true);
  assert.equal("response_format" in request, false);
  assert.equal("temperature" in request, false);
});

test("非 Claude 双图评审继续使用 Responses", async (context) => {
  const originalFetch = globalThis.fetch;
  let requestUrl;
  let requestBody;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async (url, options) => {
    requestUrl = url;
    requestBody = JSON.parse(options.body);
    return new Response(JSON.stringify({ id: "resp-review", output_text: "ok" }), {
      headers: { "content-type": "application/json" },
      status: 200,
    });
  };

  await createOneApiClient("test-key").reviewImages({
    imageUrls: ["data:image/png;base64,cmVm", "data:image/png;base64,b3V0"],
    model: "gemini-3.1-pro-preview",
    systemPrompt: "只返回 JSON",
    userPrompt: "开始评分",
  });

  assert.match(requestUrl, /\/responses$/);
  assert.equal(requestBody.input[0].content[2].image_url.endsWith("b3V0"), true);
});

test("AI 评审发送前把超限结果图压缩到 4.9MB 内", async (context) => {
  const originalFetch = globalThis.fetch;
  let requestUrl;
  let requestBody;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async (url, options) => {
    requestUrl = url;
    requestBody = JSON.parse(options.body);
    return new Response(JSON.stringify({
      choices: [{ message: { content: "ok" } }],
      id: "resp-review",
    }), {
      headers: { "content-type": "application/json" },
      status: 200,
    });
  };

  const width = 1200;
  const height = 1200;
  const png = await sharp(randomBytes(width * height * 3), {
    raw: { channels: 3, height, width },
  }).png({ compressionLevel: 0 }).toBuffer();
  const oversized = png.toString("base64");
  assert.ok(Buffer.byteLength(oversized, "ascii") > DEFAULT_MAX_IMAGE_BASE64_BYTES);

  await createOneApiClient("test-key").reviewImages({
    imageUrls: [
      "data:image/png;base64,c2FtcGxl",
      `data:image/png;base64,${oversized}`,
    ],
    model: "claude-sonnet-5",
    systemPrompt: "只返回 JSON",
    userPrompt: "开始评分",
  });

  assert.match(requestUrl, /\/chat\/completions$/);
  const sent = requestBody.messages[1].content[4].image_url.url;
  assert.match(sent, /^data:image\/jpeg;base64,/);
  assert.ok(Buffer.byteLength(sent.split(",")[1], "ascii") <= DEFAULT_MAX_IMAGE_BASE64_BYTES);
});

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

test("Responses 与 Chat Completions 文本都能提取", () => {
  assert.equal(extractResponseText({ output_text: "  first  " }), "first");
  assert.equal(
    extractResponseText({
      output: [{ content: [{ text: "one" }, { text: "two" }] }],
    }),
    "one\ntwo",
  );
  assert.equal(
    extractResponseText({ choices: [{ message: { content: "  chat text  " } }] }),
    "chat text",
  );
  assert.equal(
    extractResponseText({
      choices: [{ message: { content: [{ text: "part one" }, { text: "part two" }] } }],
    }),
    "part one\npart two",
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

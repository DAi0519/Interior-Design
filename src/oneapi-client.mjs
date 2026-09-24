/**
 * [INPUT]: 依赖 image-artifact 的请求图片体积收敛、全局 fetch、AbortController 与可选外部取消信号，接收后端内存中的公司 API Key
 * [OUTPUT]: 对外提供固定 180 秒超时/主动取消的 OneAPI 客户端、Prompt Agent 单/双图输入、请求侧图片压缩、图生图、4K-token 多图评审与多轮图片/PDF 请求构造、脱敏诊断、请求 ID/响应/真实费用归一化与错误脱敏
 * [POS]: src 的外部服务边界，Claude 双图评分走 Chat Completions，其余分析/多模态链路走 Responses，文生图走 Images API，并集中记录不含 Key/Prompt/图片正文的失败诊断
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { fitImageDataUrlForRequest } from "./image-artifact.mjs";

const BASE_URL = "https://oneapi.qunhequnhe.com/v1";
const REQUEST_TIMEOUT_MS = 180_000;

function defaultDiagnosticSink(event) {
  process.stderr.write(`[OneAPI] ${JSON.stringify(event)}\n`);
}

function imageBase64Length(imageUrl) {
  const match = String(imageUrl || "").match(/^data:image\/[a-z0-9.+-]+;base64,(.+)$/is);
  return match ? Buffer.byteLength(match[1].replace(/\s/g, ""), "ascii") : null;
}

async function prepareGenerationImages(images) {
  const originalBase64Bytes = images.reduce(
    (total, image) => total + (imageBase64Length(image.image_url) || 0),
    0,
  );
  const prepared = await Promise.all(images.map(async (image) => ({
    ...image,
    image_url: await fitImageDataUrlForRequest(image.image_url),
  })));
  const sentBase64Bytes = prepared.reduce(
    (total, image) => total + (imageBase64Length(image.image_url) || 0),
    0,
  );
  return { images: prepared, originalBase64Bytes, sentBase64Bytes };
}

export class OneApiError extends Error {
  constructor(message, statusCode = 502, code = null) {
    super(message);
    this.name = "OneApiError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

async function parseResponseBody(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  const text = await response.text();
  return text ? { message: text } : {};
}

export function redactUpstreamMessage(value) {
  return String(value || "")
    .replace(
      /data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=\r\n]+/gi,
      "[IMAGE_DATA_REDACTED]",
    )
    .replace(/[a-z0-9+/]{512,}={0,2}/gi, "[BINARY_DATA_REDACTED]")
    .slice(0, 2000);
}

function upstreamMessage(body, fallback) {
  const message =
    body?.error?.message ||
    body?.error?.detail ||
    body?.detail ||
    body?.message ||
    fallback;
  return redactUpstreamMessage(message);
}

function imageSource(entry, outputFormat) {
  if (entry.url) return entry.url;

  const encoded = entry.b64_json || entry.result || null;
  if (!encoded) return null;
  if (/^(?:https?:|data:image\/)/.test(encoded)) return encoded;
  return `data:image/${outputFormat};base64,${encoded}`;
}

export function normalizeImages(body, outputFormat) {
  const entries = Array.isArray(body?.data)
    ? body.data
    : Array.isArray(body?.output)
      ? body.output.filter((item) => item.type === "image_generation_call")
      : [];

  return entries
    .map((entry) => {
      return {
        url: imageSource(entry, outputFormat),
      };
    })
    .filter((image) => image.url);
}

export function extractResponseText(body) {
  if (typeof body?.output_text === "string" && body.output_text.trim()) {
    return body.output_text.trim();
  }

  const chatContent = body?.choices?.[0]?.message?.content;
  if (typeof chatContent === "string" && chatContent.trim()) {
    return chatContent.trim();
  }
  if (Array.isArray(chatContent)) {
    const chatText = chatContent.map((part) => part?.text).filter(Boolean).join("\n").trim();
    if (chatText) return chatText;
  }

  const parts = Array.isArray(body?.output)
    ? body.output.flatMap((item) =>
        Array.isArray(item?.content)
          ? item.content.map((content) => content?.text).filter(Boolean)
          : [],
      )
    : [];
  return parts.join("\n").trim();
}

export function extractUsageCost(body) {
  const price = body?.usage?.price;
  const rawAmount = price?.payable_amount ?? price?.actual_amount;
  if (rawAmount == null) return null;
  const nativeAmount = Number(rawAmount);
  const currency = String(price?.currency || "").trim().toUpperCase();
  const exchangeRate = Number(price?.exchange_rate);
  if (!Number.isFinite(nativeAmount) || nativeAmount < 0 || !currency) return null;
  const costUsd = currency === "USD"
    ? nativeAmount
    : Number.isFinite(exchangeRate) && exchangeRate > 0
      ? nativeAmount / exchangeRate
      : null;
  return {
    cost: currency === "CNY" ? nativeAmount : null,
    costUsd,
    currency,
    exchangeRate: Number.isFinite(exchangeRate) && exchangeRate > 0 ? exchangeRate : null,
    nativeAmount,
  };
}

function responseUsage(body) {
  const usageCost = extractUsageCost(body);
  return usageCost ? { usageCost, ...usageCost } : {};
}

export function buildResponseImageRequest(generationRequest) {
  const images = Array.isArray(generationRequest.images)
    ? generationRequest.images
    : [];
  if (images.length === 0) {
    throw new TypeError("Responses 图生图请求至少需要一张参考图");
  }
  const imageFormat =
    generationRequest.output_format === "jpeg"
      ? "jpg"
      : generationRequest.output_format;
  if (!["jpg", "png"].includes(imageFormat)) {
    throw new OneApiError("图生图目前仅支持 PNG 或 JPEG", 400, "image_format");
  }
  const imageTool = {
    image_format: imageFormat,
    n: generationRequest.n || 1,
    response_format: generationRequest.response_format || "url",
    size: generationRequest.size,
    type: "image_generation",
  };
  if (generationRequest.quality) {
    imageTool.quality = generationRequest.quality;
  }

  return {
    background: false,
    input: [
      {
        content: [
          { text: generationRequest.prompt, type: "input_text" },
          ...images.map((image) => ({
            image_url: image.image_url,
            type: "input_image",
          })),
        ],
        role: "user",
        type: "message",
      },
    ],
    model: generationRequest.model,
    tools: [imageTool],
  };
}

export function buildStyleDnaResponseRequest({
  attachments = [],
  messages,
  model,
  systemPrompt,
}) {
  const latestUserIndex = messages.findLastIndex(
    (message) => message.role === "user",
  );
  return {
    input: messages.map((message, index) => ({
      content: [
        {
          text: message.content,
          type: message.role === "assistant" ? "output_text" : "input_text",
        },
        ...(index === latestUserIndex
          ? attachments.map((attachment) =>
              attachment.kind === "file"
                ? {
                    file_data: attachment.fileData,
                    filename: attachment.fileName,
                    type: "input_file",
                  }
                : {
                    image_url: attachment.imageUrl,
                    type: "input_image",
                  },
            )
          : []),
      ],
      role: message.role,
      type: "message",
    })),
    instructions: systemPrompt,
    max_output_tokens: 4096,
    model,
  };
}

function buildImageAnalysisRequest({
  imageUrls,
  maxOutputTokens = 1024,
  model,
  systemPrompt,
  userPrompt,
}) {
  return {
    input: [
      {
        content: [
          { text: userPrompt, type: "input_text" },
          ...imageUrls.map((imageUrl) => ({
            image_url: imageUrl,
            type: "input_image",
          })),
        ],
        role: "user",
        type: "message",
      },
    ],
    instructions: systemPrompt,
    max_output_tokens: maxOutputTokens,
    model,
  };
}

export function buildSingleImageAnalysisRequest({
  imageUrl,
  model,
  systemPrompt,
  userPrompt,
}) {
  if (typeof imageUrl !== "string" || !imageUrl.trim()) {
    throw new TypeError("单图分析需要一张图片");
  }
  return buildImageAnalysisRequest({
    imageUrls: [imageUrl],
    model,
    systemPrompt,
    userPrompt,
  });
}

export function buildPromptGenerationRequest({
  imageUrl,
  imageUrls,
  model,
  systemPrompt,
  userPrompt,
}) {
  const resolvedImageUrls = imageUrls ?? (imageUrl ? [imageUrl] : []);
  if (
    !Array.isArray(resolvedImageUrls)
    || resolvedImageUrls.length < 1
    || resolvedImageUrls.length > 2
    || resolvedImageUrls.some((value) => typeof value !== "string" || !value.trim())
  ) {
    throw new TypeError("Prompt Agent 需要一至两张图片");
  }
  return buildImageAnalysisRequest({
    imageUrls: resolvedImageUrls,
    maxOutputTokens: 4096,
    model,
    systemPrompt,
    userPrompt,
  });
}

export function buildMultiImageReviewRequest({
  imageUrls,
  model,
  systemPrompt,
  userPrompt,
}) {
  if (!Array.isArray(imageUrls) || imageUrls.length < 2) {
    throw new TypeError("多图评审至少需要两张图片");
  }
  return buildImageAnalysisRequest({
    imageUrls,
    maxOutputTokens: 4096,
    model,
    systemPrompt,
    userPrompt,
  });
}

export function buildChatCompletionsReviewRequest({
  imageUrls,
  model,
  systemPrompt,
  userPrompt,
}) {
  if (!Array.isArray(imageUrls) || imageUrls.length < 2) {
    throw new TypeError("多图评审至少需要两张图片");
  }
  const labels = ["source image", "generated image"];
  return {
    messages: [
      { content: systemPrompt, role: "system" },
      {
        content: [
          { text: userPrompt, type: "text" },
          ...imageUrls.flatMap((imageUrl, index) => [
            { text: `${labels[index] || `image ${index + 1}`}:`, type: "text" },
            { image_url: { url: imageUrl }, type: "image_url" },
          ]),
        ],
        role: "user",
      },
    ],
    model,
  };
}

function isAnthropicModel(model) {
  return /(?:claude|anthropic)/i.test(String(model || ""));
}

export function createOneApiClient(
  apiKey,
  {
    diagnosticSink = defaultDiagnosticSink,
    signal: externalSignal = null,
  } = {},
) {
  const authorization = `Bearer ${apiKey}`;

  function emitDiagnostic(event) {
    try {
      diagnosticSink?.({
        at: new Date().toISOString(),
        ...event,
      });
    } catch {
      // 诊断输出不能影响模型请求。
    }
  }

  async function request(pathname, options = {}, context = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const signal = externalSignal
      ? AbortSignal.any([controller.signal, externalSignal])
      : controller.signal;
    const startedAt = Date.now();
    const requestBytes = Buffer.byteLength(String(options.body || ""), "utf8");
    let responseStatus = null;

    try {
      externalSignal?.throwIfAborted();
      const response = await fetch(`${BASE_URL}${pathname}`, {
        ...options,
        headers: {
          Authorization: authorization,
          "Content-Type": "application/json",
          ...(options.headers || {}),
        },
        signal,
      });
      responseStatus = response.status;
      const body = await parseResponseBody(response);

      if (!response.ok) {
        throw new OneApiError(
          upstreamMessage(body, `公司 API 返回 ${response.status}`),
          response.status,
          body?.error?.code || null,
        );
      }

      return body;
    } catch (error) {
      let normalizedError = error;
      if (externalSignal?.aborted) {
        normalizedError = externalSignal.reason instanceof Error
          ? externalSignal.reason
          : new DOMException("用户已停止任务", "AbortError");
      } else if (!(error instanceof OneApiError) && error.name === "AbortError") {
        normalizedError = new OneApiError(
          "模型请求超过 180 秒，已停止等待；上游任务可能仍在处理，请勿立即重复提交",
          504,
          "timeout",
        );
      } else if (!(error instanceof OneApiError)) {
        normalizedError = new OneApiError(
          `无法连接公司 API：${error.message}`,
          502,
          "network",
        );
      }
      emitDiagnostic({
        code: normalizedError?.code || normalizedError?.name || "unknown",
        elapsedMs: Date.now() - startedAt,
        event: "request_failed",
        method: String(options.method || "GET").toUpperCase(),
        model: context.model || null,
        pathname,
        requestBytes,
        responseStatus,
      });
      throw normalizedError;
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    async analyzeImage({ imageUrl, model, systemPrompt, userPrompt }) {
      const body = await request("/responses", {
        body: JSON.stringify(
          buildSingleImageAnalysisRequest({
            imageUrl,
            model,
            systemPrompt,
            userPrompt,
          }),
        ),
        method: "POST",
      });
      const text = extractResponseText(body);
      if (!text) {
        throw new OneApiError(
          "分析模型已响应，但没有返回结果",
          502,
          "empty_analysis",
        );
      }
      return {
        ...responseUsage(body),
        requestId: body.id || null,
        text,
      };
    },

    async reviewImages({ imageUrls, model, systemPrompt, userPrompt }) {
      const requestImageUrls = await Promise.all(
        imageUrls.map((imageUrl) => fitImageDataUrlForRequest(imageUrl)),
      );
      const anthropic = isAnthropicModel(model);
      const body = await request(anthropic ? "/chat/completions" : "/responses", {
        body: JSON.stringify(anthropic
          ? buildChatCompletionsReviewRequest({
              imageUrls: requestImageUrls,
              model,
              systemPrompt,
              userPrompt,
            })
          : buildMultiImageReviewRequest({
            imageUrls: requestImageUrls,
            model,
            systemPrompt,
            userPrompt,
          })),
        method: "POST",
      });
      const text = extractResponseText(body);
      if (!text) {
        throw new OneApiError(
          "评分模型已响应，但没有返回评分",
          502,
          "empty_review",
        );
      }
      return {
        ...responseUsage(body),
        requestId: body.id || null,
        text,
      };
    },

    async generatePrompt({ imageUrl, imageUrls, model, systemPrompt, userPrompt }) {
      const body = await request("/responses", {
        body: JSON.stringify(buildPromptGenerationRequest({
          imageUrl,
          imageUrls,
          model,
          systemPrompt,
          userPrompt,
        })),
        method: "POST",
      });
      const text = extractResponseText(body);
      if (!text) {
        throw new OneApiError(
          "Prompt Agent 已响应，但没有返回提示词",
          502,
          "empty_prompt",
        );
      }
      return {
        ...responseUsage(body),
        created: body.created_at || body.created || null,
        requestId: body.id || null,
        text,
      };
    },

    async generateStyleDna({
      attachments = [],
      messages,
      model,
      systemPrompt,
    }) {
      const body = await request("/responses", {
        body: JSON.stringify(
          buildStyleDnaResponseRequest({
            attachments,
            messages,
            model,
            systemPrompt,
          }),
        ),
        method: "POST",
      });
      const text = extractResponseText(body);
      if (!text) {
        throw new OneApiError(
          "Style DNA 反推 Agent 已响应，但没有返回内容",
          502,
          "empty_style_dna",
        );
      }
      return { ...responseUsage(body), created: body.created_at || body.created || null, text };
    },

    async generateImage(generationRequest) {
      const useResponses = Boolean(generationRequest.images?.length);
      let preparedRequest = generationRequest;
      if (useResponses) {
        const preparedImages = await prepareGenerationImages(generationRequest.images);
        preparedRequest = {
          ...generationRequest,
          images: preparedImages.images,
        };
        if (preparedImages.sentBase64Bytes < preparedImages.originalBase64Bytes) {
          emitDiagnostic({
            event: "image_input_compressed",
            imageCount: preparedImages.images.length,
            model: generationRequest.model || null,
            originalBase64Bytes: preparedImages.originalBase64Bytes,
            sentBase64Bytes: preparedImages.sentBase64Bytes,
          });
        }
      }
      const requestBody = useResponses
        ? buildResponseImageRequest(preparedRequest)
        : preparedRequest;
      const body = await request(
        useResponses ? "/responses" : "/images/generations",
        {
          body: JSON.stringify(requestBody),
          method: "POST",
        },
        { model: generationRequest.model || null },
      );
      const images = normalizeImages(body, generationRequest.output_format);

      if (images.length === 0) {
        throw new OneApiError("API 已响应，但没有返回可展示的图片", 502, "empty_image");
      }

      return {
        ...responseUsage(body),
        created: body.created_at || body.created || null,
        images,
        outputFormat: body.output_format || generationRequest.output_format,
        quality: generationRequest.quality || null,
        requestId: body.id || null,
        transport: useResponses ? "responses" : "images-generations",
      };
    },

    async listModels() {
      const body = await request("/models", { method: "GET" });
      return Array.isArray(body?.data) ? body.data : [];
    },
  };
}

/**
 * [INPUT]: 依赖 image-artifact 的请求图片体积收敛、全局 fetch、AbortController 与可选外部取消信号，接收后端内存中的公司 API Key
 * [OUTPUT]: 对外提供可超时/主动取消的 OneAPI 客户端、单图分析、图生图、4K-token 限额内多图评审与多轮图片/PDF 文本请求构造、请求 ID/响应/真实费用归一化与错误脱敏
 * [POS]: src 的外部服务边界，Claude 双图评分走 Chat Completions，其余分析/多模态链路走 Responses，文生图走 Images API
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { fitImageDataUrlForRequest } from "./image-artifact.mjs";

const BASE_URL = "https://oneapi.qunhequnhe.com/v1";
const REQUEST_TIMEOUT_MS = 180_000;

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

export function createOneApiClient(apiKey, { signal: externalSignal = null } = {}) {
  const authorization = `Bearer ${apiKey}`;

  async function request(pathname, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const signal = externalSignal
      ? AbortSignal.any([controller.signal, externalSignal])
      : controller.signal;

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
      if (error instanceof OneApiError) throw error;
      if (externalSignal?.aborted) {
        throw externalSignal.reason instanceof Error
          ? externalSignal.reason
          : new DOMException("用户已停止任务", "AbortError");
      }
      if (error.name === "AbortError") {
        throw new OneApiError("模型请求超时，请稍后重试", 504, "timeout");
      }
      throw new OneApiError(`无法连接公司 API：${error.message}`, 502, "network");
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

    async generatePrompt({ imageUrl, model, systemPrompt, userPrompt }) {
      const body = await request("/responses", {
        body: JSON.stringify({
          input: [
            {
              content: [
                { text: userPrompt, type: "input_text" },
                { image_url: imageUrl, type: "input_image" },
              ],
              role: "user",
            },
          ],
          instructions: systemPrompt,
          max_output_tokens: 4096,
          model,
        }),
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
      const requestBody = useResponses
        ? buildResponseImageRequest(generationRequest)
        : generationRequest;
      const body = await request(
        useResponses ? "/responses" : "/images/generations",
        {
          body: JSON.stringify(requestBody),
          method: "POST",
        },
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

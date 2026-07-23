/**
 * [INPUT]: 依赖全局 fetch 与 AbortController，接收后端内存中的公司 API Key
 * [OUTPUT]: 对外提供 OneAPI 客户端、图生图 Responses 请求构造、响应归一化与错误脱敏
 * [POS]: src 的外部服务边界，文生图走 Images API，含参考图请求走 Responses image_generation
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

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

  const parts = Array.isArray(body?.output)
    ? body.output.flatMap((item) =>
        Array.isArray(item?.content)
          ? item.content.map((content) => content?.text).filter(Boolean)
          : [],
      )
    : [];
  return parts.join("\n").trim();
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
    tools: [
      {
        image_format: imageFormat,
        n: generationRequest.n || 1,
        response_format: generationRequest.response_format || "url",
        size: generationRequest.size,
        type: "image_generation",
      },
    ],
  };
}

export function createOneApiClient(apiKey) {
  const authorization = `Bearer ${apiKey}`;

  async function request(pathname, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${BASE_URL}${pathname}`, {
        ...options,
        headers: {
          Authorization: authorization,
          "Content-Type": "application/json",
          ...(options.headers || {}),
        },
        signal: controller.signal,
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
      if (error.name === "AbortError") {
        throw new OneApiError("模型请求超时，请稍后重试", 504, "timeout");
      }
      throw new OneApiError(`无法连接公司 API：${error.message}`, 502, "network");
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
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
      return { created: body.created_at || body.created || null, text };
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
        created: body.created_at || body.created || null,
        images,
        outputFormat: body.output_format || generationRequest.output_format,
        quality: useResponses ? null : generationRequest.quality || null,
        transport: useResponses ? "responses" : "images-generations",
      };
    },

    async listModels() {
      const body = await request("/models", { method: "GET" });
      return Array.isArray(body?.data) ? body.data : [];
    },
  };
}

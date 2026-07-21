/**
 * [INPUT]: 依赖全局 fetch 与 AbortController，接收后端内存中的公司 API Key
 * [OUTPUT]: 对外提供 createOneApiClient、normalizeImages 与 OneApiError，封装模型查询和图片生成
 * [POS]: src 的外部服务边界，统一处理 OneAPI 鉴权、超时、错误响应和图片数据格式
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

function upstreamMessage(body, fallback) {
  return (
    body?.error?.message ||
    body?.error?.detail ||
    body?.detail ||
    body?.message ||
    fallback
  );
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
        revisedPrompt: entry.revised_prompt || null,
        url: imageSource(entry, outputFormat),
      };
    })
    .filter((image) => image.url);
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
        throw new OneApiError("图片生成超时，请稍后重试", 504, "timeout");
      }
      throw new OneApiError(`无法连接公司 API：${error.message}`, 502, "network");
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    async generateImage(generationRequest) {
      const body = await request("/images/generations", {
        body: JSON.stringify(generationRequest),
        method: "POST",
      });
      const images = normalizeImages(body, generationRequest.output_format);

      if (images.length === 0) {
        throw new OneApiError("API 已响应，但没有返回可展示的图片", 502, "empty_image");
      }

      return {
        created: body.created || null,
        images,
        outputFormat: body.output_format || generationRequest.output_format,
      };
    },

    async listModels() {
      const body = await request("/models", { method: "GET" });
      return Array.isArray(body?.data) ? body.data : [];
    },
  };
}

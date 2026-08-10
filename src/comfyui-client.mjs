/**
 * [INPUT]: 依赖 Node fetch/FormData/Blob、Flux2 Klein 工作流工厂、单张已校验参考图、可覆盖的 ComfyUI 服务地址与可选取消信号
 * [OUTPUT]: 对外提供 ComfyUI 健康检查、可取消图片上传/工作流排队/轮询、输出下载与统一 generateImage 结果
 * [POS]: src 的第二图像生成服务边界，与 oneapi-client.mjs 并列并隐藏 ComfyUI 异步协议
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { randomInt, randomUUID } from "node:crypto";

import {
  AI_TEXTURE_WORKFLOW,
  aiTextureWorkflowMetadata,
  createAiTextureWorkflow,
} from "./ai-texture-workflow.mjs";

export const DEFAULT_COMFYUI_BASE_URL =
  "http://maas-workflow-app-50-prodtestzwapp50.k8s-zhongwei.qunhequnhe.com/";

const DEFAULT_POLL_INTERVAL_MS = 1_000;
const DEFAULT_TIMEOUT_MS = 300_000;
const MAX_OUTPUT_BYTES = 60 * 1024 * 1024;

export class ComfyUiError extends Error {
  constructor(message, statusCode = 502, code = null) {
    super(message);
    this.name = "ComfyUiError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

function normalizedBaseUrl(value) {
  const url = new URL(String(value || DEFAULT_COMFYUI_BASE_URL));
  if (!/^https?:$/.test(url.protocol)) {
    throw new TypeError("ComfyUI 地址只支持 HTTP 或 HTTPS");
  }
  url.pathname = url.pathname.replace(/\/?$/, "/");
  url.search = "";
  url.hash = "";
  return url;
}

function endpoint(baseUrl, pathname, search = null) {
  const url = new URL(String(pathname).replace(/^\//, ""), baseUrl);
  if (search) {
    for (const [key, value] of Object.entries(search)) {
      url.searchParams.set(key, String(value ?? ""));
    }
  }
  return url;
}

function dataImage(value) {
  const match = String(value || "").match(
    /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\r\n]+)$/,
  );
  if (!match) {
    throw new ComfyUiError(
      "ComfyUI 工作流只接受 PNG、JPEG 或 WebP 参考图",
      400,
      "invalid_input_image",
    );
  }
  return {
    bytes: Buffer.from(match[2].replace(/\s/g, ""), "base64"),
    mimeType: match[1],
  };
}

function safeUploadName(fileName, mimeType) {
  const extension = mimeType === "image/jpeg" ? "jpg" : mimeType.split("/")[1];
  const base = String(fileName || "reference")
    .replace(/\.[^.]+$/, "")
    .replace(/[^\p{L}\p{N}._-]/gu, "-")
    .replace(/-+/g, "-")
    .slice(0, 60) || "reference";
  return `canvas-lab-${randomUUID()}-${base}.${extension}`;
}

function uploadedImageName(upload) {
  if (!upload?.name) {
    throw new ComfyUiError("ComfyUI 已响应上传请求，但没有返回图片名", 502, "empty_upload");
  }
  return upload.subfolder ? `${upload.subfolder}/${upload.name}` : upload.name;
}

function outputImage(history) {
  const preferred = history?.outputs?.[AI_TEXTURE_WORKFLOW.outputNodeId]?.images;
  if (Array.isArray(preferred) && preferred[0]?.filename) return preferred[0];
  for (const output of Object.values(history?.outputs || {})) {
    if (Array.isArray(output?.images) && output.images[0]?.filename) {
      return output.images[0];
    }
  }
  return null;
}

function executionTimes(history, queuedAt) {
  const messages = Array.isArray(history?.status?.messages)
    ? history.status.messages
    : [];
  const start = messages.find(([name]) => name === "execution_start")?.[1]?.timestamp;
  const success = messages.find(([name]) => name === "execution_success")?.[1]?.timestamp;
  return {
    created: Number.isFinite(success) ? Math.floor(success / 1000) : null,
    executionDurationMs:
      Number.isFinite(start) && Number.isFinite(success)
        ? Math.max(0, success - start)
        : null,
    queueDurationMs: Number.isFinite(start) ? Math.max(0, start - queuedAt) : null,
  };
}

function executionFailure(history) {
  const messages = Array.isArray(history?.status?.messages)
    ? history.status.messages
    : [];
  const failure = messages.find(([name]) =>
    ["execution_error", "execution_interrupted"].includes(name));
  const detail = failure?.[1]?.exception_message || failure?.[1]?.node_type;
  return String(detail || "ComfyUI 工作流执行失败").slice(0, 1000);
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function createComfyUiClient({
  baseUrl = process.env.COMFYUI_BASE_URL || DEFAULT_COMFYUI_BASE_URL,
  fetchImpl = globalThis.fetch,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  randomSeed = () => randomInt(0, 2 ** 32),
  requestTimeoutMs = DEFAULT_TIMEOUT_MS,
  waitImpl = wait,
  workflowFactory = createAiTextureWorkflow,
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new TypeError("ComfyUI client requires fetch");
  }
  const serviceUrl = normalizedBaseUrl(baseUrl);

  async function fetchWithTimeout(pathname, options = {}, search = null) {
    const timeoutSignal = AbortSignal.timeout(requestTimeoutMs);
    const signal = options.signal
      ? AbortSignal.any([timeoutSignal, options.signal])
      : timeoutSignal;
    try {
      return await fetchImpl(endpoint(serviceUrl, pathname, search), {
        ...options,
        signal,
      });
    } catch (error) {
      if (options.signal?.aborted && options.signal.reason?.name !== "TimeoutError") {
        throw options.signal.reason instanceof Error
          ? options.signal.reason
          : new DOMException("用户已停止任务", "AbortError");
      }
      if (error.name === "TimeoutError" || error.name === "AbortError") {
        throw new ComfyUiError("ComfyUI 请求超时", 504, "timeout");
      }
      throw new ComfyUiError(
        `无法连接 ComfyUI：${String(error.message || error).slice(0, 500)}`,
        502,
        "network",
      );
    }
  }

  async function requestJson(pathname, options = {}) {
    const response = await fetchWithTimeout(pathname, options);
    let body = {};
    try {
      body = await response.json();
    } catch {
      body = {};
    }
    if (!response.ok) {
      const message =
        body?.error?.message || body?.error || body?.message || `HTTP ${response.status}`;
      throw new ComfyUiError(
        `ComfyUI 返回错误：${String(message).slice(0, 1000)}`,
        response.status >= 400 && response.status < 600 ? response.status : 502,
        "upstream",
      );
    }
    return body;
  }

  async function uploadReference(image, signal = null) {
    const parsed = dataImage(image.image_url);
    const form = new FormData();
    form.append(
      "image",
      new Blob([parsed.bytes], { type: parsed.mimeType }),
      safeUploadName(image.fileName, parsed.mimeType),
    );
    form.append("type", "input");
    form.append("overwrite", "false");
    return uploadedImageName(
      await requestJson("upload/image", { body: form, method: "POST", signal }),
    );
  }

  async function waitForHistory(promptId, queuedAt, signal = null) {
    const deadline = Date.now() + requestTimeoutMs;
    while (Date.now() <= deadline) {
      signal?.throwIfAborted();
      const body = await requestJson(`history/${encodeURIComponent(promptId)}`, { signal });
      const history = body?.[promptId];
      if (history) {
        if (history.status?.completed && history.status?.status_str !== "success") {
          throw new ComfyUiError(executionFailure(history), 502, "execution_failed");
        }
        if (outputImage(history)) return history;
        if (history.status?.completed) {
          throw new ComfyUiError(
            "ComfyUI 工作流已完成，但没有返回图片",
            502,
            "empty_output",
          );
        }
      }
      await waitImpl(pollIntervalMs);
    }
    throw new ComfyUiError("ComfyUI 工作流执行超时", 504, "execution_timeout");
  }

  async function downloadOutput(image, signal = null) {
    const response = await fetchWithTimeout("view", { signal }, {
      filename: image.filename,
      subfolder: image.subfolder || "",
      type: image.type || "output",
    });
    if (!response.ok) {
      throw new ComfyUiError(
        `读取 ComfyUI 输出失败（${response.status}）`,
        response.status,
        "output_download",
      );
    }
    const contentType = String(response.headers.get("content-type") || "")
      .split(";", 1)[0];
    if (!/^image\/(?:png|jpeg|webp)$/.test(contentType)) {
      throw new ComfyUiError("ComfyUI 输出不是支持的图片格式", 502, "output_format");
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0) {
      throw new ComfyUiError("ComfyUI 输出图片为空", 502, "empty_output");
    }
    if (bytes.length > MAX_OUTPUT_BYTES) {
      throw new ComfyUiError("ComfyUI 输出图片超过 60MB", 502, "output_too_large");
    }
    return {
      outputFormat: contentType === "image/jpeg" ? "jpeg" : contentType.split("/")[1],
      url: `data:${contentType};base64,${bytes.toString("base64")}`,
    };
  }

  return {
    async checkHealth() {
      const body = await requestJson("system_stats", {
        method: "GET",
        signal: AbortSignal.timeout(Math.min(requestTimeoutMs, 10_000)),
      });
      return {
        available: Boolean(body?.system?.comfyui_version),
        version: body?.system?.comfyui_version || null,
      };
    },

    async generateImage(generationRequest, { signal = null } = {}) {
      signal?.throwIfAborted();
      const images = Array.isArray(generationRequest.images)
        ? generationRequest.images
        : [];
      if (images.length !== 1) {
        throw new ComfyUiError(
          "Flux2 Klein 需要且只允许 1 张参考图",
          400,
          "reference_count",
        );
      }

      const imageName = await uploadReference(images[0], signal);
      const seed = randomSeed();
      const prompt = workflowFactory({
        imageName,
        prompt: generationRequest.prompt,
        seed,
      });
      const queuedAt = Date.now();
      const queued = await requestJson("prompt", {
        body: JSON.stringify({ client_id: randomUUID(), prompt }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
        signal,
      });
      if (!queued?.prompt_id) {
        const nodeError = Object.values(queued?.node_errors || {})[0];
        throw new ComfyUiError(
          String(nodeError?.errors?.[0]?.message || "ComfyUI 没有返回 prompt_id"),
          502,
          "empty_prompt_id",
        );
      }

      const history = await waitForHistory(queued.prompt_id, queuedAt, signal);
      const output = outputImage(history);
      const downloaded = await downloadOutput(output, signal);
      const times = executionTimes(history, queuedAt);
      return {
        created: times.created,
        images: [{ url: downloaded.url }],
        metadata: aiTextureWorkflowMetadata({
          executionDurationMs: times.executionDurationMs,
          promptId: queued.prompt_id,
          queueDurationMs: times.queueDurationMs,
          seed,
        }),
        outputFormat: downloaded.outputFormat,
        quality: null,
        transport: "comfyui-workflow",
      };
    },
  };
}

/**
 * [INPUT]: 依赖 Node fetch/WebSocket/crypto、comfyui-timing数字分段计时、可注入的工作流/输出节点/产物命名/元数据适配器及单调时钟、图片与可覆盖的地址/时限/取消信号
 * [OUTPUT]: 对外提供ComfyUI只读探测/原子生成、请求级产物/尺寸SHA校验、阶段/取消/超时/安全读取重试和废弃view body非阻塞释放；保留旧History耗时并统一附仅数字timing
 * [POS]: src 的通用 ComfyUI 传输边界，与 oneapi-client.mjs 并列并让 Flux 生图、SeedVR2 超分及 AI 扩图复用同一异步协议
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createHash, randomInt, randomUUID } from "node:crypto";
import { readImageDimensions } from "./image-dimensions.mjs";
import { createComfyTiming } from "./comfyui-timing.mjs";

import {
  AI_TEXTURE_WORKFLOW,
  aiTextureArtifactPrefix,
  aiTextureWorkflowMetadata,
  createAiTextureWorkflow,
} from "./ai-texture-workflow.mjs";

export const DEFAULT_COMFYUI_BASE_URL =
  "http://maas-workflow-app-50-prodtestzwapp50.k8s-zhongwei.qunhequnhe.com/";

const DEFAULT_POLL_INTERVAL_MS = 1_000;
const DEFAULT_TIMEOUT_MS = 300_000;
const MAX_OUTPUT_BYTES = 60 * 1024 * 1024;
const MAX_OUTPUT_DOWNLOAD_ATTEMPTS = 60;
const OUTPUT_DOWNLOAD_RETRY_INTERVAL_MS = 1_000;
const MAX_GATEWAY_READ_ATTEMPTS = 3;
const WEB_SOCKET_READY_TIMEOUT_MS = 2_000;
const TRANSIENT_GATEWAY_STATUSES = new Set([502, 503, 504]);

export class ComfyUiError extends Error {
  constructor(message, statusCode = 502, code = null, details = null) {
    super(message);
    this.name = "ComfyUiError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

function promptNodeFailures(body) {
  const failures = [];
  for (const [nodeId, node] of Object.entries(body?.node_errors || {})) {
    const errors = Array.isArray(node?.errors) ? node.errors : [];
    for (const error of errors) {
      const summary = String(error?.message || "").trim();
      const detail = String(error?.details || "").trim();
      failures.push({
        classType: String(node?.class_type || "").trim(),
        inputName: String(error?.extra_info?.input_name || "").trim(),
        message:
          summary && detail && detail !== summary
            ? `${summary}（${detail}）`
            : summary || detail || "节点输入无效",
        nodeId,
        type: String(error?.type || "").trim(),
      });
    }
  }
  return failures;
}

function promptValidationError(body, statusCode = 502) {
  const failures = promptNodeFailures(body);
  if (failures.length === 0) return null;
  const message = failures
    .slice(0, 3)
    .map((failure) => {
      const node = failure.classType || failure.nodeId;
      const input = failure.inputName ? `.${failure.inputName}` : "";
      return `${node}${input}：${failure.message}`;
    })
    .join("；");
  return new ComfyUiError(
    `ComfyUI 节点校验失败：${message}`.slice(0, 1000),
    statusCode,
    "prompt_validation",
    { nodeFailures: failures },
  );
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

function websocketEndpoint(baseUrl, clientId) {
  const url = endpoint(baseUrl, "ws", { clientId });
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url;
}

function executionProgressObserver({
  artifactKey,
  onProgress,
  serviceUrl,
  webSocketFactory,
}) {
  if (typeof onProgress !== "function" || typeof webSocketFactory !== "function") {
    return {
      close() {},
      markExecuting() {},
      phase() { return null; },
      ready: null,
      setPromptId() {},
    };
  }
  let activePromptId = null;
  let lastPhase = null;
  let promptId = null;
  let ready = Promise.resolve();
  let socket = null;
  const notify = (phase) => {
    if (phase === lastPhase) return;
    lastPhase = phase;
    try {
      onProgress({ phase, promptId });
    } catch {
      // 进度展示失败不能中断图片生成。
    }
  };
  try {
    socket = webSocketFactory(websocketEndpoint(serviceUrl, artifactKey));
    ready = new Promise((resolve) => {
      const timer = setTimeout(resolve, WEB_SOCKET_READY_TIMEOUT_MS);
      const settle = () => {
        clearTimeout(timer);
        resolve();
      };
      socket.addEventListener("close", settle);
      socket.addEventListener("error", settle);
      socket.addEventListener("open", settle);
    });
    socket.addEventListener("message", (event) => {
      if (typeof event.data !== "string") return;
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      const eventPromptId = String(message?.data?.prompt_id || "");
      const started = message?.type === "execution_start"
        || (message?.type === "executing" && message?.data?.node != null);
      if (!started || !eventPromptId) return;
      activePromptId = eventPromptId;
      if (promptId === eventPromptId) notify("executing");
    });
  } catch {
    socket = null;
  }
  return {
    close() {
      try {
        socket?.close();
      } catch {
        // WebSocket 关闭失败不影响已经完成的结果。
      }
    },
    ready,
    phase() {
      return lastPhase;
    },
    markExecuting() {
      notify("executing");
    },
    setPromptId(value) {
      promptId = String(value || "");
      notify("queued");
      if (activePromptId === promptId) notify("executing");
    },
  };
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

function outputImage(history, outputNodeId) {
  const preferred = history?.outputs?.[outputNodeId]?.images;
  if (Array.isArray(preferred) && preferred[0]?.filename) return preferred[0];
  for (const output of Object.values(history?.outputs || {})) {
    if (Array.isArray(output?.images) && output.images[0]?.filename) {
      return output.images[0];
    }
  }
  return null;
}

function queueContainsPrompt(items, promptId) {
  return Array.isArray(items) && items.some((item) => {
    if (Array.isArray(item)) return String(item[1] || "") === promptId;
    return String(item?.prompt_id || "") === promptId;
  });
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
  if (!failure) return null;
  const detail = failure?.[1]?.exception_message || failure?.[1]?.node_type;
  const exceptionType = String(failure?.[1]?.exception_type || "");
  const nodeType = String(failure?.[1]?.node_type || "ComfyUI 节点");
  if (/OutOfMemory/i.test(exceptionType) || /out of memory/i.test(String(detail || ""))) {
    return `${nodeType} GPU 显存不足（${exceptionType || "OutOfMemory"}）`;
  }
  return String(detail || "ComfyUI 工作流执行失败").slice(0, 1000);
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function releaseUnusedResponse(response) {
  // --- 释放失败view响应，避免占住连接；清理异常不得覆盖或阻塞原错误 ---
  try { response?.body?.cancel?.()?.catch?.(() => {}); } catch {}
}

export function createComfyUiClient({
  artifactPrefix = aiTextureArtifactPrefix,
  baseUrl = process.env.COMFYUI_BASE_URL || DEFAULT_COMFYUI_BASE_URL,
  fetchImpl = globalThis.fetch,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  randomId = randomUUID,
  randomSeed = () => randomInt(0, 2 ** 32),
  requestTimeoutMs = DEFAULT_TIMEOUT_MS,
  waitImpl = wait,
  webSocketFactory = (url) => new WebSocket(url),
  referenceImageCount = 1,
  workflowFactory = createAiTextureWorkflow,
  workflowMetadataFactory = aiTextureWorkflowMetadata,
  outputNodeId = AI_TEXTURE_WORKFLOW.outputNodeId,
  timingNow = () => performance.now(),
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

  async function requestJson(pathname, { retryGateway = false, requireJson = false, timing = null, timingStage = null, ...options } = {}) {
    const attempts = retryGateway ? MAX_GATEWAY_READ_ATTEMPTS : 1;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const measured = timing?.request(timingStage);
      const response = await fetchWithTimeout(pathname, options);
      measured?.headers(response);
      let body = {};
      measured?.bodyStart();
      try {
        body = await response.json();
      } catch {
        if (requireJson && response.ok) {
          throw new ComfyUiError("ComfyUI 节点目录响应无效或读取超时", 502, "invalid_response");
        }
        body = {};
      } finally { measured?.bodyDone(); }
      if (response.ok) return body;
      if (
        retryGateway &&
        TRANSIENT_GATEWAY_STATUSES.has(response.status) &&
        attempt < attempts - 1
      ) {
        const delay = () => waitImpl(Math.min(pollIntervalMs, 1_000));
        if (timing) await timing.wait(timingStage, "retry", delay);
        else await delay();
        continue;
      }
      const validationError = promptValidationError(
        body,
        response.status >= 400 && response.status < 600 ? response.status : 502,
      );
      if (validationError) throw validationError;
      if (TRANSIENT_GATEWAY_STATUSES.has(response.status)) {
        throw new ComfyUiError(
          `远端 ComfyUI 服务暂不可用（网关 ${response.status}），请稍后重试`,
          response.status,
          "service_unavailable",
        );
      }
      const message =
        body?.error?.message || body?.error || body?.message || `HTTP ${response.status}`;
      throw new ComfyUiError(
        `ComfyUI 返回错误：${String(message).slice(0, 1000)}`,
        response.status >= 400 && response.status < 600 ? response.status : 502,
        "upstream",
      );
    }
    throw new ComfyUiError(
      "远端 ComfyUI 服务暂不可用，请稍后重试",
      502,
      "service_unavailable",
    );
  }

  async function waitForHistory(
    promptId,
    queuedAt,
    signal = null,
    executionTimeoutMs = requestTimeoutMs,
    queueTimeoutMs = null,
    progressObserver = null,
    timing = null,
  ) {
    const hasSeparateQueueTimeout = Number.isFinite(queueTimeoutMs);
    const queueDeadline = queuedAt + (
      hasSeparateQueueTimeout ? queueTimeoutMs : executionTimeoutMs
    );
    let executionDeadline = null;
    const observeExecutionStart = () => {
      if (progressObserver?.phase?.() === "executing" && executionDeadline === null) {
        executionDeadline = Date.now() + executionTimeoutMs;
      }
    };
    while (true) {
      signal?.throwIfAborted();
      observeExecutionStart();
      timing?.poll();
      const body = await requestJson(`history/${encodeURIComponent(promptId)}`, {
        retryGateway: true,
        signal,
        timing, timingStage: "history",
      });
      const history = body?.[promptId];
      timing?.observeHistory(history, Boolean(outputImage(history, outputNodeId)));
      if (history) {
        const executionStarted = history.status?.messages?.find?.(
          ([name]) => name === "execution_start",
        )?.[1]?.timestamp;
        if (Number.isFinite(executionStarted) && executionDeadline === null) {
          executionDeadline = executionStarted + executionTimeoutMs;
        }
        if (Number.isFinite(executionStarted)) progressObserver?.markExecuting?.();
        const failure = executionFailure(history);
        if (failure) {
          throw new ComfyUiError(
            `${failure}（Prompt ID：${promptId}）`,
            502,
            "execution_failed",
            { promptId },
          );
        }
        if (history.status?.completed && history.status?.status_str !== "success") {
          throw new ComfyUiError(
            `ComfyUI 工作流执行失败（Prompt ID：${promptId}）`,
            502,
            "execution_failed",
            { promptId },
          );
        }
        if (outputImage(history, outputNodeId)) return history;
        if (history.status?.completed) {
          throw new ComfyUiError(
            "ComfyUI 工作流已完成，但没有返回图片",
            502,
            "empty_output",
          );
        }
      }
      if (hasSeparateQueueTimeout && executionDeadline === null) {
        const queue = await requestJson("queue", {
          retryGateway: true,
          signal,
          timing, timingStage: "queueProbe",
        });
        if (queueContainsPrompt(queue?.queue_running, promptId)) {
          progressObserver?.markExecuting?.();
          observeExecutionStart();
        }
      }
      observeExecutionStart();
      const now = Date.now();
      if (executionDeadline !== null && now > executionDeadline) {
        throw new ComfyUiError(
          `ComfyUI 节点执行超时（Prompt ID：${promptId}）`,
          504,
          "execution_timeout",
          { promptId },
        );
      }
      if (executionDeadline === null && now > queueDeadline) {
        if (!hasSeparateQueueTimeout) {
          throw new ComfyUiError(
            "ComfyUI 工作流执行超时",
            504,
            "execution_timeout",
          );
        }
        throw new ComfyUiError(
          `ComfyUI 排队超时，任务未开始执行（Prompt ID：${promptId}）`,
          504,
          "queue_timeout",
          { promptId },
        );
      }
      if (timing) await timing.wait("history", "poll", () => waitImpl(pollIntervalMs));
      else await waitImpl(pollIntervalMs);
    }
  }

  async function downloadOutput(image, artifactKey, signal = null, timing = null) {
    const expectedPrefix = artifactPrefix(artifactKey);
    const outputFilename = String(image?.filename || "");
    if (!outputFilename.startsWith(`${expectedPrefix}_`)) {
      throw new ComfyUiError(
        "ComfyUI 输出与本次请求身份不一致",
        502,
        "output_identity",
        { expectedPrefix, outputFilename },
      );
    }
    let response;
    let measured;
    for (let attempt = 0; attempt < MAX_OUTPUT_DOWNLOAD_ATTEMPTS; attempt += 1) {
      measured = timing?.request("view");
      response = await fetchWithTimeout("view", { signal }, {
        filename: image.filename,
        subfolder: image.subfolder || "",
        type: image.type || "output",
      });
      measured?.headers(response);
      if (
        response.ok ||
        (response.status !== 404 && !TRANSIENT_GATEWAY_STATUSES.has(response.status))
      ) break;
      if (attempt < MAX_OUTPUT_DOWNLOAD_ATTEMPTS - 1) {
        releaseUnusedResponse(response);
        const delay = () => waitImpl(Math.min(pollIntervalMs, OUTPUT_DOWNLOAD_RETRY_INTERVAL_MS));
        if (timing) await timing.wait("view", "retry", delay);
        else await delay();
      }
    }
    if (!response?.ok) {
      releaseUnusedResponse(response);
      throw new ComfyUiError(
        `读取 ComfyUI 输出失败（${response?.status || 502}）`,
        response?.status || 502,
        "output_download",
      );
    }
    const finishTypeValidation = timing?.start("validationMs", "view");
    const contentType = String(response.headers.get("content-type") || "")
      .split(";", 1)[0];
    if (!/^image\/(?:png|jpeg|webp)$/.test(contentType)) {
      releaseUnusedResponse(response);
      throw new ComfyUiError("ComfyUI 输出不是支持的图片格式", 502, "output_format");
    }
    finishTypeValidation?.();
    measured?.bodyStart();
    const bytes = Buffer.from(await response.arrayBuffer());
    measured?.bodyDone();
    timing?.set("outputBytes", bytes.length, "view");
    const finishValidation = timing?.start("validationMs", "view");
    if (bytes.length === 0) {
      throw new ComfyUiError("ComfyUI 输出图片为空", 502, "empty_output");
    }
    if (bytes.length > MAX_OUTPUT_BYTES) {
      throw new ComfyUiError("ComfyUI 输出图片超过 60MB", 502, "output_too_large");
    }
    const dimensions = readImageDimensions(bytes, contentType) || {};
    const outputSha256 = createHash("sha256").update(bytes).digest("hex");
    finishValidation?.();
    const finishBase64 = timing?.start("base64Ms", "view");
    const url = `data:${contentType};base64,${bytes.toString("base64")}`;
    finishBase64?.();
    return {
      ...dimensions,
      outputFormat: contentType === "image/jpeg" ? "jpeg" : contentType.split("/")[1],
      outputFilename,
      outputSha256,
      url,
    };
  }

  return {
    async getObjectInfo(classTypes = null) {
      const options = {
        method: "GET",
        requireJson: true,
        retryGateway: true,
        signal: AbortSignal.timeout(Math.min(requestTimeoutMs, 10_000)),
      };
      if (!Array.isArray(classTypes)) return requestJson("object_info", options);
      const results = await Promise.all(classTypes.map((type) => requestJson(`object_info/${encodeURIComponent(type)}`, options)));
      return Object.assign({}, ...results);
    },
    async checkHealth() {
      const body = await requestJson("system_stats", {
        method: "GET",
        retryGateway: true,
        signal: AbortSignal.timeout(Math.min(requestTimeoutMs, 10_000)),
      });
      return {
        available: Boolean(body?.system?.comfyui_version),
        version: body?.system?.comfyui_version || null,
      };
    },

    async generateImage(
      generationRequest,
      {
        executionTimeoutMs = requestTimeoutMs,
        onProgress = null,
        queueTimeoutMs = null,
        signal = null,
      } = {},
    ) {
      const timing = createComfyTiming({ now: timingNow });
      const finishInput = timing.start("inputPreparationMs");
      signal?.throwIfAborted();
      const images = Array.isArray(generationRequest.images)
        ? generationRequest.images
        : [];
      if (images.length !== referenceImageCount) {
        throw new ComfyUiError(
          `ComfyUI工作流需要且只允许 ${referenceImageCount} 张参考图`,
          400,
          "reference_count",
        );
      }

      const reference = dataImage(images[0].image_url);
      let inputBytes = reference.bytes.length;
      const references = referenceImageCount === 2 ? images.map((image, index) => {
        const decoded = dataImage(image.image_url);
        if (index > 0) inputBytes += decoded.bytes.length;
        const dimensions = readImageDimensions(decoded.bytes, decoded.mimeType);
        if (!dimensions) throw new ComfyUiError("无法读取双图真实尺寸", 400, "invalid_input_image");
        return { ...dimensions, base64: decoded.bytes.toString("base64") };
      }) : null;
      const width = Number(generationRequest.width || 2048);
      const height = Number(generationRequest.height || 2048);
      const resolution = String(generationRequest.resolution || "2K");
      const seed = randomSeed();
      const artifactKey = randomId();
      finishInput();
      timing.set("inputBytes", inputBytes);
      const finishSocketSetup = timing.start("webSocketSetupMs");
      const progressObserver = executionProgressObserver({
        artifactKey,
        onProgress,
        serviceUrl,
        webSocketFactory,
      });
      finishSocketSetup();
      const queuedAt = Date.now();
      timing.queuedAt(queuedAt);
      let result;
      try {
        const finishSocketWait = timing.start("webSocketWaitMs");
        if (progressObserver.ready) await progressObserver.ready;
        finishSocketWait();
        signal?.throwIfAborted();
        const finishWorkflow = timing.start("workflowBuildMs");
        const prompt = workflowFactory({
          artifactKey,
          generationRequest,
          imageBase64: reference.bytes.toString("base64"),
          ...(references ? { references } : {}),
          height,
          negativePrompt: generationRequest.negative_prompt,
          prompt: generationRequest.prompt,
          seed,
          width,
        });
        finishWorkflow();
        const finishSerialize = timing.start("promptSerializeMs");
        const body = JSON.stringify({ client_id: artifactKey, prompt });
        timing.set("promptBytes", Buffer.byteLength(body));
        finishSerialize();
        const finishPrompt = timing.phase("prompt");
        const queued = await requestJson("prompt", {
          body,
          headers: { "Content-Type": "application/json" },
          method: "POST",
          signal,
          timing, timingStage: "prompt",
        });
        finishPrompt();
        if (!queued?.prompt_id) {
          const validationError = promptValidationError(queued);
          if (validationError) throw validationError;
          throw new ComfyUiError(
            "ComfyUI 没有返回 prompt_id",
            502,
            "empty_prompt_id",
          );
        }
        progressObserver.setPromptId(queued.prompt_id);

        const finishHistory = timing.phase("history");
        const history = await waitForHistory(
          queued.prompt_id,
          queuedAt,
          signal,
          executionTimeoutMs,
          queueTimeoutMs,
          progressObserver,
          timing,
        );
        finishHistory();
        const output = outputImage(history, outputNodeId);
        const finishDownload = timing.phase("view");
        const downloaded = await downloadOutput(output, artifactKey, signal, timing);
        finishDownload();
        const times = executionTimes(history, queuedAt);
        result = {
          created: times.created,
          images: [{ url: downloaded.url }],
          metadata: workflowMetadataFactory({
            historyOutputs: history.outputs,
            actualOutputHeight: downloaded.height,
            actualOutputWidth: downloaded.width,
            artifactKey,
            executionDurationMs: times.executionDurationMs,
            generationRequest,
            height,
            negativePromptMode: String(
              generationRequest.negative_prompt_mode || "default",
            ),
            outputFilename: downloaded.outputFilename,
            outputSha256: downloaded.outputSha256,
            promptId: queued.prompt_id,
            queueDurationMs: times.queueDurationMs,
            resolution,
            seed,
            width,
          }),
          outputFormat: downloaded.outputFormat,
          quality: null,
          transport: "comfyui-workflow",
        };
      } finally {
        progressObserver.close();
      }
      result.metadata = { ...result.metadata, timing: timing.finish() };
      return result;
    },
  };
}

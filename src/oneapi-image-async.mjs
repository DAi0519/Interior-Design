/**
 * [INPUT]: 依赖已构造的无mask图片编辑请求、注入的OneAPI JSON请求函数、AbortController及Node可取消计时等待
 * [OUTPUT]: 对外提供buildAsyncImageEditRequest与runAsyncImageEdit，保留原图字节和顺序，单次后台提交/同ID轮询/共享总截止时间及即时上游ID回调
 * [POS]: src 的OneAPI异步图像传输边界，被oneapi-client消费；不压缩图片、不选择供应商、不解析或重编码最终产物
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { setTimeout as delay } from "node:timers/promises";

const RESPONSE_ID = /^resp_[A-Za-z0-9_-]+$/;
const WAITING_STATUSES = new Set(["queued", "in_progress"]);
const TERMINAL_FAILURES = new Set(["failed", "cancelled", "incomplete"]);
const failure = (message, statusCode, code) => Object.assign(new Error(message), { statusCode, code });

export function buildAsyncImageEditRequest(generationRequest) {
  if (generationRequest?.mask != null) {
    throw failure("Responses后台异步暂不支持mask，请使用圈选或纯指令编辑", 409, "async_mask_unsupported");
  }
  const images = generationRequest?.images;
  if (!Array.isArray(images) || !images.length
    || images.some(image => typeof image?.image_url !== "string" || !image.image_url.trim())) {
    throw failure("异步图像编辑至少需要一张有效原图", 400, "image_input");
  }
  const imageFormat = generationRequest.output_format === "jpeg" ? "jpg" : generationRequest.output_format || "png";
  if (!["png", "jpg"].includes(imageFormat)) {
    throw failure("异步图像编辑仅支持PNG或JPEG输出", 400, "image_format");
  }
  const responseFormat = generationRequest.response_format || "b64_json";
  if (!["url", "b64_json"].includes(responseFormat)) {
    throw failure("异步图像结果格式应为url或b64_json", 400, "image_response_format");
  }
  const tool = { type: "image_generation", n: generationRequest.n ?? 1,
    image_format: imageFormat, response_format: responseFormat };
  if (generationRequest.size != null) tool.size = generationRequest.size;
  if (generationRequest.quality != null) tool.quality = generationRequest.quality;
  return { model: generationRequest.model, background: true,
    input: [{ type: "message", role: "user", content: [
      { type: "input_text", text: generationRequest.prompt },
      ...images.map(image => ({ type: "input_image", image_url: image.image_url })),
    ] }], tools: [tool] };
}

export async function runAsyncImageEdit(generationRequest, {
  request, signal, onSubmitted = () => {}, pollIntervalMs = 1_500, timeoutMs = 600_000,
}) {
  if (signal?.aborted) throw signal.reason;
  if (typeof request !== "function") throw new TypeError("异步图像请求函数尚未配置");
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647
    || !Number.isFinite(pollIntervalMs) || pollIntervalMs < 0) {
    throw new TypeError("异步图像超时与轮询间隔必须为有效毫秒数");
  }
  const body = buildAsyncImageEditRequest(generationRequest);
  const controller = new AbortController();
  const deadline = Date.now() + timeoutMs;
  let responseId = null;
  const forwardAbort = () => controller.abort(signal.reason);
  signal?.addEventListener("abort", forwardAbort, { once: true });
  const expire = () => {
    if (controller.signal.aborted) return;
    const error = failure(`异步图像生成超过${timeoutMs / 1_000}秒，已停止等待；上游任务可能仍在处理，请勿立即重复提交${responseId ? `（上游ID：${responseId}）` : ""}`,
      504, "timeout");
    error.stage = "image";
    error.timeoutMs = timeoutMs;
    if (responseId) error.responseId = responseId;
    controller.abort(error);
  };
  const timer = setTimeout(expire, timeoutMs);
  let rejectAbort;
  const aborted = new Promise((resolve, reject) => { rejectAbort = reject; });
  aborted.catch(() => {});
  const reportAbort = () => rejectAbort(controller.signal.reason);
  controller.signal.addEventListener("abort", reportAbort, { once: true });
  if (signal?.aborted) forwardAbort();

  function remainingTime() {
    if (Date.now() >= deadline) expire();
    if (controller.signal.aborted) throw controller.signal.reason;
    return Math.max(1, deadline - Date.now());
  }
  const bounded = operation => {
    remainingTime();
    return Promise.race([Promise.resolve().then(operation), aborted]);
  };
  const call = (path, options) => bounded(() => request(path, options, {
    model: generationRequest.model, stage: "image", signal: controller.signal, timeoutMs: remainingTime(),
  }));
  const taskError = (message, code) => Object.assign(failure(message, 502, code), { responseId });

  try {
    // -------- 收费POST始终只提交一次；拿到ID后所有查询都绑定同一上游任务 --------
    let result = await call("/responses", { method: "POST", body: JSON.stringify(body) });
    if (typeof result?.id !== "string" || !RESPONSE_ID.test(result.id)) {
      throw taskError("异步图像提交响应缺少有效的resp_任务ID，禁止重复提交", "async_response_id");
    }
    responseId = result.id;
    await bounded(() => onSubmitted({ id: responseId, status: result.status }));
    while (true) {
      remainingTime();
      if (result.status === "completed") return result;
      if (TERMINAL_FAILURES.has(result.status)) {
        throw taskError(`上游异步图像任务以${result.status}结束（上游ID：${responseId}）`, `async_${result.status}`);
      }
      if (!WAITING_STATUSES.has(result.status)) {
        throw taskError(`上游异步图像任务返回未知状态（上游ID：${responseId}）`, "async_status");
      }
      await bounded(() => delay(Math.min(pollIntervalMs, remainingTime()), undefined, { signal: controller.signal }));
      result = await call(`/responses/${encodeURIComponent(responseId)}`, { method: "GET" });
      if (result?.id !== responseId) {
        throw taskError(`异步图像查询响应与提交任务ID不一致（上游ID：${responseId}）`, "async_response_mismatch");
      }
    }
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    if (controller.signal.aborted) throw controller.signal.reason;
    if (responseId && error instanceof Error && Object.isExtensible(error)) error.responseId = responseId;
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", forwardAbort);
    controller.signal.removeEventListener("abort", reportAbort);
  }
}

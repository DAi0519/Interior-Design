/**
 * [INPUT]: 依赖可注入的本地单调时钟/墙钟、HTTP响应的数字状态与Date头、同次History的执行时间戳
 * [OUTPUT]: 对外提供createComfyTiming请求级分段计时器，仅输出有限数字叶子、状态计数与取图尝试，不保存URL/Prompt/图片/密钥
 * [POS]: src的ComfyUI只观测计时边界，被comfyui-client消费；不调度请求、不改变重试、超时或工作流
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export function createComfyTiming({ now = () => performance.now(), wallNow = Date.now } = {}) {
  const started = now();
  const group = () => ({ requestCount: 0, headersMs: 0, bodyMs: 0, networkMs: 0,
    retryWaitCount: 0, retryWaitMs: 0, statusCounts: {} });
  const data = { version: 1, clock: { startedAtEpochMs: wallNow(), comparisonsUseMixedClocks: 1 },
    prompt: group(), history: { ...group(), pollCount: 0, emptyPollCount: 0, pendingPollCount: 0, pollWaitCount: 0, pollWaitMs: 0 },
    queueProbe: group(), view: { ...group(), attempts: [] } };
  const elapsed = start => Math.max(0, now() - start);
  const offset = () => elapsed(started);
  const add = (target, key, value) => { target[key] = (target[key] || 0) + value; };

  function start(field, stage = null) {
    const at = now();
    return () => add(stage ? data[stage] : data, field, elapsed(at));
  }

  function phase(stage) {
    const at = now();
    data[stage].startedAtMs = offset();
    return () => {
      data[stage].totalMs = elapsed(at);
      data[stage].completedAtMs = offset();
    };
  }

  function request(stage) {
    const target = data[stage];
    const at = now();
    const attempt = { attempt: ++target.requestCount, status: 0, headersMs: 0, bodyMs: 0, bodyRead: 0 };
    let bodyAt;
    if (stage === "view") target.attempts.push(attempt);
    if (stage === "prompt") data.clock.promptStartedAtEpochMs = wallNow();
    return {
      headers(response) {
        attempt.headersMs = elapsed(at);
        attempt.status = Number(response.status) || 0;
        add(target, "headersMs", attempt.headersMs);
        add(target, "networkMs", attempt.headersMs);
        add(target.statusCounts, String(attempt.status), 1);
        if (stage === "prompt") {
          target.headersAtMs = offset();
          data.clock.promptHeadersAtEpochMs = wallNow();
          const date = Date.parse(response.headers?.get?.("date") || "");
          if (Number.isFinite(date)) {
            data.clock.promptServerDateEpochMs = date;
            data.clock.serverDateResolutionMs = 1000;
          }
        }
      },
      bodyStart() { bodyAt = now(); },
      bodyDone() {
        attempt.bodyMs = elapsed(bodyAt);
        attempt.bodyRead = 1;
        add(target, "bodyMs", attempt.bodyMs);
        add(target, "networkMs", attempt.bodyMs);
        if (stage === "prompt") data.clock.promptAckAtEpochMs = wallNow();
      },
    };
  }

  async function wait(stage, kind, task) {
    const target = data[stage], at = now();
    add(target, `${kind}WaitCount`, 1);
    try { return await task(); }
    finally { add(target, `${kind}WaitMs`, elapsed(at)); }
  }

  function observeHistory(history, hasOutput) {
    if (!history) { data.history.emptyPollCount += 1; return; }
    if (!hasOutput) data.history.pendingPollCount += 1;
    const messages = history?.status?.messages || [];
    for (const [message, key] of [["execution_start", "executionStartEpochMs"], ["execution_success", "executionSuccessEpochMs"]]) {
      const timestamp = messages.find?.(([name]) => name === message)?.[1]?.timestamp;
      if (Number.isFinite(timestamp)) data.clock[key] = timestamp;
    }
    if (hasOutput && data.history.firstOutputObservedAtMs === undefined) data.history.firstOutputObservedAtMs = offset();
    if ((Number.isFinite(data.clock.executionSuccessEpochMs)
      || history?.status?.completed && history.status.status_str === "success")
      && data.history.firstSuccessObservedAtMs === undefined) data.history.firstSuccessObservedAtMs = offset();
  }

  return {
    start, phase, request, wait, observeHistory,
    set(field, value, stage = null) {
      if (Number.isFinite(value)) (stage ? data[stage] : data)[field] = value;
    },
    queuedAt(value) { if (Number.isFinite(value)) data.clock.queuedAtEpochMs = value; },
    poll() { data.history.pollCount += 1; },
    finish() {
      data.totalMs = offset();
      // --- 仅保留原始跨时钟差，允许负值；POST确认可能晚于开工，不能命名为纯排队 ---
      const { promptAckAtEpochMs: ack, executionStartEpochMs: execution } = data.clock;
      if (Number.isFinite(ack) && Number.isFinite(execution)) {
        data.clock.postAckMinusExecutionStartCrossClockMs = ack - execution;
        data.clock.postAckAfterExecutionStartCrossClock = Number(ack >= execution);
      }
      return structuredClone(data);
    },
  };
}

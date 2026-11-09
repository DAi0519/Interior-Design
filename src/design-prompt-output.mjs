/**
 * [INPUT]: 依赖Agent返回的纯文本/JSON正文和用户补充原文，无外部服务
 * [OUTPUT]: 对外提供自由设计正文校验与用户原文前置，拒绝空内容和明显损坏JSON，不限定设计字段
 * [POS]: src 的空房/旧房/户型布局自由正文基础合同；平面图机位仅复用用户原文前置，不持有系统提示词
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const workflowError = (message, statusCode = 502) => Object.assign(new Error(message), { statusCode });

export function normalizeDesignPromptOutput(text) {
  const normalized = typeof text === "string"
    ? text.trim().replace(/^```(?:json|text|markdown)?(?=\s|$)\s*/i, "").replace(/\s*```$/, "").trim()
    : "";
  if (!normalized) throw workflowError("Prompt Agent 返回内容为空", 502);
  let payload;
  try {
    payload = JSON.parse(normalized);
  } catch {
    // -------- 明显截断的 JSON 不作为纯文本继续收费出图 --------
    if (/^\{/.test(normalized) || /^\[\s*(?:["{[\]\d-]|true\b|false\b|null\b|$)/.test(normalized)) {
      throw workflowError("Prompt Agent 没有返回合法 JSON", 502);
    }
    return normalized;
  }
  const hasText = (value) => {
    if (typeof value === "string") return Boolean(value.trim());
    return value !== null && typeof value === "object"
      && Object.values(value).some(hasText);
  };
  if (!hasText(payload)) throw workflowError("Prompt Agent 返回内容为空", 502);
  return JSON.stringify(typeof payload === "string" ? payload.trim() : payload, null, 2);
}

export function prependDesignUserRequirements(agentPrompt, userRequirements) {
  let payload;
  try {
    payload = JSON.parse(agentPrompt);
  } catch {
    // -------- 纯文本保留正文；用户原文独立放在首段 --------
  }
  const body = typeof payload === "string" ? payload : agentPrompt;
  if (!userRequirements) return body;
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    delete payload.user_requirements;
    return JSON.stringify({ user_requirements: userRequirements, ...payload }, null, 2);
  }
  return `user_requirements:\n${userRequirements}\n\n${body}`;
}


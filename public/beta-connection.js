/**
 * [INPUT]: 依赖共享连接中心、当前批量会话以及模型权限和工作流目录接口
 * [OUTPUT]: 原页更新连接、额度和权限，隔离过期响应，保留已选任务与表单草稿
 * [POS]: public 的批量连接适配层，不重载样本或重启任务监控
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { bindConnectionCenter } from "./connection-center.js?v=10";

export function bindBetaConnection({ api, state, showStatus, renderAccess, updateWorkflows, renderSummary }) {
  let accessRevision = 0;

  async function refreshAccess({ keepDraft = false } = {}) {
    if (!keepDraft && accessRevision) return;
    const revision = ++accessRevision;
    if (keepDraft) state.keepModelDraft = true;
    const connected = state.connected;
    state.agentAccessChecked = state.modelAccessChecked = false;
    state.agentAccess.clear();
    state.modelAccess.clear();
    state.modelAccessProblem = connected ? "正在检测模型权限" : "请先连接 OneAPI";
    if (keepDraft) renderSummary();

    const [access, workflows] = await Promise.allSettled([
      connected ? api("/api/check-models", { method: "POST" }) : null,
      keepDraft ? api("/api/beta/config") : null,
    ]);
    if (revision !== accessRevision) return;
    if (access.status === "fulfilled" && access.value) {
      state.modelAccess = new Map(access.value.models.map(model => [model.key, model]));
      state.agentAccess = new Map(access.value.agentModels.map(model => [model.key, model]));
      state.agentAccessChecked = state.modelAccessChecked = true;
      state.modelAccessProblem = "";
    } else if (connected) {
      state.modelAccessProblem = "模型权限检测失败，请重新连接后再试";
    }
    if (workflows.status === "fulfilled" && workflows.value) updateWorkflows(workflows.value);
    renderAccess({ permissionsOnly: keepDraft });
    const message = state.modelAccessProblem || (workflows.status === "rejected" ? "工作流权限读取失败" : "服务已连接");
    showStatus(message, { ready: message === "服务已连接", error: access.status === "rejected" || workflows.status === "rejected" });
  }

  const center = bindConnectionCenter({
    api,
    onApiStateChange(session) {
      state.connected = session.connected;
      state.modelAccessProblem = session.connected ? "正在检测模型权限" : "请先连接 OneAPI";
    },
    onApiConnected: () => refreshAccess({ keepDraft: true }),
    onApiDisconnected: () => void refreshAccess({ keepDraft: true }),
    showToast: showStatus,
  });

  return { load: () => center.load({ autoOpen: false }), refreshAccess };
}

export function renderBetaPromptAgentModels({ state, elements, fillSelect, renderRunSummary }) {
  const models = state.catalog.agentModels.filter((model) => model.imageInput);
  const previousKey = elements.promptAgentModelSelect.value;
  const previous = models.find((model) => model.key === previousKey);
  fillSelect(elements.promptAgentModelSelect, models.map((model) => {
    const access = state.agentAccess.get(model.key);
    const disabled = state.agentAccessChecked && !access?.selectable;
    return { disabled, label: disabled ? `${model.label} · ${access?.reason || "当前不可用"}` : model.label, value: model.key };
  }), previousKey || "gemini3pro");
  if (state.keepModelDraft && previous) elements.promptAgentModelSelect.value = previousKey;
  const selected = models.find((model) => model.key === elements.promptAgentModelSelect.value);
  const changed = Boolean(previous && previous.key !== selected?.key);
  const denied = selected && state.agentAccessChecked && !state.agentAccess.get(selected.key)?.selectable;
  elements.promptAgentAvailability.textContent = !state.connected
    ? "请先连接 OneAPI"
    : !state.agentAccessChecked
      ? state.modelAccessProblem || "正在检测模型权限"
      : denied
        ? `${selected.label} 当前 Key 不可用，请选择其他模型`
        : changed && selected
          ? `${previous.label} 当前不可用，已切换为 ${selected.label}`
          : selected
            ? "当前 API Key 已开放此模型"
            : "当前 API Key 没有可用的提示词模型";
  elements.promptAgentAvailability.hidden = Boolean(state.connected && state.agentAccessChecked && selected && !changed && !denied);
  elements.promptAgentAvailability.classList.toggle("error", !state.connected || state.agentAccessChecked && (!selected || changed || Boolean(denied)));
  renderRunSummary();
}

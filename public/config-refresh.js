/**
 * [INPUT]: 依赖页面 refreshConfigButton、调用方 API/风格应用/Toast 回调
 * [OUTPUT]: 对外提供 bindConfigRefresh，管理飞书配置主动刷新的单次请求与反馈
 * [POS]: public 的配置刷新交互控制器，与 app.js 的生图状态和上传流程隔离
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export function renderPromptAgentVersion(promptAgent) {
  const version = document.querySelector("#promptAgentVersion");
  version.textContent = promptAgent?.version ? `v${promptAgent.version}` : "v—";
  version.title = promptAgent?.name || "融合 Agent 版本未读取";
}

export function bindConfigRefresh({ api, onStyles, showToast }) {
  const button = document.querySelector("#refreshConfigButton");
  const styleAvailability = document.querySelector("#styleAvailability");
  const styleNote = document.querySelector("#styleNote");
  const styleSelect = document.querySelector("#styleSelect");
  let pending = false;

  function apply(body) {
    onStyles(body.styles);
    renderPromptAgentVersion(body.promptAgent);
  }

  async function load() {
    styleAvailability.textContent = "读取中";
    try {
      apply(await api("/api/styles"));
    } catch (error) {
      onStyles([]);
      styleSelect.replaceChildren();
      styleSelect.disabled = true;
      styleAvailability.textContent = "读取失败";
      styleAvailability.classList.remove("ready");
      styleNote.textContent = error.message;
    }
  }

  button.addEventListener("click", async () => {
    if (pending) return;
    pending = true;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.querySelector("span").textContent = "刷新中";

    try {
      const body = await api("/api/config/refresh", { method: "POST" });
      apply(body);
      showToast(`配置已更新 · Prompt Agent v${body.promptAgent.version}`);
    } catch (error) {
      showToast(`配置刷新失败：${error.message}`);
    } finally {
      pending = false;
      button.disabled = false;
      button.removeAttribute("aria-busy");
      button.querySelector("span").textContent = "刷新";
    }
  });

  return load;
}

/**
 * [INPUT]: 依赖页面 Style DNA 与场景融合 Agent 刷新按钮、调用方 API/双版本目录应用/Toast 回调
 * [OUTPUT]: 对外提供 bindConfigRefresh，管理双入口共享的飞书配置单次刷新、互斥状态与版本目录反馈
 * [POS]: public 的配置刷新交互控制器，与 app.js 的生图状态和上传流程隔离
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export function bindConfigRefresh({
  api,
  onPromptAgentVersions,
  onStyles,
  showToast,
}) {
  const buttons = Array.from(document.querySelectorAll("[data-config-refresh]"));
  const styleAvailability = document.querySelector("#styleAvailability");
  const styleNote = document.querySelector("#styleNote");
  const styleSelect = document.querySelector("#styleSelect");
  let pending = false;

  function apply(body) {
    onStyles(body.styles);
    onPromptAgentVersions(body.promptAgent);
  }

  async function load() {
    styleAvailability.textContent = "读取中";
    try {
      apply(await api("/api/styles"));
    } catch (error) {
      onStyles([]);
      onPromptAgentVersions({ defaultVersion: null, versions: [] });
      styleSelect.replaceChildren();
      styleSelect.disabled = true;
      styleAvailability.textContent = "读取失败";
      styleAvailability.classList.remove("ready");
      styleNote.textContent = error.message;
    }
  }

  function setPending(value) {
    for (const button of buttons) {
      button.disabled = value;
      if (value) button.setAttribute("aria-busy", "true");
      else button.removeAttribute("aria-busy");
      button.querySelector("[data-refresh-label]").textContent = value
        ? "刷新中"
        : "刷新";
    }
  }

  async function refresh() {
    if (pending) return;
    pending = true;
    setPending(true);

    try {
      const body = await api("/api/config/refresh", { method: "POST" });
      apply(body);
      showToast(
        `配置已更新 · Style DNA ${body.styles.length} 条 · 融合 Agent ${body.promptAgent.versions.length} 个版本`,
      );
    } catch (error) {
      showToast(`配置刷新失败：${error.message}`);
    } finally {
      pending = false;
      setPending(false);
    }
  }

  for (const button of buttons) {
    button.addEventListener("click", refresh);
  }

  return load;
}

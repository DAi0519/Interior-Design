/**
 * [INPUT]: 依赖页面飞书配置刷新按钮、调用方 API、智能默认/Style DNA/融合 Agent/精模 Prompt 目录应用与 Toast 回调
 * [OUTPUT]: 对外提供 bindConfigRefresh，管理多入口共享的飞书配置单次刷新、互斥状态与四类脱敏配置反馈
 * [POS]: public 的配置刷新交互控制器，与 app.js 的生图状态和上传流程隔离
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export function bindConfigRefresh({
  api,
  onPromptAgentVersions,
  onRefinedPromptVersions,
  onSmartDefault,
  onStyles,
  showToast,
}) {
  const buttons = Array.from(document.querySelectorAll("[data-config-refresh]"));
  const styleAvailability = document.querySelector("#styleAvailability");
  const styleNote = document.querySelector("#styleNote");
  let pending = false;

  function apply(body) {
    onStyles(body.styles);
    onSmartDefault(body.smartDefault);
    onPromptAgentVersions(body.promptAgent);
    onRefinedPromptVersions(body.refinedPrompt);
  }

  async function load() {
    styleAvailability.textContent = "读取中";
    try {
      apply(await api("/api/styles"));
    } catch (error) {
      onStyles([]);
      onSmartDefault({ available: false, reason: error.message, version: null });
      onPromptAgentVersions({ defaultVersion: null, versions: [] });
      onRefinedPromptVersions({ defaultVersion: null, versions: [] });
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
        `配置已更新 · 智能默认 ${body.smartDefault.available ? `v${body.smartDefault.version}` : "不可用"} · Style DNA ${body.styles.length} 条 · 融合 Agent ${body.promptAgent.versions.length} 个版本 · 精模 Prompt ${body.refinedPrompt.versions.length} 个版本`,
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

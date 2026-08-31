/**
 * [INPUT]: 依赖页面飞书配置刷新按钮、调用方 API、效果图美化当前上架 Prompt 状态、白模与空房双模式 Agent/Style DNA/精模 Prompt 目录应用与 Toast 回调
 * [OUTPUT]: 对外提供效果图美化 Prompt 脱敏状态映射与 bindConfigRefresh，管理多入口共享的飞书配置单次刷新、互斥状态与双模式脱敏配置反馈
 * [POS]: public 的配置刷新交互控制器，与 app.js 的生图状态和上传流程隔离
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export function effectEnhancementPromptStatus(config = {}) {
  if (config.available && Number.isInteger(config.version)) {
    return {
      availability: `Prompt v${config.version} · 已上架`,
      note: `当前使用「${config.name || "效果图美化 Prompt"}」v${config.version}（已上架）；环境效果可单选或组合，组合时时段优先。`,
      ready: true,
    };
  }
  return {
    availability: "Prompt 未配置",
    note: `未读取到可用的上架 Prompt：${config.reason || "请检查飞书配置并刷新"}。`,
    ready: false,
  };
}

export function bindConfigRefresh({
  api,
  onEmptyRoom,
  onPromptAgentVersions,
  onRefinedPromptVersions,
  onSmartDefault,
  onStyles,
  showToast,
}) {
  const buttons = Array.from(document.querySelectorAll("[data-config-refresh]"));
  const styleAvailability = document.querySelector("#styleAvailability");
  const styleNote = document.querySelector("#styleNote");
  const effectPromptAvailability = document.querySelector("#effectPromptAvailability");
  const effectPromptNote = document.querySelector("#effectPromptNote");
  let pending = false;
  const unavailableEmptyRoom = (reason) => ({
    promptAgent: { defaultVersion: null, reason, versions: [] },
    smartDefault: { available: false, reason, version: null },
  });
  const unavailableEffectPrompt = (reason) => ({ available: false, reason, version: null });

  function renderEffectPrompt(config) {
    const status = effectEnhancementPromptStatus(config);
    effectPromptAvailability.textContent = status.availability;
    effectPromptAvailability.classList.toggle("ready", status.ready);
    effectPromptNote.textContent = status.note;
  }

  function apply(body) {
    renderEffectPrompt(body.effectEnhancementPrompt || unavailableEffectPrompt(
      "当前服务尚未提供效果图美化 Prompt 状态，请重启工作台",
    ));
    onEmptyRoom(body.emptyRoom || unavailableEmptyRoom(
      "当前服务尚未提供空房双模式配置，请重启工作台",
    ));
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
      onEmptyRoom(unavailableEmptyRoom(error.message));
      renderEffectPrompt(unavailableEffectPrompt(error.message));
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
      const emptyRoom = body.emptyRoom || unavailableEmptyRoom("不可用");
      const effectPrompt = body.effectEnhancementPrompt || unavailableEffectPrompt("不可用");
      showToast(
        `配置已更新 · 效果图美化 Prompt ${effectPrompt.available ? `v${effectPrompt.version}` : "不可用"} · 白模 ${body.smartDefault.available ? `v${body.smartDefault.version}` : "不可用"} · 空房智能默认 ${emptyRoom.smartDefault.available ? `v${emptyRoom.smartDefault.version}` : "不可用"} · 空房融合 ${emptyRoom.promptAgent.versions.length} 个版本 · Style DNA ${body.styles.length} 条 · 白模融合 ${body.promptAgent.versions.length} 个版本 · 精模 Prompt ${body.refinedPrompt.versions.length} 个版本`,
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

/**
 * [INPUT]: 依赖飞书配置刷新按钮、API、精模光影库脱敏目录、质感/美化/氛围转换独立Prompt状态及设计Agent目录与Toast回调
 * [OUTPUT]: 对外提供质感固定Prompt版本/上架与刷新栏、Prompt脱敏状态/共享刷新及配置分派，普通说明清空、真实错误可见；保留互斥刷新反馈
 * [POS]: public 的配置刷新交互控制器，与 app.js 的生图状态和上传流程隔离
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export function effectEnhancementPromptStatus(config = {}) {
  if (config.available && Number.isInteger(config.version) && config.version > 0) {
    return {
      availability: `Prompt v${config.version} · 已上架`,
      note: "",
      ready: true,
    };
  }
  return {
    availability: "Prompt 未配置",
    note: `未读取到可用的上架 Prompt：${config.reason || "请检查飞书配置并刷新"}。`,
    ready: false,
  };
}

export function effectBeautificationPromptStatus(config = {}) {
  const status = effectEnhancementPromptStatus(config);
  if (status.ready) status.note = "";
  return status;
}

export function bindConfigRefresh({
  api,
  onEffectEnhancementPrompt = () => {},
  onEffectBeautificationPrompt = () => {},
  onTextureEnhancementPrompt = () => {},
  onEmptyRoom,
  onRoomRenovation = () => {},
  onStyleTransfer = () => {},
  onPromptAgentVersions,
  onRefinedPromptVersions,
  onRefinedLighting = () => {},
  onSmartDefault,
  onStyles,
  showToast,
}) {
  const textureSection = document.querySelector("#textureEnhancementSection");
  if (textureSection) textureSection.innerHTML = `
    <div class="section-heading"><h2>固定提示词</h2><div class="section-heading-actions">
      <span id="texturePromptAvailability" class="micro-status" aria-live="polite">读取中</span>
      <button class="config-refresh-button" data-config-refresh type="button" aria-label="刷新质感增强 Prompt 版本" title="读取飞书中当前上架的质感增强 Prompt">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5" /><path d="M4 17v-5h5" /><path d="M6.1 9A7 7 0 0 1 18 6.5L20 9" /><path d="M17.9 15A7 7 0 0 1 6 17.5L4 15" /></svg>
        <span data-refresh-label>刷新</span>
      </button>
    </div></div><p id="texturePromptNote" class="compact-config-note" hidden></p>`;
  const buttons = Array.from(document.querySelectorAll("[data-config-refresh]"));
  const styleAvailability = document.querySelector("#styleAvailability");
  const styleNote = document.querySelector("#styleNote");
  const effectPromptAvailability = document.querySelector("#effectPromptAvailability");
  const effectPromptNote = document.querySelector("#effectPromptNote");
  const beautificationAvailability = document.querySelector("#effectBeautificationPromptAvailability");
  const beautificationNote = document.querySelector("#effectBeautificationPromptNote");
  const textureAvailability = document.querySelector("#texturePromptAvailability");
  const textureNote = document.querySelector("#texturePromptNote");
  let pending = false;
  const unavailableEmptyRoom = (reason) => ({
    promptAgent: { defaultVersion: null, reason, versions: [] },
    smartDefault: { available: false, reason, version: null },
  });
  const unavailableStyleTransfer = (reason) => ({
    promptAgent: { defaultVersion: null, reason, versions: [] },
    reference: { available: false, reason, version: null },
  });
  const unavailableEffectPrompt = (reason) => ({ available: false, reason, version: null });

  function renderEffectPrompt(config) {
    onEffectEnhancementPrompt(config);
    const status = effectEnhancementPromptStatus(config);
    effectPromptAvailability.textContent = status.availability;
    effectPromptAvailability.classList.toggle("ready", status.ready);
    effectPromptNote.textContent = status.note;
    effectPromptNote.classList.toggle("error", !status.ready);
    effectPromptNote.hidden = status.ready;
  }

  function apply(body) {
    styleNote.textContent = "";
    styleNote.classList.toggle("error", false);
    styleNote.hidden = true;
    renderEffectPrompt(body.effectEnhancementPrompt || unavailableEffectPrompt(
      "当前服务尚未提供效果图氛围转换 Prompt 状态，请重启工作台",
    ));
    renderBeautificationPrompt(body.effectBeautificationPrompt || unavailableEffectPrompt(
      "当前服务尚未提供效果图美化 Prompt 状态，请重启工作台",
    ));
    renderTexturePrompt(body.textureEnhancementPrompt || unavailableEffectPrompt(
      "当前服务尚未提供质感增强 Prompt 配置，请重启工作台",
    ));
    onEmptyRoom(body.emptyRoom || unavailableEmptyRoom(
      "当前服务尚未提供空房双模式配置，请重启工作台",
    ));
    onRoomRenovation(body.roomRenovation || unavailableEmptyRoom(
      "当前服务尚未提供旧房独立提示词配置，请重启工作台",
    ));
    onStyleTransfer(body.styleTransfer || unavailableStyleTransfer(
      "当前服务尚未提供风格转换配置，请重启工作台",
    ));
    onStyles(body.styles);
    onSmartDefault(body.smartDefault);
    onPromptAgentVersions(body.promptAgent);
    onRefinedPromptVersions(body.refinedPrompt);
    onRefinedLighting(body.refinedLighting || { available: false, referenceAvailable: false, reason: "当前服务尚未提供光影库，请重启工作台", presets: [] });
  }

  function renderBeautificationPrompt(config) {
    onEffectBeautificationPrompt(config);
    const status = effectBeautificationPromptStatus(config);
    beautificationAvailability.textContent = status.availability;
    beautificationAvailability.classList.toggle("ready", status.ready);
    beautificationNote.textContent = status.note;
    beautificationNote.classList.toggle("error", !status.ready);
    beautificationNote.hidden = !status.note;
  }

  function renderTexturePrompt(config) {
    onTextureEnhancementPrompt(config);
    const status = effectEnhancementPromptStatus(config);
    if (textureAvailability) {
      textureAvailability.textContent = status.availability;
      textureAvailability.classList.toggle("ready", status.ready);
    }
    if (textureNote) {
      textureNote.textContent = status.note;
      textureNote.classList.toggle("error", !status.ready);
      textureNote.hidden = status.ready;
    }
  }

  async function load() {
    styleAvailability.textContent = "读取中";
    try {
      apply(await api("/api/styles"));
    } catch (error) {
      onEmptyRoom(unavailableEmptyRoom(error.message));
      onRoomRenovation(unavailableEmptyRoom(error.message));
      onStyleTransfer(unavailableStyleTransfer(error.message));
      renderEffectPrompt(unavailableEffectPrompt(error.message));
      renderBeautificationPrompt(unavailableEffectPrompt(error.message));
      renderTexturePrompt(unavailableEffectPrompt(error.message));
      onStyles([]);
      onSmartDefault({ available: false, reason: error.message, version: null });
      onPromptAgentVersions({ defaultVersion: null, versions: [] });
      onRefinedPromptVersions({ defaultVersion: null, versions: [] });
      onRefinedLighting({ available: false, referenceAvailable: false, reason: error.message, presets: [] });
      styleAvailability.textContent = "读取失败";
      styleAvailability.classList.remove("ready");
      styleNote.textContent = error.message;
      styleNote.classList.toggle("error", true);
      styleNote.hidden = false;
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
      const renovation = body.roomRenovation || unavailableEmptyRoom("不可用");
      const styleTransfer = body.styleTransfer || unavailableStyleTransfer("不可用");
      const effectPrompt = body.effectEnhancementPrompt || unavailableEffectPrompt("不可用");
      const beautyPrompt = body.effectBeautificationPrompt || unavailableEffectPrompt("不可用");
      const texturePrompt = body.textureEnhancementPrompt || unavailableEffectPrompt("不可用");
      showToast(
        `配置已更新 · 质感增强 Prompt ${texturePrompt.available ? `v${texturePrompt.version}` : "不可用"} · 美化 Prompt ${beautyPrompt.available ? `v${beautyPrompt.version}` : "不可用"} · 氛围转换 Prompt ${effectPrompt.available ? `v${effectPrompt.version}` : "不可用"} · 白模 ${body.smartDefault.available ? `v${body.smartDefault.version}` : "不可用"} · 空房智能默认 ${emptyRoom.smartDefault.available ? `v${emptyRoom.smartDefault.version}` : "不可用"} · 空房融合 ${emptyRoom.promptAgent.versions.length} 个版本 · 旧房智能默认 ${renovation.smartDefault.available ? `v${renovation.smartDefault.version}` : "不可用"} / 融合 ${renovation.promptAgent.versions.length} 个版本 · 风格转换参考图 ${styleTransfer.reference.available ? `v${styleTransfer.reference.version}` : "不可用"} / 融合 ${styleTransfer.promptAgent.versions.length} 个版本 · Style DNA ${body.styles.length} 条 · 白模融合 ${body.promptAgent.versions.length} 个版本 · 精模 Prompt ${body.refinedPrompt.versions.length} 个版本`,
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

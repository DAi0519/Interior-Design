/**
 * [INPUT]: 依赖 workbench-utils.js 的同源 JSON API、更新检查 installMode 与安装 NDJSON 合同、三个工作台的更新入口及原生 dialog/页面可见性能力
 * [OUTPUT]: 对外提供受信安装地址验证、版本亮点/安装模式/待重启/恢复失败映射、可注入检查/安装请求的控制器，以及无外链的单一下载安装、完成/恢复指导与安装互斥弹层
 * [POS]: public 的跨工作台更新交互层，用户确认后才请求安装，仅收到有效 complete 回执才呈现安装成功
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { api } from "./workbench-utils.js";

const RELEASES_URL = "https://github.com/DAi0519/Interior-Design/releases";
const RELEASES_PATH = "/DAi0519/Interior-Design/releases";
const CHECK_INTERVAL_MS = 30 * 60 * 1000;
const VERSION_PATTERN = "v?\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?(?:\\+[0-9A-Za-z.-]+)?";

/* -------------------------------------------------------------------------- */
/* 状态与外链边界                                                             */
/* -------------------------------------------------------------------------- */

export function getTrustedUpdateUrl(value, purpose = "release") {
  if (typeof value !== "string" || !value) return null;
  try {
    const url = new URL(value);
    const pathname = decodeURIComponent(url.pathname);
    if (url.protocol !== "https:" || url.hostname !== "github.com" ||
      url.port || url.username || url.password || url.search || url.hash) return null;
    if (purpose === "download") {
      const match = pathname.match(new RegExp(`^${RELEASES_PATH}/download/(${VERSION_PATTERN})/canvas-lab-(${VERSION_PATTERN})\\.zip$`));
      if (!match || match[1].replace(/^v/, "") !== match[2].replace(/^v/, "")) return null;
    } else if (purpose === "release") {
      if (!new RegExp(`^${RELEASES_PATH}(?:/latest|/tag/${VERSION_PATTERN})?/?$`).test(pathname)) return null;
    } else {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

function plainText(value, maxLength = 12000) {
  return typeof value === "string" ? value.slice(0, maxLength) : "";
}

function getInstallMode(value) {
  return value === "in-place" ? "in-place" : "new-directory";
}

function getInstallationCopy(installMode) {
  return installMode === "in-place" ? {
    instructions: "在当前目录更新，保留配置和本地数据。安装后重启生效。",
    confirmation: "安装将在当前目录替换程序，保留 .env.local 和本地数据。\n请先完成当前任务；安装后需重启启动脚本以生效。",
    completed: "配置和本地数据已保留。完成当前任务后，关闭当前服务并双击原启动脚本。",
  } : {
    instructions: "安装到新目录，保留当前源码。完成后需迁移配置并启动新版本。",
    confirmation: "安装将在新目录完成，当前源码工作区保持不变。\n完成后请手动迁移 .env.local 配置文件。",
    completed: "复制原目录的 .env.local 到新目录，完成当前任务后运行新目录的启动脚本。",
  };
}

function getReleaseHighlights(value) {
  const notes = plainText(value).trim();
  if (!notes || notes === "更新说明请在版本页面查看。") return "";
  const packageHeader = new RegExp(`^Canvas Lab ${VERSION_PATTERN} 运行包。(?:\\r?\\n|$)`);
  if (!packageHeader.test(notes)) return notes;
  const distributionStart = notes.indexOf("\n使用者只需下载 ");
  if (distributionStart < 0) return notes;
  const highlights = notes.slice(0, distributionStart).match(/(?:^|\n)本次更新：\r?\n([\s\S]*)$/);
  return highlights ? highlights[1].trim() : "";
}

export function getAppUpdateView(state = {}, { isChecking = false } = {}) {
  state = state && typeof state === "object" ? state : {};
  const currentVersion = plainText(state.currentVersion, 80);
  const latestVersion = plainText(state.latestVersion, 80);
  const restartRequired = state.restartRequired === true;
  const recoveryRequired = state.recoveryRequired === true;
  const status = recoveryRequired ? "recovery-required" : restartRequired ? "restart-required"
    : (["available", "current"].includes(state.status) && currentVersion && latestVersion
      ? state.status : "unavailable");
  const statusLabels = {
    available: "发现新版本",
    current: "已是最新版本",
    unavailable: "暂时无法检查",
    "restart-required": "更新已安装，请重启",
    "recovery-required": "更新恢复失败",
  };
  const releaseUrl = getTrustedUpdateUrl(state.releaseUrl) || RELEASES_URL;
  const versionLabel = currentVersion ? `v${currentVersion.replace(/^v/, "")}` : "检查更新";
  const latestVersionLabel = latestVersion ? `v${latestVersion.replace(/^v/, "")}` : "";
  const releaseNotes = getReleaseHighlights(state.releaseNotes);
  return {
    status,
    installMode: getInstallMode(state.installMode),
    restartRequired,
    recoveryRequired,
    instructions: recoveryRequired ? "" : restartRequired ? getInstallationCopy("in-place").completed
      : getInstallationCopy(getInstallMode(state.installMode)).instructions,
    currentVersion: currentVersion || (isChecking ? "读取中" : "尚未获取"),
    latestVersion: latestVersion || "尚未获取",
    versionLine: currentVersion
      ? (status === "available" ? `${versionLabel} → ${latestVersionLabel}` : versionLabel)
      : "",
    buttonLabel: recoveryRequired ? `${versionLabel} · 需恢复` : restartRequired ? `${versionLabel} · 待重启`
      : (status === "available" ? `${versionLabel} · 有新版` : versionLabel),
    buttonTitle: recoveryRequired ? "Canvas Lab 更新恢复失败，请按提示手动恢复程序"
      : restartRequired ? `Canvas Lab 更新已安装，请重启${currentVersion ? `，当前运行版本 ${versionLabel}` : ""}`
      : `检查 Canvas Lab 更新${currentVersion ? `，当前版本 ${versionLabel}` : ""}${status === "available" ? "，有新版可下载" : ""}`,
    statusLabel: isChecking && !restartRequired && !recoveryRequired ? "正在检查更新…" : statusLabels[status],
    message: recoveryRequired ? (plainText(state.recoveryMessage, 2000) || "请按备份目录指引手动恢复程序后再重新启动。")
      : status === "unavailable" && !isChecking
        ? (plainText(state.message, 600) || "检查未完成，请稍后重试。") : "",
    releaseUrl,
    downloadUrl: status === "available" ? getTrustedUpdateUrl(state.downloadUrl, "download") : null,
    releaseNotes: status === "available" ? releaseNotes : "",
    checkedAt: plainText(state.checkedAt, 80),
    isChecking,
  };
}

export function createAppUpdateChecker({ request = api, onStateChange = () => {} } = {}) {
  let state = { status: "unavailable" };
  let pending = null;
  let isChecking = false;
  const publish = () => onStateChange(state, { isChecking });

  async function runCheck(force) {
    try {
      const result = await request(`/api/app-update${force ? "?force=1" : ""}`);
      if (!result || typeof result !== "object" || !["available", "current", "unavailable"].includes(result.status)) {
        throw new Error("更新服务返回了无法识别的状态。");
      }
      state = { ...result };
    } catch {
      state = {
        ...state,
        status: "unavailable",
        latestVersion: null,
        downloadUrl: null,
        releaseNotes: "",
        message: "暂时无法连接更新服务，请稍后重试。",
      };
    } finally {
      isChecking = false;
      pending = null;
      publish();
    }
    return state;
  }

  return {
    check(force = false) {
      if (pending) return pending;
      isChecking = true;
      publish();
      pending = Promise.resolve().then(() => runCheck(force));
      return pending;
    },
    getState: () => ({ ...state }),
  };
}

/* -------------------------------------------------------------------------- */
/* 原生弹层与被动提示                                                         */
/* -------------------------------------------------------------------------- */

export function createAppUpdateController({
  trigger,
  document: pageDocument = globalThis.document,
  window: pageWindow = globalThis.window,
  request = api,
  installFetch = globalThis.fetch,
  intervalMs = CHECK_INTERVAL_MS,
} = {}) {
  if (!trigger || !pageDocument || !pageWindow) return null;
  const makeElement = (tag, className, text = "") => {
    const element = pageDocument.createElement(tag);
    element.className = className;
    element.textContent = text;
    return element;
  };
  const dialog = makeElement("dialog", "app-update-dialog");
  dialog.id = "appUpdateDialog";
  dialog.setAttribute("aria-labelledby", "appUpdateStatus");
  const status = makeElement("h2", "app-update-status");
  status.id = "appUpdateStatus";
  status.tabIndex = -1;
  status.setAttribute("aria-live", "polite");
  const versionLine = makeElement("p", "app-update-version-line");
  const message = makeElement("p", "app-update-message");
  const notesSection = makeElement("section", "app-update-notes");
  const notes = makeElement("p", "app-update-release-notes");
  notesSection.append(makeElement("h3", "", "更新说明"), notes);
  const instructions = makeElement("p", "app-update-instructions", getInstallationCopy().instructions);
  const progressBar = makeElement("div", "app-update-progress");
  const progressFill = makeElement("div", "app-update-progress-fill");
  const progressText = makeElement("p", "app-update-progress-text");
  progressBar.append(progressFill);
  progressBar.hidden = true;
  const actions = makeElement("footer", "app-update-actions");
  const closeButton = makeElement("button", "app-update-action", "关闭");
  closeButton.type = "button";
  const checkButton = makeElement("button", "app-update-action app-update-check", "重新检查");
  checkButton.type = "button";
  const installButton = makeElement("button", "app-update-action app-update-install", "下载安装");
  installButton.type = "button";
  actions.append(closeButton, checkButton, installButton);
  dialog.append(status, versionLine, message, notesSection, instructions, progressBar, progressText, actions);
  pageDocument.body.append(dialog);
  let restoreFocus = trigger;
  let lastAutomaticCheck = 0;
  let destroyed = false;
  let backdropPress = false;
  let isInstalling = false;
  let installationOutcome = null;
  let restartPending = false;
  let currentUpdateState = null;
  const renderTrigger = (view) => {
    trigger.textContent = view.buttonLabel;
    trigger.title = view.buttonTitle;
    trigger.setAttribute("aria-label", view.buttonTitle);
    trigger.classList.toggle("has-update", view.status === "available" || view.restartRequired || view.recoveryRequired);
    trigger.dataset.updateStatus = view.status;
  };
  const renderActions = (view) => {
    const needsRecovery = view.restartRequired || view.recoveryRequired;
    installButton.hidden = !view.downloadUrl || installationOutcome === "success";
    installButton.disabled = isInstalling || needsRecovery || installationOutcome === "success";
    checkButton.hidden = isInstalling || needsRecovery || installationOutcome === "success"
      || (view.status === "available" && Boolean(view.downloadUrl) && installationOutcome !== "error");
    checkButton.disabled = isInstalling || view.isChecking;
    checkButton.textContent = view.isChecking ? "检查中…" : "重新检查";
    closeButton.disabled = isInstalling;
  };

  async function startInstallation() {
    if (!currentUpdateState || currentUpdateState.status !== "available" || isInstalling || installationOutcome === "success" || restartPending || currentUpdateState.recoveryRequired === true
      || !getTrustedUpdateUrl(currentUpdateState.downloadUrl, "download")) return;

    const update = { ...currentUpdateState };
    const installMode = getInstallMode(update.installMode);
    const installationCopy = getInstallationCopy(installMode);
    const confirmed = pageWindow.confirm(
      `即将自动下载并安装 Canvas Lab v${update.latestVersion}。\n\n` +
      `${installationCopy.confirmation}\n\n` +
      "是否继续？"
    );

    if (!confirmed) return;

    isInstalling = true;
    installationOutcome = null;
    status.textContent = "正在安装更新…";
    status.dataset.status = "installing";
    message.hidden = true;
    dialog.setAttribute("aria-busy", "true");
    renderActions(getAppUpdateView(currentUpdateState));
    progressBar.hidden = false;
    progressText.hidden = false;
    progressFill.style.transform = "translateX(-100%)";
    progressText.textContent = "正在准备下载...";

    let reader;
    try {
      if (typeof installFetch !== "function") throw new Error("当前浏览器不支持自动安装请求。");
      const response = await installFetch("/api/app-install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          downloadUrl: update.downloadUrl,
          version: update.latestVersion,
        }),
      });

      if (!response?.ok) {
        let detail;
        try { detail = await response?.json(); } catch { /* 非 JSON 错误响应使用通用提示。 */ }
        const error = new Error(plainText(detail?.error, 600) || "安装请求失败");
        error.code = plainText(detail?.code, 80);
        throw error;
      }

      if (typeof response.body?.getReader !== "function") throw new Error("安装响应缺少可读取的进度流。");
      reader = response.body.getReader();
      if (typeof reader?.read !== "function") throw new Error("安装响应缺少可读取的进度流。");
      const decoder = new TextDecoder();
      let buffer = "";
      let installedPath = "";
      let completedMode = installMode;

      const readProgress = (line) => {
        if (!line.trim() || installedPath) return;
        let progress;
        try { progress = JSON.parse(line); } catch { throw new Error("安装进度响应无法识别。"); }
        if (!progress || typeof progress !== "object") throw new Error("安装进度响应无法识别。");

        if (progress.stage === "downloading") {
          const percent = Math.round(Math.max(0, Math.min(100, Number(progress.percent) || 0)));
          const translateX = percent - 100;
          progressFill.style.transform = `translateX(${translateX}%)`;
          progressText.textContent = `正在下载... ${percent}%`;
        } else if (progress.stage === "verifying") {
          progressFill.style.transform = "translateX(0%)";
          progressText.textContent = "正在验证文件完整性...";
        } else if (progress.stage === "extracting") {
          progressText.textContent = "正在解压安装包...";
        } else if (progress.stage === "validating") {
          progressText.textContent = "正在验证安装包...";
        } else if (progress.stage === "installing") {
          progressText.textContent = "正在完成安装...";
        } else if (progress.stage === "complete") {
          installedPath = plainText(progress.path).trim();
          if (!installedPath) throw new Error("安装完成响应缺少新版本路径。");
          if (["in-place", "new-directory"].includes(progress.installMode)) completedMode = progress.installMode;
        } else if (progress.stage === "error") {
          const error = new Error(plainText(progress.error, 600) || "安装失败");
          error.code = plainText(progress.code, 80);
          throw error;
        }
      };

      while (!installedPath) {
        const { done, value } = await reader.read();
        if (done) {
          buffer += decoder.decode();
          if (buffer.trim()) readProgress(buffer);
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop();
        for (const line of lines) readProgress(line);
      }
      if (!installedPath) throw new Error("安装连接提前结束，未收到完成确认。");
      installationOutcome = "success";
      const completedCopy = getInstallationCopy(completedMode);
      progressFill.style.transform = "translateX(0%)";
      progressText.textContent = completedMode === "in-place"
        ? "当前目录已更新。"
        : `新版本目录：\n${installedPath}`;
      status.textContent = "安装成功";
      status.dataset.status = "success";
      if (completedMode === "in-place") {
        restartPending = true;
        currentUpdateState = { ...currentUpdateState, restartRequired: true };
        const restartView = getAppUpdateView(currentUpdateState);
        renderTrigger(restartView);
        status.textContent = restartView.statusLabel;
        status.dataset.status = restartView.status;
        installButton.hidden = true;
      }
      instructions.textContent = completedCopy.completed;
      instructions.hidden = false;
    } catch (error) {
      installationOutcome = "error";
      const code = plainText(error?.code, 80);
      const detail = `${code ? `[${code}] ` : ""}${plainText(error?.message, 600) || "安装失败"}`;
      status.textContent = "安装失败";
      status.dataset.status = "error";
      progressBar.hidden = true;
      progressText.hidden = true;
      message.textContent = detail;
      message.hidden = false;
    } finally {
      reader?.releaseLock?.();
      isInstalling = false;
      dialog.setAttribute("aria-busy", "false");
      renderActions(getAppUpdateView(currentUpdateState));
    }
  }

  const checker = createAppUpdateChecker({
    request,
    onStateChange(state, options) {
      if (destroyed) return;
      restartPending ||= state.restartRequired === true;
      currentUpdateState = { ...state, restartRequired: restartPending };
      const view = getAppUpdateView(currentUpdateState, options);
      renderTrigger(view);
      if (isInstalling || (installationOutcome && !view.restartRequired && !view.recoveryRequired)) return;
      status.textContent = view.statusLabel;
      status.dataset.status = view.status;
      versionLine.textContent = view.versionLine;
      versionLine.hidden = !view.versionLine;
      message.textContent = view.message;
      message.hidden = !view.message;
      if (view.status === "available" && !view.downloadUrl) {
        message.textContent = "安装包暂不可用，请稍后重新检查。";
        message.hidden = false;
      }
      notes.textContent = view.releaseNotes;
      notesSection.hidden = !view.releaseNotes;
      instructions.textContent = view.instructions;
      instructions.hidden = view.recoveryRequired || (view.status !== "available" && !view.restartRequired);
      renderActions(view);
      dialog.setAttribute("aria-busy", String(view.isChecking));
    },
  });
  const automaticCheck = () => {
    if (destroyed || isInstalling || pageDocument.visibilityState === "hidden") return;
    const now = Date.now();
    if (lastAutomaticCheck && now - lastAutomaticCheck < intervalMs) return;
    lastAutomaticCheck = now;
    void checker.check();
  };
  const open = () => {
    if (dialog.open) return;
    restoreFocus = pageDocument.activeElement || trigger;
    dialog.showModal();
    status.focus({ preventScroll: true });
  };
  const close = () => { if (!isInstalling) dialog.close(); };
  const restore = () => {
    backdropPress = false;
    if (restoreFocus?.isConnected) restoreFocus.focus({ preventScroll: true });
  };
  const isBackdrop = (event) => {
    if (event.target !== dialog) return false;
    const bounds = dialog.getBoundingClientRect();
    return event.clientX < bounds.left || event.clientX > bounds.right
      || event.clientY < bounds.top || event.clientY > bounds.bottom;
  };
  const check = (force = false) => {
    if (isInstalling) return Promise.resolve(checker.getState());
    if (force) {
      installationOutcome = null;
      progressBar.hidden = true;
      progressText.hidden = true;
      instructions.textContent = getAppUpdateView(currentUpdateState).instructions;
      installButton.disabled = restartPending || currentUpdateState?.recoveryRequired === true;
    }
    return checker.check(force);
  };
  const manualCheck = () => { void check(true); };
  trigger.setAttribute("aria-haspopup", "dialog");
  trigger.setAttribute("aria-controls", dialog.id);
  trigger.addEventListener("click", open);
  closeButton.addEventListener("click", close);
  checkButton.addEventListener("click", manualCheck);
  installButton.addEventListener("click", startInstallation);
  dialog.addEventListener("cancel", (event) => { if (isInstalling) event.preventDefault(); });
  dialog.addEventListener("close", restore);
  dialog.addEventListener("pointerdown", (event) => {
    backdropPress = event.isPrimary && event.button === 0 && isBackdrop(event);
  });
  dialog.addEventListener("pointercancel", () => { backdropPress = false; });
  dialog.addEventListener("click", (event) => {
    const shouldClose = backdropPress && isBackdrop(event);
    backdropPress = false;
    if (shouldClose) close();
  });
  pageDocument.addEventListener("visibilitychange", automaticCheck);
  const interval = pageWindow.setInterval(automaticCheck, intervalMs);
  automaticCheck();

  return {
    check,
    getState: () => ({ ...checker.getState(), restartRequired: restartPending }),
    open,
    close,
    destroy() {
      destroyed = true;
      pageWindow.clearInterval(interval);
      pageDocument.removeEventListener("visibilitychange", automaticCheck);
      trigger.removeEventListener("click", open);
      dialog.close();
      dialog.remove();
    },
  };
}

if (typeof document !== "undefined") {
  createAppUpdateController({ trigger: document.querySelector("[data-app-update]") });
}

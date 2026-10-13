/**
 * [INPUT]: 依赖 workbench-utils.js 的同源 JSON API、/api/app-update 版本合同、三个工作台的更新入口及原生 dialog/页面可见性能力
 * [OUTPUT]: 对外提供受信发布链接验证、版本状态映射、可注入请求的检查控制器，以及状态标题/精简版本/同排操作弹层、启动/定时检查、手动下载和点击外部关闭
 * [POS]: public 的跨工作台更新交互层，仅查询和呈现发布状态，用户点击后才打开固定仓库的下载地址
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

export function getAppUpdateView(state = {}, { isChecking = false } = {}) {
  state = state && typeof state === "object" ? state : {};
  const currentVersion = plainText(state.currentVersion, 80);
  const latestVersion = plainText(state.latestVersion, 80);
  const status = ["available", "current"].includes(state.status) && currentVersion && latestVersion
    ? state.status : "unavailable";
  const statusLabels = {
    available: "发现新版本",
    current: "已是最新版本",
    unavailable: "暂时无法检查",
  };
  const releaseUrl = getTrustedUpdateUrl(state.releaseUrl) || RELEASES_URL;
  const versionLabel = currentVersion ? `v${currentVersion.replace(/^v/, "")}` : "检查更新";
  const latestVersionLabel = latestVersion ? `v${latestVersion.replace(/^v/, "")}` : "";
  const releaseNotes = plainText(state.releaseNotes).trim();
  return {
    status,
    currentVersion: currentVersion || (isChecking ? "读取中" : "尚未获取"),
    latestVersion: latestVersion || "尚未获取",
    versionLine: currentVersion
      ? (status === "available" ? `${versionLabel} → ${latestVersionLabel}` : versionLabel)
      : "",
    buttonLabel: status === "available" ? `${versionLabel} · 有新版` : versionLabel,
    buttonTitle: `检查 Canvas Lab 更新${currentVersion ? `，当前版本 ${versionLabel}` : ""}${status === "available" ? "，有新版可下载" : ""}`,
    statusLabel: isChecking ? "正在检查更新…" : statusLabels[status],
    message: status === "unavailable" && !isChecking
      ? (plainText(state.message, 600) || "检查未完成，请稍后重试。") : "",
    releaseUrl,
    downloadUrl: status === "available" ? getTrustedUpdateUrl(state.downloadUrl, "download") : null,
    releaseNotes: status === "available" && releaseNotes !== "更新说明请在版本页面查看。"
      ? releaseNotes : "",
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
  const instructions = makeElement("p", "app-update-instructions", "点击「自动安装」将下载并解压到新目录，保留原目录中的 .env.local；等待任务完成后再切换。");
  const progressBar = makeElement("div", "app-update-progress");
  const progressFill = makeElement("div", "app-update-progress-fill");
  const progressText = makeElement("p", "app-update-progress-text");
  progressBar.append(progressFill);
  progressBar.hidden = true;
  const actions = makeElement("footer", "app-update-actions");
  const closeButton = makeElement("button", "app-update-action", "关闭");
  closeButton.type = "button";
  const checkButton = makeElement("button", "app-update-action", "重新检查");
  checkButton.type = "button";
  const downloadLink = makeElement("a", "app-update-action app-update-download", "下载更新");
  downloadLink.target = "_blank";
  downloadLink.rel = "noopener noreferrer";
  const installButton = makeElement("button", "app-update-action app-update-install", "自动安装");
  installButton.type = "button";
  actions.append(closeButton, checkButton, downloadLink, installButton);
  dialog.append(status, versionLine, message, notesSection, instructions, progressBar, progressText, actions);
  pageDocument.body.append(dialog);
  let restoreFocus = trigger;
  let lastAutomaticCheck = 0;
  let destroyed = false;
  let backdropPress = false;
  let isInstalling = false;
  let currentUpdateState = null;

  async function startInstallation() {
    if (!currentUpdateState || currentUpdateState.status !== "available" || isInstalling) return;

    const confirmed = pageWindow.confirm(
      `即将自动下载并安装 Canvas Lab v${currentUpdateState.latestVersion}。\n\n` +
      "安装将在新目录完成，不会影响当前运行的版本。\n" +
      "完成后请手动迁移 .env.local 配置文件。\n\n" +
      "是否继续？"
    );

    if (!confirmed) return;

    isInstalling = true;
    installButton.disabled = true;
    downloadLink.hidden = true;
    checkButton.disabled = true;
    closeButton.disabled = true;
    progressBar.hidden = false;
    progressText.hidden = false;
    progressFill.style.transform = "translateX(-100%)";
    progressText.textContent = "正在准备下载...";

    try {
      const response = await fetch("/api/app-install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          downloadUrl: currentUpdateState.downloadUrl,
          version: currentUpdateState.latestVersion,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "安装请求失败");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.trim()) continue;
          const progress = JSON.parse(line);

          if (progress.stage === "downloading") {
            const percent = Math.round(progress.percent || 0);
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
            progressFill.style.transform = "translateX(0%)";
            progressText.textContent = `安装完成！新版本已安装到：\n${progress.path}`;
            status.textContent = "安装成功";
            status.dataset.status = "success";
            instructions.textContent = `请复制原目录的 .env.local 到新目录，完成当前任务后切换到新版本。`;
            instructions.hidden = false;
            pageWindow.alert(
              `安装成功！\n\n` +
              `新版本路径：${progress.path}\n\n` +
              `请手动复制 .env.local 配置文件到新目录，\n` +
              `完成当前任务后切换到新版本。`
            );
          } else if (progress.stage === "error") {
            throw new Error(progress.error || "安装失败");
          }
        }
      }
    } catch (error) {
      status.textContent = "安装失败";
      status.dataset.status = "error";
      progressText.textContent = `错误：${error.message}`;
      message.textContent = error.message;
      message.hidden = false;
      pageWindow.alert(`安装失败：${error.message}`);
    } finally {
      isInstalling = false;
      installButton.disabled = false;
      checkButton.disabled = false;
      closeButton.disabled = false;
    }
  }

  const checker = createAppUpdateChecker({
    request,
    onStateChange(state, options) {
      if (destroyed) return;
      currentUpdateState = state;
      const view = getAppUpdateView(state, options);
      trigger.textContent = view.buttonLabel;
      trigger.title = view.buttonTitle;
      trigger.setAttribute("aria-label", view.buttonTitle);
      trigger.classList.toggle("has-update", view.status === "available");
      trigger.dataset.updateStatus = view.status;
      status.textContent = view.statusLabel;
      status.dataset.status = view.status;
      versionLine.textContent = view.versionLine;
      versionLine.hidden = !view.versionLine;
      message.textContent = view.message;
      message.hidden = !view.message;
      notes.textContent = view.releaseNotes;
      notesSection.hidden = !view.releaseNotes;
      instructions.hidden = view.status !== "available";
      if (view.downloadUrl) downloadLink.href = view.downloadUrl;
      else downloadLink.removeAttribute("href");
      downloadLink.hidden = !view.downloadUrl;
      installButton.hidden = !view.downloadUrl;
      checkButton.disabled = view.isChecking;
      checkButton.textContent = view.isChecking ? "检查中…" : "重新检查";
      dialog.setAttribute("aria-busy", String(view.isChecking));
    },
  });
  const automaticCheck = () => {
    if (destroyed || pageDocument.visibilityState === "hidden") return;
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
  const close = () => dialog.close();
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
  const manualCheck = () => { void checker.check(true); };
  trigger.setAttribute("aria-haspopup", "dialog");
  trigger.setAttribute("aria-controls", dialog.id);
  trigger.addEventListener("click", open);
  closeButton.addEventListener("click", close);
  checkButton.addEventListener("click", manualCheck);
  installButton.addEventListener("click", startInstallation);
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
    check: checker.check,
    getState: checker.getState,
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

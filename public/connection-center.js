/**
 * [INPUT]: 依赖连接中心 DOM、同源 Setup/Session API、飞书授权中文解释器、`?connect=api` 深链、工作台 API/飞书同步合同状态与配置刷新回调
 * [OUTPUT]: 对外提供 OneAPI 连接/本机记忆、评测页直达 API 管理、中文飞书授权及同步合同状态、Device Flow 与无障碍弹层生命周期控制
 * [POS]: public 的运营首次运行控制器，统一连接状态与焦点秩序并与 app.js 生成状态分责
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { describeMissingLarkScopes } from "./lark-permission-labels.js";

function emptySetup(error = null) {
  return {
    base: { error, readable: false },
    cli: { configured: false, installed: false, version: null },
    ready: false,
    user: {
      loggedIn: false,
      missingScopes: [],
      tokenValid: false,
      userName: "",
    },
  };
}

function pendingButton(button, pending, idleLabel, pendingLabel) {
  button.disabled = pending;
  button.textContent = pending ? pendingLabel : idleLabel;
}

export function bindConnectionCenter({
  api,
  onApiConnected,
  onApiDisconnected,
  onApiStateChange,
  onLarkReady,
  onLarkStateChange = () => {},
  showToast,
}) {
  const elements = {
    apiKeyInput: document.querySelector("#apiKeyInput"),
    apiNote: document.querySelector("#apiConnectionNote"),
    apiStatus: document.querySelector("#apiConnectionStatus"),
    closeButton: document.querySelector("#closeDialogButton"),
    connectionButton: document.querySelector("#connectionButton"),
    connectionDialog: document.querySelector("#connectionDialog"),
    connectionError: document.querySelector("#connectionError"),
    connectionLabel: document.querySelector("#connectionLabel"),
    disconnectButton: document.querySelector("#disconnectButton"),
    larkAuthPanel: document.querySelector("#larkAuthPanel"),
    larkBaseState: document.querySelector("#larkBaseState"),
    larkCliState: document.querySelector("#larkCliState"),
    larkCompleteButton: document.querySelector("#larkCompleteButton"),
    larkConfigHint: document.querySelector("#larkConfigHint"),
    larkConfigState: document.querySelector("#larkConfigState"),
    larkError: document.querySelector("#larkSetupError"),
    larkInitCopyButton: document.querySelector("#larkInitCopyButton"),
    larkLoginButton: document.querySelector("#larkLoginButton"),
    larkQrCode: document.querySelector("#larkQrCode"),
    larkRefreshButton: document.querySelector("#larkRefreshButton"),
    larkStatus: document.querySelector("#larkConnectionStatus"),
    larkUserState: document.querySelector("#larkUserState"),
    rememberApiKey: document.querySelector("#rememberApiKey"),
    saveConnectionButton: document.querySelector("#saveConnectionButton"),
    verificationLink: document.querySelector("#larkVerificationLink"),
  };

  let loginId = null;
  let lastFocusedElement = null;
  let session = { connected: false, persisted: false, source: "none" };
  let setup = emptySetup();

  function isOpen() {
    return !elements.connectionDialog.classList.contains("hidden");
  }

  function focusableElements() {
    const selector = [
      "a[href]:not([tabindex='-1'])",
      "button:not([disabled]):not([tabindex='-1'])",
      "input:not([disabled]):not([type='hidden'])",
      "[tabindex]:not([tabindex='-1'])",
    ].join(",");

    return [...elements.connectionDialog.querySelectorAll(selector)].filter(
      (element) => element.getClientRects().length > 0,
    );
  }

  function open({ focusApi = false } = {}) {
    const wasOpen = isOpen();
    if (!wasOpen) {
      lastFocusedElement =
        document.activeElement instanceof HTMLElement &&
        document.activeElement !== document.body
          ? document.activeElement
          : elements.connectionButton;
    }
    elements.connectionDialog.classList.remove("hidden");
    elements.connectionDialog.setAttribute("aria-hidden", "false");
    window.setTimeout(() => {
      const focusTarget =
        focusApi && !session.connected
          ? elements.apiKeyInput
          : elements.closeButton;
      focusTarget.focus();
    }, 0);
  }

  function close() {
    if (!isOpen()) return;
    elements.connectionDialog.classList.add("hidden");
    elements.connectionDialog.setAttribute("aria-hidden", "true");
    const focusTarget =
      lastFocusedElement?.isConnected
        ? lastFocusedElement
        : elements.connectionButton;
    lastFocusedElement = null;
    window.requestAnimationFrame(() => focusTarget.focus());
  }

  function renderOverall() {
    const ready = session.connected && setup.ready;
    const partial = session.connected || setup.ready;
    elements.connectionButton.classList.toggle("connected", ready);
    elements.connectionButton.classList.toggle("partial", !ready && partial);
    elements.connectionLabel.textContent = ready
      ? "连接已就绪"
      : partial
        ? "连接待完善"
        : "连接中心";
  }

  function renderApi(nextSession) {
    session = {
      connected: Boolean(nextSession?.connected),
      persisted: Boolean(nextSession?.persisted),
      source: nextSession?.source || "none",
    };
    elements.apiStatus.textContent = session.connected ? "已连接" : "未连接";
    elements.apiStatus.classList.toggle("ready", session.connected);
    elements.rememberApiKey.checked = session.persisted;
    elements.disconnectButton.classList.toggle("hidden", !session.connected);
    elements.apiNote.textContent = session.connected
      ? session.persisted
        ? "Key 已验证并保存在这台电脑，重启后会自动恢复。"
        : session.source === "environment"
          ? "Key 由启动环境提供，页面不会回显完整内容。"
          : "Key 已验证，仅保存在当前 Node 进程内存中。"
      : "Key 只发送到本机服务；是否跨重启保存由你决定。";
    onApiStateChange(session);
    renderOverall();
  }

  function renderSetup(nextSetup) {
    setup = nextSetup || emptySetup("飞书状态不可用");
    onLarkStateChange(setup);
    const { base, cli, user } = setup;
    elements.larkStatus.textContent = setup.ready ? "已就绪" : "待完善";
    elements.larkStatus.classList.toggle("ready", setup.ready);
    elements.larkCliState.textContent = cli.installed
      ? `已安装 · v${cli.version || "未知"}`
      : "未安装 · 请运行 npm install";
    elements.larkConfigState.textContent = cli.configured
      ? "已完成"
      : cli.installed
        ? "待初始化"
        : "等待安装";
    elements.larkUserState.textContent = user.loggedIn
      ? user.missingScopes.length > 0
        ? `${user.userName || "当前用户"} · 需要补充 ${user.missingScopes.length} 项授权`
        : `${user.userName || "当前用户"} · 登录有效`
      : user.error || "尚未登录";
    elements.larkBaseState.textContent = base.readable
      ? "共享配置可读取"
      : base.error || (user.loggedIn ? "等待权限完整" : "等待登录");
    elements.larkConfigHint.classList.toggle(
      "hidden",
      !cli.installed || cli.configured,
    );
    const canLogin = cli.installed && cli.configured;
    elements.larkLoginButton.disabled = !canLogin;
    elements.larkLoginButton.textContent = larkLoginLabel();

    const missingPermissions = describeMissingLarkScopes(user.missingScopes);
    const errors = [
      user.error,
      base.error,
      missingPermissions.length > 0
        ? `需要补充授权：${missingPermissions.join("、")}`
        : null,
    ].filter(Boolean);
    elements.larkError.textContent = errors.join("；");
    elements.larkError.classList.toggle("hidden", errors.length === 0);
    renderOverall();
  }

  function larkLoginLabel() {
    if (!setup.user.loggedIn) return "登录飞书";
    return setup.user.missingScopes.length > 0 ? "补充授权" : "重新登录";
  }

  async function loadSetup() {
    try {
      const body = await api("/api/setup/status");
      renderSetup(body);
      return body;
    } catch (error) {
      const unavailable = emptySetup(error.message);
      renderSetup(unavailable);
      return unavailable;
    }
  }

  async function load({ autoOpen = true } = {}) {
    const [sessionBody, setupBody] = await Promise.all([
      api("/api/session"),
      loadSetup(),
    ]);
    renderApi(sessionBody);
    renderSetup(setupBody);
    const url = new URL(window.location.href);
    const apiDeepLink = url.searchParams.get("connect") === "api";
    if (apiDeepLink) {
      url.searchParams.delete("connect");
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    }
    if (apiDeepLink || (autoOpen && (!session.connected || !setup.ready))) {
      open({ focusApi: !session.connected });
    }
    return sessionBody;
  }

  async function connectApi() {
    const apiKey = elements.apiKeyInput.value.trim();
    elements.connectionError.classList.add("hidden");
    pendingButton(
      elements.saveConnectionButton,
      true,
      "验证并连接",
      "正在验证…",
    );

    try {
      const body = await api("/api/session", {
        body: JSON.stringify({
          apiKey,
          remember: elements.rememberApiKey.checked,
        }),
        method: "POST",
      });
      elements.apiKeyInput.value = "";
      renderApi(body);
      showToast(body.warning || "API 已连接");
      await onApiConnected();
      if (setup.ready) close();
    } catch (error) {
      elements.connectionError.textContent = error.message;
      elements.connectionError.classList.remove("hidden");
    } finally {
      pendingButton(
        elements.saveConnectionButton,
        false,
        "验证并连接",
        "正在验证…",
      );
    }
  }

  async function disconnectApi() {
    const body = await api("/api/session", { method: "DELETE" });
    renderApi(body);
    onApiDisconnected();
    showToast(body.warning || "已断开 API 连接");
  }

  async function startLarkLogin() {
    elements.larkError.classList.add("hidden");
    pendingButton(
      elements.larkLoginButton,
      true,
      "登录飞书",
      "正在发起…",
    );
    try {
      const body = await api("/api/setup/lark-login", { method: "POST" });
      loginId = body.loginId;
      elements.verificationLink.href = body.verificationUrl;
      elements.verificationLink.textContent = body.verificationUrl;
      elements.larkQrCode.src = body.qrCodeDataUrl;
      elements.larkAuthPanel.classList.remove("hidden");
    } catch (error) {
      elements.larkError.textContent = error.message;
      elements.larkError.classList.remove("hidden");
    } finally {
      elements.larkLoginButton.disabled =
        !setup.cli.installed || !setup.cli.configured;
      elements.larkLoginButton.textContent = larkLoginLabel();
    }
  }

  async function completeLarkLogin() {
    if (!loginId) return;
    pendingButton(
      elements.larkCompleteButton,
      true,
      "我已完成授权",
      "正在确认…",
    );
    try {
      const body = await api("/api/setup/lark-login/complete", {
        body: JSON.stringify({ loginId }),
        method: "POST",
      });
      loginId = null;
      elements.larkAuthPanel.classList.add("hidden");
      renderSetup(body);
      showToast(body.ready ? "飞书连接已就绪" : "飞书已登录，请检查权限");
      await onLarkReady();
      if (session.connected && body.ready) close();
    } catch (error) {
      elements.larkError.textContent = error.message;
      elements.larkError.classList.remove("hidden");
    } finally {
      pendingButton(
        elements.larkCompleteButton,
        false,
        "我已完成授权",
        "正在确认…",
      );
    }
  }

  async function refreshLark() {
    pendingButton(
      elements.larkRefreshButton,
      true,
      "重新检测",
      "检测中…",
    );
    const body = await loadSetup();
    showToast(body.ready ? "飞书连接正常" : "飞书连接仍有未完成项");
    pendingButton(
      elements.larkRefreshButton,
      false,
      "重新检测",
      "检测中…",
    );
  }

  async function copyInitCommand() {
    try {
      await navigator.clipboard.writeText("npm run lark:init");
      showToast("已复制：npm run lark:init");
    } catch {
      showToast("请在终端运行：npm run lark:init");
    }
  }

  elements.connectionButton.addEventListener("click", () =>
    open({ focusApi: !session.connected }),
  );
  elements.closeButton.addEventListener("click", close);
  elements.saveConnectionButton.addEventListener("click", connectApi);
  elements.disconnectButton.addEventListener("click", disconnectApi);
  elements.larkLoginButton.addEventListener("click", startLarkLogin);
  elements.larkCompleteButton.addEventListener("click", completeLarkLogin);
  elements.larkRefreshButton.addEventListener("click", refreshLark);
  elements.larkInitCopyButton.addEventListener("click", copyInitCommand);
  elements.apiKeyInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") connectApi();
  });
  elements.connectionDialog.addEventListener("click", (event) => {
    if (event.target === elements.connectionDialog) close();
  });
  document.addEventListener("keydown", (event) => {
    if (!isOpen()) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = focusableElements();
    if (focusable.length === 0) {
      event.preventDefault();
      elements.connectionDialog.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const focusIsOutside = !elements.connectionDialog.contains(
      document.activeElement,
    );
    if (event.shiftKey && (document.activeElement === first || focusIsOutside)) {
      event.preventDefault();
      last.focus();
    } else if (
      !event.shiftKey &&
      (document.activeElement === last || focusIsOutside)
    ) {
      event.preventDefault();
      first.focus();
    }
  });

  return {
    close,
    load,
    loadSetup,
    open,
  };
}

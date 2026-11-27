/**
 * [INPUT]: 依赖工作台提供的 document 和 connection-center.css
 * [OUTPUT]: 幂等挂载共享连接中心，提供 OneAPI 与飞书设置及额度显示的语义结构
 * [POS]: public 的共享连接弹层模板，由 connection-center.js 在生图测试和批量跑图上挂载
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

const connectionCenterMarkup = `
<div id="connectionDialog" class="dialog-backdrop hidden" aria-hidden="true">
  <section class="dialog connection-dialog" role="dialog" aria-modal="true" tabindex="-1"
    aria-labelledby="connectionDialogTitle" aria-describedby="connectionDialogDescription">
    <div class="dialog-header connection-dialog-header">
      <div class="connection-heading">
        <h2 id="connectionDialogTitle">连接中心</h2>
        <p id="connectionDialogDescription" class="dialog-copy">
          管理这台电脑的模型与飞书连接。密钥只发送到本机
          <code>127.0.0.1</code>，飞书授权由本机 CLI 完成。
        </p>
      </div>
      <button id="closeDialogButton" class="icon-button" type="button" aria-label="关闭">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m6 6 12 12M18 6 6 18" />
        </svg>
      </button>
    </div>
    <div class="connection-grid">
      <section class="connection-section" aria-labelledby="apiConnectionTitle">
        <div class="connection-section-header">
          <div class="connection-section-title">
            <h3 id="apiConnectionTitle">公司 API</h3>
            <p>模型访问</p>
          </div>
          <span id="apiConnectionStatus" class="connection-status" role="status"
            aria-live="polite" aria-atomic="true">未连接</span>
        </div>
        <div id="connectionQuotaRow" class="connection-quota-row" hidden>
          <span>剩余额度</span>
          <strong id="connectionQuotaValue">—</strong>
        </div>
        <label class="field api-key-field">
          <span>OneAPI Key</span>
          <input id="apiKeyInput" type="password" autocomplete="off" spellcheck="false"
            placeholder="sk-..." aria-describedby="apiConnectionNote" />
        </label>
        <label class="remember-control">
          <input id="rememberApiKey" type="checkbox" />
          <span>记住在这台电脑</span>
        </label>
        <p id="apiConnectionNote" class="connection-note">
          Key 只发送到本机服务；是否跨重启保存由你决定。
        </p>
        <p id="connectionError" class="inline-error hidden" role="alert"></p>
        <div class="connection-section-actions">
          <button
            id="disconnectButton"
            class="connection-action-button hidden"
            type="button"
          >
            断开连接
          </button>
          <button
            id="saveConnectionButton"
            class="connection-action-button"
            type="button"
          >
            验证并连接
          </button>
        </div>
      </section>
      <section class="connection-section" aria-labelledby="larkConnectionTitle">
        <div class="connection-section-header">
          <div class="connection-section-title">
            <h3 id="larkConnectionTitle">飞书</h3>
            <p>配置同步</p>
          </div>
          <span
            id="larkConnectionStatus"
            class="connection-status"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >检测中</span>
        </div>
        <div class="connection-rows">
          <div class="connection-row">
            <span>CLI</span>
            <strong id="larkCliState">检测中</strong>
          </div>
          <div class="connection-row">
            <span>应用配置</span>
            <strong id="larkConfigState">检测中</strong>
          </div>
          <div class="connection-row">
            <span>用户身份</span>
            <strong id="larkUserState">检测中</strong>
          </div>
          <div class="connection-row">
            <span>共享 Base</span>
            <strong id="larkBaseState">检测中</strong>
          </div>
        </div>
        <p id="larkConfigHint" class="connection-hint hidden">
          飞书 CLI 首次使用需要初始化。请在终端运行
          <code>npm run lark:init</code>。
          <button id="larkInitCopyButton" class="inline-link-button" type="button">
            复制命令
          </button>
        </p>
        <p id="larkSetupError" class="inline-error hidden" role="alert"></p>
        <div id="larkAuthPanel" class="lark-auth-panel hidden">
          <img id="larkQrCode" alt="飞书授权二维码" />
          <div class="lark-auth-copy">
            <strong>在飞书中完成授权</strong>
            <a
              id="larkVerificationLink"
              class="lark-verification-link"
              href="#"
              target="_blank"
              rel="noreferrer"
            ></a>
            <button id="larkCompleteButton" class="primary-button" type="button">
              我已完成授权
            </button>
          </div>
        </div>
        <div class="connection-section-actions">
          <button
            id="larkRefreshButton"
            class="connection-action-button"
            type="button"
          >
            重新检测
          </button>
          <button
            id="larkLoginButton"
            class="connection-action-button"
            type="button"
            disabled
          >
            登录飞书
          </button>
        </div>
      </section>
    </div>
  </section>
</div>
`;

export function mountConnectionCenterMarkup(doc) {
  const existing = doc.getElementById("connectionDialog");
  if (existing) return existing;

  doc.body.insertAdjacentHTML("beforeend", connectionCenterMarkup);
  return doc.getElementById("connectionDialog");
}

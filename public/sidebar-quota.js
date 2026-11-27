/**
 * [INPUT]: 依赖共享侧栏额度节点、当前 OneAPI 会话与同源额度查询
 * [OUTPUT]: 提供两位小数的侧栏额度、完整精度的悬停与键盘提示，以及原位刷新
 * [POS]: public 的侧栏额度控制器，连接中心可同步同一读数到弹层
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

const quotaNumber = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const exactQuotaNumber = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 20 });
const quotaTime = new Intl.DateTimeFormat("zh-CN", {
  month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

export function bindSidebarQuota({ api, root = document, onDisplay = () => {} }) {
  const connection = root.querySelector("#connectionButton");
  const value = root.querySelector("#apiQuotaValue");
  const unit = root.querySelector("#apiQuotaCurrency");
  const detail = root.querySelector("#apiQuotaDetail");
  const refresh = root.querySelector("#apiQuotaRefresh");
  let connected = false;
  let request = null;

  function display(amount, { exactAmount = amount, currency = "", note = "" } = {}) {
    value.textContent = amount;
    unit.textContent = currency;
    unit.hidden = !currency;
    const fullAmount = [exactAmount, currency].filter(Boolean).join(" ");
    detail.textContent = connected ? [`OneAPI 额度 ${fullAmount}`, note].filter(Boolean).join("，") : "";
    onDisplay(fullAmount, connected);
  }

  async function update(session, { updating = false } = {}) {
    request?.abort();
    request = null;
    connected = session?.connected === true;
    refresh.hidden = !connected;
    refresh.setAttribute("aria-disabled", "true");
    if (updating || !connected) {
      display(updating ? "连接中…" : "连接中心");
      return;
    }

    const pending = new AbortController();
    request = pending;
    display("读取额度…");
    try {
      const { remaining, currency, unlimited, checkedAt } = await api("/api/oneapi/quota", {
        cache: "no-store", signal: pending.signal,
      });
      if (request !== pending) return;
      const time = typeof checkedAt === "string" ? Date.parse(checkedAt) : NaN;
      const note = Number.isFinite(time) ? `查询时间 ${quotaTime.format(time)}` : "";
      if (!unlimited && Number.isFinite(remaining)) {
        display(quotaNumber.format(remaining), { exactAmount: exactQuotaNumber.format(remaining), currency, note });
      } else {
        display(unlimited ? "不限额" : "暂不可用", { note });
      }
    } catch (error) {
      if (request === pending) display("额度查询失败", { note: error.statusCode === 404 ? "额度接口暂不可用" : error.message });
    } finally {
      if (request === pending) {
        request = null;
        refresh.removeAttribute("aria-disabled");
      }
    }
  }

  const reopenDetail = () => detail.removeAttribute("data-dismissed");
  connection.addEventListener("pointerenter", reopenDetail);
  connection.addEventListener("focus", reopenDetail);
  root.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && (connection.matches(":hover, :focus-visible") || detail.matches(":hover"))) {
      detail.setAttribute("data-dismissed", "");
    }
  });
  refresh.addEventListener("click", () => {
    if (refresh.getAttribute("aria-disabled") !== "true") void update({ connected });
  });
  return update;
}

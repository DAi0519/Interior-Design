/**
 * [INPUT]: 依赖批量跑图的监控右栏与标题、手机入口及原生弹窗
 * [OUTPUT]: 手机按需挂载同一监控到抽屉，关闭归焦；回到桌面恢复常驻右栏
 * [POS]: public 的批量跑图布局接线，保留监控节点身份及任务更新
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

const grid = document.querySelector(".beta-grid");
const monitor = grid.querySelector(".beta-monitor-card");
const opener = document.getElementById("betaMonitorOpen");
const title = document.getElementById("jobMonitorTitle");
const dialog = document.getElementById("betaMonitorDialog");
const close = document.getElementById("betaMonitorClose");
const mobile = window.matchMedia("(max-width: 900px)");

opener.addEventListener("click", () => {
  if (!mobile.matches || dialog.open) return;
  dialog.append(monitor);
  dialog.showModal();
  opener.setAttribute("aria-expanded", "true");
});
close.addEventListener("click", () => dialog.close());
dialog.addEventListener("close", () => {
  if (dialog.open) return;
  grid.append(monitor);
  opener.setAttribute("aria-expanded", "false");
  (mobile.matches ? opener : title).focus({ preventScroll: true });
});

// -------- 窄屏抽屉与桌面常驻右栏复用监控节点 --------
mobile.addEventListener("change", () => {
  if (!mobile.matches && dialog.open) dialog.close();
  if (mobile.matches && monitor.contains(document.activeElement)) opener.focus({ preventScroll: true });
});

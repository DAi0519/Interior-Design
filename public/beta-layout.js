/**
 * [INPUT]: 依赖批量跑图的三个面板、进度入口、底部操作栏与批次状态
 * [OUTPUT]: 控制桌面右侧进度的可见性、窄屏面板切换与焦点恢复，以及恢复批次时的底栏显示
 * [POS]: public 的批量跑图布局接线，保留三个面板及监控节点的身份
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export function bindBetaLayout() {
  const byId = (id) => document.getElementById(id);
  const grid = document.querySelector(".beta-grid");
  const form = byId("betaForm");
  const taskHeading = byId("betaTaskHeading");
  const switcher = byId("betaPanelSwitch");
  const tabs = [...switcher.querySelectorAll("[data-beta-panel-target]")];
  const panels = { samples: byId("betaSamplePanel"), settings: byId("betaSettingsPanel"), progress: byId("betaMonitorPanel") };
  const opener = byId("betaMonitorOpen");
  const runBar = byId("betaRunBar");
  const sampleScroll = byId("betaSampleScroll");
  const configScroll = byId("betaConfigScroll");
  const mobile = window.matchMedia("(max-width: 900px)");
  let hasTask = false;
  let panel = "samples";
  let previous = { job: null, error: "", warnings: false, canRefresh: false };
  let lastFocused = document.activeElement;

  const visible = (element) => element?.isConnected && element.getClientRects().length > 0;
  const focus = (element) => { if (visible(element)) element.focus({ preventScroll: true }); };
  const containingPanel = (element) => Object.keys(panels).find((name) => panels[name].contains(element));

  function focusHeading(name) {
    const heading = panels[name].querySelector("h2");
    if (visible(heading)) {
      heading.tabIndex = -1;
      focus(heading);
    } else if (form.hidden) focus(byId("productSidebarOpen"));
    else if (name === "settings") focus(configScroll);
  }

  function render() {
    const { job, error, warnings, canRefresh } = previous;
    grid.dataset.betaPanel = panel;
    grid.dataset.betaProgressAvailable = String(Boolean(job || error));
    grid.dataset.betaProgressState = error || warnings || job?.status === "failed" ? "error" : job?.status || "idle";
    for (const tab of tabs) tab.setAttribute("aria-pressed", String(tab.dataset.betaPanelTarget === panel));
    taskHeading.hidden = form.hidden;
    switcher.hidden = form.hidden;
    panels.progress.hidden = form.hidden && !job && !error;
    opener.hidden = !form.hidden || !job && !error;
    opener.setAttribute("aria-pressed", String(panel === "progress"));
    runBar.hidden = form.hidden && !job && !canRefresh;
  }

  function selectPanel(name, { moveFocus = false } = {}) {
    const active = document.activeElement;
    const hidesFocusedPanel = mobile.matches && panel !== name && panels[panel].contains(active);
    panel = name;
    render();
    if (moveFocus || hidesFocusedPanel) focusHeading(name);
  }

  function showProgress({ moveFocus = false } = {}) {
    if (mobile.matches) selectPanel("progress", { moveFocus });
    else {
      render();
      if (moveFocus) focusHeading("progress");
    }
  }

  function updateProgress(job, { error = "", canRefresh = false } = {}) {
    const warnings = Array.isArray(job?.result?.warnings) && job.result.warnings.some((warning) => warning?.message);
    const newJob = job && (!previous.job || previous.job.jobId && job.jobId && previous.job.jobId !== job.jobId);
    const failed = job?.status === "failed" && previous.job?.status !== "failed";
    const shouldReveal = newJob || failed || (error && error !== previous.error) || (warnings && !previous.warnings);
    const clearingProgress = !job && !error && (previous.job || previous.error);
    previous = { job, error, warnings, canRefresh };
    if (shouldReveal) showProgress();
    else if (clearingProgress) selectPanel("samples");
    else render();
  }

  function showTask() {
    // 切换任务后两个滚动区域从顶部开始，保留用户正在查看的参数或进度面板。
    if (!hasTask) panel = "samples";
    hasTask = true;
    sampleScroll.scrollTop = 0;
    configScroll.scrollTop = 0;
    render();
  }

  switcher.addEventListener("click", (event) => {
    const name = event.target.closest("[data-beta-panel-target]")?.dataset.betaPanelTarget;
    if (Object.hasOwn(panels, name)) selectPanel(name);
  });
  opener.addEventListener("click", () => selectPanel(panel === "progress" ? "samples" : "progress"));
  document.addEventListener("focusin", (event) => { lastFocused = event.target; });
  mobile.addEventListener("change", () => {
    if (!document.hasFocus()) return;
    const active = document.activeElement;
    const focused = active === document.body ? lastFocused : active;
    const owner = containingPanel(focused);
    if (mobile.matches) {
      if (!owner) return;
      if (owner === "progress" && form.hidden && !previous.job && !previous.error) {
        selectPanel("samples", { moveFocus: true });
        return;
      }
      selectPanel(owner);
      if (!visible(focused)) focusHeading(owner);
      else if (active !== focused) focus(focused);
    } else if (switcher.contains(focused)) focusHeading(panel);
    else if (focused === opener || owner === "progress" && !visible(focused)) focusHeading("progress");
  });

  render();
  return { showTask, showProgress, updateProgress };
}

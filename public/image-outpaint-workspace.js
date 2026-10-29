/**
 * [INPUT]: 依赖已绑定的扩图预览/定位/尺寸节点、共享结果面板、上传原图、生成任务阶段/身份及可选的隐藏回调
 * [OUTPUT]: 对外提供可配置的bindImageToolWorkspace及兼容bindImageOutpaintWorkspace，以 setActive/setSource/setStage 组合大画布/结果页签；新图保持构图直至新任务开始，离开预览时关闭设置并保留结果
 * [POS]: public 的扩图/多角度/二次编辑/打光共享工作区呈现层，由 image-tools 在功能控制器初始化后绑定，不接触几何或生成请求
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export function bindImageToolWorkspace({ root, onHide = () => {}, now = Date.now, prefix = "imageOutpaint",
  label = "扩图工作区", previewLabel = "构图预览", previewSelector = ".image-outpaint-preview",
  footerSelectors = [".image-outpaint-output", ".image-outpaint-position"] }) {
  const document = root.ownerDocument;
  const panel = document.querySelector(".result-panel");
  const resultStage = document.querySelector("#resultStage");
  const toolbar = panel.querySelector(".result-toolbar");
  const originalRole = resultStage.getAttribute("role");
  const originalLabel = resultStage.getAttribute("aria-labelledby");
  const create = (tag, className) => {
    const element = document.createElement(tag);
    element.className = className;
    return element;
  };
  const tabs = create("div", "outpaint-workspace-tabs hidden");
  tabs.setAttribute("role", "tablist");
  tabs.setAttribute("aria-label", label);
  const workspace = create("section", "outpaint-workspace hidden");
  workspace.id = `${prefix}Workspace`;
  workspace.setAttribute("role", "tabpanel");
  workspace.setAttribute("aria-labelledby", `${prefix}PreviewTab`);
  const canvas = create("div", "outpaint-workspace-canvas");
  const footer = create("div", "outpaint-workspace-footer");
  canvas.append(root.querySelector(previewSelector));
  footer.append(...footerSelectors.map(selector => root.querySelector(selector)));
  workspace.append(canvas, footer);

  const choices = [
    { key: "preview", id: `${prefix}PreviewTab`, label: previewLabel, controls: workspace.id },
    { key: "result", id: `${prefix}ResultTab`, label: "生成结果", controls: resultStage.id },
  ].map((choice) => {
    const button = create("button", "outpaint-workspace-tab");
    button.type = "button";
    button.id = choice.id;
    button.textContent = choice.label;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-controls", choice.controls);
    tabs.append(button);
    return { ...choice, button };
  });
  toolbar.before(tabs);
  resultStage.before(workspace);
  let active = false;
  let stage = "empty";
  let selection = "preview";
  let sourceKey = null;
  let taskId = null;
  let draft = null;

  function render() {
    const previewVisible = active && selection === "preview";
    if (!previewVisible) onHide();
    panel.classList.toggle("outpaint-workspace-active", active);
    tabs.classList.toggle("hidden", !active);
    toolbar.classList.toggle("hidden", active);
    workspace.classList.toggle("hidden", !previewVisible);
    resultStage.classList.toggle("hidden", active && selection !== "result");
    choices.forEach(({ key, button }) => {
      const selected = selection === key;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-selected", String(selected));
      button.setAttribute("tabindex", selected ? "0" : "-1");
      button.disabled = key === "result" && stage === "empty";
      if (key === "result") button.textContent = ["loading", "error"].includes(stage) ? "任务状态" : "生成结果";
    });
    if (active) {
      resultStage.setAttribute("role", "tabpanel");
      resultStage.setAttribute("aria-labelledby", `${prefix}ResultTab`);
    } else {
      for (const [name, value] of [["role", originalRole], ["aria-labelledby", originalLabel]]) {
        if (value === null) resultStage.removeAttribute(name);
        else resultStage.setAttribute(name, value);
      }
    }
  }

  function select(choice) {
    if (choice.button.disabled) return;
    selection = choice.key;
    render();
  }

  choices.forEach((choice) => {
    choice.button.addEventListener("click", () => select(choice));
    choice.button.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      const enabled = choices.filter(({ button }) => !button.disabled);
      const index = enabled.indexOf(choice);
      const next = event.key === "Home" ? 0 : event.key === "End" ? enabled.length - 1
        : (index + (event.key === "ArrowRight" ? 1 : -1) + enabled.length) % enabled.length;
      event.preventDefault();
      select(enabled[next]);
      enabled[next].button.focus();
    });
  });

  render();
  return {
    setActive(value) {
      if (active === Boolean(value)) return;
      active = Boolean(value);
      render();
    },
    setSource(source) {
      if (!active) return;
      const valid = typeof source?.dataUrl === "string" && source.dataUrl.length > 0
        && Number.isSafeInteger(source.width) && source.width > 0
        && Number.isSafeInteger(source.height) && source.height > 0;
      const nextKey = valid ? source.id || source.dataUrl : null;
      if (sourceKey === nextKey) return;
      sourceKey = nextKey;
      if (!valid) return;
      draft = { changedAt: now(), previousTaskId: taskId };
      selection = "preview";
      render();
    },
    setStage(nextStage, task = null) {
      if (!active) return;
      const nextTaskId = task?.jobId || null;
      const taskChanged = Boolean(nextTaskId && nextTaskId !== taskId);
      const stageChanged = nextStage !== stage;
      const newDraftTask = draft && taskChanged && nextTaskId !== draft.previousTaskId
        && Number.isFinite(task?.createdAt) && task.createdAt >= draft.changedAt;
      const legacyStart = !nextTaskId && stageChanged && nextStage === "loading";
      if (newDraftTask || legacyStart) draft = null;
      stage = nextStage;
      taskId = nextTaskId;
      if ((stageChanged || taskChanged) && !draft) {
        selection = stage === "empty" ? "preview" : "result";
      }
      if (stage === "empty") selection = "preview";
      render();
    },
  };
}

export function bindImageOutpaintWorkspace(options) { return bindImageToolWorkspace(options); }

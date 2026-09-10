/**
 * [INPUT]: 依赖服务端公开的默认项、三套 SeedVR2 工作流与 4K/6K/8K 目录、当前单张上传图尺寸、工作流按钮组和共享分辨率控件
 * [OUTPUT]: 对外提供图片超分配置渲染、保持原图比例的目标尺寸预览、任务项与不重复图片载荷的后台任务请求
 * [POS]: public 的图片超分交互边界，让主编排器无需理解 SeedVR2 工作流细节
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

function compactImage({ dataUrl, name, size, type }) {
  return { dataUrl, name, size, type };
}

export function targetDimensions(source, longEdge) {
  if (!source?.width || !source?.height || !longEdge) return null;
  const scale = longEdge / Math.max(source.width, source.height);
  const even = (value) => Math.max(2, Math.round(value / 2) * 2);
  return {
    height: source.height >= source.width ? longEdge : even(source.height * scale),
    width: source.width >= source.height ? longEdge : even(source.width * scale),
  };
}

export function bindImageUpscale({
  availability,
  emptyModel,
  emptySize,
  exactSize,
  getSourceImage,
  onChange,
  resolutionSelect,
  workflowList,
}) {
  let config = { comfyUi: { available: false }, resolutions: [], workflows: [] };
  let workflowKey = "";

  function selectedResolution() {
    return config.resolutions.find((entry) => entry.key === resolutionSelect.value);
  }

  function selectedWorkflow() {
    return config.workflows.find((entry) => entry.key === workflowKey);
  }

  function currentItem() {
    const workflow = selectedWorkflow();
    const resolution = selectedResolution();
    return {
      key: workflow?.key,
      label: `${workflow?.label || "SeedVR2"} · ${resolution?.key || "4K"}`,
      provider: "comfyui",
    };
  }

  function activate() {
    const current = config.resolutions.some((entry) => entry.key === resolutionSelect.value)
      ? resolutionSelect.value
      : "4K";
    resolutionSelect.replaceChildren(...config.resolutions.map((resolution) => {
      const option = document.createElement("option");
      option.value = resolution.key;
      option.textContent = `${resolution.label} · 长边 ${resolution.longEdge}px`;
      return option;
    }));
    resolutionSelect.value = current;
    resolutionSelect.disabled = false;
    renderSummary();
  }

  function renderSummary() {
    const resolution = selectedResolution();
    const target = targetDimensions(getSourceImage(), resolution?.longEdge);
    exactSize.textContent = target ? `${target.width} × ${target.height}` : `${resolution?.key || "4K"} · 保持原图比例`;
    emptyModel.textContent = selectedWorkflow()?.label || "SeedVR2";
    emptySize.textContent = target ? `${target.width} × ${target.height}` : "上传图片后计算";
  }

  function renderWorkflows() {
    workflowList.replaceChildren(...config.workflows.map((workflow) => {
      const selected = workflow.key === workflowKey;
      const button = document.createElement("button");
      const label = document.createElement("span");
      const mark = document.createElement("i");
      button.type = "button";
      button.className = "model-option-toggle";
      button.dataset.upscaleWorkflow = workflow.key;
      button.setAttribute("role", "radio");
      button.setAttribute("aria-checked", String(selected));
      button.classList.toggle("selected", selected);
      label.textContent = workflow.label;
      mark.textContent = selected ? "✓" : "+";
      mark.setAttribute("aria-hidden", "true");
      button.append(label, mark);
      button.addEventListener("click", () => {
        workflowKey = workflow.key;
        renderWorkflows();
        renderSummary();
        onChange();
      });
      return button;
    }));
  }

  return {
    configure(nextConfig) {
      config = nextConfig;
      workflowKey = config.workflows.some((workflow) => workflow.key === config.defaultWorkflowKey)
        ? config.defaultWorkflowKey
        : config.workflows[0]?.key || "";
      availability.textContent = config.comfyUi?.available
        ? `ComfyUI ${config.comfyUi.version || "可用"}`
        : "ComfyUI 不可用";
      availability.classList.toggle("ready", Boolean(config.comfyUi?.available));
      renderWorkflows();
      activate();
    },
    activate,
    currentItem,
    isAvailable: () => Boolean(config.comfyUi?.available),
    jobRequest({ image, jobId }) {
      const item = currentItem();
      return {
        batchId: null,
        featureMode: "imageUpscale",
        forcePromptRegeneration: false,
        items: [{
          input: {
            resolution: selectedResolution()?.key,
            upscaleWorkflowKey: item.key,
          },
          key: item.key,
          label: item.label,
        }],
        jobId,
        sharedInput: { referenceImages: [compactImage(image)] },
      };
    },
    loadingCopy() {
      return `正在用 ${selectedWorkflow()?.label || "SeedVR2"} 超分到 ${selectedResolution()?.key || "4K"}…`;
    },
    renderSummary,
  };
}

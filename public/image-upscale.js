/**
 * [INPUT]: 依赖服务端默认项/双噪声能力、SeedVR2/KS工作流尺寸目录、单张上传图、分辨率/数字控件和sessionStorage
 * [OUTPUT]: 提供档位和双噪声草稿恢复、0..1/0.001校验与旧进程阻断、冻结版本/噪声单图请求及运行时控件锁定
 * [POS]: public 的图片超分交互边界，让主编排器无需理解 SeedVR2 工作流细节
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

const STORAGE_KEY = "canvas-lab.image-upscale-selection";
const validNoise = value => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1
  && Math.abs(value * 1000 - Math.round(value * 1000)) < 1e-7;

function readSelection() {
  try {
    const value = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "{}");
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

function compactImage({ dataUrl, name, size, type }) {
  return { dataUrl, name, size, type };
}

export function targetDimensions(source, resolution) {
  if (!source?.width || !source?.height || !resolution) return null;
  if (resolution.scale) return { width: source.width * resolution.scale, height: source.height * resolution.scale };
  const longEdge = typeof resolution === "number" ? resolution : resolution.longEdge;
  if (!longEdge) return null;
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
  inputNoiseInput = null,
  latentNoiseInput = null,
  note,
  onChange,
  resolutionSelect,
  workflowList,
}) {
  let config = { comfyUi: { available: false }, resolutions: [], workflows: [] };
  const remembered = readSelection();
  let workflowKey = remembered.workflowKey || "";
  let resolutionKey = typeof remembered.resolution === "string" ? remembered.resolution.toUpperCase() : "";
  let busy = false;
  const noiseFields = [
    { key: "upscaleInputNoiseScale", input: inputNoiseInput, label: "输入噪声" },
    { key: "upscaleLatentNoiseScale", input: latentNoiseInput, label: "潜空间噪声" },
  ];
  const noiseValues = {};
  for (const field of noiseFields) {
    noiseValues[field.key] = validNoise(remembered[field.key]) ? remembered[field.key] : 0;
    if (field.input) field.input.value = String(noiseValues[field.key]);
  }

  function readNoise() {
    const values = {};
    let issue = "";
    for (const field of noiseFields) {
      const raw = field.input?.value ?? noiseValues[field.key];
      const value = typeof raw === "string" && raw.trim() === "" ? NaN : Number(raw);
      const error = validNoise(value) ? "" : `${field.label}需为 0–1，步长 0.001`;
      field.input?.setCustomValidity?.(error);
      issue ||= error;
      values[field.key] = Math.round(value * 1000) / 1000;
    }
    return { values, issue };
  }

  function updateNoiseControls() {
    for (const field of noiseFields) if (field.input) field.input.disabled = busy || config.supportsNoiseControls !== true;
  }

  function resolutions() {
    return selectedWorkflow()?.resolutions || config.resolutions;
  }

  function remember() {
    try {
      const noise = readNoise();
      if (!noise.issue) Object.assign(noiseValues, noise.values);
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ resolution: resolutionKey, workflowKey,
        ...(noiseFields.some(field => noiseValues[field.key] !== 0) ? noiseValues : {}),
      }));
    } catch {}
  }

  function selectedResolution() {
    return resolutions().find((entry) => entry.key === resolutionKey);
  }

  function selectedWorkflow() {
    return config.workflows.find((entry) => entry.key === workflowKey);
  }

  function sourceIssue(source = getSourceImage()) {
    const limits = selectedWorkflow()?.inputSize;
    if (!source || !limits) return "";
    if (source.width < limits.minWidth || source.width > limits.maxWidth
      || source.height < limits.minHeight || source.height > limits.maxHeight) {
      return `当前工作流要求原图宽 ${limits.minWidth}–${limits.maxWidth}px、高 ${limits.minHeight}–${limits.maxHeight}px，请调整图片后上传。`;
    }
    return "";
  }

  function availabilityReason() {
    if (!config.comfyUi?.available) return "ComfyUI 当前不可用，请检查工作流服务";
    if (!selectedWorkflow() || !selectedResolution()) return "超分工作流未就绪，请刷新页面后重试";
    if (selectedWorkflow().available === false) return selectedWorkflow().reason || "当前超分工作流所需节点不可用";
    const noise = readNoise();
    if (noise.issue) return noise.issue;
    if (config.supportsNoiseControls !== true && Object.values(noise.values).some(value => value !== 0)) {
      return "当前服务尚未支持超分噪声参数，请重载工作台后重试";
    }
    return sourceIssue();
  }

  function currentItem() {
    const workflow = selectedWorkflow();
    const resolution = selectedResolution();
    return {
      key: workflow?.key,
      label: `${workflow?.label || "SeedVR2"} · ${resolution?.label || ""}`,
      provider: "comfyui",
    };
  }

  function activate() {
    const options = resolutions();
    if (!options.some((entry) => entry.key === resolutionKey)) resolutionKey = options[0]?.key || "";
    resolutionSelect.replaceChildren(...options.map((resolution) => {
      const option = document.createElement("option");
      option.value = resolution.key;
      option.textContent = resolution.longEdge
        ? `${resolution.label} · 长边 ${resolution.longEdge}px` : resolution.label;
      if (resolution.key === resolutionKey) option.setAttribute("selected", "");
      return option;
    }));
    resolutionSelect.value = resolutionKey;
    resolutionSelect.disabled = options.length === 0;
    renderSummary();
  }

  function renderSummary() {
    updateNoiseControls();
    if (resolutions().some((entry) => entry.key === resolutionSelect.value)) resolutionKey = resolutionSelect.value;
    const resolution = selectedResolution();
    const target = sourceIssue() ? null : targetDimensions(getSourceImage(), resolution);
    exactSize.textContent = target ? `${target.width} × ${target.height}` : `${resolution?.label || "待选择"} · 保持原图比例`;
    emptyModel.textContent = selectedWorkflow()?.label || "SeedVR2";
    emptySize.textContent = target ? `${target.width} × ${target.height}` : sourceIssue() ? "请调整输入图片尺寸" : "上传图片后计算";
    if (note) {
      const issue = availabilityReason();
      note.textContent = issue;
      note.hidden = !issue;
      note.classList.toggle("error", Boolean(issue));
    }
    remember();
  }

  for (const field of noiseFields) field.input?.addEventListener("input", () => { renderSummary(); onChange(); });

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
      button.setAttribute("aria-label", workflow.label);
      button.title = workflow.label;
      button.classList.toggle("selected", selected);
      label.textContent = workflow.shortLabel || workflow.label;
      mark.textContent = selected ? "✓" : "+";
      mark.setAttribute("aria-hidden", "true");
      button.append(label, mark);
      button.addEventListener("click", () => {
        workflowKey = workflow.key;
        renderWorkflows();
        activate();
        onChange();
      });
      return button;
    }));
  }

  return {
    configure(nextConfig) {
      config = nextConfig;
      if (!config.workflows.some((workflow) => workflow.key === workflowKey)) {
        workflowKey = config.workflows.some((workflow) => workflow.key === config.defaultWorkflowKey)
          ? config.defaultWorkflowKey : config.workflows[0]?.key || "";
      }
      availability.textContent = config.comfyUi?.available
        ? `ComfyUI ${config.comfyUi.version || "可用"}`
        : "ComfyUI 不可用";
      availability.classList.toggle("ready", Boolean(config.comfyUi?.available));
      renderWorkflows();
      activate();
    },
    activate,
    currentItem,
    availabilityReason,
    isAvailable: () => !availabilityReason(),
    setStage(stage) { busy = stage === "loading"; updateNoiseControls(); },
    jobRequest({ image, jobId }) {
      if (availabilityReason()) throw new Error(availabilityReason());
      if (sourceIssue(image)) throw new Error(sourceIssue(image));
      const item = currentItem();
      return {
        batchId: null,
        featureMode: "imageUpscale",
        forcePromptRegeneration: false,
        items: [{
          input: {
            resolution: selectedResolution()?.key,
            upscaleWorkflowKey: item.key,
            ...(config.supportsNoiseControls === true ? readNoise().values : {}),
            ...(selectedWorkflow()?.version ? { upscaleWorkflowVersion: selectedWorkflow().version } : {}),
          },
          key: item.key,
          label: item.label,
        }],
        jobId,
        sharedInput: { referenceImages: [compactImage(image)] },
      };
    },
    loadingCopy() {
      return `正在用 ${selectedWorkflow()?.label || "SeedVR2"} 超分到 ${selectedResolution()?.label || "所选尺寸"}…`;
    },
    renderSummary,
  };
}

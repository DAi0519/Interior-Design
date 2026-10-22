/**
 * [INPUT]: 依赖Beta脱敏超分工作流尺寸目录、共享可搜索多选、统一输出尺寸表单、Run ID及飞书样本元信息
 * [OUTPUT]: 提供旧KS缺省2X兼容、所选工作流尺寸交集与原生/增强控件同步、统一档位准入、快照及样本乘工作流展开
 * [POS]: public的Beta AI超分配置边界，与普通模型/扩图尺寸及Prompt设置隔离，不读取原图正文或工作流源码
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { bindSearchableChoice } from "./model-multi-select.js?v=5";
import { createBetaRunId } from "./beta-run-id.js?v=2";

export const BETA_UPSCALE_WORKFLOW_KEYS = Object.freeze([
  "youxing_seedvr2_3b", "seedvr2_1mp", "seedvr2_075mp", "seedvr2_7b_direct",
  "ks_seedvr2_2x", "ks_seedvr2_2x_direct",
]);
export const BETA_UPSCALE_RESOLUTIONS = Object.freeze(["2X", "4K", "6K", "8K"]);
const DEFAULT_WORKFLOW_KEY = "youxing_seedvr2_3b";
const KS_WORKFLOW_KEYS = new Set(["ks_seedvr2_2x", "ks_seedvr2_2x_direct"]);
const KS_RESOLUTIONS = ["2X", "4K", "6K"];
const LONG_EDGE_RESOLUTIONS = ["4K", "6K", "8K"];

function resolutions(workflow) {
  return (workflow.resolutions || []).map((entry) => typeof entry === "string" ? entry : entry.key);
}

export function betaUpscaleResolutionKeys(workflows) {
  if (!workflows.length) return [];
  return BETA_UPSCALE_RESOLUTIONS.filter((key) => workflows.every((workflow) => resolutions(workflow).includes(key)));
}

export function normalizeBetaUpscaleState(input = {}) {
  const value = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const workflowKeys = [...new Set(Array.isArray(value.workflowKeys)
    ? value.workflowKeys.filter((key) => BETA_UPSCALE_WORKFLOW_KEYS.includes(key)) : [])];
  const selectedKeys = workflowKeys.length ? workflowKeys : [DEFAULT_WORKFLOW_KEY];
  // -------- 缺省旧KS沿用2X；明确合法长边不做隐式改写 --------
  const options = betaUpscaleResolutionKeys(selectedKeys.map((key) => ({
    resolutions: KS_WORKFLOW_KEYS.has(key) ? KS_RESOLUTIONS : LONG_EDGE_RESOLUTIONS,
  })));
  const resolution = typeof value.resolution === "string" ? value.resolution.toUpperCase() : "";
  return { workflowKeys: selectedKeys, resolution: options.includes(resolution) ? resolution : options[0] };
}

export function buildBetaUpscaleItems({ cases, workflows, settings, startedAt = new Date() }) {
  const normalized = normalizeBetaUpscaleState({ ...settings, workflowKeys: workflows.map((workflow) => workflow.key) });
  if (!cases.length) throw new Error("请先添加超分样本");
  if (!workflows.length) throw new Error("请选择超分工作流");
  for (const workflow of workflows) {
    if (!BETA_UPSCALE_WORKFLOW_KEYS.includes(workflow.key)) throw new Error("请选择有效的超分工作流");
    if (workflow.available !== true) throw new Error(`${workflow.label}：${workflow.reason || "当前不可用"}`);
    const resolution = normalized.resolution;
    if (!resolutions(workflow).includes(resolution)) throw new Error(`${workflow.label} 不支持 ${resolution}，请刷新配置`);
  }
  return cases.flatMap((currentCase, caseIndex) => workflows.map((workflow, workflowIndex) => ({
    attempt: 1,
    caseId: currentCase.caseId,
    sampleId: currentCase.caseId,
    modelKey: workflow.key,
    input: {
      featureMode: "imageUpscale",
      modelKey: workflow.key,
      upscaleWorkflowKey: workflow.key,
      resolution: normalized.resolution,
    },
    label: `${currentCase.label} · ${workflow.label}`,
    modelLabel: workflow.label,
    runId: createBetaRunId({
      modelKey: workflow.key,
      sequence: (caseIndex * workflows.length) + workflowIndex + 1,
      startedAt,
    }),
  })));
}

export function createBetaUpscaleConfiguration({ elements, initialState, onChange, onMessage,
  bindChoice = bindSearchableChoice }) {
  let settings = normalizeBetaUpscaleState(initialState);
  let workflows = [];
  const picker = bindChoice({
    container: elements.upscaleWorkflowOptions,
    multiple: true,
    label: "超分工作流",
    placeholder: "选择超分工作流",
    searchPlaceholder: "搜索工作流名称",
    presentOption(workflow) {
      return {
        label: workflow.label,
        selectable: workflow.available === true || settings.workflowKeys.includes(workflow.key),
        reason: workflow.available === true ? "" : `不可用 · ${workflow.reason || "配置未就绪"}`,
      };
    },
    onChange(workflowKeys) {
      settings = { ...settings, workflowKeys: [...workflowKeys] };
      render();
      onChange();
    },
    onMessage: (message) => onMessage(message?.replaceAll("出图模型", "超分工作流")),
  });

  function selectedWorkflows() {
    return settings.workflowKeys.map((key) => workflows.find((workflow) => workflow.key === key)).filter(Boolean);
  }

  function unavailableReason() {
    if (settings.workflowKeys.some((key) => !workflows.some((workflow) => workflow.key === key))) {
      return "所选超分工作流已不在目录中，请刷新页面检查配置";
    }
    const selected = selectedWorkflows();
    const reason = selected.filter((workflow) => workflow.available !== true)
      .map((workflow) => `${workflow.label}：${workflow.reason || "配置未就绪"}`).join("；");
    if (reason) return reason;
    return selected.length && !betaUpscaleResolutionKeys(selected).length
      ? "所选超分工作流没有共同的输出尺寸，请调整选择" : "";
  }

  function render() {
    picker.render(workflows, settings.workflowKeys);
    const selected = selectedWorkflows();
    const options = betaUpscaleResolutionKeys(selected);
    if (options.length && !options.includes(settings.resolution)) settings = { ...settings, resolution: options[0] };
    const select = elements.upscaleResolutionSelect;
    const doc = select.ownerDocument || document;
    elements.upscaleResolutionField.classList.toggle("hidden", false);
    // -------- 重建合法选项并设置selected，通知共享适配器但不派发change --------
    select.replaceChildren(...options.map((key) => {
      const option = doc.createElement("option");
      const definition = selected.flatMap((workflow) => workflow.resolutions || [])
        .find((entry) => typeof entry === "object" && entry.key === key);
      option.value = key;
      option.textContent = key === "2X" ? "2X · 原图宽高各2倍"
        : `${key} · ${definition?.longEdge || ({ "4K": 4096, "6K": 6144, "8K": 8192 })[key]}px`;
      if (key === settings.resolution) option.setAttribute("selected", "");
      return option;
    }));
    select.value = options.length ? settings.resolution : "";
    select.disabled = !options.length;
    const hasKs = selected.some((workflow) => KS_WORKFLOW_KEYS.has(workflow.key));
    const mixed = hasKs && selected.some((workflow) => !KS_WORKFLOW_KEYS.has(workflow.key));
    elements.upscaleResolutionNote.textContent = [
      settings.resolution === "2X" ? "整批按原图宽、高各放大2倍，保持原图比例。"
        : `整批按所选 ${settings.resolution} 长边输出，保持每张原图比例。`,
      mixed ? `混选仅使用共同尺寸 ${options.join(" / ")}。` : "",
      hasKs ? "KS支持2X、4K和6K，输入每边需为384–3200px。" : "",
    ].filter(Boolean).join("");
    const reason = unavailableReason();
    elements.upscaleAvailability.textContent = reason;
    elements.upscaleAvailability.classList.toggle("hidden", !reason);
  }

  elements.upscaleResolutionSelect.addEventListener("change", () => {
    settings = normalizeBetaUpscaleState({ ...settings, resolution: elements.upscaleResolutionSelect.value });
    render();
    onChange();
  });

  return {
    configure(config = {}) {
      workflows = (config?.workflows || []).filter((workflow) => BETA_UPSCALE_WORKFLOW_KEYS.includes(workflow.key));
      render();
    },
    ready: () => selectedWorkflows().length > 0 && !unavailableReason(),
    render,
    selectedWorkflows,
    snapshot: () => ({ ...settings, workflowKeys: [...settings.workflowKeys] }),
    unavailableReason,
    buildItems(cases, startedAt) {
      const reason = unavailableReason();
      if (reason) throw new Error(reason);
      return buildBetaUpscaleItems({ cases, workflows: selectedWorkflows(), settings, startedAt });
    },
  };
}

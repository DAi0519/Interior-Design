/**
 * [INPUT]: 依赖 Beta 脱敏扩图工作流目录、共享可搜索多选控件、Run ID 与扩图专属表单
 * [OUTPUT]: 对外提供固定 2K 的扩图状态归一化、工作流显式准入、居中构图配置与样本乘工作流 Run 展开
 * [POS]: public 的 Beta 扩图独立配置边界，与普通出图模型和尺寸状态隔离，不读取图片正文或工作流源码
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { bindSearchableChoice } from "./model-multi-select.js?v=5";
import { createBetaRunId } from "./beta-run-id.js?v=2";

export const BETA_OUTPAINT_WORKFLOW_KEYS = Object.freeze([
  "outpaint-flux-onereward", "outpaint-flux-dev", "outpaint-qwen-2511", "outpaint-sunburst",
]);
export const DEFAULT_BETA_OUTPAINT_WORKFLOW_KEYS = Object.freeze([
  "outpaint-flux-onereward", "outpaint-qwen-2511",
]);
export const BETA_OUTPAINT_RATIOS = Object.freeze(["original", "1:1", "4:3", "16:9", "3:4", "9:16"]);
const MULTIPLES = Object.freeze([1.5, 2, 3]);

export function normalizeBetaOutpaintState(input = {}) {
  const value = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const workflowKeys = [...new Set(Array.isArray(value.workflowKeys)
    ? value.workflowKeys.filter((key) => BETA_OUTPAINT_WORKFLOW_KEYS.includes(key))
    : [])];
  return {
    workflowKeys: workflowKeys.length ? workflowKeys : [...DEFAULT_BETA_OUTPAINT_WORKFLOW_KEYS],
    ratio: BETA_OUTPAINT_RATIOS.includes(value.ratio) ? value.ratio : "original",
    multiple: MULTIPLES.includes(Number(value.multiple)) ? Number(value.multiple) : 1.5,
  };
}

export function buildBetaOutpaintItems({ cases, workflows, settings, startedAt = new Date() }) {
  const normalized = normalizeBetaOutpaintState(settings);
  if (!cases.length) throw new Error("请先添加扩图样本");
  if (!workflows.length) throw new Error("请选择扩图工作流");
  const unavailable = workflows.find((workflow) => workflow.available !== true);
  if (unavailable) throw new Error(`${unavailable.label}：${unavailable.reason || "当前不可用"}`);
  return cases.flatMap((currentCase, caseIndex) => workflows.map((workflow, workflowIndex) => ({
    attempt: 1,
    caseId: currentCase.caseId,
    sampleId: currentCase.caseId,
    input: {
      featureMode: "imageOutpaint",
      outpaintWorkflowKey: workflow.key,
      outpaintCanvas: {
        ratio: normalized.ratio,
        resolution: "2K",
        position: { x: 0.5, y: 0.5 },
        scale: 1 / normalized.multiple,
      },
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

export function createBetaOutpaintConfiguration({ elements, initialState, onChange, onMessage }) {
  let settings = normalizeBetaOutpaintState(initialState);
  let workflows = [];
  const picker = bindSearchableChoice({
    container: elements.outpaintWorkflowOptions,
    multiple: true,
    label: "扩图工作流",
    placeholder: "选择扩图工作流",
    searchPlaceholder: "搜索工作流名称",
    presentOption(workflow) {
      return {
        label: workflow.label,
        selectable: workflow.available === true || settings.workflowKeys.includes(workflow.key),
        reason: workflow.available === true ? "" : `不可用 · ${workflow.reason || "配置未就绪"}`,
      };
    },
    onChange(workflowKeys) {
      settings = { ...settings, workflowKeys };
      render();
      onChange();
    },
    onMessage: (message) => onMessage(message?.replaceAll("出图模型", "扩图工作流")),
  });

  function selectedWorkflows() {
    return settings.workflowKeys.map((key) => workflows.find((workflow) => workflow.key === key))
      .filter(Boolean);
  }

  function unavailableReason() {
    const missing = settings.workflowKeys.find((key) => !workflows.some((entry) => entry.key === key));
    if (missing) return "所选扩图工作流已不在目录中，请刷新页面检查配置";
    const unavailable = selectedWorkflows().filter((workflow) => workflow.available !== true);
    return unavailable.map((workflow) => `${workflow.label}：${workflow.reason || "配置未就绪"}`).join("；");
  }

  function render() {
    picker.render(workflows, settings.workflowKeys);
    elements.outpaintRatioSelect.value = settings.ratio;
    elements.outpaintMultipleSelect.value = String(settings.multiple);
    const reason = unavailableReason();
    elements.outpaintAvailability.textContent = reason;
    elements.outpaintAvailability.classList.toggle("hidden", !reason);
  }

  for (const [select, key] of [
    [elements.outpaintRatioSelect, "ratio"], [elements.outpaintMultipleSelect, "multiple"],
  ]) select.addEventListener("change", () => {
    settings = normalizeBetaOutpaintState({ ...settings, [key]: select.value });
    render();
    onChange();
  });

  return {
    configure(config = {}) {
      workflows = (config.workflows || []).filter((workflow) => BETA_OUTPAINT_WORKFLOW_KEYS.includes(workflow.key));
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
      return buildBetaOutpaintItems({ cases, startedAt, workflows: selectedWorkflows(), settings });
    },
  };
}

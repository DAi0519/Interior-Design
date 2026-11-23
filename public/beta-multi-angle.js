/**
 * [INPUT]: 依赖共享多角度俯仰范围、Beta 脱敏模型目录、共享模型多选、样本 ID 与机位表单
 * [OUTPUT]: 提供独立模型和整批机位草稿、正俯视预设、按模型权限校验及样本乘模型的任务请求
 * [POS]: public 的 Beta 多角度配置层，复用已有图片样本，提交时仅引用原样本 ID
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { MULTI_ANGLE_ELEVATION_RANGE } from "./image-multi-angle-geometry.js";
import { bindModelMultiSelect } from "./model-multi-select.js?v=5";
import { createBetaRunId } from "./beta-run-id.js?v=2";

const [minElevation, maxElevation] = MULTI_ANGLE_ELEVATION_RANGE;
const topDown = Object.freeze({ azimuth: 0, elevation: maxElevation, distance: 50 });
const inRange = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;

export function normalizeBetaMultiAngleState(input) {
  const pose = input?.cameraPose;
  return {
    modelKeys: Array.isArray(input?.modelKeys)
      ? [...new Set(input.modelKeys.filter(key => typeof key === "string" && key))] : null,
    cameraPose: {
      azimuth: inRange(pose?.azimuth, 0, 360) ? pose.azimuth : topDown.azimuth,
      elevation: inRange(pose?.elevation, minElevation, maxElevation) ? pose.elevation : topDown.elevation,
      distance: [0, 50, 100].includes(pose?.distance) ? pose.distance : topDown.distance,
    },
  };
}

export function createBetaMultiAngleConfiguration({ elements, initialState, onChange, onMessage }) {
  let settings = normalizeBetaMultiAngleState(initialState);
  let config;
  const { multiAngleModelOptions, multiAngleAzimuth, multiAngleElevation, multiAngleDistance,
    multiAngleAzimuthValue, multiAngleElevationValue, multiAngleTopDownButton } = elements;
  multiAngleElevation.min = String(minElevation);
  multiAngleElevation.max = String(maxElevation);
  const picker = bindModelMultiSelect({
    container: multiAngleModelOptions,
    presentOption(model) {
      return {
        label: model.label,
        selectable: model.available === true || (settings.modelKeys || []).includes(model.key),
        reason: model.available ? "" : model.reason || "当前不可用",
      };
    },
    onChange(modelKeys) { settings = { ...settings, modelKeys }; renderModels(); onChange(); },
    onMessage,
  });

  function selectedModels() {
    return (settings.modelKeys || []).map(key => config?.models?.find(model => model.key === key)).filter(Boolean);
  }
  function unavailableReason() {
    if (!config?.available) return config?.reason || "多角度模型尚未就绪，请检查连接后刷新";
    const model = selectedModels().find(entry => !entry.available);
    return model ? `${model.label}：${model.reason || "当前不可用"}` : "";
  }
  function renderModels() { picker.render(config?.models || [], settings.modelKeys || []); }
  function renderPose() {
    const { azimuth, elevation, distance } = settings.cameraPose;
    multiAngleAzimuth.value = String(azimuth);
    multiAngleElevation.value = String(elevation);
    multiAngleAzimuthValue.value = `${azimuth}°`;
    multiAngleElevationValue.value = `${elevation}°`;
    multiAngleDistance.value = String(distance);
  }
  for (const [input, key, event] of [
    [multiAngleAzimuth, "azimuth", "input"], [multiAngleElevation, "elevation", "input"],
    [multiAngleDistance, "distance", "change"],
  ]) input.addEventListener(event, () => {
    settings.cameraPose = { ...settings.cameraPose, [key]: Number(input.value) };
    renderPose();
    onChange();
  });
  multiAngleTopDownButton.addEventListener("click", () => {
    settings.cameraPose = { ...settings.cameraPose, azimuth: topDown.azimuth, elevation: topDown.elevation };
    renderPose();
    onChange();
  });
  renderPose();

  return {
    configure(value) {
      config = value;
      if (Array.isArray(config?.models)) {
        const candidates = config.models.filter(model => model.available);
        const preferred = candidates.find(model => model.key === config.defaultModelKey) || candidates[0];
        settings.modelKeys = settings.modelKeys?.filter(key => config.models.some(model => model.key === key))
          ?? (preferred ? [preferred.key] : null);
      }
      renderModels();
    },
    selectedModels,
    unavailableReason,
    snapshot: () => ({ modelKeys: settings.modelKeys?.slice() ?? null, cameraPose: { ...settings.cameraPose } }),
    buildItems(cases, startedAt) {
      const reason = unavailableReason();
      if (reason) throw new Error(reason);
      const models = selectedModels();
      if (!cases.length) throw new Error("请选择图片样本集");
      if (!models.length) throw new Error("请选择多角度出图模型");
      return cases.flatMap((sample, sampleIndex) => models.map((model, modelIndex) => ({
        attempt: 1,
        caseId: sample.caseId,
        sampleId: sample.caseId,
        input: {
          featureMode: "imageMultiAngle", modelKey: model.key, multiAngleModel: model.key,
          cameraPose: { ...settings.cameraPose }, multiAnglePromptVersion: config.promptVersion,
        },
        label: `${sample.label} · ${model.label}`,
        modelLabel: model.label,
        runId: createBetaRunId({ modelKey: model.key, sequence: sampleIndex * models.length + modelIndex + 1, startedAt }),
      })));
    },
  };
}

/**
 * [INPUT]: 依赖实验配置 DOM、/api/catalog 模型矩阵、/api/styles 脱敏资源目录与 Benchmark Base 配置模板
 * [OUTPUT]: 对外提供系统实验 ID、八类可扩展单变量因子注册表、候选值控制器、模板推断、输出能力联动与通用实验草稿
 * [POS]: public 的 Benchmark 实验配置控制器，将任意质量配置映射为“固定控制项 + 唯一实验因子”，与页面编排和执行分责
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export const EXPERIMENT_VARIABLES = Object.freeze([
  { fieldId: "experimentStyleField", key: "style-dna", label: "Style DNA" },
  { fieldId: "experimentAgentField", key: "prompt-version", label: "Prompt 版本" },
  { fieldId: "experimentFusionModelField", key: "fusion-model", label: "融合基模" },
  { fieldId: "experimentFixedImageModelField", key: "image-model", label: "出图模型" },
  { fieldId: "experimentRatioField", key: "ratio", label: "输出比例" },
  { fieldId: "experimentResolutionField", key: "resolution", label: "分辨率" },
  { fieldId: "experimentFormatField", key: "output-format", label: "格式" },
  { fieldId: "experimentQualityField", key: "quality", label: "质量档" },
]);

function resourceId(value) {
  return String(value || "").match(/\[([^\]]+)\]\s*$/)?.[1] || "";
}

export function createExperimentId({ now = new Date(), randomValue } = {}) {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const entropy = String(
    randomValue || globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2),
  ).replace(/[^a-z0-9]/gi, "").slice(0, 4).toUpperCase().padEnd(4, "0");
  return `EXP-${stamp}-${entropy}`;
}

function outputPreset(value) {
  const text = String(value || "");
  return {
    format: text.match(/\b(PNG|JPE?G|WEBP)\b/i)?.[1]?.toLowerCase().replace("jpg", "jpeg") || "png",
    quality: text.match(/质量\s*(auto|low|medium|high)/i)?.[1]?.toLowerCase() || "medium",
    ratio: text.includes("跟随原图比例")
      ? "source"
      : text.match(/\b(1:1|1:4|1:8|2:3|3:2|3:4|4:1|4:3|4:5|5:4|8:1|9:16|16:9|21:9)\b/)?.[1] || "source",
    resolution: text.includes("原图尺寸")
      ? "source"
      : text.match(/\b(512|[1-4]K)\b/i)?.[1]?.toUpperCase() || "2K",
  };
}

function intersect(collections) {
  if (!collections.length) return [];
  return [...collections[0]].filter((value) =>
    collections.slice(1).every((collection) => collection.has(value)));
}

function modelResolutions(model, ratio) {
  if (ratio !== "source") return new Set(Object.keys(model.sizes[ratio] || {}));
  return new Set(intersect(
    Object.values(model.sizes).map((sizes) => new Set(Object.keys(sizes))),
  ));
}

export function experimentResolutionOptions(models, ratio) {
  const sourceModels = models.filter((model) => model.sizingMode === "source");
  const presetModels = models.filter((model) => model.sizingMode !== "source");
  if (sourceModels.length && presetModels.length) {
    const defaults = [...new Set(presetModels.map((model) => model.defaultResolution))];
    const presetLabel = defaults.length === 1 ? defaults[0] : "默认档位";
    return [{ label: `智能适配 · Flux 原图 / 其他 ${presetLabel}`, value: "adaptive" }];
  }
  return intersect(models.map((model) => modelResolutions(model, ratio))).map((value) => ({
    label: value === "source" ? "原图尺寸" : value,
    value,
  }));
}

function setOptions(select, options, preferred = "") {
  const previous = preferred || select.value;
  select.replaceChildren(...options.map(({ disabled = false, label, value }) => {
    const option = document.createElement("option");
    option.disabled = disabled;
    option.textContent = label;
    option.value = value;
    return option;
  }));
  const selectable = options.find((option) => option.value === previous && !option.disabled)
    || options.find((option) => !option.disabled);
  select.value = selectable?.value || "";
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function createExperimentDraftController({ byId, escapeHtml, onChange }) {
  const state = {
    agentModels: [],
    configs: [],
    models: [],
    promptAgents: [],
    selections: Object.fromEntries(EXPERIMENT_VARIABLES.map(({ key }) => [key, []])),
    styles: [],
    supportedLabels: new Set(),
    variableKey: "image-model",
  };

  const variableDefinition = (key = state.variableKey) =>
    EXPERIMENT_VARIABLES.find((entry) => entry.key === key) || EXPERIMENT_VARIABLES[3];
  const promptAgentKey = (agent) => `${agent.code}@v${agent.version}`;
  const fixedModel = () => state.models.find((model) =>
    model.key === byId("experimentFixedImageModelSelect").value);
  const checkedVariantValues = () => [...document.querySelectorAll("[data-experiment-variant-value]:checked")]
    .map((input) => input.dataset.experimentVariantValue);

  function selectedModels() {
    if (state.variableKey !== "image-model") return [fixedModel()].filter(Boolean);
    const keys = new Set(checkedVariantValues());
    return state.models.filter((model) => keys.has(model.key));
  }

  function syncOutputOptions(preferred = {}) {
    const models = selectedModels();
    if (!models.length) return;
    const ratios = intersect(models.map((model) => new Set(Object.keys(model.sizes))))
      .filter((ratio) => ratio !== "source");
    const ratioSelect = byId("experimentRatioSelect");
    setOptions(ratioSelect, [
      { label: "跟随原图 · 最近合法比例", value: "source" },
      ...ratios.map((ratio) => ({ label: ratio, value: ratio })),
    ], preferred.ratio);
    setOptions(
      byId("experimentResolutionSelect"),
      experimentResolutionOptions(models, ratioSelect.value),
      preferred.resolution || "2K",
    );
    setOptions(
      byId("experimentFormatSelect"),
      intersect(models.map((model) => new Set(model.formats)))
        .map((value) => ({ label: value.toUpperCase(), value })),
      preferred.format || "png",
    );
    const qualities = intersect(models.map((model) => new Set(
      model.qualityOptions.length ? model.qualityOptions : ["medium"],
    )));
    setOptions(
      byId("experimentQualitySelect"),
      qualities.map((value) => ({ label: value, value })),
      preferred.quality || "medium",
    );
  }

  function candidatesFor(key) {
    const model = fixedModel();
    if (key === "style-dna") return state.styles.map((style) => ({
      description: style.description || style.familyCode || "已发布风格",
      label: `${style.name || style.familyCode} · v${style.version}`,
      value: style.code,
    }));
    if (key === "prompt-version") return state.promptAgents.map((agent) => ({
      description: agent.code,
      label: `${agent.name} · v${agent.version}`,
      value: promptAgentKey(agent),
    }));
    if (key === "fusion-model") return state.agentModels.map((agentModel) => ({
      description: agentModel.note || "支持图片输入",
      label: agentModel.label,
      value: agentModel.key,
    }));
    if (key === "image-model") return state.models.map((imageModel) => ({
      description: imageModel.description,
      disabled: !state.supportedLabels.has(imageModel.label),
      label: imageModel.label,
      note: imageModel.sizingMode === "source" ? "原图尺寸智能路由" : "",
      unavailable: "横评表未配置图片列",
      value: imageModel.key,
    }));
    if (!model) return [];
    if (key === "ratio") return unique(["source", ...Object.keys(model.sizes)]).map((value) => ({
      description: value === "source" ? "按原图选择最近合法比例" : "固定输出画幅",
      label: value === "source" ? "跟随原图" : value,
      value,
    }));
    if (key === "resolution") return experimentResolutionOptions(
      [model],
      byId("experimentRatioSelect").value,
    ).map((option) => ({ ...option, description: "固定输出尺寸档位" }));
    if (key === "output-format") return model.formats.map((value) => ({
      description: "固定输出文件格式",
      label: value.toUpperCase(),
      value,
    }));
    if (key === "quality") return (model.qualityOptions.length
      ? model.qualityOptions
      : ["medium"]).map((value) => ({
      description: model.qualityOptions.length ? "模型原生质量档" : "当前模型仅支持默认档",
      label: value,
      value,
    }));
    return [];
  }

  function renderVariants(selectedValues = []) {
    const definition = variableDefinition();
    const candidates = candidatesFor(state.variableKey);
    const selectable = candidates.filter((candidate) => !candidate.disabled);
    const remembered = new Set(selectedValues.length
      ? selectedValues
      : state.selections[state.variableKey]);
    const selectAllByDefault = remembered.size === 0;
    byId("variantLegend").textContent = `候选 ${definition.label}`;
    byId("configOptions").innerHTML = candidates.map((candidate) => {
      const checked = !candidate.disabled && (selectAllByDefault || remembered.has(candidate.value));
      return `<label class="config-option${candidate.disabled ? " unavailable" : ""}">
        <input type="checkbox" ${checked ? "checked" : ""} ${candidate.disabled ? "disabled" : ""} data-experiment-variant-value="${escapeHtml(candidate.value)}" />
        <span><strong>${escapeHtml(candidate.label)}</strong><small>${escapeHtml(candidate.description || "")}</small>${candidate.note ? `<em>${escapeHtml(candidate.note)}</em>` : ""}${candidate.disabled ? `<em>${escapeHtml(candidate.unavailable)}</em>` : ""}</span>
      </label>`;
    }).join("");
    state.selections[state.variableKey] = checkedVariantValues();
    byId("variantSelectionMeta").textContent = `已选 ${state.selections[state.variableKey].length} / 可用 ${selectable.length}`;
  }

  function setVariableKey(nextKey, selectedValues = []) {
    if (state.variableKey !== nextKey && byId("configOptions").children.length) {
      state.selections[state.variableKey] = checkedVariantValues();
    }
    state.variableKey = variableDefinition(nextKey).key;
    byId("experimentVariableSelect").value = state.variableKey;
    EXPERIMENT_VARIABLES.forEach(({ fieldId, key }) => {
      byId(fieldId).classList.toggle("hidden", key === state.variableKey);
    });
    renderVariants(selectedValues);
    if (state.variableKey === "image-model") syncOutputOptions();
  }

  function configVariableValue(config, key) {
    const output = outputPreset(config.outputSpec);
    const values = {
      "fusion-model": state.agentModels.find((model) => model.id === resourceId(config.fusionModel))?.key,
      "image-model": state.models.find((model) => model.label === config.model)?.key,
      "output-format": output.format,
      "prompt-version": resourceId(config.fusionAgent),
      quality: output.quality,
      ratio: output.ratio,
      resolution: output.resolution,
      "style-dna": resourceId(config.styleDna),
    };
    return values[key] || "";
  }

  function inferTemplateVariable(configs) {
    const varying = EXPERIMENT_VARIABLES.filter(({ key }) =>
      new Set(configs.map((config) => configVariableValue(config, key))).size > 1)
      .map(({ key }) => key);
    if (varying.includes("image-model")) return "image-model";
    return varying[0] || "image-model";
  }

  function loadPreset(groupId) {
    const configs = state.configs.filter((config) => config.enabled && config.groupId === groupId);
    const first = configs[0];
    if (!first) return;
    const preset = outputPreset(first.outputSpec);
    byId("experimentStyleSelect").value = resourceId(first.styleDna);
    byId("experimentAgentSelect").value = resourceId(first.fusionAgent);
    byId("experimentFusionModelSelect").value = configVariableValue(first, "fusion-model");
    byId("experimentFixedImageModelSelect").value = configVariableValue(first, "image-model");
    byId("promptBatchesInput").value = first.promptBatches;
    byId("perBatchImagesInput").value = first.perBatchImages;
    syncOutputOptions(preset);
    const variableKey = inferTemplateVariable(configs);
    setVariableKey(variableKey, unique(configs.map((config) => configVariableValue(config, variableKey))));
    onChange();
  }

  function load({ catalog, configs, promptAgent, styles, supportedImageModelLabels }) {
    state.agentModels = catalog.agentModels.filter((model) => model.imageInput);
    state.configs = configs;
    state.models = catalog.models;
    state.promptAgents = promptAgent.versions || [];
    state.styles = styles.filter((style) => style.published && style.validDna);
    state.supportedLabels = new Set(supportedImageModelLabels);
    const groups = unique(configs.filter((config) => config.enabled).map((config) => config.groupId));
    setOptions(byId("groupSelect"), groups.map((group) => ({ label: `${group} · 作为模板`, value: group })));
    setOptions(byId("experimentStyleSelect"), state.styles.map((style) => ({
      label: `${style.name || style.familyCode} · v${style.version}`,
      value: style.code,
    })));
    setOptions(byId("experimentAgentSelect"), state.promptAgents.map((agent) => ({
      label: `${agent.name} · v${agent.version}`,
      value: promptAgentKey(agent),
    })));
    setOptions(byId("experimentFusionModelSelect"), state.agentModels.map((model) => ({
      label: model.label,
      value: model.key,
    })), "gemini3pro");
    setOptions(byId("experimentFixedImageModelSelect"), state.models
      .filter((model) => state.supportedLabels.has(model.label))
      .map((model) => ({ label: model.label, value: model.key })));
    if (groups.length) loadPreset(groups[0]);
    else {
      syncOutputOptions();
      setVariableKey("image-model");
    }
  }

  function input() {
    const promptAgentKeyValue = byId("experimentAgentSelect").value;
    const agentMatch = promptAgentKeyValue.match(/^(.+)@v(\d+)$/);
    const variants = checkedVariantValues();
    const ratio = byId("experimentRatioSelect").value;
    return {
      agentCode: agentMatch?.[1] || "",
      agentVersion: Number(agentMatch?.[2] || 0),
      fusionModelKey: byId("experimentFusionModelSelect").value,
      imageModelKey: byId("experimentFixedImageModelSelect").value,
      imageModelKeys: state.variableKey === "image-model" ? variants : [byId("experimentFixedImageModelSelect").value],
      outputFormat: byId("experimentFormatSelect").value,
      perBatchImages: Number(byId("perBatchImagesInput").value),
      promptAgentKey: promptAgentKeyValue,
      promptAgentKeys: state.variableKey === "prompt-version" ? variants : [promptAgentKeyValue],
      promptBatches: Number(byId("promptBatchesInput").value),
      quality: byId("experimentQualitySelect").value || "medium",
      ratio: ratio === "source" ? "" : ratio,
      ratioMode: ratio === "source" ? "source" : "preset",
      resolution: byId("experimentResolutionSelect").value,
      styleCode: byId("experimentStyleSelect").value,
      variableKey: state.variableKey,
      variableType: state.variableKey,
      variantValues: variants,
    };
  }

  byId("groupSelect").addEventListener("change", (event) => loadPreset(event.target.value));
  byId("experimentVariableSelect").addEventListener("change", (event) => {
    setVariableKey(event.target.value);
    onChange();
  });
  byId("configOptions").addEventListener("change", () => {
    state.selections[state.variableKey] = checkedVariantValues();
    byId("variantSelectionMeta").textContent = `已选 ${state.selections[state.variableKey].length} / 可用 ${candidatesFor(state.variableKey).filter((candidate) => !candidate.disabled).length}`;
    if (state.variableKey === "image-model") syncOutputOptions();
    onChange();
  });
  [
    "experimentStyleSelect", "experimentAgentSelect", "experimentFusionModelSelect",
    "experimentFixedImageModelSelect", "experimentRatioSelect", "experimentResolutionSelect",
    "experimentFormatSelect", "experimentQualitySelect", "promptBatchesInput", "perBatchImagesInput",
  ].forEach((id) => byId(id).addEventListener("change", () => {
    if (["experimentFixedImageModelSelect", "experimentRatioSelect"].includes(id)) {
      syncOutputOptions();
      if (["ratio", "resolution", "output-format", "quality"].includes(state.variableKey)) {
        renderVariants();
      }
    }
    onChange();
  }));

  return { input, load };
}

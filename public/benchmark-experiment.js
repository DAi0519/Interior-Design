/**
 * [INPUT]: 依赖实验配置 DOM、/api/catalog 模型矩阵、/api/styles 脱敏资源目录与 Benchmark Base 配置模板
 * [OUTPUT]: 对外提供系统实验 ID 生成、可编辑实验草稿控制器、模板载入、跨模型合法输出参数交集及冻结配置输入
 * [POS]: public 的 Benchmark 实验配置控制器，与 benchmark-app.js 的页面编排和任务执行分责
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

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
    resolution: text.match(/\b(512|[1-4]K)\b/i)?.[1]?.toUpperCase() || "2K",
  };
}

function intersect(collections) {
  if (!collections.length) return [];
  return [...collections[0]].filter((value) =>
    collections.slice(1).every((collection) => collection.has(value)));
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

export function createExperimentDraftController({ byId, escapeHtml, onChange }) {
  const state = {
    agentModels: [],
    configs: [],
    models: [],
    promptAgents: [],
    styles: [],
    supportedLabels: new Set(),
  };

  function selectedModels() {
    const keys = new Set(
      [...document.querySelectorAll("[data-experiment-model-key]:checked")]
        .map((input) => input.dataset.experimentModelKey),
    );
    return state.models.filter((model) => keys.has(model.key));
  }

  function modelResolutions(model, ratio) {
    if (ratio !== "source") return new Set(Object.keys(model.sizes[ratio] || {}));
    return new Set(intersect(
      Object.values(model.sizes).map((sizes) => new Set(Object.keys(sizes))),
    ));
  }

  function syncOutputOptions(preferred = {}) {
    const models = selectedModels();
    const ratioOptions = intersect(models.map((model) => new Set(Object.keys(model.sizes))));
    const ratioSelect = byId("experimentRatioSelect");
    setOptions(ratioSelect, [
      { label: "跟随原图 · 最近合法比例", value: "source" },
      ...ratioOptions.map((ratio) => ({ label: ratio, value: ratio })),
    ], preferred.ratio);
    const ratio = ratioSelect.value;
    const resolutions = intersect(models.map((model) => modelResolutions(model, ratio)));
    setOptions(
      byId("experimentResolutionSelect"),
      resolutions.map((value) => ({ label: value, value })),
      preferred.resolution || "2K",
    );
    const formats = intersect(models.map((model) => new Set(model.formats)));
    setOptions(
      byId("experimentFormatSelect"),
      formats.map((value) => ({ label: value.toUpperCase(), value })),
      preferred.format || "png",
    );
    const qualityModels = models.filter((model) => model.qualityOptions.length);
    const qualities = intersect(qualityModels.map((model) => new Set(model.qualityOptions)));
    const qualitySelect = byId("experimentQualitySelect");
    setOptions(
      qualitySelect,
      qualities.length
        ? qualities.map((value) => ({ label: value, value }))
        : [{ label: "不适用", value: "medium" }],
      preferred.quality || "medium",
    );
    qualitySelect.disabled = qualities.length === 0;
  }

  function renderModels(selectedLabels = []) {
    const selected = new Set(selectedLabels);
    byId("configOptions").innerHTML = state.models.map((model) => {
      const supported = state.supportedLabels.has(model.label);
      const checked = supported && (selected.size ? selected.has(model.label) : true);
      return `<label class="config-option${supported ? "" : " unavailable"}">
        <input type="checkbox" ${checked ? "checked" : ""} ${supported ? "" : "disabled"} data-experiment-model-key="${escapeHtml(model.key)}" />
        <span><strong>${escapeHtml(model.label)}</strong><small>${escapeHtml(model.description)}</small>${supported ? "" : "<em>横评表未配置图片列</em>"}</span>
      </label>`;
    }).join("");
  }

  function loadPreset(groupId) {
    const configs = state.configs.filter((config) => config.enabled && config.groupId === groupId);
    const first = configs[0];
    if (!first) return;
    const styleCode = resourceId(first.styleDna);
    const agentResource = resourceId(first.fusionAgent);
    const agentMatch = agentResource.match(/^(.+)@v(\d+)$/);
    const fusionModelId = resourceId(first.fusionModel);
    const preset = outputPreset(first.outputSpec);
    byId("experimentStyleSelect").value = styleCode;
    byId("experimentAgentSelect").value = agentMatch ? `${agentMatch[1]}@v${agentMatch[2]}` : "";
    byId("experimentFusionModelSelect").value = state.agentModels.find((model) => model.id === fusionModelId)?.key || "";
    byId("promptBatchesInput").value = first.promptBatches;
    byId("perBatchImagesInput").value = first.perBatchImages;
    renderModels(configs.map((config) => config.model));
    syncOutputOptions(preset);
    onChange();
  }

  function load({ catalog, configs, promptAgent, styles, supportedImageModelLabels }) {
    state.agentModels = catalog.agentModels.filter((model) => model.imageInput);
    state.configs = configs;
    state.models = catalog.models;
    state.promptAgents = promptAgent.versions || [];
    state.styles = styles.filter((style) => style.published && style.validDna);
    state.supportedLabels = new Set(supportedImageModelLabels);
    const groups = [...new Set(configs.filter((config) => config.enabled).map((config) => config.groupId))];
    setOptions(
      byId("groupSelect"),
      groups.map((group) => ({ label: `${group} · 作为模板`, value: group })),
    );
    setOptions(
      byId("experimentStyleSelect"),
      state.styles.map((style) => ({
        label: `${style.name || style.familyCode} · v${style.version}`,
        value: style.code,
      })),
    );
    setOptions(
      byId("experimentAgentSelect"),
      state.promptAgents.map((agent) => ({
        label: `${agent.name} · v${agent.version}`,
        value: `${agent.code}@v${agent.version}`,
      })),
    );
    setOptions(
      byId("experimentFusionModelSelect"),
      state.agentModels.map((model) => ({ label: model.label, value: model.key })),
      "gemini3pro",
    );
    loadPreset(groups[0]);
  }

  function input() {
    const agent = byId("experimentAgentSelect").value.match(/^(.+)@v(\d+)$/);
    const ratio = byId("experimentRatioSelect").value;
    return {
      agentCode: agent?.[1] || "",
      agentVersion: Number(agent?.[2] || 0),
      fusionModelKey: byId("experimentFusionModelSelect").value,
      imageModelKeys: selectedModels().map((model) => model.key),
      outputFormat: byId("experimentFormatSelect").value,
      perBatchImages: Number(byId("perBatchImagesInput").value),
      promptBatches: Number(byId("promptBatchesInput").value),
      quality: byId("experimentQualitySelect").value || "medium",
      ratio: ratio === "source" ? "" : ratio,
      ratioMode: ratio === "source" ? "source" : "preset",
      resolution: byId("experimentResolutionSelect").value,
      styleCode: byId("experimentStyleSelect").value,
    };
  }

  byId("groupSelect").addEventListener("change", (event) => loadPreset(event.target.value));
  byId("configOptions").addEventListener("change", () => {
    syncOutputOptions();
    onChange();
  });
  [
    "experimentStyleSelect", "experimentAgentSelect", "experimentFusionModelSelect",
    "experimentRatioSelect", "experimentResolutionSelect", "experimentFormatSelect",
    "experimentQualitySelect", "promptBatchesInput", "perBatchImagesInput",
  ].forEach((id) => byId(id).addEventListener("change", () => {
    if (id === "experimentRatioSelect") syncOutputOptions();
    onChange();
  }));

  return { input, load };
}

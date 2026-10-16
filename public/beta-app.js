/**
 * [INPUT]: 依赖 beta.html DOM、beta-model-rules 八功能/全景 2:1 与功能尺寸合同、beta-design-config 独立风格来源/版本与 beta-configuration/beta-page-state 本机持久配置状态、effect-beautification-controls 强度色调控制器、带飞书同步回执的 beta-sample-library、beta-results、beta-run-id、beta-assets 图片去重、custom-select/beta-upload/workbench-utils/image-ratio/generation-batch 共享合同，以及 /api/catalog、/api/styles、/api/session、/api/check-models、/api/beta 配置与任务接口
 * [OUTPUT]: 对外提供默认 Flux2 Klein、可跨工作台恢复的八功能（含明确平台/参考图风格转换）/样本集/模型/美化强度色调/含 GPT Image 2.5 质量档的参数配置、仅已上架的精模 Prompt 选择、出图模型完整名称悬停/无障碍标签、全景固定 2:1/独立 Prompt 版本与不兼容模型禁选回退、当前 Key 未开放的提示词模型禁选、按飞书样本 ID 展开的不限数量批次、共享参考去重、单图 8MB 校验和新样本单张读取上传、独立测试时间与 Run ID、全宽 START、任务恢复及生成/同步双阶段监控
 * [POS]: public 的 Beta跑图配置与任务监控编排器，把可复用样本资产交给 beta-sample-library，并把服务端回读确认的轻量结果交给 beta-results；飞书保持结果真源
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import "./custom-select.js?v=7";
import { DEFAULT_BETA_MODEL_KEY, readBetaPageState } from "./beta-page-state.js?v=4";
import { createBetaConfigurationPersistence } from "./beta-configuration.js?v=4";
import { BETA_FEATURE_COPY as FEATURE_COPY, assertBetaPanoramaSource, betaModelSelectable, betaSizeOptions } from "./beta-model-rules.js?v=2";
import { createBetaDesignConfiguration } from "./beta-design-config.js";
import { bindEffectBeautificationControls } from "./effect-beautification-controls.js?v=1";
import { packBatchAssets } from "./beta-assets.js?v=2";
import { bindImageDrop, renderImagePreviews } from "./beta-upload.js";
import { createBetaSampleLibrary } from "./beta-sample-library.js?v=7";
import { renderBetaResults } from "./beta-results.js?v=1";
import { createBetaRunId, formatBetaTestTime } from "./beta-run-id.js?v=2";
import { adaptGenerationInputForModel } from "./generation-batch.js";
import { readImageDimensions } from "./image-ratio.js";
import { api, readFileAsInput } from "./workbench-utils.js";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const JOB_STORAGE_KEY = "canvas-lab:beta-run-job";
const restoredPageState = readBetaPageState(localStorage);

const elements = Object.fromEntries([
  "betaConnectionStatus", "betaFeatureOptions", "betaForm",
  "betaGenerationActions",
  "commonPromptField", "commonPromptInput", "commonPromptLabel",
  "configStatus", "designFields", "effectFields", "effectTimeSelect", "effectBeautificationFields",
  "effectBeautificationIntensityOptions", "effectBeautificationToneOptions",
  "effectWeatherSelect", "emptyRoomFields", "freePromptList", "freePromptsField",
  "freePromptsInput", "freeReferenceDropZone", "freeReferenceField",
  "freeReferenceInput", "freeReferenceList", "generationProgressBar",
  "generationProgressCount", "generationProgressTrack", "jobProgress",
  "jobProgressBar", "jobProgressCount", "jobProgressLabel", "jobProgressTrack",
  "jobStatus", "modelOptions", "monitorBaseLink", "monitorBatchSummary",
  "monitorResults", "monitorResultsCount",
  "negativePromptField", "negativePromptInput", "promptAgentAvailability", "promptAgentModelSelect",
  "panoramaFields",
  "promptAgentVersionField", "promptAgentVersionSelect", "qualityField",
  "qualitySelect", "ratioSelect", "refinedPromptField", "refinedPromptSelect",
  "renderModeSelect", "resolutionSelect", "roomTypeDetailField",
  "roomTypeDetailInput", "roomTypeSelect", "runButton", "runButtonLabel", "runHint",
  "runSummary", "sampleCount", "sampleList", "sampleSetCreatePanel",
  "sampleSetLibraryPanel", "sampleSetNameInput", "sampleSetSelect",
  "sampleSetSyncStatus",
  "saveSampleSetButton", "cancelSampleSetButton", "newSampleSetButton",
  "sourceFilesDropLabel",
  "sourceFilesDropZone", "sourceFilesField", "sourceFilesInput", "sourceFilesTitle", "sourceFilesHint",
  "styleField", "styleReferenceDropZone", "styleReferenceField",
  "styleReferenceInput", "styleReferenceList", "styleSelect",
].map((id) => [id, document.querySelector(`#${id}`)]));

const state = {
  betaConfig: null,
  catalog: { agentModels: [], emptyRoomTypes: [], models: [] },
  connected: false,
  featureMode: restoredPageState.featureMode,
  freeReference: null,
  job: null,
  modelAccess: new Map(),
  modelAccessChecked: false,
  agentAccess: new Map(),
  agentAccessChecked: false,
  sampleSetIds: { ...restoredPageState.sampleSetIds },
  selectedModelKeys: [...restoredPageState.selectedModelKeys],
  styleReference: null,
  stylesConfig: null,
};

const effectBeautificationControls = bindEffectBeautificationControls({
  intensityGroup: elements.effectBeautificationIntensityOptions,
  onChange: saveConfiguration,
  toneGroup: elements.effectBeautificationToneOptions,
});

const sampleLibrary = createBetaSampleLibrary({
  api,
  elements,
  onChange: renderRunSummary,
  onError: reportUploadError,
  onSelectionChange(featureMode, sampleSetId) {
    state.sampleSetIds[featureMode] = sampleSetId;
    saveConfiguration();
  },
  readImage,
  validateSourceImage: assertBetaPanoramaSource,
});

const designConfiguration = createBetaDesignConfiguration({ elements, fillSelect, getState: () => state, restoredPageState });
const configuration = createBetaConfigurationPersistence({
  currentState: () => ({
    featureMode: state.featureMode,
    sampleSetIds: state.sampleSetIds,
    selectedModelKeys: state.selectedModelKeys,
    stylesReady: Boolean(state.stylesConfig),
    designControls: designConfiguration.snapshot(),
  }),
  effectBeautificationControls,
  elements,
  renderFeature,
  renderOutputControls,
  renderRunSummary,
  restoredPageState,
  storage: localStorage,
});

function saveConfiguration() {
  configuration.save();
}

function fillSelect(select, options, current = "") {
  const selected = options.find((option) => String(option.value) === String(current) && !option.disabled)
    || options.find((option) => !option.disabled);
  select.replaceChildren(...options.map((entry) => {
    const { disabled = false, label, value } = entry;
    const option = document.createElement("option");
    option.value = String(value);
    option.textContent = label;
    option.disabled = disabled;
    option.selected = entry === selected;
    return option;
  }));
  if (!selected) select.value = "";
}

function renderPromptAgentModels() {
  const models = state.catalog.agentModels.filter((model) => model.imageInput);
  const previousKey = elements.promptAgentModelSelect.value;
  const previous = models.find((model) => model.key === previousKey);
  fillSelect(elements.promptAgentModelSelect, models.map((model) => {
    const access = state.agentAccess.get(model.key);
    const disabled = state.agentAccessChecked && !access?.selectable;
    return {
      disabled,
      label: disabled ? `${model.label} · ${access?.reason || "当前不可用"}` : model.label,
      value: model.key,
    };
  }), previousKey || "gemini3pro");
  const selected = models.find((model) => model.key === elements.promptAgentModelSelect.value);
  elements.promptAgentAvailability.textContent = !state.connected
    ? "请先连接 OneAPI"
    : !state.agentAccessChecked
      ? "正在检测模型权限"
      : previous && previous.key !== selected?.key
        ? `${previous.label} 当前不可用，已切换为 ${selected?.label || "可用模型"}`
        : selected
          ? "当前 API Key 已开放此模型"
          : "当前 API Key 没有可用的提示词模型";
  renderRunSummary();
}

function selectedModels() {
  return state.selectedModelKeys
    .map((key) => state.catalog.models.find((model) => model.key === key))
    .filter(Boolean);
}

function sampleCount() {
  return sampleLibrary.sampleCount();
}

function runCount() {
  return sampleCount() * selectedModels().length;
}

function showStatus(message, { error = false, ready = false } = {}) {
  elements.betaConnectionStatus.textContent = message;
  elements.betaConnectionStatus.classList.toggle("ready", ready);
  elements.betaConnectionStatus.classList.toggle("error", error);
}

async function readImage(file, { previewOnly = false } = {}) {
  if (!file || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    throw new Error(`${file?.name || "文件"} 不是 PNG、JPEG 或 WebP`);
  }
  if (file.size > MAX_IMAGE_BYTES) throw new Error(`${file.name} 超过 8MB`);
  if (previewOnly) {
    const previewUrl = URL.createObjectURL(file);
    try {
      return { file, name: file.name, size: file.size, type: file.type, previewUrl,
        ...await readImageDimensions(previewUrl, file.name), lastModified: file.lastModified };
    } catch (error) {
      URL.revokeObjectURL(previewUrl);
      throw error;
    }
  }
  const input = await readFileAsInput(file);
  return {
    ...input,
    ...await readImageDimensions(input.dataUrl, file.name),
    lastModified: file.lastModified,
  };
}

function renderSingleReference(key, list, dropZone) {
  const images = state[key] ? [state[key]] : [];
  renderImagePreviews(list, images, {
    onRemove: () => {
      state[key] = null;
      renderSingleReference(key, list, dropZone);
      if (key === "styleReference") designConfiguration.referenceChanged();
      renderRunSummary();
      saveConfiguration();
    },
    replaceEnabled: images.length === 1,
  });
  dropZone.classList.toggle("hidden", images.length === 1);
}

function renderReferenceInputs() {
  renderSingleReference("styleReference", elements.styleReferenceList, elements.styleReferenceDropZone);
  renderSingleReference("freeReference", elements.freeReferenceList, elements.freeReferenceDropZone);
}

function renderRunSummary() {
  for (const button of elements.betaFeatureOptions.querySelectorAll("[data-feature-mode]")) {
    button.disabled = sampleLibrary.isBusy();
  }
  const total = runCount();
  const samples = sampleCount();
  const models = selectedModels().length;
  elements.runSummary.textContent = samples && models
    ? `${samples} 个样本 × ${models} 个模型 = ${total} 张结果`
    : samples ? "请选择出图模型" : "请选择样本集";
  const failed = state.job?.status === "failed";
  elements.runHint.textContent = failed ? "重新运行当前批次" : "结果自动同步飞书";
  const monitoredTotal = Number(state.job?.total) || total;
  elements.monitorBatchSummary.textContent = state.job
    ? `${monitoredTotal} 张结果`
    : total ? `预计 ${total} 张结果` : "尚未开始";
  if (!state.job) {
    renderProgress(elements.generationProgressTrack, elements.generationProgressBar, elements.generationProgressCount, 0, total);
    renderProgress(elements.jobProgressTrack, elements.jobProgressBar, elements.jobProgressCount, 0, total);
  }
  const running = state.job?.status === "running";
  const needsPromptAgent = ["whiteModel", "emptyRoom", "styleTransfer"].includes(state.featureMode);
  const selectedAgent = state.agentAccess.get(elements.promptAgentModelSelect.value);
  const agentReady = !needsPromptAgent || (state.agentAccessChecked && selectedAgent?.selectable);
  const effectPromptKey = FEATURE_COPY[state.featureMode].promptConfig;
  const effectReady = !effectPromptKey || state.stylesConfig?.[effectPromptKey]?.available;
  const targetReady = state.featureMode !== "styleTransfer" || designConfiguration.ready();
  if (!agentReady && !running) {
    elements.runHint.textContent = state.agentAccessChecked
      ? "提示词模型不可用，请选择当前 Key 已开放的模型"
      : "正在检测提示词模型权限";
  }
  if (!targetReady && agentReady && !running) elements.runHint.textContent = "请选择平台风格，或上传风格参考图";
  elements.runButton.disabled = !state.connected
    || !sampleLibrary.isReady()
    || total < 1
    || !agentReady
    || !effectReady
    || !targetReady
    || running;
  elements.runButtonLabel.textContent = running ? "RUNNING…" : failed ? "RETRY" : "START";
  elements.runButton.setAttribute("aria-busy", String(running));
  elements.runButton.setAttribute("aria-label", running ? "批量运行中" : failed ? "重新运行当前批次" : "开始批量运行");
  elements.betaGenerationActions.classList.toggle("is-busy", running);
}

function modelAvailable(model) {
  if (!state.modelAccessChecked) return true;
  const access = state.modelAccess.get(model.key);
  return access ? access.available : model.provider === "comfyui";
}

function renderModels() {
  const runnable = state.catalog.models.filter((model) => modelAvailable(model));
  const selectable = runnable.filter((model) => betaModelSelectable(model, state.featureMode));
  state.selectedModelKeys = state.selectedModelKeys.filter((key) =>
    selectable.some((model) => model.key === key));
  if (!state.selectedModelKeys.length && selectable[0]) {
    const defaultModel = selectable.find((model) => model.key === DEFAULT_BETA_MODEL_KEY)
      || selectable[0];
    state.selectedModelKeys = [defaultModel.key];
  }
  elements.modelOptions.replaceChildren(...runnable.map((model) => {
    const button = document.createElement("button");
    const label = document.createElement("span");
    const check = document.createElement("i");
    const selected = state.selectedModelKeys.includes(model.key);
    button.type = "button";
    button.className = "model-option-toggle";
    button.classList.toggle("selected", selected);
    button.dataset.modelKey = model.key;
    button.disabled = !betaModelSelectable(model, state.featureMode);
    button.setAttribute("role", "checkbox");
    button.setAttribute("aria-checked", String(selected));
    label.textContent = button.disabled ? `${model.label} · 不支持 2:1` : model.label;
    button.title = label.textContent;
    button.setAttribute("aria-label", label.textContent);
    check.setAttribute("aria-hidden", "true");
    check.textContent = selected ? "✓" : "+";
    button.append(label, check);
    return button;
  }));
  renderOutputControls();
}

function renderOutputControls() {
  const models = selectedModels();
  const sizes = betaSizeOptions({ models, featureMode: state.featureMode,
    currentRatio: elements.ratioSelect.value, currentResolution: elements.resolutionSelect.value });
  fillSelect(elements.ratioSelect, sizes.ratioOptions, sizes.ratio);
  elements.ratioSelect.disabled = sizes.ratioDisabled;
  fillSelect(elements.resolutionSelect, sizes.resolutionOptions, sizes.resolution);
  const hasQuality = models.some((model) => model.qualityOptions.length > 0);
  elements.qualityField.classList.toggle("hidden", !hasQuality);
  const qualities = [...new Set(models.flatMap((model) => model.qualityOptions))];
  fillSelect(elements.qualitySelect, qualities.map((value) => ({
    label: { auto: "自动", low: "低", medium: "中", high: "高", xhigh: "极高", max: "最高" }[value] || value,
    value,
  })), qualities.includes(elements.qualitySelect.value)
    ? elements.qualitySelect.value
    : models[0]?.defaultQuality || qualities[0]);
  elements.negativePromptField.classList.toggle(
    "hidden",
    !models.some((model) => model.provider === "comfyui"),
  );
  renderRunSummary();
}

function renderDesignConfig() { designConfiguration.render(); }

function renderFeature() {
  const copy = FEATURE_COPY[state.featureMode];
  for (const button of elements.betaFeatureOptions.querySelectorAll("[data-feature-mode]")) {
    const selected = button.dataset.featureMode === state.featureMode;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-checked", String(selected));
  }
  const free = state.featureMode === "free";
  const design = ["whiteModel", "emptyRoom", "styleTransfer"].includes(state.featureMode);
  const emptyRoom = state.featureMode === "emptyRoom";
  const effect = Boolean(copy.promptConfig);
  const refined = state.featureMode === "refinedModel";
  elements.commonPromptField.classList.toggle("hidden", free || effect);
  elements.designFields.classList.toggle("hidden", !design);
  elements.styleReferenceField.classList.toggle("hidden", !design);
  elements.emptyRoomFields.classList.add("hidden");
  elements.effectFields.classList.toggle("hidden", state.featureMode !== "effectEnhancement");
  elements.effectBeautificationFields.classList.toggle("hidden", state.featureMode !== "effectBeautification");
  elements.panoramaFields.classList.toggle("hidden", state.featureMode !== "panoramaEnhancement");
  elements.refinedPromptField.classList.toggle("hidden", !refined);
  elements.freeReferenceField.classList.toggle("hidden", !free);
  elements.sourceFilesTitle.textContent = copy.source;
  elements.sourceFilesDropLabel.textContent = `添加或拖入${copy.source}`;
  elements.sourceFilesInput.setAttribute("aria-label", `添加${copy.source}`);
  elements.sourceFilesHint.textContent = `PNG / JPEG / WebP · 单张 8MB · 逐张上传${state.featureMode === "panoramaEnhancement" ? " · 必须为 2:1 全景图" : ""}`;
  elements.commonPromptLabel.textContent = copy.prompt;
  elements.configStatus.textContent = design ? "读取设计配置" : effect ? "使用当前上架 Prompt" : refined ? "读取精模 Prompt" : "工作台同源";
  if (design) renderDesignConfig();
  if (effect) {
    const effectConfig = state.stylesConfig?.[copy.promptConfig];
    elements.configStatus.textContent = effectConfig?.available
      ? `Prompt v${effectConfig.version}` : `${copy.label} Prompt 不可用`;
  }
  if (refined) {
    const promptConfig = state.stylesConfig?.refinedPrompt;
    const versions = (promptConfig?.versions || []).filter((entry) => entry.published === true);
    fillSelect(elements.refinedPromptSelect, versions.map((entry) => ({
      label: `${entry.name} · v${entry.version}`,
      value: entry.version,
    })), promptConfig?.defaultVersion);
    elements.refinedPromptSelect.disabled = versions.length === 0;
    elements.configStatus.textContent = versions.length ? "精模 Prompt 已就绪" : "精模 Prompt 不可用";
  }
  renderReferenceInputs();
  renderRunSummary();
  renderModels();
}

function currentCases() {
  return sampleLibrary.currentCases({
    commonPrompt: elements.commonPromptInput.value.trim(),
    freeReference: state.freeReference,
  });
}

function designSettings() { return designConfiguration.settings(); }

function assertFeatureConfig() {
  sampleLibrary.assertRoomTypes();
  if (state.featureMode === "refinedModel" && !elements.refinedPromptSelect.value) {
    throw new Error("精模 Prompt 版本不可用");
  }
  const effectCopy = FEATURE_COPY[state.featureMode];
  if (effectCopy.promptConfig && !state.stylesConfig?.[effectCopy.promptConfig]?.available) {
    throw new Error(`${effectCopy.label} Prompt 不可用`);
  }
  if (state.featureMode === "panoramaEnhancement"
    && (!Number.isInteger(state.stylesConfig?.panoramaEnhancementPrompt?.version)
      || state.stylesConfig.panoramaEnhancementPrompt.version < 1)) {
    throw new Error("全景图美化 Prompt 版本不可用");
  }
}

function buildItems(startedAt = new Date()) {
  assertFeatureConfig();
  const cases = currentCases();
  const models = selectedModels();
  if (!cases.length) throw new Error("请先添加批量样本");
  if (!models.length) throw new Error("请选择出图模型");
  if (state.featureMode === "free"
    && models.some((model) => model.requiresReferenceImage)
    && !state.freeReference) {
    throw new Error("当前所选模型需要自由生图参考图");
  }
  const ratioAuto = elements.ratioSelect.value === "auto";
  return cases.flatMap((currentCase, caseIndex) => models.map((model, modelIndex) => {
    const input = {
      featureMode: state.featureMode,
      modelKey: model.key,
      negativePrompt: elements.negativePromptInput.value.trim(),
      outputFormat: "png",
      prompt: FEATURE_COPY[state.featureMode].promptConfig ? "" : currentCase.prompt,
      quality: elements.qualitySelect.value,
      ratio: ratioAuto ? model.defaultRatio : elements.ratioSelect.value,
      ratioMode: ratioAuto ? "auto" : "manual",
      referenceImages: currentCase.referenceImages,
      resolution: elements.resolutionSelect.value || model.defaultResolution,
      ...(state.featureMode === "effectEnhancement" ? {
        effectTime: elements.effectTimeSelect.value,
        effectWeather: elements.effectWeatherSelect.value,
      } : {}),
      ...(state.featureMode === "effectBeautification" ? {
        effectBeautification: effectBeautificationControls.value(),
        effectBeautificationPromptVersion: state.stylesConfig?.effectBeautificationPrompt?.version,
      } : {}),
      ...(state.featureMode === "panoramaEnhancement" ? {
        panoramaPromptVersion: state.stylesConfig?.panoramaEnhancementPrompt?.version,
      } : {}),
      ...(state.featureMode === "refinedModel" ? {
        promptVersion: Number(elements.refinedPromptSelect.value),
      } : {}),
      ...(["whiteModel", "emptyRoom", "styleTransfer"].includes(state.featureMode) ? designSettings() : {}),
      ...(state.featureMode === "emptyRoom" ? {
        roomType: currentCase.roomType,
        ...(currentCase.roomType === "其他"
          ? { roomTypeDetail: currentCase.roomTypeDetail.trim() }
          : {}),
      } : {}),
    };
    const adapted = adaptGenerationInputForModel(input, model, {
      featureMode: state.featureMode,
      sourceImage: currentCase.referenceImages[0] || null,
    });
    if (state.featureMode === "panoramaEnhancement") adapted.ratioMode = "original";
    return {
      attempt: 1,
      caseId: currentCase.caseId,
      sampleId: currentCase.caseId,
      input: adapted,
      label: `${currentCase.label} · ${model.label}`,
      modelLabel: model.label,
      runId: createBetaRunId({
        modelKey: model.key,
        sequence: (caseIndex * models.length) + modelIndex + 1,
        startedAt,
      }),
    };
  }));
}

function renderProgress(track, bar, count, value, total) {
  const normalizedValue = Math.max(0, Math.min(Number(value) || 0, Number(total) || 0));
  const normalizedTotal = Math.max(0, Number(total) || 0);
  count.textContent = `${normalizedValue} / ${normalizedTotal}`;
  bar.style.transform = `scaleX(${normalizedTotal ? normalizedValue / normalizedTotal : 0})`;
  track.setAttribute("aria-valuemax", String(normalizedTotal));
  track.setAttribute("aria-valuenow", String(normalizedValue));
}

function renderJob(job) {
  state.job = job;
  renderBetaResults({
    container: elements.monitorResults,
    count: elements.monitorResultsCount,
    results: job?.result?.results,
  });
  const running = job?.status === "running";
  elements.jobStatus.textContent = running
    ? "运行中"
    : job?.status === "success"
      ? "已完成"
      : job?.status === "failed"
        ? "失败"
        : "待运行";
  elements.jobStatus.dataset.state = running
    ? "running"
    : job?.status === "success" ? "success" : job?.status === "failed" ? "error" : "idle";
  if (job) {
    const completed = Number(job.completed) || 0;
    const total = Number(job.total) || 0;
    const generated = Number(job.stages?.generated) || (job.status === "success" ? total : 0);
    const synced = Number(job.stages?.synced) || completed;
    elements.jobProgressLabel.textContent = job.status === "failed"
      ? job.error || "自动重试后仍未同步飞书"
      : job.status === "success"
        ? "全部结果已生成并同步飞书。"
        : job.message || "处理中";
    renderProgress(elements.generationProgressTrack, elements.generationProgressBar, elements.generationProgressCount, generated, total);
    renderProgress(elements.jobProgressTrack, elements.jobProgressBar, elements.jobProgressCount, synced, total);
  } else {
    elements.jobProgressLabel.textContent = "运行后，这里会持续显示生成与同步进度。";
    renderProgress(elements.generationProgressTrack, elements.generationProgressBar, elements.generationProgressCount, 0, 0);
    renderProgress(elements.jobProgressTrack, elements.jobProgressBar, elements.jobProgressCount, 0, 0);
  }
  renderRunSummary();
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function followJob(jobId) {
  let job;
  do {
    await delay(800);
    ({ job } = await api(`/api/beta/jobs/${encodeURIComponent(jobId)}`));
    renderJob(job);
  } while (job.status === "running");
  return job;
}

async function startBatch() {
  saveConfiguration();
  const startedAt = new Date();
  const batchId = `BETA-${crypto.randomUUID().replaceAll("-", "")}`;
  const jobId = `beta-${crypto.randomUUID()}`;
  const packed = packBatchAssets(buildItems(startedAt), state.featureMode);
  const { job } = await api("/api/beta/jobs", {
    body: JSON.stringify({
      ...packed,
      batchId,
      featureMode: state.featureMode,
      jobId,
      sampleSetId: sampleLibrary.activeSampleSetId(),
      testTime: formatBetaTestTime(startedAt),
    }),
    method: "POST",
  });
  sessionStorage.setItem(JOB_STORAGE_KEY, jobId);
  renderJob(job);
  await followJob(jobId);
}

async function restoreJob() {
  const jobId = sessionStorage.getItem(JOB_STORAGE_KEY);
  if (!jobId) return;
  try {
    const { job } = await api(`/api/beta/jobs/${encodeURIComponent(jobId)}`);
    renderJob(job);
    if (job.status === "running") await followJob(jobId);
  } catch {
    sessionStorage.removeItem(JOB_STORAGE_KEY);
  }
}

function reportUploadError(error) {
  state.job = null;
  renderBetaResults({
    container: elements.monitorResults,
    count: elements.monitorResultsCount,
  });
  elements.jobStatus.textContent = error.message;
  elements.jobStatus.dataset.state = "error";
  elements.jobProgressLabel.textContent = `配置未就绪：${error.message}`;
  renderRunSummary();
}

async function setSingleReference(fileList, key) {
  try {
    const file = Array.from(fileList)[0];
    if (!file) return;
    const next = await readImage(file);
    state[key] = next;
    renderReferenceInputs();
    if (key === "styleReference") designConfiguration.referenceChanged();
    renderRunSummary();
    saveConfiguration();
  } catch (error) {
    reportUploadError(error);
  }
}

function bindEvents() {
  sampleLibrary.bind();
  configuration.bindLifecycle();
  elements.betaFeatureOptions.addEventListener("click", (event) => {
    const button = event.target.closest("[data-feature-mode]");
    if (!button || sampleLibrary.isBusy()) return;
    state.featureMode = button.dataset.featureMode;
    renderFeature();
    sampleLibrary.setFeatureMode(
      state.featureMode,
      state.sampleSetIds[state.featureMode],
    ).then(saveConfiguration).catch(reportUploadError);
  });
  for (const [input, key, list, dropZone] of [
    [elements.styleReferenceInput, "styleReference", elements.styleReferenceList, elements.styleReferenceDropZone],
    [elements.freeReferenceInput, "freeReference", elements.freeReferenceList, elements.freeReferenceDropZone],
  ]) {
    bindImageDrop({
      canReplace: () => Boolean(state[key]),
      dropZone,
      input,
      list,
      onFiles: (files) => setSingleReference(files, key),
    });
  }
  elements.modelOptions.addEventListener("click", (event) => {
    const button = event.target.closest("[data-model-key]");
    if (!button || button.disabled) return;
    const key = button.dataset.modelKey;
    if (state.selectedModelKeys.includes(key)) {
      if (state.selectedModelKeys.length > 1) {
        state.selectedModelKeys = state.selectedModelKeys.filter((entry) => entry !== key);
      }
    } else if (state.selectedModelKeys.length < 4) {
      state.selectedModelKeys.push(key);
    }
    renderModels();
    saveConfiguration();
  });
  elements.renderModeSelect.addEventListener("change", () => {
    renderDesignConfig();
    renderRunSummary();
    saveConfiguration();
  });
  elements.roomTypeSelect.addEventListener("change", () => {
    elements.roomTypeDetailField.classList.toggle("hidden", elements.roomTypeSelect.value !== "其他");
    saveConfiguration();
  });
  elements.ratioSelect.addEventListener("change", () => {
    renderOutputControls();
    saveConfiguration();
  });
  for (const input of [
    elements.commonPromptInput,
    elements.negativePromptInput,
    elements.roomTypeDetailInput,
  ]) input.addEventListener("input", saveConfiguration);
  for (const select of [
    elements.effectTimeSelect,
    elements.effectWeatherSelect,
    elements.promptAgentModelSelect,
    elements.promptAgentVersionSelect,
    elements.qualitySelect,
    elements.refinedPromptSelect,
    elements.resolutionSelect,
    elements.styleSelect,
  ]) select.addEventListener("change", () => {
    if (select === elements.styleSelect) renderDesignConfig();
    renderRunSummary(); saveConfiguration();
  });
  elements.betaForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (state.job?.status === "running") return;
    renderJob({
      completed: 0,
      message: "正在创建任务…",
      stages: { generated: 0, synced: 0 },
      status: "running",
      total: runCount(),
    });
    try {
      await startBatch();
    } catch (error) {
      reportUploadError(error);
    }
  });
}

async function load() {
  bindEvents();
  try {
    const [catalog, session, betaConfig] = await Promise.all([
      api("/api/catalog"),
      api("/api/session"),
      api("/api/beta/config"),
    ]);
    state.catalog = catalog;
    state.connected = session.connected === true;
    state.betaConfig = betaConfig;
    elements.monitorBaseLink.href = betaConfig.baseUrl;
    fillSelect(elements.roomTypeSelect, [
      { label: "请选择", value: "" },
      ...catalog.emptyRoomTypes.map((value) => ({ label: value, value })),
    ]);
    renderPromptAgentModels();
    showStatus(state.connected ? "检测模型中" : "请先连接 API", {
      error: !state.connected,
    });
    renderModels();
    renderFeature();
    configuration.restore();
    configuration.markReady();
    await sampleLibrary.load(
      state.featureMode,
      state.sampleSetIds[state.featureMode],
    );
    saveConfiguration();

    const stylesRequest = api("/api/styles");
    const [stylesResult, accessResult] = await Promise.allSettled([
      stylesRequest,
      state.connected
        ? api("/api/check-models", { method: "POST" })
        : Promise.resolve(null),
    ]);
    if (stylesResult.status === "fulfilled") {
      state.stylesConfig = stylesResult.value;
      renderFeature();
    } else {
      elements.configStatus.textContent = "配置读取失败";
    }
    if (accessResult.status === "fulfilled" && accessResult.value) {
      const access = accessResult.value;
      state.modelAccess = new Map(access.models.map((model) => [model.key, model]));
      state.modelAccessChecked = true;
      state.agentAccess = new Map(access.agentModels.map((model) => [model.key, model]));
      state.agentAccessChecked = true;
      showStatus("服务已连接", { ready: true });
      renderModels();
      renderPromptAgentModels();
    } else if (state.connected) {
      showStatus("模型检测失败，可稍后刷新", { error: true });
    }
    configuration.restore();
    saveConfiguration();
    await restoreJob();
  } catch (error) {
    showStatus(error.message, { error: true });
    elements.configStatus.textContent = "配置读取失败";
    renderRunSummary();
  }
}

load();

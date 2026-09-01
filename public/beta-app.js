/**
 * [INPUT]: 依赖 beta.html DOM、带飞书同步回执的 beta-sample-library、custom-select/beta-upload/workbench-utils/image-ratio/generation-batch 共享合同，以及 /api/catalog、/api/styles、/api/session、/api/beta 配置与任务接口
 * [OUTPUT]: 对外提供五功能配置、飞书样本集驱动及同步状态呈现的不设结果数量上限批量展开、全宽 START、任务恢复，以及生成/飞书同步双阶段监控
 * [POS]: public 的 Beta跑图配置与任务监控编排器，把可复用样本资产交给 beta-sample-library，结果统一在飞书查看，不在页面维护第二份画廊
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import "./custom-select.js?v=7";
import { bindImageDrop, renderImagePreviews } from "./beta-upload.js";
import { createBetaSampleLibrary } from "./beta-sample-library.js?v=3";
import { adaptGenerationInputForModel } from "./generation-batch.js";
import { readImageDimensions } from "./image-ratio.js";
import { api, readFileAsInput } from "./workbench-utils.js";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_BATCH_IMAGE_BYTES = 20 * 1024 * 1024;
const JOB_STORAGE_KEY = "canvas-lab:beta-run-job";
const FEATURE_COPY = Object.freeze({
  effectEnhancement: { prompt: "", source: "待美化效果图" },
  emptyRoom: { prompt: "补充要求（可选）", source: "空房图" },
  free: { prompt: "提示词", source: "" },
  refinedModel: { prompt: "自定义要求（可选）", source: "带材质精模图" },
  whiteModel: { prompt: "补充要求（可选）", source: "白模图" },
});

const elements = Object.fromEntries([
  "betaBaseLink", "betaConnectionStatus", "betaFeatureOptions", "betaForm",
  "betaGenerationActions",
  "commonPromptField", "commonPromptInput", "commonPromptLabel",
  "configStatus", "designFields", "effectFields", "effectTimeSelect",
  "effectWeatherSelect", "emptyRoomFields", "freePromptList", "freePromptsField",
  "freePromptsInput", "freeReferenceDropZone", "freeReferenceField",
  "freeReferenceInput", "freeReferenceList", "generationProgressBar",
  "generationProgressCount", "generationProgressTrack", "jobProgress",
  "jobProgressBar", "jobProgressCount", "jobProgressLabel", "jobProgressTrack",
  "jobStatus", "modelOptions", "monitorBaseLink", "monitorBatchSummary",
  "negativePromptField", "negativePromptInput", "promptAgentModelSelect",
  "promptAgentVersionField", "promptAgentVersionSelect", "qualityField",
  "qualitySelect", "ratioSelect", "refinedPromptField", "refinedPromptSelect",
  "renderModeSelect", "resolutionSelect", "roomTypeDetailField",
  "roomTypeDetailInput", "roomTypeSelect", "runButton", "runButtonLabel", "runHint",
  "runSummary", "sampleCount", "sampleList", "sampleSetCreatePanel",
  "sampleSetLibraryPanel", "sampleSetNameInput", "sampleSetSelect",
  "sampleSetSyncStatus",
  "saveSampleSetButton", "cancelSampleSetButton", "newSampleSetButton",
  "sourceFilesDropLabel",
  "sourceFilesDropZone", "sourceFilesField", "sourceFilesInput", "sourceFilesTitle",
  "styleField", "styleReferenceDropZone", "styleReferenceField",
  "styleReferenceInput", "styleReferenceList", "styleSelect",
].map((id) => [id, document.querySelector(`#${id}`)]));

const state = {
  betaConfig: null,
  catalog: { agentModels: [], emptyRoomTypes: [], models: [] },
  connected: false,
  featureMode: "whiteModel",
  freeReference: null,
  job: null,
  modelAccess: new Map(),
  modelAccessChecked: false,
  selectedModelKeys: [],
  styleReference: null,
  stylesConfig: null,
};

const sampleLibrary = createBetaSampleLibrary({
  api,
  assertBatchImageSize,
  elements,
  onChange: renderRunSummary,
  onError: reportUploadError,
  readImage,
});

function fillSelect(select, options, current = "") {
  select.replaceChildren(...options.map(({ label, value }) => {
    const option = document.createElement("option");
    option.value = String(value);
    option.textContent = label;
    option.selected = String(value) === String(current);
    return option;
  }));
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

async function readImage(file) {
  if (!file || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    throw new Error(`${file?.name || "文件"} 不是 PNG、JPEG 或 WebP`);
  }
  if (file.size > MAX_IMAGE_BYTES) throw new Error(`${file.name} 超过 8MB`);
  const input = await readFileAsInput(file);
  return {
    ...input,
    ...await readImageDimensions(input.dataUrl, file.name),
    lastModified: file.lastModified,
  };
}

function assertBatchImageSize(images) {
  const total = images.filter(Boolean).reduce((sum, image) => sum + image.size, 0);
  if (total > MAX_BATCH_IMAGE_BYTES) throw new Error("本批图片合计不能超过 20MB");
}

function assertCurrentAssetSize() {
  sampleLibrary.assertAssetSize([
    state.styleReference,
    state.freeReference,
  ]);
}

function renderSingleReference(key, list, dropZone) {
  const images = state[key] ? [state[key]] : [];
  renderImagePreviews(list, images, {
    onRemove: () => {
      state[key] = null;
      renderSingleReference(key, list, dropZone);
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
  const total = runCount();
  const samples = sampleCount();
  const models = selectedModels().length;
  elements.runSummary.textContent = samples && models
    ? `${samples} 个样本 × ${models} 个模型 = ${total} 张结果`
    : samples ? "请选择出图模型" : "请选择样本集";
  elements.runHint.textContent = "结果自动同步飞书";
  const monitoredTotal = Number(state.job?.total) || total;
  elements.monitorBatchSummary.textContent = state.job
    ? `${monitoredTotal} 张结果`
    : total ? `预计 ${total} 张结果` : "尚未开始";
  if (!state.job) {
    renderProgress(elements.generationProgressTrack, elements.generationProgressBar, elements.generationProgressCount, 0, total);
    renderProgress(elements.jobProgressTrack, elements.jobProgressBar, elements.jobProgressCount, 0, total);
  }
  const running = state.job?.status === "running";
  elements.runButton.disabled = !state.connected
    || !sampleLibrary.isReady()
    || total < 1
    || running;
  elements.runButtonLabel.textContent = running ? "RUNNING…" : "START";
  elements.runButton.setAttribute("aria-busy", String(running));
  elements.runButton.setAttribute("aria-label", running ? "批量运行中" : "开始批量运行");
  elements.betaGenerationActions.classList.toggle("is-busy", running);
}

function modelAvailable(model) {
  if (!state.modelAccessChecked) return true;
  const access = state.modelAccess.get(model.key);
  return access ? access.available : model.provider === "comfyui";
}

function renderModels() {
  const runnable = state.catalog.models.filter((model) => modelAvailable(model));
  state.selectedModelKeys = state.selectedModelKeys.filter((key) =>
    runnable.some((model) => model.key === key));
  if (!state.selectedModelKeys.length && runnable[0]) state.selectedModelKeys = [runnable[0].key];
  elements.modelOptions.replaceChildren(...runnable.map((model) => {
    const button = document.createElement("button");
    const label = document.createElement("span");
    const check = document.createElement("i");
    const selected = state.selectedModelKeys.includes(model.key);
    button.type = "button";
    button.className = "model-option-toggle";
    button.classList.toggle("selected", selected);
    button.dataset.modelKey = model.key;
    button.setAttribute("role", "checkbox");
    button.setAttribute("aria-checked", String(selected));
    label.textContent = model.label;
    check.setAttribute("aria-hidden", "true");
    check.textContent = selected ? "✓" : "+";
    button.append(label, check);
    return button;
  }));
  renderOutputControls();
}

function intersection(values) {
  if (!values.length) return [];
  return values[0].filter((value) => values.every((entries) => entries.includes(value)));
}

function renderOutputControls() {
  const models = selectedModels();
  const automatic = state.featureMode !== "free";
  const commonRatios = intersection(models.map((model) => Object.keys(model.sizes)));
  const currentRatio = elements.ratioSelect.value;
  const ratioOptions = [
    ...(automatic ? [{ label: "跟随原图 · 智能适配", value: "auto" }] : []),
    ...commonRatios.map((ratio) => ({ label: ratio === "source" ? "跟随原图" : ratio, value: ratio })),
  ];
  fillSelect(
    elements.ratioSelect,
    ratioOptions,
    ratioOptions.some((item) => item.value === currentRatio)
      ? currentRatio
      : automatic ? "auto" : models[0]?.defaultRatio,
  );
  const effectiveRatio = elements.ratioSelect.value === "auto"
    ? models[0]?.defaultRatio
    : elements.ratioSelect.value;
  const resolutionSets = models.map((model) =>
    Object.keys(model.sizes[effectiveRatio] || model.sizes[model.defaultRatio] || model.sizes.source || {}));
  const commonResolutions = intersection(resolutionSets);
  const resolutionOptions = (commonResolutions.length
    ? commonResolutions
    : [...new Set(resolutionSets.flat())]).map((value) => ({ label: value, value }));
  fillSelect(
    elements.resolutionSelect,
    resolutionOptions,
    resolutionOptions.some((item) => item.value === elements.resolutionSelect.value)
      ? elements.resolutionSelect.value
      : models[0]?.defaultResolution,
  );
  const hasQuality = models.some((model) => model.qualityOptions.length > 0);
  elements.qualityField.classList.toggle("hidden", !hasQuality);
  fillSelect(elements.qualitySelect, ["auto", "low", "medium", "high"].map((value) => ({
    label: value === "auto" ? "自动" : value,
    value,
  })), elements.qualitySelect.value || "auto");
  elements.negativePromptField.classList.toggle(
    "hidden",
    !models.some((model) => model.provider === "comfyui"),
  );
  renderRunSummary();
}

function renderDesignConfig() {
  const config = state.stylesConfig || {};
  const emptyRoom = state.featureMode === "emptyRoom";
  const renderMode = elements.renderModeSelect.value;
  const smartConfig = emptyRoom ? config.emptyRoom?.smartDefault : config.smartDefault;
  const promptConfig = emptyRoom ? config.emptyRoom?.promptAgent : config.promptAgent;
  const styles = (config.styles || []).filter((style) => style.published && style.validDna);
  fillSelect(elements.styleSelect, styles.map((style) => ({
    label: `${style.name} · v${style.version}`,
    value: style.code,
  })), elements.styleSelect.value || styles[0]?.code);
  fillSelect(elements.promptAgentVersionSelect, (promptConfig?.versions || []).map((entry) => ({
    label: `${entry.name} · v${entry.version}`,
    value: entry.version,
  })), elements.promptAgentVersionSelect.value || promptConfig?.defaultVersion);
  const styleMode = renderMode === "style-dna";
  elements.styleField.classList.toggle("hidden", !styleMode);
  elements.promptAgentVersionField.classList.toggle("hidden", !styleMode);
  elements.styleReferenceField.classList.toggle("hidden", styleMode);
  elements.configStatus.textContent = styleMode
    ? styles.length && promptConfig?.versions?.length ? "平台风格已就绪" : "平台风格配置不可用"
    : smartConfig?.available ? `智能默认 v${smartConfig.version}` : "智能默认配置不可用";
}

function renderFeature() {
  const copy = FEATURE_COPY[state.featureMode];
  for (const button of elements.betaFeatureOptions.querySelectorAll("[data-feature-mode]")) {
    const selected = button.dataset.featureMode === state.featureMode;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-checked", String(selected));
  }
  const free = state.featureMode === "free";
  const design = ["whiteModel", "emptyRoom"].includes(state.featureMode);
  const emptyRoom = state.featureMode === "emptyRoom";
  const effect = state.featureMode === "effectEnhancement";
  const refined = state.featureMode === "refinedModel";
  elements.commonPromptField.classList.toggle("hidden", free || effect);
  elements.designFields.classList.toggle("hidden", !design);
  elements.styleReferenceField.classList.toggle("hidden", !design);
  elements.emptyRoomFields.classList.toggle("hidden", !emptyRoom);
  elements.effectFields.classList.toggle("hidden", !effect);
  elements.refinedPromptField.classList.toggle("hidden", !refined);
  elements.freeReferenceField.classList.toggle("hidden", !free);
  elements.sourceFilesTitle.textContent = copy.source;
  elements.sourceFilesDropLabel.textContent = `添加或拖入${copy.source}`;
  elements.sourceFilesInput.setAttribute("aria-label", `添加${copy.source}`);
  elements.commonPromptLabel.textContent = copy.prompt;
  elements.configStatus.textContent = design ? "读取设计配置" : effect ? "使用当前上架 Prompt" : refined ? "读取精模 Prompt" : "工作台同源";
  if (design) renderDesignConfig();
  if (effect) {
    const effectConfig = state.stylesConfig?.effectEnhancementPrompt;
    elements.configStatus.textContent = effectConfig?.available
      ? `Prompt v${effectConfig.version}` : "效果图美化 Prompt 不可用";
  }
  if (refined) {
    const promptConfig = state.stylesConfig?.refinedPrompt;
    fillSelect(elements.refinedPromptSelect, (promptConfig?.versions || []).map((entry) => ({
      label: `${entry.name} · v${entry.version}${entry.published ? "" : " · 测试中"}`,
      value: entry.version,
    })), promptConfig?.defaultVersion);
    elements.configStatus.textContent = promptConfig?.versions?.length ? "精模 Prompt 已就绪" : "精模 Prompt 不可用";
  }
  renderReferenceInputs();
  renderRunSummary();
  renderOutputControls();
}

function currentCases() {
  return sampleLibrary.currentCases({
    commonPrompt: elements.commonPromptInput.value.trim(),
    freeReference: state.freeReference,
  });
}

function designSettings() {
  const emptyRoom = state.featureMode === "emptyRoom";
  const smartDefault = elements.renderModeSelect.value === "smart-default";
  const config = state.stylesConfig || {};
  const smartConfig = emptyRoom ? config.emptyRoom?.smartDefault : config.smartDefault;
  const promptConfig = emptyRoom ? config.emptyRoom?.promptAgent : config.promptAgent;
  if (smartDefault && !smartConfig?.available) throw new Error("当前智能默认 Agent 不可用");
  if (!smartDefault && (!elements.styleSelect.value || !elements.promptAgentVersionSelect.value)) {
    throw new Error("平台风格或融合 Agent 版本不可用");
  }
  return {
    renderMode: elements.renderModeSelect.value,
    promptAgentModelKey: elements.promptAgentModelSelect.value,
    styleCode: smartDefault ? undefined : elements.styleSelect.value,
    styleReferenceImages: smartDefault && state.styleReference ? [state.styleReference] : [],
    ...(emptyRoom
      ? smartDefault
        ? { emptyRoomSmartDefaultVersion: smartConfig.version }
        : { emptyRoomPromptAgentVersion: Number(elements.promptAgentVersionSelect.value || promptConfig?.defaultVersion) }
      : smartDefault
        ? { smartDefaultAgentVersion: smartConfig.version }
        : { promptAgentVersion: Number(elements.promptAgentVersionSelect.value || promptConfig?.defaultVersion) }),
  };
}

function assertFeatureConfig() {
  if (state.featureMode === "emptyRoom") {
    if (!elements.roomTypeSelect.value) throw new Error("请选择空房房间类型");
    if (elements.roomTypeSelect.value === "其他" && !elements.roomTypeDetailInput.value.trim()) {
      throw new Error("请填写具体空间类型");
    }
  }
  if (state.featureMode === "refinedModel" && !elements.refinedPromptSelect.value) {
    throw new Error("精模 Prompt 版本不可用");
  }
  if (state.featureMode === "effectEnhancement"
    && !state.stylesConfig?.effectEnhancementPrompt?.available) {
    throw new Error("效果图美化 Prompt 不可用");
  }
}

function buildItems(batchId) {
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
  assertCurrentAssetSize();
  const ratioAuto = elements.ratioSelect.value === "auto";
  return cases.flatMap((currentCase, caseIndex) => models.map((model) => {
    const input = {
      modelKey: model.key,
      negativePrompt: elements.negativePromptInput.value.trim(),
      outputFormat: "png",
      prompt: currentCase.prompt,
      quality: elements.qualitySelect.value,
      ratio: ratioAuto ? model.defaultRatio : elements.ratioSelect.value,
      ratioMode: ratioAuto ? "auto" : "manual",
      referenceImages: currentCase.referenceImages,
      resolution: elements.resolutionSelect.value || model.defaultResolution,
      ...(state.featureMode === "effectEnhancement" ? {
        effectTime: elements.effectTimeSelect.value,
        effectWeather: elements.effectWeatherSelect.value,
      } : {}),
      ...(state.featureMode === "refinedModel" ? {
        promptVersion: Number(elements.refinedPromptSelect.value),
      } : {}),
      ...(["whiteModel", "emptyRoom"].includes(state.featureMode) ? designSettings() : {}),
      ...(state.featureMode === "emptyRoom" ? {
        roomType: elements.roomTypeSelect.value,
        ...(elements.roomTypeSelect.value === "其他"
          ? { roomTypeDetail: elements.roomTypeDetailInput.value.trim() }
          : {}),
      } : {}),
    };
    const adapted = adaptGenerationInputForModel(input, model, {
      featureMode: state.featureMode,
      sourceImage: currentCase.referenceImages[0] || null,
    });
    return {
      attempt: 1,
      caseId: currentCase.caseId,
      input: adapted,
      label: `${currentCase.label} · ${model.label}`,
      modelLabel: model.label,
      runId: `RUN-${batchId.slice(5, 17)}-${caseIndex + 1}-${model.key}`,
    };
  }));
}

function packBatchAssets(items) {
  const assets = {};
  const packedItems = items.map((item) => {
    const input = { ...item.input };
    const referenceAssetKey = input.referenceImages?.length
      ? state.featureMode === "free" ? "shared-source" : `source-${item.caseId}`
      : null;
    const styleReferenceAssetKey = input.styleReferenceImages?.length
      ? "shared-style"
      : null;
    if (referenceAssetKey && !assets[referenceAssetKey]) {
      assets[referenceAssetKey] = input.referenceImages;
    }
    if (styleReferenceAssetKey && !assets[styleReferenceAssetKey]) {
      assets[styleReferenceAssetKey] = input.styleReferenceImages;
    }
    delete input.referenceImages;
    delete input.styleReferenceImages;
    return {
      ...item,
      input,
      ...(referenceAssetKey ? { referenceAssetKey } : {}),
      ...(styleReferenceAssetKey ? { styleReferenceAssetKey } : {}),
    };
  });
  return { assets, items: packedItems };
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
  const batchId = `BETA-${crypto.randomUUID().replaceAll("-", "")}`;
  const jobId = `beta-${crypto.randomUUID()}`;
  const packed = packBatchAssets(buildItems(batchId));
  const { job } = await api("/api/beta/jobs", {
    body: JSON.stringify({
      ...packed,
      batchId,
      featureMode: state.featureMode,
      jobId,
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
    assertBatchImageSize([
      ...sampleLibrary.sourceImages(),
      key === "styleReference" ? next : state.styleReference,
      key === "freeReference" ? next : state.freeReference,
    ].filter(Boolean));
    state[key] = next;
    renderReferenceInputs();
  } catch (error) {
    reportUploadError(error);
  }
}

function bindEvents() {
  sampleLibrary.bind();
  elements.betaFeatureOptions.addEventListener("click", (event) => {
    const button = event.target.closest("[data-feature-mode]");
    if (!button) return;
    state.featureMode = button.dataset.featureMode;
    renderFeature();
    sampleLibrary.setFeatureMode(state.featureMode).catch(reportUploadError);
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
    if (!button) return;
    const key = button.dataset.modelKey;
    if (state.selectedModelKeys.includes(key)) {
      if (state.selectedModelKeys.length > 1) {
        state.selectedModelKeys = state.selectedModelKeys.filter((entry) => entry !== key);
      }
    } else if (state.selectedModelKeys.length < 4) {
      state.selectedModelKeys.push(key);
    }
    renderModels();
  });
  elements.renderModeSelect.addEventListener("change", renderDesignConfig);
  elements.roomTypeSelect.addEventListener("change", () => {
    elements.roomTypeDetailField.classList.toggle("hidden", elements.roomTypeSelect.value !== "其他");
  });
  elements.ratioSelect.addEventListener("change", renderOutputControls);
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
    elements.betaBaseLink.href = betaConfig.baseUrl;
    elements.monitorBaseLink.href = betaConfig.baseUrl;
    fillSelect(elements.roomTypeSelect, [
      { label: "请选择", value: "" },
      ...catalog.emptyRoomTypes.map((value) => ({ label: value, value })),
    ]);
    const promptModels = catalog.agentModels.filter((model) => model.imageInput);
    fillSelect(elements.promptAgentModelSelect, promptModels.map((model) => ({
      label: model.label,
      value: model.key,
    })), promptModels.some((model) => model.key === "gemini3pro") ? "gemini3pro" : promptModels[0]?.key);
    showStatus(state.connected ? "检测模型中" : "请先连接 API", {
      error: !state.connected,
    });
    renderModels();
    renderFeature();
    await sampleLibrary.load(state.featureMode);

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
      showStatus("服务已连接", { ready: true });
      renderModels();
    } else if (state.connected) {
      showStatus("模型检测失败，可稍后刷新", { error: true });
    }
    await restoreJob();
  } catch (error) {
    showStatus(error.message, { error: true });
    elements.configStatus.textContent = "配置读取失败";
    renderRunSummary();
  }
}

load();

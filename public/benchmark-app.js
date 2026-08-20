/**
 * [INPUT]: 依赖 benchmark.html DOM、benchmark-sample-ui.js 的分类来源与标签合并规则、workbench-utils.js 的通用浏览器基础设施、浏览器 location 与同源 /api/benchmark 接口
 * [OUTPUT]: 对外提供左右样本工作区空态、可连续累加且缩略图稳定的样本待保存清单、已有空间分类保护/未分类 AI 识别、逐图五维 AI 打标、八类单变量实验计划生成、停止与继续出图、失败 Run 重试、评分断点继续、持久化横评跳转、评分分析、任务轮询及飞书视图分流
 * [POS]: public 的 Benchmark 页面状态控制器，以样本集为操作主对象，拦截 file 协议误用且所有破坏性外部调用都要求用户二次确认
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createExperimentDraftController, createExperimentId } from "./benchmark-experiment.js?v=9";
import {
  createJobRenderer,
  generationResumeInput,
  generationRetryInput,
  persistedGenerationJob,
} from "./benchmark-job-ui.js?v=4";
import { createReviewController, jobPanelFor } from "./benchmark-review-ui.js?v=3";
import {
  AI_DIMENSION_FIELDS, SAMPLE_CATEGORIES, SAMPLE_COMPLEXITY_LEVELS, SAMPLE_EDGE_TYPES, SAMPLE_IMAGE_MAX_BYTES,
  SAMPLE_IMAGE_TYPES, SAMPLE_TYPES, applyAiSampleLabel, createSampleDraft, sampleDraftStatusCopy,
  sampleLabelScopeCopy, uniqueSampleFiles,
} from "./benchmark-sample-ui.js?v=2";
import { api, escapeHtml, formatRate, readFileAsInput } from "./workbench-utils.js";

const state = {
  activeJobId: window.sessionStorage.getItem("benchmark.activeJobId") || "",
  apiConnected: false,
  sampleCategoryMode: window.sessionStorage.getItem("benchmark.sampleCategoryMode") || "fixed",
  datasetEditorMode: null,
  labelModels: [],
  labelingError: null,
  overview: null,
  plan: null,
  pollTimer: null,
  runExperimentId: window.sessionStorage.getItem("benchmark.runExperimentId") || "",
  sampleDrafts: [],
  sampleFiles: [],
  sampleLabeling: false,
  sampleLabelingToken: 0,
  selectedLabelModelKey: window.sessionStorage.getItem("benchmark.labelModelKey") || "gemini35flash",
  selectedAnalysisExperimentId: window.sessionStorage.getItem("benchmark.analysisExperimentId") || "",
  selectedDatasetId: window.sessionStorage.getItem("benchmark.datasetId") || "",
};
const byId = (id) => document.getElementById(id);
const renderJob = createJobRenderer({ byId, jobPanelFor });

function toast(message) {
  const element = byId("toast");
  element.textContent = message;
  element.classList.remove("hidden");
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => element.classList.add("hidden"), 3200);
}

function switchPanel(name) {
  document.querySelectorAll(".step").forEach((element) => {
    const active = element.dataset.step === name;
    element.classList.toggle("active", active);
    element.toggleAttribute("aria-current", active);
  });
  document.querySelectorAll(".panel").forEach((element) => element.classList.toggle("active", element.dataset.panel === name));
}

function selectedDataset() {
  return (state.overview?.datasets || []).find((dataset) => dataset.datasetId === state.selectedDatasetId) || null;
}

function currentRunExperimentId() {
  return state.plan?.groups?.[0]?.groupId || state.runExperimentId;
}
function selectedDatasetCases() {
  return (state.overview?.cases || []).filter((entry) => entry.datasetId === state.selectedDatasetId);
}

function resetPlan() {
  state.plan = null;
  for (const id of ["planCases", "planPrompts", "planRuns", "planSkipped"]) byId(id).textContent = "—";
  byId("driftNotice").textContent = "先在实验配置中生成实验计划。";
  byId("driftNotice").classList.add("neutral");
  byId("runButton").disabled = true;
  byId("runBadge").textContent = "等待计划";
  byId("runBadge").classList.remove("ready");
  syncExperimentBaseButtons();
}

const experimentController = createExperimentDraftController({
  byId,
  escapeHtml,
  onChange: resetPlan,
});

const reviewController = createReviewController({
  byId,
  escapeHtml,
  selectedCaseIds: () => selectedDatasetCases().map((entry) => entry.caseId),
  storage: window.sessionStorage,
});

function experimentInput() {
  const experimentId = byId("experimentIdInput").value.trim();
  return {
    caseIds: selectedDatasetCases().map((entry) => entry.caseId),
    draftConfig: experimentController.input(),
    experimentId,
    groupId: experimentId,
    maxCases: byId("maxCasesInput").value ? Number(byId("maxCasesInput").value) : null,
  };
}

function renderCases() {
  const dataset = selectedDataset();
  const cases = selectedDatasetCases();
  byId("caseCount").textContent = cases.length;
  byId("validCaseCount").textContent = `${cases.filter((entry) => entry.sampleType === "有效白模").length} 个进入评测`;
  byId("caseTableTitle").textContent = dataset?.name || "样本";
  byId("caseRows").innerHTML = cases.length ? cases.map((entry) => `
    <tr><td>${escapeHtml(entry.caseId)}</td><td>${escapeHtml(entry.category)}</td><td class="dimension-cell">结构${escapeHtml(entry.spatialComplexity)} · 镜头${escapeHtml(entry.lensComplexity)} · 软装${escapeHtml(entry.stylingComplexity)} · 材质${escapeHtml(entry.materialComplexity)} · 输入${escapeHtml(entry.inputQuality)}</td><td><span class="tag">${escapeHtml(entry.sampleType)}</span></td><td>${escapeHtml(entry.status)}</td></tr>
  `).join("") : '<tr><td colspan="5">暂无样本</td></tr>';
}

function renderDatasets(datasets = []) {
  const previousDatasetId = state.selectedDatasetId;
  if (!datasets.some((dataset) => dataset.datasetId === state.selectedDatasetId)) {
    state.selectedDatasetId = datasets[0]?.datasetId || "";
  }
  window.sessionStorage.setItem("benchmark.datasetId", state.selectedDatasetId);
  byId("datasetSelect").innerHTML = datasets.length
    ? datasets.map((dataset) => `<option value="${escapeHtml(dataset.datasetId)}">${escapeHtml(dataset.name)} · ${dataset.caseCount}</option>`).join("")
    : '<option value="">暂无样本集</option>';
  byId("datasetSelect").value = state.selectedDatasetId;
  const hasDataset = Boolean(selectedDataset());
  byId("datasetSelect").disabled = !hasDataset;
  byId("renameDatasetButton").disabled = !hasDataset;
  byId("archiveDatasetButton").disabled = !hasDataset;
  byId("datasetEmpty").classList.toggle("hidden", hasDataset);
  byId("caseForm").classList.toggle("hidden", !hasDataset);
  byId("caseTableCard").classList.toggle("hidden", !hasDataset);
  document.querySelectorAll("#caseForm input, #caseForm select, #caseForm button")
    .forEach((element) => { element.disabled = !hasDataset; });
  syncSampleSaveButton();
  renderCases();
  renderAnalysisScope();
  if (previousDatasetId !== state.selectedDatasetId) resetPlan();
}

function closeDatasetEditor() {
  state.datasetEditorMode = null;
  byId("datasetEditor").classList.add("hidden");
  byId("datasetNameInput").value = "";
}

function openDatasetEditor(mode) {
  const dataset = selectedDataset();
  if (mode === "rename" && !dataset) return;
  state.datasetEditorMode = mode;
  byId("datasetEditorLabel").textContent = mode === "create" ? "新建样本集" : "重命名样本集";
  byId("datasetNameInput").value = mode === "rename" ? dataset.name : "";
  byId("datasetEditor").classList.remove("hidden");
  byId("datasetNameInput").focus();
  byId("datasetNameInput").select();
}

function renderPlan(plan) {
  state.plan = plan;
  const summary = plan.summary;
  byId("planCases").textContent = summary.cases;
  byId("planPrompts").textContent = summary.promptBatches;
  byId("planRuns").textContent = summary.imageRuns;
  byId("planSkipped").textContent = summary.skippedImages;
  byId("driftNotice").textContent = plan.drift.message;
  byId("driftNotice").classList.toggle("neutral", !plan.drift.blocked);
  byId("runButton").disabled = plan.drift.blocked || summary.imageRuns === 0;
  byId("runBadge").textContent = plan.drift.blocked ? "协议漂移" : "计划已生成";
  byId("runBadge").classList.toggle("ready", !plan.drift.blocked);
  syncExperimentBaseButtons();
}

function renderAnalysis(analysis = { groups: [], summary: {} }) {
  const summary = analysis.summary || {};
  byId("totalResults").textContent = summary.total || 0;
  byId("generatedResults").textContent = summary.generated || 0;
  byId("reviewedResults").textContent = summary.reviewed || 0;
  byId("usableResults").textContent = summary.usable || 0;
  byId("p95Results").textContent = Number.isFinite(summary.p95Seconds) ? `${summary.p95Seconds.toFixed(1)}s` : "—";
  byId("analysisRows").innerHTML = analysis.groups?.length ? analysis.groups.map((group) => `
    <tr><td>${escapeHtml(group.model)}</td><td>${escapeHtml(group.category)}</td><td>${formatRate(group.successRate)}</td><td>${formatRate(group.usableRate)}</td><td>${Number.isFinite(group.meanScore) ? group.meanScore.toFixed(2) : "—"}</td><td>${Number.isFinite(group.p95Seconds) ? `${group.p95Seconds.toFixed(1)}s` : "—"}</td><td>${group.total}</td></tr>
  `).join("") : '<tr><td colspan="7">暂无可分析结果</td></tr>';
}

function renderAnalysisScope() {
  const datasetAnalysis = state.overview?.datasetAnalyses?.[state.selectedDatasetId];
  const experimentAnalyses = state.overview?.datasetExperimentAnalyses?.[state.selectedDatasetId] || {};
  const experimentIds = Object.keys(experimentAnalyses).sort((left, right) => right.localeCompare(left));
  if (state.selectedAnalysisExperimentId && !experimentAnalyses[state.selectedAnalysisExperimentId]) {
    state.selectedAnalysisExperimentId = "";
  }
  const select = byId("analysisExperimentSelect");
  select.innerHTML = [
    `<option value="">全部实验 · ${datasetAnalysis?.summary?.total || 0} 条结果</option>`,
    ...experimentIds.map((experimentId) => `<option value="${escapeHtml(experimentId)}">${escapeHtml(experimentId)} · ${experimentAnalyses[experimentId]?.summary?.total || 0} 条结果</option>`),
  ].join("");
  select.value = state.selectedAnalysisExperimentId;
  select.disabled = experimentIds.length === 0;
  window.sessionStorage.setItem("benchmark.analysisExperimentId", state.selectedAnalysisExperimentId);
  byId("analysisScopeMeta").textContent = state.selectedAnalysisExperimentId
    ? `实验 ${state.selectedAnalysisExperimentId}`
    : "全部实验";
  renderAnalysis(state.selectedAnalysisExperimentId
    ? experimentAnalyses[state.selectedAnalysisExperimentId]
    : datasetAnalysis);
  syncExperimentBaseButtons();
}

function syncExperimentBaseButtons() {
  const experimentAnalyses = state.overview?.datasetExperimentAnalyses?.[state.selectedDatasetId] || {};
  const analysisButton = byId("openExperimentBaseButton");
  analysisButton.disabled = Object.keys(experimentAnalyses).length === 0;
  analysisButton.textContent = state.selectedAnalysisExperimentId ? "结果报告 ↗" : "全部报告 ↗";
  const reviewButton = byId("reviewOpenBaseButton");
  reviewButton.disabled = !byId("reviewExperimentSelect").value;
  reviewButton.textContent = "结果明细 ↗";
  const runButton = byId("runOpenBaseButton");
  runButton.disabled = !currentRunExperimentId();
  runButton.textContent = "横评对比 ↗";
}

async function openExperimentInBase(experimentId, button, { allowAll = false, target = "results" } = {}) {
  if (!experimentId && !allowAll) throw new Error("请先选择一个实验 ID");
  const popup = window.open("", "_blank");
  if (popup) {
    popup.opener = null;
    popup.document.title = "正在打开飞书";
    popup.document.body.textContent = "正在准备已筛选的飞书视图…";
  }
  button.disabled = true;
  button.textContent = "准备中…";
  try {
    const body = await api("/api/benchmark/experiments/open-base", {
      body: JSON.stringify({ experimentId, target }),
      method: "POST",
    });
    const targetUrl = new URL(body.target?.url || "");
    if (targetUrl.protocol !== "https:" || !targetUrl.hostname.endsWith(".feishu.cn")) {
      throw new Error("服务端返回的飞书链接无效");
    }
    if (popup) popup.location.replace(targetUrl.toString());
    else window.open(targetUrl.toString(), "_blank", "noopener");
  } catch (error) {
    popup?.close();
    throw error;
  } finally {
    syncExperimentBaseButtons();
  }
}

function renderLabelModels(models = state.labelModels) {
  state.labelModels = models;
  const select = byId("labelModelSelect");
  const selectable = models.filter((model) => model.selectable !== false);
  const selected = selectable.find((model) => model.key === state.selectedLabelModelKey)
    || selectable.find((model) => model.key === "gemini35flash")
    || selectable[0]
    || null;
  const placeholder = state.apiConnected ? "当前 API 无可用视觉模型" : "连接 API 后选择模型";
  select.innerHTML = models.length
    ? `${selected ? "" : `<option value="" selected>${placeholder}</option>`}${models.map((model) => `<option value="${escapeHtml(model.key)}"${model.selectable === false ? " disabled" : ""}>${escapeHtml(model.label)} · ${escapeHtml(model.reason || model.note || "支持图片输入")}</option>`).join("")}`
    : '<option value="">暂无可用视觉模型</option>';
  select.value = selected?.key || "";
  select.disabled = !selected || !selectedDataset();
  if (selected) {
    state.selectedLabelModelKey = selected.key;
    window.sessionStorage.setItem("benchmark.labelModelKey", selected.key);
  }
}

async function loadOverview() {
  const body = await api("/api/benchmark/overview");
  state.overview = body;
  state.apiConnected = Boolean(body.api?.connected);
  state.labelingError = body.labelingError || null;
  byId("connectionStatus").textContent = body.configured ? "Benchmark 已连接" : "待配置";
  byId("connectionStatus").classList.toggle("ready", body.configured);
  byId("setupNotice").classList.toggle("hidden", body.configured);
  byId("setupNotice").textContent = body.configured ? "" : `${body.error}。请在当前 worktree 的 .env.local 配置 Benchmark 表 ID。`;
  reviewController.load({
    connected: state.apiConnected,
    reviewResults: body.reviewResults || [],
    reviewableExperiments: body.reviewableExperiments || [],
    reviewModels: body.reviewModels || [],
  });
  syncExperimentBaseButtons();
  if (!body.configured) {
    renderLabelModels(body.reviewModels || []);
    return;
  }
  renderDatasets(body.datasets || []);
  renderLabelModels(body.reviewModels || []);
  const [catalog, resources] = await Promise.all([
    api("/api/catalog"),
    api("/api/styles"),
  ]);
  experimentController.load({
    catalog,
    configs: body.configs || [],
    promptAgent: resources.promptAgent || { versions: [] },
    styles: resources.styles || [],
    supportedImageModelLabels: body.supportedImageModelLabels || [],
  });
}

function validateSampleFiles(files) {
  if (!files.length) throw new Error("请选择至少一张参考图");
  const invalidType = files.find((file) => !SAMPLE_IMAGE_TYPES.has(file.type));
  if (invalidType) throw new Error(`${invalidType.name} 不是支持的图片格式`);
  const oversized = files.find((file) => file.size > SAMPLE_IMAGE_MAX_BYTES);
  if (oversized) throw new Error(`${oversized.name} 不能超过 8MB`);
}

function optionMarkup(values, selected) {
  return values.map((value) => `<option${value === selected ? " selected" : ""}>${escapeHtml(value)}</option>`).join("");
}

function discardSampleDrafts() {
  state.sampleLabelingToken += 1;
  for (const draft of state.sampleDrafts) {
    if (draft.previewUrl.startsWith("blob:")) URL.revokeObjectURL(draft.previewUrl);
  }
  state.sampleDrafts = [];
  state.sampleFiles = [];
  state.sampleLabeling = false;
  renderSampleDrafts();
}

function syncSampleCategoryMode({ updateDrafts = false } = {}) {
  state.sampleCategoryMode = byId("categoryModeInput").value;
  window.sessionStorage.setItem("benchmark.sampleCategoryMode", state.sampleCategoryMode);
  byId("categoryInputField").classList.toggle("hidden", state.sampleCategoryMode === "ai");
  const category = byId("categoryInput").value;
  byId("sampleLabelScopeHint").textContent = sampleLabelScopeCopy(state.sampleCategoryMode, category);
  if (!updateDrafts) return;
  for (const draft of state.sampleDrafts) {
    draft.categoryMode = state.sampleCategoryMode;
    if (state.sampleCategoryMode === "ai" && draft.aiCategory) {
      draft.category = draft.aiCategory;
      draft.categorySource = "ai";
      draft.reason = draft.aiReason;
    } else if (state.sampleCategoryMode === "fixed") {
      draft.category = category;
      draft.categorySource = "human";
      if (draft.aiReason) draft.reason = `空间类型沿用“${category}”；${draft.aiReason}`;
    }
  }
  renderSampleDrafts();
}

function renderSampleDrafts() {
  const container = byId("sampleDrafts");
  container.classList.toggle("hidden", state.sampleDrafts.length === 0);
  container.innerHTML = state.sampleDrafts.map((draft, index) => {
    const disabled = ["waiting", "labeling"].includes(draft.status) ? " disabled" : "";
    return `
    <article class="sample-draft">
      <img class="sample-draft-thumb" src="${escapeHtml(draft.previewUrl)}" alt="" />
      <div class="sample-draft-copy">
        <strong title="${escapeHtml(draft.file.name)}">${escapeHtml(draft.file.name)}</strong>
        <span class="sample-draft-status ${escapeHtml(draft.status)}">${escapeHtml(sampleDraftStatusCopy(draft))}</span>
        <small>${escapeHtml(draft.reason || sampleLabelScopeCopy(draft.categoryMode, draft.category))}</small>
      </div>
      <div class="sample-draft-controls">
        <label>空间类型<select${disabled} data-draft-index="${index}" data-draft-field="category" aria-label="${escapeHtml(draft.file.name)} 空间类型">${optionMarkup(SAMPLE_CATEGORIES, draft.category)}</select></label>
        <label>空间结构<select${disabled} data-draft-index="${index}" data-draft-field="spatialComplexity" aria-label="${escapeHtml(draft.file.name)} 空间结构">${optionMarkup(SAMPLE_COMPLEXITY_LEVELS, draft.spatialComplexity)}</select></label>
        <label>镜头复杂度<select${disabled} data-draft-index="${index}" data-draft-field="lensComplexity" aria-label="${escapeHtml(draft.file.name)} 镜头复杂度">${optionMarkup(SAMPLE_COMPLEXITY_LEVELS, draft.lensComplexity)}</select></label>
        <label>软装复杂度<select${disabled} data-draft-index="${index}" data-draft-field="stylingComplexity" aria-label="${escapeHtml(draft.file.name)} 软装复杂度">${optionMarkup(SAMPLE_COMPLEXITY_LEVELS, draft.stylingComplexity)}</select></label>
        <label>材质复杂度<select${disabled} data-draft-index="${index}" data-draft-field="materialComplexity" aria-label="${escapeHtml(draft.file.name)} 材质复杂度">${optionMarkup(SAMPLE_COMPLEXITY_LEVELS, draft.materialComplexity)}</select></label>
        <label>输入质量<select${disabled} data-draft-index="${index}" data-draft-field="inputQuality" aria-label="${escapeHtml(draft.file.name)} 输入质量">${optionMarkup(SAMPLE_COMPLEXITY_LEVELS, draft.inputQuality)}</select></label>
        <label>样本准入（人工）<select${disabled} data-draft-index="${index}" data-draft-field="sampleType" aria-label="${escapeHtml(draft.file.name)} 样本准入">${optionMarkup(SAMPLE_TYPES, draft.sampleType)}</select></label>
        ${draft.sampleType === "边缘输入" ? `<label>边缘类型<select${disabled} data-draft-index="${index}" data-draft-field="edgeType" aria-label="${escapeHtml(draft.file.name)} 边缘类型">${optionMarkup(SAMPLE_EDGE_TYPES, draft.edgeType)}</select></label>` : ""}
      </div>
    </article>
  `;
  }).join("");
}

function syncSampleSaveButton(completed = null, total = state.sampleDrafts.length) {
  const button = byId("saveCasesButton");
  button.disabled = !selectedDataset() || state.sampleLabeling || total === 0;
  if (state.sampleLabeling) {
    button.textContent = `AI 打标中 ${completed || 0} / ${total}`;
  } else {
    button.textContent = total ? `确认并保存 ${total} 个样本` : "保存样本";
  }
}

async function prepareSampleDrafts(files) {
  validateSampleFiles(files);
  const additions = uniqueSampleFiles(state.sampleFiles, files);
  if (!additions.length) throw new Error("这些图片已经在待保存清单中");
  const draftDefaults = {
    category: byId("categoryInput").value,
    categoryMode: state.sampleCategoryMode,
    sampleType: byId("sampleTypeInput").value,
  };
  state.sampleFiles.push(...additions);
  state.sampleDrafts.push(...additions.map((file) => createSampleDraft(file, {
    ...draftDefaults,
    previewUrl: URL.createObjectURL(file),
  })));
  byId("caseImageInput").value = "";
  renderSampleSelection();
  renderSampleDrafts();
  if (files.length !== additions.length) toast(`已跳过 ${files.length - additions.length} 张重复图片`);
  if (state.sampleLabeling) return;
  state.sampleLabeling = true;
  const token = ++state.sampleLabelingToken;
  syncSampleSaveButton(0);
  let failed = 0;
  const modelKey = byId("labelModelSelect").value;
  for (let draft = state.sampleDrafts.find((entry) => entry.status === "waiting"); draft; draft = state.sampleDrafts.find((entry) => entry.status === "waiting")) {
    if (token !== state.sampleLabelingToken) return;
    draft.status = "labeling";
    renderSampleDrafts();
    draft.image = await readFileAsInput(draft.file);
    if (draft.previewUrl.startsWith("blob:")) URL.revokeObjectURL(draft.previewUrl);
    draft.previewUrl = draft.image.dataUrl;
    if (token !== state.sampleLabelingToken) return;
    try {
      if (!state.apiConnected || !modelKey) {
        throw new Error(state.labelingError || "API 未连接");
      }
      const { label } = await api("/api/benchmark/cases/tag", {
        body: JSON.stringify({ image: draft.image, modelKey }),
        method: "POST",
      });
      if (token !== state.sampleLabelingToken) return;
      Object.assign(draft, applyAiSampleLabel(draft, label));
    } catch (error) {
      if (token !== state.sampleLabelingToken) return;
      failed += 1;
      draft.edgeType = draft.sampleType === "边缘输入" ? "输入不可判断" : null;
      draft.reason = `模型未完成：${error.message}`.slice(0, 80);
      draft.status = "manual-required";
    }
    renderSampleDrafts();
    syncSampleSaveButton(state.sampleDrafts.filter((entry) => !["waiting", "labeling"].includes(entry.status)).length);
  }
  if (token !== state.sampleLabelingToken) return;
  state.sampleLabeling = false;
  syncSampleSaveButton();
  if (failed) toast(`${failed} 张未完成 AI 打标，请人工确认后保存`);
}

function renderSampleSelection(files = state.sampleFiles) {
  const label = byId("fileLabel");
  const button = byId("saveCasesButton");
  if (!files.length) {
    label.textContent = "选择 PNG / JPEG / WebP，可分次添加";
    syncSampleSaveButton();
    return;
  }
  label.textContent = `已添加 ${files.length} 张，可继续选择`;
  if (!state.sampleLabeling) syncSampleSaveButton();
}

function setCaseFormBusy(busy, progress = "") {
  document.querySelectorAll("#caseForm input, #caseForm select, #caseForm button")
    .forEach((element) => { element.disabled = busy || !selectedDataset(); });
  if (busy) byId("saveCasesButton").textContent = progress;
}

async function submitCase(event) {
  event.preventDefault();
  const files = state.sampleFiles;
  validateSampleFiles(files);
  if (state.sampleLabeling) throw new Error("请等待 AI 打标完成");
  if (state.sampleDrafts.length !== files.length || state.sampleDrafts.some((draft) => !draft.image)) {
    throw new Error("样本审核清单尚未准备完成，请重新选择图片");
  }
  const sampleContext = {
    datasetId: state.selectedDatasetId,
    source: byId("sourceInput").value,
  };
  let saved = 0;
  let currentFile = null;
  setCaseFormBusy(true, `正在保存 1 / ${files.length}`);
  try {
    for (const [index, draft] of state.sampleDrafts.entries()) {
      currentFile = draft.file;
      byId("saveCasesButton").textContent = `正在保存 ${index + 1} / ${files.length}`;
      await api("/api/benchmark/cases", {
        body: JSON.stringify({
          ...sampleContext,
          category: draft.category,
          edgeType: draft.sampleType === "边缘输入" ? draft.edgeType : null,
          image: draft.image,
          inputQuality: draft.inputQuality,
          labelConfidence: draft.confidence,
          labelModel: draft.labelModel,
          labelPromptVersion: draft.labelPromptVersion,
          labelReason: draft.reason,
          labelSource: draft.labelSource,
          lensComplexity: draft.lensComplexity,
          materialComplexity: draft.materialComplexity,
          sampleType: draft.sampleType,
          spatialComplexity: draft.spatialComplexity,
          stylingComplexity: draft.stylingComplexity,
        }),
        method: "POST",
      });
      saved += 1;
    }
  } catch (error) {
    if (saved) {
      byId("caseImageInput").value = "";
      discardSampleDrafts();
      renderSampleSelection([]);
      await loadOverview();
    }
    throw new Error(`已保存 ${saved} / ${files.length}；${currentFile?.name || "图片"}：${error.message}${saved ? "。请重新选择未保存图片" : ""}`);
  } finally {
    setCaseFormBusy(false);
  }
  byId("caseImageInput").value = "";
  discardSampleDrafts();
  renderSampleSelection([]);
  toast(`已保存 ${saved} 个样本`);
  await loadOverview();
}

async function submitDataset(event) {
  event.preventDefault();
  const name = byId("datasetNameInput").value.trim();
  if (!name) throw new Error("请填写样本集名称");
  const creating = state.datasetEditorMode === "create";
  const path = creating
    ? "/api/benchmark/datasets"
    : `/api/benchmark/datasets/${encodeURIComponent(state.selectedDatasetId)}`;
  const body = await api(path, {
    body: JSON.stringify({ name }),
    method: creating ? "POST" : "PATCH",
  });
  state.selectedDatasetId = body.dataset.datasetId;
  closeDatasetEditor();
  toast(creating ? "样本集已创建" : "样本集已重命名");
  await loadOverview();
}

async function archiveDataset() {
  const dataset = selectedDataset();
  if (!dataset) return;
  const message = dataset.caseCount
    ? `删除“${dataset.name}”后将从工作台隐藏，但会保留 ${dataset.caseCount} 个样本及历史评测。继续吗？`
    : `删除空样本集“${dataset.name}”？`;
  if (!window.confirm(message)) return;
  await api(`/api/benchmark/datasets/${encodeURIComponent(dataset.datasetId)}`, {
    body: JSON.stringify({ confirm: true }),
    method: "DELETE",
  });
  state.selectedDatasetId = "";
  closeDatasetEditor();
  toast("样本集已删除，历史数据已保留");
  await loadOverview();
}

async function planExperiment() {
  const input = experimentInput();
  if (!state.selectedDatasetId) throw new Error("请先选择样本集");
  if (!input.caseIds.length) throw new Error("当前样本集没有可评测样本");
  if (!input.experimentId) throw new Error("请填写实验 ID");
  if (input.draftConfig.variantValues.length < 2) {
    throw new Error("实验因子至少选择两个候选值");
  }
  const body = await api("/api/benchmark/experiments/plan", { body: JSON.stringify(input), method: "POST" });
  renderPlan(body.plan);
  switchPanel("run");
}

async function startJob(path, input) {
  if (path === "/api/benchmark/experiments/run") {
    state.runExperimentId = input.experimentId;
    window.sessionStorage.setItem("benchmark.runExperimentId", state.runExperimentId);
  }
  const body = await api(path, { body: JSON.stringify({ ...input, confirm: true }), method: "POST" });
  state.activeJobId = body.job.jobId;
  window.sessionStorage.setItem("benchmark.activeJobId", state.activeJobId);
  renderJob(body.job);
  switchPanel(jobPanelFor(body.job));
  pollJob(state.activeJobId);
}

function renderPersistedExperiment(experiments = []) {
  const latest = [...experiments]
    .filter((experiment) => ["cancelled", "completed", "failed", "running"].includes(experiment.status))
    .sort((left, right) => String(
      right.failedAt || right.completedAt || right.startedAt || right.createdAt || "",
    ).localeCompare(String(
      left.failedAt || left.completedAt || left.startedAt || left.createdAt || "",
  )))[0];
  if (!latest) return false;
  state.runExperimentId = latest.experimentId;
  window.sessionStorage.setItem("benchmark.runExperimentId", state.runExperimentId);
  renderJob(persistedGenerationJob(latest));
  return true;
}

async function retryFailedImages() {
  const experiment = (state.overview?.experiments || [])
    .find((entry) => entry.experimentId === state.runExperimentId);
  await startJob("/api/benchmark/experiments/run", generationRetryInput(experiment));
}

async function resumeGeneration() {
  const experiment = (state.overview?.experiments || [])
    .find((entry) => entry.experimentId === state.runExperimentId);
  await startJob("/api/benchmark/experiments/run", generationResumeInput(experiment));
}

async function pollJob(jobId) {
  window.clearTimeout(state.pollTimer);
  const { job } = await api(`/api/benchmark/jobs/${encodeURIComponent(jobId)}`);
  renderJob(job);
  if (["cancelling", "running"].includes(job.status)) {
    state.pollTimer = window.setTimeout(() => pollJob(jobId).catch((error) => toast(error.message)), 1800);
    return job;
  }
  toast(job.status === "success"
    ? "任务已完成"
    : job.status === "cancelled"
      ? "出图已停止，已完成结果已保留"
      : job.error);
  await loadOverview();
  return job;
}

async function cancelActiveJob() {
  if (!state.activeJobId) throw new Error("当前没有可停止的出图任务");
  const { job } = await api(
    `/api/benchmark/jobs/${encodeURIComponent(state.activeJobId)}/cancel`,
    { body: "{}", method: "POST" },
  );
  renderJob(job);
  if (["cancelling", "running"].includes(job.status)) {
    pollJob(state.activeJobId).catch((error) => toast(error.message));
  }
}

async function resumeJob() {
  if (!state.activeJobId) {
    renderPersistedExperiment(state.overview?.experiments || []);
    return;
  }
  try {
    const job = await pollJob(state.activeJobId);
    switchPanel(jobPanelFor(job));
  } catch (error) {
    window.sessionStorage.removeItem("benchmark.activeJobId");
    state.activeJobId = "";
    if (!renderPersistedExperiment(state.overview?.experiments || [])) throw error;
  }
}

function assignNewExperimentId({ announce = false } = {}) {
  byId("experimentIdInput").value = createExperimentId();
  resetPlan();
  if (announce) toast("已生成新的实验 ID");
}

function defaultIds() {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 13);
  assignNewExperimentId();
  byId("reviewBatchInput").value = `REVIEW-${stamp}`;
}

function startReview() {
  return startJob("/api/benchmark/reviews/run", {
    caseIds: selectedDatasetCases().map((entry) => entry.caseId),
    ...reviewController.input(),
  });
}

async function refreshOverview() {
  const button = byId("refreshButton");
  button.disabled = true;
  button.textContent = "同步中";
  try {
    await loadOverview();
    toast("数据已同步");
  } finally {
    button.disabled = false;
    button.textContent = "同步";
  }
}

function guardDirectFileOpen() {
  if (window.location.protocol !== "file:") return false;
  const notice = byId("setupNotice");
  byId("connectionStatus").textContent = "需要启动服务";
  notice.classList.remove("hidden");
  notice.innerHTML = "当前直接打开了 HTML 文件，只能预览界面。请先运行 <code>npm start</code>，再从 Canvas Lab 顶栏进入「模型评测」。";
  document.querySelectorAll("#refreshButton, [data-requires-service]")
    .forEach((element) => { element.disabled = true; });
  return true;
}

function bind() {
  document.querySelectorAll(".step").forEach((button) => button.addEventListener("click", () => switchPanel(button.dataset.step)));
  byId("datasetSelect").addEventListener("change", (event) => {
    state.selectedDatasetId = event.target.value;
    window.sessionStorage.setItem("benchmark.datasetId", state.selectedDatasetId);
    closeDatasetEditor();
    renderCases();
    reviewController.refreshScope();
    renderAnalysisScope();
    resetPlan();
  });
  byId("analysisExperimentSelect").addEventListener("change", (event) => {
    state.selectedAnalysisExperimentId = event.target.value;
    renderAnalysisScope();
  });
  byId("reviewExperimentSelect").addEventListener("change", syncExperimentBaseButtons);
  byId("openExperimentBaseButton").addEventListener("click", (event) =>
    openExperimentInBase(state.selectedAnalysisExperimentId, event.currentTarget, { allowAll: true, target: "report" }).catch((error) => toast(error.message)));
  byId("reviewOpenBaseButton").addEventListener("click", (event) =>
    openExperimentInBase(byId("reviewExperimentSelect").value, event.currentTarget, { target: "results" }).catch((error) => toast(error.message)));
  byId("runOpenBaseButton").addEventListener("click", (event) =>
    openExperimentInBase(currentRunExperimentId(), event.currentTarget, { target: "comparison" }).catch((error) => toast(error.message)));
  byId("createDatasetButton").addEventListener("click", () => openDatasetEditor("create"));
  byId("renameDatasetButton").addEventListener("click", () => openDatasetEditor("rename"));
  byId("archiveDatasetButton").addEventListener("click", () => archiveDataset().catch((error) => toast(error.message)));
  byId("cancelDatasetButton").addEventListener("click", closeDatasetEditor);
  byId("datasetEditor").addEventListener("submit", (event) => submitDataset(event).catch((error) => toast(error.message)));
  byId("newExperimentIdButton").addEventListener("click", () => assignNewExperimentId({ announce: true }));
  byId("jobNewExperimentButton").addEventListener("click", () => {
    assignNewExperimentId({ announce: true });
    state.activeJobId = "";
    window.sessionStorage.removeItem("benchmark.activeJobId");
    switchPanel("experiment");
  });
  byId("jobRetryButton").addEventListener("click", () =>
    retryFailedImages().catch((error) => toast(error.message)));
  byId("jobResumeButton").addEventListener("click", () =>
    resumeGeneration().catch((error) => toast(error.message)));
  byId("jobCancelButton").addEventListener("click", () =>
    cancelActiveJob().catch((error) => toast(error.message)));
  byId("maxCasesInput").addEventListener("input", resetPlan);
  byId("labelModelSelect").addEventListener("change", (event) => {
    state.selectedLabelModelKey = event.target.value;
    window.sessionStorage.setItem("benchmark.labelModelKey", state.selectedLabelModelKey);
  });
  byId("categoryModeInput").addEventListener("change", () => syncSampleCategoryMode({ updateDrafts: true }));
  byId("categoryInput").addEventListener("change", () => syncSampleCategoryMode({ updateDrafts: true }));
  byId("caseImageInput").addEventListener("change", (event) => {
    const files = [...event.currentTarget.files];
    event.currentTarget.value = "";
    prepareSampleDrafts(files).catch((error) => toast(error.message));
  });
  byId("sampleDrafts").addEventListener("change", (event) => {
    const select = event.target.closest("select[data-draft-index]");
    if (!select) return;
    const draft = state.sampleDrafts[Number(select.dataset.draftIndex)];
    if (!draft) return;
    draft[select.dataset.draftField] = select.value;
    if (select.dataset.draftField === "sampleType") {
      draft.edgeType = select.value === "边缘输入" ? draft.edgeType || "输入不可判断" : null;
    }
    if (select.dataset.draftField === "category") {
      draft.categorySource = "human";
      draft.reason = `空间类型人工调整为“${draft.category}”${draft.aiReason ? `；${draft.aiReason}` : ""}`;
      draft.status = draft.labelSource === "ai" ? "manual-category" : "manual";
    } else if (AI_DIMENSION_FIELDS.has(select.dataset.draftField)) {
      draft.confidence = null;
      draft.labelModel = null;
      draft.labelPromptVersion = null;
      draft.labelSource = "human";
      draft.reason = "人工已复核并修改 AI 标签";
      draft.status = "manual";
    }
    renderSampleDrafts();
  });
  byId("caseForm").addEventListener("submit", (event) => submitCase(event).catch((error) => toast(error.message)));
  byId("planButton").addEventListener("click", () => planExperiment().catch((error) => toast(error.message)));
  byId("runButton").addEventListener("click", () => startJob("/api/benchmark/experiments/run", experimentInput()).catch((error) => toast(error.message)));
  byId("reviewButton").addEventListener("click", () => startReview().catch((error) => toast(error.message)));
  byId("jobReviewResumeButton").addEventListener("click", () => startReview().catch((error) => toast(error.message)));
  byId("refreshButton").addEventListener("click", () => refreshOverview().catch((error) => toast(error.message)));
}

defaultIds();
bind();
byId("categoryModeInput").value = state.sampleCategoryMode;
byId("categoryModeInput").dispatchEvent(new Event("change", { bubbles: true }));
if (!guardDirectFileOpen()) {
  loadOverview()
    .then(() => resumeJob())
    .catch((error) => toast(error.message));
}

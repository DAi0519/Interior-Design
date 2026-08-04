/**
 * [INPUT]: 依赖 benchmark.html DOM、浏览器 location/FileReader 与同源 /api/benchmark 接口
 * [OUTPUT]: 对外提供 file 预览保护、样本集 CRUD/筛选、OneAPI 视觉模型选择、空间与五维逐图 AI 打标、人工准入/自动编号上传、实验草稿预演、评分/分析、任务轮询及分流到横评对比/运行明细/结果报告的飞书筛选跳转
 * [POS]: public 的 Benchmark 页面状态控制器，以样本集为操作主对象，拦截 file 协议误用且所有破坏性外部调用都要求用户二次确认
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createExperimentDraftController, createExperimentId } from "./benchmark-experiment.js?v=2";
import { createJobRenderer } from "./benchmark-job-ui.js?v=1";
import { createReviewController, jobPanelFor } from "./benchmark-review-ui.js?v=2";

const state = {
  activeJobId: window.sessionStorage.getItem("benchmark.activeJobId") || "",
  apiConnected: false,
  datasetEditorMode: null,
  labelModels: [],
  labelingError: null,
  overview: null,
  plan: null,
  pollTimer: null,
  sampleDrafts: [],
  sampleLabeling: false,
  sampleLabelingToken: 0,
  selectedLabelModelKey: window.sessionStorage.getItem("benchmark.labelModelKey") || "gemini35flash",
  selectedAnalysisExperimentId: window.sessionStorage.getItem("benchmark.analysisExperimentId") || "",
  selectedDatasetId: window.sessionStorage.getItem("benchmark.datasetId") || "",
};
const byId = (id) => document.getElementById(id);
const renderJob = createJobRenderer({ byId, jobPanelFor });
const SAMPLE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const SAMPLE_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const SAMPLE_CATEGORIES = ["客厅", "客餐厅一体", "独立餐厅", "卧室", "厨房", "卫生间", "玄关", "走廊", "书房", "阳台", "儿童房"];
const SAMPLE_COMPLEXITY_LEVELS = ["低", "中", "高"];
const SAMPLE_TYPES = ["有效白模", "边缘输入"];
const SAMPLE_EDGE_TYPES = ["CAD/线稿", "草模/概念图", "已完成材质", "输入不可判断", "内容不相关"];
const AI_SAMPLE_FIELDS = new Set([
  "category",
  "inputQuality",
  "lensComplexity",
  "materialComplexity",
  "spatialComplexity",
  "stylingComplexity",
]);

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `请求失败（${response.status}）`);
  return body;
}

function toast(message) {
  const element = byId("toast");
  element.textContent = message;
  element.classList.remove("hidden");
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => element.classList.add("hidden"), 3200);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character]);
}

function formatRate(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "—";
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

function selectedDatasetCases() {
  return (state.overview?.cases || []).filter((entry) => entry.datasetId === state.selectedDatasetId);
}

function resetPlan() {
  state.plan = null;
  byId("planResult").classList.add("empty");
  byId("planResult").textContent = "尚未生成实验计划";
  for (const id of ["planCases", "planPrompts", "planRuns", "planSkipped"]) byId(id).textContent = "—";
  byId("driftNotice").textContent = "先在实验配置中完成预演。";
  byId("driftNotice").classList.add("neutral");
  byId("runButton").disabled = true;
  byId("runBadge").textContent = "等待预演";
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
  document.querySelector(".dataset-grid").classList.toggle("hidden", !hasDataset);
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
  byId("planResult").classList.remove("empty");
  byId("planResult").innerHTML = `<div class="plan-summary">
    <div><span>Cases</span><strong>${summary.cases}</strong></div><div><span>模型</span><strong>${summary.activeImageModels}</strong></div><div><span>Prompt</span><strong>${summary.promptBatches}</strong></div><div><span>出图 Run</span><strong>${summary.imageRuns}</strong></div>
  </div>`;
  byId("planCases").textContent = summary.cases;
  byId("planPrompts").textContent = summary.promptBatches;
  byId("planRuns").textContent = summary.imageRuns;
  byId("planSkipped").textContent = summary.skippedImages;
  byId("driftNotice").textContent = plan.drift.message;
  byId("driftNotice").classList.toggle("neutral", !plan.drift.blocked);
  byId("runButton").disabled = plan.drift.blocked || summary.imageRuns === 0;
  byId("runBadge").textContent = plan.drift.blocked ? "协议漂移" : "预演通过";
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
  runButton.disabled = !state.plan?.groups?.[0]?.groupId;
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

function fileAsInput(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("图片读取失败"));
    reader.onload = () => resolve({ dataUrl: reader.result, name: file.name, size: file.size, type: file.type });
    reader.readAsDataURL(file);
  });
}

function selectedSampleFiles() {
  return [...byId("caseImageInput").files];
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
  for (const draft of state.sampleDrafts) URL.revokeObjectURL(draft.previewUrl);
  state.sampleDrafts = [];
  renderSampleDrafts();
}

function draftStatusCopy(draft) {
  if (draft.status === "labeling") return "AI 打标中";
  if (draft.status === "ai") return `AI 六维 ${Math.round(draft.confidence * 100)}%`;
  if (draft.status === "manual") return "已人工修改";
  if (draft.status === "manual-required") return "需人工确认";
  return "等待打标";
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
        <span class="sample-draft-status ${escapeHtml(draft.status)}">${escapeHtml(draftStatusCopy(draft))}</span>
        <small>${escapeHtml(draft.reason || "模型将识别空间与五个独立维度")}</small>
      </div>
      <div class="sample-draft-controls">
        <label>类别<select${disabled} data-draft-index="${index}" data-draft-field="category" aria-label="${escapeHtml(draft.file.name)} 类别">${optionMarkup(SAMPLE_CATEGORIES, draft.category)}</select></label>
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

async function prepareSampleDrafts() {
  const files = selectedSampleFiles();
  validateSampleFiles(files);
  state.sampleLabelingToken += 1;
  const token = state.sampleLabelingToken;
  discardSampleDrafts();
  const defaultSampleType = byId("sampleTypeInput").value;
  state.sampleDrafts = files.map((file) => ({
    category: byId("categoryInput").value,
    confidence: null,
    edgeType: defaultSampleType === "边缘输入" ? "输入不可判断" : null,
    file,
    image: null,
    inputQuality: "中",
    labelModel: null,
    labelPromptVersion: null,
    labelSource: "human",
    lensComplexity: "中",
    materialComplexity: "中",
    previewUrl: URL.createObjectURL(file),
    reason: "",
    sampleType: defaultSampleType,
    spatialComplexity: "中",
    status: "waiting",
    stylingComplexity: "中",
  }));
  state.sampleLabeling = true;
  renderSampleSelection(files);
  renderSampleDrafts();
  syncSampleSaveButton(0, files.length);
  let failed = 0;
  const modelKey = byId("labelModelSelect").value;
  for (const [index, draft] of state.sampleDrafts.entries()) {
    if (token !== state.sampleLabelingToken) return;
    draft.status = "labeling";
    renderSampleDrafts();
    draft.image = await fileAsInput(draft.file);
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
      Object.assign(draft, {
        category: label.category,
        confidence: label.confidence,
        inputQuality: label.inputQuality,
        labelModel: label.modelKey,
        labelPromptVersion: label.promptVersion,
        labelSource: "ai",
        lensComplexity: label.lensComplexity,
        materialComplexity: label.materialComplexity,
        reason: label.reason,
        spatialComplexity: label.spatialComplexity,
        status: "ai",
        stylingComplexity: label.stylingComplexity,
      });
    } catch (error) {
      if (token !== state.sampleLabelingToken) return;
      failed += 1;
      draft.edgeType = draft.sampleType === "边缘输入" ? "输入不可判断" : null;
      draft.reason = `模型未完成：${error.message}`.slice(0, 80);
      draft.status = "manual-required";
    }
    renderSampleDrafts();
    syncSampleSaveButton(index + 1, files.length);
  }
  if (token !== state.sampleLabelingToken) return;
  state.sampleLabeling = false;
  syncSampleSaveButton();
  if (failed) toast(`${failed} 张未完成 AI 打标，请人工确认后保存`);
}

function renderSampleSelection(files = selectedSampleFiles()) {
  const label = byId("fileLabel");
  const button = byId("saveCasesButton");
  if (!files.length) {
    label.textContent = "选择多张 PNG / JPEG / WebP";
    syncSampleSaveButton();
    return;
  }
  label.textContent = files.length === 1 ? files[0].name : `已选择 ${files.length} 张图片`;
  if (!state.sampleLabeling) syncSampleSaveButton();
}

function setCaseFormBusy(busy, progress = "") {
  document.querySelectorAll("#caseForm input, #caseForm select, #caseForm button")
    .forEach((element) => { element.disabled = busy || !selectedDataset(); });
  if (busy) byId("saveCasesButton").textContent = progress;
}

async function submitCase(event) {
  event.preventDefault();
  const files = selectedSampleFiles();
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
  if (!input.draftConfig.imageModelKeys.length) throw new Error("至少选择一个出图模型");
  const body = await api("/api/benchmark/experiments/plan", { body: JSON.stringify(input), method: "POST" });
  renderPlan(body.plan);
  switchPanel("run");
}

async function startJob(path, input) {
  const body = await api(path, { body: JSON.stringify({ ...input, confirm: true }), method: "POST" });
  state.activeJobId = body.job.jobId;
  window.sessionStorage.setItem("benchmark.activeJobId", state.activeJobId);
  renderJob(body.job);
  switchPanel(jobPanelFor(body.job));
  pollJob(state.activeJobId);
}

function renderPersistedExperiment(experiments = []) {
  const latest = [...experiments]
    .filter((experiment) => ["completed", "failed", "running"].includes(experiment.status))
    .sort((left, right) => String(
      right.failedAt || right.completedAt || right.startedAt || right.createdAt || "",
    ).localeCompare(String(
      left.failedAt || left.completedAt || left.startedAt || left.createdAt || "",
    )))[0];
  if (!latest) return false;
  renderJob({
    completed: latest.result?.generatedImages || 0,
    error: latest.error || null,
    jobId: latest.experimentId,
    kind: "generation",
    message: latest.status === "failed"
      ? JOB_PHASE_LABELS[latest.phase]
        ? `${JOB_PHASE_LABELS[latest.phase]}失败`
        : "任务执行失败"
      : latest.status === "completed" ? "任务完成" : "任务运行中",
    persisted: latest.status === "completed" || latest.phase === "generation",
    phase: latest.phase || (latest.status === "completed" ? "generation" : "preflight"),
    status: latest.status === "completed" ? "success" : latest.status,
    storage: "Benchmark Base",
    total: latest.summary?.imageRuns || 0,
  });
  return true;
}

async function pollJob(jobId) {
  window.clearTimeout(state.pollTimer);
  const { job } = await api(`/api/benchmark/jobs/${encodeURIComponent(jobId)}`);
  renderJob(job);
  if (job.status === "running") {
    state.pollTimer = window.setTimeout(() => pollJob(jobId).catch((error) => toast(error.message)), 1800);
    return job;
  }
  toast(job.status === "success" ? "任务已完成" : job.error);
  await loadOverview();
  return job;
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
    openExperimentInBase(state.plan?.groups?.[0]?.groupId, event.currentTarget, { target: "comparison" }).catch((error) => toast(error.message)));
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
  byId("maxCasesInput").addEventListener("input", resetPlan);
  byId("labelModelSelect").addEventListener("change", (event) => {
    state.selectedLabelModelKey = event.target.value;
    window.sessionStorage.setItem("benchmark.labelModelKey", state.selectedLabelModelKey);
  });
  byId("caseImageInput").addEventListener("change", () => {
    state.sampleLabelingToken += 1;
    state.sampleLabeling = false;
    prepareSampleDrafts().catch((error) => {
      byId("caseImageInput").value = "";
      discardSampleDrafts();
      renderSampleSelection([]);
      toast(error.message);
    });
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
    if (AI_SAMPLE_FIELDS.has(select.dataset.draftField)) {
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
  byId("reviewButton").addEventListener("click", () => startJob("/api/benchmark/reviews/run", {
    caseIds: selectedDatasetCases().map((entry) => entry.caseId),
    ...reviewController.input(),
  }).catch((error) => toast(error.message)));
  byId("refreshButton").addEventListener("click", () => refreshOverview().catch((error) => toast(error.message)));
}

defaultIds();
bind();
if (!guardDirectFileOpen()) {
  loadOverview()
    .then(() => resumeJob())
    .catch((error) => toast(error.message));
}

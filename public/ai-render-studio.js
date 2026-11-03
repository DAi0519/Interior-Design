/**
 * [INPUT]: 依赖共享九卡光影/下拉/可选打光编辑、HTTP/文件/尺寸工具及独立任务/飞书同步接口
 * [OUTPUT]: 对外提供原光影或真实库卡选择、风格下拉、按需精细控光、单次提交/只读恢复、结果对比下载与独立归档重试
 * [POS]: public 的独立AI渲染台浏览器编排层，仅保存任务ID，不持有模型密钥或运营Prompt正文
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { bindImageRelight } from "./image-relight.js";
import { bindRefinedLightingControls } from "./refined-lighting-controls.js";
import { RELIGHT_MODEL_KEY, RELIGHT_IMAGE_POLICY, relightImageIssue } from "./image-relight-geometry.js";
import { api, formatBytes, readFileAsInput } from "./workbench-utils.js";
import { readImageDimensions } from "./image-ratio.js";
import "./custom-select.js?v=10";

const by = id => document.getElementById(id);
const root = by("studioLighting"), input = by("studioSourceInput"), upload = by("studioUpload");
const generate = by("studioGenerate"), resume = by("studioResume");
const STORAGE_KEY = "canvas-lab.ai-render-studio.job.v1";
const API_ROOT = "/api/ai-render-studio";
const RENDER_STYLES = new Set(["photoreal", "soft", "cinematic", "film"]);
const terminal = new Set(["success", "failed", "error"]);
let source = null, config = null, relight, lighting, job = null, result = null, renderStyle = "photoreal";
let generating = false, uploadPending = false, uploadSequence = 0, pollTimer = null, toastTimer = null;
let comparisonSource = null, selectedTab = "result", savedJobId = null, queryingId = null, syncReadError = "", syncRetrying = false;
const studioImagePolicy = () => ({ ...RELIGHT_IMAGE_POLICY, maxBytesPerImage: 8 * 1024 * 1024, maxTotalBytes: 8 * 1024 * 1024, ...config?.imagePolicy });

// --- 只保存任务身份，图片和补充正文停留在当前页面内存 ---
function saveJobId(value) {
  savedJobId = value;
  try { if (value) sessionStorage.setItem(STORAGE_KEY, value); else sessionStorage.removeItem(STORAGE_KEY); } catch {}
}
function readJobId() {
  try { return sessionStorage.getItem(STORAGE_KEY); } catch { return null; }
}
function showToast(message) {
  clearTimeout(toastTimer); by("studioToast").textContent = message; by("studioToast").hidden = false;
  toastTimer = setTimeout(() => { by("studioToast").hidden = true; }, 4200);
}
function showError(id, message = "") {
  const node = by(id); node.textContent = message; node.hidden = !message;
}

relight = bindImageRelight({ root, getSourceImage: () => source, onChange: render,
  showToast, onRefresh: () => loadConfig(true),
  allowMaterialRender: true, promptCode: "ai-render-studio" });

// --- 仅移动共享控件DOM，保留全部画布事件与几何状态 ---
const stage = document.createElement("section");
stage.className = "result-panel studio-stage";
stage.setAttribute("aria-label", "生成结果");
stage.innerHTML = `
  <header class="studio-stage-header"><h2 id="studioStageHeading">生成结果</h2><button id="studioReturnResult" class="studio-return-result" type="button" hidden>返回生成结果</button></header>
  <div class="studio-stage-content">
    <div id="studioPreviewPanel" aria-label="精细控光画布" hidden></div>
    <div id="studioResultPanel" class="studio-result-panel" aria-labelledby="studioStageHeading">
      <div id="studioEmptyState" class="empty-state"><div class="empty-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 4.5h14A1.5 1.5 0 0 1 20.5 6v12a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18V6A1.5 1.5 0 0 1 5 4.5Z" /><path d="m6.5 16 3.8-4 2.7 2.6 2.3-2.1 2.2 3.5" /></svg></div><h3>等待生成</h3><p>配置完成后，结果会显示在这里。</p></div>
      <div id="studioJobState" class="studio-job-state" role="status" aria-live="polite" hidden><div class="studio-job-indicator" aria-hidden="true"></div><h3 id="studioJobTitle">正在渲染</h3><p id="studioJobMessage"></p></div>
      <div id="studioResultFrame" class="studio-result-frame" hidden>
        <!-- impeccable-disable-next-line broken-image: 只有实际任务成功后才设置src并显示结果 -->
        <img id="studioResultImage" alt="AI渲染台实际生成结果" />
        <div id="studioCompareOverlay" class="studio-compare-overlay" hidden><img id="studioCompareOriginal" alt="上传的原模型图" /><span class="studio-compare-label original">原模型</span></div>
        <div id="studioCompareLine" class="studio-compare-line" hidden></div><span id="studioRenderedLabel" class="studio-compare-label rendered" hidden>渲染结果</span>
      </div>
      <div id="studioResultActions" class="studio-result-actions" hidden><span id="studioResultMeta" class="studio-result-meta"></span><label><input id="studioCompareEnabled" type="checkbox" />原图对比</label><button id="studioDownload" type="button">下载 PNG</button></div>
      <div id="studioSync" class="studio-sync" role="status" aria-live="polite" hidden><span id="studioSyncStatus"></span><a id="studioRecordLink" target="_blank" rel="noopener noreferrer" hidden>查看飞书记录<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10" /></svg></a><button id="studioRetrySync" type="button" hidden>仅重试飞书同步</button></div>
      <input id="studioCompareRange" class="studio-compare-range" type="range" min="0" max="100" value="50" aria-label="原图与渲染图对比位置" hidden />
    </div>
  </div>
  <footer id="studioStageFooter" class="studio-stage-footer" hidden><div id="studioCanvasTools"></div></footer>`;
const settings = root.querySelector(".relight-settings"), preview = root.querySelector(".relight-preview");
const toolbar = root.querySelector(".relight-toolbar");
byInStage("studioPreviewPanel").append(preview);
byInStage("studioCanvasTools").append(toolbar);
root.prepend(by("studioRenderSettings"));
by("studioAdvancedPanel").append(settings);
root.append(stage);
function byInStage(id) { return stage.querySelector(`#${id}`); }
settings.querySelector("h2").textContent = "光线设置";
settings.querySelector("[data-relight-prompt-refresh]").setAttribute("aria-label", "刷新AI渲染台配置");
settings.querySelector("[data-relight-prompt-refresh]").title = "读取当前AI渲染台配置";
preview.querySelector("[data-relight-empty]").textContent = "先添加模型图，再标注需要调整的光源。";
relight.restore({ templateKey: "custom", blendMode: "balanced", originalLights: { action: "keep" }, lights: [], outputResolution: "1K", quality: "medium" });
lighting = bindRefinedLightingControls({ root: by("studioLightingPresets"), onChange: render, showToast,
  optionalPreset: true, optionalPresetLabel: "原光影", allowReferenceUpload: false, presetExecution: "prompt-only",
  allowMultiplePresets: false, withConfigRefresh: true });
by("studioLightingPresets").querySelector("[data-config-refresh]").addEventListener("click", () => loadConfig(true));

function setTab(next) {
  selectedTab = next;
  by("studioPreviewPanel").hidden = next !== "preview";
  by("studioResultPanel").hidden = next !== "result";
  by("studioAdvancedPanel").hidden = next !== "preview";
  by("studioStageFooter").hidden = next !== "preview";
  by("studioReturnResult").hidden = next !== "preview";
  by("studioStageHeading").textContent = next === "preview" ? "精细控光" : "生成结果";
  by("studioAdvancedToggle").setAttribute("aria-expanded", String(next === "preview"));
  if (next === "preview") relight.activate();
  render();
}
by("studioAdvancedToggle").addEventListener("click", () => { if (!generating && !uploadPending) setTab(selectedTab === "preview" ? "result" : "preview"); });
by("studioReturnResult").addEventListener("click", () => { setTab("result"); by("studioAdvancedToggle").focus(); });
function lightingPreset() {
  const selection = lighting.value();
  return selection.mode === "unselected" ? null : { id: selection.presetId, version: selection.version, sha256: selection.sha256 };
}

// --- 配置、上传与表单状态 ---
async function loadConfig(force = false) {
  const refresh = by("studioLightingPresets").querySelector("[data-config-refresh]");
  refresh.disabled = true; refresh.setAttribute("aria-busy", "true");
  try {
    const next = await api(`${API_ROOT}/config${force ? "?refresh=1" : ""}`);
    config = next; relight.configure(next);
    for (const item of next.renderStyles || []) {
      if (!RENDER_STYLES.has(item.key)) continue;
      const option = [...by("studioRenderStyle").options].find(entry => entry.value === item.key);
      if (option) option.textContent = item.label;
    }
    lighting.setAvailability({ available: next.lightingPresetAvailable === true, presets: next.lightingPresets || [],
      reason: next.lightingPresetReason, presetExecutions: ["prompt-only"], multiplePresetExecutions: false, multiplePresetSelections: false });
  } catch (error) {
    config = { available: false, reason: `配置读取失败：${error.message}` };
    relight.configure(config);
    lighting.setAvailability({ available: false, presets: [], reason: config.reason });
  } finally {
    refresh.disabled = false; refresh.setAttribute("aria-busy", "false");
  }
  render();
}

function render() {
  if (!relight || !lighting || !by("studioStageHeading")) return;
  const busy = generating || uploadPending;
  document.body.classList.toggle("is-busy", generating);
  upload.disabled = busy; input.disabled = busy; by("studioRemoveSource").disabled = busy;
  by("studioPrompt").disabled = busy;
  by("studioRenderStyle").disabled = busy;
  by("studioAdvancedToggle").disabled = busy || !source;
  by("studioLightingPresets").inert = busy;
  settings.inert = busy; toolbar.inert = busy; preview.inert = busy || selectedTab !== "preview";
  by("studioUploadPolicy").textContent = `PNG / JPEG / WebP · 最大 ${formatBytes(studioImagePolicy().maxBytesPerImage)}`;
  by("studioSourceCount").textContent = source ? "1 / 1" : "0 / 1";
  const issue = config?.available ? source ? relight.validate()?.message || lighting.validation() : "" : config?.reason || "正在读取渲染配置。";
  generate.disabled = busy || !source || Boolean(issue);
  generate.setAttribute("aria-busy", String(generating));
  by("studioActions").classList.toggle("is-busy", generating);
  by("studioGenerateLabel").textContent = generating ? "RUNNING…" : "START";
  by("studioSubmitNote").textContent = busy ? generating ? job?.message || "正在渲染…" : "正在读取模型图…" : issue || "";
  by("studioSubmitNote").hidden = !busy && !issue;
  const values = relight.value(), count = values.lights.length;
  by("studioLightCount").textContent = count ? `${count} 处调整` : values.originalLights?.action !== "keep" ? "已调整" : "";
}

async function chooseFile(file) {
  if (!file || generating || uploadPending) return;
  showError("studioUploadError");
  if (!studioImagePolicy().accept.includes(file.type)) { showError("studioUploadError", "请选择PNG、JPEG或WebP图片。"); return; }
  if (file.size > studioImagePolicy().maxBytesPerImage) { showError("studioUploadError", `模型图超过${formatBytes(studioImagePolicy().maxBytesPerImage)}，请压缩后重新添加。${source ? "当前原图已保留。" : ""}`); return; }
  await loadSource(() => readFileAsInput(file));
}
async function loadSource(readSource) {
  if (generating || uploadPending) return;
  const sequence = ++uploadSequence; showError("studioUploadError");
  uploadPending = true; render();
  try {
    const value = await readSource(), dimensions = await readImageDimensions(value.dataUrl, value.name);
    const next = { ...value, ...dimensions, id: crypto.randomUUID() }, issue = relightImageIssue(next, studioImagePolicy());
    if (issue) throw new Error(issue);
    if (sequence !== uploadSequence) return;
    source = next; result = null; job = null; comparisonSource = null; saveJobId(null);
    showError("studioRequestError"); resume.hidden = true; stopPoll();
    by("studioSourceThumbnail").src = next.dataUrl; by("studioSourceSummary").hidden = false;
    by("studioSourceName").textContent = next.name; by("studioSourceName").title = next.name;
    by("studioSourceDimensions").textContent = `${next.width} × ${next.height} · ${formatBytes(next.size)}`;
    upload.classList.add("has-source"); upload.querySelector("strong").textContent = "替换模型图";
    clearResult(); relight.activate(); setTab("result");
  } catch (error) {
    if (sequence === uploadSequence) showError("studioUploadError", `${error.message}。${source ? "当前原图已保留。" : "请重新选择图片。"}`);
  } finally { if (sequence === uploadSequence) { uploadPending = false; render(); } }
}
upload.addEventListener("click", () => input.click());
input.addEventListener("change", () => { const file = input.files?.[0]; input.value = ""; void chooseFile(file); });
for (const eventName of ["dragenter", "dragover"]) upload.addEventListener(eventName, event => { event.preventDefault(); if (!generating) upload.classList.add("dragging"); });
for (const eventName of ["dragleave", "drop"]) upload.addEventListener(eventName, event => { event.preventDefault(); upload.classList.remove("dragging"); });
upload.addEventListener("drop", event => { void chooseFile(event.dataTransfer?.files?.[0]); });
by("studioRemoveSource").addEventListener("click", () => {
  if (generating) return;
  ++uploadSequence; source = null; result = null; job = null; comparisonSource = null; saveJobId(null); stopPoll();
  by("studioSourceSummary").hidden = true; by("studioSourceThumbnail").removeAttribute("src");
  upload.classList.remove("has-source"); upload.querySelector("strong").textContent = "添加或拖入模型图";
  showError("studioUploadError"); showError("studioRequestError"); resume.hidden = true; clearResult();
  relight.restore({ templateKey: "custom", blendMode: "balanced", originalLights: { action: "keep" }, lights: [], outputResolution: "1K", quality: "medium" });
  setTab("result"); render();
});
by("studioPrompt").addEventListener("input", () => { by("studioPromptCount").textContent = `${by("studioPrompt").value.length} / 2000`; });
by("studioRenderStyle").addEventListener("change", () => {
  if (generating || uploadPending || !RENDER_STYLES.has(by("studioRenderStyle").value)) return;
  renderStyle = by("studioRenderStyle").value;
});

// --- 仅START提交一次；异常只按原jobId查询，不自动重发收费请求 ---
function stopPoll() { clearTimeout(pollTimer); pollTimer = null; }
function pausePolling(error) {
  if (job?.status === "success" && result) {
    stopPoll(); syncReadError = error.message; renderSync(); return;
  }
  stopPoll(); generating = true; resume.hidden = false;
  const text = `任务状态暂未确认：${error.message}。点击“检查现有任务”继续查询，不会重新提交。`;
  showError("studioRequestError", text); by("studioJobMessage").textContent = text; render();
}
async function queryJob() {
  if (!savedJobId || queryingId === savedJobId) return;
  const queriedId = savedJobId; queryingId = queriedId;
  try {
    const response = await api(`${API_ROOT}/jobs/${encodeURIComponent(queriedId)}`);
    if (queriedId !== savedJobId) return;
    applyJob(response.job || response);
  } catch (error) {
    if (queriedId !== savedJobId) return;
    if (error.message === "AI渲染台任务不存在或已过期") {
      stopPoll(); generating = false; resume.hidden = true; saveJobId(null);
      if (job?.status === "success" && result) { syncReadError = "任务已过期，无法继续查询飞书同步状态"; renderSync(); render(); return; }
      by("studioJobTitle").textContent = "任务未找到或已过期";
      by("studioJobMessage").textContent = "未恢复到现有任务。请检查设置后手动发起新任务。";
      by("studioJobState").classList.add("failed");
      showError("studioRequestError", "任务不存在或已过期，已解除等待；不会自动重新生成。"); render();
    } else pausePolling(error);
  } finally { if (queryingId === queriedId) queryingId = null; }
}
function applyJob(next) {
  if (!next?.jobId || next.jobId !== savedJobId) throw new Error("任务状态响应不完整，请按原任务继续查询");
  job = next; generating = !terminal.has(next.status); resume.hidden = true; showError("studioRequestError");
  by("studioJobMessage").textContent = next.message || "正在生成，请稍候。";
  if (next.status === "success") {
    const previousResultUrl = result?.images?.[0]?.url;
    result = next.result;
    if (!result?.images?.[0]?.url) {
      showResultError("任务已结束，但未取得可展示的图片。请保留任务页面检查服务日志。");
    } else if (previousResultUrl !== result.images[0].url) { displayResult(result); setTab("result"); }
    stopPoll();
    syncReadError = ""; renderSync();
    if (result?.sync?.status === "pending") pollTimer = setTimeout(queryJob, 1800);
  } else if (next.status === "failed" || next.status === "error") {
    stopPoll(); by("studioJobTitle").textContent = "本次渲染未完成";
    by("studioJobMessage").textContent = next.error || next.message || "请检查设置后手动发起新任务。";
    showError("studioRequestError", next.error || "本次渲染失败；不会自动重新生成。");
    by("studioJobState").classList.add("failed");
  } else { stopPoll(); pollTimer = setTimeout(queryJob, 1800); }
  render();
}
generate.addEventListener("click", async () => {
  if (generating || uploadPending || !source) return;
  const issue = relight.validate(); if (issue) { showError("studioRequestError", issue.message); return; }
  const lightingIssue = lighting.validation(); if (lightingIssue) { showError("studioRequestError", lightingIssue); return; }
  const identity = config?.prompt;
  if (!identity?.available || identity.code !== "ai-render-studio" || !identity.version || !identity.sha256) { showError("studioRequestError", "渲染配置未完整加载，请先刷新光线设置。"); return; }
  const jobId = `studio-${crypto.randomUUID()}`;
  const submitted = { ...relight.value(), templateKey: "custom", lightingPreset: lightingPreset(), referenceImages: [{ name: source.name, type: source.type, size: source.size, dataUrl: source.dataUrl }],
    modelKey: RELIGHT_MODEL_KEY, materialMode: "faithful", renderStyle, prompt: by("studioPrompt").value.trim(), studioPromptVersion: identity.version, studioPromptSha256: identity.sha256 };
  comparisonSource = source.dataUrl; result = null;
  job = { jobId, status: "running", message: "正在准备光源方案与材质表现…" };
  generating = true; saveJobId(jobId); clearResult(); showError("studioRequestError"); resume.hidden = true;
  by("studioJobTitle").textContent = "正在渲染光线与质感"; by("studioJobMessage").textContent = job.message;
  by("studioJobState").classList.remove("failed"); render(); setTab("result");
  try {
    const response = await api(`${API_ROOT}/jobs`, { method: "POST", body: JSON.stringify({ jobId, input: submitted }) });
    applyJob(response.job || response);
  } catch (error) { pausePolling(error); await queryJob(); }
});
resume.addEventListener("click", () => { if (!savedJobId) return; resume.hidden = true; void queryJob(); });

// --- 只展示真实结果，原图对比使用该次任务冻结的源图 ---
function clearResult() {
  by("studioEmptyState").hidden = Boolean(job); by("studioJobState").hidden = !job;
  by("studioResultFrame").hidden = true; by("studioResultActions").hidden = true;
  by("studioResultImage").removeAttribute("src"); by("studioCompareOriginal").removeAttribute("src");
  syncReadError = ""; syncRetrying = false; by("studioSync").hidden = true;
  by("studioRecordLink").removeAttribute("href");
  by("studioCompareEnabled").checked = false; by("studioCompareRange").value = "50"; updateComparison();
}
function safeResultUrl(value) {
  if (typeof value !== "string") return null;
  if (/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value)) return value;
  try { const url = new URL(value, location.href); return url.origin === location.origin && ["http:", "https:"].includes(url.protocol) ? url.href : null; } catch { return null; }
}
function showResultError(message) {
  generating = false; by("studioJobTitle").textContent = "未取得可展示的结果";
  by("studioJobMessage").textContent = message; by("studioJobState").classList.add("failed");
  by("studioEmptyState").hidden = true; by("studioJobState").hidden = false; by("studioResultFrame").hidden = true; by("studioResultActions").hidden = true;
  by("studioCompareRange").hidden = true;
  showError("studioRequestError", message);
}
function displayResult(value) {
  const url = safeResultUrl(value.images?.[0]?.url);
  if (!url) { showResultError("结果图片地址无效，已阻止展示与下载。"); return; }
  by("studioResultImage").src = url; by("studioEmptyState").hidden = true; by("studioResultFrame").hidden = false; by("studioJobState").hidden = true; by("studioResultActions").hidden = false;
  const size = value.request?.size?.replace("x", " × ") || "原生PNG";
  const styleKey = value.request?.renderStyle || value.upstream?.metadata?.renderStyle;
  const style = config?.renderStyles?.find(item => item.key === styleKey)?.label || "写实摄影";
  const preset = value.request?.lightingPreset;
  const lightingName = preset?.name || (Object.hasOwn(value.request || {}, "lightingPreset") ? "原光影" : "");
  by("studioResultMeta").textContent = `${lightingName ? `${lightingName} · ` : ""}${style} · ${size}${Number.isFinite(value.durationMs) ? ` · ${(value.durationMs / 1000).toFixed(1)} 秒` : ""}`;
  by("studioCompareEnabled").disabled = !comparisonSource;
  by("studioCompareEnabled").parentElement.title = comparisonSource ? "" : "刷新后的任务没有原图副本，暂不提供对比";
  if (comparisonSource) by("studioCompareOriginal").src = comparisonSource;
  updateComparison();
}

// --- 归档状态跟随同一job查询；失败只重试现有图片同步 ---
function safeRecordUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && /(^|\.)(feishu\.cn|larksuite\.com)$/.test(url.hostname) ? url.href : null;
  } catch { return null; }
}
function renderSync() {
  const sync = result?.sync, container = by("studioSync"), retry = by("studioRetrySync");
  if (!result) { container.hidden = true; return; }
  container.hidden = false; container.dataset.status = syncReadError ? "unknown" : sync?.status || "unknown";
  const messages = { pending: "图片已生成，正在同步飞书…", success: "图片已生成，飞书同步成功", failed: `图片已生成，飞书同步失败${sync?.error ? `：${sync.error}` : ""}` };
  by("studioSyncStatus").textContent = syncRetrying ? "正在重新同步已有图片，不会重新生成…" : syncReadError ? `图片已生成，飞书同步状态暂未确认：${syncReadError}` : messages[sync?.status] || "图片已生成，未取得飞书同步状态";
  const href = safeRecordUrl(sync?.recordUrl), link = by("studioRecordLink");
  link.hidden = !href; if (href) link.href = href; else link.removeAttribute("href");
  retry.hidden = !savedJobId || !syncReadError && sync?.status !== "failed";
  retry.disabled = syncRetrying;
  retry.textContent = syncRetrying ? "同步中" : syncReadError ? "检查飞书同步" : "仅重试飞书同步";
}
by("studioRetrySync").addEventListener("click", async () => {
  if (!savedJobId || syncRetrying) return;
  if (syncReadError) { by("studioRetrySync").disabled = true; await queryJob(); return; }
  if (result?.sync?.status !== "failed") return;
  const retryJobId = savedJobId; syncRetrying = true; renderSync();
  try {
    const response = await api(`${API_ROOT}/jobs/${encodeURIComponent(retryJobId)}/sync-retry`, { method: "POST", body: "{}" });
    if (retryJobId !== savedJobId) return;
    applyJob(response.job || response);
  } catch (error) {
    if (retryJobId !== savedJobId) return;
    syncReadError = error.message;
  } finally { if (retryJobId === savedJobId) { syncRetrying = false; renderSync(); } }
});
function updateComparison() {
  const active = Boolean(by("studioCompareEnabled")?.checked && comparisonSource);
  for (const id of ["studioCompareOverlay", "studioCompareLine", "studioRenderedLabel", "studioCompareRange"]) by(id).hidden = !active;
  const value = Number(by("studioCompareRange").value);
  by("studioCompareOverlay").style.clipPath = `inset(0 ${100 - value}% 0 0)`;
  by("studioResultFrame").style.setProperty("--compare-position", `${value}%`);
}
by("studioCompareEnabled").addEventListener("change", updateComparison);
by("studioCompareRange").addEventListener("input", updateComparison);
by("studioResultImage").addEventListener("error", () => { if (result) { showResultError("结果图片读取失败；本次任务不会自动重新生成。"); render(); } });
by("studioDownload").addEventListener("click", () => {
  const url = safeResultUrl(result?.images?.[0]?.url); if (!url) return;
  const link = document.createElement("a"); link.href = url; link.download = `AI渲染台-${new Date().toISOString().replace(/[:.]/g, "-")}.png`; document.body.append(link); link.click(); link.remove();
});
window.addEventListener("pagehide", stopPoll);
function resumeFollowingJob() {
  const pending = generating || job?.status === "success" && result?.sync?.status === "pending";
  if (!document.hidden && pending && savedJobId && !pollTimer && resume.hidden && !syncReadError) void queryJob();
}
window.addEventListener("pageshow", resumeFollowingJob);
document.addEventListener("visibilitychange", resumeFollowingJob);

await loadConfig();
savedJobId = readJobId();
if (savedJobId && /^[A-Za-z0-9_-]{8,128}$/.test(savedJobId)) {
  generating = true; job = { jobId: savedJobId, status: "running", message: "正在恢复现有任务状态…" }; clearResult(); render(); setTab("result"); void queryJob();
} else saveJobId(null);
render();

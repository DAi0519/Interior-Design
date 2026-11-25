/**
 * [INPUT]: 依赖共享下拉、人物宠物特征/位置动作目录、角色参考图上传、生图反馈、同源结果与异步任务 API
 * [OUTPUT]: 提供共享参数栏挂载、角色表单与双参考图、单图槽计数、真实生成状态、同ID恢复及新图揭示和画布内结果操作
 * [POS]: public 的人物宠物合成控制器；原渲染参数、配角参考及草稿保留在独立工作区
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { api, fillSelect, formatBytes, readFileAsInput } from "./workbench-utils.js";
import { readImageDimensions } from "./image-ratio.js";
import { prepareBrowserImageDownload } from "./generation-results.js";
import { SCENE_CAST_IMPORT } from "./scene-cast-handoff.js";
import { mountWorkspaceControls } from "./ai-render-studio-host.js?v=4";
import { CAST_PRESETS, actionChoices, breedChoices } from "./scene-cast-presets.js";
import { cancelGenerationReveal, revealGenerationImage } from "./generation-feedback.js?v=3";

const nodes = new Map([...document.querySelectorAll("[id]")].map(node => [node.id, node]));
const by = id => nodes.get(id);
const settingsPanel = document.querySelector(".scene-cast-settings");
const actionPanel = document.querySelector(".scene-cast-actions");
const generationActions = actionPanel.querySelector(".generation-actions");

const sidebar = settingsPanel.closest("aside");
if (mountWorkspaceControls("sceneCast", settingsPanel, actionPanel)) {
  sidebar.remove();
  document.body.classList.add("scene-cast-integrated");
} else {
  void import("./custom-select.js?v=10");
}

const API = "/api/scene-cast";
const SESSION = "canvas-lab:scene-cast:job:v1";
const MAX_CAST = 4;
const CUSTOM = "__custom__";
const UPLOAD_PREFIXES = { source: "castSource", person: "castPersonRef", pet: "castPetRef" };
const REFERENCE_LABELS = { person: "人物", pet: "宠物" };
const DEFAULT_POLICY = { accept: ["image/png", "image/jpeg", "image/webp"], maxBytesPerImage: 8 * 1024 * 1024,
  maxTotalBytes: 20 * 1024 * 1024, maxDimension: 4096, maxPixels: 16 * 1024 * 1024 };
const QUALITY_LABELS = { low: "低", medium: "中", high: "高", xhigh: "极高", max: "最高" };
const SOURCE_LABELS = {
  featureLabel: "原功能", model: "原渲染模型", modelKey: "渲染模型标识", size: "原渲染尺寸", width: "宽度（px）",
  height: "高度（px）", resolution: "分辨率", quality: "质量", renderStyle: "渲染风格", materialMode: "材质策略",
  lightingPreset: "光影", sourcePrompt: "原始补充要求", actualPrompt: "实际送模提示词", promptVersion: "提示词版本",
  promptSha256: "提示词指纹", parameters: "其他渲染参数", workflow: "工作流", jobId: "原任务 ID",
  requestId: "原请求 ID", outputSha256: "原图指纹", origin: "结果来源",
};
const RESULT_LABELS = {
  model: "合成模型", size: "输出尺寸", ratio: "画幅", resolution: "分辨率", quality: "质量",
  cast: "模特参数", referenceRoles: "参考图用途", referenceFiles: "参考图文件", position: "位置", action: "动作与补充要求",
  actualPrompt: "实际送模提示词", jobId: "合成任务 ID", outputSha256: "合成图指纹",
};
const state = {
  config: null, source: null, person: null, pet: null, sourceRender: null, result: null,
  comparing: false, jobId: null, revealJobId: null, running: false, checking: false, waitingForCheck: false, configLoading: false,
  pending: new Set(), sequence: { source: 0, person: 0, pet: 0 }, pollTimer: null, pendingImport: null,
};
const policy = () => ({ ...DEFAULT_POLICY, ...state.config?.imagePolicy });
const selectedModel = () => state.config?.models?.find(model => model.key === by("castModel").value);

function alertAt(id, message = "") {
  by(id).textContent = message;
  by(id).hidden = !message;
}

function textParam(value) {
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value ?? "");
}

function parameterRows(target, labels, values) {
  const rows = Object.entries(labels).flatMap(([key, label]) => {
    const value = values?.[key];
    if (value === undefined || value === null || value === "") return [];
    const doc = target.ownerDocument;
    const row = doc.createElement("div"), title = doc.createElement("dt"), detail = doc.createElement("dd");
    title.textContent = label;
    const display = key === "quality" ? QUALITY_LABELS[value] || value
      : key === "lightingPreset" && typeof value === "object" ? [value.name || value.presetName, JSON.stringify(value, null, 2)].filter(Boolean).join("\n")
      : value;
    detail.textContent = textParam(display);
    row.append(title, detail);
    return [row];
  });
  target.replaceChildren(...rows);
}

function remember(jobId) {
  state.jobId = jobId;
  if (!jobId) state.revealJobId = null;
  try {
    if (jobId) sessionStorage.setItem(SESSION, jobId);
    else sessionStorage.removeItem(SESSION);
  } catch { /* 私密窗口仍可在当前页面跟随任务。 */ }
}

function updateUpload(kind) {
  const prefix = UPLOAD_PREFIXES[kind];
  const image = state[kind], thumb = by(`${prefix}Thumb`), button = by(`${prefix}Upload`);
  thumb.hidden = !image;
  if (image) thumb.src = image.dataUrl;
  else thumb.removeAttribute("src");
  button.querySelector("svg").toggleAttribute("hidden", Boolean(image));
  const label = kind === "source" ? "场景图" : `${REFERENCE_LABELS[kind]}参考图`;
  button.querySelector(".reference-upload-label").textContent = image?.name || `添加或拖入${label}`;
  by(`${prefix}Count`).textContent = image ? "1 / 1" : "0 / 1";
  button.title = image ? `${image.name} · 点击或拖入新图替换` : "";
  if (kind === "source") {
    by("castSourceDetails").hidden = !state.sourceRender;
    by("castSourceDetails").open = false;
    parameterRows(by("castSourceParams"), SOURCE_LABELS, state.sourceRender);
  } else {
    by(`${prefix}Remove`).hidden = !image;
  }
}

const imageCaption = image => `${image.width} × ${image.height} · ${formatBytes(image.size)} · 拖入新图可直接替换`;
const uploadLimitCaption = () => `PNG / JPEG / WebP · 单张 ${policy().maxBytesPerImage / 1024 / 1024}MB`;

function imageInputIssue(file) {
  const rules = policy();
  if (!rules.accept.includes(file.type)) return "请选择 PNG、JPEG 或 WebP 图片。";
  if (file.size > rules.maxBytesPerImage) return `图片大于 ${formatBytes(rules.maxBytesPerImage)}，请缩小文件后再试。`;
  return null;
}

async function acceptImage(kind, readFile, sourceRender = null) {
  if (state.running) {
    alertAt("castJobError", "合成任务进行中，请在当前任务结束后更换场景图。");
    return;
  }
  const seq = ++state.sequence[kind], errorId = `${UPLOAD_PREFIXES[kind]}Error`;
  state.pending.add(kind); alertAt(errorId); render();
  try {
    const file = await readFile();
    const issue = imageInputIssue(file);
    if (issue) throw new Error(issue);
    const input = await readFileAsInput(file);
    const size = await readImageDimensions(input.dataUrl, input.name);
    const rules = policy();
    if (!size.width || !size.height || Math.max(size.width, size.height) > rules.maxDimension || size.width * size.height > rules.maxPixels) {
      throw new Error(`图片超出单边 ${rules.maxDimension}px 或 ${(rules.maxPixels / 1_000_000).toFixed(1)} 百万像素限制。`);
    }
    if (seq !== state.sequence[kind]) return;
    state[kind] = { ...input, ...size };
    if (kind === "source") {
      state.sourceRender = sourceRender ? { ...sourceRender, width: size.width, height: size.height } : null;
      state.result = null;
      state.comparing = false;
      remember(null);
      alertAt("castJobError");
    }
    updateUpload(kind);
    renderPreview();
  } catch (error) {
    if (seq === state.sequence[kind]) alertAt(errorId, error.message || "无法读取图片。");
  } finally {
    if (seq === state.sequence[kind]) { state.pending.delete(kind); render(); }
  }
}

function bindUpload(kind) {
  const prefix = UPLOAD_PREFIXES[kind];
  const input = by(`${prefix}File`), button = by(`${prefix}Upload`);
  button.addEventListener("click", () => input.click());
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    input.value = "";
    if (file) void acceptImage(kind, () => file);
  });
  for (const eventName of ["dragenter", "dragover"]) button.addEventListener(eventName, event => {
    event.preventDefault();
    if (!state.running) button.classList.add("dragging");
  });
  button.addEventListener("dragleave", () => button.classList.remove("dragging"));
  button.addEventListener("drop", event => {
    event.preventDefault();
    button.classList.remove("dragging");
    const file = event.dataTransfer?.files?.[0];
    if (file) void acceptImage(kind, () => file);
  });
  by(`${prefix}Remove`)?.addEventListener("click", () => {
    if (state.running) return;
    state.sequence[kind] += 1; state.pending.delete(kind);
    state[kind] = null; alertAt(`${prefix}Error`); updateUpload(kind); render();
  });
}

async function renderedFile(payload) {
  const outputFormat = payload.outputFormat === "jpg" ? "jpeg" : payload.outputFormat;
  const { objectUrl, fileName } = await prepareBrowserImageDownload({ imageUrl: payload.imageUrl, modelLabel: payload.modelLabel, outputFormat });
  try {
    const blob = await fetch(objectUrl).then(response => response.blob());
    return new File([blob], fileName, { type: blob.type.split(";")[0] });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function importScene() {
  if (state.running || !state.pendingImport) return;
  const payload = state.pendingImport;
  state.pendingImport = null;
  void acceptImage("source", () => renderedFile(payload), payload.sourceRender);
}

function castCounts() {
  return [Number(by("castPeopleCount").value), Number(by("castPetCount").value)];
}

function activeReferences() {
  const [people, pets] = castCounts();
  return Object.fromEntries([["person", people], ["pet", pets]].filter(([role, count]) => count && state[role])
    .map(([role]) => [role, state[role]]));
}

function uploadCapacityIssue() {
  const references = activeReferences(), roles = Object.keys(references);
  if (state.config && roles.some(role => !state.config.referenceRoles?.includes(role))) {
    return "当前服务未更新到人物、宠物独立参考图，请重启工作台后刷新配置。";
  }
  const total = [state.source, ...Object.values(references)].reduce((bytes, image) => bytes + (image?.size || 0), 0);
  const maxTotal = policy().maxTotalBytes;
  return total > maxTotal ? `场景图与在用参考图共 ${formatBytes(total)}，请将总大小缩至 ${formatBytes(maxTotal)} 以内。` : "";
}

const customInput = select => select.closest(".scene-cast-choice")?.querySelector("[data-custom]");
const presetValue = select => select.value === CUSTOM ? customInput(select)?.value.trim() || "" : select.value;

function showCustom(select) {
  const input = customInput(select);
  if (input) input.hidden = select.value !== CUSTOM;
}

function populatePreset(select, values) {
  const custom = customInput(select);
  const options = [{ value: "", label: "自动" }, ...values.map(value => ({ value, label: value }))];
  if (custom) options.push({ value: CUSTOM, label: "自定义" });
  const selected = options.some(option => option.value === select.value) ? select.value : "";
  fillSelect(select, options, selected);
  if (custom?.tagName === "TEXTAREA" && Number.isInteger(state.config?.maxDescriptionLength)) {
    custom.maxLength = state.config.maxDescriptionLength;
  }
  showCustom(select);
}

function updateBreeds(entry) {
  const species = entry.querySelector('select[data-preset="species"]');
  if (species) populatePreset(entry.querySelector('select[data-preset="breed"]'),
    species.value === CUSTOM ? [] : breedChoices(species.value));
}

function updateVisibility() {
  const [people, pets] = castCounts();
  for (const [role, count, assignment] of [["source", 1, ""], ["person", people, "第 1 位人物"], ["pet", pets, "第 1 只宠物"]]) {
    const prefix = UPLOAD_PREFIXES[role], image = state[role];
    const caption = by(`${prefix}Upload`).querySelector("small");
    const slot = by(`${prefix}Slot`);
    if (slot) slot.hidden = !count;
    const details = image ? imageCaption(image) : uploadLimitCaption();
    caption.textContent = count > 1 ? `${details} · 用于${assignment}` : details;
  }
  by("castInteractionField").hidden = people + pets < 1;
  by("castInteraction").disabled = by("castInteractionField").hidden || state.running;
}

function updateCharacters() {
  const [people, pets] = castCounts();
  const groups = [
    { container: "castPeople", template: "castPersonTemplate", count: people, label: index => `人物 ${index}` },
    { container: "castPets", template: "castPetTemplate", count: pets, label: index => `宠物 ${index}` },
  ];
  for (const { container, template, count, label } of groups) {
    const root = by(container);
    while (root.children.length > count) root.lastElementChild.remove();
    while (root.children.length < count) {
      const addition = by(template).content.firstElementChild.cloneNode(true);
      addition.querySelector("legend").textContent = label(root.children.length + 1);
      for (const select of addition.querySelectorAll("select[data-preset]")) {
        if (select.dataset.preset !== "breed") populatePreset(select, CAST_PRESETS[select.dataset.preset]);
      }
      updateBreeds(addition);
      root.append(addition);
    }
  }
  for (const option of by("castPeopleCount").options) option.disabled = Number(option.value) + pets > MAX_CAST;
  for (const option of by("castPetCount").options) option.disabled = Number(option.value) + people > MAX_CAST;
  populatePreset(by("castAction"), actionChoices({ people, pets }));
  render();
}

function currentCast() {
  const traits = id => Array.from(by(id).children, entry => Object.fromEntries(
    Array.from(entry.querySelectorAll("select[data-trait]"), control => [control.dataset.trait, presetValue(control)]).filter(([, value]) => value),
  ));
  return { people: traits("castPeople"), pets: traits("castPets"), interaction: by("castInteraction").value };
}

function replaceOptions(id, choices, defaultValue) {
  const element = by(id);
  const current = element.value;
  fillSelect(element, choices, choices.some(option => option.value === current) ? current : defaultValue);
}

function applyModel() {
  const model = selectedModel();
  const values = (options, labels = {}) => (options || []).map(value => ({ value, label: labels[value] || value }));
  const resolutions = model?.outputResolutions?.length ? model.outputResolutions : [];
  replaceOptions("castResolution", values(resolutions), resolutions.includes("2K") ? "2K" : model?.defaultOutputResolution);
  replaceOptions("castQuality", values(model?.qualityOptions, QUALITY_LABELS), model?.defaultQuality);
  applyRatios();
}

function applyRatios() {
  const model = selectedModel(), resolution = by("castResolution").value;
  const ratios = Object.keys(model?.sizes || {}).filter(ratio => model.sizes[ratio]?.[resolution]);
  replaceOptions("castRatio", [{ value: "auto", label: "自动（按场景图）" }, ...ratios.map(value => ({ label: value, value }))], "auto");
  render();
}

async function loadConfig() {
  if (state.configLoading) return;
  state.configLoading = true; alertAt("castConfigError"); render();
  try {
    const config = await api(`${API}/config`);
    state.config = config;
    const previous = by("castModel").value, defaultModel = config.models?.find(model => model.key === config.defaultModelKey && model.available);
    const options = (config.models || []).map(model => ({ value: model.key, label: model.available ? model.label : `${model.label} · 无权限` }));
    fillSelect(by("castModel"), options, config.models?.some(model => model.key === previous && model.available) ? previous : defaultModel?.key || config.models?.find(model => model.available)?.key);
    for (const option of by("castModel").options) option.disabled = config.models.find(model => model.key === option.value)?.available !== true;
    applyModel();
    if (!config.available) alertAt("castConfigError", config.reason || "当前没有可用的合成模型，请检查模型连接。");
    if (Number.isInteger(config.maxDescriptionLength)) {
      for (const field of settingsPanel.querySelectorAll("textarea[data-custom]")) field.maxLength = config.maxDescriptionLength;
    }
  } catch {
    state.config = null;
    alertAt("castConfigError", "合成配置读取失败，请检查工作台连接后刷新配置。");
  } finally {
    state.configLoading = false; render();
  }
}

function imageUrl(value) {
  if (typeof value !== "string") return null;
  if (/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value)) return value;
  try {
    const url = new URL(value, window.location.href);
    return url.origin === window.location.origin && ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

function renderPreview(shouldReveal = false) {
  const result = state.result, output = imageUrl(result?.images?.[0]?.url), preview = by("castPreview");
  const showOutput = output && !state.comparing;
  const url = showOutput ? output : state.source?.dataUrl || null;
  preview.hidden = !url || state.running;
  if (preview.getAttribute("src") !== url) {
    cancelGenerationReveal(preview);
    if (url) preview.src = url;
    else preview.removeAttribute("src");
  }
  if (showOutput && shouldReveal) revealGenerationImage(preview);
  preview.alt = showOutput ? "添加人物或宠物后的合成图" : "上传或选中的场景图";
  by("castStageActions").hidden = !output;
  by("castEmpty").hidden = Boolean(url) || state.running;
  by("castCompare").hidden = !(output && state.source);
  by("castCompare").setAttribute("aria-pressed", String(state.comparing));
  by("castCompare").textContent = state.comparing ? "查看合成图" : "查看原图";
  by("castDownload").hidden = !output;
  by("castResultMeta").hidden = !output;
  if (output) {
    const request = result.request || {}, metadata = result.upstream?.metadata || {};
    const model = state.config?.models?.find(entry => entry.key === request.modelKey);
    const modelLabel = model?.label || request.model;
    by("castResultSummary").textContent = [modelLabel, request.size?.replace("x", " × "), Number.isFinite(result.durationMs) ? `${(result.durationMs / 1000).toFixed(1)} 秒` : null].filter(Boolean).join(" · ");
    const roles = request.referenceSubjects || (request.referenceSubject ? [request.referenceSubject] : []);
    const referenceRoles = roles.map(role => REFERENCE_LABELS[role]).filter(Boolean).join("、");
    const referenceFiles = metadata.referenceImages?.map(ref => [
      REFERENCE_LABELS[ref.role], ref.fileName, ref.width && ref.height ? `${ref.width} × ${ref.height}` : null,
    ].filter(Boolean).join(" · ")).join("\n");
    parameterRows(by("castResultParams"), RESULT_LABELS, { ...request, model: modelLabel, referenceRoles, referenceFiles,
      actualPrompt: metadata.prompt, jobId: state.jobId, outputSha256: metadata.outputSha256 });
  }
}

function render() {
  const busy = state.running, loading = state.configLoading, model = selectedModel();
  for (const prefix of Object.values(UPLOAD_PREFIXES)) {
    by(`${prefix}Upload`).disabled = busy;
    const remove = by(`${prefix}Remove`);
    if (remove) remove.disabled = busy;
  }
  for (const id of ["castPeopleCount", "castPetCount"]) by(id).disabled = busy;
  for (const field of settingsPanel.querySelectorAll("select[data-preset], [data-custom]")) field.disabled = busy;
  by("castModel").disabled = busy || loading || !state.config?.models?.some(entry => entry.available);
  for (const id of ["castRatio", "castResolution", "castQuality"]) by(id).disabled = busy || loading || !model?.available;
  by("castRefresh").disabled = busy || loading;
  const enabled = Boolean(state.config?.available && model?.available && state.source && castCounts().some(Boolean) && by("castResolution").value && by("castQuality").value);
  const capacityIssue = uploadCapacityIssue();
  alertAt("castCapacityError", capacityIssue);
  const generateButton = by("castGenerate");
  generateButton.disabled = !enabled || Boolean(capacityIssue) || state.pending.size > 0 || busy || loading;
  generationActions.classList.toggle("is-busy", busy);
  generateButton.setAttribute("aria-busy", String(busy));
  generateButton.setAttribute("aria-label", busy ? "生成中" : "开始生成合成图");
  by("castGenerateLabel").textContent = busy ? "RUNNING…" : "START";
  by("castResume").hidden = !state.waitingForCheck;
  by("castResume").disabled = state.checking;
  by("castProgress").hidden = !busy;
  const showProgress = busy && !state.waitingForCheck;
  by("castProgressText").classList.toggle("generation-feedback-text", showProgress);
  by("castProgressPlaceholder").hidden = !showProgress;
  const preview = by("castPreview");
  preview.hidden = busy || !preview.getAttribute("src");
  by("castEmpty").hidden = Boolean(state.source || state.result || busy);
  updateVisibility();
}

function acceptJob(job) {
  if (!job || job.jobId !== state.jobId || !["running", "success", "failed"].includes(job.status)) throw new Error("任务状态返回不完整。");
  clearTimeout(state.pollTimer);
  state.waitingForCheck = false; state.running = job.status === "running";
  const shouldReveal = job.jobId === state.revealJobId;
  if (!state.running && shouldReveal) state.revealJobId = null;
  const message = job.message || "正在合成…";
  const progressText = by("castProgressText");
  if (progressText.textContent !== message) progressText.textContent = message;
  alertAt("castJobError");
  if (state.running) state.pollTimer = setTimeout(checkJob, 1200);
  else if (job.status === "success") {
    if (!imageUrl(job.result?.images?.[0]?.url)) {
      alertAt("castJobError", "任务已完成，但未取得可展示的合成图。");
    } else {
      state.result = job.result;
      state.comparing = false;
      if (!state.source) {
        state.sourceRender = job.result.request?.sourceRender || null;
        updateUpload("source");
      }
      renderPreview(shouldReveal);
    }
  } else {
    alertAt("castJobError", job.error || "合成未完成。");
  }
  render();
}

async function checkJob() {
  if (!state.jobId || state.checking) return;
  const jobId = state.jobId;
  state.checking = true; render();
  try {
    const { job } = await api(`${API}/jobs/${encodeURIComponent(jobId)}`);
    if (jobId === state.jobId) acceptJob(job);
  } catch (error) {
    if (jobId !== state.jobId) return;
    clearTimeout(state.pollTimer);
    if (error.statusCode === 404) {
      state.running = false; state.waitingForCheck = false; remember(null);
      alertAt("castJobError", "任务不存在或已过期，请检查设置后重新发起。");
    } else {
      state.waitingForCheck = true;
      const message = `暂时无法确认任务状态。${error.message}`;
      by("castProgressText").textContent = message;
      alertAt("castJobError", message);
    }
  } finally { state.checking = false; render(); importScene(); }
}

const descriptor = image => ({ name: image.name, dataUrl: image.dataUrl });

async function generate() {
  if (by("castGenerate").disabled) return;
  const cast = currentCast(), jobId = `scene-cast-${crypto.randomUUID()}`;
  const referenceImages = Object.fromEntries(Object.entries(activeReferences()).map(([role, image]) => [role, descriptor(image)]));
  const body = {
    jobId, sourceImage: descriptor(state.source), cast,
    position: presetValue(by("castPosition")), action: presetValue(by("castAction")),
    modelKey: by("castModel").value, resolution: by("castResolution").value, quality: by("castQuality").value, ratio: by("castRatio").value,
    ...(Object.keys(referenceImages).length ? { referenceImages } : {}),
    ...(state.sourceRender ? { sourceRender: state.sourceRender } : {}),
  };
  remember(jobId); state.revealJobId = jobId; state.running = true; state.result = null; state.comparing = false;
  alertAt("castJobError"); renderPreview(); by("castProgressText").textContent = "正在提交合成任务…"; render();
  try {
    const { job } = await api(`${API}/jobs`, { method: "POST", body: JSON.stringify(body) });
    acceptJob(job);
  } catch (error) {
    if (error.statusCode >= 400 && error.statusCode < 500) {
      state.running = false; state.waitingForCheck = false; remember(null);
      alertAt("castJobError", error.message); render();
    } else {
      by("castProgressText").textContent = "正在检查已提交的任务…";
      await checkJob();
    }
  } finally { importScene(); }
}

for (const kind of Object.keys(UPLOAD_PREFIXES)) {
  bindUpload(kind);
  updateUpload(kind);
}
settingsPanel.addEventListener("change", event => {
  const select = event.target;
  if (!select.matches?.("select[data-preset]")) return;
  showCustom(select);
  if (select.dataset.preset === "species") updateBreeds(select.closest("fieldset"));
});
for (const id of ["castPeopleCount", "castPetCount"]) by(id).addEventListener("change", updateCharacters);
by("castRefresh").addEventListener("click", () => void loadConfig());
by("castModel").addEventListener("change", applyModel);
by("castResolution").addEventListener("change", applyRatios);
by("castGenerate").addEventListener("click", () => void generate());
by("castResume").addEventListener("click", () => void checkJob());
by("castCompare").addEventListener("click", () => { state.comparing = !state.comparing; renderPreview(); });
by("castDownload").addEventListener("click", () => {
  const url = imageUrl(state.result?.images?.[0]?.url);
  if (!url) return;
  const link = document.createElement("a");
  link.href = url; link.download = `人物宠物合成-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
  document.body.append(link); link.click(); link.remove();
});
window.addEventListener("message", event => {
  if (event.origin !== window.location.origin || event.source !== window.parent || event.data?.type !== SCENE_CAST_IMPORT) return;
  const payload = event.data.payload;
  if (!payload?.imageUrl || !payload.sourceRender) return;
  state.pendingImport = payload;
  if (state.running) alertAt("castSourceError", "当前合成结束后将带入新场景图。");
  importScene();
});

populatePreset(by("castPosition"), CAST_PRESETS.position);
updateCharacters();
renderPreview();
void loadConfig();
try {
  const jobId = sessionStorage.getItem(SESSION);
  if (jobId) { state.jobId = jobId; state.running = true; by("castProgressText").textContent = "正在检查现有任务…"; void checkJob(); }
} catch { /* 当前页面仍可生成与查询。 */ }

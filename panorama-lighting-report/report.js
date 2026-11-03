/**
 * [INPUT]: 依赖evidence.js的PANORAMA_REPORT、同目录球面渲染器和报告DOM
 * [OUTPUT]: 提供事实摘要、统一样本切换、双/四栏同视角与任意双图滑动、50结果矩阵及原件/元数据访问
 * [POS]: 全景光影最终报告只读交互层，原始输入与保留原光影结果分开，不计算评分、不发起生成
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const data = window.PANORAMA_REPORT || {};
  const samples = Array.isArray(data.samples) ? data.samples : [];
  const configurations = Array.isArray(data.configurations) ? data.configurations : [];
  const results = Array.isArray(data.results) ? data.results : [];
  const summary = data.summary || {};
  const configById = new Map(configurations.map(item => [item.id, item]));
  const resultByPair = new Map(results.map(item => [`${item.sampleId}:${item.configurationId}`, item]));
  const state = { sampleId: samples[0]?.id, mode: "two", choices: ["source", ...configurations.slice(0, 3).map(item => item.id)], yaw: 0, pitch: 0, fov: 80, wipe: 0.5 };
  while (state.choices.length < 4) state.choices.push(configurations[0]?.id || "source");
  const letters = ["A", "B", "C", "D"];
  const cache = new Map();
  let renderer = null, loadRevision = 0, lastPointer = null;
  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined && text !== null) element.textContent = String(text);
    return element;
  }
  function appendText(parent, text) { parent.append(document.createTextNode(String(text))); }
  function originalLink(url, label = "原件") {
    const link = node("a", "", label);
    link.href = url; link.target = "_blank"; link.rel = "noopener";
    return link;
  }
  function dimensions(item) { return item?.width && item?.height ? `${item.width} × ${item.height}` : "尺寸未记录"; }
  function timeLabel(value) {
    if (value === undefined || value === null || value === "" || !Number.isFinite(Number(value))) return null;
    const seconds = Number(value), rounded = Math.round(seconds);
    return rounded >= 60 ? `${Math.floor(rounded / 60)}分${String(rounded % 60).padStart(2, "0")}秒` : `${seconds.toFixed(1)}秒`;
  }
  function activeSample() { return samples.find(item => item.id === state.sampleId); }
  function columnCount() { return state.mode === "four" ? 4 : 2; }
  function assetFor(index) {
    const sample = activeSample(), choice = state.choices[index];
    if (!sample) return null;
    if (choice === "source") return { ...sample, url: sample.sourceUrl, label: "原始输入", isSource: true };
    const result = resultByPair.get(`${sample.id}:${choice}`);
    return result ? { ...result, label: `${configById.get(choice)?.name || choice} · 美化结果`, isSource: false } : null;
  }
  function fact(label, value, detail) {
    if (value === undefined || value === null || value === "") return;
    const group = node("div"); group.append(node("dt", "", label), node("dd", "", value));
    if (detail) group.title = detail;
    $("factDetails").append(group);
  }
  function renderFacts() {
    if (data.title) { document.title = data.title; document.querySelector("h1").textContent = data.title; }
    $("reportDate").textContent = [data.date || "日期未记录", data.generatedAt ? `数据截至 ${String(data.generatedAt).replace("T", " ").replace(/\+08:00$/, "")}` : null].filter(Boolean).join(" · ");
    const counts = [
      [summary.sampleCount ?? samples.length, "个原始样本"],
      [configurations.length, "种光影配置"],
      [summary.resultCount ?? results.length, "张结果"],
      [summary.batchCount, "个批次"]
    ].filter(item => item[0] !== undefined);
    counts.forEach(([count, label], index) => {
      if (index) $("factLine").append(node("span", "separator", "/"));
      $("factLine").append(node("strong", "", count)); appendText($("factLine"), ` ${label}`);
    });
    fact("模型", summary.modelLabel);
    fact("Prompt", summary.promptVersion);
    fact("工作流", summary.workflowVersion);
    if (summary.generationCompleted !== undefined) fact("生成完成", `${summary.generationCompleted} / ${summary.resultCount ?? results.length}`);
    if (summary.syncCompleted !== undefined) fact("归档完成", `${summary.syncCompleted} / ${summary.resultCount ?? results.length}`);
    for (const metric of summary.metrics || []) fact(metric.label, metric.value, metric.detail);
    $("reportSummary").textContent = summary.notes?.[0] || "";
    for (const note of (summary.notes || []).slice(1)) $("reportNotes").append(node("li", "", note));
    if (Array.isArray(data.sources) && data.sources.length) {
      $("sourceLine").replaceChildren(document.createTextNode("数据来源："));
      data.sources.forEach((source, index) => {
        if (index) appendText($("sourceLine"), " · ");
        $("sourceLine").append(source.url ? originalLink(source.url, source.label || source.url) : node("span", "", source.label || source.path || "记录"));
      });
    }
  }
  function renderSamples() {
    const navigation = $("sampleNavigation"); navigation.replaceChildren();
    samples.forEach((sample, index) => {
      const button = node("button", "sample-button"); button.type = "button";
      button.setAttribute("aria-pressed", String(sample.id === state.sampleId)); button.dataset.sampleId = sample.id;
      button.setAttribute("aria-label", `选择${sample.name || `样本${index + 1}`}，原始输入${dimensions(sample)}`);
      const image = node("img"); image.src = sample.thumbnailUrl || sample.sourceUrl; image.alt = "";
      const copy = node("span", "sample-copy"); copy.append(node("strong", "", sample.name || `样本${index + 1}`), node("small", "", dimensions(sample)));
      button.append(image, copy);
      button.addEventListener("click", () => selectSample(sample.id)); navigation.append(button);
    });
    const position = Math.max(0, samples.findIndex(item => item.id === state.sampleId)) + 1;
    $("samplePosition").textContent = samples.length ? `${position} / ${samples.length} 个样本` : "暂无样本";
  }
  function selectSample(id) {
    state.sampleId = id; renderSamples(); renderView(); markActiveResult(); loadImages();
  }
  function renderSelectors() {
    const root = $("slotSelectors"); root.replaceChildren(); root.dataset.columns = String(columnCount());
    for (let index = 0; index < columnCount(); index++) {
      const label = node("label"); label.append(node("span", "slot-letter", letters[index]));
      const select = node("select"); select.setAttribute("aria-label", `${letters[index]}栏图片`);
      const sourceOption = node("option", "", "原始输入"); sourceOption.value = "source"; select.append(sourceOption);
      for (const configuration of configurations) {
        const option = node("option", "", `${configuration.name} · 美化结果`); option.value = configuration.id; select.append(option);
      }
      select.value = state.choices[index];
      select.addEventListener("change", () => { state.choices[index] = select.value; renderView(); markActiveResult(); loadImages(); });
      label.append(select); root.append(label);
    }
  }
  function renderMetadata() {
    const root = $("activeMetadata"); root.replaceChildren(); root.dataset.columns = String(columnCount());
    for (let index = 0; index < columnCount(); index++) {
      const asset = assetFor(index), item = node("div", "metadata-item");
      const top = node("div", "metadata-top"); top.append(node("span", "", `${letters[index]} · ${asset?.isSource ? "原始输入" : "美化结果"}`));
      if (asset?.url) top.append(originalLink(asset.url)); item.append(top);
      if (!asset) { item.append(node("p", "", "未找到该配置结果")); root.append(item); continue; }
      item.append(node("p", "", [dimensions(asset), !asset.isSource ? (asset.modelLabel || summary.modelLabel) : null].filter(Boolean).join(" · ")));
      if (!asset.isSource) {
        const duration = timeLabel(asset.durationSeconds ?? (asset.durationMs === undefined ? undefined : asset.durationMs / 1000));
        if (duration) item.append(node("p", "", `服务调用 ${duration}`));
        if (asset.runId) item.append(node("code", "", asset.runId));
      } else if (asset.filename) item.append(node("p", "", asset.filename));
      root.append(item);
    }
  }
  function renderView() {
    const sample = activeSample();
    $("currentSample").textContent = sample ? `${sample.name} · 原始输入 ${dimensions(sample)}` : "尚未提供测试数据";
    $("viewerStage").dataset.columns = String(columnCount());
    $("viewerStage").classList.toggle("is-wipe", state.mode === "wipe");
    $("wipeControl").hidden = state.mode !== "wipe";
    const labels = $("paneLabels"); labels.replaceChildren(); labels.dataset.columns = String(columnCount());
    for (let index = 0; index < columnCount(); index++) {
      const pane = node("div", "pane-label"); pane.append(node("span", "", `${letters[index]} · ${assetFor(index)?.label || "无结果"}`)); labels.append(pane);
    }
    document.querySelectorAll("[data-mode]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.mode === state.mode)));
    renderCamera(); renderMetadata();
  }
  function renderCamera() {
    $("fovRange").value = String(state.fov); $("fovValue").textContent = `${Math.round(state.fov)}°`;
    $("wipeDivider").style.left = `${state.wipe * 100}%`;
    renderer?.setView({ ...state, mode: state.mode === "wipe" ? "wipe" : "columns", columns: columnCount(), pairA: 0, pairB: 1 });
  }
  function showError(message) { $("viewerErrorText").textContent = message; $("viewerError").hidden = false; }
  function imageFor(url) {
    if (cache.has(url)) { const cached = cache.get(url); cache.delete(url); cache.set(url, cached); return cached; }
    const promise = new Promise((resolve, reject) => {
      const image = new Image(); const timeout = setTimeout(() => reject(new Error("图片载入超时")), 60000);
      image.onload = () => { clearTimeout(timeout); resolve(image); };
      image.onerror = () => { clearTimeout(timeout); cache.delete(url); reject(new Error("图片读取失败")); }; image.src = url;
    });
    cache.set(url, promise); while (cache.size > 8) cache.delete(cache.keys().next().value);
    return promise;
  }
  async function loadImages() {
    if (!renderer || renderer.disposed || !activeSample()) return;
    const revision = ++loadRevision; $("viewerError").hidden = true;
    $("viewerMessage").textContent = `正在读取 ${columnCount()} 张原件`; $("viewerMessage").hidden = false;
    const assets = Array.from({ length: columnCount() }, (_, index) => assetFor(index));
    const loaded = await Promise.allSettled(assets.map(asset => asset?.url ? imageFor(asset.url) : Promise.reject(new Error("该配置未找到结果"))));
    if (revision !== loadRevision) return;
    const images = loaded.map(item => item.status === "fulfilled" ? item.value : null); while (images.length < 4) images.push(null);
    renderer.setImages(images); $("viewerMessage").hidden = true;
    const failed = loaded.map((item, index) => item.status === "rejected" ? letters[index] : null).filter(Boolean);
    if (failed.length) {
      $("viewerMessage").textContent = `${failed.join("、")}栏原件暂未载入。`;
      const retry = node("button", "", "重新载入"); retry.type = "button";
      retry.addEventListener("click", () => { cache.clear(); loadImages(); });
      $("viewerMessage").append(retry); $("viewerMessage").hidden = false;
    }
  }
  function recordDetails(result) {
    const details = node("details", "result-record"); details.append(node("summary", "", "记录"));
    const list = node("dl");
    const fields = [
      ["结果编号", result.id], ["模型", result.modelLabel || summary.modelLabel],
      ["尺寸", dimensions(result)], ["服务调用时延", timeLabel(result.durationSeconds ?? (result.durationMs === undefined ? undefined : result.durationMs / 1000))],
      ["工作流执行", timeLabel(result.executionSeconds)],
      ["上游排队估算", timeLabel(result.queueEstimateSeconds)],
      ["测试时间", result.testTime], ["记录创建时间", result.recordCreatedAt], ["记录更新时间", result.recordUpdatedAt],
      ["版本", result.version], ["Attempt", result.attempt], ["费用（USD）", result.costUsd ?? "未记录"],
      ["Seed", result.seed], ["SHA256", result.sha256]
    ];
    fields.forEach(([label, value]) => { if (value !== undefined && value !== null && value !== "") list.append(node("dt", "", label), node("dd", "", value)); });
    details.append(list); return details;
  }
  function renderMatrix() {
    const selected = $("configurationFilter").value;
    const shownConfigs = configurations.filter(item => selected === "all" || selected === item.id);
    const visibleResults = results.filter(item => shownConfigs.some(config => config.id === item.configurationId));
    $("resultCount").textContent = `${visibleResults.length} 张`;
    const table = node("table", "results-matrix"), head = node("thead"), headRow = node("tr");
    const firstHeading = node("th", "", "原始输入 / 光影"); firstHeading.scope = "col"; headRow.append(firstHeading);
    shownConfigs.forEach(config => { const th = node("th", "", config.name); th.scope = "col"; headRow.append(th); }); head.append(headRow); table.append(head);
    const body = node("tbody");
    for (const sample of samples) {
      const row = node("tr"), rowHeading = node("th"); rowHeading.scope = "row";
      const sourceImage = node("img", "row-source"); sourceImage.src = sample.thumbnailUrl || sample.sourceUrl; sourceImage.loading = "lazy"; sourceImage.alt = `${sample.name}原始输入`;
      rowHeading.append(sourceImage, node("span", "row-name", sample.name), node("span", "row-dimensions", dimensions(sample))); row.append(rowHeading);
      for (const config of shownConfigs) {
        const cell = node("td"), result = resultByPair.get(`${sample.id}:${config.id}`);
        if (!result?.url) { cell.append(node("p", "missing-result", "无可用结果")); row.append(cell); continue; }
        const button = node("button", "result-thumbnail"); button.type = "button"; button.dataset.resultId = result.id;
        button.setAttribute("aria-label", `在全景中对比${sample.name}的${config.name}结果`);
        const image = node("img"); image.src = result.thumbnailUrl || result.url; image.loading = "lazy"; image.alt = `${sample.name} · ${config.name}`;
        button.append(image); button.addEventListener("click", () => {
          state.choices[1] = config.id; selectSample(sample.id); renderSelectors();
          document.querySelector(".comparison").scrollIntoView({ block: "start" }); $("panoramaCanvas").focus({ preventScroll: true });
        });
        const actions = node("div", "cell-actions"); actions.append(originalLink(result.url), node("span", "", dimensions(result)));
        cell.append(button, actions, recordDetails(result)); row.append(cell);
      }
      body.append(row);
    }
    table.append(body); $("matrixWrap").replaceChildren(table); $("emptyResults").hidden = visibleResults.length !== 0; markActiveResult();
  }
  function markActiveResult() {
    document.querySelectorAll("[data-result-id]").forEach(button => {
      const result = results.find(item => item.id === button.dataset.resultId);
      const active = result?.sampleId === state.sampleId && state.choices.slice(0, columnCount()).includes(result?.configurationId);
      button.classList.toggle("is-active", active); button.setAttribute("aria-pressed", String(active));
    });
  }
  function setView(yaw, pitch, fov = state.fov) {
    state.yaw = ((yaw + 180) % 360 + 360) % 360 - 180; state.pitch = Math.max(-90, Math.min(90, pitch)); state.fov = Math.max(25, Math.min(110, fov)); renderCamera();
  }
  function bindControls() {
    document.querySelectorAll("[data-mode]").forEach(button => button.addEventListener("click", () => { state.mode = button.dataset.mode; renderSelectors(); renderView(); markActiveResult(); loadImages(); }));
    document.querySelectorAll("[data-yaw]").forEach(button => button.addEventListener("click", () => setView(Number(button.dataset.yaw), Number(button.dataset.pitch))));
    $("resetView").addEventListener("click", () => { state.wipe = 0.5; $("wipeRange").value = "50"; setView(0, 0, 80); });
    $("fovRange").addEventListener("input", event => setView(state.yaw, state.pitch, Number(event.target.value)));
    $("wipeRange").addEventListener("input", event => { state.wipe = Number(event.target.value) / 100; renderCamera(); });
    $("fullscreenButton").addEventListener("click", async () => {
      try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.querySelector(".viewer-shell").requestFullscreen(); }
      catch { $("viewerMessage").textContent = "浏览器暂不支持全屏，可扩大窗口查看。"; $("viewerMessage").hidden = false; }
    });
    document.addEventListener("fullscreenchange", () => { $("fullscreenButton").textContent = document.fullscreenElement ? "退出全屏" : "全屏"; renderer?.resize(); });
    $("retryImages").addEventListener("click", () => { if (!renderer || renderer.disposed) location.reload(); else { cache.clear(); loadImages(); } });
    $("configurationFilter").addEventListener("change", renderMatrix);
    const canvas = $("panoramaCanvas");
    canvas.addEventListener("pointerdown", event => { canvas.setPointerCapture(event.pointerId); lastPointer = { id: event.pointerId, x: event.clientX, y: event.clientY }; canvas.classList.add("dragging"); });
    canvas.addEventListener("pointermove", event => {
      if (!lastPointer || lastPointer.id !== event.pointerId) return;
      const dx = event.clientX - lastPointer.x, dy = event.clientY - lastPointer.y; lastPointer.x = event.clientX; lastPointer.y = event.clientY;
      setView(state.yaw - dx * 0.25, state.pitch + dy * 0.2);
    });
    const endPointer = () => { lastPointer = null; canvas.classList.remove("dragging"); };
    canvas.addEventListener("pointerup", endPointer); canvas.addEventListener("pointercancel", endPointer); canvas.addEventListener("lostpointercapture", endPointer);
    canvas.addEventListener("wheel", event => { event.preventDefault(); setView(state.yaw, state.pitch, state.fov + Math.sign(event.deltaY) * 3); }, { passive: false });
    canvas.addEventListener("keydown", event => {
      const moves = { ArrowLeft: [-5, 0, 0], ArrowRight: [5, 0, 0], ArrowUp: [0, 5, 0], ArrowDown: [0, -5, 0], "+": [0, 0, -5], "=": [0, 0, -5], "-": [0, 0, 5] };
      if (moves[event.key]) { event.preventDefault(); const [yaw, pitch, fov] = moves[event.key]; setView(state.yaw + yaw, state.pitch + pitch, state.fov + fov); }
    });
  }
  renderFacts(); renderSamples(); renderSelectors();
  configurations.forEach(item => { const option = node("option", "", item.name); option.value = item.id; $("configurationFilter").append(option); });
  renderMatrix(); bindControls();
  try {
    renderer = new window.PanoramaRenderer4($("panoramaCanvas"), error => showError(`全景预览不可用：${error.message}。仍可通过下方链接查看原件。`));
    new ResizeObserver(() => renderer?.resize()).observe($("panoramaCanvas"));
  } catch { showError("浏览器未能启用WebGL全景预览。请用新版Chrome或Edge打开；下方原件和记录仍可查看。"); }
  renderView(); loadImages();
  if (!samples.length) { $("viewerMessage").textContent = "测试数据尚未载入，请确认evidence.js与报告位于同一目录。"; $("viewerMessage").hidden = false; }
  window.addEventListener("pagehide", () => { loadRevision++; cache.clear(); renderer?.dispose(); });
})();

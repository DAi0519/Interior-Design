/**
 * [INPUT]: 依赖report-data.js的脱敏BEAUTIFICATION_REPORT与同目录报告DOM/媒体
 * [OUTPUT]: 提供样本/光影筛选、原图加四模型并排对比、真实成图状态与原件查看器
 * [POS]: 效果图美化最终评测的只读交互层，不请求生成、不自动评分、不展示内部执行内容
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
(() => {
  "use strict";
  const data = window.BEAUTIFICATION_REPORT || {};
  const samples = data.samples || [], lighting = data.lighting || [], models = data.models || [], results = data.results || [];
  const $ = id => document.getElementById(id);
  const state = { sampleId: samples[0]?.id || "all", lightingId: "all", viewer: null, viewerIndex: 0, actualSize: false, sourceToggleIndex: null };
  const resultKey = (sampleId, lightingId, modelKey) => JSON.stringify([sampleId, lightingId, modelKey]);
  const resultByKey = new Map(results.map(row => [resultKey(row.sampleId, row.lightingId, row.modelKey), row]));
  const statusNames = { planned: "未提交", queued: "排队中", running: "生成中", generated: "已成图", success: "已成图", failed: "失败", held: "待核查", cancelled: "已取消" };
  const isImage = row => ["success", "generated"].includes(row?.status) && row.imageUrl;
  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined && text !== null) element.textContent = String(text);
    return element;
  }
  const dimensions = row => row?.width && row?.height ? `${row.width} × ${row.height}` : "尺寸未记录";
  const seconds = value => {
    if (!Number.isFinite(value)) return null;
    if (value >= 60) { const rounded = Math.round(value); return `${Math.floor(rounded / 60)}分${rounded % 60}秒`; }
    return `${value.toFixed(1)}秒`;
  };
  function humanDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(date) : String(value);
  }
  function selectedSamples() { return state.sampleId === "all" ? samples : samples.filter(row => row.id === state.sampleId); }
  function selectedLighting() { return state.lightingId === "all" ? lighting : lighting.filter(row => row.id === state.lightingId); }
  function visibleResults() {
    const sampleIds = new Set(selectedSamples().map(row => row.id)), lightingIds = new Set(selectedLighting().map(row => row.id));
    return results.filter(row => sampleIds.has(row.sampleId) && lightingIds.has(row.lightingId));
  }
  function renderHeader() {
    const counts = data.summary?.counts || {}, planned = counts.planned || samples.length * lighting.length * models.length;
    document.title = data.title || document.title;
    $("reportState").textContent = data.summary?.complete ? "成图已齐" : data.summary?.terminal ? "本轮已结束" : "结果采集中";
    $("reportState").classList.toggle("complete", Boolean(data.summary?.complete));
    const generated = (counts.success || 0) + (counts.generated || 0);
    $("successCount").textContent = `${generated} / ${planned}`;
    $("progressLabel").textContent = "张真实成图";
    $("progressFill").style.width = `${planned ? generated / planned * 100 : 0}%`;
    const progress = [[counts.failed, "失败"], [counts.held, "待核查"], [counts.running, "生成中"], [counts.queued, "排队"], [counts.unsubmitted, "未提交"], [counts.cancelled, "已取消"]].filter(([count]) => count).map(([count, label]) => `${count} ${label}`);
    $("progressDetails").textContent = progress.join(" · ") || (data.summary?.complete ? "全部结果可查看原件" : "等待状态更新");
    const settings = data.settings || {};
    $("reportMeta").textContent = [`${samples.length} 张原图 × ${lighting.length} 种光影 × ${models.length} 个模型`, settings.resolution, settings.ratio,
      settings.quality ? /^GPT\b/i.test(settings.quality) ? settings.quality : `GPT ${settings.quality}` : null, data.generatedAt ? `更新于 ${humanDate(data.generatedAt)}` : data.date].filter(Boolean).join(" · ");
    const notes = $("reportNotes");
    for (const note of data.summary?.notes || []) notes.append(node("li", "", note));
    if (!notes.children.length) notes.append(node("li", "", "本轮使用效果图美化的光影模板链路，每个样本与模板组合各生成四个模型结果。"));
    if (data.source?.url) {
      $("reportSource").append(document.createTextNode("原图来源："));
      const link = node("a", "", data.source.label || "之前的评测"); link.href = data.source.url; link.target = "_blank"; link.rel = "noopener";
      $("reportSource").append(link);
    }
  }
  function option(label, active, className, action) {
    const button = node("button", className); button.type = "button"; button.setAttribute("aria-pressed", String(active)); button.setAttribute("aria-label", label);
    button.addEventListener("click", action); return button;
  }
  function renderNavigation() {
    const sampleNavigation = $("sampleNavigation"), lightingNavigation = $("lightingNavigation");
    sampleNavigation.replaceChildren(); lightingNavigation.replaceChildren();
    const allSamples = option("全部原图", state.sampleId === "all", "sample-option all", () => select("sampleId", "all"));
    allSamples.textContent = `全部 ${samples.length} 张`; sampleNavigation.append(allSamples);
    for (const sample of samples) {
      const button = option(`选择原图 ${sample.id} ${sample.name}`, state.sampleId === sample.id, "sample-option", () => select("sampleId", sample.id));
      const image = node("img"); image.src = sample.thumbnailUrl || sample.sourceUrl; image.alt = "";
      const copy = node("span", "", sample.name); copy.append(node("small", "", `原图 ${sample.id}`)); button.append(image, copy); sampleNavigation.append(button);
    }
    const allLighting = option("全部光影", state.lightingId === "all", "lighting-option", () => select("lightingId", "all"));
    allLighting.textContent = `全部 ${lighting.length} 种`; lightingNavigation.append(allLighting);
    for (const item of lighting) {
      const button = option(`选择光影 ${item.name}`, state.lightingId === item.id, "lighting-option", () => select("lightingId", item.id));
      button.textContent = item.name; lightingNavigation.append(button);
    }
    const visible = visibleResults(), total = selectedSamples().length * selectedLighting().length * models.length;
    $("selectionSummary").textContent = `当前显示 ${selectedSamples().length} 张原图 · ${selectedLighting().length} 种光影 · ${visible.filter(isImage).length} / ${total} 张成图`;
  }
  function select(key, value) {
    state[key] = value; renderNavigation(); renderComparisons();
    try { history.replaceState(null, "", `#sample=${encodeURIComponent(state.sampleId)}&lighting=${encodeURIComponent(state.lightingId)}`); } catch { /* 本地只读页不依赖地址写入 */ }
  }
  function previewButton(asset, label, group, index) {
    const button = node("button", "image-button"); button.type = "button"; button.setAttribute("aria-label", `放大 ${label}`);
    const image = node("img"); image.src = asset.thumbnailUrl || asset.url; image.alt = label; image.loading = "lazy"; image.decoding = "async";
    image.addEventListener("error", () => { image.alt = "缩略图读取失败，点击查看原件"; });
    button.append(image); button.addEventListener("click", () => openViewer(group, index)); return button;
  }
  function sourceAsset(sample, item) { return { ...sample, url: sample.sourceUrl, label: "原始输入", context: `${sample.id} ${sample.name} · ${item.name}` }; }
  function groupFor(sample, item) {
    const group = [sourceAsset(sample, item)];
    for (const model of models) {
      const result = resultByKey.get(resultKey(sample.id, item.id, model.key));
      group.push(isImage(result) ? { ...result, url: result.imageUrl, label: model.label, context: `${sample.id} ${sample.name} · ${item.name}` } : null);
    }
    return group;
  }
  function sourceCard(sample, group) {
    const card = node("figure", "image-card source-card"), title = node("div", "card-title");
    title.append(node("span", "model-label", "原始输入"), node("span", "state", "原图"));
    const meta = node("figcaption", "card-meta"); meta.append(node("span", "", dimensions(sample)));
    card.append(title, previewButton(group[0], `${sample.name} 原始输入`, group, 0), meta); return card;
  }
  function outputCard(sample, item, model, group, index) {
    const result = resultByKey.get(resultKey(sample.id, item.id, model.key)) || { status: "planned" };
    const status = result.status || "planned", card = node("figure", "image-card"), title = node("div", "card-title");
    title.append(node("span", "model-label", model.label), node("span", `state ${status}`, statusNames[status] || status));
    card.append(title);
    if (group[index]) card.append(previewButton(group[index], `${sample.name} · ${item.name} · ${model.label}`, group, index));
    else {
      const placeholder = node("div", `placeholder ${status}`, statusNames[status] || "待确认");
      if (result.error) { placeholder.append(node("small", "", result.error)); placeholder.title = result.error; }
      else if (status === "held") placeholder.append(node("small", "", "已有提交线索，结果尚待核实"));
      card.append(placeholder);
    }
    const meta = node("figcaption", "card-meta");
    meta.append(node("span", "", group[index] ? dimensions(result) : "—"));
    if (Number.isFinite(result.elapsedSeconds)) meta.append(node("span", "", seconds(result.elapsedSeconds)));
    card.append(meta); return card;
  }
  function renderComparisons() {
    const container = $("comparisonResults"); container.replaceChildren();
    for (const sample of selectedSamples()) {
      const section = node("section", "sample-section"), heading = node("div", "sample-heading"), title = node("h2", "", sample.name);
      title.append(node("small", "", `原图 ${sample.id} · ${dimensions(sample)}`)); heading.append(title);
      if (sample.reason) heading.append(node("p", "", sample.reason)); section.append(heading);
      for (const item of selectedLighting()) {
        const row = node("article", "comparison-row"), lightingHeading = node("div", "lighting-heading");
        if (item.previewUrl) { const image = node("img"); image.src = item.previewUrl; image.alt = `${item.name}模板预览`; image.loading = "lazy"; lightingHeading.append(image); }
        lightingHeading.append(node("h3", "", item.name));
        if (item.description) lightingHeading.append(node("p", "", item.description));
        const grid = node("div", "comparison-grid"), group = groupFor(sample, item); grid.append(sourceCard(sample, group));
        models.forEach((model, index) => grid.append(outputCard(sample, item, model, group, index + 1)));
        row.append(lightingHeading, grid); section.append(row);
      }
      container.append(section);
    }
    if (!container.children.length) container.append(node("div", "empty-report", "暂无可展示的样本。"));
  }
  function openViewer(group, index) {
    state.viewer = group; state.viewerIndex = index; state.sourceToggleIndex = null; state.actualSize = false;
    renderViewer(); if (!$("imageDialog").open) $("imageDialog").showModal();
  }
  function renderViewer() {
    const asset = state.viewer?.[state.viewerIndex]; if (!asset) return;
    $("dialogTitle").textContent = `${asset.context} · ${asset.label}`;
    $("dialogMeta").textContent = [dimensions(asset), seconds(asset.elapsedSeconds)].filter(Boolean).join(" · ");
    $("dialogOriginal").href = asset.url;
    $("dialogImage").alt = `${asset.context} · ${asset.label}`;
    $("dialogImageStage").classList.add("loading"); $("dialogImageStage").classList.remove("error");
    $("dialogImageStage").classList.toggle("actual-size", state.actualSize);
    $("dialogImage").src = asset.url;
    $("dialogScale").textContent = state.actualSize ? "适应窗口" : "100%";
    $("dialogSource").disabled = state.viewerIndex === 0 && state.sourceToggleIndex === null;
    $("dialogSource").textContent = state.sourceToggleIndex === null ? "对照原图" : "返回结果";
    const imageCount = state.viewer.filter(Boolean).length;
    $("dialogPrevious").disabled = imageCount < 2; $("dialogNext").disabled = imageCount < 2;
  }
  function moveViewer(direction) {
    if (!state.viewer) return;
    let index = state.viewerIndex;
    do { index = (index + direction + state.viewer.length) % state.viewer.length; } while (!state.viewer[index] && index !== state.viewerIndex);
    state.viewerIndex = index; state.sourceToggleIndex = null; state.actualSize = false; renderViewer();
  }
  $("dialogImage").addEventListener("load", () => $("dialogImageStage").classList.remove("loading", "error"));
  $("dialogImage").addEventListener("error", () => { $("dialogImageStage").classList.remove("loading"); $("dialogImageStage").classList.add("error"); });
  $("dialogPrevious").addEventListener("click", () => moveViewer(-1));
  $("dialogNext").addEventListener("click", () => moveViewer(1));
  $("dialogClose").addEventListener("click", () => $("imageDialog").close());
  $("dialogScale").addEventListener("click", () => { state.actualSize = !state.actualSize; $("dialogImageStage").classList.toggle("actual-size", state.actualSize); $("dialogScale").textContent = state.actualSize ? "适应窗口" : "100%"; });
  $("dialogSource").addEventListener("click", () => {
    if (state.sourceToggleIndex === null) { state.sourceToggleIndex = state.viewerIndex; state.viewerIndex = 0; }
    else { state.viewerIndex = state.sourceToggleIndex; state.sourceToggleIndex = null; }
    state.actualSize = false; renderViewer();
  });
  $("imageDialog").addEventListener("keydown", event => {
    if (event.key === "ArrowLeft") { event.preventDefault(); moveViewer(-1); }
    if (event.key === "ArrowRight") { event.preventDefault(); moveViewer(1); }
  });
  $("refreshReport").addEventListener("click", () => location.reload());
  try {
    const hash = new URLSearchParams(location.hash.slice(1));
    if (hash.get("sample") === "all" || samples.some(row => row.id === hash.get("sample"))) state.sampleId = hash.get("sample");
    if (hash.get("lighting") === "all" || lighting.some(row => row.id === hash.get("lighting"))) state.lightingId = hash.get("lighting");
  } catch { /* 无合法筛选地址时沿用默认 */ }
  renderHeader(); renderNavigation(); renderComparisons();
})();

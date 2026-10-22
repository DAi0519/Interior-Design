/**
 * [INPUT]: 依赖 Beta 样本集 DOM、beta-upload 懒加载交互、同源 /api/beta/sample-sets 元信息/单样本上传/完成接口，以及外部单图读取、全景 2:1 源图校验与状态回调
 * [OUTPUT]: 对外提供 createBetaSampleLibrary，跨图像任务复用已有样本ID/轻量预览并隔离free提示词集、按目标功能校验元信息与记忆选集、防旧异步响应串功能、新建按当前功能逐张上传及稳定ID续传、仅本次房型补选与回读同步回执
 * [POS]: public 的 Beta 可复用样本库控制器，把样本资产生命周期与可见飞书同步证据从 beta-app 的运行编排中分离
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { bindImageDrop, renderImagePreviews } from "./beta-upload.js";

function imageIdentity(image) {
  return `${image.name}:${image.size}:${image.lastModified || 0}`;
}

function promptLines(value) {
  return String(value || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function promptChip(sample, index, onRemove, disabled = false) {
  const chip = document.createElement("div");
  const copy = document.createElement("div");
  const label = document.createElement("strong");
  const meta = document.createElement("span");
  const remove = document.createElement("button");
  chip.className = "sample-chip";
  copy.className = "sample-chip-copy";
  label.textContent = sample.prompt;
  meta.textContent = `第 ${index + 1} 条`;
  remove.type = "button";
  remove.className = "sample-remove";
  remove.setAttribute("aria-label", `移除第 ${index + 1} 条提示词`);
  remove.textContent = "×";
  remove.disabled = disabled;
  remove.addEventListener("click", onRemove);
  copy.append(label, meta);
  chip.append(copy, remove);
  return chip;
}

export function createBetaSampleLibrary({
  api,
  elements,
  onChange,
  onError,
  onSelectionChange = () => {},
  readImage,
  validateSourceImage = () => {},
}) {
  const state = {
    activeSampleSetId: "",
    busy: false,
    catalogLoading: false,
    draftSampleSetId: "",
    featureMode: "whiteModel",
    mode: "library",
    prompts: [],
    sampleSets: [],
    sourceImages: [],
    syncMessage: "读取飞书中",
    syncState: "syncing",
  };
  let mutationBusy = false;
  let loadRevision = 0;
  let catalogRevision = 0;
  const rememberedSelections = new Map();

  function setSyncStatus(message, syncState, detail = "") {
    state.syncMessage = message;
    state.syncState = syncState;
    elements.sampleSetSyncStatus.title = detail;
    elements.sampleSetSyncStatus.setAttribute(
      "aria-label",
      detail ? `${message}：${detail}` : message,
    );
  }

  function setsForFeature() {
    return state.sampleSets.filter((sampleSet) =>
      (sampleSet.featureMode === "free") === (state.featureMode === "free"));
  }

  function preferredSet(preferredSampleSetId = rememberedSelections.get(state.featureMode)) {
    const sampleSets = setsForFeature();
    return sampleSets.find((sampleSet) => sampleSet.sampleSetId === preferredSampleSetId)
      || sampleSets.find((sampleSet) => sampleSet.featureMode === state.featureMode)
      || sampleSets[0];
  }

  function sampleCount() {
    return state.featureMode === "free" ? state.prompts.length : state.sourceImages.length;
  }

  function renderCatalog() {
    const sampleSets = setsForFeature();
    elements.sampleSetSelect.replaceChildren(...(sampleSets.length
      ? sampleSets.map((sampleSet) => Object.assign(document.createElement("option"), {
        selected: sampleSet.sampleSetId === state.activeSampleSetId,
        textContent: `${sampleSet.name} · ${sampleSet.sampleCount} 个`,
        value: sampleSet.sampleSetId,
      }))
      : [Object.assign(document.createElement("option"), {
        textContent: "暂无可用样本集",
        value: "",
      })]));
    elements.sampleSetSelect.disabled = state.busy || sampleSets.length === 0;
  }

  function renderSamples() {
    const free = state.featureMode === "free";
    elements.sampleCount.textContent = `${sampleCount()} 个样本`;
    elements.sampleList.classList.toggle("hidden", free || state.sourceImages.length === 0);
    elements.freePromptList.classList.toggle("hidden", !free || state.prompts.length === 0);
    renderImagePreviews(elements.sampleList, state.sourceImages, {
      canRemove: () => !state.busy && !state.draftSampleSetId,
      onRemove: (index) => {
        const [removed] = state.sourceImages.splice(index, 1);
        releasePreview(removed);
        render();
      },
    });
    if (state.featureMode === "emptyRoom") {
      [...elements.sampleList.children].forEach((item, index) => {
        const image = state.sourceImages[index];
        const field = document.createElement("label");
        field.className = "field beta-sample-room";
        const label = document.createElement("span");
        label.textContent = state.mode === "create" ? "房间类型" : "房间类型（本次可调整）";
        const select = document.createElement("select");
        select.append(...[...elements.roomTypeSelect.options].map((option) => option.cloneNode(true)));
        select.value = image.roomType || "";
        select.disabled = state.busy || Boolean(state.draftSampleSetId);
        select.setAttribute("aria-label", `${image.name} 房间类型`);
        const detail = document.createElement("input");
        detail.placeholder = "具体空间类型，例如：衣帽间";
        detail.maxLength = 40;
        detail.value = image.roomTypeDetail || "";
        detail.disabled = state.busy || Boolean(state.draftSampleSetId);
        detail.setAttribute("aria-label", `${image.name} 具体空间类型`);
        detail.classList.toggle("hidden", select.value !== "其他");
        select.addEventListener("change", () => {
          image.roomType = select.value;
          image.roomTypeDetail = "";
          detail.value = "";
          detail.classList.toggle("hidden", select.value !== "其他");
          onChange();
        });
        detail.addEventListener("input", () => {
          image.roomTypeDetail = detail.value;
          onChange();
        });
        field.append(label, select, detail);
        item.append(field);
      });
    }
    elements.freePromptList.replaceChildren(...state.prompts.map((sample, index) =>
      promptChip(sample, index, () => {
        state.prompts.splice(index, 1);
        elements.freePromptsInput.value = state.prompts.map((entry) => entry.prompt).join("\n");
        render();
      }, state.busy || Boolean(state.draftSampleSetId))));
  }

  function render({ samplesChanged = true } = {}) {
    const creating = state.mode === "create";
    const free = state.featureMode === "free";
    elements.sampleSetLibraryPanel.classList.toggle("hidden", creating);
    elements.sampleSetCreatePanel.classList.toggle("hidden", !creating);
    elements.sourceFilesField.classList.toggle("hidden", !creating || free);
    elements.freePromptsField.classList.toggle("hidden", !creating || !free);
    elements.saveSampleSetButton.disabled = state.busy || !sampleCount();
    elements.saveSampleSetButton.textContent =
      state.busy && state.syncState === "syncing" ? "同步中"
        : state.draftSampleSetId ? "继续保存" : "保存样本集";
    elements.cancelSampleSetButton.disabled = state.busy;
    elements.newSampleSetButton.disabled = state.busy;
    elements.sampleSetNameInput.disabled = state.busy || Boolean(state.draftSampleSetId);
    elements.freePromptsInput.disabled = state.busy || Boolean(state.draftSampleSetId);
    elements.sourceFilesInput.disabled = state.busy || Boolean(state.draftSampleSetId);
    elements.sourceFilesDropZone.classList.toggle(
      "hidden",
      !creating || free,
    );
    elements.sampleSetSyncStatus.textContent = state.syncMessage;
    elements.sampleSetSyncStatus.dataset.state = state.syncState;
    if (samplesChanged) {
      renderCatalog();
      renderSamples();
    }
    onChange();
  }

  function releasePreview(image) {
    if (image?.file && image.previewUrl) URL.revokeObjectURL(image.previewUrl);
  }

  function clearSamples() {
    state.sourceImages.forEach(releasePreview);
    state.activeSampleSetId = "";
    state.draftSampleSetId = "";
    state.prompts = [];
    state.sourceImages = [];
    elements.freePromptsInput.value = "";
  }

  function assertExistingSamples(sampleSet, targetFeatureMode) {
    if ((sampleSet.featureMode === "free") !== (targetFeatureMode === "free")) {
      throw new Error("样本集类型与当前任务不兼容");
    }
    if (!Array.isArray(sampleSet.samples) || !sampleSet.samples.length) {
      throw new Error("样本集没有可用样本");
    }
    sampleSet.samples.forEach((sample, index) => {
      if (!sample.sampleId) throw new Error(`第 ${index + 1} 条样本缺少稳定ID`);
      if (targetFeatureMode === "free") {
        if (typeof sample.prompt !== "string" || !sample.prompt.trim()) {
          throw new Error(`第 ${index + 1} 条样本缺少提示词，不能用于自由生图`);
        }
        return;
      }
      const image = sample.image;
      if (!image || typeof image !== "object" || Array.isArray(image)
        || !["image/png", "image/jpeg", "image/webp"].includes(image.type)) {
        throw new Error(`第 ${index + 1} 条样本缺少图片或图片类型无效，不能用于当前任务`);
      }
      // 旧集缺尺寸时留待服务端按原件校验，不为预览下载原图。
      if (image.width !== undefined && image.height !== undefined) validateSourceImage(targetFeatureMode, image);
    });
  }

  function applySampleSet(sampleSet) {
    assertExistingSamples(sampleSet, state.featureMode);
    state.sourceImages.forEach(releasePreview);
    state.activeSampleSetId = sampleSet.sampleSetId;
    state.draftSampleSetId = "";
    state.prompts = state.featureMode === "free" ? sampleSet.samples
      .map((sample) => ({ prompt: sample.prompt, sampleId: sample.sampleId })) : [];
    state.sourceImages = state.featureMode !== "free" ? sampleSet.samples
      .map((sample) => ({ ...sample.image, sampleId: sample.sampleId, roomType: sample.roomType, roomTypeDetail: sample.roomTypeDetail })) : [];
    state.mode = "library";
    rememberedSelections.set(state.featureMode, state.activeSampleSetId);
    onSelectionChange(state.featureMode, state.activeSampleSetId);
  }

  async function loadSampleSet(sampleSetId) {
    if (!sampleSetId) return;
    const revision = ++loadRevision;
    const targetFeatureMode = state.featureMode;
    state.activeSampleSetId = sampleSetId;
    state.busy = true;
    setSyncStatus("读取飞书中", "syncing");
    render();
    try {
      const { sampleSet } = await api(`/api/beta/sample-sets/${encodeURIComponent(sampleSetId)}`);
      if (revision !== loadRevision || targetFeatureMode !== state.featureMode) return;
      applySampleSet(sampleSet);
      setSyncStatus("已同步飞书", "success");
    } catch (error) {
      if (revision !== loadRevision) return;
      clearSamples();
      setSyncStatus("读取失败", "error", error.message);
      onError(error);
    } finally {
      if (revision === loadRevision) {
        state.busy = false;
        render();
      }
    }
  }

  function beginCreate() {
    if (mutationBusy) return;
    loadRevision += 1;
    state.busy = false;
    clearSamples();
    state.mode = "create";
    setSyncStatus("尚未同步", "idle");
    elements.sampleSetNameInput.value = "";
    render();
    elements.sampleSetNameInput.focus();
  }

  async function cancelCreate() {
    const first = preferredSet();
    if (first) await loadSampleSet(first.sampleSetId);
    else beginCreate();
  }

  async function addSourceFiles(fileList) {
    if (state.busy || state.draftSampleSetId) return;
    state.busy = true;
    mutationBusy = true;
    render();
    try {
      const files = Array.from(fileList);
      const known = new Set(state.sourceImages.map(imageIdentity));
      for (const file of files) {
        if (known.has(imageIdentity(file))) continue;
        const image = await readImage(file, { previewOnly: true });
        try {
          validateSourceImage(state.featureMode, image);
        } catch (error) {
          releasePreview(image);
          throw error;
        }
        state.sourceImages.push({ ...image, sampleId: `SAMPLE-${crypto.randomUUID()}` });
        known.add(imageIdentity(file));
      }
    } catch (error) {
      onError(error);
    } finally {
      mutationBusy = false;
      state.busy = false;
      render();
    }
  }

  function syncPromptDraft() {
    state.prompts = promptLines(elements.freePromptsInput.value)
      .map((prompt) => ({ prompt, sampleId: `SAMPLE-${crypto.randomUUID()}` }));
    render();
  }

  async function saveSampleSet() {
    if (state.busy) return;
    const name = elements.sampleSetNameInput.value.trim();
    if (!name) {
      elements.sampleSetNameInput.focus();
      throw new Error("请填写样本集名称");
    }
    if (!sampleCount()) throw new Error("请先添加样本");
    assertRoomTypes();
    const featureMode = state.featureMode;
    const samples = featureMode === "free" ? state.prompts : state.sourceImages;
    state.busy = true;
    mutationBusy = true;
    setSyncStatus("同步飞书中", "syncing");
    render();
    try {
      if (!state.draftSampleSetId) {
        const { sampleSet } = await api("/api/beta/sample-sets", {
          body: JSON.stringify({ featureMode, name }),
          method: "POST",
        });
        state.draftSampleSetId = sampleSet.sampleSetId;
      }
      const sampleSetId = state.draftSampleSetId;
      for (const sample of samples) {
        if (sample.uploaded) continue;
        const completed = samples.filter((entry) => entry.uploaded).length;
        setSyncStatus(`上传飞书 ${completed} / ${samples.length}`, "syncing");
        render({ samplesChanged: false });
        const image = sample.file ? await readImage(sample.file) : undefined;
        if (image) validateSourceImage(featureMode, image);
        await api(`/api/beta/sample-sets/${encodeURIComponent(sampleSetId)}/samples`, {
          body: JSON.stringify({ sampleId: sample.sampleId, image, prompt: sample.prompt,
            roomType: sample.roomType, roomTypeDetail: sample.roomTypeDetail }),
          method: "POST",
        });
        sample.uploaded = true;
        setSyncStatus(`上传飞书 ${completed + 1} / ${samples.length}`, "syncing");
        render({ samplesChanged: false });
      }
      const { sampleSet } = await api(`/api/beta/sample-sets/${encodeURIComponent(sampleSetId)}/complete`, {
        body: JSON.stringify({ sampleIds: samples.map((sample) => sample.sampleId) }),
        method: "POST",
      });
      state.sampleSets = [
        ...state.sampleSets.filter((entry) => entry.sampleSetId !== sampleSet.sampleSetId),
        sampleSet,
      ];
      applySampleSet(sampleSet);
      setSyncStatus("已同步飞书", "success");
    } catch (error) {
      const completed = samples.filter((sample) => sample.uploaded).length;
      setSyncStatus(`同步失败 · ${completed} / ${samples.length}`, "error", error.message);
      throw error;
    } finally {
      mutationBusy = false;
      state.busy = false;
      render();
    }
  }

  async function setFeatureMode(featureMode, preferredSampleSetId = "", { reload = false } = {}) {
    if (mutationBusy) return;
    const sameTarget = state.featureMode === featureMode;
    const previouslyBusy = state.busy;
    loadRevision += 1;
    state.busy = state.catalogLoading;
    state.featureMode = featureMode;
    if (preferredSampleSetId) rememberedSelections.set(featureMode, preferredSampleSetId);
    const next = preferredSet();
    if (!reload && sameTarget && !previouslyBusy && !state.catalogLoading
      && state.mode === "library" && next?.sampleSetId === state.activeSampleSetId) {
      render();
      return;
    }
    clearSamples();
    if (state.catalogLoading) { render(); return; }
    if (next) await loadSampleSet(next.sampleSetId);
    else beginCreate();
  }

  function bind() {
    bindImageDrop({
      dropZone: elements.sourceFilesDropZone,
      input: elements.sourceFilesInput,
      onFiles: addSourceFiles,
    });
    elements.freePromptsInput.addEventListener("input", syncPromptDraft);
    elements.newSampleSetButton.addEventListener("click", beginCreate);
    elements.cancelSampleSetButton.addEventListener("click", () => {
      cancelCreate().catch(onError);
    });
    elements.saveSampleSetButton.addEventListener("click", () => {
      saveSampleSet().catch((error) => {
        onError(error);
      });
    });
    elements.sampleSetSelect.addEventListener("change", () => {
      loadSampleSet(elements.sampleSetSelect.value).catch(onError);
    });
  }

  async function load(featureMode, preferredSampleSetId = "") {
    if (mutationBusy) return;
    const revision = ++catalogRevision;
    loadRevision += 1;
    state.catalogLoading = true;
    await setFeatureMode(featureMode, preferredSampleSetId);
    try {
      const { sampleSets } = await api("/api/beta/sample-sets");
      if (revision !== catalogRevision) return;
      state.sampleSets = sampleSets || [];
      state.catalogLoading = false;
      state.busy = false;
      await setFeatureMode(state.featureMode, "", { reload: true });
    } catch (error) {
      if (revision !== catalogRevision) return;
      state.catalogLoading = false;
      state.busy = false;
      setSyncStatus("读取失败", "error", error.message);
      render();
      throw error;
    }
  }

  function assertRoomTypes() {
    if (state.featureMode !== "emptyRoom") return;
    state.sourceImages.forEach((image, index) => {
      if (!image.roomType) throw new Error(`请为第 ${index + 1} 张样本选择房间类型`);
      if (image.roomType === "其他" && !image.roomTypeDetail?.trim()) {
        throw new Error(`请为第 ${index + 1} 张样本填写具体空间类型`);
      }
    });
  }

  return {
    assertRoomTypes,
    activeSampleSetId: () => state.activeSampleSetId,
    bind,
    isBusy: () => state.busy,
    currentCases({ commonPrompt = "", freeReference = null } = {}) {
      if (state.featureMode === "free") {
        const referenceImages = freeReference ? [freeReference] : [];
        return state.prompts.map((sample) => ({
          caseId: sample.sampleId,
          label: sample.prompt,
          prompt: sample.prompt,
          referenceImages,
        }));
      }
      return state.sourceImages.map((image) => ({
        caseId: image.sampleId,
        label: image.name,
        roomType: image.roomType,
        roomTypeDetail: image.roomTypeDetail,
        prompt: commonPrompt,
        referenceImages: [],
      }));
    },
    isReady: () => Boolean(!state.busy && state.activeSampleSetId && sampleCount()),
    load,
    sampleCount,
    setFeatureMode,
    sourceImages: () => state.sourceImages,
  };
}

/**
 * [INPUT]: 依赖 Beta 样本集 DOM、beta-upload 图片交互、同源 /api/beta/sample-sets 接口，以及外部图片校验/容量/状态回调
 * [OUTPUT]: 对外提供 createBetaSampleLibrary，统一可恢复的已有样本集选择、飞书样本下载、不设样本数量上限的新集创建上传、服务端回读后的同步成功/失败回执、预览删除与当前 Case 投影
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

function promptChip(sample, index, onRemove) {
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
  remove.addEventListener("click", onRemove);
  copy.append(label, meta);
  chip.append(copy, remove);
  return chip;
}

export function createBetaSampleLibrary({
  api,
  assertBatchImageSize,
  elements,
  onChange,
  onError,
  onSelectionChange = () => {},
  readImage,
}) {
  const state = {
    activeSampleSetId: "",
    busy: false,
    featureMode: "whiteModel",
    mode: "library",
    prompts: [],
    sampleSets: [],
    sourceImages: [],
    syncMessage: "读取飞书中",
    syncState: "syncing",
  };

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
    return state.sampleSets.filter((sampleSet) => sampleSet.featureMode === state.featureMode);
  }

  function activeSet() {
    return state.sampleSets.find((sampleSet) =>
      sampleSet.sampleSetId === state.activeSampleSetId) || null;
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
        textContent: "当前任务暂无样本集",
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
      onRemove: (index) => {
        state.sourceImages.splice(index, 1);
        render();
      },
    });
    elements.freePromptList.replaceChildren(...state.prompts.map((sample, index) =>
      promptChip(sample, index, () => {
        state.prompts.splice(index, 1);
        elements.freePromptsInput.value = state.prompts.map((entry) => entry.prompt).join("\n");
        render();
      })));
  }

  function render() {
    const creating = state.mode === "create";
    const free = state.featureMode === "free";
    elements.sampleSetLibraryPanel.classList.toggle("hidden", creating);
    elements.sampleSetCreatePanel.classList.toggle("hidden", !creating);
    elements.sourceFilesField.classList.toggle("hidden", !creating || free);
    elements.freePromptsField.classList.toggle("hidden", !creating || !free);
    elements.saveSampleSetButton.disabled = state.busy || !sampleCount();
    elements.saveSampleSetButton.textContent =
      state.busy && state.syncState === "syncing" ? "同步中" : "保存样本集";
    elements.cancelSampleSetButton.disabled = state.busy;
    elements.newSampleSetButton.disabled = state.busy;
    elements.sourceFilesDropZone.classList.toggle(
      "hidden",
      !creating || free,
    );
    elements.sampleSetSyncStatus.textContent = state.syncMessage;
    elements.sampleSetSyncStatus.dataset.state = state.syncState;
    renderCatalog();
    renderSamples();
    onChange();
  }

  function clearSamples() {
    state.activeSampleSetId = "";
    state.prompts = [];
    state.sourceImages = [];
    elements.freePromptsInput.value = "";
  }

  function applySampleSet(sampleSet) {
    state.activeSampleSetId = sampleSet.sampleSetId;
    state.prompts = sampleSet.samples
      .filter((sample) => sample.prompt)
      .map((sample) => ({ prompt: sample.prompt, sampleId: sample.sampleId }));
    state.sourceImages = sampleSet.samples
      .filter((sample) => sample.image)
      .map((sample) => ({ ...sample.image, sampleId: sample.sampleId }));
    state.mode = "library";
    onSelectionChange(state.featureMode, state.activeSampleSetId);
  }

  async function loadSampleSet(sampleSetId) {
    if (!sampleSetId) return;
    state.busy = true;
    setSyncStatus("读取飞书中", "syncing");
    render();
    try {
      const { sampleSet } = await api(`/api/beta/sample-sets/${encodeURIComponent(sampleSetId)}`);
      applySampleSet(sampleSet);
      setSyncStatus("已同步飞书", "success");
    } catch (error) {
      clearSamples();
      setSyncStatus("读取失败", "error", error.message);
      onError(error);
    } finally {
      state.busy = false;
      render();
    }
  }

  function beginCreate() {
    clearSamples();
    state.mode = "create";
    setSyncStatus("尚未同步", "idle");
    elements.sampleSetNameInput.value = "";
    render();
    elements.sampleSetNameInput.focus();
  }

  async function cancelCreate() {
    const first = setsForFeature()[0];
    if (first) await loadSampleSet(first.sampleSetId);
    else beginCreate();
  }

  async function addSourceFiles(fileList) {
    try {
      const files = Array.from(fileList);
      assertBatchImageSize([...state.sourceImages, ...files]);
      const incoming = await Promise.all(files.map(readImage));
      const known = new Set(state.sourceImages.map(imageIdentity));
      const unique = incoming.filter((image) => !known.has(imageIdentity(image)));
      const next = [...state.sourceImages, ...unique];
      assertBatchImageSize(next);
      state.sourceImages = next;
      render();
    } catch (error) {
      onError(error);
    }
  }

  function syncPromptDraft() {
    state.prompts = promptLines(elements.freePromptsInput.value)
      .map((prompt, index) => ({ prompt, sampleId: `DRAFT-${index + 1}` }));
    render();
  }

  async function saveSampleSet() {
    const name = elements.sampleSetNameInput.value.trim();
    if (!name) {
      elements.sampleSetNameInput.focus();
      throw new Error("请填写样本集名称");
    }
    if (!sampleCount()) throw new Error("请先添加样本");
    state.busy = true;
    setSyncStatus("同步飞书中", "syncing");
    render();
    try {
      const samples = state.featureMode === "free"
        ? state.prompts.map(({ prompt }) => ({ prompt }))
        : state.sourceImages.map((image) => ({ image }));
      const { sampleSet } = await api("/api/beta/sample-sets", {
        body: JSON.stringify({ featureMode: state.featureMode, name, samples }),
        method: "POST",
      });
      state.sampleSets = [
        ...state.sampleSets.filter((entry) => entry.sampleSetId !== sampleSet.sampleSetId),
        sampleSet,
      ];
      applySampleSet(sampleSet);
      setSyncStatus("已同步飞书", "success");
    } catch (error) {
      setSyncStatus("同步失败", "error", error.message);
      throw error;
    } finally {
      state.busy = false;
      render();
    }
  }

  async function setFeatureMode(featureMode, preferredSampleSetId = "") {
    state.featureMode = featureMode;
    const current = activeSet();
    if (current?.featureMode === featureMode) {
      render();
      return;
    }
    clearSamples();
    const sampleSets = setsForFeature();
    const preferred = sampleSets.find((sampleSet) =>
      sampleSet.sampleSetId === preferredSampleSetId);
    const next = preferred || sampleSets[0];
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
    try {
      const { sampleSets } = await api("/api/beta/sample-sets");
      state.sampleSets = sampleSets || [];
      await setFeatureMode(featureMode, preferredSampleSetId);
    } catch (error) {
      setSyncStatus("读取失败", "error", error.message);
      render();
      throw error;
    }
  }

  return {
    activeSampleSetId: () => state.activeSampleSetId,
    assertAssetSize(extraImages = []) {
      assertBatchImageSize([...state.sourceImages, ...extraImages].filter(Boolean));
    },
    bind,
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
        prompt: commonPrompt,
        referenceImages: [image],
      }));
    },
    isReady: () => Boolean(state.activeSampleSetId && sampleCount()),
    load,
    sampleCount,
    setFeatureMode,
    sourceImages: () => state.sourceImages,
  };
}

/**
 * [INPUT]: 依赖任务批处理、generation-service、精模及全景光影版本/SHA冻结、Beta扩图/六工作流超分真源与只读能力、源图尺寸、风格转换、模型2:1矩阵、三表Schema/资产Store及参考图/全景/房型/Agent准入
 * [OUTPUT]: 对外提供按当前功能新建样本、已有跨功能样本按ID复用及目标功能内容准入、草稿/逐张保存/完成回读、Schema/Agent/精模/全景/扩图/超分准入、精模唯一配置串行冻结及失败零入队、逐项原图读取和十功能两路并发执行、冻结精模/氛围版本摘要与真实图片工作流及全景/风格转换版本、生成/同步双阶段与逐Run预警快照、失败项手动续Attempt及旧批次恢复、仅同步失败复用服务端原结果、回读后预览、合同错误不自动重试；旧原始光影仅恢复已有结果，缺结果零建档/出图；Sunburst扩图最多一次收费提交；受信旧KS失败批次只恢复已有结果，缺结果在建档/GPU前拒旧版本
 * [POS]: src 的 Beta跑图应用服务，隔离整批队列总数与正式生成服务单次批次语义，分别记录模型生成和飞书回读进度，并只以后者为完成与结果可见条件
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { normalizeEmptyRoomType, normalizeEmptyRoomTypeDetail, EMPTY_ROOM_TYPE_DETAIL_MAX_LENGTH } from "./empty-room-type.mjs";
import { normalizeBetaSampleImage } from "./beta-sample-store.mjs";
import { normalizeReferenceImages, REFERENCE_IMAGE_POLICY } from "./reference-image.mjs";
import { MODEL_CONFIGS } from "./model-config.mjs";
import { normalizeStyleTransferSelection } from "./white-model-workflow.mjs";
import { prepareRefinedRenderInput } from "./refined-render-prompt.mjs";
import { assertRefinedLightingAdmission, hasRefinedLightingInput, prepareRefinedLightingInput, refinedLightingFreezeKey } from "./refined-lighting.mjs";
import { normalizePanoramaLighting, preparePanoramaLightingInput } from "./panorama-lighting.mjs";
import { normalizeImageOutpaintInput } from "./image-outpaint-service.mjs";
import { BETA_OUTPAINT_WORKFLOWS, normalizeBetaOutpaintInput, publicBetaOutpaintConfig, verifyBetaOutpaintBatch } from "./beta-outpaint.mjs";
import { normalizeBetaUpscaleInput, publicBetaUpscaleConfig, validateBetaUpscaleSource, verifyBetaUpscaleBatch } from "./beta-upscale.mjs";

import {
  createGenerationJobRegistry,
  runGenerationJobBatch,
} from "./generation-jobs.mjs";

export const BETA_FEATURE_MODES = Object.freeze([
  "whiteModel",
  "emptyRoom",
  "styleTransfer",
  "refinedModel",
  "effectEnhancement",
  "effectBeautification",
  "panoramaEnhancement",
  "free",
  "imageOutpaint",
  "imageUpscale",
]);
export const BETA_MAX_ATTEMPTS = 3;
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429]);
const RETRYABLE_ERROR_CODES = new Set(["output_download"]);

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function betaErrorMessage(error) {
  return String(error?.message || "未知错误").slice(0, 500);
}

export function isRetryableBetaError(error) {
  if (error?.retryable === false) return false;
  if (RETRYABLE_ERROR_CODES.has(String(error?.code || ""))) return true;
  const statusCode = Number(error?.statusCode ?? error?.status);
  if (!Number.isInteger(statusCode)) return true;
  return statusCode >= 500 || RETRYABLE_STATUS_CODES.has(statusCode);
}

function singleRunGenerationInput(input = {}) {
  const next = { ...input };
  delete next.batchCount;
  delete next.batchId;
  delete next.batchIndex;
  return next;
}

function attemptItem(item, attempt) {
  const absoluteAttempt = Number(item.attempt || 1) + attempt - 1;
  return {
    ...item,
    attempt: absoluteAttempt,
    runId: attempt === 1
      ? item.runId
      : `${item.runId.slice(0, 116)}-A${absoluteAttempt}`,
  };
}

function inputError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

export function assertBetaPromptAgentAccess(batch, agentModels) {
  if (!["whiteModel", "emptyRoom", "styleTransfer"].includes(batch?.featureMode)) return;
  const available = new Map(agentModels.map((model) => [model.key, model]));
  const keys = new Set((batch.items || []).map((item) => item?.input?.promptAgentModelKey));
  for (const key of keys) {
    const model = available.get(key);
    if (!model?.selectable) {
      throw inputError(`${model?.label || "所选提示词模型"} 当前未向这个 API Key 开放；请切换可用模型后重新运行`);
    }
  }
}

function assetImages(assets, key, fieldName) {
  if (!key) return [];
  const images = assets?.[key];
  if (!Array.isArray(images)) throw inputError(`${fieldName}不存在或格式无效`);
  return images;
}

function normalizeSampleSet(body = {}) {
  const featureMode = String(body.featureMode || "").trim();
  const name = String(body.name || "").trim();
  const samples = Array.isArray(body.samples) ? body.samples : [];
  if (!BETA_FEATURE_MODES.includes(featureMode)) {
    throw inputError("样本集功能不受支持");
  }
  if (!name || name.length > 80) throw inputError("样本集名称需要 1–80 个字符");
  return {
    featureMode,
    name,
    samples: samples.map((sample, index) => {
      const prompt = String(sample?.prompt || "").trim();
      const image = sample?.image && typeof sample.image === "object" ? sample.image : null;
      if (featureMode === "free") {
        if (!prompt) throw inputError(`第 ${index + 1} 个样本缺少提示词`);
        return { image: null, prompt };
      }
      if (!image?.dataUrl || !["image/png", "image/jpeg", "image/webp"].includes(image.type)) {
        throw inputError(`第 ${index + 1} 个样本缺少有效图片`);
      }
      const roomType = normalizeEmptyRoomType(sample.roomType);
      const roomTypeDetail = roomType === "其他" ? normalizeEmptyRoomTypeDetail(sample.roomTypeDetail) : "";
      if (featureMode === "emptyRoom" && (!roomType || (roomType === "其他"
        && (!roomTypeDetail || roomTypeDetail.length > EMPTY_ROOM_TYPE_DETAIL_MAX_LENGTH)))) {
        throw inputError(`第 ${index + 1} 个样本需要有效房间类型；其他类型需填写 1–40 字详情`);
      }
      return {
        ...(featureMode === "emptyRoom" ? { roomType, roomTypeDetail } : {}),
        image: ["panoramaEnhancement", "styleTransfer"].includes(featureMode) ? normalizeBetaSampleImage(image, featureMode) : {
          dataUrl: String(image.dataUrl),
          name: String(image.name || `sample-${index + 1}`).slice(0, 160),
          size: Number(image.size) || 0,
          type: image.type,
        },
        prompt,
      };
    }),
  };
}

function normalizeSingleSample(sample = {}, featureMode) {
  const sampleId = String(sample.sampleId || "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/.test(sampleId)) throw inputError("样本 ID 无效");
  const normalized = normalizeSampleSet({ featureMode, name: "单样本", samples: [sample] }).samples[0];
  return { ...normalized, sampleId, image: normalized.image ? normalizeBetaSampleImage(normalized.image, featureMode) : null };
}

function normalizePanoramaInput(input) {
  const model = MODEL_CONFIGS[String(input.modelKey || "")];
  if (!model) throw inputError("出图模型不受支持");
  if (model.sizingMode !== "source" && !model.sizes["2:1"]) {
    throw inputError(`${model.label} 不支持全景图所需的 2:1 画幅`);
  }
  const version = Number(input.panoramaPromptVersion);
  const lighting = normalizePanoramaLighting(input.panoramaLighting);
  const changesLighting = lighting || String(input.prompt || "").trim();
  if (!changesLighting && (!Number.isInteger(version) || version < 1)) throw inputError("请先读取可用的全景图美化 Prompt 版本");
  return { ...input, panoramaLighting: lighting,
    ...(changesLighting ? {} : { panoramaPromptVersion: version }),
    ...(model.panoramaWorkflow ? { resolution: "original" } : {}), ratio: "2:1", ratioMode: "original" };
}

function singleSharedImages(images, fieldName) {
  if (images == null) return [];
  const normalized = normalizeReferenceImages(images, { maxCount: 1,
    maxTotalBytes: REFERENCE_IMAGE_POLICY.maxBytesPerImage });
  return normalized.map((image) => {
    if (!image.width || !image.height) throw inputError(`${fieldName}内容或 MIME 类型无效`);
    return { dataUrl: image.imageUrl, name: image.fileName, type: image.mimeType,
      size: image.size, width: image.width, height: image.height };
  });
}

async function bindBatchSamples(batch, baseStore, { preserveInput = false } = {}) {
  if (!baseStore.getSampleSet) return batch;
  if (!batch.sampleSetId) throw inputError("请选择已保存的飞书样本集");
  const set = await baseStore.getSampleSet(batch.sampleSetId);
  if (!set || set.status !== "可用") throw inputError("样本集不存在或尚未上传完成");
  const samples = new Map(set.samples.map((sample) => [sample.sampleId, sample]));
  const sharedAssets = new Map();
  const sharedImages = (images, label) => {
    if (!images) return [];
    if (!sharedAssets.has(images)) sharedAssets.set(images, singleSharedImages(images, label));
    return sharedAssets.get(images);
  };
  for (const item of batch.items) {
    const sample = samples.get(item.sampleId);
    if (!sample) throw inputError("样本不属于所选样本集或尚未上传确认");
    if (preserveInput && ((item.sourceRecordId && item.sourceRecordId !== sample.recordId)
      || (item.sourceSetRecordId && item.sourceSetRecordId !== set.recordId))) throw inputError("原冻结样本关联已改变");
    if (batch.featureMode !== "free") {
      if (item.input.referenceImages?.length) throw inputError("图像样本请仅提交飞书样本 ID");
      if (!sample.image || !REFERENCE_IMAGE_POLICY.accept.includes(sample.image.type)) throw inputError("飞书样本缺少有效原图");
      if (Number(sample.image.size) > REFERENCE_IMAGE_POLICY.maxBytesPerImage) throw inputError("样本图不能超过 8MB");
    } else {
      const prompt = preserveInput ? item.input.prompt : sample.prompt;
      if (typeof prompt !== "string" || !prompt.trim()) throw inputError("自由生图需要含有效提示词的样本");
      if (!preserveInput) item.input.prompt = prompt.trim();
      item.input.referenceImages = sharedImages(item.input.referenceImages, "共用源图");
    }
    if (preserveInput) continue;
    item.caseId = sample.sampleId;
    item.sourceRecordId = sample.recordId;
    item.sourceSetRecordId = set.recordId;
    item.input.styleReferenceImages = sharedImages(item.input.styleReferenceImages, "风格参考图");
    if (batch.featureMode === "refinedModel") item.input.lightingReferenceImages = sharedImages(item.input.lightingReferenceImages, "光影参考图");
    if (batch.featureMode === "emptyRoom") {
      const roomType = normalizeEmptyRoomType(item.input.roomType || sample.roomType);
      const roomTypeDetail = roomType === "其他" ? normalizeEmptyRoomTypeDetail(item.input.roomTypeDetail || sample.roomTypeDetail) : "";
      if (!roomType || (roomType === "其他" && (!roomTypeDetail || roomTypeDetail.length > EMPTY_ROOM_TYPE_DETAIL_MAX_LENGTH))) {
        throw inputError("每个空房样本需要有效房间类型；其他类型需填写 1–40 字详情");
      }
      Object.assign(item.input, { roomType, roomTypeDetail });
    }
  }
  return batch;
}

function normalizeBatch(body = {}, { recoveringLegacyUpscale = false } = {}) {
  const batchId = String(body.batchId || "").trim();
  const featureMode = String(body.featureMode || "").trim();
  const jobId = String(body.jobId || "").trim();
  const items = Array.isArray(body.items) ? body.items : [];
  const assets = body.assets && typeof body.assets === "object" ? body.assets : {};
  if (!/^beta-[A-Za-z0-9-]{12,80}$/.test(jobId)) {
    throw inputError("Beta跑图任务 ID 无效");
  }
  if (!/^BETA-[A-Za-z0-9-]{8,80}$/.test(batchId)) {
    throw inputError("Beta跑图批次 ID 无效");
  }
  if (!BETA_FEATURE_MODES.includes(featureMode)) {
    throw inputError("Beta跑图功能不受支持");
  }
  if (items.length < 1) throw inputError("Beta跑图至少需要 1 个 Run");
  const fallbackTime = String(items[0]?.runId || "").match(
    /^RUN-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-/,
  );
  const testTime = String(body.testTime || (fallbackTime
    ? `${fallbackTime[1]}-${fallbackTime[2]}-${fallbackTime[3]} ${fallbackTime[4]}:${fallbackTime[5]}:${fallbackTime[6]}`
    : "")).trim();
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(testTime)
    || Number.isNaN(Date.parse(`${testTime.replace(" ", "T")}+08:00`))) {
    throw inputError("Beta跑图测试时间无效");
  }
  const runIds = new Set();
  const sharedStyleReferences = new Map();
  const normalizedItems = items.map((item, index) => {
    const runId = String(item?.runId || "").trim();
    const caseId = String(item?.caseId || "").trim();
    if (!/^RUN-[A-Za-z0-9-]{8,120}$/.test(runId)) {
      throw inputError(`第 ${index + 1} 个 Run ID 无效`);
    }
    if (!caseId || caseId.length > 120) {
      throw inputError(`第 ${index + 1} 个样本 ID 无效`);
    }
    if (runIds.has(runId)) throw inputError(`Run ID 重复：${runId}`);
    runIds.add(runId);
    if (!item.input || typeof item.input !== "object") {
      throw inputError(`第 ${index + 1} 个 Run 缺少生成输入`);
    }
    const referenceImages = item.referenceAssetKey
      ? assetImages(assets, item.referenceAssetKey, `第 ${index + 1} 个输入图片资产`)
      : item.input.referenceImages;
    const styleReferenceImages = item.styleReferenceAssetKey
      ? assetImages(assets, item.styleReferenceAssetKey, `第 ${index + 1} 个风格图片资产`)
      : item.input.styleReferenceImages;
    const lightingReferenceImages = item.lightingReferenceAssetKey
      ? assetImages(assets, item.lightingReferenceAssetKey, `第 ${index + 1} 个光影图片资产`)
      : item.input.lightingReferenceImages;
    let input = {
      ...item.input,
      featureMode,
      ...(referenceImages ? { referenceImages } : {}),
      ...(styleReferenceImages ? { styleReferenceImages } : {}),
      ...(lightingReferenceImages ? { lightingReferenceImages } : {}),
    };
    if (featureMode === "styleTransfer") {
      if (!sharedStyleReferences.has(styleReferenceImages)) {
        sharedStyleReferences.set(styleReferenceImages, singleSharedImages(styleReferenceImages, "风格参考图"));
      }
      input.styleReferenceImages = sharedStyleReferences.get(styleReferenceImages);
      const selection = normalizeStyleTransferSelection(input, {
        styleReferenceCount: input.styleReferenceImages.length, requireVersion: true,
      });
      input = { ...input, renderMode: selection.renderMode, [selection.versionField]: selection.version };
      if (selection.renderMode === "style-reference") delete input.styleCode;
    }
    if (featureMode === "imageOutpaint") input = normalizeBetaOutpaintInput(input);
    if (featureMode === "imageUpscale") input = normalizeBetaUpscaleInput(input,
      { recoveringLegacy: recoveringLegacyUpscale });
    const outpaintWorkflow = featureMode === "imageOutpaint"
      ? BETA_OUTPAINT_WORKFLOWS.find((workflow) => workflow.key === input.outpaintWorkflowKey) : null;
    return {
      attempt: Number.isInteger(item.attempt) && item.attempt > 0 ? item.attempt : 1,
      caseId,
      input: featureMode === "panoramaEnhancement" ? normalizePanoramaInput(input) : input,
      key: runId,
      label: String(item.label || caseId).slice(0, 160),
      modelLabel: outpaintWorkflow?.label || String(item.modelLabel || item.input.modelKey || "").slice(0, 120),
      ...(outpaintWorkflow ? { outpaintWorkflowKey: outpaintWorkflow.key } : {}),
      runId,
      sampleId: String(item.sampleId || "").trim(),
    };
  });
  return { batchId, featureMode, items: normalizedItems, jobId,
    sampleSetId: String(body.sampleSetId || "").trim(), testTime };
}

export function createBetaRunnerService({
  baseStore,
  generationService,
  getOutpaintConfig = null,
  getUpscaleConfig = null,
  prepareRefinedInput = prepareRefinedRenderInput,
  prepareRefinedLighting = prepareRefinedLightingInput,
  preparePanoramaLighting = preparePanoramaLightingInput,
  jobs = createGenerationJobRegistry({ maxJobs: 12 }),
  maxAttempts = BETA_MAX_ATTEMPTS,
  sleep = delay,
} = {}) {
  if (!baseStore || !generationService) {
    throw new TypeError("Beta跑图需要独立 Base Store 与生成服务");
  }
  const afterSchemaVerification = (operation) => baseStore.verifySchema
    ? Promise.resolve(baseStore.verifySchema()).then(operation)
    : operation();

  const batches = new Map();
  const requireRetrySource = (jobId) => {
    const job = jobs.get?.(jobId);
    if (!job) throw Object.assign(inputError("Beta跑图任务不存在或已过期"), { statusCode: 404 });
    if (job.status !== "failed") throw Object.assign(inputError("仅失败批次可以重试；请等待当前批次结束"), { statusCode: 409 });
    return job;
  };
  const enqueueBatch = (batch, previous = null) => {
    for (const key of batches.keys()) if (!jobs.get?.(key)) batches.delete(key);
    const existing = jobs.get?.(batch.jobId);
    if (existing) return existing;
    if (previous?.retryJobId) {
      const successor = jobs.get?.(previous.retryJobId);
      if (successor) return successor;
    }
    const states = previous ? previous.states.map((state) => ({ ...state }))
      : batch.items.map((item, index) => ({ item, index, attempt: item.attempt - 1,
        generated: false, synced: false, archive: null, result: null, error: null, stage: "generation" }));
    const context = { batch, states };
    batches.set(batch.jobId, context);
    if (previous) previous.retryJobId = batch.jobId;
    const count = (key) => states.filter((state) => state[key]).length;
    const warnings = () => states.filter((state) => !state.synced && state.error).map((state) => ({
      attempt: state.attempt,
      caseId: state.item.caseId,
      label: state.item.label,
      message: betaErrorMessage(state.error),
      modelLabel: state.item.modelLabel,
      recordUrl: state.archive?.recordUrl || null,
      retryable: isRetryableBetaError(state.error),
      runId: state.currentItem?.runId || state.item.runId,
      stage: state.stage,
    }));
    const publicResults = () => states.filter((state) => state.synced).map((state) => state.publicResult)
      .sort((left, right) => left.index - right.index);
    const snapshot = () => ({ batchId: batch.batchId, results: publicResults(), warnings: warnings(),
      ...(batch.retryOfJobId ? { retryOfJobId: batch.retryOfJobId } : {}) });
    const accepted = jobs.enqueue(batch.jobId, {
      featureMode: batch.featureMode,
      stages: { generated: count("generated"), synced: count("synced") },
      total: batch.items.length,
    }, async (update) => {
      const updateStages = (message) => update({ completed: count("synced"), message,
        result: snapshot(), stages: { generated: count("generated"), synced: count("synced") } });
      updateStages(`保留已同步 ${count("synced")} / ${batch.items.length}，正在处理未完成结果`);
      const outcomes = await runGenerationJobBatch({ concurrency: 2, items: states.map((state) => state.item),
        async execute(item, index) {
          const state = states[index];
          if (state.synced) return { archive: state.archive, attempt: state.attempt };
          let source = null;
          if (state.recoverArchived && baseStore.recoverRun) {
            state.stage = "sync";
            try {
              const recovered = await baseStore.recoverRun({ batchId: batch.batchId,
                featureMode: batch.featureMode, item, testTime: batch.testTime });
              state.recoverArchived = false;
              if (recovered) {
                state.archive = recovered;
                state.attempt = recovered.attempt;
                state.generated = true;
                state.synced = true;
                state.error = null;
                state.publicResult = { attempt: state.attempt, caseId: item.caseId, index, label: item.label,
                  modelLabel: item.modelLabel, originalRunId: item.runId, previewUrl: null,
                  recordUrl: recovered.recordUrl, runId: recovered.runId };
                updateStages(`复用已归档结果 · 已同步 ${count("synced")} / ${batch.items.length}`);
                return { archive: recovered, attempt: state.attempt };
              }
            } catch (error) {
              state.error = error;
              updateStages(`${item.label} · 已有结果恢复失败：${betaErrorMessage(error)}`);
              throw error;
            }
          }
          if (batch.featureMode === "refinedModel" && !state.result) assertRefinedLightingAdmission(item.input);
          const attempts = batch.featureMode === "panoramaEnhancement" && MODEL_CONFIGS[item.input.modelKey]?.panoramaWorkflow
            || batch.featureMode === "imageOutpaint" && item.input.outpaintEngine === "gptImage25Sunburst"
            ? 1 : maxAttempts;
          try {
            for (let attempt = 1; attempt <= attempts; attempt += 1) {
              try {
                if (!state.result) {
                  state.stage = "generation";
                  state.attempt += 1;
                  state.currentItem = attemptItem(item, state.attempt - item.attempt + 1);
                  const currentItem = state.currentItem;
                  state.archive = null;
                  if (batch.sampleSetId && baseStore.resolveSample && batch.featureMode !== "free") {
                    source ||= await baseStore.resolveSample(batch.sampleSetId, item.sampleId,
                      { recordId: item.sourceRecordId, sampleSetRecordId: item.sourceSetRecordId, targetFeatureMode: batch.featureMode });
                    currentItem.input = { ...currentItem.input,
                      referenceImages: [normalizeBetaSampleImage(source.image, batch.featureMode)] };
                  }
                  if (batch.featureMode === "imageOutpaint") {
                    verifyBetaOutpaintBatch({ ...batch, items: [currentItem] }, getOutpaintConfig ? await getOutpaintConfig() : {});
                    await normalizeImageOutpaintInput(currentItem.input);
                  }
                  if (batch.featureMode === "imageUpscale") {
                    verifyBetaUpscaleBatch({ ...batch, items: [currentItem] }, getUpscaleConfig ? await getUpscaleConfig() : {});
                    validateBetaUpscaleSource(currentItem.input);
                  }
                  state.stage = "archive";
                  state.archive = await baseStore.beginRun({ batchId: batch.batchId,
                    featureMode: batch.featureMode, item: currentItem, testTime: batch.testTime });
                  state.stage = "generation";
                  state.result = await generationService.executeForMode(batch.featureMode, singleRunGenerationInput(currentItem.input));
                  state.generated = true;
                  state.stage = "sync";
                  updateStages(`已生成 ${count("generated")} / ${batch.items.length} · 正在同步飞书`);
                }
                state.stage = "sync";
                const completedArchive = await baseStore.completeRun(state.archive.recordId, state.result);
                state.archive = completedArchive;
                state.synced = true;
                state.error = null;
                state.result = null;
                state.publicResult = { attempt: state.attempt, caseId: item.caseId, index, label: item.label,
                  modelLabel: item.modelLabel, originalRunId: item.runId,
                  previewUrl: completedArchive.previewUrl || null, recordUrl: completedArchive.recordUrl,
                  runId: state.currentItem.runId };
                updateStages(`已同步 ${count("synced")} / ${batch.items.length}`);
                return { archive: completedArchive, attempt: state.attempt };
              } catch (error) {
                state.error = error;
                if (state.archive?.recordId) {
                  try { await baseStore.failRun(state.archive.recordId, error, { retainArchive: Boolean(state.result) }); }
                  catch { /* 保留首个生成或归档错误，避免失败回写覆盖根因。 */ }
                }
                updateStages(`${item.label} · ${betaErrorMessage(error)}`);
                if (!isRetryableBetaError(error)) {
                  throw new Error(`${item.label} · ${betaErrorMessage(error)}（不可重试错误，已停止）`);
                }
                if (attempt >= attempts) break;
                updateStages(`${item.label} · ${betaErrorMessage(error)} · 自动重试${state.result ? "同步" : "生成"} ${attempt + 1}/${attempts}`);
                await sleep(500 * (2 ** (attempt - 1)));
              }
            }
            throw new Error(`${item.label} 共尝试 ${attempts} 次后仍未同步飞书：${betaErrorMessage(state.error)}`);
          } finally { source = null; }
        },
      });
      const failed = outcomes.filter((outcome) => outcome.status === "rejected");
      if (failed.length) throw new Error(`${failed.length} 张结果失败；${failed[0]?.reason?.message || "未知错误"}`);
      return { ...snapshot(), outcomes };
    });
    return { ...accepted, completed: count("synced"), result: snapshot() };
  };
  const admitBatch = (batch, previous = null) => afterSchemaVerification(() => {
    const bindAndEnqueue = () => baseStore.getSampleSet
      ? bindBatchSamples(batch, baseStore, { preserveInput: Boolean(previous) }).then(() => enqueueBatch(batch, previous)) : enqueueBatch(batch, previous);
    if (batch.featureMode === "panoramaEnhancement") {
      const prepareItems = async () => {
        const prepared = new Map();
        for (const [index, item] of batch.items.entries()) {
          const state = previous?.states[index];
          if (state?.synced || state?.result || state?.recoverArchived) continue;
          const key = JSON.stringify([item.input.panoramaLighting, item.input.prompt]);
          if (!prepared.has(key)) prepared.set(key, await preparePanoramaLighting(item.input));
          const frozen = prepared.get(key);
          item.input.panoramaLighting = structuredClone(frozen.panoramaLighting);
          item.input.prompt = frozen.prompt;
        }
      };
      return prepareItems().then(bindAndEnqueue);
    }
    if (batch.featureMode === "refinedModel") {
      const prepared = new Map();
      // --- 强制刷新资产时串行读取飞书，避免异构配置同时触发限流。 ---
      const prepareItems = async () => {
        for (const [index, item] of batch.items.entries()) {
          const state = previous?.states[index];
          if (state?.synced || state?.result || state?.recoverArchived) continue;
          assertRefinedLightingAdmission(item.input);
          const key = JSON.stringify([item.input.refinedRender, item.input.promptCode, item.input.promptVersion,
            item.input.refinedPromptSha256, item.input.refinedAtmospherePromptVersion, item.input.refinedAtmospherePromptSha256,
            refinedLightingFreezeKey(item.input)]);
          if (!prepared.has(key)) prepared.set(key, Promise.resolve(prepareRefinedLighting(item.input))
            .then(lightingInput => prepareRefinedInput(lightingInput)));
          const frozen = await prepared.get(key);
          Object.assign(item.input, {
            promptCode: frozen.promptCode,
            refinedRender: structuredClone(frozen.refinedRender), promptVersion: frozen.promptVersion,
            refinedPromptSha256: frozen.refinedPromptSha256,
            refinedAtmospherePromptVersion: frozen.refinedAtmospherePromptVersion,
            refinedAtmospherePromptSha256: frozen.refinedAtmospherePromptSha256,
            ...(hasRefinedLightingInput(frozen) ? { refinedLighting: structuredClone(frozen.refinedLighting),
              lightingReferenceImages: frozen.lightingReferenceImages } : {}),
          });
        }
      };
      return prepareItems().then(bindAndEnqueue);
    }
    if (!["imageOutpaint", "imageUpscale"].includes(batch.featureMode)) return bindAndEnqueue();
    const capabilityBatch = batch.featureMode === "imageUpscale" && previous
      ? { ...batch, items: batch.items.filter((_item, index) => {
        const state = previous.states[index];
        return !state.synced && !state.result && !state.recoverArchived;
      }) } : batch;
    if (!capabilityBatch.items.length) return bindAndEnqueue();
    const readConfig = batch.featureMode === "imageUpscale" ? getUpscaleConfig : getOutpaintConfig;
    return Promise.resolve(readConfig ? readConfig() : {}).then((config) => {
      if (batch.featureMode === "imageUpscale") verifyBetaUpscaleBatch(capabilityBatch, config);
      else verifyBetaOutpaintBatch(batch, config);
      return bindAndEnqueue();
    });
  });

  return {
    async config() {
      return {
        baseUrl: baseStore.config.baseUrl,
        features: BETA_FEATURE_MODES,
        tableId: baseStore.config.tableId,
        outpaint: publicBetaOutpaintConfig(getOutpaintConfig ? await getOutpaintConfig() : {}),
        upscale: publicBetaUpscaleConfig(getUpscaleConfig ? await getUpscaleConfig() : {}),
      };
    },
    createSampleSet(body) {
      const sampleSet = normalizeSampleSet(body);
      return afterSchemaVerification(() => baseStore.createSampleSet(sampleSet));
    },
    addSample(sampleSetId, body) {
      return afterSchemaVerification(async () => {
        const set = await baseStore.getSampleSet(sampleSetId, { includeDraft: true });
        if (!set) throw Object.assign(inputError("样本集不存在或已归档"), { statusCode: 404 });
        return baseStore.addSample(sampleSetId, normalizeSingleSample(body, set.featureMode));
      });
    },
    completeSampleSet(sampleSetId, body = {}) {
      const sampleIds = Array.isArray(body.sampleIds) ? body.sampleIds.map(String) : [];
      if (!sampleIds.length || sampleIds.some((id) => !/^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/.test(id))) {
        throw inputError("样本集至少需要一个已上传样本 ID");
      }
      return afterSchemaVerification(() => baseStore.completeSampleSet(sampleSetId, sampleIds));
    },
    getSampleImage(sampleSetId, sampleId) {
      return baseStore.getSampleImage(sampleSetId, sampleId);
    },
    getSampleSet(sampleSetId) {
      return baseStore.getSampleSet(String(sampleSetId || "").trim());
    },
    getJob(jobId) {
      return jobs.get?.(jobId);
    },
    hasActiveJobs() {
      return jobs.hasActiveJobs();
    },
    listSampleSets() {
      return baseStore.listSampleSets();
    },
    start(body) {
      if (body.retryOfJobId && !body.items) return this.retry(String(body.retryOfJobId), body);
      const previousJob = body.retryOfJobId ? requireRetrySource(String(body.retryOfJobId)) : null;
      const batch = normalizeBatch(body, { recoveringLegacyUpscale: Boolean(previousJob) });
      if (!body.retryOfJobId) return admitBatch(batch);
      const previous = batches.get(String(body.retryOfJobId));
      if (previous) {
        return this.retry(String(body.retryOfJobId), { jobId: batch.jobId });
      }
      if (previousJob.result?.batchId !== batch.batchId || previousJob.featureMode !== batch.featureMode) {
        throw inputError("重试批次与原任务不一致");
      }
      if (previousJob.total !== batch.items.length) throw inputError("重试必须保留原批次全部 Run");
      const successful = new Map((previousJob.result?.results || []).map((result) => [result.index, result]));
      const states = batch.items.map((item, index) => {
        const result = successful.get(index);
        if (result && result.runId !== item.runId && !result.runId?.startsWith(`${item.runId}-A`)) {
          throw inputError("重试 Run 与原成功记录不一致");
        }
        return { item, index, attempt: result?.attempt || Math.max(item.attempt - 1,
          batch.featureMode === "imageOutpaint" && item.input.outpaintEngine === "gptImage25Sunburst" ? 1 : maxAttempts),
          generated: Boolean(result), synced: Boolean(result), archive: null, result: null,
          error: null, stage: "generation", publicResult: result, recoverArchived: !result };
      });
      batch.retryOfJobId = String(body.retryOfJobId);
      return admitBatch(batch, { states });
    },
    retry(jobId, body = {}) {
      requireRetrySource(jobId);
      const previous = batches.get(jobId);
      if (!previous) throw Object.assign(inputError("原批次执行上下文已过期；请使用原冻结批次恢复重试"), { statusCode: 409 });
      const batch = { ...previous.batch, jobId: String(body.jobId || "").trim(), retryOfJobId: jobId };
      if (!/^beta-[A-Za-z0-9-]{12,80}$/.test(batch.jobId) || batch.jobId === jobId) throw inputError("请为重试创建新的 Beta任务 ID");
      return admitBatch(batch, previous);
    },
  };
}

export function createBetaApiHandler({ getAgentModels, readJson, sendImage, sendJson, service }) {
  return async function handleBetaApi(request, response, pathname) {
    if (request.method === "GET" && pathname === "/api/beta/config") {
      sendJson(response, 200, await service.config());
      return true;
    }
    if (request.method === "GET" && pathname === "/api/beta/sample-sets") {
      sendJson(response, 200, { sampleSets: await service.listSampleSets() });
      return true;
    }
    if (request.method === "POST" && pathname === "/api/beta/sample-sets") {
      const body = await readJson(request);
      if (body.samples?.length) throw inputError("请先创建样本集，再逐张上传样本");
      sendJson(response, 201, { sampleSet: await service.createSampleSet(body) });
      return true;
    }
    const sampleImageRoute = pathname.match(/^\/api\/beta\/sample-sets\/([^/]+)\/samples\/([^/]+)\/image$/);
    if (request.method === "GET" && sampleImageRoute) {
      sendImage(response, await service.getSampleImage(decodeURIComponent(sampleImageRoute[1]), decodeURIComponent(sampleImageRoute[2])));
      return true;
    }
    const sampleUploadRoute = pathname.match(/^\/api\/beta\/sample-sets\/([^/]+)\/samples$/);
    if (request.method === "POST" && sampleUploadRoute) {
      sendJson(response, 201, { sample: await service.addSample(decodeURIComponent(sampleUploadRoute[1]), await readJson(request)) });
      return true;
    }
    const sampleCompleteRoute = pathname.match(/^\/api\/beta\/sample-sets\/([^/]+)\/complete$/);
    if (request.method === "POST" && sampleCompleteRoute) {
      sendJson(response, 200, { sampleSet: await service.completeSampleSet(decodeURIComponent(sampleCompleteRoute[1]), await readJson(request)) });
      return true;
    }
    if (request.method === "GET" && pathname.startsWith("/api/beta/sample-sets/")) {
      const sampleSetId = decodeURIComponent(pathname.slice("/api/beta/sample-sets/".length));
      const sampleSet = await service.getSampleSet(sampleSetId);
      sendJson(
        response,
        sampleSet ? 200 : 404,
        sampleSet ? { sampleSet } : { error: "样本集不存在或已归档" },
      );
      return true;
    }
    const retryRoute = pathname.match(/^\/api\/beta\/jobs\/([^/]+)\/retry$/);
    if (request.method === "POST" && retryRoute) {
      sendJson(response, 202, { job: await service.retry(decodeURIComponent(retryRoute[1]), await readJson(request)) });
      return true;
    }
    if (request.method === "GET" && pathname.startsWith("/api/beta/jobs/")) {
      const jobId = decodeURIComponent(pathname.slice("/api/beta/jobs/".length));
      const job = service.getJob(jobId);
      sendJson(
        response,
        job ? 200 : 404,
        job ? { job } : { error: "Beta跑图任务不存在或已过期" },
      );
      return true;
    }
    if (request.method === "POST" && pathname === "/api/beta/jobs") {
      const body = await readJson(request);
      if (["whiteModel", "emptyRoom", "styleTransfer"].includes(body.featureMode)) {
        assertBetaPromptAgentAccess(body, await getAgentModels());
      }
      sendJson(response, 202, { job: await service.start(body) });
      return true;
    }
    return false;
  };
}

/**
 * [INPUT]: 依赖日常生成任务批处理、工作台同源 generation-service 与含样本集/样本/跑图明细的 Beta Base Store，依赖 empty-room-type 房型校验和当前 Key 的 Prompt Agent 可用性，接收五功能可复用样本集和批量 Case Run
 * [OUTPUT]: 对外提供 Beta跑图配置、样本集目录/读取/创建、批次入队前 Prompt Agent 权限准入、测试时间归一化、不设 Run 数量上限的两路有界并发执行、单 Run 单图隔离与批次功能注入、生成/飞书同步双阶段快照、仅在附件回读成功后公开的轻量结果列表、含 ComfyUI 产物暂时不可读在内的瞬时错误自动重跑与飞书全量归档门槛
 * [POS]: src 的 Beta跑图应用服务，隔离整批队列总数与正式生成服务单次批次语义，分别记录模型生成和飞书回读进度，并只以后者为完成与结果可见条件
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { normalizeEmptyRoomType, normalizeEmptyRoomTypeDetail, EMPTY_ROOM_TYPE_DETAIL_MAX_LENGTH } from "./empty-room-type.mjs";

import {
  createGenerationJobRegistry,
  runGenerationJobBatch,
} from "./generation-jobs.mjs";

export const BETA_FEATURE_MODES = Object.freeze([
  "whiteModel",
  "emptyRoom",
  "refinedModel",
  "effectEnhancement",
  "free",
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
  if (!["whiteModel", "emptyRoom"].includes(batch?.featureMode)) return;
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
  if (samples.length < 1) throw inputError("样本集至少需要 1 个样本");
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
        image: {
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

function normalizeBatch(body = {}) {
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
    return {
      attempt: Number.isInteger(item.attempt) && item.attempt > 0 ? item.attempt : 1,
      caseId,
      input: {
        ...item.input,
        featureMode,
        ...(referenceImages ? { referenceImages } : {}),
        ...(styleReferenceImages ? { styleReferenceImages } : {}),
      },
      key: runId,
      label: String(item.label || caseId).slice(0, 160),
      modelLabel: String(item.modelLabel || item.input.modelKey || "").slice(0, 120),
      runId,
    };
  });
  return { batchId, featureMode, items: normalizedItems, jobId, testTime };
}

export function createBetaRunnerService({
  baseStore,
  generationService,
  jobs = createGenerationJobRegistry({ maxJobs: 12 }),
  maxAttempts = BETA_MAX_ATTEMPTS,
  sleep = delay,
} = {}) {
  if (!baseStore || !generationService) {
    throw new TypeError("Beta跑图需要独立 Base Store 与生成服务");
  }

  return {
    config() {
      return {
        baseUrl: baseStore.config.baseUrl,
        features: BETA_FEATURE_MODES,
        tableId: baseStore.config.tableId,
      };
    },
    createSampleSet(body) {
      return baseStore.createSampleSet(normalizeSampleSet(body));
    },
    getSampleSet(sampleSetId) {
      return baseStore.getSampleSet(String(sampleSetId || "").trim());
    },
    getJob(jobId) {
      return jobs.get(jobId);
    },
    listSampleSets() {
      return baseStore.listSampleSets();
    },
    start(body) {
      const batch = normalizeBatch(body);
      return jobs.enqueue(
        batch.jobId,
        {
          featureMode: batch.featureMode,
          stages: { generated: 0, synced: 0 },
          total: batch.items.length,
        },
        async (update) => {
          const generatedItems = new Set();
          const syncedItems = new Set();
          const syncedResults = [];
          const publicResults = () => [...syncedResults]
            .sort((left, right) => left.index - right.index);
          const updateStages = (message) => update({
            completed: syncedItems.size,
            message,
            result: {
              batchId: batch.batchId,
              results: publicResults(),
            },
            stages: {
              generated: generatedItems.size,
              synced: syncedItems.size,
            },
          });
          const outcomes = await runGenerationJobBatch({
            concurrency: 2,
            items: batch.items,
            async execute(item, index) {
              let lastError = null;
              for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
                const currentItem = attemptItem(item, attempt);
                let archive = null;
                try {
                  archive = await baseStore.beginRun({
                    batchId: batch.batchId,
                    featureMode: batch.featureMode,
                    item: currentItem,
                    testTime: batch.testTime,
                  });
                  const result = await generationService.executeForMode(
                    batch.featureMode,
                    singleRunGenerationInput(currentItem.input),
                  );
                  generatedItems.add(item.key);
                  updateStages(`已生成 ${generatedItems.size} / ${batch.items.length} · 正在同步飞书`);
                  const completedArchive = await baseStore.completeRun(
                    archive.recordId,
                    result,
                  );
                  syncedResults.push({
                    attempt: currentItem.attempt,
                    caseId: item.caseId,
                    index,
                    label: item.label,
                    modelLabel: item.modelLabel,
                    previewUrl: completedArchive.previewUrl || null,
                    recordUrl: completedArchive.recordUrl,
                    runId: currentItem.runId,
                  });
                  syncedItems.add(item.key);
                  updateStages(`已同步 ${syncedItems.size} / ${batch.items.length}`);
                  return { archive: completedArchive, attempt };
                } catch (error) {
                  lastError = error;
                  if (archive?.recordId) {
                    try {
                      await baseStore.failRun(archive.recordId, error);
                    } catch {
                      // 保留生成或首次归档错误，不用二次回写失败覆盖根因。
                    }
                  }
                  const reason = betaErrorMessage(error);
                  const retryable = isRetryableBetaError(error);
                  if (!retryable) {
                    throw new Error(`${item.label} · ${reason}（不可重试错误，已停止）`);
                  }
                  if (attempt >= maxAttempts) break;
                  update({
                    message: `${item.label} · ${reason} · 自动重试 ${attempt + 1}/${maxAttempts}`,
                  });
                  await sleep(500 * (2 ** (attempt - 1)));
                }
              }
              throw new Error(
                `${item.label} 共尝试 ${maxAttempts} 次后仍未同步飞书：${betaErrorMessage(lastError)}`,
              );
            },
          });
          const failed = outcomes.filter((outcome) => outcome.status === "rejected");
          if (failed.length) {
            const firstFailure = failed[0]?.reason?.message || "未知错误";
            throw new Error(
              `${failed.length} 张结果失败；${firstFailure}`,
            );
          }
          return {
            batchId: batch.batchId,
            outcomes,
            results: publicResults(),
          };
        },
      );
    },
  };
}

export function createBetaApiHandler({ getAgentModels, readJson, sendJson, service }) {
  return async function handleBetaApi(request, response, pathname) {
    if (request.method === "GET" && pathname === "/api/beta/config") {
      sendJson(response, 200, service.config());
      return true;
    }
    if (request.method === "GET" && pathname === "/api/beta/sample-sets") {
      sendJson(response, 200, { sampleSets: await service.listSampleSets() });
      return true;
    }
    if (request.method === "POST" && pathname === "/api/beta/sample-sets") {
      const body = await readJson(request);
      sendJson(response, 201, { sampleSet: await service.createSampleSet(body) });
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
      if (["whiteModel", "emptyRoom"].includes(body.featureMode)) {
        assertBetaPromptAgentAccess(body, await getAgentModels());
      }
      sendJson(response, 202, { job: service.start(body) });
      return true;
    }
    return false;
  };
}

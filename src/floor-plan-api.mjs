/**
 * [INPUT]: 依赖平面布局图片/几何识图服务、共享 generation-jobs 注册表及服务端注入的任务张数、OneAPI 图像连接/目录与JSON收发函数
 * [OUTPUT]: 提供布局 config/jobs、幂等提交、张数与恢复、逐图飞书归档准入和异步同步状态。私有原图和系统词不进入公开任务。
 * [POS]: src 的三个平面图出图入口与几何识别边界，不接管普通生图或重试收费任务。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { prepareGeometry, executeGeometry, readGeometryConfig } from './floor-plan-geometry.mjs';
import { createHash } from "node:crypto";
import { createGenerationJobRegistry } from "./generation-jobs.mjs";
import { readFloorPlanConfig, prepareFloorPlanInput, executeFloorPlan } from "./floor-plan-service.mjs";
import { floorPlanArchiveInput } from "./floor-plan-archive-input.mjs";

const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const keyDigest = (value) => createHash("sha256").update(String(value)).digest("hex");

export function createFloorPlanApiHandler({ getClient, getModels, requireKey = null, readJson, sendJson,
  generationJobs = createGenerationJobRegistry(), getPrompt, readPromptConfig,
  prefix = "/api/floor-plan", featureMode = "floorPlan", geometryEnabled = true,
  getTaskTotal = () => 1, scheduleArchive = null, verifyArchive = null,
  prepareInput = prepareFloorPlanInput, execute = executeFloorPlan, readConfig = readFloorPlanConfig } = {}) {
  const pending = new Map();
  const identities = new Map();
  let preparing = 0;

  function attachArchives(result, { jobId, input, prepared, compiledPrompt, submittedImageUrl }) {
    if (!scheduleArchive || prepared.action === "geometry") return result;
    const archive = (imageResult, slot, imageIndex, count) => {
      try {
        const payload = floorPlanArchiveInput({ featureMode, jobId, result: imageResult,
          sourceImage: input.referenceImage, submittedImageUrl, compiledPrompt: compiledPrompt || imageResult.compiledPrompt,
          slot, imageIndex, total: count, agentReceipt: result.receipts?.agent });
        return { ...imageResult, sync: scheduleArchive(payload) };
      } catch (error) {
        return { ...imageResult, sync: { status: "failed", error: error.message } };
      }
    };
    if (!Array.isArray(result.items)) return archive(result, 1, 1, 1);
    return { ...result, items: result.items.map((item, index) => item.status === "success"
      ? { ...item, result: archive(item.result, item.index, index + 1, result.items.length) } : item) };
  }

  async function createJob(jobId, input, fingerprint, total) {
    const existing = generationJobs.get(jobId);
    if (existing) {
      if (existing.featureMode !== featureMode) throw fail("任务ID已用于其他功能", 409);
      return existing;
    }
    if (identities.has(jobId)) throw fail("该平面布局任务已过期，请新建任务", 409);
    preparing += 1;
    try {
      const connection = requireKey ? keyDigest(requireKey()) : null;
      const prepare = geometryEnabled && input.action === "geometry" ? prepareGeometry : prepareInput;
      const prepared = await prepare(input, { getModels, getPrompt });
      if (verifyArchive && input.action !== "geometry") {
        const modelLabels = prepared.batch?.models.map(({ model }) => model.label) || [prepared.model.label];
        await verifyArchive({ featureMode, modelLabels, agentLabels: prepared.agent ? [prepared.agent.label] : [] });
      }
      const assertConnection = () => {
        if (requireKey && keyDigest(requireKey()) !== connection) throw fail("OneAPI连接已变更，请刷新配置后新建布局任务", 409);
      };
      assertConnection();
      identities.set(jobId, fingerprint);
      return generationJobs.enqueue(jobId, { featureMode, total }, async (update) => {
        assertConnection();
        let client;
        try { client = await getClient(); }
        catch { throw fail("平面布局图像连接不可用，请检查OneAPI设置", 409); }
        assertConnection();
        try {
          const run = geometryEnabled && prepared.action === "geometry" ? executeGeometry : execute;
          let compiledPrompt;
          let submittedImageUrl = prepared.guide?.imageUrl || prepared.imageUrl;
          const result = await run(prepared, { client, getModels: async (...args) => {
            assertConnection();
            const models = await getModels(...args);
            assertConnection();
            return models;
          }, getPrompt, onProgress: update, assertConnection, onCompiledPrompt(prompt, imageUrl) {
            compiledPrompt = prompt;
            if (imageUrl) submittedImageUrl = imageUrl;
          } });
          return attachArchives(result, { jobId, input, prepared, compiledPrompt, submittedImageUrl });
        } catch (error) {
          if (error?.floorPlanSafe && error.floorPlanDiagnostic) update({ result: { diagnostic: error.floorPlanDiagnostic } });
          throw error;
        }
      });
    } finally { preparing -= 1; }
  }

  async function handler(request, response, pathname) {
    if (geometryEnabled && request.method === "GET" && pathname === `${prefix}/geometry-config`) {
      sendJson(response, 200, await readGeometryConfig({ getModels }));
      return true;
    }
    if (request.method === "GET" && pathname === `${prefix}/config`) {
      const forceRefresh = new URL(request.url || pathname, "http://127.0.0.1").searchParams.get("refresh") === "1";
      const config = await readConfig({ getModels, readPromptConfig, forceRefresh });
      if (!verifyArchive) { sendJson(response, 200, config); return true; }
      try {
        await verifyArchive({ featureMode });
        sendJson(response, 200, { ...config, archive: { required: true, available: true } });
      } catch (error) {
        const reason = `飞书生成记录不可用：${error.message}`;
        sendJson(response, 200, { ...config, available: false, reason, continuationAvailable: false, continuationReason: reason,
          archive: { required: true, available: false, reason } });
      }
      return true;
    }
    const suffix = pathname.startsWith(`${prefix}/jobs/`) ? pathname.slice(`${prefix}/jobs/`.length) : "";
    const route = suffix && !suffix.includes("/") ? [pathname, suffix] : null;
    if (request.method === "GET" && route) {
      let id;
      try { id = decodeURIComponent(route[1]); } catch { throw fail("布局任务ID无效"); }
      const found = generationJobs.get(id);
      const waiting = pending.get(id);
      const preparingJob = waiting ? { jobId: id, featureMode, status: "running", total: waiting.total,
        completed: 0, result: null, error: null, message: "正在检查图片与图像配置" } : null;
      const job = found?.featureMode === featureMode ? found : preparingJob;
      sendJson(response, job ? 200 : 404, job ? { job } : { error: "平面布局任务不存在或已过期" });
      return true;
    }
    if (request.method !== "POST" || pathname !== `${prefix}/jobs`) return false;
    const body = await readJson(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw fail("布局任务必须是有效对象");
    const { jobId, ...input } = body;
    if (typeof jobId !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{7,159}$/.test(jobId)) throw fail("布局任务ID无效");
    const fingerprint = digest(input);
    const previous = identities.get(jobId) || pending.get(jobId)?.fingerprint;
    if (previous && previous !== fingerprint) throw fail("同一布局任务ID不能用于不同输入，请新建任务", 409);
    let operation = pending.get(jobId)?.operation;
    if (!operation) {
      const total = getTaskTotal(input);
      operation = createJob(jobId, input, fingerprint, total);
      pending.set(jobId, { fingerprint, operation, total });
    }
    let job;
    try { job = await operation; }
    finally { if (pending.get(jobId)?.operation === operation) pending.delete(jobId); }
    sendJson(response, 202, { job });
    return true;
  }
  handler.hasActiveJobs = () => preparing > 0 || generationJobs.hasActiveJobs();
  return handler;
}

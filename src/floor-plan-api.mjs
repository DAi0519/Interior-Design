/**
 * [INPUT]: 依赖平面布局图片/几何识图服务、共享 generation-jobs 注册表及服务端注入的 OneAPI 图像连接/目录与JSON收发函数
 * [OUTPUT]: 对外提供可注入命名空间的平面布局 config/jobs 查询与幂等提交、准备期恢复和更新忙碌守卫；失败任务保留脱敏诊断，Prompt正文与输入图片闭包不进入公开任务
 * [POS]: src 的独立平面布局HTTP边界，不接管普通生图接口、不写旧生成记录、不重试收费任务
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { prepareGeometry, executeGeometry, readGeometryConfig } from './floor-plan-geometry.mjs';
import { createHash } from "node:crypto";
import { createGenerationJobRegistry } from "./generation-jobs.mjs";
import { readFloorPlanConfig, prepareFloorPlanInput, executeFloorPlan } from "./floor-plan-service.mjs";

const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const keyDigest = (value) => createHash("sha256").update(String(value)).digest("hex");

export function createFloorPlanApiHandler({ getClient, getModels, requireKey = null, readJson, sendJson,
  generationJobs = createGenerationJobRegistry(), getPrompt, readPromptConfig,
  prefix = "/api/floor-plan", featureMode = "floorPlan", geometryEnabled = true,
  prepareInput = prepareFloorPlanInput, execute = executeFloorPlan, readConfig = readFloorPlanConfig } = {}) {
  const pending = new Map();
  const identities = new Map();
  let preparing = 0;

  async function createJob(jobId, input, fingerprint) {
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
      const assertConnection = () => {
        if (requireKey && keyDigest(requireKey()) !== connection) throw fail("OneAPI连接已变更，请刷新配置后新建布局任务", 409);
      };
      assertConnection();
      identities.set(jobId, fingerprint);
      return generationJobs.enqueue(jobId, { featureMode, total: 1 }, async (update) => {
        assertConnection();
        let client;
        try { client = await getClient(); }
        catch { throw fail("平面布局图像连接不可用，请检查OneAPI设置", 409); }
        assertConnection();
        try {
          const run = geometryEnabled && prepared.action === "geometry" ? executeGeometry : execute;
          return await run(prepared, { client, getModels: async (...args) => {
            assertConnection();
            const models = await getModels(...args);
            assertConnection();
            return models;
          }, getPrompt, onProgress: update });
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
      sendJson(response, 200, await readConfig({ getModels, readPromptConfig, forceRefresh }));
      return true;
    }
    const suffix = pathname.startsWith(`${prefix}/jobs/`) ? pathname.slice(`${prefix}/jobs/`.length) : "";
    const route = suffix && !suffix.includes("/") ? [pathname, suffix] : null;
    if (request.method === "GET" && route) {
      let id;
      try { id = decodeURIComponent(route[1]); } catch { throw fail("布局任务ID无效"); }
      const found = generationJobs.get(id);
      const preparingJob = pending.has(id) ? { jobId: id, featureMode, status: "running", total: 1,
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
      operation = createJob(jobId, input, fingerprint);
      pending.set(jobId, { fingerprint, operation });
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

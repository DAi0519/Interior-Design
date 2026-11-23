/**
 * [INPUT]: 依赖共享生成任务注册表、JSON读写、独立AI模特生成服务及本机OneAPI会话
 * [OUTPUT]: 提供模型目录和幂等单图任务接口、只读恢复及可下载结果回执数据
 * [POS]: src 的AI模特HTTP边界，模型准入和生成复用同一会话，纳入应用更新忙碌守卫
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createHash } from "node:crypto";
import { createGenerationJobRegistry } from "./generation-jobs.mjs";
import { SCENE_CAST_FEATURE, readSceneCastConfig, prepareSceneCastInput, assertSceneCastModelAccess, executeSceneCast } from "./scene-cast-service.mjs";

const PREFIX = "/api/scene-cast";
const JOB_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{7,159}$/;
const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const isObject = value => value && typeof value === "object" && !Array.isArray(value);

export function createSceneCastApiHandler({ getImageClient, getOneApiModels, readJson, sendJson,
  generationJobs = createGenerationJobRegistry() }) {
  const pending = new Map();
  const admitted = new Map();

  async function admit(jobId, input, fingerprint) {
    const prepared = await prepareSceneCastInput(input);
    const client = getImageClient();
    await assertSceneCastModelAccess(client, prepared);
    admitted.set(jobId, fingerprint);
    return generationJobs.enqueue(jobId, { featureMode: SCENE_CAST_FEATURE, total: 1 }, (update) => executeSceneCast(prepared, {
      client,
      onProgress(progress) { update({ message: progress.message, stages: progress }); },
    }));
  }

  async function handler(request, response, pathname) {
    if (request.method === "GET" && pathname === `${PREFIX}/config`) {
      sendJson(response, 200, await readSceneCastConfig({ getOneApiModels }));
      return true;
    }
    if (request.method === "GET" && pathname.startsWith(`${PREFIX}/jobs/`)) {
      const jobId = pathname.slice(`${PREFIX}/jobs/`.length);
      if (!JOB_ID.test(jobId)) throw fail("AI模特任务ID无效");
      const job = generationJobs.get(jobId) || (pending.has(jobId) ? { jobId, featureMode: SCENE_CAST_FEATURE,
        status: "running", total: 1, completed: 0, message: "正在核验AI模特设置", result: null, error: null } : null);
      sendJson(response, job ? 200 : 404, job ? { job } : { error: "AI模特任务不存在或已过期" });
      return true;
    }
    if (request.method !== "POST" || pathname !== `${PREFIX}/jobs`) return false;
    const body = await readJson(request);
    if (!isObject(body) || typeof body.jobId !== "string" || !JOB_ID.test(body.jobId)) throw fail("AI模特任务ID无效");
    const { jobId, ...rest } = body;
    const input = Object.hasOwn(rest, "input") ? rest.input : rest;
    if (!isObject(input) || (Object.hasOwn(rest, "input") && Object.keys(rest).length !== 1)) throw fail("AI模特任务请求格式无效");
    const fingerprint = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    const previous = admitted.get(jobId) || pending.get(jobId)?.fingerprint;
    if (previous && previous !== fingerprint) throw fail("同一任务ID不能用于不同输入，请新建任务", 409);
    const existing = generationJobs.get(jobId);
    if (existing) {
      sendJson(response, 202, { job: existing });
      return true;
    }
    if (admitted.has(jobId)) throw fail("AI模特任务已超过结果保留期，请新建任务", 409);
    let operation = pending.get(jobId)?.operation;
    if (!operation) {
      operation = admit(jobId, input, fingerprint);
      pending.set(jobId, { fingerprint, operation });
    }
    let job;
    try { job = await operation; }
    finally { if (pending.get(jobId)?.operation === operation) pending.delete(jobId); }
    sendJson(response, 202, { job });
    return true;
  }
  handler.hasActiveJobs = () => pending.size > 0 || generationJobs.hasActiveJobs();
  return handler;
}

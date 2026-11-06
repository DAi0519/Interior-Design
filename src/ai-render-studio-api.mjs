/**
 * [INPUT]: 依赖独立渲染台服务、OneAPI权限、共享生成/同步注册表及可续传飞书归档执行器
 * [OUTPUT]: 含GPT2.6 Sunburst/Flare独立模型身份； 对外提供config/jobs/sync-retry路由、生成幂等与实时归档状态；私有图像/Prompt闭包不进入HTTP结果
 * [POS]: src 的AI渲染台HTTP边界，归档失败只重试原图结果同步，忙碌守卫覆盖生成与同步
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createHash } from "node:crypto";
import { createGenerationJobRegistry } from "./generation-jobs.mjs";
import { createSyncJobRegistry } from "./sync-jobs.mjs";
import { readAiRenderStudioConfig, prepareAiRenderStudioInput, executeAiRenderStudio } from "./ai-render-studio-service.mjs";
import { syncAiRenderStudioToLark } from "./ai-render-studio-sync.mjs";
import { RELIGHT_MODEL_KEY } from "../public/image-relight-geometry.js";

const PREFIX = "/api/ai-render-studio";
const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const inputDigest = (input) => createHash("sha256").update(JSON.stringify(input)).digest("hex");

export function createAiRenderStudioApiHandler({ getImageClient, getOneApiModels, readJson, sendJson,
  generationJobs = createGenerationJobRegistry(), getPrompt, readPromptConfig, onReceipt = null, loadLightingAssets,
  syncJobs = createSyncJobRegistry(), syncGeneration = syncAiRenderStudioToLark, verifySyncContract,
  prepareInput = prepareAiRenderStudioInput, execute = executeAiRenderStudio, readConfig = readAiRenderStudioConfig } = {}) {
  const pending = new Map();
  const identities = new Map();
  const syncEntries = new Map();
  let preparing = 0;

  function startSync(jobId, factory = null) {
    let entry = syncEntries.get(jobId);
    const current = entry ? syncJobs.get(entry.generationId) : null;
    if (current?.status === "pending" || current?.status === "success") return current;
    if (!entry) { entry = { factory, attempt: 0, generationId: null }; syncEntries.set(jobId, entry); }
    if (factory) entry.factory = factory;
    if (!entry.factory) throw fail("该任务缺少可重试的归档状态，请保留结果联系维护者", 409);
    entry.attempt += 1;
    entry.generationId = `studio-sync-${jobId}-${entry.attempt}`;
    return syncJobs.enqueue(entry.generationId, async () => {
      const result = await syncGeneration(entry.factory());
      if (result?.ok !== false) entry.factory = null;
      return result;
    });
  }

  function publicJob(job) {
    if (!job?.result) return job;
    const entry = syncEntries.get(job.jobId);
    const sync = entry ? syncJobs.get(entry.generationId) : null;
    return sync ? { ...job, result: { ...job.result, sync } } : job;
  }

  async function createJob(jobId, input, fingerprint) {
    const existing = generationJobs.get(jobId);
    if (existing) {
      if (existing.featureMode !== "aiRenderStudio") throw fail("任务ID已用于其他功能", 409);
      return existing;
    }
    if (identities.has(jobId)) throw fail("该任务已超过结果保留期，请新建任务", 409);
    for (const [id, entry] of syncEntries) {
      if (!generationJobs.get(id) && syncJobs.get(entry.generationId)?.status !== "pending") syncEntries.delete(id);
    }
    preparing += 1;
    try {
      const prepared = await prepareInput(input, { getPrompt, getOneApiModels, verifySyncContract, loadLightingAssets });
      identities.set(jobId, fingerprint);
      return generationJobs.enqueue(jobId, { featureMode: "aiRenderStudio", total: 1 }, async (update) => {
        let imageClient;
        try { imageClient = await getImageClient(prepared.validated?.modelKey || input.modelKey || RELIGHT_MODEL_KEY); }
        catch { throw fail("AI渲染台模型连接不可用，请检查设置", 409); }
        return execute(prepared, { imageClient, getOneApiModels, onReceipt, verifySyncContract, jobId, loadLightingAssets,
          scheduleSync: (factory) => startSync(jobId, factory),
          onProgress(progress) { update({ message: progress.message || "AI渲染台正在生成", stages: progress }); } });
      });
    } finally { preparing -= 1; }
  }

  async function handler(request, response, pathname) {
    if (request.method === "GET" && pathname === `${PREFIX}/config`) {
      const forceRefresh = new URL(request.url || pathname, "http://127.0.0.1").searchParams.get("refresh") === "1";
      sendJson(response, 200, await readConfig({ getOneApiModels, readPromptConfig, verifySyncContract, forceRefresh, loadLightingAssets }));
      return true;
    }
    const retryRoute = pathname.match(/^\/api\/ai-render-studio\/jobs\/([^/]+)\/sync-retry$/);
    if (request.method === "POST" && retryRoute) {
      let id;
      try { id = decodeURIComponent(retryRoute[1]); } catch { throw fail("任务ID格式无效"); }
      const body = await readJson(request);
      if (body && (typeof body !== "object" || Array.isArray(body) || Object.keys(body).length)) throw fail("同步重试不接受新的生成参数");
      const job = generationJobs.get(id);
      if (job?.featureMode !== "aiRenderStudio" || job.status !== "success" || !job.result?.images?.length) throw fail("只能重试已有结果的飞书同步", 409);
      startSync(id);
      sendJson(response, 202, { job: publicJob(job) });
      return true;
    }
    if (request.method === "GET" && pathname.startsWith(`${PREFIX}/sync-jobs/`)) {
      const id = decodeURIComponent(pathname.slice(`${PREFIX}/sync-jobs/`.length));
      const sync = syncJobs.get(id);
      sendJson(response, sync ? 200 : 404, sync ? { sync } : { error: "AI渲染台同步任务不存在或已过期" });
      return true;
    }
    if (request.method === "GET" && pathname.startsWith(`${PREFIX}/jobs/`)) {
      let id;
      try { id = decodeURIComponent(pathname.slice(`${PREFIX}/jobs/`.length)); }
      catch { throw fail("AI渲染台任务ID格式无效"); }
      const found = generationJobs.get(id);
      const preparingJob = pending.has(id) ? { jobId: id, featureMode: "aiRenderStudio", status: "running",
        total: 1, completed: 0, result: null, error: null, message: "正在核验渲染配置" } : null;
      const job = found?.featureMode === "aiRenderStudio" ? found : preparingJob;
      sendJson(response, job ? 200 : 404, job ? { job: publicJob(job) } : { error: "AI渲染台任务不存在或已过期" });
      return true;
    }
    if (request.method !== "POST" || pathname !== `${PREFIX}/jobs`) return false;
    const body = await readJson(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw fail("AI渲染台任务必须是有效对象");
    const jobId = body.jobId;
    if (typeof jobId !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{7,159}$/.test(jobId)) throw fail("AI渲染台任务ID无效");
    let input;
    if (Object.hasOwn(body, "input")) {
      if (Object.keys(body).some((key) => !["jobId", "input"].includes(key))) throw fail("AI渲染台任务外层包含未知字段");
      input = body.input;
    } else {
      const { jobId: unusedJobId, ...flatInput } = body;
      input = flatInput;
    }
    if (!input || typeof input !== "object" || Array.isArray(input)) throw fail("AI渲染台任务输入无效");
    const fingerprint = inputDigest(input);
    const previous = identities.get(jobId) || pending.get(jobId)?.fingerprint;
    if (previous && previous !== fingerprint) throw fail("同一任务ID不能用于不同输入，请新建任务", 409);
    let operation = pending.get(jobId)?.operation;
    if (!operation) {
      operation = createJob(jobId, input, fingerprint);
      pending.set(jobId, { operation, fingerprint });
    }
    let job;
    try { job = await operation; }
    finally { if (pending.get(jobId)?.operation === operation) pending.delete(jobId); }
    sendJson(response, 202, { job: publicJob(job) });
    return true;
  }
  handler.hasActiveJobs = () => preparing > 0 || generationJobs.hasActiveJobs() || syncJobs.hasActiveJobs();
  return handler;
}

/**
 * [INPUT]: 依赖http-response的统一响应写入；依赖floor-plan-camera-service的平面机位渲染与任务张数计算；依赖beta-house-plan的主服务适配；依赖floor-plan-api的独立识图/任务、ai-render-studio-api的生成/同步与http-security的同源嵌入策略，以及独立精模光影基础目录、光影库同源预览/精模Flux双图与R5_4全景专用客户端、GPT打光Prompt/强制刷新与Flux/Qwen/Sunburst遮罩服务、ComfyUI/OneAPI目录、HTTP/静态文件、更新/安装、本机设置、飞书Schema及日常/Beta/Benchmark工作流
 * [OUTPUT]: 提供三个平面图出图入口与逐图飞书归档，归档状态查询和续传；组合AI渲染台、主工作台、Beta、模型评测、更新忙碌守卫及配置、连接、生成和下载接口。
 * [POS]: 项目根 HTTP 组合入口，隔离浏览器、本机凭据、OneAPI、ComfyUI 超分与生图、新旧飞书 Base 及三套工作台边界
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createReadStream, existsSync } from "node:fs";
import { createServer } from "node:http";
import { sendJson, sendDownload, sendImage } from "./src/http-response.mjs";
import { SECURITY_HEADERS, staticSecurityHeaders } from "./src/http-security.mjs";
import { randomUUID } from "node:crypto";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import packageInfo from "./package.json" with { type: "json" };
import { createAppUpdateService } from "./src/app-update.mjs";
import { createAppInstaller } from "./src/app-installer.mjs";
import { createAppUpdateApiHandler } from "./src/app-update-api.mjs";
import { checkAgentModelAvailability, publicAgentModelCatalog } from "./src/agent-model-config.mjs";
import { createComfyUiClient } from "./src/comfyui-client.mjs";
import { createRefinedFluxClient } from "./src/refined-flux-reference.mjs";
import { createPanoramaClient } from "./src/panorama-client.mjs";
import { EMPTY_ROOM_FURNITURE, OTHER_FURNITURE_MAX_LENGTH } from "./src/empty-room-furniture.mjs";
import { EMPTY_ROOM_TYPES, EMPTY_ROOM_TYPE_DETAIL_MAX_LENGTH } from "./src/empty-room-type.mjs";
import { createBetaHousePlanService } from "./src/beta-house-plan.mjs";
import { captureBetaGenerationArchive, createBetaBaseStore } from "./src/beta-base.mjs";
import { readBetaUpscaleConfig } from "./src/beta-upscale.mjs";
import { createBetaApiHandler, createBetaRunnerService } from "./src/beta-runner.mjs";
import { readGenerationConfig } from "./src/generation-config.mjs";
import { createGenerationJobApiHandler, supportedGenerationFeatureCapabilities, supportedGenerationFeatureModes } from "./src/generation-job-api.mjs";
import { createGenerationJobRegistry } from "./src/generation-jobs.mjs";
import { createAiRenderStudioApiHandler } from "./src/ai-render-studio-api.mjs";
import { createFloorPlanApiHandler } from "./src/floor-plan-api.mjs";
import { readHousePlanConfig, prepareHousePlanInput, executeHousePlan } from "./src/house-plan-service.mjs";
import { readFloorPlanCameraConfig, prepareFloorPlanCameraInput, executeFloorPlanCamera, floorPlanCameraTaskTotal } from "./src/floor-plan-camera-service.mjs";
import { createGenerationService } from "./src/generation-service.mjs";
import { readMultiAngleConfig } from "./src/image-multi-angle-service.mjs";
import { IMAGE_MASK_FILL_CLIENT_OPTIONS } from "./src/image-mask-fill-workflow.mjs";
import { QWEN_MASK_FILL_CLIENT_OPTIONS } from "./src/image-mask-fill-qwen.mjs";
import { createImageToolsApiHandler } from "./src/image-tools-api.mjs";
import { MULTI_ANGLE, createMultiAngleWorkflow, multiAngleMetadata, multiAngleArtifactPrefix } from "./src/image-multi-angle-workflow.mjs";
import { IMAGE_OUTPAINT_CLIENT_OPTIONS } from "./src/image-outpaint-workflow.mjs";
import { QWEN_OUTPAINT_CLIENT_OPTIONS } from "./src/image-outpaint-qwen.mjs";
import { createImageOutpaintConfigReader } from "./src/image-outpaint-service.mjs";
import {
  IMAGE_UPSCALE_OUTPUT_NODE_ID,
  createImageUpscaleWorkflow,
  imageUpscaleArtifactPrefix,
  imageUpscaleWorkflowMetadata,
} from "./src/image-upscale-workflow.mjs";
import { prepareGeneratedImageDownload } from "./src/image-download.mjs";
import { imageProviderForModel, publicModelCatalog } from "./src/model-config.mjs";
import { benchmarkBaseConfigFromEnv, createBenchmarkBaseStore } from "./src/benchmark-base.mjs";
import { createBenchmarkJobRegistry } from "./src/benchmark-jobs.mjs";
import { createBenchmarkWorkbenchService } from "./src/benchmark-workbench.mjs";
import { createBenchmarkWorkbenchStore } from "./src/benchmark-workbench-store.mjs";
import { syncGenerationToLark, verifyLarkSyncSchema } from "./src/lark-sync.mjs";
import { verifyFloorPlanArchiveSchema } from "./src/floor-plan-archive.mjs";
import { createFloorPlanArchiveScheduler } from "./src/floor-plan-archive-input.mjs";
import { createLarkSetupService } from "./src/lark-setup.mjs";
import { hasPersistedOneApiKey, persistOneApiKey, removePersistedOneApiKey } from "./src/local-settings.mjs";
import { OneApiError, createOneApiClient } from "./src/oneapi-client.mjs";
import {
  EMPTY_ROOM_PROMPT_CONFIG,
  STYLE_DNA_REVERSE_PROMPT_CONFIG,
  STYLE_TRANSFER_PROMPT_CONFIG,
  getPublishedPromptAgent,
  publicRoomRenovationConfig,
  publicStyleTransferConfig,
} from "./src/prompt-agent.mjs";
import { publicRefinedLightingBasePromptConfig } from "./src/refined-model-prompt.mjs";
import { readRefinedLightingPreview } from "./src/refined-lighting-library.mjs";
import { listPublicStyles } from "./src/style-library.mjs";
import { createAsyncTtlCache } from "./src/runtime-cache.mjs";
import { createSyncJobRegistry } from "./src/sync-jobs.mjs";
import { executeStyleDnaReverse, publicStyleDnaReverseConfig } from "./src/style-dna-reverse.mjs";
const HOST = "127.0.0.1";
const PORT = Number.parseInt(process.env.PORT || "4173", 10);
const appUpdates = createAppUpdateService({ currentVersion: packageInfo.version });
const ROOT_DIR = fileURLToPath(new URL(".", import.meta.url));
const appInstaller = createAppInstaller({ installBaseDir: process.env.INSTALL_BASE_DIR || null, currentRootDir: ROOT_DIR });
let activeApiMutations = 0;
const handleAppUpdateApi = createAppUpdateApiHandler({
  appUpdates, appInstaller, readJson, sendJson,
  hasActiveJobs: () => activeApiMutations > 0 || generationJobs.hasActiveJobs()
    || syncJobs.hasActiveJobs() || benchmarkJobs.hasActiveJobs() || betaRunner.hasActiveJobs()
    || handleAiRenderStudioApi.hasActiveJobs() || handleFloorPlanApi.hasActiveJobs() || handleHousePlanApi.hasActiveJobs()
    || handleFloorPlanCameraApi.hasActiveJobs(),
});
const PUBLIC_DIR = join(ROOT_DIR, "public");
const INTER_VARIABLE_LATIN_FONT = join(ROOT_DIR, "node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2");
const PANNELLUM_ASSETS = Object.freeze({
  "/vendor/pannellum.css": join(ROOT_DIR, "node_modules/pannellum/build/pannellum.css"),
  "/vendor/pannellum.js": join(ROOT_DIR, "node_modules/pannellum/build/pannellum.js"),
});
const BENCHMARK_STATE_FILE = join(ROOT_DIR, ".benchmark-workbench", "state.json");
const MAX_JSON_BYTES = 30 * 1024 * 1024;
const WHITE_MODEL_PROMPT_CACHE_MAX_ENTRIES = 50;
const WHITE_MODEL_PROMPT_CACHE_TTL_MS = 60 * 60 * 1000;
async function persistedOneApiKey() {
  try {
    return await hasPersistedOneApiKey();
  } catch {
    return false;
  }
}
let sessionApiKey = normalizeApiKey(process.env.ONEAPI_API_KEY || "");
let sessionApiKeySource = sessionApiKey
  ? (await persistedOneApiKey())
    ? "local-file"
    : "environment"
  : "none";
let sessionModelCatalog = null;
let sessionModelCatalogRequest = null;
const syncJobs = createSyncJobRegistry();
const generationJobs = createGenerationJobRegistry();
const benchmarkJobs = createBenchmarkJobRegistry();
const larkSetup = createLarkSetupService();
const comfyUiClient = createRefinedFluxClient();
const panoramaClient = createPanoramaClient();
const imageMultiAngleClient = createComfyUiClient({ artifactPrefix: multiAngleArtifactPrefix, outputNodeId: MULTI_ANGLE.outputNodeId, workflowFactory: createMultiAngleWorkflow, workflowMetadataFactory: multiAngleMetadata });
const imageOutpaintClient = createComfyUiClient(IMAGE_OUTPAINT_CLIENT_OPTIONS);
const qwenImageClient = createComfyUiClient(QWEN_OUTPAINT_CLIENT_OPTIONS);
const imageMaskFillClient = createComfyUiClient(IMAGE_MASK_FILL_CLIENT_OPTIONS), qwenMaskFillClient = createComfyUiClient(QWEN_MASK_FILL_CLIENT_OPTIONS);
const getImageMaskFillConfig = () => generationService.getImageMaskFillConfig();
const getImageRelightConfig = (options = {}) => generationService.getImageRelightConfig(options);
const getImageMultiAngleConfig = () => readMultiAngleConfig(imageMultiAngleClient,
  { getOneApiModels: () => getSessionModelCatalog(createOneApiClient(requireApiKey()), { force: true }) });
const getImageOutpaintConfig = createImageOutpaintConfigReader(imageOutpaintClient,
  { qwenImageClient, getOneApiModels: () => getSessionModelCatalog(createOneApiClient(requireApiKey())) });
const imageUpscaleClient = createComfyUiClient({
  artifactPrefix: imageUpscaleArtifactPrefix,
  outputNodeId: IMAGE_UPSCALE_OUTPUT_NODE_ID,
  workflowFactory: createImageUpscaleWorkflow,
  workflowMetadataFactory: imageUpscaleWorkflowMetadata,
});
const whiteModelPromptResultCache = createAsyncTtlCache({
  maxEntries: WHITE_MODEL_PROMPT_CACHE_MAX_ENTRIES,
  ttlMs: WHITE_MODEL_PROMPT_CACHE_TTL_MS,
});
let benchmarkWorkbench = null;
const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};
function normalizeApiKey(value) {
  const key = String(value || "").trim();
  return key.replace(/^Bearer\s+/i, "");
}
async function readJson(request) {
  const chunks = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    totalBytes += chunk.length;
    if (totalBytes > MAX_JSON_BYTES) {
      const error = new Error("请求体过大");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  if (chunks.length === 0) return {};

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("请求体不是有效 JSON");
    error.statusCode = 400;
    throw error;
  }
}
function requireApiKey() {
  if (!sessionApiKey) {
    const error = new Error("请先连接 API Key");
    error.statusCode = 401;
    throw error;
  }
  return sessionApiKey;
}
function imageClientForModel(modelKey, { oneApiClient = null } = {}) {
  return imageProviderForModel(modelKey) === "comfyui"
    ? comfyUiClient
    : oneApiClient || createOneApiClient(requireApiKey());
}
function clearSessionModelCatalog() {
  sessionModelCatalog = null;
  sessionModelCatalogRequest = null;
}

function getBenchmarkWorkbench() {
  if (benchmarkWorkbench) return benchmarkWorkbench;
  benchmarkWorkbench = createBenchmarkWorkbenchService({
    baseStore: createBenchmarkBaseStore(benchmarkBaseConfigFromEnv()),
    localStore: createBenchmarkWorkbenchStore(
      process.env.BENCHMARK_WORKBENCH_STATE_FILE || BENCHMARK_STATE_FILE,
    ),
  });
  return benchmarkWorkbench;
}

async function verifyLarkConfiguration() {
  await Promise.all([
    verifyLarkSyncSchema(),
    listPublicStyles(),
    publicRefinedLightingBasePromptConfig(),
    getPublishedPromptAgent("white-model-fusion"),
    getPublishedPromptAgent("white-model-smart-default"),
    getPublishedPromptAgent("empty-room-smart-default", {
      config: EMPTY_ROOM_PROMPT_CONFIG,
    }),
    getPublishedPromptAgent("empty-room-fusion", {
      config: EMPTY_ROOM_PROMPT_CONFIG,
    }),
    // -------- 旧房独立降级，由本功能出图准入阻断，不牵连普通空房 --------
    publicRoomRenovationConfig(),
    getPublishedPromptAgent("style-transfer-reference", {
      config: STYLE_TRANSFER_PROMPT_CONFIG,
    }),
    getPublishedPromptAgent("style-transfer-fusion", {
      config: STYLE_TRANSFER_PROMPT_CONFIG,
    }),
    getPublishedPromptAgent("style-dna-reverse", {
      config: STYLE_DNA_REVERSE_PROMPT_CONFIG,
    }),
  ]);
}

async function publicSession() {
  return {
    connected: Boolean(sessionApiKey),
    persisted: await persistedOneApiKey(),
    source: sessionApiKey ? sessionApiKeySource : "none",
  };
}

async function publicBenchmarkModelAccess() {
  const session = await publicSession();
  const imageModels = publicAgentModelCatalog().filter((model) => model.imageInput);
  if (!session.connected) {
    return {
      error: "请先在连接中心接入 OneAPI Key",
      models: imageModels.map((model) => ({
        ...model,
        available: false,
        reason: "API 未连接",
        selectable: false,
      })),
      session,
    };
  }
  try {
    const availableModels = await getSessionModelCatalog(
      createOneApiClient(sessionApiKey),
    );
    return {
      error: null,
      models: checkAgentModelAvailability(availableModels).filter((model) => model.imageInput),
      session,
    };
  } catch (error) {
    return {
      error: error.message,
      models: imageModels.map((model) => ({
        ...model,
        available: false,
        reason: "模型目录读取失败",
        selectable: false,
      })),
      session,
    };
  }
}

async function getSessionModelCatalog(client, { force = false } = {}) {
  if (!force && sessionModelCatalog) return sessionModelCatalog;
  if (!force && sessionModelCatalogRequest) return sessionModelCatalogRequest;

  const request = client.listModels();
  sessionModelCatalogRequest = request;
  try {
    const models = await request;
    if (sessionModelCatalogRequest === request) sessionModelCatalog = models;
    return models;
  } finally {
    if (sessionModelCatalogRequest === request) {
      sessionModelCatalogRequest = null;
    }
  }
}

function scheduleGenerationSync(input) {
  const generationId = randomUUID();
  const syncInput = {
    ...input,
    workflow: { ...(input.workflow || {}), generationId },
  };
  return syncJobs.enqueue(generationId, () => syncGenerationToLark(syncInput));
}
const generationDependencies = {
  getSessionModelCatalog, imageClientForModel, requireApiKey,
  imageUpscaleClient, panoramaClient, imageOutpaintClient, qwenImageClient,
  promptResultCache: whiteModelPromptResultCache,
};
const generationService = createGenerationService({
  ...generationDependencies, imageMultiAngleClient, imageMaskFillClient, qwenMaskFillClient,
  scheduleGenerationSync,
  verifyRelightSyncContract: () => verifyLarkSyncSchema(undefined, { scope: "imageRelight" }),
});
const handleAiRenderStudioApi = createAiRenderStudioApiHandler({
  getImageClient: (modelKey) => imageClientForModel(modelKey),
  getOneApiModels: () => getSessionModelCatalog(createOneApiClient(requireApiKey())),
  readJson, sendJson,
});
const floorPlanRuntime = { getClient: () => createOneApiClient(requireApiKey()), requireKey: requireApiKey, readJson, sendJson,
  getModels: ({ forceRefresh } = {}) => getSessionModelCatalog(createOneApiClient(requireApiKey()), { force: forceRefresh }) };
const floorPlanArchiveRuntime = { ...floorPlanRuntime, verifyArchive: verifyFloorPlanArchiveSchema, scheduleArchive: createFloorPlanArchiveScheduler(syncJobs) };
const handleFloorPlanApi = createFloorPlanApiHandler(floorPlanArchiveRuntime);
const handleHousePlanApi = createFloorPlanApiHandler({ ...floorPlanArchiveRuntime, prefix: "/api/house-plan", featureMode: "housePlanLayout",
  geometryEnabled: false, readConfig: readHousePlanConfig, prepareInput: prepareHousePlanInput, execute: executeHousePlan });
const handleFloorPlanCameraApi = createFloorPlanApiHandler({ ...floorPlanArchiveRuntime, prefix: "/api/floor-plan-camera", featureMode: "floorPlanCamera",
  geometryEnabled: false, getTaskTotal: floorPlanCameraTaskTotal, readConfig: readFloorPlanCameraConfig, prepareInput: prepareFloorPlanCameraInput, execute: executeFloorPlanCamera });
const betaGenerationService = createGenerationService({ ...generationDependencies, archiveImageUpscale: true,
  scheduleGenerationSync: captureBetaGenerationArchive,
});
const betaRunner = createBetaRunnerService({
  baseStore: createBetaBaseStore(),
  generationService: betaGenerationService,
  housePlanService: createBetaHousePlanService(floorPlanRuntime),
  getOutpaintConfig: getImageOutpaintConfig,
  getUpscaleConfig: () => readBetaUpscaleConfig(imageUpscaleClient),
});
const handleBetaApi = createBetaApiHandler({
  getAgentModels: async () => checkAgentModelAvailability(
    await getSessionModelCatalog(createOneApiClient(requireApiKey())),
  ),
  readJson,
  sendImage,
  sendJson,
  service: betaRunner,
});
const handleGenerationJobApi = createGenerationJobApiHandler({
  generationJobs,
  generationService,
  getImageMultiAngleConfig,
  getImageMaskFillConfig, getImageRelightConfig,
  getImageOutpaintConfig,
  readJson,
  sendJson,
  verifySyncContract: verifyLarkSyncSchema,
});
const handleImageToolsApi = createImageToolsApiHandler({ imageMultiAngleClient, getImageMultiAngleConfig, getImageMaskFillConfig, getImageRelightConfig, imageUpscaleClient, getImageOutpaintConfig, sendJson });
function safeStaticPath(pathname) {
  if (pathname === "/vendor/inter-variable-latin.woff2") return INTER_VARIABLE_LATIN_FONT;
  if (PANNELLUM_ASSETS[pathname]) return PANNELLUM_ASSETS[pathname];
  const requestedPath = pathname === "/" ? "index.html" : pathname.slice(1);
  const resolvedPath = normalize(join(PUBLIC_DIR, requestedPath));
  return resolvedPath.startsWith(PUBLIC_DIR) ? resolvedPath : null;
}
function serveStatic(response, pathname) {
  const filePath = safeStaticPath(pathname);
  if (!filePath || !existsSync(filePath)) return false;

  response.writeHead(200, {
    ...staticSecurityHeaders(pathname),
    "Cache-Control": "no-cache",
    "Content-Type": MIME_TYPES[extname(filePath)] || "application/octet-stream",
  });
  const stream = createReadStream(filePath);
  stream.once("error", () => response.destroy());
  stream.pipe(response);
  return true;
}

async function handleApi(request, response, pathname) {
  if (await handleAppUpdateApi(request, response, pathname)) return;

  if (await handleAiRenderStudioApi(request, response, pathname)) return;
  if (await handleFloorPlanApi(request, response, pathname)) return;
  if (await handleHousePlanApi(request, response, pathname)) return;
  if (await handleFloorPlanCameraApi(request, response, pathname)) return;

  if (await handleGenerationJobApi(request, response, pathname)) return;
  if (await handleBetaApi(request, response, pathname)) return;

  if (await handleImageToolsApi(request, response, pathname)) return;

  const benchmarkCancelMatch = pathname.match(/^\/api\/benchmark\/jobs\/([^/]+)\/cancel$/);
  if (request.method === "POST" && benchmarkCancelMatch) {
    const job = benchmarkJobs.cancel(decodeURIComponent(benchmarkCancelMatch[1]));
    return job
      ? sendJson(response, 202, { job })
      : sendJson(response, 404, { error: "评测任务不存在或已过期" });
  }

  if (request.method === "GET" && pathname.startsWith("/api/benchmark/jobs/")) {
    const jobId = decodeURIComponent(pathname.slice("/api/benchmark/jobs/".length));
    const job = benchmarkJobs.get(jobId);
    return job
      ? sendJson(response, 200, { job })
      : sendJson(response, 404, { error: "评测任务不存在或已过期" });
  }

  if (request.method === "GET" && pathname === "/api/benchmark/overview") {
    const modelAccess = await publicBenchmarkModelAccess();
    try {
      return sendJson(response, 200, {
        api: modelAccess.session,
        configured: true,
        labelingError: modelAccess.error,
        ...(await getBenchmarkWorkbench().overview()),
        reviewModels: modelAccess.models,
      });
    } catch (error) {
      if (/缺少环境变量 BENCHMARK_/.test(error.message)) {
        return sendJson(response, 200, {
          api: modelAccess.session,
          configured: false,
          error: error.message,
          labelingError: modelAccess.error,
          reviewModels: modelAccess.models,
        });
      }
      throw error;
    }
  }

  if (request.method === "POST" && pathname === "/api/benchmark/cases") {
    const body = await readJson(request);
    return sendJson(response, 201, {
      case: await getBenchmarkWorkbench().createCase(body),
    });
  }

  if (request.method === "POST" && pathname === "/api/benchmark/cases/tag") {
    const body = await readJson(request);
    return sendJson(response, 200, {
      label: await getBenchmarkWorkbench().labelCase(body, {
        client: createOneApiClient(requireApiKey()),
      }),
    });
  }

  if (request.method === "POST" && pathname === "/api/benchmark/datasets") {
    const body = await readJson(request);
    return sendJson(response, 201, {
      dataset: await getBenchmarkWorkbench().createDataset(body),
    });
  }

  if (pathname.startsWith("/api/benchmark/datasets/")) {
    const datasetId = decodeURIComponent(pathname.slice("/api/benchmark/datasets/".length));
    const body = await readJson(request);
    if (request.method === "PATCH") {
      return sendJson(response, 200, {
        dataset: await getBenchmarkWorkbench().renameDataset({ ...body, datasetId }),
      });
    }
    if (request.method === "DELETE") {
      return sendJson(response, 200, {
        dataset: await getBenchmarkWorkbench().archiveDataset({ ...body, datasetId }),
      });
    }
  }

  if (request.method === "POST" && pathname === "/api/benchmark/experiments/plan") {
    const body = await readJson(request);
    return sendJson(response, 200, {
      plan: await getBenchmarkWorkbench().planExperiment(body),
    });
  }

  if (request.method === "POST" && pathname === "/api/benchmark/experiments/open-base") {
    const body = await readJson(request);
    return sendJson(response, 200, {
      target: await getBenchmarkWorkbench().prepareExperimentView(body),
    });
  }

  if (request.method === "POST" && pathname === "/api/benchmark/experiments/run") {
    const body = await readJson(request);
    const jobId = `generation-${randomUUID()}`;
    const service = getBenchmarkWorkbench();
    const apiKey = requireApiKey();
    const job = benchmarkJobs.enqueue(jobId, "generation", (update, { signal }) => {
      const client = createOneApiClient(apiKey, { signal });
      return service.runExperiment(body, {
        client,
        imageClientForModel: (config) => imageClientForModel(
          config.imageModelKey,
          { oneApiClient: client },
        ),
        signal,
        update,
      });
    });
    return sendJson(response, 202, { job });
  }

  if (request.method === "POST" && pathname === "/api/benchmark/reviews/run") {
    const body = await readJson(request);
    const jobId = `review-${randomUUID()}`;
    const service = getBenchmarkWorkbench();
    const client = createOneApiClient(requireApiKey());
    const job = benchmarkJobs.enqueue(jobId, "review", (update) =>
      service.runReview(body, { client, update }),
    );
    return sendJson(response, 202, { job });
  }

  if (
    request.method === "GET" &&
    pathname === "/api/style-dna-reverse/config"
  ) {
    return sendJson(response, 200, await publicStyleDnaReverseConfig());
  }

  if (
    request.method === "POST" &&
    pathname === "/api/style-dna-reverse/config/refresh"
  ) {
    return sendJson(
      response,
      200,
      await publicStyleDnaReverseConfig({ forceRefresh: true }),
    );
  }

  if (request.method === "GET" && pathname === "/api/catalog") {
    const { REFERENCE_IMAGE_POLICY } = await import("./src/reference-image.mjs");
    return sendJson(response, 200, {
      agentModels: publicAgentModelCatalog(),
      generationFeatureModes: supportedGenerationFeatureModes(),
      generationFeatureCapabilities: supportedGenerationFeatureCapabilities(),
      emptyRoomTypeDetailMaxLength: EMPTY_ROOM_TYPE_DETAIL_MAX_LENGTH,
      emptyRoomTypes: EMPTY_ROOM_TYPES,
      emptyRoomFurniture: EMPTY_ROOM_FURNITURE,
      otherFurnitureMaxLength: OTHER_FURNITURE_MAX_LENGTH,
      models: publicModelCatalog(),
      referenceImage: REFERENCE_IMAGE_POLICY,
    });
  }

  if (request.method === "GET" && pathname === "/api/style-transfer/config") {
    return sendJson(response, 200, await publicStyleTransferConfig());
  }

  if (request.method === "GET" && pathname === "/api/session") {
    return sendJson(response, 200, await publicSession());
  }

  if (request.method === "GET" && pathname === "/api/setup/status") {
    return sendJson(
      response,
      200,
      await larkSetup.status({ verifyBase: verifyLarkConfiguration }),
    );
  }

  if (
    request.method === "POST" &&
    pathname === "/api/setup/lark-login"
  ) {
    return sendJson(response, 200, await larkSetup.startLogin());
  }

  if (
    request.method === "POST" &&
    pathname === "/api/setup/lark-login/complete"
  ) {
    const body = await readJson(request);
    return sendJson(
      response,
      200,
      await larkSetup.completeLogin(body.loginId, {
        verifyBase: verifyLarkConfiguration,
      }),
    );
  }

  if (request.method === "GET" && pathname === "/api/styles") {
    return sendJson(response, 200, await readGenerationConfig());
  }

  if (request.method === "GET" && pathname === "/api/refined-lighting/preview") {
    const query = new URL(request.url, `http://${HOST}:${PORT}`).searchParams;
    const image = await readRefinedLightingPreview({ id: query.get("id"), version: query.get("version"), sha256: query.get("sha256") });
    response.writeHead(200, { "Content-Type": image.mimeType, "Content-Length": image.bytes.length,
      "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" });
    response.end(image.bytes);
    return;
  }

  if (request.method === "POST" && pathname === "/api/config/refresh") {
    return sendJson(response, 200, await readGenerationConfig({ forceRefresh: true }));
  }

  const syncRoute = pathname.match(/^\/api\/sync-jobs\/([^/]+)(\/retry)?$/);
  if (syncRoute && request.method === (syncRoute[2] ? "POST" : "GET")) {
    const generationId = decodeURIComponent(syncRoute[1]);
    const job = syncRoute[2] ? syncJobs.retry(generationId) : syncJobs.get(generationId);
    return job
      ? sendJson(response, syncRoute[2] ? 202 : 200, { sync: job })
      : sendJson(response, 404, { error: "同步任务不存在或已过期" });
  }

  if (request.method === "POST" && pathname === "/api/image-download") {
    const input = await readJson(request);
    return sendDownload(response, await prepareGeneratedImageDownload(input));
  }

  if (request.method === "POST" && pathname === "/api/session") {
    const body = await readJson(request);
    const nextKey = normalizeApiKey(body.apiKey);
    if (!/^sk-[A-Za-z0-9._-]{8,}$/.test(nextKey)) {
      return sendJson(response, 400, {
        error: "API Key 格式不正确，应以 sk- 开头",
      });
    }

    const client = createOneApiClient(nextKey);
    const models = await client.listModels();
    sessionApiKey = nextKey;
    sessionApiKeySource = "memory";
    sessionModelCatalog = models;
    sessionModelCatalogRequest = null;
    whiteModelPromptResultCache.clear();
    let warning = null;

    try {
      if (body.remember === true) {
        await persistOneApiKey(nextKey);
        sessionApiKeySource = "local-file";
      } else {
        await removePersistedOneApiKey();
      }
    } catch {
      warning =
        body.remember === true
          ? "API 已连接，但无法把 Key 保存到本机"
          : "API 已连接，但旧的本机 Key 未能删除";
    }

    return sendJson(response, 200, {
      connected: true,
      models: models.map((model) => model.id || model.name).filter(Boolean),
      persisted: await persistedOneApiKey(),
      source: sessionApiKeySource,
      warning,
    });
  }

  if (request.method === "DELETE" && pathname === "/api/session") {
    sessionApiKey = "";
    sessionApiKeySource = "none";
    clearSessionModelCatalog();
    whiteModelPromptResultCache.clear();
    let warning = null;
    try {
      await removePersistedOneApiKey();
    } catch {
      warning = "已断开当前连接，但本机保存的 Key 未能删除";
    }
    return sendJson(response, 200, {
      ...(await publicSession()),
      warning,
    });
  }

  if (request.method === "POST" && pathname === "/api/check-models") {
    const client = createOneApiClient(requireApiKey());
    const availableModels = await getSessionModelCatalog(client);
    const availableIds = new Set(
      availableModels.map((model) => model.id || model.name).filter(Boolean),
    );
    const comfyHealth = await comfyUiClient.checkHealth().catch(() => ({
      available: false,
      version: null,
    }));
    const configured = publicModelCatalog().map((model) => ({
      id: model.id,
      key: model.key,
      available:
        model.provider === "comfyui"
          ? comfyHealth.available
          : availableIds.has(model.id),
      provider: model.provider,
    }));
    return sendJson(response, 200, {
      agentModels: checkAgentModelAvailability(availableModels),
      comfyUi: comfyHealth,
      models: configured,
    });
  }

  if (request.method === "POST" && pathname === "/api/generate") {
    const input = await readJson(request);
    await verifyLarkSyncSchema();
    return sendJson(response, 200, await generationService.executeFree(input));
  }

  if (
    request.method === "POST" &&
    pathname === "/api/refined-model-render"
  ) {
    const input = await readJson(request);
    await verifyLarkSyncSchema();
    return sendJson(response, 200, await generationService.executeRefined(input));
  }

  if (
    request.method === "POST" &&
    pathname === "/api/white-model-render"
  ) {
    const input = await readJson(request);
    await verifyLarkSyncSchema();
    return sendJson(response, 200, await generationService.executeDesign(input));
  }

  if (
    request.method === "POST" &&
    pathname === "/api/style-dna-reverse"
  ) {
    const input = await readJson(request);
    const client = createOneApiClient(requireApiKey());
    const availableModels = await getSessionModelCatalog(client);
    const result = await executeStyleDnaReverse(input, {
      availableModels,
      client,
      refreshModels: () => getSessionModelCatalog(client, { force: true }),
    });
    return sendJson(response, 200, result);
  }

  return sendJson(response, 404, { error: "接口不存在" });
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${HOST}:${PORT}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      const mutation = url.pathname === "/api/benchmark/overview"
        || (!["GET", "HEAD"].includes(request.method) && url.pathname !== "/api/app-install");
      if (mutation && (appInstaller.isInstalling() || appInstaller.isRestartRequired() || appInstaller.isRecoveryRequired())
        && (await appInstaller.getPolicy()).installMode === "in-place") {
        return sendJson(response, 409, { error: "正在更新程序，请安装完成并重启后再操作。", code: "APP_UPDATING" });
      }
      if (mutation) activeApiMutations += 1;
      try { await handleApi(request, response, url.pathname); }
      finally { if (mutation) activeApiMutations -= 1; }
      return;
    }

    if (request.method !== "GET" || !serveStatic(response, url.pathname)) {
      sendJson(response, 404, { error: "页面不存在" });
    }
  } catch (error) {
    const statusCode =
      error instanceof OneApiError
        ? error.statusCode
        : Number.isInteger(error.statusCode)
          ? error.statusCode
          : 500;

    sendJson(response, statusCode, {
      error: error.message || "服务暂时不可用",
      code: error.code || null,
    });
  }
});
server.listen(PORT, HOST, () => {
  console.log(`Canvas Lab 已启动：http://${HOST}:${PORT}`);
  console.log(
    sessionApiKey
      ? "API Key 已从环境变量载入。"
      : "API Key 未设置，请在工作台中连接。",
  );
});

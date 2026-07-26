/**
 * [INPUT]: 依赖 Node HTTP/静态文件、模型/风格/Agent 目录、OneAPI 客户端、Style DNA 反推、白模工作流及后台飞书任务
 * [OUTPUT]: 对外提供本地工作台、内存密钥/模型会话、配置主动刷新、风格对话、生成接口与非阻塞同步状态查询
 * [POS]: 项目根入口，隔离浏览器、公司 OneAPI 与飞书 Base，并在图片完成时结束主链路计时
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createReadStream, existsSync } from "node:fs";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import {
  checkAgentModelAvailability,
  publicAgentModelCatalog,
} from "./src/agent-model-config.mjs";
import { createGenerationRequest, publicModelCatalog } from "./src/model-config.mjs";
import { syncGenerationToLark } from "./src/lark-sync.mjs";
import { OneApiError, createOneApiClient } from "./src/oneapi-client.mjs";
import { getPublishedPromptAgent } from "./src/prompt-agent.mjs";
import { listPublicStyles } from "./src/style-library.mjs";
import { createSyncJobRegistry } from "./src/sync-jobs.mjs";
import {
  executeStyleDnaReverse,
  publicStyleDnaReverseConfig,
} from "./src/style-dna-reverse.mjs";
import { executeWhiteModelWorkflow } from "./src/white-model-workflow.mjs";

const HOST = "127.0.0.1";
const PORT = Number.parseInt(process.env.PORT || "4173", 10);
const PUBLIC_DIR = join(fileURLToPath(new URL(".", import.meta.url)), "public");
const MAX_JSON_BYTES = 30 * 1024 * 1024;

let sessionApiKey = normalizeApiKey(process.env.ONEAPI_API_KEY || "");
let sessionModelCatalog = null;
let sessionModelCatalogRequest = null;
const syncJobs = createSyncJobRegistry();

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

const SECURITY_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Security-Policy":
    "default-src 'self'; img-src 'self' data: https:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

function normalizeApiKey(value) {
  const key = String(value || "").trim();
  return key.replace(/^Bearer\s+/i, "");
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    ...SECURITY_HEADERS,
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

function publicPromptAgent(promptAgent) {
  return {
    code: promptAgent.code,
    name: promptAgent.name,
    version: promptAgent.version,
  };
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

function clearSessionModelCatalog() {
  sessionModelCatalog = null;
  sessionModelCatalogRequest = null;
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

function safeStaticPath(pathname) {
  const requestedPath = pathname === "/" ? "index.html" : pathname.slice(1);
  const resolvedPath = normalize(join(PUBLIC_DIR, requestedPath));
  return resolvedPath.startsWith(PUBLIC_DIR) ? resolvedPath : null;
}

function serveStatic(response, pathname) {
  const filePath = safeStaticPath(pathname);
  if (!filePath || !existsSync(filePath)) return false;

  response.writeHead(200, {
    ...SECURITY_HEADERS,
    "Cache-Control": "no-cache",
    "Content-Type": MIME_TYPES[extname(filePath)] || "application/octet-stream",
  });
  createReadStream(filePath).pipe(response);
  return true;
}

async function handleApi(request, response, pathname) {
  if (
    request.method === "GET" &&
    pathname === "/api/style-dna-reverse/config"
  ) {
    return sendJson(response, 200, publicStyleDnaReverseConfig());
  }

  if (request.method === "GET" && pathname === "/api/catalog") {
    const { REFERENCE_IMAGE_POLICY } = await import("./src/reference-image.mjs");
    return sendJson(response, 200, {
      agentModels: publicAgentModelCatalog(),
      models: publicModelCatalog(),
      referenceImage: REFERENCE_IMAGE_POLICY,
    });
  }

  if (request.method === "GET" && pathname === "/api/session") {
    return sendJson(response, 200, {
      connected: Boolean(sessionApiKey),
      source: sessionApiKey
        ? process.env.ONEAPI_API_KEY
          ? "environment"
          : "memory"
        : "none",
    });
  }

  if (request.method === "GET" && pathname === "/api/styles") {
    const [styles, promptAgent] = await Promise.all([
      listPublicStyles(),
      getPublishedPromptAgent("white-model-fusion"),
    ]);
    return sendJson(response, 200, {
      promptAgent: publicPromptAgent(promptAgent),
      styles,
    });
  }

  if (request.method === "POST" && pathname === "/api/config/refresh") {
    const [styles, promptAgent] = await Promise.all([
      listPublicStyles({ forceRefresh: true }),
      getPublishedPromptAgent("white-model-fusion", { forceRefresh: true }),
    ]);
    return sendJson(response, 200, {
      promptAgent: publicPromptAgent(promptAgent),
      styles,
    });
  }

  if (request.method === "GET" && pathname.startsWith("/api/sync-jobs/")) {
    const generationId = decodeURIComponent(pathname.slice("/api/sync-jobs/".length));
    const job = syncJobs.get(generationId);
    return job
      ? sendJson(response, 200, { sync: job })
      : sendJson(response, 404, { error: "同步任务不存在或已过期" });
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
    sessionModelCatalog = models;
    sessionModelCatalogRequest = null;

    return sendJson(response, 200, {
      connected: true,
      models: models.map((model) => model.id || model.name).filter(Boolean),
    });
  }

  if (request.method === "DELETE" && pathname === "/api/session") {
    if (!process.env.ONEAPI_API_KEY) {
      sessionApiKey = "";
      clearSessionModelCatalog();
    }
    return sendJson(response, 200, {
      connected: Boolean(sessionApiKey),
      source: sessionApiKey ? "environment" : "none",
    });
  }

  if (request.method === "POST" && pathname === "/api/check-models") {
    const client = createOneApiClient(requireApiKey());
    const availableModels = await getSessionModelCatalog(client);
    const availableIds = new Set(
      availableModels.map((model) => model.id || model.name).filter(Boolean),
    );
    const configured = publicModelCatalog().map((model) => ({
      id: model.id,
      key: model.key,
      available: availableIds.has(model.id),
    }));
    return sendJson(response, 200, {
      agentModels: checkAgentModelAvailability(availableModels),
      models: configured,
    });
  }

  if (request.method === "POST" && pathname === "/api/generate") {
    const input = await readJson(request);
    const generation = createGenerationRequest(input);
    const client = createOneApiClient(requireApiKey());
    const startedAt = Date.now();
    const result = await client.generateImage(generation.request);
    const durationMs = Date.now() - startedAt;
    const preview = {
      ...generation.preview,
      quality: result.quality ?? generation.preview.quality,
      transport: result.transport,
    };
    const model = publicModelCatalog().find(
      (entry) => entry.key === String(input.modelKey || ""),
    );
    const referenceImages = (generation.request.images || []).map(
      (image, index) => ({
        fileName: generation.preview.referenceImages[index]?.fileName,
        imageUrl: image.image_url,
        mimeType: generation.preview.referenceImages[index]?.mimeType,
      }),
    );
    const sync = scheduleGenerationSync({
      durationMs,
      finalPrompt: generation.request.prompt,
      modelLabel: model.label,
      preview,
      referenceImages,
      resultImage: result.images[0],
      sourcePrompt: String(input.prompt || "").trim(),
    });

    return sendJson(response, 200, {
      durationMs,
      images: result.images,
      request: preview,
      sync,
      upstream: {
        created: result.created,
        outputFormat: result.outputFormat,
        transport: result.transport,
      },
    });
  }

  if (
    request.method === "POST" &&
    pathname === "/api/white-model-render"
  ) {
    const input = await readJson(request);
    const client = createOneApiClient(requireApiKey());
    const availableModels = await getSessionModelCatalog(client);
    const result = await executeWhiteModelWorkflow(input, {
      availableModels,
      client,
      refreshModels: () => getSessionModelCatalog(client, { force: true }),
      scheduleSync: scheduleGenerationSync,
    });
    return sendJson(response, 200, result);
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
      await handleApi(request, response, url.pathname);
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

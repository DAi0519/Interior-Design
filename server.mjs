/**
 * [INPUT]: 依赖 node:http/fs/path/url，依赖 model-config/reference-image 的参数校验、oneapi-client 的上游调用与 lark-sync 的飞书归档
 * [OUTPUT]: 对外提供 localhost 静态工作台、内存密钥会话、模型检查、图片生成与飞书同步代理
 * [POS]: 项目根入口，连接浏览器、公司 OneAPI 与飞书 Base，避免密钥和外部调用细节进入前端
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createReadStream, existsSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import { createGenerationRequest, publicModelCatalog } from "./src/model-config.mjs";
import { syncGenerationToLark } from "./src/lark-sync.mjs";
import { OneApiError, createOneApiClient } from "./src/oneapi-client.mjs";

const HOST = "127.0.0.1";
const PORT = Number.parseInt(process.env.PORT || "4173", 10);
const PUBLIC_DIR = join(fileURLToPath(new URL(".", import.meta.url)), "public");
const MAX_JSON_BYTES = 30 * 1024 * 1024;

let sessionApiKey = normalizeApiKey(process.env.ONEAPI_API_KEY || "");

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
  if (request.method === "GET" && pathname === "/api/catalog") {
    const { REFERENCE_IMAGE_POLICY } = await import("./src/reference-image.mjs");
    return sendJson(response, 200, {
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

    return sendJson(response, 200, {
      connected: true,
      models: models.map((model) => model.id || model.name).filter(Boolean),
    });
  }

  if (request.method === "DELETE" && pathname === "/api/session") {
    if (!process.env.ONEAPI_API_KEY) sessionApiKey = "";
    return sendJson(response, 200, {
      connected: Boolean(sessionApiKey),
      source: sessionApiKey ? "environment" : "none",
    });
  }

  if (request.method === "POST" && pathname === "/api/check-models") {
    const client = createOneApiClient(requireApiKey());
    const availableModels = await client.listModels();
    const availableIds = new Set(
      availableModels.map((model) => model.id || model.name).filter(Boolean),
    );
    const configured = publicModelCatalog().map((model) => ({
      id: model.id,
      key: model.key,
      available: availableIds.has(model.id),
    }));
    return sendJson(response, 200, { models: configured });
  }

  if (request.method === "POST" && pathname === "/api/generate") {
    const input = await readJson(request);
    const generation = createGenerationRequest(input);
    const client = createOneApiClient(requireApiKey());
    const startedAt = Date.now();
    const result = await client.generateImage(generation.request);
    const durationMs = Date.now() - startedAt;
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
    const sync = await syncGenerationToLark({
      durationMs,
      modelLabel: model.label,
      preview: generation.preview,
      prompt: generation.request.prompt,
      referenceImages,
      resultImage: result.images[0],
      revisedPrompt: result.images[0].revisedPrompt,
    });

    return sendJson(response, 200, {
      durationMs,
      images: result.images,
      request: generation.preview,
      sync,
      upstream: {
        created: result.created,
        outputFormat: result.outputFormat,
      },
    });
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

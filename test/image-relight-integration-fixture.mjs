/**
 * [INPUT]: 依赖真实任务API/注册表/应用服务、离线sharp图片及可注入模型/飞书替身、当前打光资产v9快照
 * [OUTPUT]: 对外提供打光跨层测试的图片/资产夹具、请求构造与可等待/冻结/注入失败的离线harness
 * [POS]: test 的打光集成公共夹具，无独立测试、真实模型请求或飞书写入
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { createGenerationJobApiHandler } from "../src/generation-job-api.mjs";
import { createGenerationJobRegistry } from "../src/generation-jobs.mjs";
import { createGenerationService } from "../src/generation-service.mjs";
import { RELIGHT_ONEAPI_MODEL } from "../src/image-relight-oneapi.mjs";
import { RELIGHT_MODEL_KEY } from "../public/image-relight-geometry.js";

export const sourceBytes = await sharp({ create: { width: 96, height: 64, channels: 3, background: "#90745a" } }).png().toBuffer();
export const sourceUrl = `data:image/png;base64,${sourceBytes.toString("base64")}`;
export const digest = bytes => createHash("sha256").update(bytes).digest("hex");
export const decoded = url => Buffer.from(url.split(",")[1], "base64");
export const assetPrompt = await readFile(new URL("../docs/image-relight-prompt-v9.json", import.meta.url), "utf8");
export const promptSnapshot = () => ({ code: "image-relight", name: "GPT打光", version: 9, published: true, prompt: assetPrompt,
  bundle: JSON.parse(assetPrompt), sha256: digest(assetPrompt), source: "feishu:tblDCXNib9XeWuza:image-relight@v9",
  tableUrl: "https://lq9n5lvfn2i.feishu.cn/base/SALobKnnra17iSsGT2ccC52PnHd?table=tblDCXNib9XeWuza" });
export const promptConfig = () => ({ available: true, code: "image-relight", name: "GPT打光", version: 9, defaultVersion: 9,
  sha256: digest(assetPrompt), source: promptSnapshot().source, tableUrl: promptSnapshot().tableUrl });
let sequence = 0;
export const PHOTOGRAPHY_PARAMETERS = "摄影参数：设备：佳能R1，光圈：f/8，ISO：100，焦段：24mm，拍摄技术:高动态范围（HDR）拍摄，包围曝光，白平衡锁定，暗部不失真，亮部不过曝";

export function assertPhotographicQuality(prompt, { scope = "rebuilt" } = {}) {
  for (const heading of ["PHOTOGRAPHIC LIGHTING QUALITY", "MATERIAL AND TONAL RENDERING", "CAMERA AND OPTICAL CHARACTER"]) {
    assert.ok(prompt.includes(heading), `实际送模Prompt缺少${heading}`);
  }
  assert.equal(prompt.split(PHOTOGRAPHY_PARAMETERS).length - 1, 1, "用户摄影参数原文必须在实际送模Prompt中完整出现且仅一次");
  assert.match(prompt, /Even illumination does not mean equal brightness across the whole image/);
  if (scope === "local") assert.match(prompt, /Do not use quality refinement to reset the whole room/);
  else assert.match(prompt, /photographic finish across the rebuilt setup/);
}

export function inputLights() {
  return [
    { id: "point-main", type: "point", points: [{ x: 0.2, y: 0.2 }], target: { x: 0.5, y: 0.8 }, mode: "lightOnly", kelvin: 3000, intensity: 1, softness: "soft", fixture: "" },
    { id: "line-fixture", type: "line", points: [{ x: 0.2, y: 0.4 }, { x: 0.8, y: 0.4 }], target: { x: 0.5, y: 0.7 }, mode: "addFixture", kelvin: 4000, intensity: 0.8, softness: "hard", fixture: "窄边线性灯" },
    { id: "area-fill", type: "area", points: [{ x: 0.6, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.3 }, { x: 0.6, y: 0.3 }], target: { x: 0.6, y: 0.6 }, mode: "lightOnly", kelvin: 6500, intensity: 0.6, softness: "soft", fixture: "" },
  ];
}

export function requestBody() {
  sequence++;
  return { jobId: `generation-relight-integration-${sequence.toString().padStart(6, "0")}`, featureMode: "imageRelight",
    batchId: `batch-relight-${sequence}`, sharedInput: { referenceImages: [{ dataUrl: sourceUrl, type: "image/png", name: "scene.png", size: sourceBytes.length }],
      lights: inputLights(), prompt: "只对指定受光位置补光", outputResolution: "1K", quality: "medium", modelKey: RELIGHT_MODEL_KEY },
    items: [{ key: RELIGHT_MODEL_KEY, label: "GPT 打光", provider: "oneapi", input: {} }] };
}

export async function waitUntil(predicate, label = "等待任务状态") {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > 5000) throw new Error(`${label}超时`);
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}

export function harness({ body = requestBody(), rejectSchema = null, denyConfig = false, revokeAfterConfig = false, holdGeneration = false, rejectPaid = false,
  getPrompt = async () => promptSnapshot(), readPromptConfig = async () => promptConfig(), holdBeforeExecution = false } = {}) {
  const registry = createGenerationJobRegistry();
  const calls = { paid: [], archived: [], routes: [], schema: [], catalogs: [], prompts: [] };
  const gate = Promise.withResolvers();
  const imageClient = { async editImageAsync(request, options) {
    calls.paid.push(structuredClone(request));
    options.onSubmitted({ id: "response-relight-offline", status: "in_progress" });
    if (holdGeneration) await gate.promise;
    if (rejectPaid) throw new Error("offline upstream failed");
    const [width, height] = request.size.split("x").map(Number);
    const bytes = await sharp({ create: { width, height, channels: 3, background: "#b5a079" } }).png().toBuffer();
    return { images: [{ url: `data:image/png;base64,${bytes.toString("base64")}` }], outputFormat: "png", transport: "responses-background",
      requestId: "request-relight-offline", usageCost: { totalCost: 0.123 } };
  } };
  const service = createGenerationService({
    requireApiKey: () => "offline-integration-key",
    async getSessionModelCatalog(_client, options) {
      calls.catalogs.push(options);
      if (holdBeforeExecution && calls.catalogs.length > 1) await gate.promise;
      return denyConfig || revokeAfterConfig && calls.catalogs.length > 1 ? [] : [{ id: RELIGHT_ONEAPI_MODEL.id }];
    },
    getRelightPrompt(options) { calls.prompts.push(structuredClone(options)); return getPrompt(options); },
    readRelightPromptConfig: readPromptConfig,
    imageClientForModel(modelKey) { calls.routes.push(modelKey); assert.equal(modelKey, RELIGHT_MODEL_KEY); return imageClient; },
    async verifyRelightSyncContract() {
      calls.schema.push({ stage: "execute", scope: "imageRelight" });
      if (rejectSchema === "execute") throw new Error("offline schema changed");
    },
    scheduleGenerationSync(archive) { calls.archived.push(archive); return { generationId: "sync-relight-offline", status: "pending" }; },
  });
  const responses = [];
  const handler = createGenerationJobApiHandler({ generationJobs: registry, generationService: service,
    readJson: async () => body,
    sendJson(_response, statusCode, payload) { responses.push({ statusCode, payload: structuredClone(payload) }); },
    async verifySyncContract(_config, options) {
      calls.schema.push({ stage: "enqueue", scope: options?.scope });
      if (rejectSchema === "enqueue") throw new Error("offline schema missing 打光");
    },
  });
  return { registry, service, handler, responses, body, calls, release: () => gate.resolve(),
    async post() { assert.equal(await handler({ method: "POST" }, {}, "/api/generation-jobs"), true); return responses.at(-1); },
    async get() { assert.equal(await handler({ method: "GET" }, {}, `/api/generation-jobs/${body.jobId}`), true); return responses.at(-1); },
    async settled() { await waitUntil(() => registry.get(body.jobId)?.status !== "running", "打光任务完成"); return registry.get(body.jobId); },
  };
}


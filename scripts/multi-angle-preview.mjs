/**
 * [INPUT]: 依赖原生HTTP/fs、共享camera-sphere交互/scene绘制静态资源、多角度压缩、ComfyUI客户端/任务注册表/图片校验与执行图
 * [OUTPUT]: 本机 4175 摄影机球/三档景别测试页、可固定种子的单图异步 API 与 outputs/multi-angle 证据
 * [POS]: scripts 的独立试跑入口，复用已有传输和产物合同，不修改正在运行的主工作台或正式 MaaS 策略
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import http from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { createComfyUiClient } from "../src/comfyui-client.mjs";
import { createGenerationJobRegistry } from "../src/generation-jobs.mjs";
import { prepareMultiAngleImage, MULTI_ANGLE_IMAGE_POLICY } from "../src/image-multi-angle-image.mjs";
import { decodeImageDataUrl } from "../src/image-artifact.mjs";
import { MULTI_ANGLE, normalizeCameraPose, createMultiAngleWorkflow, verifyMultiAngleCapabilities, multiAngleArtifactPrefix, multiAngleMetadata } from "../src/image-multi-angle-workflow.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const port = Number(process.env.MULTI_ANGLE_PORT || 4175);
const origin = `http://127.0.0.1:${port}`;
const archive = resolve(root, "outputs/multi-angle");
const sample = resolve(root, ".impeccable/review/qwen-outpaint-alignment/source.jpg");
const registry = createGenerationJobRegistry();
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const jsonFile = (path, value) => writeFile(path, JSON.stringify(value, null, 2));
const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const validId = (id) => /^[a-f0-9-]{36}$/.test(id || "");
let admittingJobId = null;
await mkdir(archive, { recursive: true });

const createPreviewClient = (seed) => createComfyUiClient({
  ...(seed === undefined ? {} : { randomSeed: () => seed }),
  artifactPrefix: multiAngleArtifactPrefix,
  workflowFactory(args) {
    const graph = createMultiAngleWorkflow(args);
    const trace = structuredClone(graph);
    trace["1"].inputs.base64_data = "[input.png 的 Base64，提交时注入]";
    writeFileSync(resolve(archive, args.generationRequest.jobId, "workflow.json"), JSON.stringify(trace, null, 2));
    return graph;
  },
  workflowMetadataFactory: multiAngleMetadata,
  outputNodeId: MULTI_ANGLE.outputNodeId,
  pollIntervalMs: 1500,
});
const client = createPreviewClient();

async function verify() {
  const graph = createMultiAngleWorkflow({ artifactKey: "preflight", imageBase64: "", width: 864, height: 1184, seed: 1, generationRequest: { pose: { azimuth: 28, elevation: -30, distance: 50 } } });
  verifyMultiAngleCapabilities(graph, await client.getObjectInfo([...new Set(Object.values(graph).map((node) => node.class_type))]));
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 30 * 1024 * 1024) throw fail("图片请求过大", 413);
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString()); }
  catch { throw fail("请求 JSON 格式不正确"); }
}

async function savedJob(id) {
  if (!validId(id)) return null;
  try { return JSON.parse(await readFile(resolve(archive, id, "job.json"), "utf8")); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

async function queryJob(id) {
  const job = registry.get(id) || await savedJob(id);
  if (job) return job;
  if (admittingJobId === id) return { jobId: id, status: "running", message: "正在校验原图和 MaaS 能力" };
  try {
    await readFile(resolve(archive, id, "request.json"));
    return { jobId: id, status: "unknown", error: "本地进程中断，任务状态待核验；不会自动重新提交" };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return { jobId: id, status: "not-submitted", error: "任务未提交，可调整图片或机位后重新生成" };
  }
}

async function generate(body) {
  const jobId = body.jobId;
  if (!validId(jobId)) throw fail("任务 ID 格式不正确");
  const existing = registry.get(jobId) || await savedJob(jobId);
  if (existing) return existing;
  if (admittingJobId || registry.hasActiveJobs()) throw fail("已有一张图片正在生成，请等待完成", 409);
  admittingJobId = jobId;
  try {
    const pose = normalizeCameraPose(body.pose);
    const seed = body.seed;
    if (seed !== undefined && (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)) throw fail("种子必须为 0–4294967295 的整数");
    const { reference, sourceBytes, inferenceBytes, plan } = await prepareMultiAngleImage(body.reference);
    const width = plan.inferenceWidth;
    const height = plan.inferenceHeight;
    await verify();
    const dir = resolve(archive, jobId);
    await mkdir(dir, { recursive: false });
    await writeFile(resolve(dir, "input.png"), inferenceBytes);
    const sourceExtension = reference.mimeType.split("/")[1];
    await writeFile(resolve(dir, `source.${sourceExtension}`), sourceBytes);
    await jsonFile(resolve(dir, "request.json"), { jobId, pose, seed: seed ?? null, width, height, originalWidth: plan.sourceWidth, originalHeight: plan.sourceHeight, imagePlan: plan, fileName: reference.fileName, sourceSha256: sha256(sourceBytes), inputSha256: sha256(inferenceBytes), createdAt: new Date().toISOString() });
    const job = registry.enqueue(jobId, { featureMode: "multi-angle-preview", total: 1 }, async (update) => {
      try {
        const result = await createPreviewClient(seed).generateImage({ jobId, pose, width, height, imagePlan: plan, resolution: "2K-max", images: [{ image_url: `data:image/png;base64,${inferenceBytes.toString("base64")}` }] }, {
          queueTimeoutMs: 600_000, executionTimeoutMs: 600_000,
          onProgress(progress) {
            update({ message: progress.phase === "executing" ? "MaaS 正在生成" : "MaaS 排队中" });
            writeFileSync(resolve(dir, "progress.json"), JSON.stringify({ ...progress, updatedAt: new Date().toISOString() }));
          },
        });
        const bytes = decodeImageDataUrl(result.images[0].url);
        await writeFile(resolve(dir, "result.png"), bytes);
        await jsonFile(resolve(dir, "metadata.json"), result.metadata);
        const publicResult = { inputUrl: `/runs/${jobId}/source.${sourceExtension}`, outputUrl: `/runs/${jobId}/result.png`, pose, workflowVersion: result.metadata.version, width: result.metadata.actualOutputWidth, height: result.metadata.actualOutputHeight, promptId: result.metadata.promptId, executionDurationMs: result.metadata.executionDurationMs, queueDurationMs: result.metadata.queueDurationMs };
        await jsonFile(resolve(dir, "job.json"), { jobId, status: "success", result: publicResult });
        return publicResult;
      } catch (error) {
        await jsonFile(resolve(dir, "job.json"), { jobId, status: "failed", error: String(error.message) });
        throw error;
      }
    });
    await jsonFile(resolve(archive, "latest.json"), { jobId });
    return job;
  } finally { admittingJobId = null; }
}

const staticFiles = new Map([
  ["/", ["public/prototypes/multi-angle/index.html", "text/html"]],
  ["/camera.css", ["public/prototypes/multi-angle/camera.css", "text/css"]],
  ["/camera-sphere.js", ["public/camera-sphere.js", "text/javascript"]],
  ["/camera.js", ["public/prototypes/multi-angle/camera.js", "text/javascript"]],
  ["/workbench-utils.js", ["public/workbench-utils.js", "text/javascript"]],
  ["/camera-sphere-scene.js", ["public/camera-sphere-scene.js", "text/javascript"]],
]);

http.createServer(async (req, res) => {
  const send = (status, value, type = "application/json") => {
    res.writeHead(status, { "Content-Type": `${type}; charset=utf-8`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "Content-Security-Policy": "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'" });
    res.end(type === "application/json" ? JSON.stringify(value) : value);
  };
  try {
    if (req.headers.host !== `127.0.0.1:${port}`) throw fail("仅支持本机访问", 403);
    if (req.headers.origin && req.headers.origin !== origin) throw fail("不接受跨站请求", 403);
    const path = new URL(req.url, origin).pathname;
    if (req.method === "GET" && staticFiles.has(path)) {
      const [file, type] = staticFiles.get(path);
      return send(200, await readFile(resolve(root, file)), type);
    }
    if (req.method === "GET" && path === "/api/sample") {
      const bytes = await readFile(sample);
      return send(200, { reference: { dataUrl: `data:image/jpeg;base64,${bytes.toString("base64")}`, name: "夜景客厅.jpg", type: "image/jpeg", size: bytes.length } });
    }
    if (req.method === "GET" && path === "/api/health") { await verify(); return send(200, { available: true, imagePolicy: MULTI_ANGLE_IMAGE_POLICY }); }
    if (req.method === "POST" && path === "/api/generate") return send(202, await generate(await readJson(req)));
    if (req.method === "GET" && path === "/api/latest") {
      const latest = await readFile(resolve(archive, "latest.json"), "utf8").then(JSON.parse).catch((error) => { if (error.code === "ENOENT") return null; throw error; });
      return send(200, latest ? await queryJob(latest.jobId) : null);
    }
    const jobMatch = path.match(/^\/api\/jobs\/([a-f0-9-]{36})$/);
    if (req.method === "GET" && jobMatch) {
      return send(200, await queryJob(jobMatch[1]));
    }
    const imageMatch = path.match(/^\/runs\/([a-f0-9-]{36})\/(input\.png|result\.png|source\.(?:jpeg|png|webp))$/);
    if (req.method === "GET" && imageMatch) return send(200, await readFile(resolve(archive, imageMatch[1], imageMatch[2])), `image/${imageMatch[2].split(".").at(-1)}`);
    throw fail("页面不存在", 404);
  } catch (error) { send(error.statusCode || 500, { error: error.message }); }
}).listen(port, "127.0.0.1", () => process.stdout.write(`多角度测试页 ${origin}\n`));

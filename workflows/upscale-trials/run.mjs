/**
 * [INPUT]: 依赖sharp/fs/crypto、既有ComfyUI客户端与通用节点合同校验、受限图片读取和SUPIR/Tile实验工厂
 * [OUTPUT]: 提供默认仅准备/显式单次提交的同图Prompt对比，保存源图、1024输入、原生双PNG、裁切交付及Prompt/SHA账本
 * [POS]: workflows/upscale-trials的命令行试跑器，不启动新服务、不注册主/Beta功能、不自动重提GPU
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import { createComfyUiClient, DEFAULT_COMFYUI_BASE_URL } from "../../src/comfyui-client.mjs";
import { verifyMultiAngleCapabilities } from "../../src/image-multi-angle-workflow.mjs";
import { decodeImageDataUrl, loadImageBytes } from "../../src/image-artifact.mjs";
import { createSupirTrialWorkflow, SUPIR_TRIAL, supirArtifactPrefix } from "./supir.mjs";
import { createTileTrialWorkflow, TILE_TRIAL, tileArtifactPrefix } from "./tile.mjs";

const args = process.argv.slice(2);
const option = key => { const at = args.indexOf(key); return at < 0 ? null : args[at + 1]; };
const engine = option("--engine") || "supir";
if (!["supir", "tile"].includes(engine)) throw new Error("--engine 只支持supir或tile");
const trial = engine === "supir" ? SUPIR_TRIAL : TILE_TRIAL;
const createWorkflow = engine === "supir" ? createSupirTrialWorkflow : createTileTrialWorkflow;
const artifactPrefix = engine === "supir" ? supirArtifactPrefix : tileArtifactPrefix;
const sourcePath = option("--input");
if (!sourcePath) throw new Error("请传 --input 原图路径；默认只准备，--run-gpu 才提交一次实验");
const out = resolve(option("--out") || `outputs/${engine}-trial`);
const ledgerPath = resolve(out, "submission.json");
const json = (name, value) => writeFile(resolve(out, name), JSON.stringify(value, null, 2));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const baseUrl = process.env.COMFYUI_BASE_URL || DEFAULT_COMFYUI_BASE_URL;
const runGpu = args.includes("--run-gpu");
await mkdir(out, { recursive: true });
let previous;
try { previous = JSON.parse(await readFile(ledgerPath, "utf8")); }
catch (error) { if (error.code !== "ENOENT") throw error; }
if (previous) throw new Error(`此目录已有提交账本（${previous.status} / ${previous.promptId || "ID待查"}），禁止自动重跑`);

const source = await readFile(resolve(sourcePath));
const sourceMetadata = await sharp(source, { limitInputPixels: 64_000_000 }).metadata();
const image = sharp(source, { limitInputPixels: 64_000_000 }).rotate().removeAlpha();
const { data: unpadded, info } = await image.resize({ width: 1024, height: 1024, fit: "inside" }).png().toBuffer({ resolveWithObject: true });
const paddedWidth = Math.ceil(info.width / 32) * 32;
const paddedHeight = Math.ceil(info.height / 32) * 32;
const input = await sharp(unpadded).extend({
  right: paddedWidth - info.width, bottom: paddedHeight - info.height, extendWith: "copy",
}).png().toBuffer();
const plan = {
  inputWidth: info.width, inputHeight: info.height, paddedWidth, paddedHeight,
  width: paddedWidth * 2, height: paddedHeight * 2,
  deliveryWidth: info.width * 2, deliveryHeight: info.height * 2,
  padding: "右/下复制边缘补齐32；模型输出裁去对应补边，不做后置放大",
};
await writeFile(resolve(out, `source${extname(sourcePath) || ".bin"}`), source);
await writeFile(resolve(out, "input.png"), unpadded);
await writeFile(resolve(out, "inference-input.png"), input);
const manifest = {
  engine, version: trial.version, sourcePath: resolve(sourcePath), sourceSha256: sha(source),
  sourceWidth: sourceMetadata.width, sourceHeight: sourceMetadata.height,
  inputSha256: sha(input), plan, model: trial.model, sdxl: trial.sdxl,
  seed: trial.seed, steps: trial.steps, prompts: trial.prompts,
  negative: trial.negative, singleSharedEncode: true, firstStageDenoiser: false,
  colorCorrection: "none", status: "prepared", gpuSubmissions: 0,
};
const artifactKey = randomUUID();
const preview = createWorkflow({ artifactKey, imageBase64: "", seed: trial.seed, generationRequest: plan });
const clientOptions = { requestTimeoutMs: 20 * 60 * 1000, pollIntervalMs: 2000 };
const preflightClient = createComfyUiClient(clientOptions);
const types = [...new Set(Object.values(preview).map(n => n.class_type))];
const objectInfo = await preflightClient.getObjectInfo(types);
// -------- 既有校验器只检查通用节点、连线和模型枚举，不引入多角度执行 --------
verifyMultiAngleCapabilities(preview, objectInfo);
await json("workflow.api.json", preview);
await json("manifest.json", manifest);
process.stdout.write(`${JSON.stringify({ status: "prepared", out, plan, nodes: types.length })}\n`);
if (runGpu) {
  const ledger = { status: "submitting", artifactKey, promptId: null, startedAt: new Date().toISOString(), postAttempts: 0 };
  await writeFile(ledgerPath, JSON.stringify(ledger, null, 2), { flag: "wx" });
  const client = createComfyUiClient({
    ...clientOptions, randomId: () => artifactKey, randomSeed: () => trial.seed,
    artifactPrefix, outputNodeId: trial.outputNodeId,
    workflowFactory: createWorkflow,
    async fetchImpl(url, options) {
      const parsed = new URL(url);
      const isSubmission = options.method === "POST" && parsed.pathname.endsWith("/prompt");
      if (isSubmission) {
        if (++ledger.postAttempts !== 1) throw new Error("同一实验禁止重复提交GPU");
        await json("submission.json", ledger);
        const trace = JSON.parse(options.body).prompt;
        trace.input.inputs.base64_data = `[inference-input.png; SHA256=${sha(input)}]`;
        await json("workflow.api.json", trace);
      }
      const response = await fetch(url, options);
      if (isSubmission) {
        const body = await response.clone().json();
        ledger.promptId = body.prompt_id || null;
        ledger.status = body.prompt_id ? "submitted" : "rejected";
        await json("submission.json", ledger);
      }
      if (parsed.pathname.includes("/history/")) {
        const history = await response.clone().json();
        const item = history[ledger.promptId];
        if (item?.status?.completed || item?.status?.status_str === "error") {
          const copy = structuredClone(item);
          if (copy.prompt?.[2]?.input) copy.prompt[2].input.inputs.base64_data = `[inference-input.png; SHA256=${sha(input)}]`;
          await json("history.json", copy);
        }
      }
      return response;
    },
    workflowMetadataFactory({ historyOutputs, generationRequest, ...actual }) {
      const outputs = historyOutputs?.result?.images;
      if (!Array.isArray(outputs) || outputs.length !== 2) throw new Error("超分实验未返回完整两张PNG");
      const identities = outputs.map(value => JSON.stringify([value.filename, value.subfolder || "", value.type || "output"]));
      if (new Set(identities).size !== 2) throw new Error("超分实验返回了重复产物");
      return { ...actual, outputs };
    },
  });
  try {
    const result = await client.generateImage({
      ...plan, images: [{ image_url: `data:image/png;base64,${input.toString("base64")}` }], resolution: "2K",
    }, { queueTimeoutMs: 5 * 60 * 1000, executionTimeoutMs: 20 * 60 * 1000,
      onProgress: value => process.stdout.write(`${JSON.stringify(value)}\n`) });
    const records = [];
    for (const [index, descriptor] of result.metadata.outputs.entries()) {
      if (!descriptor.filename?.startsWith(`${artifactPrefix(artifactKey)}_`)) throw new Error("超分输出身份不符");
      const url = new URL("view", `${baseUrl.replace(/\/$/, "")}/`);
      url.search = new URLSearchParams({ filename: descriptor.filename, subfolder: descriptor.subfolder || "", type: descriptor.type || "output" });
      const bytes = index === 0 ? decodeImageDataUrl(result.images[0].url) : await loadImageBytes(url.toString());
      const decoded = sharp(bytes, { failOn: "error" });
      const metadata = await decoded.metadata();
      if (metadata.format !== "png" || metadata.width !== plan.width || metadata.height !== plan.height) throw new Error("超分原生尺寸或格式不符");
      const variant = trial.variants[index];
      await writeFile(resolve(out, `${variant}-native.png`), bytes);
      const delivered = await decoded.extract({ left: 0, top: 0, width: plan.deliveryWidth, height: plan.deliveryHeight }).png().toBuffer();
      await writeFile(resolve(out, `${variant}.png`), delivered);
      records.push({ variant, nativeSha256: sha(bytes), deliverySha256: sha(delivered), width: metadata.width, height: metadata.height, output: descriptor });
    }
    ledger.status = "complete";
    ledger.completedAt = new Date().toISOString();
    await json("submission.json", ledger);
    const { outputs, ...metadata } = result.metadata;
    await json("manifest.json", { ...manifest, status: "complete", gpuSubmissions: ledger.postAttempts, metadata, records });
    process.stdout.write(`${JSON.stringify({ status: "complete", out, promptId: ledger.promptId, records })}\n`);
  } catch (error) {
    ledger.status = error.code === "execution_failed" ? "failed" : "unknown";
    ledger.error = error.message;
    ledger.promptId ||= error.details?.promptId || null;
    await json("submission.json", ledger);
    await json("manifest.json", { ...manifest, status: ledger.status, gpuSubmissions: ledger.postAttempts, error: ledger.error, promptId: ledger.promptId });
    throw error;
  }
}

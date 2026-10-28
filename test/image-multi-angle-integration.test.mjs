/**
 * [INPUT]: 依赖Node测试、sharp、主工作台任务/API/多角度应用服务与真实执行图
 * [OUTPUT]: 单图准入、共享任务恢复、专用客户端/2K实际输入、失败回执和脱敏结果的跨层回归
 * [POS]: test 的多角度接入验证，使用内存ComfyUI替身，不发起真实GPU任务
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { createGenerationJobApiHandler } from "../src/generation-job-api.mjs";
import { createGenerationJobRegistry } from "../src/generation-jobs.mjs";
import { createGenerationService } from "../src/generation-service.mjs";
import { createImageToolsApiHandler } from "../src/image-tools-api.mjs";
import { createMultiAngleWorkflow, multiAngleMetadata } from "../src/image-multi-angle-workflow.mjs";
import { createGenerationTask, generationTaskView, readGenerationTasks, saveGenerationTask } from "../public/generation-task-state.js";
import { generationActionState } from "../public/generation-actions.js";
import { readMultiAngleConfig } from "../src/image-multi-angle-service.mjs";

const pose = { azimuth: 28, elevation: -30, distance: 100 };
function catalog() {
  const type = name => ({ UNETLoader: "MODEL", LoraLoaderModelOnly: "MODEL", ModelSamplingAuraFlow: "MODEL", CFGNorm: "MODEL", ImageScale: "IMAGE", "easy loadImageBase64": "IMAGE", VAEDecode: "IMAGE", VAEEncode: "LATENT", KSampler: "LATENT", TextEncodeQwenImageEditPlus: "CONDITIONING", ReferenceLatent: "CONDITIONING" })[name] || name;
  const graph = createMultiAngleWorkflow({ artifactKey: "test", imageBase64: "", width: 864, height: 1184, seed: 1, generationRequest: { pose } });
  return Object.fromEntries(Object.values(graph).map(node => [node.class_type, {
    output: [type(node.class_type)],
    input: { required: Object.fromEntries(Object.entries(node.inputs).map(([key, value]) => [key,
      Array.isArray(value) ? [type(graph[value[0]].class_type)] : [typeof value === "string" ? "STRING" : "INT"],
    ])) },
  }]));
}
async function fixture({ failure = false } = {}) {
  const original = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: "#958070" } }).jpeg().toBuffer();
  const body = { jobId: "generation-multi-angle-12345", featureMode: "imageMultiAngle",
    sharedInput: { referenceImages: [{ dataUrl: `data:image/jpeg;base64,${original.toString("base64")}`, name: "input.jpg", size: original.length }] },
    items: [{ key: "qwenMultiAngle", label: "Qwen 多角度", input: { cameraPose: pose } }] };
  let calls = 0, submitted, archive, syncChecks = 0;
  const imageClient = {
    async getObjectInfo(types) { assert.ok(types.includes("UNETLoader")); return catalog(); },
    async generateImage(request, options) {
      calls++; submitted = request;
      options.onProgress({ phase: "executing", promptId: "test-prompt" });
      if (failure) throw Error("显存不足，请检查任务");
      const bytes = Buffer.from(request.images[0].image_url.split(",")[1], "base64");
      const actual = await sharp(bytes).metadata();
      assert.equal(actual.width, 2048); assert.equal(actual.height, 1536);
      const graph = createMultiAngleWorkflow({ artifactKey: "test-result", imageBase64: bytes.toString("base64"),
        width: request.width, height: request.height, seed: 5, generationRequest: request });
      assert.deepEqual(graph["18"].inputs.images, ["17", 0]);
      return { images: [{ url: request.images[0].image_url }], outputFormat: "png", transport: "test",
        metadata: multiAngleMetadata({ width: request.width, height: request.height, generationRequest: request,
          actualOutputWidth: actual.width, actualOutputHeight: actual.height, promptId: "test-prompt", outputSha256: "fixture-sha" }) };
    },
  };
  const forbidden = () => { throw Error("不应访问OneAPI或飞书"); };
  const service = createGenerationService({ imageMultiAngleClient: imageClient,
    requireApiKey: forbidden, imageClientForModel: forbidden, scheduleGenerationSync: value => { archive = value; return { status: "pending", generationId: "fixture-sync" }; } });
  const jobs = createGenerationJobRegistry();
  let response;
  const handler = createGenerationJobApiHandler({ generationJobs: jobs, generationService: service,
    readJson: async () => body, sendJson: (_, status, value) => { response = { status, ...value }; }, verifySyncContract: async () => { syncChecks++; } });
  return { body, jobs, handler, imageClient, response: () => response, calls: () => calls, archive: () => archive, syncChecks: () => syncChecks, submitted: () => submitted };
}
async function finish(f) {
  for (let i = 0; i < 300 && f.jobs.get(f.body.jobId)?.status === "running"; i++) await new Promise(resolve => setTimeout(resolve, 5));
  const job = f.jobs.get(f.body.jobId);
  assert.equal(job.status, "success");
  return job;
}

test("主工作台统一任务用专用客户端压到2K、直出并同步飞书，重提同ID不重复生成", async () => {
  const f = await fixture();
  await f.handler({ method: "POST" }, {}, "/api/generation-jobs");
  assert.equal(f.response().status, 202);
  const job = await finish(f);
  const output = job.result.outcomes[0];
  assert.equal(output.status, "fulfilled");
  assert.equal(output.value.request.size, "2048x1536");
  assert.equal(output.value.sync.status, "pending");
  assert.equal(output.value.request.syncMode, "lark");
  assert.equal(f.syncChecks(), 1);
  assert.equal(f.archive().finalPrompt, f.submitted().prompt);
  assert.equal(f.archive().workflow.feature, "image-multi-angle");
  assert.equal(f.archive().workflow.promptVersion, output.value.workflow.promptVersion);
  assert.deepEqual(f.archive().workflow.pose, pose);
  assert.equal(f.archive().referenceImages[0].imageUrl, f.body.sharedInput.referenceImages[0].dataUrl);
  assert.deepEqual(output.value.upstream.metadata.pose, pose);
  assert.equal(output.value.upstream.metadata.postUpscaled, false);
  assert.equal("prompt" in output.value.upstream.metadata, false);
  assert.doesNotMatch(JSON.stringify(output.value), /safetensors/);
  assert.equal(f.submitted().width, 2048);
  await f.handler({ method: "POST" }, {}, "/api/generation-jobs");
  assert.equal(f.calls(), 1);
  await f.handler({ method: "GET" }, {}, `/api/generation-jobs/${f.body.jobId}`);
  assert.equal(f.response().job.result.outcomes[0].value.request.size, "2048x1536");
});

test("非法机位和多图在入队前拒绝，执行错误保留失败且不重试", async () => {
  const f = await fixture({ failure: true });
  f.body.items[0].input = { cameraPose: { ...pose, distance: 25 } };
  await assert.rejects(f.handler({ method: "POST" }, {}, "/api/generation-jobs"), /景别/);
  assert.equal(f.jobs.hasActiveJobs(), false);
  f.body.items[0].input = { cameraPose: pose };
  f.body.items.push(f.body.items[0]);
  await f.handler({ method: "POST" }, {}, "/api/generation-jobs");
  assert.equal(f.response().status, 400);
  f.body.items.pop();
  await f.handler({ method: "POST" }, {}, "/api/generation-jobs");
  const job = await finish(f);
  assert.equal(job.result.outcomes[0].status, "rejected");
  assert.match(job.result.outcomes[0].reason.message, /显存不足/);
  assert.equal(f.calls(), 1);
});

test("工作流目录只读准入且不泄露模型路径，节点缺失明确不可用", async () => {
  const f = await fixture(); let response;
  const handler = createImageToolsApiHandler({ imageMultiAngleClient: f.imageClient, sendJson: (_, status, body) => { response = { status, body }; } });
  assert.equal(await handler({ method: "GET" }, {}, "/api/image-multi-angle/config"), true);
  assert.equal(response.body.available, true);
  assert.equal(response.body.imagePolicy.maxInferenceEdge, 2048);
  assert.doesNotMatch(JSON.stringify(response.body), /safetensors|http:/);
  assert.equal(f.calls(), 0);
  assert.equal((await readMultiAngleConfig({ getObjectInfo: async () => ({}) })).available, false);
});

test("多角度任务按功能恢复，保留排队消息与START语义", () => {
  const task = createGenerationTask({ featureMode: "imageMultiAngle", loadingLabel: "生成视角", models: [{ key: "qwenMultiAngle", label: "多角度" }], createId: () => "multi-angle-12345" });
  const values = new Map(); const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  saveGenerationTask(storage, task);
  assert.deepEqual(readGenerationTasks(storage).imageMultiAngle, task);
  assert.equal(generationTaskView(task, { status: "running", message: "MaaS排队中", stages: { comfyUi: "queued" } }).message, "MaaS排队中");
  assert.equal(generationActionState({ featureMode: "imageMultiAngle" }).mainAriaLabel, "开始多角度编辑");
});

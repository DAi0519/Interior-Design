/**
 * [INPUT]: 依赖 node:test/assert、sharp真实PNG、ComfyUI客户端及实际KS超分阶段/共享节点合同，使用内存HTTP与时钟替身
 * [OUTPUT]: 验证嵌入KS的GPU前模型/数学节点准入、15分钟执行/5分钟排队、POST未知及后续失败零重提/Prompt身份、PNG精确交付与其他消费者隔离
 * [POS]: test 的 Flux后置KS传输安全回归，不连接真实ComfyUI或调用GPU
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { createComfyUiClient } from "../src/comfyui-client.mjs";
import { IMAGE_UPSCALE_KS_TIMEOUT_MS, IMAGE_UPSCALE_QUEUE_TIMEOUT_MS } from "../src/image-upscale-capabilities.mjs";
import { IMAGE_UPSCALE_WORKFLOWS, createSeedVrUpscaleStage } from "../src/image-upscale-workflow.mjs";

const source = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z7JkAAAAASUVORK5CYII=";
const key = "ks_seedvr2_2x_direct";
const promptId = "post-upscale-prompt";
const artifactKey = "post-upscale-request";
const filename = `CanvasLab_Flux2Klein_${artifactKey}_00001_.png`;
const images = new Map();
function output(width = 4096, height = 2304, format = "png") {
  const id = `${width}x${height}:${format}`;
  if (!images.has(id)) images.set(id, sharp({ create: { width, height, channels: 3, background: "#8a8178" } })[format]().toBuffer());
  return images.get(id);
}

function request(resolution = "4K") {
  return {
    images: [{ image_url: source }], prompt: "Preserve room structure", width: 2048, height: 1152,
    resolution, upscale_resolution: resolution, upscale_workflow_key: key,
    upscale_workflow_version: IMAGE_UPSCALE_WORKFLOWS[key].version,
    upscale_source_width: 2048, upscale_source_height: 1152,
    upscale_width: resolution === "6K" ? 6144 : 4096,
    upscale_height: resolution === "6K" ? 3456 : 2304,
  };
}

// --- 以真实阶段逐字段提供独立协议响应，可注入缺节点/模型与接口漂移 ---
function objectInfo(graph) {
  const result = {};
  for (const node of Object.values(graph)) {
    const required = result[node.class_type]?.input.required || {};
    for (const [field, value] of Object.entries(node.inputs)) {
      required[field] = field === "model" ? [[value]] : [typeof value === "number" ? "INT" : typeof value === "boolean" ? "BOOLEAN" : "STRING"];
    }
    result[node.class_type] = { input: { required } };
  }
  return result;
}

function fixture(overrides = {}) {
  const seen = { posts: 0, classes: [], histories: 0, graph: null };
  const workflowFactory = ({ generationRequest: r, seed }) => {
    const stage = createSeedVrUpscaleStage({
      generationRequest: { upscaleWorkflowKey: r.upscale_workflow_key || key, upscaleWorkflowVersion: r.upscale_workflow_version,
        resolution: r.upscale_resolution, sourceWidth: r.upscale_source_width, sourceHeight: r.upscale_source_height },
      image: ["FluxGenerated", 0], width: r.upscale_width, height: r.upscale_height, seed,
      nodeIds: { dit: "SeedVR2-DiT", vae: "SeedVR2-VAE", upscaler: "SeedVR2-Upscaler", preprocess: "SeedVR2-Preprocess" },
    });
    seen.graph = stage.nodes;
    return { ...stage.nodes, "72": { class_type: "SaveImage", inputs: { images: stage.output, filename_prefix: filename } } };
  };
  const client = createComfyUiClient({
    baseUrl: "http://comfy.example/", pollIntervalMs: 0,
    randomId: () => artifactKey, randomSeed: () => 4, webSocketFactory: () => null,
    workflowFactory: overrides.workflowFactory || workflowFactory,
    waitImpl: overrides.wait || (async () => {}),
    async fetchImpl(url, options = {}) {
      const path = new URL(url).pathname;
      if (path.startsWith("/object_info/")) {
        const type = decodeURIComponent(path.slice("/object_info/".length));
        seen.classes.push(type);
        const info = objectInfo(seen.graph);
        overrides.changeInfo?.(info);
        return Response.json(info[type] ? { [type]: info[type] } : {});
      }
      if (path === "/prompt") {
        seen.posts += 1;
        assert.equal(options.method, "POST");
        if (overrides.submit) return overrides.submit();
        return Response.json({ prompt_id: promptId });
      }
      if (path === `/history/${promptId}`) {
        seen.histories += 1;
        if (overrides.history) return overrides.history(seen);
        return success();
      }
      if (path === "/queue") return Response.json({ queue_running: [], queue_pending: [[1, promptId]] });
      if (path === "/view") {
        return new Response(await (overrides.output || output)(), { headers: { "Content-Type": overrides.contentType || "image/png" } });
      }
      throw new Error(`Unexpected ${path}`);
    },
  });
  return { client, seen };
}

function success() {
  return Response.json({ [promptId]: { outputs: { "72": { images: [{ filename, type: "output" }] } },
    status: { completed: true, status_str: "success", messages: [] } } });
}
function running(timestamp = 1000) {
  return Response.json({ [promptId]: { outputs: {}, status: { completed: false, status_str: "running",
    messages: [["execution_start", { timestamp }]] } } });
}
function clock(context) {
  const original = Date.now;
  let value = 1000;
  Date.now = () => value;
  context.after(() => { Date.now = original; });
  return { advance(milliseconds) { value += milliseconds; } };
}

test("嵌入KS按实际4K/6K子图核验模型与数学节点，单次POST后精确PNG交付", async () => {
  for (const resolution of ["4K", "6K"]) {
    const r = request(resolution);
    const { client, seen } = fixture({ output: () => output(r.upscale_width, r.upscale_height) });
    const result = await client.generateImage(r);
    assert.equal(seen.posts, 1);
    assert.equal(result.outputFormat, "png");
    assert.equal(result.metadata.outputWidth, r.upscale_width);
    assert.equal(result.metadata.outputHeight, r.upscale_height);
    assert.equal(result.metadata.promptId, promptId);
    assert.ok(seen.classes.includes("SeedVR2LoadDiTModel"));
    assert.ok(seen.classes.includes("ImageScale"));
    assert.equal(seen.classes.includes("SimpleMathDual+"), resolution === "6K");
    assert.equal(new Set(seen.classes).size, seen.classes.length);
    assert.equal(seen.classes.includes("SaveImage"), false, "只检查实际KS阶段，不扩大普通消费者门禁");
  }
});

test("缺KS节点、缺7B模型或接口漂移均409且零GPU提交", async () => {
  for (const changeInfo of [
    info => { delete info["SimpleMathDual+"]; },
    info => { info.SeedVR2LoadDiTModel.input.required.model = [["seedvr2_ema_3b_fp8_e4m3fn.safetensors"]]; },
    info => { delete info.SeedVR2LoadDiTModel.input.required.blocks_to_swap; },
    info => { info.SeedVR2VideoUpscaler.input.required.future_required = ["STRING"]; },
  ]) {
    const { client, seen } = fixture({ changeInfo });
    await assert.rejects(client.generateImage(request("6K")), error => {
      assert.equal(error.statusCode, 409); assert.equal(error.code, "post_upscale_capability");
      assert.equal(error.retryable, false); return true;
    });
    assert.equal(seen.posts, 0);
  }
});

test("低层请求省略工作流键而使用默认KS时，同样检查实际节点且不能绕过门禁", async () => {
  const r = request("6K"); delete r.upscale_workflow_key;
  const { client, seen } = fixture({ changeInfo: info => { delete info["SimpleMathDual+"]; } });
  await assert.rejects(client.generateImage(r), error => error.statusCode === 409 && error.retryable === false);
  assert.equal(seen.posts, 0);
});

test("嵌入KS只有4K/6K目标大小的PNG可交付，5K中间图/JPEG/伪PNG均不成功", async () => {
  for (const overrides of [
    { output: () => output(5120, 2880) },
    { output: () => output(4096, 2304, "jpeg"), contentType: "image/jpeg" },
    { output: () => Buffer.from("invalid png") },
  ]) {
    const { client, seen } = fixture(overrides);
    await assert.rejects(client.generateImage(request()), error => {
      assert.equal(error.statusCode, 502); assert.equal(error.code, "output_dimensions");
      assert.equal(error.retryable, false); assert.equal(error.details.promptId, promptId); return true;
    });
    assert.equal(seen.posts, 1);
  }
});

test("POST响应未知或已接收后的读取/OOM失败禁止自动重提，已知Prompt ID保留", async () => {
  const cases = [
    { submit: () => { throw new Error("connection lost after POST"); }, accepted: false },
    { submit: () => new Response("invalid JSON"), accepted: false },
    { history: () => { throw new Error("history unavailable"); }, accepted: true },
    { history: () => Response.json({ [promptId]: { outputs: {}, status: { completed: false, status_str: "error",
      messages: [["execution_error", { node_type: "SeedVR2VideoUpscaler", exception_message: "out of memory" }]] } } }), accepted: true },
  ];
  for (const scenario of cases) {
    const { client, seen } = fixture(scenario);
    await assert.rejects(client.generateImage(request()), error => {
      assert.equal(error.retryable, false);
      if (scenario.accepted) assert.equal(error.details.promptId, promptId);
      return true;
    });
    assert.equal(seen.posts, 1);
  }
});

test("嵌入KS默认允许12分钟执行，使用15分钟执行预算而非旧5分钟", async context => {
  const time = clock(context);
  const { client, seen } = fixture({ wait: async () => time.advance(6 * 60 * 1000),
    history: state => state.histories < 3 ? running() : success() });
  await client.generateImage(request());
  assert.equal(seen.histories, 3);
  assert.equal(seen.posts, 1);
  assert.equal(IMAGE_UPSCALE_KS_TIMEOUT_MS, 15 * 60 * 1000);
});

test("嵌入KS排队超过5分钟或执行超过15分钟保留Prompt且不重提", async context => {
  const time = clock(context);
  for (const phase of ["queue", "execution"]) {
    const { client, seen } = fixture({ wait: async () => time.advance((phase === "queue"
      ? IMAGE_UPSCALE_QUEUE_TIMEOUT_MS : IMAGE_UPSCALE_KS_TIMEOUT_MS) + 1),
    history: () => phase === "queue" ? Response.json({}) : running(Date.now()) });
    // 执行起点只在首次History记录时读取；后续记录不延长本地deadline。
    await assert.rejects(client.generateImage(request()), error => {
      assert.equal(error.code, phase === "queue" ? "queue_timeout" : "execution_timeout");
      assert.equal(error.details.promptId, promptId); assert.equal(error.retryable, false); return true;
    });
    assert.equal(seen.posts, 1);
  }
});

test("普通Comfy消费者不读取KS节点目录，也不套用KS的严格尺寸与不可重试规则", async () => {
  const { client, seen } = fixture({ workflowFactory: () => ({ "72": { class_type: "SaveImage", inputs: {} } }),
    output: () => Buffer.from(source.split(",")[1], "base64") });
  const r = request(); delete r.upscale_workflow_key; delete r.upscale_resolution;
  const result = await client.generateImage(r);
  assert.equal(result.metadata.outputWidth, 1);
  assert.equal(seen.classes.length, 0);
  assert.equal(seen.posts, 1);
  const failed = fixture({ workflowFactory: () => ({}), submit: () => { throw new Error("network error"); } });
  await assert.rejects(failed.client.generateImage(r), error => error.retryable !== false);
});

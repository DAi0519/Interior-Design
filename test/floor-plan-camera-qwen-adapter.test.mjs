/**
 * [INPUT]: 依赖 Qwen 2511 机位工作流适配器、独立节点合同快照与内存 ComfyUI HTTP 假响应
 * [OUTPUT]: 验证单次提交的单图节点图、提示词和采样、权重/画幅准入及原生 PNG 尺寸与任务身份
 * [POS]: test 的平面图机位 Qwen 传输回归测试，不访问网络或执行 GPU 任务
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { createFloorPlanCameraQwenClient, FLOOR_PLAN_CAMERA_QWEN } from "../src/floor-plan-camera-qwen.mjs";
import { qwenMaskFillObjectInfo } from "./image-mask-fill-qwen-fixture.mjs";

const png = (width, height) => sharp({ create: { width, height, channels: 3, background: "#f6f6f6" } }).png().toBuffer();
const reference = (await png(96, 64)).toString("base64");
const input = { prompt: "  按蓝点标注生成室内视角。\n床头靠左墙。  ", images: [{ image_url: `data:image/png;base64,${reference}` }] };
const promptId = "qwen-prompt-123";
const filename = "CanvasLab_Qwen2511_FloorPlan_request-123_00001_.png";

function createFixture({ output, missingWeights } = {}) {
  // 额外两个节点使用楚雄 object_info 的独立端口快照。
  const objectInfo = {
    ...qwenMaskFillObjectInfo(),
    FluxKontextMultiReferenceLatentMethod: {
      input: { required: { conditioning: ["CONDITIONING"], reference_latents_method: ["COMBO", {
        options: ["offset", "index", "uxo/uno", "index_timestep_zero"],
      }] } },
      output: ["CONDITIONING"],
    },
    EmptySD3LatentImage: {
      input: { required: { width: ["INT"], height: ["INT"], batch_size: ["INT"] } },
      output: ["LATENT"],
    },
  };
  if (missingWeights) objectInfo.UNETLoader.input.required.unet_name = [["other-weights.safetensors"]];
  const calls = { preflights: [], submissions: [] };
  const client = createFloorPlanCameraQwenClient({
    baseUrl: "http://workflows.test/",
    randomSeed: () => 42,
    randomId: () => "request-123",
    fetchImpl: async (url, options) => {
      if (url.pathname.startsWith("/object_info/")) {
        const type = decodeURIComponent(url.pathname.split("/").at(-1));
        calls.preflights.push(type);
        return Response.json({ [type]: objectInfo[type] });
      }
      if (url.pathname === "/prompt") {
        calls.submissions.push(JSON.parse(options.body).prompt);
        return Response.json({ prompt_id: promptId });
      }
      if (url.pathname === `/history/${promptId}`) {
        return Response.json({ [promptId]: {
          outputs: { output: { images: [{ filename, type: "output" }] } },
          status: { completed: true, status_str: "success" },
        } });
      }
      if (url.pathname === "/view") {
        assert.equal(url.searchParams.get("filename"), filename);
        return new Response(output, { headers: { "Content-Type": "image/png" } });
      }
      throw new Error(`测试接口未实现 ${url.pathname}`);
    },
  });
  return { calls, client };
}

test("Qwen 2511 以原词和单张标注图生成 1280×720，返回同次产物与回执", async () => {
  const output = await png(1280, 720);
  const { calls, client } = createFixture({ output });
  assert.deepEqual(await client.checkAvailability(), { available: true, reason: null });
  const result = await client.generateImage(input);
  assert.equal(calls.submissions.length, 1);
  const [graph] = calls.submissions;
  assert.equal(graph.input.inputs.base64_data, reference);
  assert.equal(graph.positive.inputs.prompt, input.prompt);
  assert.equal(graph.negative.inputs.prompt, "");
  assert.deepEqual(graph.positive.inputs.image1, ["input", 0]);
  assert.deepEqual(graph.negative.inputs.image1, ["input", 0]);
  assert.equal(graph.positive.inputs.image2, undefined);
  assert.deepEqual(graph.latent.inputs, { width: 1280, height: 720, batch_size: 1 });
  assert.deepEqual(graph.sample.inputs.latent_image, ["latent", 0]);
  assert.deepEqual(graph.sample.inputs.positive, ["positiveMethod", 0]);
  assert.equal(graph.sample.inputs.steps, 40);
  assert.equal(graph.sample.inputs.cfg, 4);
  assert.equal(graph.sample.inputs.seed, 42);
  assert.equal(result.requestId, promptId);
  assert.equal(result.metadata.promptId, promptId);
  assert.equal(result.metadata.workflowVersion, FLOOR_PLAN_CAMERA_QWEN.workflowVersion);
  assert.equal(result.metadata.referenceImageCount, 1);
  assert.deepEqual(result.images, [{ url: `data:image/png;base64,${output.toString("base64")}` }]);
});

test("错误画幅、多参考及未装权重在提交前阻断", async () => {
  const { calls, client } = createFixture({ missingWeights: true });
  await assert.rejects(client.generateImage({ ...input, width: 2048 }), { code: "qwen_size" });
  await assert.rejects(client.generateImage({ ...input, images: [...input.images, ...input.images] }), { code: "reference_count" });
  assert.equal(calls.preflights.length, 0);
  assert.equal((await client.checkAvailability()).available, false);
  await assert.rejects(client.generateImage(input), { code: "qwen_capability", statusCode: 409 });
  assert.equal(calls.submissions.length, 0);
});

test("返回错误尺寸时保留原任务 ID，可查询且无二次提交", async () => {
  const { calls, client } = createFixture({ output: await png(1024, 576) });
  await assert.rejects(client.generateImage(input), { code: "output_dimensions", details: { promptId } });
  assert.equal(calls.submissions.length, 1);
});

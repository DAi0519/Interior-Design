/**
 * [INPUT]: 依赖 node:test/assert、sharp 真实 PNG、旧房两阶段工作流、任务 API/注册表和飞书字段投影
 * [OUTPUT]: 覆盖旧房原图与清空图隔离、先准入后收费、全部家电含壁挂空调/嵌入式移除与硬装固定柜体保留、版本追踪、两次归档关联/真实尺寸/SHA、两阶段失败零自动重试、已清空产物保留及包装请求/恢复合同
 * [POS]: test 的旧房改造集成测试，模型与同步均使用内存替身，不调用收费服务或写真实 Base
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

import { createGenerationJobApiHandler } from "../src/generation-job-api.mjs";
import { createGenerationJobRegistry, runGenerationJobBatch } from "../src/generation-jobs.mjs";
import { createGenerationService } from "../src/generation-service.mjs";
import { buildRecordFields } from "../src/lark-sync.mjs";
import { ROOM_CLEARANCE_PROMPT, ROOM_CLEARANCE_PROMPT_VERSION,
  executeRoomRenovationWorkflow, validateRoomRenovationInput } from "../src/room-renovation-workflow.mjs";

async function image(color, width = 64, height = 48) {
  const bytes = await sharp({ create: { width, height, channels: 3, background: color } }).png().toBuffer();
  return { dataUrl: `data:image/png;base64,${bytes.toString("base64")}`, name: `${color}.png` };
}

async function fixture() {
  const [original, cleared, designed] = await Promise.all([image("red"), image("white"), image("blue")]);
  const requests = [], prompts = [], archives = [], progress = [];
  const input = { featureMode: "emptyRoom", roomRenovation: true, roomType: "客厅",
    renderMode: "smart-default", promptAgentModelKey: "gemini3pro", modelKey: "gptImage2",
    referenceImages: [original], resolution: "1K", outputFormat: "png", prompt: "暖色调" };
  const options = {
    availableModels: [{ id: "gemini-3.1-pro-preview" }],
    client: { async generatePrompt(request) {
      prompts.push(request);
      return { text: JSON.stringify({ scene_preservation: "Keep the shell and camera.",
        visual_application: { materials: "Oak", colors: "Warm white", photography: "Daylight" },
        generation_requirement: "Photorealistic" }) };
    } },
    imageClient: { async generateImage(request) {
      requests.push(request);
      return { images: [{ url: requests.length === 1 ? cleared.dataUrl : designed.dataUrl }],
        outputFormat: "png", transport: "responses", metadata: { testModelResult: requests.length } };
    } },
    loadAgent: async code => ({ code, version: 1, name: "空房智能默认", systemPrompt: "empty room" }),
    scheduleSync(archive) { archives.push(archive); return { generationId: `generation-${archives.length}`, status: "pending" }; },
    onProgress(value) { progress.push(value); },
  };
  return { original, cleared, designed, input, options, requests, prompts, archives, progress };
}

test("旧房照片先清空，空房 Agent 和最终出图均只读取清空图，保留三图与关联归档", async () => {
  const f = await fixture();
  const result = await executeRoomRenovationWorkflow(f.input, f.options);
  assert.equal(f.requests.length, 2);
  assert.equal(f.requests[0].prompt, ROOM_CLEARANCE_PROMPT);
  assert.equal(f.requests[0].images[0].image_url, f.original.dataUrl);
  assert.equal(f.prompts[0].imageUrl, f.cleared.dataUrl);
  assert.equal(f.requests[1].images[0].image_url, f.cleared.dataUrl);
  assert.equal(result.images[0].url, f.designed.dataUrl);
  assert.deepEqual(result.roomRenovation.originalImage, { url: f.original.dataUrl, width: 64, height: 48 });
  assert.deepEqual(result.roomRenovation.clearedImage, { url: f.cleared.dataUrl, width: 64, height: 48 });
  assert.equal(result.roomRenovation.promptVersion, ROOM_CLEARANCE_PROMPT_VERSION);
  assert.deepEqual(f.progress.map(entry => entry.phase), ["clearing", "designing", "completed"]);
  assert.equal(f.archives.length, 2);
  assert.equal(f.archives[0].referenceImages[0].imageUrl, f.original.dataUrl);
  assert.equal(f.archives[0].resultImage.url, f.cleared.dataUrl);
  assert.equal(f.archives[1].referenceImages[0].imageUrl, f.cleared.dataUrl);
  assert.equal(f.archives[0].workflow.roomRenovation.stage, "clearance");
  assert.equal(f.archives[0].workflow.roomRenovation.promptVersion, "room-clearance-2026-10-21.2");
  assert.equal(f.archives[1].workflow.roomRenovation.stage, "design");
  assert.equal(f.archives[1].workflow.roomRenovation.promptVersion, "room-clearance-2026-10-21.2");
  assert.equal(f.archives[1].workflow.roomRenovation.clearanceGenerationId, "generation-1");
  assert.equal(f.archives[0].workflow.roomRenovation.pipelineId, f.archives[1].workflow.roomRenovation.pipelineId);
  assert.match(f.archives[0].workflow.roomRenovation.clearedSha256, /^[a-f0-9]{64}$/);
  assert.notEqual(f.archives[0].workflow.roomRenovation.originalSha256, f.archives[0].workflow.roomRenovation.clearedSha256);
  for (const [index, archive] of f.archives.entries()) {
    const fields = buildRecordFields({ ...archive, actualSize: "64x48" });
    assert.equal(fields["功能"], "空房设计");
    assert.match(fields["标题"], index ? /^旧房改造 · 设计/ : /^旧房改造 · 清空/);
    assert.equal(JSON.parse(fields["生成参数"]).workflow.roomRenovation.pipelineId, result.roomRenovation.pipelineId);
    assert.equal(fields["最终 Prompt"], archive.finalPrompt);
  }
});

test("清空v2移除全部家电含壁挂空调与嵌入式，保留硬装、固定柜体和原机位", () => {
  assert.equal(ROOM_CLEARANCE_PROMPT_VERSION, "room-clearance-2026-10-21.2");
  assert.match(ROOM_CLEARANCE_PROMPT, /Remove all movable furniture, all appliances and electronics/);
  assert.match(ROOM_CLEARANCE_PROMPT, /whether freestanding, wall-mounted, ceiling-mounted or built into cabinetry/);
  assert.match(ROOM_CLEARANCE_PROMPT, /including wall-mounted air conditioners/);
  assert.match(ROOM_CLEARANCE_PROMPT, /Being fixed or built-in never exempts an appliance from removal/);
  assert.match(ROOM_CLEARANCE_PROMPT, /walls, ceiling, floor/);
  assert.match(ROOM_CLEARANCE_PROMPT, /Preserve fixed built-in cabinetry/);
  assert.match(ROOM_CLEARANCE_PROMPT, /preserve the surrounding cabinetry when removing an integrated appliance/);
  assert.match(ROOM_CLEARANCE_PROMPT, /preservation rules do not apply to any appliance or electronics/);
  assert.match(ROOM_CLEARANCE_PROMPT, /original camera position/);
  assert.match(ROOM_CLEARANCE_PROMPT, /Do not.*redesign the finishes/);
  assert.doesNotMatch(ROOM_CLEARANCE_PROMPT, /permanent architectural fixtures/);
});

test("旧房和普通空房一样允许不填补充要求，预检不把用户空要求当最终Prompt", async () => {
  const f = await fixture();
  f.input.prompt = "";
  const result = await executeRoomRenovationWorkflow(f.input, f.options);
  assert.equal(f.requests.length, 2);
  assert.equal(result.images[0].url, f.designed.dataUrl);
});

test("房型、Agent 权限、版本和出图参数不合法时，第一次清空也不得收费", async () => {
  for (const kind of ["room", "access", "agent", "resolution"]) {
    const f = await fixture();
    if (kind === "room") f.input.roomType = "";
    if (kind === "access") f.options.availableModels = [];
    if (kind === "agent") f.options.loadAgent = async () => { throw new Error("所选版本已下架"); };
    if (kind === "resolution") f.input.resolution = "invalid";
    await assert.rejects(executeRoomRenovationWorkflow(f.input, f.options), error => {
      assert.match(error.message, /旧房改造前置校验失败/);
      return true;
    });
    assert.equal(f.requests.length, 0);
    assert.equal(f.prompts.length, 0);
    assert.equal(f.archives.length, 0);
  }
});

test("清空接口失败或无效产物均不进入 Agent/设计，且不自动重试", async () => {
  for (const mode of ["throw", "empty", "corrupt"]) {
    const f = await fixture();
    let calls = 0;
    f.options.imageClient.generateImage = async () => {
      calls += 1;
      if (mode === "throw") throw new Error("模型超时");
      return { images: mode === "empty" ? [] : [{ url: "data:image/png;base64,YmFk" }] };
    };
    await assert.rejects(executeRoomRenovationWorkflow(f.input, f.options), error => {
      assert.match(error.message, /第 1\/2 步（清空）失败/);
      assert.equal(error.roomRenovation.failedStage, "clearing");
      return true;
    });
    assert.equal(calls, 1);
    assert.equal(f.prompts.length, 0);
    assert.equal(f.archives.length, 0);
  }
});

test("设计失败保留已经生成并归档的清空图，任务错误快照跨刷新可读且不重跑", async () => {
  const f = await fixture();
  f.options.client.generatePrompt = async () => { throw new Error("Agent 超时"); };
  const outcomes = await runGenerationJobBatch({ items: [{ key: "gptImage2" }],
    execute: () => executeRoomRenovationWorkflow(f.input, f.options) });
  assert.equal(f.requests.length, 1);
  assert.equal(f.archives.length, 1);
  assert.equal(outcomes[0].status, "rejected");
  assert.match(outcomes[0].reason.message, /第 2\/2 步（设计）失败.*Agent 超时/);
  assert.equal(outcomes[0].reason.roomRenovation.clearedImage.url, f.cleared.dataUrl);
  assert.equal(outcomes[0].reason.roomRenovation.clearanceSync.generationId, "generation-1");
  assert.equal(outcomes[0].reason.roomRenovation.originalImage.url, f.original.dataUrl);
});

test("旧房标记只允许空房设计，非法类型或没有主图都在准入拒绝", async () => {
  const f = await fixture();
  assert.equal(validateRoomRenovationInput({ roomRenovation: false }, "free"), false);
  assert.throws(() => validateRoomRenovationInput({ ...f.input, roomRenovation: "true" }), /必须是布尔值/);
  assert.throws(() => validateRoomRenovationInput(f.input, "whiteModel"), /只能包装空房设计/);
  assert.throws(() => validateRoomRenovationInput({ ...f.input, referenceImages: [] }), /1 张旧房照片/);
  const service = createGenerationService({});
  assert.throws(() => service.executeForMode("free", f.input), /只能包装空房设计/);
});

test("后台任务接受多张旧房包装、每项透传进度，按独立功能恢复；混合包装与Schema漂移不入队", async () => {
  const f = await fixture();
  const body = { jobId: "generation-renovation-12345678", featureMode: "emptyRoom",
    sharedInput: f.input, items: [1, 2].map(index => ({ key: `gptImage2-${index}`, input: {} })) };
  let response, executions = 0, schemaFailure = false;
  const jobs = createGenerationJobRegistry();
  const handler = createGenerationJobApiHandler({ generationJobs: jobs,
    generationService: { async executeForMode(mode, input, options) {
      executions += 1;
      assert.equal(mode, "emptyRoom"); assert.equal(input.roomRenovation, true);
      options.onProgress({ phase: "designing", message: "旧房改造 2/2" });
      return { roomRenovation: { clearedImage: { url: f.cleared.dataUrl } } };
    } }, readJson: async () => body,
    sendJson(_, statusCode, value) { response = { statusCode, ...value }; },
    verifySyncContract: async () => { if (schemaFailure) throw new Error("Schema 漂移"); },
  });
  await handler({ method: "POST" }, {}, "/api/generation-jobs");
  assert.equal(response.statusCode, 202);
  assert.equal(response.job.featureMode, "roomRenovation");
  assert.deepEqual(response.job.stages, { roomRenovation: "clearing" });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(executions, 2);
  assert.deepEqual(jobs.get(body.jobId).stages, { roomRenovation: "designing" });
  body.jobId = "generation-renovation-87654321";
  body.items[1].input.roomRenovation = false;
  await handler({ method: "POST" }, {}, "/api/generation-jobs");
  assert.equal(response.statusCode, 400);
  assert.match(response.error, /不能混合/);
  body.items[1].input.roomRenovation = true;
  schemaFailure = true;
  await handler({ method: "POST" }, {}, "/api/generation-jobs");
  assert.equal(response.statusCode, 409);
  assert.equal(jobs.get(body.jobId), null);
  assert.equal(executions, 2);
});

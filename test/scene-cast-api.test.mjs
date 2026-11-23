/**
 * [INPUT]: 依赖AI模特HTTP处理器、GPT异步客户端替身、真实PNG和可控会话
 * [OUTPUT]: 验证通用短词与互动选项、配置权限、三图顺序及摘要、旧单参考兼容和同ID幂等
 * [POS]: test 的AI模特API离线验收，不调用真实模型、不写外部服务
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import test from "node:test";
import sharp from "sharp";
import { createSceneCastApiHandler } from "../src/scene-cast-api.mjs";
import { prepareSceneCastInput } from "../src/scene-cast-service.mjs";
import { buildAsyncImageEditRequest } from "../src/oneapi-image-async.mjs";
import { staticSecurityHeaders } from "../src/http-security.mjs";

const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const png = (width, height, background) => sharp({ create: { width, height, channels: 3, background } }).png().toBuffer();
const [sourceBytes, referenceBytes, resultBytes] = await Promise.all([
  png(256, 192, "#808080"), png(100, 200, "#183450"), png(2048, 1536, "#909188"),
]);
const url = (bytes, mimeType = "image/png") => `data:${mimeType};base64,${bytes.toString("base64")}`;
const model = { id: "gpt-image-2.5-sunburst" };
const input = {
  sourceImage: { name: "原效果图.png", dataUrl: url(sourceBytes) },
  referenceImage: { name: "人物参考.png", dataUrl: url(referenceBytes) },
  referenceSubject: "person",
  cast: { people: [{ age: "成年", gender: "女", region: "亚洲", build: "中等", hairColor: "黑色", description: "浅灰上衣" }],
    pets: [{ species: "狗", breed: "柯基", description: "等人抚摸" }], interaction: "yes" },
  position: "画面右侧", action: "人物蹲下，轻轻抚摸狗", resolution: "2K", quality: "medium", ratio: "auto",
  sourceRender: { model: "different-source-model", size: "256x192", resolution: "1K", outputSha256: sha(sourceBytes),
    actualPrompt: "真实原渲染提示词", parameters: { renderStyle: "cinematic", lights: [{ action: "keep" }] } },
};

function harness({ listModels = async () => [model], editImageAsync } = {}) {
  const client = { listModels, editImageAsync };
  const api = createSceneCastApiHandler({ getImageClient: () => client, getOneApiModels: listModels,
    readJson: async request => request.body, sendJson(response, status, value) { Object.assign(response, { status, value }); } });
  async function request(method, path, body) {
    const response = {};
    await api({ method, body }, response, `/api/scene-cast${path}`);
    return response;
  }
  return { api, request };
}

async function until(check) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const value = await check();
    if (value) return value;
    await setTimeout(10);
  }
  assert.fail("AI模特替身任务未进入预期阶段");
}

test("配置只开放有权限的GPT模型，同源嵌入只开放页面", async () => {
  const access = [{ id: "gpt-image-2.6-flare" }];
  const { request } = harness({ listModels: async () => access });
  const { value } = await request("GET", "/config");
  assert.equal(value.available, true);
  assert.equal(value.defaultModelKey, "gptImage26Flare");
  assert.deepEqual(value.models.filter(entry => entry.available).map(entry => entry.id), [access[0].id]);
  assert.equal(value.maxSubjects, 4);
  assert.deepEqual(value.referenceRoles, ["person", "pet"]);
  assert.equal(value.imagePolicy.maxTotalBytes, 20 * 1024 * 1024);
  assert.equal(value.workflow.version, "2026-11-17.scene-cast.4");
  assert.equal(staticSecurityHeaders("/scene-cast.html")["X-Frame-Options"], "SAMEORIGIN");
  assert.equal(staticSecurityHeaders("/api/scene-cast/config")["X-Frame-Options"], "DENY");
});

test("旧单参考在人物宠物同场时保持图序和摘要，重复提交只编辑一次", async () => {
  const result = Promise.withResolvers();
  const calls = [];
  const { api, request } = harness({ async editImageAsync(payload, { onSubmitted }) {
    calls.push(payload);
    onSubmitted({ id: "resp_cast_test", status: "in_progress" });
    return result.promise;
  } });
  const jobId = "cast-fixture-001";
  const get = () => request("GET", `/jobs/${jobId}`);
  const [first, second] = await Promise.all([request("POST", "/jobs", { jobId, ...input }), request("POST", "/jobs", { jobId, input })]);
  assert.equal(first.status, 202);
  assert.equal(second.value.job.jobId, jobId);
  await assert.rejects(request("POST", "/jobs", { jobId, ...input, position: "左侧" }), error => error.statusCode === 409);
  const active = await get();
  assert.equal(active.value.job.stages.upstreamResponseId, "resp_cast_test");
  assert.equal(api.hasActiveJobs(), true);
  assert.equal(calls.length, 1);
  const [sent] = calls;
  assert.deepEqual(sent.images, [{ image_url: input.sourceImage.dataUrl }, { image_url: input.referenceImage.dataUrl }]);
  assert.equal(sent.size, "2048x1536");
  assert.equal(sent.model, model.id);
  assert.equal(sent.n, 1);
  assert.ok(sent.prompt.indexOf(input.action) < sent.prompt.indexOf("Person 1"));
  assert.match(sent.prompt, /Add 1 person and 1 pet/);
  for (const phrase of ["Person 1", "Pet 1", "柯基", input.position, "interact naturally", "identity reference for person 1"]) {
    assert.ok(sent.prompt.includes(phrase));
  }
  assert.ok(!sent.prompt.includes(input.sourceRender.actualPrompt));
  const usageCost = { currency: "CNY", payableAmount: 0.125 };
  result.resolve({ requestId: "req-cast-test", usageCost, images: [{ url: url(resultBytes) }] });
  const job = await until(async () => {
    const { value } = await get();
    return value.job.status === "success" ? value.job : null;
  });
  assert.equal(api.hasActiveJobs(), false);
  assert.deepEqual(job.result.images, [{ url: url(resultBytes) }]);
  assert.deepEqual(job.result.request.sourceRender, input.sourceRender);
  assert.deepEqual(job.result.request.cast, input.cast);
  assert.equal(job.result.request.referenceSubject, "person");
  assert.deepEqual(job.result.request.referenceSubjects, ["person"]);
  assert.deepEqual(job.result.upstream.usageCost, usageCost);
  assert.equal(job.result.upstream.metadata.prompt, sent.prompt);
  assert.equal(job.result.upstream.metadata.referenceSha256, sha(referenceBytes));
  assert.equal(job.result.upstream.metadata.outputSha256, sha(resultBytes));
  assert.equal((await request("POST", "/jobs", { jobId, input })).value.job.status, "success");
  assert.equal(calls.length, 1);
});

test("人物和宠物参考各自保留身份及原始/送模摘要，三张图以固定顺序进入Responses", async () => {
  const petBytes = await sharp(referenceBytes).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const { referenceImage, referenceSubject: unusedSubject, ...common } = input;
  let sent;
  const { request } = harness({ async editImageAsync(payload) {
    sent = buildAsyncImageEditRequest(payload);
    return { requestId: "req-dual", images: [{ url: url(resultBytes) }] };
  } });
  // -------- 上传对象键按宠物优先排列，送模仍必须场景、人物、宠物 --------
  const jobId = "cast-dual-test-001";
  const response = await request("POST", "/jobs", { jobId, ...common, referenceImages: {
    pet: { name: "宠物参考.jpg", dataUrl: url(petBytes, "image/jpeg") }, person: referenceImage,
  } });
  assert.equal(response.status, 202);
  const job = await until(async () => {
    const { value } = await request("GET", `/jobs/${jobId}`);
    assert.notEqual(value.job.status, "failed", value.job.error);
    return value.job.status === "success" ? value.job : null;
  });
  const [text, scene, person, pet] = sent.input[0].content;
  assert.match(text.text, /image 2 only as the identity reference for person 1/);
  assert.match(text.text, /image 3 only as the identity reference for pet 1/);
  assert.match(text.text, /Preserve the original room design, camera angle and lighting/);
  assert.equal(scene.image_url, input.sourceImage.dataUrl);
  assert.equal(person.image_url, referenceImage.dataUrl);
  const petSubmitted = Buffer.from(pet.image_url.split(",")[1], "base64");
  const { request: receipt, upstream: { metadata } } = job.result;
  assert.deepEqual(receipt.referenceSubjects, ["person", "pet"]);
  assert.equal(receipt.referenceSubject, null);
  assert.doesNotMatch(JSON.stringify(receipt), /data:image\//);
  assert.equal(metadata.referenceSha256, null);
  assert.equal(metadata.referenceImageCount, 3);
  assert.deepEqual(metadata.referenceImages, [
    { role: "person", imageIndex: 2, mimeType: "image/png", fileName: "人物参考.png", width: 100, height: 200,
      originalWidth: 100, originalHeight: 200, originalSizeBytes: referenceBytes.length, submittedSizeBytes: referenceBytes.length,
      originalSha256: sha(referenceBytes), submittedSha256: sha(referenceBytes) },
    { role: "pet", imageIndex: 3, mimeType: "image/jpeg", fileName: "宠物参考.jpg", width: 200, height: 100,
      originalWidth: 100, originalHeight: 200, originalSizeBytes: petBytes.length, submittedSizeBytes: petSubmitted.length,
      originalSha256: sha(petBytes), submittedSha256: sha(petSubmitted) },
  ]);
  assert.notEqual(sha(petBytes), sha(petSubmitted));
});

test("角色参考图不能用于未启用角色或混用旧字段，仅有宠物参考时使用图2", async () => {
  const { sourceImage, referenceImage } = input;
  await assert.rejects(prepareSceneCastInput({ sourceImage, referenceImage, referenceImages: { person: referenceImage } }), /不能混用/);
  await assert.rejects(prepareSceneCastInput({ sourceImage, referenceImages: { pet: referenceImage } }), /需要先启用/);
  await assert.rejects(prepareSceneCastInput({ sourceImage, referenceImages: { extra: referenceImage } }), /未知字段/);
  await assert.rejects(prepareSceneCastInput({ sourceImage, referenceImages: { person: null } }), /请上传人物参考图/);
  const prepared = await prepareSceneCastInput({ sourceImage, cast: input.cast, referenceImages: { pet: referenceImage } });
  assert.match(prepared.prompt, /image 2 only as the identity reference for pet 1/);
  assert.doesNotMatch(prepared.prompt, /image 3/i);
});

test("图片来源摘要错误、歧义、超限或失权均在收费编辑前阻断", async () => {
  let calls = 0;
  const { request } = harness({ listModels: async () => [], editImageAsync() { calls += 1; } });
  const jobId = "cast-fixture-002";
  const submit = overrides => request("POST", "/jobs", { jobId, ...input, ...overrides });
  await assert.rejects(submit({ referenceSubject: undefined }), /参考图对应/);
  await assert.rejects(submit({ sourceRender: { outputSha256: "a".repeat(64) } }), /产物摘要/);
  await assert.rejects(submit({ cast: { people: [{}, {}, {}, {}], pets: [{}] } }), /1–4位/);
  await assert.rejects(submit({ sourceRender: { parameters: { image: input.sourceImage.dataUrl } } }), /不能包含图片/);
  await assert.rejects(submit({}), error => error.statusCode === 409 && /权限/.test(error.message));
  assert.equal((await request("GET", `/jobs/${jobId}`)).status, 404);
  assert.equal(calls, 0);
});

test("只有一位模特仍可选择与原场景互动，分别支持自动和指定画幅", async () => {
  const common = { sourceImage: input.sourceImage, cast: { people: [{ age: "青年" }], interaction: "yes" }, action: "坐在原有沙发上" };
  const [automatic, specified] = await Promise.all([prepareSceneCastInput(common), prepareSceneCastInput({ ...common, ratio: "16:9" })]);
  assert.equal(automatic.size, "1024x768");
  assert.equal(specified.size, "1536x864");
  assert.match(automatic.prompt, /natural interaction with the scene/);
  assert.match(automatic.prompt, /坐在原有沙发上/);
  assert.doesNotMatch(automatic.prompt, /image 2|pet 1/i);
});

test("同场自动互动的默认词适用于不同底图，显式各自活动覆盖默认互动", async () => {
  const cast = { people: [{}], pets: [{}] };
  const referenceImages = { person: input.referenceImage, pet: input.referenceImage };
  const anotherScene = await png(320, 180, "#523827");
  const common = { sourceImage: input.sourceImage, cast, referenceImages };
  const [first, second, independent, withAction] = await Promise.all([
    prepareSceneCastInput(common),
    prepareSceneCastInput({ ...common, sourceImage: { name: "另一张.png", dataUrl: url(anotherScene) } }),
    prepareSceneCastInput({ ...common, cast: { ...cast, interaction: "no" } }),
    prepareSceneCastInput({ ...common, action: "两个角色分别看向镜头" }),
  ]);
  assert.equal(first.prompt, second.prompt);
  assert.match(first.prompt, /Add 1 person and 1 pet/);
  assert.match(first.prompt, /interact naturally in the scene/);
  assert.doesNotMatch(first.prompt, /Position:|Action:|Person 1:|Pet 1:/);
  assert.match(independent.prompt, /without deliberate interaction/);
  assert.doesNotMatch(independent.prompt, /interact naturally/);
  assert.match(withAction.prompt, /Action: 两个角色分别看向镜头/);
  assert.doesNotMatch(withAction.prompt, /interact naturally/);
});

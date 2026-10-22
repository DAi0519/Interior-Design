/**
 * [INPUT]: 依赖 node:test/assert、sharp 与摄影机球机位/图片压缩/原生执行图适配器
 * [OUTPUT]: 三档景别、后半圈绕主体/背面语义、长边2K、大图压缩/EXIF/准入与产物的离线验证
 * [POS]: test 的独立多角度试跑回归，不调用 MaaS 或产生图片
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { planMultiAngleImage, prepareMultiAngleImage } from "../src/image-multi-angle-image.mjs";
import { cameraPosePrompt, normalizeCameraPose, createMultiAngleWorkflow, verifyMultiAngleCapabilities, multiAngleMetadata } from "../src/image-multi-angle-workflow.mjs";

const pose = { azimuth: 28, elevation: -30, distance: 50 };
test("摄影机正面闭合，左侧方向不误写成右转270度", () => {
  assert.deepEqual(normalizeCameraPose({ ...pose, azimuth: 360 }), { ...pose, azimuth: 0 });
  assert.match(cameraPosePrompt({ ...pose, azimuth: 270 }), /向左旋转90度/);
  assert.match(cameraPosePrompt(pose), /向右旋转28度.*仰视角度30度/);
  assert.equal(cameraPosePrompt({ azimuth: 0, elevation: 0, distance: 50 }), "保持原图正面视角与景别。");
  assert.match(cameraPosePrompt({ ...pose, elevation: 60, distance: 0 }), /俯视角度60度.*特写镜头/);
  assert.match(cameraPosePrompt({ ...pose, distance: 100 }), /^将镜头向后移动.*主体在画面中明显变小.*向右旋转28度/);
});
test("不允许空值、数值字符串和范围外机位隐式进入GPU", () => {
  for (const invalid of [null, {}, { ...pose, azimuth: "28" }, { ...pose, elevation: -31 }, { ...pose, distance: 101 }, { ...pose, azimuth: NaN }]) {
    assert.throws(() => normalizeCameraPose(invalid), /必须为/);
  }
});
test("后半圈明确从对侧向原摄影机反打，保留方位与俯仰景别语义", () => {
  const prompt = azimuth => cameraPosePrompt({ azimuth, elevation: 0, distance: 50 });
  assert.match(prompt(168), /向右旋转168度.*右后方反打机位.*向左偏转12度.*背靠窗户向室内拍摄.*保持平视.*保持标准景别/);
  assert.match(prompt(180), /向右旋转180度.*正后方反打机位.*C到B到A.*不做原图水平镜像/);
  assert.match(prompt(192), /向左旋转168度.*左后方反打机位.*向右偏转12度/);
  for (const angle of [91, 269]) assert.match(prompt(angle), /展示原摄影机身后的空间/);
  for (const angle of [0, 90, 270, 360]) assert.doesNotMatch(prompt(angle), /反打镜头/);
  assert.match(cameraPosePrompt({ azimuth: 180, elevation: 8, distance: 0 }), /正后方.*俯视角度8度.*特写镜头/);
});
test("参考图和采样潜空间同尺寸，Plus不会另建1024平方参考", () => {
  const graph = createMultiAngleWorkflow({ artifactKey: "test-run", imageBase64: "bytes", width: 864, height: 1184, seed: 123, generationRequest: { pose } });
  assert.equal(graph["9"].inputs.width, 864);
  assert.equal(graph["9"].inputs.height, 1184);
  assert.deepEqual(graph["11"].inputs.pixels, ["9", 0]);
  assert.equal("vae" in graph["12"].inputs, false);
  assert.equal("vae" in graph["13"].inputs, false);
  assert.deepEqual(graph["14"].inputs.latent, graph["16"].inputs.latent_image);
  assert.deepEqual(graph["15"].inputs.latent, graph["16"].inputs.latent_image);
  assert.equal(graph["16"].inputs.steps, 8);
  assert.equal(graph["16"].inputs.seed, 123);
  assert.deepEqual(graph["6"].inputs.model, ["5", 0]);
  assert.equal(graph["18"].inputs.filename_prefix, "canvas_lab_multi_angle_test-run");
  assert.deepEqual(graph["18"].inputs.images, ["17", 0]);
});

test("大图长边2K直接推理，不限制100万像素，不在出图后放大", () => {
  const imagePlan = planMultiAngleImage(4000, 3000);
  assert.equal(imagePlan.inferenceWidth, 2048);
  assert.equal(imagePlan.inferenceHeight, 1536);
  assert.equal(imagePlan.outputWidth, 2048);
  assert.equal(imagePlan.outputHeight, 1536);
  const graph = createMultiAngleWorkflow({ artifactKey: "2k", imageBase64: "bytes", width: 2048, height: 1536, seed: 1, generationRequest: { pose, imagePlan } });
  assert.equal(graph["9"].inputs.width, 2048);
  assert.equal(graph["9"].inputs.height, 1536);
  assert.deepEqual(graph["18"].inputs.images, ["17", 0]);
  assert.equal(Object.values(graph).filter(n => n.class_type === "ImageScale").length, 2);
  assert.doesNotThrow(() => multiAngleMetadata({ width: 2048, height: 1536, actualOutputWidth: 2048, actualOutputHeight: 1536, generationRequest: { pose, imagePlan } }));
});

test("小图不放大，横竖方图在2K内按8像素对齐，超限输入前置拒绝", () => {
  assert.equal(planMultiAngleImage(864, 1184).outputHeight, 1184);
  assert.equal(planMultiAngleImage(2048, 2048).inferenceWidth, 2048);
  for (const [w, h] of [[7680, 4320], [3456, 4736], [4001, 3001], [16384, 512]]) {
    const plan = planMultiAngleImage(w, h);
    assert.ok(Math.max(plan.inferenceWidth, plan.inferenceHeight) <= 2048);
    assert.equal(plan.inferenceWidth % 8, 0);
    assert.equal(plan.inferenceHeight % 8, 0);
    assert.ok(Math.abs(plan.inferenceWidth - w * Math.min(1, 2048 / Math.max(w, h))) < 8);
    assert.ok(Math.abs(plan.inferenceHeight - h * Math.min(1, 2048 / Math.max(w, h))) < 8);
  }
  for (const dims of [[8001, 8000], [16385, 128], [31, 32], [16000, 32]]) assert.throws(() => planMultiAngleImage(...dims));
});

test("实际上传字节先处理EXIF再压到2K，原件不变", async () => {
  const bytes = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: "#805030" } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const prepared = await prepareMultiAngleImage({ dataUrl: `data:image/jpeg;base64,${bytes.toString("base64")}`, size: bytes.length });
  assert.deepEqual(prepared.sourceBytes, bytes);
  assert.equal(prepared.plan.sourceWidth, 3000);
  assert.equal(prepared.plan.sourceHeight, 4000);
  const actual = await sharp(prepared.inferenceBytes).metadata();
  assert.equal(actual.width, 1536);
  assert.equal(actual.height, 2048);
  assert.equal(actual.orientation, undefined);
});
test("能力准入阻止模型缺失和连线错误，兼容新COMBO", () => {
  const graph = { a: { class_type: "Loader", inputs: { model: "camera" } }, b: { class_type: "Consumer", inputs: { model: ["a", 0] } } };
  const schema = { Loader: { input: { required: { model: ["COMBO", { options: ["camera"] }] } }, output: ["MODEL"] }, Consumer: { input: { required: { model: ["MODEL"] } }, output: [] } };
  assert.doesNotThrow(() => verifyMultiAngleCapabilities(graph, schema));
  assert.throws(() => verifyMultiAngleCapabilities(graph, {}), /缺少节点/);
  const missing = structuredClone(schema);missing.Loader.input.required.model[1].options = ["other"];
  assert.throws(() => verifyMultiAngleCapabilities(graph, missing), /模型或枚举不可用/);
  const wrong = structuredClone(schema);wrong.Loader.output = ["IMAGE"];
  assert.throws(() => verifyMultiAngleCapabilities(graph, wrong), /连线类型不匹配/);
});
test("错误尺寸不成功，真实任务身份和机位保留", () => {
  const args = { width: 864, height: 1184, actualOutputWidth: 864, actualOutputHeight: 1184, promptId: "real-id", outputSha256: "sha", generationRequest: { pose } };
  const metadata = multiAngleMetadata(args);
  assert.equal(metadata.promptId, "real-id");
  assert.equal(metadata.outputSha256, "sha");
  assert.deepEqual(metadata.pose, pose);
  assert.equal(metadata.exactCameraGeometry, false);
  assert.throws(() => multiAngleMetadata({ ...args, actualOutputWidth: 1024 }), /尺寸/);
});

test("三档景别仅改变文本指令，不伪造百分比或裁剪原图", () => {
  const graphs = [0, 50, 100].map(distance => createMultiAngleWorkflow({ artifactKey: "same", imageBase64: "same", width: 864, height: 1184, seed: 805369075, generationRequest: { pose: { ...pose, distance } } }));
  assert.match(graphs[0]["12"].inputs.prompt, /特写镜头/);
  assert.doesNotMatch(graphs[1]["12"].inputs.prompt, /特写|广角/);
  assert.match(graphs[2]["12"].inputs.prompt, /远景.*主体在画面中明显变小.*周围环境/);
  for (const graph of graphs) {
    assert.doesNotMatch(graph["12"].inputs.prompt, /%|广角镜头/);
    delete graph["12"].inputs.prompt;
  }
  assert.deepEqual(graphs[0], graphs[1]);assert.deepEqual(graphs[1], graphs[2]);
  assert.throws(() => normalizeCameraPose({ ...pose, distance: 25 }), /请选择特写/);
});

/**
 * [INPUT]: 依赖node:test、sharp真实像素、遮罩服务/OneAPI适配器、模型配置与归档投影
 * [OUTPUT]: GPT参考模式换物品/换材质的三定位空指令前端到执行归档合同、用途默认/非法/冻结、其它模式指令必填与坏参考零调用、用户原文/双图保留、异步/同步分流/蓝选和原生字节归档、权限/Schema零收费测试
 * [POS]: test 的Sunburst局部重绘合同测试，全部上游/同步替身，不调用CLI、网络或付费模型
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { createHash, randomBytes } from "node:crypto";
import { createGenerationJobApiHandler } from "../src/generation-job-api.mjs";
import { createGenerationService } from "../src/generation-service.mjs";
import { executeImageMaskFill, validateMaskFillInput, readImageMaskFillConfig } from "../src/image-mask-fill-service.mjs";
import { executeSunburstMaskFill, prepareSunburstMaskInput, sunburstMaskOutputSize, sunburstMaskPrompt, MASK_FILL_ONEAPI_MODEL } from "../src/image-mask-fill-oneapi.mjs";
import { buildMaskFillJobRequest } from "../public/image-mask-fill-geometry.js";

const descriptor = bytes => ({ dataUrl: `data:image/png;base64,${bytes.toString("base64")}`, name: "synthetic.png", type: "image/png", size: bytes.length });
const picture = (width, height, background) => sharp({ create: { width, height, channels: 3, background } }).png().toBuffer();
const catalog = async () => [{ id: MASK_FILL_ONEAPI_MODEL.id }];
async function fixture(width = 96, height = 64, extra = {}) {
  const source = await picture(width, height, "#204060");
  const mask = await sharp({ create: { width, height, channels: 3, background: "#000" } })
    .composite([{ input: await picture(Math.floor(width / 3), Math.floor(height / 3), "#fff"), left: Math.floor(width / 3), top: Math.floor(height / 3) }]).png().toBuffer();
  return { maskFillModel: "gptImage25Sunburst", maskFillMode: "prompt", maskExpand: 0,
    prompt: "Replace the masked object with a red chair.", referenceImages: [descriptor(source)], maskImage: descriptor(mask), ...extra };
}
function clientFixture({ mismatch = false, error = null, format = "png" } = {}) {
  const requests = [], results = [], syncRequests = [], asyncRequests = [];
  const edit = async (request, asynchronous, onSubmitted = () => {}) => {
    requests.push(request);
    (asynchronous ? asyncRequests : syncRequests).push(request);
    if (error) throw error;
    if (asynchronous) await onSubmitted({ id: "resp_mask_synthetic", status: "queued" });
    const [width, height] = request.size.split("x").map(Number);
    const png = await picture(mismatch ? width - 16 : width, height, "#ee3322");
    const bytes = format === "png" ? png : await sharp(png).toFormat(format).toBuffer();
    results.push(bytes);
    return { images: [{ url: descriptor(bytes).dataUrl }], outputFormat: "png",
      transport: asynchronous ? "responses-background" : "images-edits-fixture", requestId: asynchronous ? "resp_mask_synthetic" : "req-mask-synthetic",
      usageCost: { amount: 0.0123, currency: "USD", source: "fixture" } };
  };
  return { requests, results, syncRequests, asyncRequests,
    editImage: request => edit(request, false), editImageAsync: (request, { onSubmitted } = {}) => edit(request, true, onSubmitted) };
}

test("仅GPT参考模式三定位可省略/空白指令，前端请求到实际执行归档不伪造用户原文", async () => {
  const source = await picture(96, 64, "#204060"), reference = await picture(48, 80, "#6789ab");
  const mask = (await fixture()).maskImage;
  for (const fillReferencePurpose of [undefined, "object", "material"]) for (const location of ["none", "mask", "selection"]) for (const instruction of [undefined, "", " \n\t ", "  修改目标颜色  "]) {
    const request = buildMaskFillJobRequest({ image: { ...descriptor(source), width: 96, height: 64 },
      fillReferenceImage: { ...descriptor(reference), width: 48, height: 80 }, mode: "reference", maskFillModel: "gptImage25Sunburst",
      ...(instruction !== undefined ? { prompt: instruction } : {}), ...(fillReferencePurpose !== undefined ? { fillReferencePurpose } : {}),
      ...(location === "mask" ? { maskImage: mask } : {}),
      ...(location === "selection" ? { editRegion: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 } } : {}) });
    const input = { ...request.sharedInput, ...request.items[0].input };
    const expected = instruction?.trim() || "";
    assert.equal(request.items[0].input.prompt, expected);
    assert.equal(request.items[0].input.fillReferencePurpose, fillReferencePurpose || "object");
    const validated = await validateMaskFillInput(input);
    assert.equal(validated.prompt, expected);
    assert.equal(validated.fillReferencePurpose, fillReferencePurpose || "object");
    const prepared = await prepareSunburstMaskInput(validated);
    assert.equal(prepared.request.images.length, 2);
    assert.match(prepared.request.prompt, fillReferencePurpose === "material" ? /Apply the material from image 2 to/i : /Replace .* with the corresponding object from image 2/i);
    assert.doesNotMatch(prepared.request.prompt, /undefined|null|\{用户|推荐写法/);
    if (expected) assert.ok(prepared.request.prompt.includes(`User instruction: ${expected}`));
    else assert.doesNotMatch(prepared.request.prompt, /User instruction:/, "无原文时不能插空行或默认用户指令");
    const client = clientFixture(); let archive;
    const result = await executeImageMaskFill(input, { imageClient: client, getOneApiModels: catalog, verifySyncContract: async () => {},
      scheduleSync(value) { archive = value; return { status: "pending" }; } });
    assert.equal(client.requests.length, 1);
    assert.equal(client.asyncRequests.length, location === "mask" ? 0 : 1);
    assert.equal(archive.sourcePrompt, expected); assert.equal(result.upstream.metadata.sourcePrompt, expected);
    for (const record of [result.request, result.upstream.metadata, result.workflow, archive.preview, archive.workflow]) {
      assert.equal(record.fillReferencePurpose, fillReferencePurpose || "object");
    }
    assert.equal(Object.hasOwn(client.requests[0], "fillReferencePurpose"), false, "用途通过固定Prompt表达，不新增上游API字段");
    assert.equal(archive.finalPrompt, client.requests[0].prompt); assert.ok(archive.finalPrompt.trim());
    assert.deepEqual(Buffer.from(result.images[0].url.split(",")[1], "base64"), client.results[0]);
    assert.equal(archive.referenceImages[0].imageUrl, descriptor(source).dataUrl);
    if (location === "selection") assert.equal(archive.boxedSourceImage.imageUrl, client.requests[0].images[0].image_url);
  }
});

test("可省略指令不能绕过GPT模式/参考图/类型和长度准入，非法输入零收费", async () => {
  const reference = descriptor(await picture(48, 80, "#6789ab"));
  const base = await fixture(96, 64, { maskFillMode: "reference", fillReferenceImage: reference }); delete base.prompt;
  assert.equal((await validateMaskFillInput(base)).prompt, "", "服务端也接受真正省略prompt字段");
  const client = clientFixture();
  const reject = input => assert.rejects(executeImageMaskFill(input, { imageClient: client, getOneApiModels: catalog }), { statusCode: 400 });
  for (const prompt of [null, false, 123, {}, [], "a".repeat(8001)]) await reject({ ...base, prompt });
  await reject({ ...base, fillReferenceImage: undefined });
  await reject({ ...base, fillReferenceImage: { ...reference, dataUrl: "data:image/png;base64,broken" } });
  await reject({ ...base, referenceImages: [] });
  for (const maskFillModel of ["flux2Klein", "qwenImageEdit2511"]) for (const prompt of [undefined, "", " \n "]) {
    await reject({ ...base, maskFillModel, prompt });
  }
  for (const prompt of [undefined, "", " \n "]) await reject({ ...base, maskFillMode: "prompt", fillReferenceImage: undefined, prompt });
  assert.equal(client.requests.length, 0);
});

test("GPT三档预设沿用模型真源；自定义比例满足16px/3:1/像素限制，默认1K", () => {
  assert.deepEqual(sunburstMaskOutputSize({ width: 512, height: 512 }), { width: 1024, height: 1024 });
  assert.deepEqual(sunburstMaskOutputSize({ width: 1920, height: 1080 }, "1K"), { width: 1536, height: 864 });
  assert.deepEqual(sunburstMaskOutputSize({ width: 512, height: 512 }, "4K"), { width: 2880, height: 2880 });
  for (const [ratio, mapping] of Object.entries(MASK_FILL_ONEAPI_MODEL.sizes)) {
    const [width, height] = ratio.split(":").map(Number);
    for (const resolution of ["1K", "2K", "4K"]) {
      const target = sunburstMaskOutputSize({ width, height }, resolution);
      assert.equal(`${target.width}x${target.height}`, mapping[resolution]);
    }
  }
  for (const resolution of ["1K", "2K", "4K"]) for (const source of [{ width: 4096, height: 4096 }, { width: 4031, height: 2999 }, { width: 512, height: 1536 }, { width: 3072, height: 1024 }]) {
    const target = sunburstMaskOutputSize(source, resolution);
    assert.equal(target.width % 16, 0); assert.equal(target.height % 16, 0);
    assert.ok(Math.max(target.width, target.height) <= 3840);
    assert.ok(Math.max(target.width, target.height) / Math.min(target.width, target.height) <= 3);
    assert.ok(target.width * target.height >= 655360 && target.width * target.height <= 8294400);
  }
  assert.throws(() => sunburstMaskOutputSize({ width: 4096, height: 1000 }), /1:3至3:1/);
});

test("4096输入原尺寸提交，遮罩同PNG同宽高，白色编辑转换alpha0；参考图排第二", async () => {
  const input = await fixture(4096, 2048, { maskFillMode: "reference", fillReferenceImage: descriptor(await picture(73, 119, "#6789ab")) });
  const prepared = await prepareSunburstMaskInput(await validateMaskFillInput(input));
  assert.equal(prepared.request.images.length, 2);
  const source = await sharp(prepared.sourceBytes).metadata(), mask = await sharp(prepared.maskBytes).metadata();
  assert.deepEqual([source.width, source.height, source.format], [4096, 2048, "png"]);
  assert.deepEqual([mask.width, mask.height, mask.format, mask.hasAlpha], [4096, 2048, "png", true]);
  const alpha = await sharp(prepared.maskBytes).extractChannel("alpha").raw().toBuffer();
  assert.equal(alpha[0], 255); assert.equal(alpha[1024 * 4096 + 2048], 0);
  const target = sunburstMaskOutputSize({ width: 4096, height: 2048 }, "1K");
  assert.equal(prepared.request.size, `${target.width}x${target.height}`);
  assert.match(prepared.request.prompt, /Replace .* with the corresponding object from image 2/);
});

test("遮罩扩展使用原图像素；增加编辑范围且不改变源图或mask尺寸", async () => {
  const input = await fixture();
  const first = await prepareSunburstMaskInput(await validateMaskFillInput(input));
  const expanded = await prepareSunburstMaskInput(await validateMaskFillInput({ ...input, maskExpand: 4 }));
  const count = prepared => prepared.editMask.reduce((sum, value) => sum + (value > 0 ? 1 : 0), 0);
  assert.ok(count(expanded) > count(first));
  assert.equal(expanded.editMask.length, 96 * 64);
  assert.deepEqual(expanded.sourceBytes, first.sourceBytes);
});

test("GPT两模式可不传mask：请求完全省略mask且不伪造编辑区域，原生PNG逐字节归档", async () => {
  for (const mode of ["prompt", "reference"]) {
    const input = await fixture(96, 64, { maskFillMode: mode, maskExpand: 80, prompt: "Remove the pendant lamp.",
      ...(mode === "reference" ? { fillReferenceImage: descriptor(await picture(48, 80, "#6789ab")) } : {}) });
    delete input.maskImage;
    const validated = await validateMaskFillInput(input);
    assert.equal(validated.mask, null);
    assert.equal(validated.maskExpand, 0, "无mask不得归档一个未实际应用的扩展值");
    const prepared = await prepareSunburstMaskInput(validated);
    assert.equal(prepared.maskBytes, null); assert.equal(prepared.editMask, null);
    assert.equal(Object.hasOwn(prepared.request, "mask"), false, "省略接口字段，不能提交null或全白替代图");
    assert.equal(prepared.request.images.length, mode === "reference" ? 2 : 1);
    assert.doesNotMatch(prepared.request.prompt, /supplied mask|transparent area|masked region/i);
    assert.match(prepared.request.prompt, /Remove the pendant lamp\./);
    if (mode === "reference") assert.match(prepared.request.prompt, /Replace .* with the corresponding object from image 2/);

    const client = clientFixture(); let archive; const progress = [];
    const result = await executeImageMaskFill(input, { imageClient: client, getOneApiModels: catalog,
      onProgress(value) { progress.push(value); if (value.upstreamResponseId) assert.equal(client.results.length, 0, "上游ID在完成图片前即时报告"); },
      verifySyncContract: async () => {}, scheduleSync(value) { archive = value; return { status: "pending" }; } });
    assert.equal(client.requests.length, 1);
    assert.equal(client.asyncRequests.length, 1); assert.equal(client.syncRequests.length, 0);
    assert.ok(progress.some(value => value.upstreamResponseId === "resp_mask_synthetic" && value.upstreamStatus === "queued"));
    assert.equal(Object.hasOwn(client.requests[0], "mask"), false);
    assert.deepEqual(Buffer.from(result.images[0].url.split(",")[1], "base64"), client.results[0]);
    assert.equal(result.request.hasMask, false); assert.equal(result.request.maskExpand, 0);
    assert.equal(result.upstream.metadata.hasMask, false);
    assert.equal(result.upstream.metadata.version, "2026-10-29.sunburst.16");
    assert.equal(result.upstream.metadata.upstreamAsync, true);
    assert.equal(result.upstream.transport, "responses-background");
    assert.equal(result.upstream.requestId, "resp_mask_synthetic");
    for (const key of ["submittedMaskSha256", "drawnMaskSha256", "maskSha256", "maskConvention"]) {
      assert.equal(result.upstream.metadata[key], null, `${key}必须明确记录未提交mask`);
    }
    assert.equal(result.upstream.metadata.protectedAreaComposited, false);
    assert.equal(archive.maskImage, null); assert.equal(archive.workflow.hasMask, false);
    assert.equal(archive.boxedSourceImage, null);
    assert.equal(Object.hasOwn(result, "archiveBoxedSourceImage"), false);
    assert.equal(archive.workflow.maskSha256, null); assert.equal(archive.workflow.submittedMaskSha256, null);
    assert.equal(archive.finalPrompt, client.requests[0].prompt);
    assert.equal(archive.workflow.promptSource, "submitted Responses background prompt");
    assert.equal(archive.fillReferenceImage !== null, mode === "reference");
    const directClient = clientFixture();
    const direct = await executeSunburstMaskFill(validated, { imageClient: directClient });
    assert.equal(direct.archiveMaskImage, null, "执行器不能为归档合成不存在的遮罩");
    assert.equal(direct.archiveBoxedSourceImage, null, "纯指令编辑不伪造框选原图");
  }
});

test("GPT两模式框选定位待修改物体而不硬限框内像素，不发送mask且原图归档不改写、完整结果原生交付", async () => {
  const editRegion = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
  const pixels = { left: 24, top: 16, width: 48, height: 32 };
  for (const mode of ["prompt", "reference"]) {
    const input = await fixture(96, 64, { maskFillMode: mode, editRegion: { ...editRegion }, maskExpand: 80,
      prompt: "换椅子",
      ...(mode === "reference" ? { fillReferenceImage: descriptor(await picture(48, 80, "#6789ab")) } : {}) });
    delete input.maskImage;
    const originalInput = structuredClone(input);
    const validated = await validateMaskFillInput(input);
    assert.deepEqual(validated.editRegion, editRegion);
    assert.equal(validated.mask, null); assert.equal(validated.maskExpand, 0);
    const prepared = await prepareSunburstMaskInput(validated);
    assert.equal(Object.hasOwn(prepared.request, "mask"), false);
    assert.equal(prepared.maskBytes, null); assert.equal(prepared.editMask, null);
    assert.equal(prepared.request.images.length, mode === "reference" ? 2 : 1);
    const submittedBytes = Buffer.from(prepared.request.images[0].image_url.split(",")[1], "base64");
    const { data: submitted, info } = await sharp(submittedBytes).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const sourceBytes = Buffer.from(input.referenceImages[0].dataUrl.split(",")[1], "base64");
    const original = await sharp(sourceBytes).removeAlpha().raw().toBuffer();
    assert.deepEqual([info.width, info.height], [96, 64]);
    let annotated = 0, bluePixels = 0;
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
      const offset = (y * info.width + x) * 3;
      if (submitted.subarray(offset, offset + 3).equals(original.subarray(offset, offset + 3))) continue;
      annotated++;
      if (submitted[offset] === 59 && submitted[offset + 1] === 130 && submitted[offset + 2] === 246) bluePixels++;
      assert.ok(x >= pixels.left && x < pixels.left + pixels.width && y >= pixels.top && y < pixels.top + pixels.height,
        "定位线只能覆盖框边界内侧，不能修改框外原图");
    }
    assert.ok(annotated > 0, "实际提交首图必须含可见定位框");
    assert.ok(bluePixels > 0, "实际送模定位线必须含#3b82f6蓝色像素");
    const centre = (32 * 96 + 48) * 3;
    assert.deepEqual(submitted.subarray(centre, centre + 3), original.subarray(centre, centre + 3), "空心框不填满选区");
    assert.match(prepared.request.prompt, /blue outline/i);
    assert.match(prepared.request.prompt, /selected target/i);
    assert.match(prepared.request.prompt, /The temporary blue outline identifies the edit target/i);
    assert.match(prepared.request.prompt, /Edit this selected target and preserve unrelated content/i);
    assert.match(prepared.request.prompt, /not part of the scene or a hard boundary for editing/i);
    assert.doesNotMatch(prepared.request.prompt, /\bred\b|rectangle|rectangular|only inside|scene outside it|restyle/i,
      "蓝色圈选只定位目标物体，不能锁定形状、硬限制边界或只允许换风格");
    assert.match(prepared.request.prompt, /remove[^\n]*(?:outline|selection|guide)/i);
    assert.match(prepared.request.prompt, /User instruction: 换椅子/);
    assert.doesNotMatch(prepared.request.prompt, /supplied mask|transparent area|masked region/i);
    if (mode === "reference") {
      assert.match(prepared.request.prompt, /Replace .* with the corresponding object from image 2/i);
      assert.match(prepared.request.prompt, /Replace the selected target in image 1 with the corresponding object from image 2/i);
      const actualReference = Buffer.from(prepared.request.images[1].image_url.split(",")[1], "base64");
      assert.deepEqual(await sharp(actualReference).raw().toBuffer(), await sharp(Buffer.from(input.fillReferenceImage.dataUrl.split(",")[1], "base64")).raw().toBuffer());
    }

    const client = clientFixture(); let archive;
    const result = await executeImageMaskFill(input, { imageClient: client, getOneApiModels: catalog,
      verifySyncContract: async () => {}, scheduleSync(value) { archive = value; return { status: "pending" }; } });
    assert.equal(client.requests.length, 1);
    assert.equal(client.asyncRequests.length, 1); assert.equal(client.syncRequests.length, 0);
    assert.equal(Object.hasOwn(client.requests[0], "mask"), false);
    assert.equal(result.request.hasMask, false); assert.equal(result.request.maskExpand, 0);
    assert.deepEqual(result.request.editRegion, editRegion);
    const metadata = result.upstream.metadata;
    assert.deepEqual(metadata.editRegion, editRegion); assert.deepEqual(metadata.editRegionPixels, pixels);
    assert.equal(metadata.regionAnnotation.color, "#3b82f6");
    assert.equal(metadata.regionAnnotation.placement, "inside-selection");
    assert.equal(metadata.hasMask, false); assert.equal(metadata.maskSha256, null);
    assert.equal(metadata.sourceSha256, createHash("sha256").update(sourceBytes).digest("hex"));
    assert.equal(metadata.submittedSourceSha256, createHash("sha256").update(submittedBytes).digest("hex"));
    assert.notEqual(metadata.sourceSha256, metadata.submittedSourceSha256);
    assert.equal(metadata.protectedAreaComposited, false);
    assert.deepEqual(Buffer.from(result.images[0].url.split(",")[1], "base64"), client.results[0]);
    assert.equal(archive.referenceImages[0].imageUrl, originalInput.referenceImages[0].dataUrl);
    assert.equal(archive.maskImage, null);
    assert.equal(archive.boxedSourceImage.mimeType, "image/png");
    assert.equal(archive.boxedSourceImage.size, submittedBytes.length);
    assert.deepEqual(Buffer.from(archive.boxedSourceImage.imageUrl.split(",")[1], "base64"), submittedBytes,
      "框选原图附件必须与真实送模首图逐字节一致");
    assert.notEqual(archive.boxedSourceImage.imageUrl, archive.referenceImages[0].imageUrl);
    assert.equal(Object.hasOwn(result, "archiveBoxedSourceImage"), false, "内部框图归档载荷不得重复发送给浏览器");
    assert.deepEqual(archive.workflow.editRegion, editRegion); assert.deepEqual(archive.workflow.editRegionPixels, pixels);
    assert.equal(archive.workflow.submittedSourceSha256, metadata.submittedSourceSha256);
    assert.equal(archive.finalPrompt, client.requests[0].prompt);
    assert.equal(archive.workflow.promptSource, "submitted Responses background prompt");
    assert.deepEqual(input, originalInput, "绘制上游定位框不得改写上传与用户区域参数");
    const directClient = clientFixture();
    const direct = await executeSunburstMaskFill(validated, { imageClient: directClient });
    assert.deepEqual(Buffer.from(direct.archiveBoxedSourceImage.imageUrl.split(",")[1], "base64"),
      Buffer.from(directClient.requests[0].images[0].image_url.split(",")[1], "base64"));
  }
});

test("换物品/换材质在三定位各自表达固定参考用途，空指令仍可执行；仅验证离线Prompt合同", () => {
  const locations = [{ editRegion: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 } }, { mask: {} }, {}];
  for (const fillReferencePurpose of ["object", "material"]) for (const location of locations) {
    const prompt = sunburstMaskPrompt({ mode: "reference", prompt: "", fillReferencePurpose, ...location });
    const target = location.editRegion ? "the selected target in image 1" : location.mask ? "the target in the masked region of image 1"
      : fillReferencePurpose === "material" ? "the relevant surface in image 1" : "the relevant object in image 1";
    if (fillReferencePurpose === "material") {
      assert.ok(prompt.includes(`Apply the material from image 2 to ${target}.`));
      assert.match(prompt, /Preserve the target's original form, structure and position/);
      assert.match(prompt, /Match the surface's scale, perspective, lighting and shadows/);
      assert.doesNotMatch(prompt, /Replace .* with the corresponding object/);
    } else {
      assert.ok(prompt.includes(`Replace ${target} with the corresponding object from image 2.`));
      assert.doesNotMatch(prompt, /Apply the material|Preserve the target's original form/);
    }
    assert.match(prompt, /If additional instructions are provided, follow them/);
    assert.match(prompt, /Do not copy unrelated content or background from image 2/);
    assert.doesNotMatch(prompt, /User instruction:|undefined|\bred\b|rectangle/);
    if (location.editRegion) assert.match(prompt, /Remove all blue guide marks/);
  }
});

test("墙面材质/沙发布料/纹理颜色原文在三定位完整保留，换材质固定规则且双图顺序不变；不代表真实画质", async () => {
  const referenceBytes = await picture(48, 80, "#6789ab");
  const instructions = ["将图1墙面换成图2的大理石材质，保留墙体位置和开口。", "把图1沙发的布料换成图2的织物，仅改布料，不换沙发。",
    "把图1目标表面的木纹、米白颜色和格纹图案按图2修改，尺寸和形状不变。"];
  for (const instruction of instructions) for (const location of ["none", "mask", "polygon"]) {
    const input = await fixture(96, 64, { maskFillMode: "reference", fillReferencePurpose: "material", prompt: instruction, fillReferenceImage: descriptor(referenceBytes),
      ...(location === "polygon" ? { editRegion: { type: "polygon", points: [{ x: 0.25, y: 0.25 }, { x: 0.75, y: 0.25 }, { x: 0.5, y: 0.75 }] } } : {}) });
    if (location !== "mask") delete input.maskImage;
    const prepared = await prepareSunburstMaskInput(await validateMaskFillInput(input));
    const prompt = prepared.request.prompt;
    assert.ok(prompt.includes(`User instruction: ${instruction}`), "保持用户原文，不把材质意图改成换物品");
    assert.match(prompt, /Apply the material from image 2 to/i);
    assert.match(prompt, /If additional instructions are provided, follow them/i);
    assert.match(prompt, /Do not copy unrelated content or background from image 2/i);
    assert.doesNotMatch(prompt.split("User instruction:")[0], /Replace .* with the corresponding object/);
    assert.equal(prepared.request.images.length, 2);
    assert.deepEqual(Buffer.from(prepared.request.images[0].image_url.split(",")[1], "base64"), prepared.sourceBytes);
    assert.deepEqual(await sharp(Buffer.from(prepared.request.images[1].image_url.split(",")[1], "base64")).raw().toBuffer(), await sharp(referenceBytes).raw().toBuffer());
    assert.equal(Object.hasOwn(prepared.request, "mask"), location === "mask");
  }
});

test("非法框选、遮罩与框选冲突及Flux/Qwen框选均在付费调用前拒绝", async () => {
  const base = await fixture(); delete base.maskImage;
  const valid = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
  const client = clientFixture();
  const rejects = [[], {}, { ...valid, x: -0.01 }, { ...valid, y: -0.01 }, { ...valid, width: 0 }, { ...valid, height: 0 },
    { ...valid, x: 0.75 }, { ...valid, y: 0.75 }, { ...valid, x: "0.25" }, { ...valid, width: NaN }, { ...valid, height: Infinity }];
  for (const editRegion of rejects) {
    await assert.rejects(executeImageMaskFill({ ...base, editRegion }, { imageClient: client, getOneApiModels: catalog }), { statusCode: 400 });
  }
  await assert.rejects(executeImageMaskFill({ ...base, editRegion: { ...valid, width: 0.01 } }, { imageClient: client, getOneApiModels: catalog }),
    error => error.statusCode === 400 && /太小/.test(error.message));
  const masked = await fixture();
  await assert.rejects(executeImageMaskFill({ ...masked, editRegion: valid }, { imageClient: client, getOneApiModels: catalog }), { statusCode: 400 });
  for (const maskFillModel of ["flux2Klein", "qwenImageEdit2511"]) {
    await assert.rejects(executeImageMaskFill({ ...masked, maskFillModel, editRegion: valid }, { imageClient: client, getOneApiModels: catalog }), { statusCode: 400 });
  }
  assert.equal(client.requests.length, 0);
  const full = await validateMaskFillInput({ ...base, editRegion: { x: 0, y: 0, width: 1, height: 1 } });
  assert.deepEqual(full.editRegion, { x: 0, y: 0, width: 1, height: 1 });
  const pure = await validateMaskFillInput({ ...base, editRegion: null });
  assert.equal(pure.editRegion, null, "显式空框选继续表示纯指令编辑");
});

test("自由圈选三角和凹轮廓真实描线不画外接矩形，双模式送模图独立归档并原生交付", async () => {
  const shapes = [
    { points: [{ x: 0.25, y: 0.25 }, { x: 0.75, y: 0.25 }, { x: 0.5, y: 0.75 }], guide: { x: 36, y: 32 }, unmarked: { x: 24, y: 32 } },
    { points: [{ x: 0.25, y: 0.25 }, { x: 0.75, y: 0.25 }, { x: 0.75, y: 0.4 }, { x: 0.4, y: 0.4 }, { x: 0.4, y: 0.75 }, { x: 0.25, y: 0.75 }],
      guide: { x: 38, y: 40 }, unmarked: { x: 72, y: 40 } },
  ];
  for (const shape of shapes) for (const mode of ["prompt", "reference"]) {
    const editRegion = { type: "polygon", points: structuredClone(shape.points) };
    const input = await fixture(96, 64, { editRegion, maskFillMode: mode, prompt: "Remove the selected lamp.",
      ...(mode === "reference" ? { fillReferenceImage: descriptor(await picture(48, 80, "#6789ab")) } : {}) });
    delete input.maskImage;
    const originalInput = structuredClone(input);
    const validated = await validateMaskFillInput(input);
    const prepared = await prepareSunburstMaskInput(validated);
    const actual = await sharp(prepared.sourceBytes).removeAlpha().raw().toBuffer();
    const original = await sharp(Buffer.from(input.referenceImages[0].dataUrl.split(",")[1], "base64")).removeAlpha().raw().toBuffer();
    const pixel = (bytes, point) => [...bytes.subarray((point.y * 96 + point.x) * 3, (point.y * 96 + point.x) * 3 + 3)];
    assert.notDeepEqual(pixel(actual, shape.guide), pixel(original, shape.guide), "实际多边形斜边/凹边必须画蓝线");
    assert.deepEqual(pixel(actual, shape.unmarked), pixel(original, shape.unmarked), "外接矩形上未经过实际轮廓的点不能画线");
    assert.equal(Object.hasOwn(prepared.request, "mask"), false);
    assert.equal(prepared.request.images.length, mode === "reference" ? 2 : 1);
    assert.deepEqual(prepared.editRegionPixels, { type: "polygon", points: shape.points.map(point => ({ x: Math.round(point.x * 96), y: Math.round(point.y * 64) })),
      bounds: { left: 24, top: 16, width: 49, height: 33 } });
    const client = clientFixture(); let archive;
    const result = await executeImageMaskFill(input, { imageClient: client, getOneApiModels: catalog,
      verifySyncContract: async () => {}, scheduleSync(value) { archive = value; return { status: "pending" }; } });
    assert.equal(client.requests.length, 1);
    assert.equal(client.asyncRequests.length, 1); assert.equal(client.syncRequests.length, 0);
    assert.equal(Object.hasOwn(client.requests[0], "mask"), false);
    assert.deepEqual(Buffer.from(client.requests[0].images[0].image_url.split(",")[1], "base64"), prepared.sourceBytes);
    assert.deepEqual(result.request.editRegion, editRegion);
    assert.deepEqual(result.upstream.metadata.editRegionPixels, prepared.editRegionPixels);
    assert.equal(result.upstream.metadata.regionAnnotation.shape, "polygon");
    assert.equal(result.upstream.metadata.regionAnnotation.placement, "centered-on-contour");
    assert.equal(result.upstream.metadata.regionAnnotation.color, "#3b82f6");
    assert.deepEqual(Buffer.from(archive.boxedSourceImage.imageUrl.split(",")[1], "base64"), prepared.sourceBytes);
    assert.equal(archive.referenceImages[0].imageUrl, originalInput.referenceImages[0].dataUrl);
    assert.equal(archive.maskImage, null);
    assert.equal(archive.workflow.submittedSourceSha256, createHash("sha256").update(prepared.sourceBytes).digest("hex"));
    assert.deepEqual(Buffer.from(result.images[0].url.split(",")[1], "base64"), client.results[0]);
    assert.equal(result.upstream.metadata.protectedAreaComposited, false);
    assert.deepEqual(input, originalInput);
  }
});

test("多边形归一化深拷贝、闭合点去重与2048上限，坏点/越界/退化/模型和mask冲突零调用", async () => {
  const base = await fixture(); delete base.maskImage;
  const points = [{ x: 0.25, y: 0.25 }, { x: 0.75, y: 0.25 }, { x: 0.5, y: 0.75 }];
  const input = { ...base, editRegion: { type: "polygon", points: [...points, points[0]] } };
  const validated = await validateMaskFillInput(input);
  assert.deepEqual(validated.editRegion, { type: "polygon", points });
  input.editRegion.points[0].x = 0.1;
  assert.equal(validated.editRegion.points[0].x, 0.25, "校验后不能共享上传点对象");
  const polygon = { type: "polygon", points: [{ x: 0.25, y: 0.25 }, { x: 0.75, y: 0.25 }, { x: 0.5, y: 0.75 }] };
  const bad = [[], polygon.points.slice(0, 2), [{ x: 0, y: 0 }, { x: 0.5, y: 0.5 }, { x: 1, y: 1 }],
    [polygon.points[0], polygon.points[0], polygon.points[0]], [null, ...polygon.points],
    [{ x: -0.01, y: 0 }, ...polygon.points], [{ x: 0, y: 1.01 }, ...polygon.points],
    [{ x: Infinity, y: 0 }, ...polygon.points], [{ x: "0.2", y: 0 }, ...polygon.points],
    Array.from({ length: 2049 }, (_, i) => polygon.points[i % 3])];
  const client = clientFixture();
  for (const points of bad) await assert.rejects(executeImageMaskFill({ ...base, editRegion: { type: "polygon", points } },
    { imageClient: client, getOneApiModels: catalog }), { statusCode: 400 });
  // -------- 原始轮廓非零面积，取整后变为(10,6)/(48,32)/(86,58)，大包围盒仍共线 --------
  const thin = { type: "polygon", points: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 }, { x: 0.9, y: 0.901 }] };
  assert.deepEqual((await validateMaskFillInput({ ...base, editRegion: thin })).editRegion, thin);
  await assert.rejects(executeImageMaskFill({ ...base, editRegion: thin }, { imageClient: client, getOneApiModels: catalog }),
    error => error.statusCode === 400 && /圈选区域太小|轮廓无效/.test(error.message));
  const masked = await fixture();
  await assert.rejects(executeImageMaskFill({ ...masked, editRegion: polygon }, { imageClient: client, getOneApiModels: catalog }), { statusCode: 400 });
  for (const maskFillModel of ["flux2Klein", "qwenImageEdit2511"]) await assert.rejects(executeImageMaskFill({ ...base, maskFillModel, editRegion: polygon },
    { imageClient: client, getOneApiModels: catalog }), { statusCode: 400 });
  assert.equal(client.requests.length, 0);
  const maxPoints = Array.from({ length: 2048 }, (_, i) => ({ x: 0.5 + Math.cos(i / 2048 * Math.PI * 2) * 0.25,
    y: 0.5 + Math.sin(i / 2048 * Math.PI * 2) * 0.25 }));
  assert.equal((await validateMaskFillInput({ ...base, editRegion: { type: "polygon", points: maxPoints } })).editRegion.points.length, 2048);
});

test("Flux/Qwen仍须真实mask；GPT传入的mask继续校验，缺主图/参考图不能绕过", async () => {
  const input = await fixture(); delete input.maskImage;
  for (const maskFillModel of ["flux2Klein", "qwenImageEdit2511"]) {
    await assert.rejects(validateMaskFillInput({ ...input, maskFillModel }), error => error.statusCode === 400 && /遮罩/.test(error.message));
  }
  const emptyMask = descriptor(await picture(96, 64, "#000"));
  await assert.rejects(validateMaskFillInput({ ...input, maskImage: emptyMask }), error => error.statusCode === 400 && /白色编辑区域/.test(error.message));
  await assert.rejects(validateMaskFillInput({ ...input, maskImage: descriptor(await picture(64, 96, "#fff")) }),
    error => error.statusCode === 400 && /遮罩尺寸/.test(error.message));
  await assert.rejects(validateMaskFillInput({ ...input, referenceImages: [] }), { statusCode: 400 });
  await assert.rejects(validateMaskFillInput({ ...input, maskFillMode: "reference" }), { statusCode: 400 });
});

test("单次edits原生PNG逐字节交付并保留mask外模型改动，归档使用真实模型/alpha遮罩/费用", async () => {
  for (const mode of ["prompt", "reference"]) {
    const input = await fixture(96, 64, { maskFillMode: mode,
      ...(mode === "reference" ? { fillReferenceImage: descriptor(await picture(48, 80, "#6789ab")) } : {}) });
    const client = clientFixture(); let archive; let schemaCalls = 0;
    const result = await executeImageMaskFill(input, { imageClient: client, getOneApiModels: catalog,
      verifySyncContract: async () => { schemaCalls++; }, scheduleSync(value) { archive = value; return { status: "pending" }; } });
    assert.equal(client.requests.length, 1); assert.equal(schemaCalls, 1);
    assert.equal(client.syncRequests.length, 1); assert.equal(client.asyncRequests.length, 0);
    assert.equal(result.upstream.metadata.upstreamAsync, false);
    assert.equal(client.requests[0].quality, "medium"); assert.equal(client.requests[0].n, 1);
    const bytes = Buffer.from(result.images[0].url.split(",")[1], "base64");
    assert.deepEqual(bytes, client.results[0]);
    const { data, info } = await sharp(bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.deepEqual([info.width, info.height], [1536, 1024]);
    // -------- mask外模型像素必须保留；本地不得拿原图覆盖 --------
    assert.deepEqual([...data.subarray(0, 3)], [238, 51, 34]);
    const centre = (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * 3;
    assert.deepEqual([...data.subarray(centre, centre + 3)], [238, 51, 34]);
    assert.equal(result.upstream.metadata.nativeOutputWidth, 1536);
    assert.equal(result.upstream.metadata.outputWidth, 1536);
    assert.equal(result.upstream.metadata.outputResolution, "1K");
    const nativeSha256 = createHash("sha256").update(client.results[0]).digest("hex");
    assert.equal(result.upstream.metadata.nativeOutputSha256, nativeSha256);
    assert.equal(result.upstream.metadata.outputSha256, nativeSha256);
    assert.equal(result.upstream.metadata.protectedAreaComposited, false);
    assert.equal(result.upstream.metadata.protectedSourceResampled, false);
    assert.equal(result.upstream.metadata.outputResized, false);
    assert.equal(result.archiveMaskImage, undefined);
    assert.equal(result.archiveBoxedSourceImage, undefined);
    assert.equal(archive.boxedSourceImage, null, "涂抹编辑不归档不存在的框选原图");
    assert.equal(archive.modelLabel, MASK_FILL_ONEAPI_MODEL.label); assert.equal(archive.workflow.provider, "oneapi");
    assert.equal(archive.workflow.requestId, "req-mask-synthetic"); assert.equal(archive.workflow.usageCost.amount, 0.0123);
    assert.equal(archive.finalPrompt, client.requests[0].prompt);
    assert.equal(archive.workflow.promptSource, "submitted Images edits prompt");
    assert.equal(archive.maskImage.imageUrl, client.requests[0].mask.image_url);
    assert.equal(archive.fillReferenceImage !== null, mode === "reference");
  }
});

test("返回非PNG真实字节时拒绝交付和归档，即使上游声明PNG", async () => {
  const input = await fixture(); const client = clientFixture({ format: "jpeg" });
  await assert.rejects(executeImageMaskFill(input, { imageClient: client, getOneApiModels: catalog,
    verifySyncContract: async () => {}, scheduleSync() { assert.fail("非PNG不能归档"); } }),
  error => error.statusCode === 502 && /PNG/.test(error.message));
  assert.equal(client.requests.length, 1);
});

test("非法模型/档位/质量、权限失效及Schema漂移均零付费调用；上游失败不重试", async () => {
  const input = await fixture(); const client = clientFixture();
  for (const extra of [{ maskFillModel: "invented" }, { outputResolution: "8K" }, { outputResolution: "4K", inferenceTier: "2k" }, { inferenceTier: "original" }, { quality: "ultra" }]) {
    await assert.rejects(executeImageMaskFill({ ...input, ...extra }, { imageClient: client, getOneApiModels: catalog }), { statusCode: 400 });
  }
  await assert.rejects(executeImageMaskFill(input, { imageClient: client, getOneApiModels: async () => [] }), /权限/);
  await assert.rejects(executeImageMaskFill(input, { imageClient: client, getOneApiModels: catalog,
    scheduleSync() { assert.fail("禁止归档"); }, verifySyncContract: async () => { throw new Error("schema漂移"); } }), /schema漂移/);
  assert.equal(client.requests.length, 0);
  const failed = clientFixture({ error: new Error("gateway timeout") });
  await assert.rejects(executeImageMaskFill(input, { imageClient: failed, getOneApiModels: catalog }), /gateway timeout/);
  assert.equal(failed.requests.length, 1);
  const mismatch = clientFixture({ mismatch: true });
  await assert.rejects(executeImageMaskFill(input, { imageClient: mismatch, getOneApiModels: catalog,
    verifySyncContract: async () => {}, scheduleSync() { assert.fail("尺寸错误不能归档"); } }), /与请求.*不一致/);
});

test("Flux节点不可用不阻断已授权Sunburst，目录不暴露密钥或Prompt", async () => {
  const config = await readImageMaskFillConfig(null, { getOneApiModels: catalog });
  assert.equal(config.models[0].available, false); assert.equal(config.models[1].available, true);
  assert.equal(config.models[1].modes.every(mode => mode.available), true);
  assert.equal(config.available, true); assert.equal(config.models[1].quality, "medium");
  assert.equal(config.models[1].defaultOutputResolution, "1K");
  assert.deepEqual(config.models[1].outputResolutions, ["1K", "2K", "4K"]);
  assert.deepEqual(config.models[1].qualityOptions, ["low", "medium", "high", "xhigh", "max"]);
  assert.deepEqual(config.models[1].referencePurposes.map(value => value.key), ["object", "material"]);
  assert.equal(config.models[1].defaultReferencePurpose, "object");
  for (const model of config.models.filter(model => model.key !== "gptImage25Sunburst")) assert.equal(model.referencePurposes, undefined);
  const disconnected = await readImageMaskFillConfig(null);
  assert.equal(disconnected.models[1].available, false);
});

test("后台入口冻结Sunburst真实身份，异步上游ID/状态进入可查询任务快照且复核权限", async () => {
  const input = await fixture(); delete input.maskImage;
  const client = clientFixture(); let queued, response, archive, snapshot;
  const service = createGenerationService({ imageMaskFillClient: { generateImage() { assert.fail("不能走Flux"); } },
    imageClientForModel(key) { assert.equal(key, "gptImage25Sunburst"); return client; },
    getSessionModelCatalog: async (actualClient, options) => { assert.equal(actualClient, client); assert.equal(options.force, true); return catalog(); },
    verifyMaskFillSyncContract: async () => {}, scheduleGenerationSync(value) { archive = value; return { status: "pending" }; } });
  const body = { jobId: "generation-sunburst-mask-12345", featureMode: "imageMaskFill", sharedInput: input,
    items: [{ key: "forged-flux-key", label: "forged-label", provider: "comfyui", input: {} }] };
  let permitted = true;
  const handler = createGenerationJobApiHandler({ generationJobs: {
    enqueue(id, details, run) { queued = { id, details, run }; snapshot = { jobId: id, ...details }; return { jobId: id }; },
    get(id) { return id === snapshot?.jobId ? snapshot : null; },
  },
    generationService: service, getImageMaskFillConfig: async () => ({ models: [{ key: "gptImage25Sunburst", modes: [{ key: "prompt", available: permitted, label: "Sunburst提示词编辑" }] }] }),
    readJson: async () => structuredClone(body), sendJson: (_, status, value) => { response = { status, ...value }; },
    verifySyncContract: async (_, scope) => { assert.deepEqual(scope, { scope: "imageMaskFill" }); } });
  await handler({ method: "POST" }, {}, "/api/generation-jobs");
  assert.equal(response.status, 202); assert.deepEqual(queued.details.stages, { imageEdit: "submitting" });
  const result = await queued.run(value => Object.assign(snapshot, value));
  assert.equal(result.outcomes[0].status, "fulfilled");
  assert.equal(result.outcomes[0].value.request.provider, "oneapi");
  assert.equal(result.outcomes[0].value.request.outputResolution, "1K");
  assert.equal(archive.workflow.quality, "medium");
  assert.equal(result.outcomes[0].item.key, "gptImage25Sunburst-prompt");
  assert.equal(client.requests.length, 1); assert.equal(archive.modelLabel, MASK_FILL_ONEAPI_MODEL.label);
  assert.equal(client.asyncRequests.length, 1); assert.equal(client.syncRequests.length, 0);
  await handler({ method: "GET" }, {}, `/api/generation-jobs/${body.jobId}`);
  assert.equal(response.status, 200);
  assert.equal(response.job.stages.upstreamResponseId, "resp_mask_synthetic");
  assert.equal(response.job.stages.upstreamStatus, "queued");
  permitted = false; queued = null;
  await handler({ method: "POST" }, {}, "/api/generation-jobs");
  assert.equal(response.status, 409); assert.equal(queued, null); assert.equal(client.requests.length, 1);
});

test("GPT空指令参考任务入队冻结用途/模式/空原文/矩形和多边形，后续共享点对象不改变执行区域", async () => {
  for (const fillReferencePurpose of [undefined, "object", "material"]) for (const editRegion of [{ x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
    { type: "polygon", points: [{ x: 0.25, y: 0.25 }, { x: 0.75, y: 0.25 }, { x: 0.5, y: 0.75 }] }]) {
    const expectedRegion = structuredClone(editRegion);
    const expectedPurpose = fillReferencePurpose || "object";
    const sharedInput = await fixture(96, 64, { editRegion, ...(fillReferencePurpose !== undefined ? { fillReferencePurpose } : {}), maskFillMode: "reference", fillReferenceImage: descriptor(await picture(48, 80, "#6789ab")) });
    delete sharedInput.maskImage; delete sharedInput.prompt;
    const body = { jobId: "generation-sunburst-box-12345", featureMode: "imageMaskFill", sharedInput,
      items: [{ key: "forged-key", provider: "comfyui", input: {} }] };
    let queued, response, executed;
    const handler = createGenerationJobApiHandler({
      generationJobs: { enqueue(id, details, run) { queued = { id, details, run }; return { jobId: id }; } },
      generationService: { async executeForMode(mode, input) { executed = { mode, input }; return { ok: true }; } },
      getImageMaskFillConfig: async () => ({ models: [{ key: "gptImage25Sunburst", modes: [{ key: "reference", available: true, label: "Sunburst参考图编辑" }] }] }),
      readJson: async () => body, sendJson: (_, status, value) => { response = { status, ...value }; }, verifySyncContract: async () => {},
    });
    await handler({ method: "POST" }, {}, "/api/generation-jobs");
    assert.equal(response.status, 202);
    assert.deepEqual(queued.details.stages, { imageEdit: "submitting" });
    assert.equal(body.items[0].provider, "oneapi");
    sharedInput.fillReferencePurpose = expectedPurpose === "object" ? "material" : "object";
    if (editRegion.type === "polygon") editRegion.points[0].x = 0.75;
    else editRegion.x = 0.75;
    const result = await queued.run(() => {});
    assert.equal(result.outcomes[0].status, "fulfilled");
    assert.equal(executed.mode, "imageMaskFill");
    assert.deepEqual(executed.input.editRegion, expectedRegion);
    assert.equal(executed.input.prompt, "");
    assert.equal(executed.input.maskFillMode, "reference");
    assert.equal(executed.input.fillReferencePurpose, expectedPurpose);
    assert.equal(executed.input.fillReferenceImage.dataUrl, sharedInput.fillReferenceImage.dataUrl);
    assert.equal(executed.input.maskFillModel, "gptImage25Sunburst");
    assert.equal(executed.input.maskExpand, 0);
    assert.equal(Object.hasOwn(executed.input, "maskImage"), false);
    assert.equal(result.outcomes[0].item.key, "gptImage25Sunburst-reference");
  }
});

test("三档均按原生尺寸交付与归档，五质量原样提交；旧显式2k仍保留2K", async () => {
  for (const outputResolution of ["1K", "2K", "4K"]) {
    const input = await fixture(32, 32, { outputResolution }); const client = clientFixture(); let archive;
    const result = await executeImageMaskFill(input, { imageClient: client, getOneApiModels: catalog,
      verifySyncContract: async () => {}, scheduleSync(value) { archive = value; return { status: "pending" }; } });
    const edge = { "1K": 1024, "2K": 2048, "4K": 2880 }[outputResolution];
    assert.equal(result.request.size, `${edge}x${edge}`); assert.equal(archive.preview.resolution, outputResolution);
    assert.equal(archive.workflow.outputResolution, outputResolution); assert.equal(archive.workflow.outputWidth, edge);
    assert.equal(result.upstream.metadata.outputResized, false);
  }
  for (const quality of ["low", "medium", "high", "xhigh", "max"]) {
    const validated = await validateMaskFillInput(await fixture(32, 32, { quality }));
    const prepared = await prepareSunburstMaskInput(validated);
    assert.equal(prepared.request.quality, quality);
  }
  const legacy = await validateMaskFillInput(await fixture(32, 32, { inferenceTier: "2k" }));
  assert.equal(legacy.outputResolution, "2K");
});

test("6MiB内JPEG转PNG后仍可能超过JSON单图容量，超限在付费前拒绝", async () => {
  const width = 3072, height = 2048;
  const jpeg = await sharp(randomBytes(width * height * 3), { raw: { width, height, channels: 3 } }).jpeg({ quality: 70 }).toBuffer();
  assert.ok(jpeg.length < 6 * 1024 * 1024);
  const input = await fixture(width, height);
  input.referenceImages = [{ dataUrl: `data:image/jpeg;base64,${jpeg.toString("base64")}`, type: "image/jpeg", name: "noise.jpg", size: jpeg.length }];
  const client = clientFixture();
  await assert.rejects(executeImageMaskFill(input, { imageClient: client, getOneApiModels: catalog }), /转换PNG后超过.*image_url/);
  assert.equal(client.requests.length, 0);
});

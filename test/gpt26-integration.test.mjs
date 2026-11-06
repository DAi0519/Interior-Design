/**
 * [INPUT]: 依赖模型目录、GPT编辑/打光/扩图/多角度适配器与sharp离线图片替身
 * [OUTPUT]: 验证GPT2.6两款模型的尺寸准入、权限隔离、实际请求身份、原生PNG交付和归档身份
 * [POS]: test 的跨场景GPT2.6回归；不访问OneAPI或飞书、不产生费用
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { MODEL_CONFIGS, createGenerationRequest, publicModelCatalog } from "../src/model-config.mjs";
import { readImageMaskFillConfig, validateMaskFillInput, executeImageMaskFill } from "../src/image-mask-fill-service.mjs";
import { readImageRelightConfig, validateRelightInput } from "../src/image-relight-service.mjs";
import { prepareRelightInput } from "../src/image-relight-oneapi.mjs";
import { createImageOutpaintConfigReader, executeImageOutpaint } from "../src/image-outpaint-service.mjs";
import { MULTI_ANGLE_API_MODELS } from "../src/image-multi-angle-oneapi.mjs";
import { FLOOR_PLAN_GPT_MODEL_KEYS, FLOOR_PLAN_LAYOUT_MODEL_KEYS } from "../src/floor-plan-service.mjs";
import { publicBetaOutpaintConfig } from "../src/beta-outpaint.mjs";
const bytes = await sharp({ create: { width: 96, height: 64, channels: 3, background: "#aa9977" } }).png().toBuffer();
const image = { name: "source.png", type: "image/png", size: bytes.length, dataUrl: `data:image/png;base64,${bytes.toString("base64")}` };
for (const variant of ["Sunburst", "Flare"]) {
  const key = `gptImage26${variant}`, model = MODEL_CONFIGS[key];
  const getOneApiModels = async () => [{ id: model.id }];
  test(`${key}独立身份与1K/2K/4K准入，未证实2:1不开放`, () => {
    assert.equal(publicModelCatalog().find(entry => entry.key === key).id, model.id);
    for (const resolution of ["1K", "2K", "4K"]) {
      const { request } = createGenerationRequest({ modelKey: key, outputFormat: "png", prompt: "room", ratio: "16:9", resolution, quality: "medium" });
      assert.equal(request.model, model.id); assert.equal(request.size, model.sizes["16:9"][resolution]);
    }
    assert.throws(() => createGenerationRequest({ modelKey: key, outputFormat: "png", prompt: "room", ratio: "2:1", resolution: "4K" }));
    assert.ok(MULTI_ANGLE_API_MODELS.some(model => model.key === key));
    assert.ok(FLOOR_PLAN_GPT_MODEL_KEYS.includes(key)); assert.ok(FLOOR_PLAN_LAYOUT_MODEL_KEYS.includes(key));
  });
  test(`${key}局部编辑走实际模型、权限隔离及归档无旧模型冒名`, async () => {
    const config = await readImageMaskFillConfig(null, { getOneApiModels });
    assert.equal(config.models.find(model => model.key === key).available, true);
    assert.equal(config.models.find(model => model.key === "gptImage25Sunburst").available, false);
    const input = { maskFillModel: key, maskFillMode: "prompt", prompt: "Make the sofa green", referenceImages: [image], outputResolution: "1K", quality: "medium" };
    let submitted, archive;
    const imageClient = { async editImageAsync(request) {
      submitted = request; const [width, height] = request.size.split("x").map(Number);
      const result = await sharp({ create: { width, height, channels: 3, background: "green" } }).png().toBuffer();
      return { images: [{ url: `data:image/png;base64,${result.toString("base64")}` }] };
    } };
    await executeImageMaskFill(input, { imageClient, getOneApiModels, verifySyncContract: async () => {},
      scheduleSync(value) { archive = value; return { status: "pending" }; } });
    assert.equal(submitted.model, model.id); assert.equal(archive.modelLabel, model.label);
    await assert.rejects(executeImageMaskFill(input, { imageClient, getOneApiModels: async () => [] }), { statusCode: 409 });
    await assert.rejects(validateMaskFillInput({ ...input, outputResolution: "6K" }), { statusCode: 400 });
  });
  test(`${key}打光/渲染共享编译保留实际选择与尺寸`, async () => {
    const config = await readImageRelightConfig({ getOneApiModels, readPromptConfig: async () => ({ available: true }) });
    assert.equal(config.models.find(model => model.key === key).available, true);
    const validated = await validateRelightInput({ modelKey: key, templateKey: "naturalFill", referenceImages: [image], outputResolution: "4K" });
    const prepared = await prepareRelightInput(validated, { buildPrompt: () => "Relight this room" });
    assert.equal(prepared.request.model, model.id); assert.equal(prepared.request.size, model.sizes["3:2"]["4K"]);
  });
  test(`${key}Main/Beta扩图目录和实际遮罩请求使用独立身份`, async () => {
    const config = await createImageOutpaintConfigReader(null, { getOneApiModels })();
    assert.equal(config.engines.find(engine => engine.key === key).available, true);
    const beta = publicBetaOutpaintConfig(config).workflows.find(workflow => workflow.model === key);
    assert.equal(beta.available, true);
    let submitted, archive;
    const result = await executeImageOutpaint({ outpaintEngine: key, referenceImages: [image],
      outpaintCanvas: { ratio: "original", resolution: "2K", scale: .5 } }, {
      imageClient: { async editImage(request) { submitted = request; const [width,height] = request.size.split("x").map(Number);
        const result = await sharp({ create: { width,height,channels:3,background:"white" } }).png().toBuffer();
        return { images: [{ url: `data:image/png;base64,${result.toString("base64")}` }] }; } },
      scheduleSync(value) { archive=value; return { status: "pending" }; } });
    assert.equal(submitted.model, model.id); assert.ok(submitted.mask.image_url);
    assert.equal(result.request.model, model.id); assert.equal(archive.modelLabel, model.label);
  });
}

test("目录查询预算失败不伪报没有模型权限", async () => {
  const config = await readImageRelightConfig({ getOneApiModels: async () => { throw new Error("API key budget exceeded"); },
    readPromptConfig: async () => ({ available: true }) });
  assert.equal(config.available, false);
  for (const model of config.models) assert.match(model.reason, /budget exceeded/);
});

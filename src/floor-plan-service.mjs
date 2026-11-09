/**
 * [INPUT]: 依赖 sharp 单图真实解码、共享四模型目录/请求、独立飞书JSON资产、OneAPI图片连接和既有多角度原语
 * [OUTPUT]: 提供超预算参考图自动压缩、实际送模尺寸/SHA及平面布局与共享单张成图、冻结复验资产/模型、原生格式与实际尺寸/回执；可向归档调用方回传实际送模词与参考图。
 * [POS]: src 的最简平面布局图像服务，不嵌入专业编辑器、不冒用二次编辑归档、不自动串联或重试收费
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createHash } from "node:crypto";
import sharp from "sharp";
import { MODEL_CONFIGS, createGenerationRequest } from "./model-config.mjs";
import { normalizeReferenceImage } from "./reference-image.mjs";
import { decodeImageDataUrl, fitImageDataUrlForRequest, loadImageBytes } from "./image-artifact.mjs";
import { getFloorPlanPrompt, publicFloorPlanPromptConfig, floorPlanPromptIdentity, parseFloorPlanPrompt, FLOOR_PLAN_PROMPT_CODE } from "./floor-plan-prompt.mjs";
import { normalizeCameraPose } from "./image-multi-angle-prompt.mjs";
import { prepareMultiAngleImage } from "./image-multi-angle-image.mjs";
import { executeOneApiMultiAngle } from "./image-multi-angle-oneapi.mjs";

export const FLOOR_PLAN_WORKFLOW_VERSION = "2026-11-04.floor-plan.3";
export const FLOOR_PLAN_MODEL_KEY = "gptImage25Sunburst";
export const FLOOR_PLAN_GPT_MODEL_KEYS = Object.freeze([FLOOR_PLAN_MODEL_KEY, "gptImage26Sunburst", "gptImage26Flare"]);
export const FLOOR_PLAN_LAYOUT_MODEL_KEYS = Object.freeze([...FLOOR_PLAN_GPT_MODEL_KEYS, "banana21", "seedream5", "seedream5Pro"]);
export const FLOOR_PLAN_IMAGE_POLICY = Object.freeze({ accept: ["image/png", "image/jpeg", "image/webp"],
  maxBytesPerImage: 8 * 1024 * 1024, maxDimension: 4096, maxPixels: 16 * 1024 * 1024, maxCount: 1 });
const FLOOR_PLAN_REFERENCE_BASE64_BUDGET = 20_971_520;
const actions = ["layout", "adjust", "interior", "camera"];
const hash = (value) => createHash("sha256").update(value).digest("hex");
const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode, floorPlanSafe: true });
const own = (value, key) => Object.hasOwn(value, key);

// --- 费用仅取白名单；原始请求、图片和资产正文不进入失败回执 ---
function failureDiagnostic(response = {}, requestId = null) {
  const usageCost = {};
  for (const key of ["cost", "costUsd", "exchangeRate", "nativeAmount"]) {
    const amount = response?.usageCost?.[key];
    if (amount === null || (typeof amount === "number" && Number.isFinite(amount) && amount >= 0)) usageCost[key] = amount;
  }
  if (/^[A-Z]{3}$/.test(response?.usageCost?.currency || "")) usageCost.currency = response.usageCost.currency;
  const id = response?.requestId || requestId;
  return { requestId: typeof id === "string" ? id.replace(/\bsk-[a-zA-Z0-9_-]{8,}\b/g, "[已移除凭据]").replace(/[\u0000-\u001f]/g, "").slice(0, 160) : null,
    ...(Object.keys(usageCost).length ? { usageCost } : {}) };
}

function modelOption(key) {
  const entry = MODEL_CONFIGS[key];
  return { key, id: entry.id, label: entry.label,
    defaults: { resolution: Object.values(entry.sizes).every((sizes) => Object.hasOwn(sizes, "1K")) ? "1K" : "2K",
      quality: entry.qualityOptions.length ? entry.defaultQuality : null, outputFormat: "png" } };
}
async function availableModels(getModels) {
  let catalog;
  try { catalog = await getModels({ forceRefresh: true }); }
  catch { throw fail("OneAPI 未连接或模型权限读取失败，请检查连接后重试", 409); }
  if (!Array.isArray(catalog)) throw fail("OneAPI 模型目录格式不正确", 409);
  return FLOOR_PLAN_LAYOUT_MODEL_KEYS.map((key) => {
    const option = modelOption(key);
    const available = catalog.some((entry) => (entry.id || entry.name) === option.id);
    return { ...option, available, reason: available ? null : `当前 OneAPI Key 未开放 ${option.label}` };
  });
}
async function assertModelAccess(key, getModels) {
  const selected = (await availableModels(getModels)).find((entry) => entry.key === key);
  if (!selected?.available) throw fail(selected?.reason || "当前所选布局模型不可用，请检查连接后刷新", 409);
  return selected;
}

function validatedInput(input) {
  const keys = ["action", "referenceImage", "modelKey", "userRequirements", "promptVersion", "promptSha256", "cameraPose", "sourceAction"];
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some((key) => !keys.includes(key))) throw fail("平面布局请求包含未知字段");
  if (!actions.includes(input.action)) throw fail("请选择生成布局、调整方案、室内预览或机位预览");
  const modelKey = input.modelKey === undefined ? FLOOR_PLAN_MODEL_KEY : input.modelKey;
  if (!(input.action === "layout" ? FLOOR_PLAN_LAYOUT_MODEL_KEYS : FLOOR_PLAN_GPT_MODEL_KEYS).includes(modelKey)) {
    throw fail(input.action === "layout" ? "请选择受支持的平面布局出图模型" : "文字调整、室内和机位预览请选择GPT图像模型");
  }
  const userRequirements = input.userRequirements ?? "";
  if (typeof userRequirements !== "string" || userRequirements.length > 4000
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(userRequirements)) throw fail("设计要求最多4000字且不能包含控制字符");
  if (input.action === "adjust" && !userRequirements.trim()) throw fail("请填写想要调整的内容");
  if (!Number.isSafeInteger(input.promptVersion) || input.promptVersion < 1 || typeof input.promptSha256 !== "string"
    || !/^[a-f0-9]{64}$/.test(input.promptSha256)) throw fail("缺少有效的平面布局 Prompt 版本，请刷新配置");
  if (input.sourceAction !== undefined && !actions.includes(input.sourceAction)) throw fail("方案来源类型不正确");
  let cameraPose;
  if (input.action === "camera") {
    if (input.sourceAction !== "interior") throw fail("请先生成室内预览，再选择其他机位");
    if (userRequirements.trim()) throw fail("机位预览使用固定镜头指令，不接收文字修改");
    const pose = input.cameraPose;
    if (!pose || typeof pose !== "object" || Array.isArray(pose) || Object.keys(pose).length !== 3
      || Object.keys(pose).some((key) => !["azimuth", "elevation", "distance"].includes(key))) throw fail("机位参数不完整或包含未知字段");
    cameraPose = normalizeCameraPose(pose);
  } else if (own(input, "cameraPose")) throw fail("当前操作不接收机位参数");
  return { action: input.action, modelKey, userRequirements,
    promptVersion: input.promptVersion, promptSha256: input.promptSha256,
    ...(input.sourceAction ? { sourceAction: input.sourceAction } : {}), ...(cameraPose ? { cameraPose } : {}) };
}

export async function normalizeFloorPlanReferenceImage(input) {
  let reference;
  try { reference = normalizeReferenceImage(input, FLOOR_PLAN_IMAGE_POLICY); }
  catch { throw fail("请上传真实PNG、JPEG或WebP图片，单张不超过8MiB"); }
  if (!reference) throw fail("请先上传户型图或选择当前方案");
  if (Math.max(reference.width, reference.height) > 4096 || reference.width * reference.height > FLOOR_PLAN_IMAGE_POLICY.maxPixels) throw fail("图片须在4096px单边、16MP以内");
  const original = decodeImageDataUrl(reference.imageUrl);
  let decoded;
  try {
    const image = sharp(original, { failOn: "error", limitInputPixels: FLOOR_PLAN_IMAGE_POLICY.maxPixels });
    const metadata = await image.metadata();
    if (metadata.pages > 1) throw new Error("animated");
    decoded = await image.rotate().png().toBuffer({ resolveWithObject: true });
  } catch { throw fail("图片无法完整解码，请重新导出静态图片后上传"); }
  const { width, height } = decoded.info;
  if (Math.max(width, height) > 4096 || width * height > FLOOR_PLAN_IMAGE_POLICY.maxPixels) throw fail("图片旋转后的尺寸超过限制");
  // --- PNG膨胀不再拒绝合规原图；复用请求压缩，先保留分辨率，再按需缩小。 ---
  const imageUrl = await fitImageDataUrlForRequest(`data:image/png;base64,${decoded.data.toString("base64")}`,
    { maxBase64Bytes: FLOOR_PLAN_REFERENCE_BASE64_BUDGET });
  const submitted = decodeImageDataUrl(imageUrl), metadata = await sharp(submitted).metadata();
  return { imageUrl, source: { fileName: reference.fileName, width: metadata.width, height: metadata.height,
    sha256: hash(original), submittedSha256: hash(submitted) } };
}

export async function readFloorPlanConfig({ getModels, readPromptConfig = publicFloorPlanPromptConfig, forceRefresh = false } = {}) {
  const results = await Promise.allSettled([availableModels(getModels), readPromptConfig({ forceRefresh })]);
  const layoutModels = results[0].status === "fulfilled" ? results[0].value : FLOOR_PLAN_LAYOUT_MODEL_KEYS.map((key) => ({
    ...modelOption(key), available: false, reason: results[0].reason.message }));
  const models = layoutModels.filter((entry) => FLOOR_PLAN_GPT_MODEL_KEYS.includes(entry.key) && entry.available)
    .map(({ key, id, label }) => ({ key, id, label }));
  const asset = results[1].status === "fulfilled" ? results[1].value : { available: false, reason: "飞书平面布局 Prompt 读取失败" };
  const prompt = { ...floorPlanPromptIdentity(asset || {}), available: Boolean(asset?.available), published: Boolean(asset?.published), reason: asset?.reason || null };
  const reason = !prompt.available ? prompt.reason || "平面布局 Prompt 尚不可用" : results[0].status === "rejected" ? results[0].reason.message
    : !layoutModels.some((entry) => entry.available) ? "当前 OneAPI Key 没有可用的平面布局出图模型" : null;
  const continuationReason = !prompt.available ? prompt.reason || "平面布局 Prompt 尚不可用"
    : !models.length ? layoutModels.find((entry) => entry.key === FLOOR_PLAN_MODEL_KEY).reason : null;
  return { featureMode: "floorPlan", workflowVersion: FLOOR_PLAN_WORKFLOW_VERSION, available: !reason, reason,
    imagePolicy: FLOOR_PLAN_IMAGE_POLICY, models, defaultModel: FLOOR_PLAN_MODEL_KEY, defaultModelKey: FLOOR_PLAN_MODEL_KEY,
    layoutModels, defaultLayoutModel: layoutModels.find((entry) => entry.available)?.key || null,
    continuationAvailable: !continuationReason, continuationReason,
    actions, output: { resolution: "1K", quality: "medium", format: "png", cameraResolution: "2K-max", exactCameraGeometry: false }, prompt };
}

function checkedAsset(asset, fields) {
  if (!asset?.published || asset.code !== FLOOR_PLAN_PROMPT_CODE || asset.version !== fields.promptVersion
    || asset.sha256 !== fields.promptSha256 || hash(asset.prompt || "") !== fields.promptSha256) throw fail("平面布局 Prompt 身份不一致，请刷新配置", 409);
  return { ...asset, bundle: parseFloorPlanPrompt(asset.prompt) };
}
export async function prepareFloorPlanInput(input, { getModels, getPrompt = getFloorPlanPrompt } = {}) {
  const fields = validatedInput(input);
  const reference = await normalizeFloorPlanReferenceImage(input.referenceImage);
  const selected = await assertModelAccess(fields.modelKey, getModels);
  if (!FLOOR_PLAN_GPT_MODEL_KEYS.includes(fields.modelKey)) {
    // --- 复用通用图生图的请求压缩，并在客户端幂等复核前记录真实送入字节 ---
    try { reference.imageUrl = await fitImageDataUrlForRequest(reference.imageUrl); }
    catch { throw fail("户型图请求体积过大，请降低分辨率后上传"); }
  }
  const bytes = decodeImageDataUrl(reference.imageUrl), submitted = await sharp(bytes).metadata();
  reference.source = { ...reference.source, submittedSha256: hash(bytes), submittedFormat: submitted.format,
    submittedWidth: submitted.width, submittedHeight: submitted.height };
  const prompt = checkedAsset(await getPrompt({ version: fields.promptVersion, expectedSha256: fields.promptSha256, forceRefresh: true }), fields);
  return { ...fields, ...reference, model: { key: selected.key, id: selected.id, label: selected.label }, defaults: selected.defaults, prompt };
}

export async function executeFloorPlan(prepared, { client, getModels, getPrompt = getFloorPlanPrompt,
  onProgress = () => {}, onCompiledPrompt = () => {} } = {}) {
  const current = checkedAsset(await getPrompt({ version: prepared.prompt.version, expectedSha256: prepared.prompt.sha256, forceRefresh: true }), prepared);
  if (current.source !== prepared.prompt.source) throw fail("平面布局 Prompt 执行前已变更，请刷新后新建任务", 409);
  const selected = await assertModelAccess(prepared.modelKey, getModels);
  if (selected.id !== prepared.model.id) throw fail("所选布局模型身份已变更，请刷新后新建任务", 409);
  const method = prepared.action === "camera" ? "editImage" : FLOOR_PLAN_GPT_MODEL_KEYS.includes(prepared.modelKey) ? "editImageAsync" : "generateImage";
  if (typeof client?.[method] !== "function") throw fail("平面布局图像连接不可用，请检查OneAPI连接", 409);
  let response, submittedId = null;
  const startedAt = Date.now();
  try {
    let url, actual;
    if (prepared.action === "camera") {
      const input = { dataUrl: prepared.imageUrl, type: "image/png", name: prepared.source.fileName, size: decodeImageDataUrl(prepared.imageUrl).length };
      const image = await prepareMultiAngleImage(input);
      const result = await executeOneApiMultiAngle({ ...image, model: { ...prepared.model, qualityOptions: MODEL_CONFIGS[prepared.modelKey].qualityOptions, defaultQuality: "medium" },
        pose: prepared.cameraPose, quality: "medium" }, { imageClient: { async editImage(request) {
          onCompiledPrompt(request.prompt, request.images[0].image_url);
          response = await client.editImage(request);
          return response;
        } }, onProgress });
      url = result.images[0].url;
      actual = { ...result.upstream.metadata, cameraPose: prepared.cameraPose, exactCameraGeometry: false };
    } else {
      const prompt = [prepared.userRequirements.trim() ? prepared.userRequirements : null, current.bundle[prepared.action]].filter(Boolean).join("\n\n");
      onCompiledPrompt(prompt, prepared.imageUrl);
      ({ url, actual, response } = await generateFloorPlanImage({ ...prepared, defaults: selected.defaults }, { client, prompt, onProgress }));
    }
    const bytes = decodeImageDataUrl(url);
    const metadata = await sharp(bytes).metadata();
    const receipt = failureDiagnostic(response, submittedId);
    const image = { url, width: metadata.width, height: metadata.height, type: "image/png", sha256: hash(bytes) };
    return { action: prepared.action, image, images: [{ url }], source: prepared.source, model: prepared.model,
      userRequirements: prepared.userRequirements, prompt: floorPlanPromptIdentity(current), workflowVersion: FLOOR_PLAN_WORKFLOW_VERSION,
      ...receipt, durationMs: Date.now() - startedAt, actual: { ...actual, outputSha256: image.sha256, actualOutputWidth: image.width, actualOutputHeight: image.height } };
  } catch (error) {
    const safe = fail(error?.floorPlanSafe ? error.message : "图像任务未完成，请先查询原任务；不会自动重新请求模型", 502);
    safe.floorPlanDiagnostic = error.floorPlanDiagnostic || failureDiagnostic(response || error, submittedId);
    throw safe;
  }
}

// --- 图片执行原语供实验室与户型平面布局共用，调用方负责Prompt与模型准入 ---
export async function generateFloorPlanImage(prepared, { client, prompt, onProgress = () => {}, images, ratio, generationMode = "image-to-image" }) {
  if (!["image-to-image", "text-to-image"].includes(generationMode)) throw fail("图片生成模式无效");
  const textToImage = generationMode === "text-to-image";
  if (textToImage && images !== undefined) throw fail("文生图不能携带参考图参数");
  const method = !textToImage && FLOOR_PLAN_GPT_MODEL_KEYS.includes(prepared.modelKey) ? "editImageAsync" : "generateImage";
  let response, submittedId = null, url, actual;
  try {
      const { resolution, quality, outputFormat, complexity } = prepared.defaults;
      let generation;
      try {
        generation = createGenerationRequest({ modelKey: prepared.modelKey, prompt, resolution, ...(ratio ? { ratio } : {}), ...(quality ? { quality } : {}), ...(complexity != null ? { complexity } : {}), outputFormat },
          { compiledPrompt: true, preferSourceAspect: !ratio && !textToImage, sourceDimensions: prepared.source });
      } catch (error) { throw fail(error.message, error.statusCode || 400); }
      const request = { ...generation.request, prompt, n: 1,
        ...(!textToImage ? { images: images || [{ image_url: prepared.imageUrl }] } : {}), response_format: "b64_json" };
      onProgress({ message: ({ layout: "AI正在生成平面布局", adjust: "AI正在按要求调整方案", interior: "AI正在生成室内预览", render: "AI正在按平面图机位生成室内效果图" })[prepared.action] });
      response = await client[method](request, { onSubmitted({ id }) { submittedId = id; onProgress({ message: "图像任务已提交，正在生成", upstreamResponseId: id }); } });
      if (response.images?.length !== 1) throw fail("图像模型没有返回唯一图片", 502);
      const bytes = await loadImageBytes(response.images[0].url);
      // --- 输出按模型真源的实际请求尺寸解码；输入图仍保持独立16MP边界 ---
      const [requestedWidth, requestedHeight] = request.size.split("x").map(Number);
      const outputPixelLimit = Math.max(FLOOR_PLAN_IMAGE_POLICY.maxPixels, requestedWidth * requestedHeight);
      const metadata = await sharp(bytes, { limitInputPixels: outputPixelLimit }).metadata();
      const sunburst = FLOOR_PLAN_GPT_MODEL_KEYS.includes(prepared.modelKey);
      if ((sunburst ? metadata.format !== "png" : !["png", "jpeg", "webp"].includes(metadata.format))
        || (metadata.pages || 1) !== 1 || !metadata.width || !metadata.height) throw fail("图像模型没有返回可用的单帧图片", 502);
      const sizeMatched = `${metadata.width}x${metadata.height}` === request.size;
      if (sunburst && !sizeMatched) throw fail(`实际图片尺寸${metadata.width}×${metadata.height}与请求${request.size}不一致`, 502);
      const outputConverted = metadata.format !== "png";
      const delivery = outputConverted ? await sharp(bytes, { limitInputPixels: outputPixelLimit }).png().toBuffer() : bytes;
      url = `data:image/png;base64,${delivery.toString("base64")}`;
      actual = { requestedSize: request.size, nativeOutputWidth: metadata.width, nativeOutputHeight: metadata.height,
        nativeFormat: metadata.format, nativeSha256: hash(bytes), outputFormat: "png", outputConverted,
        outputResolution: resolution, quality, sizeMatched, outputResized: false, exactCameraGeometry: false };
    return { url, actual, response };
  } catch (error) {
    const safe = fail(error?.floorPlanSafe ? error.message : "布局图生成未完成，请检查原任务，不会自动重试", 502);
    safe.floorPlanDiagnostic = failureDiagnostic(response || error, submittedId);
    throw safe;
  }
}

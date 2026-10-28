/**
 * [INPUT]: 依赖独立飞书打光Prompt资产、整体原灯处理、五模板/旧方案与四动作图片合同、sharp、GPT适配器、实时模型权限及飞书同步
 * [OUTPUT]: 对外提供脱敏配置、上架Prompt快照准备、自定义整体原灯无标注/模板禁暗参准入、服务器快照执行和实际Prompt归档，正文不进入任务结果
 * [POS]: src 的独立 AI 打光应用服务，固定 GPT Image 2.5 Sunburst，复用后台任务与同步且不重试付费请求
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import sharp from "sharp";
import { normalizeReferenceImage } from "./reference-image.mjs";
import { verifyLarkSyncSchema } from "./lark-sync.mjs";
import { buildImageRelightArchive } from "./image-relight-archive.mjs";
import { getImageRelightPrompt, publicImageRelightPromptConfig } from "./image-relight-prompt.mjs";
import { RELIGHT_ONEAPI_MODEL, RELIGHT_WORKFLOW_VERSION, relightQuality, executeRelightOneApi } from "./image-relight-oneapi.mjs";
import { RELIGHT_MODEL_KEY, RELIGHT_IMAGE_POLICY, RELIGHT_LIMITS, RELIGHT_TYPES, RELIGHT_MODES, RELIGHT_ACTIONS, RELIGHT_ORIGINAL_LIGHT_ACTIONS, RELIGHT_RESOLUTIONS,
  normalizeRelightLights, normalizeRelightOriginalLights, relightOutputSize } from "../public/image-relight-geometry.js";
import { RELIGHT_TEMPLATES, RELIGHT_LEGACY_TEMPLATES, RELIGHT_BLEND_MODES, RELIGHT_DEFAULT_TEMPLATE_KEY, RELIGHT_DEFAULT_BLEND_MODE,
  normalizeRelightSettings } from "../public/image-relight-presets.js";

const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const digest = bytes => createHash("sha256").update(bytes).digest("hex");

export async function readImageRelightConfig({ getOneApiModels, forceRefresh = false, readPromptConfig = publicImageRelightPromptConfig } = {}) {
  let available = false, reason = "请连接有Sunburst权限的OneAPI Key";
  try {
    if (getOneApiModels) {
      available = (await getOneApiModels()).some(entry => entry.id === RELIGHT_ONEAPI_MODEL.id);
      reason = available ? null : "当前OneAPI Key没有Sunburst权限";
    }
  } catch (error) { reason = `GPT打光不可用：${String(error.message).slice(0, 180)}`; }
  let prompt;
  try { prompt = await readPromptConfig({ forceRefresh }); }
  catch (error) { prompt = { available: false, reason: String(error.message).slice(0, 180) }; }
  if (!prompt?.available) { available = false; reason = prompt?.reason || "飞书打光Prompt尚未上架"; }
  const model = { key: RELIGHT_MODEL_KEY, label: RELIGHT_ONEAPI_MODEL.label, provider: "oneapi", available, reason,
    qualityOptions: RELIGHT_ONEAPI_MODEL.qualityOptions, defaultQuality: RELIGHT_ONEAPI_MODEL.defaultQuality,
    outputResolutions: RELIGHT_RESOLUTIONS, defaultOutputResolution: "1K", sizes: RELIGHT_ONEAPI_MODEL.sizes };
  return { available, reason, modelKey: RELIGHT_MODEL_KEY, model, models: [model], defaultModel: RELIGHT_MODEL_KEY,
    qualityOptions: model.qualityOptions, defaultQuality: model.defaultQuality, outputResolutions: RELIGHT_RESOLUTIONS,
    defaultOutputResolution: "1K", sizes: model.sizes, imagePolicy: RELIGHT_IMAGE_POLICY, limits: RELIGHT_LIMITS,
    lightTypes: RELIGHT_TYPES, modes: RELIGHT_MODES, actions: RELIGHT_ACTIONS, originalLightActions: RELIGHT_ORIGINAL_LIGHT_ACTIONS, defaultOriginalLights: { action: "keep" }, templates: RELIGHT_TEMPLATES, legacyTemplates: RELIGHT_LEGACY_TEMPLATES, blendModes: RELIGHT_BLEND_MODES,
    defaultTemplateKey: RELIGHT_DEFAULT_TEMPLATE_KEY, defaultBlendMode: RELIGHT_DEFAULT_BLEND_MODE,
    maxCount: 1, syncMode: "lark", version: RELIGHT_WORKFLOW_VERSION, prompt };
}

function promptSelection(input) {
  if (["relightPromptSnapshot", "relightPromptBundle", "bundle"].some(key => Object.hasOwn(input, key))) throw fail("打光Prompt正文仅允许服务端读取");
  const version = input.relightPromptVersion === undefined ? undefined : Number(input.relightPromptVersion);
  const expectedSha256 = input.relightPromptSha256;
  if (version !== undefined && (!["number", "string"].includes(typeof input.relightPromptVersion) || !Number.isInteger(version) || version <= 0)) throw fail("打光Prompt版本必须是正整数");
  if (expectedSha256 !== undefined && (typeof expectedSha256 !== "string" || !/^[a-f0-9]{64}$/.test(expectedSha256))) throw fail("打光Prompt摘要必须是SHA-256");
  return { version, expectedSha256 };
}

function checkedSnapshot(snapshot, input) {
  const selection = promptSelection(input);
  let matchingBundle = false;
  try { matchingBundle = isDeepStrictEqual(snapshot.bundle, JSON.parse(snapshot.prompt)); } catch {}
  if (snapshot?.code !== "image-relight" || snapshot.published !== true || !Number.isInteger(snapshot.version) || snapshot.version <= 0
    || typeof snapshot.prompt !== "string" || !snapshot.prompt.trim() || !matchingBundle || !snapshot.source
    || snapshot.sha256 !== digest(snapshot.prompt)
    || selection.version !== undefined && selection.version !== snapshot.version
    || selection.expectedSha256 !== undefined && selection.expectedSha256 !== snapshot.sha256) throw fail("飞书打光Prompt快照与冻结版本或摘要不一致", 409);
  return structuredClone(snapshot);
}

export async function prepareImageRelightPrompt(input = {}, { getPrompt = getImageRelightPrompt } = {}) {
  const selection = promptSelection(input);
  return checkedSnapshot(await getPrompt({ ...selection, forceRefresh: true }), input);
}

async function decodeSource(input) {
  const source = normalizeReferenceImage(input, { accept: RELIGHT_IMAGE_POLICY.accept, maxBytesPerImage: RELIGHT_IMAGE_POLICY.maxBytesPerImage });
  if (!source) throw fail("打光需要上传1张原图");
  const bytes = Buffer.from(source.imageUrl.split(",")[1], "base64");
  try {
    const pipeline = sharp(bytes, { failOn: "error", limitInputPixels: RELIGHT_IMAGE_POLICY.maxPixels });
    const metadata = await pipeline.metadata();
    const mime = ({ png: "image/png", jpeg: "image/jpeg", webp: "image/webp" })[metadata.format];
    if (!mime || mime !== source.mimeType) throw fail("原图声明格式与真实图片字节不一致");
    if (!metadata.width || !metadata.height || Math.max(metadata.width, metadata.height) > RELIGHT_IMAGE_POLICY.maxInputEdge
      || metadata.width * metadata.height > RELIGHT_IMAGE_POLICY.maxPixels || (metadata.pages || 1) !== 1) throw fail("原图需为单帧PNG/JPEG/WebP，单边不超过4096px");
    const decoded = await pipeline.autoOrient().toBuffer({ resolveWithObject: true });
    const oriented = Boolean(metadata.orientation && metadata.orientation !== 1), actualBytes = oriented ? decoded.data : bytes;
    return { ...source, imageUrl: `data:${mime};base64,${actualBytes.toString("base64")}`, size: actualBytes.length,
      width: decoded.info.width, height: decoded.info.height, sha256: digest(actualBytes), originalSha256: digest(bytes), oriented,
      originalSize: { width: metadata.width, height: metadata.height } };
  } catch (error) {
    if (error.statusCode) throw error;
    throw fail("打光原图无法解码，或超过4096px限制，请重新导出PNG、JPEG或WebP");
  }
}

export async function validateRelightInput(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw fail("打光请求必须是有效对象");
  const selection = promptSelection(input);
  for (const key of ["modelKey", "relightModel"]) if (input[key] !== undefined && input[key] !== RELIGHT_MODEL_KEY) throw fail("打光仅支持GPT Image 2.5 Sunburst");
  if (input.provider !== undefined && input.provider !== "oneapi") throw fail("打光仅支持GPT模型通道");
  if (input.maskImage != null || input.mask != null || input.editRegion != null) throw fail("打光使用光源标注，不接受局部编辑遮罩或圈选");
  if (input.prompt !== undefined && typeof input.prompt !== "string") throw fail("补充打光要求必须是文本");
  const prompt = (input.prompt ?? "").trim();
  if (prompt.length > RELIGHT_LIMITS.maxPromptLength) throw fail("补充打光要求不能超过2000字符");
  let lights, originalLights, quality, outputResolution, settings;
  try {
    settings = normalizeRelightSettings(input);
    originalLights = normalizeRelightOriginalLights(input.originalLights);
    if (settings.templateKey !== "custom" && originalLights !== null) throw new TypeError("光照模板按方案重建照明，请在自定义中设置原有灯光");
    const wholeSceneEdit = originalLights?.action === "darken" || originalLights?.action === "turnOff";
    const allowEmpty = settings.templateKey !== "custom" || wholeSceneEdit;
    lights = normalizeRelightLights(input.lights === undefined && allowEmpty ? [] : input.lights, { allowEmpty });
    if (settings.templateKey === "custom" && !wholeSceneEdit && lights.every(light => light.action === "preserve")) {
      throw new TypeError("自定义需要减弱/关闭原有灯光，或至少一项新增光源/单灯调整；仅保持不变无需生成");
    }
    quality = relightQuality(input.quality);
    outputResolution = input.outputResolution === undefined ? "1K" : input.outputResolution;
    if (!RELIGHT_RESOLUTIONS.includes(outputResolution)) throw new TypeError("GPT输出档位请选择1K、2K或4K");
  } catch (error) { throw fail(error.message); }
  if (!Array.isArray(input.referenceImages) || input.referenceImages.length !== 1) throw fail("打光需要且只允许1张原图");
  const source = await decodeSource(input.referenceImages[0]);
  let target;
  try { target = relightOutputSize(source, outputResolution, RELIGHT_ONEAPI_MODEL.sizes); }
  catch (error) { throw fail(error.message); }
  return { modelKey: RELIGHT_MODEL_KEY, provider: "oneapi", source, lights, originalLights, prompt, quality, outputResolution, target, ...settings,
    ...(selection.version !== undefined ? { relightPromptVersion: selection.version } : {}),
    ...(selection.expectedSha256 !== undefined ? { relightPromptSha256: selection.expectedSha256 } : {}) };
}

export async function executeImageRelight(input, { imageClient, getOneApiModels, onProgress = null, scheduleSync = null,
  getPrompt = getImageRelightPrompt, relightPromptSnapshot = null,
  verifySyncContract = () => verifyLarkSyncSchema(undefined, { scope: "imageRelight" }) } = {}) {
  const validated = await validateRelightInput(input);
  if (!getOneApiModels || !(await getOneApiModels()).some(entry => entry.id === RELIGHT_ONEAPI_MODEL.id)) throw fail("当前OneAPI Key没有Sunburst权限，请重新连接", 409);
  if (scheduleSync) {
    try { await verifySyncContract(); }
    catch (error) { throw fail(`飞书同步合同未通过，已阻止打光生成：${String(error.message)}`, 409); }
  }
  const snapshot = relightPromptSnapshot ? checkedSnapshot(relightPromptSnapshot, input) : await prepareImageRelightPrompt(input, { getPrompt });
  validated.relightPromptSnapshot = snapshot;
  const { archiveGuideImage, ...completed } = await executeRelightOneApi(validated, { imageClient, onProgress: onProgress || (() => {}) });
  // -------- 实际Prompt只供归档；任务快照会直接进入浏览器，必须在返回前剥离 --------
  const { prompt: submittedPrompt, sourcePrompt: submittedSourcePrompt, ...publicMetadata } = completed.upstream.metadata;
  const publicResult = { ...completed, upstream: { ...completed.upstream, metadata: publicMetadata } };
  if (!scheduleSync) return publicResult;
  const archiveInput = { ...input, relightPromptVersion: snapshot.version, relightPromptSha256: snapshot.sha256 };
  const archive = buildImageRelightArchive({ input: archiveInput, validated, result: completed, guideImage: archiveGuideImage });
  return { ...publicResult, request: archive.preview, sync: scheduleSync(archive),
    upstream: { ...publicResult.upstream, metadata: { ...publicMetadata, syncMode: "lark" } } };
}

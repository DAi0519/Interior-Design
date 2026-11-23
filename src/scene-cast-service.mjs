/**
 * [INPUT]: 依赖共享参考图校验、GPT尺寸与模型目录、sharp及OneAPI异步图像编辑客户端
 * [OUTPUT]: 对外提供人物与宠物参数、图片和权限准入，冻结通用互动短词、角色图序、原渲染参数及逐角色图片摘要
 * [POS]: src 的AI渲染成图后编辑服务，独立于控光及二次编辑的替换语义
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createHash } from "node:crypto";
import sharp from "sharp";
import { loadImageBytes } from "./image-artifact.mjs";
import { MODEL_CONFIGS } from "./model-config.mjs";
import { normalizeReferenceImage, REFERENCE_IMAGE_POLICY } from "./reference-image.mjs";
import { MASK_FILL_GPT_OUTPUT_LIMITS, maskFillGptOutputSize } from "../public/image-mask-fill-geometry.js";
import { RELIGHT_MODEL_KEY, RELIGHT_MODEL_KEYS } from "../public/image-relight-geometry.js";
import { AI_RENDER_STUDIO_IMAGE_POLICY } from "./ai-render-studio-definitions.mjs";

export const SCENE_CAST_FEATURE = "sceneCast";
const WORKFLOW = Object.freeze({ key: "scene-cast", label: "添加人物/宠物", version: "2026-11-17.scene-cast.4" });
const MAX_SUBJECTS = 4;
const MAX_DESCRIPTION_LENGTH = 1_000;
const MAX_TRAIT_LENGTH = 120;
const MAX_SOURCE_METADATA_BYTES = 256 * 1024;
const IMAGE_POLICY = Object.freeze({ accept: AI_RENDER_STUDIO_IMAGE_POLICY.accept,
  maxBytesPerImage: AI_RENDER_STUDIO_IMAGE_POLICY.maxBytesPerImage,
  maxTotalBytes: REFERENCE_IMAGE_POLICY.maxTotalBytes,
  maxDimension: AI_RENDER_STUDIO_IMAGE_POLICY.maxInputEdge, maxPixels: AI_RENDER_STUDIO_IMAGE_POLICY.maxPixels });
const DEFAULT_RESOLUTION = "1K";
const SUBJECTS = ["person", "pet"];
const PEOPLE_FIELDS = ["age", "gender", "region", "build", "hairColor", "description"];
const PET_FIELDS = ["species", "breed", "description"];
const INPUT_FIELDS = ["sourceImage", "referenceImage", "referenceSubject", "referenceImages", "subject", "cast", "position", "action",
  "modelKey", "resolution", "quality", "ratio", "sourceRender"];
const SOURCE_FIELDS = ["featureMode", "featureLabel", "jobId", "modelKey", "model", "resolution", "quality", "size", "width", "height",
  "renderStyle", "materialMode", "lightingPreset", "sourcePrompt", "actualPrompt", "promptVersion", "promptSha256", "outputSha256",
  "requestId", "parameters", "workflow", "origin"];
const IMAGE_MIME = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp" };
const REFERENCE_LABELS = { person: "人物参考图", pet: "宠物参考图" };
const INVALID_METADATA_KEYS = ["__proto__", "constructor", "prototype"];
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const isObject = value => value && typeof value === "object" && !Array.isArray(value);
const dataUrl = (bytes, mimeType) => `data:${mimeType};base64,${bytes.toString("base64")}`;
const hasModel = (catalog, model) => Array.isArray(catalog) && catalog.some(entry => (entry?.id || entry?.name) === model.id);

export async function readSceneCastConfig({ getOneApiModels } = {}) {
  let catalog = [], catalogError = false;
  try { if (getOneApiModels) catalog = await getOneApiModels(); }
  catch { catalogError = true; }
  const models = RELIGHT_MODEL_KEYS.map(key => {
    const { id, label, sizes, qualityOptions, defaultQuality } = MODEL_CONFIGS[key];
    return { key, id, label, sizes, qualityOptions, defaultQuality, available: hasModel(catalog, { id }),
      outputResolutions: Object.keys(Object.values(sizes)[0]), defaultOutputResolution: DEFAULT_RESOLUTION };
  });
  const firstAllowed = models.find(model => model.available);
  return { available: Boolean(firstAllowed),
    reason: firstAllowed ? null : catalogError ? "无法读取OneAPI模型权限，请检查连接" : "请连接有GPT图像编辑权限的OneAPI Key",
    models, defaultModelKey: firstAllowed?.key || RELIGHT_MODEL_KEY, imagePolicy: IMAGE_POLICY,
    maxSubjects: MAX_SUBJECTS, referenceRoles: SUBJECTS, maxDescriptionLength: MAX_DESCRIPTION_LENGTH,
    archiveMode: "local-only", workflow: WORKFLOW };
}

function checkedObject(value, keys, label) {
  if (!isObject(value) || Object.keys(value).some(key => !keys.includes(key))) throw fail(`${label}包含未知字段或格式无效`);
  return value;
}

function optionalText(value, label, limit = MAX_DESCRIPTION_LENGTH) {
  if (value === undefined) return "";
  if (typeof value !== "string" || value.length > limit) throw fail(`${label}必须是${limit}字符以内的文本`);
  return value.trim();
}

function subjectList(entries = [], fields, label) {
  if (!Array.isArray(entries) || entries.length > MAX_SUBJECTS) throw fail(`${label}列表格式无效或超过${MAX_SUBJECTS}位`);
  return entries.map(entry => {
    checkedObject(entry, fields, label);
    return Object.fromEntries(Object.entries(entry).map(([key, value]) => [key,
      optionalText(value, label, key === "description" ? MAX_DESCRIPTION_LENGTH : MAX_TRAIT_LENGTH)]));
  });
}

function normalizeCast(input) {
  if (input.subject !== undefined && ![...SUBJECTS, "mixed"].includes(input.subject)) throw fail("请选择人物或宠物");
  const raw = input.cast === undefined
    ? input.subject === "pet" ? { pets: [{}] } : { people: [{}] }
    : checkedObject(input.cast, ["people", "pets", "interaction"], "模特设置");
  const people = subjectList(raw.people, PEOPLE_FIELDS, "人物");
  const pets = subjectList(raw.pets, PET_FIELDS, "宠物");
  if (people.length + pets.length < 1 || people.length + pets.length > MAX_SUBJECTS) throw fail(`请设置1–${MAX_SUBJECTS}位人物或宠物`);
  const subject = people.length && pets.length ? "mixed" : people.length ? "person" : "pet";
  if (input.subject !== undefined && input.subject !== subject) throw fail("模特类型与人物或宠物设置不一致");
  const interaction = raw.interaction ?? "auto";
  if (!["auto", "yes", "no"].includes(interaction)) throw fail("模特互动设置无效");
  return { subject, cast: { people, pets, interaction } };
}

function referenceUploads(input, subject) {
  const appliesTo = role => SUBJECTS.includes(role) && (subject === "mixed" || subject === role);
  if (input.referenceImages !== undefined) {
    if (input.referenceImage !== undefined || input.referenceSubject !== undefined) throw fail("不能混用旧版单参考字段和人物/宠物参考图字段");
    const uploads = checkedObject(input.referenceImages, SUBJECTS, "人物/宠物参考图");
    return SUBJECTS.filter(role => Object.hasOwn(uploads, role)).map(role => {
      if (!appliesTo(role)) throw fail(`${REFERENCE_LABELS[role]}需要先启用对应模特`);
      return { role, image: uploads[role] };
    });
  }
  const referenceSubject = input.referenceImage == null ? undefined
    : input.referenceSubject ?? (subject === "mixed" ? undefined : subject);
  if (input.referenceImage == null && input.referenceSubject !== undefined) throw fail("请上传模特参考图后再选择参考对象");
  if (input.referenceImage != null && !appliesTo(referenceSubject)) {
    throw fail("请选择参考图对应的人物或宠物");
  }
  return referenceSubject ? [{ role: referenceSubject, image: input.referenceImage }] : [];
}

function sourceSnapshot(value, sourceSha256) {
  if (value == null) return null;
  checkedObject(value, SOURCE_FIELDS, "原渲染参数");
  if (value.outputSha256 != null && (typeof value.outputSha256 !== "string" || value.outputSha256.toLowerCase() !== sourceSha256)) {
    throw fail("原渲染产物摘要与本次上传的场景图不一致，请重新选择原成图");
  }
  const encoded = JSON.stringify(value, (key, item) => {
    if (INVALID_METADATA_KEYS.includes(key) || (typeof item === "string" && /data:image\//i.test(item))) {
      throw fail("原渲染参数仅接受参数摘要，不能包含图片数据");
    }
    return item;
  });
  if (Buffer.byteLength(encoded) > MAX_SOURCE_METADATA_BYTES) throw fail("原渲染参数不能超过256KiB");
  return JSON.parse(encoded);
}

async function decodeInput(input, label) {
  const image = normalizeReferenceImage(input, IMAGE_POLICY);
  if (!image) throw fail(`请上传${label}`);
  const bytes = Buffer.from(image.imageUrl.split(",")[1], "base64");
  try {
    const pipeline = sharp(bytes, { failOn: "error", limitInputPixels: IMAGE_POLICY.maxPixels });
    const metadata = await pipeline.metadata();
    if (IMAGE_MIME[metadata.format] !== image.mimeType || (metadata.pages || 1) !== 1
      || Math.max(metadata.width, metadata.height) > IMAGE_POLICY.maxDimension) throw new Error("format or dimensions");
    const oriented = Boolean(metadata.orientation && metadata.orientation !== 1);
    const decoded = await pipeline.autoOrient().toBuffer({ resolveWithObject: true });
    const submitted = oriented ? decoded.data : bytes;
    return { fileName: image.fileName, mimeType: image.mimeType, width: decoded.info.width, height: decoded.info.height,
      originalWidth: metadata.width, originalHeight: metadata.height, originalSizeBytes: bytes.length, submittedSizeBytes: submitted.length,
      originalSha256: sha256(bytes), submittedSha256: sha256(submitted), url: oriented ? dataUrl(submitted, image.mimeType) : image.imageUrl };
  } catch {
    throw fail(`${label}无法解码，或超出单帧4096px、16MP限制`);
  }
}

function describeSubjects(entries, label) {
  return entries.flatMap((entry, index) => {
    const traits = Object.entries(entry).filter(([, value]) => value)
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
    return traits.length ? [`${label} ${index + 1}: ${traits.join(", ")}.`] : [];
  });
}

function buildPrompt({ cast, references, position, action }) {
  const { people, pets, interaction } = cast;
  const counts = [
    people.length ? `${people.length} ${people.length === 1 ? "person" : "people"}` : "",
    pets.length ? `${pets.length} ${pets.length === 1 ? "pet" : "pets"}` : "",
  ];
  let behavior = "Place the added subjects naturally in the scene.";
  if (interaction === "no") {
    behavior = "Keep the added subjects independent, without deliberate interaction.";
  } else if (people.length && pets.length && (interaction === "yes" || !action)) {
    behavior = "Have the people and pets interact naturally in the scene.";
  } else if (interaction === "yes") {
    behavior = "Show natural interaction with the scene.";
  }
  return [
    `Add ${counts.filter(Boolean).join(" and ")} to image 1.`,
    position ? `Position: ${position}` : null,
    action ? `Action: ${action}` : null,
    ...describeSubjects(people, "Person"),
    ...describeSubjects(pets, "Pet"),
    behavior,
    ...references.map(({ role }, index) => `Use image ${index + 2} only as the identity reference for ${role} 1.`),
    "Preserve the original room design, camera angle and lighting.",
  ].filter(Boolean).join("\n");
}

export async function prepareSceneCastInput(input) {
  checkedObject(input, INPUT_FIELDS, "AI模特输入");
  const { subject, cast } = normalizeCast(input);
  const uploads = referenceUploads(input, subject);
  const modelKey = input.modelKey ?? RELIGHT_MODEL_KEY;
  if (!RELIGHT_MODEL_KEYS.includes(modelKey)) throw fail("请选择支持的GPT图像编辑模型");
  const model = MODEL_CONFIGS[modelKey];
  const resolution = input.resolution ?? DEFAULT_RESOLUTION;
  const quality = input.quality ?? model.defaultQuality;
  const ratio = input.ratio ?? "auto";
  if (!model.qualityOptions.includes(quality)) throw fail("所选GPT模型不支持该质量档");
  if (typeof resolution !== "string" || !Object.hasOwn(Object.values(model.sizes)[0], resolution)) throw fail("请选择1K、2K或4K");
  if (typeof ratio !== "string" || (ratio !== "auto" && !Object.hasOwn(model.sizes, ratio))) throw fail("所选GPT模型不支持该画幅");
  const position = optionalText(input.position, "模特位置");
  const action = optionalText(input.action, "动作与补充要求");
  const [source, ...references] = await Promise.all([decodeInput(input.sourceImage, "场景原图"),
    ...uploads.map(async ({ role, image }) => ({ role, ...await decodeInput(image, REFERENCE_LABELS[role]) }))]);
  if ([source, ...references].reduce((total, image) => total + image.originalSizeBytes, 0) > IMAGE_POLICY.maxTotalBytes) {
    throw fail("场景图和参考图合计不能超过20MiB");
  }
  let size;
  if (ratio === "auto") {
    let target;
    try { target = maskFillGptOutputSize(source, resolution, model.sizes); }
    catch (error) { throw fail(error.message.replace("Sunburst局部重绘", "AI模特")); }
    size = `${target.width}x${target.height}`;
  } else {
    size = model.sizes[ratio][resolution];
  }
  const sourceRender = sourceSnapshot(input.sourceRender, source.originalSha256);
  const prepared = { cast, subject, position, action, modelKey, model, resolution, quality, ratio, size,
    source, references, sourceRender };
  return { ...prepared, prompt: buildPrompt(prepared) };
}

export async function assertSceneCastModelAccess(client, prepared) {
  let catalog;
  try { catalog = await client.listModels(); }
  catch { throw fail("无法读取OneAPI模型权限，请检查连接", 409); }
  if (!hasModel(catalog, prepared.model) || typeof client.editImageAsync !== "function") {
    throw fail("当前OneAPI Key没有所选GPT图像编辑权限", 409);
  }
}

export async function executeSceneCast(prepared, { client, onProgress = () => {} }) {
  const { model, modelKey, source, references, cast, subject, position, action, quality, ratio, resolution,
    size, sourceRender, prompt } = prepared;
  const images = [source, ...references].map(image => ({ image_url: image.url }));
  const startedAt = Date.now();
  onProgress({ phase: "executing", message: `${model.label} 正在将模特融入场景` });
  const generated = await client.editImageAsync({ model: model.id, images, prompt, size, quality, n: 1,
    output_format: "png", response_format: "b64_json" }, {
    onSubmitted({ id, status }) { onProgress({ phase: "executing", message: "AI模特已提交，正在后台生成", upstreamResponseId: id, upstreamStatus: status }); },
  });
  if (generated.images?.length !== 1) throw fail("GPT编辑未返回唯一结果图片", 502);
  const outputBytes = await loadImageBytes(generated.images[0].url);
  let native;
  try {
    const image = sharp(outputBytes, { failOn: "error", limitInputPixels: MASK_FILL_GPT_OUTPUT_LIMITS.maxOutputPixels });
    native = await image.metadata();
    if (native.format !== "png" || (native.pages || 1) !== 1) throw new Error("format");
    await image.stats();
  } catch { throw fail("GPT编辑未返回有效的单帧PNG图片", 502); }
  if (`${native.width}x${native.height}` !== size) throw fail(`GPT编辑返回${native.width}×${native.height}，与请求尺寸${size}不一致`, 502);
  const outputSha256 = sha256(outputBytes);
  const referenceImages = references.map(({ url: unusedUrl, ...receipt }, index) => ({ ...receipt, imageIndex: index + 2 }));
  const reference = referenceImages.length === 1 ? referenceImages[0] : null;
  return { durationMs: Date.now() - startedAt, images: [{ url: dataUrl(outputBytes, "image/png") }],
    request: { model: model.id, modelKey, provider: "oneapi", resolution, quality, ratio, size, subject, position, action,
      cast, referenceSubjects: referenceImages.map(entry => entry.role), referenceSubject: reference?.role ?? null,
      sourceRender, outputFormat: "png", syncMode: "local-only" },
    upstream: { requestId: generated.requestId ?? null, usageCost: generated.usageCost ?? null, transport: generated.transport,
      metadata: { prompt, submittedPromptSha256: sha256(prompt), referenceImageCount: images.length, referenceImages,
        sourceFileName: source.fileName, sourceWidth: source.width, sourceHeight: source.height, sourceSha256: source.originalSha256,
        submittedSourceSha256: source.submittedSha256, referenceFileName: reference?.fileName ?? null,
        referenceWidth: reference?.width ?? null, referenceHeight: reference?.height ?? null, referenceSha256: reference?.originalSha256 ?? null,
        submittedReferenceSha256: reference?.submittedSha256 ?? null, actualOutputWidth: native.width, actualOutputHeight: native.height,
        outputWidth: native.width, outputHeight: native.height, outputSha256 } },
    workflow: WORKFLOW };
}

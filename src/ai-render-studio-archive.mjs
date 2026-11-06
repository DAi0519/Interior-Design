/**
 * [INPUT]: 依赖独立渲染台Prompt、真实光影卡片完整冻结、实际提交Prompt、原图引导图结果SHA及共享飞书配置
 * [OUTPUT]: 含GPT2.6 Sunburst/Flare独立模型身份； 对外提供独立Schema准入、九卡/原光影归档、图片manifest与风格/卡片灯光/Prompt字段投影
 * [POS]: src 的AI渲染台归档合同，不读取旧打光Prompt，不调用模型或写飞书
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { LARK_SYNC_CONFIG } from "./lark-sync.mjs";
import { runLarkCli } from "./lark-cli.mjs";
import { decodeImageDataUrl } from "./image-artifact.mjs";
import { readImageDimensions } from "./image-dimensions.mjs";
import { AI_RENDER_STUDIO_PROMPT_CODE, AI_RENDER_STUDIO_PROMPT_CONFIG, parseAiRenderStudioPrompt } from "./ai-render-studio-prompt.mjs";
import { AI_RENDER_STUDIO_RENDER_STYLES, AI_RENDER_STUDIO_WORKFLOW_VERSION } from "./ai-render-studio-definitions.mjs";
import { MODEL_CONFIGS } from "./model-config.mjs";
import { RELIGHT_MODEL_KEYS } from "../public/image-relight-geometry.js";
import { aiRenderStudioLightingPlan } from "./ai-render-studio-lighting.mjs";

export const AI_RENDER_STUDIO_ARCHIVE_FEATURE_LABEL = "AI渲染台";
export const AI_RENDER_STUDIO_GUIDE_FIELD = "AI渲染台光源标注图";
export const AI_RENDER_STUDIO_ARCHIVE_FIELDS = Object.freeze({
  "AI渲染台任务ID": "text", "AI渲染台渲染风格": "select", "AI渲染台材质策略": "select",
  "AI渲染台光照方案": "select", "AI渲染台光源方案": "text", "AI渲染台原灯处理": "select",
  "AI渲染台Prompt编码": "text", "AI渲染台Prompt版本": "number", "AI渲染台PromptSHA256": "text",
  "AI渲染台Prompt来源": "text", "AI渲染台工作流版本": "text", "AI渲染台计划SHA256": "text",
  [AI_RENDER_STUDIO_GUIDE_FIELD]: "attachment",
});
const commonTypes = { "标题": "text", "功能": "select", "生图模型": "select", "原始 Prompt": "text", "最终 Prompt": "text",
  "生成参数": "text", "尺寸": "text", "耗时（秒）": "number", "状态": "select", "错误信息": "text",
  "参考图": "attachment", "结果图": "attachment" };
const digest = (value) => createHash("sha256").update(value).digest("hex");
const fail = (message) => Object.assign(new Error(message), { statusCode: 409 });
const originalLabels = { keep: "保留", darken: "整体减弱", turnOff: "全部关闭" };
const validSha256 = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const validJobId = (value) => typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_-]{7,159}$/.test(value);

export function assertAiRenderStudioSyncSchema(body, { config = LARK_SYNC_CONFIG, lightingPresetNames = [], modelKey = "gptImage25Sunburst" } = {}) {
  const fields = body?.data?.fields || body?.fields;
  if (body?.ok === false || !Array.isArray(fields) || fields.some((field) => !field || typeof field.name !== "string")
    || body?.data?.has_more || body?.has_more) throw fail("AI渲染台生成记录Schema返回格式不正确或分页不完整");
  const byName = new Map(fields.map((field) => [field.name, field]));
  if (!Array.isArray(lightingPresetNames) || lightingPresetNames.some((name) => typeof name !== "string" || !name.trim())) {
    throw fail("AI渲染台光影卡片归档名称无效");
  }
  const issues = [];
  for (const [name, type] of Object.entries({ ...commonTypes, ...AI_RENDER_STUDIO_ARCHIVE_FIELDS })) {
    const field = byName.get(name);
    if (!field || field.type !== type) issues.push(`“${name}”应为${type}`);
    if (fields.filter((entry) => entry.name === name).length > 1) issues.push(`“${name}”存在重复字段`);
  }
  const options = { "功能": [AI_RENDER_STUDIO_ARCHIVE_FEATURE_LABEL], "生图模型": [MODEL_CONFIGS[modelKey]?.label],
    "状态": ["成功", "同步失败"], "AI渲染台渲染风格": AI_RENDER_STUDIO_RENDER_STYLES.map((entry) => entry.label),
    "AI渲染台材质策略": ["保留原材质"], "AI渲染台光照方案": [...new Set(["原光影/自定义", ...lightingPresetNames])],
    "AI渲染台原灯处理": Object.values(originalLabels) };
  for (const [name, required] of Object.entries(options)) {
    const entries = byName.get(name)?.options;
    const valid = Array.isArray(entries) && entries.every((entry) => typeof entry?.name === "string" && entry.name.trim());
    if (!valid || new Set(entries.map((entry) => entry.name)).size !== entries.length) {
      issues.push(`“${name}”选项名无效或重复`);
    }
    const actual = new Set((Array.isArray(entries) ? entries : []).map((entry) => entry?.name));
    const missing = required.filter((entry) => !actual.has(entry));
    if (missing.length) issues.push(`“${name}”缺少选项${missing.join("、")}`);
  }
  const attachmentFieldIds = {};
  for (const name of ["参考图", "结果图", AI_RENDER_STUDIO_GUIDE_FIELD]) {
    const field = byName.get(name);
    if (typeof field?.id !== "string" || !/^fld[a-zA-Z0-9]+$/.test(field.id) || field.type !== "attachment") issues.push(`“${name}”附件ID无效`);
    else attachmentFieldIds[name] = field.id;
  }
  if (attachmentFieldIds["参考图"] !== config.referenceFieldId || attachmentFieldIds["结果图"] !== config.resultFieldId
    || new Set(Object.values(attachmentFieldIds)).size !== 3) issues.push("AI渲染台附件ID与配置不符或重复");
  if (issues.length) throw fail(`AI渲染台生成记录Schema不兼容：${issues.join("；")}`);
  return { attachmentFieldIds };
}

export async function verifyAiRenderStudioSyncSchema(config = LARK_SYNC_CONFIG, { run = runLarkCli, lightingPresetNames = [], modelKey = "gptImage25Sunburst" } = {}) {
  const body = await run(config, ["base", "+field-list", "--as", "user", "--base-token", config.baseToken,
    "--table-id", config.tableId, "--limit", "200", "--format", "json"]);
  if (body?.data?.has_more) throw fail("AI渲染台字段Schema分页不完整");
  return assertAiRenderStudioSyncSchema(body, { config, lightingPresetNames, modelKey });
}

function lightingPlan(value) {
  let plan;
  if (!value || !Object.hasOwn(value, "lightingPreset") || value.templateKey !== "custom") {
    throw fail("渲染台光源方案必须冻结原光影或真实卡片，不能使用旧打光模板");
  }
  try {
    plan = aiRenderStudioLightingPlan(value);
  } catch { throw fail("渲染台光源方案不是有效的规范化冻结值"); }
  if (!isDeepStrictEqual(plan.lights, value.lights) || !isDeepStrictEqual(plan.originalLights, value.originalLights)
    || !isDeepStrictEqual(plan.lightingPreset, value.lightingPreset)) throw fail("渲染台光源方案必须为规范化冻结值");
  return plan;
}

function imageIdentity(image, expectedSha256, { png = false } = {}) {
  const url = image?.imageUrl || image?.url || "";
  const mimeType = String(url).match(/^data:(image\/(?:png|jpeg|webp));base64,/i)?.[1]?.toLowerCase();
  let bytes;
  try { bytes = decodeImageDataUrl(url); } catch { throw fail("AI渲染台归档图片格式无效"); }
  const dimensions = readImageDimensions(bytes, mimeType);
  if (!mimeType || image?.mimeType !== undefined && image.mimeType !== mimeType || !dimensions || !validSha256(expectedSha256)
    || digest(bytes) !== expectedSha256 || image.size !== undefined && image.size !== bytes.length
    || image.width !== undefined && image.width !== dimensions.width || image.height !== undefined && image.height !== dimensions.height) {
    throw fail("AI渲染台归档图片与真实提交或生成SHA不一致");
  }
  if (png && !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw fail("AI渲染台引导图与结果必须为PNG");
  return { size: bytes.length, sha256: expectedSha256, width: dimensions.width, height: dimensions.height };
}

function assertIdentity(workflow) {
  if (!workflow || typeof workflow !== "object") throw fail("AI渲染台归档缺少实际执行身份");
  const expectedSource = `feishu:${AI_RENDER_STUDIO_PROMPT_CONFIG.tableId}:${AI_RENDER_STUDIO_PROMPT_CODE}@v${workflow.promptVersion}`;
  if (workflow.feature !== "ai-render-studio" || !RELIGHT_MODEL_KEYS.includes(workflow.modelKey)
    || workflow.provider !== "oneapi" || workflow.model !== MODEL_CONFIGS[workflow.modelKey]?.id
    || workflow.promptCode !== AI_RENDER_STUDIO_PROMPT_CODE || workflow.promptSource !== expectedSource
    || !Number.isSafeInteger(workflow.promptVersion) || workflow.promptVersion < 1
    || !validSha256(workflow.promptSha256) || workflow.materialMode !== "faithful"
    || !AI_RENDER_STUDIO_RENDER_STYLES.some((entry) => entry.key === workflow.renderStyle)
    || workflow.workflowVersion !== AI_RENDER_STUDIO_WORKFLOW_VERSION
    || workflow.version !== undefined && workflow.version !== AI_RENDER_STUDIO_WORKFLOW_VERSION
    || Object.hasOwn(workflow, "templateSource")
    || Object.keys(workflow).some((key) => key.startsWith("relightPrompt"))) throw fail("AI渲染台归档身份无效或混入旧打光Prompt身份");
}

export function buildAiRenderStudioArchive({ jobId, prepared, result, guideImage }) {
  if (!prepared?.validated?.source || !prepared.snapshot || !Array.isArray(result?.images) || result.images.length !== 1) {
    throw fail("AI渲染台归档缺少冻结输入或唯一结果");
  }
  const { validated, snapshot } = prepared;
  const metadata = result.upstream?.metadata;
  if (!validJobId(jobId) || typeof metadata?.prompt !== "string" || !metadata.prompt.trim()) throw fail("AI渲染台归档缺少任务ID或实际Prompt");
  assertIdentity(metadata);
  if (snapshot.published !== true || typeof snapshot.prompt !== "string" || digest(snapshot.prompt) !== snapshot.sha256
    || !isDeepStrictEqual(parseAiRenderStudioPrompt(snapshot.prompt), snapshot.bundle)) throw fail("AI渲染台归档Prompt资产快照发生漂移");
  const plan = lightingPlan(validated);
  if (metadata.prompt !== prepared.compiledPrompt || metadata.submittedPromptSha256 !== digest(metadata.prompt)
    || metadata.sourcePrompt !== validated.prompt
    || metadata.promptCode !== snapshot.code || metadata.promptVersion !== snapshot.version
    || metadata.promptSha256 !== snapshot.sha256 || metadata.promptSource !== snapshot.source
    || metadata.renderStyle !== prepared.renderStyle || metadata.materialMode !== prepared.materialMode
    || prepared.renderStyle !== validated.renderStyle || prepared.materialMode !== validated.materialMode
    || metadata.sourceSha256 !== validated.source.originalSha256 || metadata.normalizedSourceSha256 !== validated.source.sha256
    || metadata.outputWidth !== validated.target.width || metadata.outputHeight !== validated.target.height
    || metadata.lightingPlanSha256 !== digest(JSON.stringify(plan))
    || !isDeepStrictEqual(plan, lightingPlan(metadata))
    || plan.lightingPreset && metadata.prompt.split(plan.lightingPreset.prompt).length - 1 !== 1
    || Boolean(guideImage) !== Boolean(plan.lights.length)) throw fail("AI渲染台归档Prompt、风格或光源方案与执行冻结不一致");
  const source = { imageUrl: validated.source.imageUrl, fileName: validated.source.fileName,
    mimeType: validated.source.mimeType, size: validated.source.size };
  const archive = { durationMs: result.durationMs, finalPrompt: metadata.prompt, sourcePrompt: validated.prompt,
    modelLabel: MODEL_CONFIGS[metadata.modelKey].label, preview: { ...result.request, feature: "ai-render-studio", materialMode: prepared.materialMode,
      renderStyle: prepared.renderStyle, syncMode: "lark" },
    referenceImages: [source], ...(guideImage ? { guideImage } : {}), resultImage: result.images[0],
    workflow: { ...metadata, jobId, prompt: metadata.prompt, sourcePrompt: validated.prompt, lightingPlan: plan,
      syncMode: "lark", finalPromptCaptured: true } };
  aiRenderStudioArchiveManifest(archive, decodeImageDataUrl(result.images[0].url));
  return archive;
}

function assertArchiveState(archive) {
  if (!archive || typeof archive !== "object") throw fail("AI渲染台归档参数无效");
  const workflow = archive.workflow;
  assertIdentity(workflow);
  const plan = lightingPlan(workflow);
  const preview = archive.preview;
  if (archive.referenceImages?.length !== 1 || archive.styleReferenceImages?.length || archive.maskImage
    || !validJobId(workflow.jobId) || typeof archive.finalPrompt !== "string" || !archive.finalPrompt.trim()
    || archive.finalPrompt !== workflow.prompt || digest(archive.finalPrompt) !== workflow.submittedPromptSha256
    || typeof archive.sourcePrompt !== "string" || archive.sourcePrompt !== workflow.sourcePrompt
    || workflow.lightingPlanSha256 !== digest(JSON.stringify(plan)) || !isDeepStrictEqual(plan, workflow.lightingPlan)
    || Boolean(archive.guideImage) !== Boolean(plan.lights.length) || workflow.lightCount !== plan.lights.length
    || workflow.referenceImageCount !== (plan.lights.length ? 2 : 1)
    || (plan.lights.length ? !validSha256(workflow.guideSha256) : workflow.guideSha256 !== null)
    || !Number.isFinite(archive.durationMs) || archive.durationMs < 0
    || archive.modelLabel !== MODEL_CONFIGS[workflow.modelKey]?.label || preview?.model !== workflow.model || preview?.modelKey !== workflow.modelKey
    || preview?.provider !== "oneapi" || preview?.feature !== workflow.feature || preview?.outputFormat !== "png"
    || preview?.renderStyle !== workflow.renderStyle || preview?.materialMode !== workflow.materialMode
    || preview?.quality !== workflow.quality || preview?.outputResolution !== workflow.outputResolution
    || preview?.size !== `${workflow.outputWidth}x${workflow.outputHeight}`
    || preview?.referenceImageCount !== workflow.referenceImageCount || preview?.lightCount !== workflow.lightCount) {
    throw fail("AI渲染台写入前归档参数或实际Prompt发生漂移");
  }
  return { workflow, plan };
}

export function aiRenderStudioArchiveManifest(archive, resultBytes) {
  const { workflow } = assertArchiveState(archive);
  if (!Buffer.isBuffer(resultBytes)) throw fail("AI渲染台结果字节无效");
  const source = imageIdentity(archive.referenceImages[0], workflow.normalizedSourceSha256);
  const guide = archive.guideImage ? imageIdentity(archive.guideImage, workflow.guideSha256, { png: true }) : null;
  const output = imageIdentity({ url: `data:image/png;base64,${resultBytes.toString("base64")}` }, workflow.outputSha256, { png: true });
  if (source.width !== workflow.sourceWidth || source.height !== workflow.sourceHeight
    || guide && (guide.width !== source.width || guide.height !== source.height)
    || output.width !== workflow.outputWidth || output.height !== workflow.outputHeight) throw fail("AI渲染台实际图片尺寸与生成回执不一致");
  return { "参考图": [source], "结果图": [output], [AI_RENDER_STUDIO_GUIDE_FIELD]: guide ? [guide] : [] };
}

export function aiRenderStudioRecordFields(archive) {
  const { workflow, plan } = assertArchiveState(archive);
  return { "功能": AI_RENDER_STUDIO_ARCHIVE_FEATURE_LABEL, "AI渲染台任务ID": workflow.jobId,
    "AI渲染台渲染风格": AI_RENDER_STUDIO_RENDER_STYLES.find((entry) => entry.key === workflow.renderStyle).label,
    "AI渲染台材质策略": "保留原材质", "AI渲染台光照方案": plan.lightingPreset?.name || "原光影/自定义",
    "AI渲染台光源方案": JSON.stringify(plan), "AI渲染台原灯处理": plan.originalLights ? originalLabels[plan.originalLights.action] : "保留",
    "AI渲染台Prompt编码": workflow.promptCode, "AI渲染台Prompt版本": workflow.promptVersion,
    "AI渲染台PromptSHA256": workflow.promptSha256, "AI渲染台Prompt来源": workflow.promptSource,
    "AI渲染台工作流版本": workflow.workflowVersion, "AI渲染台计划SHA256": workflow.lightingPlanSha256 };
}

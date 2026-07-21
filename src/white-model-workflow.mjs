/**
 * [INPUT]: 依赖 Style DNA、Prompt Agent 配置、Agent/出图模型白名单、OneAPI 客户端与飞书同步边界
 * [OUTPUT]: 对外提供白模图经 Prompt Agent、Responses 图生图和飞书记录的一次性执行编排
 * [POS]: src 的白模渲染应用服务，只编排既有边界，不在前端泄露 DNA 或 System Prompt
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { agentModelOrThrow } from "./agent-model-config.mjs";
import { syncGenerationToLark } from "./lark-sync.mjs";
import { createGenerationRequest, publicModelCatalog } from "./model-config.mjs";
import { getPublishedPromptAgent } from "./prompt-agent.mjs";
import { normalizeReferenceImages } from "./reference-image.mjs";
import { getPublishedStyle } from "./style-library.mjs";

export const PHOTOGRAPHY_PROFILE =
  "真实室内建筑摄影，24mm 等效焦段，视线高度约 1.5m，自然透视，中性白平衡；真实全局光照与材质纹理，窗景不过曝，避免 HDR、塑料感、夸张景深和过度锐化。";

function workflowError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export function parsePromptAgentOutput(text) {
  const normalized = String(text || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  let payload;
  try {
    payload = JSON.parse(normalized);
  } catch {
    throw workflowError("Prompt Agent 没有返回合法 JSON", 502);
  }

  const visual = payload?.visual_application;
  const required = [
    payload?.scene_preservation,
    visual?.materials,
    visual?.colors,
    visual?.photography,
    payload?.generation_requirement,
    payload?.negative_constraints,
  ];
  if (required.some((value) => typeof value !== "string" || !value.trim())) {
    throw workflowError("Prompt Agent 返回内容缺少必需字段", 502);
  }
  return payload;
}

export function buildPromptAgentInput({ styleDna, userRequirements }) {
  return [
    "请执行白模渲染 Prompt 整合任务。",
    "",
    "style_dna:",
    JSON.stringify(styleDna),
    "",
    "user_requirements:",
    String(userRequirements || "").trim() || "无补充要求",
    "",
    "photography_profile:",
    PHOTOGRAPHY_PROFILE,
  ].join("\n");
}

export async function executeWhiteModelWorkflow(
  input,
  {
    client,
    loadAgent = getPublishedPromptAgent,
    loadStyle = getPublishedStyle,
    sync = syncGenerationToLark,
  },
) {
  if (!client) throw new TypeError("white model workflow requires client");

  const userRequirements = String(input.prompt || "").trim();
  if (userRequirements.length > 8000) {
    throw workflowError("补充要求不能超过 8000 字符");
  }
  const whiteModels = normalizeReferenceImages(input.referenceImages);
  if (whiteModels.length !== 1) {
    throw workflowError("白模渲染需要且只允许 1 张白模图");
  }
  const promptModel = agentModelOrThrow(input.promptAgentModelKey);
  const [style, agent] = await Promise.all([
    loadStyle(input.styleCode),
    loadAgent("white-model-fusion"),
  ]);
  if (
    input.styleVersion != null &&
    Number(input.styleVersion) !== Number(style.version)
  ) {
    throw workflowError("所选 Style DNA 版本已更新，请刷新页面后重试", 409);
  }
  const availableModels = await client.listModels();
  const availableIds = new Set(
    availableModels.map((model) => model.id || model.name).filter(Boolean),
  );
  if (!availableIds.has(promptModel.id)) {
    throw workflowError(`${promptModel.label} 当前未向这个 API Key 开放`, 409);
  }

  const startedAt = Date.now();
  const promptStartedAt = Date.now();
  const promptResult = await client.generatePrompt({
    imageUrl: whiteModels[0].imageUrl,
    model: promptModel.id,
    systemPrompt: agent.systemPrompt,
    userPrompt: buildPromptAgentInput({
      styleDna: style.styleDna,
      userRequirements,
    }),
  });
  const promptDurationMs = Date.now() - promptStartedAt;
  const promptPayload = parsePromptAgentOutput(promptResult.text);
  const finalPrompt = JSON.stringify(promptPayload, null, 2);
  const generation = createGenerationRequest({ ...input, prompt: finalPrompt });
  const imageStartedAt = Date.now();
  const result = await client.generateImage(generation.request);
  const imageDurationMs = Date.now() - imageStartedAt;
  const durationMs = Date.now() - startedAt;
  const preview = {
    ...generation.preview,
    quality: result.quality ?? null,
    transport: result.transport || "responses",
  };
  const imageModel = publicModelCatalog().find(
    (entry) => entry.key === String(input.modelKey || ""),
  );
  const referenceImages = generation.request.images.map((image, index) => ({
    fileName: generation.preview.referenceImages[index]?.fileName,
    imageUrl: image.image_url,
    mimeType: generation.preview.referenceImages[index]?.mimeType,
  }));
  const workflow = {
    agentCode: agent.code,
    agentModel: promptModel.id,
    agentVersion: agent.version,
    feature: "white-model-rendering",
    promptDurationMs,
    sourceRequirements: userRequirements,
    styleCode: style.code,
    styleName: style.name,
    styleVersion: style.version,
  };
  const lark = await sync({
    durationMs,
    modelLabel: imageModel.label,
    preview,
    prompt: finalPrompt,
    referenceImages,
    resultImage: result.images[0],
    revisedPrompt: result.images[0].revisedPrompt,
    workflow,
  });

  return {
    durationMs,
    images: result.images,
    promptAgent: {
      durationMs: promptDurationMs,
      model: promptModel.id,
      name: agent.name,
      version: agent.version,
    },
    request: preview,
    style: { code: style.code, name: style.name, version: style.version },
    sync: lark,
    upstream: {
      created: result.created,
      imageDurationMs,
      outputFormat: result.outputFormat,
      transport: result.transport || "responses",
    },
  };
}

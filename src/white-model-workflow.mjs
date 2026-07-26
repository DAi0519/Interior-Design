/**
 * [INPUT]: 依赖 Style DNA、Prompt Agent 配置、Agent/出图模型白名单、OneAPI 客户端与后台同步调度器
 * [OUTPUT]: 对外提供版本化 Style DNA 编码经 Prompt Agent、Responses 图生图并非阻塞归档的执行编排
 * [POS]: src 的设计模型渲染应用服务，按飞书 v2 输出契约校验并隔离配置、生成与归档耗时
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { agentModelOrThrow } from "./agent-model-config.mjs";
import { createGenerationRequest, publicModelCatalog } from "./model-config.mjs";
import { getPublishedPromptAgent } from "./prompt-agent.mjs";
import { normalizeReferenceImages } from "./reference-image.mjs";
import { getPublishedStyle } from "./style-library.mjs";

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
  ];
  if (required.some((value) => typeof value !== "string" || !value.trim())) {
    throw workflowError("Prompt Agent 返回内容缺少必需字段", 502);
  }
  return payload;
}

export function buildPromptAgentInput({ styleDna, userRequirements }) {
  return [
    "请执行设计模型渲染 Prompt 整合任务。",
    "",
    "style_dna:",
    JSON.stringify(styleDna),
    "",
    "user_requirements:",
    String(userRequirements || "").trim() || "无补充要求",
  ].join("\n");
}

export async function executeWhiteModelWorkflow(
  input,
  {
    availableModels = null,
    client,
    loadAgent = getPublishedPromptAgent,
    loadStyle = getPublishedStyle,
    refreshModels = null,
    scheduleSync = null,
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
  let modelCatalog = availableModels || (await client.listModels());
  let availableIds = new Set(
    modelCatalog.map((model) => model.id || model.name).filter(Boolean),
  );
  if (!availableIds.has(promptModel.id) && refreshModels) {
    modelCatalog = await refreshModels();
    availableIds = new Set(
      modelCatalog.map((model) => model.id || model.name).filter(Boolean),
    );
  }
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
    quality: result.quality ?? generation.preview.quality,
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
    imageDurationMs,
    promptDurationMs,
    styleCode: style.code,
    styleName: style.name,
    styleVersion: style.version,
  };
  const syncInput = {
    durationMs,
    finalPrompt,
    modelLabel: imageModel.label,
    preview,
    referenceImages,
    resultImage: result.images[0],
    sourcePrompt: userRequirements,
    workflow,
  };
  const sync = scheduleSync
    ? scheduleSync(syncInput)
    : { generationId: null, status: "skipped" };

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
    sync,
    upstream: {
      created: result.created,
      imageDurationMs,
      outputFormat: result.outputFormat,
      transport: result.transport || "responses",
    },
  };
}

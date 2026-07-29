/**
 * [INPUT]: 依赖 Style DNA、Prompt Agent 配置、出图模型合法比例矩阵、可信参考图宽高、可选提示词结果缓存、OneAPI 客户端与后台同步调度器
 * [OUTPUT]: 对外提供 Prompt 解析、相同融合条件提示词复用/显式重算、版本化 Style DNA 编排、原图最近合法比例出图及非阻塞归档
 * [POS]: src 的设计模型渲染应用服务，优先保持白模画幅并允许显式手动覆盖
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createHash } from "node:crypto";

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

function promptResultCacheKey({
  agent,
  promptModel,
  style,
  userRequirements,
  whiteModel,
}) {
  const hash = createHash("sha256");
  const parts = [
    agent.code,
    agent.version,
    agent.systemPrompt,
    promptModel.id,
    style.code,
    style.version,
    JSON.stringify(style.styleDna),
    userRequirements,
    whiteModel.imageUrl,
    whiteModel.width,
    whiteModel.height,
  ];
  for (const part of parts) {
    hash.update(String(part ?? ""));
    hash.update("\0");
  }
  return hash.digest("hex");
}

export async function executeWhiteModelWorkflow(
  input,
  {
    availableModels = null,
    client,
    loadAgent = getPublishedPromptAgent,
    loadStyle = getPublishedStyle,
    promptResultCache = null,
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
  const forcePromptRegeneration = input.forcePromptRegeneration === true;
  const [style, agent] = await Promise.all([
    loadStyle(input.styleCode),
    loadAgent("white-model-fusion", {
      version: input.promptAgentVersion,
    }),
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
  let promptGenerated = false;
  const generateFinalPrompt = async () => {
    promptGenerated = true;
    const promptResult = await client.generatePrompt({
      imageUrl: whiteModels[0].imageUrl,
      model: promptModel.id,
      systemPrompt: agent.systemPrompt,
      userPrompt: buildPromptAgentInput({
        styleDna: style.styleDna,
        userRequirements,
      }),
    });
    return JSON.stringify(parsePromptAgentOutput(promptResult.text), null, 2);
  };
  const finalPrompt = promptResultCache
    ? await promptResultCache.get(
        promptResultCacheKey({
          agent,
          promptModel,
          style,
          userRequirements,
          whiteModel: whiteModels[0],
        }),
        generateFinalPrompt,
        { force: forcePromptRegeneration },
      )
    : await generateFinalPrompt();
  const promptDurationMs = Date.now() - promptStartedAt;
  const promptReused = Boolean(promptResultCache && !promptGenerated);
  const generation = createGenerationRequest(
    {
      ...input,
      prompt: finalPrompt,
    },
    {
      preferSourceAspect: input.ratioMode !== "manual",
      sourceDimensions: {
        height: whiteModels[0].height,
        width: whiteModels[0].width,
      },
    },
  );
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
    agentModelLabel: promptModel.label,
    agentVersion: agent.version,
    feature: "white-model-rendering",
    imageDurationMs,
    promptDurationMs,
    promptReused,
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
      reused: promptReused,
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

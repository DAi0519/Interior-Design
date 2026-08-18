/**
 * [INPUT]: 依赖智能默认/Style DNA 两类 Prompt Agent 配置、双 Provider 出图模型矩阵、可信参考图宽高、批次元数据、提示词缓存、OneAPI Prompt 客户端与可独立注入的图像客户端
 * [OUTPUT]: 对外提供智能默认/固定风格 Prompt 路由、支持智能默认省略重复生成要求的严格解析/复用、单次或多模型批次中的 OneAPI/ComfyUI 出图及带 Provider 元数据的非阻塞归档
 * [POS]: src 的设计模型渲染应用服务，只在 Prompt 阶段分流并统一复用最终出图、画幅和归档链路
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createHash } from "node:crypto";

import { agentModelOrThrow } from "./agent-model-config.mjs";
import { normalizeGenerationBatch } from "./generation-batch.mjs";
import { createGenerationRequest, publicModelCatalog } from "./model-config.mjs";
import { getPublishedPromptAgent } from "./prompt-agent.mjs";
import { normalizeReferenceImages } from "./reference-image.mjs";
import { getPublishedStyle } from "./style-library.mjs";

export const SMART_DEFAULT_RENDER_MODE = "smart-default";
export const STYLE_DNA_RENDER_MODE = "style-dna";
export const WHITE_MODEL_PHOTOGRAPHY_PROFILE = [
  "保留输入机位、视角、透视和等效焦段。",
  "使用大景深、中性白平衡、准确曝光与色彩、自然动态范围、柔和高光、层次清晰的阴影和克制后期。",
  "不得使用油腻 HDR、过曝窗景、夸张浅景深、虚假镜面或新增广角畸变。",
].join("");

function workflowError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export function parsePromptAgentOutput(text, { strict = false } = {}) {
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
  const hasGenerationRequirement = Object.hasOwn(
    payload ?? {},
    "generation_requirement",
  );
  const required = [
    ...(strict ? [payload?.scene_preservation] : []),
    visual?.materials,
    visual?.colors,
    visual?.photography,
    ...(!strict || hasGenerationRequirement
      ? [payload?.generation_requirement]
      : []),
  ];
  if (required.some((value) => typeof value !== "string" || !value.trim())) {
    throw workflowError("Prompt Agent 返回内容缺少必需字段", 502);
  }
  if (strict) {
    const rootFields = Object.keys(payload || {}).sort();
    const visualFields = Object.keys(visual || {}).sort();
    const allowedRootFields = [
      ["scene_preservation", "visual_application"],
      [
        "generation_requirement",
        "scene_preservation",
        "visual_application",
      ],
    ];
    if (
      !allowedRootFields.some(
        (fields) => JSON.stringify(rootFields) === JSON.stringify(fields),
      )
      || JSON.stringify(visualFields) !== JSON.stringify([
        "colors",
        "materials",
        "photography",
      ])
    ) {
      throw workflowError("智能默认 Agent 返回了合同外字段", 502);
    }
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

export function buildSmartDefaultPromptAgentInput({
  photographyProfile = WHITE_MODEL_PHOTOGRAPHY_PROFILE,
  userRequirements,
}) {
  return [
    "请执行白模智能默认材质化任务。",
    "",
    "render_mode:",
    SMART_DEFAULT_RENDER_MODE,
    "",
    "user_requirements:",
    String(userRequirements || "").trim() || "无补充要求",
    "",
    "photography_profile:",
    photographyProfile,
  ].join("\n");
}

function normalizeRenderMode(input) {
  const requested = String(input.renderMode || "").trim();
  if (!requested) return STYLE_DNA_RENDER_MODE;
  if ([SMART_DEFAULT_RENDER_MODE, STYLE_DNA_RENDER_MODE].includes(requested)) {
    return requested;
  }
  throw workflowError("白模渲染方式不受支持");
}

function promptResultCacheKey({
  agent,
  promptModel,
  renderMode,
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
    renderMode,
    style?.code,
    style?.version,
    JSON.stringify(style?.styleDna || null),
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
    imageClient = client,
    loadAgent = getPublishedPromptAgent,
    loadStyle = getPublishedStyle,
    promptResultCache = null,
    refreshModels = null,
    scheduleSync = null,
  },
) {
  if (!client) throw new TypeError("white model workflow requires client");
  if (!imageClient) {
    throw new TypeError("white model workflow requires image client");
  }

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
  const renderMode = normalizeRenderMode(input);
  const smartDefault = renderMode === SMART_DEFAULT_RENDER_MODE;
  const [style, agent] = smartDefault
    ? [
        null,
        await loadAgent("white-model-smart-default", {
          version: input.smartDefaultAgentVersion,
        }),
      ]
    : await Promise.all([
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
      userPrompt: smartDefault
        ? buildSmartDefaultPromptAgentInput({ userRequirements })
        : buildPromptAgentInput({
            styleDna: style.styleDna,
            userRequirements,
          }),
    });
    return JSON.stringify(
      parsePromptAgentOutput(promptResult.text, { strict: smartDefault }),
      null,
      2,
    );
  };
  const finalPrompt = promptResultCache
    ? await promptResultCache.get(
        promptResultCacheKey({
          agent,
          promptModel,
          renderMode,
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
  const result = await imageClient.generateImage(generation.request);
  const imageDurationMs = Date.now() - imageStartedAt;
  const durationMs = Date.now() - startedAt;
  const preview = {
    ...generation.preview,
    provider: generation.provider,
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
    ...normalizeGenerationBatch(input),
    agentCode: agent.code,
    agentModel: promptModel.id,
    agentModelLabel: promptModel.label,
    agentVersion: agent.version,
    feature: "white-model-rendering",
    imageDurationMs,
    provider: generation.provider,
    promptDurationMs,
    promptReused,
    renderMode,
    selectionName: smartDefault ? "智能默认" : style.name,
    ...(style
      ? {
          styleCode: style.code,
          styleName: style.name,
          styleVersion: style.version,
        }
      : {}),
    ...(result.metadata || {}),
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
    renderMode,
    request: preview,
    style: style
      ? { code: style.code, name: style.name, version: style.version }
      : null,
    sync,
    upstream: {
      created: result.created,
      imageDurationMs,
      metadata: result.metadata || null,
      outputFormat: result.outputFormat,
      transport: result.transport || "responses",
    },
  };
}

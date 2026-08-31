/**
 * [INPUT]: 依赖白模与空房双模式的独立 Prompt Agent 配置、空房必填房间类型及“其他”详情、Style DNA、必填主图与仅智能默认可用的风格参考图、可选 Flux 负向 Prompt、双 Provider 出图矩阵、批次元数据、提示词缓存、OneAPI Prompt 客户端与可独立注入的图像客户端
 * [OUTPUT]: 对外提供白模/空房按智能默认或平台融合 Agent 分流、空房房间类型/其他详情校验与注入、严格解析/缓存隔离、最终模型仅接收主图及带 Provider 元数据的非阻塞归档
 * [POS]: src 的设计模型渲染应用服务，在 Prompt 阶段按功能与模式选择稳定 Agent，再统一复用最终出图、画幅和归档链路
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createHash } from "node:crypto";

import { agentModelOrThrow } from "./agent-model-config.mjs";
import {
  EMPTY_ROOM_TYPE_DETAIL_MAX_LENGTH,
  normalizeEmptyRoomType,
  normalizeEmptyRoomTypeDetail,
} from "./empty-room-type.mjs";
import { normalizeGenerationBatch } from "./generation-batch.mjs";
import { createGenerationRequest, publicModelCatalog } from "./model-config.mjs";
import {
  EMPTY_ROOM_PROMPT_CONFIG,
  getPublishedPromptAgent,
} from "./prompt-agent.mjs";
import { normalizeReferenceImages } from "./reference-image.mjs";
import { getPublishedStyle } from "./style-library.mjs";

export const SMART_DEFAULT_RENDER_MODE = "smart-default";
export const STYLE_DNA_RENDER_MODE = "style-dna";
export const EMPTY_ROOM_FEATURE_MODE = "emptyRoom";
export const WHITE_MODEL_FEATURE_MODE = "whiteModel";

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

function styleReferenceContract(hasStyleReference) {
  if (!hasStyleReference) return [];
  return [
    "",
    "input_image_roles:",
    "图片 1 是白模图，是空间、建筑、家具、物体位置、机位、透视和构图的唯一事实来源。",
    "图片 2 是风格参考图，只提取可迁移的材质、颜色关系、表面处理、家具造型语言、软装气质和灯光氛围。",
    "不得迁移图片 2 的房型、家具清单、物体位置、镜头或构图。",
    "冲突优先级：白模可见空间事实 > 用户明确要求 > 风格参考图 > Style DNA 或系统默认值。",
    "继续按既有 JSON Schema 输出，不增加分析、图片描述或合同外字段。",
  ];
}

export function buildPromptAgentInput({
  hasStyleReference = false,
  styleDna,
  userRequirements,
}) {
  return [
    "请执行设计模型渲染 Prompt 整合任务。",
    "",
    "style_dna:",
    JSON.stringify(styleDna),
    "",
    "user_requirements:",
    String(userRequirements || "").trim() || "无补充要求",
    ...styleReferenceContract(hasStyleReference),
  ].join("\n");
}

export function buildSmartDefaultPromptAgentInput({
  hasStyleReference = false,
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
    ...styleReferenceContract(hasStyleReference),
  ].join("\n");
}

export function buildEmptyRoomSmartDefaultPromptAgentInput({
  hasStyleReference = false,
  roomType,
  roomTypeDetail,
  userRequirements,
}) {
  return [
    "请执行空房智能默认设计任务。",
    "",
    "room_type:",
    String(roomType || "").trim(),
    "",
    "room_type_detail:",
    String(roomTypeDetail || "").trim() || "不适用",
    "",
    "style_reference_present:",
    hasStyleReference ? "true" : "false",
    "",
    "user_requirements:",
    String(userRequirements || "").trim() || "无补充要求",
  ].join("\n");
}

export function buildEmptyRoomFusionPromptAgentInput({
  roomType,
  roomTypeDetail,
  styleDna,
  userRequirements,
}) {
  return [
    "请执行空房平台风格融合任务。",
    "",
    "room_type:",
    String(roomType || "").trim(),
    "",
    "room_type_detail:",
    String(roomTypeDetail || "").trim() || "不适用",
    "",
    "style_dna:",
    JSON.stringify(styleDna),
    "",
    "user_requirements:",
    String(userRequirements || "").trim() || "无补充要求",
  ].join("\n");
}

function normalizeFeatureMode(input) {
  const requested = String(input.featureMode || WHITE_MODEL_FEATURE_MODE).trim();
  if ([WHITE_MODEL_FEATURE_MODE, EMPTY_ROOM_FEATURE_MODE].includes(requested)) {
    return requested;
  }
  throw workflowError("设计功能不受支持");
}

function normalizeRenderMode(input) {
  const requested = String(input.renderMode || "").trim();
  if (!requested) return STYLE_DNA_RENDER_MODE;
  if ([SMART_DEFAULT_RENDER_MODE, STYLE_DNA_RENDER_MODE].includes(requested)) {
    return requested;
  }
  throw workflowError("设计渲染方式不受支持");
}

function promptResultCacheKey({
  agent,
  featureMode,
  promptModel,
  renderMode,
  roomType,
  roomTypeDetail,
  style,
  styleReference,
  userRequirements,
  whiteModel,
}) {
  const hash = createHash("sha256");
  const parts = [
    agent.code,
    agent.version,
    agent.systemPrompt,
    featureMode,
    promptModel.id,
    renderMode,
    roomType,
    roomTypeDetail,
    style?.code,
    style?.version,
    JSON.stringify(style?.styleDna || null),
    userRequirements,
    whiteModel.imageUrl,
    whiteModel.width,
    whiteModel.height,
    styleReference?.imageUrl,
    styleReference?.width,
    styleReference?.height,
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
  if (!client) throw new TypeError("design model workflow requires client");
  if (!imageClient) {
    throw new TypeError("design model workflow requires image client");
  }

  const userRequirements = String(input.prompt || "").trim();
  if (userRequirements.length > 8000) {
    throw workflowError("补充要求不能超过 8000 字符");
  }
  const featureMode = normalizeFeatureMode(input);
  const emptyRoom = featureMode === EMPTY_ROOM_FEATURE_MODE;
  const roomType = emptyRoom ? normalizeEmptyRoomType(input.roomType) : null;
  if (emptyRoom && !String(input.roomType || "").trim()) {
    throw workflowError("空房设计必须选择房间类型");
  }
  if (emptyRoom && !roomType) throw workflowError("空房房间类型不受支持");
  const normalizedRoomTypeDetail = normalizeEmptyRoomTypeDetail(
    input.roomTypeDetail,
  );
  if (
    emptyRoom && roomType === "其他" && !normalizedRoomTypeDetail
  ) {
    throw workflowError("选择其他时必须填写具体空间类型");
  }
  if (
    emptyRoom && roomType === "其他"
    && normalizedRoomTypeDetail.length > EMPTY_ROOM_TYPE_DETAIL_MAX_LENGTH
  ) {
    throw workflowError(
      `具体空间类型不能超过 ${EMPTY_ROOM_TYPE_DETAIL_MAX_LENGTH} 个字符`,
    );
  }
  const roomTypeDetail = emptyRoom && roomType === "其他"
    ? normalizedRoomTypeDetail
    : null;
  const sourceImages = normalizeReferenceImages(input.referenceImages);
  if (sourceImages.length !== 1) {
    throw workflowError(
      emptyRoom
        ? "空房设计需要且只允许 1 张空房图"
        : "白模渲染需要且只允许 1 张白模图",
    );
  }
  const styleReferences = normalizeReferenceImages(input.styleReferenceImages, {
    maxCount: 1,
  });
  const promptModel = agentModelOrThrow(input.promptAgentModelKey);
  const forcePromptRegeneration = input.forcePromptRegeneration === true;
  const renderMode = normalizeRenderMode(input);
  const smartDefault = renderMode === SMART_DEFAULT_RENDER_MODE;
  if (emptyRoom && !smartDefault && styleReferences.length > 0) {
    throw workflowError("空房平台风格模式不接收风格参考图，请改用智能默认");
  }
  let style = null;
  let agent;
  if (emptyRoom) {
    if (smartDefault) {
      agent = await loadAgent("empty-room-smart-default", {
        config: EMPTY_ROOM_PROMPT_CONFIG,
        version: input.emptyRoomSmartDefaultVersion,
      });
    } else {
      [style, agent] = await Promise.all([
        loadStyle(input.styleCode),
        loadAgent("empty-room-fusion", {
          config: EMPTY_ROOM_PROMPT_CONFIG,
          version: input.emptyRoomPromptAgentVersion,
        }),
      ]);
    }
  } else if (smartDefault) {
    agent = await loadAgent("white-model-smart-default", {
      version: input.smartDefaultAgentVersion,
    });
  } else {
    [style, agent] = await Promise.all([
      loadStyle(input.styleCode),
      loadAgent("white-model-fusion", {
        version: input.promptAgentVersion,
      }),
    ]);
  }
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
      ...(styleReferences.length > 0
        ? {
            imageUrls: [
              sourceImages[0].imageUrl,
              styleReferences[0].imageUrl,
            ],
          }
        : { imageUrl: sourceImages[0].imageUrl }),
      model: promptModel.id,
      systemPrompt: agent.systemPrompt,
      userPrompt: emptyRoom
        ? smartDefault
          ? buildEmptyRoomSmartDefaultPromptAgentInput({
              hasStyleReference: styleReferences.length > 0,
              roomType,
              roomTypeDetail,
              userRequirements,
            })
          : buildEmptyRoomFusionPromptAgentInput({
              roomType,
              roomTypeDetail,
              styleDna: style.styleDna,
              userRequirements,
            })
        : smartDefault
          ? buildSmartDefaultPromptAgentInput({
              hasStyleReference: styleReferences.length > 0,
              userRequirements,
            })
          : buildPromptAgentInput({
              hasStyleReference: styleReferences.length > 0,
              styleDna: style.styleDna,
              userRequirements,
            }),
    });
    return JSON.stringify(
      parsePromptAgentOutput(promptResult.text, {
        strict: smartDefault || emptyRoom,
      }),
      null,
      2,
    );
  };
  const finalPrompt = promptResultCache
    ? await promptResultCache.get(
        promptResultCacheKey({
          agent,
          featureMode,
          promptModel,
          renderMode,
          roomType,
          roomTypeDetail,
          style,
          styleReference: styleReferences[0],
          userRequirements,
          whiteModel: sourceImages[0],
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
        height: sourceImages[0].height,
        width: sourceImages[0].width,
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
  const styleReferenceImages = styleReferences.map((image) => ({
    fileName: image.fileName,
    imageUrl: image.imageUrl,
    mimeType: image.mimeType,
  }));
  const workflow = {
    ...normalizeGenerationBatch(input),
    agentCode: agent.code,
    agentModel: promptModel.id,
    agentModelLabel: promptModel.label,
    agentVersion: agent.version,
    feature: emptyRoom ? "empty-room-design" : "white-model-rendering",
    imageDurationMs,
    provider: generation.provider,
    promptDurationMs,
    promptReused,
    renderMode,
    ...(roomType ? { roomType } : {}),
    ...(roomTypeDetail ? { roomTypeDetail } : {}),
    selectionName: smartDefault ? "智能默认" : style.name,
    styleReferenceUsed: styleReferences.length > 0,
    ...(generation.workflowMetadata || {}),
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
    styleReferenceImages,
    workflow,
  };
  const sync = scheduleSync
    ? scheduleSync(syncInput)
    : { generationId: null, status: "skipped" };

  return {
    durationMs,
    featureMode,
    images: result.images,
    promptAgent: {
      durationMs: promptDurationMs,
      inputImageCount: 1 + styleReferences.length,
      model: promptModel.id,
      name: agent.name,
      reused: promptReused,
      version: agent.version,
    },
    renderMode,
    roomType,
    roomTypeDetail,
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

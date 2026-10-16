/**
 * [INPUT]: 依赖白模/空房/风格转换的独立 Prompt Agent 配置、空房必填房间类型、“其他”详情及最终家具选择、Style DNA、必填主图与可选风格参考图、可选 Flux 负向 Prompt、双 Provider 出图矩阵、批次元数据、提示词缓存、OneAPI Prompt 客户端与可独立注入的图像客户端
 * [OUTPUT]: 对外提供白模/空房智能默认或平台融合、日常及 Beta 共用的风格转换显式来源/冻结版本校验与独立 Agent 分流，空房类型/家具校验及需求注入、风格转换空间保护/来源互斥、按功能隔离的缓存和响应/归档、最终模型仅接收主图
 * [POS]: src 的设计模型渲染应用服务，在 Prompt 阶段按功能与模式选择稳定 Agent，再统一复用最终出图、画幅和归档链路
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createHash } from "node:crypto";

import { agentModelOrThrow } from "./agent-model-config.mjs";
import { furniturePromptInput, normalizeFurnitureSelection } from "./empty-room-furniture.mjs";
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
  STYLE_TRANSFER_PROMPT_CONFIG,
} from "./prompt-agent.mjs";
import { normalizeReferenceImages } from "./reference-image.mjs";
import { getPublishedStyle } from "./style-library.mjs";

export const SMART_DEFAULT_RENDER_MODE = "smart-default";
export const STYLE_DNA_RENDER_MODE = "style-dna";
export const STYLE_REFERENCE_RENDER_MODE = "style-reference";
export const EMPTY_ROOM_FEATURE_MODE = "emptyRoom";
export const WHITE_MODEL_FEATURE_MODE = "whiteModel";
export const STYLE_TRANSFER_FEATURE_MODE = "styleTransfer";

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
  furnitureSelection,
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
    ...furniturePromptInput(furnitureSelection),
    "",
    "style_reference_present:",
    hasStyleReference ? "true" : "false",
    "",
    "user_requirements:",
    String(userRequirements || "").trim() || "无补充要求",
  ].join("\n");
}

export function buildEmptyRoomFusionPromptAgentInput({
  furnitureSelection,
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
    ...furniturePromptInput(furnitureSelection),
    "",
    "style_dna:",
    JSON.stringify(styleDna),
    "",
    "user_requirements:",
    String(userRequirements || "").trim() || "无补充要求",
  ].join("\n");
}

export function buildStyleTransferPromptAgentInput({
  hasStyleReference = false,
  renderMode,
  styleDna = null,
  userRequirements,
}) {
  return [
    "请执行空间图风格转换任务。",
    "",
    "feature_mode:",
    STYLE_TRANSFER_FEATURE_MODE,
    "",
    "render_mode:",
    renderMode,
    "",
    "input_image_roles:",
    "图片 1 是用户上传的空间图，是空间结构、门窗位置、机位、透视、构图、功能分区及主要家具位置的唯一事实来源。",
    "严格保留图片 1 的空间结构、视角和布局；转换材质、色彩、家具造型、软装及灯光风格，不移动或新增门窗，不重排主要家具。",
    ...(hasStyleReference ? [
      "图片 2 是风格参考图，只提取可迁移的材质、颜色关系、家具造型语言、软装气质和灯光氛围；不得迁移其空间结构、物件位置、镜头或构图。",
      "冲突优先级：图片 1 的空间事实 > 用户明确要求 > 图片 2 的风格。",
    ] : ["冲突优先级：图片 1 的空间事实 > 用户明确要求 > 用户所选平台 Style DNA。"]),
    "",
    "style_reference_present:",
    hasStyleReference ? "true" : "false",
    ...(styleDna ? ["", "style_dna:", JSON.stringify(styleDna)] : []),
    "",
    "user_requirements:",
    String(userRequirements || "").trim() || "无补充要求",
    "",
    "严格按既定 JSON Schema 输出，所有字符串值使用英文，不增加分析或合同外字段。",
  ].join("\n");
}

function normalizeFeatureMode(input) {
  const requested = String(input.featureMode || WHITE_MODEL_FEATURE_MODE).trim();
  if ([WHITE_MODEL_FEATURE_MODE, EMPTY_ROOM_FEATURE_MODE, STYLE_TRANSFER_FEATURE_MODE].includes(requested)) {
    return requested;
  }
  throw workflowError("设计功能不受支持");
}

function normalizeRenderMode(input, featureMode) {
  const requested = String(input.renderMode || "").trim();
  if (featureMode === STYLE_TRANSFER_FEATURE_MODE) {
    if (requested === SMART_DEFAULT_RENDER_MODE) {
      throw workflowError("风格转换不支持智能默认，请选择平台风格或上传风格参考图");
    }
    if (![STYLE_DNA_RENDER_MODE, STYLE_REFERENCE_RENDER_MODE].includes(requested)) {
      throw workflowError("风格转换必须选择平台风格或上传风格参考图");
    }
    return requested;
  }
  if (!requested) return STYLE_DNA_RENDER_MODE;
  if ([SMART_DEFAULT_RENDER_MODE, STYLE_DNA_RENDER_MODE].includes(requested)) {
    return requested;
  }
  throw workflowError("设计渲染方式不受支持");
}

export function normalizeStyleTransferSelection(input, { styleReferenceCount = null, requireVersion = false } = {}) {
  const renderMode = normalizeRenderMode(input, STYLE_TRANSFER_FEATURE_MODE);
  const referenceMode = renderMode === STYLE_REFERENCE_RENDER_MODE;
  const referenceCount = styleReferenceCount ?? normalizeReferenceImages(input.styleReferenceImages, { maxCount: 1 }).length;
  if (referenceMode && referenceCount !== 1) {
    throw workflowError("风格转换参考图模式必须上传 1 张风格参考图");
  }
  if (!referenceMode && referenceCount > 0) {
    throw workflowError("风格转换平台风格模式不接收风格参考图，请改用参考图模式");
  }
  if (!referenceMode && !String(input.styleCode || "").trim()) {
    throw workflowError("风格转换必须选择一个平台风格");
  }
  const versionField = referenceMode ? "styleTransferReferenceVersion" : "styleTransferPromptAgentVersion";
  const version = requireVersion ? Number(input[versionField]) : input[versionField];
  if (requireVersion && (!Number.isInteger(version) || version < 1)) {
    throw workflowError(`请先读取可用的风格转换${referenceMode ? "参考图" : "平台风格"} Prompt 版本`);
  }
  return { renderMode, version, versionField };
}

function promptResultCacheKey({
  agent,
  featureMode,
  furnitureSelection,
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
    JSON.stringify(furnitureSelection || null),
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
  const styleTransfer = featureMode === STYLE_TRANSFER_FEATURE_MODE;
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
  const furnitureSelection = emptyRoom
    ? normalizeFurnitureSelection(input.furnitureSelection, roomType) : null;
  const sourceImages = normalizeReferenceImages(input.referenceImages);
  if (sourceImages.length !== 1) {
    throw workflowError(
      emptyRoom
        ? "空房设计需要且只允许 1 张空房图"
        : styleTransfer
          ? "风格转换需要且只允许 1 张空间图"
          : "白模渲染需要且只允许 1 张白模图",
    );
  }
  const styleReferences = normalizeReferenceImages(input.styleReferenceImages, {
    maxCount: 1,
  });
  const promptModel = agentModelOrThrow(input.promptAgentModelKey);
  const forcePromptRegeneration = input.forcePromptRegeneration === true;
  const renderMode = styleTransfer
    ? normalizeStyleTransferSelection(input, { styleReferenceCount: styleReferences.length }).renderMode
    : normalizeRenderMode(input, featureMode);
  const smartDefault = renderMode === SMART_DEFAULT_RENDER_MODE;
  const styleReference = renderMode === STYLE_REFERENCE_RENDER_MODE;
  if (emptyRoom && !smartDefault && styleReferences.length > 0) {
    throw workflowError("空房平台风格模式不接收风格参考图，请改用智能默认");
  }
  let style = null;
  let agent;
  if (styleTransfer) {
    if (styleReference) {
      agent = await loadAgent("style-transfer-reference", {
        config: STYLE_TRANSFER_PROMPT_CONFIG,
        version: input.styleTransferReferenceVersion,
      });
    } else {
      [style, agent] = await Promise.all([
        loadStyle(input.styleCode),
        loadAgent("style-transfer-fusion", {
          config: STYLE_TRANSFER_PROMPT_CONFIG,
          version: input.styleTransferPromptAgentVersion,
        }),
      ]);
    }
  } else if (emptyRoom) {
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
      userPrompt: styleTransfer
        ? buildStyleTransferPromptAgentInput({
            hasStyleReference: styleReferences.length > 0,
            renderMode,
            styleDna: style?.styleDna,
            userRequirements,
          })
        : emptyRoom
        ? smartDefault
          ? buildEmptyRoomSmartDefaultPromptAgentInput({
              furnitureSelection,
              hasStyleReference: styleReferences.length > 0,
              roomType,
              roomTypeDetail,
              userRequirements,
            })
          : buildEmptyRoomFusionPromptAgentInput({
              furnitureSelection,
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
        strict: smartDefault || emptyRoom || styleTransfer,
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
          furnitureSelection,
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
    feature: styleTransfer ? "style-transfer" : emptyRoom ? "empty-room-design" : "white-model-rendering",
    imageDurationMs,
    provider: generation.provider,
    promptDurationMs,
    promptReused,
    renderMode,
    ...(roomType ? { roomType } : {}),
    ...(roomTypeDetail ? { roomTypeDetail } : {}),
    ...(emptyRoom ? { furnitureSelection } : {}),
    selectionName: styleReference ? "参考图风格" : smartDefault ? "智能默认" : style.name,
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
    ...(emptyRoom ? { furnitureSelection } : {}),
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

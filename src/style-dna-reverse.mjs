/**
 * [INPUT]: 依赖飞书已发布 Prompt Agent、模型白名单、图片/PDF 参考附件安全边界与 OneAPI 多模态客户端
 * [OUTPUT]: 对外提供脱敏 Prompt 版本目录与附件能力、指定已上架版本执行、输入校验、JSON 解析与对话编排
 * [POS]: src 的风格资产草稿应用服务，Prompt 仅在服务端按飞书版本读取且不写入或发布 Style DNA
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { agentModelOrThrow } from "./agent-model-config.mjs";
import {
  STYLE_DNA_REVERSE_PROMPT_CONFIG,
  getPublishedPromptAgent,
  listPublishedPromptAgentVersions,
} from "./prompt-agent.mjs";
import { normalizeReferenceAttachments } from "./reference-attachment.mjs";

export const STYLE_DNA_REVERSE_AGENT_CODE = "style-dna-reverse";

export const STYLE_DNA_REFERENCE_ATTACHMENT_POLICY = Object.freeze({
  accept: Object.freeze([
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
    "application/pdf",
  ]),
  maxBytesPerAttachment: 8 * 1024 * 1024,
  maxCount: null,
  maxTotalBytes: 20 * 1024 * 1024,
});

export const STYLE_DNA_ATTACHMENT_ONLY_MESSAGE =
  "请根据参考附件和当前 System Prompt 直接提取 Style DNA。";

function reverseError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizePublishedPrompt(agent) {
  const systemPrompt = String(agent?.systemPrompt || "").trim();
  if (!systemPrompt) {
    throw reverseError("风格反推 Prompt 未上架或正文为空", 409);
  }
  if (systemPrompt.length > 30_000) {
    throw reverseError("风格反推 Prompt 不能超过 30000 字符", 409);
  }
  return {
    agent: {
      code: String(agent.code || STYLE_DNA_REVERSE_AGENT_CODE),
      name: String(agent.name || "Style DNA 反推 Agent"),
      version: agent.version,
    },
    systemPrompt,
  };
}

export async function publicStyleDnaReverseConfig({
  forceRefresh = false,
  listVersions = listPublishedPromptAgentVersions,
} = {}) {
  const versions = await listVersions(
    STYLE_DNA_REVERSE_AGENT_CODE,
    {
      config: STYLE_DNA_REVERSE_PROMPT_CONFIG,
      forceRefresh,
    },
  );
  return {
    promptAgent: {
      defaultVersion: versions[0].version,
      versions,
    },
    referenceAttachment: STYLE_DNA_REFERENCE_ATTACHMENT_POLICY,
  };
}

function normalizeMessages(input, { allowAttachmentOnly = false } = {}) {
  const entries = input == null && allowAttachmentOnly ? [] : input;
  if (!Array.isArray(entries)) {
    throw reverseError("请先输入一条风格反推要求");
  }
  if (entries.length === 0 && !allowAttachmentOnly) {
    throw reverseError("请先输入一条风格反推要求");
  }
  if (entries.length > 20) {
    throw reverseError("单次对话最多保留 20 条消息");
  }

  const source =
    entries.length === 0 ? [{ content: "", role: "user" }] : entries;
  const messages = source.map((entry) => {
    const role = String(entry?.role || "");
    const content = String(entry?.content || "").trim();
    const attachmentOnlyUserMessage =
      allowAttachmentOnly && role === "user" && !content;
    if (
      !["assistant", "user"].includes(role) ||
      (!content && !attachmentOnlyUserMessage)
    ) {
      throw reverseError("对话消息格式不正确");
    }
    if (content.length > 12_000) {
      throw reverseError("单条对话消息不能超过 12000 字符");
    }
    return {
      content: attachmentOnlyUserMessage
        ? STYLE_DNA_ATTACHMENT_ONLY_MESSAGE
        : content,
      role,
    };
  });
  if (messages.at(-1)?.role !== "user") {
    throw reverseError("最后一条消息必须来自用户");
  }
  return messages;
}

function requiredText(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw reverseError(`Style DNA 缺少字段：${field}`, 502);
  }
}

export function parseStyleDnaOutput(text) {
  const normalized = String(text || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  let payload;
  try {
    payload = JSON.parse(normalized);
  } catch {
    throw reverseError("反推 Agent 没有返回合法 JSON", 502);
  }

  const dna = payload?.style_dna;
  requiredText(dna?.overall_style, "overall_style");
  requiredText(dna?.form_and_space?.language, "form_and_space.language");
  requiredText(dna?.form_and_space?.composition, "form_and_space.composition");
  if (
    !Array.isArray(dna?.material_and_color?.materials) ||
    dna.material_and_color.materials.length === 0 ||
    dna.material_and_color.materials.some(
      (material) => typeof material !== "string" || !material.trim(),
    )
  ) {
    throw reverseError("Style DNA 缺少字段：material_and_color.materials", 502);
  }
  requiredText(dna.material_and_color.finish, "material_and_color.finish");
  requiredText(dna.material_and_color.palette, "material_and_color.palette");
  requiredText(
    dna.material_and_color.color_character,
    "material_and_color.color_character",
  );
  requiredText(
    dna?.furniture_and_details?.furniture_language,
    "furniture_and_details.furniture_language",
  );
  requiredText(dna.furniture_and_details.details, "furniture_and_details.details");
  requiredText(dna.furniture_and_details.focus, "furniture_and_details.focus");
  requiredText(dna?.lighting?.daylight, "lighting.daylight");
  requiredText(dna.lighting.artificial, "lighting.artificial");
  return payload;
}

export async function executeStyleDnaReverse(
  input,
  {
    availableModels = null,
    client,
    loadPromptAgent = getPublishedPromptAgent,
    promptAgent = null,
    refreshModels = null,
  },
) {
  if (!client) throw new TypeError("style DNA reverse requires client");

  const referenceAttachments = normalizeReferenceAttachments(
    input.referenceAttachments ?? input.referenceImages,
    STYLE_DNA_REFERENCE_ATTACHMENT_POLICY,
  );
  const messages = normalizeMessages(input.messages, {
    allowAttachmentOnly: referenceAttachments.length > 0,
  });
  const hasDraftContext = messages
    .slice(0, -1)
    .some((message) => message.role === "assistant");
  if (referenceAttachments.length === 0 && !hasDraftContext) {
    throw reverseError("Style DNA 反推首轮至少需要 1 个参考附件");
  }
  const publishedPrompt = normalizePublishedPrompt(
    promptAgent ||
      (await loadPromptAgent(STYLE_DNA_REVERSE_AGENT_CODE, {
        config: STYLE_DNA_REVERSE_PROMPT_CONFIG,
        version: input.promptVersion,
      })),
  );
  const model = agentModelOrThrow(input.modelKey);
  let modelCatalog = availableModels || (await client.listModels());
  let availableIds = new Set(
    modelCatalog.map((entry) => entry.id || entry.name).filter(Boolean),
  );
  if (!availableIds.has(model.id) && refreshModels) {
    modelCatalog = await refreshModels();
    availableIds = new Set(
      modelCatalog.map((entry) => entry.id || entry.name).filter(Boolean),
    );
  }
  if (!availableIds.has(model.id)) {
    throw reverseError(`${model.label} 当前未向这个 API Key 开放`, 409);
  }

  const startedAt = Date.now();
  const result = await client.generateStyleDna({
    attachments: referenceAttachments,
    messages,
    model: model.id,
    systemPrompt: publishedPrompt.systemPrompt,
  });
  const payload = parseStyleDnaOutput(result.text);

  return {
    agent: publishedPrompt.agent,
    durationMs: Date.now() - startedAt,
    model: { id: model.id, label: model.label },
    referenceAttachmentCount: referenceAttachments.length,
    styleDna: payload,
  };
}

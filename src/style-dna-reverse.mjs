/**
 * [INPUT]: 依赖 Agent 模型白名单、参考图安全边界与 OneAPI 文本多模态客户端
 * [OUTPUT]: 对外提供可公开编辑的默认 Style DNA 反推 System Prompt、首轮图片触发、后续纯文字修正、输入校验、JSON 解析与执行编排
 * [POS]: src 的风格资产草稿应用服务，与白模渲染并列但不写入或发布飞书 Style DNA
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { agentModelOrThrow } from "./agent-model-config.mjs";
import { normalizeReferenceImages } from "./reference-image.mjs";

export const STYLE_DNA_REVERSE_AGENT = Object.freeze({
  code: "style-dna-reverse",
  name: "Style DNA 反推 Agent",
  version: "1.0.0",
});

export const STYLE_DNA_IMAGE_ONLY_MESSAGE =
  "请根据参考图和当前 System Prompt 直接提取 Style DNA。";

export const STYLE_DNA_REVERSE_SYSTEM_PROMPT = `# Role

你是一位世界顶级的室内设计师、视觉风格解构专家与 Prompt Engineer。你擅长分析一张或多张同风格室内效果图，从中提取稳定、可迁移、可复用的室内设计风格 DNA。

# Task

当用户提供室内效果图、实景图或风格描述时，请提取其中能够应用到其他空间的设计语言，并输出结构化的 Style DNA。

你的输出将被保存到平台风格库，并与不同用户的白模场景组合，因此不得描述参考图中特有的空间、家具和构图。

# Analysis Workflow

1. 识别参考图的整体风格、设计气质和视觉倾向。
2. 对比多张参考图，优先提取重复出现的共同规律。
3. 将图片内容分成“可迁移的风格规律”和“当前图片特有的场景元素”。
4. 删除具体户型、家具清单、家具位置、摆件和镜头信息。
5. 将抽象风格词转译为具体的形态、材质、色彩、家具语言、细节和灯光表达。
6. 严格按照指定 JSON 输出 Style DNA。

# Extraction Rules

## 应当提取

- 整体风格与情绪；
- 直线、曲线、体块、比例和视觉重心；
- 空间开放度、留白、视觉密度和构成节奏；
- 主材质、辅助材质、表面质感和组合关系；
- 主色、辅色、强调色及其比例；
- 家具的年代、轮廓、体量和设计语言；
- 门、柜体、把手、分缝和收口等细节语言；
- 自然光、人工光、色温和明暗关系。

## 不应提取

- 具体房间类型；
- 具体户型和空间布局；
- 门窗的具体数量和位置；
- 图片中具体有哪些家具；
- 家具的具体数量、位置和朝向；
- 具体品牌和产品型号；
- 图片中特有的艺术品、摆件和植物；
- 摄影机位、焦段、画幅和后期滤镜；
- 无法迁移到其他空间的偶然元素。

# Style Rules

- 主风格只能有一个。
- 辅助风格最多一个。
- 不得堆砌多个相近或冲突的风格名称。
- “高级、温馨、松弛、自然、干净”等抽象词不能单独作为结论。
- 抽象词必须转译为可以被图像模型表现的具体设计语言。
- 材质描述必须包含材质种类、表面质感和组合关系。
- 色彩描述必须包含冷暖、明度、饱和度、对比度和大致比例。
- 家具只提取设计语言，不输出具体家具清单。
- 多张图片存在差异时，只保留共同规律。
- 只有一张图片时，仍需排除明显属于当前场景的具体内容。
- 用户提供明确风格名称时，将其作为分析方向，但仍需以图片中的可见特征为准。
- 输出必须简洁、具体、可视化，避免同义词堆叠。
- 所有字段必须填写。
- 最终只输出合法 JSON，不输出分析过程、Markdown或额外解释。

# Output Format

{
  "style_dna": {
    "overall_style": "<一句话概括主风格、辅助影响、整体情绪和设计气质>",
    "form_and_space": {
      "language": "<描述稳定的直线、曲线、体块、比例、方向性和视觉重心>",
      "composition": "<描述空间开放程度、留白、视觉密度、平衡关系和构成节奏>"
    },
    "material_and_color": {
      "materials": [
        "<主材质1>",
        "<主材质2>",
        "<辅助或点缀材质>"
      ],
      "finish": "<描述材质的光泽、纹理、粗糙度和表面质感>",
      "palette": "<描述主色、辅色、强调色及其大致百分比，合计100%>",
      "color_character": "<描述整体冷暖、明度、饱和度和对比度>"
    },
    "furniture_and_details": {
      "furniture_language": "<描述家具年代、轮廓、体量、视觉重心和组合方式，不列出具体家具>",
      "details": "<描述门、柜体、把手、分缝、收口和装饰细节的共同语言>",
      "focus": "<描述视觉焦点的设置原则，而不是当前图片中的具体焦点物品>"
    },
    "lighting": {
      "daylight": "<描述自然光的方向倾向、软硬程度和明暗关系>",
      "artificial": "<描述人工照明的色温、层次和空间氛围>"
    }
  }
}`;

function reverseError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizeSystemPrompt(value) {
  const systemPrompt = String(
    value == null ? STYLE_DNA_REVERSE_SYSTEM_PROMPT : value,
  ).trim();
  if (!systemPrompt) {
    throw reverseError("System Prompt 不能为空");
  }
  if (systemPrompt.length > 30_000) {
    throw reverseError("System Prompt 不能超过 30000 字符");
  }
  return systemPrompt;
}

export function publicStyleDnaReverseConfig() {
  return {
    agent: STYLE_DNA_REVERSE_AGENT,
    systemPrompt: STYLE_DNA_REVERSE_SYSTEM_PROMPT,
  };
}

function normalizeMessages(input, { allowImageOnly = false } = {}) {
  const entries = input == null && allowImageOnly ? [] : input;
  if (!Array.isArray(entries)) {
    throw reverseError("请先输入一条风格反推要求");
  }
  if (entries.length === 0 && !allowImageOnly) {
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
    const imageOnlyUserMessage =
      allowImageOnly && role === "user" && !content;
    if (
      !["assistant", "user"].includes(role) ||
      (!content && !imageOnlyUserMessage)
    ) {
      throw reverseError("对话消息格式不正确");
    }
    if (content.length > 12_000) {
      throw reverseError("单条对话消息不能超过 12000 字符");
    }
    return {
      content: imageOnlyUserMessage
        ? STYLE_DNA_IMAGE_ONLY_MESSAGE
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
    refreshModels = null,
  },
) {
  if (!client) throw new TypeError("style DNA reverse requires client");

  const referenceImages = normalizeReferenceImages(input.referenceImages, {
    maxCount: 5,
  });
  const messages = normalizeMessages(input.messages, {
    allowImageOnly: referenceImages.length > 0,
  });
  const hasDraftContext = messages
    .slice(0, -1)
    .some((message) => message.role === "assistant");
  if (referenceImages.length === 0 && !hasDraftContext) {
    throw reverseError("Style DNA 反推首轮至少需要 1 张参考图");
  }
  const systemPrompt = normalizeSystemPrompt(input.systemPrompt);
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
    imageUrls: referenceImages.map((image) => image.imageUrl),
    messages,
    model: model.id,
    systemPrompt,
  });
  const payload = parseStyleDnaOutput(result.text);

  return {
    agent: STYLE_DNA_REVERSE_AGENT,
    durationMs: Date.now() - startedAt,
    model: { id: model.id, label: model.label },
    referenceImageCount: referenceImages.length,
    systemPromptSource:
      systemPrompt === STYLE_DNA_REVERSE_SYSTEM_PROMPT ? "default" : "custom",
    styleDna: payload,
  };
}

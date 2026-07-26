/**
 * [INPUT]: 依赖 node:test/assert 与 Style DNA 反推服务的可注入 OneAPI 边界
 * [OUTPUT]: 对外提供默认/自定义 Prompt、首轮仅图片、后续纯文字修正、模型选择、1–5 张参考图与 JSON Schema 回归保障
 * [POS]: test 的 Style DNA 反推应用服务测试，不发送真实 API 请求
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  STYLE_DNA_IMAGE_ONLY_MESSAGE,
  STYLE_DNA_REVERSE_SYSTEM_PROMPT,
  executeStyleDnaReverse,
  parseStyleDnaOutput,
  publicStyleDnaReverseConfig,
} from "../src/style-dna-reverse.mjs";

const styleDna = {
  style_dna: {
    overall_style: "克制的暖现代主义",
    form_and_space: {
      language: "低矮横向体块与柔和圆角",
      composition: "留白充足，视觉密度偏低",
    },
    material_and_color: {
      materials: ["浅橡木", "暖白矿物涂料", "亚麻"],
      finish: "整体哑光，保留细腻天然纹理",
      palette: "暖白 70%，浅木 25%，黑色 5%",
      color_character: "暖中性、低饱和、中高明度",
    },
    furniture_and_details: {
      furniture_language: "低矮、圆润、水平延展",
      details: "无把手柜体与窄分缝",
      focus: "用单一深色小体量形成焦点",
    },
    lighting: {
      daylight: "大面积柔和侧光",
      artificial: "2700K 隐藏式层次照明",
    },
  },
};

function image(index = 1) {
  return {
    dataUrl: "data:image/png;base64,aA==",
    name: `reference-${index}.png`,
    size: 1,
    type: "image/png",
  };
}

test("Style DNA 输出支持代码围栏并校验完整 Schema", () => {
  assert.deepEqual(
    parseStyleDnaOutput(`\`\`\`json\n${JSON.stringify(styleDna)}\n\`\`\``),
    styleDna,
  );
  assert.throws(
    () => parseStyleDnaOutput('{"style_dna":{"overall_style":"现代"}}'),
    /缺少字段/,
  );
});

test("默认 Prompt 与工作台公开配置使用同一真源", () => {
  const config = publicStyleDnaReverseConfig();

  assert.equal(config.systemPrompt, STYLE_DNA_REVERSE_SYSTEM_PROMPT);
  assert.match(
    config.systemPrompt,
    /你是一位世界顶级的室内设计师、视觉风格解构专家与 Prompt Engineer/,
  );
  assert.match(config.systemPrompt, /# Analysis Workflow/);
  assert.match(config.systemPrompt, /## 不应提取/);
  assert.match(
    config.systemPrompt,
    /最终只输出合法 JSON，不输出分析过程、Markdown或额外解释/,
  );
});

test("反推链路使用默认 Prompt、所选模型和多轮消息", async () => {
  let request;
  const result = await executeStyleDnaReverse(
    {
      messages: [
        { content: "先提取共同风格。", role: "user" },
        { content: JSON.stringify(styleDna), role: "assistant" },
        { content: "把色彩比例再收敛。", role: "user" },
      ],
      modelKey: "gpt",
      referenceImages: [image(1), image(2)],
    },
    {
      availableModels: [{ id: "gpt-5.5" }],
      client: {
        generateStyleDna: async (input) => {
          request = input;
          return { text: JSON.stringify(styleDna) };
        },
      },
    },
  );

  assert.equal(request.model, "gpt-5.5");
  assert.equal(request.systemPrompt, STYLE_DNA_REVERSE_SYSTEM_PROMPT);
  assert.equal(request.imageUrls.length, 2);
  assert.equal(request.messages.length, 3);
  assert.deepEqual(result.styleDna, styleDna);
  assert.equal(result.agent.code, "style-dna-reverse");
  assert.equal(result.systemPromptSource, "default");
});

test("反推链路允许工作台覆盖 System Prompt 并拒绝空值", async () => {
  let systemPrompt;
  const dependencies = {
    availableModels: [{ id: "gemini-3.1-pro-preview" }],
    client: {
      generateStyleDna: async (input) => {
        systemPrompt = input.systemPrompt;
        return { text: JSON.stringify(styleDna) };
      },
    },
  };
  const input = {
    messages: [{ content: "提取风格", role: "user" }],
    modelKey: "gemini3pro",
    referenceImages: [image()],
  };

  const result = await executeStyleDnaReverse(
    { ...input, systemPrompt: "自定义反推约束" },
    dependencies,
  );
  assert.equal(systemPrompt, "自定义反推约束");
  assert.equal(result.systemPromptSource, "custom");
  await assert.rejects(
    executeStyleDnaReverse({ ...input, systemPrompt: "  " }, dependencies),
    /System Prompt 不能为空/,
  );
});

test("反推链路允许只上传图片而不填写附加要求", async () => {
  let request;
  const dependencies = {
    availableModels: [{ id: "gemini-3.1-pro-preview" }],
    client: {
      generateStyleDna: async (input) => {
        request = input;
        return { text: JSON.stringify(styleDna) };
      },
    },
  };

  await executeStyleDnaReverse(
    {
      messages: [],
      modelKey: "gemini3pro",
      referenceImages: [image()],
    },
    dependencies,
  );

  assert.deepEqual(request.messages, [
    { content: STYLE_DNA_IMAGE_ONLY_MESSAGE, role: "user" },
  ]);
});

test("反推链路允许 5 张参考图并拒绝首轮空图", async () => {
  const client = {
    generateStyleDna: async () => ({ text: JSON.stringify(styleDna) }),
  };
  const base = {
    messages: [{ content: "提取风格", role: "user" }],
    modelKey: "gemini3pro",
  };
  const dependencies = {
    availableModels: [{ id: "gemini-3.1-pro-preview" }],
    client,
  };

  await assert.doesNotReject(
    executeStyleDnaReverse(
      { ...base, referenceImages: Array.from({ length: 5 }, (_, index) => image(index)) },
      dependencies,
    ),
  );
  await assert.rejects(
    executeStyleDnaReverse({ ...base, referenceImages: [] }, dependencies),
    /首轮至少需要 1 张参考图/,
  );
});

test("已有 Style DNA 草稿后允许纯文字继续修正", async () => {
  let request;
  const dependencies = {
    availableModels: [{ id: "gemini-3.1-pro-preview" }],
    client: {
      generateStyleDna: async (input) => {
        request = input;
        return { text: JSON.stringify(styleDna) };
      },
    },
  };
  const messages = [
    { content: "已上传 1 张风格参考图", role: "user" },
    { content: JSON.stringify(styleDna), role: "assistant" },
    { content: "我希望更法式一些", role: "user" },
  ];

  const result = await executeStyleDnaReverse(
    {
      messages,
      modelKey: "gemini3pro",
      referenceImages: [],
    },
    dependencies,
  );

  assert.deepEqual(request.imageUrls, []);
  assert.deepEqual(request.messages, messages);
  assert.equal(result.referenceImageCount, 0);
});

/**
 * [INPUT]: 依赖 node:test/assert 与 Style DNA 反推服务的可注入 OneAPI 边界和公开附件能力策略
 * [OUTPUT]: 对外提供飞书 Prompt 隔离、首轮仅附件、后续纯文字修正、模型选择、无业务数量上限、图片/PDF 与 JSON Schema 回归保障
 * [POS]: test 的服务端 Prompt 驱动 Style DNA 反推契约测试，不读取真实飞书或发送 API 请求
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  STYLE_DNA_ATTACHMENT_ONLY_MESSAGE,
  STYLE_DNA_REFERENCE_ATTACHMENT_POLICY,
  executeStyleDnaReverse,
  parseStyleDnaOutput,
  publicStyleDnaReverseConfig,
} from "../src/style-dna-reverse.mjs";

const promptAgent = {
  code: "style-dna-reverse",
  name: "Style DNA 反推 Agent",
  systemPrompt: "只使用飞书已上架 Prompt",
  version: 1,
};

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

function pdf() {
  const content = Buffer.from("%PDF-1.4\n%%EOF");
  return {
    dataUrl: `data:application/pdf;base64,${content.toString("base64")}`,
    name: "moodboard.pdf",
    size: content.length,
    type: "application/pdf",
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

test("公开配置暴露脱敏版本目录与附件能力，不暴露 Prompt", async () => {
  const config = await publicStyleDnaReverseConfig({
    listVersions: async () => [
      { code: "style-dna-reverse", name: "Style DNA 反推 Agent", version: 2 },
      { code: "style-dna-reverse", name: "Style DNA 反推 Agent", version: 1 },
    ],
  });

  assert.equal("systemPrompt" in config, false);
  assert.equal(config.promptAgent.defaultVersion, 2);
  assert.deepEqual(
    config.promptAgent.versions.map((entry) => entry.version),
    [2, 1],
  );
  assert.equal(
    JSON.stringify(config.promptAgent).includes("systemPrompt"),
    false,
  );
  assert.equal(
    config.referenceAttachment,
    STYLE_DNA_REFERENCE_ATTACHMENT_POLICY,
  );
  assert.deepEqual(config.referenceAttachment.accept, [
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
    "application/pdf",
  ]);
  assert.equal(config.referenceAttachment.maxCount, null);
});

test("反推链路使用飞书发布 Prompt、所选模型和多轮消息", async () => {
  let request;
  const result = await executeStyleDnaReverse(
    {
      messages: [
        { content: "先提取共同风格。", role: "user" },
        { content: JSON.stringify(styleDna), role: "assistant" },
        { content: "把色彩比例再收敛。", role: "user" },
      ],
      modelKey: "gpt",
      referenceAttachments: [image(1), image(2)],
    },
    {
      availableModels: [{ id: "gpt-5.5" }],
      client: {
        generateStyleDna: async (input) => {
          request = input;
          return { text: JSON.stringify(styleDna) };
        },
      },
      promptAgent,
    },
  );

  assert.equal(request.model, "gpt-5.5");
  assert.equal(request.systemPrompt, promptAgent.systemPrompt);
  assert.equal(request.attachments.length, 2);
  assert.equal(request.attachments[0].kind, "image");
  assert.equal(request.messages.length, 3);
  assert.deepEqual(result.styleDna, styleDna);
  assert.equal(result.agent.code, "style-dna-reverse");
  assert.equal(result.agent.version, 1);
  assert.equal("systemPrompt" in result, false);
});

test("反推链路把用户选择的 Prompt 版本交给服务端配置读取器", async () => {
  let requestedVersion;
  const result = await executeStyleDnaReverse(
    {
      messages: [{ content: "提取风格", role: "user" }],
      modelKey: "gemini3pro",
      promptVersion: 2,
      referenceAttachments: [image()],
    },
    {
      availableModels: [{ id: "gemini-3.1-pro-preview" }],
      client: {
        generateStyleDna: async () => ({ text: JSON.stringify(styleDna) }),
      },
      loadPromptAgent: async (_code, options) => {
        requestedVersion = options.version;
        return { ...promptAgent, systemPrompt: "飞书 v2", version: 2 };
      },
    },
  );

  assert.equal(requestedVersion, 2);
  assert.equal(result.agent.version, 2);
});

test("反推链路忽略工作台伪造 Prompt 并拒绝无效发布正文", async () => {
  let systemPrompt;
  const dependencies = {
    availableModels: [{ id: "gemini-3.1-pro-preview" }],
    client: {
      generateStyleDna: async (input) => {
        systemPrompt = input.systemPrompt;
        return { text: JSON.stringify(styleDna) };
      },
    },
    promptAgent,
  };
  const input = {
    messages: [{ content: "提取风格", role: "user" }],
    modelKey: "gemini3pro",
    referenceAttachments: [image()],
  };

  await executeStyleDnaReverse(
    { ...input, systemPrompt: "自定义反推约束" },
    dependencies,
  );
  assert.equal(systemPrompt, promptAgent.systemPrompt);
  await assert.rejects(
    executeStyleDnaReverse(input, {
      ...dependencies,
      promptAgent: { ...promptAgent, systemPrompt: "  " },
    }),
    /未上架或正文为空/,
  );
});

test("反推链路允许只上传附件而不填写附加要求", async () => {
  let request;
  const dependencies = {
    availableModels: [{ id: "gemini-3.1-pro-preview" }],
    client: {
      generateStyleDna: async (input) => {
        request = input;
        return { text: JSON.stringify(styleDna) };
      },
    },
    promptAgent,
  };

  await executeStyleDnaReverse(
    {
      messages: [],
      modelKey: "gemini3pro",
      referenceAttachments: [pdf()],
    },
    dependencies,
  );

  assert.deepEqual(request.messages, [
    { content: STYLE_DNA_ATTACHMENT_ONLY_MESSAGE, role: "user" },
  ]);
  assert.equal(request.attachments[0].kind, "file");
});

test("反推链路不设人为附件数量上限并拒绝首轮空附件", async () => {
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
    promptAgent,
  };

  await assert.doesNotReject(
    executeStyleDnaReverse(
      {
        ...base,
        referenceAttachments: [
          ...Array.from({ length: 8 }, (_, index) => image(index)),
          pdf(),
        ],
      },
      dependencies,
    ),
  );
  await assert.rejects(
    executeStyleDnaReverse({ ...base, referenceAttachments: [] }, dependencies),
    /首轮至少需要 1 个参考附件/,
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
    promptAgent,
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
      referenceAttachments: [],
    },
    dependencies,
  );

  assert.deepEqual(request.attachments, []);
  assert.deepEqual(request.messages, messages);
  assert.equal(result.referenceAttachmentCount, 0);
});

/**
 * [INPUT]: 依赖原Flux扩图的Janus-Pro-1B固定模型/问题/采样配置与ComfyUI实际文本输出
 * [OUTPUT]: 对外提供共享Janus节点工厂、固定配置及仅接受单条实际正文的Prompt捕获函数
 * [POS]: src的Flux/Qwen扩图共享提示词边界，不参与图片采样或飞书传输
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export const JANUS_OUTPAINT_SETTINGS = Object.freeze({
  model: "deepseek-ai/Janus-Pro-1B", seed: 298596445848600,
  temperature: 0.1, topP: 0.95, maxNewTokens: 999,
  question: "请根据以下对一张图片的结构化分析，为我生成一段用于AI扩图（Outpainting）的、高质量、详细的英文提示词。要求生成的提示词能够引导AI模型在保持原始风格和氛围的前提下，无缝、逻辑地扩展画面内容。\n\n**图片结构化分析:**\n*   **核心主体分析 (Core Subject Analysis):** [请在这里填入对图片主要内容的客观描述]\n*   **艺术风格与媒介 (Art Style & Medium):** [请在这里填入对图片风格的分析]\n*   **构图与取景 (Composition & Framing):** [请在这里填入对构图的描述]\n*   **光影与氛围 (Lighting & Atmosphere):** [请在这里填入对光线和感觉的描述]\n*   **扩图方向与目标 (Outpainting Goal & Direction):** [请在这里填入扩图的目标，对于自动化流程，这可以是一个通用指令]\n\n请严格按照分析结果，生成扩图提示词。```",
});

// -------- Janus只读取未扩边原图；每次构建独立节点，保留Flux已有配置 --------
export function createOutpaintJanusNodes({ image = ["prepare", 0], question = JANUS_OUTPAINT_SETTINGS.question } = {}) {
  const settings = JANUS_OUTPAINT_SETTINGS;
  return {
    "janus-model": { class_type: "JanusModelLoader", inputs: { model_name: settings.model } },
    describe: { class_type: "JanusImageUnderstanding", inputs: {
      question, seed: settings.seed, temperature: settings.temperature, top_p: settings.topP, max_new_tokens: settings.maxNewTokens,
      model: ["janus-model", 0], processor: ["janus-model", 1], image: [...image],
    } },
  };
}

// -------- 正文必须来自当前执行的SaveText输出；固定约束或缺失文本不能冒充最终Prompt --------
export function capturedOutpaintPrompt(historyOutputs) {
  const texts = historyOutputs?.["prompt-output"]?.text;
  const valid = Array.isArray(texts) && texts.length === 1 && typeof texts[0] === "string" && texts[0].trim().length > 0;
  return { finalPrompt: valid ? texts[0] : "", finalPromptCaptured: Boolean(valid) };
}

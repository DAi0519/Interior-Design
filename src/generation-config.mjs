/**
 * [INPUT]: 依赖风格目录、白模/空房/Style DNA Agent、精模/效果图氛围转换/效果图美化/全景图美化独立 Prompt 的脱敏配置读取
 * [OUTPUT]: 对外提供日常生图与 Beta 共用的配置快照及统一主动刷新，保留独立 Prompt 来源和正文边界
 * [POS]: src 的生图配置聚合边界，由 server 的 /api/styles 与 /api/config/refresh 共用，避免目录和刷新合同分叉
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { publicEffectBeautificationPromptConfig } from "./effect-beautification-prompt.mjs";
import { publicEffectEnhancementPromptConfig, publicPanoramaEnhancementPromptConfig } from "./effect-render-enhancement-prompt.mjs";
import {
  getPublishedPromptAgent,
  listPublishedPromptAgentVersions,
  publicEmptyRoomConfig,
  publicPromptAgentCatalog,
  publicSmartDefaultConfig,
  STYLE_DNA_REVERSE_PROMPT_CONFIG,
} from "./prompt-agent.mjs";
import { publicRefinedModelPromptConfig } from "./refined-model-prompt.mjs";
import { listPublicStyles } from "./style-library.mjs";

const DEFAULT_READERS = Object.freeze({
  effectBeautificationPrompt: publicEffectBeautificationPromptConfig,
  effectEnhancementPrompt: publicEffectEnhancementPromptConfig,
  panoramaEnhancementPrompt: publicPanoramaEnhancementPromptConfig,
  emptyRoom: publicEmptyRoomConfig,
  promptAgents: (options) => listPublishedPromptAgentVersions("white-model-fusion", options),
  refinedPrompt: publicRefinedModelPromptConfig,
  smartDefault: publicSmartDefaultConfig,
  styles: listPublicStyles,
  styleDna: (options) => getPublishedPromptAgent("style-dna-reverse", {
    ...options,
    config: STYLE_DNA_REVERSE_PROMPT_CONFIG,
  }),
});

export async function readGenerationConfig({
  forceRefresh = false,
  readers = DEFAULT_READERS,
} = {}) {
  const keys = ["styles", "promptAgents", "refinedPrompt", "effectEnhancementPrompt",
    "effectBeautificationPrompt", "panoramaEnhancementPrompt", "smartDefault", "emptyRoom"];
  const values = await Promise.all([
    ...keys.map((key) => readers[key]({ forceRefresh })),
    ...(forceRefresh ? [readers.styleDna({ forceRefresh })] : []),
  ]);
  const config = Object.fromEntries(keys.map((key, index) => [key, values[index]]));
  const { promptAgents, ...publicConfig } = config;
  return { ...publicConfig, promptAgent: publicPromptAgentCatalog(promptAgents) };
}

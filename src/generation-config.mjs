/**
 * [INPUT]: 依赖独立质感增强Prompt目录、精模光影基础/氛围库、风格目录、白模/空房/旧房/风格转换/Style DNA Agent及各功能Prompt
 * [OUTPUT]: 对外提供日常生图与 Beta 共用的配置快照及统一主动刷新，保留独立 Prompt 来源和正文边界
 * [POS]: src 的生图配置聚合边界，由 server 的 /api/styles 与 /api/config/refresh 共用，避免目录和刷新合同分叉
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { publicEffectBeautificationPromptConfig } from "./effect-beautification-prompt.mjs";
import { publicTextureEnhancementPromptConfig } from "./texture-enhancement-prompt.mjs";
import { publicEffectEnhancementPromptConfig, publicPanoramaEnhancementPromptConfig } from "./effect-render-enhancement-prompt.mjs";
import {
  getPublishedPromptAgent,
  listPublishedPromptAgentVersions,
  publicEmptyRoomConfig,
  publicRoomRenovationConfig,
  publicPromptAgentCatalog,
  publicSmartDefaultConfig,
  publicStyleTransferConfig,
  STYLE_DNA_REVERSE_PROMPT_CONFIG,
} from "./prompt-agent.mjs";
import { publicRefinedLightingBasePromptConfig } from "./refined-model-prompt.mjs";
import { publicRefinedLightingLibrary } from "./refined-lighting-library.mjs";
import { listPublicStyles } from "./style-library.mjs";

const DEFAULT_READERS = Object.freeze({
  effectBeautificationPrompt: publicEffectBeautificationPromptConfig,
  textureEnhancementPrompt: publicTextureEnhancementPromptConfig,
  effectEnhancementPrompt: publicEffectEnhancementPromptConfig,
  panoramaEnhancementPrompt: publicPanoramaEnhancementPromptConfig,
  emptyRoom: publicEmptyRoomConfig,
  roomRenovation: publicRoomRenovationConfig,
  promptAgents: (options) => listPublishedPromptAgentVersions("white-model-fusion", options),
  refinedPrompt: publicRefinedLightingBasePromptConfig,
  refinedLighting: publicRefinedLightingLibrary,
  smartDefault: publicSmartDefaultConfig,
  styleTransfer: publicStyleTransferConfig,
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
  const keys = ["styles", "promptAgents", "refinedPrompt", "refinedLighting", "effectEnhancementPrompt",
    "effectBeautificationPrompt", "textureEnhancementPrompt", "panoramaEnhancementPrompt", "smartDefault", "emptyRoom", "roomRenovation", "styleTransfer"];
  const values = await Promise.all([
    ...keys.map((key) => readers[key]({ forceRefresh })),
    ...(forceRefresh ? [readers.styleDna({ forceRefresh })] : []),
  ]);
  const config = Object.fromEntries(keys.map((key, index) => [key, values[index]]));
  const { promptAgents, ...publicConfig } = config;
  return { ...publicConfig, promptAgent: publicPromptAgentCatalog(promptAgents) };
}

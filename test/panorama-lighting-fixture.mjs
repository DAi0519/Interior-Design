/**
 * [INPUT]: 依赖本目录已审阅的分段Prompt夹具和Node SHA-256
 * [OUTPUT]: 提供离线飞书规则资产、冻结身份与加载替身，避免服务/归档测试访问真实飞书
 * [POS]: 全景服务与Beta归档合同共用的规则夹具，不是生产Prompt回退
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const prompt = readFileSync(new URL("./panorama-lighting-slot.prompt.txt", import.meta.url), "utf8").trim();
export const panoramaRule = Object.freeze({ id: "recPanoramaRuleOne", code: "panorama-lighting-slot",
  name: "全景图光影槽规则", version: 1, published: true, prompt,
  sha256: createHash("sha256").update(prompt).digest("hex") });
export const panoramaRuleSelection = Object.freeze({ id: panoramaRule.id, version: 1, sha256: panoramaRule.sha256 });
export const panoramaRuleIdentity = Object.freeze({ code: panoramaRule.code, version: 1, sha256: panoramaRule.sha256 });
export const loadPanoramaRule = async () => ({ ...panoramaRule });
